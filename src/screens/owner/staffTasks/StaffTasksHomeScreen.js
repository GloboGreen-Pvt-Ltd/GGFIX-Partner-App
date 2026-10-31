import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClipboardList, CalendarDays, Loader, CircleCheck, Clock, AlarmClockOff, ChevronRight, CircleSlash, Ban,
} from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { DashboardOverviewCard } from '../../../components/dashboard/DashboardOverviewCard';
import { DashboardToolsGrid, getDashboardToolColumns } from '../../../components/dashboard/DashboardToolsGrid';
import { mci } from '../../../components/dashboard/solidIcons';
import { assigneeNames, countTasks, dayKey, displayStatus, formatDay, formatTime, listTasks } from './staffTaskStore';
import { Avatar, C, Pill, STATUS_META, TaskHeader, TYPE_META, cardShadow } from './staffTaskUi';
import { notify } from '../../../components/confirm';

// Status counts — Home's Overview cards (DashboardOverviewCard). Tap filters the list.
const STATS = [
  { key: 'all', label: 'All Tasks', caption: 'Every task', icon: ClipboardList, color: '#035C6C' },
  { key: 'today', label: 'Today', caption: 'Due today', icon: CalendarDays, color: '#0788C9' },
  { key: 'inProgress', label: 'In Progress', caption: 'Being done', icon: Loader, color: '#1C3053' },
  { key: 'completed', label: 'Completed', caption: 'Finished', icon: CircleCheck, color: '#609138' },
  { key: 'pending', label: 'Pending', caption: 'Not started', icon: Clock, color: '#FAA700' },
  { key: 'overdue', label: 'Overdue', caption: 'Past end time', icon: AlarmClockOff, color: '#F32C26' },
  { key: 'incomplete', label: 'Incomplete', caption: 'Not done', icon: CircleSlash, color: '#F32C26' },
  { key: 'cancelled', label: 'Cancelled', caption: 'Called off', icon: Ban, color: '#6B7280' },
];

// Quick actions — the Employee section's own tool tiles (DashboardToolsGrid).
const ACTIONS = [
  { key: 'add', label: 'Add Task', icon: mci('clipboard-plus'), color: '#035C6C', iconColor: '#FFFFFF', iconBg: '#035C6C' },
  { key: 'calendar', label: 'Calendar', icon: mci('calendar-month'), color: '#0788C9', iconColor: '#FFFFFF', iconBg: '#0788C9' },
  { key: 'list', label: 'Task List', icon: mci('format-list-checks'), color: '#609138', iconColor: '#FFFFFF', iconBg: '#609138' },
  { key: 'team', label: 'My Team', icon: mci('account-group'), color: '#FAA700', iconColor: '#FFFFFF', iconBg: '#FAA700' },
];
const STAT_GAP = 8;
const TOOL_GAP = 8;

const matches = (key, t, today) => {
  const s = displayStatus(t);
  switch (key) {
    case 'today': return t.date === today && t.status !== 'CANCELLED';
    case 'inProgress': return s === 'IN_PROGRESS';
    case 'completed': return s === 'COMPLETED';
    case 'pending': return s === 'PENDING';
    case 'overdue': return s === 'OVERDUE';
    case 'incomplete': return s === 'INCOMPLETE';
    case 'cancelled': return t.status === 'CANCELLED';
    default: return true;
  }
};

