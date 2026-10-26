import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../../../theme/responsive';
import { Eye, Pencil, X } from 'lucide-react-native';
import { bookingSnapshot, draftDevicesFor, subscribeBooking } from './bookingDraft';

// GGFIX palette (same hexes as the booking screens).
const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';

// Screens that take input — the eye button shows on these only.
export const PREVIEW_SCREENS = new Set([
  'CustomerDetails', 'DeviceDetails', 'DeviceColorStorage', 'DeviceServices',
  'ServicePriceEstimate', 'DeviceInformation', 'ServiceBookingDevicesList',
]);

const LOCK_LABEL = { NONE: 'No lock', PIN: 'PIN', PASSWORD: 'Password', PATTERN: 'Pattern', ACCOUNT: 'Account' };
const join = (...p) => p.filter((x) => x && String(x).trim()).join(' · ');
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const photoCount = (p) => {
  if (!p || typeof p !== 'object') return 0;
  return Object.entries(p).filter(([k, v]) => k !== 'video' && v).length + (Array.isArray(p.photos) ? p.photos.length : 0);
};

// Everything entered so far, read from the live draft.
function buildPreview() {
  const { routes, index } = bookingSnapshot();
  const upto = routes.slice(0, index + 1);
  const customerRoute = upto.find((r) => r.name === 'CustomerDetails');
  const init = customerRoute?.params?.initial || {};
  const later = upto.find((r) => r.params?.customer)?.params?.customer || {};
  const customer = {
    name: init.name || later.name,
    phone: init.phone || later.phone || later.mobile,
    email: init.email || later.email,
    address: join(init.addressLine || init.address, init.area, init.district, init.pincode),
  };

  // The device being entered = the screens after the last Devices List.
  const lastList = upto.map((r) => r.name).lastIndexOf('ServiceBookingDevicesList');
  const onList = lastList === upto.length - 1;
  const segment = onList ? [] : upto.slice(lastList + 1);
  const m = Object.assign({}, ...segment.map((r) => r.params || {}));
  const listParams = lastList >= 0 ? upto[lastList].params || {} : {};
  const customerId = (upto[upto.length - 1]?.params || {}).customerId;
  const added = onList
    ? (draftDevicesFor(customerId).length ? draftDevicesFor(customerId) : [])
    : (m.existingDevices || []);

  const services = Array.isArray(m.services) && m.services.length
    ? m.services
    : (m.prefillServices || []);
  const lock = m.draftLock || m.lock || m.prefillLock;
  const missing = m.missingParts || m.prefillMissingParts || [];
  const flagged = missing.filter((p) => p.missing || p.damage);

  const current = segment.length && (m.modelName || m.brandName || m.categoryName) ? {
    title: join(m.brandName, m.modelName) || m.categoryName,
    rows: [
      ['Category', m.categoryName],
      ['Model No.', m.modelNumber],
      ['Colour', m.color],
      ['RAM / Storage', [m.ramLabel, m.storageLabel].filter(Boolean).join(' / ')],
      ['Services', services.map((s) => s.serviceName ? `${s.serviceName}${Number(s.price) ? ` ${rupees(s.price)}` : ''}` : null).filter(Boolean).join(', ')
        || (services.length ? `${services.length} selected` : '')],
      ['IMEI', m.imei || m.prefillImei],
      ['Serial No.', m.serialNumber || m.prefillSerialNumber],
      ['Accessories', m.accessories || m.prefillAccessories],
      ['Complaint', m.complaint || m.prefillComplaint],
      ['Voice note', (m.issueAudioUrl || m.prefillIssueAudioUrl) ? 'Recorded' : ''],
      ['Photos', photoCount(m.devicePhotos || m.prefillDevicePhotos) ? `${photoCount(m.devicePhotos || m.prefillDevicePhotos)} added` : ''],
      ['Device lock', lock?.type && lock.type !== 'NONE' ? LOCK_LABEL[lock.type] || lock.type : ''],
      ['Missing / damaged', flagged.map((p) => `${p.partName || p.partId}${p.damage ? ' (damaged)' : ''}${p.missing ? ' (missing)' : ''}`).join(', ')],
    ].filter(([, v]) => v && String(v).trim()),
  } : null;

  const payType = listParams.prefillPaymentType;
  const payment = payType ? join(payType === 'FULL' ? 'Full payment' : payType === 'ADVANCE' ? 'Advance' : payType,
    listParams.prefillPaymentAmount ? rupees(listParams.prefillPaymentAmount) : '') : '';

  // Edit targets: the latest copy of each screen, before the current one.
  const editable = (name) => upto.slice(0, -1).some((r) => r.name === name) ? name : null;
  return { customer, added, current, payment, editable, currentName: upto[upto.length - 1]?.name };
}

