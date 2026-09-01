import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
} from 'lucide-react-native';
import { Loader, Select } from '../../../components/rnr';
import { getModelOptions, parseModelNumbers } from '../../../api/masterData';

// Swiggy / Zomato-inspired palette — matches the other booking screens so the
// whole flow feels like one continuous "order" journey, just in green.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

const COLOR_SWATCHES = {
  black: '#172117',
  white: '#F7FAF7',
  silver: '#CBD5CB',
  gold: '#FDE68A',
  rose: '#E6F7E3',
  blue: '#16BB05',
  red: '#DC2626',
  green: '#16BB05',
  purple: '#7ED957',
  pink: '#16BB05',
  graphite: '#667066',
  midnight: '#087A0A',
  starlight: '#FFFBEB',
  sierra: '#CBD5CB',
  alpine: '#667066',
  sky: '#C8EEBF',
};

function swatchFor(name) {
  const n = (name || '').toLowerCase();
  for (const key of Object.keys(COLOR_SWATCHES)) {
    if (n.includes(key)) return COLOR_SWATCHES[key];
  }
  return '#8FA08F';
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

// Colour and variant tiles per row. Both were 2, which left ~half of every
// row empty — a swatch plus "Black" does not need half a phone's width.
const COLOR_COLUMNS = 3;
const VARIANT_COLUMNS = 3;

// Tile states, shared by the colour tiles and the RAM/Storage variants.
//
// LINE ONLY: neither state paints a fill. Unselected outlines in the light
// grey border token, selected in #004C40 — so the pick is read by COLOUR, not
// by a one-pixel weight difference. That is what the two same-coloured lines
// could not do.
const TILE_LINE = '#E2E8E2';
const TILE_LINE_ACTIVE = '#004C40';
const TILE_LINE_W = 1;
const TILE_LINE_ACTIVE_W = 2;
const TILE_TEXT = '#172117';

// The bottom configuration bar. Not ready -> flat #F8F8F8 with dark text;
// ready -> solid #004C40 with white text. Both are FLAT: the gradient and the
// coloured drop shadow are gone.
// Page wash. The sections are surface-less now — no card fills, no rules — so
// the tiles read against this directly.
const SCREEN_BG = '#FFFFFF';

const BAR_BG = '#F8F8F8';
const BAR_BG_READY = '#004C40';
const BAR_TEXT = '#172117';
const BAR_TEXT_READY = '#FFFFFF';
const TILE_TEXT_ACTIVE = '#004C40';

export default function DeviceColorStorageScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [rams, setRams] = useState([]);
  const [storages, setStorages] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [colorsList, setColorsList] = useState([]);
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

  useEffect(() => {
    (async () => {
      try {
        const opts = await getModelOptions(params.modelId);
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
      setLoading(false);
    })();
  }, []);

  const onContinue = () => {
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
    });
  };

  // Skip lets the owner move on without picking color/RAM/storage — any partial
  // selection is still forwarded, and downstream screens already treat these as
  // optional (they render with `.filter(Boolean)`).
  const onSkip = () => {
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
    });
  };

  // RAM stays optional on the typed path — plenty of devices are booked in
  // without one and the shop should not be blocked guessing it.
  const ready = isCustomModel
    ? (!!color.trim() && !!storageText.trim())
    : (!!color && !!storage && (specsStorageOnly || !!ram));

  if (loading) {
    return (
      <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
        <View
          style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 12, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
        >
          <Pressable onPress={() => navigation.goBack()} className="h-10 w-10 rounded-full bg-surface-muted items-center justify-center">
            <ArrowLeft size={20} color="#172117" />
          </Pressable>
        </View>
        <Loader label="Loading device options..." />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      {/* ── White header — matches app's other white headers ─────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 10, paddingBottom: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
      >
        <View className="relative flex-row items-center justify-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute left-0 h-10 w-10 rounded-full bg-surface-muted items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={20} color="#172117" />
          </Pressable>

          <View className="items-center px-12">
            <Text
              className="text-text text-[14px] font-extrabold text-center"
              numberOfLines={1}
            >
              Your Device
            </Text>
          </View>

          <Pressable
            onPress={onSkip}
            className="absolute right-0 h-10 px-3.5 rounded-full bg-surface-muted items-center justify-center active:opacity-70"
          >
            <Text className="text-text-muted text-[12px] font-extrabold">Skip</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Device summary ───────────────────────────────────────────
            No card: no fill, no shadow. It sits directly on the white page and
            is grouped by centring and spacing alone. */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View className="p-3.5">
            <View className="items-center">
              {/* Image on the bare page — the tinted box behind it is gone, so
                  the artwork is the only thing drawn here. Still square via
                  aspectRatio, and `contain` so nothing is cropped. */}
              <View
                className="items-center justify-center overflow-hidden mb-3"
                style={{ width: '40%', aspectRatio: 1 }}
              >
                {params.imageUrl ? (
                  <Image source={{ uri: params.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                ) : (
                  <Smartphone size={52} color={ACCENT_GREEN} />
                )}
              </View>
              <Text className="text-[14px] font-extrabold text-text text-center" numberOfLines={2}>
                {params.modelName || 'Device'}
              </Text>
              {params.brandName ? (
                <Text className="text-[12px] text-text-muted mt-0.5 text-center" numberOfLines={1}>
                  {params.brandName}
                </Text>
              ) : null}
              {modelNumber ? (
                <View className="mt-1.5 flex-row items-center rounded-full bg-success/10 border border-success/20 px-2.5 py-1">
                  <Hash size={11} color={ACCENT_GREEN} />
                  <Text className="text-[11px] font-extrabold text-success ml-1" numberOfLines={1}>
                    {modelNumber}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Model number — pick the exact variant when a model has several ── */}
        {modelNumbers.length > 1 ? (
          <>
            <SectionHeader icon={Hash} label="Model Number" subtitle="Pick the exact model number" />
            <View className="px-4">
              <Select
                value={modelNumber}
                onChange={(v) => setModelNumber(v)}
                placeholder="Select model number"
                options={modelNumbers.map((n) => ({ value: n, label: n }))}
              />
            </View>
          </>
        ) : null}

        {/* ── Typed variant — a model that isn't in the catalogue ────── */}
        {isCustomModel ? (
          <>
            <SectionHeader icon={Palette} label="Model Color" subtitle="Type the colour" />
            <View className="px-4">
              <TextInput
                value={color}
                onChangeText={setColor}
                placeholder="e.g. Sea Green"
                placeholderTextColor="#8FA08F"
                className="bg-card rounded-2xl px-3.5 py-3 text-[14px] text-text"
                style={cardShadow}
              />
            </View>

            <SectionHeader icon={HardDrive} label="RAM" subtitle="Type the RAM (optional)" />
            <View className="px-4">
              <TextInput
                value={ramText}
                onChangeText={setRamText}
                placeholder="e.g. 8 GB"
                placeholderTextColor="#8FA08F"
                autoCapitalize="characters"
                className="bg-card rounded-2xl px-3.5 py-3 text-[14px] text-text"
                style={cardShadow}
              />
            </View>

            <SectionHeader icon={HardDrive} label="Storage" subtitle="Type the capacity" />
            <View className="px-4">
              <TextInput
                value={storageText}
                onChangeText={setStorageText}
                placeholder="e.g. 128 GB"
                placeholderTextColor="#8FA08F"
                autoCapitalize="characters"
                className="bg-card rounded-2xl px-3.5 py-3 text-[14px] text-text"
                style={cardShadow}
              />
            </View>
          </>
        ) : (
        <>
        {/* ── Color section — Swiggy/Zomato menu rhythm ─────────────── */}
        <SectionHeader icon={Palette} label="Model Color" />
        <View className="px-4">
          <View>
            {colorsList.length > 0 ? (
              /* Each option = colour swatch circle + colour name in one row. */
              <View className="flex-row flex-wrap -mx-1">
                {colorsList.map((c) => {
                  const active = color === c.name;
                  const sw = c.hexCode || swatchFor(c.name);
                  return (
                    // Three across: at two, each tile ran the half-width of the
                    // screen for a swatch and a short word, so most of the row
                    // was empty and six colours took three rows instead of two.
                    <View key={c.id || c.name} className="p-1" style={{ width: `${100 / COLOR_COLUMNS}%` }}>
                      <Pressable
                        onPress={() => setColor(color === c.name ? '' : c.name)}
                        className="rounded-xl flex-row items-center"
                        style={{
                          borderWidth: active ? TILE_LINE_ACTIVE_W : TILE_LINE_W,
                          borderColor: active ? TILE_LINE_ACTIVE : TILE_LINE,
                          // No fill in either state.
                          paddingVertical: active ? 7 - (TILE_LINE_ACTIVE_W - TILE_LINE_W) : 7,
                          paddingHorizontal: active ? 8 - (TILE_LINE_ACTIVE_W - TILE_LINE_W) : 8,
                        }}
                      >
                        <View
                          className="h-5 w-5 rounded-full border border-border"
                          style={{ backgroundColor: sw }}
                        />
                        {/* Two lines + shrink, because three columns leave
                            44-75pt for the label: short names ("Green", 34pt)
                            fit outright, but a catalogue name like "Phantom
                            Silver" needs ~88pt and would otherwise clip to
                            "Phantom S…". */}
                        <Text
                          className="flex-1 text-[12px] font-medium ml-2"
                          style={{ color: active ? TILE_TEXT_ACTIVE : TILE_TEXT }}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {titleCase(c.name)}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View
                className="flex-row items-center rounded-xl px-3"
                style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#FFFFFF' }}
              >
                <TextInput
                  placeholder="e.g. Silver Shadow"
                  placeholderTextColor="#8FA08F"
                  value={color}
                  onChangeText={setColor}
                  className="flex-1 py-3 text-text text-[14px]"
                />
              </View>
            )}
          </View>
        </View>

        {specs.length > 0 ? (
          /* ── Model variants — combined RAM + Storage the model actually ships */
          <>
            <SectionHeader icon={HardDrive} label={specsStorageOnly ? 'Storage' : 'RAM & Storage'} />
            <View className="px-4">
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
                columns={VARIANT_COLUMNS}
                showCircle
              />
            </View>
          </>
        ) : (
          <>
            {/* ── RAM section (fallback: model has no variants) ─────────── */}
            <SectionHeader icon={Cpu} label="RAM" subtitle="Pick the memory size" />
            <View className="px-4">
              <VariantGrid
                options={rams}
                selected={ram}
                onSelect={setRam}
                getLabel={(r) => r.label}
                keyOf={(r) => r.id}
              />
            </View>

            {/* ── Storage section (fallback) ───────────────────────────── */}
            <SectionHeader icon={HardDrive} label="Storage" subtitle="Pick the capacity" />
            <View className="px-4">
              <VariantGrid
                options={storages}
                selected={storage}
                onSelect={setStorage}
                getLabel={(s) => s.label}
                keyOf={(s) => s.id}
              />
            </View>
          </>
        )}
        </>
        )}

      </ScrollView>

      {/* ── Sticky green-gradient CTA — matches sibling screens ─────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={onContinue}
          disabled={!ready}
          className="active:opacity-90"
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: ready ? BAR_BG_READY : BAR_BG,
            // The not-ready state is a light fill, so the old 0.55 opacity is
            // no longer what signals "disabled" — it would only wash the text
            // out against #F8F8F8. A 1px border keeps the bar's shape visible.
            borderWidth: ready ? 0 : 1,
            borderColor: '#E2E8E2',
          }}
        >
          <View
            style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text
                className="text-[12px] font-medium"
                style={{ color: ready ? BAR_TEXT_READY : BAR_TEXT, opacity: 0.9 }}
              >
                YOUR CONFIGURATION
              </Text>
              <Text
                className="text-[14px] font-medium"
                style={{ color: ready ? BAR_TEXT_READY : BAR_TEXT }}
                numberOfLines={1}
              >
                {summaryLabel(color, rams.find((x) => x.id === ram)?.label, storages.find((x) => x.id === storage)?.label)}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text
                className="text-[14px] font-medium"
                style={{ color: ready ? BAR_TEXT_READY : BAR_TEXT }}
              >
                Continue
              </Text>
              <ChevronRight size={18} color={ready ? BAR_TEXT_READY : BAR_TEXT} />
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Reusable bits
// ════════════════════════════════════════════════════════════════════════════
function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="px-4 pt-3 pb-1.5">
      <View className="flex-row items-center">
        <Icon size={14} color={BRAND_GREEN_DARK} />
        <Text className="text-text font-extrabold text-[12.5px] ml-1.5">{label}</Text>

      </View>
      {subtitle ? (
        <Text className="text-text-muted text-[11px] mt-0.5 ml-5">{subtitle}</Text>
      ) : null}
    </View>
  );
}

function VariantGrid({ options, selected, onSelect, getLabel, keyOf, columns = 3, showCircle = false }) {
  return (
    <View>
      <View className="flex-row flex-wrap -mx-1">
        {options.map((o) => {
          const k = keyOf(o);
          const active = selected === k;
          return (
            <View key={k} className="p-1" style={{ width: `${100 / columns}%` }}>
              <Pressable
                onPress={() => onSelect(active ? null : k)}
                className={`rounded-xl items-center justify-center ${showCircle ? 'flex-row' : ''}`}
                style={{
                  borderWidth: active ? TILE_LINE_ACTIVE_W : TILE_LINE_W,
                  borderColor: active ? TILE_LINE_ACTIVE : TILE_LINE,
                  // Padding absorbs the extra border so the label does not
                  // shift by a pixel when the tile is selected.
                  paddingVertical: active ? 8 - (TILE_LINE_ACTIVE_W - TILE_LINE_W) : 8,
                  paddingHorizontal: active ? 6 - (TILE_LINE_ACTIVE_W - TILE_LINE_W) : 6,
                }}
              >
                {showCircle ? (
                  <View
                    style={{
                      height: 18,
                      width: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: active ? TILE_LINE_ACTIVE : '#CBD5CB',
                      backgroundColor: 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    {active ? <Check size={11} color={TILE_LINE_ACTIVE} strokeWidth={3} /> : null}
                  </View>
                ) : null}
                <Text
                  className="text-[13px] font-medium"
                  style={{ color: active ? TILE_TEXT_ACTIVE : TILE_TEXT }}
                  numberOfLines={1}
                >
                  {getLabel(o)}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function summaryLabel(color, ramLabel, storageLabel) {
  const parts = [color, ramLabel, storageLabel].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Pick your variant';
}

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
