import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import { rf } from '../../../../utils/responsive';
import { C } from '../kit';
import { BATCH, pendingRows } from './bulkDraft';

// Shared pieces of the Bulk Listing (Excel) flow (Same Model / Multiple Models):
// Bulk Listing → 1 Template → 2 Upload → 3 Review → 4 Photos → 5 Publish →
// Creating → Completed. State lives in the bulk draft.

export const STEPS = ['Template', 'Upload', 'Review', 'Photos', 'Publish'];
export const flowTitle = (d) => `Bulk Listing – ${d?.batchType === BATCH.MULTI_MODEL ? 'Multiple Models' : 'Same Model'}`;

export const FLOW_TYPES = [BATCH.SAME_MODEL, BATCH.MULTI_MODEL];
export const isFlowBatch = (d) => FLOW_TYPES.includes(d?.batchType);
export const isSame = (d) => d?.batchType === BATCH.SAME_MODEL;

/** The single item of a Same Model batch. */
export const sameRow = (d) => (d?.rows || [])[0] || null;

export function totals(d) {
  const rows = pendingRows(d);
  return { items: rows.length, qty: rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0) };
}

/** Where an unfinished Same / Multiple batch picks up again. */
export function flowResumeRoute(d) {
  if (d.rows.length && d.rows.every((r) => r.result)) return 'BulkFlowDone';
  return d.rows.length ? 'BulkExcelReview' : 'BulkExcelTemplate';
}

/** 1 Template · 2 Upload · 3 Review · 4 Photos · 5 Publish — done steps get a check. */
export function FlowSteps({ step }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 6 }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ height: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
              {i > 0 ? <View style={{ position: 'absolute', left: 0, right: '50%', height: 2, backgroundColor: n <= step ? C.green : C.border }} /> : null}
              {i < STEPS.length - 1 ? <View style={{ position: 'absolute', left: '50%', right: 0, height: 2, backgroundColor: n < step ? C.green : C.border }} /> : null}
              <View style={{ height: cur ? 28 : 24, width: cur ? 28 : 24, borderRadius: 14, borderWidth: 1.5, borderColor: done || cur ? C.green : '#C9CED6', backgroundColor: cur ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                {done ? <Check size={13} color={C.green} strokeWidth={3} /> : <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: cur ? '#FFFFFF' : C.text }}>{n}</Text>}
              </View>
            </View>
            <Text style={{ fontSize: rf(10.5), fontWeight: cur ? '800' : '500', color: cur ? C.green : C.muted, marginTop: 4 }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Two green tabs, e.g. Enter Manually | Upload CSV. */
export function FlowTabs({ tabs, value, onChange, style }) {
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: C.field, borderRadius: 12, padding: 4 }, style]}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
            style={{ flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: on ? C.green : 'transparent' }}>
            <Text style={{ fontSize: rf(12), fontWeight: '800', color: on ? '#FFFFFF' : C.text, textAlign: 'center' }}>{t.label}</Text>
            {t.sub ? <Text style={{ fontSize: rf(10), color: on ? 'rgba(255,255,255,0.9)' : C.muted, textAlign: 'center' }}>{t.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Selectable option card with a check (Same Model / Multiple Models). */
export function MethodCard({ Icon, title, tag, sub, example, selected, onPress, style }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={title} className="active:opacity-85"
      style={[{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: selected ? 2 : 1, borderColor: selected ? C.green : C.border, backgroundColor: selected ? C.greenBg : '#FFFFFF', padding: 14 }, style]}>
      <View style={{ height: 46, width: 46, borderRadius: 12, backgroundColor: selected ? '#FFFFFF' : C.mint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={24} color={C.green} />
      </View>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
        {tag ? <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: C.text, marginTop: 1 }}>{tag}</Text> : null}
        {sub ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 3 }}>{sub}</Text> : null}
        {example ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{example}</Text> : null}
      </View>
      {selected ? (
        <View style={{ height: 24, width: 24, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
          <Check size={15} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : <ChevronRight size={20} color={C.muted} style={{ marginLeft: 8 }} />}
    </Pressable>
  );
}

/** Radio row (fulfilment, buyer category). */
export function RadioRow({ title, sub, selected, onPress, right, children, style }) {
  return (
    <View style={[{ borderRadius: 12, borderWidth: 1, borderColor: selected ? C.green : C.border, backgroundColor: selected ? '#F4FBF8' : '#FFFFFF', marginTop: 8 }, style]}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={title}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? C.green : '#C9CED6', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: C.green }} /> : null}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: rf(13), fontWeight: '700', color: C.text }}>{title}</Text>
          {sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{sub}</Text> : null}
        </View>
        {right}
      </Pressable>
      {children}
    </View>
  );
}

/** "Label ........ value" line used on review pages. */
export function KeyLine({ label, value, bold, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}>
      <Text style={{ flex: 1, fontSize: rf(12.5), color: C.muted }}>{label}</Text>
      <Text style={{ fontSize: rf(12.5), fontWeight: bold ? '800' : '700', color: C.text, textAlign: 'right', maxWidth: '62%' }}>{value}</Text>
    </View>
  );
}