export default function StaffTasksHomeScreen({ navigation }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [contentW, setContentW] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Reload on focus and on pull — employees update status from the Employee App.
  const load = useCallback((alive = () => true) => listTasks()
    .then((l) => { if (alive()) setTasks(l); })
    .catch((e) => { if (alive()) notify('Could not load tasks', e?.message || 'Please try again.', { preset: 'error' }); }), []);
  useFocusEffect(useCallback(() => {
    let alive = true;
    load(() => alive);
    return () => { alive = false; };
  }, [load]));
  const onRefresh = () => { setRefreshing(true); load().finally(() => setRefreshing(false)); };

  const counts = useMemo(() => countTasks(tasks), [tasks]);
  const today = dayKey(new Date());
  const shown = useMemo(() => tasks.filter((t) => matches(filter, t, today)), [tasks, filter, today]);
  // Overview cards: 3 per row on phones, 4 on tablets. Tool tiles: app rule 4/5/6.
  const statCols = r.isTablet ? 4 : 3;
  const statW = contentW ? Math.floor((contentW - STAT_GAP * (statCols - 1)) / statCols) : 0;
  const toolCols = getDashboardToolColumns(r.width);
  const toolW = contentW ? Math.floor((contentW - TOOL_GAP * (toolCols - 1)) / toolCols) : 0;
  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('wide'), alignSelf: 'center' } : null;
  const activeStat = STATS.find((s) => s.key === filter);

  const onAction = (tool) => {
    if (tool.key === 'add') navigation.navigate('StaffTaskForm');
    else if (tool.key === 'calendar') navigation.navigate('StaffTaskCalendar');
    else if (tool.key === 'list') setFilter('all');
    else if (tool.key === 'team') navigation.navigate('OwnerEmployeeList');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title="Staff Tasks" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#035C6C']} tintColor="#035C6C" />}>
        <View style={col} onLayout={(e) => setContentW(Math.round(e.nativeEvent.layout.width))}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>Store Operations</Text>
          <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Create and assign tasks to your team</Text>

          {/* Status counts — Home's Overview cards */}
          {statW ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: STAT_GAP }}>
              {STATS.map((s, i) => (
                <DashboardOverviewCard
                  key={s.key}
                  item={{ label: s.label, caption: s.caption, value: counts[s.key] ?? 0, icon: s.icon, color: s.color, onPress: () => setFilter(s.key) }}
                  width={statW}
                  gap={STAT_GAP}
                  last={i % statCols === statCols - 1}
                />
              ))}
            </View>
          ) : null}

          {/* Quick actions — Employee section tiles */}
          <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 15, fontWeight: '800', color: C.ink }}>Quick Actions</Text>
          {toolW ? (
            <DashboardToolsGrid items={ACTIONS} pad={0} columns={toolCols} cardWidth={toolW} gap={TOOL_GAP} onPress={onAction} />
          ) : null}

          {/* Task list for the selected card */}
          <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 15, fontWeight: '800', color: C.ink }}>
            {activeStat?.label || 'Tasks'} <Text style={{ fontSize: 13, color: C.muted }}>({shown.length})</Text>
          </Text>
          {shown.length === 0 ? (
            <View style={[{ borderRadius: 16, padding: 18, alignItems: 'center', backgroundColor: C.card }, cardShadow]}>
              <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>No tasks here yet. Tap Add Task to create one.</Text>
            </View>
          ) : shown.map((t) => <TaskRow key={t.id} task={t} onPress={() => navigation.navigate('StaffTaskDetail', { taskId: t.id })} />)}
        </View>
      </ScrollView>
    </View>
  );
}

export function TaskRow({ task, onPress }) {
  const type = TYPE_META[task.type] || TYPE_META.OTHER;
  const TypeIcon = type.icon;
  const status = STATUS_META[displayStatus(task)] || STATUS_META.PENDING;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={[{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 6, backgroundColor: C.card }, cardShadow]}>
      <View style={{ height: 34, width: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: type.bg }}>
        <TypeIcon size={16} color={type.fg} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink }} numberOfLines={1}>{task.title}</Text>
        <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }} numberOfLines={1}>
          {formatDay(task.date)} · {formatTime(task.startTime)} – {formatTime(task.endTime)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          <Avatar person={task.assignee} size={18} />
          <Text style={{ flex: 1, marginLeft: 6, fontSize: 11.5, color: C.ink }} numberOfLines={1}>{assigneeNames(task)}</Text>
          <Pill meta={status} small />
        </View>
      </View>
      <ChevronRight size={16} color={C.subtle} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}
