import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CircleCheck, Circle, UserRound } from 'lucide-react-native';
import { listAssignableStaff, listShopBuyOrders, shopBuyOrderAction } from '../../../api/buyOrders';
import { showToast } from '../../../components/Toast';
import { C, Card, EmptyBox, ErrorBox, PrimaryButton, SellScreen, Thumb } from './kit';

// Assign Pickup — pick the shop employee who collects the product from the shop
// and delivers it (POST /shop/buy-orders/{id}/assign; the server re-checks the
// employee belongs to this shop). Also used to reassign.
// Pickup time choices: today / tomorrow, 30-minute steps 08:00–21:00, future only.
const DAY_MS = 86400000;
function slotsFor(dayOffset) {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const out = [];
  for (let m = 8 * 60; m <= 21 * 60; m += 30) {
    const t = new Date(base.getTime() + dayOffset * DAY_MS + m * 60000);
    if (t.getTime() > Date.now() + 15 * 60000) out.push(t);
  }
  return out;
}
const hhmm = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export default function SellBuyAssignScreen({ navigation, route }) {
  const o = route?.params?.order || {};
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState(o.assignedStaffUserId || null);
  const [busy, setBusy] = useState(false);
  const prevAt = o.pickupScheduledAt ? new Date(o.pickupScheduledAt) : null;
  const [day, setDay] = useState(0);
  const [at, setAt] = useState(prevAt && prevAt.getTime() > Date.now() ? prevAt : null); // scheduled pickup (employee gets a T-10 reminder)
  const [activeBy, setActiveBy] = useState({});
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try { setStaff(await listAssignableStaff()); }
    catch (e) { setError(e?.message || 'Could not load employees'); }
    try {
      const list = await listShopBuyOrders();
      const m = {};
      (Array.isArray(list) ? list : []).forEach((x) => {
        if (x?.assignedStaffUserId && ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(x.status)) m[x.assignedStaffUserId] = (m[x.assignedStaffUserId] || 0) + 1;
      });
      setActiveBy(m);
    } catch { /* availability is best-effort */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const assign = async () => {
    if (!chosen || !at || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await shopBuyOrderAction(o.id, 'assign', { staffUserId: chosen, pickupAt: at.toISOString() });
      const name = staff?.find((e) => e.userId === chosen)?.name || 'Employee';
      showToast({ type: 'success', title: 'Pickup assigned', message: `${name} will collect and deliver.` });
      if (route?.params?.returnToList) navigation.goBack();
      else navigation.replace('SellBuyOrderDetail', { id: o.id });
    } catch (e) {
      showToast({ type: 'error', title: 'Could not assign', message: e?.message });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <SellScreen
      title="Assign Pickup"
      onBack={() => navigation.goBack()}
      footer={<PrimaryButton variant="green" title="Assign" loading={busy} disabled={!chosen || !at || busy || (chosen === o.assignedStaffUserId && o.status === 'ASSIGNED' && prevAt && at.getTime() === prevAt.getTime())} onPress={assign} />}
    >
      <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>Order ID: <Text style={{ fontWeight: '800', color: C.text }}>{o.orderNumber}</Text></Text>
      <Card style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Thumb uri={o.productImage} size={44} />
          <Text numberOfLines={2} style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '800', color: C.text }}>{o.productTitle || 'Product'}</Text>
        </View>
      </Card>

      <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 6 }}>Pickup Time</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['Today', 'Tomorrow'].map((l, i) => (
          <Pressable key={l} onPress={() => setDay(i)} accessibilityRole="tab" accessibilityState={{ selected: day === i }}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: day === i ? C.teal : C.border, backgroundColor: day === i ? C.teal : '#FFFFFF' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: day === i ? '#FFFFFF' : C.text }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
        {slotsFor(day).map((t) => {
          const on = at && at.getTime() === t.getTime();
          return (
            <Pressable key={t.getTime()} onPress={() => setAt(t)} accessibilityRole="radio" accessibilityState={{ selected: !!on }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: on ? 1.5 : 1, borderColor: on ? C.green : C.border, backgroundColor: on ? C.greenBg : '#FFFFFF' }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? C.green : C.text }}>{hhmm(t)}</Text>
            </Pressable>
          );
        })}
        {!slotsFor(day).length ? <Text style={{ fontSize: 12, color: C.muted }}>No times left today — choose Tomorrow.</Text> : null}
      </ScrollView>
      {at ? <Text style={{ fontSize: 11.5, color: C.muted }}>Pickup {at.toDateString() === new Date().toDateString() ? 'today' : 'on ' + at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {hhmm(at)}. The employee is reminded 10 minutes before.</Text> : null}

      <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 6 }}>Assign Pickup Person</Text>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!staff && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} /> : null}
      {staff && !staff.length ? <EmptyBox icon={UserRound} title="No employees with a login" sub="Add an employee under Employees first." /> : null}
      {(staff || []).map((e) => {
        const on = chosen === e.userId;
        const n = activeBy[e.userId] || 0;
        return (
          <Pressable key={e.userId} onPress={() => setChosen(e.userId)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? C.green : C.border, backgroundColor: on ? C.greenBg : '#FFFFFF', marginBottom: 8 }}>
            {on ? <CircleCheck size={20} color={C.green} /> : <Circle size={20} color={C.faint} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>{e.name}</Text>
              <Text style={{ fontSize: 11.5, color: C.green }}>{e.userId === o.assignedStaffUserId ? 'Currently assigned' : 'Shop employee'}</Text>
              <Text style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', color: n ? C.amber : C.green, backgroundColor: n ? C.amberBg : C.greenBg }}>{n ? `Busy · ${n} active` : 'Available'}</Text>
            </View>
            {e.phone ? <Text style={{ fontSize: 11.5, color: C.muted }}>{e.phone}</Text> : null}
          </Pressable>
        );
      })}
    </SellScreen>
  );
}
