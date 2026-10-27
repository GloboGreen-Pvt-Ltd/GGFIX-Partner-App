import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeft } from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { useResponsive } from '../../theme/responsive';
import { rs } from '../../utils/responsive';

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const C = {
  teal: '#035C6C',
  navy: '#1C3053',
  ink: '#111111',
  muted: '#6B7280',
  subtle: '#9CA3AF',
  border: '#E5E7EB',
  page: '#F3F4F6',
  card: '#FFFFFF',
};

// Format a number-or-string amount as ₹X,XXX (no decimals for whole rupees).
function formatRupee(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return '₹ 0';
  return `₹ ${n.toLocaleString('en-IN')}`;
}

// In-screen header — the navigator header is hidden for this route, so the
// screen draws its own white bar and owns the top safe-area inset.
function ScreenHeader({ topInset, subtitle, onBack }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 6 }]}>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={onBack}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ArrowLeft size={18} color={C.ink} strokeWidth={2.25} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>Salary Report</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export default function OwnerEmployeeSalaryReportScreen({ route, navigation }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const insets = useSafeAreaInsets();
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

  const header = (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScreenHeader
        topInset={insets.top}
        subtitle={employee?.name}
        onBack={() => navigation.goBack()}
      />
    </>
  );

  if (!employee) {
    return (
      <View style={styles.safe}>
        {header}
        <View style={styles.center}>
          <View style={styles.emptyDisc}>
            <Ionicons name="person-outline" size={rs(26)} color="#FFFFFF" />
          </View>
          <Text style={styles.error}>Employee not found</Text>
        </View>
      </View>
    );
  }

  const fyLabel = `${year}-${String(year + 1).slice(-2)}`;

  return (
    <View style={styles.safe}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, capStyle, { paddingBottom: rs(20) + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#035C6C']} tintColor="#035C6C" />}
      >
        {/* Financial year header */}
        <View style={styles.fyCard}>
          <View style={styles.fyLeft}>
            <View style={styles.fyIconWrap}>
              <Ionicons name="calendar" size={rs(18)} color="#FFFFFF" />
            </View>
            <View style={styles.fyTextWrap}>
              <Text style={styles.fyLabel} numberOfLines={1}>Financial Year</Text>
              <Text style={styles.fyValue} numberOfLines={1}>{fyLabel}</Text>
            </View>
          </View>
          <View style={styles.yearPill}>
            <TouchableOpacity
              style={styles.yearBtn}
              onPress={() => setYear((y) => y - 1)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={rs(15)} color="#035C6C" />
            </TouchableOpacity>
            <Text style={styles.yearPillText}>{year}</Text>
            <TouchableOpacity
              style={styles.yearBtn}
              onPress={() => setYear((y) => y + 1)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={rs(15)} color="#035C6C" />
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
            color="#0788C9"
            bg="#E6F3FA"
            border="#CDE7F5"
          />
          <SummaryTile
            label="Total Earned"
            value={formatRupee(totals.totalNet)}
            sub={`${totals.monthsUnpaid} not paid`}
            icon="cash"
            color="#609138"
            bg="#EDF4E7"
            border="#D6E6C8"
          />
          <SummaryTile
            label="Avg / Month"
            value={formatRupee(totals.monthsPaid > 0 ? Math.round(totals.totalNet / totals.monthsPaid) : 0)}
            sub="Avg payout"
            icon="trending-up"
            color="#035C6C"
            bg="#E5F3F5"
            border="#C7E6EA"
          />
        </View>

        {/* Monthly list */}
        <Text style={styles.sectionHeader}>Monthly Payslips</Text>

        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#035C6C" style={{ marginVertical: rs(16) }} />
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
    </View>
  );
}

function SummaryTile({ label, value, sub, icon, color, bg, border }) {
  return (
    <View style={[styles.summaryTile, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={14} color="#FFFFFF" />
      </View>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
      <Text style={styles.summarySub} numberOfLines={1}>{sub}</Text>
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
      <View style={[styles.monthIndexBubble, { backgroundColor: isEmpty ? '#9CA3AF' : '#035C6C' }]}>
        <Text style={styles.monthIndexText}>{String(index).padStart(2, '0')}</Text>
      </View>
      <View style={styles.monthMain}>
        <View style={styles.monthHeaderRow}>
          <Text style={styles.monthName} numberOfLines={1}>{MONTHS_FULL[row.month - 1]}</Text>
          <Text style={styles.monthYear}>{row.year}</Text>
        </View>
        <View style={styles.monthBottomRow}>
          <View style={styles.monthMeta}>
            <Ionicons name="calendar-outline" size={rs(13)} color="#6B7280" />
            <Text style={styles.monthMetaText} numberOfLines={1}>{row.presentDays ?? 0} Days</Text>
          </View>
          <View style={styles.monthSpacer} />
          <Text
            style={[styles.monthSalary, isPaid ? styles.monthSalaryPaid : styles.monthSalaryEmpty]}
            numberOfLines={1}
          >
            {formatRupee(row.netSalary)}
          </Text>
        </View>
      </View>
      <View style={styles.monthRight}>
        {isEmpty ? (
          <View style={[styles.statusPill, styles.statusPillEmpty]}>
            <Text style={[styles.statusPillText, { color: '#B45309' }]}>Pending</Text>
          </View>
        ) : isPaid ? (
          <View style={[styles.statusPill, styles.statusPillPaid]}>
            <Ionicons name="checkmark-circle" size={rs(12)} color="#609138" />
            <Text style={[styles.statusPillText, { color: '#476B26' }]}>Paid</Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnpaid]}>
            <Text style={[styles.statusPillText, { color: '#C81E1A' }]}>Unpaid</Text>
          </View>
        )}
        {!isEmpty && <Ionicons name="chevron-forward" size={rs(14)} color="#9CA3AF" style={{ marginTop: rs(5) }} />}
      </View>
    </TouchableOpacity>
  );
}

const CARD_SHADOW = {
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.page },
  content: { padding: rs(14), paddingBottom: rs(20) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: rs(24) },
  error: { fontSize: 14, fontWeight: '800', color: '#374151', textAlign: 'center' },
  emptyDisc: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    backgroundColor: '#F32C26',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: rs(12),
  },

  // In-screen header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    paddingBottom: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.page,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8, minWidth: 0 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.ink },
  headerSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  headerSpacer: { width: 36, height: 36 },

  // Financial year card
  fyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: rs(16),
    padding: rs(12),
    borderWidth: 1,
    borderColor: C.border,
    ...CARD_SHADOW,
  },
  fyLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10), flex: 1, marginRight: rs(8), minWidth: 0 },
  fyIconWrap: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' },
  fyTextWrap: { flexShrink: 1, minWidth: 0 },
  fyLabel: { fontSize: 11, color: C.muted, fontWeight: '600' },
  fyValue: { fontSize: 17, fontWeight: '800', color: C.navy, marginTop: rs(1) },

  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
  },
  yearBtn: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    backgroundColor: '#E5F3F5',
    borderWidth: 1, borderColor: '#C7E6EA',
    alignItems: 'center', justifyContent: 'center',
  },
  yearPillText: { color: C.navy, fontSize: 14, fontWeight: '800', minWidth: rs(38), textAlign: 'center' },

  // Summary stat tiles
  summaryRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  summaryTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: rs(14),
    padding: rs(10),
    alignItems: 'flex-start',
    borderWidth: 1,
  },
  summaryIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(8),
  },
  summaryValue: { fontSize: 16, fontWeight: '800', color: C.navy, alignSelf: 'stretch' },
  summaryLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: rs(2), alignSelf: 'stretch' },
  summarySub: { fontSize: 10, color: C.subtle, marginTop: rs(1), alignSelf: 'stretch' },

  sectionHeader: { fontSize: 14, fontWeight: '800', color: C.navy, marginTop: rs(16), marginBottom: rs(8) },

  // Monthly payslip rows
  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: rs(16),
    padding: rs(12),
    marginBottom: rs(8),
    gap: rs(10),
    borderWidth: 1,
    borderColor: C.border,
    ...CARD_SHADOW,
  },
  monthCardEmpty: { backgroundColor: '#F9FAFB', shadowOpacity: 0, elevation: 0 },

  monthIndexBubble: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthIndexText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: rs(6) },
  monthName: { fontSize: 14, fontWeight: '800', color: C.navy, flexShrink: 1 },
  monthYear: { fontSize: 11, color: C.subtle, fontWeight: '600' },
  monthBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(4) },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: rs(4), flexShrink: 1 },
  monthMetaText: { fontSize: 11.5, color: C.muted, fontWeight: '500' },
  monthSpacer: { flex: 1, minWidth: rs(6) },
  monthSalary: { fontSize: 14, fontWeight: '800' },
  monthSalaryPaid: { color: C.navy },
  monthSalaryEmpty: { color: C.subtle },

  monthRight: { alignItems: 'flex-end' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillPaid: { backgroundColor: '#EDF4E7' },
  statusPillUnpaid: { backgroundColor: '#FDEBEA' },
  statusPillEmpty: { backgroundColor: '#FFF4DB' },
  statusPillText: { fontSize: 10.5, fontWeight: '800' },
});
