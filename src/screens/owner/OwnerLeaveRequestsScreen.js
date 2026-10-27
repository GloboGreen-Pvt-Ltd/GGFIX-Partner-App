import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  FileText,
  User,
  WifiOff,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';
import { SearchBar } from '../../components/rnr/SearchBar';
import {
  RC,
  useReportGeometry,
  ReportHeader,
  StatusRail,
  ReportTile,
  TileDisc,
  tileText,
  ReportEmpty,
  reportStyles,
} from '../../components/report/ReportRail';

// Rail buckets: All + the three request statuses. Each status keeps its own
// endpoint (pending list / ?status=), loaded together so every bucket has a count.
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const STATUS_META = {
  ALL:      { label: 'All',      tone: RC.teal,   Icon: ClipboardList },
  PENDING:  { label: 'Pending',  tone: RC.orange, Icon: Clock },
  APPROVED: { label: 'Approved', tone: RC.green,  Icon: CircleCheck },
  REJECTED: { label: 'Rejected', tone: RC.red,    Icon: CircleX },
};
const RAIL_KEYS = ['ALL', ...STATUSES];
const endpointFor = (st) => (st === 'PENDING' ? '/technicians/leaves/pending' : `/technicians/leaves?status=${st}`);

// Initials disc colour — rotates through the brand sheet, stable per employee.
const AVATAR_TONES = ['#035C6C', '#0788C9', '#609138', '#FAA700', '#1C3053', '#F32C26'];
function toneFor(key) {
  const str = String(key || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function formatDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateRange(item) {
  return !item.endDate || item.endDate === item.startDate
    ? formatDate(item.startDate)
    : `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`;
}

// CASUAL_LEAVE → "Casual Leave".
function typeLabel(t) {
  if (!t) return null;
  return String(t).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Permission requests are leave rows with leaveType PERMISSION (the Employee
// App files them that way, the time window in the reason). One screen serves
// both lists: `route.params.kind` picks which rows it shows, and each list
// leaves out the other's rows so nothing appears twice.
const KINDS = {
  LEAVE: {
    title: 'Leave Requests', noun: 'leave requests',
    emptyPending: 'New leave requests from your team will appear here.',
  },
  PERMISSION: {
    title: 'Permission Requests', noun: 'permission requests',
    emptyPending: 'New permission requests from your team will appear here.',
  },
};
const isPermission = (l) => String(l?.leaveType || '').toUpperCase() === 'PERMISSION';

export default function OwnerLeaveRequestsScreen({ navigation, route }) {
  const kind = route?.params?.kind === 'PERMISSION' ? 'PERMISSION' : 'LEAVE';
  const copy = KINDS[kind];
  const { isSmall, railW, bottomPad } = useReportGeometry();
  // Request tiles stay in the row layout (initials + text) on every device;
  // a list 560pt+ wide (iPad / Android tablets, phones in landscape) gets two
  // columns, phones one column capped and centred.
  const { width: winW } = useWindowDimensions();
  const numCols = winW - railW >= 560 ? 2 : 1;
  const capW = numCols === 1 ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : null;
  const [lists, setLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  // Search bar is hidden until the header's Search icon opens it.
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(STATUSES.map((st) => ticketApi.get(endpointFor(st))
        .then((res) => ({ st, rows: (Array.isArray(res) ? res : []).filter((l) => isPermission(l) === (kind === 'PERMISSION')) }))
        .catch((e) => ({ st, rows: [], err: e || {} }))));
      const next = {};
      results.forEach((r) => { next[r.st] = r.rows; });
      setLists(next);
      const failed = results.find((r) => r.err);
      if (failed) setError(failed.err.message || `Failed to load ${copy.title.toLowerCase()}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind, copy]);

  useEffect(() => { load(); }, [load]);

  const respond = async (item, decision) => {
    setActionId(item.id);
    try {
      await ticketApi.patch(`/technicians/${item.technicianId}/leaves/${item.id}`, {
        body: { status: decision },
      });
      load(true);
    } catch (e) {
      notify('Error', e?.message ?? `Failed to ${decision.toLowerCase()}`, { preset: 'error', haptic: 'error' });
    } finally {
      setActionId(null);
    }
  };

  // One entry per request, tagged with the status bucket it was loaded under.
  const entries = useMemo(
    () => STATUSES.flatMap((st) => (lists[st] || []).map((item) => ({ id: `${st}:${item.id}`, st, item }))),
    [lists],
  );

  const counts = useMemo(() => {
    const c = { ALL: entries.length };
    STATUSES.forEach((st) => { c[st] = (lists[st] || []).length; });
    return c;
  }, [entries, lists]);

  // Search covers the active bucket by employee name or reason.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => (status === 'ALL' || e.st === status)
      && (!q || [e.item.technicianName, e.item.reason].some((v) => v && String(v).toLowerCase().includes(q))));
  }, [entries, status, query]);

  const railItems = RAIL_KEYS.map((k) => ({ key: k, ...STATUS_META[k], count: counts[k] }));
  const row = true;
  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && shown.length % 2 === 1 ? [...shown, { id: '__ghost__', _ghost: true }] : shown;

  const renderItem = ({ item: entry }) => {
    if (entry._ghost) return <View style={{ flex: 1 }} />;
    const item = entry.item;
    const meta = STATUS_META[entry.st];
    const name = item.technicianName ?? 'Employee';
    const ini = initials(item.technicianName);
    const acting = actionId === item.id;
    const busy = actionId != null;
    // A permission is part of a day (totalDays 0) — its window is in the
    // reason, so the day count would only read "0".
    const showDays = item.appliedDaysLabel && kind !== 'PERMISSION';
    const type = kind === 'LEAVE' ? typeLabel(item.leaveType) : null;
    return (
      <ReportTile
        row={row}
        panel={<TileDisc text={ini} Icon={ini ? undefined : User} tone={toneFor(item.technicianId || name)} row={row} />}
        tag={meta.label}
        tagColor={meta.tone}
        showView={false}
        accessibilityLabel={`${name}, ${dateRange(item)}, ${meta.label}`}
      >
        <Text style={tileText.ref} numberOfLines={2}>{dateRange(item)}</Text>
        <Text style={tileText.title} numberOfLines={2}>{name}</Text>
        {type ? <Text style={tileText.sub} numberOfLines={1}>{type}</Text> : null}
        {item.reason ? (
          <View style={[tileText.infoRow, { alignItems: 'flex-start' }]}>
            <FileText size={11} color={RC.muted} style={{ marginTop: 2 }} />
            <Text style={tileText.info} numberOfLines={3}>{item.reason}</Text>
          </View>
        ) : null}
        {showDays ? (
          <View style={tileText.infoRow}>
            <Clock size={11} color={RC.muted} />
            <Text style={tileText.info} numberOfLines={1}>{item.appliedDaysLabel}</Text>
          </View>
        ) : null}
        {item.requestedAt ? (
          <View style={tileText.infoRow}>
            <CalendarDays size={11} color={RC.muted} />
            <Text style={tileText.info} numberOfLines={1}>Requested {formatDate(item.requestedAt)}</Text>
          </View>
        ) : null}

        {entry.st === 'PENDING' ? (
          // Wraps to one button per line when the tile is too narrow for both.
          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => respond(item, 'APPROVED')}
              hitSlop={{ top: 6, bottom: 6 }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Approve ${name}`}
              style={[styles.actBtn, styles.approveBtn, busy && !acting ? styles.actDim : null]}
            >
              {acting ? <ActivityIndicator size="small" color={RC.white} /> : <CircleCheck size={14} color={RC.white} />}
              <Text style={[styles.actText, { color: RC.white }]} numberOfLines={1}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => respond(item, 'REJECTED')}
              hitSlop={{ top: 6, bottom: 6 }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Reject ${name}`}
              style={[styles.actBtn, styles.rejectBtn, busy && !acting ? styles.actDim : null]}
            >
              <CircleX size={14} color={RC.red} />
              <Text style={[styles.actText, { color: RC.red }]} numberOfLines={1}>Reject</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ReportTile>
    );
  };

  const q = query.trim();
  const activeMeta = STATUS_META[status];
  const emptyText = q
    ? `No ${copy.noun} match "${q}".`
    : status === 'PENDING'
      ? copy.emptyPending
      : status === 'ALL'
        ? `No ${copy.noun} to show.`
        : `No ${activeMeta.label.toLowerCase()} ${copy.noun} to show.`;

  const emptyNode = loading && entries.length === 0 ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={RC.teal} />
      <Text style={styles.stateText}>Loading {copy.title.toLowerCase()}…</Text>
    </View>
  ) : error ? (
    <View style={[styles.stateCard, styles.stateBox]}>
      <View style={[styles.stateIcon, { backgroundColor: RC.red }]}>
        <WifiOff size={20} color={RC.white} />
      </View>
      <Text style={styles.stateTitle}>Couldn't load {copy.noun}</Text>
      <Text style={styles.stateText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <ReportEmpty text={emptyText} Icon={activeMeta.Icon} tone={activeMeta.tone} />
  );

  // Some buckets loaded, one failed — keep the rows, flag the gap.
  const errorBanner = error && shown.length > 0 ? (
    <View style={styles.banner}>
      <Text style={styles.bannerText} numberOfLines={2}>{error}</Text>
      <TouchableOpacity onPress={() => load()} hitSlop={6} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.bannerRetry}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ReportHeader
        title={copy.title}
        subtitle={loading && entries.length === 0 ? 'All employees' : `All employees · ${counts.PENDING} pending`}
        onBack={() => navigation.goBack()}
        searchOpen={searchOpen}
        onToggleSearch={() => { if (searchOpen) setQuery(''); setSearchOpen((v) => !v); }}
      />

      {searchOpen || query ? (
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search employee or reason"
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      {/* Left: status rail · Right: request tiles */}
      <View style={reportStyles.body}>
        <StatusRail items={railItems} active={status} onSelect={setStatus} width={railW} isSmall={isSmall} bottomPad={bottomPad} />
        <View style={{ flex: 1 }}>
          <FlatList
            data={listData}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(e, i) => String(e.id || i)}
            renderItem={renderItem}
            extraData={actionId}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RC.teal} colors={[RC.teal]} />}
            contentContainerStyle={[reportStyles.listPad, { paddingBottom: bottomPad }, capW]}
            ListHeaderComponent={errorBanner}
            ListEmptyComponent={emptyNode}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actBtn: {
    flexGrow: 1, flexBasis: 84, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10,
  },
  approveBtn: { backgroundColor: RC.teal },
  rejectBtn: { backgroundColor: '#FDEBEA', borderWidth: 1, borderColor: '#F9C5C3' },
  actDim: { opacity: 0.6 },
  actText: { flexShrink: 1, fontSize: 12, fontWeight: '800' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: '#FDEBEA', borderWidth: 1, borderColor: '#F9C5C3',
  },
  bannerText: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '600', color: RC.red },
  bannerRetry: { fontSize: 12, fontWeight: '800', color: RC.teal },

  stateCard: { backgroundColor: RC.white, borderRadius: 16, borderWidth: 1, borderColor: RC.line },
  stateBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 12, gap: 6 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 14, fontWeight: '800', color: RC.ink, textAlign: 'center' },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },
  retryBtn: { marginTop: 6, backgroundColor: RC.teal, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { color: RC.white, fontWeight: '700', fontSize: 12 },
});
