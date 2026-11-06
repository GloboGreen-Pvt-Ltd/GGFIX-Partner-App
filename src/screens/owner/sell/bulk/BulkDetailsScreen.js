import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ShieldCheck } from 'lucide-react-native';
import { confirm, notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import {
  C, FieldLabel, PickerModal, PrimaryButton, Segmented, SelectField, SellScreen, TextField,
} from '../kit';
import {
  ACCESSORY_INCLUDED, CONDITION_CHOICES, DESCRIPTION_MAX, DESCRIPTION_MIN, WARRANTY_OPTIONS, sharedConditionKey, useBulkDraft, warrantyLabel,
} from './bulkDraft';
import {
  DraftLoading, NoBatch, STEP_LABELS, TOTAL_STEPS,
} from './BulkUi';

// Page 4 — Condition & Description: details that apply to every item in the
// batch. Condition is written to each variant (they can still differ — the
// chip then shows none selected); warranty, accessories and the description
// are added to every listing.

export default function BulkDetailsScreen({ navigation }) {
  const { draft, ready, set, patch } = useBulkDraft();
  const [picker, setPicker] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  if (!ready) return <DraftLoading title="Condition & Description" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Condition & Description" navigation={navigation} />;

  const d = draft.details || { warrantyMonths: 0, accessories: [], description: '' };
  const shared = sharedConditionKey(draft);
  const desc = d.description || '';
  const descError = desc.trim().length < DESCRIPTION_MIN ? `Describe the batch (at least ${DESCRIPTION_MIN} characters)` : null;

  const setCondition = async (value) => {
    const choice = CONDITION_CHOICES.find((c) => c.value === value);
    if (!choice || value === shared) return;
    const editable = draft.rows.filter((r) => !r.result?.productId);
    if (shared == null && editable.length > 1) {
      const ok = await confirm({ title: `Set ${choice.label} for all?`, message: `Your ${editable.length} variants have different conditions. All of them will be set to ${choice.label}.`, confirmText: 'Apply to All' });
      if (!ok) return;
    }
    const c = { itemCondition: choice.itemCondition, conditionGrade: choice.conditionGrade };
    set((s) => ({ ...s, template: { ...s.template, ...c }, rows: s.rows.map((r) => (r.result?.productId ? r : { ...r, ...c })) }));
  };

  const toggleAccessory = (a) => {
    const has = (d.accessories || []).includes(a);
    patch('details', { accessories: has ? d.accessories.filter((x) => x !== a) : [...(d.accessories || []), a] });
  };

  const next = () => {
    if (descError) { setShowErrors(true); notify('Add a description', descError); return; }
    navigation.navigate('BulkPhotos');
  };

  return (
    <SellScreen
      title="Condition & Description"
      onBack={() => navigation.goBack()}
      step={4}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      footer={<PrimaryButton title="Continue" onPress={next} />}
    >
      <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 6 }}>
        General Details <Text style={{ fontSize: rf(12), fontWeight: '500', color: C.muted }}>(Apply to all items)</Text>
      </Text>

      <View style={{ marginTop: 12 }}>
        <FieldLabel label="Condition" required />
        <Segmented options={CONDITION_CHOICES} value={shared} onChange={setCondition} columns={3} />
        {shared == null ? <Text style={{ fontSize: rf(11), color: C.amber, marginTop: 6 }}>Variants have different conditions — pick one to apply to all, or keep them as set.</Text> : null}
      </View>

      <SelectField label="Warranty" icon={ShieldCheck} value={warrantyLabel(d.warrantyMonths)} onPress={() => setPicker(true)} style={{ marginTop: 14 }} />

      <View style={{ marginTop: 14 }}>
        <FieldLabel label="Accessories Included" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {ACCESSORY_INCLUDED.map((a) => {
            const on = (d.accessories || []).includes(a);
            return (
              <Pressable key={a} onPress={() => toggleAccessory(a)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={a}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                <View style={{ height: 20, width: 20, borderRadius: 5, borderWidth: 2, borderColor: on ? C.green : '#C9CED6', backgroundColor: on ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
                <Text style={{ fontSize: rf(12.5), color: C.text, marginLeft: 6 }}>{a}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label="Description"
        required
        value={desc}
        onChangeText={(v) => patch('details', { description: v.slice(0, DESCRIPTION_MAX) })}
        placeholder="e.g. Original devices, fully working, minor usage marks, battery health above 85%."
        multiline
        maxLength={DESCRIPTION_MAX}
        counter
        error={showErrors ? descError : null}
        inputStyle={{ minHeight: 96 }}
        style={{ marginTop: 14 }}
      />

      <PickerModal
        visible={picker}
        title="Warranty"
        options={WARRANTY_OPTIONS}
        selectedId={String(d.warrantyMonths || 0)}
        searchable={false}
        onSelect={(o) => { setPicker(false); patch('details', { warrantyMonths: Number(o.id) }); }}
        onClose={() => setPicker(false)}
      />
    </SellScreen>
  );
}
