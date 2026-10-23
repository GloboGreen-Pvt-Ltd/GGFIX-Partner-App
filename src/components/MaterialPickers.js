import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';

/**
 * Material Design 3-style date and time pickers (the Google calendar / clock
 * dialogs), drawn in JS in the GGFIX green so they look the same on Android,
 * iOS and tablets — no native picker module in this build.
 *
 * Both are controlled: the caller owns the values, validation and OK.
 * Render them inside a ResponsiveModal (bottom sheet on phones, dialog on tablets).
 */

const ACCENT = '#035C6C';
const ACCENT_TEXT = '#035C6C';
const ACCENT_CONTAINER = '#C7E6EA'; // selected hour / minute box, AM-PM
const INK = '#111111';
const MUTED = '#5F6368';
const LINE = '#DADCE0';
const DIAL_BG = '#EEF1EE';
const FIELD_BG = '#F1F3F1';
const DISABLED = '#C4C9C4';
const ERROR = '#D93025';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Weeks (Sun-first) covering the month; days of other months are null. */
function monthGrid(month) {
  const first = startOfMonth(month);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Text Cancel / OK, right-aligned — the Material dialog action row. */
function DialogActions({ onCancel, onOk, okDisabled }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
      <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={4} style={{ height: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: ACCENT_TEXT, letterSpacing: 0.1 }}>Cancel</Text>
      </Pressable>
      <Pressable
        onPress={onOk}
        disabled={okDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!okDisabled }}
        hitSlop={4}
        style={{ height: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 20, marginLeft: 4 }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: okDisabled ? DISABLED : ACCENT_TEXT, letterSpacing: 0.1 }}>OK</Text>
      </Pressable>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Date picker
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param {Date}     day          selected day
 * @param {Function} onDayChange  (Date) => void
 * @param {Date}     minDay       earliest selectable day (earlier ones are greyed)
 * @param {string}   [error]      shown under the calendar; also disables OK
 */
