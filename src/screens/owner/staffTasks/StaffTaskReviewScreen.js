import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Clock, MapPin, Flag, ClipboardCheck, Users, TriangleAlert, FileText } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { notify } from '../../../components/confirm';
import {
  createTask, findClash, formatDay, formatTime, listTasks, outsideShift,
} from './staffTaskStore';
import { Avatar, C, PRIORITY_META, TaskHeader, TYPE_META, cardShadow } from './staffTaskUi';

/**
 * Review & Create. Every "Edit" goes back to the form, which still holds all
 * values. Create is single-flight (and createTask itself ignores a repeat of
 * the same task within seconds), then the form + review leave the stack.
 * params: { draft }
 */
export default function StaffTaskReviewScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const d = route?.params?.draft;
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    if (!d) return;
    listTasks().then((list) => {
      const w = [];
      d.assignees.forEach((a) => {
        const clash = findClash(list, { assigneeId: a.id, date: d.date, startTime: d.startTime, endTime: d.endTime });
        if (clash) w.push(`${a.name} is busy: ${clash.title} (${formatTime(clash.startTime)}–${formatTime(clash.endTime)})`);
        if (outsideShift(a, d.startTime, d.endTime)) w.push(`${a.name}'s shift is ${a.shiftStart}–${a.shiftEnd}`);
      });
      setWarnings(w);
    }).catch(() => {}); // warnings only; the server still checks on create
  }, [d]);

  if (!d) return <View style={{ flex: 1, backgroundColor: C.page }}><TaskHeader title="Review Task" onBack={() => navigation.goBack()} /></View>;

  const type = TYPE_META[d.type] || TYPE_META.OTHER;
  const TypeIcon = type.icon;
  const pr = PRIORITY_META[d.priority] || PRIORITY_META.MEDIUM;

  const create = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setCreating(true);
    try {
      const t = await createTask(d);
      // Drop the form + review so Back from the success screen returns to the list.
      navigation.dispatch((state) => {
        const routes = state.routes.filter((x) => x.name !== 'StaffTaskForm' && x.name !== 'StaffTaskReview');
        routes.push({ key: `StaffTaskCreated-${t.id}`, name: 'StaffTaskCreated', params: { taskId: t.id } });
        return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
      });
    } catch (e) {
      inFlight.current = false;
      setCreating(false);
      notify('Could not create task', e?.message || 'Try again.', { preset: 'error' });
    }
  };

  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' } : null;
  const Section = ({ title, children }) => (
    <View style={[{ marginTop: 8, borderRadius: 14, padding: 12, backgroundColor: C.card }, cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.ink }}>{title}</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
  const Line = ({ icon: Icon, text, color = C.ink }) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
      <Icon size={14} color={C.muted} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 12.5, color, lineHeight: 17 }}>{text}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title="Review Task" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}>
        <View style={col}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, backgroundColor: type.bg }, cardShadow]}>
            <View style={{ height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: type.fg }}>
              <TypeIcon size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }} numberOfLines={2}>{d.title.trim()}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: type.fg }}>{type.label}</Text>
            </View>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}><Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>Edit</Text></Pressable>
          </View>

          {warnings.length ? (
            <View style={{ marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: '#FFF4DB', borderWidth: 1, borderColor: '#FAA700' }}>
              {warnings.map((w) => (
                <View key={w} style={{ flexDirection: 'row', alignItems: 'flex-start', marginVertical: 1 }}>
                  <TriangleAlert size={13} color="#FAA700" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, marginLeft: 6, fontSize: 12, color: C.ink }}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Section title="Schedule">
            <Line icon={CalendarDays} text={formatDay(d.date)} />
            <Line icon={Clock} text={`${formatTime(d.startTime)} – ${formatTime(d.endTime)}`} />
          </Section>

          <Section title={`Assigned (${d.assignees.length})`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {d.assignees.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingLeft: 3, paddingRight: 10, paddingVertical: 3, backgroundColor: C.mint }}>
                  <Avatar person={a} size={22} />
                  <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '700', color: C.primary }}>{a.name}</Text>
                </View>
              ))}
            </View>
            <Line icon={Flag} text={`Priority: ${pr.label}`} color={pr.color} />
          </Section>

          {d.description?.trim() ? (
            <Section title="Description"><Line icon={FileText} text={d.description.trim()} /></Section>
          ) : null}

          <Section title="Location">
            <Line icon={MapPin} text={d.location?.trim() || 'Not set'} color={d.location?.trim() ? C.ink : C.muted} />
          </Section>

          <Section title={`Checklist (${(d.checklist || []).length})`}>
            {(d.checklist || []).length
              ? d.checklist.map((c, i) => <Line key={c.id || i} icon={ClipboardCheck} text={c.text} />)
              : <Line icon={ClipboardCheck} text="No checklist" color={C.muted} />}
          </Section>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Users size={12} color={C.muted} />
            <Text style={{ marginLeft: 6, fontSize: 11, color: C.muted }}>Saved on this device. Employee App sync needs the shared task server.</Text>
          </View>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
        <Pressable onPress={create} disabled={creating} accessibilityRole="button"
          style={[{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: creating ? '#9CA3AF' : C.primary }, col]}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{creating ? 'Creating…' : 'Create Task'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
