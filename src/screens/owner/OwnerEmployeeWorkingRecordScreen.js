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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} colors={[GREEN]} />}
      >
        {/* This Month — stats */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={13} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statTilesRow}>
            <StatTile
              value={String(counts.inProcess).padStart(2, '0')}
              label="In Process"
              hint="Active"
              icon="time-outline"
              tint={MINT}
              accent={GREEN}
              accentText={GREEN_DEEP}
            />
            <StatTile
              value={String(counts.pending).padStart(2, '0')}
              label="Pending"
              hint="Waiting"
              icon="alert-circle"
              tint={AMBER_BG}
              accent={AMBER}
              accentText={AMBER_TEXT}
            />
            <StatTile
              value={String(counts.completed).padStart(3, '0')}
              label="Completed"
              hint="Finished"
              icon="checkmark-circle"
              tint={MINT}
              accent={GREEN}
              accentText={GREEN_DEEP}
            />
            <StatTile
              value={String(counts.total).padStart(3, '0')}
              label="Total"
              hint="Overall"
              icon="stats-chart"
              tint={MINT}
              accent={GREEN}
              accentText={GREEN_DEEP}
            />
          </View>
        </View>

        {loading && list.length === 0 && (
          <ActivityIndicator size="small" color={GREEN} style={{ marginVertical: rs(20) }} />
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
            <Ionicons name="file-tray-outline" size={22} color={GREEN} />
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
            <Ionicons name="checkmark-done-outline" size={22} color={GREEN} />
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

function StatTile({ value, label, hint, icon, tint, accent, accentText }) {
  return (
    <View style={[styles.statTileWrap, { backgroundColor: tint }]}>
      <View style={styles.statTileTop}>
        <Ionicons name={icon} size={13} color={accent} />
        {/* One line, shrinking a touch if needed — "Completed" used to wrap
            to "Complete / d" on narrow phones. */}
        <Text
          style={[styles.statTileTopText, { color: accentText || accent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
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
    isPending ? RED
      : isInProcess ? GREEN_DEEP
        : GREEN_DEEP;

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
            <Ionicons name="calendar-outline" size={13} color={GREEN} />
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
              <View style={[styles.statusBadge, { backgroundColor: RED_BG }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color={RED} />
                ) : (
                  <Ionicons name="refresh" size={13} color={RED} />
                )}
              </View>
            )}
            {isInProcess && (
              <View style={[styles.statusBadge, { backgroundColor: MINT }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color={GREEN} />
                ) : (
                  <Ionicons name="refresh" size={13} color={GREEN} />
                )}
              </View>
            )}
            {isCompleted && (
              <View style={[styles.statusBadge, { backgroundColor: MINT }]}>
                {refreshing ? (
                  <ActivityIndicator size="small" color={GREEN} />
                ) : (
                  <Ionicons name="refresh" size={13} color={GREEN} />
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// GGFIX palette.
const GREEN = '#09AD2A';
const GREEN_DEEP = '#078F23';
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const SUBTLE = '#8A8A8A';
const LINE = '#E6E6E6';
const HAIR = '#F3F3F3';
const AMBER = '#F3BF23';
const AMBER_BG = '#FFF8E1';
const AMBER_TEXT = '#8A6A00';
const RED = '#F84141';
const RED_BG = '#FEECEC';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: rs(12), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: RED },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: HAIR,
    shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  statsHeaderTitle: { fontSize: 13, fontWeight: '800', color: INK },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  monthPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  monthPillSep: { width: 1, height: 11, backgroundColor: 'rgba(255,255,255,0.35)' },

  statTilesRow: { flexDirection: 'row', gap: 6 },
  statTileWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 11,
    paddingHorizontal: 7,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  statTileTop: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch' },
  statTileTopText: { flexShrink: 1, fontSize: 10, fontWeight: '800' },
  statTileValue: { fontSize: 15, fontWeight: '800', color: INK, marginTop: 5 },
  statTileHint: { fontSize: 10, color: MUTED, marginTop: 1, fontWeight: '600' },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: INK },
  viewAll: { fontSize: 12, fontWeight: '800', color: GREEN_DEEP },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText: { fontSize: 12, color: MUTED, fontWeight: '700' },
  filterChipTextActive: { color: '#FFFFFF' },

  taskCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: HAIR,
    shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  taskAccent: { width: 3, backgroundColor: GREEN },
  taskInner: { flex: 1, paddingHorizontal: 10, paddingVertical: 9 },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  taskDate: { fontSize: 12, fontWeight: '800', color: INK },
  taskTracking: { fontSize: 11, color: SUBTLE, fontWeight: '700' },
  taskMiddleRow: { marginTop: 4 },
  taskDevice: { fontSize: 12, color: INK },
  taskAssignee: { fontSize: 11, color: GREEN_DEEP, fontWeight: '700', marginTop: 2 },
  taskBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  taskStep: { fontSize: 12, fontWeight: '800' },
  taskFooter: { fontSize: 10, color: SUBTLE, marginTop: 2 },
  taskStatusIcon: { marginLeft: 8 },
  statusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  empty: { fontSize: 12, color: MUTED, textAlign: 'center', paddingVertical: 12 },
  emptyCard: {
    backgroundColor: MINT,
    borderWidth: 1,
    borderColor: MINT_LINE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: INK, marginTop: 5 },
  emptySub: { fontSize: 11, color: MUTED, marginTop: 2 },
});
