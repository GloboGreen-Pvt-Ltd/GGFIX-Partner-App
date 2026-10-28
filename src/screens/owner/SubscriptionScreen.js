import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Crown,
  Gift,
  Check,
  Store,
  Clock,
  CreditCard,
  Minus,
  Plus,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Calendar,
  CalendarCheck,
  Timer,
  Users,
  Package,
  Truck,
  IndianRupee,
  ChartColumnIncreasing,
} from 'lucide-react-native';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';
import { T } from '../../components/dashboard/theme';
import { subscriptionApi } from '../../api/client';
import { FEATURE, coverageLabel, fetchEntitlements, usageLabel } from '../../subscription/entitlements';
import { getSession } from '../../auth/session';
import { fetchMe } from '../../api/auth';

// GGFIX palette — green #035C6C, ink #111111, white, neutrals #F3F4F6/#F3F4F6.
const ACCENT = '#035C6C';
const PRIMARY = '#035C6C';
const BRIGHT = '#035C6C';
const MINT = '#E5F3F5';
const SOFT_MINT = '#F3F4F6';
const PAGE_BG = '#F3F4F6';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT_PRIMARY = '#111111';
const TEXT_SECONDARY = '#6B7280';
const TRIAL_ACCENT = '#F59E0B';
const TRIAL_TINT = '#FEF3C7';
const PRO_ACCENT = '#8B5CF6';
const PRO_TINT = '#F3EEFF';

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.07,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

// Static pricing table for Basic multi-shop (1 shop = 3000, N>=2 = N x 2500).
const PRICING_ROWS = [
  { shops: 1, amount: 3000 },
  { shops: 2, amount: 5000 },
  { shops: 3, amount: 7500 },
  { shops: 4, amount: 10000 },
  { shops: 5, amount: 12500 },
];

const STATUS_META = {
  FREE_TRIAL: { label: 'Free Trial', color: TRIAL_ACCENT, tint: TRIAL_TINT },
  ACTIVE:     { label: 'Active',     color: ACCENT,        tint: MINT },
  EXPIRED:    { label: 'Expired',    color: '#B91C1C',     tint: '#FEE2E2' },
  CANCELLED:  { label: 'Cancelled',  color: '#B91C1C',     tint: '#FEE2E2' },
};

const STATUS_DESCRIPTION = {
  FREE_TRIAL: 'You’re on a free trial — explore every feature before you choose a plan.',
  ACTIVE: 'Your subscription is active and all features are enabled.',
  EXPIRED: 'Your subscription has expired. Choose a plan below to keep going.',
  CANCELLED: 'Your subscription was cancelled. Choose a plan below to reactivate.',
};

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// FREE_TRIAL / BASIC plan visuals keyed by plan code; anything else (e.g. a
// real "Pro" plan the API returns) falls back to a generic premium icon/tint
// rather than assuming a fixed 3-plan catalogue.
const PLAN_ICON = { FREE_TRIAL: Gift, BASIC: Crown, BASIC_6M: Crown };
const PLAN_TONE = {
  FREE_TRIAL: { accent: TRIAL_ACCENT, tint: TRIAL_TINT },
  BASIC:      { accent: ACCENT,       tint: MINT },
  BASIC_6M:   { accent: ACCENT,       tint: MINT },
};
const DEFAULT_TONE = { accent: PRO_ACCENT, tint: PRO_TINT };

// Server plans plus display-only "Coming soon" cards: Basic 6 Months (same
// content as Basic) and Premium. The server only sells Basic yearly, so these
// carry no price and no Upgrade button until it supports them.
// Customer messaging: Basic sends WhatsApp only; Premium sends SMS + WhatsApp.
const BASIC_MESSAGING = 'Customer updates via WhatsApp only';
const PREMIUM_FEATURES = [
  'Everything in Basic',
  'Customer updates via SMS + WhatsApp',
  'Up to 10 employees',
  'Multiple shops',
  'Advanced reports & exports',
  'Priority support',
];

// Display pricing (per shop, per year). Each additional shop gets a discount:
// Basic 5%, Premium 10%. App display only — the server still activates at its
// own quote until its pricing is updated.
export const PLAN_PRICING = {
  BASIC: { price: 1000, extraOff: 5 },
  PREMIUM: { price: 3000, extraOff: 10 },
};
export function planTotal(code, shops) {
  const pr = PLAN_PRICING[code];
  if (!pr) return null;
  const n = Math.max(1, shops || 1);
  const extraEach = Math.round(pr.price * (1 - pr.extraOff / 100));
  return { first: pr.price, extraEach, extraCount: n - 1, extraOff: pr.extraOff, total: pr.price + (n - 1) * extraEach };
}

