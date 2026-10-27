import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  History,
  Layers,
  ClipboardCheck,
  ClipboardList,
  Wrench,
  CircleCheck,
  PackageCheck,
  TriangleAlert,
  Smartphone,
  Laptop,
  WifiOff,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { SearchBar } from '../../components/rnr/SearchBar';
import { resolveDeviceImageSource } from '../../utils/images';
import { estimatedTotalOf, paymentFromTicket } from './AllBooking/ReceiptCard';
import {
  RC,
  useReportGeometry,
  ReportHeader,
  ReportHeaderButton,
  StatusRail,
  MonthBar,
  ReportTile,
  tileText,
  ReportEmpty,
  reportStyles,
} from '../../components/report/ReportRail';

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

// Left rail: All + the report's status buckets, coloured from the brand sheet.
const STATUS_BUCKETS = [
  { key: 'CREATED',     label: 'Accepted',    Icon: ClipboardCheck, tone: RC.blue },
  { key: 'IN_PROGRESS', label: 'In Service',  Icon: Wrench,         tone: RC.orange },
  { key: 'READY',       label: 'Ready',       Icon: CircleCheck,    tone: RC.green },
  { key: 'DELIVERED',   label: 'Delivered',   Icon: PackageCheck,   tone: RC.navy },
  { key: 'PENDING',     label: 'Pending',     Icon: TriangleAlert,  tone: RC.red },
];
const BUCKET_TONE = Object.fromEntries(STATUS_BUCKETS.map((b) => [b.key, b.tone]));

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

const bucketOf = (t) => STATUS_TO_BUCKET[String(t?.status || '').toUpperCase()] || null;

// Status tag text — same labels as the Jobs tiles.
const STATUS_LABEL = {
  CREATED:              'Service Accepted',
  ASSIGNED:             'Technician Assigned',
  IN_DIAGNOSIS:         'In Diagnosis',
  IN_REPAIR:            'In Service Process',
  QUOTED:               'Re-Estimated',
  APPROVED:             'Customer Approved',
  READY:                'Ready for Delivery',
  INVOICE_GENERATED:    'Invoice Generated',
  INVOICE_READY:        'Invoice Ready',
  DELIVERED_PROCESSING: 'Dispatched',
  DELIVERED:            'Delivered',
  CANCELLED:            'Cancelled',
  RETURNED:             'Returned',
};

function statusText(status) {
  const s = String(status || '').toUpperCase();
  return STATUS_LABEL[s] || (status ? String(status).replace(/_/g, ' ') : 'Pending');
}

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

  // Newest first.
  return months.slice().reverse().map((m) => byMonth[m.key]);
}

// Month key of a ticket's createdAt, or null when it has none / is invalid.
function ticketMonth(t) {
  if (!t?.createdAt) return null;
  const d = new Date(t.createdAt);
  return Number.isNaN(d.getTime()) ? null : monthKey(d);
}

const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

function formatDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const h = date.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function ticketRef(t) {
  if (t?.trackingId) return `#${t.trackingId}`;
  return `#${t?.id ? String(t.id).slice(0, 8).toUpperCase() : '-'}`;
}

function fullDeviceName(t) {
  return t?.deviceDisplayName || [t?.brandName, t?.modelName].filter(Boolean).join(' ') || t?.deviceModelName || 'Device';
}

// "Oppo A5 5G · CPH2753 · 8GB" → "Oppo A5 5G".
function modelOf(t) {
  return String(fullDeviceName(t)).split(/[·•|]/).map((x) => x.trim()).filter(Boolean)[0] || 'Device';
}

const customerOf = (t) => t?.customerName || t?.customerFullName || t?.customer?.name || '-';
const phoneOf = (t) => t?.customerPhone || t?.customer?.phone || '';

// Amount chip + Bal / Paid line, the same rules as the Jobs tile.
function payInfo(t) {
  const estimate = Number(estimatedTotalOf(t)) || 0;
  const bill = Number(t?.finalPrice ?? estimate) || 0;
  const pay = paymentFromTicket(t, bill);
  const delivered = String(t?.status || '').toUpperCase() === 'DELIVERED';
  const full = delivered || pay?.label === 'Full Payment';
  const paid = full ? inr(delivered ? bill : pay.amount) : pay ? inr(pay.amount) : null;
  const balance = delivered ? 0 : pay ? pay.balance : bill;
  const bal = balance > 0
    ? { value: inr(balance), fg: '#B45309' }
    : full || bill > 0 ? { value: 'Settled', fg: '#15803D' } : null;
  return { amount: bill, paid, bal };
}

