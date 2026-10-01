import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { notify } from '../../../components/confirm';
import { uploadMedia } from '../../../api/masterData';
import { SELL, SellButton, SellCard, SellFooter, SellIntro, EditingBanner } from './sellTheme';

// key maps to the backend ImageBundle field (front/back/side/camera/other)
// `label` is display only (the key is what the backend receives).
const SLOTS = [
  { key: 'front', label: 'Front side' },
  { key: 'back', label: 'Back side' },
  { key: 'side', label: 'Side & center' },
  { key: 'camera', label: 'Camera' },
  { key: 'other', label: 'Other angle' },
];

export default function SellImagesScreen({ navigation, route }) {
  const params = route.params || {};
  const { editSellOrderId, editHints } = params;
  const isEditing = !!editSellOrderId;

  // Seed photo slots from the order's saved image URLs when editing.
  const initialImages = useMemo(() => {
    if (!isEditing) return {};
    const out = {};
    const src = editHints?.images || {};
    SLOTS.forEach((s) => { if (src[s.key]) out[s.key] = src[s.key]; });
    return out;
  }, [isEditing, editHints]);
  const initialCondition = isEditing
    ? (editHints?.deviceConditionSummary || 'Good')
    : 'Good';

  const [condition, setCondition] = useState(initialCondition);
  const [images, setImages] = useState(initialImages); // key -> url
  const [uploading, setUploading] = useState(null); // key currently uploading

  const pick = async (key) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      notify('Permission needed', 'Allow media library access to attach photos.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(key);
      const url = await uploadMedia(result.assets[0], 'sell');
      if (!url) throw new Error('Upload returned no URL');
      setImages((m) => ({ ...m, [key]: url }));
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again');
    } finally {
      setUploading(null);
    }
  };

  const remove = (key) => setImages((m) => { const n = { ...m }; delete n[key]; return n; });

  const onContinue = () => {
    // Detect the stack by inspecting the navigator's registered routes. This is
    // more reliable than depending on a `flow` param surviving every intermediate
    // screen — if any screen in the chain forgets to spread params, the flag
    // disappears, but `routeNames` always reflects the actual stack we're in.
    let hasOwnerRoute = false;
    try { hasOwnerRoute = navigation.getState()?.routeNames?.includes('OwnerSellGadgetPrice') === true; } catch (_) {}
    const ownerListing = hasOwnerRoute
      || params.flow === 'OWNER_LIST'
      || !!params.descriptionType;
    const next = ownerListing ? 'OwnerSellGadgetPrice' : 'SellAddress';
    navigation.navigate(next, {
      ...params,
      flow: ownerListing ? 'OWNER_LIST' : params.flow,
      deviceCondition: condition,
      images,
    });
  };

  const added = SLOTS.filter((sl) => images[sl.key]).length;

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {isEditing ? <EditingBanner text="Your previously uploaded photos are kept — tap to replace any." /> : null}
        <SellIntro title="Device photos" caption="Clear photos help buyers trust the listing. Max 5 MB each." />
        <SellCard>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
            {SLOTS.map((sl) => {
              const url = images[sl.key];
              const busy = uploading === sl.key;
              return (
                <View key={sl.key} style={{ width: '50%', padding: 5 }}>
                  <TouchableOpacity
                    onPress={() => pick(sl.key)}
                    disabled={busy}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={url ? `Replace ${sl.label} photo` : `Add ${sl.label} photo`}
                    style={{
                      height: 112, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5, borderStyle: url ? 'solid' : 'dashed',
                      borderColor: url ? SELL.green : SELL.greenLine, backgroundColor: url ? SELL.card : SELL.greenLight,
                    }}
                  >
                    {busy ? (
                      <ActivityIndicator color={SELL.green} />
                    ) : url ? (
                      <>
                        <Image source={{ uri: url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
                        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.92)' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: SELL.ink, textAlign: 'center' }} numberOfLines={1}>{sl.label}</Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: SELL.card, alignItems: 'center', justifyContent: 'center' }}>
                          {sl.key === 'camera' ? <Camera size={18} color={SELL.green} /> : <ImagePlus size={18} color={SELL.green} />}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink, marginTop: 7 }}>{sl.label}</Text>
                        <Text style={{ fontSize: 11, color: SELL.muted, marginTop: 1 }}>Tap to add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {url && !busy ? (
                    <TouchableOpacity
                      onPress={() => remove(sl.key)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${sl.label} photo`}
                      style={{ position: 'absolute', right: 10, top: 10, height: 24, width: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={13} color="#FFFFFF" strokeWidth={2.6} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        </SellCard>

        <SellCard>
          <Text style={{ fontSize: 14, fontWeight: '700', color: SELL.ink }}>Device condition</Text>
          <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 2, marginBottom: 8 }}>A word or two buyers will see, e.g. Good, Like new.</Text>
          <TextInput
            value={condition}
            onChangeText={setCondition}
            placeholder="Good"
            placeholderTextColor={SELL.subtle}
            style={{ minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: SELL.line, paddingHorizontal: 12, fontSize: 13, fontWeight: '600', color: SELL.ink, backgroundColor: SELL.card }}
          />
        </SellCard>
      </ScrollView>
      <SellFooter caption={`${added} of ${SLOTS.length} photos added`}>
        <SellButton title="Continue" arrow disabled={!!uploading} onPress={onContinue} />
      </SellFooter>
    </View>
  );
}
