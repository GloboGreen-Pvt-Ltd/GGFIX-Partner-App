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

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
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
  { key: 'CREATED',     label: 'Accepted',    icon: ClipboardCheck, accent: '#16BB05', tint: '#E6F7E3' },
  { key: 'IN_PROGRESS', label: 'In Service',  icon: Wrench,         accent: '#16BB05', tint: '#F0F8EF' },
  { key: 'READY',       label: 'Ready',       icon: CheckCircle2,   accent: BRAND_GREEN_DARK, tint: '#E6F7E3' },
  { key: 'DELIVERED',   label: 'Delivered',   icon: PackageCheck,   accent: '#087A0A', tint: '#E6F7E3' },
  { key: 'PENDING',     label: 'Pending',     icon: AlertTriangle,  accent: '#B91C1C', tint: '#FEE2E2' },
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

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: '#EFF5EE' }}
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
            Previous Reports
          </Text>
          <View
            className="px-2.5 py-1 rounded-full flex-row items-center"
            style={{ backgroundColor: '#EFF5EE' }}
          >
            <History size={12} color="#172117" />
            <Text className="text-text text-[11px] font-extrabold ml-1" numberOfLines={1}>
              {MONTHS_TO_SHOW} months
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={BRAND_GREEN_DARK}
            colors={[BRAND_GREEN_DARK]}
          />
        }
      >
        {/* Compact title row */}
        <View className="px-5 mt-4 mb-3">
          <View className="flex-row items-center">
            <Calendar size={12} color={BRAND_GREEN_DARK} />
            <Text
              className="ml-1 text-[10.5px] font-bold"
              style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}
            >
              LAST {MONTHS_TO_SHOW} MONTHS
            </Text>
          </View>
          <Text className="text-[18px] font-extrabold text-gray-900 mt-0.5" style={{ letterSpacing: -0.3 }}>
            Monthly status snapshots
          </Text>
        </View>

        {/* Summary card */}
        <View className="px-4">
          <View className="bg-white rounded-2xl p-4 flex-row items-center" style={cardShadow}>
            <View
              style={{
                width: 44, height: 44, borderRadius: 14,
                backgroundColor: '#E6F7E3',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <TrendingUp size={22} color={BRAND_GREEN_DARK} />
            </View>
            <View className="flex-1">
              <Text className="text-[10.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.7 }}>
                Total in window
              </Text>
              <Text className="text-[20px] font-extrabold text-gray-900 mt-0.5">
                {grandTotal} bookings
              </Text>
            </View>
            <Text className="text-[11px] text-gray-500">
              {months.length > 0 ? months[months.length - 1].label.split(' ')[0] : ''} – {months[0]?.label.split(' ')[0] || ''}
            </Text>
          </View>
        </View>

        {error ? (
          <View className="px-4 mt-4">
            <View
              className="rounded-2xl px-4 py-3"
              style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
            >
              <Text className="text-[12.5px] font-semibold" style={{ color: '#B91C1C' }}>
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
          </View>
        ) : months.every((m) => m.total === 0) ? (
          <View className="px-4 mt-6">
            <View className="bg-white rounded-2xl" style={cardShadow}>
              <EmptyState
                icon={<History size={28} color={BRAND_GREEN_DARK} />}
                title="No history yet"
                description="Once bookings start flowing in, you'll see monthly snapshots here."
                className="py-10"
              />
            </View>
          </View>
        ) : (
          <View className="px-4 mt-5">
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
      </ScrollView>
    </View>
  );
}

function MonthCard({ month, isCurrent, onTap }) {
  return (
    <Pressable
      onPress={onTap}
      android_ripple={{ color: '#EFF5EE' }}
      className="bg-white rounded-2xl mb-3"
      style={[cardShadow, { padding: 14 }]}
    >
      {/* Header row */}
      <View className="flex-row items-center mb-3">
        <View
          style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: isCurrent ? '#E6F7E3' : '#EFF5EE',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Calendar size={18} color={isCurrent ? BRAND_GREEN_DARK : '#667066'} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-[14.5px] font-extrabold text-gray-900">
              {month.label}
            </Text>
            {isCurrent ? (
              <View
                className="ml-2 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#E6F7E3' }}
              >
                <Text
                  className="text-[9.5px] font-extrabold"
                  style={{ color: BRAND_GREEN_DARK, letterSpacing: 0.4 }}
                >
                  CURRENT
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-[11px] text-gray-500 mt-0.5">
            {month.total} total booking{month.total === 1 ? '' : 's'}
          </Text>
        </View>
        <Text
          className="text-[22px] font-extrabold"
          style={{ color: BRAND_GREEN_DARK, letterSpacing: -0.5 }}
        >
          {pad2(month.total)}
        </Text>
      </View>

      {/* Status bucket chips */}
      <View className="flex-row flex-wrap -mx-1">
        {STATUS_BUCKETS.map((b) => {
          const v = month.buckets[b.key] || 0;
          const Icon = b.icon;
          return (
            <View
              key={b.key}
              className="flex-row items-center px-2 py-1.5 rounded-full m-1"
              style={{
                backgroundColor: v > 0 ? b.tint : '#F7FAF7',
                borderWidth: 1,
                borderColor: v > 0 ? b.tint : '#E2E8E2',
              }}
            >
              <Icon size={11} color={v > 0 ? b.accent : '#8FA08F'} />
              <Text
                className="ml-1 text-[10.5px] font-extrabold"
                style={{ color: v > 0 ? b.accent : '#8FA08F' }}
              >
                {b.label}
              </Text>
              <Text
                className="ml-1.5 text-[10.5px] font-extrabold"
                style={{ color: v > 0 ? b.accent : '#8FA08F' }}
              >
                {v}
              </Text>
            </View>
          );
        })}
      </View>

      <View className="flex-row items-center mt-3">
        <Text className="text-[11px] font-bold" style={{ color: BRAND_GREEN_DARK }}>
          View bookings
        </Text>
        <ChevronRight size={12} color={BRAND_GREEN_DARK} />
      </View>
    </Pressable>
  );
}
