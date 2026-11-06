import React, { useCallback, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Banknote, CircleAlert, CircleCheck, Clock, Landmark, Lock, PackageCheck, Wallet } from 'lucide-react-native';
import { completeShopPurchase, recordPurchasePayout } from '../../../api/orders';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, PrimaryButton, TextField, money } from '../sell/kit';
import { PurchasePage, goToStep, up, usePurchase, useStep, whenLabel } from './purchaseKit';

// Page 6 — Payment Confirmation: the owner pays the final price (UPI, bank
// transfer or cash) and records it; the purchase becomes PAID only when the
// customer confirms receipt in their app (this page re-reads every 20 s). Then
// "Complete Purchase".
// Pickup: the employee pays at the doorstep (UPI / cash + proof photo) once
// the final price is settled; here it is read-only — locked until the owner's
// approval and the customer's acceptance, then the recorded payment and the
// customer's verification. Nothing is marked paid from this page.

const STATUSES = ['PRICE_CONFIRMED', 'PAYMENT_PENDING', 'PAID'];
const DOOR_STATUSES = ['OUT_FOR_PICKUP', 'PICKED_UP'];
const applies = (x) => STATUSES.includes(up(x?.status)) || DOOR_STATUSES.includes(up(x?.status));
const VERIFY = {
  PAID: { t: 'Verified by customer', fg: C.green, bg: C.greenBg },
  AWAITING_CONFIRMATION: { t: 'Awaiting customer confirmation', fg: C.amber, bg: C.amberBg },
  PENDING: { t: 'Not paid yet', fg: C.muted, bg: '#F1F2F4' },
};
const POLL_MS = 20000;
const METHODS = [
  { value: 'UPI', label: 'UPI', sub: '(GPay / PhonePe / Paytm)' },
  { value: 'BANK', label: 'Bank Transfer', Icon: Landmark },
  { value: 'CASH', label: 'Cash', Icon: Banknote },
];
const METHOD_LABEL = { UPI: 'UPI', BANK: 'Bank transfer', CASH: 'Cash' };

