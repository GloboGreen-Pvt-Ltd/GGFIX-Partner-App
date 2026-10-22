import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, TouchableOpacity, Alert, Linking, Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { notify } from '../../components/confirm';
import { uploadMedia } from '../../api/masterData';
import { ResponsiveModal } from '../../components/responsive';
import ImageViewerModal from '../../components/ImageViewerModal';

// Preset parts shown as default rows per group. Beyond these, the shop taps
// "+ Add" for a blank custom row (type a part name + add photos).
const PRESET_GROUPS = [
  { key: 'DISPLAY', label: 'Display Combo', sub: 'Main & sub screen', icon: 'phone-portrait-outline', parts: ['Main Screen Display Combo', 'Sub Screen Display Combo'] },
  { key: 'MOTHERBOARD', label: 'Motherboard', sub: 'Board & battery', icon: 'hardware-chip-outline', parts: ['Motherboard 16GB / 512GB', 'Battery'] },
  { key: 'FRONT_CAMERA', label: 'Front Camera', sub: 'Selfie camera', icon: 'camera-outline', parts: ['Front Camera'] },
  { key: 'BACK_CAMERA', label: "Back Camera's", sub: 'Rear cameras', icon: 'camera-reverse-outline', parts: ['Back Main Camera'] },
  { key: 'MORE', label: 'More Items', sub: 'Other components', icon: 'apps-outline', parts: ['Side Frame', 'Back Panel (Backshell)', 'Charging Sub Board', 'SIM Tray', 'Loudspeaker'] },
];
// Home tool-tile disc colours, cycled across the groups.
const DISCS = ['#357D89', '#5E9440', '#3B82F6', '#6B7280'];

const TEAL = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';
const PAGE = '#F3F4F6';
const MAX_PER_PART = 5;                    // photos per part, added one by one
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;  // master-data /media/upload limit
const THUMB = 64;

let nextCustomId = 1;
const makeId = () => `c${nextCustomId++}`;

