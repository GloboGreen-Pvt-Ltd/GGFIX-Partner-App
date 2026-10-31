import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X, ClipboardCheck } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { CHECKLIST_TEMPLATES } from './checklistTemplates';
import { C, TaskHeader, cardShadow } from './staffTaskUi';

let seq = 0;
const item = (text) => ({ id: `new_${Date.now()}_${seq++}`, text, done: false });

/**
 * Optional checklist: start from a template, then edit / remove / add steps.
 * params: { items, onApply(items) }
 */
export default function StaffTaskChecklistScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const p = route?.params || {};
  const [items, setItems] = useState(() => (p.items || []).map((c) => ({ ...c })));
  const [template, setTemplate] = useState(null);
  const [newText, setNewText] = useState('');

  const useTemplate = (t) => { setTemplate(t.key); setItems(t.items.map(item)); };
  const setText = (id, text) => setItems((l) => l.map((c) => (c.id === id ? { ...c, text } : c)));
  const add = () => { const t = newText.trim(); if (!t) return; setItems((l) => [...l, item(t)]); setNewText(''); };
  const apply = () => { p.onApply?.(items.filter((c) => c.text.trim())); navigation.goBack(); };

  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' } : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title="Checklist Template" onBack={() => navigation.goBack()} />
      <KeyboardAwareScrollView bottomOffset={90} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}>
        <View style={col}>
          <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: '800', color: C.ink }}>Templates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CHECKLIST_TEMPLATES.map((t) => {
              const on = template === t.key;
              return (
                <Pressable key={t.key} onPress={() => useTemplate(t)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: on ? C.primary : C.card, borderWidth: 1, borderColor: on ? C.primary : C.line }}>
                  <ClipboardCheck size={13} color={on ? '#FFFFFF' : C.primary} />
                  <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '700', color: on ? '#FFFFFF' : C.ink }}>{t.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.ink }}>Steps ({items.length})</Text>
            {items.length ? (
              <Pressable onPress={() => { setItems([]); setTemplate(null); }} hitSlop={8}><Text style={{ fontSize: 12, fontWeight: '700', color: C.red }}>Clear all</Text></Pressable>
            ) : null}
          </View>
          {items.map((c, i) => (
            <View key={c.id} style={[{ flexDirection: 'row', alignItems: 'center', minHeight: 42, marginBottom: 6, borderRadius: 12, paddingHorizontal: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, cardShadow]}>
              <Text style={{ width: 20, fontSize: 12, fontWeight: '800', color: C.primary }}>{i + 1}.</Text>
              <TextInput value={c.text} onChangeText={(v) => setText(c.id, v)} maxLength={120}
                style={{ flex: 1, fontSize: 13.5, color: C.ink, paddingVertical: 8 }} />
              <Pressable onPress={() => setItems((l) => l.filter((x) => x.id !== c.id))} hitSlop={10} accessibilityLabel="Remove step">
                <X size={16} color={C.muted} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 42, borderRadius: 12, paddingHorizontal: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
            <TextInput value={newText} onChangeText={setNewText} onSubmitEditing={add} returnKeyType="done" placeholder="Add a custom step" placeholderTextColor={C.subtle} maxLength={120}
              style={{ flex: 1, fontSize: 13.5, color: C.ink, paddingVertical: 8 }} />
            <Pressable onPress={add} hitSlop={10} accessibilityLabel="Add step"><Plus size={18} color={C.primary} /></Pressable>
          </View>
          <Text style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Optional. Employees can tick steps; finishing them isn't required to complete the task.</Text>
        </View>
      </KeyboardAwareScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
        <Pressable onPress={apply} accessibilityRole="button"
          style={[{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }, col]}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{items.length ? `Use Checklist (${items.filter((c) => c.text.trim()).length})` : 'No Checklist'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
