import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Boxes, Plus, Trash2 } from 'lucide-react-native';
import { confirm, notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import {
  C, EmptyBox, ErrorBox, PrimaryButton, SellScreen, StatusPill, Thumb, cleanAmount, money,
} from '../kit';
import {
  BATCH, BATCH_META, LISTING, MAX_QTY, MAX_ROWS, conditionChip, memoryLabel, newRow, rowSpecLine, rowTitle, useBulkDraft, validateRows,
} from './bulkDraft';
import RowEditorSheet from './RowEditorSheet';
import {
  DraftLoading, NoBatch, STEP_LABELS, TOTAL_STEPS,
} from './BulkUi';

// Page 3 — Add Bulk Items: one row per variant (colour / storage / condition)
// with its quantity and price. Add Variant opens the item editor; quantity and
// price are edited in the table.

const SWATCH = {
  black: '#1F2937', white: '#F3F4F6', blue: '#3B82F6', red: '#DC2626', green: '#16A34A', purple: '#8B5CF6', pink: '#F472B6',
  gold: '#D4AF37', silver: '#C0C4CC', grey: '#9CA3AF', gray: '#9CA3AF', yellow: '#FACC15', orange: '#F97316', midnight: '#1E293B', starlight: '#F5EEDC',
};
const swatchOf = (color) => SWATCH[String(color || '').trim().toLowerCase().split(/\s+/).pop()] || null;

/** "Blue · Good" for a same-model variant; the item title otherwise. */
function variantLabel(row, sameModel) {
  if (!sameModel || row.listingType !== LISTING.DEVICE) return rowTitle(row);
  const parts = [row.color, memoryLabel(row)].filter(Boolean).join(' · ');
  return [parts || 'Variant', conditionChip(row)].filter(Boolean).join(' · ');
}

function Cell({ value, onChange, label, width, error, prefix }) {
  return (
    <View style={{ width, height: 38, borderRadius: 8, borderWidth: 1, borderColor: error ? C.red : C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, backgroundColor: '#FFFFFF' }}>
      {prefix ? <Text style={{ fontSize: rf(12), color: C.muted }}>{prefix}</Text> : null}
      <TextInput
        value={String(value ?? '')}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={label === 'Quantity' ? 4 : 8}
        accessibilityLabel={label}
        placeholder="0"
        placeholderTextColor={C.faint}
        style={{ flex: 1, minWidth: 0, fontSize: rf(12.5), fontWeight: '700', color: C.text, textAlign: 'center', paddingVertical: 0 }}
      />
    </View>
  );
}

export default function BulkItemsScreen({ navigation, route }) {
  const { draft, ready, set } = useBulkDraft();
  const [editor, setEditor] = useState(null); // { row, isNew }

  const rowErrors = useMemo(() => (ready ? validateRows(draft) : {}), [ready, draft]);

  // "Use Quick Add Form" (CSV page) lands here with the editor open.
  useEffect(() => {
    if (!ready || !draft.batchType || !route.params?.openEditor) return;
    navigation.setParams({ openEditor: undefined });
    if (draft.rows.length < MAX_ROWS) setEditor({ row: newRow(draft), isNew: true });
  }, [ready, draft, route.params?.openEditor, navigation]);

  if (!ready) return <DraftLoading title="Add Bulk Items" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Add Bulk Items" navigation={navigation} />;

  const t = draft.template;
  const rows = draft.rows;
  const sameModel = draft.batchType === BATCH.SAME_MODEL;
  const full = rows.length >= MAX_ROWS;
  const errorCount = Object.keys(rowErrors).length;
  const totalQty = rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
  const totalValue = rows.reduce((n, r) => n + (Number(r.quantity) || 0) * (Number(r.price) || 0), 0);
  const heading = sameModel && t.modelName ? t.modelName : BATCH_META[draft.batchType]?.title || 'Items';

  const openNew = (base) => {
    if (full) { notify('Batch is full', `One batch can hold up to ${MAX_ROWS} items. Publish these first, then add more.`); return; }
    setEditor({ row: base || newRow(draft), isNew: true });
  };

  const onSave = (row, { another } = {}) => {
    const exists = draft.rows.some((r) => r.key === row.key);
    set((s) => ({ ...s, rows: exists ? s.rows.map((r) => (r.key === row.key ? row : r)) : [...s.rows, row].slice(0, MAX_ROWS) }));
    if (another && draft.rows.length + (exists ? 0 : 1) < MAX_ROWS) {
      // Same model / type / condition, fresh variant fields.
      setEditor({
        row: newRow(draft, {
          listingType: row.listingType, brandId: row.brandId, brandName: row.brandName, seriesId: row.seriesId, seriesName: row.seriesName,
          modelId: row.modelId, modelName: row.modelName, modelImageUrl: row.modelImageUrl,
          partType: row.partType, partQuality: row.partQuality, accessoryType: row.accessoryType,
          itemCondition: row.itemCondition, conditionGrade: row.conditionGrade,
        }),
        isNew: true,
      });
      notify('Variant added', '', { preset: 'done', duration: 2 });
    } else {
      setEditor(null);
      if (another) notify('Batch is full', `One batch can hold up to ${MAX_ROWS} items.`);
    }
  };

  const setCell = (key, field, text) => {
    const v = field === 'price' ? cleanAmount(text) : String(text).replace(/\D/g, '');
    const value = field === 'quantity' ? (v === '' ? '' : Math.min(MAX_QTY, Number(v))) : v;
    set((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, [field]: value, notes: [] } : r)) }));
  };

  const remove = async (row, index) => {
    const ok = await confirm({
      title: 'Remove variant?',
      message: `${variantLabel(row, sameModel)} (row ${index + 1}) and its photos will be removed from this batch.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (ok) set((s) => ({ ...s, rows: s.rows.filter((r) => r.key !== row.key) }));
  };

  const next = () => {
    if (!rows.length) { notify('Add a variant first', 'Add at least one variant to continue.'); return; }
    if (errorCount) {
      notify('Fix the marked rows', `${errorCount} variant${errorCount > 1 ? 's need' : ' needs'} attention before you continue.`);
      return;
    }
    navigation.navigate('BulkDetails');
  };

  return (
    <SellScreen
      title="Add Bulk Items"
      onBack={() => navigation.goBack()}
      step={3}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      footer={(
        <View style={{ gap: 10 }}>
          {rows.length ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.greenBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>{`Total Items: ${totalQty}`}</Text>
              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>{`Total Value: ${money(totalValue)}`}</Text>
            </View>
          ) : null}
          <PrimaryButton title="Continue" onPress={next} />
        </View>
      )}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Thumb uri={t.modelImageUrl} size={56} radius={10} />
        <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(14.5), fontWeight: '800', color: C.text, marginLeft: 12 }}>{heading}</Text>
        <PrimaryButton title={sameModel ? 'Add Variant' : 'Add Item'} icon={Plus} variant="outline" small disabled={full} onPress={() => openNew()} />
      </View>

      {errorCount ? <ErrorBox message={`${errorCount} row${errorCount > 1 ? 's have' : ' has'} missing or invalid details. Tap the row to fix it.`} /> : null}

      {!rows.length ? (
        <EmptyBox
          icon={Boxes}
          title={sameModel ? 'No variants yet' : 'No items yet'}
          sub={sameModel ? 'Add each colour / storage / condition with its quantity and price.' : 'Add each item with its quantity and price.'}
          action={sameModel ? 'Add Variant' : 'Add Item'}
          onAction={() => openNew()}
        />
      ) : (
        <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ flex: 1, fontSize: rf(11), fontWeight: '700', color: C.muted }}>{sameModel ? 'Variant (Color / Condition)' : 'Item'}</Text>
            <Text style={{ width: 48, fontSize: rf(11), fontWeight: '700', color: C.muted, textAlign: 'center' }}>Qty</Text>
            <Text style={{ width: 92, fontSize: rf(11), fontWeight: '700', color: C.muted, textAlign: 'center', marginLeft: 6 }}>Price (₹)</Text>
            <View style={{ width: 30 }} />
          </View>
          {rows.map((row, i) => {
            const locked = !!row.result?.productId;
            const errs = rowErrors[row.key] || [];
            const serverErrs = row.result?.outcome === 'FAILED' ? row.result.errors : [];
            const sw = swatchOf(row.color);
            return (
              <View key={row.key} style={{ paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F3F5', backgroundColor: errs.length || serverErrs.length ? '#FFF7F7' : '#FFFFFF' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable onPress={() => (locked ? null : setEditor({ row, isNew: false }))} accessibilityRole="button" accessibilityLabel={`Edit ${variantLabel(row, sameModel)}`}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    {sw ? (
                      <View style={{ height: 30, width: 30, borderRadius: 8, backgroundColor: sw, borderWidth: 1, borderColor: C.border }} />
                    ) : <Thumb uri={row.modelImageUrl || t.modelImageUrl} size={30} radius={8} />}
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                      <Text numberOfLines={2} style={{ fontSize: rf(12), fontWeight: '700', color: C.text }}>{variantLabel(row, sameModel)}</Text>
                      {!sameModel && rowSpecLine(row) ? <Text numberOfLines={1} style={{ fontSize: rf(10.5), color: C.muted, marginTop: 1 }}>{rowSpecLine(row)}</Text> : null}
                      {row.imei ? <Text style={{ fontSize: rf(10), color: C.muted, marginTop: 1 }}>{`IMEI ${row.imei}`}</Text> : null}
                    </View>
                  </Pressable>
                  {locked ? (
                    <StatusPill status={row.result.status} label={row.result.status === 'ACTIVE' ? 'Listed' : 'Draft'} />
                  ) : (
                    <>
                      <Cell width={48} label="Quantity" value={row.quantity} onChange={(v) => setCell(row.key, 'quantity', v)} error={errs.some((m) => /quantity/i.test(m))} />
                      <View style={{ marginLeft: 6 }}>
                        <Cell width={92} label="Price" prefix="₹" value={row.price} onChange={(v) => setCell(row.key, 'price', v)} />
                      </View>
                      <Pressable onPress={() => remove(row, i)} accessibilityRole="button" accessibilityLabel={`Remove ${variantLabel(row, sameModel)}`} hitSlop={6} style={{ width: 30, alignItems: 'flex-end' }}>
                        <Trash2 size={17} color={C.red} />
                      </Pressable>
                    </>
                  )}
                </View>
                {errs.map((m) => <Text key={m} style={{ fontSize: rf(10.5), color: C.red, marginTop: 4 }}>{m}</Text>)}
                {serverErrs.map((m) => <Text key={`s-${m}`} style={{ fontSize: rf(10.5), color: C.red, marginTop: 4 }}>{`Not saved: ${m}`}</Text>)}
                {(row.notes || []).map((m) => <Text key={`n-${m}`} style={{ fontSize: rf(10.5), color: C.amber, marginTop: 4 }}>{m}</Text>)}
              </View>
            );
          })}
        </View>
      )}

      <RowEditorSheet
        key={editor?.row?.key || 'closed'}
        visible={!!editor}
        draft={draft}
        row={editor?.row || null}
        isNew={!!editor?.isNew}
        onClose={() => setEditor(null)}
        onSave={onSave}
      />
    </SellScreen>
  );
}
