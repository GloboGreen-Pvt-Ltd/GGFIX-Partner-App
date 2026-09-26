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
  ShieldCheck,
  Calendar,
  CalendarCheck,
  Timer,
  Users,
  Package,
  Truck,
  IndianRupee,
  ChartColumnIncreasing,
} from 'lucide-react-native';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';
import { subscriptionApi } from '../../api/client';
import { FEATURE, coverageLabel, fetchEntitlements, usageLabel } from '../../subscription/entitlements';
import { getSession } from '../../auth/session';
import { fetchMe } from '../../api/auth';

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';
const PRIMARY = '#006B57';
const BRIGHT = '#00A86B';
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const SUCCESS = '#16A34A';
const TRIAL_ACCENT = '#F59E0B';
const TRIAL_TINT = '#FEF3C7';
const PRO_ACCENT = '#8B5CF6';
const PRO_TINT = '#F3EEFF';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.07,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#0B1F14',
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
const PLAN_ICON = { FREE_TRIAL: Gift, BASIC: Crown };
const PLAN_TONE = {
  FREE_TRIAL: { accent: TRIAL_ACCENT, tint: TRIAL_TINT },
  BASIC:      { accent: ACCENT,       tint: MINT },
};
const DEFAULT_TONE = { accent: PRO_ACCENT, tint: PRO_TINT };

