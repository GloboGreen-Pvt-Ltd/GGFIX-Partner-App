import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Image, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Smartphone,
  Hash,
  ReceiptText,
  MessageSquareText,
  Timer,
  Calendar,
  Clock,
  ShieldCheck,
  CircleCheck,
  Camera,
  Video,
  Image as ImageIcon,
  X,
  Plus,
  ChevronRight,
  Mic,
  Play,
  Pause,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { notify } from '../../../components/confirm';
import { uploadMedia } from '../../../api/masterData';
import DeviceSecurityLockSheet from './DeviceSecurityLockSheet';

// One deep green for the whole screen, matching the rest of the booking flow.
//
// Explicit values, not `text-primary`/`bg-success` classes: those tokens DO point
// at #004C40 in tailwind.config.js, but NativeWind compiles its stylesheet at
// build time and the cached copy in this project still holds the old #087A0A —
// which is why the classes kept painting green. A value cannot go stale.
const ACCENT = '#004C40';
const ACCENT_06 = 'rgba(0, 76, 64, 0.06)';
const ACCENT_10 = 'rgba(0, 76, 64, 0.10)';
const ACCENT_14 = 'rgba(0, 76, 64, 0.14)';
const ACCENT_35 = 'rgba(0, 76, 64, 0.35)';

// Front and Back are REQUIRED — without them the technician can't prove the
// device's pre-repair state. The coverage video is optional but encouraged.
const SLOTS = [
  { key: 'front', label: 'Front Side', isVideo: false, icon: ImageIcon, required: true },
  { key: 'back',  label: 'Back Side',  isVideo: false, icon: ImageIcon, required: true },
  { key: 'video', label: 'Full Coverage', isVideo: true, icon: Video, required: false },
];

/** Long enough for ResponsiveModal's slide-out to finish before the next present. */
const HANDOFF_MS = 320;

const formatINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function DeviceInformationScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const services = params.services || [];
  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  const [photos, setPhotos] = useState(() => {
    const p = params.prefillDevicePhotos;
    return p && typeof p === 'object' ? { ...p } : {};
  }); // { front: url, back: url, video: url }
  const [uploading, setUploading] = useState(null);
  const [lockOpen, setLockOpen] = useState(false);
  // Held between the two sheets: the lock is picked first, then missing parts,
  // and only the second one navigates — so the lock has to survive the handoff.
  const [lock, setLock] = useState(null);
  const handoffRef = useRef(null);
  // Never leave a pending handoff to fire into an unmounted screen.
  useEffect(() => () => { if (handoffRef.current) clearTimeout(handoffRef.current); }, []);

  // Read-only playback of the voice note recorded on the previous screen.
  // Owner reviewing the booking can tap Play to confirm the customer's exact
  // complaint before finalising. The recording itself is uploaded; we just
  // stream it back from the hosted URL here — no re-record on this screen.
  const issueAudioUrl = params.issueAudioUrl || null;
  const [isPlayingIssue, setIsPlayingIssue] = useState(false);
  const issueSoundRef = useRef(null);
  useEffect(() => () => { try { issueSoundRef.current?.unloadAsync?.(); } catch (_) {} }, []);

  const toggleIssuePlayback = async () => {
    if (!issueAudioUrl) return;
    try {
      if (isPlayingIssue && issueSoundRef.current) {
        await issueSoundRef.current.pauseAsync();
        setIsPlayingIssue(false);
        return;
      }
      if (issueSoundRef.current) {
        try { await issueSoundRef.current.unloadAsync(); } catch (_) {}
      }
      const { sound } = await Audio.Sound.createAsync({ uri: issueAudioUrl });
      issueSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish) setIsPlayingIssue(false);
      });
      await sound.playAsync();
      setIsPlayingIssue(true);
    } catch (e) {
      notify('Could not play', e?.message || 'Try again.');
    }
  };

  // Capture from camera OR pick from gallery. The slot tells us whether to
  // ask for a video or an image; the fromCamera flag swaps which permission
  // and which launcher we use.
  const pick = async (slot, fromCamera = false) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify(
        'Permission needed',
        `Allow ${fromCamera ? 'camera' : 'media library'} access to attach ${slot.isVideo ? 'a video' : 'photos'}.`,
      );
      return;
    }
    try {
      const opts = {
        mediaTypes: slot.isVideo ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
        // Crop/edit disabled — owner picks the photo as-is so the customer sees
        // exactly what the camera captured (no implicit aspect-ratio cropping).
        allowsEditing: false,
        aspect: !slot.isVideo ? [3, 4] : undefined,
        quality: 0.7,
        videoMaxDuration: 30,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(slot.key);
      // 'repair' routes the file to S3 under media.ggfix.in/Devicefiles/, and the
      // slot becomes the filename stem (front-…, back-…, video-…).
      const url = await uploadMedia(result.assets[0], 'repair', { slot: slot.key });
      if (!url) throw new Error('Upload returned no URL');
      setPhotos((m) => ({ ...m, [slot.key]: url }));
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again');
    } finally {
      setUploading(null);
    }
  };

  // Web's Alert.alert collapses to window.alert and ignores multi-button
  // sheets, so on web we skip straight to the library picker.
  const promptPick = (slot) => {
    if (Platform.OS === 'web') { pick(slot, false); return; }
    const cameraLabel = slot.isVideo ? 'Record Video' : 'Take Photo';
    const libraryLabel = slot.isVideo ? 'Choose Video from Gallery' : 'Choose from Gallery';
    Alert.alert(slot.isVideo ? 'Add Video' : 'Add Photo', '', [
      { text: cameraLabel, onPress: () => pick(slot, true) },
      { text: libraryLabel, onPress: () => pick(slot, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const remove = (key) => setPhotos((m) => { const n = { ...m }; delete n[key]; return n; });

  // Device Security Lock is a popup on this screen now, not a screen of its own.
  // Continue opens it; the sheet's own Continue is what advances the flow.
  const onContinue = () => setLockOpen(true);

  /**
   * Lock -> Missing Parts -> onward. Both are popups on this screen now, so the
   * second opens where the third screen used to be.
   *
   * The delay is not cosmetic. Closing one RN Modal and opening another in the
   * SAME tick is unreliable on iOS — UIKit refuses to present while another modal
   * is still dismissing, and the second sheet then silently never appears, which
   * reads as "Continue does nothing". Waiting out the slide-out sidesteps it.
   */
  const onLockConfirm = (nextLock) => {
    setLock(nextLock);
    setLockOpen(false);
    if (handoffRef.current) clearTimeout(handoffRef.current);
    handoffRef.current = setTimeout(() => {
      navigation.navigate('DeviceMissingParts', { ...params, devicePhotos: photos, lock: nextLock });
    }, HANDOFF_MS);
  };

  // Continue is allowed only when ALL required slots have a photo AND no
  // upload is in flight. The coverage video remains optional.
  const requiredKeys = SLOTS.filter((s) => s.required).map((s) => s.key);
  const requiredMissing = requiredKeys.filter((k) => !photos[k]);
  const isReady = !uploading && requiredMissing.length === 0;
  const photoCount = Object.keys(photos).length;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
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
              className="text-text text-[16px] font-bold text-center"
              numberOfLines={1}
            >
              Device Information
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 150 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Device card overlapping hero ─────────────────────────── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-card rounded-2xl p-3.5"
            style={{ borderWidth: 1, borderColor: '#E2E8E2' }}
          >
            <View className="flex-row items-center">
              <View
                className="h-[67px] w-[67px] rounded-2xl items-center justify-center overflow-hidden mr-3"
                style={{ backgroundColor: ACCENT_10 }}
              >
                {params.imageUrl ? (
                  <Image source={{ uri: params.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Smartphone size={28} color={ACCENT} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-extrabold text-text" numberOfLines={1}>
                  {params.modelName || 'Device'}
                </Text>
                <Text className="text-[11.5px] text-text-muted mt-0.5" numberOfLines={1}>
                  {[params.ramLabel, params.storageLabel, params.color].filter(Boolean).join(' · ')}
                </Text>
                <View className="flex-row items-center flex-wrap mt-1.5">
                  {params.modelNumber ? (
                    <View
                      className="flex-row items-center rounded-md px-1.5 py-0.5 mr-1.5"
                      style={{ backgroundColor: ACCENT_10 }}
                    >
                      <Hash size={9} color={ACCENT} />
                      <Text className="text-[10px] font-extrabold ml-0.5" style={{ color: ACCENT }}>
                        {params.modelNumber}
                      </Text>
                    </View>
                  ) : null}
                  <View className="rounded-md px-1.5 py-0.5 mr-1.5" style={{ backgroundColor: ACCENT_10 }}>
                    <Text className="text-[10px] font-extrabold" style={{ color: ACCENT }}>
                      {services.length} service{services.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: ACCENT_10 }}>
                    <Text className="text-[10px] font-extrabold" style={{ color: ACCENT }}>
                      ₹{formatINR(total)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Bill summary ─────────────────────────────────────────── */}
        <SectionHeader icon={ReceiptText} label="Price Summary" />
        <View className="px-4">
          <View>
            {services.map((s, i) => (
              <View key={i} className="flex-row items-center mb-2.5">
                <View
                  className="h-6 w-6 rounded-md items-center justify-center mr-2"
                  style={{ backgroundColor: ACCENT_14 }}
                >
                  <Text className="text-[10.5px] font-extrabold" style={{ color: ACCENT }}>{i + 1}</Text>
                </View>
                <Text className="flex-1 text-text text-[13px]" numberOfLines={1}>{s.serviceName}</Text>
                <Text className="text-text font-extrabold text-[13px]">₹{formatINR(s.price)}</Text>
              </View>
            ))}
            <View className="my-2.5" style={{ borderTopWidth: 1, borderColor: '#E2E8E2', borderStyle: 'dashed' }} />
            <View className="flex-row items-center">
              <Text className="flex-1 text-text font-extrabold text-[13.5px]">Estimated Repair Amount</Text>
              <Text className="text-[18px] font-extrabold" style={{ color: ACCENT }}>₹{formatINR(total)}</Text>
            </View>
          </View>
        </View>

        {/* ── Complaint summary + voice-note playback ───────────────── */}
        <SectionHeader icon={MessageSquareText} label="Complaint Issue" />
        <View className="px-4">
          <View>
            <Text className="text-text text-[13.5px] leading-5">
              {params.complaint || (issueAudioUrl ? 'See voice note below.' : 'No issue described.')}
            </Text>

            {issueAudioUrl ? (
              <>
                <View className="h-px bg-border my-3" />
                <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2">VOICE NOTE</Text>
                <View
                  className="flex-row items-center rounded-2xl px-3 py-2.5"
                  style={{ backgroundColor: ACCENT_10, borderWidth: 1, borderColor: ACCENT_35 }}
                >
                  <Pressable
                    onPress={toggleIssuePlayback}
                    className="h-10 w-10 rounded-full items-center justify-center active:opacity-80"
                    style={{ backgroundColor: ACCENT }}
                    accessibilityRole="button"
                    accessibilityLabel={isPlayingIssue ? 'Pause voice note' : 'Play voice note'}
                  >
                    {isPlayingIssue ? (
                      <Pause size={16} color="#fff" fill="#fff" />
                    ) : (
                      <Play size={16} color="#fff" fill="#fff" />
                    )}
                  </Pressable>
                  <View className="flex-1 ml-2.5">
                    <View className="flex-row items-center">
                      <Mic size={12} color={ACCENT} />
                      <Text className="text-text text-[12.5px] font-extrabold ml-1.5">
                        Customer's voice note
                      </Text>
                    </View>
                    <Text className="text-text-muted text-[10.5px] mt-0.5">
                      {isPlayingIssue ? 'Playing…' : 'Tap to play'}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* ── Timeline card — "Received → Ready by" ────────────────── */}
        <SectionHeader icon={Timer} label="Repair Timeline" />
        <View className="px-4">
          <View>
            <View className="flex-row">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] text-text-muted font-bold tracking-widest mb-1.5">RECEIVED</Text>
                <View className="flex-row items-center">
                  <Calendar size={13} color={ACCENT} />
                  <Text className="text-text text-[12px] font-normal ml-1.5" numberOfLines={1}>
                    {params.estimatedAt || '—'}
                  </Text>
                </View>
              </View>
              <View className="w-px bg-border" />
              <View className="flex-1 pl-3">
                <Text className="text-[10px] text-text-muted font-bold tracking-widest mb-1.5">READY BY</Text>
                <View className="flex-row items-center">
                  <Clock size={13} color={ACCENT} />
                  <Text className="text-text text-[12px] font-normal ml-1.5" numberOfLines={1}>
                    {params.estimatedDelivery || '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Approval row */}
            <View
              className="mt-3 flex-row items-center rounded-xl px-3 py-2.5"
              style={{
                backgroundColor: params.customerApproved ? ACCENT_10 : '#FFFFFF',
                borderWidth: 1,
                borderColor: params.customerApproved ? ACCENT_35 : '#E2E8E2',
              }}
            >
              {params.customerApproved ? (
                <CircleCheck size={18} color={ACCENT} />
              ) : (
                <ShieldCheck size={18} color="#8FA08F" />
              )}
              <Text className="flex-1 text-[12.5px] font-extrabold text-text ml-2">
                Customer Approval
              </Text>
              <Text
                className="text-[12px] font-normal"
                // #F59E0B measured 2.15:1 on the unapproved row's white fill,
                // and weight 400 makes thin strokes worse rather than better.
                // #B45309 is the palette's amber-700 and measures 5.02:1.
                style={{ color: params.customerApproved ? ACCENT : '#B45309' }}
              >
                {params.customerApproved ? 'Done' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Device photos — 3-slot grid, Swiggy "photo upload" pattern ── */}
        <SectionHeader
          icon={Camera}
          label="Device Files"
          subtitle={`Front + Back required · Coverage video optional${photoCount ? ` · ${photoCount}/3 added` : ''}`}
        />
        <View className="px-4">
          <View>
            <View className="flex-row">
              {SLOTS.map((slot) => {
                const url = photos[slot.key];
                const busy = uploading === slot.key;
                const SlotIcon = slot.icon;
                return (
                  <View key={slot.key} className="flex-1 items-center" style={{ marginHorizontal: 4 }}>
                    <Pressable
                      onPress={() => promptPick(slot)}
                      disabled={busy}
                      className="w-full rounded-2xl items-center justify-center overflow-hidden"
                      style={{
                        height: 112,
                        borderWidth: 2,
                        borderStyle: 'dashed',
                        borderColor: url ? ACCENT : '#CBD5CB',
                        // #F7FAF7 was the old page colour — invisible now the
                        // page is white, which left the slots looking unbounded.
                        backgroundColor: url ? ACCENT_06 : '#F8F8F8',
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator color={ACCENT} />
                      ) : url ? (
                        <>
                          {slot.isVideo ? (
                            <View className="absolute inset-0 bg-text/90 items-center justify-center">
                              <Video size={26} color="#fff" />
                              <Text className="text-white text-[9.5px] font-extrabold mt-1 tracking-widest">VIDEO</Text>
                            </View>
                          ) : (
                            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          )}
                          <Pressable
                            onPress={() => remove(slot.key)}
                            className="absolute right-1 top-1 h-6 w-6 rounded-full items-center justify-center"
                            style={{ backgroundColor: 'rgba(23, 33, 23, 0.75)' }}
                          >
                            <X size={13} color="#fff" />
                          </Pressable>
                          <View className="absolute left-1 bottom-1 rounded-full px-1.5 py-0.5" style={{ backgroundColor: ACCENT }}>
                            <Text className="text-white text-[8.5px] font-extrabold">✓ ADDED</Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View
                            className="h-10 w-10 rounded-full items-center justify-center"
                            style={{ backgroundColor: ACCENT_10 }}
                          >
                            <SlotIcon size={20} color={ACCENT} />
                          </View>
                          <View className="flex-row items-center mt-1.5">
                            <Plus size={11} color={ACCENT} />
                            <Text className="text-[10.5px] font-extrabold ml-0.5" style={{ color: ACCENT }}>ADD</Text>
                          </View>
                        </>
                      )}
                    </Pressable>
                    <Text className="text-[11px] font-bold text-text mt-1.5 text-center" numberOfLines={2}>
                      {slot.label}
                      {slot.required ? <Text className="text-danger"> *</Text> : (
                        <Text className="text-text-muted font-semibold"></Text>
                      )}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text className="text-text-muted text-[10.5px] mt-3 leading-4">
              Photos help the customer verify the device's condition before and after repair.
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Sticky green CTA ─────────────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={onContinue}
          disabled={!isReady}
          className="active:opacity-90"
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            opacity: isReady ? 1 : 0.6,
          }}
        >
          <View
            style={{
              backgroundColor: isReady ? ACCENT : '#8FA08F',
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View className="flex-1">
              <Text className="text-white text-[11px] font-bold opacity-90">
                {requiredMissing.length === 0
                  ? `FRONT + BACK ADDED${photos.video ? ' · VIDEO TOO' : ''}`
                  : `${requiredMissing.length} REQUIRED PHOTO${requiredMissing.length > 1 ? 'S' : ''} MISSING`}
              </Text>
              <Text className="text-white text-[16px] font-extrabold">
                Next: Device Security
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-white text-[14px] font-extrabold">Continue</Text>
              <ChevronRight size={18} color="#fff" />
            </View>
          </View>
        </Pressable>
        {!isReady && uploading ? (
          <Text className="text-text-muted text-[10.5px] text-center mt-2">
            Uploading photo… please wait.
          </Text>
        ) : null}
      </View>
      <DeviceSecurityLockSheet
        visible={lockOpen}
        initialLock={lock || params.prefillLock}
        onConfirm={onLockConfirm}
        onClose={() => setLockOpen(false)}
      />

    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="px-4 pt-5 pb-2">
      <View className="flex-row items-center">
        <Icon size={14} color={ACCENT} />
        <Text className="text-text font-bold text-[12.5px] ml-1.5">{label}</Text>
      </View>
      {subtitle ? (
        <Text className="text-text-muted text-[10.5px] mt-1 ml-5" numberOfLines={1}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
