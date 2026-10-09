import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Smartphone,
  Cpu,
  HardDrive,
  Palette,
  Check,
  Tag,
  ShieldCheck,
  Skull,
  Pencil,
  Database,
  Ruler,
  Wifi,
  Headphones,
} from 'lucide-react-native';
import { rf, rs } from '../../../utils/responsive';
import { SELL, SellButton } from '../sell/sellTheme';

// Header-only constants, matching the custom white header already used by
// this flow's sibling screens (DeviceMissingPartsScreen, DeviceInformationScreen)
// — this screen previously had no header of its own and relied on the plain
// native-stack title, which looked flatter than its siblings.
const HEADER_WHITE = '#FFFFFF';
const HEADER_LINE = '#E6E6E6';
const HEADER_INK = '#1E1E1E';
const HEADER_SOFT = '#F8F8F8';

const sellConditionsFor = (deviceLabel) => [
  { key: 'WORKING', label: `Working ${deviceLabel}`, sub: 'Turns on · No major issues', icon: Smartphone, color: SELL.green, tint: SELL.greenLight },
  { key: 'DEAD', label: `${deviceLabel} Dead / Unknown`, sub: "Won't turn on · Not sure", icon: Skull, color: SELL.danger, tint: SELL.dangerLight },
];
import { notify } from '../../../components/confirm';
import {
  BottomActionBar,
  Input,
  Label,
  Loader,
  Badge,
} from '../../../components/rnr';
import { getModelOptions } from '../../../api/masterData';
import { createSavedDevice, updateSavedDevice } from '../../../api/customer';
import useDeviceSpecForm from '../../../lib/hooks/useDeviceSpecForm';
import { SPEC_ATTRIBUTE_KEYS, formatSpecValue, specDetailRows } from '../../../utils/deviceSpecs';

// Section icon + right-hand caption per category-specific field.
const SPEC_ICONS = {
  color: Palette,
  ram: Cpu,
  storageCapacity: HardDrive,
  storageType: Database,
  caseSize: Ruler,
  connectivity: Wifi,
  deviceType: Headphones,
};
const SPEC_CAPTIONS = {
  ram: 'Memory',
  storageCapacity: 'Capacity',
  storageType: 'Drive',
  caseSize: 'Size',
  connectivity: 'Network',
  deviceType: 'Type',
};

// Each name maps to its OWN distinct, semantically-matched hex — previously
// "blue", "green", "pink" and "purple" all resolved to the same bright green,
// and "midnight"/"cosmic" resolved to a dark green instead of navy/dark blue,
// so e.g. a device listed as "Cosmic Blue" or "Rose Gold" rendered a green
// swatch dot.
const COLOR_SWATCHES = {
  black: '#1A1A1A', white: '#F7FAF7', silver: '#C7CDD1', gold: '#E6C384',
  rose: '#E8B4B8', blue: '#3B82F6', red: '#DC2626', green: '#16A34A',
  purple: '#8B5CF6', pink: '#EC4899', graphite: '#4B5563', midnight: '#1E293B',
  starlight: '#F5F1E6', sierra: '#9DB4C0', alpine: '#2F6B4F', sky: '#BFDBFE',
  phantom: '#374151', cosmic: '#1E3A5F',
};
// A handful of real, well-known TWO-WORD device colour names checked as exact
// phrases before the single-word fallback above — plain substring matching
// alone gets these wrong (e.g. "Rose Gold".includes('gold') is true, and
// "gold" alone would win since it's a shorter/earlier match than "rose", even
// though Rose Gold is a pink-toned colour, not plain gold).
const COMPOUND_COLOR_SWATCHES = {
  'rose gold': '#E8B4B8',
  'space gray': '#5B5F62',
  'space grey': '#5B5F62',
  'midnight green': '#1E293B',
  'pacific blue': '#1E3A5F',
};
function swatchFor(name) {
  const n = (name || '').toLowerCase().trim();
  if (COMPOUND_COLOR_SWATCHES[n]) return COMPOUND_COLOR_SWATCHES[n];
  for (const key of Object.keys(COLOR_SWATCHES)) {
    if (n.includes(key)) return COLOR_SWATCHES[key];
  }
  return '#8FA08F';
}

