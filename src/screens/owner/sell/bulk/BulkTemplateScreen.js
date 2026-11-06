import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import {
  ArrowRight, Check, ClipboardPaste, Cpu, Download, FileSpreadsheet, Headphones, LayoutGrid, Laptop, Layers, LayoutTemplate, Package, Smartphone, Store,
  Tablet, Tag, Upload,
} from 'lucide-react-native';
import { confirm, notify } from '../../../../components/confirm';
import { getListingOrigin } from '../../../../api/nearbyListings';
import { rf } from '../../../../utils/responsive';
import {
  C, Card, ErrorBox, FieldError, FieldLabel, PickerModal, PrimaryButton, Segmented, SelectField, SellScreen, TextField,
} from '../kit';
import {
  ACCESSORY_TYPES, BATCH, BATCH_META, CONDITIONS, GRADES, MAX_ROWS, PART_TYPES, defaultListingType, useBulkDraft,
} from './bulkDraft';
import {
  depsKey, loadBrands, loadCategories, loadModels, loadSeries, toOptions, useLoad,
} from './catalog';
import { parseBulkSheet, sampleCsv } from './csv';
import { pickCsvText, shareTextFile } from './bulkFiles';
import { rowsFromSheet } from './sheetImport';
import {
  DraftLoading, MintBar, NoBatch, STEP_LABELS, Sheet, TOTAL_STEPS,
} from './BulkUi';

const NONE = '__none';
// Page 2 tiles. Device tiles map to master-data categories by name; Spare Parts
// and Accessory switch the batch type; Other lists every category.
const TILES = [
  { key: 'mobile', label: 'Mobile', Icon: Smartphone, match: /mobile|phone/i },
  { key: 'laptop', label: 'Laptop', Icon: Laptop, match: /laptop|notebook|macbook/i },
  { key: 'tablet', label: 'Tablet', Icon: Tablet, match: /tablet|ipad/i },
  { key: 'parts', label: 'Spare Parts', Icon: Cpu, batch: BATCH.SPARE_PARTS },
  { key: 'accessory', label: 'Accessory', Icon: Headphones, batch: BATCH.ACCESSORIES },
  { key: 'other', label: 'Other', Icon: LayoutGrid },
];
const DEVICE_BATCHES = [BATCH.SAME_MODEL, BATCH.MULTI_MODEL];