export default function BookingPreviousReportScreen({ navigation }) {
  const { isSmall, railW, numCols, capW, bottomPad } = useReportGeometry();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  // -1 = the whole window; 0 = current month, 1 = last month, …
  const [period, setPeriod] = useState(-1);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

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

  const allMonths = period === -1;
  const picked = allMonths ? null : months[period];
  const periodLabel = allMonths ? `Last ${MONTHS_TO_SHOW} months` : (picked?.label || '');
  const headerSub = allMonths ? windowRange : periodLabel;

  // Rail counts for the selected period (the old summary + month pills).
  const counts = useMemo(() => {
    const src = allMonths ? months : (picked ? [picked] : []);
    const out = { ALL: 0 };
    STATUS_BUCKETS.forEach((b) => { out[b.key] = 0; });
    src.forEach((m) => {
      out.ALL += m.total;
      STATUS_BUCKETS.forEach((b) => { out[b.key] += m.buckets[b.key] || 0; });
    });
    return out;
  }, [months, allMonths, picked]);

  const railItems = useMemo(() => [
    { key: 'ALL', label: 'All', tone: RC.teal, Icon: Layers, count: counts.ALL },
    ...STATUS_BUCKETS.map((b) => ({ key: b.key, label: b.label, tone: b.tone, Icon: b.Icon, count: counts[b.key] })),
  ], [counts]);

  // Every ticket inside the report window, newest first.
  const inWindow = useMemo(() => {
    const keys = new Set(months.map((m) => m.key));
    return tickets.filter((t) => keys.has(ticketMonth(t))).sort(byNewest);
  }, [tickets, months]);

  // Search spans the whole window; the rail bucket still applies.
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const byBucket = (t) => filter === 'ALL' || bucketOf(t) === filter;
    if (q) {
      return inWindow.filter(byBucket).filter((t) => [
        ticketRef(t), t.trackingId, customerOf(t), phoneOf(t), fullDeviceName(t), t.brandName, t.modelName,
      ].some((v) => v && String(v).toLowerCase().includes(q)));
    }
    const rows = allMonths ? inWindow : inWindow.filter((t) => ticketMonth(t) === picked?.key);
    return rows.filter(byBucket);
  }, [inWindow, filter, q, allMonths, picked]);

  // Period steps: oldest month ← … ← current month ← whole window.
  const stepOlder = () => setPeriod((p) => Math.min(p + 1, MONTHS_TO_SHOW - 1));
  const stepNewer = () => setPeriod((p) => Math.max(p - 1, -1));

  const monthSub = q
    ? `${shown.length} found · last ${MONTHS_TO_SHOW} months`
    : allMonths
      ? `${windowRange} · ${grandTotal} ${grandTotal === 1 ? 'booking' : 'bookings'}`
      : `${shown.length} ${shown.length === 1 ? 'booking' : 'bookings'}${period === 0 ? ' · Current' : ''}`;

  const toggleSearch = () => {
    if (searchOpen) setQuery('');
    setSearchOpen((v) => !v);
  };

  const openTicket = (t) => navigation.navigate('TicketDetail', { ticketId: t.id });
  const filterLabel = (railItems.find((it) => it.key === filter)?.label || '').toLowerCase();

  const showInitialSpinner = loading && tickets.length === 0;
  const showError = !!error && !loading && tickets.length === 0;

  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && shown.length % 2 === 1 ? [...shown, { id: '__ghost__', _ghost: true }] : shown;

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return <BookingTile ticket={item} row={numCols === 1} onPress={() => openTicket(item)} />;
  };

  const emptyNode = showInitialSpinner ? (
    <View style={st.stateBox}>
      <ActivityIndicator size="small" color={RC.teal} />
      <Text style={st.stateText}>Loading reports…</Text>
    </View>
  ) : showError ? (
    <View style={[st.stateCard, st.stateBox]}>
      <View style={[st.stateIcon, { backgroundColor: RC.red }]}>
        <WifiOff size={20} color={RC.white} />
      </View>
      <Text style={st.stateTitle}>Couldn't load reports</Text>
      <Text style={st.stateText}>{error}</Text>
      <TouchableOpacity style={st.retryBtn} onPress={() => load()} activeOpacity={0.85}>
        <Text style={st.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : q ? (
    <ReportEmpty text={`No bookings match "${query.trim()}".`} />
  ) : grandTotal === 0 ? (
    <ReportEmpty Icon={History} text="No history yet. Once bookings start flowing in, you'll see monthly snapshots here." />
  ) : (
    <ReportEmpty text={filter === 'ALL' ? `No bookings in ${periodLabel}.` : `No ${filterLabel} bookings in ${periodLabel}.`} />
  );

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={RC.white} />

      <ReportHeader
        title="Previous Reports"
        subtitle={headerSub}
        onBack={() => navigation.goBack()}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        right={(
          <ReportHeaderButton Icon={ClipboardList} label="View bookings" onPress={() => navigation.navigate('BookingList')} />
        )}
      />

      {searchOpen || query ? (
        <View style={st.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search ticket no, customer, phone, model"
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      <View style={reportStyles.body}>
        <StatusRail
          items={railItems}
          active={filter}
          onSelect={setFilter}
          width={railW}
          isSmall={isSmall}
          bottomPad={bottomPad}
        />

        <View style={{ flex: 1 }}>
          <MonthBar
            label={periodLabel}
            sub={monthSub}
            onPrev={stepOlder}
            onNext={stepNewer}
            prevDisabled={period >= MONTHS_TO_SHOW - 1}
            nextDisabled={allMonths}
            capW={capW}
          />

          <FlatList
            data={listData}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RC.teal} colors={[RC.teal]} />
            }
            contentContainerStyle={{ ...reportStyles.listPad, paddingBottom: bottomPad, ...capW }}
            ListEmptyComponent={emptyNode}
          />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Tickets carry no device-category field, so infer phone vs laptop from text.
const LAPTOP_RE = /(laptop|notebook|macbook|chromebook|thinkpad|ideapad|vivobook|zenbook|xps|inspiron|latitude|vostro|pavilion|elitebook|probook|envy|spectre|omen|aspire|swift|predator|nitro|rog|tuf|legion|yoga|surface\s*(laptop|book)|galaxy\s*book|matebook|gram)/i;
function isLaptop(t) {
  return LAPTOP_RE.test([t?.deviceDisplayName, t?.brandName, t?.modelName].filter(Boolean).join(' '));
}

// brandId → Promise<models[]>, shared by all rows so each brand is fetched once.
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

// Real device photo (ticket image → catalogue model image); else a white
// device icon on a solid brand disc.
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
  const laptop = isLaptop(ticket);
  const DevIcon = laptop ? Laptop : Smartphone;
  const disc = row ? 52 : 64;
  return (
    <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: laptop ? RC.blue : RC.teal, alignItems: 'center', justifyContent: 'center' }}>
      <DevIcon size={Math.round(disc * 0.46)} color={RC.white} strokeWidth={2.1} />
    </View>
  );
}

