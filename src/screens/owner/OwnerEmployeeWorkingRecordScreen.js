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
import { listShopRepairBookings } from '../../api/orders';
import { useResponsive } from '../../theme/responsive';
import { rf, rs } from '../../utils/responsive';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Completed', 'In Process', 'Pending'];

// Map raw booking.status / latest-event status into a UI bucket the cards key off.
function bucketize(status) {
  const s = (status || '').toUpperCase();
  if (s.includes('COMPLETE') || s === 'DELIVERED' || s === 'CLOSED') return 'COMPLETED';
  if (s.includes('PENDING') || s.includes('AWAIT') || s === 'SPARE_ORDERED') return 'PENDING';
  if (
    s.includes('IN_SERVICE')
    || s.includes('IN_PROCESS')
    || s.includes('STARTED')
    || s === 'SERVICE_ACCEPTED'
    || s === 'ASSIGNED'
    || s === 'CONFIRMED'
    || s === 'PICKUP_SCHEDULED'
  ) return 'IN_PROCESS';
  return 'IN_PROCESS';
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(instant) {
  if (!instant) return '—';
  return new Date(instant).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Compose a "device" line out of the brand/model/RAM/storage fields the booking carries.
function deviceLine(b) {
  const parts = [];
  if (b.modelName) parts.push(b.modelName);
  else if (b.brandName) parts.push(b.brandName);
  if (b.ramLabel || b.storageLabel) {
    parts.push(`${b.ramLabel || ''}${b.ramLabel && b.storageLabel ? ' / ' : ''}${b.storageLabel || ''}`.trim());
  }
  if (b.issueSummary) parts.push(b.issueSummary);
  return parts.join(' - ') || 'Repair booking';
}

function trackingId(b) {
  return b.trackingId || b.ticketCode || `CSPEN${String(b.id || '').replace(/[^0-9]/g, '').slice(0, 8) || '——'}`;
}

export default function OwnerEmployeeWorkingRecordScreen({ route, navigation }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const employee = route.params?.employee;
  // No `employee` param = ALL-TECHNICIAN mode. This screen is reachable two
  // ways now: from one employee's detail page, and from the dashboard's
  // "Service Report" tile, which wants every technician's assigned tickets.
  // Everything below keys off this instead of bailing with "Employee not found".
  const allMode = !employee?.id;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const all = await listShopRepairBookings();
      setList(Array.isArray(all) ? all : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Keep only bookings actually assigned to this employee. The order-service
  // currently exposes `assignedPickupPersonId` (UUID) for pickup persons and
  // a denormalized `technicianName` string for service technicians, so we
  // match on either path. (Adding a proper `assignedTechnicianId` column on
  // repair_bookings would let this become a server-side filter.)
  const mineAll = useMemo(() => {
    // All-technician mode: every booking that has a technician on it. There is
    // no `assignedTechnicianId` column on repair_bookings, so "is assigned" can
    // only be read off the denormalized `technicianName` string — the same
    // limitation the per-employee branch below works around by name-matching.
    if (allMode) return list.filter((b) => !!String(b.technicianName || '').trim());
    if (!employee?.id) return [];
    return list.filter((b) => {
      if (b.assignedPickupPersonId === employee.id) return true;
      if (b.technicianName && employee.name && b.technicianName.trim() === employee.name.trim()) return true;
      return false;
    });
  }, [list, allMode, employee?.id, employee?.name]);

  // Scope to the picked month so the stats only reflect tasks created/updated then.
  const mine = useMemo(() => {
    return mineAll.filter((b) => {
      const t = b.updatedAt || b.createdAt;
      if (!t) return true;
      const d = new Date(t);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [mineAll, year, month]);

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

  const sortedDesc = useMemo(() => {
    return [...mine].sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [mine]);

  const recentPending = sortedDesc.find((b) => bucketize(b.status) === 'PENDING');
  const recentInProcess = sortedDesc.find((b) => bucketize(b.status) === 'IN_PROCESS');

  const previousCompleted = sortedDesc.filter((b) => {
    const bk = bucketize(b.status);
    if (filter === 'All') return true;
    if (filter === 'Completed') return bk === 'COMPLETED';
    if (filter === 'In Process') return bk === 'IN_PROCESS';
    if (filter === 'Pending') return bk === 'PENDING';
    return false;
  });

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const openBooking = (b) => {
    navigation.navigate('OwnerPickupServiceDetail', { id: b.id, booking: b });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, capStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* This Month — stats */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={rs(14)} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={rs(14)} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statTilesRow}>
            <StatTile
              value={String(counts.inProcess).padStart(2, '0')}
              label="In Process"
              hint="Active"
              icon="time-outline"
              tint="#F0F8EF"
              accent="#004C40"
            />
            <StatTile
              value={String(counts.pending).padStart(2, '0')}
              label="Pending"
              hint="Waiting"
              icon="alert-circle"
              tint="#FFFBEB"
              accent="#D97706"
            />
            <StatTile
              value={String(counts.completed).padStart(3, '0')}
              label="Completed"
              hint="Finished"
              icon="checkmark-circle"
              tint="#F0F8EF"
              accent="#004C40"
            />
            <StatTile
              value={String(counts.total).padStart(3, '0')}
              label="Total"
              hint="Overall"
              icon="stats-chart"
              tint="#F0F8EF"
              accent="#004C40"
            />
          </View>
        </View>

        {loading && list.length === 0 && (
          <ActivityIndicator size="small" color="#004C40" style={{ marginVertical: rs(20) }} />
        )}

        {/* Recent Pending */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeader}>Recent Pending</Text>
          <TouchableOpacity onPress={() => setFilter('Pending')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>
        {recentPending ? (
          <TaskCard
            booking={recentPending}
            bucket="PENDING"
            onPress={() => openBooking(recentPending)}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            showAssignee={allMode}
          />
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="file-tray-outline" size={rs(26)} color="#004C40" />
            <Text style={styles.emptyTitle}>No pending tasks.</Text>
            <Text style={styles.emptySub}>You&apos;re all caught up!</Text>
          </View>
        )}

        {/* In Process */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeader}>In Process</Text>
          <TouchableOpacity onPress={() => setFilter('In Process')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>
        {recentInProcess ? (
          <TaskCard
            booking={recentInProcess}
            bucket="IN_PROCESS"
            onPress={() => openBooking(recentInProcess)}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            showAssignee={allMode}
          />
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-outline" size={rs(26)} color="#004C40" />
            <Text style={styles.emptyTitle}>No tasks in progress.</Text>
            <Text style={styles.emptySub}>Nothing being worked on right now.</Text>
          </View>
        )}

        {/* Previous Completed (with filter chips) */}
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHeader}>Previous Completed</Text>
          <TouchableOpacity onPress={() => setFilter('All')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
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
        {previousCompleted.length === 0 ? (
          <Text style={styles.empty}>No tasks found.</Text>
        ) : (
          previousCompleted.map((b) => (
            <TaskCard
              key={b.id}
              booking={b}
              bucket={bucketize(b.status)}
              onPress={() => openBooking(b)}
              onRefresh={() => load(true)}
              refreshing={refreshing}
              showAssignee={allMode}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ value, label, hint, icon, tint, accent }) {
  return (
    <View style={[styles.statTileWrap, { backgroundColor: tint }]}>
      <View style={styles.statTileTop}>
        <Ionicons name={icon} size={rs(14)} color={accent} />
        <Text style={[styles.statTileTopText, { color: accent }]}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileHint}>{hint}</Text>
    </View>
  );
}

function TaskCard({ booking, bucket, onPress, onRefresh, refreshing, showAssignee }) {
  const isPending = bucket === 'PENDING';
  const isInProcess = bucket === 'IN_PROCESS';
  const isCompleted = bucket === 'COMPLETED';

  const stepLine =
    isPending ? 'Spare part has been ordered. Service is Pending'
      : isInProcess ? 'Technician Work Started'
        : 'Technician Work Completed';
  const stepColor =
    isPending ? '#DC2626'
      : isInProcess ? '#004C40'
        : '#004C40';

  const footerLine =
    isPending ? `Pending On ${formatDateTime(booking.updatedAt || booking.createdAt)}`
      : isInProcess ? `In Service Process On ${formatDateTime(booking.updatedAt || booking.createdAt)}`
        : `Completed On ${formatDateTime(booking.updatedAt || booking.createdAt)}`;

  return (
    <TouchableOpacity style={styles.taskCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.taskAccent} />
      <View style={styles.taskInner}>
        <View style={styles.taskTopRow}>
          <View style={styles.taskDateRow}>
            <Ionicons name="calendar-outline" size={rs(14)} color="#004C40" />
            <Text style={styles.taskDate}>{formatDate(booking.createdAt)}</Text>
          </View>
          <Text style={styles.taskTracking}>#{trackingId(booking)}</Text>
        </View>
        <View style={styles.taskMiddleRow}>
          <Text style={styles.taskDevice} numberOfLines={2}>{deviceLine(booking)}</Text>
          {/* Whose ticket this is. All-technician mode only — on one employee's
              own record the answer is the page you are already looking at. */}
          {showAssignee ? (
            <Text style={styles.taskAssignee} numberOfLines={1}>
              {String(booking.technicianName || '').trim() || 'Unassigned'}
            </Text>
          ) : null}
        </View>
        <View style={styles.taskBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.taskStep, { color: stepColor }]}>{stepLine}</Text>
            <Text style={styles.taskFooter}>{footerLine}</Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
            style={styles.taskStatusIcon}
          >
            {isPending && (
              <View style={[styles.statusBadge, { backgroundColor: '#FEE2E2' }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Ionicons name="refresh" size={rs(14)} color="#DC2626" />
                )}
              </View>
            )}
            {isInProcess && (
              <View style={[styles.statusBadge, { backgroundColor: '#E6F7E3' }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color="#004C40" />
                ) : (
                  <Ionicons name="refresh" size={rs(14)} color="#004C40" />
                )}
              </View>
            )}
            {isCompleted && (
              <View style={[styles.statusBadge, { backgroundColor: '#E6F7E3' }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color="#004C40" />
                ) : (
                  <Ionicons name="refresh" size={rs(14)} color="#004C40" />
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: rs(12), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: rf(13), color: '#DC2626' },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(13),
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(11),
  },
  statsHeaderTitle: { fontSize: rf(15), fontWeight: '800', color: '#172117' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004C40',
    paddingHorizontal: rs(12),
    paddingVertical: rs(6),
    borderRadius: 999,
    gap: rs(7),
  },
  monthPillText: { color: '#FFFFFF', fontSize: rf(11.5), fontWeight: '700' },
  monthPillSep: { width: rs(1), height: rs(12), backgroundColor: 'rgba(255,255,255,0.3)' },

  statTilesRow: { flexDirection: 'row', gap: rs(8) },
  statTileWrap: {
    flex: 1,
    borderRadius: rs(12),
    padding: rs(10),
    alignItems: 'flex-start',
  },
  statTileTop: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  statTileTopText: { fontSize: rf(10.5), fontWeight: '800' },
  statTileValue: { fontSize: rf(20), fontWeight: '800', color: '#172117', marginTop: rs(6) },
  statTileHint: { fontSize: rf(10), color: '#667066', marginTop: rs(2), fontWeight: '600' },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rs(14), marginBottom: rs(8) },
  sectionHeader: { fontSize: rf(15), fontWeight: '800', color: '#172117' },
  viewAll: { fontSize: rf(12), fontWeight: '800', color: '#004C40' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginBottom: rs(12) },
  filterChip: {
    paddingHorizontal: rs(13),
    paddingVertical: rs(6),
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8E2',
  },
  filterChipActive: { backgroundColor: '#004C40', borderColor: '#004C40' },
  filterChipText: { fontSize: rf(12), color: '#667066', fontWeight: '700' },
  filterChipTextActive: { color: '#FFFFFF' },

  taskCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    marginBottom: rs(8),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  taskAccent: { width: rs(4), backgroundColor: '#004C40' },
  taskInner: { flex: 1, padding: rs(11) },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskDateRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  taskDate: { fontSize: rf(13), fontWeight: '800', color: '#172117' },
  taskTracking: { fontSize: rf(11), color: '#8FA08F', fontWeight: '600' },
  taskMiddleRow: { marginTop: rs(6) },
  taskDevice: { fontSize: rf(12), color: '#172117' },
  taskAssignee: { fontSize: rf(11), color: '#004C40', fontWeight: '700', marginTop: rs(2) },
  taskBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(8) },
  taskStep: { fontSize: rf(12.5), fontWeight: '800' },
  taskFooter: { fontSize: rf(10.5), color: '#8FA08F', marginTop: rs(3) },
  taskStatusIcon: { marginLeft: rs(8) },
  statusBadge: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },

  empty: { fontSize: rf(12), color: '#667066', textAlign: 'center', paddingVertical: rs(14) },
  emptyCard: {
    backgroundColor: '#F0F8EF',
    borderWidth: 1,
    borderColor: '#E6F7E3',
    borderRadius: rs(12),
    paddingVertical: rs(18),
    alignItems: 'center',
  },
  emptyTitle: { fontSize: rf(13), fontWeight: '800', color: '#172117', marginTop: rs(7) },
  emptySub: { fontSize: rf(11.5), color: '#667066', marginTop: rs(3) },
});