export default function SelectVariantScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const flow = route?.params?.flow || 'PROFILE';
  const isEdit = !!route?.params?.deviceId;
  const modelId = route?.params?.modelId;
  const modelName = route?.params?.modelName || 'Device';
  const brandId = route?.params?.brandId;
  const brandName = route?.params?.brandName;
  const categoryId = route?.params?.categoryId;
  const modelImageUrl = route?.params?.modelImageUrl;

  // Categories that don't have an IMEI (laptops, audio devices, smartwatches…).
  // We resolve the category code from either the params (set by the picker) or
  // the categoryId itself when it's a code string and not a UUID.
  const isUuid = (v) => typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const categoryCode = (
    typeof categoryId === 'string' && !isUuid(categoryId)
      ? categoryId
      : (route?.params?.categoryCode || '')
  ).toUpperCase();
  const NO_IMEI_KEYWORDS = ['LAPTOP', 'AUDIO', 'WATCH', 'HEADPHONE', 'EARBUD', 'TABLET'];
  const noImei = NO_IMEI_KEYWORDS.some((k) => categoryCode.includes(k));
  // Smart watches & audio devices don't take RAM/Storage selections.
  const NO_RAM_STORAGE_KEYWORDS = ['WATCH', 'AUDIO', 'HEADPHONE', 'EARBUD'];
  const noRamStorage = NO_RAM_STORAGE_KEYWORDS.some((k) => categoryCode.includes(k));
  // Heading + condition labels follow the category.
  const conditionDeviceLabel = categoryCode.includes('LAPTOP') ? 'Laptop'
    : categoryCode.includes('WATCH') ? 'Smart Watch'
    : categoryCode.includes('AUDIO') || categoryCode.includes('HEADPHONE') || categoryCode.includes('EARBUD') ? 'Audio Device'
    : 'Mobile';
  const SELL_CONDITIONS = sellConditionsFor(conditionDeviceLabel);

  const [rams, setRams] = useState([]);
  const [storages, setStorages] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [colorsList, setColorsList] = useState([]);
  const [modelOptions, setModelOptions] = useState(null);

  const editHints = route?.params?.editHints || null;
  const editSellOrderId = route?.params?.editSellOrderId || null;
  const isEditingSellOrder = !!editSellOrderId;

  const [ram, setRam] = useState(route?.params?.ramOptionId ? { id: route.params.ramOptionId, label: '' } : null);
  const [storage, setStorage] = useState(route?.params?.storageOptionId ? { id: route.params.storageOptionId, label: '' } : null);
  const [color, setColor] = useState(route?.params?.color ? { id: route.params.color, name: route.params.color } : null);
  const [imei, setImei] = useState(route?.params?.imei || '');
  // When editing a sell order, restore the original working condition; for a
  // brand-new sell we default to WORKING.
  const [condition, setCondition] = useState(
    (isEditingSellOrder && editHints?.workingCondition === 'DEAD') ? 'DEAD' : 'WORKING',
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // When a model's variants are storage-only ("128 GB", no "+"), the picker shows
  // a single Storage grid and doesn't require a RAM selection.
  const specsStorageOnly = specs.length > 0 && specs.every((sp) => sp.storageOnly);

  /**
   * Laptop / Smartwatch / Audio Device take their own attributes (RAM +
   * Storage Capacity + Storage Type; Case Size + Connectivity; Device Type +
   * Connectivity) — defined once in utils/deviceSpecs.js and shared with the
   * Booking flow's DeviceColorStorageScreen. Mobile and Tablet (spec.usesSpecs
   * false) keep the colour + RAM/Storage form below exactly as it was.
   */
  const spec = useDeviceSpecForm({
    hints: [route?.params?.deviceCategory, categoryCode, route?.params?.categoryName, categoryId],
    categoryId,
    modelId,
    modelOptions,
    initial: { ...(route?.params?.specs || editHints?.specs || {}), color: route?.params?.color },
    legacy: {
      ramOptionId: route?.params?.ramOptionId,
      storageOptionId: route?.params?.storageOptionId,
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const opts = await getModelOptions(modelId);
        setModelOptions(opts);
        // Prefer THIS model's configured colors + RAM/storage variants; fall back
        // to the full master lists (then a hardcoded color list) when nothing is set.
        const cs = opts.colors.length ? opts.colors : opts.allColors;
        setColorsList(cs.length ? cs : [
          { id: 'Midnight Black', name: 'Midnight Black' },
          { id: 'Phantom Silver', name: 'Phantom Silver' },
          { id: 'Cosmic Blue', name: 'Cosmic Blue' },
          { id: 'Rose Gold', name: 'Rose Gold' },
          { id: 'Starlight', name: 'Starlight' },
          { id: 'Alpine Green', name: 'Alpine Green' },
        ]);
        setSpecs(opts.specs);
        setRams(opts.allRams);
        setStorages(opts.allStorages);
      } catch (_) {}
      // Never leave the spec form waiting on a lookup that failed.
      setModelOptions((prev) => prev || {});
      setLoading(false);
    })();
  }, []);

  // Sync display labels for RAM/storage when arriving with only id
  useEffect(() => {
    if (ram && !ram.label) {
      const found = rams.find((r) => r.id === ram.id);
      if (found) setRam(found);
    }
    if (storage && !storage.label) {
      const found = storages.find((s) => s.id === storage.id);
      if (found) setStorage(found);
    }
  }, [rams, storages, ram, storage]);

  const onContinue = async () => {
    if (spec.usesSpecs) {
      if (!spec.ready) return;
    } else {
      if (!color) return;
      if (!noRamStorage && (!storage || (!specsStorageOnly && !ram))) return;
    }

    // Only send UUID-typed fields the backend can parse. Hardcoded category
    // codes like 'SMARTPHONE' (from Home tiles / fallback list) would fail
    // Spring's @RequestBody UUID parsing — strip anything that isn't a UUID.
    const onlyUuid = (v) => (isUuid(v) ? v : undefined);

    // categoryCode is a string code like SMARTPHONE / LAPTOP — preserved
    // separately from the UUID so the backend can filter saved devices per
    // category even when no UUID was known at booking time.
    const categoryCodeString = typeof categoryId === 'string' && !isUuid(categoryId)
      ? categoryId.toUpperCase()
      : (route?.params?.categoryCode || undefined);

    const payload = {
      categoryId: onlyUuid(categoryId),
      categoryCode: categoryCodeString,
      brandId: onlyUuid(brandId),
      modelId: onlyUuid(modelId),
      // Denormalized display fields so the saved-device list can render the
      // real name/brand/specs without a master-data join.
      modelName: modelName && modelName !== 'Device' ? modelName : undefined,
      brandName: brandName || undefined,
      imageUrl: modelImageUrl || undefined,
      ramLabel: noRamStorage ? undefined : (ram?.label || undefined),
      storageLabel: noRamStorage ? undefined : (storage?.label || undefined),
      ramOptionId: noRamStorage ? undefined : onlyUuid(ram?.id),
      storageOptionId: noRamStorage ? undefined : onlyUuid(storage?.id),
      color: color?.name || color?.id,
      imei: (flow === 'SELL' && !noImei) ? imei : undefined,
      deviceCategory: spec.category || undefined,
    };
    if (spec.usesSpecs) {
      // Category-specific path: no master option ids; the attributes travel
      // as `specs` (stored form) to the listing / booking request.
      const attrs = {};
      SPEC_ATTRIBUTE_KEYS.forEach((k) => { if (spec.values[k]) attrs[k] = spec.values[k]; });
      payload.specs = attrs;
      payload.color = spec.values.color;
      payload.ramOptionId = undefined;
      payload.storageOptionId = undefined;
      // Display copies for screens and clients that only read ramLabel /
      // storageLabel (marketplace ram_label / storage_label). Laptop only —
      // the canonical values are the attributes above.
      payload.ramLabel = attrs.ram ? formatSpecValue('ram', attrs.ram) : undefined;
      payload.storageLabel = attrs.storageCapacity ? formatSpecValue('storageCapacity', attrs.storageCapacity) : undefined;
    }

    if (flow === 'PROFILE') {
      setSaving(true);
      try {
        if (isEdit) await updateSavedDevice(route.params.deviceId, payload);
        else await createSavedDevice(payload);
        navigation.popToTop();
        navigation.navigate('ManageDevice');
      } catch (e) {
        notify('Save failed', e.message || 'Could not save device. Try again.');
      } finally { setSaving(false); }
      return;
    }
    if (flow === 'REPAIR') {
      navigation.navigate('RepairSelectService', { device: { ...payload, modelName } });
      return;
    }
    if (flow === 'SELL') {
      navigation.navigate('SellScreening', {
        device: { ...payload, modelName, imei },
        workingCondition: condition,
        editSellOrderId: route?.params?.editSellOrderId,
        editHints: route?.params?.editHints,
      });
      return;
    }
    if (flow === 'OWNER_LIST') {
      // Owner is listing this device on the marketplace — hand off to the
      // description chooser (Detailed / Short / Dead Phone Short).
      navigation.navigate('OwnerSellMobile', { device: { ...payload, modelName, imei } });
      return;
    }
  };

  // Same header as the loaded state below (not just the bare Loader) — the
  // native-stack header is hidden for this route, so without this the back
  // button would be missing for the brief moment this screen is loading.
  if (loading || spec.loading) {
    return (
      <View className="flex-1" style={{ backgroundColor: HEADER_WHITE }}>
        <View
          style={{
            backgroundColor: HEADER_WHITE,
            paddingTop: insets.top + rs(10),
            paddingBottom: rs(14),
            paddingHorizontal: rs(16),
            borderBottomWidth: 1,
            borderBottomColor: HEADER_LINE,
          }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => navigation.goBack()}
              className="items-center justify-center active:opacity-70"
              style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: HEADER_SOFT }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={rf(20)} color={HEADER_INK} strokeWidth={2} />
            </Pressable>
            <Text
              className="flex-1 text-text text-center"
              style={{ fontSize: 17, fontWeight: '800', paddingHorizontal: rs(8) }}
              numberOfLines={1}
            >
              Your Device
            </Text>
            <View style={{ width: rs(40) }} />
          </View>
        </View>
        <Loader label="Loading variants..." />
      </View>
    );
  }

  const ready = spec.usesSpecs
    ? spec.ready && (flow !== 'SELL' || noImei || imei.trim())
    : color &&
      (noRamStorage || (storage && (specsStorageOnly || ram))) &&
      (flow !== 'SELL' || noImei || imei.trim());
  const specRows = spec.usesSpecs ? specDetailRows({ deviceCategory: spec.category, specs: spec.values }) : [];
  const ctaLabel = flow === 'PROFILE'
    ? (isEdit ? 'Update Device' : 'Save Device')
    : flow === 'REPAIR' ? 'Choose Repair Service'
    : flow === 'OWNER_LIST' ? 'Choose Description'
    : 'Continue';

  return (
    <View className="flex-1" style={{ backgroundColor: SELL.page }}>
      {/* Custom white header — matches DeviceMissingParts/DeviceInformation,
          this flow's other screens. The native-stack header is hidden for
          this route (OwnerNavigator's SelectVariant registration) so this is
          the only header shown. */}
      <View
        style={{
          backgroundColor: HEADER_WHITE,
          paddingTop: insets.top + rs(10),
          paddingBottom: rs(14),
          paddingHorizontal: rs(16),
          borderBottomWidth: 1,
          borderBottomColor: HEADER_LINE,
        }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center justify-center active:opacity-70"
            style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: HEADER_SOFT }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={rf(20)} color={HEADER_INK} strokeWidth={2} />
          </Pressable>
          <Text
            className="flex-1 text-text text-center"
            style={{ fontSize: 17, fontWeight: '800', paddingHorizontal: rs(8) }}
            numberOfLines={1}
          >
            Your Device
          </Text>
          {/* Balances the back button so the title stays optically centred. */}
          <View style={{ width: rs(40) }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>

        {isEditingSellOrder ? (
          <View className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 mb-3 flex-row items-center">
            <Pencil size={13} color="#F59E0B" />
            <View className="flex-1 ml-2">
              <Text className="text-[10px] font-extrabold text-warning tracking-wider">EDITING ORDER</Text>
              <Text className="text-[12px] text-text font-semibold" numberOfLines={1}>
                We've kept your existing color, storage and IMEI — change any of them below.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Device hero — larger image + soft mint gradient, matching the
            "premium device profile" direction (same gradient technique as
            Device Information's hero). */}
        <LinearGradient
          colors={[SELL.greenLight, '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: SELL.greenLine }}
        >
          <View className="flex-row items-center">
            <View className="h-20 w-20 rounded-2xl items-center justify-center mr-3.5 overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: SELL.greenLine }}>
              {modelImageUrl ? (
                <Image source={{ uri: modelImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Smartphone size={30} color={SELL.green} />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-text-muted uppercase tracking-widest">Your Device</Text>
              <Text className="text-[15px] font-extrabold text-text mt-0.5" numberOfLines={2}>{modelName}</Text>
              {brandName ? (
                <Text className="text-[11px] text-text-muted mt-0.5">{brandName}</Text>
              ) : null}
            </View>
            {ready ? (
              <View style={{ alignSelf: 'flex-start', backgroundColor: SELL.green, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 }}>READY</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {/* Device Details — a real summary table of what THIS screen
            actually collects (Brand / Model / Storage / Color / IMEI).
            Deliberately does NOT include "Selected Issue" / "Selected
            Services" / "Device Condition (missing/damaged)" / "Files" rows —
            this screen runs BEFORE any of those exist in the booking flow
            (they're set on later screens: DeviceServicesScreen,
            ServicePriceEstimateScreen, DeviceMissingPartsScreen,
            DeviceInformationScreen), so showing them here would mean
            fabricating data this screen has no access to. */}
        {spec.usesSpecs ? (
          <View className="bg-card border border-border rounded-2xl mb-3 overflow-hidden">
            <Text className="text-[10.5px] font-extrabold text-text-muted tracking-widest px-3 pt-3 pb-2">DEVICE DETAILS</Text>
            {brandName ? <DetailRow label="Brand" value={brandName} /> : null}
            <DetailRow label="Model" value={modelName} />
            {specRows.map((r) => <DetailRow key={r.key} label={r.label} value={r.value} />)}
            {spec.values.color ? (
              <DetailRow
                label="Color"
                value={spec.values.color}
                leading={<View className="h-3.5 w-3.5 rounded-full border border-border" style={{ backgroundColor: swatchFor(spec.values.color) }} />}
              />
            ) : null}
            {flow === 'SELL' && !noImei ? <DetailRow label="IMEI" value={imei ? imei.replace(/./g, '•').slice(0, 15) || imei : '—'} last /> : null}
          </View>
        ) : (brandName || storage?.label || color?.name || (flow === 'SELL' && !noImei)) ? (
          <View className="bg-card border border-border rounded-2xl mb-3 overflow-hidden">
            <Text className="text-[10.5px] font-extrabold text-text-muted tracking-widest px-3 pt-3 pb-2">DEVICE DETAILS</Text>
            {brandName ? <DetailRow label="Brand" value={brandName} /> : null}
            <DetailRow label="Model" value={modelName} />
            {storage?.label ? <DetailRow label={specsStorageOnly ? 'Storage' : 'RAM · Storage'} value={[ram?.label, storage.label].filter(Boolean).join(' · ')} /> : null}
            {color?.name ? (
              <DetailRow
                label="Color"
                value={color.name}
                leading={<View className="h-3.5 w-3.5 rounded-full border border-border" style={{ backgroundColor: swatchFor(color.name) }} />}
              />
            ) : null}
            {flow === 'SELL' && !noImei ? <DetailRow label="IMEI" value={imei ? imei.replace(/./g, '•').slice(0, 15) || imei : '—'} last /> : null}
          </View>
        ) : null}

        {/* Category-specific fields (Laptop / Smartwatch / Audio Device) */}
        {spec.usesSpecs ? spec.fields.map((f) => {
          const Icon = SPEC_ICONS[f.key] || HardDrive;
          const current = spec.values[f.key];
          return (
            <View key={f.key} className="bg-card border border-border rounded-2xl p-3 mb-3">
              <View className="flex-row items-center mb-2.5">
                <View className="h-8 w-8 rounded-full items-center justify-center mr-2" style={{ backgroundColor: SELL.greenLight }}>
                  <Icon size={14} color={SELL.green} />
                </View>
                <Text className="text-[13px] font-extrabold text-text flex-1">{f.label}</Text>
                {f.key === 'color' && current ? (
                  <View className="flex-row items-center">
                    <View className="h-4 w-4 rounded-full border border-border mr-1" style={{ backgroundColor: swatchFor(current) }} />
                    <Text className="text-[11px] font-bold text-text" numberOfLines={1}>{current}</Text>
                  </View>
                ) : (
                  <Text className="text-[11px] text-text-muted">{f.required ? SPEC_CAPTIONS[f.key] : 'Optional'}</Text>
                )}
              </View>
              {f.key === 'color' ? (
                <ColorTiles
                  colors={f.options.map((o) => ({ id: o.value, name: o.value, hexCode: o.hex }))}
                  isActive={(name) => current === name}
                  onPick={(name) => spec.setValue('color', name)}
                />
              ) : (
                <View className="flex-row flex-wrap -mx-1">
                  {f.options.map((o) => {
                    const active = current === o.value;
                    return (
                      <View key={o.value} className="p-1" style={{ width: f.options.length > 4 && f.key !== 'deviceType' && f.key !== 'connectivity' ? '33.333%' : '50%' }}>
                        <Pressable
                          onPress={() => spec.setValue(f.key, active ? null : o.value)}
                          className="rounded-xl py-3 px-1 items-center"
                          style={{ borderWidth: 1.5, borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.green : SELL.card }}
                        >
                          <Text className="text-[13px] font-extrabold text-center" style={{ color: active ? '#FFFFFF' : SELL.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {o.label}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }) : null}

        {/* Color picker */}
        {!spec.usesSpecs ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full items-center justify-center mr-2" style={{ backgroundColor: SELL.greenLight }}>
              <Palette size={14} color={SELL.green} />
            </View>
            <Text className="text-[13px] font-extrabold text-text flex-1">Color</Text>
            {color ? (
              <View className="flex-row items-center">
                <View className="h-4 w-4 rounded-full border border-border mr-1" style={{ backgroundColor: swatchFor(color.name) }} />
                <Text className="text-[11px] font-bold text-text" numberOfLines={1}>{color.name}</Text>
              </View>
            ) : null}
          </View>
          <ColorTiles
            colors={colorsList}
            isActive={(name) => color?.name === name || color?.id === name}
            onPick={(name, c) => setColor({ id: c.id || name, name })}
          />
        </View>
        ) : null}

        {/* Model variants — RAM + Storage combos, or storage-only sizes the model ships */}
        {!spec.usesSpecs && !noRamStorage && specs.length > 0 ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full items-center justify-center mr-2" style={{ backgroundColor: SELL.greenLight }}>
              <HardDrive size={14} color={SELL.green} />
            </View>
            <Text className="text-[13px] font-extrabold text-text flex-1">{specsStorageOnly ? 'Storage' : 'RAM & Storage'}</Text>
            <Text className="text-[11px] text-text-muted">Variant</Text>
          </View>
          <View className="flex-row flex-wrap -mx-1">
            {specs.map((sp) => {
              const active = sp.storageOnly
                ? storage?.id === sp.storageOptionId
                : (ram?.id === sp.ramOptionId && storage?.id === sp.storageOptionId);
              return (
                <View key={sp.id} className="p-1" style={{ width: '50%' }}>
                  <Pressable
                    onPress={() => {
                      setRam(sp.storageOnly ? null : { id: sp.ramOptionId, label: sp.ramLabel });
                      setStorage({ id: sp.storageOptionId, label: sp.storageLabel });
                    }}
                    className="rounded-xl py-3 items-center"
                    style={{ borderWidth: 1.5, borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.green : SELL.card }}
                  >
                    <Text className="text-[13px] font-extrabold" style={{ color: active ? '#FFFFFF' : SELL.ink }} numberOfLines={1}>
                      {sp.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
        ) : null}

        {/* RAM (fallback: model has no variants configured) */}
        {!spec.usesSpecs && !noRamStorage && specs.length === 0 ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full items-center justify-center mr-2" style={{ backgroundColor: SELL.greenLight }}>
              <Cpu size={14} color={SELL.green} />
            </View>
            <Text className="text-[13px] font-extrabold text-text flex-1">RAM</Text>
            <Text className="text-[11px] text-text-muted">Memory</Text>
          </View>
          <View className="flex-row flex-wrap -mx-1">
            {rams.map((r) => {
              const active = ram?.id === r.id;
              return (
                <View key={r.id} className="p-1" style={{ width: '33.333%' }}>
                  <Pressable
                    onPress={() => setRam(r)}
                    className="rounded-xl py-3 items-center"
                    style={{ borderWidth: 1.5, borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.green : SELL.card }}
                  >
                    <Text className="text-[13px] font-extrabold" style={{ color: active ? '#FFFFFF' : SELL.ink }}>{r.label}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
        ) : null}

        {/* Storage (fallback) */}
        {!spec.usesSpecs && !noRamStorage && specs.length === 0 ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full items-center justify-center mr-2" style={{ backgroundColor: SELL.greenLight }}>
              <HardDrive size={14} color={SELL.green} />
            </View>
            <Text className="text-[13px] font-extrabold text-text flex-1">Storage</Text>
            <Text className="text-[11px] text-text-muted">Capacity</Text>
          </View>
          <View className="flex-row flex-wrap -mx-1">
            {storages.map((s) => {
              const active = storage?.id === s.id;
              return (
                <View key={s.id} className="p-1" style={{ width: '33.333%' }}>
                  <Pressable
                    onPress={() => setStorage(s)}
                    className="rounded-xl py-3 items-center"
                    style={{ borderWidth: 1.5, borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.green : SELL.card }}
                  >
                    <Text className="text-[13px] font-extrabold" style={{ color: active ? '#FFFFFF' : SELL.ink }}>{s.label}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
        ) : null}

        {/* IMEI for sell flow — only for mobile/smartphone categories. */}
        {flow === 'SELL' && !noImei ? (
          <View className="bg-card border border-border rounded-2xl p-3 mb-3">
            <View className="flex-row items-center mb-2.5">
              <View className="h-8 w-8 rounded-full items-center justify-center mr-2" style={{ backgroundColor: SELL.greenLight }}>
                <Tag size={14} color={SELL.green} />
              </View>
              <Text className="text-[13px] font-extrabold text-text flex-1">IMEI Number</Text>
              <Text className="text-[10px] text-text-muted">Required for sell</Text>
            </View>
            <Label className="text-[11px] mb-1">Dial *#06# on your device to find IMEI</Label>
            <Input
              placeholder="15-digit IMEI"
              value={imei}
              onChangeText={setImei}
              keyboardType="number-pad"
              className="py-2 text-[13px]"
            />
          </View>
        ) : null}

        {/* Phone condition (sell flow) */}
        {flow === 'SELL' ? (
          <View className="bg-card border border-border rounded-2xl p-3 mb-3">
            <Text className="text-[11px] font-extrabold text-text-muted tracking-widest mb-2">{conditionDeviceLabel.toUpperCase()} CONDITION</Text>
            <View className="flex-row -mx-1">
              {SELL_CONDITIONS.map((o) => {
                const Icon = o.icon;
                const active = condition === o.key;
                return (
                  <View key={o.key} className="px-1 flex-1">
                    <Pressable
                      onPress={() => setCondition(o.key)}
                      className="rounded-xl p-3 items-center"
                      style={{ borderWidth: 1.5, borderColor: active ? o.color : SELL.line, backgroundColor: active ? o.tint : SELL.card }}
                    >
                      <View className="h-10 w-10 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: active ? SELL.card : o.tint }}>
                        <Icon size={20} color={o.color} />
                      </View>
                      <Text className="text-[12px] font-extrabold text-text text-center" numberOfLines={1}>{o.label}</Text>
                      <Text className="text-[10px] text-text-muted mt-0.5 text-center" numberOfLines={2}>{o.sub}</Text>
                      {active ? (
                        <View style={{ marginTop: 6, backgroundColor: o.color, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 }}>SELECTED</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {flow === 'REPAIR' || flow === 'PROFILE' ? (
          <View className="rounded-2xl p-3 flex-row items-center" style={{ backgroundColor: SELL.greenLight }}>
            <ShieldCheck size={16} color={SELL.green} />
            <Text className="text-[11px] text-text ml-2 flex-1">
              Genuine parts · Certified technicians · 30-day repair warranty
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <BottomActionBar>
        <SellButton title={ctaLabel} arrow onPress={onContinue} loading={saving} disabled={!ready} />
      </BottomActionBar>
    </View>
  );
}

/** Colour swatch tiles, three to a row. */
function ColorTiles({ colors, isActive, onPick }) {
  return (
    <View className="flex-row flex-wrap -mx-1">
      {colors.map((c) => {
        const name = c.name || c.id;
        const active = isActive(name);
        const sw = c.hexCode || swatchFor(name);
        return (
          <View key={c.id || name} className="p-1" style={{ width: '33.333%' }}>
            <Pressable
              onPress={() => onPick(name, c)}
              className="rounded-xl p-2.5 items-center"
              style={{ borderWidth: 1.5, borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.greenLight : SELL.card }}
            >
              <View className="flex-row items-center justify-center">
                <View className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: sw }} />
                {active ? (
                  <View className="ml-1 h-4 w-4 rounded-full items-center justify-center" style={{ backgroundColor: SELL.green }}>
                    <Check size={10} color="#fff" />
                  </View>
                ) : null}
              </View>
              <Text
                className="text-[11px] font-bold mt-1.5 text-center"
                style={{ color: active ? SELL.greenDark : SELL.ink }}
                numberOfLines={1}
              >
                {name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** One label/value row in the "Device Details" summary table. */
function DetailRow({ label, value, leading, last }) {
  return (
    <View
      className="flex-row items-center px-3"
      style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}
    >
      <Text className="text-[12px] text-text-muted" style={{ width: 92 }}>{label}</Text>
      <View className="flex-1 flex-row items-center" style={{ gap: 6 }}>
        {leading}
        <Text className="text-[13px] font-bold text-text flex-1" numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}
