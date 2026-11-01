import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Receipt } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { getInvoices, getPaymentHistory } from '../../../api/subscription';
import { formatDate, formatPaise, methodLabel, titleCase } from '../../../subscription/format';
import { Badge, C, EmptyState, ErrorState, SkeletonCards, SubHeader, capFor, shadow, statusTone } from '../../../subscription/ui';
import { documentLabel } from '../../../subscription/GstBreakdown';
import { InvoiceActions, WhatsAppStatus } from '../../../subscription/invoice';

/** The InvoiceView for a history row (newer servers; additive fields first). */
const invoiceFor = (h, invoices) => invoices.find((v) => (h.invoiceId && v.id === h.invoiceId)
  || (h.invoiceNo && v.invoiceNo === h.invoiceNo)
  || (h.orderNo && v.payment?.orderNo === h.orderNo)
  || (h.razorpayPaymentId && v.payment?.razorpayPaymentId === h.razorpayPaymentId)) || null;

/** Every subscription payment: date, plan, duration, shops, amount, method, status, receipt / invoice. */
export default function SubscriptionHistoryScreen({ navigation }) {
  const r = useResponsive();
  const cap = capFor(r);
  const [rows, setRows] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(async (mode) => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      // Invoices are optional: an older server 404s and the rows stay as before.
      const [list, invs] = await Promise.all([getPaymentHistory(), getInvoices().catch(() => null)]);
      setRows(Array.isArray(list) ? list : []);
      setInvoices(Array.isArray(invs) ? invs : []);
      setError(null);
    } catch (e) {
      if (!loaded.current) setRows(null);
      setError(e?.message || 'Could not load payment history.');
    } finally {
      loaded.current = true;
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onInvoiceUpdated = useCallback((next) => {
    if (!next?.id) return;
    setInvoices((list) => (list.some((v) => v.id === next.id) ? list.map((v) => (v.id === next.id ? next : v)) : [...list, next]));
  }, []);

  const renderItem = ({ item: h }) => {
    const full = invoiceFor(h, invoices);
    const inv = full || (h.invoiceId ? { id: h.invoiceId, invoiceNo: h.invoiceNo } : null);
    const invoiceNo = h.invoiceNo || full?.invoiceNo;
    const docType = h.documentType || full?.documentType || full?.gst?.documentType;
    const whatsapp = full?.whatsapp || (h.whatsappStatus ? { status: h.whatsappStatus } : null);
    const open = h.paymentId ? () => navigation.navigate('SubscriptionReceipt', { paymentId: h.paymentId, invoiceId: inv?.id }) : null;
    return (
      <Pressable
        onPress={open}
        disabled={!open}
        accessibilityRole={open ? 'button' : undefined}
        style={({ pressed }) => ({ marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, opacity: pressed ? 0.8 : 1, ...shadow })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink }}>{h.planName || 'Subscription'}</Text>
            <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{formatDate(h.paidAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }}>{formatPaise(h.amountPaise)}</Text>
            <View style={{ marginTop: 3 }}><Badge label={titleCase(h.status)} tone={statusTone(h.status)} /></View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 12 }}>
          <Meta label="Duration" value={h.durationLabel} />
          <Meta label="Shops" value={h.shopCount != null ? String(h.shopCount) : '—'} />
          <Meta label="Method" value={methodLabel(h.method)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.soft }}>
          <Receipt size={13} color={C.muted} />
          <Text style={{ flex: 1, marginLeft: 6, fontSize: 11.5, color: C.muted }}>
            {invoiceNo ? `${documentLabel(docType)} ${invoiceNo}` : h.receiptNo ? `Receipt ${h.receiptNo}` : 'Receipt pending'}
          </Text>
          {open ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.teal }}>View</Text>
              <ChevronRight size={14} color={C.teal} />
            </>
          ) : null}
        </View>
        {whatsapp ? <WhatsAppStatus invoice={full} whatsapp={whatsapp} onUpdated={onInvoiceUpdated} style={{ marginTop: 8 }} /> : null}
        {inv?.id ? <InvoiceActions invoice={inv} compact style={{ marginTop: 8 }} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader title="Payment History" subtitle="Your NearGFix subscription payments" onBack={() => navigation.goBack()} capStyle={cap} />
      {rows === null && !error ? (
        <View style={[{ paddingHorizontal: 14 }, cap]}><SkeletonCards count={4} /></View>
      ) : rows === null ? (
        <ErrorState title="History unavailable" message={error} onRetry={() => load()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(h, i) => String(h.paymentId || h.orderId || i)}
          renderItem={renderItem}
          extraData={invoices}
          contentContainerStyle={[{ paddingHorizontal: 14, paddingBottom: 24 + r.insets.bottom }, cap]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={C.teal} colors={[C.teal]} />}
          ListEmptyComponent={<EmptyState icon={Receipt} title="No payments yet" message="Your subscription payments will appear here." />}
        />
      )}
    </View>
  );
}

function Meta({ label, value }) {
  return (
    <View>
      <Text style={{ fontSize: 10.5, color: C.subtle }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink, marginTop: 1 }}>{value || '—'}</Text>
    </View>
  );
}
