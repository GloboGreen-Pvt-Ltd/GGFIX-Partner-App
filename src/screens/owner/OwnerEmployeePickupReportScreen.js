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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Completed', 'In Progress', 'Assigned'];

// Bucket pickup statuses for an at-a-glance summary.
// Buckets:
//   ASSIGNED   — assigned to this pickup person, not yet picked up
//   IN_PROGRESS — picked up, in transit / at shop processing
//   COMPLETED  — pickup delivered + repair flow finished
function bucketize(status) {
  const s = (status || '').toUpperCase();
  if (
    s === 'PICKUP_COMPLETED'
    || s === 'DELIVERED'
    || s === 'COMPLETED'
    || s === 'CLOSED'
    || s.includes('REPAIR_COMPLETED')
  ) return 'COMPLETED';
  if (
    s === 'PICKED_UP'
    || s === 'DEVICE_PICKED_UP'
    || s === 'REPAIR_ESTIMATE_PROCESSING'
    || s === 'REACHED_SHOP'
    || s === 'RECEIVED_AT_SHOP'
    || s === 'IN_TRANSIT'
    || s === 'AT_SHOP'
    || s === 'IN_SERVICE'
    || s === 'PICKUP_IN_PROGRESS'
    || s.includes('STARTED')
    || s.includes('IN_PROCESS')
  ) return 'IN_PROGRESS';
  return 'ASSIGNED';
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

function trackingId(b) {
  return b.bookingNumber || b.trackingId || b.ticketCode || `CSPEN${String(b.id || '').replace(/[^0-9]/g, '').slice(0, 8) || '--'}`;
}

// Build a short address line: 1st 30 chars of the pickup address or fallback.
function addressLine(b) {
  return b.pickupAddressText || b.pickupAddressLabel || b.address || '—';
}

function customerLine(b) {
  const name = b.customerName || '—';
  const mobile = b.customerMobile ? ` • ${b.customerMobile}` : '';
  return `${name}${mobile}`;
}

export default function OwnerEmployeePickupReportScreen({ route, navigation }) {
  const employee = route.params?.employee;
  // No `employee` param = ALL-PICKUP-PERSON mode, for the dashboard's "Pickup
  // Report" tile. With a param it stays one person's report, as before.
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

  // Filter to bookings where THIS employee is the assigned pickup person.
  // Uses the proper UUID column on repair_bookings (no name fallback needed,
  // unlike the technician-side filter — assignedPickupPersonId is reliable).
  const mineAll = useMemo(() => {
    // Every booking with a pickup person on it. Unlike the technician side
    // this one is exact — `assignedPickupPersonId` is a real column.
    if (allMode) return list.filter((b) => !!b.assignedPickupPersonId);
    if (!employee?.id) return [];
    return list.filter((b) => b.assignedPickupPersonId === employee.id);
  }, [list, employee?.id]);

  // Scope to the picked month so the counts reflect "this month's pickups".
  const mine = useMemo(() => {
    return mineAll.filter((b) => {
      const t = b.pickupDate || b.updatedAt || b.createdAt;
      if (!t) return true;
      const d = new Date(t);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [mineAll, year, month]);

  const counts = useMemo(() => {
    let assigned = 0, inProgress = 0, completed = 0;
    mine.forEach((b) => {
      const bk = bucketize(b.status);
      if (bk === 'ASSIGNED') assigned += 1;
      else if (bk === 'COMPLETED') completed += 1;
      else inProgress += 1;
    });
    return { assigned, inProgress, completed, total: mine.length };
  }, [mine]);

  const sortedDesc = useMemo(() => {
    return [...mine].sort((a, b) => {
      const at = new Date(a.pickupDate || a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.pickupDate || b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [mine]);

  const recentAssigned = sortedDesc.find((b) => bucketize(b.status) === 'ASSIGNED');
  const recentInProgress = sortedDesc.find((b) => bucketize(b.status) === 'IN_PROGRESS');

  const filteredList = sortedDesc.filter((b) => {
    const bk = bucketize(b.status);
    if (filter === 'All') return true;
    if (filter === 'Completed') return bk === 'COMPLETED';
    if (filter === 'In Progress') return bk === 'IN_PROGRESS';
    if (filter === 'Assigned') return bk === 'ASSIGNED';
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
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* This Month — stats */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statTilesRow}>
            <StatTile
              value={String(counts.assigned).padStart(2, '0')}
              label="Assigned"
              hint="Scheduled"
              icon="bookmark"
              bg="#16BB05"
            />
            <StatTile
              value={String(counts.inProgress).padStart(2, '0')}
              label="In Progress"
              hint="On route"
              icon="car"
              bg="#F59E0B"
            />
            <StatTile
              value={String(counts.completed).padStart(3, '0')}
              label="Completed"
              hint="Delivered"
              icon="checkmark-done"
              bg="#16BB05"
            />
            <StatTile
              value={String(counts.total).padStart(3, '0')}
              label="Total"
              hint="Overall"
              icon="stats-chart"
              bg="#16BB05"
            />
          </View>
        </View>

        {loading && list.length === 0 && (
          <ActivityIndicator size="small" color="#16BB05" style={{ marginVertical: 20 }} />
        )}

        {/* Recent Assigned */}
        <Text style={styles.sectionHeader}>Recent Assigned</Text>
        {recentAssigned ? (
          <PickupCard
            booking={recentAssigned}
            bucket="ASSIGNED"
            onPress={() => openBooking(recentAssigned)}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            showAssignee={allMode}
          />
        ) : (
          <Text style={styles.empty}>No new pickup assignments.</Text>
        )}

        {/* In Progress */}
        <Text style={styles.sectionHeader}>In Progress</Text>
        {recentInProgress ? (
          <PickupCard
            booking={recentInProgress}
            bucket="IN_PROGRESS"
            onPress={() => openBooking(recentInProgress)}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            showAssignee={allMode}
          />
        ) : (
          <Text style={styles.empty}>No pickups in progress.</Text>
        )}

        {/* Previous (with filter chips) */}
        <Text style={styles.sectionHeader}>Previous Pickups</Text>
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
        {filteredList.length === 0 ? (
          <Text style={styles.empty}>No pickups found.</Text>
        ) : (
          filteredList.map((b) => (
            <PickupCard
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

function StatTile({ value, label, hint, icon, bg }) {
  return (
    <View style={styles.statTileWrap}>
      <View style={[styles.statTileTop, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={11} color="#FFFFFF" />
        <Text style={styles.statTileTopText}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileHint}>{hint}</Text>
    </View>
  );
}

function PickupCard({ booking, bucket, onPress, onRefresh, refreshing, showAssignee }) {
  const isAssigned = bucket === 'ASSIGNED';
  const isInProgress = bucket === 'IN_PROGRESS';
  const isCompleted = bucket === 'COMPLETED';

  const stepLine =
    isAssigned ? 'Pickup Scheduled — awaiting collection'
      : isInProgress ? 'In Transit — heading to shop'
        : 'Pickup Completed — delivered to shop';
  const stepColor =
    isAssigned ? '#16BB05'
      : isInProgress ? '#F59E0B'
        : '#087A0A';

  const slot =
    booking.pickupSlotStart && booking.pickupSlotEnd
      ? `${String(booking.pickupSlotStart).slice(0, 5)} – ${String(booking.pickupSlotEnd).slice(0, 5)}`
      : null;
  const datePart = booking.pickupDate ? formatDate(booking.pickupDate) : formatDate(booking.createdAt);
  const footerLine =
    isAssigned ? `Pickup on ${datePart}${slot ? ` (${slot})` : ''}`
      : isInProgress ? `Picked up on ${formatDateTime(booking.updatedAt || booking.createdAt)}`
        : `Delivered on ${formatDateTime(booking.updatedAt || booking.createdAt)}`;

  return (
    <TouchableOpacity style={styles.pickupCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.pickupAccent} />
      <View style={styles.pickupInner}>
        <View style={styles.pickupTopRow}>
          <Text style={styles.pickupDate}>{datePart}</Text>
          <Text style={styles.pickupTracking}>{trackingId(booking)}</Text>
        </View>

        <View style={styles.pickupMetaRow}>
          <Ionicons name="person-outline" size={11} color="#667066" />
          <Text style={styles.pickupMetaText} numberOfLines={1}>{customerLine(booking)}</Text>
        </View>
        {/* Which pickup person is carrying it. All-person mode only. */}
        {showAssignee ? (
          <View style={styles.pickupMetaRow}>
            <Ionicons name="bicycle-outline" size={11} color="#087A0A" />
            <Text style={styles.pickupAssignee} numberOfLines={1}>
              {String(booking.pickupPersonName || '').trim() || 'Unassigned'}
            </Text>
          </View>
        ) : null}
        <View style={styles.pickupMetaRow}>
          <Ionicons name="location-outline" size={11} color="#667066" />
          <Text style={styles.pickupMetaText} numberOfLines={1}>{addressLine(booking)}</Text>
        </View>

        <View style={styles.pickupBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickupStep, { color: stepColor }]}>{stepLine}</Text>
            <Text style={styles.pickupFooter}>{footerLine}</Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
            style={styles.pickupStatusIcon}
          >
            <View style={[
              styles.statusBadge,
              isAssigned && { backgroundColor: '#E6F7E3' },
              isInProgress && { backgroundColor: '#FEF3C7' },
              isCompleted && { backgroundColor: '#E6F7E3' },
            ]}>
              {refreshing ? (
                <ActivityIndicator size="small" color={stepColor} />
              ) : (
                <Ionicons name="refresh" size={14} color={stepColor} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  content: { padding: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 14, color: '#DC2626' },

  statsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12 },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsHeaderTitle: { fontSize: 14, fontWeight: '700', color: '#172117' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#087A0A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  monthPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  monthPillSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },

  statTilesRow: { flexDirection: 'row', gap: 6 },
  statTileWrap: {
    flex: 1,
    backgroundColor: '#F7FAF7',
    borderRadius: 10,
    overflow: 'hidden',
    paddingBottom: 8,
    alignItems: 'center',
  },
  statTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    paddingVertical: 5,
  },
  statTileTopText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  statTileValue: { fontSize: 18, fontWeight: '800', color: '#172117', marginTop: 6 },
  statTileHint: { fontSize: 9, color: '#8FA08F', marginTop: 1, fontWeight: '600' },

  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#172117', marginTop: 14, marginBottom: 8 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  filterChipActive: { backgroundColor: '#087A0A', borderColor: '#087A0A' },
  filterChipText: { fontSize: 11, color: '#667066', fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },

  pickupCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  pickupAccent: { width: 3, backgroundColor: '#16BB05' },
  pickupInner: { flex: 1, padding: 10 },
  pickupTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickupDate: { fontSize: 12, fontWeight: '700', color: '#172117' },
  pickupTracking: { fontSize: 11, color: '#667066', fontWeight: '600' },
  pickupAssignee: { fontSize: 11.5, color: '#087A0A', fontWeight: '700', marginLeft: 4 },
  pickupMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  pickupMetaText: { fontSize: 11, color: '#172117', flex: 1 },
  pickupBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  pickupStep: { fontSize: 11, fontWeight: '700' },
  pickupFooter: { fontSize: 10, color: '#8FA08F', marginTop: 2 },
  pickupStatusIcon: { marginLeft: 8 },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { fontSize: 12, color: '#667066', textAlign: 'center', paddingVertical: 14 },
});