export default function OwnerSellSparePartsScreen({ navigation, route }) {
  const params = route?.params || {};
  const device = params.device || null;
  const dead = params.workingCondition === 'DEAD';

  // Selected PRESET part names per group (Set). Custom rows are included once
  // they have a name or a photo.
  const [sel, setSel] = useState({});
  // Photos per part: { [groupKey]: { [slotId]: [url, ...] } } — slotId is the
  // preset part name or a custom row's id.
  const [images, setImages] = useState({});
  // Custom rows added via "+ Add": { [groupKey]: [{ id, name }] }
  const [added, setAdded] = useState({});
  // Note per part: { [groupKey]: { [slotId]: text } }
  const [notes, setNotes] = useState({});
  const [uploading, setUploading] = useState(null); // "GROUP/slot" while uploading
  // Photo sheet — same steps as Device Photos:
  //   { mode: 'add', g, slot, auto }            → Gallery / Camera
  //   { mode: 'item', g, slot, index }          → Preview / Replace / Remove
  //   { mode: 'replace', g, slot, index }       → Gallery / Camera
  const [sheet, setSheet] = useState(null);
  const [preview, setPreview] = useState(null); // { urls, index }
  const insets = useSafeAreaInsets();

  const photosOf = (g, slot) => images[g]?.[slot] || [];
  const noteOf = (g, slot) => (notes[g]?.[slot] || '').trim();
  const setNote = (g, slot, text, auto) => {
    setNotes((prev) => ({ ...prev, [g]: { ...(prev[g] || {}), [slot]: text } }));
    if (auto && text.trim()) selectPreset(g, slot, true); // a note on a preset part selects it
  };

  const selectPreset = (g, name, on) => setSel((prev) => {
    const set = new Set(prev[g] || []);
    if (on) set.add(name); else set.delete(name);
    return { ...prev, [g]: set };
  });
  const togglePreset = (g, name) => selectPreset(g, name, !sel[g]?.has(name));

  // Gallery or camera → upload → append (or replace one). Same permission,
  // size-limit and upload handling as Device Photos.
  const pickPhoto = async (fromCamera, { g, slot, index, auto }) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      const what = fromCamera ? 'Camera' : 'Photos';
      if (perm.canAskAgain === false && Platform.OS !== 'web') {
        Alert.alert(`${what} access is off`, `Turn on ${what.toLowerCase()} access for this app in Settings to add part photos.`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      } else {
        notify('Permission needed', `Allow ${what.toLowerCase()} access to add part photos.`);
      }
      return;
    }
    const key = `${g}/${slot}`;
    try {
      const opts = { mediaTypes: 'images', allowsEditing: false, quality: 0.7 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
        notify('Photo too large', 'The limit is 10 MB. Choose a smaller photo and try again.');
        return;
      }
      setUploading(key);
      const url = await uploadMedia(asset, 'spare-parts');
      if (!url) throw new Error('Upload returned no URL');
      setImages((prev) => {
        const list = prev[g]?.[slot] || [];
        const next = typeof index === 'number'
          ? list.map((u, n) => (n === index ? url : u))
          : (list.length >= MAX_PER_PART ? list : [...list, url]);
        return { ...prev, [g]: { ...(prev[g] || {}), [slot]: next } };
      });
      if (auto) selectPreset(g, slot, true); // a photo on a preset part selects it
    } catch (e) {
      const tooBig = e?.status === 413 || /too large|maximum upload size|exceed/i.test(e?.message || '');
      notify('Upload failed', tooBig ? 'The file is larger than 10 MB.' : (e?.message || 'Try again'));
    } finally {
      setUploading(null);
    }
  };
  // Close the sheet first, then open the picker (iOS won't present one while a
  // modal is still sliding out).
  const choose = (fromCamera) => {
    const t = sheet;
    setSheet(null);
    setTimeout(() => pickPhoto(fromCamera, t.mode === 'replace' ? { g: t.g, slot: t.slot, index: t.index } : { g: t.g, slot: t.slot, auto: t.auto }), 320);
  };
  const removePhoto = (g, slot, index) => setImages((prev) => ({
    ...prev,
    [g]: { ...(prev[g] || {}), [slot]: (prev[g]?.[slot] || []).filter((_, i) => i !== index) },
  }));
  const openPreview = (g, slot, index) => {
    setSheet(null);
    setTimeout(() => setPreview({ urls: photosOf(g, slot), index }), 320);
  };

  const addCustom = (g) => setAdded((prev) => ({ ...prev, [g]: [...(prev[g] || []), { id: makeId(), name: '' }] }));
  const renameCustom = (g, id, name) => setAdded((prev) => ({ ...prev, [g]: (prev[g] || []).map((c) => (c.id === id ? { ...c, name } : c)) }));
  const removeCustom = (g, id) => {
    setAdded((prev) => ({ ...prev, [g]: (prev[g] || []).filter((c) => c.id !== id) }));
    setImages((prev) => {
      const next = { ...(prev[g] || {}) };
      delete next[id];
      return { ...prev, [g]: next };
    });
  };

  const { totalSelected, items, allImages } = useMemo(() => {
    const all = [];
    const imgs = [];
    PRESET_GROUPS.forEach((g) => {
      g.parts.forEach((name) => {
        if (!sel[g.key]?.has(name)) return;
        const urls = images[g.key]?.[name] || [];
        all.push({ groupKey: g.key, group: g.label, partName: name, imageUrl: urls[0] || null, imageUrls: urls, note: noteOf(g.key, name), custom: false });
        urls.forEach((u) => imgs.push(u));
      });
      (added[g.key] || []).forEach((c) => {
        const urls = images[g.key]?.[c.id] || [];
        const nm = (c.name || '').trim();
        const note = noteOf(g.key, c.id);
        if (!nm && urls.length === 0 && !note) return; // skip empty drafts
        all.push({ groupKey: g.key, group: g.label, partName: nm || 'Custom part', imageUrl: urls[0] || null, imageUrls: urls, note, custom: true });
        urls.forEach((u) => imgs.push(u));
      });
    });
    return { totalSelected: all.length, items: all, allImages: imgs };
  }, [sel, images, added, notes]);

  const onSellNow = () => {
    if (totalSelected === 0) return;
    const imagesObj = {};
    allImages.slice(0, 5).forEach((url, i) => { imagesObj[`p${i + 1}`] = url; });
    navigation.navigate('OwnerSellGadgetPrice', {
      ...params, // device / screening answers ride along
      flow: 'OWNER_LIST',
      descriptionType: 'SPARE_PARTS',
      spareParts: items,
      images: imagesObj,
    });
  };

  const disabled = totalSelected === 0 || !!uploading;

  // Left: photo strip for one part — thumbnails (tap → Preview / Replace /
  // Remove) then an "Add photo" tile (tap → Gallery / Camera). Right: note box.
  const renderPhotos = (g, slot, auto) => {
    const urls = photosOf(g.key, slot);
    const busy = uploading === `${g.key}/${slot}`;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'stretch', paddingTop: 10, gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1, maxWidth: '55%' }} contentContainerStyle={{ gap: 8 }}>
          {urls.map((u, i) => (
            <Pressable
              key={`${u}-${i}`}
              onPress={() => setSheet({ mode: 'item', g: g.key, slot, index: i })}
              accessibilityRole="button"
              accessibilityLabel={`Photo ${i + 1}`}
              style={{ width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: LINE }}
            >
              <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={{ position: 'absolute', left: 4, bottom: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: 'rgba(17,17,17,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#FFFFFF' }}>{i + 1}</Text>
              </View>
            </Pressable>
          ))}
          {urls.length < MAX_PER_PART ? (
            <Pressable
              onPress={() => setSheet({ mode: 'add', g: g.key, slot, auto })}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              style={{ width: THUMB, height: THUMB, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7E6EA', backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}
            >
              {busy ? <ActivityIndicator color={TEAL} /> : (
                <>
                  <MaterialIcons name="add-a-photo" size={20} color={TEAL} />
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: TEAL, marginTop: 3 }}>{urls.length ? 'Add more' : 'Add photo'}</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
        <TextInput
          placeholder="Add a note (condition, defects…)"
          placeholderTextColor="#9CA3AF"
          defaultValue={notes[g.key]?.[slot] || ''}
          onChangeText={(v) => setNote(g.key, slot, v, auto)}
          multiline
          maxLength={200}
          textAlignVertical="top"
          accessibilityLabel="Part note"
          style={{ flex: 1, minHeight: THUMB, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: INK }}
        />
      </View>
    );
  };

  const sheetTitle = sheet?.mode === 'item' ? `Photo ${sheet.index + 1}`
    : sheet?.mode === 'replace' ? `Replace Photo ${sheet.index + 1}` : 'Add Photo';

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header — back · centred title (+ the device) · spacer */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: LINE }}>
        <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={19} color={INK} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: INK }} numberOfLines={1}>Spare Parts</Text>
            <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }} numberOfLines={1}>
              {device?.modelName ? `${device.modelName}${dead ? ' · Dead / Unverified' : ''}` : 'Pick the parts and add photos'}
            </Text>
          </View>
          <View style={{ width: 36, height: 36 }} />
        </View>
      </View>

      <ScrollView style={{ backgroundColor: PAGE }} contentContainerStyle={{ padding: 12, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 }}>
          <MaterialIcons name="info-outline" size={16} color={TEAL} />
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, color: INK, lineHeight: 17 }}>
            Tick the parts you're selling and add photos one by one — up to {MAX_PER_PART} per part.
          </Text>
        </View>

        {PRESET_GROUPS.map((g, gi) => {
          const disc = DISCS[gi % DISCS.length];
          const customList = added[g.key] || [];
          const selectedCount = items.filter((it) => it.groupKey === g.key).length;
          return (
            <View key={g.key} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: LINE }}>
              {/* Group header */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: disc, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Ionicons name={g.icon} size={17} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>{g.label}</Text>
                  <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                    {selectedCount ? `${selectedCount} selected` : g.sub}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => addCustom(g.key)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Add a ${g.label} part`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
                  <Ionicons name="add" size={14} color={TEAL} />
                  <Text style={{ color: TEAL, fontSize: 12, fontWeight: '800', marginLeft: 2 }}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Preset parts */}
              {g.parts.map((name) => {
                const on = !!sel[g.key]?.has(name);
                return (
                  <View key={name} style={{ marginTop: 10, borderRadius: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? TEAL : LINE, backgroundColor: on ? '#F5FAFB' : '#FFFFFF', padding: 10 }}>
                    <Pressable onPress={() => togglePreset(g.key, name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: on ? 0 : 1.5, borderColor: '#D1D5DB', backgroundColor: on ? TEAL : '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        {on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: on ? '800' : '700', color: INK }} numberOfLines={2}>{name}</Text>
                      <Text style={{ fontSize: 11, color: MUTED }}>{photosOf(g.key, name).length}/{MAX_PER_PART}</Text>
                    </Pressable>
                    {renderPhotos(g, name, true)}
                  </View>
                );
              })}

              {/* Custom parts — name + photos */}
              {customList.map((c) => (
                <View key={c.id} style={{ marginTop: 10, borderRadius: 14, borderWidth: 1.5, borderColor: TEAL, backgroundColor: '#F5FAFB', padding: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', paddingLeft: 10, paddingRight: 4 }}>
                    <TextInput
                      placeholder="Enter part name"
                      placeholderTextColor="#9CA3AF"
                      defaultValue={c.name}
                      onChangeText={(v) => renameCustom(g.key, c.id, v)}
                      style={{ flex: 1, fontSize: 13, fontWeight: '700', color: INK, paddingVertical: 8 }}
                    />
                    <Pressable onPress={() => removeCustom(g.key, c.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove part" style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                    </Pressable>
                  </View>
                  {renderPhotos(g, c.id, false)}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom Sell Now bar */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 6, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE }}>
        <TouchableOpacity onPress={onSellNow} disabled={disabled} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ disabled }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 50, backgroundColor: TEAL, opacity: disabled ? 0.45 : 1, borderRadius: 14 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginRight: 6 }}>Sell Now{totalSelected ? ` (${totalSelected})` : ''}</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Photo sheet — Add: Gallery / Camera · a photo: Preview / Replace / Remove */}
      <ResponsiveModal visible={!!sheet} onClose={() => setSheet(null)} maxWidth={480}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          {sheet?.mode === 'replace' ? (
            <Pressable onPress={() => setSheet({ ...sheet, mode: 'item' })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={{ height: 32, width: 32, borderRadius: 16, marginRight: 8, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="arrow-back" size={20} color={INK} />
            </Pressable>
          ) : null}
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: INK }} numberOfLines={1}>{sheetTitle}</Text>
        </View>
        {sheet?.mode === 'item' ? (
          <>
            <SheetOption icon="visibility" label="Preview" onPress={() => openPreview(sheet.g, sheet.slot, sheet.index)} />
            <SheetOption icon="autorenew" label="Replace" onPress={() => setSheet({ ...sheet, mode: 'replace' })} />
            <SheetOption icon="delete-outline" label="Remove" danger onPress={() => { removePhoto(sheet.g, sheet.slot, sheet.index); setSheet(null); }} />
          </>
        ) : (
          <>
            <SheetOption icon="photo-library" label="Choose from Gallery" onPress={() => choose(false)} />
            <SheetOption icon="photo-camera" label="Take Photo" onPress={() => choose(true)} />
          </>
        )}
        <Pressable onPress={() => setSheet(null)} accessibilityRole="button" style={{ marginTop: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>Cancel</Text>
        </Pressable>
      </ResponsiveModal>

      <ImageViewerModal
        visible={!!preview}
        images={(preview?.urls || []).map((u, i) => ({ uri: u, label: `Photo ${i + 1}` }))}
        index={preview?.index || 0}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

function SheetOption({ icon, label, onPress, danger = false }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', height: 54 }}>
      <View style={{ height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? 'rgba(220, 38, 38, 0.10)' : MINT }}>
        <MaterialIcons name={icon} size={21} color={danger ? '#DC2626' : TEAL} />
      </View>
      <Text style={{ marginLeft: 14, fontSize: 14.5, fontWeight: '600', color: danger ? '#DC2626' : INK }}>{label}</Text>
    </Pressable>
  );
}
