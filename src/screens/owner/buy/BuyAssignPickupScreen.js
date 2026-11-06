import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CalendarDays, Check, Clock3, Lock, MapPin, PackageCheck, Store, Truck, UserPlus } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { assignPurchasePickup, listShopPurchases, receivePurchaseDevice, scheduleShopPurchase, setPurchaseFulfilment } from '../../../api/orders';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, Section } from '../sell/kit';
import ScheduleSheet from './ScheduleSheet';
import { clock } from './buyKit';
import { Initials, PurchasePage, goToStep, up, usePurchase, useStep } from './purchaseKit';

// Page 2 — Assign Pickup: Pickup / Shop Visit (saved on the server), the shop's
// pickup staff (GET ticket /technicians, same pickup role as the employee
// picker), and the customer's pickup date/time. "Assign & Send Pickup" saves
// the time if changed, then assigns; the employee accepts in the Employee App.

const PICKUP_ROLE = 'pickup person';
const ON_JOB = ['PICKUP_ASSIGNED', 'OUT_FOR_PICKUP', 'PICKED_UP'];
const STATUSES = ['SELL_CONFIRMED', 'PICKUP_SCHEDULED', 'PICKUP_ASSIGNED', 'OUT_FOR_PICKUP'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : 'Pick a date';
};

function ModeButton({ Icon, label, on, busy, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} className="active:opacity-80"
      style={{ flex: 1, height: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.teal : '#F1F3F5' }}>
      {busy ? <ActivityIndicator size="small" color={on ? '#FFFFFF' : C.teal} /> : <Icon size={18} color={on ? '#FFFFFF' : C.text} />}
      <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: on ? '#FFFFFF' : C.text, marginLeft: 8 }}>{label}</Text>
    </Pressable>
  );
}

