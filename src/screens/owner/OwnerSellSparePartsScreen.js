import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { notify } from '../../components/confirm';
import { uploadMedia } from '../../api/masterData';

// Preset parts shown as default cards per group. Beyond these, the shop taps
// "+ Add" to drop in a blank custom card (type a part name + upload photos).
const PRESET_GROUPS = [
  { key: 'DISPLAY',      label: 'Display Combo',  sub: 'Add main & sub screen',      icon: 'phone-portrait-outline', accent: '#087A0A', tint: '#F0F8EF', slotBg: '#F0F8EF', border: '#7ED957', parts: ['Main Screen Display Combo', 'Sub Screen Display Combo'] },
  { key: 'MOTHERBOARD',  label: 'Motherboard',    sub: 'Add motherboard & variants', icon: 'hardware-chip-outline',  accent: '#16BB05', tint: '#F0F8EF', slotBg: '#F0F8EF', border: '#E6F7E3', parts: ['Motherboard 16GB / 512GB', 'Battery'] },
  { key: 'FRONT_CAMERA', label: 'Front Camera',   sub: 'Add front camera',           icon: 'camera-outline',         accent: '#16BB05', tint: '#F0F8EF', slotBg: '#F0F8EF', border: '#C8EEBF', parts: ['Front Camera'] },
  { key: 'BACK_CAMERA',  label: "Back Camera's",  sub: 'Add back camera',            icon: 'camera-reverse-outline', accent: '#D97706', tint: '#FFFBEB', slotBg: '#FFFBEB', border: '#FDE68A', parts: ['Back Main Camera'] },
  { key: 'MORE',         label: 'More Items',     sub: 'Add other components',       icon: 'apps-outline',           accent: '#087A0A', tint: '#F0F8EF', slotBg: '#F0F8EF', border: '#C8EEBF', parts: ['Side Frame', 'Back Panel (Backshell)', 'Charging Sub Board', 'SIM Tray', 'Loudspeaker'] },
];

let nextCustomId = 1;
const makeId = () => `c${nextCustomId++}`;