function Section({ title, onEdit, children }) {
  return (
    <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: ACCENT }}>{title}</Text>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: MINT }}>
            <Pencil size={11} color={ACCENT} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT, marginLeft: 4 }}>Edit</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value }) {
  if (!value || !String(value).trim()) return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 3 }}>
      <Text style={{ width: 112, fontSize: 12, color: MUTED }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: INK }}>{value}</Text>
    </View>
  );
}

/**
 * Eye button + Preview sheet for the booking flow. Rendered once per screen
 * by the navigator's screenLayout, floating, so no screen layout changes.
 * Reads the live draft (updates while open); Edit pops back to the screen
 * that holds the value — the screens in between keep their entries.
 */
export default function BookingPreviewButton({ navigation }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => (open ? subscribeBooking(() => setTick((t) => t + 1)) : undefined), [open]);
  // Rebuilt on every render while open — each draft change bumps `tick`.
  const p = open ? buildPreview() : null;

  const goEdit = (name) => {
    setOpen(false);
    if (name && name !== p?.currentName) setTimeout(() => navigation.dispatch(StackActions.popTo(name)), 250);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Preview booking details"
        hitSlop={6}
        style={{
          position: 'absolute', right: 14, bottom: insets.bottom + 92,
          width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
        }}
      >
        <Eye size={20} color="#FFFFFF" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setOpen(false)} />
        <View style={{ maxHeight: '82%', width: '100%', maxWidth: r.maxWidth('list'), alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <Eye size={18} color={ACCENT} />
            <Text style={{ flex: 1, marginLeft: 8, fontSize: 16, fontWeight: '800', color: INK }}>Booking Preview</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close preview">
              <X size={20} color={INK} />
            </Pressable>
          </View>
          {p ? (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Section title="CUSTOMER" onEdit={p.editable('CustomerDetails') ? () => goEdit('CustomerDetails') : null}>
                <Row label="Name" value={p.customer.name} />
                <Row label="Mobile" value={p.customer.phone} />
                <Row label="Email" value={p.customer.email} />
                <Row label="Address" value={p.customer.address} />
                {!p.customer.name && !p.customer.phone ? <Text style={{ fontSize: 12, color: MUTED }}>Not entered yet</Text> : null}
              </Section>

              {p.added.map((d, i) => (
                <Section key={i} title={`DEVICE ${i + 1}`}>
                  <Row label="Model" value={join(d.brandName, d.modelName)} />
                  <Row label="Colour" value={d.color} />
                  <Row label="Services" value={(d.services || []).map((s) => s.serviceName).filter(Boolean).join(', ')} />
                  <Row label="IMEI" value={d.imei} />
                  <Row label="Complaint" value={d.complaint} />
                </Section>
              ))}

              {p.current ? (
                <Section
                  title={`DEVICE ${p.added.length + 1} (IN PROGRESS) · ${p.current.title}`}
                  onEdit={p.editable('DeviceDetails') ? () => goEdit('DeviceDetails') : null}
                >
                  {p.current.rows.map(([l, v]) => <Row key={l} label={l} value={v} />)}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 6 }}>
                    {[['DeviceServices', 'Services'], ['ServicePriceEstimate', 'Issue, photos & parts'], ['DeviceInformation', 'Prices & lock']]
                      .filter(([n]) => p.editable(n))
                      .map(([n, l]) => (
                        <Pressable key={n} onPress={() => goEdit(n)} accessibilityRole="button"
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: ACCENT }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT }}>Edit {l}</Text>
                        </Pressable>
                      ))}
                  </View>
                </Section>
              ) : null}

              {p.payment ? (
                <Section title="PAYMENT"><Row label="Collected" value={p.payment} /></Section>
              ) : null}

              <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 4 }}>
                Saved automatically — this booking stays until it is submitted or discarded.
              </Text>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </>
  );
}
