import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX,
  Check,
  Clock,
  Hourglass,
  Plus,
  UserX,
  X,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';
import {
  RC,
  useReportGeometry,
  ReportHeader,
  ReportHeaderButton,
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

// Reject button tint (brand red family).
const RED_TINT = '#FDEBEA';
const RED_EDGE = '#F8C9C7';
const RED_TEXT = '#C81E1A';

// The backend emits PENDING for a freshly-submitted leave; older code keyed only
// on PROCESSING, so Approve/Reject never rendered and the Pending tile stayed
// 00. Accept both so the pending state is recognised either way.
const isPendingLeave = (s) => s === 'PENDING' || s === 'PROCESSING';

// Rail buckets: All, then one per decision state in the order the owner works
// through them. Same filters the old Pending / Approved / Rejected tabs used.
const TABS = [
  { key: 'All',      label: 'All',      tone: RC.teal,   Icon: CalendarDays, match: () => true,               empty: 'No leave requests this month.' },
  { key: 'Pending',  label: 'Pending',  tone: RC.orange, Icon: Hourglass,    match: (s) => isPendingLeave(s), empty: 'No pending leave requests.' },
  { key: 'Approved', label: 'Approved', tone: RC.green,  Icon: Check,        match: (s) => s === 'APPROVED',  empty: 'No approved leave this month.' },
  { key: 'Rejected', label: 'Rejected', tone: RC.red,    Icon: X,            match: (s) => s === 'REJECTED',  empty: 'No rejected leave this month.' },
];
const statusOf = (l) => String(l?.status || '').toUpperCase();

// Tile disc / tag per leave state: Approved green, Pending orange, Rejected red,
// anything else the blue info tone.
function toneOf(status) {
  if (status === 'APPROVED') return { color: RC.green, Icon: CalendarCheck, label: 'Approved' };
  if (status === 'REJECTED') return { color: RC.red, Icon: CalendarX, label: 'Rejected' };
  if (isPendingLeave(status)) return { color: RC.orange, Icon: CalendarClock, label: 'Pending' };
  return { color: RC.blue, Icon: CalendarDays, label: status };
}

function formatDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(instant) {
  if (!instant) return '—';
  const d = new Date(instant);
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Single day, or "start – end" when the leave spans several days.
function dateRange(item) {
  if (!item?.endDate || item.endDate === item.startDate) return formatDate(item?.startDate);
  return `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`;
}

export default function OwnerEmployeeLeaveScreen({ route, navigation }) {
  const { isSmall, railW, numCols, capW, bottomPad } = useReportGeometry();
  const employee = route.params?.employee;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState('Pending');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!employee?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${employee.id}/leaves`, {
        query: { month, year },
      });
      setList(Array.isArray(res) ? res : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee?.id, month, year]);

  React.useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = {};
    TABS.forEach((t) => { c[t.key] = list.filter((l) => t.match(statusOf(l))).length; });
    return c;
  }, [list]);

  // Sort newest first so the latest leave bubbles to the top.
  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ad = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bd = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bd - ad;
    });
  }, [list]);

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];
  const visible = sorted.filter((l) => activeTab.match(statusOf(l)));

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const updateLeaveStatus = async (leaveId, status) => {
    try {
      await ticketApi.patch(`/technicians/${employee.id}/leaves/${leaveId}`, { body: { status } });
      load(true);
    } catch (e) {
      notify('Error', e.message || 'Could not update leave', { preset: 'error', haptic: 'error' });
    }
  };

  const header = (
    <ReportHeader
      title="Leave Report"
      subtitle={employee?.name}
      onBack={() => navigation.goBack()}
      right={employee ? (
        <ReportHeaderButton
          Icon={Plus}
          label="Apply for leave"
          onPress={() => navigation.navigate('OwnerEmployeeApplyLeave', { employee })}
        />
      ) : null}
    />
  );

  if (!employee) {
    return (
      <View style={reportStyles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {header}
        <View style={styles.center}>
          <ReportEmpty text="Employee not found" Icon={UserX} tone={RC.red} />
        </View>
      </View>
    );
  }

  const row = numCols === 1;
  const railItems = TABS.map((t) => ({ key: t.key, label: t.label, tone: t.tone, Icon: t.Icon, count: counts[t.key] }));
  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && visible.length % 2 === 1 ? [...visible, { id: '__ghost__', _ghost: true }] : visible;
  const n = visible.length;
  const monthSub = `${n} ${tab === 'All' ? '' : `${tab.toLowerCase()} `}${n === 1 ? 'request' : 'requests'}`;

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return (
      <LeaveTile
        item={item}
        row={row}
        ownerCanApprove={!!employee?.id}
        onApprove={() => updateLeaveStatus(item.id, 'APPROVED')}
        onReject={() => updateLeaveStatus(item.id, 'REJECTED')}
      />
    );
  };

  const emptyNode = loading && list.length === 0 ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={RC.teal} />
      <Text style={styles.stateText}>Loading leave…</Text>
    </View>
  ) : (
    <ReportEmpty text={activeTab.empty} Icon={activeTab.Icon} tone={activeTab.tone} />
  );

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {header}

      {/* Left: status rail · Right: month + leave tiles */}
      <View style={reportStyles.body}>
        <StatusRail
          items={railItems}
          active={tab}
          onSelect={setTab}
          width={railW}
          isSmall={isSmall}
          bottomPad={bottomPad}
        />

        <View style={styles.main}>
          <MonthBar
            label={`${MONTHS[month - 1]} ${year}`}
            sub={monthSub}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            capW={capW}
          />

          <FlatList
            data={listData}
            key={String(numCols)}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? styles.colGap : undefined}
            keyExtractor={(item, index) => String(item.id ?? index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[RC.teal]} tintColor={RC.teal} />}
            contentContainerStyle={[reportStyles.listPad, { paddingBottom: bottomPad }, capW]}
            ListEmptyComponent={emptyNode}
          />
        </View>
      </View>
    </View>
  );
}

// Jobs-style leave tile: status disc + tag on the left (phones) or on top
// (tablet two-up), then date range, reason, applied days, request time and —
// for pending leave — Approve / Reject.
function LeaveTile({ item, row, ownerCanApprove, onApprove, onReject }) {
  const status = statusOf(item);
  const tone = toneOf(status);
  return (
    <ReportTile
      row={row}
      panel={<TileDisc Icon={tone.Icon} tone={tone.color} row={row} />}
      tag={tone.label}
      tagColor={tone.color}
    >
      <Text style={tileText.ref} numberOfLines={2}>{dateRange(item)}</Text>
      <Text style={tileText.title} numberOfLines={2}>{item.reason || 'No reason given'}</Text>
      <View style={tileText.infoRow}>
        <CalendarRange size={11} color={RC.muted} />
        <Text style={tileText.info} numberOfLines={1}>{item.appliedDaysLabel || '—'}</Text>
      </View>
      <View style={tileText.infoRow}>
        <Clock size={11} color={RC.muted} />
        <Text style={tileText.info} numberOfLines={2}>Requested {formatDateTime(item.requestedAt)}</Text>
      </View>

      {isPendingLeave(status) && ownerCanApprove ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.approveBtn}
            onPress={onApprove}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Approve leave"
          >
            <Check size={14} color={RC.white} strokeWidth={2.4} />
            <Text style={styles.approveText} numberOfLines={1}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={onReject}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Reject leave"
          >
            <X size={14} color={RED_TEXT} strokeWidth={2.4} />
            <Text style={styles.rejectText} numberOfLines={1}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ReportTile>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, minWidth: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14 },
  colGap: { gap: 12 },

  stateBox: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },

  // Approve / Reject — wraps to one button per line when the column is narrow.
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  approveBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: RC.teal,
  },
  approveText: { flexShrink: 1, color: RC.white, fontSize: 12, fontWeight: '800' },
  rejectBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: RED_TINT,
    borderWidth: 1,
    borderColor: RED_EDGE,
  },
  rejectText: { flexShrink: 1, color: RED_TEXT, fontSize: 12, fontWeight: '800' },
});
