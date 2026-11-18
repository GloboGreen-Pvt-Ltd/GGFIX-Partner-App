import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Banknote, Check, CircleCheck, Copy, Eye, EyeOff, KeyRound, Phone, Smartphone, Truck, UserRound } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { BUY_ORDER_STATUS, getShopBuyOrder, shopBuyOrderAction } from '../../../api/buyOrders';
import { getMyListing } from '../../../api/sellListings';
import { C, Card, ErrorBox, PrimaryButton, SellScreen, StatusPill, Thumb, cleanAmount, listingImage, money } from './kit';

// Status rules mirror FixedPriceOrderService (server) exactly.
const CAN_REJECT = ['PLACED', 'CONFIRMED'];
const CAN_ASSIGN = ['CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'DELIVERY_FAILED'];
const CLOSED = ['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'RETURNED'];
const FLOW = {
  HOME_DELIVERY: ['PLACED', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  VISIT_SHOP: ['PLACED', 'CONFIRMED', 'COMPLETED'],
};
const EXIT = ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED', 'RETURNED'];
const OTP_LEN = 4; // server issues a 4-digit order OTP
const fmt = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '');

// Partner-side wording for the server's real statuses (no invented steps).
const STEP_LABEL = {
  PLACED: 'Order Placed',
  CONFIRMED: 'Order Confirmed',
  ASSIGNED: 'Delivery Person Assigned',
  ACCEPTED: 'Delivery Person on the Way',
  PICKED_UP: 'Picked Up from Shop',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  COMPLETED: 'Handed Over · OTP & Payment Verified',
  DELIVERY_FAILED: 'Delivery Failed',
  RETURNED: 'Returned to Shop',
  REJECTED: 'Order Rejected',
  CANCELLED: 'Order Cancelled',
};

/** Order Status Timeline from the order's real events: done (time + note), current, pending. */
export function OrderTimeline({ order: o }) {
  const s = o.status;
  const closed = CLOSED.includes(s);
  const events = o.events || [];
  const ev = (st) => [...events].reverse().find((e) => e.status === st);
  const flow = FLOW[o.fulfilmentType] || FLOW.VISIT_SHOP;
  const reached = flow.reduce((n, st, i) => (ev(st) || st === s ? i : n), -1);
  const exits = events.filter((e) => EXIT.includes(e.status));
  const ended = ['REJECTED', 'CANCELLED', 'RETURNED'].includes(s);
  return (
    <View>
      {flow.map((st, i) => {
        const current = i === reached + 1 && !closed;
        const state = i <= reached ? 'done' : current ? 'current' : 'pending';
        if (ended && state !== 'done') return null;
        const e = ev(st);
        const last = i === flow.length - 1;
        return (
          <View key={st} style={{ flexDirection: 'row' }}>
            <View style={{ alignItems: 'center', width: 18 }}>
              <View style={{ height: 18, width: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: state === 'done' ? C.green : '#FFFFFF', borderWidth: 2, borderColor: state === 'pending' ? C.border : C.green }}>
                {state === 'done' ? <Check size={10} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              {!last ? <View style={{ flex: 1, width: 2, minHeight: 12, backgroundColor: state === 'done' ? C.green : C.border }} /> : null}
            </View>
            <View style={{ flex: 1, marginLeft: 8, paddingBottom: 10 }}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: state === 'pending' ? '600' : '800', color: state === 'pending' ? C.muted : C.text }}>{STEP_LABEL[st] || BUY_ORDER_STATUS[st]?.label || st}</Text>
                <Text style={{ fontSize: 11, color: state === 'current' ? C.green : C.muted, fontWeight: state === 'current' ? '800' : '400' }}>{state === 'done' ? fmt(e?.at) : state === 'current' ? 'Current' : 'Pending'}</Text>
              </View>
              {state === 'done' && e?.note ? <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{e.note}</Text> : null}
            </View>
          </View>
        );
      })}
      {exits.map((e, i) => (
        <View key={`x${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 }}>
          <View style={{ height: 18, width: 18, borderRadius: 9, backgroundColor: C.red }} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.red }}>{STEP_LABEL[e.status] || e.status}</Text>
            {e.note ? <Text style={{ fontSize: 11, color: C.muted }}>{e.note}</Text> : null}
          </View>
          <Text style={{ fontSize: 11, color: C.muted }}>{fmt(e.at)}</Text>
        </View>
      ))}
    </View>
  );
}

function Row({ label, value, bold }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 3 }}>
      <Text style={{ width: 96, fontSize: 12, color: C.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 12.5, color: C.text, fontWeight: bold ? '800' : '600', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function Block({ title, children }) {
  return (
    <Card style={{ marginTop: 10, padding: 12 }}>
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.text, marginBottom: 6 }}>{title}</Text>
      {children}
    </Card>
  );
}

// Separate OTP boxes over one hidden numeric input.
function OtpBoxes({ value, onChange }) {
  const ref = useRef(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Customer OTP" style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
      {Array.from({ length: OTP_LEN }, (_, i) => {
        const on = i === value.length;
        return (
          <View key={i} style={{ width: 46, height: 46, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? C.green : C.border, backgroundColor: C.field, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{value[i] || ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, OTP_LEN))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={OTP_LEN}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

// One fixed-price buy order: product, customer, payment, timeline and only the
// actions the server allows in the current status.
export default function SellBuyOrderDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const [o, setO] = useState(null);
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pinVisible, setPinVisible] = useState(false); // Shop Pickup PIN hidden until tapped
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [otp, setOtp] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await getShopBuyOrder(id);
      setO(d);
      // The listing's own cover photo (same as My Listings); order image only as fallback.
      getMyListing(d.productId).then((l) => setImage(listingImage(l))).catch(() => {});
    } catch (e) { setError(e?.message || 'Could not load order'); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (action, body, ok) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    try {
      await shopBuyOrderAction(id, action, body);
      showToast({ type: 'success', title: ok });
      setOtp(''); setAmount('');
      await load();
    } catch (e) {
      showToast({ type: 'error', title: 'Action failed', message: e?.message || 'Please retry' });
    } finally { lock.current = false; setBusy(''); }
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
  const closed = CLOSED.includes(s);
  const meta = BUY_ORDER_STATUS[s] || {};
  const img = image || listingImage({ imageUrl: o.productImage });


  // Handover requirements — each one named when the button is disabled.
  const total = Number(o.totalAmount);
  const missing = [
    !amount ? 'Enter the amount collected' : Number(amount) !== total ? `Amount must be exactly ${money(total)}` : null,
    otp.length !== OTP_LEN ? `Enter the ${OTP_LEN}-digit customer OTP` : null,
    method !== 'CASH' ? 'Only cash can be verified in the shop right now' : null,
  ].filter(Boolean);

  return (
    <SellScreen
      title="Order Details"
      subtitle={o.orderNumber}
      onBack={() => navigation.goBack()}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      {/* Product summary */}
      <Card style={{ marginTop: 10, padding: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Thumb uri={img} size={60} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ fontSize: 14.5, fontWeight: '800', color: C.text }}>{o.productTitle || 'Product'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.teal, marginTop: 2 }}>{money(o.totalAmount)} <Text style={{ fontSize: 11, color: C.green }}>Fixed Price</Text></Text>
          </View>
          <StatusPill status={s} label={meta.label} />
        </View>
      </Card>

      {/* Order & payment */}
      <Block title="Order & Payment">
        <Row label="Customer" value={o.customerName || 'Customer'} bold />
        {o.customerPhone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${o.customerPhone}`).catch(() => {})} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingVertical: 3 }}>
            <Phone size={13} color={C.green} />
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.green, marginLeft: 4 }}>{o.customerPhone}</Text>
          </Pressable>
        ) : null}
        <Row label="Quantity" value={String(o.quantity || 1)} />
        <Row label="Fulfilment" value={home ? 'Home Delivery' : 'Visit Shop & Buy'} />
        {home ? <Row label="Address" value={o.deliveryAddress} /> : null}
        <Row label="Payment" value={o.paymentStatus === 'PAID' ? 'Completed' : 'Pending'} bold />
      </Block>

      {/* Shop Pickup PIN — the assigned employee enters it at pickup (server-checked, this order only). */}
      {home && o.pickupPin && ['ASSIGNED', 'ACCEPTED'].includes(s) ? (
        <Block title="Shop Pickup PIN">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <KeyRound size={18} color={C.teal} />
            <Text style={{ flex: 1, marginLeft: 8, fontSize: 24, fontWeight: '900', letterSpacing: 8, color: C.text }}>{pinVisible ? o.pickupPin : '••••'}</Text>
            <Pressable onPress={() => setPinVisible((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={pinVisible ? 'Hide PIN' : 'Show PIN'} style={{ padding: 6 }}>
              {pinVisible ? <EyeOff size={18} color={C.muted} /> : <Eye size={18} color={C.muted} />}
            </Pressable>
            <Pressable onPress={async () => { try { await Clipboard.setStringAsync(o.pickupPin); showToast({ type: 'success', title: 'PIN copied' }); } catch (_) {} }}
              hitSlop={8} accessibilityRole="button" accessibilityLabel="Copy PIN" style={{ padding: 6 }}>
              <Copy size={18} color={C.teal} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Give this PIN only to the assigned employee at pickup. It changes if you reassign.</Text>
        </Block>
      ) : home && ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(s) ? (
        <Block title="Shop Pickup">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <CircleCheck size={16} color={C.green} />
            <Text style={{ marginLeft: 6, fontSize: 12.5, fontWeight: '800', color: C.green }}>Pickup Confirmed</Text>
          </View>
        </Block>
      ) : null}

      {/* Status timeline */}
      <Block title="Order Status Timeline">
        <OrderTimeline order={o} />
      </Block>

      {/* Actions — only what the server accepts in this status */}
      {s === 'PLACED' ? (
        <PrimaryButton title="Confirm Order" variant="green" style={{ marginTop: 12 }} loading={busy === 'confirm'} disabled={!!busy} onPress={() => act('confirm', {}, 'Order confirmed')} />
      ) : null}

      {home && CAN_ASSIGN.includes(s) && route?.params?.fromAssign ? (
        <PrimaryButton title={o.assignedStaffUserId ? 'Reassign Pickup Person' : 'Assign Pickup Person'} icon={Truck} variant={o.assignedStaffUserId ? 'outline' : 'green'}
          style={{ marginTop: 10 }} disabled={!!busy} onPress={() => navigation.navigate('SellBuyAssign', { order: o })} />
      ) : null}

      {!home && s === 'CONFIRMED' ? (
        <Block title="Handover">
          <Text style={{ fontSize: 11.5, color: C.muted }}>Collect {money(total)}, then enter the OTP from the customer’s app.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {[{ k: 'CASH', label: 'Cash', Icon: Banknote, ok: true }, { k: 'UPI', label: 'UPI / Card', Icon: Smartphone, ok: false }].map((m) => {
              const on = method === m.k;
              return (
                <Pressable key={m.k} onPress={() => m.ok && setMethod(m.k)} disabled={!m.ok} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !m.ok }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? C.green : C.border, backgroundColor: on ? C.greenBg : '#FFFFFF', opacity: m.ok ? 1 : 0.5 }}>
                  <m.Icon size={16} color={on ? C.green : C.muted} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.text }}>{m.label}</Text>
                    {!m.ok ? <Text style={{ fontSize: 9.5, color: C.muted }}>No verification yet</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, marginTop: 10 }}>Amount collected</Text>
          <TextInput value={amount} onChangeText={(t) => setAmount(cleanAmount(t))} keyboardType="number-pad" placeholder={String(total)} placeholderTextColor={C.faint}
            style={{ height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, marginTop: 4, fontSize: 14, fontWeight: '700', color: C.text }} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, marginTop: 10 }}>Customer OTP</Text>
          <OtpBoxes value={otp} onChange={setOtp} />
          <TextInput value={note} onChangeText={setNote} placeholder="Receipt / note (optional)" placeholderTextColor={C.faint} maxLength={100}
            style={{ height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, marginTop: 10, fontSize: 12.5, color: C.text }} />
          {missing.length ? missing.map((m) => <Text key={m} style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>• {m}</Text>) : null}
          <PrimaryButton title="Verify & Hand Over" icon={CircleCheck} variant="green" style={{ marginTop: 10 }} loading={busy === 'handover'}
            disabled={!!busy || missing.length > 0}
            onPress={() => act('handover', { amountCollected: amount, otp, paymentRef: `CASH${note.trim() ? ` · ${note.trim()}` : ''}`.slice(0, 120) }, 'Handed over · Completed')} />
        </Block>
      ) : null}

      {s === 'DELIVERY_FAILED' ? (
        <PrimaryButton title="Return Received" variant="outline" style={{ marginTop: 10 }} loading={busy === 'return-received'} disabled={!!busy}
          onPress={() => act('return-received', {}, 'Product restocked')} />
      ) : null}

      {CAN_REJECT.includes(s) ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reject reason (optional)" placeholderTextColor={C.faint}
            style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, fontSize: 12.5, color: C.text }} />
          <PrimaryButton title="Reject" variant="danger" small loading={busy === 'reject'} disabled={!!busy} onPress={reject} />
        </View>
      ) : null}

      {closed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
          {['DELIVERED', 'COMPLETED'].includes(s) ? <CircleCheck size={16} color={C.green} /> : <UserRound size={16} color={C.muted} />}
          <Text style={{ marginLeft: 6, fontSize: 12.5, fontWeight: '800', color: ['DELIVERED', 'COMPLETED'].includes(s) ? C.green : C.muted }}>{meta.label || s}</Text>
        </View>
      ) : null}
      <View style={{ height: 24 }} />
    </SellScreen>
  );
}
