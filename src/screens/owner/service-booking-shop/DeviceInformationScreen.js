import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Image,
  Alert,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../../../components/dashboard/theme';
import {
  Smartphone,
  ReceiptText,
  IndianRupee,
  UserCheck,
  MessageSquareText,
  Timer,
  Calendar,
  Clock,
  CircleCheck,
  Video,
  Image as ImageIcon,
  ChevronRight,
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
const ACCENT = '#035C6C';       // GGFIX green — fills, icons, selected
const PRIMARY = '#035C6C';      // deeper green — green TEXT on white / mint
const MINT = '#E5F3F5';         // light green tint
const MINT_LINE = '#C7E6EA';    // its border
const PAGE_BG = '#F3F4F6';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const HAIR = '#F3F4F6';         // card hairline on the grey page
const INK = '#111111';
const TEXT_SECONDARY = '#6B7280';
const AMBER_TEXT = '#8A6A00';
const AMBER_BG = '#FFF8E1';      // pending pill
const AMBER_LINE = '#F5E3A3';

// Front and Back are REQUIRED — without them the technician can't prove the
// device's pre-repair state. The coverage video is optional but encouraged.
const SLOTS = [
  { key: 'front', label: 'Front Side', isVideo: false, icon: ImageIcon, required: true },
  { key: 'back',  label: 'Back Side',  isVideo: false, icon: ImageIcon, required: true },
  { key: 'video', label: 'Full Coverage', isVideo: true, icon: Video, required: false },
];

// master-data /media/upload limit (spring multipart max-file-size: 10MB).
const MAX_UPLOAD_MB = 10;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const tooLargeMsg = (slot, bytes) =>
  `${bytes ? `This file is ${(bytes / 1048576).toFixed(1)} MB. ` : ''}The limit is ${MAX_UPLOAD_MB} MB. `
  + (slot.isVideo ? 'Record a shorter clip (about 5–8 seconds) and try again.' : 'Choose a smaller photo and try again.');

/** Long enough for ResponsiveModal's slide-out to finish before the next present. */
const HANDOFF_MS = 320;

const formatINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function DeviceInformationScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const baseServices = params.services || [];
  // Each service's estimate is typed here (master prices are often 0): kept as
  // text while editing, handed on as `services[].price` — the same field the
  // devices list sums into the booking's estimatedPrice and line amounts.
  const [prices, setPrices] = useState(() => baseServices.map((s) => {
    const n = Math.round(Number(s.price) || 0);
    return n > 0 ? String(n) : '';
  }));
  const services = baseServices.map((s, i) => ({ ...s, price: Number(prices[i]) || 0 }));
  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const setPrice = (i, text) => setPrices((p) => {
    const next = [...p];
    next[i] = String(text || '').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    return next;
  });

  const [photos, setPhotos] = useState(() => {
    // Taken on Device & Service Details now; this screen just passes them on.
    const p = params.devicePhotos || params.prefillDevicePhotos;
    return p && typeof p === 'object' ? { ...p } : {};
  }); // { front: url, back: url, video: url }
  const [uploading, setUploading] = useState(null);
  // Device Security Lock is a popup on this screen; the lock it returns is
  // held here and handed on to Missing Parts.
  const [lockOpen, setLockOpen] = useState(false);
  // Price Summary "View Details" — shows each service's warranty.
  const [showPriceDetails, setShowPriceDetails] = useState(false);
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
      const what = fromCamera ? 'Camera' : slot.isVideo ? 'Videos' : 'Photos';
      const attach = slot.isVideo ? 'record or attach the coverage video' : 'attach photos';
      if (perm.canAskAgain === false && Platform.OS !== 'web') {
        // After "Don't allow" Android stops showing the Allow / Don't allow
        // dialog, so the only way back is this app's Settings page.
        Alert.alert(`${what} access is off`, `Turn on ${what.toLowerCase()} access for this app in Settings to ${attach}.`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      } else {
        notify('Permission needed', `Allow ${what.toLowerCase()} access to ${attach}.`);
      }
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
        // Shorter + medium quality keeps a coverage clip under the server's
        // upload limit (Android honours only the duration).
        videoMaxDuration: 15,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Check before uploading: an over-limit file used to fail mid-upload
      // with a raw server error.
      if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) {
        notify(slot.isVideo ? 'Video too large' : 'Photo too large', tooLargeMsg(slot, asset.fileSize));
        return;
      }
      setUploading(slot.key);
      // 'repair' routes the file to S3 under media.ggfix.in/Devicefiles/, and the
      // slot becomes the filename stem (front-…, back-…, video-…).
      const url = await uploadMedia(asset, 'repair', { slot: slot.key });
      if (!url) throw new Error('Upload returned no URL');
      setPhotos((m) => ({ ...m, [slot.key]: url }));
    } catch (e) {
      const tooBig = e?.status === 413 || /too large|maximum upload size|exceed/i.test(e?.message || '');
      notify('Upload failed', tooBig ? tooLargeMsg(slot) : (e?.message || 'Try again'));
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
  const specCategory = resolveSpecCategory(params.deviceCategory, params.categoryCode, params.categoryName);
  const lockTypes = lockTypesFor(specCategory);
  // Missing / damaged parts is a Mobile-only step (unknown category keeps it);
  // every other category goes straight to the devices list with none flagged.
  const needsMissingParts = !specCategory || specCategory === 'MOBILE';
  const goNext = (extra) => navigation.navigate(
    needsMissingParts ? 'DeviceMissingParts' : 'ServiceBookingDevicesList',
    { ...params, services, devicePhotos: photos, ...extra, ...(needsMissingParts ? null : { missingParts: [] }) },
  );

  // Next opens the Device Security Lock popup; its Continue advances the flow.
  // Without a lock step the booking goes straight on, recorded as no lock.
  const onContinue = () => {
    if (lockTypes.length === 0) {
      goNext({ lock: { type: 'NONE', value: '' } });
      return;
    }
    // Lock already captured on Device & Service Details — don't ask again.
    if (params.lock?.type) {
      goNext();
      return;
    }
    setLockOpen(true);
  };

  // Closing one RN Modal and navigating in the same tick is unreliable on iOS,
  // so wait out the sheet's slide-out before moving on.
  const onLockConfirm = (nextLock) => {
    setLock(nextLock);
    setLockOpen(false);
    if (handoffRef.current) clearTimeout(handoffRef.current);
    handoffRef.current = setTimeout(() => {
      goNext({ lock: nextLock });
    }, HANDOFF_MS);
  };

  // Continue is allowed only when ALL required slots have a photo AND no
  // upload is in flight. The coverage video remains optional.
  const requiredKeys = SLOTS.filter((s) => s.required).map((s) => s.key);
  // Photos moved to Device & Service Details and are optional — nothing required here.
  const requiredMissing = [];
  const isReady = !uploading && requiredMissing.length === 0;
  const photoCount = Object.keys(photos).length;

  const r = useResponsive();
  // Tablet / large-screen: cap the column and centre it, same convention as
  // the other booking-flow screens.
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 720), alignSelf: 'center' } : null;
  // Colour · storage · model number on one line.
  const specLine = [...specDisplayParts(params, { withColor: true }), params.modelNumber].filter(Boolean).join(' · ');

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      {/* ── Header — same design as Personal Information ─────────── */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + rs(8), paddingBottom: rs(12), paddingHorizontal: rs(16), borderBottomWidth: 1, borderBottomColor: '#C7E6EA' }}
      >
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, colStyle]}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [{
              width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#C7E6EA',
            }, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="chevron-back" size={19} color="#111111" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: rs(8) }}>
            <Text style={{ color: '#111111', fontSize: T.headline, fontWeight: '800' }} numberOfLines={1}>
              Device Information
            </Text>
            <Text style={{ color: '#6B7280', fontSize: T.caption2, marginTop: rs(2) }} numberOfLines={1}>
              Review the booking before repair
            </Text>
          </View>
          <View style={{ width: rs(36) }} />
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

          </View>

          {/* ── Booking summary — price, complaint and repair timeline in ONE
              card, split by thin dividers (was three separate cards). ── */}
          <Card>
            <SectionHeader icon={ReceiptText} label="Booking Summary" subtitle="Price, complaint and repair timeline" />

            <View style={{ ...DIVIDER, marginTop: 2 }} />

            {/* Price — label · amount rows on dashed lines, then the total. */}
            <SubHead
              icon={IndianRupee}
              label="Price Summary"
              right={services.some((s) => warrantyLabel(s.warranty)) ? (
                // View Details reveals each service's warranty — only when one has it.
                <Pressable
                  onPress={() => setShowPriceDetails((v) => !v)}
                  hitSlop={6}
                  className="active:opacity-80"
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: MINT }}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: PRIMARY }}>{showPriceDetails ? 'Hide Details' : 'View Details'}</Text>
                </Pressable>
              ) : null}
            />
            <View style={{ marginLeft: SUB_INDENT }}>
            {services.map((s, i) => (
              <View key={i}>
                <PriceInputRow
                  label={s.serviceName}
                  value={prices[i] ?? ''}
                  onChangeText={(t) => setPrice(i, t)}
                />
                {showPriceDetails && warrantyLabel(s.warranty) ? (
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: -4, marginBottom: 6 }}>{warrantyLabel(s.warranty)} warranty</Text>
                ) : null}
                <DashedLine />
              </View>
            ))}
            <PriceRow label="Estimated Repair Price" value={`₹${formatINR(total)}`} total />
            </View>

            <View style={DIVIDER} />

            {/* Complaint issue + voice-note playback */}
            <SubHead icon={MessageSquareText} label="Complaint Issue" />
            <View style={{ marginLeft: SUB_INDENT }}>
            <Text style={{ fontSize: 13, lineHeight: 18, color: INK, paddingVertical: 4 }}>
              {params.complaint || (issueAudioUrl ? 'See voice note below.' : 'No issue described.')}
            </Text>
            {issueAudioUrl ? (
              <Pressable
                onPress={toggleIssuePlayback}
                className="flex-row items-center active:opacity-80"
                style={{ marginTop: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isPlayingIssue ? 'Pause voice note' : 'Play voice note'}
              >
                <View className="items-center justify-center" style={{ height: rs(28), width: rs(28), borderRadius: rs(14), backgroundColor: ACCENT }}>
                  {isPlayingIssue ? (
                    <Pause size={rs(12)} color="#fff" fill="#fff" />
                  ) : (
                    <Play size={rs(12)} color="#fff" fill="#fff" />
                  )}
                </View>
                <Text className="font-extrabold" style={{ fontSize: 12, marginLeft: 8, color: INK }}>Customer's voice note</Text>
                <Text style={{ fontSize: 11, marginLeft: 6, color: TEXT_SECONDARY }}>
                  {isPlayingIssue ? 'Playing…' : 'Tap to play'}
                </Text>
              </Pressable>
            ) : null}
            </View>

            <View style={DIVIDER} />

            {/* Repair timeline — Estimated Duration only when `durationHours` is on params. */}
            <SubHead icon={Timer} label="Repair Timeline" />
            <View style={{ marginLeft: SUB_INDENT }}>
            <TimelineRow label="Received" icon={Calendar} value={formatStamp(params.estimatedReadyIso) || params.estimatedAt || '—'} />
            {params.durationHours ? (
              <TimelineRow
                label="Est. Time"
                icon={Clock}
                value={`${params.durationHours} Hour${Number(params.durationHours) === 1 ? '' : 's'}`}
              />
            ) : null}
            <TimelineRow label="Ready By" icon={Calendar} value={formatStamp(params.estimatedDeliveryIso) || params.estimatedDelivery || '—'} />
            </View>
          </Card>

          {/* ── Customer approval — same `params.customerApproved` condition. ── */}
          <Card>
            <IconBlock
              icon={UserCheck}
              title="Customer Booking Approval"
              center
              right={(
                // Status as an icon only — the line under the title says it in words.
                <View
                  className="items-center justify-center"
                  accessible
                  accessibilityLabel={params.customerApproved ? 'Approved' : 'Pending'}
                  style={{
                    marginLeft: 8, height: rs(32), width: rs(32), borderRadius: rs(16), borderWidth: 1,
                    backgroundColor: params.customerApproved ? MINT : AMBER_BG,
                    borderColor: params.customerApproved ? MINT_LINE : AMBER_LINE,
                  }}
                >
                  {params.customerApproved
                    ? <CircleCheck size={rs(18)} color="#FFFFFF" fill={ACCENT} />
                    : <Clock size={rs(16)} color={AMBER_TEXT} />}
                </View>
              )}
            >
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }}>
                {params.customerApproved ? 'Customer approves repair, cost & time.' : 'Waiting for the customer to approve.'}
              </Text>
            </IconBlock>
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

