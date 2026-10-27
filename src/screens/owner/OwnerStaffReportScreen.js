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
  CalendarCheck,
  CalendarX,
  Clock,
  Hand,
  LogIn,
  LogOut,
  Timer,
  User,
  Users,
  WifiOff,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { SearchBar } from '../../components/rnr/SearchBar';
import {
  RC,
  useReportGeometry,
  ReportHeader,
  StatusRail,
  MonthBar,
  ReportTile,
  TileDisc,
  tileText,
  ReportEmpty,
  reportStyles,
} from '../../components/report/ReportRail';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Each mode focuses one metric pulled from the per-employee attendance summary.
// The modes are also the rail buckets (after All): an employee is in a bucket
// when that metric is above zero for the month.
const MODE_META = {
  attendance: { title: 'Attendance', icon: CalendarCheck, key: 'presentDays',     unit: 'days', label: 'Present',    short: 'Present', tone: RC.green,  empty: 'No one marked present' },
  late:       { title: 'Late',       icon: Clock,         key: 'lateHours',       unit: 'hrs',  label: 'Late',       short: 'Late',    tone: RC.red,    empty: 'No late check-ins' },
  leave:      { title: 'Leave',      icon: CalendarX,     key: 'leaveDays',       unit: 'days', label: 'Leave',      short: 'Leave',   tone: RC.orange, empty: 'No leave taken' },
  permission: { title: 'Permission', icon: Hand,          key: 'permissionCount', unit: '',     label: 'Permission', short: 'Perm',    tone: RC.blue,   empty: 'No permissions taken' },
};
const RAIL_KEYS = ['attendance', 'late', 'leave', 'permission'];
// Order of the per-tile month stats (same as the old row).
const STAT_KEYS = ['attendance', 'late', 'permission', 'leave'];

// Daily record status → tile tag (GENERAL is the backend's checked-in day).
const DAY_STATUS = {
  GENERAL:    { label: 'Present',    tone: RC.green },
  PRESENT:    { label: 'Present',    tone: RC.green },
  LATE:       { label: 'Late',       tone: RC.red },
  PERMISSION: { label: 'Permission', tone: RC.blue },
  LEAVE:      { label: 'On Leave',   tone: RC.orange },
  ABSENT:     { label: 'Absent',     tone: RC.gray },
  WEEK_OFF:   { label: 'Week Off',   tone: RC.gray },
  HOLIDAY:    { label: 'Holiday',    tone: RC.navy },
};
const NO_TIMES = new Set(['LEAVE', 'WEEK_OFF', 'HOLIDAY', 'ABSENT']);

const num = (v) => (v == null ? 0 : Number(v) || 0);
const pad2 = (n) => String(n).padStart(2, '0');

// Initials disc colour — rotates through the brand sheet, stable per employee.
const AVATAR_TONES = ['#035C6C', '#0788C9', '#609138', '#FAA700', '#1C3053', '#F32C26'];
function toneFor(key) {
  const str = String(key || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function formatTime12(t) {
  if (!t || typeof t !== 'string') return '—';
  const [hhRaw, mm] = t.split(':');
  const hh = Number(hhRaw);
  if (Number.isNaN(hh)) return '—';
  const h12 = ((hh - 1 + 12) % 12) + 1;
  return `${pad2(h12)}:${pad2(Number(mm || 0))} ${hh >= 12 ? 'PM' : 'AM'}`;
}

// ISO YYYY-MM-DD → "Tue, 21 Oct", parsed locally so the weekday doesn't drift.
function formatDay(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(y, m - 1, d).getDay()];
  return `${dow}, ${pad2(d)} ${MONTHS_SHORT[m - 1]}`;
}

// The day a tile describes: today in the current month, else the month's
// latest daily record.
function dayOf(data, month, year) {
  const recs = (Array.isArray(data?.dailyRecords) ? data.dailyRecords : []).filter((r) => r && r.date);
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    const iso = `${year}-${pad2(month)}-${pad2(now.getDate())}`;
    return { today: true, iso, rec: recs.find((r) => String(r.date) === iso) || null };
  }
  const rec = recs.reduce((best, r) => (!best || String(r.date) > String(best.date) ? r : best), null);
  return { today: false, iso: rec?.date || null, rec };
}

// Employee photo when there is one, else an initials disc.
function Avatar({ emp, row }) {
  const [failed, setFailed] = useState(false);
  const d = row ? 52 : 64;
  if (emp.photoUrl && !failed) {
    return (
      <Image
        source={{ uri: emp.photoUrl }}
        style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: RC.bg }}
        onError={() => setFailed(true)}
      />
    );
  }
  const ini = initials(emp.name);
  return <TileDisc text={ini} Icon={ini ? undefined : User} tone={toneFor(emp.id || emp.name)} row={row} />;
}

