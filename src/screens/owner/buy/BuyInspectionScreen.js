import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { launchCamera } from '../../../components/InAppCamera';
import { Camera, Check, ImagePlus, Plus, X } from 'lucide-react-native';
import { uploadMedia } from '../../../api/masterData';
import { savePurchaseInspection } from '../../../api/orders';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, PrimaryButton, Section } from '../sell/kit';
import PurchaseFormSheet from './PurchaseFormSheet';
import { DeviceRow, PurchasePage, goToStep, usePurchase, useStep } from './purchaseKit';

// Page 4 — Device Inspection, once the device is received: a checklist the
// owner fills row by row (condition, display, battery health, IMEI + model,
// accessories, damage / issues) and 2–8 photos
// (POST /sell-orders/shop-purchases/{id}/inspection; the server re-checks).
// Saving again before the price is decided replaces the inspection.

export const INSPECTION_CHECKS = [
  ['display', 'Display'], ['touch', 'Touch'], ['cameras', 'Cameras'], ['speakerMic', 'Speaker & Mic'],
  ['charging', 'Charging'], ['buttons', 'Buttons'], ['connectivity', 'Wi-Fi / Bluetooth / SIM'], ['biometrics', 'Face / Fingerprint'],
];
const CONDITIONS = ['Like New', 'Excellent', 'Good', 'Fair', 'Poor'].map((c) => ({ value: c, label: c }));
const ACCESSORIES = ['Charger', 'Cable', 'Box', 'Bill / Invoice', 'Earphones', 'Case'].map((a) => ({ value: a, label: a }));
const STATUSES = ['DEVICE_RECEIVED', 'INSPECTED'];
const MAX_PHOTOS = 8;

const luhn = (s) => [...s].reverse().reduce((sum, ch, i) => {
  let d = Number(ch);
  if (i % 2) { d *= 2; if (d > 9) d -= 9; }
  return sum + d;
}, 0) % 10 === 0;

function fromInspection(ins) {
  if (!ins) return {};
  return {
    condition: ins.condition || null,
    display: typeof ins.checks?.display === 'boolean' ? ins.checks.display : null,
    battery: ins.batteryHealth ? String(ins.batteryHealth) : '',
    batteryDone: true,
    imei: ins.imei || '',
    serial: ins.serial || '',
    modelOk: ins.modelVerified ?? null,
    accessories: ins.accessories || [],
    accessoriesDone: true,
    notes: ins.notes || '',
    notesDone: true,
  };
}

