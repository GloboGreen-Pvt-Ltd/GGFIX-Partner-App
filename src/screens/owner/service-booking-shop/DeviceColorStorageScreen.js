import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Smartphone,
  Cpu,
  HardDrive,
  Palette,
  Hash,
  Check,
  ChevronRight,
  ArrowLeft,
  Database,
  Ruler,
  Wifi,
  Headphones,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Loader, Select } from '../../../components/rnr';
import { getModelOptions, parseModelNumbers } from '../../../api/masterData';
import useDeviceSpecForm from '../../../lib/hooks/useDeviceSpecForm';
import { SPEC_ATTRIBUTE_KEYS, specDisplayParts } from '../../../utils/deviceSpecs';

// GGFIX palette.
const GREEN = '#09AD2A';        // fills, icons, selected
const GREEN_DEEP = '#078F23';   // green TEXT, gradient partner
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const PLACEHOLDER = '#8A8A8A';
const LINE = '#E6E6E6';
const HAIR = '#F3F3F3';
const PAGE_BG = '#F8F8F8';

// Fallback swatch when a catalogue colour has no hexCode — a best guess at
// the real device colour from its name (these are product colours, not UI).
const COLOR_SWATCHES = {
  black: '#1E1E1E',
  white: '#F8F8F8',
  silver: '#D6D9DE',
  gold: '#F2D58A',
  rose: '#F4C6CC',
  blue: '#3B82F6',
  red: '#E53935',
  green: '#3FAE6A',
  purple: '#8B5CF6',
  pink: '#F48FB1',
  graphite: '#4B4B4B',
  midnight: '#1E2A44',
  starlight: '#F5EBD8',
  sierra: '#9DB4CF',
  alpine: '#4F7A5A',
  sky: '#9CC8EE',
  orange: '#F59E3B',
  yellow: '#F3BF23',
  grey: '#9A9A9A',
  gray: '#9A9A9A',
};

function swatchFor(name) {
  const n = (name || '').toLowerCase();
  for (const key of Object.keys(COLOR_SWATCHES)) {
    if (n.includes(key)) return COLOR_SWATCHES[key];
  }
  return '#D6D6D6';
}

/**
 * "ICE BLUE" / "ice blue" -> "Ice Blue".
 *
 * Colour names are admin-entered, so the catalogue holds every casing. The
 * screen showed them verbatim, which is why one model read "Cosmic Orange" and
 * the next "COSMIC ORANGE". Hyphens and slashes are word breaks too, so
 * "jet-black" and "black/gold" capitalise correctly.
 */
function titleCase(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z0-9])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// Section icon per category-specific field (Laptop / Smartwatch / Audio Device).
const SPEC_ICONS = {
  color: Palette,
  ram: Cpu,
  storageCapacity: HardDrive,
  storageType: Database,
  caseSize: Ruler,
  connectivity: Wifi,
  deviceType: Headphones,
};

// Tile states, shared by the colour tiles and the RAM/Storage variants:
// unselected = white tile with a light line; selected = mint fill, green
// line, deep-green text.
const TILE_LINE = LINE;
const TILE_LINE_ACTIVE = GREEN;
const TILE_TEXT = INK;
const TILE_TEXT_ACTIVE = GREEN_DEEP;