export default function SubscriptionScreen({ navigation, gated = false, onUnlock, onLogout }) {
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), 960), alignSelf: 'center' } : null;

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

  const quoteTotal = quote?.total ?? fallbackQuoteTotal;

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
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      <SafeAreaView edges={['top']} style={{ backgroundColor: PAGE_BG }}>
        {/* Header — decorative mint leaf shapes, same low-risk plain-View
            approximation used elsewhere in this app (no new SVG dependency). */}
        <View style={{ paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(12), overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: -rs(30), right: -rs(20), height: rs(140), width: rs(140), borderRadius: rs(70), backgroundColor: MINT, opacity: 0.6 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: rs(30), right: rs(30), height: rs(70), width: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT, opacity: 0.8 }} />

          <View style={capStyle}>
            <View className="flex-row items-start justify-between">
              <View className="flex-row items-center flex-1">
                {!gated ? (
                  <Pressable
                    onPress={() => navigation?.goBack?.()}
                    hitSlop={10}
                    style={{
                      height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(10),
                      alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
                      borderWidth: 1, borderColor: BORDER,
                    }}
                  >
                    <ChevronLeft size={rf(19)} color={TEXT_PRIMARY} />
                  </Pressable>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text className="font-extrabold" style={{ fontSize: rf(24), color: TEXT_PRIMARY }} numberOfLines={1}>
                    Subscription
                  </Text>
                  <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                    Manage your plan and features
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                {gated ? (
                  <Pressable onPress={onLogout} hitSlop={8} style={{ paddingHorizontal: rs(4), paddingVertical: rs(4) }}>
                    <Text className="font-extrabold" style={{ fontSize: rf(12), color: '#B91C1C' }}>Logout</Text>
                  </Pressable>
                ) : (
                  <View
                    className="flex-row items-center rounded-full"
                    style={{ paddingHorizontal: rs(12), paddingVertical: rs(7), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, ...softShadow }}
                  >
                    <Crown size={rf(12)} color={ACCENT} />
                    <Text className="font-extrabold" style={{ fontSize: rf(10.5), color: ACCENT, marginLeft: rs(5) }}>
                      {isShopLogin ? 'SHOP' : 'OWNER'}
                    </Text>
                  </View>
                )}
                <View style={{ marginTop: rs(8), alignItems: 'flex-end' }}>
                  <Text style={styles_heroBrand}>GROW</Text>
                  <Text style={styles_heroBrand}>YOUR SHOP</Text>
                  <Text style={styles_heroBrand}>WITH US</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={{ marginTop: rs(12), fontSize: rf(12.5), color: TEXT_SECONDARY }}>Loading your plan…</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: rs(16), paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={capStyle}>
          {gated && !activated ? (
            <View className="rounded-2xl" style={{ paddingHorizontal: rs(14), paddingVertical: rs(12), marginBottom: rs(12), backgroundColor: TRIAL_TINT, borderWidth: 1, borderColor: '#FDE68A' }}>
              <View className="flex-row items-center">
                <AlertCircle size={rf(16)} color="#B45309" />
                <Text className="font-extrabold" style={{ marginLeft: rs(8), flex: 1, fontSize: rf(13), color: '#B45309' }}>
                  Your free trial has ended
                </Text>
              </View>
              <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY, marginTop: rs(4) }}>
                Choose a plan below to continue using GGFIX. You can log out anytime from the top-right.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View
              className="flex-row items-center rounded-2xl"
              style={{ paddingHorizontal: rs(14), paddingVertical: rs(12), marginBottom: rs(12), backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
            >
              <AlertCircle size={rf(16)} color="#B91C1C" />
              <Text className="font-semibold" style={{ marginLeft: rs(8), flex: 1, fontSize: rf(12.5), color: '#B91C1C' }}>
                {error}
              </Text>
            </View>
          ) : null}

          {activated ? (
            <View
              className="flex-row items-center rounded-2xl"
              style={{ paddingHorizontal: rs(14), paddingVertical: rs(12), marginBottom: rs(12), backgroundColor: MINT, borderWidth: 1, borderColor: BRIGHT }}
            >
              <CheckCircle2 size={rf(18)} color={ACCENT} />
              <Text className="font-extrabold" style={{ marginLeft: rs(8), flex: 1, fontSize: rf(12.5), color: ACCENT }}>
                Basic plan activated. You&apos;re all set!
              </Text>
            </View>
          ) : null}

          {gated && activated ? (
            <Pressable
              onPress={onUnlock}
              className="flex-row items-center justify-center rounded-2xl"
              style={{ paddingVertical: rs(13), marginBottom: rs(10), backgroundColor: ACCENT, ...cardShadow }}
            >
              <CheckCircle2 size={rf(18)} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ marginLeft: rs(8), fontSize: rf(15) }}>Continue to App</Text>
            </Pressable>
          ) : null}

          {/* ---------- CURRENT PLAN HERO ---------- */}
          <CurrentPlanHero current={current} />

          {/* ---------- PLAN DETAILS ---------- */}
          {current ? <PlanDetailsCard current={current} entitlements={entitlements} /> : null}

          {/* Shop-scoped logins see only the current plan — plan management,
              multi-shop pricing, and upgrades stay in the owner's account. */}
          {isShopLogin ? (
            <View
              className="flex-row items-start"
              style={{ backgroundColor: CARD_BG, borderRadius: rs(18), padding: rs(12), marginTop: rs(11), borderWidth: 1, borderColor: BORDER, ...softShadow }}
            >
              <AlertCircle size={rf(16)} color={TEXT_SECONDARY} />
              <Text style={{ marginLeft: rs(8), flex: 1, fontSize: rf(12.5), color: TEXT_SECONDARY, lineHeight: rf(18) }}>
                Your plan is managed by the shop owner. Upgrades and payments are available from the owner&apos;s account.
              </Text>
            </View>
          ) : (
            <>
              {/* ---------- AVAILABLE PLANS ---------- */}
              <View
                style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(13), marginTop: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
              >
                <SectionHeader
                  icon={ChartColumnIncreasing}
                  title="Available Plans"
                  subtitle="Choose the best plan for your business"
                />
                {plans.length === 0 ? (
                  <Text style={{ fontSize: rf(12.5), color: TEXT_SECONDARY }}>No plans available right now.</Text>
                ) : (
                  plans.map((plan, i) => (
                    <PlanCard
                      key={plan.code}
                      plan={plan}
                      isCurrent={currentType === plan.code || currentType === plan.name}
                      onUpgrade={canUpgrade ? openUpgrade : null}
                      last={i === plans.length - 1}
                    />
                  ))
                )}
              </View>

              {/* ---------- UPGRADE PANEL (opened from any non-current plan's CTA) ---------- */}
              {upgrading ? (
                <View style={{ marginTop: rs(16) }}>
                  <UpgradePanel
                    shopCount={shopCount}
                    onDec={() => setShopCount((n) => Math.max(1, n - 1))}
                    onInc={() => setShopCount((n) => Math.min(5, n + 1))}
                    onSet={setShopCount}
                    quote={quote}
                    quoteLoading={quoteLoading}
                    quoteTotal={quoteTotal}
                    activating={activating}
                    onConfirm={handleActivate}
                    onCancel={() => setUpgrading(false)}
                  />
                </View>
              ) : null}
            </>
          )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles_heroBrand = { fontSize: rf(8), fontWeight: '800', letterSpacing: 1.2, color: TEXT_SECONDARY };

/* ------------------------------------------------------------------ */

function SectionHeader({ icon: Icon, title, subtitle, right }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: rs(13) }}>
      <View
        className="items-center justify-center"
        style={{ height: rs(36), width: rs(36), borderRadius: rs(13), backgroundColor: MINT, marginRight: rs(11) }}
      >
        <Icon size={rf(16)} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text className="font-extrabold" style={{ fontSize: rf(16), color: TEXT_PRIMARY }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: rf(11), color: TEXT_SECONDARY, marginTop: rs(1) }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function CurrentPlanHero({ current }) {
  if (!current) {
    return (
      <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), marginTop: rs(11), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
        <View className="flex-row items-center">
          <View className="items-center justify-center" style={{ width: rs(44), height: rs(44), borderRadius: rs(15), marginRight: rs(11), backgroundColor: SOFT_MINT }}>
            <CreditCard size={rf(19)} color={TEXT_SECONDARY} />
          </View>
          <View className="flex-1">
            <Text className="uppercase font-bold" style={{ fontSize: rf(9.5), letterSpacing: 1, color: TEXT_SECONDARY }}>
              Current Plan
            </Text>
            <Text className="font-extrabold" style={{ fontSize: rf(16), color: TEXT_PRIMARY, marginTop: rs(2) }}>No active plan</Text>
            <Text style={{ fontSize: rf(11.5), color: TEXT_SECONDARY, marginTop: rs(2) }}>Choose a plan below to get started.</Text>
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
    <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), marginTop: rs(11), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
      <View className="flex-row items-start">
        <View
          className="items-center justify-center"
          style={{ width: rs(48), height: rs(48), borderRadius: rs(16), marginRight: rs(11), backgroundColor: isTrial ? TRIAL_TINT : MINT }}
        >
          {isTrial ? <Gift size={rf(24)} color={TRIAL_ACCENT} /> : <Crown size={rf(24)} color={ACCENT} />}
        </View>
        <View className="flex-1">
          <Text className="uppercase font-bold" style={{ fontSize: rf(9.5), letterSpacing: 1, color: TEXT_SECONDARY }}>
            Current Plan
          </Text>
          <View className="flex-row items-center flex-wrap" style={{ marginTop: rs(2) }}>
            <Text className="font-extrabold" style={{ fontSize: rf(24), color: TEXT_PRIMARY, marginRight: rs(8) }}>{planName}</Text>
            <View className="rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: meta.tint }}>
              <Text className="font-extrabold" style={{ fontSize: rf(9.5), color: meta.color, letterSpacing: 0.4 }}>
                {meta.label.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: rf(11.5), color: TEXT_SECONDARY, marginTop: rs(4), lineHeight: rf(16) }}>
            {description}
          </Text>
        </View>
        {/* Small calendar+check mark — an icon-based stand-in for a full
            illustration graphic (no image asset was supplied). */}
        <View
          className="items-center justify-center"
          style={{ width: rs(44), height: rs(44), borderRadius: rs(14), marginLeft: rs(6), backgroundColor: isTrial ? TRIAL_TINT : MINT }}
        >
          <Calendar size={rf(20)} color={isTrial ? TRIAL_ACCENT : ACCENT} />
        </View>
      </View>

      {isTrial ? (
        <View
          className="flex-row items-center rounded-2xl"
          style={{ paddingHorizontal: rs(13), paddingVertical: rs(12), marginTop: rs(14), backgroundColor: TRIAL_TINT, borderWidth: 1, borderColor: '#FDE68A' }}
        >
          <View className="items-center justify-center" style={{ width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: '#FFFFFF' }}>
            <Clock size={rf(14)} color={TRIAL_ACCENT} />
          </View>
          <Text className="font-extrabold" style={{ marginLeft: rs(9), fontSize: rf(13), color: '#B45309' }}>
            {Number.isFinite(days) ? `${days} day${days === 1 ? '' : 's'} left` : 'Trial active'}
          </Text>
          {formatDate(current.inactiveDate) ? (
            <Text className="font-semibold" style={{ marginLeft: 'auto', fontSize: rf(11.5), color: TEXT_SECONDARY }}>
              Ends {formatDate(current.inactiveDate)}
            </Text>
          ) : null}
        </View>
      ) : isActive ? (
        <View
          className="flex-row items-center rounded-2xl"
          style={{ paddingHorizontal: rs(13), paddingVertical: rs(12), marginTop: rs(14), backgroundColor: MINT, borderWidth: 1, borderColor: BORDER }}
        >
          <View className="items-center justify-center" style={{ width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: ACCENT }}>
            <Check size={rf(15)} color="#FFFFFF" strokeWidth={2.6} />
          </View>
          <Text className="font-extrabold" style={{ marginLeft: rs(9), fontSize: rf(13.5), color: ACCENT }}>
            {formatDate(current.inactiveDate) ? `Active until ${formatDate(current.inactiveDate)}` : 'Active'}
          </Text>
          {money(current.priceAmount) ? (
            <Text className="font-extrabold" style={{ marginLeft: 'auto', fontSize: rf(15), color: ACCENT }}>
              {money(current.priceAmount)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PlanDetailsCard({ current, entitlements }) {
  const status = current.status || '';
  const meta = STATUS_META[status] || { label: status, color: TEXT_SECONDARY, tint: SOFT_MINT };
  const isTrial = status === 'FREE_TRIAL';
  const planName = current.subscriptionType === 'BASIC' || current.subscriptionType === 'Basic'
    ? 'Basic'
    : (current.subscriptionType === 'FREE_TRIAL' || isTrial ? 'Free Trial' : (current.subscriptionType || meta.label));
  const days = Number(current.daysRemaining);
  const startedText = formatDate(current.activeDate || current.subscriptionStartDate || current.trialStartDate);
  const endsText = formatDate(current.inactiveDate || current.subscriptionEndDate || current.trialEndDate);

  // Live entitlement readings. Each falls back to null (line hidden) when the
  // payload is unavailable — better a missing row than a stale number presented
  // as the plan's actual allowance.
  const shopsCovered = coverageLabel(entitlements, FEATURE.SHOPS);
  const employeeUsage = usageLabel(entitlements, FEATURE.EMPLOYEES);
  const sellOrderUsage = usageLabel(entitlements, FEATURE.SELL_ORDERS);
  const pickupText = entitlements?.features?.pickupService === undefined
    ? null
    : (entitlements.features.pickupService ? 'Enabled' : 'Disabled');

  return (
    <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(13), marginTop: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
      <SectionHeader icon={FileText} title="Plan Details" subtitle="Complete information about your current plan" />
      <DetailLine icon={Crown} label="Plan" value={planName} />
      <DetailLine icon={ShieldCheck} label="Status" value={meta.label} pillColor={meta.color} pillTint={meta.tint} />
      {startedText ? <DetailLine icon={Calendar} label="Started on" value={startedText} /> : null}
      {endsText ? <DetailLine icon={CalendarCheck} label={isTrial ? 'Trial ends' : 'Valid till'} value={endsText} /> : null}
      {Number.isFinite(days) ? (
        <DetailLine icon={Timer} label="Days remaining" value={`${days} day${days === 1 ? '' : 's'}`} bold />
      ) : null}
      {/*
        Usage lines come from the entitlements payload, NOT from the
        subscription row's own limit columns. Those columns are a snapshot
        written when the row was created, so a backfilled or pre-plan-change
        row can carry a number the API no longer honours — and a plan screen
        that advertises an allowance the create API refuses is the exact bug
        this system exists to prevent.

        "Shops Covered 1 of 2" is USED of ALLOWED — one shop currently open
        out of two the plan permits — not "one shop has been paid for".
      */}
      {shopsCovered ? <DetailLine icon={Store} label="Shops covered" value={shopsCovered} /> : null}
      {employeeUsage ? <DetailLine icon={Users} label="Employees" value={employeeUsage} /> : null}
      {sellOrderUsage ? <DetailLine icon={Package} label="Sell orders" value={sellOrderUsage} /> : null}
      {pickupText ? <DetailLine icon={Truck} label="Pickup service" value={pickupText} pillColor={pickupText === 'Enabled' ? SUCCESS : TEXT_SECONDARY} pillTint={pickupText === 'Enabled' ? MINT : SOFT_MINT} /> : null}
      {money(current.priceAmount) ? (
        <DetailLine icon={IndianRupee} label="Amount" value={money(current.priceAmount)} bold last />
      ) : null}
    </View>
  );
}

function DetailLine({ icon: Icon, label, value, valueColor, pillColor, pillTint, bold, last }) {
  return (
    <View
      className="flex-row items-center justify-between"
      style={{ paddingVertical: rs(11), borderTopWidth: 1, borderTopColor: BORDER, ...(last ? { } : {}) }}
    >
      <View className="flex-row items-center flex-1" style={{ marginRight: rs(8) }}>
        <View className="items-center justify-center" style={{ width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: MINT, marginRight: rs(10) }}>
          <Icon size={rf(13)} color={ACCENT} />
        </View>
        <Text style={{ fontSize: rf(13), color: TEXT_SECONDARY }} numberOfLines={1}>{label}</Text>
      </View>
      {pillColor ? (
        <View className="rounded-full" style={{ paddingHorizontal: rs(10), paddingVertical: rs(4), backgroundColor: pillTint || MINT }}>
          <Text className="font-extrabold" style={{ fontSize: rf(11.5), color: pillColor }}>{value}</Text>
        </View>
      ) : (
        <Text
          className={bold ? 'font-extrabold' : 'font-bold'}
          style={{ fontSize: bold ? rf(15) : rf(13.5), color: valueColor || TEXT_PRIMARY }}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

function PlanCard({ plan, isCurrent, onUpgrade, last }) {
  const Icon = PLAN_ICON[plan.code] || Crown;
  const isTrial = plan.code === 'FREE_TRIAL';
  const tone = PLAN_TONE[plan.code] || DEFAULT_TONE;
  const priceLabel = isTrial
    ? `Free · ${plan.durationDays || 15} days`
    : `${money(plan.price) || '₹3,000'} / year`;
  const features = Array.isArray(plan.features) ? plan.features : [];

  return (
    <View
      style={{
        borderRadius: rs(18), padding: rs(12), marginBottom: last ? 0 : rs(10),
        backgroundColor: isCurrent ? MINT : CARD_BG,
        borderWidth: isCurrent ? 1.5 : 1,
        borderColor: isCurrent ? BRIGHT : BORDER,
        ...softShadow,
      }}
    >
      {isCurrent ? (
        <View style={{ position: 'absolute', top: rs(12), right: rs(12), borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: ACCENT }}>
          <Text className="text-white font-extrabold" style={{ fontSize: rf(9) }}>Current Plan</Text>
        </View>
      ) : null}

      <View className="flex-row items-center">
        <View className="items-center justify-center" style={{ width: rs(48), height: rs(48), borderRadius: rs(16), marginRight: rs(12), backgroundColor: tone.tint }}>
          <Icon size={rf(21)} color={tone.accent} />
        </View>
        <View className="flex-1">
          <Text className="font-extrabold" style={{ fontSize: rf(17), color: TEXT_PRIMARY }} numberOfLines={1}>
            {plan.name || (isTrial ? 'Free Trial' : 'Plan')}
          </Text>
          <Text className="font-extrabold" style={{ fontSize: rf(13.5), color: tone.accent, marginTop: rs(2) }}>
            {priceLabel}
          </Text>
        </View>
      </View>

      {features.length > 0 ? (
        <View style={{ marginTop: rs(12) }}>
          {features.map((f, i) => (
            <View key={i} className="flex-row items-center" style={{ marginBottom: rs(7) }}>
              <View className="items-center justify-center" style={{ width: rs(19), height: rs(19), borderRadius: rs(10), backgroundColor: MINT, marginRight: rs(8) }}>
                <Check size={rf(11)} color={ACCENT} strokeWidth={3} />
              </View>
              <Text className="flex-1" style={{ fontSize: rf(12), color: TEXT_PRIMARY, lineHeight: rf(16) }}>{f}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {isCurrent ? (
        <View
          className="flex-row items-center justify-center rounded-2xl"
          style={{ marginTop: rs(13), paddingVertical: rs(12), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BRIGHT, opacity: 0.85 }}
        >
          <Check size={rf(15)} color={ACCENT} strokeWidth={2.6} />
          <Text className="font-extrabold" style={{ marginLeft: rs(6), fontSize: rf(13), color: ACCENT }}>Current Plan</Text>
        </View>
      ) : onUpgrade ? (
        <Pressable
          onPress={onUpgrade}
          className="items-center justify-center rounded-2xl"
          style={
            isTrial
              ? { marginTop: rs(13), paddingVertical: rs(12), backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: tone.accent }
              : { marginTop: rs(13), paddingVertical: rs(12), backgroundColor: ACCENT }
          }
        >
          <Text className="font-extrabold" style={{ fontSize: rf(13), color: isTrial ? tone.accent : '#FFFFFF' }}>
            {isTrial ? 'Get Started' : 'Upgrade Now'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function UpgradePanel({
  shopCount, onDec, onInc, onSet, quote, quoteLoading, quoteTotal, activating, onConfirm, onCancel,
}) {
  return (
    <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(13), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
      <View className="flex-row items-center">
        <Crown size={rf(18)} color={ACCENT} />
        <Text className="font-extrabold" style={{ marginLeft: rs(8), fontSize: rf(15), color: TEXT_PRIMARY }}>Activate Basic Plan</Text>
      </View>
      <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY, marginTop: rs(4) }}>
        How many shops do you want to cover?
      </Text>

      {/* Stepper */}
      <View className="flex-row items-center justify-center" style={{ marginTop: rs(16) }}>
        <Pressable
          onPress={onDec}
          disabled={shopCount <= 1}
          className="items-center justify-center rounded-full"
          style={{ width: rs(44), height: rs(44), backgroundColor: shopCount <= 1 ? SOFT_MINT : MINT, opacity: shopCount <= 1 ? 0.5 : 1 }}
        >
          <Minus size={rf(18)} color={ACCENT} strokeWidth={2.6} />
        </Pressable>
        <View className="items-center" style={{ marginHorizontal: rs(24) }}>
          <Text className="font-extrabold" style={{ fontSize: rf(30), color: TEXT_PRIMARY }}>{shopCount}</Text>
          <Text className="uppercase font-bold" style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, letterSpacing: 0.6 }}>
            shop{shopCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Pressable
          onPress={onInc}
          disabled={shopCount >= 5}
          className="items-center justify-center rounded-full"
          style={{ width: rs(44), height: rs(44), backgroundColor: shopCount >= 5 ? SOFT_MINT : MINT, opacity: shopCount >= 5 ? 0.5 : 1 }}
        >
          <Plus size={rf(18)} color={ACCENT} strokeWidth={2.6} />
        </Pressable>
      </View>

      {/* Quick-pick chips 1..5 */}
      <View className="flex-row justify-center" style={{ marginTop: rs(16), marginHorizontal: -rs(3) }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n === shopCount;
          return (
            <Pressable
              key={n}
              onPress={() => onSet(n)}
              className="items-center justify-center rounded-full"
              style={{ width: rs(36), height: rs(36), marginHorizontal: rs(3), backgroundColor: active ? ACCENT : SOFT_MINT }}
            >
              <Text className="font-extrabold" style={{ fontSize: rf(13), color: active ? '#FFFFFF' : TEXT_SECONDARY }}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Total */}
      <View
        className="flex-row items-center rounded-2xl"
        style={{ paddingHorizontal: rs(16), paddingVertical: rs(13), marginTop: rs(16), backgroundColor: MINT, borderWidth: 1, borderColor: BORDER }}
      >
        <Text className="font-bold flex-1" style={{ fontSize: rf(12.5), color: TEXT_SECONDARY }}>Total payable</Text>
        {quoteLoading ? (
          <ActivityIndicator color={ACCENT} />
        ) : (
          <Text className="font-extrabold" style={{ fontSize: rf(20), color: ACCENT }}>
            {money(quoteTotal)}
          </Text>
        )}
      </View>
      {quote?.discountApplied ? (
        <Text className="font-semibold text-center" style={{ fontSize: rf(11), color: PRIMARY, marginTop: rs(6) }}>
          Multi-shop discount applied ({money(quote.pricePerShop)}/shop)
        </Text>
      ) : null}

      {/* Confirm / cancel */}
      <Pressable
        onPress={onConfirm}
        disabled={activating}
        className="flex-row items-center justify-center rounded-2xl"
        style={{ paddingVertical: rs(14), marginTop: rs(16), backgroundColor: ACCENT, opacity: activating ? 0.6 : 1 }}
      >
        {activating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <CreditCard size={rf(16)} color="#FFFFFF" />
            <Text className="text-white font-extrabold" style={{ marginLeft: rs(8), fontSize: rf(14.5) }}>
              Confirm &amp; Activate
            </Text>
          </>
        )}
      </Pressable>
      <Pressable
        onPress={onCancel}
        disabled={activating}
        className="items-center justify-center"
        style={{ paddingVertical: rs(12), marginTop: rs(4) }}
      >
        <Text className="font-bold" style={{ fontSize: rf(13), color: TEXT_SECONDARY }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
