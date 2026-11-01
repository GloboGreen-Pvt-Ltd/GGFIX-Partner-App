import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  Gem,
  Gift,
  LayoutList,
  Minus,
  Plus,
  Receipt,
  Store,
} from 'lucide-react-native';
import { useResponsive } from '../../theme/responsive';
import { getSession } from '../../auth/session';
import { activateTrial, getCatalog, getEligibleShops, getMySubscription, getPaymentHistory, getQuotePreview } from '../../api/subscription';
import { confirm, notify } from '../../components/confirm';
import { formatDate, formatPaise, methodLabel, perTerm, titleCase } from '../../subscription/format';
import { inAppCheckoutStatus, razorpayFailureReason } from '../../subscription/razorpay';
import {
  Badge, Btn, C, Card, CheckoutUnavailable, EmptyState, ErrorState, KV, Notice, SectionTitle,
  SkeletonCards, SubHeader, capFor, statusTone, useSubscriptionGate,
} from '../../subscription/ui';

// Subscription home: current plan, plan details, the server's plan catalogue,
// covered shops and payment history. Every price, feature and limit comes from
// the subscription service (contract v2) — nothing is hardcoded here.

const TYPE_RANK = { TRIAL: 0, BASIC: 1, PREMIUM: 2 };
const TYPE_ICON = { TRIAL: Gift, BASIC: Crown, PREMIUM: Gem };
const TYPE_COLOR = { TRIAL: C.orange, BASIC: C.teal, PREMIUM: C.navy };
const LIVE = new Set(['ACTIVE', 'TRIAL']);
const FEATURES_COLLAPSED = 4;

