import React, { useState } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { Cpu, HardDrive } from 'lucide-react-native';
import {
  AppHeader, Card, Input, BottomActionBar, ScreenContainer, useBottomBarInset,
} from '../../components/rnr';
import { tokens } from '../../theme/colors';
import { getMasterImageSource } from '../../api/masterDataImages';
import { useRamOptions, useStorageOptions } from '../../api/hooks/useMasterData';

const labelForOption = (o) => (o?.valueGb != null ? `${o.valueGb}GB` : o?.label || '');

/**
 * Compare a typed variant against a master option: "8gb", "8 GB" and "8 gb" are
 * the same thing to a shop, and only differ by the spacing someone happened to
 * use.
 */
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const matchOption = (list, text) => {
  const n = norm(normalizeCapacity(text));
  if (!n) return null;
  return (list || []).find((o) => norm(labelForOption(o)) === n || norm(o?.label) === n) || null;
};

/**
 * Tidy a typed capacity into the form the catalogue uses.
 *
 *   "8"      -> "8 GB"     (bare number: GB is what a phone is quoted in)
 *   "8gb"    -> "8 GB"
 *   "1 tb"   -> "1 TB"
 *   "64 MB"  -> "64 MB"
 *
 * Without this, "8" and "8gb" would each be stored as their own label and never
 * match the master option that "8 GB" does — so two identical devices would be
 * recorded differently depending on who typed the booking.
 *
 * Anything that isn't a number-with-optional-unit is returned untouched: an odd
 * variant is better recorded verbatim than reshaped into something wrong.
 */
function normalizeCapacity(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*(gb|tb|mb|g|t|m)?$/i);
  if (!m) return raw;
  const unit = (m[2] || 'gb').toLowerCase();
  const suffix = unit.startsWith('t') ? 'TB' : unit.startsWith('m') ? 'MB' : 'GB';
  return `${m[1]} ${suffix}`;
}

export default function DeviceColorStorageScreen({ route, navigation }) {
  const { customer, deviceType, brand, model } = route.params || {};
  const [color, setColor] = useState('');

  /**
   * A device typed through "Other" arrives with no catalogue model, so the name
   * has to be editable here — this is the last screen before the job is written,
   * and there is nothing else to correct a typo on.
   *
   * A model picked from the catalogue stays read-only: its name is the
   * catalogue's, and letting it be edited would produce a booking whose model
   * name contradicts its modelId.
   */
  const isCustomModel = !!route?.params?.customModel || !route?.params?.modelId;

  /**
   * Both callers — the picker and the IMEI lookup — send FLAT params
   * (brandName / modelName / modelId), never the `brand` and `model` objects
   * this screen originally destructured. Reading only the objects meant the card
   * fell through to the literal "Device" with no brand and no image on every
   * booking. Flat params win, with the objects kept as a fallback.
   */
  const modelName = route?.params?.modelName || model?.name || '';
  const brandLabel = route?.params?.brandName || brand?.name || '';

  const [customModelName, setCustomModelName] = useState(modelName);

  // Free-text RAM / storage, for a device whose variant isn't in master data.
  const [ramText, setRamText] = useState('');
  const [storageText, setStorageText] = useState('');

  const { ramOptions } = useRamOptions();
  const { storageOptions } = useStorageOptions();
  const insetBottom = useBottomBarInset();

  const modelDone = !isCustomModel || !!customModelName.trim();
  const canContinue = !!ramText.trim() && !!storageText.trim() && modelDone;

  const handleContinue = () => {
    // Typed, but still linked when it can be: a value that matches a master
    // option keeps that option's id on the booking, so the FKs survive for the
    // common variants and only genuinely unlisted ones fall back to a bare
    // label. Typing everything should not quietly lose data the catalogue has.
    const ram = matchOption(ramOptions, ramText);
    const storage = matchOption(storageOptions, storageText);
    const name = customModelName.trim();
    navigation.navigate('DeviceServices', {
      ...route.params,
      customer,
      deviceType,
      // DeviceServices destructures `brand` and `model` objects too, so build
      // them from the flat params rather than forwarding the undefined ones and
      // losing the device on the next screen as well.
      brand: brand || (brandLabel ? { id: route?.params?.brandId || null, name: brandLabel } : undefined),
      // A typed model keeps a null id and carries its name — the booking stores
      // the name either way, so downstream screens need no special case.
      model: {
        ...(model || {}),
        id: isCustomModel ? null : (route?.params?.modelId || model?.id || null),
        name: isCustomModel ? name : modelName,
      },
      modelId: isCustomModel ? null : route?.params?.modelId,
      modelName: isCustomModel ? name : modelName,
      color: color.trim(),
      ramOptionId: ram?.id || null,
      storageOptionId: storage?.id || null,
      // Normalised on the way out, so "8", "8gb" and "8 GB" all reach the
      // booking as one value.
      ramLabel: normalizeCapacity(ramText),
      storageLabel: normalizeCapacity(storageText),
    });
  };


  // Same story as the names: the picker sends modelImageUrl / imageUrl, not a
  // model object for getMasterImageSource to read.
  const modelImage = route?.params?.modelImageUrl
    || route?.params?.imageUrl
    || getMasterImageSource(model)?.uri
    || null;

  return (
    <ScreenContainer>
      <AppHeader title="Variant" subtitle="Pick the model variant" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insetBottom + 80 }}>
        <Card>
          <View className="flex-row items-center">
            <View className="h-14 w-14 rounded-2xl bg-surface-muted items-center justify-center overflow-hidden mr-3">
              {modelImage ? (
                <Image source={{ uri: modelImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              ) : (
                <Text className="text-[16px] font-extrabold text-primary">
                  {(model?.name || '?').toString().charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-text-muted uppercase tracking-widest">Model</Text>
              {isCustomModel ? (
                <Input
                  value={customModelName}
                  onChangeText={setCustomModelName}
                  placeholder="Type the model"
                />
              ) : (
                <Text className="text-[15px] font-extrabold text-text" numberOfLines={1}>
                  {modelName || 'Device'}
                </Text>
              )}
              {brandLabel ? (
                <Text className="text-[11px] text-text-muted mt-0.5">{brandLabel}</Text>
              ) : null}
            </View>
          </View>
        </Card>

        <View className="mt-4">
          <Text className="text-[14px] font-extrabold text-text mb-2 px-1">Color</Text>
          <Input
            value={color}
            onChangeText={setColor}
            placeholder="e.g. Silver Shadow"
          />
        </View>

        <View className="mt-5">
          <View className="flex-row items-center mb-2 px-1">
            <Cpu size={16} color={tokens.primary} />
            <Text className="ml-2 text-[14px] font-extrabold text-text">RAM</Text>
          </View>
          <Input value={ramText} onChangeText={setRamText} placeholder="e.g. 8 GB" />
        </View>

        <View className="mt-4">
          <View className="flex-row items-center mb-2 px-1">
            <HardDrive size={16} color={tokens.primary} />
            <Text className="ml-2 text-[14px] font-extrabold text-text">Storage</Text>
          </View>
          <Input value={storageText} onChangeText={setStorageText} placeholder="e.g. 128 GB" />
        </View>
      </ScrollView>

      <BottomActionBar
        title="Continue"
        onPress={handleContinue}
        disabled={!canContinue}
        insetBottom={insetBottom}
      />
    </ScreenContainer>
  );
}
