import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronDown,
  History,
  Calendar,
  TrendingUp,
  ChevronRight,
  ClipboardCheck,
  Wrench,
  CheckCircle2,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { EmptyState } from '../../components/rnr';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';
const PRIMARY = '#006B57';
const BRIGHT = '#00A86B';
const ACTIVE_GREEN = '#16A34A';
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FCFA';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const INACTIVE_TEXT = '#8A9694';
const INACTIVE_BG = '#F1F5F3';
const AMBER = '#F59E0B';
const AMBER_BG = '#FFF3E0';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

// We don't have a dedicated "monthly snapshot" endpoint, so we derive the
// previous report from the existing /tickets feed: pull a wide window of
// recent tickets, group by month, and tally by status. Cheap, accurate,
// no schema change required.
const MONTHS_TO_SHOW = 6;
const PAGE_SIZE      = 500;

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date) {
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

const STATUS_BUCKETS = [
  { key: 'CREATED',     label: 'Accepted',    icon: ClipboardCheck },
  { key: 'IN_PROGRESS', label: 'In Service',  icon: Wrench },
  { key: 'READY',       label: 'Ready',       icon: CheckCircle2 },
  { key: 'DELIVERED',   label: 'Delivered',   icon: PackageCheck },
  // Pending gets its own amber accent when active — every other bucket
  // shares the same active-green / inactive-grey rule.
  { key: 'PENDING',     label: 'Pending',     icon: AlertTriangle, amber: true },
];

const STATUS_TO_BUCKET = {
  CREATED:              'CREATED',
  ASSIGNED:             'CREATED',
  IN_DIAGNOSIS:         'IN_PROGRESS',
  IN_REPAIR:            'IN_PROGRESS',
  QUOTED:               'PENDING',
  APPROVED:             'PENDING',
  READY:                'READY',
  INVOICE_GENERATED:    'READY',
  INVOICE_READY:        'READY',
  DELIVERED_PROCESSING: 'READY',
  DELIVERED:            'DELIVERED',
  CANCELLED:            'PENDING',
};

function buildMonthlySnapshots(tickets) {
  // Build last N months (oldest → newest) so we can render the most recent
  // at the top after reversal.
  const now = new Date();
  const months = [];
  for (let i = MONTHS_TO_SHOW - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), date: d, label: monthLabel(d) });
  }

  const byMonth = Object.fromEntries(months.map((m) => [m.key, {
    key: m.key,
    date: m.date,
    label: m.label,
    total: 0,
    buckets: Object.fromEntries(STATUS_BUCKETS.map((b) => [b.key, 0])),
  }]));

  (tickets || []).forEach((t) => {
    if (!t.createdAt) return;
    const d = new Date(t.createdAt);
    if (Number.isNaN(d.getTime())) return;
    const k = monthKey(d);
    const row = byMonth[k];
    if (!row) return;
    row.total += 1;
    const bucket = STATUS_TO_BUCKET[String(t.status || '').toUpperCase()];
    if (bucket && row.buckets[bucket] != null) row.buckets[bucket] += 1;
  });

  // Newest first, drop empty leading months only if everything in the window
  // is zero (otherwise empty months are useful context).
  return months.slice().reverse().map((m) => byMonth[m.key]);
}

