import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ArrowRight, Smartphone } from 'lucide-react-native';
import {
  getDeviceCategories, getBrands, getBrandsForCategory, getSeriesForCategoryBrand, getModelsBySeries, getModelsByBrand,
  getModelOptions, getColors, getRamOptions, getStorageOptions,
} from '../../../api/masterData';
import { rf } from '../../../utils/responsive';
import { C, FieldLabel, PickerModal, PrimaryButton, Segmented, SelectField, SellScreen, TextField, reportErrors } from './kit';
import { LISTING_TYPES, useSellDraft, sellDraftStore } from './draft';
import DeviceDetailsScreen from '../service-booking-shop/DeviceDetailsScreen';

// Page 3 (step 1 of 4) — what exactly is being listed. Devices walk
// Category → Brand → Series → Model → Variant; spare parts add part type /
// quality / compatible models; accessories take type, name and brand.

const ITEM_CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'USED', label: 'Used' },
  { value: 'REFURBISHED', label: 'Refurbished' },
];
const PART_TYPES = ['Display / Screen', 'Battery', 'Back Panel / Housing', 'Camera', 'Charging Port / Board', 'Speaker / Mic', 'Motherboard', 'Buttons / Flex Cable', 'Other'];
const PART_QUALITY = [
  { value: 'ORIGINAL', label: 'Original' },
  { value: 'OEM', label: 'OEM' },
  { value: 'COMPATIBLE', label: 'Compatible' },
];
const ACCESSORY_TYPES = ['Charger / Adapter', 'Cable', 'Case / Cover', 'Screen Guard / Tempered Glass', 'Earphones / Headphones', 'Power Bank', 'Smartwatch Strap', 'Other'];

function imgOf(item) {
  const b64 = item?.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  return item?.imageUrl || null;
}
const opt = (rows, sub) => (rows || []).filter((r) => r && r.isActive !== false).map((r) => ({ id: r.id, label: r.name || r.label, sub: sub?.(r), image: imgOf(r), raw: r }));
const fixed = (labels) => labels.map((l) => ({ id: l, label: l }));

// Devices use the repair booking's Device Details picker (same design: category
// → brand → series → model → variant grids) in its SELL_WIZARD mode; spare
// parts and accessories keep the form below.
export default function SellStepDetailsScreen({ navigation }) {
  const { draft, ready } = useSellDraft();
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center' }}><ActivityIndicator color={C.teal} /></View>;
  }
  return draft.listingType === LISTING_TYPES.DEVICE
    ? <DeviceStep navigation={navigation} draft={draft} />
    : <PartAccessoryDetails navigation={navigation} />;
}

const onlyUuid = (v) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')) ? v : null);

function DeviceStep({ navigation, draft }) {
  const p = draft.product;
  // Built once: the picker keeps its own state while mounted, and a saved or
  // edited listing comes back through its editMode prefill.
  const [params] = useState(() => ({
    flow: 'SELL_WIZARD',
    title: draft.editingId ? 'Edit Product Details' : 'Add Product Details',
    subtitle: 'Step 1 of 4 • Product info',
    categoryId: p.categoryId || undefined,
    editMode: !!p.modelId,
    brandId: p.brandId || undefined,
    modelId: p.modelId || undefined,
    color: p.color || undefined,
    ramOptionId: p.ramOptionId || undefined,
    storageOptionId: p.storageOptionId || undefined,
    modelNumber: p.modelNumber || undefined,
    onWizardNext: (d) => {
      sellDraftStore.patch('product', {
        categoryId: onlyUuid(d.categoryId), categoryCode: d.categoryCode || null, categoryName: d.categoryName || null,
        brandId: onlyUuid(d.brandId), brandName: d.brandName || null,
        seriesId: onlyUuid(d.seriesId), seriesName: d.seriesName || null,
        modelId: onlyUuid(d.modelId), modelName: d.modelName || null,
        modelNumber: d.modelNumber || null, modelImageUrl: d.modelImageUrl || null,
        color: d.color || null,
        ramOptionId: onlyUuid(d.ramOptionId), ramLabel: d.ramLabel || null,
        storageOptionId: onlyUuid(d.storageOptionId), storageLabel: d.storageLabel || null,
      });
      navigation.navigate('SellStepCondition');
    },
  }));
  return <DeviceDetailsScreen navigation={navigation} route={{ key: 'SellStepDetails-device', name: 'SellStepDetails', params }} />;
}