function CategoryTile({ tile, selected, onPress }) {
  const { Icon } = tile;
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={tile.label} className="active:opacity-80"
      style={{ flexBasis: '31%', flexGrow: 1, height: 84, borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? C.green : C.border, backgroundColor: selected ? '#F1FAF5' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={26} color={C.text} strokeWidth={1.6} />
      <Text style={{ fontSize: rf(12), color: C.text, marginTop: 8 }}>{tile.label}</Text>
      {selected ? (
        <View style={{ position: 'absolute', top: -6, right: -6, height: 22, width: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }}>
          <Check size={12} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}
const MODEL_RESET = { modelId: null, modelName: null, modelImageUrl: null };
// iOS can't present a picker / sheet while another modal is still closing.
const afterModal = (fn) => setTimeout(fn, Platform.OS === 'ios' ? 450 : 0);

export default function BulkTemplateScreen({ navigation, route }) {
  const { draft, ready, patch, set } = useBulkDraft();
  const t = draft.template;
  const batch = draft.batchType;
  const csvMode = batch === BATCH.CSV || !!route.params?.csv;
  const sameModel = batch === BATCH.SAME_MODEL;
  const parts = batch === BATCH.SPARE_PARTS;
  const accessories = batch === BATCH.ACCESSORIES;
  const catRequired = !parts && !accessories;
  const brandRequired = sameModel || batch === BATCH.MULTI_MODEL;
  const seriesRequired = sameModel && t.hasSeries === true;
  const modelRequired = sameModel;

  const [picker, setPicker] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState(null);
  const [preview, setPreview] = useState(null); // { name, parsed }
  const [importing, setImporting] = useState(false);

  const cats = useLoad(loadCategories, [], { enabled: ready && (!csvMode || picker === 'category'), initial: [] });
  const brands = useLoad(() => loadBrands(t.categoryId), [t.categoryId], { enabled: ready && picker === 'brand', initial: [] });
  const series = useLoad(() => loadSeries(t.categoryId, t.brandId), [t.categoryId, t.brandId], { enabled: ready && !!t.categoryId && !!t.brandId, initial: [] });
  const models = useLoad(
    () => loadModels({ categoryId: t.categoryId, brandId: t.brandId, seriesId: t.seriesId }),
    [t.categoryId, t.brandId, t.seriesId],
    { enabled: ready && picker === 'model', initial: [] },
  );
  const origin = useLoad(getListingOrigin, [], { enabled: ready });

  // Whether this brand has series in this category (no series → field skipped).
  useEffect(() => {
    if (!ready || !t.brandId) return;
    if (!t.categoryId) {
      if (t.hasSeries !== false) patch('template', { hasSeries: false });
      return;
    }
    if (series.loading || series.error || series.key !== depsKey([t.categoryId, t.brandId])) return;
    const has = (series.data || []).length > 0;
    if (t.hasSeries !== has) patch('template', { hasSeries: has });
  }, [ready, t.brandId, t.categoryId, t.hasSeries, series.loading, series.error, series.data, series.key, patch]);

  if (!ready) return <DraftLoading title="Category & Template" onBack={() => navigation.goBack()} />;
  if (!batch) return <NoBatch title="Category & Template" navigation={navigation} />;

  const csvRows = draft.rows.filter((r) => r.source === 'CSV').length;

  // ── Template changes ──────────────────────────────────────────────────────

  const applyTemplate = async (values) => {
    const modelChanged = 'modelId' in values && values.modelId !== t.modelId;
    const editable = draft.rows.filter((r) => !r.result?.productId);
    if (sameModel && modelChanged && editable.length) {
      const ok = await confirm({
        title: 'Change model for all items?',
        message: `${editable.length} item${editable.length > 1 ? 's' : ''} will switch to ${values.modelName || 'no model'}. Their colour and variant will be cleared.`,
        confirmText: 'Change',
      });
      if (!ok) return;
      const next = { ...t, ...values };
      set((s) => ({
        ...s,
        template: { ...s.template, ...values },
        rows: s.rows.map((r) => (r.result?.productId ? r : {
          ...r,
          brandId: next.brandId, brandName: next.brandName, seriesId: next.seriesId, seriesName: next.seriesName,
          modelId: next.modelId, modelName: next.modelName, modelImageUrl: next.modelImageUrl,
          color: null, ramOptionId: null, ramLabel: null, storageOptionId: null, storageLabel: null,
        })),
      }));
      return;
    }
    patch('template', values);
  };

  const selectCategory = (o) => applyTemplate(o.id === NONE
    ? { categoryId: null, categoryCode: null, categoryName: null, brandId: null, brandName: null, seriesId: null, seriesName: null, hasSeries: null, ...MODEL_RESET }
    : { categoryId: o.id, categoryCode: o.row?.code || null, categoryName: o.label, brandId: null, brandName: null, seriesId: null, seriesName: null, hasSeries: null, ...MODEL_RESET });
  const selectBrand = (o) => applyTemplate(o.id === NONE
    ? { brandId: null, brandName: null, seriesId: null, seriesName: null, hasSeries: null, ...MODEL_RESET }
    : { brandId: o.id, brandName: o.label, seriesId: null, seriesName: null, hasSeries: null, ...MODEL_RESET });
  const selectSeries = (o) => applyTemplate(o.id === NONE
    ? { seriesId: null, seriesName: null, ...MODEL_RESET }
    : { seriesId: o.id, seriesName: o.label, ...MODEL_RESET });
  const selectModel = (o) => applyTemplate(o.id === NONE
    ? MODEL_RESET
    : { modelId: o.id, modelName: o.label, modelImageUrl: o.row?.imageUrl || null });

  const withNone = (opts, optional, label = 'None') => (optional ? [{ id: NONE, label, sub: 'Leave empty' }, ...opts] : opts);

  const pickers = {
    category: {
      title: 'Category', load: cats, selectedId: t.categoryId, onSelect: selectCategory,
      options: withNone(toOptions(cats.data), !catRequired), emptyText: 'No categories yet.',
    },
    brand: {
      title: 'Brand', load: brands, selectedId: t.brandId, onSelect: selectBrand,
      options: withNone(toOptions(brands.data), !brandRequired), emptyText: 'No brands mapped to this category yet.',
    },
    series: {
      title: 'Series', load: series, selectedId: t.seriesId, onSelect: selectSeries,
      options: withNone(toOptions(series.data), !seriesRequired), emptyText: 'No series for this brand.',
    },
    model: {
      title: parts ? 'Compatible Model' : 'Model', load: models, selectedId: t.modelId, onSelect: selectModel,
      options: withNone(toOptions(models.data), !modelRequired), emptyText: 'No models found for this selection.',
    },
    partType: {
      title: 'Part Type', load: null, selectedId: t.partType,
      onSelect: (o) => patch('template', { partType: o.id === NONE ? null : o.id }),
      options: withNone(PART_TYPES.map((x) => ({ id: x, label: x })), true),
    },
    accessoryType: {
      title: 'Accessory Type', load: null, selectedId: t.accessoryType,
      onSelect: (o) => patch('template', { accessoryType: o.id === NONE ? null : o.id }),
      options: withNone(ACCESSORY_TYPES.map((x) => ({ id: x, label: x })), true),
    },
  };
  const active = picker ? pickers[picker] : null;

  // ── Page 2 tiles ──────────────────────────────────────────────────────────

  const catOpts = toOptions(cats.data);
  const catOf = (tile) => (tile.match ? catOpts.find((o) => tile.match.test(`${o.label} ${o.row?.code || ''}`)) : null);
  const deviceBatch = DEVICE_BATCHES.includes(batch);
  const multi = batch === BATCH.MULTI_MODEL;
  const tileOn = (tile) => {
    if (tile.batch) return batch === tile.batch;
    if (!deviceBatch || !t.categoryId) return false;
    if (tile.key === 'other') return !TILES.some((x) => x.match && catOf(x)?.id === t.categoryId);
    return catOf(tile)?.id === t.categoryId;
  };
  // Switching between devices / spare parts / accessories drops unsaved items of the other kind.
  const setBatch = async (type) => {
    if (type === batch) return true;
    const listingType = defaultListingType(type);
    const clash = draft.rows.filter((r) => !r.result?.productId && r.listingType !== listingType).length;
    if (clash) {
      const ok = await confirm({
        title: 'Change what you’re listing?',
        message: `${clash} item${clash > 1 ? 's' : ''} added for the current category will be removed.`,
        confirmText: 'Change',
        destructive: true,
      });
      if (!ok) return false;
    }
    set((s) => ({
      ...s,
      batchType: type,
      rows: s.rows.filter((r) => r.result?.productId || r.listingType === listingType),
      template: type === BATCH.ACCESSORIES ? { ...s.template, itemCondition: 'NEW' } : s.template,
    }));
    return true;
  };
  const pickTile = async (tile) => {
    if (tile.batch) { await setBatch(tile.batch); return; }
    if (!deviceBatch && !(await setBatch(BATCH.SAME_MODEL))) return;
    if (tile.key === 'other') { setPicker('category'); return; }
    const c = catOf(tile);
    if (!c) {
      notify(cats.loading ? 'Loading categories…' : `${tile.label} isn’t available yet`, cats.loading ? 'Try again in a moment.' : 'Choose Other to see every category.');
      return;
    }
    if (c.id !== t.categoryId) selectCategory(c);
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const errors = {};
  if (catRequired && !t.categoryId) errors.category = 'Select a category';
  if (brandRequired && !t.brandId) errors.brand = 'Select a brand';
  if (seriesRequired && !t.seriesId) errors.series = 'Select a series';
  if (modelRequired && !t.modelId) errors.model = 'Select the model';
  if (!t.itemCondition) errors.condition = 'Select the condition type';
  const valid = !Object.keys(errors).length;
  const err = (k) => (showErrors ? errors[k] : null);

  const requireValid = () => {
    if (valid) return true;
    setShowErrors(true);
    notify('Complete the template', Object.values(errors)[0]);
    return false;
  };

  // ── Sheet: sample, upload, paste, preview, import ─────────────────────────

  const downloadSample = async () => {
    setSampleBusy(true);
    try {
      await shareTextFile({ name: 'neargfix-bulk-sample.csv', text: sampleCsv() });
    } catch (e) {
      notify('Could not create the sample', e?.message || 'Please try again.');
    } finally {
      setSampleBusy(false);
    }
  };

  const openPreview = (text, name) => {
    const parsed = parseBulkSheet(text, { defaultListingType: defaultListingType(batch), maxRows: MAX_ROWS });
    setPreview({ name, parsed });
  };

  const uploadSheet = async () => {
    if (!requireValid()) return;
    setPicking(true);
    try {
      const file = await pickCsvText();
      if (file) openPreview(file.text, file.name);
    } catch (e) {
      if (e?.code === 'PICKER_UNAVAILABLE') {
        notify('CSV import needs the latest app build', 'You can paste the sheet text instead.');
        setPasteOpen(true);
      } else if (e?.code === 'EXCEL') {
        notify('Save the sheet as CSV', e.message);
      } else {
        notify('Could not read the sheet', e?.message || 'Please try again.');
      }
    } finally {
      setPicking(false);
    }
  };

  const readPasted = () => {
    if (!pasteText.trim()) { setPasteError('Paste the CSV text, starting with the header row'); return; }
    setPasteError(null);
    setPasteOpen(false);
    afterModal(() => openPreview(pasteText, 'Pasted sheet'));
  };

  const room = Math.max(0, MAX_ROWS - draft.rows.length);
  const parsed = preview?.parsed;
  const importable = parsed && !parsed.sheetErrors.length ? parsed.rows.slice(0, room) : [];
  const flagged = parsed ? parsed.rows.filter((r) => r.errors.length) : [];

  const doImport = async () => {
    if (!importable.length) return;
    setImporting(true);
    try {
      const rows = await rowsFromSheet(importable, draft);
      set((s) => ({ ...s, rows: [...s.rows, ...rows].slice(0, MAX_ROWS) }));
      setPreview(null);
      setPasteText('');
      notify(`${rows.length} item${rows.length > 1 ? 's' : ''} added`, parsed.rows.length > rows.length ? `Only ${MAX_ROWS} items fit in one batch.` : '', { preset: 'done' });
      navigation.navigate('BulkItems');
    } catch (e) {
      notify('Could not import the sheet', e?.message || 'Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const next = () => { if (requireValid()) navigation.navigate('BulkItems'); };
  const quickAdd = () => { if (requireValid()) navigation.navigate('BulkItems', { openEditor: true }); };
  const primaryIsUpload = csvMode && !draft.rows.length;

  const shopName = origin.data?.shopName;

  return (
    <SellScreen
      title={csvMode ? 'Category & Template' : 'Bulk Listing'}
      subtitle={csvMode ? BATCH_META[batch]?.title : undefined}
      onBack={() => navigation.goBack()}
      step={2}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      footer={!csvMode ? (
        <PrimaryButton title="Continue" iconRight={ArrowRight} onPress={next} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton title="Use Quick Add Form" variant="outline" onPress={quickAdd} style={{ flex: 1 }} />
          {primaryIsUpload ? (
            <PrimaryButton title="Upload Sheet" icon={Upload} loading={picking} onPress={uploadSheet} style={{ flex: 1 }} />
          ) : (
            <PrimaryButton title="Next" onPress={next} style={{ flex: 1 }} />
          )}
        </View>
      )}
    >
      {!csvMode ? (
        <>
          <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 6, marginBottom: 10 }}>Select Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {TILES.map((tile) => <CategoryTile key={tile.key} tile={tile} selected={tileOn(tile)} onPress={() => pickTile(tile)} />)}
          </View>
          {cats.error ? <ErrorBox message={cats.error} onRetry={cats.reload} /> : null}
          {deviceBatch && t.categoryId && tileOn(TILES[5]) ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 6 }}>{`Category: ${t.categoryName}`}</Text> : null}
          <FieldError error={err('category')} />

          <SelectField
            label="Brand" required={deviceBatch} hint={deviceBatch ? undefined : '(Optional)'} icon={Tag} value={t.brandName}
            placeholder={deviceBatch && !t.categoryId ? 'Select a category first' : 'Select brand'}
            disabled={deviceBatch && !t.categoryId} onPress={() => setPicker('brand')} error={err('brand')}
          />
          {t.hasSeries ? (
            <SelectField
              label="Series" required={seriesRequired} hint={seriesRequired ? undefined : '(Optional)'} icon={Layers} value={t.seriesName}
              placeholder={series.loading ? 'Loading…' : 'Select series'} disabled={!t.brandId || series.loading}
              onPress={() => setPicker('series')} error={err('series')}
            />
          ) : null}
          <SelectField
            label={parts ? 'Compatible Model' : t.hasSeries ? 'Model' : 'Model / Series'} required={modelRequired} hint={modelRequired ? undefined : '(Optional)'}
            icon={LayoutTemplate} value={t.modelName}
            placeholder={!t.brandId ? 'Select a brand first' : multi ? 'Optional — pick per item' : 'Select the model'}
            disabled={!t.brandId || (!!t.categoryId && t.hasSeries == null) || (seriesRequired && !t.seriesId)}
            onPress={() => setPicker('model')} error={err('model')}
          />
          {deviceBatch ? (
            <Pressable onPress={() => setBatch(multi ? BATCH.SAME_MODEL : BATCH.MULTI_MODEL)} accessibilityRole="checkbox" accessibilityState={{ checked: multi }}
              accessibilityLabel="Different models in this batch" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <View style={{ height: 20, width: 20, borderRadius: 5, borderWidth: 2, borderColor: multi ? C.green : '#C9CED6', backgroundColor: multi ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                {multi ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <Text style={{ flex: 1, fontSize: rf(12), color: C.text, marginLeft: 8 }}>Different models in this batch (choose the model per item)</Text>
            </Pressable>
          ) : null}
          {parts ? (
            <SelectField label="Part Type" hint="(Optional)" icon={Package} value={t.partType} placeholder="Select part type" onPress={() => setPicker('partType')} />
          ) : null}
          {accessories ? (
            <SelectField label="Accessory Type" hint="(Optional)" icon={Package} value={t.accessoryType} placeholder="Select accessory type" onPress={() => setPicker('accessoryType')} />
          ) : null}
        </>
      ) : (
      <>
      <SelectField
        label="Category" required={catRequired} hint={catRequired ? undefined : '(Optional)'} icon={Smartphone}
        value={t.categoryName} placeholder="Select category" onPress={() => setPicker('category')} error={err('category')}
      />
      <SelectField
        label="Brand" required={brandRequired}
        hint={brandRequired ? undefined : csvMode ? '(Optional — matches model names)' : '(Optional)'}
        icon={Tag} value={t.brandName} placeholder={catRequired && !t.categoryId ? 'Select a category first' : 'Select brand'}
        disabled={catRequired && !t.categoryId} onPress={() => setPicker('brand')} error={err('brand')}
      />
      <SelectField
        label="Series" required={seriesRequired}
        hint={t.hasSeries === false ? '(None for this brand)' : seriesRequired ? undefined : '(Optional)'}
        icon={Layers} value={t.seriesName}
        placeholder={!t.brandId ? 'Select a brand first' : series.loading ? 'Loading…' : t.hasSeries === false ? 'No series — skipped' : 'Select series'}
        disabled={!t.brandId || !t.categoryId || t.hasSeries === false || series.loading}
        onPress={() => setPicker('series')} error={err('series')}
      />
      <SelectField
        label={parts ? 'Compatible Model' : 'Model Template'} required={modelRequired}
        hint={modelRequired ? undefined : parts ? '(Optional)' : '(Optional — prefills new items)'}
        icon={LayoutTemplate} value={t.modelName}
        placeholder={!t.brandId ? 'Select a brand first' : sameModel ? 'Select the model' : 'Select a template'}
        disabled={!t.brandId || (!!t.categoryId && t.hasSeries == null) || (seriesRequired && !t.seriesId)}
        onPress={() => setPicker('model')} error={err('model')}
      />
      {parts ? (
        <SelectField label="Part Type" hint="(Optional)" icon={Package} value={t.partType} placeholder="Select part type" onPress={() => setPicker('partType')} />
      ) : null}
      {accessories ? (
        <SelectField label="Accessory Type" hint="(Optional)" icon={Package} value={t.accessoryType} placeholder="Select accessory type" onPress={() => setPicker('accessoryType')} />
      ) : null}

      <View style={{ marginTop: 14 }}>
        <FieldLabel label="Condition Type" required />
        <Segmented options={CONDITIONS} value={t.itemCondition} onChange={(v) => patch('template', { itemCondition: v })} />
        {t.itemCondition === 'USED' ? (
          <Segmented options={GRADES} value={t.conditionGrade} onChange={(v) => patch('template', { conditionGrade: v })} style={{ marginTop: 8 }} />
        ) : null}
        <FieldError error={err('condition')} />
      </View>

      <View style={{ marginTop: 14 }}>
        <FieldLabel label="Warehouse / Shop Location" />
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.field, paddingHorizontal: 12 }}>
          <Store size={17} color={C.teal} style={{ marginRight: 8 }} />
          {origin.loading ? (
            <ActivityIndicator size="small" color={C.teal} />
          ) : (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(13), fontWeight: '600', color: shopName ? C.text : C.faint }}>
              {shopName || (origin.error ? 'Could not load your shop' : 'Your active shop')}
            </Text>
          )}
        </View>
        {origin.error ? <ErrorBox message={origin.error} onRetry={origin.reload} /> : (
          <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 4 }}>Listings are posted from your active shop.</Text>
        )}
      </View>

      <Card style={{ marginTop: 18, backgroundColor: C.greenBg, borderColor: C.mintLine }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ height: 38, width: 38, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <FileSpreadsheet size={20} color={C.teal} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>Have a list ready?</Text>
            <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2, lineHeight: rf(16) }}>
              Download the sample sheet, fill it and upload it to add items in bulk. Excel (.xlsx) files aren’t supported — save as CSV.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PrimaryButton title="Download Sample" icon={Download} variant="outline" small loading={sampleBusy} onPress={downloadSample} style={{ flex: 1 }} />
          <PrimaryButton title="Upload Sheet" icon={Upload} variant="soft" small loading={picking} onPress={uploadSheet} style={{ flex: 1 }} />
        </View>
        <PrimaryButton
          title="Paste CSV text instead" icon={ClipboardPaste} variant="soft" small
          onPress={() => { if (requireValid()) setPasteOpen(true); }}
          style={{ marginTop: 8, backgroundColor: 'transparent', borderColor: 'transparent' }}
        />
      </Card>
      {csvRows ? <MintBar label={`${csvRows} item${csvRows > 1 ? 's' : ''} imported from a sheet`} /> : null}
      </>
      )}

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

      <Sheet
        visible={pasteOpen}
        title="Paste CSV"
        onClose={() => setPasteOpen(false)}
        footer={<PrimaryButton title="Read Sheet" onPress={readPasted} />}
      >
        <Text style={{ fontSize: rf(11.5), color: C.muted, lineHeight: rf(16) }}>
          Copy the cells from your sheet (including the header row: title, model, color, ram, storage, condition, quantity, price, imei, listingType) and paste them here.
        </Text>
        <TextField
          value={pasteText}
          onChangeText={(v) => { setPasteText(v); if (pasteError) setPasteError(null); }}
          placeholder={'title,model,color,ram,storage,condition,quantity,price,imei,listingType\n,iPhone 13,Blue,,128 GB,Used (Good),5,34000,,DEVICE'}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          inputStyle={{ minHeight: 180, fontSize: rf(12) }}
          error={pasteError}
        />
      </Sheet>

      <Sheet
        visible={!!preview}
        title="Import from sheet"
        onClose={() => (importing ? null : setPreview(null))}
        footer={parsed && !parsed.sheetErrors.length && importable.length ? (
          <PrimaryButton title={`Import ${importable.length} Item${importable.length > 1 ? 's' : ''}`} loading={importing} onPress={doImport} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton title="Paste Instead" variant="outline" onPress={() => { setPreview(null); afterModal(() => setPasteOpen(true)); }} style={{ flex: 1 }} />
            <PrimaryButton title="Choose File" onPress={() => { setPreview(null); afterModal(uploadSheet); }} style={{ flex: 1 }} />
          </View>
        )}
      >
        {parsed ? (
          <>
            <Text numberOfLines={1} style={{ fontSize: rf(12), color: C.muted }}>{preview.name}</Text>
            {parsed.sheetErrors.map((m) => <ErrorBox key={m} message={m} />)}
            {!parsed.sheetErrors.length ? (
              <>
                <MintBar label="Items found" value={parsed.rows.length} />
                {parsed.skipped.length ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 6 }}>{`${parsed.skipped.length} example row${parsed.skipped.length > 1 ? 's' : ''} skipped.`}</Text> : null}
                {parsed.rows.length > room ? (
                  <ErrorBox tone="warning" message={`This batch has room for ${room} more item${room === 1 ? '' : 's'} (max ${MAX_ROWS}). Only the first ${room} will be imported.`} />
                ) : null}
                {parsed.sheetWarnings.map((m) => <ErrorBox key={m} tone="warning" message={m} />)}
                {flagged.length ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>{`${flagged.length} row${flagged.length > 1 ? 's' : ''} need${flagged.length > 1 ? '' : 's'} fixing`}</Text>
                    <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>They’re imported and marked so you can fix them on the next screen.</Text>
                    {flagged.slice(0, 25).map((r) => (
                      <Text key={r.line} style={{ fontSize: rf(11.5), color: C.red, marginTop: 6, lineHeight: rf(16) }}>
                        {`Line ${r.line}: ${r.errors.join('; ')}`}
                      </Text>
                    ))}
                    {flagged.length > 25 ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 6 }}>{`…and ${flagged.length - 25} more`}</Text> : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </SellScreen>
  );
}
