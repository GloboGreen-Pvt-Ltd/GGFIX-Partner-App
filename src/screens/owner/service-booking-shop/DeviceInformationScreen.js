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
  Info,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { createAudioPlayer } from 'expo-audio';
import { notify } from '../../../components/confirm';
import { uploadMedia } from '../../../api/masterData';
import DeviceSecurityLockSheet from './DeviceSecurityLockSheet';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import { lockTypesFor, resolveSpecCategory, specDisplayParts } from '../../../utils/deviceSpecs';

// GGFIX palette — explicit values, not `text-primary` / `text-text` classes: the
// shared Tailwind tokens still resolve to the old teal theme.
const ACCENT = '#09AD2A';       // GGFIX green — fills, icons, selected
const PRIMARY = '#078F23';      // deeper green — green TEXT on white / mint
const MINT = '#EAF8EC';         // light green tint
const MINT_LINE = '#CDEFD4';    // its border
const SOFT = '#F8F8F8';         // soft inner panels
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E6E6E6';
const HAIR = '#F3F3F3';         // card hairline on the grey page
const INK = '#1E1E1E';
const TEXT_SECONDARY = '#6B6B6B';
const WARNING = '#F84141';
const AMBER_TEXT = '#8A6A00';

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
  useEffect(() => () => { try { issueSoundRef.current?.remove?.(); } catch (_) {} }, []);

  const toggleIssuePlayback = async () => {
    if (!issueAudioUrl) return;
    try {
      if (isPlayingIssue && issueSoundRef.current) {
        issueSoundRef.current.pause();
        setIsPlayingIssue(false);
        return;
      }
      if (issueSoundRef.current) {
        try { issueSoundRef.current.remove(); } catch (_) {}
      }
      const player = createAudioPlayer(issueAudioUrl);
      issueSoundRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status?.didJustFinish) setIsPlayingIssue(false);
      });
      player.play();
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
        mediaTypes: slot.isVideo ? 'videos' : 'images',
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

  // Which lock types this device can have: Mobile / Tablet all four, Laptop
  // PIN + Password, Smartwatch / Audio Device none (no lock step).
  const lockTypes = lockTypesFor(resolveSpecCategory(params.deviceCategory, params.categoryCode, params.categoryName));

  // Device Security Lock is a popup on this screen now, not a screen of its own.
  // Continue opens it; the sheet's own Continue is what advances the flow.
  // Without a lock step the booking goes straight on, recorded as no lock.
  const onContinue = () => {
    if (lockTypes.length === 0) {
      navigation.navigate('DeviceMissingParts', { ...params, devicePhotos: photos, lock: { type: 'NONE', value: '' } });
      return;
    }
    setLockOpen(true);
  };

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

  const r = useResponsive();
  // Tablet / large-screen: cap the column and centre it, same convention as
  // the other booking-flow screens.
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 720), alignSelf: 'center' } : null;
  const specLine = specDisplayParts(params, { withColor: true }).join(' · ');

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + rs(8), paddingBottom: rs(12), paddingHorizontal: rs(14), borderBottomWidth: 1, borderBottomColor: BORDER }}
      >
        <View className="relative flex-row items-center justify-center" style={colStyle}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute left-0 items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT, borderWidth: 1, borderColor: BORDER }}
          >
            <ArrowLeft size={18} color={INK} />
          </Pressable>
          <View className="items-center px-12">
            <Text className="font-extrabold text-center" style={{ fontSize: 17, color: INK }} numberOfLines={1}>
              Device Information
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: rs(14), paddingTop: rs(12), paddingBottom: insets.bottom + rs(requiredMissing.length > 0 ? 140 : 100) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={colStyle}>
          {/* ── Device hero ─────────────────────────────────────── */}
          <View
            style={{
              backgroundColor: CARD_BG, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: HAIR,
              shadowColor: INK, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
            }}
          >
            <View className="flex-row items-center">
              <View
                className="items-center justify-center overflow-hidden"
                style={{ height: 62, width: 58, borderRadius: 14, marginRight: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR }}
              >
                {params.imageUrl ? (
                  <Image source={{ uri: params.imageUrl }} style={{ width: 50, height: 56 }} resizeMode="contain" />
                ) : (
                  <Smartphone size={24} color={ACCENT} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {params.brandName ? (
                  <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: PRIMARY }} numberOfLines={1}>
                    {String(params.brandName).toUpperCase()}
                  </Text>
                ) : null}
                <Text className="font-extrabold" style={{ fontSize: 15, lineHeight: 19, color: INK, marginTop: 1 }} numberOfLines={2}>
                  {params.modelName || 'Device'}
                </Text>
                {specLine ? (
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={2}>{specLine}</Text>
                ) : null}
              </View>
            </View>

            {/* Chips — model number / service count / total (real data). */}
            <View className="flex-row items-center flex-wrap" style={{ gap: 6, marginTop: 10 }}>
              {params.modelNumber ? (
                <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT_LINE }}>
                  <Hash size={10} color={PRIMARY} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY, marginLeft: 3 }}>{params.modelNumber}</Text>
                </View>
              ) : null}
              <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT_LINE }}>
                <ReceiptText size={10} color={PRIMARY} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY, marginLeft: 3 }}>
                  {services.length} service{services.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View className="rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: ACCENT }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>₹{formatINR(total)}</Text>
              </View>
            </View>

            {/* Trust strip — static/presentational only. */}
            <View className="flex-row items-center" style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: MINT_LINE }}>
              <ShieldCheck size={13} color={ACCENT} />
              <Text style={{ flex: 1, marginLeft: 6, fontSize: 10, fontWeight: '600', color: TEXT_SECONDARY }} numberOfLines={1}>
                In Safe Hands · Genuine Parts · Trusted Service
              </Text>
            </View>
          </View>

          {/* ── Price summary ───────────────────────────────────── */}
          <Card>
            <SectionHeader icon={ReceiptText} label="Price Summary" subtitle="Service details and estimated cost" />
            {services.map((s, i) => (
              <View key={i} className="flex-row items-center" style={{ paddingVertical: 5 }}>
                <View className="items-center justify-center" style={{ height: 20, width: 20, borderRadius: 7, marginRight: 9, backgroundColor: MINT }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: INK }} numberOfLines={2}>{s.serviceName}</Text>
                <Text className="font-extrabold" style={{ fontSize: 12, color: INK, marginLeft: 8 }}>₹{formatINR(s.price)}</Text>
              </View>
            ))}
            <View
              className="flex-row items-center"
              style={{ marginTop: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: MINT }}
            >
              <Text className="font-extrabold" style={{ flex: 1, fontSize: 12, color: INK }}>Estimated Repair Amount</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: PRIMARY }}>₹{formatINR(total)}</Text>
            </View>
          </Card>

          {/* ── Complaint summary + voice-note playback ───────────── */}
          <Card>
            <SectionHeader icon={MessageSquareText} label="Complaint Issue" subtitle="What seems to be the problem?" />
            <View style={{ borderRadius: 12, backgroundColor: SOFT, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ fontSize: 12, lineHeight: 17, color: INK }}>
                {params.complaint || (issueAudioUrl ? 'See voice note below.' : 'No issue described.')}
              </Text>
            </View>

            {issueAudioUrl ? (
              <View
                className="flex-row items-center"
                style={{ marginTop: 8, borderRadius: 12, padding: 8, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE }}
              >
                <Pressable
                  onPress={toggleIssuePlayback}
                  className="items-center justify-center active:opacity-80"
                  style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: ACCENT }}
                  accessibilityRole="button"
                  accessibilityLabel={isPlayingIssue ? 'Pause voice note' : 'Play voice note'}
                >
                  {isPlayingIssue ? (
                    <Pause size={14} color="#fff" fill="#fff" />
                  ) : (
                    <Play size={14} color="#fff" fill="#fff" />
                  )}
                </Pressable>
                <View style={{ flex: 1, marginLeft: 9 }}>
                  <View className="flex-row items-center">
                    <Mic size={11} color={PRIMARY} />
                    <Text className="font-extrabold" style={{ fontSize: 12, marginLeft: 5, color: INK }}>Customer's voice note</Text>
                  </View>
                  <Text style={{ fontSize: 10, marginTop: 1, color: TEXT_SECONDARY }}>
                    {isPlayingIssue ? 'Playing…' : 'Tap to play'}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>

          {/* ── Repair timeline — Received / Duration / Ready By. The
              Duration node only renders when `durationHours` is on params. ── */}
          <Card>
            <SectionHeader icon={Timer} label="Repair Timeline" subtitle="Track your device repair progress" />
            <View className="flex-row items-stretch" style={{ gap: 6 }}>
              <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: HAIR, backgroundColor: SOFT, padding: 8 }}>
                <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: TEXT_SECONDARY, marginBottom: 3 }}>RECEIVED</Text>
                <View className="flex-row items-start">
                  <Calendar size={12} color={ACCENT} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 11, marginLeft: 4, flex: 1, color: INK }}>{params.estimatedAt || '—'}</Text>
                </View>
              </View>

              {params.durationHours ? (
                <View className="items-center justify-center" style={{ borderRadius: 12, backgroundColor: ACCENT, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Timer size={13} color="#fff" />
                  <Text className="text-white font-extrabold" style={{ fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {params.durationHours} Hr
                  </Text>
                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={1}>Duration</Text>
                </View>
              ) : null}

              <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: HAIR, backgroundColor: SOFT, padding: 8 }}>
                <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: TEXT_SECONDARY, marginBottom: 3 }}>READY BY</Text>
                <View className="flex-row items-start">
                  <Clock size={12} color={ACCENT} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 11, marginLeft: 4, flex: 1, color: INK }}>{params.estimatedDelivery || '—'}</Text>
                </View>
              </View>
            </View>
          </Card>

          {/* ── Customer approval — same `params.customerApproved` condition. ── */}
          {params.customerApproved ? (
            <View
              className="flex-row items-center"
              style={{ marginTop: 10, borderRadius: 16, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE, padding: 12 }}
            >
              <View className="items-center justify-center" style={{ height: 34, width: 34, borderRadius: 17, marginRight: 10, backgroundColor: ACCENT }}>
                <CircleCheck size={17} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-extrabold" style={{ fontSize: 13, color: INK }}>Customer Approval</Text>
                <Text style={{ fontSize: 11, color: PRIMARY, marginTop: 1 }}>You have approved the repair estimate.</Text>
              </View>
              <View className="rounded-full" style={{ paddingHorizontal: 9, paddingVertical: 4, backgroundColor: ACCENT }}>
                <Text className="text-white font-extrabold" style={{ fontSize: 10 }}>Approved</Text>
              </View>
            </View>
          ) : (
            <View
              className="flex-row items-center"
              style={{ marginTop: 10, borderRadius: 16, backgroundColor: CARD_BG, borderWidth: 1, borderColor: HAIR, padding: 12 }}
            >
              <View className="items-center justify-center" style={{ height: 32, width: 32, borderRadius: 16, marginRight: 10, backgroundColor: SOFT }}>
                <ShieldCheck size={16} color={TEXT_SECONDARY} />
              </View>
              <Text className="font-extrabold" style={{ flex: 1, fontSize: 12, color: INK }}>Customer Approval</Text>
              <View className="rounded-full" style={{ paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#FFF8E1' }}>
                <Text style={{ fontSize: 10, color: AMBER_TEXT, fontWeight: '800' }}>Pending</Text>
              </View>
            </View>
          )}

          {/* ── Device photos — 3-slot grid ───────────────────────── */}
          <Card>
            <SectionHeader
              icon={Camera}
              label="Device Files"
              subtitle={`Front + Back required · Coverage video optional${photoCount ? ` · ${photoCount}/3 added` : ''}`}
            />
            <View className="flex-row" style={{ gap: 8 }}>
              {SLOTS.map((slot) => {
                const url = photos[slot.key];
                const busy = uploading === slot.key;
                const SlotIcon = slot.icon;
                return (
                  <View key={slot.key} className="flex-1 items-center">
                    <Pressable
                      onPress={() => promptPick(slot)}
                      disabled={busy}
                      className="w-full items-center justify-center overflow-hidden"
                      style={{
                        height: rs(80),
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: url ? ACCENT : '#D6D6D6',
                        backgroundColor: url ? MINT : SOFT,
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator color={ACCENT} />
                      ) : url ? (
                        <>
                          {slot.isVideo ? (
                            <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(30,30,30,0.9)' }}>
                              <Video size={20} color="#fff" />
                              <Text className="text-white font-extrabold" style={{ fontSize: 9, marginTop: 3, letterSpacing: 1 }}>VIDEO</Text>
                            </View>
                          ) : (
                            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          )}
                          <Pressable
                            onPress={() => remove(slot.key)}
                            className="absolute items-center justify-center"
                            style={{ right: 5, top: 5, height: 22, width: 22, borderRadius: 11, backgroundColor: 'rgba(30,30,30,0.75)' }}
                          >
                            <X size={12} color="#fff" />
                          </Pressable>
                          <View
                            className="absolute flex-row items-center"
                            style={{ left: 5, bottom: 5, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: ACCENT }}
                          >
                            <CircleCheck size={9} color="#fff" />
                            <Text className="text-white font-extrabold" style={{ fontSize: 8, marginLeft: 2 }}>ADDED</Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View className="items-center justify-center" style={{ height: 32, width: 32, borderRadius: 11, backgroundColor: MINT }}>
                            <SlotIcon size={16} color={ACCENT} />
                          </View>
                          <View className="flex-row items-center" style={{ marginTop: 5 }}>
                            <Plus size={10} color={PRIMARY} />
                            <Text className="font-extrabold" style={{ fontSize: 10, marginLeft: 2, color: PRIMARY }}>Add</Text>
                          </View>
                        </>
                      )}
                    </Pressable>
                    <Text className="font-bold text-center" style={{ fontSize: 11, marginTop: 5, color: INK }} numberOfLines={2}>
                      {slot.label}
                      {slot.required ? <Text style={{ color: WARNING }}> *</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View className="flex-row items-start" style={{ marginTop: 10, borderRadius: 10, padding: 8, backgroundColor: SOFT }}>
              <Info size={12} color={ACCENT} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 10, marginLeft: 6, lineHeight: 14, color: TEXT_SECONDARY }}>
                Photos help the customer verify the device's condition before and after repair.
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Sticky bottom bar — a solid bar (never floats over the cards),
          with the photo hint above the CTA while it's needed. Same
          `requiredMissing` / `isReady` / `onContinue` gate as before. ── */}
      <View
        className="absolute left-0 right-0 bottom-0"
        style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: rs(14), paddingTop: 10, paddingBottom: insets.bottom + 10 }}
      >
        <View style={colStyle}>
          {requiredMissing.length > 0 ? (
            <View className="flex-row items-center" style={{ marginBottom: 8 }}>
              <Info size={13} color={PRIMARY} />
              <Text style={{ flex: 1, marginLeft: 6, fontSize: 11, fontWeight: '600', color: PRIMARY }}>
                Add Front Side and Back Side photos to continue.
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={onContinue}
            disabled={!isReady}
            className="active:opacity-90"
            style={{ borderRadius: 14, overflow: 'hidden', opacity: isReady ? 1 : 0.45 }}
          >
            <View
              style={{
                backgroundColor: ACCENT,
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text className="text-white font-extrabold" style={{ fontSize: 13 }}>
                Next: Device Security
              </Text>
              <ChevronRight size={17} color="#fff" style={{ marginLeft: 6 }} />
            </View>
          </Pressable>
          {!isReady && uploading ? (
            <Text className="text-center" style={{ fontSize: 10, marginTop: 6, color: TEXT_SECONDARY }}>
              Uploading photo… please wait.
            </Text>
          ) : null}
        </View>
      </View>
      <DeviceSecurityLockSheet
        visible={lockOpen}
        types={lockTypes}
        initialLock={lock || params.prefillLock}
        device={{
          imageUrl: params.imageUrl,
          modelName: params.modelName,
          ramLabel: params.ramLabel,
          storageLabel: params.storageLabel,
          deviceCategory: params.deviceCategory,
          specs: params.specs,
          color: params.color,
          modelNumber: params.modelNumber,
        }}
        onConfirm={onLockConfirm}
        onClose={() => setLockOpen(false)}
      />

    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function Card({ children }) {
  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: CARD_BG,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: HAIR,
        padding: 12,
        shadowColor: INK,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 10 }}>
      <View className="items-center justify-center" style={{ height: 28, width: 28, borderRadius: 9, marginRight: 9, backgroundColor: MINT }}>
        <Icon size={14} color={ACCENT} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-extrabold" style={{ fontSize: 13, color: INK }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 11, marginTop: 1, color: TEXT_SECONDARY }} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}
