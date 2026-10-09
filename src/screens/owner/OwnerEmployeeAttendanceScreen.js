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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GGFIX brand sheet (theme/colors.js) — the same greens, mint and greys as the
// Employee Details screen this one opens from. Replaces the old #004C40 teal
// theme, which no other screen used.
const GREEN = '#09AD2A';       // fills, rings, icons
const GREEN_TEXT = '#078F23';  // green copy on white / mint
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const BORDER = '#E6E6E6';
const HAIR = '#F3F3F3';
const PAGE_BG = '#F8F8F8';
const RED = '#F84141';
const YELLOW = '#F3BF23';
const YELLOW_TEXT = '#8A6A00'; // yellow takes dark text only — white on it is under 2:1
const YELLOW_SOFT = '#FFF8E1';
const GREY = '#8A8A8A';

// Dot legend + stat rings, from the brand sheet alone. Five statuses, five
// marks that stay tellable apart at 6px: Late is red like the late check-in
// times below it, Leave is the yellow the Employee Details "Leave" tile uses,
// Permission (part of a day off) its dark shade, Holiday ink, Week off grey.
const STATUS_COLORS = {
  LEAVE: YELLOW,
  LATE: RED,
  PERMISSION: YELLOW_TEXT,
  WEEK_OFF: GREY,
  HOLIDAY: INK,
};
// `text` is the label colour under each ring — the ring colour itself, except
// yellow, which needs its dark shade to be readable on white.
const RING_COLORS = {
  present: { ring: GREEN, text: GREEN_TEXT },
  late: { ring: RED, text: RED },
  permission: { ring: YELLOW_TEXT, text: YELLOW_TEXT },
  leaves: { ring: YELLOW, text: YELLOW_TEXT },
  holidays: { ring: INK, text: INK },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function OwnerEmployeeAttendanceScreen({ route }) {

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!employee?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${employee.id}/attendance`, {
        query: { month, year },
      });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee?.id, month, year]);

  React.useEffect(() => { load(); }, [load]);

  // Map ISO date → daily record, for O(1) lookup while rendering the grid.
  const recordsByDate = useMemo(() => {
    const map = {};
    (data?.dailyRecords || []).forEach((r) => { if (r.date) map[r.date] = r; });
    return map;
  }, [data]);

  // Build the 6×7 calendar grid for the selected month.
  const grid = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    const startOffset = first.getDay(); // 0=Sun
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${year}-${pad2(month)}-${pad2(d)}`;
      cells.push({ day: d, iso, record: recordsByDate[iso] || null });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [year, month, recordsByDate]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={styles.error}>Employee not found</Text></View>
      </SafeAreaView>
    );
  }

  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const present = data?.presentDays ?? 0;
  const late = data?.lateHours ?? '0';
  const permission = data?.permissionCount ?? 0;
  const leaves = data?.leaveDays ?? 0;
  const holidays = data?.holidayCount ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, capStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />}
      >
        {/* Overview card with calendar */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Attendance Overview</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={rs(14)} color={GREEN_TEXT} />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={rs(14)} color={GREEN_TEXT} />
              </TouchableOpacity>
            </View>
          </View>

          {loading && !data ? (
            <ActivityIndicator size="large" color={GREEN} style={{ marginVertical: rs(24) }} />
          ) : (
            <>
              {/* Stat ring circles */}
              <View style={styles.statRow}>
                <StatRing value={present} label="Present" color={RING_COLORS.present} />
                <StatRing value={`${late} Hrs`} label="Late" color={RING_COLORS.late} />
                <StatRing value={pad2(permission)} label="Permission" color={RING_COLORS.permission} />
                <StatRing value={pad2(leaves)} label="Leaves" color={RING_COLORS.leaves} />
                <StatRing value={pad2(holidays)} label="Holidays" color={RING_COLORS.holidays} />
              </View>

              {/* Calendar */}
              <View style={styles.calendar}>
                <View style={styles.calRowHeader}>
                  {DOW.map((d, i) => (
                    <Text key={d} style={[styles.calHeaderCell, i === 0 && styles.calHeaderSunday]}>
                      {d}
                    </Text>
                  ))}
                </View>
                {grid.map((week, wi) => (
                  <View key={wi} style={styles.calRow}>
                    {week.map((cell, ci) => {
                      if (!cell) return <View key={ci} style={styles.calCell} />;
                      const isSunday = ci === 0;
                      const status = (cell.record?.status || '').toUpperCase();
                      // Treat Sundays as week-off when no other status is set.
                      const effectiveStatus = status || (isSunday ? 'WEEK_OFF' : null);
                      const dotColor = STATUS_COLORS[effectiveStatus];
                      const isToday = cell.iso === todayIso;
                      return (
                        <View key={ci} style={styles.calCell}>
                          <View style={[styles.calDayWrap, isToday && styles.calDayToday]}>
                            <Text
                              style={[
                                styles.calCellNum,
                                isSunday && styles.calCellSunday,
                                isToday && styles.calCellToday,
                              ]}
                            >
                              {cell.day}
                            </Text>
                          </View>
                          {dotColor ? <View style={[styles.calDot, { backgroundColor: dotColor }]} /> : null}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Legend */}
              <View style={styles.legendRow}>
                {[
                  ['Leave', STATUS_COLORS.LEAVE],
                  ['Late', STATUS_COLORS.LATE],
                  ['Permission', STATUS_COLORS.PERMISSION],
                  ['Week off', STATUS_COLORS.WEEK_OFF],
                  ['Holiday', STATUS_COLORS.HOLIDAY],
                ].map(([label, color]) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendText}>{label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Daily list (mockup 3) — list of day cards with check-in/out + status pill */}
        <View style={styles.dailySection}>
          <View style={styles.dailyHeader}>
            <Text style={styles.dailyTitle}>Attendance Monthly</Text>
            <View style={styles.dailyMonthPill}>
              <Text style={styles.dailyMonthText}>{MONTHS[month - 1]} {year}</Text>
              <View style={styles.dailyMonthBtn}>
                <Ionicons name="calendar" size={rs(12)} color="#FFFFFF" />
              </View>
            </View>
          </View>

          {(data?.dailyRecords && data.dailyRecords.length > 0) ? (
            data.dailyRecords.map((day) => <DayCard key={day.date} day={day} />)
          ) : (
            <Text style={styles.empty}>No attendance records for this month.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRing({ value, label, color }) {
  return (
    <View style={styles.statRingWrap}>
      <View style={[styles.statRing, { borderColor: color.ring }]}>
        <Text style={styles.statRingValue}>{value}</Text>
      </View>
      <Text style={[styles.statRingLabel, { color: color.text }]}>{label}</Text>
    </View>
  );
}

function DayCard({ day }) {
  const status = (day.status || 'GENERAL').toUpperCase();
  const dateLabel = formatDateLabel(day);
  if (status === 'LEAVE') {
    return (
      <View style={[styles.dayCard, styles.dayCardLeave]}>
        <View style={[styles.dayLeftAccent, styles.dayLeftAccentLeave]} />
        <View style={styles.dayInner}>
          <View style={styles.dayTopRow}>
            <Text style={styles.dayDate}>{dateLabel}</Text>
            <View style={[styles.dayPill, styles.dayPillLeave]}>
              <Text style={styles.dayPillTextLeave}>Leave</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }
  if (status === 'WEEK_OFF') {
    return (
      <View style={[styles.dayCard, styles.dayCardWeekOff]}>
        <View style={[styles.dayLeftAccent, styles.dayLeftAccentWeekOff]} />
        <View style={styles.dayInner}>
          <View style={styles.dayTopRow}>
            <Text style={styles.dayDate}>{dateLabel}</Text>
            <View style={[styles.dayPill, styles.dayPillWeekOff]}>
              <Text style={styles.dayPillTextOn}>Week Off</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }
  const isLate = status === 'LATE';
  const isPermission = status === 'PERMISSION';
  return (
    <View style={styles.dayCard}>
      <View style={styles.dayLeftAccent} />
      <View style={styles.dayInner}>
        <View style={styles.dayTopRow}>
          <View style={styles.dayDateRow}>
            <Ionicons name="calendar-outline" size={rs(15)} color={GREEN} />
            <Text style={styles.dayDate}>{dateLabel}</Text>
          </View>
          <View style={styles.dayTopRight}>
            <View style={[styles.dayPill, styles.dayPillGeneral]}>
              <Text style={[styles.dayPillText, { color: GREEN_TEXT }]}>General</Text>
            </View>
            {isPermission ? (
              <View style={[styles.dayPill, styles.dayPillPermission]}>
                <Text style={[styles.dayPillText, { color: YELLOW_TEXT }]}>{day.notes || 'Permission'}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.dayCols}>
          <View style={styles.dayCol}>
            <Text style={[styles.dayColValue, isLate && styles.dayColValueLate]}>
              {formatTime12(day.checkInTime)}
            </Text>
            <Text style={styles.dayColLabel}>Check In</Text>
          </View>
          <View style={styles.dayColDivider} />
          <View style={styles.dayCol}>
            <Text style={styles.dayColValue}>{formatTime12(day.checkOutTime)}</Text>
            <Text style={styles.dayColLabel}>Check Out</Text>
          </View>
          <View style={styles.dayColDivider} />
          <View style={styles.dayCol}>
            <Text style={[styles.dayColValue, isLate && styles.dayColValueLate]}>
              {day.workingHours && day.workingHours !== '0' ? day.workingHours : '—'}
            </Text>
            <Text style={styles.dayColLabel}>Working Hrs</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function formatTime12(t) {
  if (!t || typeof t !== 'string') return '—';
  const [hhRaw, mm] = t.split(':');
  const hh = Number(hhRaw);
  if (Number.isNaN(hh)) return '—';
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = ((hh - 1 + 12) % 12) + 1;
  return `${pad2(h12)}:${pad2(Number(mm || 0))} ${period}`;
}

function formatDateLabel(day) {
  if (!day?.date) return day?.dayLabel || '—';
  // Parse ISO YYYY-MM-DD locally so the day-of-week doesn't drift by a day under
  // negative-offset timezones (new Date('2026-06-06') is UTC midnight).
  const parts = String(day.date).split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!y || !m || !dd) return day?.dayLabel || '—';
  const d = new Date(y, m - 1, dd);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${dow}, ${pad2(dd)} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  content: { padding: rs(10), paddingBottom: rs(20) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: RED },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    padding: rs(10),
    borderWidth: 1,
    borderColor: HAIR,
    shadowColor: INK, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rs(8) },
  cardTitle: { fontSize: 13, fontWeight: '800', color: INK },

  // Mint pill with green text — the same month pill as Employee Details.
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT,
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: 999,
    gap: rs(7),
  },
  monthPillText: { color: GREEN_TEXT, fontSize: 11, fontWeight: '800' },
  monthPillSep: { width: rs(1), height: rs(12), backgroundColor: MINT_LINE },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rs(8) },
  statRingWrap: { alignItems: 'center', flex: 1 },
  statRing: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  statRingValue: { fontSize: 11.5, fontWeight: '800', color: INK },
  statRingLabel: { fontSize: 10, fontWeight: '700', marginTop: rs(4) },

  calendar: { marginTop: rs(2), marginBottom: rs(4) },
  calRowHeader: { flexDirection: 'row', marginBottom: rs(4) },
  calRow: { flexDirection: 'row' },
  calCell: {
    flex: 1,
    height: rs(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  calHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '800',
    color: MUTED,
  },
  calHeaderSunday: { color: RED },
  calCellNum: { fontSize: 12, fontWeight: '700', color: INK },
  calCellSunday: { color: RED },
  calCellToday: { color: '#FFFFFF', fontWeight: '800' },
  calDayWrap: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  calDayToday: { backgroundColor: GREEN },
  calDot: { width: rs(5), height: rs(5), borderRadius: rs(3), marginTop: rs(1) },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(10), marginTop: rs(4) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  legendDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  legendText: { fontSize: 10.5, color: MUTED, fontWeight: '600' },

  dailySection: {
    marginTop: rs(10),
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    padding: rs(10),
    borderWidth: 1,
    borderColor: HAIR,
    shadowColor: INK, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  dailyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rs(8) },
  dailyTitle: { fontSize: 13, fontWeight: '800', color: INK },
  dailyMonthPill: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
  dailyMonthText: { fontSize: 12, fontWeight: '800', color: GREEN_TEXT },
  dailyMonthBtn: {
    backgroundColor: GREEN,
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Day cards: white with a coloured left edge — green for a working day,
  // yellow for leave, grey for a week off — matching the calendar dots.
  dayCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    marginBottom: rs(6),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  dayCardLeave: { backgroundColor: YELLOW_SOFT, borderColor: '#F8D66B' },
  dayCardWeekOff: { backgroundColor: HAIR, borderColor: BORDER },
  dayLeftAccent: { width: rs(3), backgroundColor: GREEN },
  dayLeftAccentLeave: { backgroundColor: YELLOW },
  dayLeftAccentWeekOff: { backgroundColor: GREY },
  dayInner: { flex: 1, paddingHorizontal: rs(10), paddingVertical: rs(8) },
  dayTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayDateRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  dayTopRight: { flexDirection: 'row', gap: rs(6) },
  dayDate: { fontSize: 12, fontWeight: '800', color: INK },
  dayPill: {
    paddingHorizontal: rs(10),
    paddingVertical: rs(3),
    borderRadius: 999,
  },
  dayPillGeneral: { backgroundColor: MINT },
  dayPillPermission: { backgroundColor: YELLOW_SOFT },
  dayPillLeave: { backgroundColor: YELLOW },
  dayPillWeekOff: { backgroundColor: MUTED },
  dayPillText: { fontSize: 10, fontWeight: '700', color: INK },
  dayPillTextOn: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  dayPillTextLeave: { fontSize: 10, fontWeight: '800', color: YELLOW_TEXT },

  dayCols: { flexDirection: 'row', marginTop: rs(6), alignItems: 'center' },
  dayCol: { flex: 1 },
  dayColDivider: { width: rs(1), height: rs(26), backgroundColor: BORDER, marginHorizontal: rs(6) },
  dayColValue: { fontSize: 12, fontWeight: '800', color: GREEN_TEXT },
  dayColValueLate: { color: RED },
  dayColLabel: { fontSize: 10, color: MUTED, marginTop: rs(2) },

  empty: { fontSize: 12, color: MUTED, textAlign: 'center', paddingVertical: rs(16) },
});
