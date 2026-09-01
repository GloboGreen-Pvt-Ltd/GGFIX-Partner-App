import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { rs } from '../../theme/metrics';
import { C, S, SIZE, T } from './ledgerUi';

/* ── date sheet ───────────────────────────────────────────────────────────
   A hand-rolled month grid rather than @react-native-community/datetimepicker:
   that is a native module, and adding one would mean a new APK before the owner
   could book yesterday's payment. Future days are disabled because money cannot
   have moved in an account before it moved — the server rejects a future entry
   date, and a statement cannot report days that have not happened.

   Lives here rather than inside the entry screen because the statement's
   Date Range filter needs exactly the same grid; a second copy would be two
   calendars to keep in step.
   ── */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * @param {boolean}  visible
 * @param {Date}     value     currently selected day
 * @param {string}   tint      accent for the selected pill and Today button
 * @param {Function} onClose
 * @param {Function} onPick    called with the chosen Date
 * @param {Date}     [minDate] days before this are disabled (the To ≥ From rule)
 * @param {string}   [title]   shown above the grid, e.g. "From" / "To"
 * @param {boolean}  [allowFuture] let the grid reach past today. Off by default:
 *                   an entry records money that has already moved. A DUE date is
 *                   the opposite — it is only ever ahead — so that caller opts in.
 * @param {number[]} [quickDays]  "5 days / 10 days" chips, each picking today+N.
 *                   A promise is almost always made in round numbers of days
 *                   from now, and counting them out on a grid is the slow way.
 */
export default function LedgerDateSheet({
  visible, value, tint, onClose, onPick, minDate, title, allowFuture, quickDays,
}) {
  const [cursor, setCursor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  useEffect(() => {
    if (visible) setCursor(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [visible, value]);

  const today = startOfDay(new Date());
  const floor = minDate ? startOfDay(minDate) : null;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const atCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const cells = useMemo(
    () => [...Array(leading).fill(null), ...Array.from({ length: dayCount }, (_, i) => i + 1)],
    [leading, dayCount],
  );

  const step = (delta) => setCursor(new Date(year, month + delta, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)', paddingHorizontal: S.xl }}
      >
        {/* Swallows the backdrop press so tapping inside the card can't close it. */}
        <Pressable
          onPress={() => {}}
          className="w-full bg-card"
          style={{ borderRadius: SIZE.radius, padding: S.lg }}
        >
          {title ? (
            <Text
              className="font-extrabold"
              style={{ fontSize: T.sectionLabel, color: C.muted, letterSpacing: 0.6, marginBottom: S.xs }}
            >
              {title.toUpperCase()}
            </Text>
          ) : null}

          <View className="flex-row items-center" style={{ marginBottom: S.sm }}>
            <Pressable
              onPress={() => step(-1)}
              hitSlop={rs(10)}
              className="rounded-full items-center justify-center active:opacity-70"
              style={{ height: SIZE.tile, width: SIZE.tile, backgroundColor: C.field }}
            >
              <ChevronLeft size={rs(16)} color={C.ink} />
            </Pressable>
            <Text className="flex-1 text-center font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }}>
              {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              onPress={() => step(1)}
              hitSlop={rs(10)}
              disabled={!allowFuture && atCurrentMonth}
              className="rounded-full items-center justify-center active:opacity-70"
              style={{
                height: SIZE.tile,
                width: SIZE.tile,
                backgroundColor: C.field,
                opacity: !allowFuture && atCurrentMonth ? 0.35 : 1,
              }}
            >
              <ChevronRight size={rs(16)} color={C.ink} />
            </Pressable>
          </View>

          <View className="flex-row">
            {WEEKDAYS.map((d, i) => (
              <Text
                key={`${d}${i}`}
                className="text-center font-bold"
                style={{ width: `${100 / 7}%`, fontSize: T.caption, color: C.muted, paddingVertical: S.tight }}
              >
                {d}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (day === null) return <View key={`pad${i}`} style={{ width: `${100 / 7}%`, height: rs(36) }} />;
              const cellDate = new Date(year, month, day);
              const blocked = (!allowFuture && cellDate.getTime() > today.getTime())
                || (floor && cellDate.getTime() < floor.getTime());
              const selected = cellDate.getTime() === startOfDay(value).getTime();
              const isToday = cellDate.getTime() === today.getTime();
              return (
                <Pressable
                  key={day}
                  onPress={() => !blocked && onPick(cellDate)}
                  disabled={blocked}
                  className="items-center justify-center active:opacity-60"
                  style={{ width: `${100 / 7}%`, height: rs(36) }}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      height: rs(30),
                      width: rs(30),
                      borderRadius: rs(15),
                      backgroundColor: selected ? tint : 'transparent',
                      borderWidth: !selected && isToday ? 1 : 0,
                      borderColor: tint,
                    }}
                  >
                    <Text
                      className={selected ? 'font-extrabold' : 'font-semibold'}
                      style={{ fontSize: T.rowTitle, color: selected ? '#FFFFFF' : blocked ? C.chipBg : C.ink }}
                    >
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {quickDays?.length ? (
            <View className="flex-row flex-wrap" style={{ gap: S.xs, marginTop: S.sm }}>
              {quickDays.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    const d = new Date(today);
                    d.setDate(d.getDate() + n);
                    onPick(d);
                  }}
                  className="flex-1 items-center justify-center rounded-full active:opacity-80"
                  style={{
                    paddingVertical: S.sm,
                    borderWidth: 1,
                    borderColor: tint,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <Text className="font-extrabold" style={{ fontSize: T.caption, color: tint }}>
                    {n} days
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View className="flex-row" style={{ gap: S.sm, marginTop: S.sm }}>
            <Pressable
              onPress={() => onPick(today)}
              className="flex-1 items-center justify-center active:opacity-80"
              style={{ backgroundColor: `${tint}14`, borderRadius: SIZE.radiusSm, paddingVertical: S.sm }}
            >
              <Text className="font-extrabold" style={{ fontSize: T.button, color: tint }}>Today</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="flex-1 items-center justify-center active:opacity-80"
              style={{ backgroundColor: C.field, borderRadius: SIZE.radiusSm, paddingVertical: S.sm }}
            >
              <Text className="font-extrabold" style={{ fontSize: T.button, color: C.muted }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
