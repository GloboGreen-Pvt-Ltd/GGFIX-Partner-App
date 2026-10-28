import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Camera, ChevronDown, IdCard, ImagePlus, Lock, Mic, Pencil, Phone, ScanLine, Smartphone, User, Video, X,
} from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { getModelsByBrand, uploadMedia } from '../../../api/masterData';
import { confirm, notify } from '../../../components/confirm';
import ImageViewerModal from '../../../components/ImageViewerModal';
import { imeiApplies } from '../../../utils/imeiPolicy';
import { lockTypesFor, resolveSpecCategory, specDisplayParts } from '../../../utils/deviceSpecs';
import { useResponsive } from '../../../theme/responsive';
import { priceItemsFromTicket } from './ReceiptCard';
import MissingPartsChecklist, { flaggedMissingParts, seedMissingParts } from '../service-booking-shop/MissingPartsChecklist';
import DeviceSecurityLockSheet from '../service-booking-shop/DeviceSecurityLockSheet';
import { categoryLabel, consumeValidated, discardTempImage, isVerifiableCategory } from '../scanner/devicePhotoCheck';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const INK = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';
const LINE = '#E5E7EB';
const PAGE = '#F3F4F6';
const RED = '#DC2626';

const PHOTO_KEYS = ['front', 'back', 'photo3', 'photo4', 'photo5'];
const MAX_BYTES = 10 * 1024 * 1024;
const LOCK_LABEL = { NONE: 'None', PIN: 'PIN', PATTERN: 'Pattern', PASSWORD: 'Password', ACCOUNT: 'Account Lock' };

const parseJson = (v, fallback) => {
  if (v && typeof v === 'object') return v;
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const normMobile = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
};
// Issues ride in issueDescription as "Issue: note" lines, then free Notes.
const itemLabel = (x) => String(x?.label || x?.serviceName || x?.name || '').trim();
const splitIssueText = (text, labels) => {
  const notes = {};
  const rest = [];
  String(text || '').split('\n').forEach((line) => {
    const l = labels.find((lb) => lb && line.startsWith(`${lb}: `));
    if (l && notes[l] === undefined) notes[l] = line.slice(l.length + 2);
    else rest.push(line);
  });
  return { notes, rest: rest.join('\n').trim() };
};
const joinIssueText = (labels, notes, rest) => [
  ...labels.map((l) => (notes?.[l]?.trim() ? `${l}: ${notes[l].trim()}` : '')),
  String(rest || '').trim(),
].filter(Boolean).join('\n');
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

/**
 * Edit Booking — booking DETAILS only, on one screen: customer name / mobile,
 * device (model via the catalogue picker, IMEI), complaint, photos, missing /
 * damaged parts and device security.
 *
 * It never touches repair status, prices, technician or the delivery schedule
 * (those have their own actions). Save sends ONLY the changed fields through
 * PATCH /tickets/{id} and records one "Booking Edited" history row naming what
 * changed (never a PIN / pattern / password). Nothing changed → no API call.
 */