function displayPlans(plans) {
  const out = [];
  for (const plan of plans) {
    if (plan.code === 'BASIC') {
      // Server lines that mention SMS give way to the WhatsApp-only line.
      // Employee line → the Basic cap (4); SMS lines give way to WhatsApp-only.
      const features = [...(plan.features || [])
        .filter((f) => !/\bsms\b/i.test(String(f)))
        .map((f) => (/employees?/i.test(String(f)) ? 'Up to 4 employees' : f)), BASIC_MESSAGING];
      if (!features.includes('Up to 4 employees')) features.unshift('Up to 4 employees');
      out.push({ ...plan, features, code: 'BASIC_6M', displayName: 'Basic · 6 Months', comingSoon: true });
      out.push({ ...plan, price: PLAN_PRICING.BASIC.price, features: [...features, `Additional shop: ${PLAN_PRICING.BASIC.extraOff}% off`], displayName: 'Basic · 12 Months' });
    } else if (plan.code === 'FREE_TRIAL') {
      out.push({ ...plan, features: ['1 shop only', ...(plan.features || []).filter((f) => !/shops?/i.test(String(f)))] });
    } else out.push(plan);
  }
  if (out.length) out.push({ code: 'PREMIUM', displayName: 'Premium · 12 Months', comingSoon: true, price: PLAN_PRICING.PREMIUM.price, features: [...PREMIUM_FEATURES, `Additional shop: ${PLAN_PRICING.PREMIUM.extraOff}% off`] });
  return out;
}

