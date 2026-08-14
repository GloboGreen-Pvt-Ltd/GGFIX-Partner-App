import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
      <View className="flex-1 bg-background">
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
    <View className="flex-1 bg-background">
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
        {/* ── Device card overlapping hero ─────────────────────────────── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-card rounded-2xl p-3.5"
            style={{
              shadowColor: '#172117',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View className="items-center">
              {/* Responsive image — scales with the card width, 2px inset padding
                  so the artwork never touches the rounded corners. */}
              <View
                className="rounded-2xl bg-success/10 items-center justify-center overflow-hidden mb-3"
                style={{ width: '40%', aspectRatio: 1, padding: 2 }}
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
            <SectionHeader icon={Hash} label="MODEL NUMBER" subtitle="Pick the exact model number" />
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
            <SectionHeader icon={Palette} label="MODEL COLOR" subtitle="Type the colour" />
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

            <SectionHeader icon={HardDrive} label="STORAGE" subtitle="Type the capacity" />
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
        <SectionHeader icon={Palette} label="MODEL COLOR" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-3.5" style={cardShadow}>
            {colorsList.length > 0 ? (
              /* Each option = colour swatch circle + colour name in one row. */
              <View className="flex-row flex-wrap -mx-1">
                {colorsList.map((c) => {
                  const active = color === c.name;
                  const sw = c.hexCode || swatchFor(c.name);
                  return (
                    <View key={c.id || c.name} className="p-1" style={{ width: '50%' }}>
                      <Pressable
                        onPress={() => setColor(color === c.name ? '' : c.name)}
                        className="rounded-xl flex-row items-center"
                        style={{
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? ACCENT_GREEN : '#E2E8E2',
                          backgroundColor: '#FFFFFF',
                          paddingVertical: 10,
                          paddingHorizontal: 10,
                        }}
                      >
                        <View
                          className="h-6 w-6 rounded-full border border-border"
                          style={{ backgroundColor: sw }}
                        />
                        <Text
                          className="flex-1 text-[12px] font-extrabold text-text ml-2"
                          numberOfLines={1}
                        >
                          {c.name}
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
            <SectionHeader icon={HardDrive} label={specsStorageOnly ? 'STORAGE' : 'RAM & STORAGE'} subtitle="Pick a variant" />
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
                columns={2}
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
            <SectionHeader icon={HardDrive} label="STORAGE" subtitle="Pick the capacity" />
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
            opacity: ready ? 1 : 0.55,
            shadowColor: BRAND_GREEN_DARK,
            shadowOpacity: ready ? 0.35 : 0,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: ready ? 10 : 0,
          }}
        >
          <LinearGradient
            colors={ready ? [BRAND_GREEN, BRAND_GREEN_DARK] : ['#8FA08F', '#667066']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text className="text-white text-[12px] font-bold opacity-90">YOUR CONFIGURATION</Text>
              <Text className="text-white text-[14px] font-extrabold" numberOfLines={1}>
                {summaryLabel(color, rams.find((x) => x.id === ram)?.label, storages.find((x) => x.id === storage)?.label)}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-white text-[14px] font-extrabold">Continue</Text>
              <ChevronRight size={18} color="#fff" />
            </View>
          </LinearGradient>
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
    <View className="px-4 pt-5 pb-2">
      <View className="flex-row items-center">
        <Icon size={14} color={BRAND_GREEN_DARK} />
        <Text className="text-text font-extrabold text-[12px] tracking-widest ml-1.5">{label}</Text>
        <View className="flex-1 h-px bg-border ml-2" />
      </View>
      {subtitle ? (
        <Text className="text-text-muted text-[12px] mt-1 ml-5">{subtitle}</Text>
      ) : null}
    </View>
  );
}

function VariantGrid({ options, selected, onSelect, getLabel, keyOf, columns = 3, showCircle = false }) {
  return (
    <View className="bg-card rounded-2xl p-3.5" style={cardShadow}>
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
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? ACCENT_GREEN : '#E2E8E2',
                  backgroundColor: '#FFFFFF',
                  paddingVertical: 12,
                  paddingHorizontal: 6,
                }}
              >
                {showCircle ? (
                  <View
                    style={{
                      height: 18,
                      width: 18,
                      borderRadius: 9,
                      borderWidth: 2,
                      borderColor: active ? ACCENT_GREEN : '#CBD5CB',
                      backgroundColor: 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    {active ? <Check size={11} color={ACCENT_GREEN} strokeWidth={3} /> : null}
                  </View>
                ) : null}
                <Text
                  className={`text-[14px] font-extrabold ${active ? 'text-success' : 'text-text'}`}
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
