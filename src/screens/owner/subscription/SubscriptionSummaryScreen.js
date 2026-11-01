import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, CalendarRange, ClipboardList, CreditCard, Store } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { getSession } from '../../../auth/session';
import { getCatalog, getQuote } from '../../../api/subscription';
import { formatDate, formatPaise, titleCase } from '../../../subscription/format';
import { inAppCheckoutStatus } from '../../../subscription/razorpay';
import GstBreakdown, { hasGst } from '../../../subscription/GstBreakdown';
import {
  Badge, Btn, C, Card, Checkbox, CheckoutUnavailable, ErrorState, KV, Notice, SectionTitle, SkeletonCards, SubHeader, capFor,
} from '../../../subscription/ui';

export const backToSubscription = (navigation) => {
  if (typeof navigation?.popTo === 'function') navigation.popTo('OwnerSubscription');
  else navigation?.navigate?.('OwnerSubscription');
};

const PURPOSE = { NEW: 'New', RENEW: 'Renewal', UPGRADE: 'Upgrade' };

/** Server quote for the chosen plan + shops, terms, then Confirm & Pay. */
export default function SubscriptionSummaryScreen({ navigation, route }) {
  const { planCode, shopIds = [], shops = [] } = route?.params || {};
  const idsKey = shopIds.join(',');
  const r = useResponsive();
  const cap = capFor(r);

  const [quote, setQuote] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [terms, setTerms] = useState(false);
  const [replaceAck, setReplaceAck] = useState(false);
  const loadedKey = useRef(null);

  const load = useCallback(async () => {
    const first = loadedKey.current !== `${planCode}|${idsKey}`;
    if (first) { setLoading(true); setReplaceAck(false); } else setRefreshing(true);
    setError(null);
    try {
      const ids = idsKey ? idsKey.split(',') : [];
      const [q, cat, s] = await Promise.all([
        getQuote(planCode, ids),
        getCatalog().catch(() => null),
        getSession().catch(() => null),
      ]);
      setQuote(q || null);
      setCheckout(inAppCheckoutStatus(cat?.checkout));
      setOwner(s);
      loadedKey.current = `${planCode}|${idsKey}`;
    } catch (e) {
      setQuote(null);
      setError(e?.message || 'Could not prepare your quote.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planCode, idsKey]);

  // Re-quoted on every focus and whenever plan/shops change.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const names = (quote?.shopIds || shopIds).map((id) => shops.find((s) => s.shopId === id)?.name).filter(Boolean);
  const needsReplaceAck = !!quote?.replacesCurrent;
  const canPay = !!quote && !refreshing && terms && (!needsReplaceAck || replaceAck) && !!checkout?.available;
  const taxPct = Number(quote?.taxPercent) || 0;
  // Server GST breakdown (newer servers only); without it the old rows stay.
  const gst = hasGst(quote?.gst) ? quote.gst : null;
  const discountLabel = `Discount (${Number(quote?.additionalShopDiscountPct) || 0}% on additional shops)`;

  const onPay = () => {
    if (!canPay) return;
    navigation.navigate('SubscriptionPayment', { planCode, shopIds: quote.shopIds || shopIds, quote, shops });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader title="Order Summary" subtitle="Review your plan before you pay" onBack={() => navigation.goBack()} capStyle={cap} />

      {loading ? (
        <View style={[{ paddingHorizontal: 14 }, cap]}><SkeletonCards count={3} /></View>
      ) : error ? (
        <View style={cap}>
          <ErrorState title="Quote unavailable" message={error} onRetry={load} />
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14 }}>
            <Btn label="Change Plan" variant="outline" compact onPress={() => backToSubscription(navigation)} style={{ flex: 1 }} />
            <Btn label="Edit Shops" variant="outline" compact onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
            <View style={cap}>
              <Card>
                <SectionTitle
                  icon={ClipboardList}
                  title={[quote.planName, quote.durationLabel].filter(Boolean).join(' · ') || planCode}
                  right={quote.purpose ? <Badge label={PURPOSE[quote.purpose] || titleCase(quote.purpose)} tone={quote.purpose === 'RENEW' ? 'green' : 'teal'} /> : null}
                />
                <KV label="Business" value={owner?.businessName || owner?.activeShop?.businessName || owner?.shopName} />
                <KV label="Owner" value={owner?.name} />
                <KV label="Plan" value={quote.planName} />
                <KV label="Duration" value={quote.durationLabel} last />
              </Card>

              <Card>
                <SectionTitle icon={Store} title={`Shops (${quote.shopCount ?? names.length})`} />
                <Text style={{ fontSize: 12.5, color: C.ink, lineHeight: 18 }}>{names.length ? names.join(', ') : '—'}</Text>
              </Card>

              <Card>
                <SectionTitle icon={CreditCard} title="Price Breakdown" />
                <KV label="First shop" value={formatPaise(quote.firstShopPaise)} />
                {Number(quote.additionalShopsCount) > 0 ? (
                  <>
                    <KV label={`Additional shops (${quote.additionalShopsCount} × ${formatPaise(quote.additionalShopUnitPaise)})`} value={formatPaise(quote.additionalShopsTotalPaise)} />
                    {!gst ? <KV label={discountLabel} value={`− ${formatPaise(quote.discountPaise)}`} tone={C.green} /> : null}
                  </>
                ) : null}
                {gst ? (
                  <GstBreakdown gst={gst} discountLabel={Number(quote.additionalShopsCount) > 0 ? discountLabel : 'Discount'} />
                ) : (
                  <>
                    <KV label="Subtotal" value={formatPaise(quote.subtotalPaise)} />
                    <KV
                      label={taxPct > 0 ? `Tax (${taxPct}%${quote.taxInclusive ? ', included' : ''})` : 'Tax'}
                      value={taxPct > 0 ? formatPaise(quote.taxPaise) : 'Not applicable'}
                    />
                    <KV label="Final payable" value={formatPaise(quote.totalPaise)} strong last />
                  </>
                )}
              </Card>

              <Card>
                <SectionTitle icon={CalendarRange} title="Validity" />
                <KV label="Starts" value={formatDate(quote.startsAt)} />
                <KV label="Ends" value={formatDate(quote.endsAt)} />
                <KV label="Renewal price" value={formatPaise(quote.renewalPricePaise)} last />
              </Card>

              {needsReplaceAck ? (
                <Notice tone="warn" icon={AlertTriangle} title="This replaces your current plan">
                  <Text style={{ fontSize: 11.5, color: C.muted, lineHeight: 16 }}>
                    {quote.notice || 'Your current plan ends as soon as this one starts. Unused days are not credited.'}
                  </Text>
                  <CheckRow checked={replaceAck} onPress={() => setReplaceAck((v) => !v)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: C.ink, flex: 1 }}>I understand and want to replace my current plan.</Text>
                  </CheckRow>
                </Notice>
              ) : null}

              <CheckRow checked={terms} onPress={() => setTerms((v) => !v)} style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: C.ink, flex: 1, lineHeight: 17 }}>
                  {'I agree to the '}
                  <Text style={{ color: C.teal, fontWeight: '800' }} onPress={() => navigation.navigate('Terms')}>Terms &amp; Conditions</Text>
                  {' and '}
                  <Text style={{ color: C.teal, fontWeight: '800' }} onPress={() => navigation.navigate('PrivacyPolicy')}>Privacy Policy</Text>
                  {'. Subscription fees are for the selected term and are not prorated.'}
                </Text>
              </CheckRow>

              {checkout && !checkout.available ? <CheckoutUnavailable /> : null}
            </View>
          </ScrollView>

          <View style={{ borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 + r.insets.bottom }}>
            <View style={cap}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn label="Change Plan" variant="outline" compact onPress={() => backToSubscription(navigation)} style={{ flex: 1 }} />
                <Btn label="Edit Shops" variant="outline" compact onPress={() => navigation.goBack()} style={{ flex: 1 }} />
              </View>
              {checkout?.available ? (
                <Btn
                  label={`Confirm & Pay ${formatPaise(quote.totalPaise)}`}
                  onPress={onPay}
                  disabled={!canPay}
                  loading={refreshing}
                  style={{ marginTop: 8 }}
                />
              ) : null}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function CheckRow({ checked, onPress, children, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={4}
      style={[{ flexDirection: 'row', alignItems: 'flex-start', minHeight: 44, gap: 10 }, style]}
    >
      <Checkbox checked={checked} />
      {children}
    </Pressable>
  );
}