export default function DeviceColorStorageScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [rams, setRams] = useState([]);
  const [storages, setStorages] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [colorsList, setColorsList] = useState([]);
  const [modelOptions, setModelOptions] = useState(null);
  // Edit mode: hydrate color/RAM/storage from the existing ticket so they show
  // pre-selected. Picking a different option just overwrites the choice.
  const [color, setColor] = useState(params.color || '');
  const [ram, setRam] = useState(params.ramOptionId || null);
  const [storage, setStorage] = useState(params.storageOptionId || null);
  // A model can carry one or more model numbers (e.g. Vivo T1 → V2153 / V2168).
  // We seed the list from the params forwarded by the picker so it shows even
  // before the fetch resolves, then refresh from the model's configured codes.
  const [modelNumbers, setModelNumbers] = useState(
    parseModelNumbers(params.modelNumbers?.length ? params.modelNumbers : params.modelNumber),
  );
  const [modelNumber, setModelNumber] = useState(params.modelNumber || null);

  /**
   * A model typed through "Other" has no catalogue entry, so getModelOptions()
   * finds nothing configured and falls back to the FULL master lists — which is
   * why an unlisted device was offering every colour the platform knows (Beige,
   * Black Titanium, Natural Titanium…) and every storage size. None of it
   * describes the device in the customer's hand.
   *
   * That path types colour, RAM and storage instead. A catalogue model keeps the
   * swatches and variant grid, where the options ARE what the model shipped in.
   */
  const isCustomModel = !!params.customModel || !params.modelId;
  const [ramText, setRamText] = useState(params.ramLabel || '');
  const [storageText, setStorageText] = useState(params.storageLabel || '');

  // Storage-only models ("128 GB", no "+") don't require a RAM pick.
  const specsStorageOnly = specs.length > 0 && specs.every((sp) => sp.storageOnly);

  /**
   * Laptop / Smartwatch / Audio Device skip the phone RAM/Storage grid — the
   * fields come from utils/deviceSpecs.js, shared with Sell's
   * SelectVariantScreen. In Booking a Laptop asks RAM + Storage Capacity +
   * Storage Type, and a Smartwatch or Audio Device asks Color only
   * (context 'BOOKING'). Mobile and Tablet (spec.usesSpecs false) keep the
   * form below exactly as it was.
   */
  const spec = useDeviceSpecForm({
    context: 'BOOKING',
    hints: [params.deviceCategory, params.categoryCode, params.categoryName, params.categoryId],
    categoryId: params.categoryId,
    modelId: params.modelId,
    modelOptions,
    initial: { ...(params.specs || {}), color: params.color },
    legacy: {
      ramOptionId: params.ramOptionId,
      storageOptionId: params.storageOptionId,
      ramLabel: params.ramLabel,
      storageLabel: params.storageLabel,
    },
  });
  const specAttributes = () => {
    const out = {};
    SPEC_ATTRIBUTE_KEYS.forEach((k) => { if (spec.values[k]) out[k] = spec.values[k]; });
    return out;
  };
  // Category-specific path: no master option ids, the attributes travel as
  // `specs` (stored form) through to ServiceBookingDevicesList's request.
  const specParams = () => ({
    color: spec.values.color || undefined,
    ramOptionId: null,
    storageOptionId: null,
    ramLabel: undefined,
    storageLabel: undefined,
    deviceCategory: spec.category,
    specs: specAttributes(),
    modelNumber: modelNumber || undefined,
  });

  useEffect(() => {
    (async () => {
      try {
        const opts = await getModelOptions(params.modelId);
        setModelOptions(opts);
        // Show only THIS model's configured colors + RAM/storage variants (what
        // the admin set for the model); fall back to the full master lists when
        // the model has nothing configured yet.
        setColorsList(opts.colors.length ? opts.colors : opts.allColors);
        setSpecs(opts.specs);
        setRams(opts.allRams);
        setStorages(opts.allStorages);
        // Prefer the model's configured model numbers; keep the param-seeded list
        // as a fallback when the model has none set.
        const numbers = opts.modelNumbers?.length
          ? opts.modelNumbers
          : parseModelNumbers(params.modelNumbers?.length ? params.modelNumbers : params.modelNumber);
        setModelNumbers(numbers);
        // Default the selection to the picked number (if still valid) or the first.
        setModelNumber((prev) => (prev && numbers.includes(prev) ? prev : (numbers[0] || null)));
      } catch (_) { }
      // Never leave the spec form waiting on a lookup that failed.
      setModelOptions((prev) => prev || {});
      setLoading(false);
    })();
  }, []);

  const onContinue = () => {
    if (spec.usesSpecs) {
      if (!spec.ready) return;
      navigation.navigate('DeviceServices', { ...params, ...specParams() });
      return;
    }
    if (isCustomModel) {
      if (!color.trim() || !storageText.trim()) return;
      navigation.navigate('DeviceServices', {
        ...params,
        color: color.trim(),
        // Typed, so no master ids — the booking stores the labels.
        ramOptionId: null,
        storageOptionId: null,
        ramLabel: ramText.trim() || undefined,
        storageLabel: storageText.trim(),
        modelNumber: modelNumber || undefined,
        deviceCategory: spec.category || undefined,
      });
      return;
    }
    if (!color.trim() || !storage || (!specsStorageOnly && !ram)) return;
    const ramLabel = rams.find((x) => x.id === ram)?.label;
    const storageLabel = storages.find((x) => x.id === storage)?.label;
    navigation.navigate('DeviceServices', {
      ...params,
      color: color.trim(),
      ramOptionId: ram,
      storageOptionId: storage,
      ramLabel,
      storageLabel,
      modelNumber: modelNumber || undefined,
      deviceCategory: spec.category || undefined,
    });
  };

  // Skip lets the owner move on without picking color/RAM/storage — any partial
  // selection is still forwarded, and downstream screens already treat these as
  // optional (they render with `.filter(Boolean)`).
  const onSkip = () => {
    if (spec.usesSpecs) {
      navigation.navigate('DeviceServices', { ...params, ...specParams() });
      return;
    }
    navigation.navigate('DeviceServices', {
      ...params,
      color: color.trim() || undefined,
      ramOptionId: isCustomModel ? undefined : (ram || undefined),
      storageOptionId: isCustomModel ? undefined : (storage || undefined),
      ramLabel: isCustomModel ? (ramText.trim() || undefined) : rams.find((x) => x.id === ram)?.label,
      storageLabel: isCustomModel
        ? (storageText.trim() || undefined)
        : storages.find((x) => x.id === storage)?.label,
      modelNumber: modelNumber || undefined,
      deviceCategory: spec.category || undefined,
    });
  };

  // RAM stays optional on the typed path — plenty of devices are booked in
  // without one and the shop should not be blocked guessing it.
  const ready = spec.usesSpecs
    ? spec.ready
    : isCustomModel
      ? (!!color.trim() && !!storageText.trim())
      : (!!color && !!storage && (specsStorageOnly || !!ram));

  // Responsive columns: colours 3 / variants 2 on phones, more on tablets.
  const { width: winW } = useWindowDimensions();
  const colorCols = winW >= 900 ? 6 : winW >= 600 ? 4 : 3;
  const variantCols = winW >= 900 ? 4 : winW >= 600 ? 3 : 2;
  const col = winW >= 600 ? { width: Math.min(winW - 32, 720), alignSelf: 'center' } : null;

  const header = (withSkip) => (
    <View
      style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE }}
    >
      <View className="relative flex-row items-center justify-center" style={col}>
        <Pressable
          onPress={() => navigation.goBack()}
          className="absolute left-0 items-center justify-center active:opacity-70"
          style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: LINE }}
        >
          <ArrowLeft size={18} color={INK} />
        </Pressable>
        <View className="items-center px-12">
          <Text style={{ fontSize: 17, fontWeight: '800', color: INK, textAlign: 'center' }} numberOfLines={1}>
            Your Device
          </Text>
        </View>
        {withSkip ? (
          <Pressable
            onPress={onSkip}
            className="absolute right-0 items-center justify-center active:opacity-70"
            style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: LINE }}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: MUTED }}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (loading || spec.loading) {
    return (
      <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
        {header(false)}
        <Loader label="Loading device options..." />
      </View>
    );
  }

  const inputStyle = {
    backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: LINE,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: INK,
  };

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      {header(true)}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={col}>
          {/* ── Device summary card ─────────────────────────────── */}
          <View
            style={{
              backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: HAIR,
              paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center',
              shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
            }}
          >
            <View className="items-center justify-center" style={{ width: 120, height: 120 }}>
              {params.imageUrl ? (
                <Image source={{ uri: params.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              ) : (
                <Smartphone size={44} color={GREEN} />
              )}
            </View>
            <Text style={{ marginTop: 8, fontSize: 15, fontWeight: '800', color: INK, textAlign: 'center' }} numberOfLines={2}>
              {params.modelName || 'Device'}
            </Text>
            {params.brandName ? (
              <Text style={{ marginTop: 1, fontSize: 12, color: MUTED, textAlign: 'center' }} numberOfLines={1}>
                {params.brandName}
              </Text>
            ) : null}
            {modelNumber ? (
              <View className="flex-row items-center rounded-full" style={{ marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT_LINE }}>
                <Hash size={10} color={GREEN} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: GREEN_DEEP, marginLeft: 3 }} numberOfLines={1}>
                  {modelNumber}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Model number — pick the exact variant when a model has several ── */}
          {modelNumbers.length > 1 ? (
            <Card>
              <SectionHeader icon={Hash} label="Model Number" subtitle="Pick the exact model number" />
              <Select
                value={modelNumber}
                onChange={(v) => setModelNumber(v)}
                placeholder="Select model number"
                options={modelNumbers.map((n) => ({ value: n, label: n }))}
              />
            </Card>
          ) : null}

          {/* ── Category-specific fields (Laptop / Smartwatch / Audio) ── */}
          {spec.usesSpecs ? (
            spec.fields.map((f) => (
              <Card key={f.key}>
                {/* Colour keeps the Mobile form's "Model Color" header. */}
                <SectionHeader
                  icon={SPEC_ICONS[f.key] || HardDrive}
                  label={f.key === 'color' ? 'Model Color' : f.label}
                  subtitle={f.key === 'color' ? undefined : (f.required ? f.hint : `${f.hint} (optional)`)}
                />
                {f.key === 'color' ? (
                  <ColorGrid
                    colors={f.options.map((o) => ({ id: o.value, name: o.value, hexCode: o.hex }))}
                    value={spec.values.color || ''}
                    onChange={(v) => spec.setValue('color', v)}
                    columns={colorCols}
                  />
                ) : (
                  <VariantGrid
                    options={f.options}
                    selected={spec.values[f.key] || null}
                    onSelect={(v) => spec.setValue(f.key, v)}
                    getLabel={(o) => o.label}
                    keyOf={(o) => o.value}
                    columns={f.key === 'storageType' || f.key === 'connectivity' || f.key === 'deviceType' ? variantCols : colorCols}
                  />
                )}
              </Card>
            ))
          ) : isCustomModel ? (
            <Card>
              <SectionHeader icon={Palette} label="Model Color" subtitle="Type the colour" />
              <TextInput
                value={color}
                onChangeText={setColor}
                placeholder="e.g. Sea Green"
                placeholderTextColor={PLACEHOLDER}
                style={inputStyle}
              />
              <View style={{ height: 10 }} />
              <SectionHeader icon={HardDrive} label="RAM" subtitle="Type the RAM (optional)" />
              <TextInput
                value={ramText}
                onChangeText={setRamText}
                placeholder="e.g. 8 GB"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="characters"
                style={inputStyle}
              />
              <View style={{ height: 10 }} />
              <SectionHeader icon={HardDrive} label="Storage" subtitle="Type the capacity" />
              <TextInput
                value={storageText}
                onChangeText={setStorageText}
                placeholder="e.g. 128 GB"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="characters"
                style={inputStyle}
              />
            </Card>
          ) : (
            <>
              {/* ── Colour ───────────────────────────────────────── */}
              <Card>
                <SectionHeader icon={Palette} label="Model Color" />
                {colorsList.length > 0 ? (
                  <ColorGrid colors={colorsList} value={color} onChange={setColor} columns={colorCols} />
                ) : (
                  <TextInput
                    placeholder="e.g. Silver Shadow"
                    placeholderTextColor={PLACEHOLDER}
                    value={color}
                    onChangeText={setColor}
                    style={inputStyle}
                  />
                )}
              </Card>

              {specs.length > 0 ? (
                /* ── Model variants — combined RAM + Storage the model actually ships */
                <Card>
                  <SectionHeader icon={HardDrive} label={specsStorageOnly ? 'Storage' : 'RAM & Storage'} />
                  <VariantGrid
                    options={specs}
                    selected={specs.find((x) => x.ramOptionId === ram && x.storageOptionId === storage)?.id || null}
                    onSelect={(k) => {
                      if (!k) { setRam(null); setStorage(null); return; }
                      const sp = specs.find((x) => x.id === k);
                      if (sp) { setRam(sp.ramOptionId); setStorage(sp.storageOptionId); }
                    }}
                    getLabel={(sp) => sp.label}
                    keyOf={(sp) => sp.id}
                    columns={variantCols}
                    showCircle
                  />
                </Card>
              ) : (
                <>
                  {/* ── RAM / Storage (fallback: model has no variants) ─── */}
                  <Card>
                    <SectionHeader icon={Cpu} label="RAM" subtitle="Pick the memory size" />
                    <VariantGrid
                      options={rams}
                      selected={ram}
                      onSelect={setRam}
                      getLabel={(x) => x.label}
                      keyOf={(x) => x.id}
                      columns={colorCols}
                    />
                  </Card>
                  <Card>
                    <SectionHeader icon={HardDrive} label="Storage" subtitle="Pick the capacity" />
                    <VariantGrid
                      options={storages}
                      selected={storage}
                      onSelect={setStorage}
                      getLabel={(x) => x.label}
                      keyOf={(x) => x.id}
                      columns={colorCols}
                    />
                  </Card>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky configuration bar ─────────────────────────────── */}
      <View
        className="absolute left-0 right-0 bottom-0"
        style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 10 }}
      >
        <View style={col}>
          <Pressable
            onPress={onContinue}
            disabled={!ready}
            className="active:opacity-90"
            style={{ borderRadius: 14, overflow: 'hidden', borderWidth: ready ? 0 : 1, borderColor: LINE }}
          >
            <LinearGradient
              colors={ready ? [GREEN, GREEN_DEEP] : [PAGE_BG, PAGE_BG]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: ready ? 'rgba(255,255,255,0.85)' : MUTED }}>
                  YOUR CONFIGURATION
                </Text>
                <Text style={{ marginTop: 1, fontSize: 13, fontWeight: '800', color: ready ? '#FFFFFF' : INK }} numberOfLines={1}>
                  {spec.usesSpecs
                    ? summaryLabel(spec.values.color, ...specDisplayParts({ deviceCategory: spec.category, specs: spec.values }))
                    : summaryLabel(color, rams.find((x) => x.id === ram)?.label, storages.find((x) => x.id === storage)?.label)}
                </Text>
              </View>
              <View
                className="flex-row items-center"
                style={{ marginLeft: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: ready ? 'rgba(255,255,255,0.2)' : '#FFFFFF' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: ready ? '#FFFFFF' : MUTED }}>Continue</Text>
                <ChevronRight size={16} color={ready ? '#FFFFFF' : MUTED} />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Reusable bits
// ════════════════════════════════════════════════════════════════════════════
function Card({ children }) {
  return (
    <View
      style={{
        marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: HAIR,
        padding: 12, shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 9 }}>
      <View className="items-center justify-center" style={{ height: 26, width: 26, borderRadius: 9, backgroundColor: MINT, marginRight: 8 }}>
        <Icon size={13} color={GREEN} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: INK }}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// Colour swatch tiles. Tapping the selected colour clears it.
function ColorGrid({ colors, value, onChange, columns }) {
  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
      {colors.map((c) => {
        const active = value === c.name;
        const sw = c.hexCode || swatchFor(c.name);
        return (
          <View key={c.id || c.name} style={{ width: `${100 / columns}%`, padding: 3 }}>
            <Pressable
              onPress={() => onChange(value === c.name ? '' : c.name)}
              className="flex-row items-center"
              style={{
                minHeight: 40,
                borderRadius: 12,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? TILE_LINE_ACTIVE : TILE_LINE,
                backgroundColor: active ? MINT : '#FFFFFF',
                paddingVertical: active ? 6.5 : 7,
                paddingHorizontal: active ? 7.5 : 8,
              }}
            >
              <View
                className="items-center justify-center"
                style={{ height: 18, width: 18, borderRadius: 9, backgroundColor: sw, borderWidth: 1, borderColor: 'rgba(30,30,30,0.15)' }}
              >
                {active ? <Check size={10} color={sw === '#F8F8F8' || sw === '#FFFFFF' ? INK : '#FFFFFF'} strokeWidth={3} /> : null}
              </View>
              <Text
                style={{ flex: 1, marginLeft: 7, fontSize: 12, fontWeight: active ? '800' : '600', color: active ? TILE_TEXT_ACTIVE : TILE_TEXT }}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {titleCase(c.name)}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function VariantGrid({ options, selected, onSelect, getLabel, keyOf, columns = 3, showCircle = false }) {
  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
      {options.map((o) => {
        const k = keyOf(o);
        const active = selected === k;
        return (
          <View key={k} style={{ width: `${100 / columns}%`, padding: 3 }}>
            <Pressable
              onPress={() => onSelect(active ? null : k)}
              className={`items-center justify-center ${showCircle ? 'flex-row' : ''}`}
              style={{
                minHeight: 40,
                borderRadius: 12,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? TILE_LINE_ACTIVE : TILE_LINE,
                backgroundColor: active ? MINT : '#FFFFFF',
                // Padding absorbs the thicker border so the label never shifts.
                paddingVertical: active ? 7.5 : 8,
                paddingHorizontal: active ? 7.5 : 8,
              }}
            >
              {showCircle ? (
                <View
                  style={{
                    height: 18, width: 18, borderRadius: 9, borderWidth: 1.5,
                    borderColor: active ? GREEN : '#D6D6D6', backgroundColor: active ? GREEN : '#FFFFFF',
                    alignItems: 'center', justifyContent: 'center', marginRight: 7,
                  }}
                >
                  {active ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              ) : null}
              <Text
                style={{ flexShrink: 1, fontSize: 12, fontWeight: active ? '800' : '600', color: active ? TILE_TEXT_ACTIVE : TILE_TEXT, textAlign: 'center' }}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {getLabel(o)}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function summaryLabel(...values) {
  const parts = values.filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Pick your variant';
}