export function MaterialDatePicker({ title = 'Select date', day, onDayChange, minDay, error, onCancel, onOk }) {
  const { width, height } = useWindowDimensions();
  const [month, setMonth] = useState(() => startOfMonth(day || new Date()));
  const [monthList, setMonthList] = useState(false);
  const today = useMemo(() => new Date(), []);
  const min0 = minDay ? startOfDay(minDay) : null;
  const canPrev = !min0 || startOfMonth(month) > startOfMonth(min0);
  // Day cells fit the width AND a share of the height, so a short screen or a
  // large font never pushes Cancel / OK below the sheet (behind the nav bar).
  const cell = Math.max(32, Math.min(44, Math.floor((Math.min(width, 440) - 56) / 7), Math.floor((height * 0.42) / 7)));

  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.5 }}>{title}</Text>
      <Text style={{ fontSize: 30, fontWeight: '400', color: INK, marginTop: 10 }} numberOfLines={1}>
        {day ? `${WEEKDAYS_SHORT[day.getDay()]}, ${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}` : 'Select date'}
      </Text>
      <View style={{ height: 1, backgroundColor: LINE, marginTop: 14, marginHorizontal: -4 }} />

      {/* Month · year (tap for the month list) and ‹ › */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Pressable
          onPress={() => setMonthList((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Choose month"
          style={{ flexDirection: 'row', alignItems: 'center', height: 40, paddingRight: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: MUTED }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
          <MaterialIcons name={monthList ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color={MUTED} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {!monthList ? (
          <>
            <Pressable
              onPress={() => setMonth((m) => addMonths(m, -1))}
              disabled={!canPrev}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={{ height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: canPrev ? 1 : 0.3 }}
            >
              <MaterialIcons name="chevron-left" size={24} color={MUTED} />
            </Pressable>
            <Pressable
              onPress={() => setMonth((m) => addMonths(m, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={{ height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
            >
              <MaterialIcons name="chevron-right" size={24} color={MUTED} />
            </Pressable>
          </>
        ) : null}
      </View>

      {/* Only this part scrolls if space runs out — header + actions stay put. */}
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} bounces={false}>
      {monthList ? (
        // Month list: this year and next, past months greyed.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
          {Array.from({ length: 24 }, (_, i) => addMonths(startOfMonth(min0 || today), i)).map((m) => {
            const on = m.getFullYear() === month.getFullYear() && m.getMonth() === month.getMonth();
            return (
              <View key={m.toISOString()} style={{ width: '33.2%', padding: 4 }}>
                <Pressable
                  onPress={() => { setMonth(m); setMonthList(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? ACCENT : 'transparent' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? '#FFFFFF' : INK }}>
                    {MONTHS_SHORT[m.getMonth()]} {m.getFullYear()}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            {WEEK_LETTERS.map((w, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '500', color: INK, lineHeight: cell }}>{w}</Text>
            ))}
          </View>
          {monthGrid(month).map((week, wi) => (
            <View key={wi} style={{ flexDirection: 'row' }}>
              {week.map((d, di) => {
                if (!d) return <View key={di} style={{ flex: 1, height: cell }} />;
                const past = min0 && d < min0;
                const sel = sameDay(d, day);
                const isToday = sameDay(d, today);
                return (
                  <Pressable
                    key={di}
                    onPress={() => onDayChange(startOfDay(d))}
                    disabled={past}
                    accessibilityRole="button"
                    accessibilityLabel={`${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`}
                    accessibilityState={{ selected: sel, disabled: !!past }}
                    style={{ flex: 1, height: cell, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View
                      style={{
                        height: cell - 4, width: cell - 4, borderRadius: (cell - 4) / 2, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: sel ? ACCENT : 'transparent', borderWidth: isToday && !sel ? 1 : 0, borderColor: ACCENT,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '400', color: sel ? '#FFFFFF' : past ? DISABLED : isToday ? ACCENT_TEXT : INK }}>
                        {d.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}
      </ScrollView>

      {error ? <Text style={{ fontSize: 12, color: ERROR, marginTop: 8 }}>{error}</Text> : null}
      <DialogActions onCancel={onCancel} onOk={onOk} okDisabled={!!error || !day} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Time picker — clock dial
// ════════════════════════════════════════════════════════════════════════════
/**
 * Tap or drag on the dial. Picking an hour moves on to minutes, as Material
 * does; the HH / MM boxes switch between the two.
 *
 * @param {number} hour12   1–12
 * @param {number} minute   0–59
 * @param {'AM'|'PM'} meridiem
 */
export function MaterialTimePicker({ title = 'Select time', hour12, minute, meridiem, onHour, onMinute, onMeridiem, error, onCancel, onOk }) {
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState('hour');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const avail = Math.min(width, 440) - 48;
  // Dial fits the width and ~1/3 of the height, so Cancel / OK stay on screen.
  const D = Math.max(168, Math.min(256, avail - 8, Math.floor(height * 0.34))); // dial diameter
  const R = D / 2;
  const KNOB = Math.round(D * 0.094);                         // selected-number circle radius
  const NUM_R = R - KNOB - 6;                                 // where the numbers sit
  const box = Math.max(72, Math.min(96, Math.floor((avail - 76) / 2)));

  // Value → angle (12 / :00 at the top, clockwise).
  const angleDeg = mode === 'hour' ? ((hour12 % 12) * 30) : (minute * 6);
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const hx = R + NUM_R * Math.cos(rad);
  const hy = R + NUM_R * Math.sin(rad);

  const pick = (x, y, final) => {
    const a = (Math.atan2(y - R, x - R) * 180) / Math.PI + 90;
    const deg = (a + 360) % 360;
    if (modeRef.current === 'hour') {
      const h = Math.round(deg / 30) % 12;
      onHour(h === 0 ? 12 : h);
      if (final) setMode('minute');
    } else {
      onMinute(Math.round(deg / 6) % 60);
    }
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY, false),
    onPanResponderMove: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY, false),
    onPanResponderRelease: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY, true),
    onPanResponderTerminationRequest: () => false,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [R, onHour, onMinute]);

  const labels = mode === 'hour'
    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((v, i) => ({ v, text: String(v), i }))
    : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((v, i) => ({ v, text: String(v).padStart(2, '0'), i }));
  const selectedLabel = mode === 'hour' ? hour12 : (minute % 5 === 0 ? minute : null);

  const Segment = ({ which, text }) => {
    const on = mode === which;
    return (
      <Pressable
        onPress={() => setMode(which)}
        accessibilityRole="button"
        accessibilityLabel={which === 'hour' ? 'Hour' : 'Minute'}
        accessibilityState={{ selected: on }}
        style={{ width: box, height: Math.round(box * 0.83), borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? ACCENT_CONTAINER : FIELD_BG }}
      >
        <Text style={{ fontSize: Math.round(box * 0.56), fontWeight: '400', color: on ? ACCENT_TEXT : INK, includeFontPadding: false }}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.5 }}>{title}</Text>

      {/* HH : MM  AM/PM */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
        <Segment which="hour" text={String(hour12).padStart(2, '0')} />
        <Text style={{ fontSize: Math.round(box * 0.56), color: INK, marginHorizontal: 4, includeFontPadding: false }}>:</Text>
        <Segment which="minute" text={String(minute).padStart(2, '0')} />
        <View style={{ marginLeft: 12, width: 52, height: Math.round(box * 0.83), borderRadius: 8, borderWidth: 1, borderColor: '#9CA3AF', overflow: 'hidden' }}>
          {['AM', 'PM'].map((m, i) => (
            <Pressable
              key={m}
              onPress={() => onMeridiem(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: meridiem === m }}
              style={{
                flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: meridiem === m ? ACCENT_CONTAINER : 'transparent',
                borderTopWidth: i === 1 ? 1 : 0, borderTopColor: '#9CA3AF',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: meridiem === m ? ACCENT_TEXT : MUTED }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Dial */}
      <View style={{ alignItems: 'center', marginTop: 20 }}>
        <View style={{ width: D, height: D }} {...responder.panHandlers}>
          <Svg width={D} height={D} pointerEvents="none">
            <Circle cx={R} cy={R} r={R} fill={DIAL_BG} />
            <Line x1={R} y1={R} x2={hx} y2={hy} stroke={ACCENT} strokeWidth={2} />
            <Circle cx={R} cy={R} r={4} fill={ACCENT} />
            <Circle cx={hx} cy={hy} r={KNOB} fill={ACCENT} />
          </Svg>
          {labels.map(({ v, text, i }) => {
            const a = ((i * 30 - 90) * Math.PI) / 180;
            const x = R + NUM_R * Math.cos(a);
            const y = R + NUM_R * Math.sin(a);
            const on = selectedLabel === v;
            return (
              <View
                key={text}
                pointerEvents="none"
                style={{ position: 'absolute', left: x - 18, top: y - 12, width: 36, height: 24, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: on ? '700' : '400', color: on ? '#FFFFFF' : INK }}>{text}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {error ? <Text style={{ fontSize: 12, color: ERROR, marginTop: 10, textAlign: 'center' }}>{error}</Text> : null}
      <DialogActions onCancel={onCancel} onOk={onOk} okDisabled={!!error} />
    </View>
  );
}
