import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import SafeModal, { ModalInsets } from '../../components/SafeModal';
import {
  Calendar,
  CircleCheck,
  ClipboardList,
  Clock,
  Copy,
  FileText,
  Laptop,
  Package,
  PackageCheck,
  Phone,
  Receipt,
  Smartphone,
  Stethoscope,
  TriangleAlert,
  Truck,
  UserCheck,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { notify } from '../../components/confirm';
import { SearchBar } from '../../components/rnr/SearchBar';
import {
  RC,
  ReportEmpty,
  ReportHeader,
  ReportHeaderButton,
  ReportTile,
  StatusRail,
  TileDisc,
  reportStyles,
  tileText,
  useReportGeometry,
} from '../../components/report/ReportRail';
import { resolveDeviceImageSource } from '../../utils/images';
import { useResponsive } from '../../theme/responsive';
import { estimatedTotalOf, paymentFromTicket } from './AllBooking/ReceiptCard';

/**
 * Booking list for one Service Status tile, in the Jobs look: white header,
 * Jobs tiles, and — when the tile spans several statuses (In Process, Working
 * Pending) — a left rail to split them. The fetch, tile and list states are
 * exported so the Service Status screen renders the very same list.
 */

// Brand tone + icon per Service Status tile key (also used by that screen).
export const TILE_META = {
  TOTAL_BOOKING:             { tone: RC.teal,   Icon: ClipboardList },
  TOTAL_PROCESSED:           { tone: RC.green,  Icon: CircleCheck },
  TOTAL_DELIVERED:           { tone: RC.navy,   Icon: PackageCheck },
  OUT_FOR_DELIVERY:          { tone: RC.blue,   Icon: Truck },
  TOTAL_INPROCESS:           { tone: RC.orange, Icon: Wrench },
  WORK_PENDING:              { tone: RC.red,    Icon: TriangleAlert },
  SPARE_PARTS_PENDING:       { tone: RC.orange, Icon: Package },
  CUSTOMER_APPROVAL_PENDING: { tone: RC.blue,   Icon: UserCheck },
};

const FALLBACK_META = { tone: RC.teal, Icon: FileText };

// Rail entries for a multi-status tile, one per backend status.
const SUB_META = {
  CREATED:              { label: 'Accepted',         tone: RC.orange, Icon: ClipboardList },
  IN_DIAGNOSIS:         { label: 'In Diagnosis',     tone: RC.blue,   Icon: Stethoscope },
  IN_REPAIR:            { label: 'In Repair',        tone: RC.orange, Icon: Wrench },
  APPROVED:             { label: 'Parts Pending',    tone: RC.orange, Icon: Package },
  QUOTED:               { label: 'Approval Pending', tone: RC.blue,   Icon: UserCheck },
  READY:                { label: 'Processed',        tone: RC.green,  Icon: CircleCheck },
  DELIVERED_PROCESSING: { label: 'Dispatched', tone: RC.blue,   Icon: Truck },
  DELIVERED:            { label: 'Delivered',        tone: RC.navy,   Icon: PackageCheck },
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

function fmtINR(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Shared with the Service Status screen
// ---------------------------------------------------------------------------

// The tile's bookings. An empty list is the Total Booking tile: one unfiltered
// page rather than one request per status. Page size 500 matches the bookings
// list so the count here can't disagree with the tile's. Throws only when
// every request failed, so the list shows an error instead of "no bookings".
export async function fetchStatusTickets(statusList) {
  const list = Array.isArray(statusList) ? statusList.filter(Boolean) : [];
  const responses = list.length === 0
    ? [await ticketApi.get('/tickets', { query: { page: 0, size: 500 } }).catch(() => null)]
    : await Promise.all(
        list.map((s) =>
          ticketApi.get('/tickets', { query: { page: 0, size: 500, status: s } }).catch(() => null),
        ),
      );
  if (responses.every((res) => res == null)) throw new Error('Could not load bookings');
  return responses.flatMap((res) => (Array.isArray(res) ? res : res?.content || []));
}

export const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

function deviceName(t) {
  return t?.deviceDisplayName || t?.deviceModelName
    || [t?.brandName, t?.modelName].filter(Boolean).join(' ') || 'Device';
}

// "Oppo A5 5G · CPH2753 · 8GB" → "Oppo A5 5G".
function modelName(t) {
  return String(deviceName(t)).split(/[·•|]/).map((x) => x.trim()).filter(Boolean)[0] || 'Device';
}

function ticketNo(t) {
  return t?.trackingId || (t?.id ? String(t.id).slice(0, 8).toUpperCase() : '-');
}

// Search: ticket number, customer, phone or model.
export function ticketMatches(t, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  return [ticketNo(t), t.bookingNumber, t.customerName, t.customerPhone, deviceName(t), t.modelName]
    .some((v) => v && String(v).toLowerCase().includes(needle));
}

// Existing invoice → DeliveryInvoiceReport, otherwise → InvoiceGenerator
// (same routing as BillingScreen / TicketDetail).
export async function openTicketInvoice(navigation, t) {
  try {
    const inv = await ticketApi.get(`/tickets/${t.id}/invoice`);
    if (inv?.id) {
      navigation.navigate('DeliveryInvoiceReport', { ticketId: t.id });
      return;
    }
  } catch (_) { /* no invoice yet — fall through */ }
  navigation.navigate('InvoiceGenerator', { ticketId: t.id });
}

// Ticket status → Jobs status tag.
const STATUS_TAG = {
  CREATED:              { label: 'Service Accepted',     color: '#B45309' },
  ASSIGNED:             { label: 'Technician Assigned',  color: RC.teal },
  IN_DIAGNOSIS:         { label: 'In Diagnosis',         color: RC.teal },
  IN_REPAIR:            { label: 'In Service Process',   color: RC.teal },
  QUOTED:               { label: 'Re-Estimated',         color: '#B45309' },
  APPROVED:             { label: 'Customer Approved',    color: RC.teal },
  READY:                { label: 'Ready for Delivery',   color: RC.teal },
  INVOICE_GENERATED:    { label: 'Invoice Generated',    color: '#B45309' },
  INVOICE_READY:        { label: 'Invoice Ready',        color: '#B45309' },
  DELIVERED_PROCESSING: { label: 'Dispatched', color: '#B45309' },
  DELIVERED:            { label: 'Delivered',            color: RC.teal },
  CANCELLED:            { label: 'Cancelled',            color: '#B91C1C' },
  RETURNED:             { label: 'Returned',             color: '#B91C1C' },
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

// Jobs pay logic (no invoice row): amount, Paid, Bal.
function payOf(t) {
  const estimate = Number(estimatedTotalOf(t)) || 0;
  const bill = Number(t.finalPrice ?? estimate) || 0;
  const pay = paymentFromTicket(t, bill);
  const delivered = String(t.status || '').toUpperCase() === 'DELIVERED';
  const fullPaid = delivered || pay?.label === 'Full Payment';
  const paid = fullPaid ? (delivered ? bill : pay.amount) : pay ? pay.amount : null;
  const balance = delivered ? 0 : pay ? pay.balance : bill;
  const bal = balance > 0
    ? { value: inr(balance), color: '#B45309' }
    : fullPaid || bill > 0 ? { value: 'Settled', color: '#15803D' } : null;
  return { amount: bill, paid: paid != null ? inr(paid) : null, bal };
}

function fmtDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Tickets carry no device-category field, so infer phone vs laptop from text.
const LAPTOP_RE = /(laptop|notebook|macbook|chromebook|thinkpad|ideapad|vivobook|zenbook|xps|inspiron|latitude|vostro|pavilion|elitebook|probook|envy|spectre|omen|aspire|swift|predator|nitro|rog|tuf|legion|yoga|surface\s*(laptop|book)|galaxy\s*book|matebook|gram)/i;

// brandId → Promise<models[]>, shared by all tiles so each brand is fetched once.
const modelsByBrand = new Map();
function modelImageFor(ticket) {
  if (!ticket?.brandId || !ticket?.modelId) return Promise.resolve(null);
  if (!modelsByBrand.has(ticket.brandId)) {
    modelsByBrand.set(ticket.brandId, getModelsByBrand(ticket.brandId).catch(() => {
      modelsByBrand.delete(ticket.brandId);
      return [];
    }));
  }
  return modelsByBrand.get(ticket.brandId).then((models) => {
    const m = (Array.isArray(models) ? models : []).find((x) => x.id === ticket.modelId);
    return resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
  });
}

// Device photo (ticket image → catalogue model image), else a white device
// icon on a solid brand disc.
function DeviceImage({ ticket, row }) {
  const direct = resolveDeviceImageSource({
    url: ticket.deviceImageUrl || ticket.modelImageUrl,
    base64: ticket.deviceImageBase64 || ticket.modelImageBase64,
  });
  const [src, setSrc] = useState(direct);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (direct) return undefined;
    let alive = true;
    modelImageFor(ticket).then((s) => { if (alive) setSrc(s); });
    return () => { alive = false; };
  }, [ticket.id, ticket.brandId, ticket.modelId]);
  if (src && !failed) {
    return <Image source={{ uri: src }} style={{ width: '76%', height: '76%' }} resizeMode="contain" onError={() => setFailed(true)} />;
  }
  const laptop = LAPTOP_RE.test([ticket.deviceDisplayName, ticket.brandName, ticket.modelName].filter(Boolean).join(' '));
  return <TileDisc Icon={laptop ? Laptop : Smartphone} tone={laptop ? RC.blue : RC.teal} row={row} />;
}

function RoundBtn({ Icon, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={6} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} style={st.roundBtn}>
      <Icon size={12} color={RC.teal} />
    </TouchableOpacity>
  );
}

const callPhone = (phone) => {
  const tel = String(phone).replace(/[^\d+]/g, '');
  if (!tel) return;
  Linking.openURL(`tel:${tel}`).catch(() => notify('Could not call', 'This device cannot place calls.', { preset: 'error' }));
};

const copyPhone = async (phone) => {
  try {
    await Clipboard.setStringAsync(String(phone));
    notify('Copied', `${phone} copied.`, { preset: 'done' });
  } catch (e) {
    notify('Copy failed', e?.message || 'Could not copy the number.', { preset: 'error' });
  }
};

// Jobs tile: device image (status tag · VIEW), ticket no · amount, Bal · Paid,
// model, customer, date · time, then call / copy and history / invoice.
export function BookingTile({ ticket, row = true, onPress, onHistory, onInvoice }) {
  const tag = STATUS_TAG[String(ticket.status || '').toUpperCase()]
    || { label: ticket.status ? String(ticket.status).replace(/_/g, ' ') : 'Pending', color: '#B45309' };
  const no = ticketNo(ticket);
  const model = modelName(ticket);
  const pay = payOf(ticket);
  const phone = ticket.customerPhone || ticket.customer?.phone || '';
  const customer = ticket.customerName || ticket.customerFullName || ticket.customer?.name || '-';
  const date = fmtDate(ticket.createdAt);
  const time = fmtTime(ticket.createdAt);
  return (
    <ReportTile
      row={row}
      panel={<DeviceImage ticket={ticket} row={row} />}
      tag={tag.label}
      tagColor={tag.color}
      onPress={onPress}
      accessibilityLabel={`${model}, #${no}, ${tag.label}`}
    >
      <View style={st.refRow}>
        <Text style={st.ref} numberOfLines={1}>#{no}</Text>
        <View style={st.amountChip}>
          <Text style={st.amountText} numberOfLines={1}>{inr(pay.amount)}</Text>
        </View>
      </View>
      {pay.bal || pay.paid ? (
        <View style={st.payRow}>
          {pay.bal ? <Text style={[st.payText, { color: pay.bal.color }]} numberOfLines={1}>Bal {pay.bal.value}</Text> : null}
          <View style={{ flex: 1, minWidth: 4 }} />
          {pay.paid ? <Text style={[st.payText, { color: '#15803D' }]} numberOfLines={1}>Paid {pay.paid}</Text> : null}
        </View>
      ) : null}
      <Text style={tileText.title} numberOfLines={2}>{model}</Text>
      <Text style={tileText.sub} numberOfLines={1}>{customer}</Text>
      {date || time ? (
        <View style={tileText.dateRow}>
          <Text style={[tileText.date, { flexShrink: 1 }]} numberOfLines={1}>{date}</Text>
          <Text style={[tileText.date, { marginLeft: 6 }]} numberOfLines={1}>{time}</Text>
        </View>
      ) : null}
      <View style={st.actions}>
        <View style={st.actionGroup}>
          {phone ? <RoundBtn Icon={Phone} label={`Call ${phone}`} onPress={() => callPhone(phone)} /> : null}
          {phone ? <RoundBtn Icon={Copy} label={`Copy mobile number ${phone}`} onPress={() => copyPhone(phone)} /> : null}
        </View>
        <View style={st.actionGroup}>
          {onHistory ? <RoundBtn Icon={Clock} label="History" onPress={onHistory} /> : null}
          {onInvoice ? <RoundBtn Icon={Receipt} label="Invoice" onPress={onInvoice} /> : null}
        </View>
      </View>
    </ReportTile>
  );
}

// Loading / error / empty, shown inside the list.
export function BookingListState({ loading, error, onRetry, emptyText, Icon, tone }) {
  if (loading) {
    return (
      <View style={st.stateBox}>
        <ActivityIndicator size="small" color={RC.teal} />
        <Text style={st.stateText}>Loading bookings…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={[st.stateBox, st.stateCard]}>
        <View style={[st.stateIcon, { backgroundColor: RC.red }]}>
          <WifiOff size={20} color={RC.white} />
        </View>
        <Text style={st.stateTitle}>Couldn't load bookings</Text>
        <Text style={st.stateText}>{error}</Text>
        {onRetry ? (
          <TouchableOpacity style={st.retryBtn} onPress={onRetry} activeOpacity={0.85} accessibilityRole="button">
            <Text style={st.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  return <ReportEmpty text={emptyText} Icon={Icon} tone={tone} />;
}

// Two-column lists get a blank ghost so the last lone tile stays half-width.
export function withGhost(rows, numCols) {
  return numCols > 1 && rows.length % 2 === 1 ? [...rows, { id: '__ghost__', _ghost: true }] : rows;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function BookingStatusReportScreen({ navigation, route }) {
  const r = useResponsive();
  const { width: winW } = useWindowDimensions();
  const { isSmall, railW, bottomPad } = useReportGeometry();
  const {
    label = 'Total Booking',
    statusList = [],
    icon = 'TOTAL_BOOKING',
  } = route?.params || {};

  const meta = TILE_META[icon] || FALLBACK_META;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Default to ALL so the count on the Service Status tile (all-time, from
  // /tickets/counts) matches what's shown here.
  const [period, setPeriod] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sub, setSub] = useState('ALL');

  // `load` keys off the CSV, not the array: navigating here without params
  // materializes a fresh default array on every render, which as a useCallback
  // dep would re-create load → re-fire the effect → re-render, forever.
  const statusCsv = (Array.isArray(statusList) ? statusList : []).join(',');
  const subs = useMemo(() => (statusCsv ? statusCsv.split(',') : []), [statusCsv]);
  const hasRail = subs.length > 1;
  const numCols = winW - (hasRail ? railW : 0) >= 680 ? 2 : 1;
  const capW = numCols === 1 ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : null;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const merged = await fetchStatusTickets(statusCsv ? statusCsv.split(',') : []);
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
      filtered.sort(byNewest);
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
    () => (PERIODS.find((p) => p.value === period)?.label) || 'All Time',
    [period],
  );

  const shown = useMemo(() => tickets.filter((t) => (
    (sub === 'ALL' || String(t.status || '').toUpperCase() === sub) && ticketMatches(t, query)
  )), [tickets, sub, query]);

  const totalPrice = useMemo(() => shown.reduce((sum, t) => {
    const v = Number(t.finalPrice ?? estimatedTotalOf(t));
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0), [shown]);

  const railItems = useMemo(() => (hasRail ? [
    { key: 'ALL', label: 'All', tone: meta.tone, Icon: meta.Icon, count: loading ? null : tickets.length },
    ...subs.map((s) => {
      const m = SUB_META[s] || { label: s.replace(/_/g, ' '), tone: RC.teal, Icon: FileText };
      const count = tickets.filter((t) => String(t.status || '').toUpperCase() === s).length;
      return { key: s, label: m.label, tone: m.tone, Icon: m.Icon, count: loading ? null : count };
    }),
  ] : []), [hasRail, subs, tickets, loading, meta]);

  const toggleSearch = () => {
    if (searchOpen) setQuery('');
    setSearchOpen((v) => !v);
  };

  const n = shown.length;
  const noun = n === 1 ? 'booking' : 'bookings';
  const data = loading || error ? [] : withGhost(shown, numCols);
  const subLabel = sub === 'ALL' ? label : (SUB_META[sub]?.label || sub);

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return (
      <BookingTile
        ticket={item}
        row={numCols === 1}
        onPress={() => navigation.navigate('TicketDetail', { ticketId: item.id })}
        onHistory={() => navigation.navigate('BookingTimeline', { ticketId: item.id })}
        onInvoice={() => openTicketInvoice(navigation, item)}
      />
    );
  };

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ReportHeader
        title={label}
        subtitle={`${periodLabel} · ${n} ${noun}`}
        onBack={() => navigation.goBack()}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        right={(
          <ReportHeaderButton
            Icon={Calendar}
            label={`Period: ${periodLabel}`}
            active={period !== 'ALL'}
            onPress={() => setShowFilters(true)}
          />
        )}
      />

      {searchOpen || query ? (
        <View style={st.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search ticket, customer, phone, model"
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      <View style={reportStyles.body}>
        {hasRail ? (
          <StatusRail items={railItems} active={sub} onSelect={setSub} width={railW} isSmall={isSmall} bottomPad={bottomPad} />
        ) : null}
        <View style={{ flex: 1 }}>
          <FlatList
            data={data}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RC.teal} colors={[RC.teal]} />}
            contentContainerStyle={{ ...reportStyles.listPad, paddingBottom: bottomPad, ...capW }}
            ListHeaderComponent={loading || error ? null : (
              <Text style={st.summary} numberOfLines={1}>
                {n} {noun}
                <Text style={st.summaryMuted}>  ·  ₹{fmtINR(totalPrice) || '0'} total</Text>
              </Text>
            )}
            ListEmptyComponent={(
              <BookingListState
                loading={loading}
                error={error}
                onRetry={() => load()}
                emptyText={query.trim()
                  ? `No bookings match "${query.trim()}".`
                  : `No "${subLabel}" bookings for ${periodLabel.toLowerCase()}.`}
                Icon={meta.Icon}
                tone={meta.tone}
              />
            )}
          />
        </View>
      </View>

      {/* Filters bottom sheet */}
      <SafeModal
        transparent
        visible={showFilters}
        animationType="fade"
        onRequestClose={() => setShowFilters(false)}
      >
        {/* The modal window's own insets — the screen's don't reach it. */}
        <ModalInsets>
          {({ insets }) => (
            <Pressable
              onPress={() => setShowFilters(false)}
              style={{ flex: 1, backgroundColor: 'rgba(17, 17, 17, 0.5)', justifyContent: 'flex-end' }}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  // Tablets: cap and centre the sheet.
                  width: '100%',
                  maxWidth: r.maxWidth('form'),
                  alignSelf: 'center',
                  backgroundColor: RC.white,
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 22,
                  paddingHorizontal: 14,
                  paddingTop: 10,
                  paddingBottom: insets.bottom + 18,
                }}
              >
                <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: RC.line, marginBottom: 10 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: RC.ink }}>Filter by period</Text>
                  <Pressable
                    onPress={() => setShowFilters(false)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: RC.bg }}
                  >
                    <X size={14} color={RC.ink} />
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
                        backgroundColor: active ? RC.tint : RC.white,
                        borderColor: active ? RC.teal : RC.line,
                      }}
                    >
                      <View
                        style={{
                          width: 30, height: 30, borderRadius: 15, marginRight: 10, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: active ? RC.teal : RC.tint,
                        }}
                      >
                        <Calendar size={14} color={active ? RC.white : RC.teal} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: active ? RC.teal : RC.ink }}>
                        {p.label}
                      </Text>
                      {active ? <CircleCheck size={17} color={RC.teal} /> : null}
                    </Pressable>
                  );
                })}
              </Pressable>
            </Pressable>
          )}
        </ModalInsets>
      </SafeModal>
    </View>
  );
}

const st = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },
  summary: { marginBottom: 10, fontSize: 13, fontWeight: '800', color: RC.ink },
  summaryMuted: { fontSize: 12, fontWeight: '600', color: RC.muted },

  refRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  ref: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '800', color: RC.teal },
  amountChip: { marginLeft: 6, flexShrink: 0, backgroundColor: RC.teal, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  amountText: { color: RC.white, fontSize: 14, fontWeight: '800' },
  payRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  payText: { flexShrink: 1, fontSize: 11.5, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 4, marginTop: 4 },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roundBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: RC.tint, alignItems: 'center', justifyContent: 'center' },

  stateCard: { backgroundColor: RC.white, borderRadius: 16, borderWidth: 1, borderColor: RC.line },
  stateBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 12, gap: 6 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 14, fontWeight: '800', color: RC.ink },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },
  retryBtn: { marginTop: 6, backgroundColor: RC.teal, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { color: RC.white, fontWeight: '700', fontSize: 12 },
});
