import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { railSizes } from '../../components/report/ReportRail';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Check,
  ChartColumn,
  Smartphone,
  Laptop,
  UserCog,
  Clock,
  Inbox,
  RefreshCw,
  WifiOff,
  Wrench,
  ScanLine,
  Search,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { notify } from '../../components/confirm';
import { SearchBar } from '../../components/rnr/SearchBar';
import { resolveDeviceImageSource } from '../../utils/images';
import { estimatedTotalOf } from './AllBooking/ReceiptCard';

/**
 * Job's Report — the same screen as the Employee app's Job Report
 * (GGFIX-Staff-App/src/screens/JobReportScreen.js), over the shop's tickets.
 *
 * Two modes. From the dashboard's "Job's Report" tile there is no `employee`
 * param and it lists every ticket that has a technician on it; from one
 * employee's "Task Report" button it carries `employee` and lists only that
 * technician's tickets (ticket.assignedTechnicianId === /technicians id).
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Ticket statuses → display buckets (same split as the Employee app).
function bucketize(status) {
  const s = (status || '').toUpperCase();
  if (s === 'DELIVERED' || s === 'CANCELLED') return 'COMPLETED';
  if (s === 'CREATED' || s === 'IN_DIAGNOSIS' || s === 'QUOTED') return 'PENDING';
  return 'IN_PROCESS';
}

const STATUS_LABEL = {
  CREATED: 'Booking Created',
  IN_DIAGNOSIS: 'In Diagnosis',
  QUOTED: 'Quotation Sent. Awaiting Approval',
  APPROVED: 'Customer Approved. Work Pending',
  IN_REPAIR: 'Repair Work In Progress',
  READY: 'Ready for Delivery',
  DELIVERED: 'Delivered to Customer',
  CANCELLED: 'Work Cancelled',
};

function statusLabel(status) {
  const s = (status || '').toUpperCase();
  return STATUS_LABEL[s] || (status ? status.replace(/_/g, ' ') : '—');
}

// Canonical event order: the highest-index event is the ticket's current
// phase even when two events share a createdAt (accept + work-started).
const CANONICAL_EVENT_ORDER = [
  'BOOKING_CREATED_BY_SHOP',
  'SERVICE_ACCEPTED',
  'ASSIGNED_TO_TECHNICIAN',
  'AWAITING_TECHNICIAN_ACCEPTANCE',
  'REASSIGNED_TO_TECHNICIAN',
  'TECHNICIAN_ACCEPTED_SERVICE',
  'TECHNICIAN_WORK_STARTED',
  'TECHNICIAN_UPLOADED_DEVICE_IMAGES',
  'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED',
  'RE_ESTIMATED_CONFIRMED',
  'CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED',
  'IN_REPAIR',
  'PARTS_REQUIRED',
  'QUALITY_CHECK_COMPLETED',
  'REPAIR_COMPLETED',
  'READY',
  'DELIVERED',
  'CANCELLED',
];
const EVENT_INDEX = Object.fromEntries(CANONICAL_EVENT_ORDER.map((k, i) => [k, i]));

const EVENT_LABEL = {
  BOOKING_CREATED_BY_SHOP: 'Booking Created by Shop',
  SERVICE_ACCEPTED: 'Service Accepted',
  ASSIGNED_TO_TECHNICIAN: 'Assigned to Technician',
  AWAITING_TECHNICIAN_ACCEPTANCE: 'Awaiting Technician Acceptance',
  REASSIGNED_TO_TECHNICIAN: 'Re-Assigned to Technician',
  TECHNICIAN_ACCEPTED_SERVICE: 'Technician Accepted Service',
  TECHNICIAN_WORK_STARTED: 'Technician Work Started',
  TECHNICIAN_UPLOADED_DEVICE_IMAGES: 'Technician Uploaded Device Images',
  TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED: 'Technician Compliance Issue Verified & Updated',
  RE_ESTIMATED_CONFIRMED: 'Re-Estimated Confirmed',
  CUSTOMER_APPROVED: 'Customer Approved',
  CUSTOMER_REJECTED: 'Customer Rejected',
  IN_REPAIR: 'Repair Work In Progress',
  PARTS_REQUIRED: 'Spare Parts Waiting',
  QUALITY_CHECK_COMPLETED: 'Quality Check Completed',
  REPAIR_COMPLETED: 'Repair Completed',
  READY: 'Repair Completed',
  DELIVERED: 'Repair Completed',
  CANCELLED: 'Work Cancelled',
};

function eventLabel(eventKey) {
  if (!eventKey) return null;
  const k = String(eventKey).toUpperCase();
  return EVENT_LABEL[k] || k.replace(/_/g, ' ');
}

function pickLatestEventKey(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  let bestKey = null;
  let bestIndex = -1;
  let bestTime = -Infinity;
  for (const e of events) {
    const k = (e?.status || '').toUpperCase();
    if (!k) continue;
    const idx = EVENT_INDEX[k];
    const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    if (idx == null) {
      if (bestIndex === -1 && t > bestTime) {
        bestKey = k;
        bestTime = t;
      }
      continue;
    }
    if (idx > bestIndex || (idx === bestIndex && t > bestTime)) {
      bestKey = k;
      bestIndex = idx;
      bestTime = t;
    }
  }
  return bestKey;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function ticketRef(t) {
  if (t?.trackingId) return `#${t.trackingId}`;
  const digits = String(t?.id || '').replace(/[^0-9]/g, '').slice(0, 8);
  return `#CSPEN${digits || '——'}`;
}

// ---------------------------------------------------------------------------
// Visual tokens (brand sheet — same as the Jobs screen)
// ---------------------------------------------------------------------------
const C = {
  green: '#035C6C', // Primary Teal
  navy: '#1C3053',
  blue: '#0788C9',
  leaf: '#609138',
  red: '#F32C26',
  yellow: '#FAA700',
  ink: '#111111',
  bg: '#F3F4F6',
  tint: '#E5F3F5',
  white: '#FFFFFF',
  muted: '#6B7280',
  faint: '#A3A3A3',
  line: '#E5E7EB',
};

function statusPill(t) {
  const s = (t?.status || '').toUpperCase();
  const bk = bucketize(s);
  if (s === 'QUOTED') return { label: 'Pending Approval', tone: 'yellow' };
  if (bk === 'PENDING') return { label: 'Pending', tone: 'red' };
  if (bk === 'IN_PROCESS') return { label: 'In Process', tone: 'yellow' };
  if (s === 'CANCELLED') return { label: 'Cancelled', tone: 'ink' };
  return { label: 'Completed', tone: 'green' };
}

// Tickets carry no device-category field, so infer phone vs laptop from text.
const LAPTOP_RE = /(laptop|notebook|macbook|chromebook|thinkpad|ideapad|vivobook|zenbook|xps|inspiron|latitude|vostro|pavilion|elitebook|probook|envy|spectre|omen|aspire|swift|predator|nitro|rog|tuf|legion|yoga|surface\s*(laptop|book)|galaxy\s*book|matebook|gram)/i;
function isLaptop(t) {
  return LAPTOP_RE.test([t?.deviceDisplayName, t?.brandName, t?.modelName].filter(Boolean).join(' '));
}

function deviceName(t) {
  if (t?.deviceDisplayName) return t.deviceDisplayName;
  return [t?.brandName, t?.modelName].filter(Boolean).join(' ') || 'Device';
}

function issueText(t) {
  return t?.issueDescription || t?.repairServicesSummary || t?.complianceNote || 'Issue not specified';
}

function filterByChip(list, chip) {
  return list.filter((b) => {
    const bk = bucketize(b.status);
    if (chip === 'All') return true;
    if (chip === 'Completed') return bk === 'COMPLETED';
    if (chip === 'In Process') return bk === 'IN_PROCESS';
    if (chip === 'Pending') return bk === 'PENDING';
    return false;
  });
}

const byRecent = (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);

// Bill amount when the ticket has one (final price, else the estimate).
const amountOf = (t) => Number(t?.finalPrice ?? estimatedTotalOf(t)) || 0;
const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

// Left rail — the report's status filters (same buckets as before), coloured
// from the brand sheet like the Jobs rail. `stat` is the old stat-card key.
const RAIL = [
  { key: 'All', stat: 'total', label: 'All', tone: C.green, Icon: ChartColumn },
  { key: 'In Process', stat: 'process', label: 'In Process', tone: C.yellow, Icon: RefreshCw },
  { key: 'Pending', stat: 'pending', label: 'Pending', tone: C.red, Icon: CircleAlert },
  { key: 'Completed', stat: 'completed', label: 'Completed', tone: C.leaf, Icon: Check },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function OwnerJobReportScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const tabSpace = insets.bottom + 16;
  const { width: winW } = useWindowDimensions();
  const isSmall = winW < 360;
  // Same geometry as Jobs: status rail on the left, one tile per row on
  // phones, two when the list is wide (tablets).
  const railW = winW >= 680 ? 104 : (isSmall ? 70 : 78);
  const numCols = winW - railW >= 680 ? 2 : 1;
  const employee = route.params?.employee;
  const allMode = !employee?.id;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [techNameById, setTechNameById] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  // Search bar is hidden until the header's Search icon opens it.
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('All');
  // Latest event key per ticket id — the card's "Status" line shows the real
  // current phase; falls back to the macro status until events arrive.
  const [eventStatusById, setEventStatusById] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [data, techs] = await Promise.all([
        ticketApi.get('/tickets', { query: { page: 0, size: 500 } }),
        allMode ? ticketApi.get('/technicians').catch(() => []) : Promise.resolve([]),
      ]);
      const content = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      setList(content.filter((t) => (allMode ? !!t.assignedTechnicianId : t.assignedTechnicianId === employee.id)));
      const techArr = Array.isArray(techs) ? techs : techs?.content || [];
      setTechNameById(Object.fromEntries(techArr.map((x) => [x.id, x.name])));
      setError(false);
    } catch {
      setError(true);
      if (isRefresh) notify('Could not refresh', 'Check your connection and pull down to try again.');
      else { setList([]); setEventStatusById({}); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allMode, employee?.id]);

  useEffect(() => { load(); }, [load]);

  // Scope to the picked month so the stats only reflect tickets touched then.
  const mine = useMemo(() => list.filter((b) => {
    const t = b.updatedAt || b.createdAt;
    if (!t) return true;
    const d = new Date(t);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  }), [list, year, month]);

  const counts = useMemo(() => {
    let pending = 0, inProcess = 0, completed = 0;
    mine.forEach((b) => {
      const bk = bucketize(b.status);
      if (bk === 'PENDING') pending += 1;
      else if (bk === 'COMPLETED') completed += 1;
      else inProcess += 1;
    });
    return { inProcess, pending, completed, total: mine.length };
  }, [mine]);

  // Search looks across every job (not just this month) by ref, device,
  // customer, phone, issue or technician; the stat filter still applies.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filterByChip([...mine].sort(byRecent), filter);
    return filterByChip([...list].sort(byRecent), filter).filter((t) => [
      ticketRef(t), deviceName(t), t.customerName, t.customerPhone, issueText(t), techNameById[t.assignedTechnicianId],
    ].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [mine, list, filter, query, techNameById]);

  // Events only for the rendered tickets (capped), re-fetched when that set
  // or the list changes; failures fall back to the macro status.
  const displayedKey = useMemo(() => shown.slice(0, 30).map((t) => t.id).filter(Boolean).join('|'), [shown]);
  useEffect(() => {
    const ids = displayedKey ? displayedKey.split('|') : [];
    if (ids.length === 0) return undefined;
    let active = true;
    (async () => {
      const updates = {};
      await Promise.all(ids.map(async (id) => {
        try {
          const key = pickLatestEventKey(await ticketApi.get(`/tickets/${id}/events`));
          if (key) updates[id] = key;
        } catch { /* macro status fallback */ }
      }));
      if (active && Object.keys(updates).length) setEventStatusById((prev) => ({ ...prev, ...updates }));
    })();
    return () => { active = false; };
  }, [displayedKey, list]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const openTicket = (t) => navigation.navigate('TicketDetail', { ticketId: t.id });
  const openHistory = (t) => navigation.navigate('BookingTimeline', { ticketId: t.id });
  const onStatPress = (key) => setFilter({ process: 'In Process', pending: 'Pending', completed: 'Completed' }[key] || 'All');
  const countFor = { total: counts.total, process: counts.inProcess, pending: counts.pending, completed: counts.completed };

  const phaseFor = (t) => eventLabel(eventStatusById[t.id]) || statusLabel(t.status);
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && shown.length % 2 === 1 ? [...shown, { id: '__ghost__', _ghost: true }] : shown;
  const capW = numCols === 1 ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : null;

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return (
      <ReportTile
        ticket={item}
        row={numCols === 1}
        phase={phaseFor(item)}
        technician={allMode ? (techNameById[item.assignedTechnicianId] || 'Technician') : null}
        onPress={() => openTicket(item)}
        onHistory={() => openHistory(item)}
      />
    );
  };

  const emptyNode = showInitialSpinner ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={C.green} />
      <Text style={styles.stateText}>Loading jobs…</Text>
    </View>
  ) : showError ? (
    <View style={[styles.stateCard, styles.stateBox]}>
      <View style={[styles.stateIcon, { backgroundColor: C.red }]}>
        <WifiOff size={20} color={C.white} />
      </View>
      <Text style={styles.stateTitle}>Couldn't load jobs</Text>
      <Text style={styles.stateText}>Check your connection and try again.</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <EmptyRow text={query.trim() ? `No jobs match "${query.trim()}".` : filter === 'All' ? 'No jobs this month.' : `No ${filter.toLowerCase()} jobs this month.`} />
  );

  return (
    <View style={styles.safe}>
      {/* ── White header: back · centred title · Search + Scan ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          {navigation.canGoBack() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={6} accessibilityLabel="Back" activeOpacity={0.7} style={styles.headerBack}>
              <ArrowLeft size={19} color={C.ink} />
            </TouchableOpacity>
          ) : null}
          <View pointerEvents="none" style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{allMode ? 'Job Report' : 'Job Record'}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{allMode ? 'Working Jobs' : (employee?.name || 'Technician')}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => { if (searchOpen) setQuery(''); setSearchOpen((v) => !v); }}
            hitSlop={6} accessibilityRole="button" accessibilityLabel={searchOpen ? 'Close search' : 'Search jobs'} activeOpacity={0.8}
            style={[styles.headerBtn, { backgroundColor: searchOpen ? C.green : C.tint }]}
          >
            <Search size={16} color={searchOpen ? C.white : C.green} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('ScanQrCode')}
            hitSlop={6} accessibilityRole="button" accessibilityLabel="Scan job QR code" activeOpacity={0.8}
            style={[styles.headerBtn, { backgroundColor: C.tint, marginLeft: 8 }]}
          >
            <ScanLine size={16} color={C.green} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search bar — only while the header's Search icon has it open ── */}
      {searchOpen || query ? (
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={allMode ? 'Search job, device, customer, technician' : 'Search job, device, customer'}
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      {/* ── Left: status rail · Right: month + job tiles ── */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <ScrollView
          style={{ width: railW, flexGrow: 0, borderRightWidth: 1, borderRightColor: C.line, backgroundColor: C.white }}
          contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 5, paddingBottom: tabSpace }}
          showsVerticalScrollIndicator={false}
        >
          {RAIL.map((s) => {
            const Icon = s.Icon;
            const active = filter === s.key;
            const tone = s.tone;
            const rz = railSizes(winW);
            const disc = rz.disc;
            const n = countFor[s.stat] ?? 0;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => onStatPress(s.stat)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${s.label}, ${n}`}
                style={{
                  marginVertical: 4, borderRadius: 14, backgroundColor: C.white,
                  shadowColor: tone, shadowOpacity: active ? 0.12 : 0.06, shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 }, elevation: active ? 2 : 1,
                }}
              >
                <LinearGradient
                  colors={['#FFFFFF', `${tone}${active ? '24' : '10'}`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{
                    alignItems: 'center', paddingVertical: 9, paddingHorizontal: 3, borderRadius: 14,
                    borderWidth: active ? 1.5 : 1, borderColor: active ? tone : `${tone}22`,
                  }}
                >
                  <View>
                    <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={rz.icon} color="#FFFFFF" strokeWidth={2.2} />
                    </View>
                    <View style={[styles.railCount, { borderColor: tone }]}>
                      <Text style={{ fontSize: rz.badge, fontWeight: '800', color: tone }} numberOfLines={1}>{n > 99 ? '99+' : n}</Text>
                    </View>
                  </View>
                  <Text
                    style={{ marginTop: 5, fontSize: rz.font, lineHeight: rz.line, fontWeight: active ? '800' : '700', color: tone, textAlign: 'center' }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {s.label}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }}>
          {/* Month — the report's period; search spans every month. */}
          <View style={styles.monthWrap}>
            <View style={[styles.monthBar, capW]}>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={8} accessibilityLabel="Previous month" activeOpacity={0.8} style={styles.monthBtn}>
                <ChevronLeft size={16} color={C.white} strokeWidth={2.4} />
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                <Text style={styles.monthText} numberOfLines={1}>{MONTHS[month - 1]} {year}</Text>
                <Text style={styles.monthSub} numberOfLines={1}>
                  {query.trim() ? `${shown.length} found · all months` : `${shown.length} ${shown.length === 1 ? 'job' : 'jobs'}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={8} accessibilityLabel="Next month" activeOpacity={0.8} style={styles.monthBtn}>
                <ChevronRight size={16} color={C.white} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={listData}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
            contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: tabSpace, ...capW }}
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
    <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: laptop ? C.blue : C.green, alignItems: 'center', justifyContent: 'center' }}>
      <DevIcon size={Math.round(disc * 0.46)} color={C.white} strokeWidth={2.1} />
    </View>
  );
}