// One badge size for every summary card's icon, so they line up.
const BADGE = rs(36);
const BADGE_ICON = rs(17);

// "3" / "3 Months" → "3 Months"; null when the service has no warranty.
function warrantyLabel(w) {
  const n = parseInt(String(w ?? '').match(/(\d+)/)?.[1], 10);
  return n > 0 ? `${n} Month${n === 1 ? '' : 's'}` : null;
}

// Thin divider between the sections of the Booking Summary card.
const DIVIDER = { height: 1, backgroundColor: BORDER, marginVertical: 14 };

// A service's price line with the amount typed in: label left, a small ₹ box
// right (whole rupees). The total below re-adds as it is typed.
function PriceInputRow({ label, value, onChangeText }) {
  return (
    <View className="flex-row items-center" style={{ paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontSize: 13, color: INK }}>{label}</Text>
      <View
        className="flex-row items-center"
        style={{ marginLeft: 8, minWidth: 104, height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: MINT_LINE, backgroundColor: '#FFFFFF' }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: PRIMARY }}>₹</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={7}
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={`${label} estimate amount`}
          style={{ flex: 1, marginLeft: 4, paddingVertical: 0, fontSize: 13, fontWeight: '600', color: INK, textAlign: 'right' }}
        />
      </View>
    </View>
  );
}

