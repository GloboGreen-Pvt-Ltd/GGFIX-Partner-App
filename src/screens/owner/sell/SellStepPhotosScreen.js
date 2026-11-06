import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { launchCamera } from '../../../components/InAppCamera';
import { ArrowLeft, ArrowRight, Camera, ChevronLeft, ChevronRight, ImagePlus, Images, Play, RefreshCw, Star, Trash2, Video, X } from 'lucide-react-native';
import { uploadMedia } from '../../../api/masterData';
import { notify } from '../../../components/confirm';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, FieldLabel, PrimaryButton, Section, SellScreen, CONTENT_MAX } from './kit';
import { MAX_PHOTOS, minPhotos, useSellDraft, sellDraftStore } from './draft';

// Page 5 (step 3 of 4) — photos (camera / gallery), cover, order, optional
// video. Each file uploads as soon as it is picked; URLs live in the draft so
// going Back or restarting keeps them.

const VIDEO_MAX_SEC = 30;
const VIDEO_MAX_BYTES = 10 * 1024 * 1024; // media upload limit on the server

let seq = 0;
const newKey = () => `ph-${Date.now()}-${seq++}`;
// Uploads running in this app session; anything else marked 'uploading' in
// the saved draft was cut off by an app restart and needs a retry.
const inFlight = new Set();

function patchPhoto(key, values) {
  sellDraftStore.patch('media', (m) => ({ photos: m.photos.map((ph) => (ph.key === key ? { ...ph, ...values } : ph)) }));
}

async function uploadPhoto(photo) {
  if (inFlight.has(photo.key)) return;
  inFlight.add(photo.key);
  patchPhoto(photo.key, { status: 'uploading', error: null });
  try {
    const url = await uploadMedia(photo.asset, 'sell');
    if (!url) throw new Error('The server returned no image URL.');
    patchPhoto(photo.key, { status: 'done', url });
  } catch (e) {
    patchPhoto(photo.key, { status: 'error', error: e?.message || 'Upload failed' });
  } finally {
    inFlight.delete(photo.key);
  }
}

function assetOf(a) {
  return { uri: a.uri, fileName: a.fileName || null, mimeType: a.mimeType || null };
}

