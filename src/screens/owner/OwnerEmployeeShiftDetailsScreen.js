import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';
import { useResponsive } from '../../theme/responsive';
import { rf, rlh, rs } from '../../utils/responsive';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Schedule window: 9 AM through 10 PM (matches the mockup's 09:00 - 10:00 next-day range).
const SCHEDULE_HOURS = Array.from({ length: 14 }, (_, i) => 9 + i);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function hourLabel(h24) {
  const h12 = ((h24 - 1) % 12) + 1;
  return `${pad2(h12)}:00`;
}

// Parse a server time string ("HH:mm" / "HH:mm:ss") into { hour, minute, label }.
function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const [hh, mm] = t.split(':');
  const hour = Number(hh);
  const minute = Number(mm || 0);
  if (Number.isNaN(hour)) return null;
  const h12 = ((hour - 1 + 12) % 12) + 1;
  return { hour, minute, label: `${pad2(h12)}:${pad2(minute)}` };
}

function isoDate(d) {
  // Local calendar date (YYYY-MM-DD). toISOString() is UTC, which for IST
  // between 00:00–05:30 reports the previous day — so "today" resolved to
  // yesterday and the wrong day was highlighted and fetched.
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function OwnerEmployeeShiftDetailsScreen({ route, navigation }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const employee = route.params?.employee;
  const todayIso = isoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewAsList, setViewAsList] = useState(false);

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

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.error}>Employee not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header row: big date + Today button */}
      <View style={[styles.headerRow, capStyle]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerDate}>{selected.getDate()}</Text>
          <View>
            <Text style={styles.headerDayLong}>{dayLong}</Text>
            <Text style={styles.headerMonth}>{monthYear}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={() => setSelectedDate(todayIso)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar-outline" size={rs(15)} color="#09AD2A" />
          <Text style={styles.todayBtnText}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Week strip */}
      <View style={[styles.weekStrip, capStyle]}>
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
              >
                {DAYS_SHORT[dt.getDay()]}
              </Text>
              <Text
                style={[
                  styles.weekDayNum,
                  isSunday && !isSelected && styles.weekDayTextSunday,
                  isSelected && styles.weekDayTextSelected,
                ]}
              >
                {pad2(dt.getDate())}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Schedule timeline */}
      <ScrollView contentContainerStyle={[styles.scheduleContent, capStyle]}>
        <View style={styles.scheduleHeaderRow}>
          <Text style={styles.scheduleTitle}>Schedule</Text>
          <TouchableOpacity
            style={styles.viewListBtn}
            onPress={() => setViewAsList((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons name="list" size={rs(16)} color="#09AD2A" />
            <Text style={styles.viewListBtnText}>{viewAsList ? 'View as timeline' : 'View as list'}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#09AD2A" style={{ marginVertical: rs(24) }} />
        ) : viewAsList ? (
          <View style={styles.listWrap}>
            {checkIn ? (
              <View style={styles.listRow}>
                <View style={[styles.listDot, { backgroundColor: '#09AD2A' }]} />
                <Text style={styles.listRowLabel}>Check-In Time</Text>
                <Text style={styles.listRowValue}>{checkIn.label}</Text>
              </View>
            ) : null}
            {checkOut ? (
              <View style={styles.listRow}>
                <View style={[styles.listDot, { backgroundColor: '#F84141' }]} />
                <Text style={styles.listRowLabel}>Check-Out Time</Text>
                <Text style={[styles.listRowValue, { color: '#F84141' }]}>{checkOut.label}</Text>
              </View>
            ) : null}
            {!checkIn && !checkOut ? (
              <Text style={styles.empty}>No attendance recorded for this day.</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.timeline}>
            {SCHEDULE_HOURS.map((h) => {
              const isCheckIn = checkIn && checkIn.hour === h;
              const isCheckOut = checkOut && checkOut.hour === h;
              return (
                <View key={h} style={styles.hourRow}>
                  <View style={styles.hourPill}>
                    <Text style={styles.hourPillText}>{hourLabel(h)}</Text>
                  </View>
                  <View style={styles.connectorCol}>
                    <View style={styles.connectorLine} />
                    <View style={styles.connectorDot} />
                  </View>
                  <View style={styles.hourLineWrap}>
                    <View style={styles.hourLine} />
                    {isCheckIn && (
                      <View style={[styles.eventChip, styles.eventChipCheckIn]}>
                        <Text style={styles.eventChipText}>Check-In Time</Text>
                        <Text style={styles.eventChipTime}>({checkIn.label})</Text>
                      </View>
                    )}
                    {isCheckOut && (
                      <View style={[styles.eventChip, styles.eventChipCheckOut]}>
                        <Text style={[styles.eventChipText, styles.eventChipTextOut]}>Check-Out Time</Text>
                        <Text style={[styles.eventChipTime, styles.eventChipTextOut]}>({checkOut.label})</Text>
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
            <Text style={styles.statusNoteText}>
              {dayData.status}
              {dayData.notes ? ` — ${dayData.notes}` : ''}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 13, color: '#F84141' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(12),
    paddingTop: rs(8),
    paddingBottom: rs(4),
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  headerDate: { fontSize: 20, fontWeight: '800', color: '#078F23', lineHeight: rlh(26) },
  headerDayLong: { fontSize: 13, fontWeight: '700', color: '#1E1E1E' },
  headerMonth: { fontSize: 11, color: '#6B6B6B', marginTop: rs(1) },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#09AD2A',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: rs(9),
  },
  todayBtnText: { color: '#078F23', fontSize: 11, fontWeight: '700' },

  weekStrip: {
    flexDirection: 'row',
    paddingHorizontal: rs(10),
    paddingVertical: rs(4),
    gap: rs(4),
  },
  weekDay: {
    flex: 1,
    paddingVertical: rs(6),
    alignItems: 'center',
    borderRadius: rs(9),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F3F3',
  },
  weekDaySelected: { backgroundColor: '#09AD2A', borderColor: '#09AD2A' },
  weekDaySunday: { backgroundColor: '#FEECEC', borderColor: '#FBD0D0' },
  weekDayName: { fontSize: 10, color: '#6B6B6B', fontWeight: '600' },
  weekDayNum: { fontSize: 12.5, fontWeight: '800', color: '#1E1E1E', marginTop: rs(2) },
  weekDayTextSelected: { color: '#FFFFFF' },
  weekDayTextSunday: { color: '#F84141' },

  scheduleContent: { paddingHorizontal: rs(12), paddingTop: rs(6), paddingBottom: rs(20) },
  scheduleHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(6) },
  scheduleTitle: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  viewListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#09AD2A',
    paddingHorizontal: rs(9),
    paddingVertical: rs(5),
    borderRadius: rs(9),
  },
  viewListBtnText: { color: '#078F23', fontSize: 11, fontWeight: '700' },

  timeline: {
    backgroundColor: 'transparent',
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: rs(36),
  },
  hourPill: {
    width: rs(54),
    paddingVertical: rs(4),
    borderRadius: 999,
    backgroundColor: '#EAF8EC',
    borderWidth: 1,
    borderColor: '#CDEFD4',
    alignItems: 'center',
    marginRight: rs(4),
  },
  hourPillText: { fontSize: 10.5, fontWeight: '700', color: '#078F23' },
  connectorCol: { width: rs(22), alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  connectorLine: { position: 'absolute', top: 0, bottom: 0, left: rs(10), borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: '#CDEFD4' },
  connectorDot: { width: rs(9), height: rs(9), borderRadius: rs(5), backgroundColor: '#09AD2A', zIndex: 1 },
  hourLineWrap: {
    flex: 1,
    justifyContent: 'center',
    minHeight: rs(30),
    marginLeft: rs(4),
  },
  hourLine: {
    height: rs(1),
    borderStyle: 'dashed',
    borderWidth: 0.5,
    borderColor: '#CDEFD4',
  },

  eventChip: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rs(9),
    paddingVertical: rs(5),
    borderRadius: rs(6),
  },
  eventChipCheckIn: { backgroundColor: '#EAF8EC' },
  eventChipCheckOut: { backgroundColor: '#FEECEC' },
  eventChipTextOut: { color: '#F84141' },
  eventChipText: { fontSize: 11, fontWeight: '700', color: '#078F23' },
  eventChipTime: { fontSize: 10.5, fontWeight: '600', color: '#078F23' },

  empty: {
    fontSize: 12,
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: rs(16),
  },

  listWrap: { marginTop: rs(2) },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
    paddingVertical: rs(9),
    marginBottom: rs(6),
    borderWidth: 1,
    borderColor: '#F3F3F3',
  },
  listDot: { width: rs(10), height: rs(10), borderRadius: rs(5), marginRight: rs(12) },
  listRowLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: '#1E1E1E' },
  listRowValue: { fontSize: 12, fontWeight: '800', color: '#078F23' },

  statusNote: {
    marginTop: rs(10),
    backgroundColor: '#FFF8E1',
    borderRadius: rs(8),
    padding: rs(8),
  },
  statusNoteText: { fontSize: 12, fontWeight: '600', color: '#8A6A00' },
});
