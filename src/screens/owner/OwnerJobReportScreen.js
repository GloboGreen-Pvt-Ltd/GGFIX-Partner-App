import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Check,
  ChartColumn,
  Smartphone,
  Laptop,
  User,
  UserCog,
  Clock,
  Inbox,
  RefreshCw,
  WifiOff,
  Wrench,
  ScanLine,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { notify } from '../../components/confirm';
import { SearchBar } from '../../components/rnr/SearchBar';
import TicketCard from '../../components/TicketCard';
import { resolveDeviceImageSource } from '../../utils/images';
import { useResponsive } from '../../theme/responsive';
import { rf, rs } from '../../utils/responsive';

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
// Visual tokens
// ---------------------------------------------------------------------------
const C = {
  green: '#035C6C',
  red: '#F32C26',
  yellow: '#FAA700',
  blue: '#0788C9',
  ink: '#111111',
  bg: '#F3F4F6',
  white: '#FFFFFF',
  muted: '#7A7A7A',
  faint: '#A3A3A3',
  line: '#EFEFEF',
};

const TONES = {
  red: { fg: C.red, bg: '#FEECEC' },
  yellow: { fg: C.yellow, bg: '#FFF4D6' },
  green: { fg: C.green, bg: '#E5F3F5' },
  blue: { fg: C.blue, bg: '#E8F0FE' },
  ink: { fg: C.ink, bg: '#E5E7EB' },
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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function OwnerJobReportScreen({ route, navigation }) {
  // Tablet: cap the column and centre it; phones are unaffected.
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
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

  const phaseFor = (t) => eventLabel(eventStatusById[t.id]) || statusLabel(t.status);
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header: back · centred title */}
      <View style={styles.headerBar}>
        <View style={{ width: rs(36) }}>
          {navigation.canGoBack() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" activeOpacity={0.7} style={styles.headerBack}>
              <ChevronLeft size={rs(20)} color="#111111" strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{allMode ? "Job's Report" : 'Working Record'}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{allMode ? 'Working Jobs' : (employee?.name || 'Technician')}</Text>
        </View>
        <View style={{ width: rs(36) }} />
      </View>

      {/* Search + scan a job QR */}
      <View style={[styles.searchWrap, capStyle]}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={allMode ? 'Search job, device, customer, technician' : 'Search job, device, customer'}
          onClear={() => setQuery('')}
          rightAccessory={(
            <TouchableOpacity
              onPress={() => navigation.navigate('ScanQrCode')}
              hitSlop={8} accessibilityLabel="Scan job QR code" activeOpacity={0.7}
              style={styles.scanBtn}
            >
              <ScanLine size={rs(18)} color={C.green} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        />
      </View>

      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={[styles.content, capStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
      >
        {/* Month */}
        <View style={styles.monthRow}>
          <View style={styles.monthPill}>
            <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={8} accessibilityLabel="Previous month">
              <ChevronLeft size={rs(15)} color={C.white} strokeWidth={2.4} />
            </TouchableOpacity>
            <Text style={styles.monthPillText} numberOfLines={1}>{MONTHS[month - 1].slice(0, 3)} {year}</Text>
            <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={8} accessibilityLabel="Next month">
              <ChevronRight size={rs(15)} color={C.white} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard value={counts.total} label="Total" tone="ink" Icon={ChartColumn} onPress={() => onStatPress('total')} active={filter === 'All'} />
          <StatCard value={counts.inProcess} label="In Process" tone="yellow" Icon={RefreshCw} onPress={() => onStatPress('process')} active={filter === 'In Process'} />
          <StatCard value={counts.pending} label="Pending" tone="red" Icon={CircleAlert} onPress={() => onStatPress('pending')} active={filter === 'Pending'} />
          <StatCard value={counts.completed} label="Completed" tone="green" Icon={Check} onPress={() => onStatPress('completed')} active={filter === 'Completed'} />
        </View>

        {showInitialSpinner && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color={C.green} />
            <Text style={styles.stateText}>Loading jobs…</Text>
          </View>
        )}

        {showError && (
          <View style={[styles.card, styles.stateBox]}>
            <View style={[styles.stateIcon, { backgroundColor: TONES.red.bg }]}>
              <WifiOff size={rs(20)} color={C.red} />
            </View>
            <Text style={styles.stateTitle}>Couldn't load jobs</Text>
            <Text style={styles.stateText}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showInitialSpinner && !showError && (
          shown.length === 0 ? (
            <EmptyRow text={query.trim() ? `No jobs match "${query.trim()}".` : filter === 'All' ? 'No jobs this month.' : `No ${filter.toLowerCase()} jobs this month.`} />
          ) : shown.map((t) => (
            <ReportCard
              key={t.id}
              ticket={t}
              phase={phaseFor(t)}
              technician={allMode ? (techNameById[t.assignedTechnicianId] || 'Technician') : null}
              onPress={() => openTicket(t)}
              onHistory={() => openHistory(t)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
const STAT_TONE = { yellow: '#FAA700', red: '#F32C26', green: '#609138', ink: '#1C3053' };

// Solid icon disc + count badge + label (the Employee app's BadgeIconTile).
function StatCard({ value, label, tone, Icon, onPress, active }) {
  const color = STAT_TONE[tone] || C.green;
  const size = rs(42);
  const n = Number(value) || 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${label}: ${n}`}>
      <View style={{ alignItems: 'center', minWidth: 0 }}>
        <View style={{ padding: rs(3), borderRadius: 999, borderWidth: 2, borderColor: active ? color : 'transparent' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={size * 0.44} color="#FFFFFF" strokeWidth={2.2} />
          </View>
          <View style={[styles.countBadge, { borderColor: color }]}>
            <Text style={{ fontSize: rf(10.5), fontWeight: '800', color }} numberOfLines={1}>{n > 99 ? '99+' : String(n)}</Text>
          </View>
        </View>
        <Text style={[styles.statLabel, { color: active ? color : C.ink }]} numberOfLines={2}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
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

// Real device photo (ticket image → catalogue model image); icon fallback.
function DeviceBadge({ ticket, tone }) {
  const t = TONES[tone] || TONES.green;
  const DevIcon = isLaptop(ticket) ? Laptop : Smartphone;
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
  const showImg = src && !failed;
  return (
    <View style={[styles.devBadge, { backgroundColor: showImg ? C.white : t.bg, overflow: 'hidden' }, showImg && { borderWidth: 1, borderColor: C.line }]}>
      {showImg
        ? <Image source={{ uri: src }} style={{ width: rs(26), height: rs(26) }} resizeMode="contain" onError={() => setFailed(true)} />
        : <DevIcon size={rs(17)} color={t.fg} strokeWidth={2.1} />}
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

// Device (left) · status/date/time (right), then Customer (+ Technician in the
// all-jobs view), Issue and Status (current phase — tap for the history).
function ReportCard({ ticket, phase, technician, onPress, onHistory }) {
  const pill = statusPill(ticket);
  const d = splitDevice(ticket);
  const done = pill.tone === 'green' || pill.tone === 'ink';
  const iconTone = done || pill.tone === 'red' ? pill.tone : (isLaptop(ticket) ? 'blue' : 'green');
  const when = done ? (ticket.updatedAt || ticket.createdAt) : ticket.createdAt;
  return (
    <TicketCard
      badge={<DeviceBadge ticket={ticket} tone={iconTone} />}
      refId={ticketRef(ticket)} title={d.model}
      subtitle={d.specs || null} subtitle2={d.color ? `Colour: ${d.color}` : null}
      status={pill.label} statusColor={TONE_COLOR[pill.tone]}
      date={formatDate(when)} time={timeOf(when)}
      rows={[
        [{ icon: User, label: 'Customer', value: ticket.customerName }, technician ? { icon: UserCog, label: 'Technician', value: technician } : null],
        [{ icon: Wrench, label: 'Issue', value: issueText(ticket) }, null],
        [{ icon: Clock, label: 'Status', value: phase, onPress: onHistory }, null],
      ]}
      onPress={onPress}
    />
  );
}

function EmptyRow({ text }) {
  return (
    <View style={styles.emptyRow}>
      <Inbox size={rs(18)} color={C.faint} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },

  headerBar: { flexDirection: 'row', alignItems: 'center', gap: rs(10), backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: rs(14), paddingVertical: rs(10) },
  headerBack: { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: rf(17), fontWeight: '800', color: '#1C3053', textAlign: 'center' },
  headerSub: { fontSize: rf(12), color: '#6B7280', marginTop: 1, textAlign: 'center' },
  searchWrap: { backgroundColor: C.bg, paddingHorizontal: rs(14), paddingTop: rs(10) },
  scanBtn: { marginLeft: rs(8), paddingLeft: rs(10), borderLeftWidth: 1, borderLeftColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },

  content: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(20) },

  card: {
    backgroundColor: C.white, borderRadius: rs(18),
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },

  monthRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: rs(8) },
  monthPill: { flexDirection: 'row', alignItems: 'center', gap: rs(8), backgroundColor: C.green, borderRadius: 999, paddingVertical: rs(6), paddingHorizontal: rs(10) },
  monthPillText: { fontSize: rf(12.5), fontWeight: '700', color: C.white },

  statRow: { flexDirection: 'row', gap: rs(4), marginBottom: rs(10), backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(10), paddingHorizontal: rs(6) },
  countBadge: {
    position: 'absolute', top: -rs(4), right: -rs(6), minWidth: rs(20), height: rs(20), borderRadius: rs(10), paddingHorizontal: rs(4),
    backgroundColor: '#FFFFFF', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  statLabel: { fontSize: rf(11), lineHeight: rf(14), fontWeight: '700', marginTop: rs(5), textAlign: 'center', paddingHorizontal: 2 },

  devBadge: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center' },

  emptyRow: { alignItems: 'center', paddingVertical: rs(16), gap: rs(6) },
  emptyText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },

  stateBox: { alignItems: 'center', paddingVertical: rs(24), paddingHorizontal: rs(16), marginBottom: rs(12), gap: rs(6) },
  stateIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: rf(14), fontWeight: '800', color: C.ink },
  stateText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },
  retryBtn: { marginTop: rs(6), backgroundColor: C.green, borderRadius: 999, paddingHorizontal: rs(22), paddingVertical: rs(8) },
  retryText: { color: C.white, fontWeight: '700', fontSize: rf(12) },
});
