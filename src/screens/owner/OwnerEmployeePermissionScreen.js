import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';
import { useResponsive } from '../../theme/responsive';
import { rs } from '../../utils/responsive';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GREEN = '#035C6C';
const GREEN_TEXT = '#035C6C';
const YELLOW_TEXT = '#B7791F';
const YELLOW_SOFT = '#FFF6E0';

function time12(t) {
  if (!t) return null;
  const [hh, mm] = String(t).split(':');
  const h = Number(hh);
  if (Number.isNaN(h)) return null;
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm || '00').padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dateLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Employee-wise Permission report: the month's PERMISSION days from attendance. */
export default function OwnerEmployeePermissionScreen({ route }) {
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const employee = route.params?.employee;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!employee?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setData(await ticketApi.get(`/technicians/${employee.id}/attendance`, { query: { month, year } }));
    } catch (e) {
      setData(null);
      setError(e?.message || 'Could not load permissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(
    () => (data?.dailyRecords || [])
      .filter((d) => String(d.status || '').toUpperCase() === 'PERMISSION')
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [data],
  );

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={styles.error}>Employee not found</Text></View>
      </SafeAreaView>
    );
  }

  const count = data?.permissionCount ?? rows.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, capStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} />}
      >
        <View style={styles.topRow}>
          <View style={styles.flexShrink}>
            <Text style={styles.name} numberOfLines={1}>{employee.name || employee.fullName || 'Employee'}</Text>
            <Text style={styles.sub}>Permission report</Text>
          </View>
          <View style={styles.monthPill}>
            <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={8} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={rs(15)} color={GREEN_TEXT} />
            </TouchableOpacity>
            <Text style={styles.monthText}>{MONTHS[month - 1].slice(0, 3)} {year}</Text>
            <TouchableOpacity onPress={() => stepMonth(1)} disabled={isCurrentMonth} hitSlop={8} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={rs(15)} color={isCurrentMonth ? '#C9D6CB' : GREEN_TEXT} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summary}>
          <Ionicons name="hourglass-outline" size={rs(22)} color={YELLOW_TEXT} />
          <View style={styles.summaryText}>
            <Text style={styles.summaryValue}>{String(count).padStart(2, '0')}</Text>
            <Text style={styles.summaryLabel}>Permissions in {MONTHS[month - 1]}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: rs(24) }} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No permissions recorded this month.</Text>
        ) : (
          rows.map((d) => {
            const inT = time12(d.checkInTime);
            const outT = time12(d.checkOutTime);
            return (
              <View key={d.date} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardDate}>{dateLabel(d.date)}</Text>
                  <View style={styles.badge}><Text style={styles.badgeText}>Permission</Text></View>
                </View>
                {d.notes ? <Text style={styles.notes}>{d.notes}</Text> : null}
                {inT || outT ? (
                  <View style={styles.times}>
                    <Text style={styles.timeText}>In: <Text style={styles.timeVal}>{inT || '-'}</Text></Text>
                    <Text style={styles.timeText}>Out: <Text style={styles.timeVal}>{outT || '-'}</Text></Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: '#F84141' },
  content: { padding: rs(12), paddingBottom: rs(28) },
  flexShrink: { flexShrink: 1, marginRight: rs(8) },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(10) },
  name: { fontSize: 15, fontWeight: '800', color: '#111111' },
  sub: { fontSize: 11, color: '#6B7280', marginTop: rs(1) },
  monthPill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), backgroundColor: '#E5F3F5',
    borderWidth: 1, borderColor: '#C7E6EA', borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(6),
  },
  monthText: { color: GREEN_TEXT, fontSize: 12, fontWeight: '800' },
  summary: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: YELLOW_SOFT, borderRadius: rs(12),
    padding: rs(12), marginBottom: rs(12),
  },
  summaryText: { marginLeft: rs(12) },
  summaryValue: { fontSize: 20, fontWeight: '800', color: YELLOW_TEXT },
  summaryLabel: { fontSize: 11.5, color: '#6B5A2E', fontWeight: '600' },
  empty: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: rs(24) },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(12), borderWidth: 1, borderColor: '#F3F4F6',
    padding: rs(12), marginBottom: rs(8),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDate: { fontSize: 13, fontWeight: '800', color: '#111111', flexShrink: 1 },
  badge: { backgroundColor: YELLOW_SOFT, borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(3) },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: YELLOW_TEXT },
  notes: { fontSize: 12.5, color: '#3D434B', marginTop: rs(6), lineHeight: 18 },
  times: { flexDirection: 'row', gap: rs(16), marginTop: rs(6) },
  timeText: { fontSize: 11.5, color: '#6B7280' },
  timeVal: { fontWeight: '800', color: GREEN_TEXT },
});
