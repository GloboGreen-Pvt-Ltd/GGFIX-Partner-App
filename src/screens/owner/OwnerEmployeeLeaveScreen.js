import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';
import { useResponsive } from '../../theme/responsive';
import { rf, rs } from '../../utils/responsive';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Approved', 'Processing', 'Rejected'];

// The backend emits PENDING for a freshly-submitted leave; older code keyed only
// on PROCESSING, so Approve/Reject never rendered and the Processing tile stayed
// 00. Accept both so the pending state is recognised either way.
const isPendingLeave = (s) => s === 'PENDING' || s === 'PROCESSING';

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

export default function OwnerEmployeeLeaveScreen({ route, navigation }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const employee = route.params?.employee;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filter, setFilter] = useState('All');
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

  const counts = useMemo(() => ({
    Leave: list.length,
    Processing: list.filter((l) => isPendingLeave(l.status)).length,
    Rejected: list.filter((l) => l.status === 'REJECTED').length,
    Approved: list.filter((l) => l.status === 'APPROVED').length,
  }), [list]);

  // Sort newest first so the latest leave bubbles to the top.
  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ad = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bd = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bd - ad;
    });
  }, [list]);

  const recent = sorted[0];
  const previous = sorted.slice(1);
  const filteredPrevious = filter === 'All'
    ? previous
    : filter === 'Processing'
      ? previous.filter((l) => isPendingLeave(l.status))
      : previous.filter((l) => l.status === filter.toUpperCase());

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

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={styles.error}>Employee not found</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, capStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#09AD2A']} tintColor="#09AD2A" />}
      >
        {/* This Month — stats card */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={rs(14)} color="#078F23" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={rs(14)} color="#078F23" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statTilesRow}>
            <StatTile value={pad2(counts.Leave)}      label="Leave"      icon="calendar-outline"        tint="#EAF8EC" accent="#078F23" />
            <StatTile value={pad2(counts.Processing)} label="Processing" icon="hourglass-outline"       tint="#FFF8E1" accent="#8A6A00" />
            <StatTile value={pad2(counts.Rejected)}   label="Rejected"   icon="close-circle-outline"    tint="#FEECEC" accent="#F84141" />
            <StatTile value={pad2(counts.Approved)}   label="Approved"   icon="checkmark-circle-outline" tint="#EAF8EC" accent="#078F23" />
          </View>
        </View>

        {/* Apply for leave (kept available — small, doesn't fight the layout) */}
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={() => navigation.navigate('OwnerEmployeeApplyLeave', { employee })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={rs(16)} color="#FFFFFF" />
          <Text style={styles.applyBtnText}>Apply for leave</Text>
        </TouchableOpacity>

        {/* Recent Leave */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeader}>Recent Leave</Text>
          <TouchableOpacity onPress={() => setFilter('All')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>
        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#09AD2A" style={{ marginVertical: rs(16) }} />
        ) : recent ? (
          <LeaveCard
            item={recent}
            ownerCanApprove={!!employee?.id}
            onApprove={() => updateLeaveStatus(recent.id, 'APPROVED')}
            onReject={() => updateLeaveStatus(recent.id, 'REJECTED')}
          />
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="file-tray-outline" size={rs(26)} color="#09AD2A" />
            <Text style={styles.emptyTitle}>No recent leave.</Text>
            <Text style={styles.emptySub}>You&apos;re all caught up!</Text>
          </View>
        )}

        {/* Previous Leave */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeader}>Previous Leave</Text>
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredPrevious.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={rs(26)} color="#09AD2A" />
            <Text style={styles.emptyTitle}>No previous leave requests.</Text>
            <Text style={styles.emptySub}>Looks like you haven&apos;t made any requests yet.</Text>
          </View>
        ) : (
          filteredPrevious.map((item) => (
            <LeaveCard
              key={item.id}
              item={item}
              ownerCanApprove={!!employee?.id}
              onApprove={() => updateLeaveStatus(item.id, 'APPROVED')}
              onReject={() => updateLeaveStatus(item.id, 'REJECTED')}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function pad2(n) { return String(n).padStart(2, '0'); }

function StatTile({ value, label, icon, tint, accent }) {
  return (
    <View style={[styles.statTileWrap, { backgroundColor: tint }]}>
      <View style={styles.statTileTop}>
        <Ionicons name={icon} size={rs(14)} color={accent} />
        <Text style={[styles.statTileTopText, { color: accent }]}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileHint}>Total</Text>
    </View>
  );
}

function LeaveCard({ item, ownerCanApprove, onApprove, onReject }) {
  const status = (item.status || '').toUpperCase();
  const pillStyle =
    status === 'APPROVED' ? styles.pillApproved
      : status === 'REJECTED' ? styles.pillRejected
        : styles.pillProcessing;
  const pillLabel = isPendingLeave(status) ? 'Processing'
    : status === 'APPROVED' ? 'Approved'
      : status === 'REJECTED' ? 'Rejected'
        : status;

  return (
    <View style={styles.leaveCard}>
      <View style={styles.leaveAccent} />
      <View style={styles.leaveInner}>
        <View style={styles.leaveTopRow}>
          <Text style={styles.leaveDate}>{formatDate(item.startDate)}</Text>
          <View style={[styles.statusPill, pillStyle]}>
            <Text
              style={[
                styles.statusPillText,
                pillStyle === styles.pillProcessing && styles.statusPillTextOnLight,
              ]}
            >
              {pillLabel}
            </Text>
          </View>
        </View>

        <View style={styles.leaveCols}>
          <View style={styles.leaveCol}>
            <Text style={styles.leaveColValue} numberOfLines={1}>{item.reason || '—'}</Text>
            <Text style={styles.leaveColLabel}>Leave Reason</Text>
          </View>
          <View style={styles.leaveCol}>
            <Text style={styles.leaveColValue}>{item.appliedDaysLabel || '—'}</Text>
            <Text style={styles.leaveColLabel}>Applied Days</Text>
          </View>
          <View style={styles.leaveCol}>
            <Text style={styles.leaveColValue} numberOfLines={1}>
              {formatDateTime(item.requestedAt)}
            </Text>
            <Text style={styles.leaveColLabel}>Request Date &amp; Time</Text>
          </View>
        </View>

        {isPendingLeave(status) && ownerCanApprove && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.approveBtn} onPress={onApprove} activeOpacity={0.85}>
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject} activeOpacity={0.85}>
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: rs(10), paddingBottom: rs(20) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: '#F84141' },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    padding: rs(10),
    borderWidth: 1,
    borderColor: '#F3F3F3',
    shadowColor: '#1E1E1E', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(8),
  },
  statsHeaderTitle: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },

  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF8EC',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: 999,
    gap: rs(7),
  },
  monthPillText: { color: '#078F23', fontSize: 11, fontWeight: '800' },
  monthPillSep: { width: rs(1), height: rs(12), backgroundColor: '#CDEFD4' },

  statTilesRow: { flexDirection: 'row', gap: rs(6) },
  statTileWrap: {
    flex: 1,
    borderRadius: rs(10),
    padding: rs(8),
    alignItems: 'flex-start',
  },
  statTileTop: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  statTileTopText: { fontSize: 10, fontWeight: '800' },
  statTileValue: { fontSize: 15, fontWeight: '800', color: '#1E1E1E', marginTop: rs(4) },
  statTileHint: { fontSize: 9.5, color: '#6B6B6B', marginTop: rs(1), fontWeight: '600' },

  applyBtn: {
    marginTop: rs(10),
    backgroundColor: '#09AD2A',
    paddingVertical: rs(9),
    borderRadius: rs(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    shadowColor: '#1E1E1E', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rs(12), marginBottom: rs(6) },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  viewAll: { fontSize: 12, fontWeight: '800', color: '#078F23' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6), marginBottom: rs(8) },
  filterChip: {
    paddingHorizontal: rs(11),
    paddingVertical: rs(5),
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E6E6E6',
  },
  filterChipActive: { backgroundColor: '#09AD2A', borderColor: '#09AD2A' },
  filterChipText: { fontSize: 11, color: '#6B6B6B', fontWeight: '700' },
  filterChipTextActive: { color: '#FFFFFF' },

  leaveCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    marginBottom: rs(6),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F3F3',
    shadowColor: '#1E1E1E', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  leaveAccent: { width: rs(3), backgroundColor: '#09AD2A' },
  leaveInner: { flex: 1, paddingHorizontal: rs(10), paddingVertical: rs(8) },
  leaveTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaveDate: { fontSize: 11, fontWeight: '700', color: '#1E1E1E' },

  statusPill: {
    paddingHorizontal: rs(10),
    paddingVertical: rs(3),
    borderRadius: 999,
  },
  pillProcessing: { backgroundColor: '#F3BF23' },
  pillApproved: { backgroundColor: '#09AD2A' },
  pillRejected: { backgroundColor: '#F84141' },
  statusPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  // Amber is the one light fill of the three: white on it is 2.1:1, so the
  // Processing pill takes dark ink (7.8:1) while green and red keep white.
  statusPillTextOnLight: { color: '#1E1E1E' },

  leaveCols: { flexDirection: 'row', marginTop: rs(6), gap: rs(8) },
  leaveCol: { flex: 1 },
  leaveColValue: { fontSize: 11, fontWeight: '700', color: '#1E1E1E' },
  leaveColLabel: { fontSize: 9, color: '#8A8A8A', marginTop: rs(2) },

  actionRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(8) },
  approveBtn: { flex: 1, backgroundColor: '#09AD2A', paddingVertical: rs(7), borderRadius: rs(8), alignItems: 'center' },
  approveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  rejectBtn: { flex: 1, backgroundColor: '#F84141', paddingVertical: rs(7), borderRadius: rs(8), alignItems: 'center' },
  rejectBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  empty: { fontSize: 12, color: '#6B6B6B', textAlign: 'center', paddingVertical: rs(14) },
  emptyCard: {
    backgroundColor: '#EAF8EC',
    borderWidth: 1,
    borderColor: '#EAF8EC',
    borderRadius: rs(10),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#1E1E1E', marginTop: rs(8) },
  emptySub: { fontSize: 11, color: '#6B6B6B', marginTop: rs(3) },
});
