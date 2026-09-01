import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Smartphone,
  Cpu,
  HardDrive,
  Palette,
  Check,
  Tag,
  ShieldCheck,
  Skull,
  Pencil,
} from 'lucide-react-native';

const sellConditionsFor = (deviceLabel) => [
  { key: 'WORKING', label: `Working ${deviceLabel}`, sub: 'Turns on · No major issues', icon: Smartphone, color: '#004C40', bg: 'bg-success/10', activeBg: 'bg-success/15', border: 'border-success' },
  { key: 'DEAD', label: `${deviceLabel} Dead / Unknown`, sub: "Won't turn on · Not sure", icon: Skull, color: '#DC2626', bg: 'bg-danger/10', activeBg: 'bg-danger/15', border: 'border-danger' },
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

const COLOR_SWATCHES = {
  black: '#172117', white: '#F7FAF7', silver: '#CBD5CB', gold: '#FDE68A',
  rose: '#E6F7E3', blue: '#16BB05', red: '#DC2626', green: '#16BB05',
  purple: '#7ED957', pink: '#16BB05', graphite: '#667066', midnight: '#087A0A',
  starlight: '#FFFBEB', sierra: '#CBD5CB', alpine: '#667066', sky: '#C8EEBF',
  phantom: '#667066', cosmic: '#087A0A',
};
function swatchFor(name) {
  const n = (name || '').toLowerCase();
  for (const key of Object.keys(COLOR_SWATCHES)) {
    if (n.includes(key)) return COLOR_SWATCHES[key];
  }
  return '#8FA08F';
}

export default function SelectVariantScreen({ navigation, route }) {
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

  useEffect(() => {
    (async () => {
      try {
        const opts = await getModelOptions(modelId);
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
    if (!color) return;
    if (!noRamStorage && (!storage || (!specsStorageOnly && !ram))) return;

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
    };

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

  if (loading) return <Loader label="Loading variants..." />;

  const ready =
    color &&
    (noRamStorage || (storage && (specsStorageOnly || ram))) &&
    (flow !== 'SELL' || noImei || imei.trim());
  const ctaLabel = flow === 'PROFILE'
    ? (isEdit ? 'Update Device' : 'Save Device')
    : flow === 'REPAIR' ? 'Choose Repair Service'
    : flow === 'OWNER_LIST' ? 'Choose Description'
    : 'Continue';

  return (
    <View className="flex-1 bg-background">
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

        {/* Device summary */}
        <View className="bg-card border border-border rounded-2xl p-3 mb-3 flex-row items-center"
              style={{ shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
          <View className="h-14 w-14 rounded-2xl bg-primary/10 items-center justify-center mr-3 overflow-hidden">
            {modelImageUrl ? (
              <Image source={{ uri: modelImageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
            ) : (
              <Smartphone size={26} color="#004C40" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-[11px] text-text-muted uppercase tracking-widest">Your Device</Text>
            <Text className="text-[15px] font-extrabold text-text mt-0.5" numberOfLines={2}>{modelName}</Text>
            {brandName ? (
              <Text className="text-[11px] text-text-muted mt-0.5">{brandName}</Text>
            ) : null}
          </View>
          {ready ? <Badge variant="softSuccess">READY</Badge> : null}
        </View>

        {/* Selection summary chips */}
        {(ram || storage || color) ? (
          <View className="flex-row flex-wrap mb-3">
            {ram?.label ? (
              <View className="bg-primary/10 rounded-full px-3 py-1 mr-2 mb-2 flex-row items-center">
                <Cpu size={11} color="#004C40" />
                <Text className="text-primary text-[11px] font-bold ml-1">{ram.label}</Text>
              </View>
            ) : null}
            {storage?.label ? (
              <View className="bg-secondary/10 rounded-full px-3 py-1 mr-2 mb-2 flex-row items-center">
                <HardDrive size={11} color="#004C40" />
                <Text className="text-secondary text-[11px] font-bold ml-1">{storage.label}</Text>
              </View>
            ) : null}
            {color?.name ? (
              <View className="bg-warning/10 rounded-full px-3 py-1 mr-2 mb-2 flex-row items-center">
                <View className="h-3 w-3 rounded-full mr-1 border border-border" style={{ backgroundColor: swatchFor(color.name) }} />
                <Text className="text-warning text-[11px] font-bold">{color.name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Color picker */}
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full bg-warning/10 items-center justify-center mr-2">
              <Palette size={14} color="#F59E0B" />
            </View>
            <Text className="text-[13px] font-extrabold text-text flex-1">Color</Text>
            {color ? (
              <View className="flex-row items-center">
                <View className="h-4 w-4 rounded-full border border-border mr-1" style={{ backgroundColor: swatchFor(color.name) }} />
                <Text className="text-[11px] font-bold text-text" numberOfLines={1}>{color.name}</Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row flex-wrap -mx-1">
            {colorsList.map((c) => {
              const name = c.name || c.id;
              const active = color?.name === name || color?.id === name;
              const sw = c.hexCode || swatchFor(name);
              return (
                <View key={c.id || name} className="p-1" style={{ width: '33.333%' }}>
                  <Pressable
                    onPress={() => setColor({ id: c.id || name, name })}
                    className={`rounded-xl border p-2.5 items-center ${active ? 'bg-primary/5 border-primary' : 'bg-card border-border'}`}
                  >
                    <View className="flex-row items-center justify-center">
                      <View className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: sw }} />
                      {active ? (
                        <View className="ml-1 h-4 w-4 rounded-full bg-primary items-center justify-center">
                          <Check size={10} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      className={`text-[11px] font-bold mt-1.5 text-center ${active ? 'text-primary' : 'text-text'}`}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {/* Model variants — RAM + Storage combos, or storage-only sizes the model ships */}
        {!noRamStorage && specs.length > 0 ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full bg-primary/10 items-center justify-center mr-2">
              <HardDrive size={14} color="#004C40" />
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
                    className={`rounded-xl border py-3 items-center ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                  >
                    <Text className={`text-[14px] font-extrabold ${active ? 'text-white' : 'text-text'}`} numberOfLines={1}>
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
        {!noRamStorage && specs.length === 0 ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full bg-primary/10 items-center justify-center mr-2">
              <Cpu size={14} color="#004C40" />
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
                    className={`rounded-xl border py-3 items-center ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                  >
                    <Text className={`text-[14px] font-extrabold ${active ? 'text-white' : 'text-text'}`}>{r.label}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
        ) : null}

        {/* Storage (fallback) */}
        {!noRamStorage && specs.length === 0 ? (
        <View className="bg-card border border-border rounded-2xl p-3 mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-8 w-8 rounded-full bg-secondary/10 items-center justify-center mr-2">
              <HardDrive size={14} color="#004C40" />
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
                    className={`rounded-xl border py-3 items-center ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                  >
                    <Text className={`text-[14px] font-extrabold ${active ? 'text-white' : 'text-text'}`}>{s.label}</Text>
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
              <View className="h-8 w-8 rounded-full bg-success/10 items-center justify-center mr-2">
                <Tag size={14} color="#004C40" />
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
                      className={`rounded-xl border-2 p-3 items-center ${active ? `${o.activeBg} ${o.border}` : 'bg-card border-border'}`}
                    >
                      <View className={`h-10 w-10 rounded-full items-center justify-center mb-1.5 ${o.bg}`}>
                        <Icon size={20} color={o.color} />
                      </View>
                      <Text className="text-[12px] font-extrabold text-text text-center" numberOfLines={1}>{o.label}</Text>
                      <Text className="text-[10px] text-text-muted mt-0.5 text-center" numberOfLines={2}>{o.sub}</Text>
                      {active ? <Badge variant={o.key === 'WORKING' ? 'softSuccess' : 'softDanger'} className="mt-1.5">SELECTED</Badge> : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="bg-success/5 border border-success/20 rounded-2xl p-3 flex-row items-center">
          <ShieldCheck size={16} color="#004C40" />
          <Text className="text-[11px] text-text ml-2 flex-1">
            Genuine parts · Certified technicians · 30-day repair warranty
          </Text>
        </View>
      </ScrollView>

      <BottomActionBar
        title={ctaLabel}
        onPress={onContinue}
        loading={saving}
        disabled={!ready}
      />
    </View>
  );
}
