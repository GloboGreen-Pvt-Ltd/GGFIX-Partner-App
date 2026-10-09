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
  ReceiptIndianRupee,
  Receipt,
  TrendingUp,
  User,
  Wallet,
} from 'lucide-react-native';
import { EmptyState, Loader } from '../../components/rnr';
import { ticketApi } from '../../api/client';
import { hasInvoice } from './AllBooking/bookingScopes';
import { dayLabel, formatMoney } from './revenueMath';

// GGFIX brand sheet (theme/colors.js).
const GREEN = '#09AD2A';
const GREEN_TEXT = '#078F23';
const MINT = '#EAF8EC';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const HAIR = '#F3F3F3';
const LINE = '#E6E6E6';
const RED = '#F84141';

// "12 Months" really is the last twelve months, so the widest chip is labelled
// honestly rather than as all time.
const WINDOW_DAYS = 366;
// Invoices are fetched one per ticket; a few at a time keeps a large book from
// firing hundreds of requests at once.
const FETCH_CONCURRENCY = 6;

const cardShadow = {
  shadowColor: INK,
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
   Revenue is the total of GENERATED INVOICES, on the day each was generated.

   This screen used to read the RECEIVED side of the Cash Book — money in, on
   the day it came in. The shop asked for Revenue to be the invoices instead
   (Oct 2026): every completed bill, with its details, counted at its full
   total. The difference matters on credit: a ₹10,000 bill with ₹5,000 still
   owed counts ₹10,000 here on the day it was raised. The Paid / Due line under
   each row keeps that visible, and the Cash Book still records what actually
   came in, day by day.
   ══════════════════════════════════════════════════════════════════════════ */

/** The invoice's own total — the figure printed on the bill. Falls back to the
 *  ticket's final price for an invoice row that somehow lacks one. */
function billAmount(row) {
  const v = Number(row.invoice?.finalPayableAmount);
  if (Number.isFinite(v) && v > 0) return v;
  const f = Number(row.ticket?.finalPrice);
  return Number.isFinite(f) ? f : 0;
}

/** When the invoice was raised — the day it is booked against. */
function billDate(row) {
  const raw = row.invoice?.generatedAt || row.invoice?.createdAt || row.ticket?.updatedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function billTime(row) {
  const d = billDate(row);
  if (!d) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
}

/** Paid / due, read off the invoice exactly as DeliveryInvoiceReport prints it:
 *  the advance on the booking plus what was paid at the counter, and the credit
 *  left on the customer's account. */
function billSettlement(row) {
  const inv = row.invoice || {};
  const advance = Number(inv.advancePaid) || 0;
  const paidNow = Number(inv.amountPaid) || 0;
  const due = Number(inv.creditAmount) || 0;
  return { paid: advance + paidNow, due, shown: advance > 0 || paidNow > 0 || due > 0 };
}

function invoiceBuckets(rows, now = new Date()) {
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const out = { today: 0, week: 0, month: 0, all: 0 };
  for (const r of rows || []) {
    const amount = billAmount(r);
    out.all += amount;
    const d = billDate(r);
    if (!d) continue;
    if (d >= today) out.today += amount;
    if (d >= week) out.week += amount;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) out.month += amount;
  }
  return out;
}

function inPeriod(r, period, now) {
  if (period === 'all') return true;
  const d = billDate(r);
  if (!d) return false;
  if (period === 'today') return d >= startOfDay(now);
  if (period === 'week') return d >= startOfWeek(now);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function groupByDay(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const d = billDate(r);
    const key = d ? startOfDay(d).toISOString() : 'unknown';
    if (!groups.has(key)) groups.set(key, { key, date: d ? startOfDay(d) : null, items: [], total: 0 });
    const g = groups.get(key);
    g.items.push(r);
    g.total += billAmount(r);
  }
  const arr = Array.from(groups.values());
  arr.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
  arr.forEach((g) => g.items.sort((a, b) => (billDate(b)?.getTime() || 0) - (billDate(a)?.getTime() || 0)));
  return arr;
}

/** Promise.all with at most `limit` calls in flight. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default function OwnerRevenueScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState([]); // { ticket, invoice }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Opens on Today — the figure the shop checks first. The wider windows are
  // one tap away and their totals are on screen in the strip anyway.
  const [period, setPeriod] = useState('today');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      // The same page of the ticket book the Bookings / Invoice lists read; the
      // tickets that carry an invoice (hasInvoice — a real invoices row, not a
      // status) are the ones to total. Each invoice's figures come from its own
      // record, the document the customer was given.
      const data = await ticketApi.get('/tickets', { query: { page: 0, size: 500 } });
      const tickets = (Array.isArray(data) ? data : data?.content ?? data?.data ?? []).filter(hasInvoice);
      const fetched = await mapLimit(tickets, FETCH_CONCURRENCY, async (ticket) => {
        const invoice = await ticketApi.get(`/tickets/${ticket.id}/invoice`).catch(() => null);
        return invoice ? { ticket, invoice } : null;
      });
      const cutoff = startOfDay(new Date());
      cutoff.setDate(cutoff.getDate() - (WINDOW_DAYS - 1));
      setRows(fetched.filter(Boolean).filter((r) => {
        const d = billDate(r);
        return !d || d >= cutoff;
      }));
    } catch (e) {
      setError(e?.message || 'Failed to load revenue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const buckets = useMemo(() => invoiceBuckets(rows), [rows]);

  const scoped = useMemo(() => {
    const now = new Date();
    return rows.filter((r) => inPeriod(r, period, now));
  }, [rows, period]);

  const feed = useMemo(() => {
    const out = [];
    for (const g of groupByDay(scoped)) {
      out.push({ _type: 'day', key: `day:${g.key}`, label: dayLabel(g.date), total: g.total, count: g.items.length });
      for (const r of g.items) out.push({ _type: 'invoice', key: `inv:${r.ticket.id}`, row: r });
    }
    return out;
  }, [scoped]);

  const periodTotal = buckets[period] ?? 0;
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || '';

  const renderRow = ({ item }) => {
    if (item._type === 'day') {
      return (
        <View className="flex-row items-center justify-between mt-2.5 mb-1.5 px-1">
          <View className="flex-row items-center">
            <CalendarDays size={13} color={MUTED} />
            <Text className="text-[12px] font-extrabold ml-1.5" style={{ color: INK }}>{item.label}</Text>
            <Text className="text-[11px] ml-1.5" style={{ color: MUTED }}>
              · {item.count} {item.count === 1 ? 'invoice' : 'invoices'}
            </Text>
          </View>
          <Text className="text-[12px] font-extrabold" style={{ color: GREEN_TEXT }}>
            {formatMoney(item.total)}
          </Text>
        </View>
      );
    }

    const { ticket, invoice } = item.row;
    const device = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || 'Device';
    const invoiceNo = String(invoice.invoiceNo || ticket.invoiceNo || '').replace(/^#+/, '');
    const trackingId = ticket.trackingId || '';
    const customer = ticket.customerName || '';
    const amount = billAmount(item.row);
    const time = billTime(item.row);
    const settle = billSettlement(item.row);

    return (
      <Pressable
        onPress={() => navigation.navigate('DeliveryInvoiceReport', { ticketId: ticket.id })}
        className="rounded-xl mb-1.5 active:opacity-90"
        style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: HAIR, ...cardShadow }}
      >
        <View className="flex-row items-center">
          <View className="h-9 w-9 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: MINT }}>
            <ReceiptIndianRupee size={17} color={GREEN} />
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-[12.5px] font-extrabold" style={{ color: INK }} numberOfLines={1}>{device}</Text>
            <View className="flex-row items-center mt-0.5">
              {invoiceNo ? (
                <Text className="text-[10px] font-extrabold" style={{ color: GREEN_TEXT }}>{invoiceNo}</Text>
              ) : null}
              {trackingId ? (
                <Text className="text-[10px]" style={{ color: MUTED }}>{invoiceNo ? '  ·  ' : ''}#{trackingId}</Text>
              ) : null}
              {customer ? (
                <View className="flex-row items-center flex-shrink">
                  <Text className="text-[10px]" style={{ color: MUTED }}>  ·  </Text>
                  <User size={10} color={MUTED} />
                  <Text className="text-[10px] ml-0.5 flex-shrink" style={{ color: MUTED }} numberOfLines={1}>{customer}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View className="items-end">
            <Text className="text-[13px] font-extrabold" style={{ color: GREEN_TEXT }}>
              {formatMoney(amount)}
            </Text>
            <View className="flex-row items-center mt-0.5">
              {time ? <Text className="text-[10px] mr-0.5" style={{ color: MUTED }}>{time}</Text> : null}
              <ChevronRight size={12} color={GREEN_TEXT} />
            </View>
          </View>
        </View>
        {/* The bill counts in full above; this line says how much of it has
            actually been paid, so a credit sale doesn't read as cash in hand. */}
        {settle.shown ? (
          <View className="flex-row items-center mt-1.5 pt-1.5" style={{ borderTopWidth: 1, borderTopColor: HAIR, marginLeft: 46 }}>
            <Text className="text-[10.5px] font-bold" style={{ color: GREEN_TEXT }}>Paid {formatMoney(settle.paid)}</Text>
            {settle.due > 0 ? (
              <Text className="text-[10.5px] font-bold ml-3" style={{ color: RED }}>Due {formatMoney(settle.due)}</Text>
            ) : (
              <Text className="text-[10.5px] font-bold ml-3" style={{ color: MUTED }}>Fully paid</Text>
            )}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#F8F8F8' }}>
      {/* ── Green revenue hero ─────────────────────────────────── */}
      <LinearGradient
        colors={[GREEN, GREEN_TEXT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 14 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.popTo('OwnerTabs', { screen: 'Home' }))}
            className="h-9 w-9 rounded-full items-center justify-center mr-3 active:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
          >
            <ArrowLeft size={19} color="#FFFFFF" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-white/80 text-[11px] font-bold tracking-widest">REVENUE</Text>
            <Text className="text-white text-[16px] font-extrabold mt-0.5">Invoice Totals</Text>
          </View>
          <View className="h-10 w-10 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <IndianRupee size={20} color="#FFFFFF" />
          </View>
        </View>

        <View className="mt-3">
          <Text className="text-white/80 text-[11px] font-semibold">
            {periodLabel} · {scoped.length} {scoped.length === 1 ? 'invoice' : 'invoices'}
          </Text>
          <Text className="text-white font-extrabold mt-0.5" style={{ fontSize: 26 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(periodTotal)}
          </Text>
        </View>
      </LinearGradient>

      {/* ── Period totals (all four always visible) ─────────────── */}
      <View className="flex-row" style={{ paddingHorizontal: 10, paddingTop: 10 }}>
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              className="flex-1 items-center rounded-xl mx-1 active:opacity-80"
              style={{
                paddingVertical: 7,
                paddingHorizontal: 4,
                backgroundColor: active ? MINT : '#FFFFFF',
                borderWidth: 1.5,
                borderColor: active ? GREEN : LINE,
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                className="font-extrabold"
                style={{ fontSize: 12, width: '100%', textAlign: 'center', color: INK }}
              >
                {formatMoney(buckets[p.key] ?? 0)}
              </Text>
              <Text
                numberOfLines={1}
                className="font-semibold mt-0.5"
                style={{ fontSize: 9, color: active ? GREEN_TEXT : MUTED }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View
          className="mx-3 mt-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD0D0' }}
        >
          <Text className="text-[12px] font-bold" style={{ color: RED }}>{error}</Text>
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
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} colors={[GREEN]} />
          }
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 2, paddingBottom: 24 }}
          ListEmptyComponent={
            <EmptyState
              icon={<ReceiptIndianRupee size={26} color={GREEN} />}
              title="No invoices yet"
              description={`No invoices were generated ${period === 'today' ? 'today' : `in ${periodLabel.toLowerCase()}`}.`}
            />
          }
        />
      )}
    </View>
  );
}
