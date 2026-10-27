import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardList, FileText, Plus, PowerOff, Search, Smartphone, Wrench, X } from 'lucide-react-native';
import { ResponsiveModal } from '../../../components/responsive';
import { rf, rs } from '../../../utils/responsive';
import DeviceImage from '../../../components/DeviceImage';
import ImageViewerModal from '../../../components/ImageViewerModal';
import { resolveDeviceImageSource } from '../../../utils/images';
import {
  categoryMenuKey, getBrandsForCategory, getCategoryMenuImages, getDeviceCategories,
  getModelOptions, getModelsByBrand, getSeriesForCategoryBrand, parseModelNumbers,
} from '../../../api/masterData';
import useDeviceSpecForm from '../../../lib/hooks/useDeviceSpecForm';
import { SPEC_ATTRIBUTE_KEYS, formatSpecValue, resolveSpecCategory, specDisplayParts, usesCategorySpecs } from '../../../utils/deviceSpecs';

/**
 * Device Details — one screen for Category → Brand → Series → Model → Color /
 * Storage, replacing the category sheet + Select Brand + Select Model + Your
 * Device steps of a new booking. Next hands DeviceServices exactly the params
 * DeviceColorStorage's Continue / Skip produced, so the rest of the flow is
 * unchanged. Category art comes from the admin Category Menu
 * (master_category_menu, REPAIR rows).
 *
 * Color / Storage stay optional, as they were behind the old screen's Skip.
 * A brand or model that isn't in the catalogue is typed through "Use …" in its
 * picker (customBrand / customModel, modelId null) — same as the old "Other".
 */

