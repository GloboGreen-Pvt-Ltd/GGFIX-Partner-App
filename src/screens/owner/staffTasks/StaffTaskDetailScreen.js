import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, CalendarDays, Clock, Phone, MapPin, MoreVertical, SquarePen, PlayCircle, CircleCheck, Square, SquareCheck,
  CalendarClock, UserRoundCog, RotateCcw, Ban, Trash2, CircleSlash, History, Bell, Repeat, ChevronRight, ChevronDown,
  ListChecks, Paperclip,
} from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { ResponsiveModal } from '../../../components/responsive';
import { notify, confirm } from '../../../components/confirm';
import { getSession } from '../../../auth/session';
import { mci } from '../../../components/dashboard/solidIcons';
import {
  deleteTask, displayStatus, formatDay, formatTime, getTask, reminderLabel, repeatLabel, setAssignees, setTaskStatus,
  toggleChecklistItem, toMinutes, parseDay,
} from './staffTaskStore';
import { Avatar, C, PRIORITY_META, STATUS_META, TYPE_META, cardShadow } from './staffTaskUi';

const HISTORY_LABEL = {
  CREATED: 'Created', EDITED: 'Edited', RESCHEDULED: 'Rescheduled', REASSIGNED: 'Reassigned',
  PENDING: 'Reopened', IN_PROGRESS: 'Started', COMPLETED: 'Completed', INCOMPLETE: 'Marked incomplete', CANCELLED: 'Cancelled',
};
// What an employee row says. Per-employee accept/start needs the Employee App
// backend, so every row shows the task's real status — nothing invented.
const EMP_STATUS = {
  PENDING: { label: 'Not Started', color: '#FAA700' },
  OVERDUE: { label: 'Overdue', color: '#F32C26' },
  IN_PROGRESS: { label: 'In Progress', color: '#0788C9' },
  COMPLETED: { label: 'Completed', color: '#609138' },
  INCOMPLETE: { label: 'Not Completed', color: '#F32C26' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280' },
};

const longDay = (key) => parseDay(key).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
function duration(t) {
  const m = (toMinutes(t.endTime) ?? 0) - (toMinutes(t.startTime) ?? 0);
  if (m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${h} hour${h > 1 ? 's' : ''}` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
}
function createdLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${time}`;
}
const GoogleMapsIcon = mci('google-maps');
const taskRef = (id) => `# TS-${String(id || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`;

export default function StaffTaskDetailScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const taskId = route?.params?.taskId;
  const [task, setTask] = useState(null);
  const [owner, setOwner] = useState('Shop Owner');
  const [menu, setMenu] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);

  const reload = useCallback(() => getTask(taskId).then(setTask), [taskId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => {
    getSession().then((s) => { const n = s?.name || s?.user?.name; if (n) setOwner(n); }).catch(() => {});
  }, []);

  const Header = () => (
    <View style={{ backgroundColor: C.primary, paddingTop: insets.top + 6, paddingBottom: 12, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back" style={{ height: 34, width: 34, justifyContent: 'center' }}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#FFFFFF' }}>Task Details</Text>
        <Pressable onPress={() => task && setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More actions" style={{ height: 34, width: 34, alignItems: 'flex-end', justifyContent: 'center' }}>
          <MoreVertical size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );

  if (!task) return <View style={{ flex: 1, backgroundColor: C.page }}><Header /></View>;

  const type = TYPE_META[task.type] || TYPE_META.OTHER;
  const TypeIcon = type.icon;
  const st = displayStatus(task);
  const empSt = EMP_STATUS[st] || EMP_STATUS.PENDING;
  const pr = PRIORITY_META[task.priority] || PRIORITY_META.MEDIUM;
  const open = task.status === 'PENDING' || task.status === 'IN_PROGRESS';
  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' } : null;
  const checklist = task.checklist || [];
  const doneCount = checklist.filter((c) => c.done).length;

  const run = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await reload(); if (okMsg) notify(okMsg, '', { preset: 'done' }); }
    catch (e) { notify('Could not update', e?.message || 'Try again.', { preset: 'error' }); }
    finally { setBusy(false); }
  };
  const setStatus = (s, note, msg) => run(() => setTaskStatus(task.id, s, note), msg);

  const reassign = () => {
    setMenu(false);
    navigation.navigate('StaffTaskSelectEmployee', {
      selectedIds: task.assigneeIds, date: task.date, startTime: task.startTime, endTime: task.endTime, taskId: task.id,
      onSelect: (list) => {
        const ids = (xs) => xs.map((a) => a.id).sort().join(',');
        if (ids(list) !== ids(task.assignees || [])) run(() => setAssignees(task.id, list), 'Employees updated');
      },
    });
  };
  const reschedule = () => { setMenu(false); navigation.navigate('StaffTaskForm', { taskId: task.id }); };
  const call = (person) => {
    const n = String(person?.phone || '').replace(/[^\d+]/g, '');
    if (n) Linking.openURL(`tel:${n}`).catch(() => {});
  };
  const openMaps = () => {
    const c = task.coords;
    const qy = c ? `${c.lat},${c.lng}` : encodeURIComponent(task.location);
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?q=${qy}` : `https://www.google.com/maps/search/?api=1&query=${qy}`).catch(() => {});
  };
  const remove = async () => {
    setMenu(false);
    const ok = await confirm({ title: 'Delete task?', message: 'This removes the task and its history.', confirmText: 'Delete', destructive: true });
    if (!ok) return;
    await deleteTask(task.id);
    navigation.goBack();
  };

  const menuItems = [
    open && { label: 'Reschedule', icon: CalendarClock, onPress: reschedule },
    task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && { label: 'Reassign', icon: UserRoundCog, onPress: reassign },
    open && { label: 'Mark Incomplete', icon: CircleSlash, onPress: () => { setMenu(false); setReason(''); setReasonOpen(true); } },
    !open && { label: 'Reopen', icon: RotateCcw, onPress: () => { setMenu(false); setStatus('PENDING', null, 'Task reopened'); } },
    open && { label: 'Cancel Task', icon: Ban, onPress: () => { setMenu(false); setStatus('CANCELLED', null, 'Task cancelled'); } },
    { label: 'Delete', icon: Trash2, onPress: remove, danger: true },
  ].filter(Boolean);

  const card = [{ borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, cardShadow];
  const Tile = ({ icon: Icon, label, value, sub, iconNode }) => (
    <View style={[card, { flex: 1, flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8 }]}>
      {iconNode || <Icon size={16} color={C.ink} style={{ marginTop: 1 }} />}
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <Text style={{ fontSize: 11, color: C.muted }}>{label}</Text>
        <Text style={{ marginTop: 2, fontSize: 13, fontWeight: '700', color: C.ink }} numberOfLines={1}>{value}</Text>
        {sub ? <Text style={{ marginTop: 1, fontSize: 10.5, color: C.muted }} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </View>
  );
  const RowItem = ({ icon: Icon, title, value, onPress, right }) => (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={[card, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, marginTop: 6 }]}>
      <Icon size={16} color={C.ink} />
      <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: '700', color: C.ink }}>{title}</Text>
      {value ? <Text style={{ marginLeft: 10, flex: 1, fontSize: 13, color: C.muted }} numberOfLines={1}>{value}</Text> : <View style={{ flex: 1 }} />}
      {right}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: insets.bottom + (open ? 150 : 30) }}>
        <View style={col}>
          {/* Summary */}
          <View style={[card, { flexDirection: 'row', padding: 10 }]}>
            <View style={{ height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
              <TypeIcon size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '800', color: C.ink }} numberOfLines={2}>{task.title}</Text>
                <View style={{ marginLeft: 8, alignItems: 'flex-end' }}>
                  <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: pr.bg, borderWidth: 1, borderColor: pr.color }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: pr.fg }}>{pr.label}</Text>
                  </View>
                  <Text style={{ marginTop: 4, fontSize: 10.5, color: C.muted }}>{taskRef(task.id)}</Text>
                </View>
              </View>
              {task.description ? <Text style={{ marginTop: 4, fontSize: 12, color: C.ink, lineHeight: 16 }} numberOfLines={3}>{task.description}</Text> : null}
              {st !== 'PENDING' ? (
                <View style={{ alignSelf: 'flex-start', marginTop: 8, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: (STATUS_META[st] || STATUS_META.PENDING).bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: (STATUS_META[st] || STATUS_META.PENDING).fg }}>{(STATUS_META[st] || STATUS_META.PENDING).label}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {task.status === 'INCOMPLETE' ? (
            <View style={{ marginTop: 8, borderRadius: 14, padding: 12, backgroundColor: '#FDEAE9' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#F32C26' }}>Not completed</Text>
              <Text style={{ fontSize: 12.5, color: '#F32C26', marginTop: 2 }}>{task.incompleteReason || 'No reason given.'}</Text>
              <Text style={{ fontSize: 11.5, color: '#F32C26', marginTop: 6 }}>Reschedule or reassign it from the ⋮ menu.</Text>
            </View>
          ) : null}

          {/* Date · Time / Category · Created by */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Tile icon={CalendarDays} label="Date" value={longDay(task.date)} />
            <Tile icon={Clock} label="Time" value={`${formatTime(task.startTime)} - ${formatTime(task.endTime)}`} sub={duration(task)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Tile icon={TypeIcon} label="Category" value={type.label} />
            <Tile
              label="Created By"
              value={owner}
              sub={createdLabel(task.createdAt)}
              iconNode={(
                <View style={{ height: 24, width: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>{String(owner).trim().charAt(0).toUpperCase() || 'S'}</Text>
                </View>
              )}
            />
          </View>

          {/* Assigned employees */}
          <View style={[card, { marginTop: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 2 }}>Assigned Employees ({(task.assignees || []).length})</Text>
            {(task.assignees || []).map((a, i) => (
              <Pressable key={a.id} onPress={() => navigation.navigate('OwnerEmployeeDetail', { employee: a })} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View>
                  <Avatar person={a} size={34} />
                  <View style={{ position: 'absolute', right: -1, bottom: -1, height: 13, width: 13, borderRadius: 7, backgroundColor: empSt.color, borderWidth: 2, borderColor: '#FFFFFF' }} />
                </View>
                <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }} numberOfLines={1}>{a.name}</Text>
                  <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{a.roleLabel || 'Employee'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                  <View style={{ height: 7, width: 7, borderRadius: 4, backgroundColor: empSt.color, marginRight: 4 }} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: empSt.color }}>{empSt.label}</Text>
                </View>
                {a.phone ? (
                  <Pressable onPress={() => call(a)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Call ${a.name}`}
                    style={{ height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.primary }}>
                    <Phone size={14} color={C.primary} />
                  </Pressable>
                ) : null}
                <ChevronRight size={18} color={C.ink} style={{ marginLeft: 8 }} />
              </Pressable>
            ))}
          </View>

          {/* Location */}
          {task.location ? (
            <View style={[card, { marginTop: 6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 }]}>
              <MapPin size={16} color={C.ink} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10, paddingRight: 8 }}>
                <Text style={{ fontSize: 11, color: C.muted }}>Location</Text>
                <Text style={{ marginTop: 1, fontSize: 13, color: C.ink, lineHeight: 17 }} numberOfLines={2}>{task.location}</Text>
              </View>
              {/* Google Maps — icon only */}
              <Pressable onPress={openMaps} hitSlop={6} accessibilityRole="button" accessibilityLabel="Open in Google Maps"
                style={{ height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
                <GoogleMapsIcon size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}

          {/* Priority · Reminder */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <View style={[card, { flex: 1, paddingHorizontal: 10, paddingVertical: 8 }]}>
              <Text style={{ fontSize: 11, color: C.muted }}>Priority</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <View style={{ height: 9, width: 9, borderRadius: 5, backgroundColor: pr.dot }} />
                <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '800', color: pr.fg }}>{pr.label}</Text>
              </View>
            </View>
            <View style={[card, { flex: 1, paddingHorizontal: 10, paddingVertical: 8 }]}>
              <Text style={{ fontSize: 11, color: C.muted }}>Reminder</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <Bell size={14} color={C.ink} />
                <Text style={{ marginLeft: 8, fontSize: 12.5, color: C.ink }} numberOfLines={1}>{task.reminder ? `${task.reminder} minutes before` : 'None'}</Text>
              </View>
            </View>
          </View>

          <RowItem icon={Repeat} title="Repeat" value={repeatLabel(task.repeat)} />

          {/* Checklist (expands) */}
          <RowItem
            icon={ListChecks}
            title="Checklist"
            value={checklist.length ? `${doneCount}/${checklist.length} done` : 'No steps'}
            onPress={checklist.length ? () => setCheckOpen((o) => !o) : undefined}
            right={checklist.length ? (checkOpen ? <ChevronDown size={18} color={C.ink} /> : <ChevronRight size={18} color={C.ink} />) : null}
          />
          {checkOpen && checklist.length ? (
            <View style={[card, { marginTop: 4, paddingHorizontal: 12, paddingVertical: 6 }]}>
              {checklist.map((c) => (
                <Pressable key={c.id} onPress={() => run(() => toggleChecklistItem(task.id, c.id))} accessibilityRole="checkbox" accessibilityState={{ checked: c.done }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
                  {c.done ? <SquareCheck size={18} color={C.primary} /> : <Square size={18} color={C.muted} />}
                  <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, color: c.done ? C.muted : C.ink, textDecorationLine: c.done ? 'line-through' : 'none' }}>{c.text}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Attachments — none until employees can upload (Employee App backend). */}
          <RowItem icon={Paperclip} title="Attachments" value="No attachments" />

          {/* History */}
          <View style={[card, { marginTop: 6, paddingHorizontal: 10, paddingVertical: 8 }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 2 }}>History</Text>
            {(task.history || []).slice().reverse().map((h, i) => (
              <View key={`${h.at}-${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 }}>
                <History size={13} color={C.muted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, color: C.ink }}>
                  <Text style={{ fontWeight: '700' }}>{HISTORY_LABEL[h.action] || h.action}</Text>
                  {h.note ? ` · ${h.note}` : ''}
                  <Text style={{ color: C.muted }}>{`  ${new Date(h.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}`}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Actions */}
      {open ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
          <View style={col}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={reschedule} accessibilityRole="button"
                style={{ flex: 1, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.primary }}>
                <SquarePen size={16} color={C.primary} /><Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: C.primary }}>Edit</Text>
              </Pressable>
              {task.status === 'PENDING' ? (
                <Pressable onPress={() => setStatus('IN_PROGRESS', null, 'Marked in progress')} disabled={busy} accessibilityRole="button"
                  style={{ flex: 1.6, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue }}>
                  <PlayCircle size={16} color="#FFFFFF" /><Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>Mark In Progress</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => setStatus('COMPLETED', null, 'Task completed')} disabled={busy} accessibilityRole="button"
              style={{ marginTop: 8, minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green }}>
              <CircleCheck size={17} color="#FFFFFF" /><Text style={{ marginLeft: 6, fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Mark Completed</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ⋮ menu */}
      <ResponsiveModal visible={menu} onClose={() => setMenu(false)} maxWidth={420}>
        <View style={{ paddingVertical: 6 }}>
          {menuItems.map((m) => {
            const Icon = m.icon;
            return (
              <Pressable key={m.label} onPress={m.onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 }}>
                <Icon size={18} color={m.danger ? C.red : C.ink} />
                <Text style={{ marginLeft: 12, fontSize: 14.5, fontWeight: '600', color: m.danger ? C.red : C.ink }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ResponsiveModal>

      {/* Incomplete reason */}
      <ResponsiveModal visible={reasonOpen} onClose={() => setReasonOpen(false)} maxWidth={460}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Why wasn't it completed?</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder="e.g. Customer not reachable" placeholderTextColor={C.subtle} multiline maxLength={300}
            style={{ marginTop: 10, minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10, fontSize: 14, color: C.ink, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable onPress={() => setReasonOpen(false)} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { if (!reason.trim()) { notify('Reason', 'Add a short reason.'); return; } setReasonOpen(false); setStatus('INCOMPLETE', reason, 'Marked incomplete'); }}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.red }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Mark Incomplete</Text>
            </Pressable>
          </View>
        </View>
      </ResponsiveModal>
    </View>
  );
}