// Jobs-style tile: device image (status tag · VIEW), then ticket no · amount,
// Bal / Paid, model name, customer and date · time.
function BookingTile({ ticket, row, onPress }) {
  const label = statusText(ticket.status);
  const tone = BUCKET_TONE[bucketOf(ticket)] || RC.gray;
  const model = modelOf(ticket);
  const ref = ticketRef(ticket);
  const pay = payInfo(ticket);
  const date = formatDate(ticket.createdAt);
  const time = formatTime(ticket.createdAt);
  return (
    <ReportTile
      row={row}
      panel={<DeviceImage ticket={ticket} row={row} />}
      tag={label}
      tagColor={tone}
      onPress={onPress}
      accessibilityLabel={`${model}, ${ref}, ${label}`}
    >
      <View style={st.refRow}>
        <Text style={st.refText} numberOfLines={1}>{ref}</Text>
        <View style={st.amountChip}>
          <Text style={st.amountText} numberOfLines={1}>{inr(pay.amount)}</Text>
        </View>
      </View>
      {pay.bal || pay.paid ? (
        <View style={st.payRow}>
          {pay.bal ? <Text style={[st.payText, { color: pay.bal.fg }]} numberOfLines={1}>Bal {pay.bal.value}</Text> : null}
          <View style={{ flex: 1, minWidth: 6 }} />
          {pay.paid ? <Text style={[st.payText, { color: '#15803D' }]} numberOfLines={1}>Paid {pay.paid}</Text> : null}
        </View>
      ) : null}
      <Text style={tileText.title} numberOfLines={2}>{model}</Text>
      <Text style={tileText.sub} numberOfLines={1}>{customerOf(ticket)}</Text>
      {date || time ? (
        <View style={tileText.dateRow}>
          <Text style={[tileText.date, { flexShrink: 1 }]} numberOfLines={1}>{date || ''}</Text>
          {time ? <Text style={[tileText.date, { marginLeft: 6 }]} numberOfLines={1}>{time}</Text> : null}
        </View>
      ) : null}
    </ReportTile>
  );
}

const st = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },

  refRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  refText: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '800', color: RC.teal },
  amountChip: { marginLeft: 6, flexShrink: 1, maxWidth: '62%', backgroundColor: RC.teal, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  amountText: { color: RC.white, fontSize: 14, fontWeight: '800' },
  payRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  payText: { flexShrink: 1, fontSize: 11.5, fontWeight: '800' },

  stateCard: { backgroundColor: RC.white, borderRadius: 16, borderWidth: 1, borderColor: RC.line },
  stateBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 12, gap: 6 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 14, fontWeight: '800', color: RC.ink },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },
  retryBtn: { marginTop: 6, backgroundColor: RC.teal, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { color: RC.white, fontWeight: '700', fontSize: 12 },
});