export default function BookingPreviousReportScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), 900), alignSelf: 'center' } : null;
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get('/tickets', { query: { page: 0, size: PAGE_SIZE } });
      const arr = Array.isArray(data) ? data : data?.content || [];
      setTickets(arr);
    } catch (e) {
      setError(e.message || 'Failed to load reports');
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const months = useMemo(() => buildMonthlySnapshots(tickets), [tickets]);
  const grandTotal = useMemo(() => months.reduce((s, m) => s + m.total, 0), [months]);
  const windowRange = months.length
    ? `${months[months.length - 1].label.split(' ')[0]} – ${months[0].label.split(' ')[0]}`
    : '';

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      {/* Header — decorative mint leaf shapes, same low-risk plain-View
          approximation used elsewhere in this app. */}
      <View style={{ paddingHorizontal: rs(16), paddingTop: insets.top + rs(8), paddingBottom: rs(14), overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: -rs(30), right: -rs(20), height: rs(140), width: rs(140), borderRadius: rs(70), backgroundColor: MINT, opacity: 0.6 }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: rs(30), right: rs(40), height: rs(70), width: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT, opacity: 0.8 }} />

        <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={6}
            style={{
              height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(10),
              alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
              borderWidth: 1, borderColor: BORDER,
            }}
          >
            <ChevronLeft size={rf(19)} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <Text className="font-extrabold flex-1" style={{ fontSize: 19, color: TEXT_PRIMARY }} numberOfLines={1}>
            Previous Reports
          </Text>
          <View
            className="flex-row items-center rounded-full"
            style={{ paddingHorizontal: rs(12), paddingVertical: rs(8), backgroundColor: MINT, borderWidth: 1, borderColor: BRIGHT }}
          >
            <History size={rf(13)} color={ACCENT} />
            <Text className="font-extrabold" style={{ marginLeft: rs(6), fontSize: 11.5, color: ACCENT }} numberOfLines={1}>
              {MONTHS_TO_SHOW} months
            </Text>
            <ChevronDown size={rf(13)} color={ACCENT} style={{ marginLeft: rs(3) }} />
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingBottom: insets.bottom + rs(28) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={ACCENT} colors={[ACCENT]} />
        }
      >
        <View style={capStyle}>
          {/* Intro */}
          <View style={{ marginBottom: rs(14) }}>
            <View className="flex-row items-center">
              <Calendar size={rf(12)} color={ACCENT} />
              <Text className="font-extrabold" style={{ marginLeft: rs(5), fontSize: 11.5, color: ACCENT, letterSpacing: 1 }}>
                LAST {MONTHS_TO_SHOW} MONTHS
              </Text>
            </View>
            <Text className="font-extrabold" style={{ fontSize: 23, color: TEXT_PRIMARY, marginTop: rs(4) }}>
              Monthly status snapshots
            </Text>
            <Text style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: rs(4), lineHeight: rf(19) }}>
              A quick overview of your bookings and their status for the last {MONTHS_TO_SHOW} months.
            </Text>
          </View>

          {/* Summary card */}
          <View
            className="flex-row items-center"
            style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(13), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
          >
            <View className="items-center justify-center" style={{ width: rs(46), height: rs(46), borderRadius: rs(15), backgroundColor: MINT, marginRight: rs(12) }}>
              <TrendingUp size={rf(20)} color={ACCENT} />
            </View>
            <View className="flex-1">
              <Text className="uppercase font-bold" style={{ fontSize: 10.5, color: TEXT_SECONDARY, letterSpacing: 0.7 }}>
                Total in window
              </Text>
              <Text className="font-extrabold" style={{ fontSize: 17.5, color: TEXT_PRIMARY, marginTop: rs(1) }}>
                {grandTotal} bookings
              </Text>
            </View>
            {windowRange ? (
              <>
                <View style={{ width: 1, height: rs(28), backgroundColor: BORDER, marginHorizontal: rs(10) }} />
                <View className="flex-row items-center">
                  <Calendar size={rf(12)} color={TEXT_SECONDARY} />
                  <Text style={{ marginLeft: rs(5), fontSize: 11.5, color: TEXT_SECONDARY }} numberOfLines={1}>
                    {windowRange}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {error ? (
            <View style={{ marginTop: rs(14) }}>
              <View
                className="rounded-2xl"
                style={{ paddingHorizontal: rs(14), paddingVertical: rs(11), backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
              >
                <Text className="font-semibold" style={{ fontSize: 12.5, color: '#B91C1C' }}>{error}</Text>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View className="items-center" style={{ paddingVertical: rs(40) }}>
              <ActivityIndicator size="large" color={ACCENT} />
            </View>
          ) : months.every((m) => m.total === 0) ? (
            <View style={{ marginTop: rs(20) }}>
              <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
                <EmptyState
                  icon={<History size={rf(28)} color={ACCENT} />}
                  title="No history yet"
                  description="Once bookings start flowing in, you'll see monthly snapshots here."
                  className="py-10"
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: rs(18) }}>
              {months.map((m, idx) => (
                <MonthCard
                  key={m.key}
                  month={m}
                  isCurrent={idx === 0}
                  onTap={() => navigation.navigate('OwnerTabs', { screen: 'Bookings' })}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function MonthCard({ month, isCurrent, onTap }) {
  return (
    <Pressable
      onPress={onTap}
      android_ripple={{ color: SOFT_MINT }}
      style={{
        backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(14), marginBottom: rs(12),
        borderWidth: 1, borderColor: BORDER, ...cardShadow,
      }}
    >
      {/* Header row */}
      <View className="flex-row items-center" style={{ marginBottom: rs(12) }}>
        <View
          className="items-center justify-center"
          style={{ width: rs(40), height: rs(40), borderRadius: rs(14), backgroundColor: MINT, marginRight: rs(11) }}
        >
          <Calendar size={rf(17)} color={ACCENT} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center flex-wrap">
            <Text className="font-extrabold" style={{ fontSize: 14.5, color: TEXT_PRIMARY }}>
              {month.label}
            </Text>
            {isCurrent ? (
              <View
                className="rounded-full"
                style={{ marginLeft: rs(8), paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: MINT }}
              >
                <Text className="font-extrabold" style={{ fontSize: 9.5, color: ACCENT, letterSpacing: 0.4 }}>
                  CURRENT
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: rs(1) }}>
            {month.total} total booking{month.total === 1 ? '' : 's'}
          </Text>
        </View>
        <View
          className="items-center justify-center rounded-2xl"
          style={{ minWidth: rs(48), paddingHorizontal: rs(10), paddingVertical: rs(7), backgroundColor: SOFT_MINT }}
        >
          <Text className="font-extrabold" style={{ fontSize: 17.5, color: ACCENT }}>
            {pad2(month.total)}
          </Text>
        </View>
      </View>

      {/* Status bucket pills */}
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -rs(3) }}>
        {STATUS_BUCKETS.map((b) => {
          const v = month.buckets[b.key] || 0;
          const active = v > 0;
          const Icon = b.icon;
          const fg = active ? (b.amber ? AMBER : ACTIVE_GREEN) : INACTIVE_TEXT;
          const bg = active ? (b.amber ? AMBER_BG : MINT) : INACTIVE_BG;
          return (
            <View
              key={b.key}
              className="flex-row items-center rounded-full"
              style={{ paddingHorizontal: rs(11), paddingVertical: rs(8), margin: rs(3), backgroundColor: bg }}
            >
              <Icon size={rf(13)} color={fg} />
              <Text className="font-extrabold" style={{ marginLeft: rs(5), fontSize: 11.5, color: fg }}>
                {b.label}
              </Text>
              <Text className="font-extrabold" style={{ marginLeft: rs(6), fontSize: 11.5, color: fg }}>
                {v}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ height: 1, backgroundColor: SOFT_MINT, marginTop: rs(10), marginBottom: rs(9) }} />

      <View className="flex-row items-center">
        <Text className="font-extrabold" style={{ fontSize: 12, color: ACCENT }}>
          View bookings
        </Text>
        <ChevronRight size={rf(14)} color={ACCENT} />
      </View>
    </Pressable>
  );
}
