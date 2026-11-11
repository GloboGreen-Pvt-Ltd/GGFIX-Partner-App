import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import { launchCamera } from '../../../components/InAppCamera';
import { ArrowLeft, Camera, CircleCheck, Circle, Clock, ImagePlus, Mic, Square, Trash2, Wrench, X } from 'lucide-react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import VoiceNotePlayer from '../../../components/VoiceNotePlayer';
import { ticketApi } from '../../../api/client';
import { getModelsByBrand, uploadMedia } from '../../../api/masterData';
import { confirm, notify } from '../../../components/confirm';
import ImageViewerModal from '../../../components/ImageViewerModal';
import { useResponsive } from '../../../theme/responsive';
import RepairIssuesPicker, { SERVICE_CHARGE_CODE } from '../service-booking-shop/RepairIssuesPicker';
import { chargeIssueOf, groupServiceCharges, estimatedTotalOf, priceItemsFromTicket } from './ReceiptCard';
import { ticketStatusLabel } from './TicketDetailScreen';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const INK = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';
const LINE = '#E5E7EB';
const PAGE = '#F3F4F6';
const RED = '#DC2626';
const AMBER = '#B45309';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 4;
// Extra repair time on top of the current estimate (0 = keep the delivery time).
const EXTRA_HOURS = [0, 1, 2, 3, 4, 6, 12, 24, 48];

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDateTime = (d) => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

/**
 * Re-Estimate — ADDITIONAL issues found during repair, priced on top of the
 * current estimate. Original services and prices are read-only; the reason
 * and supporting photos are saved as the re-estimate's own record; the
 * revised estimate then waits for customer approval (or is approved at the
 * counter). One POST /tickets/{id}/re-estimate does it all server-side, so
 * the status moves only through the backend's own re-estimate rules.
 * Booking details (Edit), existing prices (Price Revised) and the technician
 * are not touched here.
 *
 * Opened with `requestId` (and optionally the `request` itself) it answers a
 * technician's re-estimate request: the request is shown on top, its issue
 * arrives as a new item with the proposed amount, and the POST carries
 * `requestId` so the server links and converts that request.
 */
