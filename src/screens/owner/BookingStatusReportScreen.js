import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Calendar,
  SlidersHorizontal,
  X,
  ClipboardList,
  Wrench,
  CheckCircle2,
  Truck,
  AlertTriangle,
  PackageCheck,
  Package,
  UserCheck,
  FileText,
  Hash,
  IndianRupee,
  ChevronRight,
  Search,
  Clock,
  Receipt,
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

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

// Keyed by the BookingStatus tile key that opened this report.
const ICON_BY_KEY = {
  TOTAL_BOOKING:             ClipboardList,
  TOTAL_PROCESSED:           CheckCircle2,
  TOTAL_DELIVERED:           PackageCheck,
  OUT_FOR_DELIVERY:          Truck,
  TOTAL_INPROCESS:           Wrench,
  WORK_PENDING:              AlertTriangle,
  SPARE_PARTS_PENDING:       Package,
  CUSTOMER_APPROVAL_PENDING: UserCheck,
};

// Two-stop gradient per status — mirrors the BookingStatus tile colors so the
// hero on this report screen feels visually continuous with the tile the user
// tapped to get here.
// Each pair is `[lighten(systemColour), systemColour]` for the colour the
// matching BookingStatus tile carries, so the hero here continues the tile the
// user tapped. Keep them in step if a tile's colour changes.
const GRADIENT_BY_KEY = {
  TOTAL_BOOKING:             ['#16BB05', '#16BB05'],   // systemBlue
  TOTAL_PROCESSED:           ['#7ED957', '#16BB05'],   // systemGreen
  TOTAL_DELIVERED:           ['#7ED957', '#16BB05'],   // systemTeal
  OUT_FOR_DELIVERY:          ['#7ED957', '#16BB05'],   // systemCyan
  TOTAL_INPROCESS:           ['#7ED957', '#16BB05'],   // systemIndigo
  WORK_PENDING:              ['#DC2626', '#DC2626'],   // systemRed
  SPARE_PARTS_PENDING:       ['#FCD34D', '#F59E0B'],   // systemOrange
  CUSTOMER_APPROVAL_PENDING: ['#7ED957', '#16BB05'],   // systemPurple
};

const PERIODS = [
  { value: 'TODAY',     label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'WEEK',      label: 'This Week' },
  { value: 'MONTH',     label: 'This Month' },
  { value: 'ALL',       label: 'All Time' },
];

