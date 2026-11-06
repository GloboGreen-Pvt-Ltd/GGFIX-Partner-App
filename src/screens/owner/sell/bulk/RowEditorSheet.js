import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { HardDrive, MemoryStick, Package, Palette, Smartphone, Tag } from 'lucide-react-native';
import { rf } from '../../../../utils/responsive';
import {
  C, FieldError, FieldLabel, PickerModal, PrimaryButton, QtyStepper, Segmented, SelectField, TextField,
} from '../kit';
import {
  ACCESSORY_TYPES, BATCH, CONDITIONS, GRADES, LISTING, MAX_QTY, PART_QUALITY, PART_TYPES, rowTitle, validateRow,
} from './bulkDraft';
import {
  loadBrands, loadModelOptions, loadModels, toOptions, useLoad,
} from './catalog';
import { Sheet } from './BulkUi';

const NONE = '__none';
const TYPES = [
  { value: LISTING.DEVICE, label: 'Device' },
  { value: LISTING.SPARE_PART, label: 'Spare Part' },
  { value: LISTING.ACCESSORY, label: 'Accessory' },
];
const SPEC_RESET = { ramOptionId: null, ramLabel: null, storageOptionId: null, storageLabel: null };
const noneOpt = { id: NONE, label: 'Not specified' };

/**
 * Add / edit one bulk row. onSave(row, { another }) — `another` asks the
 * parent to open a fresh row right after (Save & Add Another).
 */
