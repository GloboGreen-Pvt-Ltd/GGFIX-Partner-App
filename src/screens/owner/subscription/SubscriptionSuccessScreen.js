import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Download, House, LayoutList } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { getPaymentHistory } from '../../../api/subscription';
import { notify } from '../../../components/confirm';
import { formatDateTime, formatDate, formatPaise, methodLabel, titleCase } from '../../../subscription/format';
import { Btn, C, Card, KV, SubHeader, capFor, useSubscriptionGate } from '../../../subscription/ui';
import { backToSubscription } from './SubscriptionSummaryScreen';

/** Shown after a server-verified payment (or a trial activation). */
export default function SubscriptionSuccessScreen({ navigation, route }) {
  const { kind = 'paid', order = null, subscription: subParam = null, me = null, shops: shopsParam = [], planName, durationLabel } = route?.params || {};
  const gate = useSubscriptionGate();
  const r = useResponsive();
  const cap = capFor(r);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const trial = kind === 'trial';
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

          <View style={{ marginTop: 14, gap: 8 }}>
            <Btn label="View Subscription" icon={LayoutList} onPress={viewSubscription} />
            {!trial ? <Btn label="Download Receipt" icon={Download} variant="outline" onPress={openReceipt} loading={receiptBusy} disabled={!order?.id} /> : null}
            <Btn label="Go to Dashboard" icon={House} variant="outline" onPress={goDashboard} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
