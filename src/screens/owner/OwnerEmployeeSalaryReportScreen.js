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
import { useResponsive } from '../../theme/responsive';
import { rf, rs } from '../../utils/responsive';

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a number-or-string amount as ₹X,XXX (no decimals for whole rupees).
function formatRupee(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return '₹ 0';
  return `₹ ${n.toLocaleString('en-IN')}`;
}

export default function OwnerEmployeeSalaryReportScreen({ route, navigation }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const employee = route.params?.employee;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!employee?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${employee.id}/payslips`, { query: { year } });
      setList(Array.isArray(res) ? res : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee?.id, year]);

  React.useEffect(() => { load(); }, [load]);

  // Build 12-month rows so months with no payslip still show as "Not generated".
  const rows = useMemo(() => {
    const byMonth = {};
    list.forEach((r) => { byMonth[r.month] = r; });
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const existing = byMonth[m];
      return existing || { month: m, year, presentDays: 0, netSalary: 0, regularSalary: 0, _empty: true };
    });
  }, [list, year]);

  const totals = useMemo(() => {
    let totalPresent = 0;
    let totalNet = 0;
    let monthsPaid = 0;
    list.forEach((r) => {
      totalPresent += Number(r.presentDays || 0);
      const n = Number(r.netSalary || 0);
      totalNet += Number.isNaN(n) ? 0 : n;
      if (n > 0) monthsPaid += 1;
    });
    return { totalPresent, totalNet, monthsPaid, monthsUnpaid: list.length - monthsPaid };
  }, [list]);

  const openPayslip = (row) => {
    if (row._empty) return; // nothing to view yet
    navigation.navigate('OwnerEmployeePayslip', { employee, month: row.month, year: row.year });
  };

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={styles.error}>Employee not found</Text></View>
      </SafeAreaView>
    );
  }

  const fyLabel = `${year}-${String(year + 1).slice(-2)}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, capStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#09AD2A']} tintColor="#09AD2A" />}
      >
        {/* Financial year header */}
        <View style={styles.fyCard}>
          <View style={styles.fyLeft}>
            <View style={styles.fyIconWrap}>
              <Ionicons name="calendar" size={rs(20)} color="#09AD2A" />
            </View>
            <View style={styles.fyTextWrap}>
              <Text style={styles.fyLabel}>Financial Year</Text>
              <Text style={styles.fyValue}>{fyLabel}</Text>
            </View>
          </View>
          <View style={styles.yearPill}>
            <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-back" size={rs(14)} color="#078F23" />
            </TouchableOpacity>
            <Text style={styles.yearPillText}>{year}</Text>
            <View style={styles.yearPillSep} />
            <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-forward" size={rs(14)} color="#078F23" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary tiles */}
        <View style={styles.summaryRow}>
          <SummaryTile
            label="Total Present"
            value={`${totals.totalPresent}`}
            sub="Days"
            icon="people"
            color="#09AD2A"
            bg="#EAF8EC"
          />
          <SummaryTile
            label="Total Earned"
            value={formatRupee(totals.totalNet)}
            sub={`${totals.monthsUnpaid} not paid`}
            icon="cash"
            color="#09AD2A"
            bg="#EAF8EC"
          />
          <SummaryTile
            label="Avg / Month"
            value={formatRupee(totals.monthsPaid > 0 ? Math.round(totals.totalNet / totals.monthsPaid) : 0)}
            sub="Avg payout"
            icon="trending-up"
            color="#09AD2A"
            bg="#EAF8EC"
          />
        </View>

        {/* Monthly list */}
        <Text style={styles.sectionHeader}>Monthly Payslips</Text>

        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#09AD2A" style={{ marginVertical: rs(16) }} />
        ) : (
          rows.map((row, i) => (
            <MonthCard
              key={`${row.month}-${row.year}`}
              row={row}
              index={i + 1}
              onPress={() => openPayslip(row)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryTile({ label, value, sub, icon, color, bg }) {
  return (
    <View style={styles.summaryTile}>
      <View style={[styles.summaryIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={rs(15)} color={color} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summarySub}>{sub}</Text>
    </View>
  );
}

function MonthCard({ row, index, onPress }) {
  const isEmpty = row._empty;
  const net = Number(row.netSalary || 0);
  const isPaid = !isEmpty && net > 0;
  return (
    <TouchableOpacity
      style={[styles.monthCard, isEmpty && styles.monthCardEmpty]}
      onPress={onPress}
      activeOpacity={isEmpty ? 1 : 0.85}
      disabled={isEmpty}
    >
      <View style={styles.monthIndexBubble}>
        <Text style={styles.monthIndexText}>{String(index).padStart(2, '0')}</Text>
      </View>
      <View style={styles.monthMain}>
        <View style={styles.monthHeaderRow}>
          <Text style={styles.monthName}>{MONTHS_FULL[row.month - 1]}</Text>
          <Text style={styles.monthYear}>{row.year}</Text>
        </View>
        <View style={styles.monthBottomRow}>
          <View style={styles.monthMeta}>
            <Ionicons name="calendar-outline" size={rs(13)} color="#6B6B6B" />
            <Text style={styles.monthMetaText}>{row.presentDays ?? 0} Days</Text>
          </View>
          <View style={styles.monthSpacer} />
          <Text style={[styles.monthSalary, isPaid ? styles.monthSalaryPaid : styles.monthSalaryEmpty]}>
            {formatRupee(row.netSalary)}
          </Text>
        </View>
      </View>
      <View style={styles.monthRight}>
        {isEmpty ? (
          <View style={[styles.statusPill, styles.statusPillEmpty]}>
            <Text style={[styles.statusPillText, { color: '#6B6B6B' }]}>Pending</Text>
          </View>
        ) : isPaid ? (
          <View style={[styles.statusPill, styles.statusPillPaid]}>
            <Ionicons name="checkmark-circle" size={rs(13)} color="#09AD2A" />
            <Text style={[styles.statusPillText, { color: '#078F23' }]}>Paid</Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnpaid]}>
            <Text style={[styles.statusPillText, { color: '#8A6A00' }]}>Unpaid</Text>
          </View>
        )}
        {!isEmpty && <Ionicons name="chevron-forward" size={rs(14)} color="#8A8A8A" style={{ marginTop: rs(4) }} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: rs(10), paddingBottom: rs(20) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: '#F84141' },

  fyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    paddingHorizontal: rs(11),
    paddingVertical: rs(10),
    borderWidth: 1,
    borderColor: '#F3F3F3',
    shadowColor: '#1E1E1E', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  fyLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10), flex: 1 },
  fyIconWrap: { width: rs(34), height: rs(34), borderRadius: rs(10), backgroundColor: '#EAF8EC', alignItems: 'center', justifyContent: 'center' },
  fyTextWrap: {},
  fyLabel: { fontSize: 10.5, color: '#8A8A8A', fontWeight: '600' },
  fyValue: { fontSize: 17, fontWeight: '800', color: '#1E1E1E', marginTop: rs(1) },

  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF8EC',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: 999,
    gap: rs(7),
  },
  yearPillText: { color: '#078F23', fontSize: 11.5, fontWeight: '800' },
  yearPillSep: { width: rs(1), height: rs(12), backgroundColor: '#CDEFD4' },

  summaryRow: { flexDirection: 'row', gap: rs(6), marginTop: rs(8) },
  summaryTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    padding: rs(8),
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#F3F3F3',
    shadowColor: '#1E1E1E', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  summaryIconWrap: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(5),
  },
  summaryValue: { fontSize: 14.5, fontWeight: '800', color: '#1E1E1E' },
  summaryLabel: { fontSize: 10.5, color: '#1E1E1E', fontWeight: '700', marginTop: rs(2) },
  summarySub: { fontSize: 9.5, color: '#8A8A8A', marginTop: rs(1) },

  sectionHeader: { fontSize: 13, fontWeight: '800', color: '#1E1E1E', marginTop: rs(12), marginBottom: rs(6) },

  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    marginBottom: rs(6),
    gap: rs(9),
    borderWidth: 1,
    borderColor: '#F3F3F3',
    shadowColor: '#1E1E1E', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  monthCardEmpty: { backgroundColor: '#F8F8F8' },

  monthIndexBubble: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    backgroundColor: '#EAF8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthIndexText: { fontSize: 11, fontWeight: '800', color: '#078F23' },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: rs(6) },
  monthName: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  monthYear: { fontSize: 11, color: '#8A8A8A', fontWeight: '600' },
  monthBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(3) },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  monthMetaText: { fontSize: 11, color: '#6B6B6B', fontWeight: '500' },
  monthSpacer: { flex: 1 },
  monthSalary: { fontSize: 13, fontWeight: '800' },
  monthSalaryPaid: { color: '#078F23' },
  monthSalaryEmpty: { color: '#8A8A8A' },

  monthRight: { alignItems: 'flex-end' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    paddingHorizontal: rs(8),
    paddingVertical: rs(3),
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  statusPillPaid: { borderColor: '#09AD2A' },
  statusPillUnpaid: { borderColor: '#F8D66B' },
  statusPillEmpty: { borderColor: '#E6E6E6' },
  statusPillText: { fontSize: 10, fontWeight: '800' },
});