function PartAccessoryDetails({ navigation }) {
  const { draft, ready } = useSellDraft();
  const p = draft.product;
  const type = draft.listingType;
  const isDevice = type === LISTING_TYPES.DEVICE;
  const isPart = type === LISTING_TYPES.SPARE_PART;
  const isAccessory = type === LISTING_TYPES.ACCESSORY;
  const set = (values) => sellDraftStore.patch('product', values);

  const [picker, setPicker] = useState(null); // { kind, title }
  const [options, setOptions] = useState([]);
  const [optLoading, setOptLoading] = useState(false);
  const [optError, setOptError] = useState(null);
  const [hasSeries, setHasSeries] = useState(null); // null = unknown
  const [modelOpts, setModelOpts] = useState(null);
  const [errors, setErrors] = useState({});
  const optSeq = useRef(0);

  // Does this (category, brand) pair use series? Decides whether Series shows.
  useEffect(() => {
    if (!ready || !p.brandId || (!p.categoryId && !isPart)) { setHasSeries(null); return undefined; }
    if (!p.categoryId) { setHasSeries(false); return undefined; }
    let alive = true;
    getSeriesForCategoryBrand(p.categoryId, p.brandId)
      .then((rows) => { if (alive) setHasSeries(rows.length > 0); })
      .catch(() => { if (alive) setHasSeries(false); });
    return () => { alive = false; };
  }, [ready, p.categoryId, p.brandId, isPart]);

  // The model's configured variants / colours / model numbers.
  useEffect(() => {
    if (!ready || !p.modelId) { setModelOpts(null); return undefined; }
    let alive = true;
    getModelOptions(p.modelId).then((o) => { if (alive) setModelOpts(o); }).catch(() => { if (alive) setModelOpts(null); });
    return () => { alive = false; };
  }, [ready, p.modelId]);

  const loaders = {
    category: async () => opt(await getDeviceCategories()),
    brand: async () => opt(p.categoryId && !isAccessory ? await getBrandsForCategory(p.categoryId) : await getBrands()),
    series: async () => opt(await getSeriesForCategoryBrand(p.categoryId, p.brandId)),
    model: async () => opt(p.seriesId ? await getModelsBySeries(p.seriesId) : await getModelsByBrand(p.brandId), (m) => m.modelNumber || null),
    spec: async () => (modelOpts?.specs || []).map((s) => ({ id: s.id, label: s.label, raw: s })),
    color: async () => (modelOpts?.colors?.length ? modelOpts.colors : await getColors()).map((c) => ({ id: c.id || c.name, label: c.name })),
    ram: async () => opt(modelOpts?.allRams?.length ? modelOpts.allRams : await getRamOptions()),
    storage: async () => opt(modelOpts?.allStorages?.length ? modelOpts.allStorages : await getStorageOptions()),
    modelNumber: async () => fixed([...(modelOpts?.modelNumbers || []), ...(modelOpts?.otherNumbers || [])]),
    partType: async () => fixed(PART_TYPES),
    accessoryType: async () => fixed(ACCESSORY_TYPES),
  };

  const loadOptions = useCallback(async (kind) => {
    // Only the latest picker's answer may land (a slow brand list must not fill the model picker).
    const id = ++optSeq.current;
    setOptLoading(true);
    setOptError(null);
    try {
      const list = await loaders[kind]();
      if (id === optSeq.current) setOptions(list);
    } catch (e) {
      if (id !== optSeq.current) return;
      setOptions([]);
      setOptError(e?.message || 'Could not load options.');
    } finally {
      if (id === optSeq.current) setOptLoading(false);
    }
  }, [p.categoryId, p.brandId, p.seriesId, modelOpts, isAccessory]);

  const open = (kind, title) => {
    setPicker({ kind, title });
    setOptions([]);
    loadOptions(kind);
  };

  // Picking a level clears everything below it.
  const CLEAR_MODEL = { modelId: null, modelName: null, modelNumber: null, modelImageUrl: null, ramOptionId: null, ramLabel: null, storageOptionId: null, storageLabel: null, color: null };
  const onSelect = (o) => {
    const kind = picker.kind;
    setPicker(null);
    setErrors((e) => ({ ...e, [kind]: null }));
    switch (kind) {
      case 'category':
        if (o.id !== p.categoryId) set({ categoryId: o.id, categoryCode: (o.raw?.code || '').toUpperCase(), categoryName: o.label, brandId: null, brandName: null, seriesId: null, seriesName: null, ...CLEAR_MODEL });
        break;
      case 'brand':
        if (o.id !== p.brandId) set({ brandId: o.id, brandName: o.label, seriesId: null, seriesName: null, ...CLEAR_MODEL });
        break;
      case 'series':
        if (o.id !== p.seriesId) set({ seriesId: o.id, seriesName: o.label, ...CLEAR_MODEL });
        break;
      case 'model':
        if (o.id !== p.modelId) set({ ...CLEAR_MODEL, modelId: o.id, modelName: o.label, modelImageUrl: imgOf(o.raw), modelNumber: o.raw?.modelNumber ? String(o.raw.modelNumber).split(/[,/]/)[0].trim() : null });
        break;
      case 'spec':
        set({ ramOptionId: o.raw.ramOptionId, ramLabel: o.raw.ramLabel, storageOptionId: o.raw.storageOptionId, storageLabel: o.raw.storageLabel });
        break;
      case 'ram':
        set({ ramOptionId: o.id, ramLabel: o.label });
        break;
      case 'storage':
        set({ storageOptionId: o.id, storageLabel: o.label });
        break;
      case 'color':
        set({ color: o.label });
        break;
      case 'modelNumber':
        set({ modelNumber: o.label });
        break;
      case 'partType':
        set({ partType: o.label });
        break;
      case 'accessoryType':
        set({ accessoryType: o.label });
        break;
      default:
    }
  };

  const specs = modelOpts?.specs || [];
  const specLabel = p.ramLabel || p.storageLabel ? [p.ramLabel, p.storageLabel].filter(Boolean).join(' / ') : null;
  const modelNumbers = [...(modelOpts?.modelNumbers || []), ...(modelOpts?.otherNumbers || [])];
  const imei = String(p.imei || '').replace(/\s/g, '');

  const validate = () => {
    const e = {};
    if (isDevice) {
      if (!p.categoryId) e.category = 'Select a category';
      if (!p.brandId) e.brand = 'Select a brand';
      if (hasSeries && !p.seriesId) e.series = 'Select a series';
      if (!p.modelId) e.model = 'Select a model';
      if (specs.length && !p.storageLabel) e.spec = 'Select a variant';
      if (!specs.length && p.modelId && !p.storageLabel) e.storage = 'Select storage';
      if (imei && !/^\d{15}$/.test(imei)) e.imei = 'IMEI must be 15 digits';
    }
    if (isPart) {
      if (!p.partType) e.partType = 'Select the part type';
      if (!p.partName.trim()) e.partName = 'Enter the part name';
      if (!p.brandId) e.brand = 'Select a brand';
      if (!p.modelId) e.model = 'Select the model it fits';
      if (!p.partQuality) e.partQuality = 'Select part quality';
    }
    if (isAccessory) {
      if (!p.accessoryType) e.accessoryType = 'Select the accessory type';
      if (!p.accessoryName.trim()) e.accessoryName = 'Enter the accessory name';
    }
    if (!p.itemCondition) e.itemCondition = 'Select the condition type';
    setErrors(e);
    return reportErrors(e);
  };

  const next = () => {
    if (!validate()) return;
    if (imei !== p.imei) set({ imei });
    navigation.navigate('SellStepCondition');
  };

  const deviceTitle = draft.editingId ? 'Edit Product Details' : isPart ? 'Add Spare Part Details' : isAccessory ? 'Add Accessory Details' : 'Add Product Details';

  return (
    <SellScreen
      title={deviceTitle}
      subtitle="Step 1 of 4 • Product info"
      step={2}
      stepLabels={['Device', 'Details', 'Photos', 'Price', 'Publish']}
      onBack={() => navigation.goBack()}
      footer={<PrimaryButton title="Next" iconRight={ArrowRight} onPress={next} disabled={!ready} />}
    >
      {isPart ? (
        <>
          <SelectField label="Part Type" required value={p.partType} placeholder="Select part type" onPress={() => open('partType', 'Part Type')} error={errors.partType} />
          <TextField label="Part Name" required value={p.partName} onChangeText={(t) => { set({ partName: t }); setErrors((e) => ({ ...e, partName: null })); }} placeholder="e.g. OLED Display with Frame" maxLength={80} error={errors.partName} />
        </>
      ) : null}
      {isAccessory ? (
        <>
          <SelectField label="Accessory Type" required value={p.accessoryType} placeholder="Select accessory type" onPress={() => open('accessoryType', 'Accessory Type')} error={errors.accessoryType} />
          <TextField label="Accessory Name" required value={p.accessoryName} onChangeText={(t) => { set({ accessoryName: t }); setErrors((e) => ({ ...e, accessoryName: null })); }} placeholder="e.g. 20W USB-C Fast Charger" maxLength={80} error={errors.accessoryName} />
        </>
      ) : null}

      {!isAccessory ? (
        <SelectField label="Category" required={isDevice} hint={isPart ? '(Optional)' : null} icon={Smartphone} value={p.categoryName} placeholder="Select category" onPress={() => open('category', 'Category')} error={errors.category} />
      ) : null}
      <SelectField
        label="Brand"
        required={!isAccessory}
        hint={isAccessory ? '(Optional)' : null}
        value={p.brandName}
        placeholder="Select brand"
        disabled={isDevice && !p.categoryId}
        onPress={() => open('brand', 'Brand')}
        error={errors.brand}
      />
      {!isAccessory && hasSeries ? (
        <SelectField label="Series" required={isDevice} value={p.seriesName} placeholder="Select series" disabled={!p.brandId} onPress={() => open('series', 'Series')} error={errors.series} />
      ) : null}
      {!isAccessory ? (
        <SelectField
          label={isPart ? 'Compatible Model' : 'Model'}
          required
          value={p.modelName}
          placeholder="Select model"
          disabled={!p.brandId || (hasSeries && !p.seriesId)}
          onPress={() => open('model', isPart ? 'Compatible Model' : 'Model')}
          error={errors.model}
        />
      ) : null}

      {isDevice && p.modelId ? (
        specs.length ? (
          <SelectField label="Variant / Specs" required value={specLabel} placeholder="Select RAM & storage" onPress={() => open('spec', 'Variant')} error={errors.spec} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SelectField style={{ flex: 1 }} label="RAM" hint="(Optional)" value={p.ramLabel} placeholder="Select" onPress={() => open('ram', 'RAM')} />
            <SelectField style={{ flex: 1 }} label="Storage" required value={p.storageLabel} placeholder="Select" onPress={() => open('storage', 'Storage')} error={errors.storage} />
          </View>
        )
      ) : null}

      {isDevice && p.modelId ? (
        modelNumbers.length > 1 ? (
          <SelectField label="Model Number" hint="(Optional)" value={p.modelNumber} placeholder="Select model number" onPress={() => open('modelNumber', 'Model Number')} />
        ) : (
          <TextField label="Model Number" hint="(Optional)" value={p.modelNumber || ''} onChangeText={(t) => set({ modelNumber: t })} placeholder="e.g. A2848" maxLength={40} autoCapitalize="characters" />
        )
      ) : null}

      {(isDevice && p.modelId) || isAccessory ? (
        <SelectField label="Color" hint="(Optional)" value={p.color} placeholder="Select color" onPress={() => open('color', 'Color')} />
      ) : null}

      {isPart ? (
        <>
          <TextField label="Also Fits" hint="(Optional)" value={p.compatibleModels} onChangeText={(t) => set({ compatibleModels: t })} placeholder="Other compatible models, comma separated" maxLength={160} />
          <View style={{ marginTop: 14 }}>
            <FieldLabel label="Part Quality" required />
            <Segmented options={PART_QUALITY} value={p.partQuality} onChange={(v) => { set({ partQuality: v }); setErrors((e) => ({ ...e, partQuality: null })); }} />
            {errors.partQuality ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{errors.partQuality}</Text> : null}
          </View>
        </>
      ) : null}
      {isAccessory ? (
        <TextField label="Compatible With" hint="(Optional)" value={p.compatibleModels} onChangeText={(t) => set({ compatibleModels: t })} placeholder="e.g. iPhone 13 / 14 / 15" maxLength={160} />
      ) : null}

      {isDevice && p.modelId ? (
        <TextField label="IMEI / Serial" hint="(Optional)" value={p.imei} onChangeText={(t) => { set({ imei: t.replace(/[^0-9]/g, '') }); setErrors((e) => ({ ...e, imei: null })); }} placeholder="15-digit IMEI" keyboardType="number-pad" maxLength={15} error={errors.imei} />
      ) : null}

      <View style={{ marginTop: 14 }}>
        <FieldLabel label="Condition Type" required />
        <Segmented options={ITEM_CONDITIONS} value={p.itemCondition} onChange={(v) => { set({ itemCondition: v }); setErrors((e) => ({ ...e, itemCondition: null })); }} />
        {errors.itemCondition ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{errors.itemCondition}</Text> : null}
      </View>

      <PickerModal
        visible={!!picker}
        title={picker?.title}
        options={options}
        loading={optLoading}
        error={optError}
        onRetry={() => picker && loadOptions(picker.kind)}
        onSelect={onSelect}
        onClose={() => setPicker(null)}
        selectedId={picker ? {
          category: p.categoryId, brand: p.brandId, series: p.seriesId, model: p.modelId, ram: p.ramOptionId, storage: p.storageOptionId,
          spec: specs.find((s) => s.storageLabel === p.storageLabel && (s.ramLabel || null) === (p.ramLabel || null))?.id,
          color: options.find((o) => o.label === p.color)?.id, modelNumber: p.modelNumber, partType: p.partType, accessoryType: p.accessoryType,
        }[picker.kind] : null}
        emptyText={picker?.kind === 'brand' ? 'No brands are mapped to this category yet.' : picker?.kind === 'model' ? 'No models found for this selection.' : 'Nothing to choose from yet.'}
      />
    </SellScreen>
  );
}
