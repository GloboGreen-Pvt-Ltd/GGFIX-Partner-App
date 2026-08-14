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
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Financial year header */}
        <View style={styles.fyCard}>
          <View style={styles.fyLeft}>
            <View style={styles.fyIconWrap}>
              <Ionicons name="calendar" size={20} color="#087A0A" />
            </View>
            <View style={styles.fyTextWrap}>
              <Text style={styles.fyLabel}>Financial Year</Text>
              <Text style={styles.fyValue}>{fyLabel}</Text>
            </View>
          </View>
          <View style={styles.yearPill}>
            <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.yearPillText}>{year}</Text>
            <View style={styles.yearPillSep} />
            <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
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
            color="#087A0A"
            bg="#E6F7E3"
          />
          <SummaryTile
            label="Total Earned"
            value={formatRupee(totals.totalNet)}
            sub={`${totals.monthsUnpaid} not paid`}
            icon="cash"
            color="#16BB05"
            bg="#F0F8EF"
          />
          <SummaryTile
            label="Avg / Month"
            value={formatRupee(totals.monthsPaid > 0 ? Math.round(totals.totalNet / totals.monthsPaid) : 0)}
            sub="Avg payout"
            icon="trending-up"
            color="#16BB05"
            bg="#E6F7E3"
          />
        </View>

        {/* Monthly list */}
        <Text style={styles.sectionHeader}>Monthly Payslips</Text>

        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#16BB05" style={{ marginVertical: 16 }} />
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
        <Ionicons name={icon} size={19} color={color} />
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
            <Ionicons name="calendar-outline" size={13} color="#667066" />
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
            <Ionicons name="checkmark-circle" size={13} color="#087A0A" />
            <Text style={[styles.statusPillText, { color: '#087A0A' }]}>Paid</Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnpaid]}>
            <Text style={[styles.statusPillText, { color: '#D97706' }]}>Unpaid</Text>
          </View>
        )}
        {!isEmpty && <Ionicons name="chevron-forward" size={16} color="#8FA08F" style={{ marginTop: 6 }} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  content: { padding: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 14, color: '#DC2626' },

  fyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  fyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  fyIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E6F7E3', alignItems: 'center', justifyContent: 'center' },
  fyTextWrap: {},
  fyLabel: { fontSize: 12.5, color: '#8FA08F', fontWeight: '600' },
  fyValue: { fontSize: 26, fontWeight: '800', color: '#172117', marginTop: 2 },

  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#087A0A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 8,
  },
  yearPillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  yearPillSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },

  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  summaryTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'flex-start',
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  summaryIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#172117' },
  summaryLabel: { fontSize: 12, color: '#172117', fontWeight: '700', marginTop: 3 },
  summarySub: { fontSize: 10.5, color: '#8FA08F', marginTop: 2 },

  sectionHeader: { fontSize: 18, fontWeight: '800', color: '#172117', marginTop: 18, marginBottom: 12 },

  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  monthCardEmpty: { backgroundColor: '#F7FAF7' },

  monthIndexBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E6F7E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthIndexText: { fontSize: 13, fontWeight: '800', color: '#087A0A' },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  monthName: { fontSize: 16, fontWeight: '800', color: '#172117' },
  monthYear: { fontSize: 12.5, color: '#8FA08F', fontWeight: '600' },
  monthBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthMetaText: { fontSize: 12.5, color: '#667066', fontWeight: '500' },
  monthSpacer: { flex: 1 },
  monthSalary: { fontSize: 15, fontWeight: '800' },
  monthSalaryPaid: { color: '#087A0A' },
  monthSalaryEmpty: { color: '#8FA08F' },

  monthRight: { alignItems: 'flex-end' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  statusPillPaid: { borderColor: '#7ED957' },
  statusPillUnpaid: { borderColor: '#FDE68A' },
  statusPillEmpty: { borderColor: '#E2E8E2' },
  statusPillText: { fontSize: 11.5, fontWeight: '800' },
});