function startOfPeriod(period) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'TODAY')     return d;
  if (period === 'YESTERDAY') { d.setDate(d.getDate() - 1); return d; }
  if (period === 'WEEK')      { d.setDate(d.getDate() - 7); return d; }
  if (period === 'MONTH')     return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function endOfPeriod(period) {
  if (period === 'YESTERDAY') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return null;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtINR(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function priceItemsFromTicket(t) {
  if (Array.isArray(t?.priceItems)) return t.priceItems;
  if (t?.priceItemsJson) {
    try { const v = JSON.parse(t.priceItemsJson); if (Array.isArray(v)) return v; } catch (_) {}
  }
  return t?.services?.map?.((s) => ({ id: s.id, label: s.serviceName, amount: s.price })) || [];
}

function summarizeIssue(t) {
  if (t?.repairServicesSummary) return t.repairServicesSummary;
  const items = priceItemsFromTicket(t);
  return items.map((i) => i.label || i.serviceName).filter(Boolean).join(', ') || (t?.issueDescription || '—');
}

export default function BookingStatusReportScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    statusKey = 'TOTAL_BOOKING',
    label = 'Total Booking',
    statusList = [],
    bg = BRAND_GREEN_DARK,
    icon = 'TOTAL_BOOKING',
  } = route?.params || {};

  const Icon = ICON_BY_KEY[icon] || FileText;
  const gradient = GRADIENT_BY_KEY[icon] || [BRAND_GREEN, BRAND_GREEN_DARK];

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Default to ALL so the count on the BookingStatus tile (which is all-time
  // from /tickets/counts) matches what's shown here. Filtering to TODAY by
  // default dropped any ticket created on a different day, producing the
  // confusing "01 on tile but 0 bookings here" mismatch.
  const [period, setPeriod] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // `load` keys off the CSV, not the array: navigating here without params
  // materializes a fresh default array on every render, which as a useCallback
  // dep would re-create load → re-fire the effect → re-render, forever.
  const statusCsv = statusList.join(',');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      // An empty list is the Total Booking tile: fetch the book unfiltered
      // rather than fanning out one request per status. Page size matches the
      // bookings list (500) so a busy shop's header count here can't disagree
      // with the count on the tile that opened this screen.
      const list = statusCsv ? statusCsv.split(',') : [];
      const responses = list.length === 0
        ? [await ticketApi.get('/tickets', { query: { page: 0, size: 500 } }).catch(() => null)]
        : await Promise.all(
            list.map((s) =>
              ticketApi.get('/tickets', { query: { page: 0, size: 500, status: s } }).catch(() => null),
            ),
          );
      const merged = responses.flatMap((r) => (Array.isArray(r) ? r : r?.content || []));

      const from = startOfPeriod(period);
      const to = endOfPeriod(period);
      const filtered = merged.filter((t) => {
        if (period === 'ALL') return true;
        const created = t.createdAt ? new Date(t.createdAt) : null;
        if (!created) return false;
        if (from && created < from) return false;
        if (to && created >= to) return false;
        return true;
      });

      filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setTickets(filtered);
    } catch (e) {
      setError(e.message || 'Failed to load report');
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusCsv, period]);

  useEffect(() => { load(); }, [load]);

  const periodLabel = useMemo(
    () => (PERIODS.find((p) => p.value === period)?.label) || 'Today',
    [period],
  );

  const totalPrice = useMemo(() => {
    return tickets.reduce((sum, t) => {
      const v = t.finalPrice != null
        ? Number(t.finalPrice)
        : (t.estimatedPrice != null
            ? Number(t.estimatedPrice)
            : priceItemsFromTicket(t).reduce((s, it) => s + (Number(it.amount) || 0), 0));
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [tickets]);

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Slim top header */}
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
            Booking Status Report
          </Text>
          <Pressable
            onPress={() => setShowFilters(true)}
            className="px-2.5 py-1.5 rounded-full flex-row items-center"
            style={{ backgroundColor: '#EFF5EE' }}
            hitSlop={6}
          >
            <Calendar size={12} color="#172117" />
            <Text className="text-text text-[11px] font-extrabold ml-1" numberOfLines={1}>
              {periodLabel}
            </Text>
          </Pressable>
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
        {/* Status hero card with gradient — single source of truth for what the
            user is looking at, mirroring the tile color they came from. */}
        <View className="px-4 mt-4">
          <View style={[cardShadow, { borderRadius: 22, overflow: 'hidden' }]}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 16, position: 'relative' }}
            >
              {/* Decorative blobs */}
              <View
                style={{
                  position: 'absolute',
                  right: -32, top: -28,
                  width: 110, height: 110,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  right: 60, bottom: -50,
                  width: 90, height: 90,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              />

              <View className="flex-row items-center">
                <View
                  style={{
                    width: 52, height: 52, borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 14,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
                  }}
                >
                  <Icon size={26} color="#FFFFFF" strokeWidth={2.3} />
                </View>
                <View className="flex-1">
                  <Text className="text-white/85 text-[10.5px] font-bold tracking-wider">
                    SHOWING
                  </Text>
                  <Text className="text-white text-[18px] font-extrabold" numberOfLines={1}>
                    {label}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: '#FFFFFF',
                    minWidth: 54,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    className="font-extrabold"
                    style={{ color: gradient[1], fontSize: 18, letterSpacing: -0.3 }}
                  >
                    {String(tickets.length).padStart(2, '0')}
                  </Text>
                </View>
              </View>

              {/* Footer stats */}
              <View className="flex-row items-center mt-4">
                <View className="flex-row items-center">
                  <Calendar size={12} color="rgba(255,255,255,0.85)" />
                  <Text className="ml-1.5 text-white/85 text-[11px] font-bold">
                    {periodLabel}
                  </Text>
                </View>
                <View className="w-px h-3 mx-3" style={{ backgroundColor: 'rgba(255,255,255,0.35)' }} />
                <View className="flex-row items-center">
                  <IndianRupee size={11} color="rgba(255,255,255,0.85)" />
                  <Text className="ml-0.5 text-white/85 text-[11px] font-bold">
                    {fmtINR(totalPrice) || '0'} total
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Filters action chip */}
        <View className="flex-row items-center px-5 mt-4 mb-2">
          <Text className="text-[13px] font-extrabold text-gray-900 flex-1">
            {tickets.length} {tickets.length === 1 ? 'booking' : 'bookings'}
          </Text>
          <Pressable
            onPress={() => setShowFilters(true)}
            className="flex-row items-center px-2.5 py-1.5 rounded-full"
            style={{ backgroundColor: '#F0F8EF' }}
            hitSlop={8}
          >
            <SlidersHorizontal size={12} color="#087A0A" />
            <Text className="ml-1 text-[11.5px] font-extrabold" style={{ color: '#087A0A' }}>
              Filters
            </Text>
          </Pressable>
        </View>

        {error ? (
          <View className="px-4">
            <View
              className="rounded-2xl px-4 py-3"
              style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
            >
              <Text className="text-[12.5px] font-semibold" style={{ color: '#B91C1C' }}>
                {error}
              </Text>
            </View>
          </View>
        ) : loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
          </View>
        ) : tickets.length === 0 ? (
          <View className="px-4 mt-2">
            <View className="bg-white rounded-2xl" style={cardShadow}>
              <EmptyState
                icon={<Icon size={28} color={gradient[1]} />}
                title="No bookings"
                description={`No "${label}" bookings for ${periodLabel.toLowerCase()}.`}
                className="py-10"
              />
            </View>
          </View>
        ) : (
          <View className="px-4">
            {tickets.map((t, i) => (
              <TicketCard
                key={t.id || i}
                ticket={t}
                index={i + 1}
                accent={gradient[1]}
                tint={`${gradient[0]}22`}
                onViewDetails={() =>
                  navigation.navigate('DeviceDetail', { ticketId: t.id })
                }
                onHistory={() =>
                  navigation.navigate('BookingTimeline', { ticketId: t.id })
                }
                onInvoice={async () => {
                  // Same conditional routing the BillingScreen / TicketDetail use:
                  // existing invoice → DeliveryInvoiceReport, otherwise → InvoiceGenerator.
                  try {
                    const inv = await ticketApi.get(`/tickets/${t.id}/invoice`);
                    if (inv?.id) {
                      navigation.navigate('DeliveryInvoiceReport', { ticketId: t.id });
                      return;
                    }
                  } catch (_) { /* no invoice yet — fall through */ }
                  navigation.navigate('InvoiceGenerator', { ticketId: t.id });
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Filters bottom sheet */}
      <Modal
        transparent
        visible={showFilters}
        animationType="fade"
        onRequestClose={() => setShowFilters(false)}
      >
        <Pressable
          onPress={() => setShowFilters(false)}
          style={{ flex: 1, backgroundColor: 'rgba(23, 33, 23, 0.55)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 28,
            }}
          >
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: '#E2E8E2', marginBottom: 12 }} />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[16px] font-extrabold text-gray-900">Filter by period</Text>
              <Pressable
                onPress={() => setShowFilters(false)}
                hitSlop={8}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: '#EFF5EE' }}
              >
                <X size={14} color="#172117" />
              </Pressable>
            </View>
            {PERIODS.map((p) => {
              const active = p.value === period;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => { setPeriod(p.value); setShowFilters(false); }}
                  className="rounded-2xl border mb-2 px-4 py-3 flex-row items-center"
                  style={{
                    backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
                    borderColor: active ? BRAND_GREEN : '#E2E8E2',
                  }}
                >
                  <View
                    className="w-9 h-9 rounded-2xl items-center justify-center mr-3"
                    style={{ backgroundColor: active ? BRAND_GREEN : '#E6F7E3' }}
                  >
                    <Calendar size={14} color={active ? '#FFFFFF' : BRAND_GREEN_DARK} />
                  </View>
                  <Text
                    className="flex-1 text-[14px] font-extrabold"
                    style={{ color: active ? BRAND_GREEN_DARK : '#172117' }}
                  >
                    {p.label}
                  </Text>
                  {active ? (
                    <CheckCircle2 size={18} color={BRAND_GREEN_DARK} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function TicketCard({ ticket, index, accent, tint, onViewDetails, onHistory, onInvoice }) {
  const trackingId = ticket.trackingId || (ticket.id ? String(ticket.id).slice(0, 10).toUpperCase() : '—');
  const price = (() => {
    if (ticket.finalPrice != null) return ticket.finalPrice;
    if (ticket.estimatedPrice != null) return ticket.estimatedPrice;
    const items = priceItemsFromTicket(ticket);
    if (items.length === 0) return null;
    return items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  })();
  const priceStr = fmtINR(price);
  const customer = ticket.customerName || '—';
  const device = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || null;

  return (
    <View
      className="bg-white rounded-2xl mb-3"
      style={[softShadow, { padding: 14 }]}
    >
      <View className="flex-row items-start">
        {/* Numbered chip */}
        <View
          style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: tint || '#E6F7E3',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Text
            className="font-extrabold"
            style={{ color: accent || BRAND_GREEN_DARK, fontSize: 14 }}
          >
            {String(index).padStart(2, '0')}
          </Text>
        </View>

        <View className="flex-1">
          {/* Tracking ID + price row */}
          <View className="flex-row items-center">
            <View
              className="flex-row items-center px-2 py-0.5 rounded-md"
              style={{ backgroundColor: '#F0F8EF' }}
            >
              <Hash size={10} color="#16BB05" />
              <Text
                className="text-[11px] font-extrabold ml-0.5"
                style={{ color: '#16BB05', textDecorationLine: 'underline' }}
                numberOfLines={1}
              >
                {trackingId}
              </Text>
            </View>
            <View className="flex-1" />
            {priceStr ? (
              <Text
                className="text-[14px] font-extrabold"
                style={{ color: BRAND_GREEN_DARK }}
              >
                ₹{priceStr}
              </Text>
            ) : null}
          </View>

          {/* Customer + device */}
          {customer || device ? (
            <Text className="text-[13px] font-extrabold text-gray-900 mt-1" numberOfLines={1}>
              {customer}
              {device ? <Text className="text-gray-500 font-semibold">  ·  {device}</Text> : null}
            </Text>
          ) : null}

          {/* Issue */}
          <View className="flex-row items-start mt-1.5">
            <View
              style={{
                width: 18, height: 18, borderRadius: 999,
                backgroundColor: '#F0F8EF',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 6, marginTop: 1,
              }}
            >
              <Wrench size={10} color={BRAND_GREEN_DARK} />
            </View>
            <Text className="flex-1 text-[11.5px] text-gray-600 leading-4" numberOfLines={2}>
              {summarizeIssue(ticket)}
            </Text>
          </View>

          {/* Date row */}
          <View className="flex-row items-center mt-2">
            <Calendar size={11} color="#8FA08F" />
            <Text className="ml-1 text-[11px] font-bold text-gray-500">
              {fmtDate(ticket.createdAt)}
            </Text>
          </View>
        </View>
      </View>

      {/* Action row — three pills: View Details · History · Invoice. */}
      <View
        className="flex-row mt-3 pt-3"
        style={{
          borderTopWidth: 1,
          borderTopColor: '#EFF5EE',
          gap: 8,
        }}
      >
        <CardAction
          icon={FileText}
          label="View Details"
          tint="rgba(22, 187, 5, 0.12)"
          fg={BRAND_GREEN_DARK}
          onPress={onViewDetails}
        />
        <CardAction
          icon={Clock}
          label="History"
          tint="rgba(126, 217, 87, 0.12)"
          fg="#16BB05"
          onPress={onHistory}
        />
        <CardAction
          icon={Receipt}
          label="Invoice"
          tint="rgba(245, 158, 11, 0.16)"
          fg="#B45309"
          onPress={onInvoice}
        />
      </View>
    </View>
  );
}

// Compact action button used inside the ticket card. Icon over a tinted
// chip + label on the right — matches the Booking Details quick-action
// tile aesthetic but at row-height so three fit side-by-side in the card.
function CardAction({ icon: Icon, label, tint, fg, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#EFF5EE' }}
      className="flex-1 flex-row items-center justify-center rounded-xl"
      style={{
        paddingVertical: 8,
        paddingHorizontal: 6,
        backgroundColor: tint,
      }}
    >
      <Icon size={13} color={fg} />
      <Text
        className="ml-1.5 text-[11px] font-extrabold"
        style={{ color: fg }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