function WhenBox({ Icon, text, onPress, label, locked }) {
  return (
    <Pressable onPress={onPress} disabled={locked} accessibilityRole="button" accessibilityState={{ disabled: !!locked }} accessibilityLabel={label} className="active:opacity-80"
      style={{ flex: 1, height: 50, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.field, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
      <Icon size={18} color={C.text} />
      <Text style={{ flex: 1, fontSize: rf(13.5), fontWeight: '800', color: C.text, marginLeft: 10 }}>{text}</Text>
      {locked ? <Lock size={14} color={C.muted} /> : null}
    </Pressable>
  );
}

export default function BuyAssignPickupScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const [busy, run] = useStep();
  const [staff, setStaff] = useState(null);
  const [staffError, setStaffError] = useState(null);
  const [onJob, setOnJob] = useState([]);
  const [pick, setPick] = useState(null);
  const [slot, setSlot] = useState(null);
  const [sheet, setSheet] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      const [list, orders] = await Promise.all([ticketApi.get('/technicians'), listShopPurchases().catch(() => [])]);
      setStaff((Array.isArray(list) ? list : []).filter((e) => String(e.roleLabel || '').toLowerCase() === PICKUP_ROLE));
      setOnJob((orders || []).filter((r) => ON_JOB.includes(up(r.status)) && r.id !== p.id).map((r) => r.pickupPersonId).filter(Boolean));
      setStaffError(null);
    } catch (e) {
      setStaff([]);
      setStaffError(e);
    }
  }, [p.id]);
  useFocusEffect(useCallback(() => { loadStaff(); }, [loadStaff]));

  const visit = o?.fulfilment === 'SHOP_VISIT';
  const chosen = pick || o?.pickup?.personId || null;
  // No date yet → default to today (the schedule sheet opens on today too).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const date = slot?.pickupDate || o?.pickupDate || today;
  const start = slot?.slotStart || o?.pickupSlotStart || null;
  const acts = o?.allowedActions || [];
  // A pickup slot the customer already confirmed stays as is: assigning / reassigning never moves it.
  const fixed = !visit && !!(o?.pickupDate && o?.pickupSlotStart);

  const setMode = (next) => {
    if (!o || (next === 'SHOP_VISIT') === visit) return;
    run(`mode-${next}`, async () => {
      const d = await setPurchaseFulfilment(o.id, next);
      p.setO(d);
      showToast({ type: 'success', title: next === 'SHOP_VISIT' ? 'Shop visit selected' : 'Pickup selected', message: 'The customer has been notified.' });
    });
  };

  const assign = () => run('assign', async () => {
    if (!chosen) throw new Error('Choose an employee for the pickup.');
    if (!date || !start) throw new Error('Pick the pickup date and time.');
    if ((!slot || fixed) && chosen === o.pickup?.personId) throw new Error('This employee already has the pickup. Choose another one to reassign.');
    let d = o;
    if (slot && !fixed) d = await scheduleShopPurchase(o.id, slot);
    if (chosen !== o.pickup?.personId) d = await assignPurchasePickup(o.id, chosen);
    const name = staff?.find((e) => e.id === chosen)?.name || d.pickup?.personName || 'the employee';
    showToast({ type: 'success', title: 'Pickup sent', message: `${name} gets it in the Employee App.` });
    goToStep(navigation, d, leadRef);
  });

  const saveVisit = () => run('visit', async () => {
    if (!slot) return;
    p.setO(await scheduleShopPurchase(o.id, slot));
    setSlot(null);
    showToast({ type: 'success', title: 'Visit time saved', message: 'The customer has been notified.' });
  });

  const received = () => run('receive', async () => {
    const d = await receivePurchaseDevice(o.id);
    showToast({ type: 'success', title: 'Device received', message: 'Inspect the device next.' });
    goToStep(navigation, d, leadRef);
  });

  const footer = !o ? null : visit ? (
    <View style={{ gap: 10 }}>
      {slot ? <PrimaryButton title="Save Visit Time" icon={CalendarDays} variant="outline" loading={busy === 'visit'} onPress={saveVisit} /> : null}
      <PrimaryButton title="Device Received at Shop" icon={PackageCheck} loading={busy === 'receive'} disabled={!acts.includes('RECEIVE')} onPress={received} />
    </View>
  ) : (
    <PrimaryButton title={o.pickup?.personId ? 'Reassign & Send Pickup' : 'Assign & Send Pickup'} loading={busy === 'assign'} disabled={!acts.includes('ASSIGN')} onPress={assign} />
  );

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Assign Pickup" statuses={STATUSES} footer={footer}>
      {o ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <ModeButton Icon={Truck} label="Pickup" on={!visit} busy={busy === 'mode-PICKUP'} onPress={() => setMode('PICKUP')} />
            <ModeButton Icon={Store} label="Shop Visit" on={visit} busy={busy === 'mode-SHOP_VISIT'} onPress={() => setMode('SHOP_VISIT')} />
          </View>

          {o.pickup?.issue ? <ErrorBox message={o.pickup.issue} style={{ marginTop: 12 }} /> : null}

          {visit ? (
            <Section title="Shop Visit">
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.mint, borderRadius: 14, padding: 14 }}>
                <Store size={22} color={C.teal} />
                <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 10 }}>
                  {`${o.customer?.name || 'The customer'} will bring the device to your shop. Mark it received when it arrives, then inspect it.`}
                </Text>
              </View>
            </Section>
          ) : (
            <Section title="Assign Employee">
              {staff == null ? <ActivityIndicator color={C.teal} style={{ marginVertical: 20 }} />
                : staffError ? <ErrorBox message={staffError.message || 'Could not load your staff.'} onRetry={loadStaff} />
                  : !staff.length ? (
                    <View style={{ alignItems: 'center', backgroundColor: C.field, borderRadius: 14, padding: 16 }}>
                      <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>No pickup persons yet</Text>
                      <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4, textAlign: 'center' }}>Add an employee with the Pickup Person role to send pickups.</Text>
                      <PrimaryButton title="Add Employee" icon={UserPlus} variant="outline" small style={{ marginTop: 12 }} onPress={() => navigation.navigate('OwnerEmployeeAdd')} />
                    </View>
                  ) : (
                    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                      {staff.map((e, i) => {
                        const noLogin = !e.userId; // the Employee App could never receive it
                        const inactive = e.isAvailable === false || noLogin;
                        const busyJob = onJob.includes(e.id);
                        const on = chosen === e.id;
                        const pill = noLogin ? { t: 'No app login', bg: '#F1F2F4', fg: C.muted } : inactive ? { t: 'Inactive', bg: '#F1F2F4', fg: C.muted } : busyJob ? { t: 'On Job', bg: C.amberBg, fg: C.amber } : { t: 'Available', bg: C.greenBg, fg: C.green };
                        return (
                          <Pressable key={e.id} onPress={() => setPick(e.id)} disabled={inactive} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: inactive }} accessibilityLabel={e.name || 'Employee'}
                            className="active:opacity-80"
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: on ? '#F4FBF8' : '#FFFFFF', borderTopWidth: i ? 1 : 0, borderTopColor: C.border, opacity: inactive ? 0.55 : 1 }}>
                            <View style={{ height: 22, width: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.teal : '#C9CED6', backgroundColor: on ? C.teal : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                              {on ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                            </View>
                            <View style={{ marginLeft: 12 }}>
                              {e.photoUrl ? <Image source={{ uri: e.photoUrl }} style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: C.field }} /> : <Initials name={e.name} />}
                            </View>
                            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                              <Text numberOfLines={1} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{e.name || '—'}</Text>
                              <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{e.roleLabel || 'Pickup Person'}</Text>
                            </View>
                            <View style={{ backgroundColor: pill.bg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }}>
                              <Text style={{ fontSize: rf(11), fontWeight: '800', color: pill.fg }}>{pill.t}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
            </Section>
          )}

          <Section title={visit ? 'Visit Schedule' : 'Pickup Schedule'} sub={fixed ? 'Confirmed by the customer — stays the same when you assign or reassign' : o.pickupDate && !slot ? 'As confirmed with the customer' : slot ? 'Changed — the customer is notified' : null}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <WhenBox Icon={CalendarDays} text={dateLabel(date)} label="Pickup date" locked={fixed} onPress={() => setSheet(true)} />
              <WhenBox Icon={Clock3} text={start ? clock(start) : 'Pick a time'} label="Pickup time" locked={fixed} onPress={() => setSheet(true)} />
            </View>
            {!visit && o.address?.line ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.field, borderRadius: 12, padding: 12, marginTop: 10 }}>
                <MapPin size={17} color={C.teal} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: rf(11.5), color: C.muted }}>{['Pickup Address', o.customer?.name].filter(Boolean).join(' · ')}</Text>
                  <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, marginTop: 2 }}>{o.address.line}</Text>
                </View>
              </View>
            ) : null}
          </Section>

          <ScheduleSheet
            visible={sheet}
            title={visit ? 'Shop visit time' : 'Pickup time'}
            initialDate={date}
            initialStart={start}
            onClose={() => setSheet(false)}
            onSubmit={(v) => { setSlot(v); setSheet(false); }}
          />
        </>
      ) : null}
    </PurchasePage>
  );
}
