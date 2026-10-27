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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GGFIX brand sheet (2026-10-27) — shared with the other redesigned owner screens.
const TEAL = '#035C6C';
const NAVY = '#1C3053';
const NAVY_TINT = '#E8ECF3';
const BLUE = '#0788C9';
const INFO_TINT = '#E1F1FA';
const INFO_TEXT = '#0571A8';
const GREEN = '#609138';
const GREEN_TINT = '#EDF4E7';
const GREEN_TEXT = '#476B26';
const ORANGE = '#FAA700';
const ORANGE_TINT = '#FFF4DB';
const ORANGE_TEXT = '#B45309';
const RED = '#F32C26';
const RED_TINT = '#FDEBEA';
const RED_TEXT = '#C81E1A';
const INK = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';
const BORDER = '#E5E7EB';
const PAGE_BG = '#F3F4F6';
const CARD = '#FFFFFF';

// Calendar dots + day-card discs. GENERAL is the backend's "checked in" day,
// so it reads as Present (green); Leave orange, Late red, Permission blue,
// Holiday navy, Week off the neutral grey.
const STATUS_COLORS = {
  GENERAL: GREEN,
  PRESENT: GREEN,
  LEAVE: ORANGE,
  LATE: RED,
  ABSENT: RED,
  PERMISSION: BLUE,
  WEEK_OFF: SUBTLE,
  HOLIDAY: NAVY,
};
const STATUS_ICONS = {
  GENERAL: 'checkmark',
  PRESENT: 'checkmark',
  LEAVE: 'airplane',
  LATE: 'time',
  ABSENT: 'close',
  PERMISSION: 'hourglass',
  WEEK_OFF: 'moon',
  HOLIDAY: 'star',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function OwnerEmployeeAttendanceScreen({ route, navigation }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 760) : undefined;
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

  const header = (
    <ScreenHeader
      title="Monthly Summary"
      subtitle={employee?.name}
      onBack={() => navigation.goBack()}
    />
  );

  if (!employee) {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {header}
        <View style={styles.center}>
          <EmptyState icon="person-outline" color={RED} title="Employee not found" />
        </View>
      </View>
    );
  }

  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const present = data?.presentDays ?? 0;
  const late = data?.lateHours ?? '0';
  const permission = data?.permissionCount ?? 0;
  const leaves = data?.leaveDays ?? 0;
  const holidays = data?.holidayCount ?? 0;
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, capStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[TEAL]} tintColor={TEAL} />}
      >
        {/* Month switcher */}
        <View style={[styles.card, styles.monthCard]}>
          <View style={[styles.disc40, { backgroundColor: TEAL }]}>
            <Ionicons name="calendar" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.monthTextWrap}>
            <Text style={styles.monthCaption} numberOfLines={1}>Attendance Overview</Text>
            <Text style={styles.monthValue} numberOfLines={1}>{monthLabel}</Text>
          </View>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => stepMonth(-1)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons name="chevron-back" size={16} color={TEAL} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stepBtn, styles.stepBtnGap]}
            onPress={() => stepMonth(1)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons name="chevron-forward" size={16} color={TEAL} />
          </TouchableOpacity>
        </View>

        {loading && !data ? (
          <View style={[styles.card, styles.loadingCard]}>
            <ActivityIndicator size="large" color={TEAL} />
          </View>
        ) : (
          <>
            {/* Summary tiles */}
            <View style={styles.tileRow}>
              <StatTile value={present} label="Present" icon="checkmark" disc={GREEN} tint={GREEN_TINT} />
              <StatTile value={late} suffix=" Hrs" label="Late" icon="time" disc={RED} tint={RED_TINT} />
              <StatTile value={pad2(permission)} label="Permission" icon="hourglass" disc={BLUE} tint={INFO_TINT} />
              <StatTile value={pad2(leaves)} label="Leaves" icon="airplane" disc={ORANGE} tint={ORANGE_TINT} />
              <StatTile value={pad2(holidays)} label="Holidays" icon="star" disc={NAVY} tint={NAVY_TINT} />
            </View>

            {/* Calendar */}
            <View style={[styles.card, styles.calendarCard]}>
              <View style={styles.calRowHeader}>
                {DOW.map((d, i) => (
                  <Text key={d} style={[styles.calHeaderCell, i === 0 && styles.calHeaderSunday]} numberOfLines={1}>
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
                        <View style={[styles.calDay, isToday && styles.calDayToday]}>
                          <Text
                            style={[
                              styles.calNum,
                              isSunday && styles.calNumSunday,
                              isToday && styles.calNumToday,
                            ]}
                          >
                            {cell.day}
                          </Text>
                        </View>
                        <View style={[styles.calDot, dotColor ? { backgroundColor: dotColor } : null]} />
                      </View>
                    );
                  })}
                </View>
              ))}

              {/* Legend */}
              <View style={styles.legendRow}>
                {[
                  ['Present', STATUS_COLORS.GENERAL],
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
            </View>
          </>
        )}

        {/* Daily list — one card per day with check-in/out + status pill */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle} numberOfLines={1}>Attendance Monthly</Text>
          <View style={[styles.pill, styles.pillInfo, styles.sectionPill]}>
            <Ionicons name="calendar" size={11} color={INFO_TEXT} />
            <Text style={[styles.pillText, { color: INFO_TEXT }]} numberOfLines={1}>{monthLabel}</Text>
          </View>
        </View>

        {(data?.dailyRecords && data.dailyRecords.length > 0) ? (
          data.dailyRecords.map((day) => <DayCard key={day.date} day={day} />)
        ) : (
          <View style={styles.card}>
            <EmptyState
              icon="calendar-outline"
              color={TEAL}
              title="No attendance records for this month."
              sub="Pull down to refresh."
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ScreenHeader({ title, subtitle, onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        activeOpacity={0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ArrowLeft size={18} color={INK} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function EmptyState({ icon, color, title, sub }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyDisc, { backgroundColor: color }]}>
        <Ionicons name={icon} size={26} color="#FFFFFF" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {sub ? <Text style={styles.emptySub}>{sub}</Text> : null}
    </View>
  );
}

function StatTile({ value, suffix, label, icon, disc, tint }) {
  return (
    <View style={[styles.tile, { backgroundColor: tint }]}>
      <View style={[styles.tileDisc, { backgroundColor: disc }]}>
        <Ionicons name={icon} size={14} color="#FFFFFF" />
      </View>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
        {suffix ? <Text style={styles.tileSuffix}>{suffix}</Text> : null}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

function Pill({ label, tone }) {
  const t = PILL_TONES[tone] || PILL_TONES.info;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.text }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const PILL_TONES = {
  green: { bg: GREEN_TINT, text: GREEN_TEXT },
  orange: { bg: ORANGE_TINT, text: ORANGE_TEXT },
  red: { bg: RED_TINT, text: RED_TEXT },
  info: { bg: INFO_TINT, text: INFO_TEXT },
  grey: { bg: PAGE_BG, text: MUTED },
};

function DayTop({ status, dateLabel, children }) {
  const discColor = STATUS_COLORS[status] || TEAL;
  const icon = STATUS_ICONS[status] || 'calendar';
  return (
    <View style={styles.dayTopRow}>
      <View style={[styles.disc36, { backgroundColor: discColor }]}>
        <Ionicons name={icon} size={16} color="#FFFFFF" />
      </View>
      <Text style={styles.dayDate} numberOfLines={1}>{dateLabel}</Text>
      <View style={styles.dayPills}>{children}</View>
    </View>
  );
}

function DayCard({ day }) {
  const status = (day.status || 'GENERAL').toUpperCase();
  const dateLabel = formatDateLabel(day);
  if (status === 'LEAVE') {
    return (
      <View style={[styles.card, styles.dayCard]}>
        <DayTop status={status} dateLabel={dateLabel}>
          <Pill label="Leave" tone="orange" />
        </DayTop>
      </View>
    );
  }
  if (status === 'WEEK_OFF') {
    return (
      <View style={[styles.card, styles.dayCard]}>
        <DayTop status={status} dateLabel={dateLabel}>
          <Pill label="Week Off" tone="grey" />
        </DayTop>
      </View>
    );
  }
  const isLate = status === 'LATE';
  const isPermission = status === 'PERMISSION';
  return (
    <View style={[styles.card, styles.dayCard]}>
      <DayTop status={status} dateLabel={dateLabel}>
        <Pill label="General" tone="green" />
        {isPermission ? <Pill label={day.notes || 'Permission'} tone="info" /> : null}
      </DayTop>
      <View style={styles.dayCols}>
        <View style={styles.dayCol}>
          <Text style={[styles.dayColValue, isLate && styles.dayColValueLate]} numberOfLines={1} adjustsFontSizeToFit>
            {formatTime12(day.checkInTime)}
          </Text>
          <Text style={styles.dayColLabel} numberOfLines={1}>Check In</Text>
        </View>
        <View style={styles.dayColDivider} />
        <View style={styles.dayCol}>
          <Text style={styles.dayColValue} numberOfLines={1} adjustsFontSizeToFit>{formatTime12(day.checkOutTime)}</Text>
          <Text style={styles.dayColLabel} numberOfLines={1}>Check Out</Text>
        </View>
        <View style={styles.dayColDivider} />
        <View style={styles.dayCol}>
          <Text style={[styles.dayColValue, isLate && styles.dayColValueLate]} numberOfLines={1} adjustsFontSizeToFit>
            {day.workingHours && day.workingHours !== '0' ? day.workingHours : '—'}
          </Text>
          <Text style={styles.dayColLabel} numberOfLines={1}>Working Hrs</Text>
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
  content: { padding: 14, paddingBottom: 28 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14 },

  // In-screen header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingBottom: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PAGE_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: INK },
  headerSub: { fontSize: 11, color: MUTED, marginTop: 1 },
  headerSpacer: { width: 36, height: 36 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    shadowColor: '#111111',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  disc40: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  disc36: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Month switcher
  monthCard: { flexDirection: 'row', alignItems: 'center' },
  monthTextWrap: { flex: 1, marginLeft: 10, marginRight: 8 },
  monthCaption: { fontSize: 11, fontWeight: '600', color: MUTED },
  monthValue: { fontSize: 16, fontWeight: '800', color: NAVY, marginTop: 1 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PAGE_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnGap: { marginLeft: 8 },

  loadingCard: { marginTop: 12, paddingVertical: 32, alignItems: 'center' },

  // Summary tiles
  tileRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  tile: { flex: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 7, alignItems: 'flex-start' },
  tileDisc: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 16, fontWeight: '800', color: NAVY, marginTop: 6, alignSelf: 'stretch' },
  tileSuffix: { fontSize: 11, fontWeight: '700', color: NAVY },
  tileLabel: { fontSize: 10, fontWeight: '600', color: MUTED, marginTop: 1, alignSelf: 'stretch' },

  // Calendar
  calendarCard: { marginTop: 12 },
  calRowHeader: { flexDirection: 'row', marginBottom: 4 },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  calHeaderCell: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: MUTED },
  calHeaderSunday: { color: RED },
  calDay: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  calDayToday: { borderColor: TEAL },
  calNum: { fontSize: 12.5, fontWeight: '700', color: INK },
  calNumSunday: { color: RED },
  calNumToday: { color: TEAL, fontWeight: '800' },
  calDot: { width: 5, height: 5, borderRadius: 3, marginTop: 1, backgroundColor: 'transparent' },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 6,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: PAGE_BG,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10.5, color: MUTED, fontWeight: '600' },

  // Section
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: NAVY, flexShrink: 1, marginRight: 8 },
  sectionPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Pills
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, flexShrink: 1 },
  pillInfo: { backgroundColor: INFO_TINT },
  pillText: { fontSize: 10.5, fontWeight: '800' },

  // Day cards
  dayCard: { marginBottom: 8 },
  dayTopRow: { flexDirection: 'row', alignItems: 'center' },
  dayDate: { flex: 1, fontSize: 13, fontWeight: '800', color: NAVY, marginLeft: 10 },
  dayPills: { flexDirection: 'row', gap: 6, flexShrink: 1, maxWidth: '55%', marginLeft: 8, justifyContent: 'flex-end' },
  dayCols: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dayCol: { flex: 1 },
  dayColDivider: { width: 1, height: 26, backgroundColor: BORDER, marginHorizontal: 8 },
  dayColValue: { fontSize: 13, fontWeight: '800', color: NAVY },
  dayColValueLate: { color: RED_TEXT },
  dayColLabel: { fontSize: 10, color: MUTED, marginTop: 2, fontWeight: '600' },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 14 },
  emptyDisc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginTop: 10, textAlign: 'center' },
  emptySub: { fontSize: 12, color: MUTED, marginTop: 3, textAlign: 'center' },
});
