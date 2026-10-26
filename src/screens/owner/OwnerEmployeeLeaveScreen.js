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
import { rs } from '../../utils/responsive';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The backend emits PENDING for a freshly-submitted leave; older code keyed only
// on PROCESSING, so Approve/Reject never rendered and the Pending tile stayed
// 00. Accept both so the pending state is recognised either way.
const isPendingLeave = (s) => s === 'PENDING' || s === 'PROCESSING';

// One tab per decision state, in the order the owner works through them.
const TABS = [
  { key: 'Pending',  match: (s) => isPendingLeave(s), empty: 'No pending leave requests.', emptySub: 'Nothing waiting for your approval.' },
  { key: 'Approved', match: (s) => s === 'APPROVED',  empty: 'No approved leave.',         emptySub: 'Approved requests for this month show here.' },
  { key: 'Rejected', match: (s) => s === 'REJECTED',  empty: 'No rejected leave.',         emptySub: 'Rejected requests for this month show here.' },
];
const statusOf = (l) => String(l?.status || '').toUpperCase();

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
    const c = { Leave: list.length };
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#035C6C']} tintColor="#035C6C" />}
      >
        {/* This Month — stats card */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={rs(14)} color="#035C6C" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={rs(14)} color="#035C6C" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statTilesRow}>
            <StatTile value={pad2(counts.Leave)}    label="Leave"    icon="calendar-outline"         tint="#E5F3F5" accent="#035C6C" />
            <StatTile value={pad2(counts.Pending)}  label="Pending"  icon="hourglass-outline"        tint="#FFF8E1" accent="#8A6A00" onPress={() => setTab('Pending')} />
            <StatTile value={pad2(counts.Approved)} label="Approved" icon="checkmark-circle-outline" tint="#E5F3F5" accent="#035C6C" onPress={() => setTab('Approved')} />
            <StatTile value={pad2(counts.Rejected)} label="Rejected" icon="close-circle-outline"     tint="#FEECEC" accent="#F84141" onPress={() => setTab('Rejected')} />
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

        {/* Leave requests — Pending / Approved / Rejected tabs */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeader}>Leave Requests</Text>
        </View>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.key}</Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{counts[t.key]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#035C6C" style={{ marginVertical: rs(16) }} />
        ) : visible.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name={tab === 'Pending' ? 'file-tray-outline' : 'calendar-outline'} size={rs(26)} color="#035C6C" />
            <Text style={styles.emptyTitle}>{activeTab.empty}</Text>
            <Text style={styles.emptySub}>{activeTab.emptySub}</Text>
          </View>
        ) : (
          visible.map((item) => (
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

function StatTile({ value, label, icon, tint, accent, onPress }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[styles.statTileWrap, { backgroundColor: tint }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.statTileTop}>
        <Ionicons name={icon} size={rs(14)} color={accent} />
        <Text style={[styles.statTileTopText, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileHint}>Total</Text>
    </Wrap>
  );
}

function LeaveCard({ item, ownerCanApprove, onApprove, onReject }) {
  const status = (item.status || '').toUpperCase();
  const pillStyle =
    status === 'APPROVED' ? styles.pillApproved
      : status === 'REJECTED' ? styles.pillRejected
        : styles.pillProcessing;
  const pillLabel = isPendingLeave(status) ? 'Pending'
    : status === 'APPROVED' ? 'Approved'
      : status === 'REJECTED' ? 'Rejected'
        : status;

  return (
    <View style={styles.leaveCard}>
      <View style={styles.leaveAccent} />
      <View style={styles.leaveInner}>
        <View style={styles.leaveTopRow}>
          <Text style={styles.leaveDate} numberOfLines={1}>{formatDate(item.startDate)}</Text>
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
            <TouchableOpacity style={styles.approveBtn} onPress={onApprove} activeOpacity={0.85} hitSlop={{ top: 6, bottom: 6 }}>
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject} activeOpacity={0.85} hitSlop={{ top: 6, bottom: 6 }}>
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(10), paddingBottom: rs(20) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: '#F84141' },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    padding: rs(10),
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(8),
  },
  statsHeaderTitle: { fontSize: 13, fontWeight: '800', color: '#111111', flexShrink: 1, marginRight: rs(8) },

  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F3F5',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: 999,
    gap: rs(7),
  },
  monthPillText: { color: '#035C6C', fontSize: 11, fontWeight: '800' },
  monthPillSep: { width: rs(1), height: rs(12), backgroundColor: '#C7E6EA' },

  statTilesRow: { flexDirection: 'row', gap: rs(6) },
  statTileWrap: {
    flex: 1,
    borderRadius: rs(10),
    padding: rs(8),
    alignItems: 'flex-start',
  },
  statTileTop: { flexDirection: 'row', alignItems: 'center', gap: rs(5), maxWidth: '100%' },
  statTileTopText: { fontSize: 10, fontWeight: '800', flexShrink: 1 },
  statTileValue: { fontSize: 15, fontWeight: '800', color: '#111111', marginTop: rs(4) },
  statTileHint: { fontSize: 9.5, color: '#6B7280', marginTop: rs(1), fontWeight: '600' },

  applyBtn: {
    marginTop: rs(10),
    backgroundColor: '#035C6C',
    paddingVertical: rs(9),
    borderRadius: rs(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    shadowColor: '#111111', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rs(12), marginBottom: rs(6) },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: '#111111' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    padding: rs(3),
    marginBottom: rs(8),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(5),
    paddingVertical: rs(7),
    borderRadius: rs(8),
  },
  tabActive: { backgroundColor: '#035C6C' },
  tabText: { fontSize: 12, color: '#6B7280', fontWeight: '800' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: { minWidth: rs(18), paddingHorizontal: rs(5), paddingVertical: rs(1), borderRadius: 999, backgroundColor: '#F3F4F6', alignItems: 'center' },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  tabCountText: { fontSize: 10, color: '#6B7280', fontWeight: '800' },
  tabCountTextActive: { color: '#FFFFFF' },

  leaveCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    marginBottom: rs(6),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  leaveAccent: { width: rs(3), backgroundColor: '#035C6C' },
  leaveInner: { flex: 1, paddingHorizontal: rs(10), paddingVertical: rs(8) },
  leaveTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaveDate: { fontSize: 11, fontWeight: '700', color: '#111111', flexShrink: 1, marginRight: rs(8) },

  statusPill: {
    paddingHorizontal: rs(10),
    paddingVertical: rs(3),
    borderRadius: 999,
  },
  pillProcessing: { backgroundColor: '#F3BF23' },
  pillApproved: { backgroundColor: '#035C6C' },
  pillRejected: { backgroundColor: '#F84141' },
  statusPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  // Amber is the one light fill of the three: white on it is 2.1:1, so the
  // Processing pill takes dark ink (7.8:1) while green and red keep white.
  statusPillTextOnLight: { color: '#111111' },

  leaveCols: { flexDirection: 'row', marginTop: rs(6), gap: rs(8) },
  leaveCol: { flex: 1 },
  leaveColValue: { fontSize: 11, fontWeight: '700', color: '#111111' },
  leaveColLabel: { fontSize: 9, color: '#9CA3AF', marginTop: rs(2) },

  actionRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(8) },
  approveBtn: { flex: 1, backgroundColor: '#035C6C', paddingVertical: rs(7), borderRadius: rs(8), alignItems: 'center' },
  approveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  rejectBtn: { flex: 1, backgroundColor: '#F84141', paddingVertical: rs(7), borderRadius: rs(8), alignItems: 'center' },
  rejectBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  empty: { fontSize: 12, color: '#6B7280', textAlign: 'center', paddingVertical: rs(14) },
  emptyCard: {
    backgroundColor: '#E5F3F5',
    borderWidth: 1,
    borderColor: '#E5F3F5',
    borderRadius: rs(10),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#111111', marginTop: rs(8) },
  emptySub: { fontSize: 11, color: '#6B7280', marginTop: rs(3) },
});
