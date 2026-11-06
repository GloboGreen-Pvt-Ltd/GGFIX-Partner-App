import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import {
  BUY_ORDER_STATUS, getShopBuyOrder, listAssignableStaff, shopBuyOrderAction,
} from '../../../api/buyOrders';
import {
  C, Card, ChoiceCard, ErrorBox, InfoRow, PrimaryButton, Section, SellScreen, StatusPill, TextField, Thumb, cleanAmount, money,
} from './kit';

const REASSIGNABLE = ['CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'DELIVERY_FAILED'];
const fmt = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// One fixed-price buy order: product, customer, timeline and only the actions
// the server allows in the current status.
export default function SellBuyOrderDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [staff, setStaff] = useState(null);
  const [staffErr, setStaffErr] = useState('');
  const [chosen, setChosen] = useState(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [otp, setOtp] = useState('');
  const [payRef, setPayRef] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await getShopBuyOrder(id);
      setO(d);
      setChosen(d.assignedStaffUserId || null);
      if (d.fulfilmentType === 'HOME_DELIVERY' && REASSIGNABLE.includes(d.status)) {
        listAssignableStaff().then((s) => { setStaff(s); setStaffErr(''); })
          .catch((e) => setStaffErr(e?.message || 'Could not load employees'));
      }
    } catch (e) { setError(e?.message || 'Could not load order'); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (action, body, ok) => {
    setBusy(action);
    try {
      setO({ ...o, ...(await shopBuyOrderAction(id, action, body)) });
      showToast({ type: 'success', title: ok });
      await load();
    } catch (e) {
      showToast({ type: 'error', title: 'Action failed', message: e?.message || 'Please retry' });
    } finally { setBusy(''); }
  };

  const reject = async () => {
    if (!(await confirm({ title: 'Reject order?', message: 'The customer is informed and the stock is released.', confirmText: 'Reject', destructive: true }))) return;
    act('reject', { reason: reason.trim() || undefined }, 'Order rejected');
  };

  if (!o) {
    return (
      <SellScreen title="Order Details" onBack={() => navigation.goBack()}>
        {error ? <ErrorBox message={error} onRetry={load} style={{ marginTop: 16 }} /> : <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}
      </SellScreen>
    );
  }

  const s = o.status;
  const home = o.fulfilmentType === 'HOME_DELIVERY';
  const meta = BUY_ORDER_STATUS[s] || {};
  const assignedName = staff?.find((e) => e.userId === o.assignedStaffUserId)?.name;

  return (
    <SellScreen
      title="Order Details"
      subtitle={o.orderNumber}
      onBack={() => navigation.goBack()}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Thumb uri={o.productImage} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{o.productTitle || 'Product'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.teal, marginTop: 4 }}>{money(o.totalAmount)} <Text style={{ fontSize: 11, color: C.green }}>(Fixed Price)</Text></Text>
            <View style={{ marginTop: 6, alignSelf: 'flex-start' }}><StatusPill status={s} label={meta.label} /></View>
          </View>
        </View>
      </Card>

      <Section title="Order">
        <InfoRow label="Quantity" value={String(o.quantity || 1)} />
        <InfoRow label="Unit price" value={money(o.unitPrice)} />
        <InfoRow label="Fulfilment" value={home ? 'Home delivery' : 'Visit shop & buy'} />
        <InfoRow label="Payment" value={`${o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Pay at shop'} · ${o.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}`} />
        {home ? <InfoRow label="Address" value={o.deliveryAddress || '—'} /> : null}
        {o.customerPhone ? <InfoRow label="Customer" value={o.customerPhone} /> : null}
        {o.assignedStaffUserId ? <InfoRow label="Employee" value={assignedName || 'Assigned'} /> : null}
      </Section>

      <Section title="Status timeline">
        {(o.events || []).map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: i === o.events.length - 1 ? C.teal : C.green }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{BUY_ORDER_STATUS[e.status]?.label || e.status}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>{fmt(e.at)}{e.note ? ` · ${e.note}` : ''}</Text>
            </View>
          </View>
        ))}
      </Section>

      {s === 'PLACED' ? (
        <Section title="New order">
          <PrimaryButton title="Confirm Order" loading={busy === 'confirm'} disabled={!!busy} onPress={() => act('confirm', {}, 'Order confirmed')} />
        </Section>
      ) : null}

      {home && REASSIGNABLE.includes(s) ? (
        <Section title={o.assignedStaffUserId ? 'Reassign pickup person' : 'Assign pickup person'}>
          {staffErr ? <ErrorBox message={staffErr} onRetry={load} /> : null}
          {!staff && !staffErr ? <ActivityIndicator color={C.teal} /> : null}
          {staff && staff.length === 0 ? <Text style={{ color: C.muted, fontSize: 13 }}>No active employees with a login. Add one under Employees.</Text> : null}
          {(staff || []).map((e) => (
            <ChoiceCard key={e.userId} radio title={e.name} sub={e.phone} selected={chosen === e.userId} onPress={() => setChosen(e.userId)} style={{ marginBottom: 8 }} />
          ))}
          <PrimaryButton
            title={o.assignedStaffUserId ? 'Reassign' : 'Assign'}
            loading={busy === 'assign'}
            disabled={!!busy || !chosen || (chosen === o.assignedStaffUserId && s === 'ASSIGNED')}
            onPress={() => act('assign', { staffUserId: chosen }, 'Employee assigned')}
          />
        </Section>
      ) : null}

      {!home && s === 'CONFIRMED' ? (
        <Section title="In-store payment & handover" sub="Collect the full amount and enter the customer's order OTP.">
          <TextField label="Amount collected" required prefix="₹" keyboardType="number-pad" value={amount}
            placeholder={String(o.totalAmount)} onChangeText={(t) => setAmount(cleanAmount(t))} />
          <TextField label="Customer OTP" required keyboardType="number-pad" maxLength={4} value={otp} onChangeText={setOtp} />
          <TextField label="Payment reference" hint="Cash / UPI txn id" value={payRef} onChangeText={setPayRef} />
          <PrimaryButton title="Verify & Hand Over" style={{ marginTop: 12 }} loading={busy === 'handover'}
            disabled={!!busy || !amount || otp.length !== 4}
            onPress={() => act('handover', { amountCollected: amount, otp, paymentRef: payRef.trim() || undefined }, 'Sale completed')} />
        </Section>
      ) : null}

      {s === 'DELIVERY_FAILED' ? (
        <Section title="Delivery failed" sub="When the employee brings the product back, mark it received to restock it.">
          <PrimaryButton title="Return Received" variant="outline" loading={busy === 'return-received'} disabled={!!busy}
            onPress={() => act('return-received', {}, 'Product restocked')} />
        </Section>
      ) : null}

      {s === 'PLACED' || s === 'CONFIRMED' ? (
        <Section title="Reject">
          <TextField label="Reason (optional)" value={reason} onChangeText={setReason} />
          <PrimaryButton title="Reject Order" variant="danger" style={{ marginTop: 12 }} loading={busy === 'reject'} disabled={!!busy} onPress={reject} />
        </Section>
      ) : null}
      <View style={{ height: 32 }} />
    </SellScreen>
  );
}