export default function OwnerSellSparePartsScreen({ navigation }) {
  // Selected PRESET part names per group (Set). Custom cards don't use this —
  // they're included automatically once they have a name or a photo.
  const [sel, setSel] = useState({});
  // Uploaded photos per slot: { [groupKey]: { [slotId]: [url, ...] } }
  // slotId = the preset part name, or a custom card's generated id.
  const [images, setImages] = useState({});
  // Custom blank cards added via "+ Add": { [groupKey]: [{ id, name }] }
  const [added, setAdded] = useState({});
  // Slot key currently uploading, e.g. "DISPLAY/Main Screen…" or "DISPLAY/c1".
  const [uploading, setUploading] = useState(null);
  const insets = useSafeAreaInsets();

  const togglePreset = (groupKey, name) => {
    setSel((prev) => {
      const set = new Set(prev[groupKey] || []);
      if (set.has(name)) set.delete(name); else set.add(name);
      return { ...prev, [groupKey]: set };
    });
  };

  const pickImage = async (groupKey, slotId, autoSelectPreset) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', 'Allow media library access to attach photos.');
      return;
    }
    const key = `${groupKey}/${slotId}`;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(key);
      const url = await uploadMedia(result.assets[0], 'spare-parts');
      if (!url) throw new Error('Upload returned no URL');
      // One image per slot — a new upload replaces the previous one.
      setImages((prev) => ({
        ...prev,
        [groupKey]: { ...(prev[groupKey] || {}), [slotId]: [url] },
      }));
      if (autoSelectPreset) {
        setSel((prev) => {
          const set = new Set(prev[groupKey] || []);
          set.add(slotId);
          return { ...prev, [groupKey]: set };
        });
      }
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again');
    } finally {
      setUploading(null);
    }
  };

  const removePhoto = (groupKey, slotId, index) => {
    setImages((prev) => {
      const arr = (prev[groupKey]?.[slotId] || []).filter((_, i) => i !== index);
      return { ...prev, [groupKey]: { ...(prev[groupKey] || {}), [slotId]: arr } };
    });
  };

  const addCustomCard = (groupKey) => {
    setAdded((prev) => ({ ...prev, [groupKey]: [...(prev[groupKey] || []), { id: makeId(), name: '' }] }));
  };

  const updateCustomName = (groupKey, id, name) => {
    setAdded((prev) => ({
      ...prev,
      [groupKey]: (prev[groupKey] || []).map((c) => (c.id === id ? { ...c, name } : c)),
    }));
  };

  const removeCustomCard = (groupKey, id) => {
    setAdded((prev) => ({ ...prev, [groupKey]: (prev[groupKey] || []).filter((c) => c.id !== id) }));
    setImages((prev) => {
      const next = { ...(prev[groupKey] || {}) };
      delete next[id];
      return { ...prev, [groupKey]: next };
    });
  };

  const { totalSelected, items, allImages } = useMemo(() => {
    const all = [];
    const imgs = [];
    PRESET_GROUPS.forEach((g) => {
      g.parts.forEach((name) => {
        if (!sel[g.key]?.has(name)) return;
        const urls = images[g.key]?.[name] || [];
        all.push({ groupKey: g.key, group: g.label, partName: name, imageUrl: urls[0] || null, imageUrls: urls, custom: false });
        urls.forEach((u) => imgs.push(u));
      });
      (added[g.key] || []).forEach((c) => {
        const urls = images[g.key]?.[c.id] || [];
        const nm = (c.name || '').trim();
        if (!nm && urls.length === 0) return; // skip empty drafts
        all.push({ groupKey: g.key, group: g.label, partName: nm || 'Custom part', imageUrl: urls[0] || null, imageUrls: urls, custom: true });
        urls.forEach((u) => imgs.push(u));
      });
    });
    return { totalSelected: all.length, items: all, allImages: imgs };
  }, [sel, images, added]);

  const onSellNow = () => {
    if (totalSelected === 0) return;
    const imagesObj = {};
    allImages.slice(0, 5).forEach((url, i) => { imagesObj[`p${i + 1}`] = url; });
    navigation.navigate('OwnerSellGadgetPrice', {
      flow: 'OWNER_LIST',
      descriptionType: 'SPARE_PARTS',
      spareParts: items,
      images: imagesObj,
    });
  };

  const disabled = totalSelected === 0 || !!uploading;

  // Single-photo slot shared by preset + custom cards. Empty = dashed "Upload
  // image" box; filled = the image edge-to-edge with a remove ✕ and a Replace
  // pill (re-uploading swaps it in place — no extra "Add photo" thumbnails).
  const renderPhotos = (g, slotId, autoSelectPreset) => {
    const url = (images[g.key]?.[slotId] || [])[0] || null;
    const busy = uploading === `${g.key}/${slotId}`;
    return (
      <View
        style={{
          height: 114, borderRadius: 14,
          borderWidth: 1.5, borderStyle: url ? 'solid' : 'dashed',
          borderColor: url ? g.accent : g.border,
          backgroundColor: url ? '#FFFFFF' : g.slotBg,
          overflow: 'hidden', justifyContent: 'center',
        }}
      >
        {url ? (
          <>
            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            {/* Remove photo */}
            <Pressable onPress={() => removePhoto(g.key, slotId, 0)} hitSlop={6} style={{ position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
            {/* Replace photo */}
            <Pressable onPress={() => pickImage(g.key, slotId, autoSelectPreset)} disabled={busy} hitSlop={4} style={{ position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Ionicons name="camera-outline" size={12} color="#fff" />
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700', marginLeft: 3 }}>Replace</Text>
            </Pressable>
            {busy ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={g.accent} />
              </View>
            ) : null}
          </>
        ) : (
          <Pressable onPress={() => pickImage(g.key, slotId, autoSelectPreset)} disabled={busy} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? (
              <ActivityIndicator color={g.accent} />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name={g.icon} size={30} color="#8FA08F" />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <Ionicons name="cloud-upload-outline" size={14} color={g.accent} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#667066', marginLeft: 4 }}>Upload image</Text>
                </View>
              </View>
            )}
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAF7' }}>
      {/* Header */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EFF5EE' }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E6F7E3', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#087A0A" />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', color: '#172117', marginRight: 44 }}>Spare Parts</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {PRESET_GROUPS.map((g) => {
          const customList = added[g.key] || [];
          const selectedCount = items.filter((it) => it.groupKey === g.key).length;
          return (
            <View key={g.key} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, marginBottom: 12, shadowColor: '#172117', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 }}>
              {/* Group header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: g.tint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Ionicons name={g.icon} size={17} color={g.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#172117' }}>{g.label}</Text>
                  <Text style={{ fontSize: 11, color: '#8FA08F', marginTop: 1 }}>{g.sub}</Text>
                </View>
                <Pressable onPress={() => addCustomCard(g.key)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', backgroundColor: '#087A0A', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, opacity: pressed ? 0.85 : 1 })}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginLeft: 3 }}>Add</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                {/* Preset default cards */}
                {g.parts.map((name) => {
                  const active = sel[g.key]?.has(name);
                  return (
                    <View key={name} style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
                      {renderPhotos(g, name, true)}
                      <Pressable
                        onPress={() => togglePreset(g.key, name)}
                        style={{ borderRadius: 12, borderWidth: 1, borderColor: active ? g.accent : '#E2E8E2', backgroundColor: active ? g.tint : '#FFFFFF', marginTop: 6, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '800' : '700', color: active ? g.accent : '#172117', textAlign: 'center' }} numberOfLines={2}>{name}</Text>
                      </Pressable>
                    </View>
                  );
                })}

                {/* Custom blank cards — name field + photo upload */}
                {customList.map((c) => (
                  <View key={c.id} style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
                    {renderPhotos(g, c.id, false)}
                    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#FFFFFF', marginTop: 6, paddingLeft: 10, paddingRight: 4, paddingVertical: 2 }}>
                      <TextInput
                        placeholder="Enter part name"
                        placeholderTextColor="#8FA08F"
                        defaultValue={c.name}
                        onChangeText={(v) => updateCustomName(g.key, c.id, v)}
                        style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#172117', paddingVertical: 6 }}
                      />
                      <Pressable onPress={() => removeCustomCard(g.key, c.id)} hitSlop={8} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={16} color="#8FA08F" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>

              {selectedCount > 0 ? (
                <Text style={{ fontSize: 11, color: g.accent, fontWeight: '700', marginTop: 2 }}>
                  {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom Sell Now bar */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EFF5EE', shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Pressable onPress={onSellNow} disabled={disabled} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? '#8FA08F' : '#087A0A', borderRadius: 999, paddingVertical: 16, opacity: pressed ? 0.9 : 1 })}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginRight: 6 }}>Sell Now{totalSelected ? ` (${totalSelected})` : ''}</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