const TONE_COLOR = { red: '#F32C26', yellow: '#FAA700', green: '#609138', blue: '#0788C9', ink: '#6B7280' };

// "Oppo A5 5G · CPH2753 · 8GB · 128GB" → model name, "CPH2753 - 8GB - 128GB".
function splitDevice(ticket) {
  const clean = (x) => String(x).replace(/^[\s ]+|[\s ]+$/g, '');
  const parts = String(deviceName(ticket)).split(/[·•|]/).map(clean).filter(Boolean);
  return { model: parts[0] || 'Device', specs: parts.slice(1).join(' - '), color: clean(ticket.color || '') };
}

// Jobs-style tile: image panel (status tag · VIEW) on the left (phones) or on
// top (tablet two-up), then ref · amount, model, specs, customer, technician
// (all-jobs view), issue, date · time and the current phase (tap → history).
function ReportTile({ ticket, row, phase, technician, onPress, onHistory }) {
  const pill = statusPill(ticket);
  const color = TONE_COLOR[pill.tone] || C.green;
  const d = splitDevice(ticket);
  const done = pill.tone === 'green' || pill.tone === 'ink';
  const when = done ? (ticket.updatedAt || ticket.createdAt) : ticket.createdAt;
  const time = timeOf(when);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${d.model}, ${ticketRef(ticket)}, ${pill.label}`}
      style={[styles.tileCard, row && { flexDirection: 'row' }]}
    >
      <View style={[styles.tilePanel, row ? styles.tilePanelRow : styles.tilePanelCol]}>
        <DeviceImage ticket={ticket} row={row} />
        <View style={[styles.statusTag, { backgroundColor: color }]}>
          <Text style={styles.statusTagText} numberOfLines={1}>{pill.label}</Text>
        </View>
        <View pointerEvents="none" style={[styles.viewBtn, row ? styles.viewBtnRow : styles.viewBtnCol]}>
          <Text style={[styles.viewBtnText, { fontSize: row ? 11 : 12 }]}>VIEW</Text>
        </View>
      </View>

      <View style={row ? styles.tileTextRow : styles.tileTextCol}>
        <View style={styles.refRow}>
          <Text style={styles.refText} numberOfLines={1}>{ticketRef(ticket)}</Text>
        </View>
        <Text style={styles.model} numberOfLines={2}>{d.model}</Text>
        <Text style={styles.customer} numberOfLines={1}>{ticket.customerName || '-'}</Text>
        {technician ? (
          <View style={styles.infoRow}>
            <UserCog size={11} color={C.muted} />
            <Text style={styles.infoText} numberOfLines={1}>{technician}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Wrench size={11} color={C.muted} />
          <Text style={styles.infoText} numberOfLines={1}>{issueText(ticket)}</Text>
        </View>
        <View style={styles.dateRow}>
          <Text style={styles.dateText} numberOfLines={1}>{formatDate(when)}</Text>
          {time ? <Text style={[styles.dateText, { marginLeft: 6 }]} numberOfLines={1}>{time}</Text> : null}
        </View>
        <TouchableOpacity onPress={onHistory} hitSlop={6} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Status: ${phase}. View history`} style={styles.phaseRow}>
          <Clock size={11} color={C.green} />
          <Text style={styles.phaseText} numberOfLines={1}>{phase}</Text>
          <ChevronRight size={12} color={C.green} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function EmptyRow({ text }) {
  return (
    <View style={styles.emptyRow}>
      <View style={[styles.stateIcon, { backgroundColor: C.green }]}>
        <Inbox size={20} color={C.white} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },

  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 12, paddingHorizontal: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  // Title centred on the SCREEN; padded so it never runs under the buttons.
  headerTitleWrap: { position: 'absolute', left: 0, right: 0, top: -4, bottom: -4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 96 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.ink, textAlign: 'center' },
  headerSub: { fontSize: 11, fontWeight: '700', color: C.muted, marginTop: 1, textAlign: 'center' },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },

  railCount: {
    position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8,
    backgroundColor: C.white, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  monthWrap: { paddingHorizontal: 10, paddingTop: 10 },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 6, paddingHorizontal: 6 },
  monthBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 13.5, fontWeight: '800', color: C.navy },
  monthSub: { fontSize: 11, color: C.muted, marginTop: 1 },

  tileCard: { flex: 1, marginBottom: 12, borderRadius: 16, backgroundColor: C.white, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  tilePanel: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: C.white },
  tilePanelRow: { width: 116, minHeight: 116, alignSelf: 'stretch', borderRightWidth: 1, borderRightColor: C.line },
  tilePanelCol: { aspectRatio: 1 },
  tileTextRow: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingBottom: 8 },
  tileTextCol: { paddingHorizontal: 8, paddingBottom: 8 },
  statusTag: { position: 'absolute', top: 0, left: 0, maxWidth: '78%', paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 },
  statusTagText: { color: C.white, fontSize: 9.5, fontWeight: '800' },
  viewBtn: { position: 'absolute', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.green, borderRadius: 10 },
  viewBtnRow: { right: 6, bottom: 6, paddingHorizontal: 10, paddingVertical: 3 },
  viewBtnCol: { right: 8, bottom: 8, paddingHorizontal: 14, paddingVertical: 5 },
  viewBtnText: { color: C.green, fontWeight: '800' },

  refRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  refText: { flex: 1, fontSize: 11, fontWeight: '800', color: C.green },
  amountChip: { marginLeft: 6, backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  amountText: { color: C.white, fontSize: 14, fontWeight: '800' },
  model: { marginTop: 4, fontSize: 12, fontWeight: '800', lineHeight: 16, color: C.ink },
  spec: { marginTop: 1, fontSize: 11, color: C.muted },
  customer: { marginTop: 2, fontSize: 12, color: C.muted },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  infoText: { flex: 1, minWidth: 0, fontSize: 11, color: C.muted },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  dateText: { fontSize: 11, color: C.muted },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: C.tint, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  phaseText: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: C.green },

  emptyRow: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 12, color: C.muted, textAlign: 'center' },

  stateCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  stateBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 12, gap: 6 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  stateText: { fontSize: 12, color: C.muted, textAlign: 'center' },
  retryBtn: { marginTop: 6, backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { color: C.white, fontWeight: '700', fontSize: 12 },
});