// Price list line (reference design): label left, amount right; the total
// row is bold and a size up.
function PriceRow({ label, value, total }) {
  return (
    <View className="flex-row items-center" style={{ paddingVertical: total ? 10 : 9 }}>
      <Text style={{ flex: 1, fontSize: total ? 15 : 13, fontWeight: total ? '800' : '400', color: INK }}>{label}</Text>
      <Text style={{ fontSize: total ? 16 : 13, fontWeight: total ? '800' : '500', color: INK, marginLeft: 8, textAlign: 'right', flexShrink: 1 }}>{value}</Text>
    </View>
  );
}

// Dashed rule between price rows. A zero-height dashed box clipped to its top
// edge — a one-sided dashed border doesn't render reliably on Android.
function DashedLine() {
  return (
    <View style={{ height: 1, overflow: 'hidden' }}>
      <View style={{ height: 2, borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 1 }} />
    </View>
  );
}

// One icon size for EVERY Booking Summary heading (card header + sections).
const SUB_BADGE = rs(25);
const SUB_ICON = rs(13);
// Section content starts where the heading TEXT starts (badge + its 8pt gap).
const SUB_INDENT = SUB_BADGE + 8;

// Section heading inside the Booking Summary card: small mint icon + title,
// optional `right` action.
function SubHead({ icon: Icon, label, right }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 6 }}>
      <View className="items-center justify-center" style={{ height: SUB_BADGE, width: SUB_BADGE, borderRadius: SUB_BADGE / 2, backgroundColor: MINT }}>
        <Icon size={SUB_ICON} color={ACCENT} />
      </View>
      <Text className="font-extrabold" style={{ flex: 1, fontSize: 13, color: INK, marginLeft: 8 }}>{label}</Text>
      {right}
    </View>
  );
}

