import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowRight, CircleCheck, List, SquarePen, TriangleAlert } from 'lucide-react-native';
import { rf } from '../../../../utils/responsive';
import { C, PrimaryButton, SellScreen, money } from '../kit';
import { pendingRows, useBulkDraft } from './bulkDraft';
import { FlowSteps, flowTitle, isSame } from './BulkFlowKit';
import { DraftLoading, NoBatch } from './BulkUi';

// Step 3 — Validate & Preview: total / valid / error rows from the sheet.
// Only valid rows continue; error rows are listed with their reason.

function Stat({ Icon, label, value, tone }) {
  const fg = tone === 'red' ? C.red : C.green;
  return (
    <View style={{ flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: tone === 'red' ? '#F6C9C4' : C.border, backgroundColor: tone === 'red' ? C.redBg : '#FFFFFF', paddingVertical: 10 }}>
      <Icon size={18} color={fg} />
      <Text style={{ fontSize: rf(11.5), color: tone === 'red' ? C.red : C.text, marginTop: 4 }}>{label}</Text>
      <Text style={{ fontSize: rf(19), fontWeight: '900', color: tone === 'red' ? C.red : C.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

export default function BulkExcelReviewScreen({ navigation }) {
  const { draft, ready } = useBulkDraft();
  const [tab, setTab] = useState('VALID');
  if (!ready) return <DraftLoading title="Bulk Listing" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Bulk Listing" navigation={navigation} />;

  const same = isSame(draft);
  const rows = pendingRows(draft);
  const errors = draft.sheet?.errors || [];
  const total = draft.sheet?.total ?? rows.length + errors.length;
  const reasons = [...new Set(errors.map((e) => e.reason.replace(/".*?"/g, '').replace(/\s+/g, ' ').trim()))].slice(0, 3).join(', ');
  const detail = (r) => (same ? [r.storageLabel, r.color].filter(Boolean).join(' · ') : [r.modelName, r.storageLabel, r.color].filter(Boolean).join(' · '));

  const head = (cols) => (
    <View style={{ flexDirection: 'row', backgroundColor: C.field, paddingHorizontal: 10, paddingVertical: 8 }}>
      {cols.map(([t, style]) => <Text key={t} style={[{ fontSize: rf(11.5), fontWeight: '800', color: C.text }, style]}>{t}</Text>)}
    </View>
  );

  return (
    <SellScreen title={flowTitle(draft)} onBack={() => navigation.goBack()}
      footer={(
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton title="Edit Excel" icon={SquarePen} variant="outline" style={{ flex: 1 }} onPress={() => navigation.navigate('BulkExcelUpload')} />
          <PrimaryButton title="Next" iconRight={ArrowRight} variant="green" style={{ flex: 1 }} disabled={!rows.length} onPress={() => navigation.navigate('BulkFlowPhotos')} />
        </View>
      )}>
      <FlowSteps step={3} />
      <Text style={{ fontSize: rf(19), fontWeight: '900', color: C.text, marginTop: 14 }}>Validate & Preview</Text>
      {draft.sheet?.name ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>{draft.sheet.name}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Stat Icon={List} label="Total Rows" value={total} />
        <Stat Icon={CircleCheck} label="Valid" value={rows.length} />
        <Stat Icon={TriangleAlert} label="Errors" value={errors.length} tone="red" />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        {[['VALID', `Valid Items (${rows.length})`], ['ERROR', `Error Items (${errors.length})`]].map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.green : '#FFFFFF', borderWidth: 1, borderColor: on ? C.green : C.border }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 12, overflow: 'hidden' }}>
        {tab === 'VALID' ? (
          <>
            {head([['#', { width: 26 }], [same ? 'Variant / Details' : 'Product / Details', { flex: 1 }], ['Qty', { width: 40, textAlign: 'center' }], ['Price', { width: 76, textAlign: 'right' }]])}
            {rows.map((r, i) => (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F1F3F5' }}>
                <Text style={{ width: 26, fontSize: rf(12.5), color: C.text }}>{i + 1}</Text>
                <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(12.5), color: C.text }}>{detail(r) || '—'}</Text>
                <Text style={{ width: 40, fontSize: rf(12.5), color: C.text, textAlign: 'center' }}>{r.quantity}</Text>
                <Text style={{ width: 76, fontSize: rf(12.5), color: C.text, textAlign: 'right' }}>{money(r.price)}</Text>
              </View>
            ))}
            {!rows.length ? <Text style={{ fontSize: rf(12.5), color: C.muted, padding: 14 }}>No valid rows — fix the file and upload it again.</Text> : null}
          </>
        ) : (
          <>
            {head([['Line', { width: 40 }], ['Product', { flex: 1 }], ['Error', { flex: 1.2 }]])}
            {errors.map((e) => (
              <View key={`${e.line}-${e.reason}`} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F1F3F5' }}>
                <Text style={{ width: 40, fontSize: rf(12.5), color: C.text }}>{e.line}</Text>
                <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(12.5), color: C.text }}>{e.details}</Text>
                <Text style={{ flex: 1.2, fontSize: rf(12), color: C.red }}>{e.reason}</Text>
              </View>
            ))}
            {!errors.length ? <Text style={{ fontSize: rf(12.5), color: C.muted, padding: 14 }}>No errors.</Text> : null}
          </>
        )}
      </View>

      {errors.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 12, borderWidth: 1, borderColor: '#F6DDA8', padding: 12, marginTop: 14 }}>
          <TriangleAlert size={22} color={C.amber} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{`${errors.length} row${errors.length > 1 ? 's have' : ' has'} errors`}</Text>
            <Text style={{ fontSize: rf(11.5), color: C.text, marginTop: 2 }}>{`(${reasons})`}</Text>
            <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>These rows won’t be listed. Fix them in Excel and upload again, or continue with the valid rows.</Text>
          </View>
        </View>
      ) : null}
    </SellScreen>
  );
}
