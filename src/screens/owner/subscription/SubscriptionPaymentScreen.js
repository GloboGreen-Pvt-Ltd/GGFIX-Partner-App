import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, Text, View } from 'react-native';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import {
  cancelPayment, createPaymentOrder, createPurchase, getCatalog, getMySubscription, getPaymentStatus, isPaidOrder, verifyPayment,
} from '../../../api/subscription';
import { notify } from '../../../components/confirm';
import { formatPaise, titleCase } from '../../../subscription/format';
import { inAppCheckoutStatus, openRazorpayCheckout } from '../../../subscription/razorpay';
import { Btn, C, Card, CheckoutUnavailable, KV, SubHeader, capFor } from '../../../subscription/ui';
import GstBreakdown, { hasGst } from '../../../subscription/GstBreakdown';
import { backToSubscription } from './SubscriptionSummaryScreen';

// Payment flow: POST /purchase → POST /payment/order → Razorpay checkout →
// POST /payment/verify. The SDK's success callback is never treated as success
// on its own — only a server-verified PAID/ACTIVATED order is. After a cancel,
// an error or the app coming back to the foreground, the order status is
// re-read from the server before a retry is offered.

const OPEN_ORDER = new Set(['CREATED', 'AWAITING_PAYMENT']);
const BUSY = new Set(['CREATING', 'PROCESSING', 'SUCCESS']);
const POLL_MS = 5000;
const POLL_MAX = 12;

const META = {
  CREATING: { title: 'Creating Order', text: 'Preparing your secure UPI payment…', tone: 'busy' },
  AWAITING: { title: 'Awaiting Payment', text: 'Complete the payment in the Razorpay window using any UPI app.', tone: 'busy' },
  AWAITING_IDLE: { title: 'Awaiting Payment', text: 'This payment has not been completed yet.', tone: 'wait' },
  PROCESSING: { title: 'Payment Processing', text: 'Confirming your payment. Please keep the app open.', tone: 'busy' },
  SUCCESS: { title: 'Payment Successful', text: 'Activating your subscription…', tone: 'ok' },
  FAILED: { title: 'Payment Failed', text: 'The payment did not go through.', tone: 'bad' },
  CANCELLED: { title: 'Payment Cancelled', text: 'The payment was not completed. If money was debited, it is confirmed automatically.', tone: 'wait' },
  PENDING: { title: 'Verification Pending', text: 'We could not confirm your payment yet. If money was debited, your plan activates automatically once it is confirmed.', tone: 'wait' },
  ERROR: { title: 'Could not start payment', text: 'Please try again.', tone: 'bad' },
};