const isTrialPlan = (p) => p?.planType === 'TRIAL' || p?.code === 'FREE_TRIAL';
const planColor = (p) => (/^#[0-9a-f]{6}$/i.test(String(p?.color || '')) ? p.color : (TYPE_COLOR[p?.planType] || C.teal));
const durationMonths = (p) => (String(p?.durationUnit).toUpperCase() === 'MONTHS' ? Number(p?.durationValue) || 0 : (Number(p?.durationValue) || 0) / 30);

function planBadge(plan, sub, trialAvailable) {
  const isCurrent = !!sub?.planCode && sub.planCode === plan.code;
  if (isCurrent && LIVE.has(sub.status)) return { label: 'Current Plan', tone: 'teal', icon: Check };
  if (isCurrent && (sub.status === 'EXPIRED' || sub.status === 'CANCELLED')) return { label: 'Expired', tone: 'red' };
  if (plan.status === 'COMING_SOON') return { label: 'Coming Soon', tone: 'blue', icon: Clock };
  if (isTrialPlan(plan) && !trialAvailable) return null;
  if (plan.purchasable) return { label: 'Available', tone: 'green' };
  return null;
}

/** The plan card's main action, or null (read-only / not purchasable). */
function planAction(plan, sub, trialAvailable, catalogPlans) {
  if (plan.status === 'COMING_SOON' || !plan.purchasable) return null;
  if (isTrialPlan(plan)) return trialAvailable ? { label: 'Start Free Trial', kind: 'trial' } : null;
  if (sub?.planCode === plan.code && sub.status !== 'NONE') return { label: 'Renew', kind: 'renew' };
  if (sub?.status === 'ACTIVE') {
    const cur = catalogPlans.find((p) => p.code === sub.planCode);
    if (!cur) return { label: 'Select Plan', kind: 'select' };
    const up = (TYPE_RANK[plan.planType] ?? 0) > (TYPE_RANK[cur.planType] ?? 0)
      || ((TYPE_RANK[plan.planType] ?? 0) === (TYPE_RANK[cur.planType] ?? 0) && durationMonths(plan) > durationMonths(cur));
    return { label: up ? 'Upgrade' : 'Select Plan', kind: 'select' };
  }
  return { label: 'Select Plan', kind: 'select' };
}

export default function SubscriptionScreen({ navigation, gated: gatedProp, onUnlock: unlockProp, onLogout: logoutProp }) {
  const gate = useSubscriptionGate();
  const gated = gatedProp ?? gate.gated;
  const onUnlock = unlockProp || gate.onUnlock;
  const onLogout = logoutProp || gate.onLogout;
  const r = useResponsive();
  const cap = capFor(r);

  const [isShopLogin, setIsShopLogin] = useState(false);
  const [me, setMe] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [eligible, setEligible] = useState(null);
  const [selCode, setSelCode] = useState(null);
  const [shopCount, setShopCount] = useState(1);
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async (mode = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    const s = await getSession().catch(() => null);
    const shopLogin = s?.loginScope === 'SHOP' || s?.loginType === 'SHOP_LOGIN';
    setIsShopLogin(shopLogin);
    const [meR, catR, histR, shopsR] = await Promise.allSettled([
      getMySubscription(),
      getCatalog(),
      shopLogin ? Promise.resolve([]) : getPaymentHistory(),
      shopLogin ? Promise.resolve([]) : getEligibleShops(),
    ]);
    // Keep the last good payload on a failed silent refresh.
    if (meR.status === 'fulfilled') setMe(meR.value || null);
    if (catR.status === 'fulfilled') setCatalog(catR.value || null);
    if (histR.status === 'fulfilled') setHistory(Array.isArray(histR.value) ? histR.value : []);
    if (shopsR.status === 'fulfilled') setEligible(Array.isArray(shopsR.value) ? shopsR.value : []);
    setErrors({
      me: meR.status === 'rejected' ? (meR.reason?.message || 'Could not load your subscription.') : null,
      catalog: catR.status === 'rejected' ? (catR.reason?.message || 'Could not load plans.') : null,
      history: histR.status === 'rejected' ? (histR.reason?.message || 'Could not load payments.') : null,
      shops: shopsR.status === 'rejected' ? (shopsR.reason?.message || 'Could not load your shops.') : null,
    });
    loadedOnce.current = true;
    setLoading(false);
    setRefreshing(false);
  }, []);

  // First focus loads with skeletons; returning from a purchase refreshes quietly.
  useFocusEffect(useCallback(() => { load(loadedOnce.current ? 'silent' : 'initial'); }, [load]));

  const sub = me?.subscription || null;
  const status = sub?.status || 'NONE';
  const plans = useMemo(() => (Array.isArray(catalog?.plans) ? catalog.plans : []), [catalog]);
  const checkout = inAppCheckoutStatus(catalog?.checkout);
  const live = LIVE.has(status);
  const currentPlan = plans.find((p) => p.code === sub?.planCode) || null;
  const coveredIds = (me?.shops || []).map((x) => x.shopId).filter(Boolean);

  const startPlan = (plan, kind) => {
    navigation?.navigate?.('SubscriptionSelectShops', {
      planCode: plan.code,
      trial: kind === 'trial',
      // Renewing keeps the shops already covered selected.
      preselect: kind === 'renew' ? coveredIds : [],
    });
  };

  // Tap a plan to select it (tap again to unselect), set the shop count with − / +,
  // then Submit opens payment. Covered shops are picked first, then the rest.
  const selPlan = plans.find((p) => p.code === selCode) || null;
  const selAction = selPlan && !isShopLogin ? planAction(selPlan, sub, !!me?.trialAvailable, plans) : null;
  const selOk = !!selAction;
  const selTrial = selAction?.kind === 'trial';
  const pickable = useMemo(() => {
    const rows = (eligible || []).filter((s) => s.selectable);
    const cov = new Set((me?.shops || []).map((x) => x.shopId));
    return [...rows.filter((s) => cov.has(s.shopId)), ...rows.filter((s) => !cov.has(s.shopId))];
  }, [eligible, me]);
  const limit = selPlan?.shopLimit === null || selPlan?.shopLimit === undefined ? Infinity : Number(selPlan.shopLimit);
  const maxCount = selOk ? Math.min(pickable.length, limit) : 0;
  const count = maxCount ? Math.min(Math.max(shopCount, 1), maxCount) : 0;

  const toggleSelect = (plan) => {
    if (selCode === plan.code) { setSelCode(null); return; }
    setSelCode(plan.code);
    setShopCount(Math.max(coveredIds.length, 1));
  };

  // Debounced server estimate for the selected paid plan.
  useEffect(() => {
    if (!selOk || selTrial || !count) { setEstimate(null); setEstimating(false); return undefined; }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const q = await getQuotePreview(selCode, count);
        if (!cancelled) setEstimate(q || null);
      } catch (e) {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selCode, selOk, selTrial, count]);

  const submit = async () => {
    if (!selPlan || !count) return;
    const picked = pickable.slice(0, count);
    const shopIds = picked.map((s) => s.shopId);
    const shopsParam = picked.map((s) => ({ shopId: s.shopId, name: s.name }));
    const label = [selPlan.name, selPlan.durationLabel].filter(Boolean).join(' · ');
    if (selTrial) {
      const ok = await confirm({
        title: 'Start free trial?',
        message: `${label} for ${count} shop${count === 1 ? '' : 's'}: ${picked.map((s) => s.name || 'Shop').join(', ')}.\n\nThe free trial can be used only once.`,
        confirmText: 'Start Trial',
      });
      if (!ok) return;
      setSubmitting(true);
      try {
        const res = await activateTrial(shopIds);
        setSelCode(null);
        navigation?.navigate?.('SubscriptionSuccess', { kind: 'trial', me: res, shops: shopsParam, planName: selPlan.name, durationLabel: selPlan.durationLabel });
      } catch (e) {
        notify('Could not start trial', e?.message || 'Please try again.', { preset: 'error' });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!checkout.available) {
      const why = !checkout.platformEnabled ? 'In-app checkout is turned off for this platform in Management Settings.'
        : !checkout.configured ? 'Razorpay is not configured on the server.'
          : `This app build does not include the payment SDK. Install the latest app build.${razorpayFailureReason() ? `

Details: ${razorpayFailureReason()}` : ''}`;
      notify('Payment unavailable', why, { type: 'warning' });
      return;
    }
    if (status === 'ACTIVE' && sub?.planCode && sub.planCode !== selPlan.code) {
      const ok = await confirm({
        title: 'Replace current plan?',
        message: `${label} will replace your current plan (${sub.planName || sub.planCode}).`,
        confirmText: 'Continue',
      });
      if (!ok) return;
    }
    setSelCode(null);
    navigation?.navigate?.('SubscriptionPayment', { planCode: selPlan.code, shopIds, shops: shopsParam });
  };

  const headerRight = gated ? (
    <Pressable onPress={onLogout} hitSlop={8} accessibilityRole="button" style={{ paddingVertical: 8 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.red }}>Logout</Text>
    </Pressable>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader
        title="Subscription"
        subtitle="Manage your plan, shops and payments"
        onBack={gated ? null : () => navigation?.goBack?.()}
        right={headerRight}
        capStyle={cap}
      />

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
          <View style={cap}><SkeletonCards count={4} /></View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 + r.insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={C.teal} colors={[C.teal]} />}
        >
          <View style={cap}>
            {gated && !live ? (
              <Notice tone="warn" title="Your subscription has ended">
                Choose a plan below to continue using NearGFix. You can log out anytime from the top-right.
              </Notice>
            ) : null}

            {gated && live ? (
              <View style={{ marginTop: 10 }}>
                <Notice tone="info" icon={CheckCircle2} title={`${sub?.planName || 'Your plan'} is active. You're all set!`} />
                <Btn label="Continue to App" icon={CheckCircle2} onPress={onUnlock} style={{ marginTop: 8 }} />
              </View>
            ) : null}

            {me?.pendingOrder && !isShopLogin ? (
              <Notice tone="warn" icon={Clock} title="You have a payment in progress">
                <Text style={{ fontSize: 11.5, color: C.muted, lineHeight: 16 }}>
                  {`${me.pendingOrder.planName || 'Plan'} · ${formatPaise(me.pendingOrder.totalPaise)} · ${titleCase(me.pendingOrder.status)}`}
                </Text>
                <Btn
                  label="Check payment status"
                  variant="outline"
                  compact
                  style={{ marginTop: 8, alignSelf: 'flex-start' }}
                  onPress={() => navigation?.navigate?.('SubscriptionPayment', { resumeOrderId: me.pendingOrder.id, order: me.pendingOrder })}
                />
              </Notice>
            ) : null}

            {errors.me && !me ? (
              <Card><ErrorState title="Subscription unavailable" message={errors.me} onRetry={() => load('initial')} /></Card>
            ) : (
              <CurrentPlanCard
                sub={sub}
                trialAvailable={!!me?.trialAvailable}
                canRenew={!isShopLogin && !!currentPlan?.purchasable && !isTrialPlan(currentPlan) && status !== 'NONE'}
                onRenew={() => currentPlan && startPlan(currentPlan, 'renew')}
              />
            )}

            {sub && status !== 'NONE' ? <PlanDetailsCard me={me} /> : null}

            {/* ---------- AVAILABLE PLANS ---------- */}
            <Card>
              <SectionTitle icon={LayoutList} title="Available Plans" />
              {errors.catalog && !catalog ? (
                <ErrorState title="Plans unavailable" message={errors.catalog} onRetry={() => load('initial')} />
              ) : plans.length === 0 ? (
                <EmptyState title="No plans available right now" message="Please check again later." />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {plans.map((plan) => (
                    <View key={plan.code} style={{ width: r.isTablet ? '50%' : '100%', padding: 4 }}>
                      <PlanCard
                        plan={plan}
                        badge={planBadge(plan, sub, !!me?.trialAvailable)}
                        action={isShopLogin ? null : planAction(plan, sub, !!me?.trialAvailable, plans)}
                        trialUsed={isTrialPlan(plan) && me && !me.trialAvailable && sub?.planCode !== plan.code}
                        expanded={!!expanded[plan.code]}
                        onToggle={() => setExpanded((e) => ({ ...e, [plan.code]: !e[plan.code] }))}
                        selected={selCode === plan.code}
                        onSelect={() => toggleSelect(plan)}
                      />
                    </View>
                  ))}
                </View>
              )}
              {!isShopLogin && catalog && !checkout.available ? <CheckoutUnavailable /> : null}
              {isShopLogin ? (
                <Notice tone="info" title="Your plan is managed by the shop owner.">
                  Upgrades and payments are available from the owner&apos;s account.
                </Notice>
              ) : null}
            </Card>

            {/* ---------- MANAGE SHOPS ---------- */}
            {sub && status !== 'NONE' ? (
              <Card>
                <SectionTitle icon={Store} title="Manage Shops" right={<Text style={{ fontSize: 11.5, color: C.muted }}>{(me?.shops || []).length} covered</Text>} />
                {(me?.shops || []).length === 0 ? (
                  <EmptyState icon={Store} title="No shops covered" message="Select a plan to cover your shops." />
                ) : (me.shops.map((s, i) => (
                  <View key={s.shopId || i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i === me.shops.length - 1 ? 0 : 1, borderBottomColor: C.soft }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{s.name || 'Shop'}</Text>
                      <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{`Until ${formatDate(s.endsAt)}`}</Text>
                    </View>
                    <Badge label={titleCase(s.status)} tone={statusTone(s.status)} />
                  </View>
                )))}
                {!isShopLogin && currentPlan?.purchasable && !isTrialPlan(currentPlan) ? (
                  <Btn
                    label="Add or Change Shops"
                    variant="outline"
                    compact
                    icon={Store}
                    style={{ marginTop: 8 }}
                    onPress={() => startPlan(currentPlan, 'renew')}
                  />
                ) : null}
              </Card>
            ) : null}

            {/* ---------- PAYMENT HISTORY (preview) ---------- */}
            {!isShopLogin ? (
              <Card>
                <SectionTitle
                  icon={Receipt}
                  title="Payment History"
                  right={(history || []).length > 0 ? (
                    <Pressable onPress={() => navigation?.navigate?.('SubscriptionHistory')} hitSlop={10} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: C.teal }}>View all</Text>
                      <ChevronRight size={14} color={C.teal} />
                    </Pressable>
                  ) : null}
                />
                {errors.history && !history ? (
                  <Text style={{ fontSize: 11.5, color: C.muted }}>Payment history is unavailable right now.</Text>
                ) : (history || []).length === 0 ? (
                  <EmptyState icon={Receipt} title="No payments yet" message="Your subscription payments will appear here." />
                ) : history.slice(0, 3).map((h, i) => (
                  <PaymentRow
                    key={h.paymentId || h.orderId || i}
                    item={h}
                    last={i === Math.min(history.length, 3) - 1}
                    onPress={h.paymentId ? () => navigation?.navigate?.('SubscriptionReceipt', { paymentId: h.paymentId }) : null}
                  />
                ))}
              </Card>
            ) : null}
          </View>
        </ScrollView>
      )}

      {!loading && selOk ? (
        <CheckoutBar
          plan={selPlan}
          trial={selTrial}
          count={count}
          maxCount={maxCount}
          onCount={setShopCount}
          total={selTrial ? 'Free' : estimating ? null : estimate ? formatPaise(estimate.totalPaise) : '—'}
          shopsError={errors.shops}
          submitting={submitting}
          onSubmit={submit}
          onAddShop={() => navigation?.navigate?.('OwnerShopInfo', { mode: 'create' })}
          bottomInset={r.insets.bottom}
          capStyle={cap}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function CurrentPlanCard({ sub, trialAvailable, canRenew, onRenew }) {
  const status = sub?.status || 'NONE';
  if (!sub || status === 'NONE') {
    return (
      <Card>
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: C.muted }}>CURRENT PLAN</Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 2 }}>No active plan</Text>
        <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
          {trialAvailable ? 'Start your free trial or choose a plan below.' : 'Choose a plan below to get started.'}
        </Text>
      </Card>
    );
  }
  const Icon = TYPE_ICON[sub.planType] || Crown;
  const color = TYPE_COLOR[sub.planType] || C.teal;
  const isTrial = status === 'TRIAL' || sub.planType === 'TRIAL';
  return (
    <Card style={{ borderColor: C.tealLine }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tealSoft }}>
          <Icon size={19} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: C.muted }}>CURRENT PLAN</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 1 }}>
            {[sub.planName, sub.durationLabel].filter(Boolean).join(' · ') || 'Plan'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Badge label={titleCase(status)} tone={statusTone(status)} />
          {sub.legacy ? <View style={{ marginTop: 4 }}><Badge label="Legacy" tone="gray" /></View> : null}
        </View>
      </View>
      <View style={{ marginTop: 8 }}>
        <KV label="Started" value={formatDate(sub.startedAt)} />
        <KV label="Valid until" value={formatDate(sub.endsAt)} />
        <KV label="Amount paid" value={isTrial && !Number(sub.amountPaidPaise) ? 'Free trial' : formatPaise(sub.amountPaidPaise)} strong last />
      </View>
      {canRenew ? <Btn label="Renew" onPress={onRenew} style={{ marginTop: 8 }} /> : null}
    </Card>
  );
}

