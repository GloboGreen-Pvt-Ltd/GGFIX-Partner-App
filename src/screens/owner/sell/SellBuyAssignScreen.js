import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CircleCheck, Circle, UserRound } from 'lucide-react-native';
import { listAssignableStaff, shopBuyOrderAction } from '../../../api/buyOrders';
import { showToast } from '../../../components/Toast';
import { C, Card, EmptyBox, ErrorBox, PrimaryButton, SellScreen, Thumb } from './kit';

// Assign Pickup — pick the shop employee who collects the product from the shop
// and delivers it (POST /shop/buy-orders/{id}/assign; the server re-checks the
// employee belongs to this shop). Also used to reassign.
export default function SellBuyAssignScreen({ navigation, route }) {
  const o = route?.params?.order || {};
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState(o.assignedStaffUserId || null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try { setStaff(await listAssignableStaff()); }
    catch (e) { setError(e?.message || 'Could not load employees'); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const assign = async () => {
    if (!chosen || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await shopBuyOrderAction(o.id, 'assign', { staffUserId: chosen });
      const name = staff?.find((e) => e.userId === chosen)?.name || 'Employee';
      showToast({ type: 'success', title: 'Pickup assigned', message: `${name} will collect and deliver.` });
      navigation.replace('SellBuyOrderDetail', { id: o.id });
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
      footer={<PrimaryButton variant="green" title="Assign" loading={busy} disabled={!chosen || busy || (chosen === o.assignedStaffUserId && o.status === 'ASSIGNED')} onPress={assign} />}
    >
      <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>Order ID: <Text style={{ fontWeight: '800', color: C.text }}>{o.orderNumber}</Text></Text>
      <Card style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Thumb uri={o.productImage} size={44} />
          <Text numberOfLines={2} style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '800', color: C.text }}>{o.productTitle || 'Product'}</Text>
        </View>
      </Card>

      <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 6 }}>Assign Pickup Person</Text>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!staff && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} /> : null}
      {staff && !staff.length ? <EmptyBox icon={UserRound} title="No employees with a login" sub="Add an employee under Employees first." /> : null}
      {(staff || []).map((e) => {
        const on = chosen === e.userId;
        return (
          <Pressable key={e.userId} onPress={() => setChosen(e.userId)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? C.green : C.border, backgroundColor: on ? C.greenBg : '#FFFFFF', marginBottom: 8 }}>
            {on ? <CircleCheck size={20} color={C.green} /> : <Circle size={20} color={C.faint} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>{e.name}</Text>
              <Text style={{ fontSize: 11.5, color: C.green }}>{e.userId === o.assignedStaffUserId ? 'Currently assigned' : 'Shop employee'}</Text>
            </View>
            {e.phone ? <Text style={{ fontSize: 11.5, color: C.muted }}>{e.phone}</Text> : null}
          </Pressable>
        );
      })}
    </SellScreen>
  );
}