export default function SubscriptionPaymentScreen({ navigation, route }) {
  const params = route?.params || {};
  const r = useResponsive();
  const cap = capFor(r);

  const [phase, setPhase] = useState(params.resumeOrderId ? 'PROCESSING' : 'CREATING');
  const [order, setOrder] = useState(params.order || null);
  const [message, setMessage] = useState(null);
  const [checking, setChecking] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const orderRef = useRef(params.order || null);
  const phaseRef = useRef(phase);
  const checkoutOpen = useRef(false);
  const finished = useRef(false);
  const mounted = useRef(true);
  const started = useRef(false);
  // Server GST breakdown from the quote (display only), handed on to the success screen.
  const gstRef = useRef(hasGst(params.quote?.gst) ? params.quote.gst : null);

  const setP = (p) => { phaseRef.current = p; if (mounted.current) setPhase(p); };
  const keepOrder = (o) => { if (o) { orderRef.current = o; if (mounted.current) setOrder(o); } };

  useEffect(() => () => { mounted.current = false; }, []);

  const finishSuccess = useCallback(async (paidOrder, subscription) => {
    if (finished.current) return;
    finished.current = true;
    keepOrder(paidOrder);
    setP('SUCCESS');
    let sub = subscription || null;
    if (!sub) sub = (await getMySubscription().catch(() => null))?.subscription || null;
    navigation.replace('SubscriptionSuccess', { kind: 'paid', order: paidOrder, subscription: sub, gst: gstRef.current });
  }, [navigation]);

  /** Re-read the order from the server; promote to success or settle on `fallback`. */
  const recheck = useCallback(async (fallback, fallbackMessage) => {
    const id = orderRef.current?.id;
    if (!id) { setP(fallback); setMessage(fallbackMessage || null); setStatusChecked(true); return; }
    setChecking(true);
    try {
      const res = await getPaymentStatus(id);
      const o = res?.order || null;
      keepOrder(o);
      setStatusChecked(true);
      if (isPaidOrder(o)) { await finishSuccess(o); return; }
      if (o?.status === 'FAILED') { setP('FAILED'); setMessage(o.failureReason || fallbackMessage || null); return; }
      if (o?.status === 'CANCELLED' || o?.status === 'EXPIRED') { setP('CANCELLED'); setMessage(null); return; }
      setP(fallback);
      setMessage(fallbackMessage || null);
    } catch (e) {
      // Status unknown — no retry until a status check succeeds.
      setStatusChecked(false);
      setP('PENDING');
      setMessage(e?.message || null);
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, [finishSuccess]);

  const start = useCallback(async () => {
    if (finished.current) return;
    setMessage(null);
    setUnavailable(false);
    setP('CREATING');
    try {
      const cat = await getCatalog().catch(() => null);
      if (!inAppCheckoutStatus(cat?.checkout).available) { setUnavailable(true); setP('ERROR'); return; }

      let o = orderRef.current;
      if (!o || !OPEN_ORDER.has(o.status)) {
        const planCode = params.planCode || o?.planCode;
        const shopIds = params.shopIds || o?.shopIds;
        if (!planCode || !Array.isArray(shopIds) || !shopIds.length) throw new Error('Please select your plan and shops again.');
        o = await createPurchase(planCode, shopIds);
        keepOrder(o);
      }
      if (isPaidOrder(o)) { await finishSuccess(o); return; }

      const pay = await createPaymentOrder(o.id);
      keepOrder({ ...o, status: 'AWAITING_PAYMENT', razorpayOrderId: pay?.razorpayOrderId || o.razorpayOrderId });
      setP('AWAITING');
      checkoutOpen.current = true;
      const res = await openRazorpayCheckout(pay);
      checkoutOpen.current = false;
      if (finished.current) return; // a foreground recheck already confirmed it

      if (res.ok) {
        setP('PROCESSING');
        try {
          const v = await verifyPayment({
            orderId: o.id,
            razorpayOrderId: res.data.razorpay_order_id || pay.razorpayOrderId,
            razorpayPaymentId: res.data.razorpay_payment_id,
            razorpaySignature: res.data.razorpay_signature,
          });
          if (isPaidOrder(v?.order)) { await finishSuccess(v.order, v.subscription); return; }
          keepOrder(v?.order);
          await recheck('PENDING');
        } catch (e) {
          await recheck('PENDING', e?.message);
        }
        return;
      }
      if (res.error?.code === 'UNAVAILABLE') { setUnavailable(true); setP('ERROR'); return; }
      // SDK error text can be raw JSON — the server's failureReason is shown instead.
      await recheck(res.error?.cancelled ? 'CANCELLED' : 'FAILED');
    } catch (e) {
      checkoutOpen.current = false;
      setMessage(e?.message || null);
      if (orderRef.current?.id) await recheck('ERROR', e?.message);
      else setP('ERROR');
    }
  }, [params.planCode, params.shopIds, finishSuccess, recheck]);

  // Kick-off: new purchase starts immediately; a resumed order is re-read first.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (params.resumeOrderId) {
      if (!orderRef.current) orderRef.current = { id: params.resumeOrderId };
      recheck('AWAITING_IDLE');
    } else {
      start();
    }
  }, [params.resumeOrderId, recheck, start]);

  // Back in the foreground (e.g. from a UPI app): quietly re-read the order.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || finished.current || !orderRef.current?.id) return;
      if (!['AWAITING', 'AWAITING_IDLE', 'CANCELLED', 'FAILED', 'PENDING'].includes(phaseRef.current)) return;
      try {
        const res = await getPaymentStatus(orderRef.current.id);
        if (isPaidOrder(res?.order)) finishSuccess(res.order);
      } catch (_) { /* the visible state already offers a manual check */ }
    });
    return () => sub.remove();
  }, [finishSuccess]);

  // Verification Pending: poll a little while before leaving it to the user.
  useEffect(() => {
    if (phase !== 'PENDING') return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      if (n > POLL_MAX || finished.current || !orderRef.current?.id) { clearInterval(t); return; }
      try {
        const res = await getPaymentStatus(orderRef.current.id);
        keepOrder(res?.order);
        if (mounted.current) setStatusChecked(true);
        if (isPaidOrder(res?.order)) { clearInterval(t); finishSuccess(res.order); }
      } catch (_) { /* keep polling */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, finishSuccess]);

  // No leaving while an order is being created or verified, or checkout is open.
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (finished.current) return;
    if (BUSY.has(phaseRef.current) || checkoutOpen.current) {
      e.preventDefault();
      notify('Please wait', 'Your payment is being processed.', { type: 'warning' });
    }
  }), [navigation]);

  const abandon = async () => {
    const id = orderRef.current?.id;
    if (id && OPEN_ORDER.has(orderRef.current?.status)) {
      try { await cancelPayment(id, 'Cancelled by user in app'); } catch (_) { /* server keeps it unpaid */ }
    }
    backToSubscription(navigation);
  };

  const meta = META[phase] || META.ERROR;
  const amount = order?.totalPaise ?? params.quote?.totalPaise;
  const planLabel = [order?.planName || params.quote?.planName, order?.durationLabel || params.quote?.durationLabel].filter(Boolean).join(' · ');
  const shopCount = order?.shopIds?.length ?? params.shopIds?.length;
  const busy = BUSY.has(phase) || (phase === 'AWAITING');
  const canRetry = !checking && statusChecked;
  // Only when the quoted breakdown is for exactly this amount.
  const showGst = !!gstRef.current && amount != null && Number(gstRef.current.totalPaise) === Number(amount);

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader title="Payment" subtitle="Secure UPI payment via Razorpay" onBack={busy ? null : () => navigation.goBack()} capStyle={cap} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 + r.insets.bottom }}>
        <View style={cap}>
          <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
            <StatusIcon tone={meta.tone} />
            <Text style={{ marginTop: 12, fontSize: 17, fontWeight: '800', color: C.ink, textAlign: 'center' }}>{unavailable ? 'In-app payment unavailable' : meta.title}</Text>
            {!unavailable ? (
              <Text style={{ marginTop: 4, fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 18 }}>
                {message && (phase === 'FAILED' || phase === 'ERROR' || phase === 'PENDING') ? message : meta.text}
              </Text>
            ) : null}
            {checking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <ActivityIndicator size="small" color={C.teal} />
                <Text style={{ marginLeft: 6, fontSize: 12, color: C.muted }}>Checking payment status…</Text>
              </View>
            ) : null}
          </Card>

          {unavailable ? <CheckoutUnavailable /> : null}

          <Card>
            <KV label="Plan" value={planLabel} />
            <KV label="Shops" value={shopCount != null ? String(shopCount) : '—'} />
            {order?.orderNo ? <KV label="Order No." value={order.orderNo} /> : null}
            {order?.status ? <KV label="Order status" value={titleCase(order.status)} /> : null}
            {showGst ? <GstBreakdown gst={gstRef.current} totalLabel="Amount" /> : <KV label="Amount" value={formatPaise(amount)} strong last />}
          </Card>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
            <ShieldCheck size={13} color={C.muted} />
            <Text style={{ marginLeft: 5, fontSize: 11, color: C.muted }}>Pay with any UPI app. NearGFix never asks for your UPI PIN.</Text>
          </View>

          {phase === 'AWAITING_IDLE' ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Btn label="Pay Now" onPress={start} disabled={!canRetry} />
              <Btn label="Cancel Payment" variant="outline" onPress={abandon} />
            </View>
          ) : null}

          {(phase === 'FAILED' || phase === 'CANCELLED' || (phase === 'ERROR' && !unavailable)) ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Btn label="Retry Payment" onPress={start} disabled={!canRetry && !!orderRef.current?.id} />
              <Btn label="Cancel & Go Back" variant="outline" onPress={abandon} />
            </View>
          ) : null}

          {phase === 'PENDING' ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Btn label="Check Status" onPress={() => recheck('PENDING')} loading={checking} />
              <Btn label="Back to Subscription" variant="outline" onPress={() => backToSubscription(navigation)} />
            </View>
          ) : null}

          {unavailable ? (
            <Btn label="Back to Subscription" variant="outline" onPress={() => backToSubscription(navigation)} style={{ marginTop: 12 }} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function StatusIcon({ tone }) {
  const box = { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' };
  if (tone === 'busy') return <View style={[box, { backgroundColor: C.tealSoft }]}><ActivityIndicator size="large" color={C.teal} /></View>;
  if (tone === 'ok') return <View style={[box, { backgroundColor: C.greenSoft }]}><CheckCircle2 size={34} color={C.green} /></View>;
  if (tone === 'bad') return <View style={[box, { backgroundColor: C.redSoft }]}><XCircle size={34} color={C.red} /></View>;
  return <View style={[box, { backgroundColor: C.orangeSoft }]}><Clock size={32} color={C.orangeInk} /></View>;
}