const ACCENT = '#035C6C';
const ACCENT_TEXT = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const PLACEHOLDER = '#9CA3AF';
const BORDER = '#E5E7EB';
const PAGE_BG = '#F3F4F6';
const INPUT_H = 46;
const FIELD_BOX = { borderWidth: 1, borderColor: BORDER, borderRadius: 12, backgroundColor: '#FFFFFF' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Category display order; anything else follows.
const CATEGORY_ORDER = ['mobile', 'smartphone', 'tablet', 'laptop', 'smartwatch', 'audiodevice', 'audio'];
const catRank = (c) => {
  const i = Math.min(
    ...[categoryMenuKey(c?.name), categoryMenuKey(c?.code)].map((k) => {
      const at = CATEGORY_ORDER.indexOf(k);
      return at === -1 ? CATEGORY_ORDER.length : at;
    }),
  );
  return i;
};

// Grid tile width: a hair under 100/cols so pixel rounding can't push the
// last tile of a row onto the next line (5 × 20% was wrapping to 4 + a gap).
const tilePct = (cols) => `${(100 / cols) - 0.1}%`;

// Product colour fallback when a catalogue colour has no hex.
const SWATCHES = {
  black: '#111111', white: '#F3F4F6', silver: '#D6D9DE', gold: '#F2D58A', rose: '#F4C6CC', blue: '#3B82F6',
  red: '#E53935', green: '#357D89', purple: '#8B5CF6', pink: '#F48FB1', graphite: '#4B4B4B', midnight: '#1E2A44',
  starlight: '#F5EBD8', orange: '#F59E3B', yellow: '#F3BF23', grey: '#9CA3AF', gray: '#9CA3AF', titanium: '#B8B3AA',
};
const swatchFor = (name) => {
  const n = String(name || '').toLowerCase();
  const key = Object.keys(SWATCHES).find((k) => n.includes(k));
  return key ? SWATCHES[key] : '#D1D5DB';
};
const titleCase = (v) => String(v || '').toLowerCase().replace(/(^|[\s\-/(])([a-z0-9])/g, (_, s, c) => s + c.toUpperCase());

// Working device → how much detail to capture before listing. Each type runs
// a subset of the existing sell-flow screens (same as OwnerSellMobile).
const DESCRIPTION_TYPES = [
  {
    key: 'DETAILED',
    title: 'Detailed Description',
    sub: 'Full check: screening, screen, functional, accessories, warranty, photos and price.',
    Icon: ClipboardList,
    disc: '#357D89',
    flow: ['SellScreening', 'SellScreenCondition', 'SellFunctional', 'SellAccessoriesWarranty', 'SellImages', 'SellGadgetPrice'],
  },
  {
    key: 'SHORT',
    title: 'Short Description',
    sub: 'Quick listing: just photos and price.',
    Icon: FileText,
    disc: '#5E9440',
    flow: ['SellImages', 'SellGadgetPrice'],
  },
];

export default function DeviceDetailsScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  // Device Condition cards: rs/rf scale with the phone's width (and cap the OS
  // font size), and tablets get a size up so the two cards don't look tiny.
  const condTab = winW >= 600;
  const cond = {
    pad: condTab ? rs(16) : rs(12),
    disc: condTab ? rs(40) : rs(34),
    icon: condTab ? rs(20) : rs(17),
    tick: condTab ? rs(24) : rs(20),
    title: condTab ? rf(13) : rf(12),
    sub: condTab ? rf(11) : rf(10),
  };
  const catCols = winW >= 600 ? 6 : 4; // Category grid: 4 per row on phones, 6 on tablets
  const catImg = winW >= 600 ? 48 : 44; // tile art size
  const brandCols = winW >= 600 ? 8 : 4;  // Brand grid: 4 per row on phones
  const modelCols = winW >= 600 ? 5 : 3;  // Model grid: 3 per row on phones
  const optCols = winW >= 900 ? 6 : winW >= 600 ? 5 : 3; // Colour / storage / spec tiles
  const seriesCols = winW >= 600 ? 6 : 4; // Series tiles

  // ── Category ────────────────────────────────────────────────────────────
  const [cats, setCats] = useState([]);
  const [catImages, setCatImages] = useState({});
  const [catsLoading, setCatsLoading] = useState(true);
  const [catId, setCatId] = useState(params.preselectedCategory?.id || params.categoryId || null);
  // ── Brand / series / model ──────────────────────────────────────────────
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brand, setBrand] = useState(null);           // { id, name, imageUrl, imageBase64 } | { id: null, name, custom: true }
  const [models, setModels] = useState([]);
  const [series, setSeries] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [seriesId, setSeriesId] = useState('');       // '' = All
  const [q, setQ] = useState('');
  const [model, setModel] = useState(null);           // catalogue row | { id: null, name, custom: true }
  // ── Variant ─────────────────────────────────────────────────────────────
  const [options, setOptions] = useState(null);       // getModelOptions() result
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [modelNumber, setModelNumber] = useState(null);
  const [color, setColor] = useState('');
  const [variantId, setVariantId] = useState(null);   // combined RAM+Storage spec id
  const [ram, setRam] = useState(null);               // fallback RAM option id
  const [storage, setStorage] = useState(null);       // fallback storage option id
  const [ramText, setRamText] = useState('');
  const [storageText, setStorageText] = useState('');
  const [specState, setSpecState] = useState(null);
  // Sell only: Working / Dead-or-unverified / Spare Parts, asked before colour.
  const [condition, setCondition] = useState(null); // 'WORKING' | 'DEAD' | 'PARTS'
  // Working device: the "Choose Description Type" popup, holding the device
  // payload built on Next.
  const [descFor, setDescFor] = useState(null);
  const pickDescription = (opt) => {
    const device = descFor;
    setDescFor(null);
    setTimeout(() => navigation.navigate(opt.flow[0], {
      device,
      flow: 'OWNER_LIST',
      descriptionType: opt.key,
      remainingFlow: opt.flow.slice(1),
      workingCondition: 'WORKING',
    }), 320);
  };   // { category, values } from <SpecFields>
  // Which picker sheet is open: 'category' | 'brand' | 'model' | null.
  const [sheet, setSheet] = useState(null);
  // Full-screen model image (pinch / double-tap / swipe):
  // { items: [{ uri, label, row }], index, reopenSheet, selectable }.
  const [viewer, setViewer] = useState(null);
  // "Other" brand / model popup: { title, placeholder, initial?, onDone(name) }.
  const [typeSheet, setTypeSheet] = useState(null);
  // Model listing folds to the picked model; Change reopens it. Paged by 24.
  // Category / Brand / Model grids fold to a picked card; Change reopens one.
  const [catListOpen, setCatListOpen] = useState(!(params.preselectedCategory?.id || params.categoryId));
  const [brandListOpen, setBrandListOpen] = useState(true);
  const [modelListOpen, setModelListOpen] = useState(true);
  const [modelLimit, setModelLimit] = useState(24);

  const category = cats.find((c) => c.id === catId) || (params.preselectedCategory?.id === catId ? params.preselectedCategory : null);
  const specCategory = category ? resolveSpecCategory(category.code, category.name) : null;
  const usesSpecs = usesCategorySpecs(specCategory);

  useEffect(() => {
    let alive = true;
    Promise.all([getDeviceCategories().catch(() => []), getCategoryMenuImages('REPAIR', { includeInactive: true })])
      .then(([list, images]) => {
        if (!alive) return;
        const rows = (Array.isArray(list) ? list : [])
          .filter((c) => c?.id && c.isActive !== false)
          .map((c, i) => ({ c, i }))
          .sort((a, b) => catRank(a.c) - catRank(b.c) || a.i - b.i)
          .map(({ c }) => c);
        setCats(rows);
        setCatImages(images || {});
      })
      .finally(() => { if (alive) setCatsLoading(false); });
    return () => { alive = false; };
  }, []);

  // Editing an existing booking: pick its brand → model → colour / RAM /
  // storage / model number once each list has loaded. One-shot — any manual
  // change afterwards is left alone.
  const prefill = useRef(params.editMode ? {
    brandId: params.brandId || null,
    modelId: params.modelId || null,
    color: params.color || '',
    ramOptionId: params.ramOptionId || null,
    storageOptionId: params.storageOptionId || null,
    modelNumber: params.modelNumber || null,
  } : null);

  // New category → reload its brands, clear everything below it.
  useEffect(() => {
    setBrand(null); setBrands([]); setBrandListOpen(true);
    if (!catId) return undefined;
    let alive = true;
    setBrandsLoading(true);
    getBrandsForCategory(catId)
      .then((list) => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : [];
        setBrands(arr);
        const want = prefill.current?.brandId;
        if (want) {
          prefill.current.brandId = null;
          const b = arr.find((x) => x.id === want);
          if (b) { setBrand(b); setBrandListOpen(false); }
        }
      })
      .catch(() => { if (alive) setBrands([]); })
      .finally(() => { if (alive) setBrandsLoading(false); });
    return () => { alive = false; };
  }, [catId]);

  // New brand → reload its models + series (same filter as SelectModel).
  useEffect(() => {
    setModel(null); setModels([]); setSeries([]); setSeriesId(''); setQ(''); setModelListOpen(true); setModelLimit(24);
    if (!brand?.id) return undefined;
    let alive = true;
    setModelsLoading(true);
    Promise.all([getModelsByBrand(brand.id).catch(() => []), getSeriesForCategoryBrand(catId, brand.id).catch(() => [])])
      .then(([ms, ss]) => {
        if (!alive) return;
        let list = Array.isArray(ms) ? ms : [];
        if (UUID_RE.test(String(catId || ''))) list = list.filter((m) => !m.categoryId || m.categoryId === catId);
        setModels(list);
        setSeries(Array.isArray(ss) ? ss : []);
        const want = prefill.current?.modelId;
        if (want) {
          prefill.current.modelId = null;
          const m = list.find((x) => x.id === want);
          if (m) { setModel(m); setModelListOpen(false); }
        }
      })
      .finally(() => { if (alive) setModelsLoading(false); });
    return () => { alive = false; };
  }, [brand, catId]);

  // New model → its configured colours / variants / model numbers.
  useEffect(() => {
    setOptions(null); setColor(''); setVariantId(null); setRam(null); setStorage(null);
    setRamText(''); setStorageText(''); setSpecState(null);
    setModelNumber(model?.id ? (parseModelNumbers(model.modelNumber)[0] || null) : null);
    if (!model) return undefined;
    // A typed (not-in-list) model has no catalogue entry — its colour / RAM /
    // storage are typed, so the full master lists aren't fetched or shown.
    if (!model.id) {
      setOptions({ colors: [], specs: [], allColors: [], allRams: [], allStorages: [], modelNumbers: [] });
      setOptionsLoading(false);
      return undefined;
    }
    let alive = true;
    setOptionsLoading(true);
    getModelOptions(model.id || null)
      .then((o) => {
        if (!alive) return;
        setOptions(o);
        const nums = o.modelNumbers?.length ? o.modelNumbers : parseModelNumbers(model.modelNumber);
        setModelNumber((prev) => (prev && nums.includes(prev) ? prev : (nums[0] || null)));
        // Edit: the booking's own colour / RAM + storage / model number.
        const pf = prefill.current;
        if (pf && (pf.color || pf.ramOptionId || pf.storageOptionId || pf.modelNumber)) {
          prefill.current = null;
          if (pf.color) {
            const c = [...(o.colors || []), ...(o.allColors || [])].find((x) => String(x.name || '').toLowerCase() === String(pf.color).toLowerCase());
            setColor(c ? c.name : pf.color);
          }
          const v = (o.specs || []).find((x) => (x.ramOptionId || null) === (pf.ramOptionId || null) && (x.storageOptionId || null) === (pf.storageOptionId || null));
          if (v) setVariantId(v.id);
          else { if (pf.ramOptionId) setRam(pf.ramOptionId); if (pf.storageOptionId) setStorage(pf.storageOptionId); }
          if (pf.modelNumber) setModelNumber(pf.modelNumber);
        }
      })
      .catch(() => { if (alive) setOptions({ colors: [], specs: [], allColors: [], allRams: [], allStorages: [], modelNumbers: [] }); })
      .finally(() => { if (alive) setOptionsLoading(false); });
    return () => { alive = false; };
  }, [model]);

  const seriesWithModels = useMemo(() => {
    const ids = new Set(models.map((m) => m.seriesId).filter(Boolean));
    return series.filter((s) => ids.has(s.id));
  }, [series, models]);

  // Model listing: the series chip narrows it; a search spans every series.
  const listModels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) return models.filter((m) => String(m.name || '').toLowerCase().includes(needle));
    return seriesId ? models.filter((m) => m.seriesId === seriesId) : models;
  }, [models, seriesId, q]);

  const isCustomModel = !!model && !model.id;
  const colorsList = options ? (options.colors?.length ? options.colors : options.allColors || []) : [];
  const variants = options?.specs || [];
  const storageOnly = variants.length > 0 && variants.every((v) => v.storageOnly);
  const modelNumbers = options?.modelNumbers?.length ? options.modelNumbers : parseModelNumbers(model?.modelNumber);

  const catImageFor = (c) => (c ? catImages[categoryMenuKey(c.name)] || catImages[categoryMenuKey(c.code)] || c.imageUrl || null : null);
  const modelImage = model?.id ? resolveDeviceImageSource({ url: model.imageUrl, base64: model.imageBase64 }) : null;
  const seriesName = model?.seriesId ? series.find((s) => s.id === model.seriesId)?.name : null;

  const pickModel = (m) => {
    setModel(m);
    if (m?.seriesId) setSeriesId((cur) => (cur && cur !== m.seriesId ? '' : cur));
    setQ('');
    setModelListOpen(false);
  };

  // Open a model's image full-screen. From the list, swipe moves through the
  // listed models that have an image, and "Select this model" picks one; the
  // sheet it came from closes first (one modal at a time) and reopens on close.
  const openModelViewer = (list, modelId, fromSheet) => {
    const items = list
      .map((m) => ({ uri: resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 }), label: m.name, row: m }))
      .filter((x) => x.uri);
    const index = Math.max(0, items.findIndex((x) => x.row.id === modelId));
    if (!items.length) return;
    if (fromSheet) setSheet(null);
    setViewer({ items, index, reopenSheet: fromSheet, selectable: true });
  };
  const closeViewer = () => {
    const reopen = viewer?.reopenSheet;
    setViewer(null);
    if (reopen) setModelListOpen(true);
  };

  // Sell tab (flow OWNER_LIST) reuses this screen: Next hands the picked device
  // to the sell flow instead of the booking's DeviceServices.
  const sellMode = params.flow === 'OWNER_LIST';
  // Selling needs the condition plus colour and RAM / storage (booking keeps
  // them optional). Only the fields actually on screen are required.
  // Colour / RAM / storage are required for a whole-device sale only.
  const needVariant = sellMode && condition !== 'PARTS';
  const sellDetailsDone = (() => {
    if (!sellMode) return true;
    if (!condition) return false;
    if (condition === 'PARTS') return true;
    if (usesSpecs) {
      const v = specState?.values || {};
      const keys = specState?.fieldKeys || [];
      return ['color', 'ram', 'storageCapacity'].every((k) => !keys.includes(k) || !!v[k]);
    }
    if (!color.trim()) return false;
    if (isCustomModel) return !!ramText.trim() && !!storageText.trim();
    if (variants.length > 0) return !!variantId || !!storageText.trim();
    return (!!ram || !!ramText.trim()) && (!!storage || !!storageText.trim());
  })();
  const ready = !!category && !!brand?.name && !!model?.name && !optionsLoading && sellDetailsDone;

  const ramLabelOf = (id) => (id ? options?.allRams?.find((x) => x.id === id)?.label : undefined);
  const storageLabelOf = (id) => (id ? options?.allStorages?.find((x) => x.id === id)?.label : undefined);
  const colorSwatch = (name) => colorsList.find((c) => c.name === name)?.hexCode || swatchFor(name);

  const onNext = () => {
    if (!ready) return;
    const variant = variants.find((v) => v.id === variantId);
    const base = {
      ...params,
      flow: sellMode ? 'OWNER_LIST' : 'BOOKING',
      categoryId: category.id,
      categoryCode: String(category.code || '').toUpperCase(),
      categoryName: category.name,
      brandId: brand.id || null,
      brandName: brand.name,
      customBrand: brand.custom ? true : undefined,
      seriesId: model.seriesId || undefined,
      seriesName: seriesName || undefined,
      modelId: model.id || null,
      modelName: model.name,
      customModel: isCustomModel ? true : undefined,
      modelNumber: modelNumber || undefined,
      modelNumbers: modelNumbers || [],
      modelImageUrl: modelImage || undefined,
      imageUrl: modelImage || undefined,
      ...(sellMode ? { workingCondition: condition } : {}),
    };
    let variantParams;
    if (usesSpecs) {
      const values = specState?.values || {};
      const specs = {};
      SPEC_ATTRIBUTE_KEYS.forEach((k) => { if (values[k]) specs[k] = values[k]; });
      variantParams = {
        color: values.color || undefined,
        ramOptionId: null, storageOptionId: null, ramLabel: undefined, storageLabel: undefined,
        deviceCategory: specState?.category || specCategory || undefined,
        specs,
      };
    } else {
      // A listed variant, a master RAM / storage pick, or a typed value.
      variantParams = {
        color: color.trim() || undefined,
        ramOptionId: (variant ? variant.ramOptionId : ram) || undefined,
        storageOptionId: (variant ? variant.storageOptionId : storage) || undefined,
        ramLabel: variant ? (variant.ramLabel || undefined) : (ramLabelOf(ram) || ramText.trim() || undefined),
        storageLabel: variant ? (variant.storageLabel || undefined) : (storageLabelOf(storage) || storageText.trim() || undefined),
        deviceCategory: specCategory || undefined,
      };
    }
    if (sellMode) {
      // Same `device` payload SelectVariant built for OwnerSellMobile: only
      // UUID ids (typed brands / models have none), display labels alongside.
      const onlyUuid = (v) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')) ? v : undefined);
      const specs = variantParams.specs;
      const device = {
        categoryId: onlyUuid(base.categoryId),
        categoryCode: base.categoryCode || undefined,
        brandId: onlyUuid(base.brandId),
        modelId: onlyUuid(base.modelId),
        modelName: base.modelName || undefined,
        brandName: base.brandName || undefined,
        modelNumber: base.modelNumber,
        imageUrl: base.imageUrl,
        color: variantParams.color,
        deviceCategory: variantParams.deviceCategory,
        workingCondition: condition,
        ...(specs
          ? {
            specs,
            ramLabel: specs.ram ? formatSpecValue('ram', specs.ram) : undefined,
            storageLabel: specs.storageCapacity ? formatSpecValue('storageCapacity', specs.storageCapacity) : undefined,
          }
          : {
            ramLabel: variantParams.ramLabel,
            storageLabel: variantParams.storageLabel,
            ramOptionId: onlyUuid(variantParams.ramOptionId),
            storageOptionId: onlyUuid(variantParams.storageOptionId),
          }),
      };
      // Working → "Choose Description Type" popup on this screen;
      // Dead / Unverified → Screening Questions, then Spare Parts;
      // Spare Parts → straight to the parts listing.
      if (condition === 'PARTS') {
        navigation.navigate('OwnerSellSpareParts', { ...base, ...variantParams, device });
      } else if (condition === 'DEAD') {
        navigation.navigate('SellScreening', {
          device,
          flow: 'OWNER_LIST',
          workingCondition: 'DEAD',
          descriptionType: 'DEAD_SHORT',
          nextAfterScreening: 'OwnerSellSpareParts',
        });
      } else {
        // Choose the description type right here — no separate screen.
        setDescFor(device);
      }
      return;
    }
    // Edit Booking's "Change device": hand the pick back and close the picker.
    if (typeof params.onPicked === 'function') {
      params.onPicked({ ...base, ...variantParams });
      navigation.goBack();
      return;
    }
    // Devices & Repair — issues, prices, photos, parts and security on one screen.
    navigation.navigate('ServicePriceEstimate', { ...base, ...variantParams });
  };

  // Brand › Series › Model — the category is already in its own field above.
  const crumbs = [brand?.name, seriesName, model?.name].filter(Boolean);

  // Picked colour + storage for the summary card, whichever form is showing.
  const pickedVariant = variants.find((v) => v.id === variantId);
  const summaryColor = usesSpecs ? specState?.values?.color : color.trim();
  const summaryStorage = usesSpecs
    ? specDisplayParts({ deviceCategory: specState?.category || specCategory, specs: specState?.values || {} }).join(' / ')
    : pickedVariant
      ? pickedVariant.label
      : [ramLabelOf(ram) || ramText.trim(), storageLabelOf(storage) || storageText.trim()].filter(Boolean).join(' / ');

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Header — same strip as Customer Details / Devices List. */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: BORDER }}
          >
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View className="flex-1" style={{ paddingHorizontal: 8 }}>
            <Text className="text-center" style={{ color: INK, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>Device Details</Text>
            <Text className="text-center" style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              {params.customer?.name ? `Device for ${params.customer.name}` : 'Select the customer’s device'}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {/* KeyboardAwareScrollView (repo pattern): lifts the focused field above
          the keyboard on both platforms; the old iOS-only KeyboardAvoidingView
          shrank the view but never scrolled the input into sight. */}
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          bottomOffset={24}
          contentContainerStyle={{ padding: 14, paddingBottom: 24, alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: '100%', maxWidth: 760 }}>
            {/* Category — a grid of tiles right on the screen (admin Category
                Menu art). Tapping one selects it; the picked tile gets a ✓. */}
            <Field label="Category">
              {category && !catListOpen ? (
                <PickedCard
                  image={catImageFor(category)}
                  title={category.name}
                  onChange={() => setCatListOpen(true)}
                />
              ) : catsLoading ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {cats.map((c) => {
                    const on = c.id === catId;
                    const img = catImageFor(c);
                    return (
                      <View key={c.id} style={{ width: tilePct(catCols), padding: 4 }}>
                        <Pressable
                          onPress={() => { if (!on) setCatId(c.id); setCatListOpen(false); }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={c.name}
                          className="items-center justify-center active:opacity-80"
                          style={{
                            minHeight: 96, paddingHorizontal: 6, paddingVertical: 10, borderRadius: 14,
                            borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : BORDER, backgroundColor: on ? MINT : '#FFFFFF',
                          }}
                        >
                          {on ? (
                            <View
                              className="items-center justify-center"
                              style={{ position: 'absolute', top: 6, right: 6, height: 18, width: 18, borderRadius: 9, backgroundColor: ACCENT }}
                            >
                              <Check size={11} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          ) : null}
                          {img ? (
                            <DeviceImage url={img} style={{ width: catImg, height: catImg }} contentFit="contain" />
                          ) : (
                            <Smartphone size={28} color={INK} strokeWidth={1.75} />
                          )}
                          <Text
                            style={{ marginTop: 8, fontSize: 12, lineHeight: 15, fontWeight: on ? '700' : '500', color: INK, textAlign: 'center' }}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </Field>

            {/* ── Brand — a grid of logos once a category is picked, plus Other
                (a brand that isn't listed, typed in a popup). ─────────────── */}
            {category ? (
              <Field label="Brand">
                {brand && !brandListOpen ? (
                  <PickedCard
                    image={brand.id ? resolveDeviceImageSource({ url: brand.imageUrl, base64: brand.imageBase64 }) : null}
                    title={brand.name}
                    subtitle={brand.custom ? 'Not in list' : null}
                    onChange={() => setBrandListOpen(true)}
                  />
                ) : brandsLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                    {brands.map((b) => (
                      <View key={b.id} style={{ width: tilePct(brandCols), padding: 4 }}>
                        <GridTile
                          label={b.name}
                          image={resolveDeviceImageSource({ url: b.imageUrl, base64: b.imageBase64 })}
                          imageSize={44}
                          imageWidth="100%"
                          compact
                          padH={2}
                          on={brand?.id === b.id}
                          onPress={() => { if (brand?.id !== b.id) setBrand(b); setBrandListOpen(false); }}
                        />
                      </View>
                    ))}
                    <View style={{ width: tilePct(brandCols), padding: 4 }}>
                      <GridTile
                        label={brand?.custom ? brand.name : 'Other'}
                        icon={Plus}
                        imageSize={35}
                        on={!!brand?.custom}
                        onPress={() => setTypeSheet({
                          title: 'Other Brand',
                          placeholder: 'Type the brand name',
                          onDone: (name) => { setBrand({ id: null, name, custom: true }); setBrandListOpen(false); },
                        })}
                      />
                    </View>
                  </View>
                )}
              </Field>
            ) : null}

            {/* ── Model — search, series chips, model tiles and Other. Folds to
                the picked model once chosen; Change opens the list again.
                Tap a tile's image to zoom it. ──────────────────────────────── */}
            {brand ? (
              <Field label="Model">
                {model && !modelListOpen ? (
                  <PickedCard
                    image={modelImage}
                    imageSize={44}
                    title={model.name}
                    subtitle={seriesName || (isCustomModel ? 'Not in list' : null)}
                    onChange={() => setModelListOpen(true)}
                  />
                ) : modelsLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
                ) : (
                  <>
                    {models.length ? (
                      <View className="flex-row items-center px-3" style={{ ...FIELD_BOX, height: INPUT_H, marginBottom: 10 }}>
                        <Search size={18} color={MUTED} />
                        <TextInput
                          value={q}
                          onChangeText={(v) => { setQ(v); setModelLimit(24); }}
                          placeholder="Search model"
                          placeholderTextColor={PLACEHOLDER}
                          cursorColor={ACCENT}
                          returnKeyType="search"
                          className="flex-1 ml-2"
                          style={{ paddingVertical: 0, fontSize: 13, color: INK }}
                        />
                        {q ? (
                          <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search"><X size={16} color={MUTED} /></Pressable>
                        ) : null}
                      </View>
                    ) : null}

                    {seriesWithModels.length && !q.trim() ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 6 }}>
                        {[{ id: '', name: 'All' }, ...seriesWithModels].map((sr) => (
                          <View key={sr.id || 'all'} style={{ width: tilePct(seriesCols), padding: 4 }}>
                            <OptionTile label={sr.name} on={seriesId === sr.id} onPress={() => { setSeriesId(sr.id); setModelLimit(24); }} />
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                      {listModels.slice(0, modelLimit).map((m) => (
                        <View key={m.id} style={{ width: tilePct(modelCols), padding: 4 }}>
                          <GridTile
                            label={m.name}
                            image={resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 })}
                            imageSize={60}
                            imageWidth={64}
                            padH={2}
                            labelSize={13}
                            fallbackIcon={Smartphone}
                            on={model?.id === m.id}
                            onPress={() => pickModel(m)}
                            onImagePress={() => openModelViewer(listModels, m.id, false)}
                          />
                        </View>
                      ))}
                      <View style={{ width: tilePct(modelCols), padding: 4 }}>
                        <GridTile
                          label={isCustomModel ? model.name : 'Other'}
                          icon={Plus}
                          imageSize={60}
                            imageWidth={64}
                            padH={2}
                            labelSize={13}
                          on={isCustomModel}
                          onPress={() => setTypeSheet({
                            title: 'Other Model',
                            placeholder: 'Type the model name',
                            initial: q.trim(),
                            onDone: (name) => pickModel({ id: null, name, custom: true }),
                          })}
                        />
                      </View>
                    </View>

                    {listModels.length > modelLimit ? (
                      <Pressable
                        onPress={() => setModelLimit((n) => n + 24)}
                        accessibilityRole="button"
                        className="items-center justify-center active:opacity-80"
                        style={{ marginTop: 8, height: 40, borderRadius: 12, borderWidth: 1, borderColor: BORDER }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: ACCENT_TEXT }}>
                          Show more models ({listModels.length - modelLimit})
                        </Text>
                      </Pressable>
                    ) : null}
                    {q.trim() && !listModels.length ? (
                      <Text style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
                        No model matches “{q.trim()}” — tap Other to type it.
                      </Text>
                    ) : null}
                  </>
                )}
              </Field>
            ) : null}

            {/* ── Variant: model number, colour, storage — tile grids, columns
                follow the screen width. Tap again to clear; Other types a
                value that isn't listed. ─────────────────────────────────── */}
            {model ? (
              optionsLoading ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
              ) : (
                <>
                  {modelNumbers.length > 1 ? (
                    <Field label="Model Number">
                      <FoldGrid
                        valueLabel={modelNumber || ''}
                        cols={optCols}
                        options={modelNumbers.map((n) => ({ key: n, label: n }))}
                        selected={modelNumber}
                        onSelect={(k) => setModelNumber(k)}
                        other={{
                          value: modelNumber && !modelNumbers.includes(modelNumber) ? modelNumber : '',
                          onPress: () => setTypeSheet({ title: 'Other Model Number', placeholder: 'Type the model number', onDone: (t) => setModelNumber(t) }),
                        }}
                      />
                    </Field>
                  ) : null}

                  {sellMode ? (
                    <Field label="Device Condition" required>
                      {/* 3-column grid. Every card: radio top-right, centred disc,
                          then title and note — each text block reserves two lines,
                          so the three cards are always the same height whether a
                          label wraps or not (it did, unevenly, per phone). */}
                      <View style={{ flexDirection: 'row', marginHorizontal: -rs(4) }}>
                        {[
                          { key: 'WORKING', label: 'Working Device', sub: 'Turns on and works', Icon: Smartphone, disc: '#357D89' },
                          { key: 'DEAD', label: 'Dead / Unverified', sub: "Won't turn on or not checked", Icon: PowerOff, disc: '#6B7280' },
                          { key: 'PARTS', label: 'Spare Parts', sub: 'Sell parts separately', Icon: Wrench, disc: '#5E9440' },
                        ].map((o) => {
                          const on = condition === o.key;
                          const titleLH = Math.round(cond.title * 1.3);
                          const subLH = Math.round(cond.sub * 1.35);
                          return (
                            <View key={o.key} style={{ flex: 1, paddingHorizontal: rs(4) }}>
                              <Pressable
                                onPress={() => setCondition(o.key)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${o.label}, ${o.sub}`}
                                style={{
                                  flex: 1, alignItems: 'center',
                                  paddingTop: cond.pad + rs(4), paddingBottom: cond.pad, paddingHorizontal: rs(6),
                                  borderRadius: rs(14), borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : '#E5E7EB',
                                  backgroundColor: on ? '#E5F3F5' : '#FFFFFF',
                                }}
                              >
                                {/* radio, top-right */}
                                <View style={{ position: 'absolute', top: rs(7), right: rs(7), height: cond.tick, width: cond.tick, borderRadius: cond.tick / 2, borderWidth: on ? 0 : 1.5, borderColor: '#D1D5DB', backgroundColor: on ? ACCENT : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                                  {on ? <Check size={Math.round(cond.tick * 0.6)} color="#FFFFFF" strokeWidth={3} /> : null}
                                </View>
                                <View style={{ height: cond.disc, width: cond.disc, borderRadius: cond.disc / 2, backgroundColor: o.disc, alignItems: 'center', justifyContent: 'center' }}>
                                  <o.Icon size={cond.icon} color="#FFFFFF" />
                                </View>
                                <Text
                                  style={{ marginTop: rs(8), minHeight: titleLH * 2, fontSize: cond.title, lineHeight: titleLH, fontWeight: '800', color: INK, textAlign: 'center' }}
                                  numberOfLines={2}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.85}
                                >
                                  {o.label}
                                </Text>
                                <Text style={{ minHeight: subLH * 2, fontSize: cond.sub, lineHeight: subLH, color: MUTED, textAlign: 'center' }} numberOfLines={2}>
                                  {o.sub}
                                </Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    </Field>
                  ) : null}

                  {/* Spare Parts: no colour / RAM / storage / spec fields. */}
                  {sellMode && condition === 'PARTS' ? null : usesSpecs ? (
                    <SpecFields
                      key={`${catId}|${model.id || model.name}`}
                      category={category}
                      modelId={model.id}
                      modelOptions={options}
                      onState={setSpecState}
                      cols={optCols}
                      manual={isCustomModel}
                      requiredKeys={needVariant ? ['color', 'ram', 'storageCapacity'] : []}
                    />
                  ) : isCustomModel ? (
                    <>
                      <Field label="Color" optional={!needVariant} required={needVariant}>
                        <ManualInput value={color} onChangeText={setColor} placeholder="Enter colour, e.g. Sea Green" />
                      </Field>
                      <Field label="RAM" optional={!needVariant} required={needVariant}>
                        <ManualInput value={ramText} onChangeText={setRamText} placeholder="Enter RAM, e.g. 8 GB" caps />
                      </Field>
                      <Field label="Storage" optional={!needVariant} required={needVariant}>
                        <ManualInput value={storageText} onChangeText={setStorageText} placeholder="Enter storage, e.g. 128 GB" caps />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Color" optional={!needVariant} required={needVariant}>
                        <FoldGrid
                          valueLabel={color ? titleCase(color) : ''}
                          valueSwatch={color ? colorSwatch(color) : null}
                          cols={optCols}
                          options={colorsList.map((c) => ({ key: c.name, label: titleCase(c.name), swatch: c.hexCode || swatchFor(c.name) }))}
                          selected={color}
                          onSelect={(k) => setColor(color === k ? '' : k)}
                          other={{
                            value: color && !colorsList.some((c) => c.name === color) ? titleCase(color) : '',
                            onPress: () => setTypeSheet({ title: 'Other Color', placeholder: 'Type the colour, e.g. Sea Green', onDone: (t) => setColor(t) }),
                          }}
                        />
                      </Field>

                      {variants.length > 0 ? (
                        <Field label={storageOnly ? 'Storage' : 'RAM & Storage'} optional={!needVariant} required={needVariant}>
                          <FoldGrid
                            valueLabel={pickedVariant?.label || storageText}
                            cols={optCols}
                            options={variants.map((v) => ({ key: v.id, label: v.label }))}
                            selected={variantId}
                            onSelect={(k) => { setStorageText(''); setVariantId(variantId === k ? null : k); }}
                            other={{
                              value: !variantId && storageText ? storageText : '',
                              onPress: () => setTypeSheet({
                                title: storageOnly ? 'Other Storage' : 'Other RAM & Storage',
                                placeholder: storageOnly ? 'e.g. 256 GB' : 'e.g. 8 GB + 256 GB',
                                onDone: (t) => { setVariantId(null); setStorageText(t); },
                              }),
                            }}
                          />
                        </Field>
                      ) : (
                        <>
                          <Field label="RAM" optional={!needVariant} required={needVariant}>
                            <FoldGrid
                              valueLabel={ramLabelOf(ram) || ramText}
                              cols={optCols}
                              options={(options?.allRams || []).map((x) => ({ key: x.id, label: x.label }))}
                              selected={ram}
                              onSelect={(k) => { setRamText(''); setRam(ram === k ? null : k); }}
                              other={{
                                value: !ram && ramText ? ramText : '',
                                onPress: () => setTypeSheet({ title: 'Other RAM', placeholder: 'e.g. 12 GB', onDone: (t) => { setRam(null); setRamText(t); } }),
                              }}
                            />
                          </Field>
                          <Field label="Storage" optional={!needVariant} required={needVariant}>
                            <FoldGrid
                              valueLabel={storageLabelOf(storage) || storageText}
                              cols={optCols}
                              options={(options?.allStorages || []).map((x) => ({ key: x.id, label: x.label }))}
                              selected={storage}
                              onSelect={(k) => { setStorageText(''); setStorage(storage === k ? null : k); }}
                              other={{
                                value: !storage && storageText ? storageText : '',
                                onPress: () => setTypeSheet({ title: 'Other Storage', placeholder: 'e.g. 256 GB', onDone: (t) => { setStorage(null); setStorageText(t); } }),
                              }}
                            />
                          </Field>
                        </>
                      )}
                    </>
                  )}
                </>
              )
            ) : null}

            {/* ── Select Device summary ─────────────────────────────────── */}
            {crumbs.length ? (
              <View style={{ marginTop: 4, borderRadius: 14, backgroundColor: PAGE_BG, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 10 }}>Select Device</Text>
                <View className="flex-row items-center">
                  <Pressable
                    onPress={modelImage ? () => setViewer({ items: [{ uri: modelImage, label: model?.name, row: model }], index: 0 }) : undefined}
                    disabled={!modelImage}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="View model image"
                    className="items-center justify-center"
                    style={{ width: 64, height: 76, borderRadius: 10, backgroundColor: '#FFFFFF', overflow: 'hidden' }}
                  >
                    {modelImage ? (
                      <DeviceImage url={modelImage} style={{ width: 56, height: 68 }} contentFit="contain" />
                    ) : (
                      <Smartphone size={28} color={ACCENT} />
                    )}
                  </Pressable>
                  <View className="flex-1" style={{ marginLeft: 12 }}>
                    <View className="flex-row flex-wrap items-center">
                      {crumbs.map((c, i) => (
                        <View key={`${c}-${i}`} className="flex-row items-center" style={{ marginVertical: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: i === crumbs.length - 1 ? '800' : '500', color: INK }}>{c}</Text>
                          {i < crumbs.length - 1 ? <ChevronRight size={14} color={MUTED} style={{ marginHorizontal: 4 }} /> : null}
                        </View>
                      ))}
                    </View>
                    {summaryColor && !(sellMode && condition === 'PARTS') ? <SummaryLine label="Color" value={titleCase(summaryColor)} /> : null}
                    {summaryStorage && !(sellMode && condition === 'PARTS') ? <SummaryLine label="Storage" value={summaryStorage} /> : null}
                    {/* Model number right after storage. */}
                    {modelNumber ? <SummaryLine label="Model Number" value={modelNumber} /> : null}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </KeyboardAwareScrollView>

      {/* ── Working device: Choose Description Type ── */}
      <ResponsiveModal visible={!!descFor} onClose={() => setDescFor(null)}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        <Text style={{ fontSize: rf(17), fontWeight: '800', color: INK }}>Choose Description Type</Text>
        <Text style={{ fontSize: rf(12.5), color: MUTED, marginTop: 3, marginBottom: 14 }}>Pick how much detail to add to this listing.</Text>
        {/* Two cards side by side; flex: 1 keeps them the same height. */}
        <View style={{ flexDirection: 'row', marginHorizontal: -rs(5) }}>
          {DESCRIPTION_TYPES.map((o) => (
            <View key={o.key} style={{ flex: 1, paddingHorizontal: rs(5) }}>
              <Pressable
                onPress={() => pickDescription(o)}
                accessibilityRole="button"
                accessibilityLabel={`${o.title}. ${o.sub}`}
                style={{ flex: 1, alignItems: 'center', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', paddingVertical: rs(16), paddingHorizontal: rs(10) }}
              >
                <View style={{ height: rs(50), width: rs(50), borderRadius: rs(25), alignItems: 'center', justifyContent: 'center', backgroundColor: o.disc }}>
                  <o.Icon size={rs(23)} color="#FFFFFF" />
                </View>
                <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK, marginTop: rs(10), textAlign: 'center' }} numberOfLines={2}>{o.title}</Text>
                <Text style={{ flex: 1, fontSize: rf(11.5), color: MUTED, marginTop: rs(4), lineHeight: rf(16), textAlign: 'center' }} numberOfLines={4}>{o.sub}</Text>
                <View style={{ marginTop: rs(10), backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: INK }}>{o.flow.length} steps</Text>
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      </ResponsiveModal>

      {/* ── Next only (the header arrow goes back) ───────────────────────── */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#FFFFFF' }}>
        <Pressable
          onPress={onNext}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Next"
          className="flex-1 flex-row items-center justify-center active:opacity-85"
          style={{ height: 48, maxWidth: 760, borderRadius: 12, backgroundColor: ACCENT, opacity: ready ? 1 : 0.45 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Next</Text>
          <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.25} style={{ marginLeft: 8 }} />
        </Pressable>
      </View>

      <TypeSheet config={typeSheet} onClose={() => setTypeSheet(null)} />

      <ImageViewerModal
        visible={!!viewer}
        images={viewer?.items || []}
        index={viewer?.index || 0}
        onClose={closeViewer}
        actionLabel={viewer?.selectable ? 'Select this model' : undefined}
        onAction={viewer?.selectable ? (item) => { setViewer(null); pickModel(item.row); } : undefined}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Category-specific fields (Laptop / Smartwatch / Audio Device) — the same hook
// as the old Your Device screen. Keyed by category + model so a new pick starts
// clean; reports its values up for Next.
// ════════════════════════════════════════════════════════════════════════════
// Spec fields a typed model enters by hand; fixed enums (storage type,
// connectivity, device type) stay as tiles.
const MANUAL_SPEC_PLACEHOLDER = {
  color: 'Enter colour, e.g. Space Gray',
  ram: 'Enter RAM, e.g. 16 GB',
  storageCapacity: 'Enter storage, e.g. 512 GB',
  caseSize: 'Enter case size, e.g. 44 mm',
};

function SpecFields({ category, modelId, modelOptions, onState, cols = 3, manual = false, requiredKeys = [] }) {
  const spec = useDeviceSpecForm({
    context: 'BOOKING',
    hints: [category?.code, category?.name, category?.id],
    categoryId: category?.id,
    modelId: modelId || undefined,
    modelOptions,
    initial: {},
  });
  useEffect(() => {
    onState({ category: spec.category, values: spec.values, fieldKeys: spec.fields.map((f) => f.key) });
  }, [spec.category, spec.values, spec.fields, onState]);

  if (spec.loading) return <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />;
  return spec.fields.map((f) => {
    const isColor = f.key === 'color';
    const cur = spec.values[f.key];
    const curOpt = f.options.find((o) => o.value === cur);
    if (manual && MANUAL_SPEC_PLACEHOLDER[f.key]) {
      return (
        <Field key={f.key} label={isColor ? 'Color' : f.label} optional={!requiredKeys.includes(f.key)} required={requiredKeys.includes(f.key)}>
          <ManualInput
            value={cur || ''}
            onChangeText={(v) => spec.setValue(f.key, v)}
            placeholder={MANUAL_SPEC_PLACEHOLDER[f.key]}
            caps={!isColor}
          />
        </Field>
      );
    }
    return (
      <Field key={f.key} label={isColor ? 'Color' : f.label} optional={!requiredKeys.includes(f.key)} required={requiredKeys.includes(f.key)}>
        <FoldGrid
          valueLabel={curOpt ? (isColor ? titleCase(curOpt.label || curOpt.value) : curOpt.label) : ''}
          valueSwatch={isColor && curOpt ? (curOpt.hex || swatchFor(curOpt.value)) : null}
          cols={cols}
          options={f.options.map((o) => ({
            key: o.value,
            label: isColor ? titleCase(o.label || o.value) : o.label,
            swatch: isColor ? (o.hex || swatchFor(o.value)) : undefined,
          }))}
          selected={cur}
          onSelect={(k) => spec.setValue(f.key, cur === k ? null : k)}
        />
      </Field>
    );
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Building blocks
// ════════════════════════════════════════════════════════════════════════════
// "Enter manually" box for a value a not-in-list model can't pick from a list.
function ManualInput({ value, onChangeText, placeholder, caps = false }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={PLACEHOLDER}
      autoCapitalize={caps ? 'characters' : 'words'}
      cursorColor={ACCENT}
      style={{ ...FIELD_BOX, height: 46, paddingHorizontal: 12, fontSize: 14, color: INK }}
    />
  );
}

function Field({ label, required, optional, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 8 }}>
        {label}
        {required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
        {optional ? <Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text> : null}
      </Text>
      {children}
    </View>
  );
}

// Brand / model tile — art (or an icon / initial) over a two-line name; the
// picked tile gets a green line, mint fill and a ✓ badge.
// compact: small-tile text/height whatever the image size; padH: side padding;
// imageWidth: let a wide image (brand wordmark) use the tile width.
function GridTile({ label, image, imageSize = 40, imageWidth, compact, padH, labelSize, icon: Icon, fallbackIcon: Fallback, on, onPress, onLongPress, onImagePress }) {
  const small = compact ?? imageSize <= 36;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={label}
      className="items-center justify-center active:opacity-80"
      style={{
        minHeight: small ? 78 : 112, paddingHorizontal: padH ?? (small ? 3 : 6), paddingVertical: small ? 8 : 10, borderRadius: 14,
        borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : BORDER, backgroundColor: on ? MINT : '#FFFFFF',
      }}
    >
      {on ? (
        <View
          className="items-center justify-center"
          style={{ position: 'absolute', top: 5, right: 5, height: 16, width: 16, borderRadius: 8, backgroundColor: ACCENT, zIndex: 1 }}
        >
          <Check size={10} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
      {image && onImagePress ? (
        // Image tap → full-screen viewer (pinch / double-tap zoom); the rest
        // of the tile still selects.
        <Pressable onPress={onImagePress} hitSlop={4} accessibilityRole="imagebutton" accessibilityLabel={`View ${label} image`}>
          <DeviceImage url={image} style={{ width: imageWidth ?? imageSize, height: imageSize }} contentFit="contain" />
        </Pressable>
      ) : image ? (
        <DeviceImage url={image} style={{ width: imageWidth ?? imageSize, height: imageSize }} contentFit="contain" />
      ) : Icon ? (
        <View className="items-center justify-center" style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, backgroundColor: MINT }}>
          <Icon size={Math.round(imageSize * 0.55)} color={ACCENT} strokeWidth={2.25} />
        </View>
      ) : Fallback ? (
        <Fallback size={Math.round(imageSize * 0.6)} color={INK} strokeWidth={1.5} />
      ) : (
        <View className="items-center justify-center" style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, backgroundColor: PAGE_BG }}>
          <Text style={{ fontSize: Math.round(imageSize * 0.45), fontWeight: '800', color: INK }}>{String(label || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text
        style={{ marginTop: 6, fontSize: labelSize ?? (small ? 10.5 : 12), lineHeight: labelSize ? labelSize + 3 : (small ? 13 : 15), fontWeight: on ? '700' : '500', color: INK, textAlign: 'center' }}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// "Other" brand / model: type the name — keyboard Done, ✕ or closing the popup
// uses what was typed (blank → nothing), same as Other Issue.
function TypeSheet({ config, onClose }) {
  const [text, setText] = useState('');
  useEffect(() => { setText(config?.initial || ''); }, [config]);
  const finish = () => {
    const t = text.trim();
    if (t && config?.onDone) config.onDone(t);
    onClose();
  };
  return (
    <ResponsiveModal visible={!!config} onClose={finish} maxWidth={520}>
      <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
      <View className="flex-row items-center" style={{ marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: INK }}>{config?.title || ''}</Text>
        <Pressable onPress={finish} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"><X size={20} color={MUTED} /></Pressable>
      </View>
      <View className="justify-center" style={{ ...FIELD_BOX, height: INPUT_H, paddingHorizontal: 12 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          placeholder={config?.placeholder || ''}
          placeholderTextColor={PLACEHOLDER}
          cursorColor={ACCENT}
          returnKeyType="done"
          onSubmitEditing={finish}
          style={{ paddingVertical: 0, fontSize: 14, color: INK }}
        />
      </View>
      <Text style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Press Done to use this name.</Text>
    </ResponsiveModal>
  );
}

// The folded state of a Category / Brand / Model grid: art, name, Change.
function PickedCard({ image, imageSize = 36, title, subtitle, onChange, onImagePress }) {
  return (
    <View className="flex-row items-center" style={{ ...FIELD_BOX, padding: 10 }}>
      <Pressable
        onPress={onImagePress}
        disabled={!onImagePress}
        accessibilityRole={onImagePress ? 'imagebutton' : undefined}
        className="items-center justify-center"
        style={{ width: imageSize + 8, height: imageSize + 8, borderRadius: 10, backgroundColor: PAGE_BG, overflow: 'hidden' }}
      >
        {image ? (
          <DeviceImage url={image} style={{ width: imageSize, height: imageSize }} contentFit="contain" />
        ) : (
          <Text style={{ fontSize: Math.round(imageSize * 0.45), fontWeight: '800', color: INK }}>{String(title || '?').trim().charAt(0).toUpperCase()}</Text>
        )}
      </Pressable>
      <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: INK }} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Pressable
        onPress={onChange}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Change ${title}`}
        className="items-center justify-center active:opacity-70"
        style={{ paddingHorizontal: 12, height: 32, borderRadius: 999, borderWidth: 1, borderColor: ACCENT }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: ACCENT_TEXT }}>Change</Text>
      </Pressable>
    </View>
  );
}

function SummaryLine({ label, value }) {
  return (
    <Text style={{ marginTop: 4, fontSize: 12, color: MUTED }} numberOfLines={1}>
      {label}: <Text style={{ fontWeight: '700', color: INK }}>{value}</Text>
    </Text>
  );
}

// An option grid that folds to its picked value (swatch + label + Change),
// like Category / Brand / Model. A new pick folds it; clearing reopens it.
function FoldGrid({ valueLabel, valueSwatch, ...grid }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [valueLabel]);
  if (valueLabel && !editing) {
    return (
      <View className="flex-row items-center" style={{ ...FIELD_BOX, minHeight: INPUT_H, paddingHorizontal: 12, paddingVertical: 6 }}>
        {valueSwatch ? (
          <View style={{ height: 18, width: 18, borderRadius: 9, backgroundColor: valueSwatch, borderWidth: 1, borderColor: 'rgba(17, 17, 17,0.15)', marginRight: 10 }} />
        ) : null}
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK }} numberOfLines={1}>{valueLabel}</Text>
        <Pressable
          onPress={() => setEditing(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Change ${valueLabel}`}
          className="items-center justify-center active:opacity-70"
          style={{ paddingHorizontal: 12, height: 30, borderRadius: 999, borderWidth: 1, borderColor: ACCENT }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: ACCENT_TEXT }}>Change</Text>
        </Pressable>
      </View>
    );
  }
  return <OptionGrid {...grid} />;
}

// Colour / storage / spec options as tiles. `other` adds a last "Other" tile
// ({ value, onPress }) that shows the typed value once one is set.
function OptionGrid({ options, selected, onSelect, cols = 3, other }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {options.map((o) => (
        <View key={o.key} style={{ width: tilePct(cols), padding: 4 }}>
          <OptionTile label={o.label} swatch={o.swatch} on={selected === o.key} onPress={() => onSelect(o.key)} />
        </View>
      ))}
      {other ? (
        <View style={{ width: tilePct(cols), padding: 4 }}>
          <OptionTile label={other.value || 'Other'} icon={Plus} on={!!other.value} onPress={other.onPress} />
        </View>
      ) : null}
    </View>
  );
}

function OptionTile({ label, swatch, icon: Icon, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={label}
      className="flex-row items-center justify-center active:opacity-80"
      style={{
        minHeight: 46, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12,
        borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : BORDER, backgroundColor: on ? MINT : '#FFFFFF',
      }}
    >
      {swatch ? (
        <View style={{ height: 16, width: 16, borderRadius: 8, backgroundColor: swatch, borderWidth: 1, borderColor: 'rgba(17, 17, 17,0.15)', marginRight: 6 }} />
      ) : Icon ? (
        <Icon size={15} color={ACCENT} strokeWidth={2.5} style={{ marginRight: 4 }} />
      ) : null}
      <Text
        style={{ flexShrink: 1, fontSize: 12, lineHeight: 15, fontWeight: on ? '800' : '600', color: on ? ACCENT_TEXT : INK, textAlign: 'center' }}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}