export default function RowEditorSheet({ visible, draft, row: initial, isNew, onClose, onSave }) {
  const [row, setRow] = useState(initial);
  const [errors, setErrors] = useState({});
  const [picker, setPicker] = useState(null);

  useEffect(() => {
    if (visible && initial) { setRow(initial); setErrors({}); setPicker(null); }
  }, [visible, initial]);

  const t = draft.template;
  const cur = row || initial || {};
  const isDevice = cur.listingType === LISTING.DEVICE;
  const sameModel = draft.batchType === BATCH.SAME_MODEL;
  const mixed = draft.batchType === BATCH.CSV;
  const modelFromSeries = !!t.seriesId && cur.brandId === t.brandId;

  const brands = useLoad(() => loadBrands(t.categoryId || null), [t.categoryId], { enabled: visible && picker === 'brand', initial: [] });
  const models = useLoad(
    () => loadModels({ categoryId: t.categoryId, brandId: cur.brandId, seriesId: modelFromSeries ? t.seriesId : null }),
    [t.categoryId, cur.brandId, modelFromSeries, t.seriesId],
    { enabled: visible && picker === 'model' && !!cur.brandId, initial: [] },
  );
  const options = useLoad(() => loadModelOptions(isDevice ? cur.modelId || null : null), [isDevice, cur.modelId], { enabled: visible });

  if (!row) return null;

  const up = (values) => {
    setRow((r) => ({ ...r, ...values }));
    const keys = Object.keys(values);
    if (keys.some((k) => errors[k] || (k === 'modelName' && errors.model) || (k === 'itemCondition' && errors.condition))) {
      setErrors((e) => {
        const n = { ...e };
        keys.forEach((k) => { delete n[k]; });
        if (keys.includes('modelName')) delete n.model;
        if (keys.includes('itemCondition')) delete n.condition;
        return n;
      });
    }
  };

  const opts = options.data || {};
  const specs = isDevice && row.modelId ? opts.specs || [] : [];
  const colorList = isDevice && (opts.colors || []).length ? opts.colors : opts.allColors || [];
  const hasImei = isDevice && !!String(row.imei || '').trim();
  const showImei = isDevice && row.itemCondition !== 'NEW';
  const specLabel = (s) => (s.storageOnly ? s.storageLabel : `${s.ramLabel} + ${s.storageLabel}`);
  const currentSpec = specs.find((s) => s.storageOptionId === row.storageOptionId && (s.storageOnly || s.ramOptionId === row.ramOptionId));

  const pickers = {
    brand: {
      title: 'Brand', load: brands, selectedId: row.brandId,
      options: [...(isDevice ? [] : [noneOpt]), ...toOptions(brands.data)],
      emptyText: 'No brands mapped to this category yet.',
      onSelect: (o) => (o.id === NONE
        ? up({ brandId: null, brandName: null })
        : up({ brandId: o.id, brandName: o.label, ...(isDevice ? { seriesId: null, seriesName: null, modelId: null, modelName: null, modelImageUrl: null, color: null, ...SPEC_RESET } : {}) })),
    },
    model: {
      title: 'Model', load: models, selectedId: row.modelId,
      options: toOptions(models.data), emptyText: 'No models found for this brand.',
      onSelect: (o) => up({
        modelId: o.id, modelName: o.label, modelImageUrl: o.row?.imageUrl || null,
        seriesId: o.row?.seriesId || null, seriesName: o.row?.seriesId && o.row.seriesId === t.seriesId ? t.seriesName : null,
        color: null, ...SPEC_RESET,
      }),
    },
    color: {
      title: 'Colour', load: options, selectedId: row.color,
      options: [noneOpt, ...colorList.map((c) => ({ id: c.name, label: c.name }))],
      emptyText: 'No colours configured.',
      onSelect: (o) => up({ color: o.id === NONE ? null : o.id }),
    },
    spec: {
      title: 'Variant', load: options, selectedId: currentSpec?.id,
      options: [noneOpt, ...specs.map((s) => ({ id: s.id, label: specLabel(s), row: s }))],
      onSelect: (o) => up(o.id === NONE ? SPEC_RESET : {
        ramOptionId: o.row.ramOptionId, ramLabel: o.row.ramLabel, storageOptionId: o.row.storageOptionId, storageLabel: o.row.storageLabel,
      }),
    },
    ram: {
      title: 'RAM', load: options, selectedId: row.ramOptionId,
      options: [noneOpt, ...(opts.allRams || []).map((r) => ({ id: r.id, label: r.label || `${r.valueGb} GB` }))],
      emptyText: 'No RAM options yet.',
      onSelect: (o) => up(o.id === NONE ? { ramOptionId: null, ramLabel: null } : { ramOptionId: o.id, ramLabel: o.label }),
    },
    storage: {
      title: 'Storage', load: options, selectedId: row.storageOptionId,
      options: [noneOpt, ...(opts.allStorages || []).map((s) => ({ id: s.id, label: s.label || `${s.valueGb} GB` }))],
      emptyText: 'No storage options yet.',
      onSelect: (o) => up(o.id === NONE ? { storageOptionId: null, storageLabel: null } : { storageOptionId: o.id, storageLabel: o.label }),
    },
    partType: {
      title: 'Part Type', load: null, selectedId: row.partType,
      options: [noneOpt, ...PART_TYPES.map((x) => ({ id: x, label: x }))],
      onSelect: (o) => up({ partType: o.id === NONE ? null : o.id }),
    },
    accessoryType: {
      title: 'Accessory Type', load: null, selectedId: row.accessoryType,
      options: [noneOpt, ...ACCESSORY_TYPES.map((x) => ({ id: x, label: x }))],
      onSelect: (o) => up({ accessoryType: o.id === NONE ? null : o.id }),
    },
  };
  const active = picker ? pickers[picker] : null;

  const setType = (listingType) => {
    if (listingType === row.listingType) return;
    setErrors({});
    up({ listingType, imei: '', ...(listingType === LISTING.ACCESSORY ? { modelId: null, modelName: null, modelImageUrl: null } : {}) });
  };

  const save = (another) => {
    const clean = {
      ...row,
      title: String(row.title || '').trim(),
      imei: isDevice ? String(row.imei || '').replace(/\D/g, '') : '',
      variant: String(row.variant || '').trim(),
      quantity: Number(row.quantity) || 1,
    };
    const e = validateRow(clean, draft.rows);
    if (Object.keys(e).length) { setErrors(e); return; }
    // An edited row starts fresh: import notes and an earlier failure no longer apply.
    onSave({ ...clean, notes: [], result: clean.result?.productId ? clean.result : null }, { another });
  };

  const autoTitle = rowTitle({ ...row, title: '' });

  return (
    <Sheet
      visible={visible}
      title={isNew ? 'Add Item' : 'Edit Item'}
      onClose={onClose}
      footer={isNew ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton title="Save & Add Another" variant="outline" onPress={() => save(true)} style={{ flex: 1 }} />
          <PrimaryButton title="Add Item" onPress={() => save(false)} style={{ flex: 1 }} />
        </View>
      ) : (
        <PrimaryButton title="Save Changes" onPress={() => save(false)} />
      )}
    >
      {mixed ? (
        <View style={{ marginTop: 8 }}>
          <FieldLabel label="Listing Type" required />
          <Segmented options={TYPES} value={row.listingType} onChange={setType} />
        </View>
      ) : null}

      {isDevice ? (
        <>
          {sameModel ? (
            <View style={{ marginTop: 12 }}>
              <FieldLabel label="Model" />
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, backgroundColor: C.field, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
                <Smartphone size={17} color={C.teal} style={{ marginRight: 8 }} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(13), fontWeight: '700', color: C.text }}>{[row.brandName, row.modelName].filter(Boolean).join(' ') || '—'}</Text>
              </View>
              <FieldError error={errors.model} />
            </View>
          ) : (
            <>
              <SelectField label="Brand" required icon={Tag} value={row.brandName} placeholder="Select brand" onPress={() => setPicker('brand')} />
              <SelectField
                label="Model" required icon={Smartphone} value={row.modelName}
                placeholder={row.brandId ? 'Select model' : 'Select a brand first'} disabled={!row.brandId}
                hint={row.modelName && !row.modelId ? '(Not in catalogue)' : undefined}
                onPress={() => setPicker('model')} error={errors.model}
              />
            </>
          )}
          {specs.length ? (
            <SelectField label="Variant" hint="(RAM + Storage)" icon={HardDrive} value={currentSpec ? specLabel(currentSpec) : [row.ramLabel, row.storageLabel].filter(Boolean).join(' + ')} placeholder="Select variant" onPress={() => setPicker('spec')} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SelectField label="RAM" icon={MemoryStick} value={row.ramLabel} placeholder="RAM" onPress={() => setPicker('ram')} style={{ flex: 1 }} />
              <SelectField label="Storage" icon={HardDrive} value={row.storageLabel} placeholder="Storage" onPress={() => setPicker('storage')} style={{ flex: 1 }} />
            </View>
          )}
          <SelectField label="Colour" icon={Palette} value={row.color} placeholder="Select colour" onPress={() => setPicker('color')} />
          <TextField
            label="Listing Title" hint="(Optional)" value={row.title} onChangeText={(v) => up({ title: v })}
            placeholder={autoTitle} maxLength={90}
          />
        </>
      ) : (
        <>
          <TextField
            label={row.listingType === LISTING.SPARE_PART ? 'Part Name' : 'Accessory Name'} required
            value={row.title} onChangeText={(v) => up({ title: v })} maxLength={90} error={errors.title}
            placeholder={row.listingType === LISTING.SPARE_PART ? 'e.g., Display Combo for iPhone 12' : 'e.g., Type-C Cable (1m)'}
          />
          {row.listingType === LISTING.SPARE_PART ? (
            <>
              <SelectField label="Part Type" icon={Package} value={row.partType} placeholder="Select part type" onPress={() => setPicker('partType')} />
              <View style={{ marginTop: 12 }}>
                <FieldLabel label="Quality" hint="(Optional)" />
                <Segmented options={PART_QUALITY} value={row.partQuality} onChange={(v) => up({ partQuality: v === row.partQuality ? null : v })} />
              </View>
              <TextField
                label="Compatible Model" hint="(Optional)" value={row.modelName || ''} maxLength={80}
                onChangeText={(v) => up({ modelName: v, modelId: v === t.modelName ? t.modelId : null })}
                placeholder="e.g., iPhone 12, iPhone 12 Pro"
              />
            </>
          ) : (
            <>
              <SelectField label="Accessory Type" icon={Package} value={row.accessoryType} placeholder="Select accessory type" onPress={() => setPicker('accessoryType')} />
              <TextField label="Specification" hint="(Optional)" value={row.variant} onChangeText={(v) => up({ variant: v })} maxLength={40} placeholder="e.g., 1m, 20W, Standard" />
              <SelectField label="Brand" hint="(Optional)" icon={Tag} value={row.brandName} placeholder="Select brand" onPress={() => setPicker('brand')} />
            </>
          )}
          <SelectField label="Colour" hint="(Optional)" icon={Palette} value={row.color} placeholder="Select colour" onPress={() => setPicker('color')} />
        </>
      )}

      <View style={{ marginTop: 14 }}>
        <FieldLabel label="Condition" required />
        <Segmented
          options={CONDITIONS}
          value={row.itemCondition}
          onChange={(v) => up({ itemCondition: v, ...(v === 'NEW' ? { imei: '' } : {}) })}
        />
        {row.itemCondition === 'USED' ? (
          <Segmented options={GRADES} value={row.conditionGrade} onChange={(v) => up({ conditionGrade: v })} style={{ marginTop: 8 }} />
        ) : null}
        <FieldError error={errors.condition} />
      </View>

      {showImei ? (
        <TextField
          label="IMEI" hint="(Optional — single unit)" value={row.imei}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 15);
            up({ imei: digits, ...(digits && Number(row.quantity) > 1 ? { quantity: 1 } : {}) });
          }}
          keyboardType="number-pad" maxLength={15} placeholder="15-digit IMEI" error={errors.imei}
        />
      ) : null}

      <View style={{ marginTop: 14 }}>
        <FieldLabel label="Quantity" required hint={hasImei ? '(1 for a device with an IMEI)' : undefined} />
        <QtyStepper value={row.quantity} onChange={(v) => up({ quantity: v })} min={1} max={hasImei ? 1 : MAX_QTY} />
        <FieldError error={errors.quantity} />
      </View>

      {active ? (
        <PickerModal
          visible
          title={active.title}
          options={active.options}
          selectedId={active.selectedId}
          loading={active.load?.loading}
          error={active.load?.error}
          onRetry={active.load?.reload}
          emptyText={active.emptyText}
          onSelect={(o) => { setPicker(null); active.onSelect(o); }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </Sheet>
  );
}
