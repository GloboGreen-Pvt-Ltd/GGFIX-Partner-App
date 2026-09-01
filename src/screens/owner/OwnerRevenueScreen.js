import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  IndianRupee,
  PackageCheck,
  Receipt,
  Smartphone,
  TrendingUp,
  User,
  Wallet,
} from 'lucide-react-native';
import { EmptyState, Loader } from '../../components/rnr';
import { getLedgerPeriod, toApiDate, RECEIVED } from '../../api/ledgerParties';
import { dayLabel, formatMoney } from './revenueMath';

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

// The server refuses a wider window; keep the request inside it.
const WINDOW_DAYS = 366;

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Period the list is scoped to. The totals strip always shows all four figures
// regardless of which one is selected, so the owner can compare at a glance.
const PERIODS = [
  { key: 'today', label: 'Today',      icon: CalendarDays },
  { key: 'week',  label: 'This Week',  icon: TrendingUp },
  { key: 'month', label: 'This Month', icon: Receipt },
  { key: 'all',   label: '12 Months',  icon: Wallet },
];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (now) => { const s = startOfDay(now); s.setDate(s.getDate() - s.getDay()); return s; };

/* ══════════════════════════════════════════════════════════════════════════
   Revenue is money RECEIVED, on the day it was received.

   It used to be the invoice total of every delivered booking, booked on the
   delivery date. That answers "what did we bill?", not "what came in?", and the
   two are the same figure only when nothing is ever sold on credit. A ₹10,000
   invoice delivered on Tuesday with ₹5,000 advance and ₹5,000 still owed
   counted ₹10,000 of Tuesday revenue — and when the customer cleared the
   balance on Thursday, Thursday showed ₹0.

   The Cash Book already records each movement with its own date, so this reads
   the RECEIVED side of the ledger instead. The invoice total now lives where it
   belongs — on the invoice — and this screen shows takings.
   ══════════════════════════════════════════════════════════════════════════ */

/** Entry timestamp: entryDate is the day the money is booked against; createdAt
 *  carries the clock time the row shows. Prefer the booked day. */
function receiptDate(e) {
  const raw = e?.entryDate || e?.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function receiptTime(e) {
  const raw = e?.createdAt || e?.entryDate;
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
}

const receiptAmount = (e) => {
  const v = Number(e?.amount);
  return Number.isFinite(v) ? v : 0;
};

function receiptBuckets(entries, now = new Date()) {
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const out = { today: 0, week: 0, month: 0, all: 0 };
  for (const e of entries || []) {
    const amount = receiptAmount(e);
    out.all += amount;
    const d = receiptDate(e);
    if (!d) continue;
    if (d >= today) out.today += amount;
    if (d >= week) out.week += amount;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) out.month += amount;
  }
  return out;
}