export default function SellStepPhotosScreen({ navigation }) {
  const { draft, ready } = useSellDraft();
  const m = draft.media;
  const photos = m.photos || [];
  const min = minPhotos(draft.listingType);
  const remaining = MAX_PHOTOS - photos.length;
  const { width } = useWindowDimensions();
  const cols = 3;
  const tile = Math.floor((Math.min(width, CONTENT_MAX) - 32 - 10 * (cols - 1)) / cols);

  const [sheet, setSheet] = useState(null); // 'photo' | 'video'
  const [preview, setPreview] = useState(null); // photo key
  const [error, setError] = useState(null);

  const done = photos.filter((ph) => ph.status === 'done');
  const uploading = photos.some((ph) => ph.status === 'uploading') || m.video?.status === 'uploading';
  const failed = photos.filter((ph) => ph.status === 'error');
  const coverKey = done.some((ph) => ph.key === m.coverKey) ? m.coverKey : done[0]?.key || null;

  const addAssets = (assets) => {
    const room = MAX_PHOTOS - sellDraftStore.get().media.photos.length;
    const picked = assets.slice(0, room).map((a) => ({ key: newKey(), uri: a.uri, asset: assetOf(a), status: 'uploading', url: null }));
    if (assets.length > room) notify('Photo limit', `Only ${MAX_PHOTOS} photos are allowed per listing.`);
    if (!picked.length) return;
    sellDraftStore.patch('media', (cur) => ({ photos: [...cur.photos, ...picked], coverKey: cur.coverKey || picked[0].key }));
    picked.forEach(uploadPhoto);
  };

  const pickPhotos = async (source) => {
    setSheet(null);
    setError(null);
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { notify('Permission needed', 'Allow camera access to take listing photos.'); return; }
        const res = await launchCamera({ mediaTypes: 'images', quality: 0.7 });
        if (!res.canceled && res.assets?.length) addAssets(res.assets);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { notify('Permission needed', 'Allow photo library access to attach photos.'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, selectionLimit: Math.max(1, remaining), quality: 0.7 });
        if (!res.canceled && res.assets?.length) addAssets(res.assets);
      }
    } catch (e) {
      setError(e?.message || 'Could not open the camera or gallery.');
    }
  };

  useEffect(() => {
    if (!ready) return;
    const cur = sellDraftStore.get().media;
    if (cur.photos.some((ph) => ph.status === 'uploading' && !inFlight.has(ph.key))) {
      sellDraftStore.patch('media', (mm) => ({
        photos: mm.photos.map((ph) => (ph.status === 'uploading' && !inFlight.has(ph.key) ? { ...ph, status: 'error', error: 'Upload interrupted' } : ph)),
      }));
    }
    if (cur.video?.status === 'uploading' && !inFlight.has(cur.video.key)) {
      sellDraftStore.patch('media', (mm) => ({ video: { ...mm.video, status: 'error', error: 'Upload interrupted — tap retry' } }));
    }
  }, [ready]);

  const uploadVideo = async (video) => {
    inFlight.add(video.key);
    sellDraftStore.patch('media', { video: { ...video, status: 'uploading', error: null } });
    try {
      const url = await uploadMedia(video.asset, 'sell', { slot: 'video' });
      if (!url) throw new Error('The server returned no video URL.');
      sellDraftStore.patch('media', (cur) => ({ video: cur.video?.key === video.key ? { ...cur.video, status: 'done', url } : cur.video }));
    } catch (e) {
      sellDraftStore.patch('media', (cur) => ({ video: cur.video?.key === video.key ? { ...cur.video, status: 'error', error: e?.message || 'Upload failed' } : cur.video }));
    } finally {
      inFlight.delete(video.key);
    }
  };

  const pickVideo = async (source) => {
    setSheet(null);
    setError(null);
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') { notify('Permission needed', 'Allow access to add a video.'); return; }
      const opts = { mediaTypes: 'videos', videoMaxDuration: VIDEO_MAX_SEC, quality: 0.5 };
      const res = source === 'camera' ? await launchCamera(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const a = res.assets?.[0];
      if (res.canceled || !a) return;
      const secs = a.duration ? Math.round(a.duration / 1000) : null;
      if (secs && secs > VIDEO_MAX_SEC + 1) { notify('Video too long', `Keep the video under ${VIDEO_MAX_SEC} seconds.`); return; }
      if (a.fileSize && a.fileSize > VIDEO_MAX_BYTES) { notify('Video too large', 'Videos must be under 10 MB. Record a shorter clip.'); return; }
      uploadVideo({ key: newKey(), uri: a.uri, asset: assetOf(a), duration: secs });
    } catch (e) {
      setError(e?.message || 'Could not add the video.');
    }
  };

  const remove = (key) => {
    sellDraftStore.patch('media', (cur) => {
      const rest = cur.photos.filter((ph) => ph.key !== key);
      return { photos: rest, coverKey: cur.coverKey === key ? (rest.find((ph) => ph.status === 'done')?.key || null) : cur.coverKey };
    });
    setPreview(null);
  };
  const move = (key, dir) => {
    sellDraftStore.patch('media', (cur) => {
      const list = [...cur.photos];
      const i = list.findIndex((ph) => ph.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return {};
      [list[i], list[j]] = [list[j], list[i]];
      return { photos: list };
    });
  };
  const setCover = (key) => sellDraftStore.patch('media', { coverKey: key });

  const next = () => {
    if (uploading) { notify('Uploading', 'Wait for the uploads to finish.'); return; }
    if (done.length < min) {
      setError(`Add at least ${min} photo${min > 1 ? 's' : ''} (${done.length} uploaded).`);
      return;
    }
    if (failed.length) {
      setError('Some photos failed to upload. Retry or remove them before continuing.');
      return;
    }
    if (m.coverKey !== coverKey) setCover(coverKey);
    navigation.navigate('SellStepPrice');
  };

  const previewPhoto = photos.find((ph) => ph.key === preview);
  const previewIndex = photos.findIndex((ph) => ph.key === preview);

  return (
    <SellScreen
      title="Upload Photos & Media"
      subtitle="Step 3 of 4 • Add images & video"
      step={3}
      onBack={() => navigation.goBack()}
      footer={<PrimaryButton title="Next" iconRight={ArrowRight} onPress={next} disabled={!ready || uploading} loading={uploading} />}
    >
      <View style={{ marginTop: 10 }}>
        <FieldLabel label="Photos" required hint={`(Min. ${min}, Max. ${MAX_PHOTOS})`} right={<Text style={{ fontSize: rf(11), color: done.length >= min ? C.green : C.muted, fontWeight: '700' }}>{done.length}/{MAX_PHOTOS}</Text>} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {/* Remove sits beside the tile, not inside it: a button inside a
              button is invalid on web and confuses screen readers. */}
          {photos.map((ph) => (
            <View key={ph.key} style={{ width: tile, height: tile }}>
            <Pressable
              onPress={() => (ph.status === 'error' ? uploadPhoto(ph) : setPreview(ph.key))}
              accessibilityRole="button"
              accessibilityLabel={ph.status === 'error' ? 'Retry upload' : 'Open photo'}
              className="active:opacity-85"
              style={{ width: tile, height: tile, borderRadius: 12, overflow: 'hidden', backgroundColor: C.field, borderWidth: ph.key === coverKey ? 2 : 1, borderColor: ph.key === coverKey ? C.teal : C.border }}
            >
              <Image source={{ uri: ph.url || ph.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {ph.status === 'uploading' ? (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={C.teal} />
                </View>
              ) : null}
              {ph.status === 'error' ? (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(253,236,236,0.85)', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                  <RefreshCw size={18} color={C.red} />
                  <Text style={{ fontSize: rf(10), color: C.red, fontWeight: '800', marginTop: 4 }}>Tap to retry</Text>
                </View>
              ) : null}
              {ph.key === coverKey ? (
                <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: C.teal, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: rf(9.5), color: '#FFFFFF', fontWeight: '800' }}>Cover</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable onPress={() => remove(ph.key)} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6} style={{ position: 'absolute', top: 5, right: 5, height: 22, width: 22, borderRadius: 11, backgroundColor: 'rgba(17,17,17,0.65)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={13} color="#FFFFFF" />
            </Pressable>
            </View>
          ))}
          {remaining > 0 ? (
            <Pressable
              onPress={() => setSheet('photo')}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              className="active:opacity-80"
              style={{ width: tile, height: tile, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.teal, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}
            >
              <ImagePlus size={22} color={C.teal} />
              <Text style={{ fontSize: rf(11), color: C.teal, fontWeight: '800', marginTop: 4 }}>Add Photo</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 8 }}>
          Tap a photo to preview, reorder or set it as cover. Front, back, sides and any damage help buyers decide.
        </Text>
      </View>

      {done.length > 1 ? (
        <Section title="Cover Image" sub="Shown first in search and on your listing">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {done.map((ph) => (
              <Pressable
                key={ph.key}
                onPress={() => setCover(ph.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: ph.key === coverKey }}
                className="active:opacity-85"
                style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', borderWidth: ph.key === coverKey ? 2.5 : 1, borderColor: ph.key === coverKey ? C.teal : C.border }}
              >
                <Image source={{ uri: ph.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Add Video" sub={`(Optional) Up to ${VIDEO_MAX_SEC} seconds, 10 MB`}>
        {m.video ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: m.video.status === 'error' ? C.red : C.border, padding: 10 }}>
            <View style={{ height: 56, width: 76, borderRadius: 10, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' }}>
              {m.video.status === 'uploading' ? <ActivityIndicator color="#FFFFFF" /> : <Play size={20} color="#FFFFFF" fill="#FFFFFF" />}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>
                Video{m.video.duration ? ` · 0:${String(m.video.duration).padStart(2, '0')}` : ''}
              </Text>
              <Text style={{ fontSize: rf(11), color: m.video.status === 'error' ? C.red : C.muted, marginTop: 2 }}>
                {m.video.status === 'uploading' ? 'Uploading…' : m.video.status === 'error' ? m.video.error : 'Uploaded'}
              </Text>
            </View>
            {m.video.status === 'error' ? (
              <Pressable onPress={() => uploadVideo(m.video)} accessibilityRole="button" accessibilityLabel="Retry video upload" hitSlop={8} style={{ padding: 6 }}>
                <RefreshCw size={18} color={C.red} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => sellDraftStore.patch('media', { video: null })} accessibilityRole="button" accessibilityLabel="Remove video" hitSlop={8} style={{ padding: 6 }}>
              <Trash2 size={18} color={C.muted} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setSheet('video')}
            accessibilityRole="button"
            accessibilityLabel="Add video"
            className="active:opacity-80"
            style={{ height: 64, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.teal, backgroundColor: C.mint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          >
            <Video size={20} color={C.teal} />
            <Text style={{ fontSize: rf(12.5), color: C.teal, fontWeight: '800', marginLeft: 8 }}>Add Video</Text>
          </Pressable>
        )}
      </Section>

      {error ? <ErrorBox message={error} /> : null}

      {/* Camera / gallery chooser */}
      <SafeModal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <ModalInsets>
          {({ bottom }) => (
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }} onPress={() => setSheet(null)}>
              <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: bottom + 16, gap: 10 }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text, marginBottom: 4 }}>{sheet === 'video' ? 'Add Video' : 'Add Photos'}</Text>
                <PrimaryButton title={sheet === 'video' ? 'Record Video' : 'Take Photo'} icon={Camera} onPress={() => (sheet === 'video' ? pickVideo('camera') : pickPhotos('camera'))} />
                <PrimaryButton variant="outline" title="Choose from Gallery" icon={Images} onPress={() => (sheet === 'video' ? pickVideo('library') : pickPhotos('library'))} />
              </View>
            </Pressable>
          )}
        </ModalInsets>
      </SafeModal>

      {/* Preview: cover, reorder, remove */}
      <SafeModal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <Pressable onPress={() => setPreview(null)} accessibilityRole="button" accessibilityLabel="Close preview" style={{ position: 'absolute', top: 48, right: 16, zIndex: 2, padding: 6 }}>
            <X size={26} color="#FFFFFF" />
          </Pressable>
          {previewPhoto ? (
            <>
              <Image source={{ uri: previewPhoto.url || previewPhoto.uri }} style={{ width: '100%', height: '62%' }} resizeMode="contain" />
              <Text style={{ color: '#FFFFFF', textAlign: 'center', marginTop: 10, fontSize: rf(12) }}>{previewIndex + 1} of {photos.length}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16, paddingHorizontal: 16, flexWrap: 'wrap' }}>
                <PrimaryButton small variant="soft" title="Move" icon={ChevronLeft} disabled={previewIndex <= 0} onPress={() => move(previewPhoto.key, -1)} />
                <PrimaryButton small variant="soft" title="Move" iconRight={ChevronRight} disabled={previewIndex >= photos.length - 1} onPress={() => move(previewPhoto.key, 1)} />
                <PrimaryButton small variant="green" title={previewPhoto.key === coverKey ? 'Cover Photo' : 'Set as Cover'} icon={Star} disabled={previewPhoto.status !== 'done' || previewPhoto.key === coverKey} onPress={() => setCover(previewPhoto.key)} />
                <PrimaryButton small variant="dangerSolid" title="Remove" icon={Trash2} onPress={() => remove(previewPhoto.key)} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, marginTop: 18 }}>
                <Pressable disabled={previewIndex <= 0} onPress={() => setPreview(photos[previewIndex - 1]?.key)} accessibilityLabel="Previous photo" style={{ opacity: previewIndex <= 0 ? 0.3 : 1, padding: 8 }}>
                  <ArrowLeft size={22} color="#FFFFFF" />
                </Pressable>
                <Pressable disabled={previewIndex >= photos.length - 1} onPress={() => setPreview(photos[previewIndex + 1]?.key)} accessibilityLabel="Next photo" style={{ opacity: previewIndex >= photos.length - 1 ? 0.3 : 1, padding: 8 }}>
                  <ArrowRight size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </SafeModal>
    </SellScreen>
  );
}