export default function EditBookingScreen({ navigation, route }) {
  const ticketId = route?.params?.ticketId;
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const col = r.isTablet ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : null;

  const [ticket, setTicket] = useState(null);
  const [category, setCategory] = useState({ code: null, name: null, id: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Editable copy + the original it is compared against on Save.
  const [form, setForm] = useState(null);
  const originalRef = useRef(null);
  const [custOpen, setCustOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(!!route?.params?.openSecurity);
  const [lockSheet, setLockSheet] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const t = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(t);
      const photos = parseJson(t.devicePhotosJson, {});
      const asObj = Array.isArray(photos) ? Object.fromEntries(photos.map((u, i) => [PHOTO_KEYS[i] || `photo${i + 1}`, u])) : (photos || {});
      const initial = {
        customerName: t.customerName || '',
        customerPhone: normMobile(t.customerPhone),
        // Lives on the customer record, not the ticket — filled in below.
        customerAltPhone: '',
        imei: t.imei || '',
        // issueDescription here = the free Notes part; issueNotes = one per issue.
        issueDescription: splitIssueText(t.issueDescription, priceItemsFromTicket(t).map(itemLabel)).rest,
        issueNotes: splitIssueText(t.issueDescription, priceItemsFromTicket(t).map(itemLabel)).notes,
        photos: PHOTO_KEYS.map((k) => asObj[k]).filter(Boolean),
        video: asObj.video || '',
        missingParts: seedMissingParts(parseJson(t.missingPartsJson, [])),
        lockType: t.deviceSecurityType || 'NONE',
        lockValue: t.deviceSecurityValue || '',
        device: null, // set only when the model is changed through the picker
      };
      originalRef.current = initial;
      setForm(initial);
      // Saved alternative number, from the customer record. Seeds the original
      // too, so loading it doesn't count as an edit; never overwrites typing.
      if (initial.customerPhone.length === 10) {
        ticketApi.get('/customers/lookup', { query: { mobile: initial.customerPhone } })
          .then((c) => {
            const alt = normMobile(c?.alternatePhone);
            if (!alt || !originalRef.current) return;
            originalRef.current = { ...originalRef.current, customerAltPhone: alt };
            setForm((f) => (f && !f.customerAltPhone ? { ...f, customerAltPhone: alt } : f));
          })
          .catch(() => {});
      }
      // The ticket stores no category — read it off the catalogue model.
      if (t.brandId && t.modelId) {
        try {
          const list = await getModelsByBrand(t.brandId);
          const m = (list || []).find((x) => x.id === t.modelId);
          if (m) setCategory({ id: m.categoryId || null, code: m.categoryCode || null, name: m.categoryName || null });
        } catch { /* category stays unknown */ }
      }
    } catch (e) {
      setLoadError(e?.message || 'Could not load this booking.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // The booking's issues (read-only here — Re-Est / Price Revised change them).
  const issueItems = useMemo(() => priceItemsFromTicket(ticket).filter((x) => itemLabel(x)), [ticket]);
  const issueLabels = useMemo(() => issueItems.map(itemLabel), [issueItems]);
  const specCategory = resolveSpecCategory(form?.device?.deviceCategory, form?.device?.categoryCode || category.code, form?.device?.categoryName || category.name);
  const showImei = imeiApplies(specCategory);
  const lockTypes = lockTypesFor(specCategory);
  const lockOptions = ['NONE', ...['PIN', 'PATTERN', 'PASSWORD'].filter((k) => lockTypes.includes(k)), ...(lockTypes.includes('PATTERN') ? ['ACCOUNT'] : [])];
  const photoVerifiable = isVerifiableCategory(specCategory);

  // ── What changed (allowed booking-detail fields only) ─────────────────
  const diff = useMemo(() => {
    if (!form || !originalRef.current) return { body: {}, labels: [] };
    const o = originalRef.current;
    const body = {};
    const labels = [];
    if (form.customerName.trim() !== o.customerName.trim()) { body.customerName = form.customerName.trim(); labels.push('Customer name'); }
    if (normMobile(form.customerPhone) !== o.customerPhone) { body.customerPhone = normMobile(form.customerPhone); labels.push('Customer mobile'); }
    if (normMobile(form.customerAltPhone) !== normMobile(o.customerAltPhone)) labels.push('Alternative mobile');
    if (form.device) {
      const d = form.device;
      const parts = specDisplayParts(d);
      Object.assign(body, {
        brandId: d.brandId || null,
        modelId: d.modelId || null,
        ramOptionId: d.ramOptionId || null,
        storageOptionId: d.storageOptionId || null,
        color: d.color || null,
        deviceImageUrl: d.imageUrl || null,
        deviceDisplayName: d.modelName ? `${!d.brandId && d.brandName ? `${d.brandName} ` : ''}${d.modelName}${d.modelNumber ? ` · ${d.modelNumber}` : ''}${parts.length ? ` (${parts.join(' / ')})` : ''}` : null,
      });
      labels.push('Device model');
    }
    const imei = form.imei.replace(/\D/g, '');
    if (showImei && imei !== String(o.imei || '').replace(/\D/g, '')) { body.imei = imei; labels.push(o.imei ? 'IMEI updated' : 'IMEI added'); }
    const issueText = joinIssueText(issueLabels, form.issueNotes, form.issueDescription);
    if (issueText !== joinIssueText(issueLabels, o.issueNotes, o.issueDescription)) { body.issueDescription = issueText; labels.push('Issue notes'); }
    const photosNow = JSON.stringify([form.photos, form.video]);
    const photosWas = JSON.stringify([o.photos, o.video]);
    if (photosNow !== photosWas) {
      const obj = {};
      form.photos.forEach((u, i) => { obj[PHOTO_KEYS[i]] = u; });
      if (form.video) obj.video = form.video;
      body.devicePhotosJson = JSON.stringify(obj);
      labels.push(form.photos.length + (form.video ? 1 : 0) > o.photos.length + (o.video ? 1 : 0) ? 'Device photo added' : 'Device photos');
    }
    const partsNow = JSON.stringify(flaggedMissingParts(form.missingParts));
    if (partsNow !== JSON.stringify(flaggedMissingParts(o.missingParts))) { body.missingPartsJson = partsNow; labels.push('Missing / damaged parts'); }
    if (form.lockType !== o.lockType || form.lockValue !== o.lockValue) {
      body.deviceSecurityType = form.lockType;
      body.deviceSecurityValue = form.lockType === 'NONE' ? null : form.lockValue;
      labels.push('Device security'); // never the value
    }
    return { body, labels };
  }, [form, showImei, issueLabels]);
  const dirty = diff.labels.length > 0;

  const imeiDigits = (form?.imei || '').replace(/\D/g, '');
  const imeiError = showImei && imeiDigits.length > 0 && (imeiDigits.length < 14 || imeiDigits.length > 17) ? 'IMEI must be 14–17 digits.' : '';
  const phoneError = form && normMobile(form.customerPhone).length !== 10 ? 'Enter a 10-digit mobile number.' : '';
  const nameError = form && !form.customerName.trim() ? 'Customer name is required.' : '';
  // Optional; when given: a 10-digit Indian mobile, different from the main one.
  const altDigits = normMobile(form?.customerAltPhone);
  const altError = !form || !altDigits ? ''
    : altDigits.length !== 10 ? 'Enter all 10 digits.'
    : !/^[6-9]\d{9}$/.test(altDigits) ? 'Mobile numbers start with 6, 7, 8 or 9.'
    : altDigits === normMobile(form.customerPhone) ? 'Must be different from the mobile number.'
    : '';
  const altChanged = !!form && !!originalRef.current && altDigits !== normMobile(originalRef.current.customerAltPhone);
  const canSave = dirty && !saving && !uploading && !imeiError && !phoneError && !nameError && !altError;

  // ── Save: PATCH only the changed fields, then one history row ────────
  const save = async () => {
    if (!canSave) {
      if (!dirty) notify('No changes', 'Nothing has been changed.');
      return;
    }
    const isBulk = /-[A-Z]{1,2}$/.test(String(ticket?.trackingId || ''));
    if (isBulk && (diff.body.customerName !== undefined || diff.body.customerPhone !== undefined)) {
      const ok = await confirm({
        title: 'Update customer details?',
        message: `This booking has other devices. The new customer details are saved on #${ticket.trackingId} only.`,
        confirmText: 'Save',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      // Alternative number → the customer record (POST /customers upserts by
      // mobile and only writes the fields it is given).
      if (altChanged && altDigits) {
        await ticketApi.post('/customers', {
          body: { name: form.customerName.trim(), phone: normMobile(form.customerPhone), alternatePhone: altDigits },
        });
      }
      const res = Object.keys(diff.body).length
        ? await ticketApi.patch(`/tickets/${ticketId}`, { body: diff.body })
        : null;
      // Only claim success for what the server actually stored (an older
      // server ignores fields it doesn't support).
      const missed = ['customerName', 'customerPhone', 'issueDescription', 'imei', 'deviceSecurityType', 'missingPartsJson', 'devicePhotosJson', 'modelId']
        .filter((k) => diff.body[k] !== undefined && res && k in res && String(res[k] ?? '') !== String(diff.body[k] ?? ''));
      if (missed.length) {
        notify('Not fully saved', 'The server did not accept some changes yet. Please update the app server and try again.', { preset: 'error' });
        return;
      }
      ticketApi.post(`/tickets/${ticketId}/progress-events`, {
        body: { statusKey: 'BOOKING_EDITED', note: `Booking Edited — ${diff.labels.join(', ')}`, actor: 'SHOP' },
      }).catch(() => {});
      notify('Saved', 'Booking details updated successfully.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Save failed', e?.message || 'Could not update the booking.', { preset: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (dirty) {
      const ok = await confirm({ title: 'Discard changes?', message: 'Your edits will not be saved.', confirmText: 'Discard', destructive: true });
      if (!ok) return;
    }
    navigation.goBack();
  };

  // ── Device change through the existing catalogue picker ──────────────
  const changeDevice = () => {
    navigation.navigate('RepairServiceBookingShop', {
      screen: 'DeviceDetails',
      params: {
        flow: 'BOOKING',
        onPicked: async (d) => {
          const sameCategory = !category.id || !d.categoryId || d.categoryId === category.id;
          if (!sameCategory) {
            const ok = await confirm({
              title: 'Different device category',
              message: 'The saved issues, photos and parts were for another kind of device. Check them after saving — nothing is removed automatically.',
              confirmText: 'Use this device',
            });
            if (!ok) return;
          }
          set('device', d);
        },
      },
    });
  };

  // ── Media ─────────────────────────────────────────────────────────────
  const addPhoto = (fromCamera) => {
    if (!photoVerifiable) {
      notify('Photo check unavailable', `${categoryLabel(specCategory)} photos can't be verified yet — add a video instead.`);
      return;
    }
    if (form.photos.length >= PHOTO_KEYS.length) return;
    navigation.navigate('DevicePhotoCapture', {
      mode: fromCamera ? 'camera' : 'gallery',
      category: specCategory || null,
      onDone: async (asset) => {
        if (!consumeValidated(asset?.uri)) {
          discardTempImage(asset?.uri);
          notify('Photo not added', 'Only verified device photos can be added.');
          return;
        }
        try {
          if (asset.fileSize && asset.fileSize > MAX_BYTES) { notify('Photo too large', 'The limit is 10 MB.'); return; }
          setUploading(true);
          const url = await uploadMedia(asset, 'repair', { slot: PHOTO_KEYS[form.photos.length] || 'photo5' });
          if (!url) throw new Error('Upload returned no URL');
          setForm((f) => ({ ...f, photos: f.photos.length >= PHOTO_KEYS.length ? f.photos : [...f.photos, url] }));
        } catch (e) {
          notify('Upload failed', e?.message || 'Try again.');
        } finally {
          setUploading(false);
          discardTempImage(asset?.uri);
        }
      },
    });
  };
  const addVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { notify('Permission needed', 'Allow video access to add a device video.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', videoMaxDuration: 15 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) { notify('Video too large', 'The limit is 10 MB.'); return; }
    try {
      setUploading(true);
      const url = await uploadMedia(asset, 'repair', { slot: 'video' });
      if (!url) throw new Error('Upload returned no URL');
      set('video', url);
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again.');
    } finally {
      setUploading(false);
    }
  };
  const removePhoto = async (i) => {
    const ok = await confirm({ title: 'Remove photo?', message: 'It is removed when you save.', confirmText: 'Remove', destructive: true });
    if (ok) setForm((f) => ({ ...f, photos: f.photos.filter((_, n) => n !== i) }));
  };
  const removeVideo = async () => {
    const ok = await confirm({ title: 'Remove video?', message: 'It is removed when you save.', confirmText: 'Remove', destructive: true });
    if (ok) set('video', '');
  };

  if (loading && !form) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} size="large" /></View>;
  }
  if (loadError || !form) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 14, color: RED, textAlign: 'center' }}>{loadError || 'Could not load this booking.'}</Text>
        <Pressable onPress={load} style={{ marginTop: 12 }}><Text style={{ color: ACCENT, fontWeight: '800' }}>Try again</Text></Pressable>
      </View>
    );
  }

  const d = form.device;
  const deviceName = d ? [!d.brandId && d.brandName ? d.brandName : null, d.modelName].filter(Boolean).join(' ') : (ticket.deviceDisplayName || ticket.modelName || 'Device').split(' (')[0].split(' · ')[0];
  const deviceSpec = d ? specDisplayParts(d, { withColor: true }).join(' · ') : [ticket.ramLabel, ticket.storageLabel, ticket.color].filter(Boolean).join(' · ');
  const deviceImage = d ? d.imageUrl : ticket.deviceImageUrl;
  const flagged = flaggedMissingParts(form.missingParts).length;
  const lockSaved = form.lockType !== 'NONE' && form.lockValue;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {/* Header: ← Edit Booking · #ticket */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, col]}>
          <Pressable onPress={cancel} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back" className="items-center justify-center active:opacity-70" style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE, borderWidth: 1, borderColor: LINE }}>
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>Edit Booking</Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>Update booking details · #{ticket.trackingId}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAwareScrollView bottomOffset={90} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}>
        <View style={col}>
          {/* Device summary + change */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ height: 56, width: 56, borderRadius: 12, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {deviceImage ? <Image source={{ uri: deviceImage }} style={{ width: '88%', height: '88%' }} resizeMode="contain" /> : <Smartphone size={26} color={MUTED} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: INK }} numberOfLines={2}>{deviceName}</Text>
                {deviceSpec ? <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }} numberOfLines={1}>{deviceSpec}</Text> : null}
                {d ? <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT, marginTop: 2 }}>New device selected</Text> : null}
              </View>
              <Pressable onPress={changeDevice} accessibilityRole="button" accessibilityLabel="Change device" className="active:opacity-70" style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: ACCENT }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: ACCENT }}>Change</Text>
              </Pressable>
            </View>
          </Card>

          {/* Customer details */}
          <SectionTitle title="Customer Details" action={custOpen ? null : 'Edit'} onAction={() => setCustOpen(true)} />
          <Card>
            {custOpen ? (
              <>
                <Field icon={<User size={18} color={INK} strokeWidth={1.75} />} value={form.customerName} onChangeText={(v) => set('customerName', v)} placeholder="Customer name" autoCapitalize="words" error={nameError} />
                <Field icon={<Phone size={18} color={INK} strokeWidth={1.75} />} value={form.customerPhone} onChangeText={(v) => set('customerPhone', v.replace(/\D/g, ''))} placeholder="10-digit mobile number" keyboardType="number-pad" maxLength={10} error={phoneError} />
                <Field icon={<Phone size={18} color={INK} strokeWidth={1.75} />} value={form.customerAltPhone} onChangeText={(v) => set('customerAltPhone', v.replace(/\D/g, ''))} placeholder="Enter alternative mobile number (optional)" keyboardType="phone-pad" maxLength={10} error={altError} last />
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}><User size={16} color={ACCENT} /></View>
                <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '800', color: INK }} numberOfLines={1}>
                  {form.customerName || '—'}<Text style={{ fontWeight: '500', color: MUTED }}>{form.customerPhone ? `  ·  ${form.customerPhone}` : ''}{form.customerAltPhone ? `  ·  Alt ${form.customerAltPhone}` : ''}</Text>
                </Text>
              </View>
            )}
          </Card>

          {/* Identification (mobile: IMEI) */}
          {showImei ? (
            <>
              <SectionTitle title="IMEI Number" hint="(Optional)" />
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, borderWidth: 1, borderColor: imeiError ? '#FECACA' : LINE, paddingLeft: 12, paddingRight: 6 }}>
                  <IdCard size={18} color={INK} strokeWidth={1.75} />
                  <TextInput value={form.imei} onChangeText={(v) => set('imei', v.replace(/\D/g, ''))} placeholder="Enter 15-digit IMEI" placeholderTextColor={SUBTLE} keyboardType="number-pad" maxLength={17} cursorColor={ACCENT} style={{ flex: 1, marginLeft: 10, paddingVertical: 0, fontSize: 14, color: INK }} />
                  <Pressable onPress={() => navigation.navigate('ScanImei', { onScan: (v) => set('imei', String(v || '').replace(/\D/g, '')) })} hitSlop={6} accessibilityRole="button" accessibilityLabel="Scan IMEI" className="items-center justify-center active:opacity-70" style={{ height: 32, width: 32 }}>
                    <ScanLine size={19} color={INK} strokeWidth={1.75} />
                  </Pressable>
                </View>
                {imeiError ? <Text style={{ fontSize: 11.5, color: RED, marginTop: 5 }}>{imeiError}</Text> : null}
              </Card>
            </>
          ) : null}

          {/* Issues — every issue on the booking, each with its own notes box. */}
          {issueItems.length ? (
            <>
              <SectionTitle title="Issues" hint={`(${issueItems.length})`} />
              <Card>
                {issueItems.map((x, idx) => {
                  const l = itemLabel(x);
                  const amt = Number(x?.amount ?? x?.price);
                  return (
                    <View key={`${l}-${idx}`} style={{ marginTop: idx ? 12 : 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: INK }} numberOfLines={2}>{idx + 1}. {l}</Text>
                        {Number.isFinite(amt) ? <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '800', color: ACCENT }}>₹{amt.toLocaleString('en-IN')}</Text> : null}
                      </View>
                      <TextInput
                        value={form.issueNotes?.[l] || ''}
                        onChangeText={(v) => set('issueNotes', { ...(form.issueNotes || {}), [l]: v })}
                        placeholder="Additional notes (optional)"
                        placeholderTextColor={SUBTLE}
                        maxLength={200}
                        cursorColor={ACCENT}
                        style={{ height: 42, paddingHorizontal: 12, fontSize: 13.5, color: INK, includeFontPadding: false, borderWidth: 1, borderColor: LINE, borderRadius: 10 }}
                      />
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          {ticket.issueAudioUrl ? (
          <Card>
            {ticket.issueAudioUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Mic size={14} color={ACCENT} />
                <Text style={{ marginLeft: 6, fontSize: 12, color: MUTED }}>Voice note attached</Text>
              </View>
            ) : null}
          </Card>
          ) : null}

          {/* Photos / video */}
          <SectionTitle title="Device Photos & Video" hint="(Optional)" />
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MediaButton icon={<Camera size={17} color={ACCENT} />} label="Camera" disabled={!photoVerifiable || form.photos.length >= PHOTO_KEYS.length || uploading} onPress={() => addPhoto(true)} />
              <MediaButton icon={<ImagePlus size={17} color={ACCENT} />} label="Gallery" disabled={!photoVerifiable || form.photos.length >= PHOTO_KEYS.length || uploading} onPress={() => addPhoto(false)} />
              <MediaButton icon={<Video size={17} color={ACCENT} />} label="Video" disabled={!!form.video || uploading} onPress={addVideo} />
            </View>
            {uploading ? <ActivityIndicator color={ACCENT} style={{ marginTop: 8 }} /> : null}
            {form.photos.length || form.video ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {form.photos.map((u, i) => (
                  <Pressable key={u} onPress={() => setPreview(i)} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1}`} style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: PAGE }}>
                    <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    <Pressable onPress={() => removePhoto(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} style={{ position: 'absolute', top: 4, right: 4, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(17,17,17,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color="#FFFFFF" />
                    </Pressable>
                  </Pressable>
                ))}
                {form.video ? (
                  <View style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Video</Text>
                    <Pressable onPress={removeVideo} hitSlop={6} accessibilityRole="button" accessibilityLabel="Remove video" style={{ position: 'absolute', top: 4, right: 4, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>No photos yet.</Text>
            )}
          </Card>

          {/* More details: parts + security */}
          <SectionTitle title="More Details" />
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
            {!specCategory || specCategory === 'MOBILE' ? (
              <>
                <FoldRow title="Missing / Damaged Parts" right={flagged ? `${flagged} Part${flagged === 1 ? '' : 's'} Flagged` : 'None'} rightColor={flagged ? RED : MUTED} open={partsOpen} onPress={() => setPartsOpen((v) => !v)} />
                {partsOpen ? <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><MissingPartsChecklist value={form.missingParts} onChange={(v) => set('missingParts', v)} /></View> : null}
                <View style={{ height: 1, backgroundColor: LINE }} />
              </>
            ) : null}
            {lockOptions.length > 1 ? (
              <>
                <FoldRow title="Device Security" right={lockSaved ? `${LOCK_LABEL[form.lockType]} — Saved` : 'None'} rightColor={lockSaved ? ACCENT : MUTED} open={lockOpen} onPress={() => setLockOpen((v) => !v)} icon={<Lock size={15} color={INK} />} />
                {lockOpen ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                    <Chip label="Change Security" onPress={() => setLockSheet({ type: form.lockType === 'NONE' ? lockOptions[1] : form.lockType, value: form.lockType === 'NONE' ? '' : form.lockValue })} />
                    {lockSaved ? <Chip label="Clear Security" danger onPress={() => setForm((f) => ({ ...f, lockType: 'NONE', lockValue: '' }))} /> : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>

          {/* Read-only context — changed through their own actions. */}
          <SectionTitle title="Booking Info" hint="(not editable here)" />
          <Card>
            <InfoRow label="Ticket" value={`#${ticket.trackingId}`} />
            <InfoRow label="Booked on" value={fmtDateTime(ticket.createdAt)} />
            <InfoRow label="Status" value={String(ticket.status || '—').replace(/_/g, ' ')} />
            <InfoRow label="Technician" value={ticket.assignedTechnicianName || ticket.technicianName || (ticket.assignedTechnicianId ? 'Assigned' : 'Not assigned')} />
            <InfoRow label="Estimate" value={ticket.estimatedPrice != null ? `₹${Number(ticket.estimatedPrice).toLocaleString('en-IN')}` : 'Not Estimated'} />
            <InfoRow label="Delivery" value={fmtDateTime(ticket.estimatedDeliveryAt)} last />
          </Card>
        </View>
      </KeyboardAwareScrollView>

      {/* Sticky footer: Cancel · Save Changes */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
          <View style={[{ flexDirection: 'row', gap: 10 }, col]}>
            <Pressable onPress={cancel} accessibilityRole="button" className="flex-1 items-center justify-center active:opacity-80" style={{ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: LINE, backgroundColor: '#FFFFFF' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} className="flex-1 items-center justify-center active:opacity-85" style={{ height: 48, borderRadius: 12, backgroundColor: ACCENT, opacity: canSave ? 1 : 0.45 }}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Save Changes</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>

      <DeviceSecurityLockSheet
        visible={!!lockSheet}
        types={lockOptions}
        initialLock={lockSheet}
        showProgress={false}
        saveLabel="Save"
        onConfirm={(l) => { setForm((f) => ({ ...f, lockType: l.type, lockValue: l.type === 'NONE' ? '' : (l.value || '') })); setLockSheet(null); }}
        onClose={() => setLockSheet(null)}
      />
      <ImageViewerModal
        visible={preview != null}
        images={form.photos.map((uri, i) => ({ uri, label: `Photo ${i + 1}` }))}
        index={preview || 0}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

function Card({ children }) {
  return <View style={{ borderRadius: 14, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', padding: 12 }}>{children}</View>;
}

function SectionTitle({ title, hint, action, onAction }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '800', color: INK }}>
        {title}{hint ? <Text style={{ fontWeight: '400', color: MUTED }}> {hint}</Text> : null}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={6} accessibilityRole="button" className="flex-row items-center active:opacity-70">
          <Pencil size={13} color={ACCENT} />
          <Text style={{ marginLeft: 4, fontSize: 12.5, fontWeight: '800', color: ACCENT }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Field({ icon, error, last, ...props }) {
  return (
    <View style={{ marginBottom: last ? 0 : 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, borderWidth: 1, borderColor: error ? '#FECACA' : LINE, paddingHorizontal: 12 }}>
        {icon}
        <TextInput {...props} placeholderTextColor={SUBTLE} cursorColor={ACCENT} style={{ flex: 1, marginLeft: 10, paddingVertical: 0, fontSize: 14, color: INK, includeFontPadding: false }} />
      </View>
      {error ? <Text style={{ fontSize: 11.5, color: RED, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

function MediaButton({ icon, label, onPress, disabled }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Add ${label.toLowerCase()}`} className="flex-1 flex-row items-center justify-center active:opacity-80" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: disabled ? LINE : MINT_LINE, backgroundColor: disabled ? PAGE : MINT, opacity: disabled ? 0.6 : 1 }}>
      {icon}
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: disabled ? MUTED : ACCENT }}>{label}</Text>
    </Pressable>
  );
}

function FoldRow({ title, right, rightColor, open, onPress, icon }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} className="flex-row items-center active:opacity-80" style={{ minHeight: 48, paddingHorizontal: 12 }}>
      {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: INK }} numberOfLines={1}>{title}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: rightColor, marginRight: 6 }} numberOfLines={1}>{right}</Text>
      <ChevronDown size={18} color={INK} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
    </Pressable>
  );
}

function Chip({ label, onPress, danger }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-80" style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: danger ? '#FECACA' : ACCENT, backgroundColor: danger ? '#FEF2F2' : MINT }}>
      <Text style={{ fontSize: 12.5, fontWeight: '800', color: danger ? RED : ACCENT }}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F3F4F6' }}>
      <Text style={{ width: 92, fontSize: 12, color: MUTED }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{value}</Text>
    </View>
  );
}
