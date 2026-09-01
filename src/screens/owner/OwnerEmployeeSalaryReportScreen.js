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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Financial year header */}
        <View style={styles.fyCard}>
          <View style={styles.fyLeft}>
            <View style={styles.fyIconWrap}>
              <Ionicons name="calendar" size={rs(20)} color="#004C40" />
            </View>
            <View style={styles.fyTextWrap}>
              <Text style={styles.fyLabel}>Financial Year</Text>
              <Text style={styles.fyValue}>{fyLabel}</Text>
            </View>
          </View>
          <View style={styles.yearPill}>
            <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-back" size={rs(14)} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.yearPillText}>{year}</Text>
            <View style={styles.yearPillSep} />
            <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-forward" size={rs(14)} color="#FFFFFF" />
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
            color="#004C40"
            bg="#E6F7E3"
          />
          <SummaryTile
            label="Total Earned"
            value={formatRupee(totals.totalNet)}
            sub={`${totals.monthsUnpaid} not paid`}
            icon="cash"
            color="#004C40"
            bg="#F0F8EF"
          />
          <SummaryTile
            label="Avg / Month"
            value={formatRupee(totals.monthsPaid > 0 ? Math.round(totals.totalNet / totals.monthsPaid) : 0)}
            sub="Avg payout"
            icon="trending-up"
            color="#004C40"
            bg="#E6F7E3"
          />
        </View>

        {/* Monthly list */}
        <Text style={styles.sectionHeader}>Monthly Payslips</Text>

        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#004C40" style={{ marginVertical: rs(16) }} />
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
        <Ionicons name={icon} size={rs(19)} color={color} />
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
            <Ionicons name="calendar-outline" size={rs(13)} color="#667066" />
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
            <Text style={[styles.statusPillText, { color: '#667066' }]}>Pending</Text>
          </View>
        ) : isPaid ? (
          <View style={[styles.statusPill, styles.statusPillPaid]}>
            <Ionicons name="checkmark-circle" size={rs(13)} color="#004C40" />
            <Text style={[styles.statusPillText, { color: '#004C40' }]}>Paid</Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnpaid]}>
            <Text style={[styles.statusPillText, { color: '#D97706' }]}>Unpaid</Text>
          </View>
        )}
        {!isEmpty && <Ionicons name="chevron-forward" size={rs(16)} color="#8FA08F" style={{ marginTop: rs(6) }} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: rs(12), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: rf(13), color: '#DC2626' },

  fyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rs(14),
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  fyLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10), flex: 1 },
  fyIconWrap: { width: rs(38), height: rs(38), borderRadius: rs(11), backgroundColor: '#E6F7E3', alignItems: 'center', justifyContent: 'center' },
  fyTextWrap: {},
  fyLabel: { fontSize: rf(11.5), color: '#8FA08F', fontWeight: '600' },
  fyValue: { fontSize: rf(21), fontWeight: '800', color: '#172117', marginTop: rs(2) },

  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004C40',
    paddingHorizontal: rs(12),
    paddingVertical: rs(7),
    borderRadius: 999,
    gap: rs(7),
  },
  yearPillText: { color: '#FFFFFF', fontSize: rf(12), fontWeight: '700' },
  yearPillSep: { width: rs(1), height: rs(12), backgroundColor: 'rgba(255,255,255,0.3)' },

  summaryRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(10) },
  summaryTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    padding: rs(10),
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  summaryIconWrap: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(8),
  },
  summaryValue: { fontSize: rf(18), fontWeight: '800', color: '#172117' },
  summaryLabel: { fontSize: rf(11.5), color: '#172117', fontWeight: '700', marginTop: rs(3) },
  summarySub: { fontSize: rf(10), color: '#8FA08F', marginTop: rs(2) },

  sectionHeader: { fontSize: rf(15), fontWeight: '800', color: '#172117', marginTop: rs(14), marginBottom: rs(9) },

  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(11),
    marginBottom: rs(8),
    gap: rs(10),
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  monthCardEmpty: { backgroundColor: '#F7FAF7' },

  monthIndexBubble: {
    width: rs(33),
    height: rs(33),
    borderRadius: rs(17),
    backgroundColor: '#E6F7E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthIndexText: { fontSize: rf(12), fontWeight: '800', color: '#004C40' },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: rs(6) },
  monthName: { fontSize: rf(14), fontWeight: '800', color: '#172117' },
  monthYear: { fontSize: rf(11.5), color: '#8FA08F', fontWeight: '600' },
  monthBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(5) },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  monthMetaText: { fontSize: rf(11.5), color: '#667066', fontWeight: '500' },
  monthSpacer: { flex: 1 },
  monthSalary: { fontSize: rf(13.5), fontWeight: '800' },
  monthSalaryPaid: { color: '#004C40' },
  monthSalaryEmpty: { color: '#8FA08F' },

  monthRight: { alignItems: 'flex-end' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    paddingHorizontal: rs(10),
    paddingVertical: rs(4),
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  statusPillPaid: { borderColor: '#004C40' },
  statusPillUnpaid: { borderColor: '#FDE68A' },
  statusPillEmpty: { borderColor: '#E2E8E2' },
  statusPillText: { fontSize: rf(10.5), fontWeight: '800' },
});
