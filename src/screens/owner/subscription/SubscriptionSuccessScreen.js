import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Download, FileText, House, LayoutList } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { getInvoiceByOrder, getPaymentHistory } from '../../../api/subscription';
import { notify } from '../../../components/confirm';
import { formatDateTime, formatDate, formatPaise, methodLabel, titleCase } from '../../../subscription/format';
import { Badge, Btn, C, Card, KV, SectionTitle, SubHeader, capFor, useSubscriptionGate } from '../../../subscription/ui';
import GstBreakdown, { documentLabel, hasGst } from '../../../subscription/GstBreakdown';
import { InvoiceActions, WhatsAppStatus } from '../../../subscription/invoice';
import { backToSubscription } from './SubscriptionSummaryScreen';

// The invoice is issued right after activation; poll briefly (404 = not yet).
const INVOICE_POLLS = 5;
const INVOICE_POLL_MS = 2000;
// These mean "this server has no invoices" — stop polling and keep the old UI.
const NO_INVOICES = new Set([401, 403, 405, 501]);

/** Shown after a server-verified payment (or a trial activation). */
export default function SubscriptionSuccessScreen({ navigation, route }) {
  const { kind = 'paid', order = null, subscription: subParam = null, me = null, shops: shopsParam = [], planName, durationLabel, gst: quoteGst = null } = route?.params || {};
  const gate = useSubscriptionGate();
  const r = useResponsive();
  const cap = capFor(r);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [invoicePolling, setInvoicePolling] = useState(false);
  const [invoicePollDone, setInvoicePollDone] = useState(false);

  const trial = kind === 'trial';
  const orderId = order?.id || null;

  useEffect(() => {
    if (trial || !orderId) return undefined;
    let cancelled = false;
    let timer = null;
    const stop = () => { if (!cancelled) { setInvoicePolling(false); setInvoicePollDone(true); } };
    const attempt = async (n) => {
      try {
        const inv = await getInvoiceByOrder(orderId);
        if (cancelled) return;
        if (inv?.id) { setInvoice(inv); setInvoicePolling(false); return; }
      } catch (e) {
        if (cancelled) return;
        if (NO_INVOICES.has(e?.status)) { stop(); return; }
      }
      if (n + 1 >= INVOICE_POLLS) { stop(); return; }
      timer = setTimeout(() => attempt(n + 1), INVOICE_POLL_MS);
    };
    setInvoicePolling(true);
    attempt(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [trial, orderId]);

  // Quote breakdown until the invoice arrives — only for exactly the paid amount.
  const fallbackGst = !invoice && hasGst(quoteGst) && Number(quoteGst.totalPaise) === Number(order?.totalPaise) ? quoteGst : null;
  const sub = subParam || me?.subscription || null;
  const shopNames = (order?.shops?.length ? order.shops : (me?.shops?.length ? me.shops : shopsParam)).map((s) => s?.name).filter(Boolean);
  const plan = [order?.planName || sub?.planName || planName, order?.durationLabel || sub?.durationLabel || durationLabel].filter(Boolean).join(' · ');

  // Compact green check: pop in + fade.
  const scale = useRef(new Animated.Value(0.4)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [scale, fade]);

  const viewSubscription = useCallback(() => backToSubscription(navigation), [navigation]);

  // Back never returns to the payment / summary steps.
  useFocusEffect(useCallback(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { viewSubscription(); return true; });
    return () => h.remove();
  }, [viewSubscription]));

  const goDashboard = () => {
    if (gate.gated && gate.onUnlock) { gate.onUnlock(); return; }
    navigation.popTo('OwnerTabs', { screen: 'Home' });
  };

  const openReceipt = async () => {
    if (!order?.id) return;
    setReceiptBusy(true);
    try {
      const rows = await getPaymentHistory();
      const row = (Array.isArray(rows) ? rows : []).find((h) => h.orderId === order.id && h.paymentId);
      if (row) navigation.navigate('SubscriptionReceipt', { paymentId: row.paymentId });
      else notify('Receipt not ready yet', 'Please check Payment History in a moment.', { type: 'info' });
    } catch (e) {
      notify('Could not open receipt', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setReceiptBusy(false);
    }
  };

  const paid = order?.status === 'PAID' || order?.status === 'ACTIVATED';

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader title="Subscription" onBack={viewSubscription} capStyle={cap} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 + r.insets.bottom }}>
        <View style={cap}>
          <View style={{ alignItems: 'center', paddingTop: 22, paddingBottom: 6 }}>
            <Animated.View style={{ transform: [{ scale }], opacity: fade, width: 76, height: 76, borderRadius: 38, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={30} color={C.white} strokeWidth={3.2} />
              </View>
            </Animated.View>
            <Text style={{ marginTop: 14, fontSize: 19, fontWeight: '800', color: C.ink, textAlign: 'center' }}>Subscription Activated!</Text>
            <Text style={{ marginTop: 4, fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 }}>
              Your selected shops are now covered by your NearGFix subscription.
            </Text>
          </View>

          <Card>
            <KV label="Plan" value={plan} />
            <KV label="Shops activated" value={shopNames.length ? shopNames.join(', ') : (sub?.shopCount != null ? String(sub.shopCount) : '—')} />
            <KV label="Amount" value={trial ? 'Free trial' : formatPaise(order?.totalPaise)} strong />
            {!trial ? <KV label="Paid via" value={methodLabel(order?.paymentMethod || 'upi')} /> : null}
            {!trial ? <KV label="Payment status" value={paid ? 'Paid' : titleCase(order?.status)} tone={paid ? C.green : undefined} /> : null}
            <KV label="Subscription status" value={titleCase(sub?.status) || '—'} tone={sub?.status === 'ACTIVE' || sub?.status === 'TRIAL' ? C.green : undefined} />
            {!trial && order?.orderNo ? <KV label="Order No." value={order.orderNo} /> : null}
            {!trial ? <KV label="Paid at" value={formatDateTime(order?.paidAt)} /> : null}
            {!trial ? <KV label="Activated at" value={formatDateTime(order?.activatedAt)} /> : null}
            <KV label="Valid until" value={formatDate(sub?.endsAt)} last />
          </Card>

          {!trial && invoice ? (
            <Card>
              <SectionTitle
                icon={FileText}
                title={invoice.title || `NearGFix Subscription ${documentLabel(invoice.documentType || invoice.gst?.documentType)}`}
                right={<Badge label={documentLabel(invoice.documentType || invoice.gst?.documentType)} tone="teal" />}
              />
              <KV label="Invoice No." value={invoice.invoiceNo} />
              <KV label="Issued on" value={formatDateTime(invoice.issuedAt)} last={!hasGst(invoice.gst)} />
              {hasGst(invoice.gst) ? <GstBreakdown gst={invoice.gst} totalLabel="Total Paid" /> : null}
              <WhatsAppStatus invoice={invoice} onUpdated={setInvoice} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.soft }} />
              <InvoiceActions invoice={invoice} style={{ marginTop: 12 }} />
            </Card>
          ) : !trial && fallbackGst ? (
            <Card>
              <SectionTitle icon={FileText} title="Price Breakdown" />
              <GstBreakdown gst={fallbackGst} totalLabel="Total Paid" />
              {invoicePolling ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <ActivityIndicator size="small" color={C.teal} />
                  <Text style={{ marginLeft: 6, fontSize: 12, color: C.muted }}>Preparing your invoice…</Text>
                </View>
              ) : invoicePollDone ? (
                <Text style={{ marginTop: 10, fontSize: 12, color: C.muted }}>Your invoice will appear in Payment History shortly.</Text>
              ) : null}
            </Card>
          ) : null}

          <View style={{ marginTop: 14, gap: 8 }}>
            <Btn label="View Subscription" icon={LayoutList} onPress={viewSubscription} />
            {!trial && !invoice ? <Btn label="Download Receipt" icon={Download} variant="outline" onPress={openReceipt} loading={receiptBusy} disabled={!order?.id} /> : null}
            <Btn label="Go to Dashboard" icon={House} variant="outline" onPress={goDashboard} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