export default function BuyPaymentScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const [busy, run] = useStep();
  const [method, setMethod] = useState('UPI');
  const [ref, setRef] = useState('');
  const status = up(o?.status);
  const door = DOOR_STATUSES.includes(status);
  const waiting = status === 'PAYMENT_PENDING';
  const { load } = p;
  useFocusEffect(useCallback(() => {
    if (!waiting && !door) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [waiting, door, load]));

  const pay = o?.payment || {};
  const amount = pay.amount ?? o?.amount;
  const rv = up(o?.revision?.status);
  // Doorstep payment unlocks once the owner approved the price (SHOP_CONFIRMED) or the customer accepted a revised one (APPROVED).
  const priceOpen = !['SHOP_CONFIRMED', 'APPROVED'].includes(rv);
  const who = o?.pickup?.personName || 'The employee';
  const verify = VERIFY[pay.status] || VERIFY.PENDING;
  const cash = method === 'CASH';

  const record = () => run('pay', async () => {
    const r = ref.trim();
    if (!cash && !/^[A-Za-z0-9]{6,30}$/.test(r)) throw new Error('Enter the transaction reference (UTR, 6–30 letters/digits).');
    if (cash && r && !/^[A-Za-z0-9]{6,30}$/.test(r)) throw new Error('The reference must be 6–30 letters/digits.');
    const ok = await confirm({ title: `Record ${money(amount)} paid?`, message: 'The customer is asked to confirm they received it.', confirmText: 'Record Payment' });
    if (!ok) return;
    p.setO(await recordPurchasePayout(o.id, { method, account: null, reference: r || null }));
    setRef('');
    showToast({ type: 'success', title: 'Payment recorded', message: 'Waiting for the customer to confirm.' });
  });

  const complete = () => run('complete', async () => {
    const ok = await confirm({ title: 'Complete this purchase?', message: 'The device is with you and the customer confirmed the payment.', confirmText: 'Complete' });
    if (!ok) return;
    const d = await completeShopPurchase(o.id);
    goToStep(navigation, d, leadRef);
  });

  const footer = !o ? null : status === 'PICKED_UP' ? (
    <PrimaryButton title="Verify Shop Handover" icon={PackageCheck} onPress={() => navigation.navigate('BuyHandover', { id: o.id, order: o, leadRef })} />
  ) : status === 'PAID' ? (
    <PrimaryButton title="Complete Purchase" loading={busy === 'complete'} disabled={!(o.allowedActions || []).includes('COMPLETE')} onPress={complete} />
  ) : status === 'PRICE_CONFIRMED' ? (
    <PrimaryButton title="Confirm Payment" loading={busy === 'pay'} disabled={!(o.allowedActions || []).includes('RECORD_PAYOUT')} onPress={record} />
  ) : null;

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title={door ? 'Payment Tracking' : 'Payment Confirmation'} statuses={applies} footer={footer}>
      {o ? (
        <>
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <Wallet size={44} color={C.green} strokeWidth={1.7} />
            <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text, marginTop: 10 }}>Pay to Customer</Text>
            <Text style={{ fontSize: rf(30), fontWeight: '800', color: C.green, marginTop: 4 }}>{money(amount)}</Text>
            {o.customer?.name ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>{o.customer.name}</Text> : null}
          </View>

          {status === 'PRICE_CONFIRMED' ? (
            <>
              {pay.disputeNote ? (
                <View style={{ flexDirection: 'row', backgroundColor: C.redBg, borderRadius: 12, padding: 12, marginTop: 16 }}>
                  <CircleAlert size={18} color={C.red} />
                  <Text style={{ flex: 1, fontSize: rf(12), color: C.text, marginLeft: 8 }}>{`The customer said the last payment wasn’t received: “${pay.disputeNote}”. Check it, then record the payment again.`}</Text>
                </View>
              ) : null}
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: 18, marginBottom: 8 }}>Payment Method</Text>
              <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                {METHODS.map((m, i) => {
                  const on = method === m.value;
                  const Icon = m.Icon;
                  return (
                    <Pressable key={m.value} onPress={() => setMethod(m.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={m.label} className="active:opacity-80"
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: on ? '#F4FBF8' : '#FFFFFF', borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                      <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? C.green : '#C9CED6', alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: C.green }} /> : null}
                      </View>
                      <Text style={{ flex: 1, fontSize: rf(13), fontWeight: '700', color: C.text, marginLeft: 10 }}>
                        {m.label}{m.sub ? <Text style={{ fontWeight: '400', color: C.muted }}>{` ${m.sub}`}</Text> : null}
                      </Text>
                      {Icon ? <Icon size={20} color={C.text} /> : <Text style={{ fontSize: rf(13), fontWeight: '900', fontStyle: 'italic', color: C.text }}>UPI</Text>}
                    </Pressable>
                  );
                })}
              </View>
              <TextField
                label="Transaction Reference"
                hint={cash ? '(Optional)' : '(UTR)'}
                required={!cash}
                value={ref}
                onChangeText={(t) => setRef(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                placeholder="Enter UPI / txn ID (e.g. 432190876543)"
                maxLength={30}
                autoCapitalize="characters"
                style={{ marginTop: 16 }}
              />
            </>
          ) : door && !pay.recordedAt ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: priceOpen ? C.field : C.amberBg, borderRadius: 14, padding: 14, marginTop: 18 }}>
              {priceOpen ? <Lock size={20} color={C.muted} /> : <Clock size={22} color={C.amber} />}
              <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 12 }}>
                {priceOpen
                  ? 'Payment unlocks after you approve the final price and the customer accepts it.'
                  : `${who} pays ${money(amount)} to ${o.customer?.name || 'the customer'} at the doorstep (UPI or cash) and uploads the proof.`}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 14, marginTop: 18 }}>
              <View style={{ alignSelf: 'flex-start', backgroundColor: verify.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10 }}>
                <Text style={{ fontSize: rf(11), fontWeight: '800', color: verify.fg }}>{verify.t}</Text>
              </View>
              {pay.proofUrl ? <Text style={{ fontSize: rf(12), color: C.muted, marginBottom: 6 }}>{`Collected by ${o.pickup?.personName || 'the employee'} at the doorstep`}</Text> : null}
              <Text style={{ fontSize: rf(12), color: C.muted }}>Paid by</Text>
              <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 2 }}>{METHOD_LABEL[pay.method] || pay.method || '—'}</Text>
              {pay.reference ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 6 }}>{`Reference: ${pay.reference}`}</Text> : null}
              {pay.recordedAt ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4 }}>{`Recorded ${whenLabel(pay.recordedAt)}`}</Text> : null}
              {pay.paidAt ? <Text style={{ fontSize: rf(11.5), color: C.green, marginTop: 4 }}>{`Customer confirmed ${whenLabel(pay.paidAt)}`}</Text> : null}
              {pay.proofUrl ? (
                <Pressable onPress={() => Linking.openURL(pay.proofUrl).catch(() => {})} accessibilityRole="imagebutton" accessibilityLabel="Open payment proof" style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
                  <Image source={{ uri: pay.proofUrl }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: '#FFFFFF' }} />
                  <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.teal, marginLeft: 10 }}>Payment proof</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {waiting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 14, padding: 14, marginTop: 14 }}>
              <Clock size={24} color={C.amber} />
              <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 12 }}>{`Waiting for ${o.customer?.name || 'the customer'} to confirm they received ${money(amount)}. You can complete the purchase after that.`}</Text>
            </View>
          ) : null}
          {status === 'PAID' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF8F4', borderRadius: 14, padding: 14, marginTop: 14 }}>
              <CircleCheck size={24} color={C.green} />
              <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 12 }}>{`The customer confirmed the payment${pay.paidAt ? ` (${whenLabel(pay.paidAt)})` : ''}. Complete the purchase.`}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </PurchasePage>
  );
}
