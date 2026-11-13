import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import SafeModal from '../../../components/SafeModal';
import { useFocusEffect } from '@react-navigation/native';
import { CalendarClock, Check, ChevronDown, ChevronUp, CircleAlert, PackageCheck, Phone, RotateCcw, Truck, UserPlus, X } from 'lucide-react-native';
import {
  assignRepairDelivery, getRepairDelivery, listShopEmployees, receiveRepairReturn, releaseRepairDelivery, rescheduleRepairDelivery, scheduleRepairDelivery,
} from '../../../api/repairDelivery';
import { confirm, notify } from '../../../components/confirm';

// Repair Return Delivery on Service History: eligibility (QC passed, invoice),
// Schedule Delivery, Assign / Reassign, Reschedule, Release Device to the
// employee, Confirm Device Returned, and the live status + history — all
// read from the server (GET /tickets/{id}/repair-delivery), refreshed on focus.

const TEAL = '#035C6C';
const GREEN = '#01AC77';
const MINT = '#E5F3F5';
const LINE = '#E5E7EB';
const MUTED = '#6B7280';
const TEXT = '#111827';
const RED = '#DC2626';
const AMBER = '#B45309';
const DELIVERABLE = ['READY', 'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING'];
const AT_SHOP = ['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'RETURNED'];
const SLOTS = Array.from({ length: 12 }, (_, i) => 9 + i); // 9 AM – 8 PM starts

const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const h12 = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
function slotText(d) {
  if (!d?.scheduledDate) return '—';
  const [y, m, day] = d.scheduledDate.split('-').map(Number);
  const s = Number(String(d.slotStart || '').slice(0, 2));
  const e = Number(String(d.slotEnd || '').slice(0, 2));
  return `${day} ${MONTHS[m - 1]} ${y}, ${h12(s)} – ${h12(e)}`;
}
const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

function Btn({ title, Icon, onPress, outline, busy, disabled }) {
  return (
    <Pressable onPress={busy || disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={title}
      style={{ flex: 1, minHeight: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: outline ? '#FFFFFF' : TEAL, borderWidth: 1, borderColor: TEAL, opacity: disabled ? 0.5 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={outline ? TEAL : '#FFFFFF'} /> : Icon ? <Icon size={15} color={outline ? TEAL : '#FFFFFF'} /> : null}
      <Text style={{ fontSize: 12.5, fontWeight: '800', color: outline ? TEAL : '#FFFFFF', marginLeft: 6 }}>{title}</Text>
    </Pressable>
  );
}

/** Schedule / Reschedule / Assign sheet: date, time slot, employee. */
function ScheduleSheet({ visible, mode, initial, onClose, onSubmit }) {
  const [date, setDate] = useState(null);
  const [hour, setHour] = useState(null);
  const [tech, setTech] = useState(null);
  const [staff, setStaff] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const needDate = mode !== 'assign';
  const needTech = mode !== 'reschedule';

  const open = useCallback(async () => {
    setError(null);
    // No free slot left today (last one starts at 8 PM) → start on tomorrow.
    const t = new Date();
    if (t.getHours() > SLOTS[SLOTS.length - 1]) t.setDate(t.getDate() + 1);
    setDate(initial?.scheduledDate || ymd(t));
    setHour(initial?.slotStart ? Number(String(initial.slotStart).slice(0, 2)) : null);
    setTech(initial?.employee?.id || null);
    if (needTech) {
      try {
        const list = await listShopEmployees();
        setStaff((Array.isArray(list) ? list : list?.content || []).filter((e) => e.userId));
      } catch (e) {
        setStaff([]);
        setError(e?.message || 'Could not load employees.');
      }
    }
  }, [initial, needTech]);
  // Reset only when the sheet OPENS: the card re-polls every 20 s and hands a
  // new `initial` object each time, which used to wipe the picked slot/employee.
  const openRef = React.useRef(open);
  openRef.current = open;
  React.useEffect(() => { if (visible) openRef.current(); }, [visible]);

  // Today is dropped once its last slot has started.
  const days = Array.from({ length: 11 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; })
    .filter((d, i) => i > 0 || d.getHours() <= SLOTS[SLOTS.length - 1]).slice(0, 10);
  const now = new Date();
  // Only slots that are still ahead (today drops the hours already started).
  const freeSlots = SLOTS.filter((h) => !(date === ymd(now) && h < now.getHours())); // the current hour stays bookable
  // Always have a slot picked: the first free one, unless the user chose another.
  React.useEffect(() => {
    if (visible && needDate && date && (hour == null || !freeSlots.includes(hour)) && freeSlots.length) setHour(freeSlots[0]);
  }, [visible, needDate, date, hour, freeSlots.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (needDate && (!date || hour == null)) { setError('Pick the delivery date and time slot.'); return; }
    if (needTech && !tech) { setError('Choose the delivery employee.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ date, slotStart: hour != null ? hh(hour) : null, slotEnd: hour != null ? hh(hour + 1) : null, technicianId: tech });
    } catch (e) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%', paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: TEXT }}>{mode === 'assign' ? 'Assign Employee' : mode === 'reschedule' ? 'Reschedule Delivery' : 'Schedule Delivery'}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><X size={20} color={TEXT} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {needDate ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: '800', color: TEXT }}>Delivery Date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
                  {days.map((d) => {
                    const v = ymd(d);
                    const on = date === v;
                    return (
                      <Pressable key={v} onPress={() => { setDate(v); setHour(null); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                        style={{ width: 58, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? TEAL : LINE, backgroundColor: on ? TEAL : '#FFFFFF' }}>
                        <Text style={{ fontSize: 11, color: on ? '#FFFFFF' : MUTED }}>{DAYS[d.getDay()]}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: on ? '#FFFFFF' : TEXT }}>{d.getDate()}</Text>
                        <Text style={{ fontSize: 10.5, color: on ? '#FFFFFF' : MUTED }}>{MONTHS[d.getMonth()]}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={{ fontSize: 13, fontWeight: '800', color: TEXT, marginTop: 4 }}>Time Slot</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {freeSlots.map((h) => {
                    const past = false;
                    const on = hour === h;
                    return (
                      <Pressable key={h} disabled={past} onPress={() => setHour(h)} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: past }}
                        style={{ width: '31%', paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? TEAL : LINE, backgroundColor: on ? TEAL : past ? '#F3F4F6' : '#FFFFFF', opacity: past ? 0.5 : 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#FFFFFF' : TEXT }}>{`${h12(h)} – ${h12(h + 1)}`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            {needTech ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: '800', color: TEXT, marginTop: needDate ? 16 : 0 }}>Delivery Employee</Text>
                {staff == null ? <ActivityIndicator color={TEAL} style={{ marginVertical: 16 }} /> : !staff.length ? (
                  <Text style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>No employees with an Employee App login yet.</Text>
                ) : staff.map((e) => {
                  const on = tech === e.id;
                  const off = e.isAvailable === false;
                  return (
                    <Pressable key={e.id} disabled={off} onPress={() => setTech(e.id)} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: off }}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: on ? TEAL : LINE, backgroundColor: on ? MINT : '#FFFFFF', marginTop: 8, opacity: off ? 0.5 : 1 }}>
                      <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? TEAL : '#C9CED6', backgroundColor: on ? TEAL : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '700', color: TEXT }}>{e.name}</Text>
                        <Text style={{ fontSize: 11.5, color: MUTED }}>{[e.roleLabel, off ? 'Inactive' : null].filter(Boolean).join(' · ') || 'Employee'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            ) : null}
          </ScrollView>
          {/* Shown right above the button so a missing slot / server error is never off-screen. */}
          {error ? <Text style={{ fontSize: 12.5, color: RED, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 }}>{error}</Text> : null}
          <View style={{ paddingHorizontal: 16, flexDirection: 'row' }}>
            <Btn title={mode === 'assign' ? 'Assign' : mode === 'reschedule' ? 'Save New Time' : 'Schedule Delivery'} Icon={mode === 'assign' ? UserPlus : CalendarClock} busy={busy} onPress={submit} />
          </View>
        </View>
      </View>
    </SafeModal>
  );
}

export default function RepairDeliveryCard({ ticketId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null); // schedule | reschedule | assign
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      setData(await getRepairDelivery(ticketId));
      setError(null);
    } catch (e) {
      setError(e?.message || 'Could not load the delivery.');
    }
  }, [ticketId]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]));

  if (!data && !error) return null;
  const el = data?.eligibility || {};
  const d = data?.delivery || null;
  // Doorstep bookings only (server: eligibility.doorstep); shop pickups never see it.
  if (!d && (el.doorstep === false || !(el.canSchedule || el.returnPath || DELIVERABLE.includes(el.ticketStatus)))) return null;

  const run = async (key, fn, done) => {
    if (busy) return;
    setBusy(key);
    try {
      setData(await fn());
      if (done) notify(done, '', { type: 'success' });
    } catch (e) {
      notify('Could not update', e?.message || 'Please try again.', { type: 'error' });
      load();
    } finally {
      setBusy(null);
    }
  };
  const submitSheet = async (v) => {
    const fn = sheet === 'assign' ? () => assignRepairDelivery(ticketId, v.technicianId)
      : sheet === 'reschedule' ? () => rescheduleRepairDelivery(ticketId, { date: v.date, slotStart: v.slotStart, slotEnd: v.slotEnd })
        : () => scheduleRepairDelivery(ticketId, v);
    setData(await fn());
    setSheet(null);
    notify(sheet === 'assign' ? 'Employee assigned' : sheet === 'reschedule' ? 'Delivery rescheduled' : 'Delivery scheduled', 'The employee sees it in the Employee App.', { type: 'success' });
  };

  const st = d?.status;
  const atShop = !d || AT_SHOP.includes(st);
  const tone = st === 'DELIVERED' ? GREEN : ['FAILED', 'RETURNING', 'UNASSIGNED'].includes(st) ? AMBER : TEAL;
  const events = data?.events || [];

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 14, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}><Truck size={18} color={TEAL} /></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: TEXT }}>Return Delivery</Text>
          <Text style={{ fontSize: 11.5, color: MUTED }}>{d ? `Attempt ${d.attempt}${d.returnPath ? ' · Return to Customer' : ''}` : el.returnPath ? 'Return the device to the customer (not repaired)' : 'Deliver the repaired device to the customer'}</Text>
        </View>
        {d ? (
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tone === GREEN ? '#E7F7F0' : tone === AMBER ? '#FEF3C7' : MINT }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: tone }}>{d.statusLabel}</Text>
          </View>
        ) : null}
      </View>

      {error ? <Text style={{ fontSize: 12, color: RED, marginTop: 10 }}>{error}</Text> : null}

      {!d ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {(el.returnPath ? [['Return to Customer', true], ['Invoice optional', true]] : [['QC Passed', el.qcPassed], ['Invoice', !!el.invoice], ['Repair Ready', DELIVERABLE.includes(el.ticketStatus)]]).map(([t, ok]) => (
              <View key={t} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: ok ? '#E7F7F0' : '#FEF2F2' }}>
                {ok ? <Check size={13} color={GREEN} strokeWidth={3} /> : <X size={13} color={RED} strokeWidth={3} />}
                <Text style={{ fontSize: 11, fontWeight: '700', color: ok ? GREEN : RED, marginLeft: 4 }}>{t}</Text>
              </View>
            ))}
          </View>
          {(el.reasons || []).length ? (
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <CircleAlert size={14} color={AMBER} />
              <Text style={{ flex: 1, fontSize: 12, color: AMBER, marginLeft: 6 }}>{el.reasons[0]}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Btn title="Schedule Delivery" Icon={CalendarClock} disabled={!el.canSchedule} onPress={() => setSheet('schedule')} />
          </View>
        </>
      ) : (
        <>
          <View style={{ marginTop: 12, gap: 6 }}>
            <Row label="Schedule" value={slotText(d)} />
            <Row label="Employee" value={d.employee ? d.employee.name : 'Not assigned'} />
            {d.address ? <Row label="Address" value={d.address} /> : null}
            <Row label="Amount to collect" value={money(d.amountDue)} />
            {d.collectedAt ? <Row label="Collected from shop" value={when(d.collectedAt)} /> : null}
            {d.deliveredAt ? <Row label="Delivered" value={`${when(d.deliveredAt)}${d.amountCollected > 0 ? ` · ${money(d.amountCollected)} ${d.paymentMethod || ''}` : ''}`} /> : null}
            {d.deliveredAt && d.paymentRef ? <Row label="Payment ref" value={d.paymentRef} /> : null}
            {d.deliveredAt && (d.proofPhotos || []).length ? <Row label="Proof" value={`${d.proofPhotos.length} photo${d.proofPhotos.length > 1 ? 's' : ''}`} /> : null}
            {d.failReason ? <Row label="Last attempt" value={`Failed — ${d.failReason}`} warn /> : null}
            {d.declinedReason && st === 'UNASSIGNED' ? <Row label="Declined" value={d.declinedReason} warn /> : null}
          </View>

          {st !== 'DELIVERED' ? (
            <View style={{ gap: 8, marginTop: 12 }}>
              {st === 'ACCEPTED' && !d.releasedAt ? (
                <View style={{ flexDirection: 'row' }}>
                  <Btn title="Release Device to Employee" Icon={PackageCheck} busy={busy === 'release'}
                    onPress={async () => { if (await confirm({ title: 'Release the device?', message: `Hand the repaired device to ${d.employee?.name}. They verify the IMEI / serial and photos next.`, confirmText: 'Release' })) run('release', () => releaseRepairDelivery(ticketId), 'Device released'); }} />
                </View>
              ) : null}
              {['FAILED', 'RETURNING'].includes(st) ? (
                <View style={{ flexDirection: 'row' }}>
                  <Btn title="Confirm Device Received Back" Icon={RotateCcw} busy={busy === 'return'}
                    onPress={async () => { if (await confirm({ title: 'Device back at the shop?', message: 'Confirm you have the device again. Then reschedule the delivery.', confirmText: 'Received' })) run('return', () => receiveRepairReturn(ticketId), 'Device received back'); }} />
                </View>
              ) : null}
              {atShop ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn title={st === 'UNASSIGNED' ? 'Assign Employee' : 'Reassign'} Icon={UserPlus} outline={st !== 'UNASSIGNED'} onPress={() => setSheet('assign')} />
                  <Btn title={st === 'RETURNED' ? 'Schedule Retry' : 'Reschedule'} Icon={CalendarClock} outline onPress={() => setSheet(st === 'RETURNED' ? 'schedule' : 'reschedule')} />
                </View>
              ) : null}
              {d.employee?.phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${d.employee.phone}`).catch(() => {})} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 }}>
                  <Phone size={14} color={TEAL} />
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: TEAL, marginLeft: 6 }}>{`Call ${d.employee.name}`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : el.canSchedule ? (
            // Delivered earlier, then re-serviced: the same record takes a new attempt.
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Btn title="Schedule Delivery" Icon={CalendarClock} onPress={() => setSheet('schedule')} />
            </View>
          ) : null}

          <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel="Track delivery history" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: TEAL }}>{`Track Delivery (${events.length})`}</Text>
            {open ? <ChevronUp size={16} color={TEAL} /> : <ChevronDown size={16} color={TEAL} />}
          </Pressable>
          {open ? events.slice().reverse().map((e, i) => (
            <View key={`${e.at}-${i}`} style={{ flexDirection: 'row', marginTop: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === 0 ? TEAL : '#C9CED6', marginTop: 5 }} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: TEXT }}>{e.label}</Text>
                <Text style={{ fontSize: 11.5, color: MUTED }}>{[e.note, when(e.at)].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
          )) : null}
        </>
      )}

      <ScheduleSheet visible={!!sheet} mode={sheet} initial={d} onClose={() => setSheet(null)} onSubmit={submitSheet} />
    </View>
  );
}

function Row({ label, value, warn }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ width: 128, fontSize: 12, color: MUTED }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: warn ? AMBER : TEXT }}>{value}</Text>
    </View>
  );
}
