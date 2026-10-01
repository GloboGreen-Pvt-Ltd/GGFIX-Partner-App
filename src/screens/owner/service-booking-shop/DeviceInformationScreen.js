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
import { LinearGradient } from 'expo-linear-gradient';
import { notify } from '../../../components/confirm';
import { uploadMedia } from '../../../api/masterData';
import DeviceSecurityLockSheet from './DeviceSecurityLockSheet';
import { rf, rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';

// One deep green for the whole screen, matching the rest of the booking flow.
//
// Explicit values, not `text-primary`/`bg-success` classes: those tokens DO point
// at #004C40 in tailwind.config.js, but NativeWind compiles its stylesheet at
// build time and the cached copy in this project still holds the old #087A0A —
// which is why the classes kept painting green. A value cannot go stale.
const ACCENT = '#004C40';       // Dark Green
const PRIMARY = '#006B57';      // Primary Green
const MINT = '#E8F7F2';
const SOFT_MINT = '#F2FBF7';
const PAGE_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_SECONDARY = '#667085';
const WARNING = '#E53935';
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

  const r = useResponsive();
  // Tablet / large-screen: cap the column and centre it, same convention as
  // the other booking-flow screens (ServicePriceEstimate, DeviceServices).
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      {/* ── White header — matches app's other white headers ─────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + rs(10), paddingBottom: rs(14), paddingHorizontal: rs(16), borderBottomWidth: 1, borderBottomColor: BORDER }}
      >
        <View className="relative flex-row items-center justify-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute left-0 items-center justify-center active:opacity-70"
            style={{ height: rs(38), width: rs(38), borderRadius: rs(19), backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: BORDER }}
          >
            <ArrowLeft size={19} color="#172117" />
          </Pressable>

          <View className="items-center px-12">
            <Text
              className="text-text font-bold text-center"
              style={{ fontSize: 14 }}
              numberOfLines={1}
            >
              Device Information
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 0, paddingBottom: rs(160) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Device hero — brand label + model + specs, compact mint chips
            (same real data as before), plus a static trust strip. ───────── */}
        <View className="px-4" style={{ marginTop: rs(14) }}>
          <View style={colStyle}>
            <LinearGradient
              colors={['#EAF7F1', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: rs(22),
                padding: rs(16),
                borderWidth: 1,
                borderColor: BORDER,
                shadowColor: '#0B1F14',
                shadowOpacity: 0.06,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 3,
              }}
            >
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center overflow-hidden mr-3.5"
                  style={{ height: rs(84), width: rs(84), borderRadius: rs(18), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ACCENT_10 }}
                >
                  {params.imageUrl ? (
                    <Image source={{ uri: params.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Smartphone size={34} color={ACCENT} />
                  )}
                </View>
                <View className="flex-1">
                  {params.brandName ? (
                    <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: PRIMARY, marginBottom: 2 }} numberOfLines={1}>
                      {String(params.brandName).toUpperCase()}
                    </Text>
                  ) : null}
                  <Text className="font-extrabold text-text" style={{ fontSize: 15 }} numberOfLines={2}>
                    {params.modelName || 'Device'}
                  </Text>
                  <Text className="text-text-muted" style={{ fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {[params.ramLabel, params.storageLabel, params.color].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>

              {/* Chips — same real data as before (modelNumber / service
                  count / total), restyled into compact pills. */}
              <View className="flex-row items-center flex-wrap" style={{ gap: rs(6), marginTop: rs(12) }}>
                {params.modelNumber ? (
                  <View
                    className="flex-row items-center rounded-full"
                    style={{ paddingHorizontal: rs(9), paddingVertical: rs(5), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ACCENT_10 }}
                  >
                    <Hash size={10} color={ACCENT} />
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: ACCENT, marginLeft: 3 }}>
                      {params.modelNumber}
                    </Text>
                  </View>
                ) : null}
                <View
                  className="flex-row items-center rounded-full"
                  style={{ paddingHorizontal: rs(9), paddingVertical: rs(5), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ACCENT_10 }}
                >
                  <ReceiptText size={10} color={ACCENT} />
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: ACCENT, marginLeft: 3 }}>
                    {services.length} service{services.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <View className="rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(5), backgroundColor: ACCENT }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#fff' }}>
                    ₹{formatINR(total)}
                  </Text>
                </View>
              </View>

              {/* Trust strip — static/presentational only, no data behind it. */}
              <View
                className="flex-row items-center"
                style={{ marginTop: rs(12), paddingTop: rs(10), borderTopWidth: 1, borderTopColor: BORDER }}
              >
                <View
                  className="items-center justify-center mr-2.5"
                  style={{ height: rs(30), width: rs(30), borderRadius: rs(10), backgroundColor: '#FFFFFF' }}
                >
                  <ShieldCheck size={15} color={ACCENT} />
                </View>
                <Text className="flex-1" style={{ fontSize: 10.5, fontWeight: '600', color: TEXT_SECONDARY }} numberOfLines={1}>
                  In Safe Hands · Genuine Parts · Trusted Service
                </Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* ── Price summary ────────────────────────────────────────── */}
        <View className="px-4" style={{ marginTop: rs(12) }}>
          <View style={colStyle}>
            <Card>
              <SectionHeader icon={ReceiptText} label="Price Summary" subtitle="Service details and estimated cost" />
              {services.map((s, i) => (
                <View key={i} className="flex-row items-center" style={{ marginBottom: rs(10) }}>
                  <View
                    className="items-center justify-center mr-2.5"
                    style={{ height: rs(24), width: rs(24), borderRadius: rs(8), backgroundColor: MINT }}
                  >
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: ACCENT }}>{i + 1}</Text>
                  </View>
                  <Text className="flex-1 text-text" style={{ fontSize: 13 }} numberOfLines={1}>{s.serviceName}</Text>
                  <Text className="text-text font-extrabold" style={{ fontSize: 13 }}>₹{formatINR(s.price)}</Text>
                </View>
              ))}
              <View
                className="flex-row items-center"
                style={{ marginTop: rs(4), borderRadius: rs(12), paddingHorizontal: rs(12), paddingVertical: rs(10), backgroundColor: MINT }}
              >
                <Text className="flex-1 text-text font-extrabold" style={{ fontSize: 13 }}>Estimated Repair Amount</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: ACCENT }}>₹{formatINR(total)}</Text>
              </View>
            </Card>
          </View>
        </View>

        {/* ── Complaint summary + voice-note playback ───────────────── */}
        <View className="px-4" style={{ marginTop: rs(12) }}>
          <View style={colStyle}>
            <Card>
              <SectionHeader icon={MessageSquareText} label="Complaint Issue" subtitle="What seems to be the problem?" />
              <View style={{ borderRadius: rs(14), backgroundColor: SOFT_MINT, padding: rs(12) }}>
                <Text className="text-text" style={{ fontSize: 13, lineHeight: rf(19) }}>
                  {params.complaint || (issueAudioUrl ? 'See voice note below.' : 'No issue described.')}
                </Text>
              </View>

              {issueAudioUrl ? (
                <View
                  className="flex-row items-center"
                  style={{ marginTop: rs(12), borderRadius: rs(16), padding: rs(10), backgroundColor: ACCENT_10, borderWidth: 1, borderColor: ACCENT_35 }}
                >
                  <Pressable
                    onPress={toggleIssuePlayback}
                    className="items-center justify-center active:opacity-80"
                    style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: ACCENT }}
                    accessibilityRole="button"
                    accessibilityLabel={isPlayingIssue ? 'Pause voice note' : 'Play voice note'}
                  >
                    {isPlayingIssue ? (
                      <Pause size={16} color="#fff" fill="#fff" />
                    ) : (
                      <Play size={16} color="#fff" fill="#fff" />
                    )}
                  </Pressable>
                  <View className="flex-1" style={{ marginLeft: rs(10) }}>
                    <View className="flex-row items-center">
                      <Mic size={12} color={ACCENT} />
                      <Text className="text-text font-extrabold" style={{ fontSize: 12.5, marginLeft: rs(6) }}>
                        Customer's voice note
                      </Text>
                    </View>
                    <Text className="text-text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {isPlayingIssue ? 'Playing…' : 'Tap to play'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Card>
          </View>
        </View>

        {/* ── Timeline card — Received / Duration / Ready By, connected by
            a dotted progress track. The centre "Duration" node only renders
            when `durationHours` is actually present on params (it's passed
            from ServicePriceEstimateScreen's `effectiveHours`) — no invented
            number is shown when it isn't. ─────────────────────────────────── */}
        <View className="px-4" style={{ marginTop: rs(12) }}>
          <View style={colStyle}>
            <Card>
              <SectionHeader icon={Timer} label="Repair Timeline" subtitle="Track your device repair progress" />
              <View className="flex-row items-center">
                <View style={{ flex: 1 }}>
                  <View style={{ borderRadius: rs(14), borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT_MINT, padding: rs(10) }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, color: TEXT_SECONDARY, marginBottom: rs(4) }}>
                      RECEIVED
                    </Text>
                    <View className="flex-row items-center">
                      <Calendar size={13} color={ACCENT} />
                      <Text className="text-text" style={{ fontSize: 11, marginLeft: rs(5), flex: 1 }} numberOfLines={2}>
                        {params.estimatedAt || '—'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Connector: dot — dashed line, reading as a small progress
                    track between the timeline blocks. */}
                <View className="items-center" style={{ width: rs(22) }}>
                  <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: ACCENT }} />
                  <View style={{ flex: 1, minHeight: rs(20), width: 1, borderLeftWidth: 1, borderLeftColor: ACCENT_35, borderStyle: 'dashed', marginVertical: 2 }} />
                </View>

                {params.durationHours ? (
                  <>
                    <View
                      className="items-center"
                      style={{ borderRadius: rs(14), backgroundColor: ACCENT, paddingHorizontal: rs(10), paddingVertical: rs(10) }}
                    >
                      <Timer size={14} color="#fff" />
                      <Text className="text-white font-extrabold" style={{ fontSize: 12, marginTop: rs(3) }} numberOfLines={1}>
                        {params.durationHours} Hr
                      </Text>
                      <Text style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={1}>
                        Duration
                      </Text>
                    </View>
                    <View className="items-center" style={{ width: rs(22) }}>
                      <View style={{ flex: 1, minHeight: rs(20), width: 1, borderLeftWidth: 1, borderLeftColor: ACCENT_35, borderStyle: 'dashed', marginVertical: 2 }} />
                      <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: ACCENT_35 }} />
                    </View>
                  </>
                ) : null}

                <View style={{ flex: 1 }}>
                  <View style={{ borderRadius: rs(14), borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT_MINT, padding: rs(10) }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5, color: TEXT_SECONDARY, marginBottom: rs(4) }}>
                      READY BY
                    </Text>
                    <View className="flex-row items-center">
                      <Clock size={13} color={ACCENT} />
                      <Text className="text-text" style={{ fontSize: 11, marginLeft: rs(5), flex: 1 }} numberOfLines={2}>
                        {params.estimatedDelivery || '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        </View>

        {/* ── Customer approval — its own banner, still driven by the exact
            same `params.customerApproved` condition as before (not
            hardcoded); pending state uses the existing data too. ─────────── */}
        <View className="px-4" style={{ marginTop: rs(12) }}>
          <View style={colStyle}>
            {params.customerApproved ? (
              <View
                className="flex-row items-center"
                style={{ borderRadius: rs(20), backgroundColor: MINT, borderWidth: 1, borderColor: ACCENT_35, padding: rs(16) }}
              >
                <View
                  className="items-center justify-center mr-3"
                  style={{ height: rs(46), width: rs(46), borderRadius: rs(23), backgroundColor: ACCENT }}
                >
                  <CircleCheck size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="font-extrabold" style={{ fontSize: 13, color: ACCENT }}>Customer Approval</Text>
                  <Text style={{ fontSize: 11.5, color: ACCENT, marginTop: 2 }}>
                    You have approved the repair estimate.
                  </Text>
                </View>
                <View className="rounded-full" style={{ paddingHorizontal: rs(11), paddingVertical: rs(6), backgroundColor: ACCENT }}>
                  <Text className="text-white font-extrabold" style={{ fontSize: 11 }}>Approved</Text>
                </View>
              </View>
            ) : (
              <View
                className="flex-row items-center"
                style={{ borderRadius: rs(18), backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, padding: rs(14) }}
              >
                <View
                  className="items-center justify-center mr-3"
                  style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: '#F4F7F5' }}
                >
                  <ShieldCheck size={18} color="#8FA08F" />
                </View>
                <Text className="flex-1 text-text font-extrabold" style={{ fontSize: 12.5 }}>Customer Approval</Text>
                {/* #F59E0B measured 2.15:1 on this row's white fill; #B45309
                    is the palette's amber-700 and measures 5.02:1. */}
                <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '700' }}>Pending</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Device photos — 3-slot grid ──────────────────────────────── */}
        <View className="px-4" style={{ marginTop: rs(12) }}>
          <View style={colStyle}>
            <Card>
              <SectionHeader
                icon={Camera}
                label="Device Files"
                subtitle={`Front + Back required · Coverage video optional${photoCount ? ` · ${photoCount}/3 added` : ''}`}
              />
              <View className="flex-row" style={{ gap: rs(8) }}>
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
                          height: rs(108),
                          borderRadius: rs(16),
                          borderWidth: 2,
                          borderStyle: 'dashed',
                          borderColor: url ? ACCENT : '#CBD5CB',
                          backgroundColor: url ? ACCENT_06 : SOFT_MINT,
                        }}
                      >
                        {busy ? (
                          <ActivityIndicator color={ACCENT} />
                        ) : url ? (
                          <>
                            {slot.isVideo ? (
                              <View className="absolute inset-0 bg-text/90 items-center justify-center">
                                <Video size={24} color="#fff" />
                                <Text className="text-white font-extrabold" style={{ fontSize: 9, marginTop: rs(4), letterSpacing: 1 }}>VIDEO</Text>
                              </View>
                            ) : (
                              <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            )}
                            <Pressable
                              onPress={() => remove(slot.key)}
                              className="absolute items-center justify-center"
                              style={{ right: rs(6), top: rs(6), height: rs(24), width: rs(24), borderRadius: rs(12), backgroundColor: 'rgba(23, 33, 23, 0.75)' }}
                            >
                              <X size={13} color="#fff" />
                            </Pressable>
                            <View
                              className="absolute flex-row items-center"
                              style={{ left: rs(6), bottom: rs(6), borderRadius: rs(999), paddingHorizontal: rs(6), paddingVertical: rs(3), backgroundColor: ACCENT }}
                            >
                              <CircleCheck size={10} color="#fff" />
                              <Text className="text-white font-extrabold" style={{ fontSize: 8, marginLeft: 2 }}>ADDED</Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <View
                              className="items-center justify-center"
                              style={{ height: rs(40), width: rs(40), borderRadius: rs(13), backgroundColor: MINT }}
                            >
                              <SlotIcon size={19} color={ACCENT} />
                            </View>
                            <View className="flex-row items-center" style={{ marginTop: rs(7) }}>
                              <Plus size={11} color={ACCENT} />
                              <Text className="font-extrabold" style={{ fontSize: 10.5, marginLeft: 2, color: ACCENT }}>Add</Text>
                            </View>
                          </>
                        )}
                      </Pressable>
                      <Text className="text-text font-bold text-center" style={{ fontSize: 10.5, marginTop: rs(6) }} numberOfLines={2}>
                        {slot.label}
                        {slot.required ? <Text style={{ color: WARNING }}> *</Text> : null}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Info strip — same message as before, restyled into a soft
                  mint box. */}
              <View
                className="flex-row items-start"
                style={{ marginTop: rs(12), borderRadius: rs(12), padding: rs(10), backgroundColor: SOFT_MINT }}
              >
                <Info size={13} color={ACCENT} style={{ marginTop: 1 }} />
                <Text className="text-text-muted flex-1" style={{ fontSize: 10.5, marginLeft: rs(7), lineHeight: rf(15) }}>
                  Photos help the customer verify the device's condition before and after repair.
                </Text>
              </View>
            </Card>
          </View>
        </View>

      </ScrollView>

      {/* ── Sticky bottom action — warning card (only while photos are
          missing) stacked above the CTA, full width on any phone size so
          neither the message nor the button label ever clips. Same
          `requiredMissing`/`isReady`/`onContinue` as before — only how they
          render changed. ─────────────────────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + rs(4), paddingHorizontal: rs(16) }}
      >
        <View style={colStyle}>
          {/* Neutral mint state, not a red alert — the underlying gate is
              still exactly `requiredMissing.length > 0` / `isReady` below;
              only the presentation changed (was a full-width red warning
              card). */}
          {requiredMissing.length > 0 ? (
            <View
              className="flex-row items-center"
              style={{ marginBottom: rs(8), borderRadius: rs(16), backgroundColor: MINT, borderWidth: 1, borderColor: BORDER, padding: rs(11) }}
            >
              <View
                className="items-center justify-center mr-2.5"
                style={{ height: rs(32), width: rs(32), borderRadius: rs(11), backgroundColor: '#FFFFFF' }}
              >
                <Info size={16} color={ACCENT} />
              </View>
              <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '600', color: ACCENT }}>
                Add Front Side and Back Side photos to continue.
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={onContinue}
            disabled={!isReady}
            className="active:opacity-90"
            style={{
              borderRadius: rs(18),
              overflow: 'hidden',
              opacity: isReady ? 1 : 0.6,
            }}
          >
            <View
              style={{
                backgroundColor: isReady ? ACCENT : '#8FA08F',
                paddingHorizontal: rs(16),
                paddingVertical: rs(14),
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text className="text-white font-extrabold" style={{ fontSize: 14 }}>
                Next: Device Security
              </Text>
              <ChevronRight size={18} color="#fff" style={{ marginLeft: rs(6) }} />
            </View>
          </Pressable>
          {!isReady && uploading ? (
            <Text className="text-text-muted text-center" style={{ fontSize: 10.5, marginTop: rs(8) }}>
              Uploading photo… please wait.
            </Text>
          ) : null}
        </View>
      </View>
      <DeviceSecurityLockSheet
        visible={lockOpen}
        initialLock={lock || params.prefillLock}
        device={{
          imageUrl: params.imageUrl,
          modelName: params.modelName,
          ramLabel: params.ramLabel,
          storageLabel: params.storageLabel,
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
        backgroundColor: CARD_BG,
        borderRadius: rs(20),
        borderWidth: 1,
        borderColor: BORDER,
        padding: rs(16),
        shadowColor: '#0B1F14',
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: rs(12) }}>
      <View
        className="items-center justify-center mr-3"
        style={{ height: rs(38), width: rs(38), borderRadius: rs(12), backgroundColor: MINT }}
      >
        <Icon size={17} color={ACCENT} />
      </View>
      <View className="flex-1">
        <Text className="text-text font-bold" style={{ fontSize: 13 }}>{label}</Text>
        {subtitle ? (
          <Text className="text-text-muted" style={{ fontSize: 11, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}