/**
 * All-staff report — one screen, four modes (attendance / late / permission /
 * leave). Aggregates the existing per-employee attendance endpoint
 * (/technicians/{id}/attendance) across the whole team for the selected month,
 * so no new backend endpoint is needed. The mode picks the opening rail bucket;
 * tapping a tile drills into that employee's full attendance calendar.
 */
export default function OwnerStaffReportScreen({ navigation, route }) {
  const { isSmall, railW, numCols, capW, bottomPad } = useReportGeometry();
  const mode = route?.params?.mode || 'attendance';
  const meta = MODE_META[mode] || MODE_META.attendance;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Attendance opens on All; the late / permission / leave reports open on their bucket.
  const [active, setActive] = useState(mode !== 'attendance' && MODE_META[mode] ? mode : 'all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const emps = await ticketApi.get('/technicians');
      const list = Array.isArray(emps) ? emps : [];
      const results = await Promise.all(
        list.map((e) =>
          ticketApi.get(`/technicians/${e.id}/attendance`, { query: { month, year } })
            .then((data) => ({ emp: e, data }))
            .catch(() => ({ emp: e, data: null })),
        ),
      );
      setRows(results);
    } catch (e) {
      setError(e?.message || 'Failed to load report');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  // Focus metric: the active bucket's, or the mode's on All.
  const focusKey = active === 'all' ? (MODE_META[mode] ? mode : 'attendance') : active;
  const focus = MODE_META[focusKey];

  const counts = useMemo(() => {
    const c = { all: rows.length };
    RAIL_KEYS.forEach((k) => { c[k] = rows.filter((r) => num(r.data?.[MODE_META[k].key]) > 0).length; });
    return c;
  }, [rows]);

  const total = useMemo(
    () => Math.round(rows.reduce((s, r) => s + num(r.data?.[focus.key]), 0) * 100) / 100,
    [rows, focus.key],
  );

  // Bucket + search filter, then the rows most relevant to the focus metric on top.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const focal = (r) => num(r.data?.[focus.key]);
    return rows
      .filter((r) => (active === 'all' || num(r.data?.[MODE_META[active].key]) > 0)
        && (!q || [r.emp?.name, r.emp?.roleLabel].some((v) => v && String(v).toLowerCase().includes(q))))
      .sort((a, b) => focal(b) - focal(a));
  }, [rows, active, query, focus.key]);

  const railItems = [
    { key: 'all', label: 'All', tone: RC.teal, Icon: Users, count: counts.all },
    ...RAIL_KEYS.map((k) => ({ key: k, label: MODE_META[k].label, tone: MODE_META[k].tone, Icon: MODE_META[k].icon, count: counts[k] })),
  ];

  const row = numCols === 1;
  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && shown.length % 2 === 1 ? [...shown, { _ghost: true }] : shown;

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    const e = item.emp || {};
    const d = item.data || {};
    const day = dayOf(item.data, month, year);
    const rec = day.rec;
    const st = String(rec?.status || 'GENERAL').toUpperCase();
    const tag = rec
      ? (DAY_STATUS[st] || { label: st.replace(/_/g, ' '), tone: RC.gray })
      : { label: day.today ? 'No check-in' : 'No record', tone: RC.gray };
    const dayText = day.iso ? `${day.today ? 'Today · ' : ''}${formatDay(day.iso)}` : `${MONTHS_SHORT[month - 1]} ${year}`;
    const showTimes = rec && !NO_TIMES.has(st) && (rec.checkInTime || rec.checkOutTime);
    const worked = rec?.workingHours && rec.workingHours !== '0' ? rec.workingHours : null;
    const lateMin = num(rec?.lateMinutes);
    const name = e.name || 'Staff';
    return (
      <ReportTile
        row={row}
        panel={<Avatar emp={e} row={row} />}
        tag={tag.label}
        tagColor={tag.tone}
        onPress={() => navigation.navigate('OwnerEmployeeAttendance', { employee: e })}
        accessibilityLabel={`${name}, ${tag.label}, ${dayText}`}
      >
        <Text style={tileText.ref} numberOfLines={1}>{dayText}</Text>
        <Text style={tileText.title} numberOfLines={1}>{name}</Text>
        {e.roleLabel ? <Text style={tileText.sub} numberOfLines={1}>{e.roleLabel}</Text> : null}
        {showTimes ? (
          <View style={styles.chipRow}>
            <View style={[tileText.chip, { backgroundColor: '#EDF4E7' }]}>
              <LogIn size={11} color={RC.green} />
              <Text style={[tileText.chipText, { color: RC.green }]} numberOfLines={1}>{formatTime12(rec.checkInTime)}</Text>
            </View>
            <View style={[tileText.chip, { backgroundColor: '#FDEBEA' }]}>
              <LogOut size={11} color={RC.red} />
              <Text style={[tileText.chipText, { color: RC.red }]} numberOfLines={1}>{formatTime12(rec.checkOutTime)}</Text>
            </View>
          </View>
        ) : null}
        {worked ? (
          <View style={[tileText.infoRow, { marginTop: 4 }]}>
            <Timer size={11} color={RC.muted} />
            <Text style={tileText.info} numberOfLines={1}>Worked {worked}</Text>
          </View>
        ) : null}
        {lateMin > 0 && st === 'LATE' ? (
          <View style={tileText.infoRow}>
            <Clock size={11} color={RC.red} />
            <Text style={[tileText.info, { color: RC.red }]} numberOfLines={1}>Late by {lateMin} min</Text>
          </View>
        ) : null}
        {/* Month totals — the focus metric in its bucket colour. */}
        <View style={styles.stats}>
          {STAT_KEYS.map((k) => {
            const on = k === focusKey;
            const color = on ? MODE_META[k].tone : null;
            return (
              <View key={k} style={styles.stat}>
                <Text style={[styles.statVal, color && { color }]} numberOfLines={1}>{num(d[MODE_META[k].key])}</Text>
                <Text style={[styles.statLbl, color && { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{MODE_META[k].short}</Text>
              </View>
            );
          })}
        </View>
      </ReportTile>
    );
  };

  const q = query.trim();
  const activeTone = active === 'all' ? RC.teal : MODE_META[active].tone;
  const activeIcon = active === 'all' ? Users : MODE_META[active].icon;
  const emptyText = q
    ? `No staff match "${q}".`
    : active === 'all'
      ? `No staff yet. Add employees to see their ${meta.title.toLowerCase()} here.`
      : `${MODE_META[active].empty} in ${MONTHS[month - 1]}.`;

  const emptyNode = loading && rows.length === 0 ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={RC.teal} />
      <Text style={styles.stateText}>Loading {meta.title.toLowerCase()}…</Text>
    </View>
  ) : error ? (
    <View style={[styles.stateCard, styles.stateBox]}>
      <View style={[styles.stateIcon, { backgroundColor: RC.red }]}>
        <WifiOff size={20} color={RC.white} />
      </View>
      <Text style={styles.stateTitle}>Couldn't load report</Text>
      <Text style={styles.stateText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <ReportEmpty text={emptyText} Icon={activeIcon} tone={activeTone} />
  );

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ReportHeader
        title={meta.title}
        subtitle={`All staff · ${MONTHS_SHORT[month - 1]} ${year}`}
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.popTo('OwnerTabs', { screen: 'Home' }))}
        searchOpen={searchOpen}
        onToggleSearch={() => { if (searchOpen) setQuery(''); setSearchOpen((v) => !v); }}
      />

      {searchOpen || query ? (
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search staff name or role"
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      {/* Left: bucket rail · Right: month + staff tiles */}
      <View style={reportStyles.body}>
        <StatusRail items={railItems} active={active} onSelect={setActive} width={railW} isSmall={isSmall} bottomPad={bottomPad} />
        <View style={{ flex: 1 }}>
          <MonthBar
            label={`${MONTHS[month - 1]} ${year}`}
            sub={`${shown.length} staff · Total ${focus.title}: ${total}${focus.unit ? ` ${focus.unit}` : ''}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            capW={capW}
          />
          <FlatList
            data={listData}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(item, index) => String(item.emp?.id || `row-${index}`)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RC.teal} colors={[RC.teal]} />}
            contentContainerStyle={[reportStyles.listPad, { paddingBottom: bottomPad }, capW]}
            ListEmptyComponent={emptyNode}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 },

  stats: { flexDirection: 'row', marginTop: 7, paddingTop: 6, borderTopWidth: 1, borderTopColor: RC.line },
  stat: { flex: 1, minWidth: 0, alignItems: 'center' },
  statVal: { fontSize: 13, fontWeight: '800', color: RC.ink },
  statLbl: { marginTop: 1, fontSize: 9, fontWeight: '700', color: '#9CA3AF' },

  stateCard: { backgroundColor: RC.white, borderRadius: 16, borderWidth: 1, borderColor: RC.line },
  stateBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 12, gap: 6 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 14, fontWeight: '800', color: RC.ink, textAlign: 'center' },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },
  retryBtn: { marginTop: 6, backgroundColor: RC.teal, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { color: RC.white, fontWeight: '700', fontSize: 12 },
});