export default function ReEstimateScreen({ navigation, route }) {
  const ticketId = route?.params?.ticketId;
  const requestId = route?.params?.requestId || null;
  const requestParam = route?.params?.request || null;
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const col = r.isTablet ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : null;

  const [ticket, setTicket] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [added, setAdded] = useState([]);           // from RepairIssuesPicker
  const [pickedIds, setPickedIds] = useState(null); // every serviceId still selected (null = not loaded)
  const [reason, setReason] = useState('');          // free Notes
  const [photos, setPhotos] = useState([]);         // uploaded URLs
  const [uploading, setUploading] = useState(false);
  const [extraHours, setExtraHours] = useState(0);
  const [approvedNow, setApprovedNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const sendingRef = useRef(false);
  // Optional audio note (same recorder + upload as Service Price Estimate);
  // saved on submit as a ticket note carrying the audio URL.
  const [audioUrl, setAudioUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recLiveRef = useRef(false);
  useEffect(() => () => { if (recLiveRef.current) { try { recorder.stop(); } catch (_) {} } }, [recorder]);
  const startRec = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { notify('Microphone needed', 'Allow microphone access to record an audio note.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recLiveRef.current = true;
      setRecording(true);
    } catch (e) { notify('Could not start recording', e?.message || 'Please try again.'); }
  };
  const stopRec = async () => {
    setRecording(false);
    if (!recLiveRef.current) return;
    recLiveRef.current = false;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      setAudioBusy(true);
      const ext = (uri.split('.').pop() || 'm4a').toLowerCase();
      const url = await uploadMedia({ uri, name: `re-estimate-${Date.now()}.${ext}`, type: `audio/${ext === 'mp3' ? 'mpeg' : ext}` }, 'complaint-audio');
      if (!url) throw new Error('Upload returned no URL');
      setAudioUrl(url);
    } catch (e) { notify('Upload failed', e?.message || 'Could not upload recording.'); }
    finally { setAudioBusy(false); }
  };
  // The "what's missing" line shows only after Submit is tapped, not on arrival.
  const [tried, setTried] = useState(false);
  // The technician request being answered (REQUESTED revision), when any.
  const [request, setRequest] = useState(null);
  const [requestLost, setRequestLost] = useState(false);
  const [viewer, setViewer] = useState(null);
  // Technician's request photos — kept even when the request is no longer open.
  const [techPhotos, setTechPhotos] = useState([]);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  // silent: pull-to-refresh keeps the form on screen (no full loader).
  const load = useCallback(async (silent) => {
    if (silent !== true) setLoading(true);
    setLoadError(null);
    try {
      const t = await ticketApi.get(`/tickets/${ticketId}`);
      // Resolve the request BEFORE the form mounts — the issues picker seeds
      // from it once. Fresh from the server when possible; the copy handed
      // over by Booking Details is the fallback.
      if (requestId) {
        let req = t?.activeReEstimate?.id === requestId ? t.activeReEstimate : null;
        if (!req) {
          try {
            const list = await ticketApi.get(`/tickets/${ticketId}/re-estimates`);
            req = (Array.isArray(list) ? list : []).find((x) => x?.id === requestId) || null;
          } catch { req = requestParam?.id === requestId ? requestParam : null; }
        }
        const open = req && String(req.status || 'REQUESTED').toUpperCase() === 'REQUESTED';
        setRequest(open ? req : null);
        setRequestLost(!open);
      }
      {
        const pick = (r) => (Array.isArray(r?.requestImages) ? r.requestImages : []).filter((u) => typeof u === 'string' && u.trim());
        const cand = [t?.activeReEstimate, requestParam, t?.latestReEstimate].find((r) => pick(r).length);
        setTechPhotos(cand ? pick(cand) : []);
      }
      setTicket(t);
      if (t.brandId && t.modelId) {
        try {
          const list = await getModelsByBrand(t.brandId);
          const m = (list || []).find((x) => x.id === t.modelId);
          if (m?.categoryId) setCategoryId(m.categoryId);
        } catch { /* issues fall back to the full catalogue */ }
      }
    } catch (e) {
      setLoadError(e?.message || 'Could not load this booking.');
    } finally {
      setLoading(false);
    }
  }, [ticketId, requestId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  // The request's issue as a new (custom) item, priced at the proposed amount.
  const requestSeed = useMemo(() => {
    if (!request) return [];
    const issue = String(request.additionalIssue || '').trim() || 'Additional work (technician request)';
    const amount = Number(request.proposedAmount);
    return [{
      serviceId: null,
      serviceCode: 'OTHER',
      serviceName: issue,
      price: Number.isFinite(amount) && amount > 0 ? amount : 0,
      note: String(request.reason || '').trim(),
    }];
  }, [request]);
  const requestPhotos = (Array.isArray(request?.requestImages) && request.requestImages.length ? request.requestImages : techPhotos)
    .filter((u) => typeof u === 'string' && u.trim());
  const onPullRefresh = async () => { setPullRefreshing(true); try { await load(true); } finally { setPullRefreshing(false); } };

  const original = useMemo(() => priceItemsFromTicket(ticket), [ticket]);
  const originalTotal = ticket ? estimatedTotalOf(ticket, original) : 0;
  const originalSeed = useMemo(() => original.filter((i) => i.id || i.serviceId).map((i) => ({
    serviceId: i.id || i.serviceId, serviceCode: i.code || null, serviceName: i.label || i.serviceName,
    price: Number(i.amount ?? i.price) || 0, warranty: i.warranty || null,
  })).concat(original.filter((i) => chargeIssueOf(i.label || i.serviceName)).map((i) => ({
    // Original "Service Charge – <issue>" lines: the picker folds them into
    // that issue's Service Charge box.
    serviceId: null, serviceCode: SERVICE_CHARGE_CODE, serviceName: i.label || i.serviceName,
    price: Number(i.amount ?? i.price) || 0,
  }))), [original]);
  const originalNames = useMemo(() => originalSeed.filter((o) => o.serviceId).map((o) => String(o.serviceName || '').toLowerCase()), [originalSeed]);
  const originalIds = useMemo(() => original.map((i) => i.id || i.serviceId).filter(Boolean), [original]);
  const extra = added.reduce((s, x) => s + (Number(x.price) || 0), 0);
  const unpriced = added.filter((x) => !x.priceSet);
  // Original issues the user removed (X) in Selected Services: sent as
  // removedItemIds (server identity = id, else code, else label) and taken
  // off the revised total. Restored by the server if the customer rejects.
  const removedOriginals = useMemo(() => (pickedIds == null ? [] : originalSeed.filter((o) => o.serviceId && !pickedIds.includes(o.serviceId))), [pickedIds, originalSeed]);
  const removedNames = removedOriginals.map((o) => String(o.serviceName || '').toLowerCase());
  // Issue prices + their own service-charge lines (the server drops both).
  const removedAmount = removedOriginals.reduce((s2, x) => s2 + (Number(x.price) || 0), 0)
    + original.filter((i) => removedNames.includes(String(chargeIssueOf(i.label || i.serviceName) || '').toLowerCase()))
      .reduce((s2, i) => s2 + (Number(i.amount ?? i.price) || 0), 0);
  const revisedTotal = Math.max(0, Number(originalTotal || 0) + extra - removedAmount);

  const now = useMemo(() => new Date(), []);
  const currentDelivery = ticket?.estimatedDeliveryAt ? new Date(ticket.estimatedDeliveryAt) : null;
  const proposedDelivery = extraHours > 0
    ? new Date(Math.max(now.getTime(), currentDelivery ? currentDelivery.getTime() : now.getTime()) + extraHours * 3600000)
    : null;

  // Server needs a reason: issue details + notes, else just the issue names.
  const reasonText = [
    ...added.map((x) => (x.note ? `${x.serviceName}: ${x.note}` : '')),
    reason.trim(),
  ].filter(Boolean).join('\n') || (added.length
    ? `Additional work: ${added.filter((x) => x.serviceCode !== SERVICE_CHARGE_CODE).map((x) => x.serviceName).join(', ')}`
    : `Removed: ${removedOriginals.map((o) => o.serviceName).join(', ')}`);
  // A re-estimate may only remove original issues (no new ones).
  const canSubmit = (added.length > 0 || removedOriginals.length > 0) && unpriced.length === 0 && approvedNow && !uploading && !saving && !recording && !audioBusy;
  const hint = !added.length && !removedOriginals.length ? 'Add or remove at least one repair issue.'
    : unpriced.length ? `Enter a price for ${unpriced[0].serviceName}.`
    : !approvedNow ? 'Tick Customer Re-Estimate Approval to submit.'
    : uploading ? 'Uploading photo…' : '';

  const addPhoto = async (fromCamera) => {
    if (photos.length >= MAX_PHOTOS) return;
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { notify('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo'} access to add a photo.`); return; }
    const opts = { mediaTypes: 'images', quality: 0.7 };
    const res = fromCamera ? await launchCamera(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) { notify('Photo too large', 'The limit is 10 MB.'); return; }
    try {
      setUploading(true);
      const url = await uploadMedia(asset, 'repair', { slot: 're-estimate' });
      if (!url) throw new Error('Upload returned no URL');
      setPhotos((p) => (p.length >= MAX_PHOTOS ? p : [...p, url]));
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) { setTried(true); return; }
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSaving(true);
    try {
      await ticketApi.post(`/tickets/${ticketId}/re-estimate`, {
        body: {
          // Service charges arrive as their own lines from the picker.
          items: added.map((x) => ({
            id: x.serviceId || null,
            code: x.serviceCode || null,
            label: x.serviceName,
            amount: Number(x.price) || 0,
            warranty: x.warranty || null,
          })),
          reason: reasonText,
          imagesJson: photos.length ? JSON.stringify(photos) : null,
          estimatedDeliveryAt: proposedDelivery ? proposedDelivery.toISOString() : null,
          customerApproved: approvedNow,
          // Links + converts the technician's request (REQUESTED → AWAITING_APPROVAL).
          ...(request?.id ? { requestId: request.id } : {}),
          // A removed issue takes its own "Service Charge – <issue>" line with it
          // (charge lines are identified by label on the server).
          ...(removedOriginals.length ? { removedItemIds: removedOriginals.flatMap((o) => [String(o.serviceId), ...original
            .filter((i) => chargeIssueOf(i.label || i.serviceName)?.toLowerCase() === String(o.serviceName || '').toLowerCase())
            .map((i) => String(i.label || i.serviceName).trim().toLowerCase())]) } : {}),
        },
      });
      if (audioUrl) {
        // Best effort: the re-estimate is saved even if the note fails.
        await ticketApi.post(`/tickets/${ticketId}/notes`, {
          body: { note: 'Re-estimate audio note', audioUrl, isInternal: false },
        }).catch(() => notify('Audio note not saved', 'The re-estimate was saved.', { preset: 'error' }));
      }
      notify('Re-estimate submitted', approvedNow ? 'Revised estimate approved by the customer.' : 'Waiting for customer approval.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      const status = e?.status;
      notify('Could not submit', status === 404
        ? 'Re-estimate needs the latest app server. Please update the server.'
        : status === 409
          ? (e?.message || 'Another re-estimate is already waiting for the customer\'s decision.')
          : (e?.message || 'Try again.'), { preset: 'error' });
    } finally {
      sendingRef.current = false;
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (added.length || reason.trim() || photos.length) {
      const ok = await confirm({ title: 'Discard re-estimate?', message: 'The additional issues will not be saved.', confirmText: 'Discard', destructive: true });
      if (!ok) return;
    }
    navigation.goBack();
  };

  if (loading && !ticket) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} size="large" /></View>;
  }
  if (loadError || !ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 14, color: RED, textAlign: 'center' }}>{loadError || 'Could not load this booking.'}</Text>
        <Pressable onPress={load} style={{ marginTop: 12 }}><Text style={{ color: ACCENT, fontWeight: '800' }}>Try again</Text></Pressable>
      </View>
    );
  }

  const deviceName = String(ticket.deviceDisplayName || ticket.modelName || 'Device').split(' (')[0].split(' · ')[0];
  const statusText = ticket.status ? ticketStatusLabel(ticket.status) : '';

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, col]}>
          <Pressable onPress={cancel} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back" className="items-center justify-center active:opacity-70" style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE, borderWidth: 1, borderColor: LINE }}>
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>Re-Estimate</Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>#{ticket.trackingId} · {deviceName}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        {statusText ? (
          <View style={[{ alignItems: 'center', marginTop: 4 }, col]}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: ACCENT, backgroundColor: MINT, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{statusText}</Text>
          </View>
        ) : null}
      </View>

      <KeyboardAwareScrollView refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} colors={[ACCENT]} tintColor={ACCENT} />} bottomOffset={100} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}>
        <View style={col}>
          {/* Technician's request being answered */}
          {request ? (
            <>
              <Title text="Technician Re-Estimate Request" />
              <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#F6D58E', backgroundColor: '#FFFBEB', padding: 12 }}>
                <ReqRow label="Technician" value={request.technicianName || ticket.assignedTechnicianName || '—'} />
                <ReqRow label="Requested" value={fmtDateTime(request.requestedAt)} />
                <ReqRow label="Issue" value={request.additionalIssue || '—'} />
                <ReqRow label="Reason" value={request.reason || '—'} />
                <ReqRow label="Proposed" value={request.proposedAmount != null && request.proposedAmount !== '' ? inr(request.proposedAmount) : 'Not Given'} />
                {request.technicianNotes ? <ReqRow label="Notes" value={request.technicianNotes} /> : null}
                <Text style={{ marginTop: 8, fontSize: 11.5, fontWeight: '800', color: '#6B7280' }}>Supporting Photos ({requestPhotos.length})</Text>
                {!requestPhotos.length ? <Text style={{ marginTop: 2, fontSize: 11.5, color: '#9CA3AF' }}>No photos attached by the technician.</Text> : null}
                {requestPhotos.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {requestPhotos.map((u, i) => (
                      <Pressable key={`${u}-${i}`} onPress={() => setViewer(i)} accessibilityRole="imagebutton" accessibilityLabel={`Request photo ${i + 1}`} style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: PAGE }}>
                        <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : requestLost ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#FFF4DB', padding: 10, marginTop: 12 }}>
              <Wrench size={14} color={AMBER} />
              <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, color: AMBER, fontWeight: '700' }}>The technician's request is no longer open — this is a new re-estimate.</Text>
            </View>
          ) : null}

          {/* Original estimate — read-only */}
          <Title text="Original Estimated Cost" hint="(read-only)" />
          <Card>
            {/* An issue with its own service charge: a. issue · b. Service Charge. */}
            {original.length ? groupServiceCharges(original).map((i, n) => (i.charge != null ? (
              <View key={`${i.id || i.label}-${n}`} style={{ paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{n + 1}. {i.label || i.serviceName || 'Service'}</Text>
                <View style={{ flexDirection: 'row', paddingLeft: 16, marginTop: 3 }}>
                  <Text style={{ flex: 1, fontSize: 12.5, color: INK }} numberOfLines={1}>a. {i.label || i.serviceName || 'Service'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>{inr(i.amount ?? i.price)}</Text>
                </View>
                <View style={{ flexDirection: 'row', paddingLeft: 16, marginTop: 3 }}>
                  <Text style={{ flex: 1, fontSize: 12.5, color: MUTED }}>b. Service Charge</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>{inr(i.charge)}</Text>
                </View>
              </View>
            ) : (
              <View key={`${i.id || i.label}-${n}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                <Text style={{ flex: 1, fontSize: 13, color: INK }} numberOfLines={1}>{n + 1}. {i.label || i.serviceName || 'Service'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>{inr(i.amount ?? i.price)}</Text>
              </View>
            ))) : <Text style={{ fontSize: 12.5, color: MUTED }}>No services recorded.</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: LINE, marginTop: 6, paddingTop: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: INK }}>Original Estimated Cost</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: ACCENT }}>{inr(originalTotal)}</Text>
            </View>
          </Card>

          {/* Audio note (optional) — before the issues */}
          <Title text="Audio Note" hint="(Optional)" />
          <Card>
            {audioUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}><VoiceNotePlayer url={audioUrl} compact /></View>
                <Pressable onPress={() => setAudioUrl('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete audio note" style={{ marginLeft: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={17} color={RED} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row' }}><MediaBtn
                icon={audioBusy ? <ActivityIndicator size="small" color={ACCENT} /> : recording ? <Square size={16} color={RED} /> : <Mic size={17} color={ACCENT} />}
                label={audioBusy ? 'Uploading…' : recording ? 'Stop Recording' : 'Record Audio Note'}
                disabled={audioBusy}
                onPress={recording ? stopRec : startRec}
              /></View>
            )}
          </Card>

          {/* Repair issues (new only; original issues stay above) */}
          <Title text="Repair Issue" required />
          <Card>
            {/* Original issues are listed in Selected Services too (with their prices);
                only the new ones are sent as the re-estimate. */}
            <RepairIssuesPicker key={`${request?.id || 'new'}-${ticket?.id || ''}`} categoryId={categoryId} initialServices={[...originalSeed, ...requestSeed]} onChange={(list) => { setPickedIds(list.map((x) => x.serviceId).filter(Boolean)); setAdded(list.filter((x) => (x.serviceId ? !originalIds.includes(x.serviceId)
              // an original issue's own charge line is not new
              : !(x.serviceCode === SERVICE_CHARGE_CODE && originalNames.includes(String(chargeIssueOf(x.serviceName) || '').toLowerCase()))))); }} isTablet={r.isTablet} withNotes chargePerService />
          </Card>

          {/* Supporting photos */}
          <Title text="Supporting Photos" hint="(Optional)" />
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MediaBtn icon={<Camera size={17} color={ACCENT} />} label="Camera" disabled={uploading || photos.length >= MAX_PHOTOS} onPress={() => addPhoto(true)} />
              <MediaBtn icon={<ImagePlus size={17} color={ACCENT} />} label="Gallery" disabled={uploading || photos.length >= MAX_PHOTOS} onPress={() => addPhoto(false)} />
            </View>
            {uploading ? <ActivityIndicator color={ACCENT} style={{ marginTop: 8 }} /> : null}
            {photos.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {photos.map((u, i) => (
                  <View key={u} style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: PAGE }}>
                    <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    <Pressable onPress={() => setPhotos((p) => p.filter((_, n) => n !== i))} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} style={{ position: 'absolute', top: 4, right: 4, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(17,17,17,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {/* Technician's uploaded photos — always listed, never hidden. */}
            <Text style={{ marginTop: 12, fontSize: 11.5, fontWeight: '800', color: '#6B7280' }}>Technician Uploaded Photos ({requestPhotos.length})</Text>
            {requestPhotos.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {requestPhotos.map((u, i) => (
                  <Pressable key={`tech-${u}-${i}`} onPress={() => setViewer(i)} accessibilityRole="imagebutton" accessibilityLabel={`Technician photo ${i + 1}`} style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: PAGE }}>
                    <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
            ) : <Text style={{ marginTop: 2, fontSize: 11.5, color: '#9CA3AF' }}>No photos uploaded by the technician.</Text>}
          </Card>

          {/* Extra repair time → proposed delivery */}
          <Title text="Additional Repair Time" />
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {EXTRA_HOURS.map((h) => {
                const on = extraHours === h;
                return (
                  <Pressable key={h} onPress={() => setExtraHours(h)} accessibilityRole="radio" accessibilityState={{ selected: on }} className="items-center justify-center active:opacity-80" style={{ minWidth: 56, height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : LINE, backgroundColor: on ? MINT : '#FFFFFF' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: on ? '800' : '600', color: on ? ACCENT : INK }}>{h === 0 ? 'No change' : `+${h} hr`}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <Clock size={15} color={MUTED} />
              <Text style={{ flex: 1, marginLeft: 6, fontSize: 12.5, color: MUTED }}>Current delivery</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>{fmtDateTime(currentDelivery)}</Text>
            </View>
            {proposedDelivery ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Clock size={15} color={AMBER} />
                <Text style={{ flex: 1, marginLeft: 6, fontSize: 12.5, color: AMBER, fontWeight: '700' }}>Proposed delivery</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: AMBER }}>{fmtDateTime(proposedDelivery)}</Text>
              </View>
            ) : null}
          </Card>

          {/* Revised summary */}
          <Title text="Revised Summary" />
          <Card>
            <SumRow label="Original Estimated Cost" value={inr(originalTotal)} />
            <SumRow label="Additional Amount" value={added.length ? (unpriced.length ? 'Not Estimated' : `+ ${inr(extra)}`) : '—'} color={AMBER} />
            {removedOriginals.length ? <SumRow label={`Removed (${removedOriginals.map((o) => o.serviceName).join(', ')})`} value={`− ${inr(removedAmount)}`} color={RED} /> : null}
            <View style={{ height: 1, backgroundColor: LINE, marginVertical: 6 }} />
            <SumRow label="Revised Total" value={inr(revisedTotal)} bold />
          </Card>

          {/* Customer approval */}
          <Title text="Customer Re-Estimate Approval" required />
          <Pressable
            onPress={() => setApprovedNow((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: approvedNow }}
            className="flex-row items-center active:opacity-80"
            style={{ borderRadius: 14, borderWidth: 1, borderColor: approvedNow ? MINT_LINE : LINE, backgroundColor: approvedNow ? MINT : '#FFFFFF', padding: 12 }}
          >
            {approvedNow ? <CircleCheck size={20} color={ACCENT} strokeWidth={2} /> : <Circle size={20} color="#D1D5DB" strokeWidth={2} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>Customer approved at the counter</Text>
              <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                {approvedNow
                  ? `The customer approved ${added.length || 'the'} additional issue${added.length === 1 ? '' : 's'}, the revised total ${inr(revisedTotal)}${proposedDelivery ? ` and delivery by ${fmtDateTime(proposedDelivery)}` : ''}.`
                  : 'Required — confirm the customer approved the re-estimate.'}
              </Text>
            </View>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
          <View style={col}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={cancel} accessibilityRole="button" className="flex-1 items-center justify-center active:opacity-80" style={{ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: LINE, backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submit} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} className="flex-1 items-center justify-center active:opacity-85" style={{ height: 48, borderRadius: 12, backgroundColor: ACCENT, opacity: canSubmit ? 1 : 0.6 }}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Submit Re-Estimate</Text>}
              </Pressable>
            </View>
            {tried && hint ? <Text style={{ fontSize: 12, fontWeight: '700', color: RED, textAlign: 'center', marginTop: 6 }}>{hint}</Text> : null}
          </View>
        </View>
      </KeyboardStickyView>
      <ImageViewerModal
        visible={viewer != null}
        images={requestPhotos.map((uri, i) => ({ uri, label: `Photo ${i + 1}` }))}
        index={viewer || 0}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

function ReqRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3 }}>
      <Text style={{ width: 84, fontSize: 12, color: MUTED }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: INK }}>{value}</Text>
    </View>
  );
}

function Title({ text, hint, required }) {
  return (
    <Text style={{ fontSize: 13.5, fontWeight: '800', color: INK, marginTop: 14, marginBottom: 6 }}>
      {text}{required ? <Text style={{ color: RED }}> *</Text> : null}{hint ? <Text style={{ fontWeight: '400', color: MUTED }}> {hint}</Text> : null}
    </Text>
  );
}

function Card({ children }) {
  return <View style={{ borderRadius: 14, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', padding: 12 }}>{children}</View>;
}

function MediaBtn({ icon, label, onPress, disabled }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Add photo from ${label.toLowerCase()}`} className="flex-1 flex-row items-center justify-center active:opacity-80" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: disabled ? LINE : MINT_LINE, backgroundColor: disabled ? PAGE : MINT, opacity: disabled ? 0.6 : 1 }}>
      {icon}
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: disabled ? MUTED : ACCENT }}>{label}</Text>
    </Pressable>
  );
}

function SumRow({ label, value, color, bold }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Text style={{ flex: 1, fontSize: bold ? 14 : 13, fontWeight: bold ? '800' : '500', color: bold ? INK : MUTED }}>{label}</Text>
      <Text style={{ fontSize: bold ? 18 : 13.5, fontWeight: '800', color: color || (bold ? ACCENT : INK) }}>{value}</Text>
    </View>
  );
}