export default function SubscriptionScreen({ navigation, gated = false, onUnlock, onLogout }) {
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), 960), alignSelf: 'center' } : null;
  // Plan Details grid: 3 across on phones, 2 on very narrow ones, 5 on tablets.
  const detailCols = r.isTablet ? 5 : (r.width < 350 ? 2 : 3);

  const [ownerUserId, setOwnerUserId] = useState(null);
  const [isShopLogin, setIsShopLogin] = useState(false);
  const [current, setCurrent] = useState(null);
  // Live allowances + usage, from the same engine the create APIs enforce with.
  const [entitlements, setEntitlements] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upgrade flow state
  const [upgrading, setUpgrading] = useState(false);      // upgrade panel open
  const [shopCount, setShopCount] = useState(1);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Resolve the logged-in owner id (fetchMe heals old sessions; id === userId).
      let uid = null;
      try {
        const me = await fetchMe();
        uid = me?.id || me?.userId || null;
        setIsShopLogin(me?.loginScope === 'SHOP' || me?.loginType === 'SHOP_LOGIN');
      } catch {
        const s = await getSession();
        uid = s?.userId || s?.id || null;
        setIsShopLogin(s?.loginScope === 'SHOP' || s?.loginType === 'SHOP_LOGIN');
      }
      setOwnerUserId(uid);

      const [planList, cur, ent] = await Promise.all([
        subscriptionApi.get('/subscriptions/plans').catch(() => []),
        uid
          ? subscriptionApi.get(`/subscriptions/owner/${uid}`).catch(() => null)
          : Promise.resolve(null),
        // Live usage against live ceilings. The subscription ROW carries its own
        // limit columns, but those are a snapshot written when the row was
        // created — this payload is what the create APIs actually enforce, so
        // showing it is what keeps this screen honest.
        fetchEntitlements(),
      ]);
      setPlans(Array.isArray(planList) ? planList : []);
      setCurrent(cur || null);
      setEntitlements(ent || null);
    } catch (e) {
      setError(e?.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refetch the quote whenever the picked shop count changes (upgrade panel open).
  useEffect(() => {
    if (!upgrading) return;
    let cancelled = false;
    (async () => {
      setQuoteLoading(true);
      try {
        const q = await subscriptionApi.get('/subscriptions/quote', { query: { shops: shopCount } });
        if (!cancelled) setQuote(q || null);
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [upgrading, shopCount]);

  const currentType = current?.subscriptionType || null;
  const currentStatus = current?.status || null;
  // Upgrade CTA only when on trial or nothing active yet.
  const canUpgrade = !current || currentStatus === 'FREE_TRIAL' || currentStatus === 'EXPIRED' || currentStatus === 'CANCELLED';

  const fallbackQuoteTotal = useMemo(() => {
    const row = PRICING_ROWS.find((r2) => r2.shops === shopCount);
    return row ? row.amount : (shopCount >= 2 ? shopCount * 2500 : 3000);
  }, [shopCount]);

  const basicQuote = planTotal('BASIC', shopCount);
  const quoteTotal = basicQuote.total;

  const handleActivate = async () => {
    if (!ownerUserId) { setError('Could not resolve your account. Please try again.'); return; }
    setActivating(true);
    setError(null);
    try {
      await subscriptionApi.post('/subscriptions/activate', {
        body: { ownerUserId, shopCount },
      });
      // Re-read both, so the new allowances are in hand the moment the plan
      // changes. Nothing is cached anywhere, so every other screen picks the
      // upgrade up on its next focus — no manual reset of employees or shops.
      const [cur, ent] = await Promise.all([
        subscriptionApi.get(`/subscriptions/owner/${ownerUserId}`).catch(() => null),
        fetchEntitlements(),
      ]);
      setCurrent(cur || null);
      setEntitlements(ent || null);
      setActivated(true);
      setUpgrading(false);
    } catch (e) {
      setError(e?.message || 'Could not activate the plan. Please try again.');
    } finally {
      setActivating(false);
    }
  };

  // Opens the ONE real upgrade mechanism this app has — every non-current plan
  // card's CTA routes here rather than each pretending to activate its own
  // plan: there's no plan-code param on /subscriptions/activate, so "Upgrade
  // Now" on any card genuinely means "open Basic activation", and the panel
  // it opens says exactly that before anything is confirmed.
  const openUpgrade = () => {
    setActivated(false);
    setShopCount(Math.max(1, current?.shopCount || 1));
    setUpgrading(true);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header — same pattern as the Buy / Sell / Booking / Personal Info
          screens: white bar with a bottom border, round back button, centred
          title + subtitle, right slot (Logout while the plan gate is up). */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF', paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(12),
            borderBottomWidth: 1, borderBottomColor: BORDER,
          }}
        >
          <View style={capStyle}>
            <View className="flex-row items-center">
              {!gated ? (
                <Pressable
                  onPress={() => navigation?.goBack?.()}
                  hitSlop={8}
                  className="items-center justify-center"
                  style={{ height: rs(36), width: rs(36), borderRadius: rs(18), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER }}
                >
                  <ChevronLeft size={19} color={TEXT_PRIMARY} />
                </Pressable>
              ) : (
                <View style={{ width: rs(56) }} />
              )}
              <View className="flex-1 items-center" style={{ marginHorizontal: rs(8) }}>
                <Text className="font-extrabold" style={{ fontSize: T.headline, color: TEXT_PRIMARY }} numberOfLines={1}>
                  Subscription
                </Text>
                <Text style={{ fontSize: T.caption2, color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                  Manage your plan and features
                </Text>
              </View>
              {gated ? (
                <Pressable onPress={onLogout} hitSlop={8} style={{ width: rs(56), alignItems: 'flex-end', paddingVertical: rs(4) }}>
                  <Text className="font-extrabold" style={{ fontSize: T.caption1, color: '#B91C1C' }}>Logout</Text>
                </Pressable>
              ) : (
                <View style={{ width: rs(36) }} />
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={{ marginTop: rs(12), fontSize: 12.5, color: TEXT_SECONDARY }}>Loading your plan…</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: rs(14), paddingTop: rs(10), paddingBottom: 24 + r.insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <View style={capStyle}>
          {gated && !activated ? (
            <Notice tone="warn" icon={AlertCircle} title="Your free trial has ended">
              Choose a plan below to continue using Near G Fix. You can log out anytime from the top-right.
            </Notice>
          ) : null}

          {error ? <Notice tone="error" icon={AlertCircle} title={error} /> : null}

          {activated ? <Notice tone="ok" icon={CheckCircle2} title="Basic plan activated. You're all set!" /> : null}

          {gated && activated ? (
            <Pressable
              onPress={onUnlock}
              className="flex-row items-center justify-center"
              style={{ borderRadius: 14, paddingVertical: 12, marginBottom: rs(10), backgroundColor: ACCENT, ...cardShadow }}
            >
              <CheckCircle2 size={17} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ marginLeft: rs(8), fontSize: 14 }}>Continue to App</Text>
            </Pressable>
          ) : null}

          {/* ---------- CURRENT PLAN ---------- */}
          <CurrentPlanHero current={current} />

          {/* ---------- PLAN DETAILS (every line, as a compact grid) ---------- */}
          {current ? <PlanDetailsCard current={current} entitlements={entitlements} cols={detailCols} /> : null}

          {/* ---------- AVAILABLE PLANS ----------
              Shown on every login so no plan detail is hidden. Shop-scoped
              logins get them read-only: no upgrade CTA, because plan
              management, multi-shop pricing and payments stay in the owner's
              account. */}
          <View
            style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 12, marginTop: rs(10), borderWidth: 1, borderColor: BORDER, ...softShadow }}
          >
            <SectionHeader icon={ChartColumnIncreasing} title="Available Plans" />
            {plans.length === 0 ? (
              <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>No plans available right now.</Text>
            ) : (
              // Side by side, two to a row (one plan spans the full width).
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                {displayPlans(plans).map((plan) => (
                  <View key={plan.code} style={{ width: displayPlans(plans).length === 1 || r.isSmallPhone ? '100%' : '50%', padding: 4 }}>
                    <PlanCard
                      plan={plan}
                      isCurrent={!plan.comingSoon && (currentType === plan.code || currentType === plan.name)}
                      onUpgrade={canUpgrade && !isShopLogin ? openUpgrade : null}
                    />
                  </View>
                ))}
              </View>
            )}
            {isShopLogin ? (
              <View className="flex-row items-start" style={{ marginTop: 8 }}>
                <AlertCircle size={13} color={TEXT_SECONDARY} style={{ marginTop: 1 }} />
                <Text style={{ marginLeft: 6, flex: 1, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 15 }}>
                  Your plan is managed by the shop owner. Upgrades and payments are available from the owner&apos;s account.
                </Text>
              </View>
            ) : null}
          </View>

          {!isShopLogin ? (
            <>
              {/* ---------- UPGRADE PANEL (opened from any non-current plan's CTA) ---------- */}
              {upgrading ? (
                <View style={{ marginTop: rs(10) }}>
                  <UpgradePanel
                    shopCount={shopCount}
                    onDec={() => setShopCount((n) => Math.max(1, n - 1))}
                    onInc={() => setShopCount((n) => Math.min(5, n + 1))}
                    onSet={setShopCount}
                    quote={quote}
                    quoteLoading={quoteLoading}
                    quoteTotal={quoteTotal}
                    breakdown={basicQuote}
                    activating={activating}
                    onConfirm={handleActivate}
                    onCancel={() => setUpgrading(false)}
                  />
                </View>
              ) : null}
            </>
          ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const NOTICE_TONE = {
  warn: { bg: TRIAL_TINT, border: '#FDE68A', ink: '#B45309' },
  error: { bg: '#FEE2E2', border: '#FCA5A5', ink: '#B91C1C' },
  ok: { bg: MINT, border: '#C7E6EA', ink: PRIMARY },
};

/** One-line status banner (trial ended / error / activated). */
function Notice({ tone, icon: Icon, title, children }) {
  const t = NOTICE_TONE[tone];
  return (
    <View style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: rs(10), backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }}>
      <View className="flex-row items-center">
        <Icon size={15} color={t.ink} />
        <Text className="font-extrabold" style={{ marginLeft: rs(8), flex: 1, fontSize: 12.5, color: t.ink }}>{title}</Text>
      </View>
      {children ? <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 3, lineHeight: 16 }}>{children}</Text> : null}
    </View>
  );
}

/** Compact card heading: small icon + title, optional one-line caption. */
function SectionHeader({ icon: Icon, title, subtitle, right }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 10 }}>
      <View className="items-center justify-center" style={{ height: 28, width: 28, borderRadius: 9, backgroundColor: MINT, marginRight: 9 }}>
        <Icon size={14} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text className="font-extrabold" style={{ fontSize: 14, color: TEXT_PRIMARY }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function CurrentPlanHero({ current }) {
  if (!current) {
    return (
      <View style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: BORDER, ...softShadow }}>
        <View className="flex-row items-center">
          <View className="items-center justify-center" style={{ width: 38, height: 38, borderRadius: 12, marginRight: 10, backgroundColor: SOFT_MINT }}>
            <CreditCard size={18} color={TEXT_SECONDARY} />
          </View>
          <View className="flex-1">
            <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.8, color: TEXT_SECONDARY }}>Current Plan</Text>
            <Text className="font-extrabold" style={{ fontSize: 16, color: TEXT_PRIMARY, marginTop: 1 }}>No active plan</Text>
            <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 1 }}>Choose a plan below to get started.</Text>
          </View>
        </View>
      </View>
    );
  }

  const status = current.status || '';
  const meta = STATUS_META[status] || { label: status, color: TEXT_SECONDARY, tint: SOFT_MINT };
  const isTrial = status === 'FREE_TRIAL';
  const isActive = status === 'ACTIVE';
  const planName = current.subscriptionType === 'BASIC' || current.subscriptionType === 'Basic'
    ? 'Basic'
    : (current.subscriptionType === 'FREE_TRIAL' || isTrial ? 'Free Trial' : (current.subscriptionType || meta.label));
  const days = Number(current.daysRemaining);
  const description = STATUS_DESCRIPTION[status] || 'Manage your plan and features below.';

  return (
    <View style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: BORDER, ...softShadow }}>
      <View className="flex-row items-center">
        <View
          className="items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 13, marginRight: 10, backgroundColor: isTrial ? TRIAL_TINT : MINT }}
        >
          {isTrial ? <Gift size={20} color={TRIAL_ACCENT} /> : <Crown size={20} color={ACCENT} />}
        </View>
        <View className="flex-1">
          <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.8, color: TEXT_SECONDARY }}>Current Plan</Text>
          <View className="flex-row items-center flex-wrap" style={{ marginTop: 1 }}>
            <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY, marginRight: 7 }}>{planName}</Text>
            <View className="rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: meta.tint }}>
              <Text className="font-extrabold" style={{ fontSize: 9.5, color: meta.color, letterSpacing: 0.4 }}>{meta.label.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        {/* Time left / end date (trial) or validity + amount (active) */}
        {isTrial ? (
          <View className="items-end" style={{ marginLeft: 8, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: TRIAL_TINT }}>
            <View className="flex-row items-center">
              <Clock size={12} color={TRIAL_ACCENT} />
              <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 12.5, color: '#B45309' }}>
                {Number.isFinite(days) ? `${days} day${days === 1 ? '' : 's'} left` : 'Trial active'}
              </Text>
            </View>
            {formatDate(current.inactiveDate) ? (
              <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: 1 }}>Ends {formatDate(current.inactiveDate)}</Text>
            ) : null}
          </View>
        ) : isActive ? (
          <View className="items-end" style={{ marginLeft: 8, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: MINT }}>
            <View className="flex-row items-center">
              <Check size={12} color={PRIMARY} strokeWidth={3} />
              <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 12, color: PRIMARY }}>
                {formatDate(current.inactiveDate) ? `Until ${formatDate(current.inactiveDate)}` : 'Active'}
              </Text>
            </View>
            {money(current.priceAmount) ? (
              <Text className="font-extrabold" style={{ fontSize: 12, color: PRIMARY, marginTop: 1 }}>{money(current.priceAmount)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 7, lineHeight: 16 }}>{description}</Text>
    </View>
  );
}

