import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { ResponsiveModal } from '../../../components/responsive';
import PrinterConnectSheet from './PrinterConnectSheet';

// "Print QR Label" popup for one booking — every QR / barcode button opens this
// (replaces the old QR E-Print screen). Pass `ticket` when already loaded, else
// `ticketId` and it is fetched.

function formatSecurity(type, value) {
  const t = String(type || 'NONE').toUpperCase();
  if (t === 'NONE' || !t) return 'None';
  const label = t === 'PIN' ? 'PIN' : t === 'PASSWORD' ? 'Password' : t === 'PATTERN' ? 'Pattern' : t.charAt(0) + t.slice(1).toLowerCase();
  let v = value == null ? '' : String(value).trim();
  if (t === 'PATTERN') v = v.split(',').map((d) => d.trim()).filter(Boolean).join(',');
  return v ? `${label}: ${v}` : label;
}

function fmtCreatedOn(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date: `${wd}, ${d.getDate()} ${mo} ${d.getFullYear()}`, time };
}

export function labelFromTicket(t, fallbackId) {
  const deviceName = t?.deviceDisplayName || t?.deviceModelName || t?.modelName || 'Device';
  return {
    trackingId: t?.trackingId || fallbackId || 'NO-ID',
    // Label only has room for "Brand Model" — drop the " · " extras.
    brandModel: String(deviceName).split(' · ')[0].trim() || deviceName,
    customerName: t?.customerName || '—',
    deviceSecurity: formatSecurity(t?.deviceSecurityType, t?.deviceSecurityValue),
    createdOn: fmtCreatedOn(t?.createdAt),
  };
}

export default function QrLabelSheet({ visible, onClose, ticket, ticketId }) {
  const [loaded, setLoaded] = useState(null);
  const id = ticket?.id || ticketId;
  useEffect(() => {
    if (!visible || ticket || !id) return undefined;
    let alive = true;
    ticketApi.get(`/tickets/${id}`).then((t) => { if (alive) setLoaded(t); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, ticket, id]);
  const t = ticket || (loaded?.id === id ? loaded : null);
  return <PrinterConnectSheet visible={!!visible && !!t} onClose={onClose} label={labelFromTicket(t, id)} initialCopies={1} />;
}

const QR_ACCENT = '#035C6C';

/**
 * Multi-booking QR Print: pick devices (all checked by default), then one
 * tap prints every selected label in order through PrinterConnectSheet.
 * items: [{ id, name, trackingId, ticket? }] — each its own ticket/QR.
 */
export function MultiQrPrintSheet({ visible, onClose, items = [] }) {
  const [sel, setSel] = useState({});
  const [labels, setLabels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [handoff, setHandoff] = useState(false);
  useEffect(() => {
    if (visible) { setHandoff(false); setSel(Object.fromEntries(items.map((x) => [x.id, true]))); setLabels(null); setErr(null); setBusy(false); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = items.filter((x) => sel[x.id]);
  const allOn = items.length > 0 && picked.length === items.length;
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(items.map((x) => [x.id, true])));
  const go = async () => {
    if (busy || !picked.length) return;
    setBusy(true); setErr(null);
    try {
      // Fresh ticket per device so every label carries that device's own ID.
      const ts = await Promise.all(picked.map((x) => ticketApi.get(`/tickets/${x.id}`).catch(() => x.ticket || null)));
      if (ts.some((t) => !t)) throw new Error('Could not load every ticket. Try again.');
      const ls = ts.map((t, i) => labelFromTicket(t, picked[i].trackingId));
      if (new Set(ls.map((l) => l.trackingId)).size !== ls.length) throw new Error('Duplicate tracking IDs — not printing.');
      // Close the picker first; a 2nd modal opened in the same frame is dropped on Android.
      setHandoff(true);
      setTimeout(() => setLabels(ls), 350);
    } catch (e) { setErr(e?.message || 'Could not prepare labels.'); } finally { setBusy(false); }
  };
  const close = () => { setLabels(null); setHandoff(false); onClose?.(); };
  if (labels) {
    return <PrinterConnectSheet visible={!!visible} onClose={close} labels={labels.length > 1 ? labels : undefined} label={labels[0]} initialCopies={1} />;
  }
  const Box = ({ on }) => (
    <View style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1.5, borderColor: QR_ACCENT, backgroundColor: on ? QR_ACCENT : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Check size={13} color="#FFFFFF" /> : null}
    </View>
  );
  return (
    <ResponsiveModal visible={!!visible && !handoff} onClose={close}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111' }}>Print QR Labels</Text>
      <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2, marginBottom: 10 }}>{`${picked.length} of ${items.length} selected · each device has its own tracking ID`}</Text>
      <Pressable onPress={toggleAll} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <Box on={allOn} />
        <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: '800', color: '#111111' }}>Select All</Text>
      </Pressable>
      <ScrollView style={{ maxHeight: 320 }}>
        {items.map((x) => (
          <Pressable key={x.id} onPress={() => setSel((s) => ({ ...s, [x.id]: !s[x.id] }))}
            style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6, backgroundColor: '#FFFFFF' }}>
            <Box on={!!sel[x.id]} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{x.name || 'Device'}</Text>
              {x.trackingId ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>#{x.trackingId}</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {err ? <Text style={{ fontSize: 12, color: '#B3261E', marginTop: 6 }}>{err}</Text> : null}
      <Pressable onPress={go} disabled={busy || !picked.length}
        style={{ marginTop: 10, height: 46, borderRadius: 12, backgroundColor: QR_ACCENT, opacity: busy || !picked.length ? 0.45 : 1, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>{`Print All Labels (${picked.length})`}</Text>}
      </Pressable>
    </ResponsiveModal>
  );
}