// "Thu, 15 Oct 2025 3:02 PM" — the Repair Timeline date format.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatStamp(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

// Repair Timeline line: grey label, then an icon + value in a second column.
function TimelineRow({ label, icon: Icon, value }) {
  return (
    <View className="flex-row items-center" style={{ paddingVertical: 5 }}>
      <Text style={{ width: '42%', fontSize: 13, color: TEXT_SECONDARY }} numberOfLines={1}>{label}</Text>
      <Icon size={rs(14)} color={TEXT_SECONDARY} style={{ marginLeft: -7 }} />
      <Text style={{ flex: 1, marginLeft: 6, fontSize: 13, fontWeight: '500', color: INK }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
  );
}

// Summary card heading: mint circle icon, bold title, body under the title,
// optional `right` element (e.g. the approval pill).
function IconBlock({ icon: Icon, title, right, center, children }) {
  return (
    <View className={center ? 'flex-row items-center' : 'flex-row items-start'}>
      <View className="items-center justify-center" style={{ height: BADGE, width: BADGE, borderRadius: BADGE / 2, backgroundColor: MINT }}>
        <Icon size={BADGE_ICON} color={ACCENT} />
      </View>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <Text className="font-extrabold" style={{ fontSize: 12, color: INK }}>{title}</Text>
        {children}
      </View>
      {right}
    </View>
  );
}

function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 10 }}>
      <View className="items-center justify-center" style={{ height: SUB_BADGE, width: SUB_BADGE, borderRadius: SUB_BADGE / 2, marginRight: 8, backgroundColor: MINT }}>
        <Icon size={SUB_ICON} color={ACCENT} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-extrabold" style={{ fontSize: 14, color: INK }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 11, marginTop: 1, color: TEXT_SECONDARY }} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}