function PlanDetailsCard({ current, entitlements, cols = 3 }) {
  const status = current.status || '';
  const isTrial = status === 'FREE_TRIAL';
  const days = Number(current.daysRemaining);
  const startedText = formatDate(current.activeDate || current.subscriptionStartDate || current.trialStartDate);
  const endsText = formatDate(current.inactiveDate || current.subscriptionEndDate || current.trialEndDate);

  // Live entitlement readings. Each falls back to null (tile hidden) when the
  // payload is unavailable — better a missing tile than a stale number presented
  // as the plan's actual allowance.
  //
  // Usage tiles come from the entitlements payload, NOT from the subscription
  // row's own limit columns. Those columns are a snapshot written when the row
  // was created, so a backfilled or pre-plan-change row can carry a number the
  // API no longer honours — and a plan screen that advertises an allowance the
  // create API refuses is the exact bug this system exists to prevent.
  // "Shops covered 1 of 2" is USED of ALLOWED — one shop currently open out of
  // two the plan permits — not "one shop has been paid for".
  const shopsCovered = coverageLabel(entitlements, FEATURE.SHOPS);
  const employeeUsage = usageLabel(entitlements, FEATURE.EMPLOYEES);
  const sellOrderUsage = usageLabel(entitlements, FEATURE.SELL_ORDERS);
  const pickupText = entitlements?.features?.pickupService === undefined
    ? null
    : (entitlements.features.pickupService ? 'Enabled' : 'Disabled');

  // What the Current Plan card above already shows (see CurrentPlanHero).
  const isActive = status === 'ACTIVE';
  const heroShowsEnd = (isTrial || isActive) && !!formatDate(current.inactiveDate);
  const heroShowsDays = isTrial && Number.isFinite(days);
  const heroShowsAmount = isActive && !!money(current.priceAmount);

  const items = [
    startedText ? { icon: Calendar, label: 'Started on', value: startedText } : null,
    endsText && !heroShowsEnd ? { icon: CalendarCheck, label: isTrial ? 'Trial ends' : 'Valid till', value: endsText } : null,
    Number.isFinite(days) && !heroShowsDays ? { icon: Timer, label: 'Days left', value: `${days} day${days === 1 ? '' : 's'}`, strong: true } : null,
    shopsCovered ? { icon: Store, label: 'Shops covered', value: shopsCovered } : null,
    employeeUsage ? { icon: Users, label: 'Employees', value: employeeUsage } : null,
    sellOrderUsage ? { icon: Package, label: 'Sell orders', value: sellOrderUsage } : null,
    pickupText ? {
      icon: Truck, label: 'Pickup service', value: pickupText,
      pillColor: pickupText === 'Enabled' ? PRIMARY : TEXT_SECONDARY, pillTint: pickupText === 'Enabled' ? MINT : SOFT_MINT,
    } : null,
    money(current.priceAmount) && !heroShowsAmount ? { icon: IndianRupee, label: 'Amount', value: money(current.priceAmount), strong: true } : null,
  ].filter(Boolean);
  if (items.length === 0) return null;

  // A plain list, like the plan cards' feature lists: one fact per row, the
  // full label on the left and its value on the right — nothing truncated
  // ("Shops covered", "Pickup service"). Tablets split it into two columns.
  const twoCols = cols >= 5;
  const half = Math.ceil(items.length / 2);
  const columns = twoCols ? [items.slice(0, half), items.slice(half)] : [items];

  return (
    <View style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 12, marginTop: rs(10), borderWidth: 1, borderColor: BORDER, ...softShadow }}>
      <SectionHeader icon={FileText} title="Plan Details" />
      <View className="flex-row" style={{ gap: 16 }}>
        {columns.map((colItems, ci) => (
          <View key={ci} style={{ flex: 1, minWidth: 0 }}>
            {colItems.map((it, i) => (
              <DetailRow key={it.label} {...it} isLast={i === colItems.length - 1} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** One Plan Details fact as a list row: mint icon + label left, value right. */
function DetailRow({ icon: Icon, label, value, pillColor, pillTint, strong, isLast }) {
  return (
    <View
      className="flex-row items-center"
      style={{ paddingVertical: 8, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: SOFT_MINT }}
    >
      <View className="items-center justify-center" style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: MINT, marginRight: 8 }}>
        <Icon size={11} color={ACCENT} />
      </View>
      <Text style={{ flex: 1, fontSize: 12, color: TEXT_SECONDARY }} numberOfLines={1}>{label}</Text>
      {pillColor ? (
        <View className="rounded-full" style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: pillTint || MINT }}>
          <Text className="font-extrabold" style={{ fontSize: 11, color: pillColor }} numberOfLines={1}>{value}</Text>
        </View>
      ) : (
        <Text
          className="font-extrabold"
          style={{ marginLeft: 8, fontSize: 13, color: strong ? PRIMARY : TEXT_PRIMARY, textAlign: 'right' }}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

// Plan colours from the app palette: Trial orange, Basic 6M blue, Basic teal,
// Premium navy with an orange crown.
const PLAN_SKIN = {
  FREE_TRIAL: { from: '#FAA700', to: '#F59E0B', accent: '#B45309', tint: '#FFF4DB' },
  BASIC_6M:   { from: '#0788C9', to: '#056A9C', accent: '#0788C9', tint: '#E6F3FA' },
  BASIC:      { from: '#035C6C', to: '#02434F', accent: '#035C6C', tint: '#E5F3F5' },
  PREMIUM:    { from: '#1C3053', to: '#0F1B30', accent: '#1C3053', tint: '#E8ECF3', crown: '#FAA700' },
};

function PlanCard({ plan, isCurrent, onUpgrade }) {
  const Icon = PLAN_ICON[plan.code] || Crown;
  const isTrial = plan.code === 'FREE_TRIAL';
  const skin = PLAN_SKIN[plan.code] || PLAN_SKIN.BASIC;
  const price = plan.comingSoon && !plan.price ? null
    : isTrial ? 'Free'
    : (money(plan.price) || '₹3,000');
  const period = plan.comingSoon && !plan.price ? null : isTrial ? `${plan.durationDays || 15} days` : '/ year';
  // Basic has an employee cap — the server's "Unlimited employees" line reads as Limited.
  const features = (Array.isArray(plan.features) ? plan.features : [])
    .map((f) => ((plan.code === 'BASIC' || plan.code === 'BASIC_6M') && typeof f === 'string' ? f.replace(/unlimited(s+employees?)/i, (_, rest) => `Limited${rest}`) : f));
  const badge = isCurrent ? 'Current Plan' : plan.comingSoon ? 'Coming soon' : null;

  return (
    <View
      style={{
        flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: CARD_BG,
        borderWidth: isCurrent ? 2 : 1, borderColor: isCurrent ? skin.from : BORDER,
        shadowColor: skin.from, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
      }}
    >
      {/* Header band: icon, name, badge, price */}
      <LinearGradient colors={[skin.from, skin.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 11, paddingTop: 11, paddingBottom: 12 }}>
        <View className="flex-row items-center">
          <View className="items-center justify-center" style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Icon size={15} color={skin.crown || '#FFFFFF'} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }} />
          {badge ? (
            <View className="flex-row items-center" style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.95)' }}>
              {isCurrent ? <Check size={9} color={skin.accent} strokeWidth={3.4} /> : <Clock size={9} color={skin.accent} strokeWidth={3} />}
              <Text className="font-extrabold" style={{ fontSize: 9.5, color: skin.accent, marginLeft: 3 }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="font-extrabold" style={{ fontSize: 14.5, color: '#FFFFFF', marginTop: 8 }} numberOfLines={1}>
          {plan.displayName || plan.name || (isTrial ? 'Free Trial' : 'Plan')}
        </Text>
        {price ? (
          <View className="flex-row items-end" style={{ marginTop: 2 }}>
            <Text className="font-extrabold" style={{ fontSize: 19, color: '#FFFFFF' }}>{price}</Text>
            {period ? <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginLeft: 4, marginBottom: 3 }}>{period}</Text> : null}
          </View>
        ) : (
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Launching soon</Text>
        )}
      </LinearGradient>

      {/* Features */}
      <View style={{ flex: 1, paddingHorizontal: 11, paddingTop: 10, paddingBottom: 11 }}>
        {features.map((f, i) => (
          <View key={i} className="flex-row items-start" style={{ marginBottom: 6 }}>
            <View className="items-center justify-center" style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: skin.tint, marginRight: 6, marginTop: 1 }}>
              <Check size={9} color={skin.accent} strokeWidth={3.4} />
            </View>
            <Text className="flex-1" style={{ fontSize: 11.5, color: TEXT_PRIMARY, lineHeight: 16 }} numberOfLines={2}>{f}</Text>
          </View>
        ))}

        {/* CTA: real plans only — coming-soon plans carry just the header badge. */}
        {!plan.comingSoon && !isCurrent && onUpgrade ? (
          <Pressable
            onPress={onUpgrade}
            className="items-center justify-center"
            style={({ pressed }) => ({
              marginTop: 'auto', borderRadius: 12, paddingVertical: 9, opacity: pressed ? 0.85 : 1,
              backgroundColor: isTrial ? '#FFFFFF' : skin.from, borderWidth: isTrial ? 1.5 : 0, borderColor: skin.from,
            })}
          >
            <Text className="font-extrabold" style={{ fontSize: 13, color: isTrial ? skin.accent : '#FFFFFF' }}>
              {isTrial ? 'Get Started' : 'Upgrade Now'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function UpgradePanel({
  shopCount, onDec, onInc, onSet, quote, quoteLoading, quoteTotal, breakdown, activating, onConfirm, onCancel,
}) {
  return (
    <View style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: BORDER, ...softShadow }}>
      <View className="flex-row items-center">
        <Crown size={16} color={ACCENT} />
        <Text className="font-extrabold" style={{ marginLeft: 7, fontSize: 14, color: TEXT_PRIMARY }}>Activate Basic Plan</Text>
      </View>
      <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 3 }}>How many shops do you want to cover?</Text>

      {/* Stepper + quick-pick chips 1..5 on one row (chips wrap below on <360pt phones) */}
      <View className="flex-row items-center flex-wrap" style={{ marginTop: 12, rowGap: 8 }}>
        <Pressable
          onPress={onDec}
          disabled={shopCount <= 1}
          hitSlop={6}
          className="items-center justify-center rounded-full"
          style={{ width: 36, height: 36, backgroundColor: MINT, opacity: shopCount <= 1 ? 0.45 : 1 }}
        >
          <Minus size={16} color={ACCENT} strokeWidth={2.6} />
        </Pressable>
        <View className="items-center" style={{ width: 62 }}>
          <Text className="font-extrabold" style={{ fontSize: 22, color: TEXT_PRIMARY }}>{shopCount}</Text>
          <Text className="uppercase font-bold" style={{ fontSize: 9.5, color: TEXT_SECONDARY, letterSpacing: 0.6 }}>shop{shopCount === 1 ? '' : 's'}</Text>
        </View>
        <Pressable
          onPress={onInc}
          disabled={shopCount >= 5}
          hitSlop={6}
          className="items-center justify-center rounded-full"
          style={{ width: 36, height: 36, backgroundColor: MINT, opacity: shopCount >= 5 ? 0.45 : 1 }}
        >
          <Plus size={16} color={ACCENT} strokeWidth={2.6} />
        </Pressable>
        <View className="flex-row flex-1 justify-end" style={{ minWidth: 170 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n === shopCount;
            return (
              <Pressable
                key={n}
                onPress={() => onSet(n)}
                className="items-center justify-center rounded-full"
                style={{ width: 30, height: 30, marginLeft: 4, backgroundColor: active ? ACCENT : SOFT_MINT }}
              >
                <Text className="font-extrabold" style={{ fontSize: 12.5, color: active ? '#FFFFFF' : TEXT_SECONDARY }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Total */}
      <View
        className="flex-row items-center"
        style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, backgroundColor: MINT, borderWidth: 1, borderColor: '#C7E6EA' }}
      >
        <Text className="font-bold flex-1" style={{ fontSize: 12, color: TEXT_SECONDARY }}>Total payable</Text>
        {quoteLoading ? (
          <ActivityIndicator color={ACCENT} />
        ) : (
          <Text className="font-extrabold" style={{ fontSize: 17, color: PRIMARY }}>{money(quoteTotal)}</Text>
        )}
      </View>
      {/* Breakdown: first shop, then additional shops at the discounted rate */}
      {breakdown ? (
        <View style={{ marginTop: 6, paddingHorizontal: 4 }}>
          <View className="flex-row">
            <Text className="flex-1" style={{ fontSize: 11.5, color: TEXT_SECONDARY }}>1st shop</Text>
            <Text className="font-bold" style={{ fontSize: 11.5, color: TEXT_PRIMARY }}>{money(breakdown.first)}</Text>
          </View>
          {breakdown.extraCount > 0 ? (
            <View className="flex-row" style={{ marginTop: 2 }}>
              <Text className="flex-1" style={{ fontSize: 11.5, color: TEXT_SECONDARY }}>
                {breakdown.extraCount} additional × {money(breakdown.extraEach)} <Text style={{ color: PRIMARY, fontWeight: '800' }}>({breakdown.extraOff}% off)</Text>
              </Text>
              <Text className="font-bold" style={{ fontSize: 11.5, color: TEXT_PRIMARY }}>{money(breakdown.extraCount * breakdown.extraEach)}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: PRIMARY, marginTop: 2 }}>Add more shops and save {breakdown.extraOff}% on each.</Text>
          )}
        </View>
      ) : null}

      {/* Confirm / cancel */}
      <View className="flex-row" style={{ marginTop: 12 }}>
        <Pressable
          onPress={onCancel}
          disabled={activating}
          className="items-center justify-center"
          style={{ flex: 1, marginRight: 8, borderRadius: 12, paddingVertical: 11, borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD_BG }}
        >
          <Text className="font-bold" style={{ fontSize: 13, color: TEXT_SECONDARY }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={activating}
          className="flex-row items-center justify-center"
          style={{ flex: 2, borderRadius: 12, paddingVertical: 11, backgroundColor: ACCENT, opacity: activating ? 0.6 : 1 }}
        >
          {activating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <CreditCard size={15} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ marginLeft: 7, fontSize: 13.5 }}>Confirm &amp; Activate</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
