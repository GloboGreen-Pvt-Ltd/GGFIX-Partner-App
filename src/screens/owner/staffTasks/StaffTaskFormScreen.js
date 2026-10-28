import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, MapPin, Plus, X, ClipboardCheck, ChevronRight, ChevronDown } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { ResponsiveModal } from '../../../components/responsive';
import { MaterialDatePicker } from '../../../components/MaterialPickers';
import { notify } from '../../../components/confirm';
import {
  PRIORITIES, TASK_TYPES, dayKey, formatDay, fromMinutes, getTask, isTime24, parseDay,
  rescheduleTask, setAssignees, toMinutes, updateTask, validateDraft,
} from './staffTaskStore';
import { Avatar, C, PRIORITY_META, TaskHeader, TYPE_META } from './staffTaskUi';

const roundUpHour = () => { const d = new Date(); return Math.min(23, d.getHours() + 1) * 60; };
/** "15:30" → "03:30 PM" (shown under the 24-hour value). */
const to12 = (hhmm) => {
  const m = toMinutes(hhmm);
  if (m == null) return '';
  const h = Math.floor(m / 60);
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/**
 * Add / Edit Task. Create → Review → Create (Review screen); Edit saves here.
 * Sub-screens (employees, location, checklist) hand values back through
 * callbacks, so nothing typed here is lost while they are open.
 */
export default function StaffTaskFormScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const editId = route?.params?.taskId || null;
  const [loaded, setLoaded] = useState(!editId);
  const [original, setOriginal] = useState(null);
  const [type, setType] = useState('SERVICE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(route?.params?.date || dayKey(new Date()));
  const [startTime, setStartTime] = useState(() => fromMinutes(roundUpHour()));
  const [endTime, setEndTime] = useState(() => fromMinutes(Math.min(roundUpHour() + 60, 23 * 60 + 59)));
  const [assignees, setAssigneesState] = useState([]);
  const [priority, setPriority] = useState('MEDIUM');
  const [location, setLocation] = useState(null); // { address, coords }
  const [checklist, setChecklist] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  // Time dropdown: which field is open + its working value.
  const [timeOpen, setTimeOpen] = useState(null); // 'start' | 'end'
  const [tH, setTH] = useState(9);
  const [tM, setTM] = useState(0);
  const [tAp, setTAp] = useState('AM');
  const [pDay, setPDay] = useState(new Date());

  useEffect(() => {
    if (!editId) return;
    getTask(editId).then((t) => {
      if (!t) { navigation.goBack(); return; }
      setOriginal(t);
      setType(t.type); setTitle(t.title); setDescription(t.description || '');
      setDate(t.date); setStartTime(t.startTime); setEndTime(t.endTime);
      setAssigneesState(t.assignees || []); setPriority(t.priority);
      setLocation(t.location ? { address: t.location, coords: t.coords || null } : null);
      setChecklist(t.checklist || []);
      setLoaded(true);
    });
  }, [editId, navigation]);

  const draft = () => ({
    type, title, description, date, startTime, endTime, assignees, priority,
    location: location?.address || '', coords: location?.coords || null, checklist,
  });

  const pickEmployees = () => navigation.navigate('StaffTaskSelectEmployee', {
    selectedIds: assignees.map((a) => a.id), date, startTime, endTime, taskId: editId,
    onSelect: (list) => setAssigneesState(list),
  });
  const pickLocation = () => navigation.navigate('StaffTaskLocation', { initial: location, onConfirm: setLocation });
  const pickChecklist = () => navigation.navigate('StaffTaskChecklist', { items: checklist, onApply: setChecklist });

  const next = async () => {
    try { validateDraft(draft()); } catch (e) { notify('Check the task', e.message); return; }
    if (!editId) {
      navigation.navigate('StaffTaskReview', { draft: draft() });
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const d = draft();
      await updateTask(editId, {
        type, title: d.title.trim(), description: d.description.trim(), priority,
        location: d.location.trim(), coords: d.coords, checklist,
      });
      if (original.date !== date || original.startTime !== startTime || original.endTime !== endTime) {
        await rescheduleTask(editId, { date, startTime, endTime });
      }
      const ids = (xs) => xs.map((a) => a.id).sort().join(',');
      if (ids(original.assignees || []) !== ids(assignees)) await setAssignees(editId, assignees);
      notify('Task updated', 'Changes saved.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Could not save', e?.message || 'Try again.', { preset: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openTime = (which) => {
    const m = toMinutes(which === 'start' ? startTime : endTime) ?? 9 * 60;
    const h = Math.floor(m / 60);
    setTH(((h + 11) % 12) + 1);
    setTM(m % 60 - (m % 60) % 5);
    setTAp(h < 12 ? 'AM' : 'PM');
    setTimeOpen(which);
  };
  const applyTime = () => {
    const h24 = (tH % 12) + (tAp === 'PM' ? 12 : 0);
    const v = fromMinutes(h24 * 60 + tM);
    if (timeOpen === 'start') {
      setStartTime(v);
      // Keep End after Start.
      if ((toMinutes(endTime) ?? 0) <= h24 * 60 + tM) setEndTime(fromMinutes(Math.min(h24 * 60 + tM + 60, 23 * 60 + 55)));
    } else setEndTime(v);
    setTimeOpen(null);
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.page }}><TaskHeader title="Edit Task" onBack={() => navigation.goBack()} /></View>;

  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' } : null;
  const Label = ({ text, required, style }) => (
    <Text style={[{ marginTop: 10, marginBottom: 5, fontSize: 12.5, fontWeight: '700', color: C.ink }, style]}>
      {text}{required ? <Text style={{ color: C.red }}> *</Text> : null}
    </Text>
  );
  const box = { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' };
  const timeBad = (v) => v && !isTime24(v);
  const Segments = ({ options, value, onChange, labelOf, colorOf }) => (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const on = value === o;
        const color = colorOf ? colorOf(o) : C.primary;
        return (
          <Pressable key={String(o)} onPress={() => onChange(o)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 1.5 : 1, borderColor: on ? color : C.line, backgroundColor: on ? C.mint : C.card }}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: on ? color : C.muted }} numberOfLines={1}>{labelOf(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title={editId ? 'Edit Task' : 'Add New Task'} onBack={() => navigation.goBack()} />
      <KeyboardAwareScrollView bottomOffset={90} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 90 }}>
        <View style={col}>
          {/* Category */}
          <Label text="Task Category" required style={{ marginTop: 0 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
            {TASK_TYPES.map((k) => {
              const m = TYPE_META[k];
              const Icon = m.icon;
              const on = type === k;
              return (
                <View key={k} style={{ width: r.isTablet ? '14.28%' : '25%', padding: 3 }}>
                  {/* Home tool-tile look: solid colour disc, white solid glyph, Navy label.
                      Selected = teal ring round the disc + bold teal label. */}
                  <Pressable onPress={() => setType(k)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={m.label}
                    style={{ alignItems: 'center', paddingVertical: 4 }}>
                    <View style={{ padding: 2, borderRadius: 28, borderWidth: 2, borderColor: on ? C.primary : 'transparent' }}>
                      <View style={{ height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: m.color }}>
                        <Icon size={23} color="#FFFFFF" />
                      </View>
                    </View>
                    <Text style={{ marginTop: 3, fontSize: 12, fontWeight: on ? '800' : '600', color: on ? C.primary : '#1C3053', textAlign: 'center' }}
                      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{m.label}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <Label text="Task Title" required />
          <View style={box}>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Customer Delivery (Bus)" placeholderTextColor={C.subtle} maxLength={120}
              style={{ flex: 1, fontSize: 14, color: C.ink, paddingVertical: 8 }} />
          </View>

          <Label text="Description" />
          <View style={[box, { alignItems: 'flex-start' }]}>
            <TextInput value={description} onChangeText={setDescription} placeholder="What needs to be done" placeholderTextColor={C.subtle} multiline maxLength={500}
              style={{ flex: 1, minHeight: 54, fontSize: 14, color: C.ink, paddingVertical: 8, textAlignVertical: 'top' }} />
          </View>

          {/* Date · Start · End (24-hour) */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1.4 }}>
              <Label text="Date" required />
              <Pressable onPress={() => { setPDay(parseDay(date)); setDateOpen(true); }} style={box} accessibilityRole="button">
                <CalendarDays size={15} color={C.ink} />
                <Text style={{ flex: 1, marginLeft: 6, fontSize: 13, color: C.ink }} numberOfLines={1}>{formatDay(date)}</Text>
              </Pressable>
            </View>
            {[['start', 'Start', startTime], ['end', 'End', endTime]].map(([k, l, v]) => (
              <View key={k} style={{ flex: 1 }}>
                <Label text={l} required />
                <Pressable onPress={() => openTime(k)} accessibilityRole="button" accessibilityLabel={`${l} time ${v}`}
                  style={[box, { paddingVertical: 3 }, timeBad(v) ? { borderColor: C.red } : null]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }}>{v || '--:--'}</Text>
                    <Text style={{ fontSize: 10, color: C.muted }}>{to12(v)}</Text>
                  </View>
                  <ChevronDown size={14} color={C.muted} />
                </Pressable>
              </View>
            ))}
          </View>
          {(timeBad(startTime) || timeBad(endTime)) ? (
            <Text style={{ marginTop: 4, fontSize: 11, color: C.red }}>Choose a start and end time.</Text>
          ) : isTime24(startTime) && isTime24(endTime) && toMinutes(endTime) <= toMinutes(startTime) ? (
            <Text style={{ marginTop: 4, fontSize: 11, color: C.red }}>End time must be after the start time.</Text>
          ) : null}

          {/* Employees */}
          <Label text="Assign Employee" required />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {assignees.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingLeft: 3, paddingRight: 8, paddingVertical: 3, backgroundColor: C.mint, borderWidth: 1, borderColor: C.primary }}>
                <Avatar person={a} size={22} />
                <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '700', color: C.primary }} numberOfLines={1}>{a.name}</Text>
                <Pressable onPress={() => setAssigneesState((l) => l.filter((x) => x.id !== a.id))} hitSlop={8} accessibilityLabel={`Remove ${a.name}`} style={{ marginLeft: 4 }}>
                  <X size={13} color={C.primary} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickEmployees} accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: C.primary }}>
              <Plus size={13} color={C.primary} />
              <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '700', color: C.primary }}>{assignees.length ? 'Add / Change' : 'Select employees'}</Text>
            </Pressable>
          </View>

          <Label text="Priority" />
          <Segments options={PRIORITIES} value={priority} onChange={setPriority} labelOf={(o) => PRIORITY_META[o].label} colorOf={(o) => PRIORITY_META[o].color} />


          {/* Location + checklist rows */}
          <Label text="Location / Notes" />
          <Pressable onPress={pickLocation} style={box} accessibilityRole="button">
            <MapPin size={16} color={location ? C.primary : C.muted} />
            <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, color: location ? C.ink : C.subtle, paddingVertical: 9 }} numberOfLines={2}>
              {location?.address || 'Optional — search, current location or type'}
            </Text>
            {location ? (
              <Pressable onPress={() => setLocation(null)} hitSlop={10} accessibilityLabel="Clear location"><X size={15} color={C.muted} /></Pressable>
            ) : <ChevronRight size={16} color={C.muted} />}
          </Pressable>

          <Label text="Checklist (optional)" />
          <Pressable onPress={pickChecklist} style={box} accessibilityRole="button">
            <ClipboardCheck size={16} color={checklist.length ? C.primary : C.muted} />
            <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, color: checklist.length ? C.ink : C.subtle, paddingVertical: 9 }} numberOfLines={1}>
              {checklist.length ? `${checklist.length} steps · ${checklist[0].text}${checklist.length > 1 ? '…' : ''}` : 'Choose a template or add steps'}
            </Text>
            <ChevronRight size={16} color={C.muted} />
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
        <Pressable onPress={next} disabled={saving} accessibilityRole="button"
          style={[{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: saving ? '#9CA3AF' : C.primary }, col]}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{saving ? 'Saving…' : editId ? 'Save Changes' : 'Review Task'}</Text>
        </Pressable>
      </View>

      <ResponsiveModal visible={!!timeOpen} onClose={() => setTimeOpen(null)} maxWidth={420}>
        <View style={{ padding: 14 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{timeOpen === 'start' ? 'Start time' : 'End time'}</Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: C.primary, fontWeight: '800' }}>
            {fromMinutes(((tH % 12) + (tAp === 'PM' ? 12 : 0)) * 60 + tM)}
            <Text style={{ color: C.muted, fontWeight: '600' }}>{`  ·  ${String(tH).padStart(2, '0')}:${String(tM).padStart(2, '0')} ${tAp}`}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, height: 220 }}>
            {[
              ['Hour', HOURS12, tH, setTH, (v) => String(v).padStart(2, '0')],
              ['Min', MINUTES, tM, setTM, (v) => String(v).padStart(2, '0')],
              ['', ['AM', 'PM'], tAp, setTAp, (v) => v],
            ].map(([lbl, opts, val, set, fmt]) => (
              <View key={lbl || 'ap'} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
                {lbl ? <Text style={{ textAlign: 'center', paddingVertical: 4, fontSize: 11, fontWeight: '700', color: C.muted, backgroundColor: C.page }}>{lbl}</Text> : <Text style={{ textAlign: 'center', paddingVertical: 4, fontSize: 11, fontWeight: '700', color: C.muted, backgroundColor: C.page }}>AM/PM</Text>}
                <ScrollView>
                  {opts.map((o) => {
                    const on = o === val;
                    return (
                      <Pressable key={String(o)} onPress={() => set(o)} accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={{ paddingVertical: 9, alignItems: 'center', backgroundColor: on ? C.primary : C.card }}>
                        <Text style={{ fontSize: 15, fontWeight: on ? '800' : '600', color: on ? '#FFFFFF' : C.ink }}>{fmt(o)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable onPress={() => setTimeOpen(null)} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={applyTime} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Set Time</Text>
            </Pressable>
          </View>
        </View>
      </ResponsiveModal>

      <ResponsiveModal visible={dateOpen} onClose={() => setDateOpen(false)} maxWidth={420} edgeToEdge>
        <MaterialDatePicker title="Task date" day={pDay} onDayChange={setPDay} minDay={editId ? undefined : new Date()}
          onCancel={() => setDateOpen(false)} onOk={() => { setDate(dayKey(pDay)); setDateOpen(false); }} />
      </ResponsiveModal>
    </View>
  );
}
