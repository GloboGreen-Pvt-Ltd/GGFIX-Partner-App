import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarPlus, ListChecks, ChevronDown, ChevronLeft, ChevronRight, Plus, Check } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { dayKey, displayStatus, formatTime, listTasks, parseDay, toMinutes } from './staffTaskStore';
import { Avatar, C, STATUS_META, TYPE_META } from './staffTaskUi';
import { notify } from '../../../components/confirm';

const HOUR_H = 64; // px per hour
const GUTTER = 50;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TABS = ['Day', 'Week', 'Month', 'List'];

const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const longDay = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

/** Side-by-side lanes for overlapping tasks: [{ task, s, e, lane, lanes }]. */
function layoutDay(tasks) {
  const items = tasks
    .map((t) => ({ task: t, s: toMinutes(t.startTime) ?? 0, e: Math.max(toMinutes(t.endTime) ?? 0, (toMinutes(t.startTime) ?? 0) + 30) }))
    .sort((a, b) => a.s - b.s);
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const lanesEnd = [];
    group.forEach((it) => {
      let lane = lanesEnd.findIndex((end) => end <= it.s);
      if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(it.e); } else lanesEnd[lane] = it.e;
      it.lane = lane;
    });
    group.forEach((it) => out.push({ ...it, lanes: lanesEnd.length }));
    group = [];
  };
  items.forEach((it) => {
    if (group.length && it.s >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.e);
  });
  if (group.length) flush();
  return out;
}

/** Overlapping employee photos / initials (max 3 + "+n"). */
function AvatarStack({ people, size = 26 }) {
  const list = people || [];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {list.slice(0, 3).map((p, i) => (
        <View key={p.id || i} style={{ marginLeft: i ? -8 : 0, borderRadius: size / 2 + 2, borderWidth: 2, borderColor: '#FFFFFF' }}>
          <Avatar person={p} size={size} />
        </View>
      ))}
      {list.length > 3 ? <Text style={{ marginLeft: 3, fontSize: 11, fontWeight: '700', color: C.muted }}>+{list.length - 3}</Text> : null}
    </View>
  );
}

