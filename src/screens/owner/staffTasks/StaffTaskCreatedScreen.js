import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, CalendarDays, Clock, MapPin, Users, Eye, Plus } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { assigneeNames, formatDay, formatTime, getTask } from './staffTaskStore';
import { C, TaskHeader, cardShadow } from './staffTaskUi';

/**
 * Shown only after createTask has saved the task (it reads it back by id).
 * params: { taskId }
 */
export default function StaffTaskCreatedScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const taskId = route?.params?.taskId;
  const [task, setTask] = useState(null);

  useEffect(() => { getTask(taskId).then(setTask); }, [taskId]);

  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' } : null;
  const Line = ({ icon: Icon, text }) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
      <Icon size={15} color={C.primary} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, color: C.ink, lineHeight: 18 }}>{text}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title="Task Created" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={[col, { alignItems: 'center' }]}>
          <View style={{ marginTop: 12, height: 76, width: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF5E8' }}>
            <CircleCheck size={44} color={C.green} />
          </View>
          <Text style={{ marginTop: 12, fontSize: 18, fontWeight: '800', color: C.ink, textAlign: 'center' }}>Task Created Successfully!</Text>

          {task ? (
            <View style={[{ alignSelf: 'stretch', marginTop: 14, borderRadius: 14, padding: 14, backgroundColor: C.card }, cardShadow]}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{task.title}</Text>
              <Line icon={Users} text={assigneeNames(task)} />
              <Line icon={CalendarDays} text={formatDay(task.date)} />
              <Line icon={Clock} text={`${formatTime(task.startTime)} – ${formatTime(task.endTime)}`} />
              {task.location ? <Line icon={MapPin} text={task.location} /> : null}
            </View>
          ) : null}

          <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <Pressable onPress={() => navigation.replace('StaffTaskDetail', { taskId })} disabled={!task} accessibilityRole="button"
              style={{ flex: 1, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.primary, backgroundColor: C.card }}>
              <Eye size={16} color={C.primary} /><Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: C.primary }}>View Task</Text>
            </Pressable>
            <Pressable onPress={() => navigation.replace('StaffTaskForm')} accessibilityRole="button"
              style={{ flex: 1, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
              <Plus size={16} color="#FFFFFF" /><Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Add Another Task</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