function inPeriod(e, period, now) {
  if (period === 'all') return true;
  const d = receiptDate(e);
  if (!d) return false;
  if (period === 'today') return d >= startOfDay(now);
  if (period === 'week') return d >= startOfWeek(now);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function groupReceiptsByDay(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    const d = receiptDate(e);
    const key = d ? startOfDay(d).toISOString() : 'unknown';
    if (!groups.has(key)) groups.set(key, { key, date: d ? startOfDay(d) : null, items: [], total: 0 });
    const g = groups.get(key);
    g.items.push(e);
    g.total += receiptAmount(e);
  }
  const arr = Array.from(groups.values());
  arr.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
  arr.forEach((g) => g.items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
  return arr;
}

export default function OwnerRevenueScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Opens on the widest window so the day-by-day list shows the whole run of
  // takings at once. Today is one tap away and its figure is on screen anyway.
  const [period, setPeriod] = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      // /ledger-entries caps a request at 366 days on purpose — a window is one
      // screen of a ledger, not an export — so the widest chip is twelve months
      // rather than literally all time, and is labelled that way.
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - (WINDOW_DAYS - 1));
      const res = await getLedgerPeriod({ from: toApiDate(from), to: toApiDate(to) });
      setRows((res.entries || []).filter((e) => e.direction === RECEIVED));
    } catch (e) {
      setError(e?.message || 'Failed to load revenue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const buckets = useMemo(() => receiptBuckets(rows), [rows]);

  const feed = useMemo(() => {
    const now = new Date();
    const scoped = rows.filter((e) => inPeriod(e, period, now));
    const out = [];
    for (const g of groupReceiptsByDay(scoped)) {
      out.push({ _type: 'day', key: `day:${g.key}`, label: dayLabel(g.date), total: g.total, count: g.items.length });
      for (const e of g.items) out.push({ _type: 'receipt', key: `e:${e.id}`, entry: e });
    }
    return out;
  }, [rows, period]);

  const periodTotal = useMemo(() => buckets[period] ?? 0, [buckets, period]);
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || '';

  const renderRow = ({ item }) => {
    if (item._type === 'day') {
      return (
        <View className="flex-row items-center justify-between mt-3 mb-1.5 px-1">
          <View className="flex-row items-center">
            <CalendarDays size={13} color="#667066" />
            <Text className="text-[12px] font-extrabold text-text ml-1.5">{item.label}</Text>
            <Text className="text-[11px] text-text-muted ml-1.5">
              · {item.count} {item.count === 1 ? 'booking' : 'bookings'}
            </Text>
          </View>
          <Text className="text-[12.5px] font-extrabold" style={{ color: ACCENT_GREEN }}>
            {formatMoney(item.total)}
          </Text>
        </View>
      );
    }

    const e = item.entry;
    const device = e.ticketLabel || e.ticketDeviceName || e.note || 'Payment received';
    const trackingId = e.ticketTrackingId || '';
    const amount = receiptAmount(e);
    const time = receiptTime(e);
    // Only a receipt booked against a ticket can open one. A rent or salary
    // receipt has no device behind it, so it stays a flat row rather than a
    // button that navigates nowhere.
    const ticketId = e.ticketId || null;

    return (
      <Pressable
        onPress={ticketId ? () => navigation.navigate('DeviceDetail', { ticketId }) : undefined}
        disabled={!ticketId}
        className="bg-card rounded-2xl mb-2 active:opacity-90"
        style={{ padding: 12, borderWidth: 1, borderColor: '#E2E8E2', ...cardShadow }}
      >
        <View className="flex-row items-center">
          <View className="h-11 w-11 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: '#E6F7E3' }}>
            <Smartphone size={20} color={ACCENT_GREEN} />
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-[13.5px] font-extrabold text-text" numberOfLines={1}>{device}</Text>
            <View className="flex-row items-center mt-0.5">
              {trackingId ? (
                <Text className="text-[10px] font-extrabold" style={{ color: ACCENT_GREEN }}>#{trackingId}</Text>
              ) : null}
              {e.partyName ? (
                <>
                  {trackingId ? <Text className="text-[10px] text-text-muted mx-1">·</Text> : null}
                  <User size={10} color="#667066" />
                  <Text className="text-[10px] text-text-muted ml-1" numberOfLines={1}>{e.partyName}</Text>
                </>
              ) : null}
            </View>
          </View>
          {/* Money in, so the figure is green — it reads the same way the Cash
              Book's received side does. The clock time sits under it because on
              a day with several part-payments the amount alone doesn't say
              which one this is. */}
          <View className="items-end">
            <Text className="text-[14px] font-extrabold" style={{ color: ACCENT_GREEN }}>
              {formatMoney(amount)}
            </Text>
            <View className="flex-row items-center mt-0.5">
              {time ? (
                <Text className="text-[10px] text-text-muted mr-1">{time}</Text>
              ) : null}
              {ticketId ? <ChevronRight size={12} color={ACCENT_GREEN} /> : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── Green revenue hero ─────────────────────────────────── */}
      <LinearGradient
        colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 10, paddingBottom: 18, paddingHorizontal: 16 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
            className="h-10 w-10 rounded-full items-center justify-center mr-3 active:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-white/80 text-[11px] font-bold tracking-widest">REVENUE</Text>
            <Text className="text-white text-[20px] font-extrabold mt-0.5">Payments Received</Text>
          </View>
          <View className="h-11 w-11 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <IndianRupee size={22} color="#FFFFFF" />
          </View>
        </View>

        <View className="mt-4">
          <Text className="text-white/80 text-[11px] font-semibold">{periodLabel}</Text>
          <Text className="text-white font-extrabold mt-0.5" style={{ fontSize: 30 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(periodTotal)}
          </Text>
        </View>
      </LinearGradient>

      {/* ── Period totals (all four always visible) ─────────────── */}
      <View className="flex-row" style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              className="flex-1 items-center rounded-2xl mx-1 active:opacity-80"
              style={{
                paddingVertical: 9,
                paddingHorizontal: 4,
                backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
                borderWidth: 1.5,
                borderColor: active ? ACCENT_GREEN : '#E2E8E2',
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                className="font-extrabold text-text"
                style={{ fontSize: 12, width: '100%', textAlign: 'center' }}
              >
                {formatMoney(buckets[p.key] ?? 0)}
              </Text>
              <Text
                numberOfLines={1}
                className="font-semibold mt-0.5"
                style={{ fontSize: 9, color: active ? ACCENT_GREEN : '#667066' }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View
          className="mx-4 mt-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
        >
          <Text className="text-[12px] text-danger font-bold">{error}</Text>
        </View>
      ) : null}

      {loading && rows.length === 0 ? (
        <Loader label="Loading revenue..." />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.key}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={ACCENT_GREEN} colors={[ACCENT_GREEN]} />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 28 }}
          ListEmptyComponent={
            <EmptyState
              icon={<PackageCheck size={26} color={ACCENT_GREEN} />}
              title="No revenue yet"
              description={`No payments were received ${period === 'today' ? 'today' : `in ${periodLabel.toLowerCase()}`}.`}
            />
          }
        />
      )}
    </View>
  );
}
