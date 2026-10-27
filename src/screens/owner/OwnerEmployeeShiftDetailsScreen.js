import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeft } from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { useResponsive } from '../../theme/responsive';
import { rs } from '../../utils/responsive';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Brand palette (shared redesign spec).
const C = {
  teal: '#035C6C',
  navy: '#1C3053',
  blue: '#0788C9',
  green: '#609138',
  greenTint: '#EDF4E7',
  greenText: '#476B26',
  orange: '#FAA700',
  orangeTint: '#FFF4DB',
  orangeText: '#B45309',
  red: '#F32C26',
  redTint: '#FDEBEA',
  redText: '#C81E1A',
  ink: '#111111',
  muted: '#6B7280',
  subtle: '#9CA3AF',
  border: '#E5E7EB',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  white: '#FFFFFF',
};

// Full day, scrollable; the view auto-scrolls to the check-in (or current) hour.
const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, i) => i);

function pad2(n) {
  return String(n).padStart(2, '0');
}

const ampm = (h24) => (h24 < 12 ? 'AM' : 'PM');

function hourLabel(h24) {
  const h12 = ((h24 + 11) % 12) + 1;
  return `${pad2(h12)}:00 ${ampm(h24)}`;
}

// Parse a server time string ("HH:mm" / "HH:mm:ss") into { hour, minute, label }.
function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const [hh, mm] = t.split(':');
  const hour = Number(hh);
  const minute = Number(mm || 0);
  if (Number.isNaN(hour)) return null;
  const h12 = ((hour - 1 + 12) % 12) + 1;
  return { hour, minute, label: `${pad2(h12)}:${pad2(minute)} ${ampm(hour)}` };
}

function isoDate(d) {
  // Local calendar date (YYYY-MM-DD). toISOString() is UTC, which for IST
  // between 00:00–05:30 reports the previous day — so "today" resolved to
  // yesterday and the wrong day was highlighted and fetched.
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** In-screen header: back button, centred title + subtitle, right spacer. */
function ScreenHeader({ title, subtitle, onBack, topInset, capStyle }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 6 }]}>
      <View style={[styles.headerInner, capStyle]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color={C.ink} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>
    </View>
  );
}

export default function OwnerEmployeeShiftDetailsScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 760) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const employee = route.params?.employee;
  const todayIso = isoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewAsList, setViewAsList] = useState(false);
  const scrollRef = useRef(null);
  const rowY = useRef({});

  const loadDay = useCallback(async (dateStr) => {
    if (!employee?.id) return;
    setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${employee.id}/attendance/day`, {
        query: { date: dateStr },
      });
      setDayData(res);
    } catch {
      setDayData(null);
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  React.useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  const selected = new Date(selectedDate);
  const dayLong = DAYS_LONG[selected.getDay()];
  const monthYear = selected.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Week strip starts Monday → Sunday (matches the mockup's Mon-Sun order).
  const mondayStart = new Date(selected);
  const dow = selected.getDay(); // 0 = Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  mondayStart.setDate(selected.getDate() + mondayOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mondayStart);
    x.setDate(mondayStart.getDate() + i);
    return x;
  });

  const checkIn = parseTime(dayData?.checkInTime);
  const checkOut = parseTime(dayData?.checkOutTime);

  const focusHour = checkIn?.hour ?? (selectedDate === todayIso ? new Date().getHours() : 9);
  useEffect(() => {
    if (loading || viewAsList) return undefined;
    const t = setTimeout(() => {
      const y = rowY.current[Math.max(0, focusHour - 1)];
      if (y != null) scrollRef.current?.scrollTo({ y: y + (rowY.current.top || 0), animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [loading, viewAsList, focusHour, selectedDate]);

  const shiftWeek = (delta) => {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta * 7);
    setSelectedDate(isoDate(d));
  };

  const header = (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScreenHeader
        title="Daily Shift Schedule"
        subtitle={employee?.name}
        onBack={() => navigation.goBack()}
        topInset={insets.top}
        capStyle={capStyle}
      />
    </>
  );

  if (!employee) {
    return (
      <View style={styles.safe}>
        {header}
        <View style={styles.center}>
          <View style={[styles.emptyDisc, { backgroundColor: C.red }]}>
            <Ionicons name="alert-circle-outline" size={28} color={C.white} />
          </View>
          <Text style={styles.emptyTitle}>Employee not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      {header}

      {/* Date card: big date + week navigation + week strip */}
      <View style={[styles.topWrap, capStyle]}>
        <View style={styles.card}>
          <View style={styles.dateRow}>
            <View style={styles.dateLeft}>
              <View style={styles.dateDisc}>
                <Text style={styles.dateDiscNum} numberOfLines={1}>{selected.getDate()}</Text>
              </View>
              <View style={styles.flexShrink}>
                <Text style={styles.dayLong} numberOfLines={1}>{dayLong}</Text>
                <Text style={styles.monthText} numberOfLines={1}>{monthYear}</Text>
              </View>
            </View>
            <View style={styles.dateRight}>
              <TouchableOpacity style={styles.navBtn} onPress={() => shiftWeek(-1)} hitSlop={8} accessibilityLabel="Previous week">
                <Ionicons name="chevron-back" size={16} color={C.teal} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.todayBtn}
                onPress={() => setSelectedDate(todayIso)}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={14} color={C.white} />
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={() => shiftWeek(1)} hitSlop={8} accessibilityLabel="Next week">
                <Ionicons name="chevron-forward" size={16} color={C.teal} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Week strip */}
          <View style={styles.weekStrip}>
            {weekDays.map((dt) => {
              const dateStr = isoDate(dt);
              const isSelected = dateStr === selectedDate;
              const isSunday = dt.getDay() === 0;
              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.weekDay,
                    isSunday && !isSelected && styles.weekDaySunday,
                    isSelected && styles.weekDaySelected,
                  ]}
                  onPress={() => setSelectedDate(dateStr)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.weekDayName,
                      isSunday && !isSelected && styles.weekDayTextSunday,
                      isSelected && styles.weekDayTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {DAYS_SHORT[dt.getDay()]}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayNum,
                      isSunday && !isSelected && styles.weekDayTextSunday,
                      isSelected && styles.weekDayTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {pad2(dt.getDate())}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Schedule timeline */}
      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={[styles.scheduleContent, capStyle]}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle} numberOfLines={1}>Schedule</Text>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setViewAsList((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons name={viewAsList ? 'time-outline' : 'list'} size={14} color={C.teal} />
            <Text style={styles.toggleBtnText} numberOfLines={1}>{viewAsList ? 'View as timeline' : 'View as list'}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={C.teal} style={{ marginVertical: rs(24) }} />
        ) : viewAsList ? (
          <View style={styles.card}>
            {checkIn ? (
              <View style={styles.listRow}>
                <View style={[styles.disc, { backgroundColor: C.green }]}>
                  <Ionicons name="log-in-outline" size={18} color={C.white} />
                </View>
                <Text style={styles.listRowLabel} numberOfLines={1}>Check-In Time</Text>
                <Text style={[styles.listRowValue, { color: C.greenText }]} numberOfLines={1}>{checkIn.label}</Text>
              </View>
            ) : null}
            {checkOut ? (
              <View style={[styles.listRow, checkIn && styles.listRowDivider]}>
                <View style={[styles.disc, { backgroundColor: C.red }]}>
                  <Ionicons name="log-out-outline" size={18} color={C.white} />
                </View>
                <Text style={styles.listRowLabel} numberOfLines={1}>Check-Out Time</Text>
                <Text style={[styles.listRowValue, { color: C.redText }]} numberOfLines={1}>{checkOut.label}</Text>
              </View>
            ) : null}
            {!checkIn && !checkOut ? (
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyDisc, { backgroundColor: C.teal }]}>
                  <Ionicons name="calendar-outline" size={26} color={C.white} />
                </View>
                <Text style={styles.emptyTitle}>No attendance recorded for this day.</Text>
                <Text style={styles.emptySub}>Pick another day from the week above.</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.timeline} onLayout={(e) => { rowY.current.top = e.nativeEvent.layout.y; }}>
            {SCHEDULE_HOURS.map((h) => {
              const isCheckIn = checkIn && checkIn.hour === h;
              const isCheckOut = checkOut && checkOut.hour === h;
              const hasEvent = isCheckIn || isCheckOut;
              return (
                <View key={h} style={styles.hourRow} onLayout={(e) => { rowY.current[h] = e.nativeEvent.layout.y; }}>
                  <View style={[styles.hourPill, hasEvent && styles.hourPillActive]}>
                    <Text
                      style={[styles.hourPillText, hasEvent && styles.hourPillTextActive]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {hourLabel(h)}
                    </Text>
                  </View>
                  <View style={styles.connectorCol}>
                    <View style={styles.connectorLine} />
                    <View
                      style={[
                        styles.connectorDot,
                        isCheckIn && styles.connectorDotIn,
                        isCheckOut && !isCheckIn && styles.connectorDotOut,
                      ]}
                    />
                  </View>
                  <View style={styles.hourLineWrap}>
                    <View style={styles.hourLine} />
                    {isCheckIn && (
                      <View style={[styles.eventChip, styles.eventChipCheckIn]}>
                        <View style={[styles.eventDisc, { backgroundColor: C.green }]}>
                          <Ionicons name="log-in-outline" size={14} color={C.white} />
                        </View>
                        <Text style={[styles.eventChipText, styles.eventChipTextIn]} numberOfLines={1}>Check-In Time</Text>
                        <Text style={[styles.eventChipTime, styles.eventChipTextIn]} numberOfLines={1}>({checkIn.label})</Text>
                      </View>
                    )}
                    {isCheckOut && (
                      <View style={[styles.eventChip, styles.eventChipCheckOut]}>
                        <View style={[styles.eventDisc, { backgroundColor: C.red }]}>
                          <Ionicons name="log-out-outline" size={14} color={C.white} />
                        </View>
                        <Text style={[styles.eventChipText, styles.eventChipTextOut]} numberOfLines={1}>Check-Out Time</Text>
                        <Text style={[styles.eventChipTime, styles.eventChipTextOut]} numberOfLines={1}>({checkOut.label})</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Notes / status badge if backend has it */}
        {dayData?.status && dayData.status !== 'GENERAL' && (
          <View style={styles.statusNote}>
            <View style={[styles.eventDisc, { backgroundColor: C.orange }]}>
              <Ionicons name="information" size={14} color={C.white} />
            </View>
            <Text style={styles.statusNoteText}>
              {dayData.status}
              {dayData.notes ? ` — ${dayData.notes}` : ''}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
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
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },

  // In-screen header
  header: {
    backgroundColor: C.white,
    paddingBottom: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerInner: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.ink },
  headerSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  headerSpacer: { width: 36, height: 36 },

  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    ...CARD_SHADOW,
  },

  // Date card
  topWrap: { paddingHorizontal: 14, paddingTop: 14 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10), flexShrink: 1 },
  dateDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDiscNum: { fontSize: 18, fontWeight: '800', color: C.white },
  dayLong: { fontSize: 14, fontWeight: '800', color: C.navy },
  monthText: { fontSize: 11, color: C.muted, marginTop: 1 },
  dateRight: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginLeft: rs(8) },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: C.teal,
    paddingHorizontal: rs(11),
    height: 32,
    borderRadius: 999,
  },
  todayBtnText: { color: C.white, fontSize: 11.5, fontWeight: '800' },

  weekStrip: {
    flexDirection: 'row',
    marginTop: 12,
    gap: rs(4),
  },
  weekDay: {
    flex: 1,
    paddingVertical: rs(7),
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  weekDaySelected: { backgroundColor: C.teal, borderColor: C.teal },
  weekDaySunday: { backgroundColor: C.redTint, borderColor: C.redTint },
  weekDayName: { fontSize: 10, color: C.muted, fontWeight: '600' },
  weekDayNum: { fontSize: 13, fontWeight: '800', color: C.navy, marginTop: rs(2) },
  weekDayTextSelected: { color: C.white },
  weekDayTextSunday: { color: C.redText },

  // Schedule
  scheduleContent: { paddingHorizontal: 14, paddingBottom: rs(24) },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C.navy, flexShrink: 1, marginRight: 8 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.teal,
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: 999,
  },
  toggleBtnText: { color: C.teal, fontSize: 11, fontWeight: '800' },

  timeline: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...CARD_SHADOW,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: rs(38),
  },
  hourPill: {
    width: rs(70),
    paddingVertical: rs(4),
    borderRadius: 999,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    marginRight: rs(4),
  },
  hourPillActive: { backgroundColor: C.teal, borderColor: C.teal },
  hourPillText: { fontSize: 10.5, fontWeight: '700', color: C.navy },
  hourPillTextActive: { color: C.white },
  connectorCol: { width: rs(22), alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  connectorLine: { position: 'absolute', top: 0, bottom: 0, left: rs(10), borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: C.border },
  connectorDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: C.subtle, zIndex: 1 },
  connectorDotIn: { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: C.green },
  connectorDotOut: { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: C.red },
  hourLineWrap: {
    flex: 1,
    justifyContent: 'center',
    minHeight: rs(30),
    marginLeft: rs(4),
    paddingVertical: rs(3),
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: rs(1),
    borderStyle: 'dashed',
    borderWidth: 0.5,
    borderColor: C.border,
  },

  eventChip: {
    marginVertical: rs(2),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(7),
    paddingHorizontal: rs(8),
    paddingVertical: rs(5),
    borderRadius: 12,
  },
  eventChipCheckIn: { backgroundColor: C.greenTint },
  eventChipCheckOut: { backgroundColor: C.redTint },
  eventDisc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventChipText: { flex: 1, flexShrink: 1, fontSize: 11.5, fontWeight: '800' },
  eventChipTime: { fontSize: 10.5, fontWeight: '700' },
  eventChipTextIn: { color: C.greenText },
  eventChipTextOut: { color: C.redText },

  // List view
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(6),
  },
  listRowDivider: { borderTopWidth: 1, borderTopColor: C.border, marginTop: rs(6), paddingTop: rs(12) },
  disc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rs(12),
  },
  listRowLabel: { flex: 1, flexShrink: 1, fontSize: 13, fontWeight: '700', color: C.navy, marginRight: 8 },
  listRowValue: { fontSize: 13, fontWeight: '800' },

  // Empty states
  emptyWrap: { alignItems: 'center', paddingVertical: rs(18), paddingHorizontal: 12 },
  emptyDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#374151', textAlign: 'center' },
  emptySub: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 4 },

  statusNote: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    backgroundColor: C.orangeTint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statusNoteText: { flex: 1, flexShrink: 1, fontSize: 12, fontWeight: '700', color: C.orangeText },
});
