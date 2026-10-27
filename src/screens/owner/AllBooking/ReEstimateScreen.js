import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, CircleCheck, Circle, Clock, ImagePlus, X } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { getModelsByBrand, uploadMedia } from '../../../api/masterData';
import { confirm, notify } from '../../../components/confirm';
import { useResponsive } from '../../../theme/responsive';
import RepairIssuesPicker, { SERVICE_CHARGE_CODE } from '../service-booking-shop/RepairIssuesPicker';
import { estimatedTotalOf, priceItemsFromTicket } from './ReceiptCard';

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
 */
export default function ReEstimateScreen({ navigation, route }) {
  const ticketId = route?.params?.ticketId;
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const col = r.isTablet ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : null;

  const [ticket, setTicket] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [added, setAdded] = useState([]);           // from RepairIssuesPicker
  const [reason, setReason] = useState('');          // free Notes
  const [photos, setPhotos] = useState([]);         // uploaded URLs
  const [uploading, setUploading] = useState(false);
  const [extraHours, setExtraHours] = useState(0);
  const [approvedNow, setApprovedNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const sendingRef = useRef(false);
  // The "what's missing" line shows only after Submit is tapped, not on arrival.
  const [tried, setTried] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const t = await ticketApi.get(`/tickets/${ticketId}`);
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
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  const original = useMemo(() => priceItemsFromTicket(ticket), [ticket]);
  const originalTotal = ticket ? estimatedTotalOf(ticket, original) : 0;
  const originalIds = useMemo(() => original.map((i) => i.id || i.serviceId).filter(Boolean), [original]);
  const extra = added.reduce((s, x) => s + (Number(x.price) || 0), 0);
  const unpriced = added.filter((x) => !x.priceSet);
  const revisedTotal = Number(originalTotal || 0) + extra;

  const now = useMemo(() => new Date(), []);
  const currentDelivery = ticket?.estimatedDeliveryAt ? new Date(ticket.estimatedDeliveryAt) : null;
  const proposedDelivery = extraHours > 0
    ? new Date(Math.max(now.getTime(), currentDelivery ? currentDelivery.getTime() : now.getTime()) + extraHours * 3600000)
    : null;

  // Server needs a reason: issue details + notes, else just the issue names.
  const reasonText = [
    ...added.map((x) => (x.note ? `${x.serviceName}: ${x.note}` : '')),
    reason.trim(),
  ].filter(Boolean).join('\n') || `Additional work: ${added.filter((x) => x.serviceCode !== SERVICE_CHARGE_CODE).map((x) => x.serviceName).join(', ')}`;
  const canSubmit = added.length > 0 && unpriced.length === 0 && !uploading && !saving;
  const hint = !added.length ? 'Add at least one additional issue.'
    : unpriced.length ? `Enter a price for ${unpriced[0].serviceName}.`
    : uploading ? 'Uploading photo…' : '';

  const addPhoto = async (fromCamera) => {
    if (photos.length >= MAX_PHOTOS) return;
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { notify('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo'} access to add a photo.`); return; }
    const opts = { mediaTypes: 'images', quality: 0.7 };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
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
        },
      });
      notify('Re-estimate submitted', approvedNow ? 'Revised estimate approved by the customer.' : 'Waiting for customer approval.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      const status = e?.status;
      notify('Could not submit', status === 404
        ? 'Re-estimate needs the latest app server. Please update the server.'
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
  const statusText = String(ticket.status || '').replace(/_/g, ' ');

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

      <KeyboardAwareScrollView bottomOffset={100} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}>
        <View style={col}>
          {/* Original estimate — read-only */}
          <Title text="Original Estimate" hint="(read-only)" />
          <Card>
            {original.length ? original.map((i, n) => (
              <View key={`${i.id || i.label}-${n}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                <Text style={{ flex: 1, fontSize: 13, color: INK }} numberOfLines={1}>{i.label || i.serviceName || 'Service'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>{inr(i.amount ?? i.price)}</Text>
              </View>
            )) : <Text style={{ fontSize: 12.5, color: MUTED }}>No services recorded.</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: LINE, marginTop: 6, paddingTop: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: INK }}>Current Total</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: ACCENT }}>{inr(originalTotal)}</Text>
            </View>
          </Card>

          {/* Additional issues (new only) */}
          <Title text="Additional Issues" required />
          <Card>
            <RepairIssuesPicker categoryId={categoryId} initialServices={[]} onChange={setAdded} isTablet={r.isTablet} excludeIds={originalIds} withNotes chargePerService />
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
            <SumRow label="Current Estimate" value={inr(originalTotal)} />
            <SumRow label="Additional Amount" value={added.length ? (unpriced.length ? 'Not Estimated' : `+ ${inr(extra)}`) : '—'} color={AMBER} />
            <View style={{ height: 1, backgroundColor: LINE, marginVertical: 6 }} />
            <SumRow label="Revised Total" value={inr(revisedTotal)} bold />
          </Card>

          {/* Customer approval */}
          <Title text="Customer Re-Estimate Approval" />
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
                  : 'Leave unticked to send it for approval — the additional work waits until the customer approves.'}
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
