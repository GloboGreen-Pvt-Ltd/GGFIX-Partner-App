import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { notify } from '../../../components/confirm';
import colors from '../../../theme/colors';
import { Card, PrimaryButton, LabeledInput } from '../../../components/ui';
import { uploadMedia } from '../../../api/masterData';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  slot: { width: '46%', margin: '2%', height: 120, borderColor: '#7ED957', borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7FAF7', overflow: 'hidden' },
  slotImg: { ...StyleSheet.absoluteFillObject },
  slotLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 6, textAlign: 'center' },
  slotLabelOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.92)', paddingVertical: 4, fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' },
  removeBtn: { position: 'absolute', right: 4, top: 4, height: 22, width: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  editBanner: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  editBannerTitle: { fontSize: 10, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
  editBannerText: { fontSize: 12, color: colors.text, fontWeight: '600', marginTop: 2 },
  bottom: { padding: 12, backgroundColor: '#fff', borderTopColor: colors.border, borderTopWidth: 1 },
});

// key maps to the backend ImageBundle field (front/back/side/camera/other)
const SLOTS = [
  { key: 'front', label: 'Front Side' },
  { key: 'back', label: 'Backside' },
  { key: 'side', label: 'side and Center' },
  { key: 'camera', label: 'Camera' },
  { key: 'other', label: 'side and Center' },
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {isEditing ? (
          <View style={styles.editBanner}>
            <Ionicons name="create-outline" size={16} color="#92400E" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.editBannerTitle}>EDITING ORDER</Text>
              <Text style={styles.editBannerText}>Your previously uploaded photos are kept — tap to replace any.</Text>
            </View>
          </View>
        ) : null}
        <Card style={{ padding: 10, marginVertical: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4, textAlign: 'center' }}>Upload for Device Images</Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8, textAlign: 'center' }}>Maximum file size: 5 MB.</Text>
          <View style={styles.row}>
            {SLOTS.map((s) => {
              const url = images[s.key];
              const busy = uploading === s.key;
              return (
                <TouchableOpacity key={s.key} style={styles.slot} onPress={() => pick(s.key)} disabled={busy} activeOpacity={0.8}>
                  {busy ? (
                    <ActivityIndicator color="#087A0A" />
                  ) : url ? (
                    <>
                      <Image source={{ uri: url }} style={styles.slotImg} resizeMode="cover" />
                      <TouchableOpacity style={styles.removeBtn} onPress={() => remove(s.key)}>
                        <Ionicons name="close" size={13} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.slotLabelOverlay} numberOfLines={1}>{s.label}</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={26} color="#7ED957" />
                      <Text style={styles.slotLabel}>{s.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <LabeledInput label="Device Condition" value={condition} onChangeText={setCondition} />
        </Card>
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton title="Continue →" disabled={!!uploading} onPress={onContinue} />
      </View>
    </View>
  );
}