function Row({ done, label, value, action, onPress, last }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ checked: done }} className="active:opacity-70"
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}>
      <View style={{ height: 22, width: 22, borderRadius: 5, borderWidth: 2, borderColor: done ? C.teal : '#C9CED6', backgroundColor: done ? C.teal : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        {done ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: rf(13), color: C.text, marginLeft: 12 }}>
        {label}{value ? <Text style={{ color: done ? C.text : C.muted }}>{` (${value})`}</Text> : null}
      </Text>
      {action ? (
        <View style={{ borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: done ? C.mint : '#FFFFFF' }}>
          <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: C.teal }}>{action}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function BuyInspectionScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const [busy, run] = useStep();
  const [v, setV] = useState(() => fromInspection(route?.params?.order?.inspection));
  const [seeded, setSeeded] = useState(!!route?.params?.order);
  const [photos, setPhotos] = useState(() => (route?.params?.order?.inspection?.photos || []).map((url) => ({ key: url, url, status: 'done' })));
  const [sheet, setSheet] = useState(null);
  const [adding, setAdding] = useState(false);

  // Loaded without route data (Manage Pickup): fill from a saved inspection once.
  if (o && !seeded) {
    setSeeded(true);
    if (o.inspection) {
      setV(fromInspection(o.inspection));
      setPhotos((o.inspection.photos || []).map((url) => ({ key: url, url, status: 'done' })));
    }
  }
  const set = (patch) => setV((cur) => ({ ...cur, ...patch }));

  const upload = async (asset) => {
    const key = `${Date.now()}-${Math.random()}`;
    setPhotos((cur) => [...cur, { key, uri: asset.uri, status: 'uploading' }]);
    try {
      const url = await uploadMedia(asset, 'sell');
      if (!url) throw new Error('No URL returned');
      setPhotos((cur) => cur.map((x) => (x.key === key ? { ...x, url, status: 'done' } : x)));
    } catch (e) {
      setPhotos((cur) => cur.map((x) => (x.key === key ? { ...x, status: 'error' } : x)));
      showToast({ type: 'error', title: 'Photo upload failed', message: e?.message });
    }
  };
  const pick = async (source) => {
    setAdding(false);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { showToast({ type: 'info', title: `Up to ${MAX_PHOTOS} photos` }); return; }
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') { showToast({ type: 'warning', title: 'Permission needed', message: `Allow ${source === 'camera' ? 'camera' : 'photo'} access to add device photos.` }); return; }
      const res = source === 'camera'
        ? await launchCamera({ mediaTypes: 'images', quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, selectionLimit: room, quality: 0.7 });
      if (!res.canceled) (res.assets || []).slice(0, room).forEach(upload);
    } catch (e) {
      showToast({ type: 'error', title: 'Could not open the camera or gallery', message: e?.message });
    }
  };

  const idValue = v.imei || v.serial;
  const rows = [
    { key: 'condition', label: 'Physical Condition', value: v.condition || 'tap to choose', done: !!v.condition },
    { key: 'display', label: 'Display', value: v.display == null ? 'tap to check' : v.display ? 'No Damage' : 'Damaged', done: v.display != null },
    { key: 'battery', label: 'Battery Health', value: v.batteryDone ? (v.battery ? `${v.battery}%` : 'Not shown') : null, done: !!v.batteryDone },
    { key: 'imei', label: 'IMEI Verification', value: idValue ? `${idValue}${v.modelOk === false ? ', model differs' : ''}` : null, done: !!idValue && v.modelOk != null, action: idValue ? 'Verified' : 'Verify' },
    { key: 'accessories', label: 'Accessories', value: v.accessoriesDone ? (v.accessories.join(', ') || 'None') : 'Charger, Box, etc.', done: !!v.accessoriesDone },
    { key: 'notes', label: 'Damage / Issues', value: v.notesDone ? (v.notes.trim() ? v.notes.trim().slice(0, 40) : 'None') : 'if any', done: !!v.notesDone },
  ];

  const SHEETS = {
    condition: { title: 'Physical Condition', fields: [{ key: 'condition', label: 'Condition', type: 'choice', options: CONDITIONS, columns: 3, initial: v.condition || 'Good' }], apply: (x) => set({ condition: x.condition }) },
    display: { title: 'Display', fields: [{ key: 'display', label: 'Screen', type: 'choice', options: [{ value: true, label: 'No Damage' }, { value: false, label: 'Damaged' }], initial: v.display ?? true }], apply: (x) => set({ display: x.display }) },
    battery: {
      title: 'Battery Health', sub: 'Settings → Battery. Leave blank if the device doesn’t show it.',
      fields: [{ key: 'battery', label: 'Battery health %', type: 'text', digits: true, maxLength: 3, placeholder: 'e.g. 92', initial: v.battery }],
      apply: (x) => {
        const n = x.battery ? Number(x.battery) : null;
        if (n != null && (n < 1 || n > 100)) throw new Error('Battery health must be 1–100%');
        set({ battery: n ? String(n) : '', batteryDone: true });
      },
    },
    imei: {
      title: 'IMEI Verification', sub: 'Dial *#06# on the device. Devices without IMEI: use the serial number.',
      fields: [
        { key: 'kind', label: 'Identifier', type: 'choice', options: [{ value: 'IMEI', label: 'IMEI' }, { value: 'SERIAL', label: 'Serial number' }], initial: v.serial && !v.imei ? 'SERIAL' : 'IMEI' },
        { key: 'id', label: 'IMEI / Serial', type: 'text', required: true, maxLength: 30, autoCapitalize: 'characters', placeholder: '15-digit IMEI or serial', initial: idValue || o?.imei || '' },
        { key: 'model', label: `Model matches “${o?.productName || 'the quote'}”?`, type: 'choice', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], initial: v.modelOk ?? true },
      ],
      apply: (x) => {
        const id = String(x.id || '').trim().toUpperCase();
        if (x.kind === 'IMEI' && !(/^\d{15}$/.test(id) && luhn(id))) throw new Error('Enter a valid 15-digit IMEI');
        if (x.kind === 'SERIAL' && id.length < 5) throw new Error('Enter the serial number');
        set({ imei: x.kind === 'IMEI' ? id : '', serial: x.kind === 'SERIAL' ? id : '', modelOk: x.model });
      },
    },
    accessories: { title: 'Accessories', sub: 'Select what came with the device (none is fine).', fields: [{ key: 'acc', label: 'Included', type: 'multi', options: ACCESSORIES, columns: 3, initial: v.accessories || [] }], apply: (x) => set({ accessories: x.acc || [], accessoriesDone: true }) },
    notes: { title: 'Damage / Issues', sub: 'Scratches, dents, faults — leave blank if none.', fields: [{ key: 'notes', label: 'Details', type: 'multiline', maxLength: 1000, placeholder: 'e.g. Back glass scratch, Face ID not working', initial: v.notes }], apply: (x) => set({ notes: x.notes || '', notesDone: true }) },
  };
  const cur = sheet ? SHEETS[sheet] : null;

  const save = () => run('save', async () => {
    const missing = rows.find((r) => !r.done);
    if (missing) throw new Error(`Complete “${missing.label}”.`);
    if (v.modelOk === false && !v.notes.trim()) throw new Error('Describe the model mismatch under Damage / Issues.');
    if (photos.some((x) => x.status === 'uploading')) throw new Error('Wait for the photos to finish uploading.');
    const done = photos.filter((x) => x.status === 'done').map((x) => x.url);
    if (done.length < 2) throw new Error('Add at least 2 device photos.');
    const d = await savePurchaseInspection(o.id, {
      imei: v.imei || null,
      serial: v.imei ? null : v.serial || null,
      modelVerified: v.modelOk,
      condition: v.condition,
      checks: { display: v.display },
      batteryHealth: v.battery ? Number(v.battery) : null,
      accessories: v.accessories || [],
      photos: done,
      notes: v.notes.trim() || null,
    });
    showToast({ type: 'success', title: 'Inspection saved', message: 'Confirm or revise the final price next.' });
    goToStep(navigation, d, route?.params?.leadRef);
  });

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Device Inspection" statuses={STATUSES}
      footer={<PrimaryButton title="Save & Continue" loading={busy === 'save'} onPress={save} />}>
      {o ? (
        <>
          <View style={{ marginTop: 6 }}><DeviceRow o={o} size={60} /></View>

          <Section title="Inspection Checklist">
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
              {rows.map(({ key, ...r }, i) => <Row key={key} {...r} onPress={() => setSheet(key)} last={i === rows.length - 1} />)}
            </View>
          </Section>

          <Section title="Device Photos" sub={`${photos.filter((x) => x.status === 'done').length} of 2–${MAX_PHOTOS}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((x) => (
                <View key={x.key} style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: C.field, borderWidth: 1, borderColor: x.status === 'error' ? C.red : C.border }}>
                  <Image source={{ uri: x.url || x.uri }} style={{ width: '100%', height: '100%' }} />
                  {x.status === 'uploading' ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)' }}><ActivityIndicator color={C.teal} /></View> : null}
                  <Pressable onPress={() => setPhotos((all) => all.filter((y) => y.key !== x.key))} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6} style={{ position: 'absolute', top: 3, right: 3, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(17,17,17,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <Pressable onPress={() => setAdding((a) => !a)} accessibilityRole="button" accessibilityLabel="Add photo" className="active:opacity-70"
                  style={{ width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.mintLine, alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={24} color={C.teal} />
                </Pressable>
              ) : null}
            </View>
            {adding ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <PrimaryButton title="Camera" icon={Camera} variant="outline" small style={{ flex: 1 }} onPress={() => pick('camera')} />
                <PrimaryButton title="Gallery" icon={ImagePlus} variant="outline" small style={{ flex: 1 }} onPress={() => pick('gallery')} />
              </View>
            ) : null}
          </Section>

          <PurchaseFormSheet
            visible={!!cur}
            title={cur?.title}
            sub={cur?.sub}
            fields={cur?.fields}
            submitLabel="Save"
            onClose={() => setSheet(null)}
            onSubmit={async (x) => { cur.apply(x); setSheet(null); }}
          />
        </>
      ) : null}
    </PurchasePage>
  );
}