const FEATURE_FLAGS = [
  ['serviceBookingEnabled', 'Service Booking'],
  ['pickupEnabled', 'Pickup'],
  ['whatsappEnabled', 'WhatsApp'],
  ['smsEnabled', 'SMS'],
  ['reportsEnabled', 'Reports'],
  ['exportEnabled', 'Export'],
  ['prioritySupportEnabled', 'Priority Support'],
];

function PlanDetailsCard({ me }) {
  const sub = me?.subscription || {};
  const ent = me?.entitlements || {};
  const usage = me?.usage || {};
  const covered = Array.isArray(me?.shops) ? me.shops.length : sub.shopCount;
  const of = (used, limit, unit = '') => {
    const u = used === null || used === undefined ? '—' : used;
    return limit === null || limit === undefined ? `${u} · Unlimited` : `${u} of ${limit}${unit}`;
  };
  const days = Number(sub.daysRemaining);
  const enabled = FEATURE_FLAGS.filter(([k]) => ent[k]).map(([, label]) => label);
  return (
    <Card>
      <SectionTitle icon={FileText} title="Plan Details" />
      <KV label="Started" value={formatDate(sub.startedAt)} />
      <KV label="Expires" value={formatDate(sub.endsAt)} />
      <KV label="Days remaining" value={Number.isFinite(days) ? `${days} day${days === 1 ? '' : 's'}` : '—'} strong />
      <KV label="Shops covered" value={ent.shopLimit === null || ent.shopLimit === undefined ? `${covered ?? '—'}` : `${covered ?? 0} of ${ent.shopLimit}`} />
      <KV label="Employees used" value={of(usage.employeesUsedMaxPerShop, ent.employeeLimit, ent.employeeLimitScope === 'PER_SHOP' ? ' per shop' : '')} />
      <KV label="Sell orders" value={of(usage.sellOrdersUsed, ent.sellOrderLimit)} />
      <KV label="Pickup" value={ent.pickupEnabled === undefined ? '—' : ent.pickupEnabled ? 'Enabled' : 'Disabled'} tone={ent.pickupEnabled ? C.green : C.muted} last={enabled.length === 0} />
      {enabled.length ? (
        <View style={{ paddingTop: 8 }}>
          <Text style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Enabled features</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {enabled.map((f) => <Badge key={f} label={f} tone="teal" icon={Check} />)}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function PlanCard({ plan, badge, action, trialUsed, expanded, onToggle, selected, onSelect }) {
  const Icon = TYPE_ICON[plan.planType] || Crown;
  const color = planColor(plan);
  const trial = isTrialPlan(plan);
  const features = Array.isArray(plan.features) ? plan.features : [];
  const shown = expanded ? features : features.slice(0, FEATURES_COLLAPSED);
  const pct = Number(plan.additionalShopDiscountPct) || 0;
  const term = perTerm(plan);
  const isCurrent = badge?.label === 'Current Plan';
  return (
    <Pressable
      onPress={onSelect}
      disabled={!action}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected, disabled: !action }}
      style={{ borderRadius: 14, borderWidth: selected || isCurrent ? 2 : 1, borderColor: selected ? C.teal : isCurrent ? color : C.line, backgroundColor: selected ? C.tealSoft : C.white, overflow: 'hidden', ...{ shadowColor: '#111', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 } }}
    >
      <View style={{ height: 4, backgroundColor: color }} />
      <View style={{ padding: 11 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft, marginRight: 9 }}>
            <Icon size={16} color={color} />
          </View>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: C.ink }}>{plan.name || plan.code}</Text>
            {plan.durationLabel ? <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{plan.durationLabel}</Text> : null}
          </View>
          {badge ? <Badge label={badge.label} tone={badge.tone} icon={badge.icon} /> : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 19, fontWeight: '800', color }}>
            {trial && !Number(plan.pricePaise) ? 'Free' : formatPaise(plan.pricePaise)}
          </Text>
          {term ? <Text style={{ fontSize: 11.5, color: C.muted, marginLeft: 4, marginBottom: 3 }}>{`/ ${term}`}</Text> : null}
        </View>
        {!trial ? (
          <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            {'Per shop'}
            {pct > 0 ? <Text style={{ fontWeight: '700', color: C.green }}>{` · Additional shop: ${pct}% off`}</Text> : null}
          </Text>
        ) : null}
        {plan.description ? <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 16 }}>{plan.description}</Text> : null}

        {shown.length ? (
          <View style={{ marginTop: 8 }}>
            {shown.map((f, i) => (
              <View key={`${i}-${f}`} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 }}>
                <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: C.tealSoft, alignItems: 'center', justifyContent: 'center', marginRight: 6, marginTop: 1 }}>
                  <Check size={9} color={C.teal} strokeWidth={3.4} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: C.ink, lineHeight: 17 }}>{String(f)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {trialUsed ? <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Free trial already used.</Text> : null}

        <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
          {features.length > FEATURES_COLLAPSED ? (
            <Btn label={expanded ? 'Hide Details' : 'View Details'} variant="outline" compact onPress={onToggle} style={{ flex: 1 }} />
          ) : null}
          {action ? (
            <Btn label={selected ? 'Selected' : action.label} icon={selected ? Check : undefined} variant={selected ? 'outline' : 'primary'} compact onPress={onSelect} style={{ flex: 1 }} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function Stepper({ value, max, onChange }) {
  const step = (Icon, next, off, label) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={off}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
        borderColor: off ? C.line : C.tealLine, backgroundColor: off ? C.soft : C.tealSoft, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon size={16} color={off ? C.subtle : C.teal} strokeWidth={2.6} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {step(Minus, value - 1, value <= 1, 'Fewer shops')}
      <Text style={{ minWidth: 34, textAlign: 'center', fontSize: 16, fontWeight: '800', color: C.ink }}>{value}</Text>
      {step(Plus, value + 1, value >= max, 'More shops')}
    </View>
  );
}

/** Sticky footer for the selected plan: shop count − / +, total, Submit. */
function CheckoutBar({ plan, trial, count, maxCount, onCount, total, shopsError, submitting, onSubmit, onAddShop, bottomInset, capStyle }) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 + bottomInset }}>
      <View style={capStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink }} numberOfLines={1}>
              {[plan?.name, plan?.durationLabel].filter(Boolean).join(' · ')}
            </Text>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }} numberOfLines={2}>
              {shopsError || (maxCount ? `Shops · up to ${maxCount}` : 'No eligible shops yet')}
            </Text>
          </View>
          {maxCount ? <Stepper value={count} max={maxCount} onChange={onCount} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 12, color: C.muted }}>{trial ? 'Free trial' : 'Total'}</Text>
          {total === null ? <ActivityIndicator color={C.teal} /> : (
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.teal }}>{count ? total : '—'}</Text>
          )}
        </View>
        {maxCount ? (
          <Btn label={trial ? 'Start Free Trial' : 'Submit & Pay'} onPress={onSubmit} disabled={!count || submitting} loading={submitting} style={{ marginTop: 8 }} />
        ) : (
          <Btn label="Add New Shop" icon={Store} variant="outline" onPress={onAddShop} style={{ marginTop: 8 }} />
        )}
        {!trial && maxCount ? (
          <Text style={{ fontSize: 10.5, color: C.subtle, marginTop: 6, textAlign: 'center' }}>{'By submitting you agree to the Terms & Conditions.'}</Text>
        ) : null}
      </View>
    </View>
  );
}

function PaymentRow({ item, last, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, minHeight: 48, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.soft, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>
          {[item.planName, item.durationLabel].filter(Boolean).join(' · ') || 'Subscription'}
        </Text>
        <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
          {`${formatDate(item.paidAt)} · ${item.shopCount ?? '—'} shop${item.shopCount === 1 ? '' : 's'} · ${methodLabel(item.method)}`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>{formatPaise(item.amountPaise)}</Text>
        <View style={{ marginTop: 3 }}><Badge label={titleCase(item.status)} tone={statusTone(item.status)} /></View>
      </View>
      {onPress ? <ChevronRight size={15} color={C.subtle} style={{ marginLeft: 4 }} /> : null}
    </Pressable>
  );
}