/** One task card — tinted by type, coloured left edge, icon, title, time, avatars. */
function TaskCard({ task, onPress, style, compact }) {
  const type = TYPE_META[task.type] || TYPE_META.OTHER;
  const Icon = type.icon;
  const st = displayStatus(task);
  const edge = st === 'OVERDUE' ? STATUS_META.OVERDUE.color : type.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${formatTime(task.startTime)} to ${formatTime(task.endTime)}`}
      style={[{
        flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: compact ? 6 : 8,
        backgroundColor: type.bg, borderLeftWidth: 4, borderLeftColor: edge, overflow: 'hidden',
      }, style]}
    >
      {/* Full-strength icon disc and edge always; a done task gets a green ✓ badge instead of fading. */}
      <View>
        <View style={{ height: compact ? 28 : 34, width: compact ? 28 : 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: type.color }}>
          <Icon size={compact ? 14 : 17} color="#FFFFFF" />
        </View>
        {st === 'COMPLETED' ? (
          <View style={{ position: 'absolute', right: -3, bottom: -3, height: 15, width: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, borderWidth: 1.5, borderColor: '#FFFFFF' }}>
            <Check size={9} color="#FFFFFF" strokeWidth={3.5} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink }} numberOfLines={1}>{task.title}</Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }} numberOfLines={1}>{formatTime(task.startTime)} - {formatTime(task.endTime)}</Text>
      </View>
      <AvatarStack people={task.assignees} size={compact ? 22 : 26} />
      <View style={{ marginLeft: 6, height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ChevronDown size={14} color={type.color} />
      </View>
    </Pressable>
  );
}

export default function StaffTaskCalendarScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('Day');
  const [selected, setSelected] = useState(() => (route?.params?.date ? parseDay(route.params.date) : new Date()));
  const [tasks, setTasks] = useState([]);
  const [gridW, setGridW] = useState(0);
  const scrollRef = useRef(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    listTasks().then((l) => { if (alive) setTasks(l.filter((t) => t.status !== 'CANCELLED')); })
      .catch((e) => { if (alive) notify('Could not load tasks', e?.message || 'Please try again.', { preset: 'error' }); });
    return () => { alive = false; };
  }, []));

  const selKey = dayKey(selected);
  const todayKey = dayKey(new Date());
  const weekStart = startOfWeek(selected);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = useMemo(() => {
    const m = new Map();
    tasks.forEach((t) => { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date).push(t); });
    return m;
  }, [tasks]);
  const dayItems = useMemo(() => layoutDay(byDay.get(selKey) || []), [byDay, selKey]);
  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('wide'), alignSelf: 'center' } : null;
  const open = (t) => navigation.navigate('StaffTaskDetail', { taskId: t.id });

  // Month grid (Sun-first, 6 rows).
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const monthCells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const shift = (dir) => {
    if (tab === 'Month') setSelected(new Date(selected.getFullYear(), selected.getMonth() + dir, 1));
    else setSelected(addDays(selected, dir * 7));
  };

  // Week / List rows grouped by day.
  const groupedDays = tab === 'Week'
    ? week.map((d) => [dayKey(d), byDay.get(dayKey(d)) || []])
    : [...byDay.entries()].filter(([k]) => k >= selKey).sort(([a], [b]) => a.localeCompare(b));

  return (
    <View style={{ flex: 1, backgroundColor: C.card }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 6, backgroundColor: C.card }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, col]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" style={{ height: 36, width: 36, justifyContent: 'center' }}>
            <ArrowLeft size={22} color={C.navy} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.ink }}>Task Calendar</Text>
          <Pressable onPress={() => navigation.navigate('StaffTaskForm', { date: selKey })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add task" style={{ height: 36, width: 32, alignItems: 'center', justifyContent: 'center' }}>
            <CalendarPlus size={20} color={C.primary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('StaffTasks')} hitSlop={8} accessibilityRole="button" accessibilityLabel="All tasks" style={{ height: 36, width: 32, alignItems: 'center', justifyContent: 'center' }}>
            <ListChecks size={20} color={C.primary} />
          </Pressable>
        </View>
      </View>

      {/* Day / Week / Month / List */}
      <View style={[{ marginHorizontal: 14, flexDirection: 'row', borderRadius: 12, padding: 3, backgroundColor: C.page }, col]}>
        {TABS.map((t) => {
          const on = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.primary : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: on ? '800' : '600', color: on ? '#FFFFFF' : C.ink }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Week strip (Day / Week / List) or month header */}
      {tab === 'Month' ? (
        <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12 }, col]}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month"><ChevronLeft size={20} color={C.primary} /></Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 15.5, fontWeight: '800', color: C.ink }}>
            {selected.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month"><ChevronRight size={20} color={C.primary} /></Pressable>
        </View>
      ) : (
        <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 10 }, col]}>
          <Pressable onPress={() => shift(-1)} hitSlop={8} accessibilityLabel="Previous week" style={{ padding: 4 }}><ChevronLeft size={18} color={C.primary} /></Pressable>
          {week.map((d) => {
            const k = dayKey(d);
            const on = k === selKey;
            const has = byDay.has(k);
            return (
              <Pressable key={k} onPress={() => setSelected(d)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12, backgroundColor: on ? C.primary : 'transparent' }}>
                <Text style={{ fontSize: 11.5, color: on ? '#FFFFFF' : C.muted }}>{WEEKDAYS[d.getDay()]}</Text>
                <Text style={{ marginTop: 2, fontSize: 16, fontWeight: '800', color: on ? '#FFFFFF' : C.ink }}>{d.getDate()}</Text>
                <View style={{ marginTop: 2, height: 4, width: 4, borderRadius: 2, backgroundColor: has ? (on ? '#FFFFFF' : C.primary) : 'transparent' }} />
              </Pressable>
            );
          })}
          <Pressable onPress={() => shift(1)} hitSlop={8} accessibilityLabel="Next week" style={{ padding: 4 }}><ChevronRight size={18} color={C.primary} /></Pressable>
        </View>
      )}

      {/* Date title + Today */}
      {tab !== 'Month' ? (
        <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 }, col]}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{longDay(selected)}</Text>
          <Pressable onPress={() => setSelected(new Date())} accessibilityRole="button"
            style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: C.mint, borderWidth: 1, borderColor: '#CDE6EA' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.primary }}>Today</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Body */}
      {tab === 'Day' ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          onContentSizeChange={() => scrollRef.current?.scrollTo({ y: HOUR_H * 7.6, animated: false })}
        >
          <View style={[{ height: HOUR_H * 24 + 10, flexDirection: 'row', marginTop: 6 }, col]}>
            <View style={{ width: GUTTER }}>
              {Array.from({ length: 24 }, (_, h) => (
                <Text key={h} style={{ position: 'absolute', top: h * HOUR_H - 7, left: 12, fontSize: 11.5, color: C.muted }}>
                  {`${String(h).padStart(2, '0')}:00`}
                </Text>
              ))}
            </View>
            <View style={{ flex: 1, marginRight: 12 }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
              {Array.from({ length: 24 }, (_, h) => (
                <View key={h} style={{ position: 'absolute', top: h * HOUR_H, left: 0, right: 0, borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed' }} />
              ))}
              {gridW > 0 && dayItems.map(({ task, s, e, lane, lanes }) => {
                const w = gridW / lanes;
                const h = Math.max(((e - s) / 60) * HOUR_H, 52);
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onPress={() => open(task)}
                    compact={lanes > 1}
                    style={{ position: 'absolute', top: (s / 60) * HOUR_H + 2, left: lane * w + 2, width: w - 4, height: h - 4 }}
                  />
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : tab === 'Month' ? (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90 }}>
          <View style={col}>
            <View style={{ flexDirection: 'row' }}>
              {WEEKDAYS.map((w) => <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: C.muted }}>{w}</Text>)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
              {monthCells.map((d) => {
                const k = dayKey(d);
                const inMonth = d.getMonth() === selected.getMonth();
                const n = (byDay.get(k) || []).length;
                const on = k === selKey;
                return (
                  <Pressable key={k} onPress={() => { setSelected(d); setTab('Day'); }} accessibilityRole="button" accessibilityLabel={`${d.getDate()}, ${n} tasks`}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                    <View style={{ flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.primary : n ? C.mint : 'transparent', borderWidth: k === todayKey && !on ? 1 : 0, borderColor: C.primary }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: on ? '#FFFFFF' : inMonth ? C.ink : C.subtle }}>{d.getDate()}</Text>
                      {n ? <Text style={{ fontSize: 10, fontWeight: '700', color: on ? '#FFFFFF' : C.primary }}>{n} task{n > 1 ? 's' : ''}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: insets.bottom + 90 }}>
          <View style={col}>
            {groupedDays.every(([, l]) => !l.length) ? (
              <Text style={{ marginTop: 30, textAlign: 'center', fontSize: 13, color: C.muted }}>
                {tab === 'Week' ? 'No tasks this week.' : 'No upcoming tasks.'}
              </Text>
            ) : groupedDays.map(([k, list]) => (list.length ? (
              <View key={k} style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: k === todayKey ? C.primary : C.muted, marginBottom: 6 }}>
                  {longDay(parseDay(k))}{k === todayKey ? ' · Today' : ''}
                </Text>
                {list.map((t) => <TaskCard key={t.id} task={t} onPress={() => open(t)} style={{ marginBottom: 8 }} />)}
              </View>
            ) : null))}
          </View>
        </ScrollView>
      )}

      <Pressable
        onPress={() => navigation.navigate('StaffTaskForm', { date: selKey })}
        accessibilityRole="button"
        accessibilityLabel="Add task"
        style={{ position: 'absolute', right: 18, bottom: insets.bottom + 18, height: 58, width: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Plus size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
