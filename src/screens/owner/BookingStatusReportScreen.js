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
  Clock,
  Receipt,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette.
const GREEN = '#09AD2A';
const GREEN_DEEP = '#078F23';
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const HAIR = '#F3F3F3';
const BORDER = '#E6E6E6';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const SUBTLE = '#8A8A8A';
const RED = '#F84141';
const RED_TINT = '#FEECEC';
const RED_LINE = '#FBD0D0';
const RED_TEXT = '#D63232';
const YELLOW = '#F3BF23';
const YELLOW_TINT = '#FFF8E1';
const YELLOW_TEXT = '#8A6A00';

const cardShadow = {
  shadowColor: INK,
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
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

// One colour tone per status, matching the Booking Status screen's rows:
// stalled = red, waiting on a part = yellow, everything else GGFIX green.
const TONES = {
  green:  { solid: GREEN,  ink: GREEN_DEEP,  tint: MINT,        line: MINT_LINE },
  red:    { solid: RED,    ink: RED_TEXT,    tint: RED_TINT,    line: RED_LINE },
  yellow: { solid: YELLOW, ink: YELLOW_TEXT, tint: YELLOW_TINT, line: '#F7E3A1' },
};
const TONE_BY_KEY = {
  WORK_PENDING: 'red',
  SPARE_PARTS_PENDING: 'yellow',
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
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), 900), alignSelf: 'center' } : null;
  const {
    label = 'Total Booking',
    statusList = [],
    icon = 'TOTAL_BOOKING',
  } = route?.params || {};

  const Icon = ICON_BY_KEY[icon] || FileText;
  const tone = TONES[TONE_BY_KEY[icon]] || TONES.green;

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
      const merged = responses.flatMap((res) => (Array.isArray(res) ? res : res?.content || []));

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

  const openInvoice = async (t) => {
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
  };

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header — white bar, title 17/800 + subtitle 11. */}
      <View
        style={{
          backgroundColor: CARD_BG,
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{
              height: 36, width: 36, borderRadius: 18, marginRight: 10,
              alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG,
              borderWidth: 1, borderColor: BORDER,
            }}
          >
            <ChevronLeft size={19} color={INK} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-extrabold" style={{ fontSize: 17, color: INK }} numberOfLines={1}>
              Booking Status Report
            </Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              {label}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowFilters(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Period: ${periodLabel}`}
            style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 999, marginLeft: 8,
              paddingHorizontal: 10, paddingVertical: 6, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE,
            }}
          >
            <Calendar size={12} color={GREEN_DEEP} />
            <Text className="font-extrabold" style={{ fontSize: 11, color: GREEN_DEEP, marginLeft: 4 }} numberOfLines={1}>
              {periodLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} colors={[GREEN]} />
        }
      >
        <View style={capStyle}>
          {/* Summary — which status this is, how many, and their total. */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14,
              paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: HAIR, ...cardShadow,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tone.tint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Icon size={18} color={tone.ink} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: SUBTLE }}>SHOWING</Text>
              <Text className="font-extrabold" style={{ fontSize: 15, color: INK, marginTop: 1 }} numberOfLines={1}>
                {label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <Calendar size={11} color={MUTED} />
                <Text style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>{periodLabel}</Text>
                <View style={{ width: 1, height: 10, backgroundColor: BORDER, marginHorizontal: 8 }} />
                <IndianRupee size={10} color={MUTED} />
                <Text style={{ fontSize: 11, color: MUTED, marginLeft: 1 }}>{fmtINR(totalPrice) || '0'} total</Text>
              </View>
            </View>
            <View
              style={{
                minWidth: 44, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginLeft: 8,
                alignItems: 'center', backgroundColor: tone.tint, borderWidth: 1, borderColor: tone.line,
              }}
            >
              <Text className="font-extrabold" style={{ fontSize: 15, color: tone.ink }}>
                {String(tickets.length).padStart(2, '0')}
              </Text>
            </View>
          </View>

          {/* Count + Filters */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
            <Text className="font-extrabold" style={{ flex: 1, fontSize: 13, color: INK }}>
              {tickets.length} {tickets.length === 1 ? 'booking' : 'bookings'}
            </Text>
            <Pressable
              onPress={() => setShowFilters(true)}
              hitSlop={8}
              accessibilityRole="button"
              style={{
                flexDirection: 'row', alignItems: 'center', borderRadius: 999,
                paddingHorizontal: 10, paddingVertical: 6, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
              }}
            >
              <SlidersHorizontal size={12} color={GREEN_DEEP} />
              <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 11, color: GREEN_DEEP }}>
                Filters
              </Text>
            </Pressable>
          </View>

          {error ? (
            <View style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: RED_TINT, borderWidth: 1, borderColor: RED_LINE }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: RED_TEXT }}>{error}</Text>
            </View>
          ) : loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={GREEN} />
            </View>
          ) : tickets.length === 0 ? (
            <View
              style={{
                alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14, paddingVertical: 22, paddingHorizontal: 16,
                borderWidth: 1, borderColor: HAIR, ...cardShadow,
              }}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tone.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color={tone.ink} />
              </View>
              <Text className="font-extrabold" style={{ marginTop: 10, fontSize: 13, color: INK }}>No bookings</Text>
              <Text style={{ marginTop: 3, fontSize: 11, color: MUTED, textAlign: 'center' }}>
                No "{label}" bookings for {periodLabel.toLowerCase()}.
              </Text>
            </View>
          ) : (
            tickets.map((t, i) => (
              <TicketCard
                key={t.id || i}
                ticket={t}
                index={i + 1}
                tone={tone}
                onViewDetails={() => navigation.navigate('DeviceDetail', { ticketId: t.id })}
                onHistory={() => navigation.navigate('BookingTimeline', { ticketId: t.id })}
                onInvoice={() => openInvoice(t)}
              />
            ))
          )}
        </View>
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
          style={{ flex: 1, backgroundColor: 'rgba(30, 30, 30, 0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: CARD_BG,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: insets.bottom + 18,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: BORDER, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text className="font-extrabold" style={{ flex: 1, fontSize: 15, color: INK }}>Filter by period</Text>
              <Pressable
                onPress={() => setShowFilters(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: HAIR }}
              >
                <X size={14} color={INK} />
              </Pressable>
            </View>
            {PERIODS.map((p) => {
              const active = p.value === period;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => { setPeriod(p.value); setShowFilters(false); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
                    backgroundColor: active ? MINT : CARD_BG,
                    borderColor: active ? GREEN : BORDER,
                  }}
                >
                  <View
                    style={{
                      width: 30, height: 30, borderRadius: 9, marginRight: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? GREEN : MINT,
                    }}
                  >
                    <Calendar size={14} color={active ? '#FFFFFF' : GREEN} />
                  </View>
                  <Text className="font-extrabold" style={{ flex: 1, fontSize: 13, color: active ? GREEN_DEEP : INK }}>
                    {p.label}
                  </Text>
                  {active ? <CheckCircle2 size={17} color={GREEN} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function TicketCard({ ticket, index, tone, onViewDetails, onHistory, onInvoice }) {
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
      style={{
        backgroundColor: CARD_BG, borderRadius: 14, padding: 10, marginBottom: 8,
        borderWidth: 1, borderColor: HAIR, ...cardShadow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Numbered chip */}
        <View
          style={{
            width: 30, height: 30, borderRadius: 9, marginRight: 9,
            backgroundColor: tone.tint, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text className="font-extrabold" style={{ color: tone.ink, fontSize: 12 }}>
            {String(index).padStart(2, '0')}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Tracking ID + price */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: MINT, flexShrink: 1 }}>
              <Hash size={10} color={GREEN} />
              <Text className="font-extrabold" style={{ fontSize: 11, color: GREEN_DEEP, marginLeft: 2 }} numberOfLines={1}>
                {trackingId}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {priceStr ? (
              <Text className="font-extrabold" style={{ fontSize: 13, color: GREEN_DEEP, marginLeft: 8 }}>
                ₹{priceStr}
              </Text>
            ) : null}
          </View>

          {/* Customer + device */}
          <Text className="font-extrabold" style={{ fontSize: 13, color: INK, marginTop: 4 }} numberOfLines={1}>
            {customer}
            {device ? <Text style={{ fontWeight: '600', color: MUTED }}>  ·  {device}</Text> : null}
          </Text>

          {/* Issue */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
            <Wrench size={11} color={GREEN} style={{ marginTop: 2, marginRight: 5 }} />
            <Text style={{ flex: 1, fontSize: 11, color: MUTED, lineHeight: 15 }} numberOfLines={2}>
              {summarizeIssue(ticket)}
            </Text>
          </View>

          {/* Date */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Calendar size={11} color={SUBTLE} />
            <Text style={{ fontSize: 11, color: SUBTLE, marginLeft: 4 }}>{fmtDate(ticket.createdAt)}</Text>
          </View>
        </View>
      </View>

      {/* Action row — View Details · History · Invoice. */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: HAIR }}>
        <CardAction icon={FileText} label="View Details" tint={MINT} fg={GREEN_DEEP} onPress={onViewDetails} />
        <CardAction icon={Clock} label="History" tint={HAIR} fg={INK} onPress={onHistory} />
        <CardAction icon={Receipt} label="Invoice" tint={YELLOW_TINT} fg={YELLOW_TEXT} onPress={onInvoice} />
      </View>
    </View>
  );
}

// Compact action pill used inside the ticket card — three fit side by side.
function CardAction({ icon: Icon, label, tint, fg, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: BORDER }}
      accessibilityRole="button"
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        height: 30, borderRadius: 9, paddingHorizontal: 4, backgroundColor: tint,
      }}
    >
      <Icon size={12} color={fg} />
      <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 11, color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
