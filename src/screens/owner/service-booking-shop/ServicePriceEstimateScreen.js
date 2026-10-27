import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, View, Text, TextInput, Pressable, Image, StatusBar } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { T } from '../../../components/dashboard/theme';
import { RecordingPresets, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import {
  Hash,
  ScanLine,
  ArrowLeft,
  ArrowRight,
  Barcode,
  CircleCheck,
  Circle,
  ChevronRight,
  ChevronDown,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Eraser,
  Pencil,
  Plus,
  User,
  Smartphone,
  Clock,
} from 'lucide-react-native';
import RepairIssuesPicker, { SERVICE_CHARGE_CODE } from './RepairIssuesPicker';
import { StepProgress } from './BookingSteps';
import { deviceFromParams } from './ServiceBookingDevicesListScreen';
import DeviceSecurityLockSheet from './DeviceSecurityLockSheet';
import MissingPartsChecklist, { seedMissingParts, flaggedMissingParts } from './MissingPartsChecklist';
import { notify } from '../../../components/confirm';
import { ResponsiveModal } from '../../../components/responsive';
import ImageViewerModal from '../../../components/ImageViewerModal';
import { MaterialDatePicker, MaterialTimePicker } from '../../../components/MaterialPickers';
import { useResponsive } from '../../../theme/responsive';
import { rf, rs } from '../../../utils/responsive';
import { uploadMedia } from '../../../api/masterData';
import { lockTypesFor, resolveSpecCategory } from '../../../utils/deviceSpecs';
import { useImeiApplies } from '../../../utils/imeiPolicy';

/**
 * Service Price & Issue Estimate.
 *
 * Laid out from the supplied reference: sectioned cards on a white page, each
 * section introduced by an icon + uppercase label + a hairline rule, and a
 * split footer (total on the left, Continue pill on the right) rather than one
 * full-bleed bar.
 *
 * GGFIX palette: #035C6C for fills / icons / selected states, #035C6C for green
 * TEXT on white or mint (so it stays legible), #E5F3F5 tints with a #C7E6EA edge,
 * on a #F3F4F6 page with compact white cards.
 */
const ACCENT = '#035C6C';       // fills, icons, selected
const ACCENT_TEXT = '#035C6C';  // green text on white / mint
const ACCENT_08 = '#E5F3F5';    // light green tint
const ACCENT_30 = '#C7E6EA';    // light green border

const INK = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';
const RED_TEXT = '#D63232';

const PAGE_BG = '#F3F4F6';
const SCREEN_BG = '#FFFFFF';   // card / input / sheet white
const MINT = '#E5F3F5';
const SOFT = '#F3F4F6';

// Header — same values as OwnerPersonalInfoScreen's header.
const HEADER_BORDER = '#C7E6EA';
const HEADER_TEXT = '#111111';
const HEADER = {
  bar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: rs(16),
    paddingBottom: rs(12),
    borderBottomWidth: 1,
    borderBottomColor: HEADER_BORDER,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: HEADER_BORDER,
  },
  titleWrap: { flex: 1, alignItems: 'center', marginHorizontal: rs(8) },
  title: { color: HEADER_TEXT, fontSize: T.headline, fontWeight: '800' },
  subtitle: { color: '#6B7280', fontSize: T.caption2, marginTop: rs(2) },
};
const LINE = '#E5E7EB';        // input + bar borders

// Device Security Lock (optional) field — the entry box sits beside the
// selected type. Same minimums as the lock popup (PIN/password 4+, pattern 4+
// dots); ACCOUNT = iCloud / Google account lock, value optional.
const LOCK_FIELD_OPTIONS = [
  { key: 'PIN', label: 'PIN', placeholder: 'Enter PIN', keyboard: 'number-pad', max: 6 },
  // No text box: a dot pad beside the list is drawn instead (reference design).
  { key: 'PATTERN', label: 'Pattern' },
  { key: 'PASSWORD', label: 'Password', placeholder: 'Enter password', keyboard: 'default', max: 16 },
  { key: 'ACCOUNT', label: 'iCloud / Google Account', placeholder: 'Account (optional)', keyboard: 'email-address', max: 60 },
];
/** One height for every single-line field, so the rows line up across sections. */
// Device photos (optional, up to 5). Stored in devicePhotosJson as
// { front, back, photo3, photo4, photo5 } so every existing reader — customer
// app, staff app, booking edit — still finds the first two as front / back.
// Reasons offered when the customer doesn't give an IMEI.
const IMEI_OTHER = 'Other';
const IMEI_SKIP_REASONS = ['Customer refused', 'Device not powering on', 'IMEI not visible / damaged', IMEI_OTHER];

const PHOTO_KEYS = ['front', 'back', 'photo3', 'photo4', 'photo5'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // master-data /media/upload limit

// Estimated delivery is chosen in whole hours only (no minutes / days).
const DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24, 48, 72].map((h) => ({ value: h, label: `${h} hr` }));

const formatDate = (d) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

const formatDateLong = (d) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

const formatTime = (d) => {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

/** "45 min" · "3 hr" · "3 hr 30 min" · "2 d 4 hr" — the span from now. */
const formatSpan = (mins) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h} hr ${m} min` : `${h} hr`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} hr` : `${d} d`;
};

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * Weeks of `month` as arrays of 7 Dates, including the leading and trailing days
 * that belong to the adjacent months (shown greyed, like the reference).
 *
 * Row count is 5 or 6 depending on the month rather than a fixed 6 — a fixed
 * grid adds an empty 36pt row to most months, and this sheet is height-bound.
 *
 * `new Date(y, m, 1 - lead + n)` is deliberate: a day number of 0 or less rolls
 * back into the previous month, so the lead needs no separate arithmetic.
 */
const monthWeeks = (month) => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const rows = Math.ceil((lead + daysIn) / 7);
  return Array.from({ length: rows }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => new Date(y, m, 1 - lead + w * 7 + i)));
};

const HOUR_OPTS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1, label: String(i + 1).padStart(2, '0'),
}));
// 00-59. There is no :60 — that IS the next hour, and offering it would let the
// sheet build a time an hour away from the one it displays.
const MINUTE_OPTS = Array.from({ length: 60 }, (_, m) => ({
  value: m, label: String(m).padStart(2, '0'),
}));

// What was entered here before a Back to Issue Description, keyed by that
// (previous) route — Next opens a fresh copy of this screen, which restores it.
const DRAFTS = {};
const prevRouteKey = (navigation) => {
  const st = navigation.getState();
  return st?.routes?.[st.index - 1]?.key;
};

export default function ServicePriceEstimateScreen({ navigation, route }) {
  const [restored] = useState(() => DRAFTS[prevRouteKey(navigation)] || null);
  const params = restored ? { ...(route?.params || {}), ...restored } : (route?.params || {});
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  // Repair issues / services are picked right here (RepairIssuesPicker), seeded
  // from an earlier pass or an edit's saved line items.
  const [services, setServices] = useState(() => (
    Array.isArray(params.services) && params.services.length ? params.services
      : Array.isArray(params.prefillServices) ? params.prefillServices : []
  ));
  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  /**
   * Lock "now" at mount so the displayed date/time and the delivery calc stay
   * stable while the screen is open.
   *
   * ALWAYS the current moment, including on a re-estimate. This used to anchor
   * to the booking's original estimatedReadyAt, which made "Received on" show
   * the first estimate's date and "Ready by" count forward from a moment already
   * in the past — a 12 hr re-estimate produced a ready-by that had already
   * passed. A re-estimate is made now, so it is measured from now.
   */
  const [now] = useState(() => new Date());
  // Service start, saved as estimatedReadyAt. An edit / re-estimate keeps the
  // booking's original start so Device Details' Service Schedule doesn't jump
  // to the re-estimate time — only the ready-by is measured from `now`.
  // Re-Service is a new job and starts now. serviceStartIso survives Back/Next.
  const startIso = params.serviceStartIso
    || (!params.reService && params.prefillEstimatedReadyIso)
    || now.toISOString();
  const [imei, setImei] = useState(params.prefillImei || '');
  // "Customer didn't give IMEI" — closes the IMEI field and asks for a reason
  // instead, so a booking can still go ahead without one.
  const [noImei, setNoImei] = useState(false); // IMEI field only — no "No IMEI" option
  const [noImeiReason, setNoImeiReason] = useState(params.prefillNoImeiReason || '');
  const [noImeiOther, setNoImeiOther] = useState(params.prefillNoImeiOther || '');
  // Non-mobile devices (Laptop / Tablet / Smartwatch / Audio) take a serial number instead.
  const [serialNumber, setSerialNumber] = useState(params.prefillSerialNumber || params.serialNumber || '');
  // Charger, case, SIM tray … handed over with the device.
  const [accessories, setAccessories] = useState(params.prefillAccessories || params.accessories || '');
  const [missingParts, setMissingParts] = useState(() => seedMissingParts(params.missingParts || params.prefillMissingParts));
  // Seeded from a saved lock on re-estimate; sent on as `lock`, so Device
  // Information skips its own lock popup.
  const seedLock = params.lock || params.prefillLock || null;
  const [lockType, setLockType] = useState(seedLock?.type || 'NONE');
  const [lockValue, setLockValue] = useState(seedLock?.value || '');
  const showImei = useImeiApplies(params); // mobile phones only
  // One description per picked issue ("Display: cracked glass"), plus free
  // Notes. A saved complaint is split back into the two on re-entry.
  const [issueNotes] = useState(() => {
    if (params.prefillIssueNotes) return params.prefillIssueNotes;
    const out = {};
    String(params.prefillComplaint || '').split('\n').forEach((line) => {
      const svc = (params.services || params.prefillServices || []).find((x) => x?.serviceName && line.startsWith(`${x.serviceName}: `));
      if (svc) out[svc.serviceName] = line.slice(svc.serviceName.length + 2);
    });
    return out;
  });
  const [complaint, setComplaint] = useState(() => (params.prefillIssueNotes ? (params.prefillComplaint || '')
    : String(params.prefillComplaint || '').split('\n').filter((line) => !(params.services || params.prefillServices || [])
      .some((x) => x?.serviceName && line.startsWith(`${x.serviceName}: `))).join('\n')));
  const [duration, setDuration] = useState(() => {
    if (params.prefillEstimatedReadyIso && params.prefillEstimatedDeliveryIso) {
      const ms = new Date(params.prefillEstimatedDeliveryIso) - new Date(params.prefillEstimatedReadyIso);
      const hrs = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
      if (DURATIONS.some((d) => d.value === hrs)) return hrs;
    }
    return 2;
  });
  // Re-Estimate starts unticked: the earlier approval was for the old price.
  const [approval, setApproval] = useState(params.reEstimate ? false : (params.prefillCustomerApproved ?? false));
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * An explicit ready-by, set from the editor. `null` means "derive it from the
   * duration", which is the normal path.
   *
   * Seeded from a re-estimate ONLY when the previous delivery time is still in
   * the future AND its span isn't one of the DURATIONS options — otherwise the
   * duration selector already expresses it, and carrying a ready-by that has
   * already passed would contradict the re-anchoring of `now` above.
   */
  const [readyOverride, setReadyOverride] = useState(() => {
    const iso = params.prefillEstimatedDeliveryIso;
    if (!iso || !params.prefillEstimatedReadyIso) return null;
    const d = new Date(iso);
    if (!(d.getTime() > Date.now())) return null;
    const hrs = Math.round((d - new Date(params.prefillEstimatedReadyIso)) / (60 * 60 * 1000));
    return DURATIONS.some((o) => o.value === hrs) ? null : d;
  });

  // ── Ready-by editor ──────────────────────────────────────────────
  const [edOpen, setEdOpen] = useState(false);
  const [edDay, setEdDay] = useState(() => startOfDay(new Date()));
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [edHour12, setEdHour12] = useState(12);
  const [edMeridiem, setEdMeridiem] = useState('PM');
  const [edMinute, setEdMinute] = useState(0);
  // Delivery date / time pickers: 'date' | 'time' | null; the time picker's active half.
  const [pickerMode, setPickerMode] = useState(null);
  const [timeTab, setTimeTab] = useState('hour');

  // ── Audio recording state ────────────────────────────────────────
  // `audioUrl` is the hosted media.ggfix.in URL once the recording is uploaded;
  // `localUri` is the temporary file before upload (so we can preview it).
  // `isRecording` toggles the record button; `recordingMs` ticks the visible
  // timer while a recording is in progress. `isPlaying` drives the play/pause
  // button on the playback preview.
  const [audioUrl, setAudioUrl] = useState(params.prefillIssueAudioUrl || '');
  const [localUri, setLocalUri] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // The reference collapses the recorder to a single row with a chevron, so the
  // controls live behind a disclosure instead of always occupying the card.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingLiveRef = useRef(false);
  const soundRef = useRef(null);
  const tickRef = useRef(null);

  // Tick a 1-Hz timer while recording so the user sees the duration go up.
  useEffect(() => {
    if (isRecording) {
      const start = Date.now();
      tickRef.current = setInterval(() => {
        setRecordingMs(Date.now() - start);
      }, 250);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      setRecordingMs(0);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isRecording]);

  // Always release the sound + recording handles when we leave the screen,
  // otherwise the next visit can fail to acquire the mic with "Already prepared".
  useEffect(() => {
    return () => {
      if (recordingLiveRef.current) { try { audioRecorder.stop(); } catch (_) {} }
      try { soundRef.current?.remove?.(); } catch (_) {}
    };
  }, [audioRecorder]);

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        notify('Microphone needed', 'Allow microphone access to record the customer\'s issue.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordingLiveRef.current = true;
      setIsRecording(true);
    } catch (e) {
      notify('Could not start recording', e?.message || 'Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      if (!recordingLiveRef.current) return;
      recordingLiveRef.current = false;
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) return;
      setLocalUri(uri);
      // Upload immediately so by the time the user hits Continue, we already
      // have the hosted URL ready to submit to the backend.
      setUploadingAudio(true);
      try {
        const ext = (uri.split('.').pop() || 'm4a').toLowerCase();
        const url = await uploadMedia(
          { uri, name: `complaint-${Date.now()}.${ext}`, type: `audio/${ext === 'mp3' ? 'mpeg' : ext}` },
          'complaint-audio',
        );
        if (!url) throw new Error('Upload returned no URL');
        setAudioUrl(url);
      } catch (err) {
        notify('Upload failed', err?.message || 'Could not upload recording.');
      } finally {
        setUploadingAudio(false);
      }
    } catch (e) {
      notify('Could not stop recording', e?.message || 'Please try again.');
    }
  };

  const togglePlayback = async () => {
    try {
      if (isPlaying && soundRef.current) {
        soundRef.current.pause();
        setIsPlaying(false);
        return;
      }
      const uriToPlay = audioUrl || localUri;
      if (!uriToPlay) return;
      // Release any previous player so we don't leak.
      if (soundRef.current) { try { soundRef.current.remove(); } catch (_) {} }
      const player = createAudioPlayer(uriToPlay);
      soundRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status?.didJustFinish) setIsPlaying(false);
      });
      player.play();
      setIsPlaying(true);
    } catch (e) {
      notify('Could not play', e?.message || 'Try again.');
    }
  };

  const removeAudio = async () => {
    try {
      if (isPlaying && soundRef.current) {
        soundRef.current.pause();
      }
      if (soundRef.current) soundRef.current.remove();
    } catch (_) {}
    soundRef.current = null;
    setIsPlaying(false);
    setLocalUri('');
    setAudioUrl('');
  };

  /** Overflow action — puts the form back to how it opened. */
  const clearEstimate = async () => {
    setMenuOpen(false);
    if (isRecording) { try { await stopRecording(); } catch (_) {} }
    await removeAudio();
    setImei('');
    setNoImei(false);
    setNoImeiReason('');
    setNoImeiOther('');
    setComplaint('');
    setDuration(2);
    setReadyOverride(null);
    setApproval(false);
    setVoiceOpen(false);
  };

  const dateLabel = formatDate(now);
  const timeLabel = formatTime(now);
  // Ready-by is EITHER derived from the duration or set outright in the editor.
  const delivery = readyOverride || new Date(now.getTime() + duration * 60 * 60 * 1000);
  const deliveryDateLabel = formatDate(delivery);
  const deliveryTimeLabel = formatTime(delivery);
  const spanMinutes = Math.max(0, Math.round((delivery - now) / 60000));
  const spanLabel = formatSpan(spanMinutes);
  // Only `estimatedReadyIso`/`estimatedDeliveryIso` reach the backend, so an
  // override that isn't a whole number of hours is stored exactly; this is the
  // display/legacy value only.
  const effectiveHours = readyOverride ? Math.max(1, Math.round(spanMinutes / 60)) : duration;

  const edDate = (() => {
    const x = new Date(edDay);
    let h = edHour12 % 12;
    if (edMeridiem === 'PM') h += 12;
    x.setHours(h, edMinute, 0, 0);
    return x;
  })();
  const edValid = edDate.getTime() > now.getTime();
  const weeks = monthWeeks(calMonth);
  const today0 = startOfDay(now);
  // Nothing reachable in an earlier month — every date there is already past.
  const canPrev = startOfMonth(calMonth) > startOfMonth(now);

  // Both pickers start from the current delivery moment.
  const seedPicker = () => {
    const d = delivery;
    setEdDay(startOfDay(d));
    setCalMonth(startOfMonth(d));
    const h = d.getHours();
    setEdMeridiem(h >= 12 ? 'PM' : 'AM');
    setEdHour12(h % 12 || 12);
    setEdMinute(d.getMinutes());
  };
  const openDatePicker = () => { seedPicker(); setPickerMode('date'); };
  const openTimePicker = () => { seedPicker(); setTimeTab('hour'); setPickerMode('time'); };
  // A manual date / time becomes the delivery moment; the hours shown follow it.
  const applyPicker = () => {
    if (!edValid) return;
    setReadyOverride(edDate);
    setPickerMode(null);
  };

  // Continue allowed once the user has SOME description of the issue (text or
  // audio) AND has explicitly toggled customer approval. IMEI is gated
  // separately (imeiOk below) and only for phones — laptops / audio gear don't
  // have one.
  // Picker seed: services with their saved notes (the picker owns notes after this).
  const [pickerSeed] = useState(() => services.map((s) => ({ ...s, note: s.note ?? issueNotes[s.serviceName] ?? '' })));
  const hasIssue = services.length > 0 || complaint.trim().length > 0 || !!audioUrl;
  // Issue lines first, then the Notes; just the issue names when nothing typed.
  const issueLines = services.map((x) => (x.note?.trim() ? `${x.serviceName}: ${x.note.trim()}` : '')).filter(Boolean);
  const complaintText = [...issueLines, complaint.trim()].filter(Boolean).join('\n')
    || services.filter((x) => x.serviceCode !== SERVICE_CHARGE_CODE).map((x) => x.serviceName).filter(Boolean).join(', ');
  // ── Device photos (moved here from Device Information) ─────────────────
  const seedPhotos = params.devicePhotos || params.prefillDevicePhotos;
  const [photoUrls, setPhotoUrls] = useState(() => (
    seedPhotos && typeof seedPhotos === 'object' ? PHOTO_KEYS.map((k) => seedPhotos[k]).filter(Boolean) : []
  ));
  const [videoUrl, setVideoUrl] = useState(() => (seedPhotos && typeof seedPhotos === 'object' ? seedPhotos.video || '' : ''));
  const [photoUploading, setPhotoUploading] = useState(false);
  // Media sheet: { mode: 'add' } (Photo / Video tiles) → { mode: 'add', kind }
  // (gallery / camera) | { mode: 'item' | 'replace', kind, index }.
  const [mediaSheet, setMediaSheet] = useState(null);
  const [preview, setPreview] = useState(null); // photo index shown full-screen

  // kind: 'photo' | 'video'; fromCamera: take / record instead of the gallery.
  // target.index replaces that photo; without one a photo is appended. The
  // video always goes in the `video` slot.
  const pickMedia = async (kind, fromCamera, target = {}) => {
    const isVideo = kind === 'video';
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      const what = fromCamera ? 'Camera' : isVideo ? 'Videos' : 'Photos';
      if (perm.canAskAgain === false && Platform.OS !== 'web') {
        Alert.alert(`${what} access is off`, `Turn on ${what.toLowerCase()} access for this app in Settings to add device media.`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      } else {
        notify('Permission needed', `Allow ${what.toLowerCase()} access to add device media.`);
      }
      return;
    }
    // Photos and video: straight from the camera / gallery, no device check.
    try {
      const opts = isVideo
        ? { mediaTypes: 'videos', allowsEditing: false, videoMaxDuration: 15, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium }
        : { mediaTypes: 'images', allowsEditing: false, quality: 0.7 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      await uploadMediaAsset(result.assets[0], isVideo, target);
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again');
    }
  };
  const uploadMediaAsset = async (asset, isVideo, target = {}) => {
    try {
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
        notify(isVideo ? 'Video too large' : 'Photo too large', isVideo
          ? 'The limit is 10 MB. Choose a shorter clip (about 5–8 seconds).'
          : 'The limit is 10 MB. Choose a smaller photo and try again.');
        return;
      }
      setPhotoUploading(true);
      const replaceAt = typeof target.index === 'number' ? target.index : null;
      const slot = isVideo ? 'video' : PHOTO_KEYS[Math.min(replaceAt ?? photoUrls.length, PHOTO_KEYS.length - 1)];
      // 'repair' → media.ggfix.in/Devicefiles/<slot>-….
      const url = await uploadMedia(asset, 'repair', { slot });
      if (!url) throw new Error('Upload returned no URL');
      if (isVideo) setVideoUrl(url);
      else if (replaceAt !== null) setPhotoUrls((list) => list.map((u, n) => (n === replaceAt ? url : u)));
      else setPhotoUrls((list) => (list.length >= PHOTO_KEYS.length ? list : [...list, url]));
    } catch (e) {
      const tooBig = e?.status === 413 || /too large|maximum upload size|exceed/i.test(e?.message || '');
      notify('Upload failed', tooBig ? 'The file is larger than 10 MB.' : (e?.message || 'Try again'));
    } finally {
      setPhotoUploading(false);
    }
  };
  // Close the sheet first, then open the picker — presenting a picker while a
  // modal is still sliding out is unreliable on iOS.
  const chooseMedia = (kind, fromCamera, target) => {
    setMediaSheet(null);
    setTimeout(() => pickMedia(kind, fromCamera, target), 320);
  };
  const removeMedia = (kind, index) => {
    if (kind === 'video') setVideoUrl('');
    else setPhotoUrls((list) => list.filter((_, n) => n !== index));
  };
  const previewMedia = (kind, index) => {
    setMediaSheet(null);
    if (kind === 'video') {
      if (videoUrl) Linking.openURL(videoUrl).catch(() => notify('Could not open video', 'Try again.'));
      return;
    }
    setTimeout(() => setPreview(index), 320);
  };
  const devicePhotosParam = () => {
    const o = {};
    photoUrls.forEach((u, i) => { o[PHOTO_KEYS[i]] = u; });
    if (videoUrl) o.video = videoUrl;
    return o;
  };
  const mediaItems = [
    ...photoUrls.map((u, i) => ({ kind: 'photo', uri: u, index: i, label: `Photo ${i + 1}` })),
    ...(videoUrl ? [{ kind: 'video', uri: videoUrl, index: 0, label: 'Video' }] : []),
  ];
  // Any device: up to 5 photos, optional.
  const canAddPhoto = photoUrls.length < PHOTO_KEYS.length;
  const canAddMedia = canAddPhoto || !videoUrl;
  // 3 thumbnails per row on phones, 5 on tablets (a hair under, so rounding never wraps).
  const mediaPct = `${(100 / (r.isTablet ? 5 : 3)) - 0.1}%`;

  // At least one device photo is required; the video is optional.
  // Lock types this device can have (laptop: PIN + password; watch/audio: none).
  const specCategory = resolveSpecCategory(params.deviceCategory, params.categoryCode, params.categoryName);
  const lockTypes = lockTypesFor(specCategory);
  // Missing / damaged parts is Mobile-only (unknown category keeps it).
  const showMissingParts = !specCategory || specCategory === 'MOBILE';
  const flaggedCount = flaggedMissingParts(missingParts).length;
  const lockOptions = [{ key: 'NONE', label: 'None' }, ...LOCK_FIELD_OPTIONS.filter((o) =>
    (o.key === 'ACCOUNT' ? lockTypes.includes('PATTERN') : lockTypes.includes(o.key)))];
  const patternDots = lockType === 'PATTERN' ? lockValue.split(',').filter(Boolean).length : 0;
  // PIN / Pattern / Password / Account are entered in the lock popup.
  const [lockSheet, setLockSheet] = useState(null); // initialLock while open
  const pickLock = (key) => {
    if (key === 'NONE') { setLockType('NONE'); setLockValue(''); return; }
    setLockSheet({ type: key, value: lockType === key ? lockValue : '' });
  };
  // Never the secret itself — only that one is set.
  const lockSummary = lockType === 'PIN' ? (lockValue ? `PIN set · ${lockValue.length} digits` : '')
    : lockType === 'PASSWORD' ? (lockValue ? 'Password set' : '')
    : lockType === 'PATTERN' ? lockValue.split(',').filter(Boolean).join(' → ')
    : lockType === 'ACCOUNT' ? (lockValue ? 'Account noted' : '')
    : '';
  const lockError = lockType === 'PIN' && lockValue.length < 4 ? 'Enter a 4–6 digit PIN.'
    : lockType === 'PASSWORD' && lockValue.length < 4 ? 'Enter at least 4 characters.'
    : lockType === 'PATTERN' && patternDots < 4 ? 'Draw at least 4 dots.'
    : '';

  // IMEI (phones only): a valid 14–17 digit number, or "not given" + a reason.
  // Re-estimates edit an existing ticket and aren't held up by it.
  const imeiDigits = imei.replace(/\D/g, '');
  const imeiValid = imeiDigits.length >= 14 && imeiDigits.length <= 17;
  const noImeiText = noImeiReason === IMEI_OTHER ? noImeiOther.trim() : noImeiReason;
  // IMEI is optional: empty is fine; a number that IS typed must be 14–17 digits.
  const imeiOk = !showImei || params.reEstimate || (noImei ? !!noImeiText : (imeiDigits.length === 0 || imeiValid));

  const isReady = services.length > 0 && hasIssue && approval && !uploadingAudio && !isRecording && !photoUploading && !lockError && imeiOk;

  // Back to Issue Description, then Next, used to open this screen empty — the
  // back press unmounts it. Keep what was entered (as the prefill* params this
  // screen already seeds from) in DRAFTS; no navigation dispatch mid-removal.
  const draftRef = useRef(null);
  draftRef.current = {
    services,
    prefillImei: imei,
    prefillNoImei: noImei,
    prefillNoImeiReason: noImeiReason,
    prefillNoImeiOther: noImeiOther,
    prefillSerialNumber: serialNumber,
    prefillAccessories: accessories,
    prefillMissingParts: flaggedMissingParts(missingParts),
    prefillLock: { type: lockType, value: lockValue },
    prefillComplaint: complaint,
    prefillIssueNotes: Object.fromEntries(services.filter((x) => x.note).map((x) => [x.serviceName, x.note])),
    prefillCustomerApproved: approval,
    prefillIssueAudioUrl: audioUrl || undefined,
    prefillDevicePhotos: devicePhotosParam(),
    prefillEstimatedReadyIso: now.toISOString(),
    prefillEstimatedDeliveryIso: delivery.toISOString(),
    serviceStartIso: startIso,
  };
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    // POP_TO too: "Change" on the device card jumps back to the picker.
    if (!['GO_BACK', 'POP', 'POP_TO'].includes(e.data?.action?.type)) return;
    const key = prevRouteKey(navigation);
    if (key) DRAFTS[key] = draftRef.current;
  }), [navigation]);

  // Everything this device carries on (same fields the review screen reads).
  const deviceEntries = () => ({
      services,
      imei: showImei && noImei ? '' : imeiDigits,
      serialNumber: showImei ? undefined : (serialNumber.trim() || undefined),
      // No ticket field for the reason, so it rides on the complaint where
      // staff will see it.
      complaint: [complaintText, showImei && noImei && noImeiText ? `IMEI not provided: ${noImeiText}` : '']
        .filter(Boolean).join('\n'),
      devicePhotos: devicePhotosParam(),
      accessories: accessories.trim() || undefined,
      missingParts: showMissingParts ? flaggedMissingParts(missingParts) : [],
      lock: lockOptions.length > 1 ? { type: lockType, value: lockType === 'NONE' ? '' : lockValue.trim() } : undefined,
      issueAudioUrl: audioUrl || null,
      estimatedAt: `${dateLabel} ${timeLabel}, ${effectiveHours}Hr`,
      estimatedDelivery: `${deliveryDateLabel} - ${deliveryTimeLabel}`,
      estimatedReadyIso: startIso,
      estimatedDeliveryIso: delivery.toISOString(),
      durationHours: effectiveHours,
      customerApproved: approval,
  });

  // Save & Continue → Review & Confirm (prices are edited inline now, so the
  // old Device Information pass is skipped).
  const goingRef = useRef(false);
  const onContinue = () => {
    if (!isReady || goingRef.current) return;
    goingRef.current = true;
    setTimeout(() => { goingRef.current = false; }, 800);
    navigation.navigate('ServiceBookingDevicesList', { ...params, ...deviceEntries() });
  };

  // Add Another Device: this device is saved into the booking's device list,
  // then a blank device form opens for the SAME customer (never Customer Details).
  const canAddAnother = !params.editMode && !params.reService && !params.reEstimate;
  const onAddAnother = () => {
    if (!isReady || goingRef.current) return;
    const device = deviceFromParams({ ...params, ...deviceEntries() });
    if (!device) { notify('Select a device', 'Choose the device model first.'); return; }
    goingRef.current = true;
    setTimeout(() => { goingRef.current = false; }, 800);
    navigation.navigate('DeviceDetails', {
      flow: 'BOOKING',
      customerId: params.customerId,
      customer: params.customer,
      existingDevices: [...(Array.isArray(params.existingDevices) ? params.existingDevices : []), device],
      ...(params.addToBookingNumber ? { addToBookingNumber: params.addToBookingNumber } : {}),
    });
  };

  // Jump back to an earlier booking step that is still in this stack.
  const inStack = (name) => (navigation.getState()?.routes || []).some((rt) => rt.name === name);
  const backTo = (name) => { if (inStack(name)) navigation.popTo(name); };

  // Compact summaries for the top cards.
  const customer = params.customer || {};
  const savedDevices = Array.isArray(params.existingDevices) ? params.existingDevices : [];
  const deviceNo = savedDevices.length + 1;
  const deviceImage = params.imageUrl || params.modelImageUrl || null;
  const deviceSpec = [[params.ramLabel, params.storageLabel].filter(Boolean).join(' / '), params.color].filter(Boolean).join(' · ');
  const dayWord = (d) => {
    const a = startOfDay(d).getTime();
    const t = startOfDay(now).getTime();
    return a === t ? 'Today' : a === t + 86400000 ? 'Tomorrow' : formatDate(d);
  };
  const [durOpen, setDurOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const lockLabel = (lockOptions.find((o) => o.key === lockType) || {}).label || 'None';

  const recSeconds = Math.floor(recordingMs / 1000);
  const recLabel = `${String(Math.floor(recSeconds / 60)).padStart(2, '0')}:${String(recSeconds % 60).padStart(2, '0')}`;

  const hasClip = !!(audioUrl || localUri);
  // Recording and an attached clip both force the controls open — the collapsed
  // row alone can't be stopped or played.
  const voiceExpanded = voiceOpen || isRecording || hasClip;
  const voiceHint = isRecording
    ? `Recording… ${recLabel}`
    : uploadingAudio
    ? 'Uploading…'
    : hasClip
    ? 'Voice note attached'
    : '';

  // Tablets get a capped, centred column; a 1024pt-wide bill row is unreadable.
  const colStyle = r.isTablet
    ? { width: '100%', maxWidth: 900, alignSelf: 'center' }
    : null;

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      {/* ── Header — same design as Personal Information: white bar, bottom
          border, round back · centred title + subtitle · round overflow. ── */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {/* Same header as Customer Details / Device Details: fixed 36pt round
          back button and an equal spacer, so the title + subtitle stay centred
          at every width. Plain style objects — NativeWind drops a
          style={({ pressed }) => …} function, which left the button unsized. */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 6, paddingBottom: 6, paddingHorizontal: 14 }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, colStyle]}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={6}
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: LINE }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8, alignItems: 'center' }}>
            <Text style={{ color: INK, fontSize: 17, fontWeight: '800', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Devices & Repair
            </Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>
              Add device and repair details
            </Text>
          </View>

          <View style={{ width: 36 }} />
        </View>
      </View>
      {/* ✓ Customer → 2 Devices → 3 Confirm */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: LINE }}>
        <View style={colStyle}>
          <StepProgress active={1} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={rs(120)}
        contentContainerStyle={{ paddingBottom: rs(150) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={colStyle}>
          {/* ── Customer (from Step 1 — never asked again) ─────────────────── */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(12) }}>
            <View style={[card, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rs(12), paddingVertical: rs(9) }]}>
              <View style={{ height: rs(32), width: rs(32), borderRadius: rs(16), backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                <User size={rf(16)} color={ACCENT} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: rs(10) }}>
                <Text style={{ fontSize: rf(11), color: MUTED }}>Customer</Text>
                <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK }} numberOfLines={1}>
                  {customer.name || customer.fullName || '—'}
                  {customer.phone || customer.mobile ? <Text style={{ fontWeight: '500', color: MUTED }}>{`  ·  ${customer.phone || customer.mobile}`}</Text> : null}
                </Text>
              </View>
              {inStack('CustomerDetails') ? (
                <Pressable
                  onPress={() => backTo('CustomerDetails')}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Edit customer"
                  className="items-center justify-center active:opacity-70"
                  style={{ height: rs(32), width: rs(32), borderRadius: rs(16), backgroundColor: PAGE_BG }}
                >
                  <Pencil size={rf(15)} color={ACCENT} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ── Devices already saved in this booking (bulk) ───────────────── */}
          {savedDevices.length ? (
            <View style={{ paddingHorizontal: rs(16), paddingTop: rs(10), gap: rs(6) }}>
              {savedDevices.map((d, i) => (
                <View
                  key={`saved-${i}`}
                  className="flex-row items-center"
                  style={{ paddingHorizontal: rs(12), paddingVertical: rs(8), borderRadius: rs(12), backgroundColor: MINT, borderWidth: 1, borderColor: ACCENT_30 }}
                >
                  <CircleCheck size={rf(16)} color={ACCENT} strokeWidth={2} />
                  <Text style={{ marginLeft: rs(8), fontSize: rf(12.5), fontWeight: '800', color: ACCENT }}>Device {i + 1}</Text>
                  <Text style={{ flex: 1, marginLeft: rs(8), fontSize: rf(12.5), color: INK }} numberOfLines={1}>{d.modelName || 'Device'}</Text>
                  <Text style={{ fontSize: rf(11.5), color: MUTED }}>
                    {(d.services || []).length} issue{(d.services || []).length === 1 ? '' : 's'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* ── Device Information ─────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(14) }}>
            <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>
              Device Information{savedDevices.length ? <Text style={{ color: ACCENT }}>{`  ·  Device ${deviceNo}`}</Text> : null}
            </Text>
            <View style={[card, { flexDirection: 'row', alignItems: 'center', padding: rs(10) }]}>
              <View style={{ height: rs(56), width: rs(56), borderRadius: rs(12), backgroundColor: PAGE_BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {deviceImage ? (
                  <Image source={{ uri: deviceImage }} style={{ width: '88%', height: '88%' }} resizeMode="contain" />
                ) : (
                  <Smartphone size={rf(26)} color={MUTED} strokeWidth={1.75} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: rs(10) }}>
                <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK }} numberOfLines={2}>
                  {[params.brandName && !String(params.modelName || '').toLowerCase().startsWith(String(params.brandName).toLowerCase()) ? params.brandName : null, params.modelName].filter(Boolean).join(' ') || 'Device'}
                </Text>
                {deviceSpec ? <Text style={{ fontSize: rf(12), color: MUTED, marginTop: rs(1) }} numberOfLines={1}>{deviceSpec}</Text> : null}
                {params.modelNumber ? <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: rs(1) }} numberOfLines={1}>{params.modelNumber}</Text> : null}
              </View>
              {inStack('DeviceDetails') ? (
                <Pressable
                  onPress={() => backTo('DeviceDetails')}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Change device"
                  className="active:opacity-70"
                  style={{ paddingHorizontal: rs(12), paddingVertical: rs(6), borderRadius: rs(10), borderWidth: 1, borderColor: ACCENT }}
                >
                  <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: ACCENT }}>Change</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ── Repair Issues — issue groups, then the picked services with price + warranty ── */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(14) }}>
            <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>
              Repair Issues<Text style={{ color: RED_TEXT }}> *</Text>
            </Text>
            <RepairIssuesPicker categoryId={params.categoryId} initialServices={pickerSeed} onChange={setServices} isTablet={r.isTablet} withNotes withServiceCharge chargePerService />
          </View>

          {/* Voice note — the only quick-action card on this screen now
              ("Add Photos" removed per explicit request; real device-photo
              capture stays on DeviceInformationScreen, untouched). Full
              width again since there's no second card to share the row
              with. Expand/collapse logic (`voiceOpen`) and every control
              below it are byte-for-byte unchanged. */}
          <View style={{ paddingHorizontal: rs(16), marginTop: rs(8) }}>
            <View style={[card, { padding: rs(12) }]}>
              <Pressable
                onPress={() => setVoiceOpen((v) => !v)}
                className="flex-row items-center active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={voiceExpanded ? 'Hide voice note controls' : 'Show voice note controls'}
              >
                <View
                  style={{
                    height: rs(40), width: rs(40), borderRadius: rs(12), backgroundColor: MINT,
                    alignItems: 'center', justifyContent: 'center', marginRight: rs(10),
                  }}
                >
                  <Mic size={rf(18)} color={isRecording ? '#DC2626' : ACCENT} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text className="text-text" style={{ fontSize: rf(13), fontWeight: '700' }}>
                    Record Voice Note
                    <Text className="text-text-muted" style={{ fontSize: rf(12), fontWeight: '400' }}> (optional)</Text>
                  </Text>
                  {/* Second line only for live status (recording / uploading / attached). */}
                  {voiceHint ? (
                    <Text className="text-text-muted" style={{ fontSize: rf(12), marginTop: rs(1) }} numberOfLines={1}>
                      {voiceHint}
                    </Text>
                  ) : null}
                </View>
                {voiceExpanded
                  ? <ChevronDown size={rf(18)} color="#9CA3AF" strokeWidth={2} />
                  : <ChevronRight size={rf(18)} color="#9CA3AF" strokeWidth={2} />}
              </Pressable>

            {voiceExpanded ? (
                <View style={{ marginTop: rs(10) }}>
                  {isRecording ? (
                    <View
                      className="flex-row items-center"
                      style={{
                        borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(8),
                        backgroundColor: '#FDECEC', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)',
                      }}
                    >
                      <View style={{ height: rs(10), width: rs(10), borderRadius: rs(5), backgroundColor: '#DC2626', marginRight: rs(8) }} />
                      <View className="flex-1">
                        <Text className="text-danger" style={{ fontSize: rf(12), fontWeight: '600' }}>Recording…</Text>
                        <Text className="text-danger" style={{ fontSize: rf(11), fontWeight: '500' }}>{recLabel}</Text>
                      </View>
                      <Pressable
                        onPress={stopRecording}
                        className="flex-row items-center active:opacity-80"
                        style={{ backgroundColor: '#DC2626', borderRadius: rs(999), paddingHorizontal: rs(14), paddingVertical: rs(8) }}
                      >
                        <Square size={rf(12)} color="#fff" fill="#fff" />
                        <Text className="text-white" style={{ fontSize: rf(12), fontWeight: '600', marginLeft: rs(6) }}>STOP</Text>
                      </Pressable>
                    </View>
                  ) : hasClip ? (
                    <View
                      className="flex-row items-center"
                      style={{
                        borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(8),
                        backgroundColor: SCREEN_BG, borderWidth: 1, borderColor: ACCENT_30,
                      }}
                    >
                      <Pressable
                        onPress={togglePlayback}
                        className="items-center justify-center active:opacity-80"
                        style={{ height: rs(38), width: rs(38), borderRadius: rs(19), backgroundColor: ACCENT }}
                        disabled={uploadingAudio}
                      >
                        {isPlaying
                          ? <Pause size={rf(16)} color="#fff" fill="#fff" />
                          : <Play size={rf(16)} color="#fff" fill="#fff" />}
                      </Pressable>
                      <View className="flex-1" style={{ marginLeft: rs(10) }}>
                        <Text className="text-text" style={{ fontSize: rf(13), fontWeight: '600' }}>Voice note attached</Text>
                        <Text className="text-text-muted" style={{ fontSize: rf(12) }}>
                          {uploadingAudio ? 'Uploading…' : (audioUrl ? 'Uploaded · tap play to preview' : 'Tap play to preview')}
                        </Text>
                      </View>
                      {uploadingAudio ? (
                        <ActivityIndicator color={ACCENT} />
                      ) : (
                        <Pressable
                          onPress={removeAudio}
                          className="items-center justify-center active:opacity-70"
                          style={{ height: rs(36), width: rs(36), borderRadius: rs(18), backgroundColor: 'rgba(220, 38, 38, 0.12)' }}
                          accessibilityRole="button"
                          accessibilityLabel="Remove voice note"
                        >
                          <Trash2 size={rf(15)} color="#DC2626" strokeWidth={2} />
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <Pressable
                      onPress={startRecording}
                      className="flex-row items-center justify-center active:opacity-90"
                      style={{ backgroundColor: ACCENT, borderRadius: rs(12), paddingVertical: rs(10) }}
                    >
                      <Mic size={rf(16)} color="#fff" strokeWidth={2} />
                      <Text className="text-white" style={{ fontSize: rf(13), fontWeight: '600', marginLeft: rs(8) }}>
                        Record voice note
                      </Text>
                    </Pressable>
                  )}
                </View>
            ) : null}
            </View>
          </View>

          {/* ── Device IMEI ────────────────────────────────────────────── */}
          {/* IMEI is captured for mobile phones only. */}
          {showImei ? (
          <>
          {/* Label + one field: barcode icon · number · scan button inside. */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16) }}>
            <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>
              {/* Optional — a typed number is still checked (imeiOk). */}
              IMEI Number<Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text>
            </Text>
            <View
              className="flex-row items-center"
              style={{
                height: rs(46), borderWidth: 1, borderColor: LINE, borderRadius: rs(12),
                backgroundColor: SCREEN_BG, paddingLeft: rs(12), paddingRight: rs(6),
              }}
            >
              <Barcode size={rf(20)} color={INK} strokeWidth={1.75} />
              <TextInput
                placeholder="Enter 15-digit IMEI"
                placeholderTextColor={SUBTLE}
                value={imei}
                onChangeText={setImei}
                keyboardType="number-pad"
                maxLength={17}
                cursorColor={ACCENT}
                style={{ flex: 1, marginLeft: rs(10), paddingVertical: 0, fontSize: rf(14), color: INK }}
              />
              <Pressable
                onPress={() => navigation.navigate('ScanImei', { onScan: (value) => setImei(value) })}
                hitSlop={6}
                className="items-center justify-center active:opacity-70"
                style={{ height: rs(34), width: rs(34), borderRadius: rs(8) }}
                accessibilityRole="button"
                accessibilityLabel="Scan IMEI barcode"
              >
                <ScanLine size={rf(20)} color={INK} strokeWidth={1.75} />
              </Pressable>
            </View>
            {imeiDigits.length > 0 && !imeiValid ? (
              <Text style={{ fontSize: rf(11.5), color: RED_TEXT, marginTop: rs(5) }}>
                IMEI must be 14–17 digits ({imeiDigits.length} entered). Dial *#06# to see it.
              </Text>
            ) : null}
          </View>
          </>
          ) : (
            /* Laptop / Tablet / Smartwatch / Audio: Serial Number, optional. */
            <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16) }}>
              <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>
                Serial Number<Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text>
              </Text>
              <View
                className="flex-row items-center"
                style={{
                  height: rs(46), borderWidth: 1, borderColor: LINE, borderRadius: rs(12),
                  backgroundColor: SCREEN_BG, paddingHorizontal: rs(12),
                }}
              >
                <Hash size={rf(19)} color={INK} strokeWidth={1.75} />
                <TextInput
                  placeholder="Enter serial number"
                  placeholderTextColor={SUBTLE}
                  value={serialNumber}
                  onChangeText={setSerialNumber}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={40}
                  cursorColor={ACCENT}
                  style={{ flex: 1, marginLeft: rs(10), paddingVertical: 0, fontSize: rf(14), color: INK }}
                />
              </View>
            </View>
          )}

          {/* ── Device Photo or Video — optional (photos and one video).
              Tap a thumbnail to preview / replace / remove it. ─────────────── */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16) }}>
            <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>
              Device Photo or Video<Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text>
            </Text>
            {/* Camera · Gallery · Video — straight to the source, no extra menu. */}
            <View className="flex-row" style={{ gap: rs(8), marginBottom: rs(8) }}>
              {[
                { key: 'camera', label: 'Camera', icon: 'photo-camera', disabled: !canAddPhoto, onPress: () => pickMedia('photo', true) },
                { key: 'gallery', label: 'Gallery', icon: 'photo-library', disabled: !canAddPhoto, onPress: () => pickMedia('photo', false) },
                { key: 'video', label: 'Video', icon: 'videocam', disabled: !!videoUrl, onPress: () => setMediaSheet({ mode: 'add', kind: 'video' }) },
              ].map((b) => {
                const off = b.disabled || photoUploading;
                return (
                  <Pressable
                    key={b.key}
                    onPress={off ? undefined : b.onPress}
                    disabled={off}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${b.label.toLowerCase()}`}
                    accessibilityState={{ disabled: off }}
                    className="flex-1 flex-row items-center justify-center active:opacity-80"
                    style={{ height: rs(44), borderRadius: rs(12), borderWidth: 1, borderColor: off ? LINE : ACCENT_30, backgroundColor: off ? PAGE_BG : MINT, opacity: off ? 0.6 : 1 }}
                  >
                    {photoUploading && b.key !== 'video' ? (
                      <ActivityIndicator size="small" color={ACCENT} />
                    ) : (
                      <MaterialIcons name={b.icon} size={rf(19)} color={off ? MUTED : ACCENT} />
                    )}
                    <Text style={{ marginLeft: rs(6), fontSize: rf(13), fontWeight: '700', color: off ? MUTED : ACCENT }} numberOfLines={1}>{b.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -rs(4) }}>
              {mediaItems.map((m) => (
                <View key={m.uri} style={{ width: mediaPct, padding: rs(4) }}>
                  <Pressable
                    onPress={() => setMediaSheet({ mode: 'item', kind: m.kind, index: m.index })}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.label} options`}
                    className="active:opacity-85"
                    style={{ aspectRatio: 1, borderRadius: rs(12), borderWidth: 1, borderColor: LINE, backgroundColor: PAGE_BG, overflow: 'hidden' }}
                  >
                    {m.kind === 'photo' ? (
                      <Image source={{ uri: m.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="play-circle-filled" size={rf(38)} color="#FFFFFF" />
                      </View>
                    )}
                    <Pressable
                      onPress={() => removeMedia(m.kind, m.index)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${m.label}`}
                      style={{
                        position: 'absolute', top: rs(5), right: rs(5), height: rs(22), width: rs(22), borderRadius: rs(11),
                        backgroundColor: 'rgba(17, 17, 17,0.7)', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <MaterialIcons name="close" size={rf(14)} color="#FFFFFF" />
                    </Pressable>
                  </Pressable>
                  <Text style={{ marginTop: rs(4), fontSize: rf(11.5), fontWeight: '600', color: MUTED, textAlign: 'center' }} numberOfLines={1}>
                    {m.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Device Additional Accessories ───────────────────────────────── */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16) }}>
            <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>
              Device Additional Accessories<Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text>
            </Text>
            <View
              className="flex-row items-center"
              style={{ height: rs(46), borderWidth: 1, borderColor: LINE, borderRadius: rs(12), backgroundColor: SCREEN_BG, paddingHorizontal: rs(12) }}
            >
              <MaterialIcons name="devices-other" size={rf(20)} color={INK} />
              <TextInput
                value={accessories}
                onChangeText={setAccessories}
                placeholder="Enter charger, case, SIM tray, etc."
                placeholderTextColor={SUBTLE}
                maxLength={200}
                cursorColor={ACCENT}
                style={{ flex: 1, marginLeft: rs(10), paddingVertical: 0, fontSize: rf(14), color: INK }}
              />
            </View>
          </View>

          {/* ── More Device Details — Missing / Damaged Parts · Device Security,
              both optional and folded; their values stay when folded. ───── */}
          {showMissingParts || lockOptions.length > 1 ? (
            <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16) }}>
              <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>More Device Details</Text>
              <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: rs(14), overflow: 'hidden', backgroundColor: SCREEN_BG }}>
                {showMissingParts ? (
                  <>
                    <Pressable
                      onPress={() => setPartsOpen((v) => !v)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: partsOpen }}
                      accessibilityLabel="Missing or damaged parts, optional"
                      className="flex-row items-center active:opacity-80"
                      style={{ minHeight: rs(48), paddingHorizontal: rs(12) }}
                    >
                      <Text style={{ flex: 1, fontSize: rf(13.5), fontWeight: '700', color: INK }} numberOfLines={1}>
                        Missing / Damaged Parts<Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text>
                      </Text>
                      {flaggedCount ? (
                        <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: RED_TEXT, marginRight: rs(6) }}>
                          {flaggedCount} Part{flaggedCount === 1 ? '' : 's'} Flagged
                        </Text>
                      ) : null}
                      <ChevronDown size={rf(18)} color={INK} strokeWidth={2} style={{ transform: [{ rotate: partsOpen ? '180deg' : '0deg' }] }} />
                    </Pressable>
                    {partsOpen ? (
                      <View style={{ paddingHorizontal: rs(12), paddingBottom: rs(12) }}>
                        <MissingPartsChecklist value={missingParts} onChange={setMissingParts} />
                      </View>
                    ) : null}
                  </>
                ) : null}
                {lockOptions.length > 1 ? (
                  <>
                    {showMissingParts ? <View style={{ height: 1, backgroundColor: LINE }} /> : null}
                    <Pressable
                      onPress={() => setLockOpen((v) => !v)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: lockOpen }}
                      accessibilityLabel={`Device security, ${lockLabel}`}
                      className="flex-row items-center active:opacity-80"
                      style={{ minHeight: rs(48), paddingHorizontal: rs(12) }}
                    >
                      <Text style={{ flex: 1, fontSize: rf(13.5), fontWeight: '700', color: INK }} numberOfLines={1}>
                        Device Security<Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text>
                      </Text>
                      <Text style={{ fontSize: rf(12), fontWeight: '700', color: lockType === 'NONE' ? MUTED : ACCENT, marginRight: rs(6) }} numberOfLines={1}>
                        {lockType === 'NONE' ? 'None' : (lockSummary || lockLabel)}
                      </Text>
                      <ChevronDown size={rf(18)} color={INK} strokeWidth={2} style={{ transform: [{ rotate: lockOpen ? '180deg' : '0deg' }] }} />
                    </Pressable>
                    {lockOpen ? (
                      <View style={{ paddingHorizontal: rs(12), paddingBottom: rs(8) }}>
              {lockOptions.map((o) => {
                const on = lockType === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => pickLock(o.key)}
                    className="flex-row items-center"
                    style={{ minHeight: rs(40), paddingVertical: rs(6) }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={o.label}
                  >
                    <View
                      style={{
                        height: rs(20), width: rs(20), borderRadius: rs(10), alignItems: 'center', justifyContent: 'center',
                        backgroundColor: on ? ACCENT : '#FFFFFF', borderWidth: on ? 0 : 1.5, borderColor: '#B8B8B8',
                      }}
                    >
                      {on ? <MaterialIcons name="check" size={rf(14)} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={{ flex: 1, marginLeft: rs(10), fontSize: rf(14), color: INK }} numberOfLines={1}>{o.label}</Text>
                    {on && o.key !== 'NONE' ? (
                      <Text style={{ fontSize: rf(12.5), color: MUTED, marginLeft: rs(8), maxWidth: '45%' }} numberOfLines={1}>
                        {lockSummary}  <Text style={{ color: ACCENT, fontWeight: '700' }}>Edit</Text>
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
              {lockOptions.length > 1 ? (
                <>
              <DeviceSecurityLockSheet
                visible={!!lockSheet}
                types={lockOptions.map((o) => o.key)}
                initialLock={lockSheet}
                showProgress={false}
                entryOnly
                onConfirm={(l) => { setLockType(l.type); setLockValue(l.value || ''); setLockSheet(null); }}
                onClose={() => setLockSheet(null)}
              />
                </>
              ) : null}
            </View>
          ) : null}

          {/* ── Booking & Delivery — booking time is now; Estimated Delivery is
              picked as a calendar date + clock time (Material pickers), so a
              repair can be set hours or days (7, 9…) ahead. ──────────────── */}
          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16) }}>
            <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK, marginBottom: rs(8) }}>Booking & Delivery</Text>
            <View style={[card, { paddingHorizontal: rs(12), paddingVertical: rs(4) }]}>
              <View className="flex-row items-center" style={{ minHeight: rs(42) }}>
                <MaterialIcons name="event-available" size={rf(19)} color={INK} />
                <Text style={{ flex: 1, marginLeft: rs(8), fontSize: rf(13), color: MUTED }}>Booking Time</Text>
                <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: INK }} numberOfLines={1}>{dayWord(now)}, {timeLabel}</Text>
              </View>
            </View>
            <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: INK, marginTop: rs(10), marginBottom: rs(6) }}>Estimated Delivery</Text>
            <View className="flex-row" style={{ gap: rs(8) }}>
              <Pressable
                onPress={openDatePicker}
                accessibilityRole="button"
                accessibilityLabel={`Delivery date ${formatDateLong(delivery)}. Change.`}
                className="flex-row items-center active:opacity-80"
                style={{ flex: 1.2, height: rs(46), borderWidth: 1, borderColor: LINE, borderRadius: rs(12), backgroundColor: SCREEN_BG, paddingHorizontal: rs(10) }}
              >
                <MaterialIcons name="calendar-month" size={rf(19)} color={ACCENT} />
                <Text style={{ flex: 1, marginLeft: rs(8), fontSize: rf(13.5), fontWeight: '700', color: INK }} numberOfLines={1}>
                  {dayWord(delivery) === formatDate(delivery) ? formatDateLong(delivery) : `${dayWord(delivery)}, ${formatDate(delivery)}`}
                </Text>
              </Pressable>
              <Pressable
                onPress={openTimePicker}
                accessibilityRole="button"
                accessibilityLabel={`Delivery time ${deliveryTimeLabel}. Change.`}
                className="flex-row items-center active:opacity-80"
                style={{ flex: 0.8, height: rs(46), borderWidth: 1, borderColor: LINE, borderRadius: rs(12), backgroundColor: SCREEN_BG, paddingHorizontal: rs(10) }}
              >
                <MaterialIcons name="schedule" size={rf(19)} color={ACCENT} />
                <Text style={{ flex: 1, marginLeft: rs(8), fontSize: rf(13.5), fontWeight: '700', color: INK }} numberOfLines={1}>{deliveryTimeLabel}</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: rs(5) }}>
              Ready in {spanLabel} from booking
            </Text>
          </View>


          <View style={{ paddingHorizontal: rs(16), paddingTop: rs(6) }}>
            <View style={{ marginTop: rs(10) }}>

              {/* Customer approval */}
              <Pressable
                onPress={() => setApproval(!approval)}
                className="flex-row items-center active:opacity-80"
                style={{
                  marginTop: rs(10), borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(9),
                  backgroundColor: approval ? ACCENT_08 : SCREEN_BG,
                  borderWidth: 1,
                  borderColor: approval ? ACCENT_30 : LINE,
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: approval }}
              >
                {approval
                  ? <CircleCheck size={rf(20)} color={ACCENT} strokeWidth={2} />
                  : <Circle size={rf(20)} color="#D1D5DB" strokeWidth={2} />}
                <View className="flex-1" style={{ marginLeft: rs(10) }}>
                  <Text className="text-text" style={{ fontSize: rf(12), fontWeight: '600' }}>
                    {params.reEstimate ? 'Customer Re-Estimate Approval' : 'Customer Booking Approval'}
                  </Text>
                  <Text className="text-text-muted" style={{ fontSize: rf(11), marginTop: rs(1) }}>
                    {params.reEstimate
                      ? 'Customer has reviewed and approved the revised services, updated service cost, and expected completion time.'
                      : 'Customer has reviewed and approved the booking details, estimated service cost, and expected completion time.'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* ── Footer — Next only (the header arrow goes back) ───────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: 0, paddingBottom: insets.bottom + rs(10), paddingHorizontal: rs(16), paddingTop: rs(10), backgroundColor: SCREEN_BG, borderTopWidth: 1, borderTopColor: LINE }}
      >
        <View style={colStyle}>
          <View className="flex-row" style={{ gap: rs(10) }}>
            {canAddAnother ? (
              <Pressable
                onPress={onAddAnother}
                disabled={!isReady}
                className="flex-1 flex-row items-center justify-center active:opacity-85"
                style={{ height: rs(48), borderRadius: rs(12), borderWidth: 1.5, borderColor: ACCENT, backgroundColor: '#FFFFFF', opacity: isReady ? 1 : 0.45 }}
                accessibilityRole="button"
                accessibilityLabel="Add another device"
                accessibilityState={{ disabled: !isReady }}
              >
                <Plus size={rf(17)} color={ACCENT} strokeWidth={2.4} />
                <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: ACCENT, marginLeft: rs(6) }} numberOfLines={1}>Add Another Device</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onContinue}
              disabled={!isReady}
              className="flex-1 flex-row items-center justify-center active:opacity-85"
              style={{ height: rs(48), borderRadius: rs(12), backgroundColor: ACCENT, opacity: isReady ? 1 : 0.45 }}
              accessibilityRole="button"
              accessibilityLabel="Save and continue"
              accessibilityState={{ disabled: !isReady }}
            >
              <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>Save & Continue</Text>
              <ArrowRight size={rf(17)} color="#FFFFFF" strokeWidth={2.25} style={{ marginLeft: rs(6) }} />
            </Pressable>
          </View>

          {!isReady ? (
            <Text className="text-text-muted text-center" style={{ fontSize: rf(12), marginTop: rs(6) }}>
              {uploadingAudio
                ? 'Uploading voice note…'
                : isRecording
                ? 'Stop the recording first.'
                : photoUploading
                ? 'Uploading device media…'
                : !services.length
                ? 'Select at least one repair issue.'
                : !hasIssue
                ? 'Add an issue description to continue.'
                : !imeiOk
                ? 'IMEI must be 14–17 digits, or leave it empty.'
                : params.reEstimate ? 'Confirm customer re-estimate approval to continue.' : 'Confirm customer approval to continue.'}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── Header overflow ──────────────────────────────────────────── */}
      <ResponsiveModal visible={menuOpen} onClose={() => setMenuOpen(false)} maxWidth={420}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: rs(14) }} />
        <Pressable
          onPress={clearEstimate}
          className="flex-row items-center active:opacity-70"
          style={{ paddingVertical: rs(12) }}
          accessibilityRole="button"
        >
          <View
            className="items-center justify-center"
            style={{ height: rs(38), width: rs(38), borderRadius: rs(10), backgroundColor: SOFT, marginRight: rs(12) }}
          >
            <Eraser size={rf(18)} color={ACCENT} strokeWidth={2} />
          </View>
          <View className="flex-1">
            <Text className="text-text" style={{ fontSize: rf(13), fontWeight: '600' }}>Clear this estimate</Text>
            <Text className="text-text-muted" style={{ fontSize: rf(12), marginTop: rs(1) }}>
              Resets IMEI, issue, voice note, duration and approval.
            </Text>
          </View>
        </Pressable>
      </ResponsiveModal>

      {/* ── Delivery date / time — Material 3 date picker and clock-dial time
          picker (components/MaterialPickers). Earlier than booking is refused. */}
      <ResponsiveModal visible={pickerMode === 'date'} onClose={() => setPickerMode(null)} maxWidth={420} edgeToEdge>
        <MaterialDatePicker
          title="Select delivery date"
          day={edDay}
          onDayChange={setEdDay}
          minDay={now}
          error={edValid ? null : 'That’s before the booking time — pick a later date or time.'}
          onCancel={() => setPickerMode(null)}
          onOk={applyPicker}
        />
      </ResponsiveModal>
      <ResponsiveModal visible={pickerMode === 'time'} onClose={() => setPickerMode(null)} maxWidth={420} edgeToEdge>
        <MaterialTimePicker
          title="Select delivery time"
          hour12={edHour12}
          minute={edMinute}
          meridiem={edMeridiem}
          onHour={setEdHour12}
          onMinute={setEdMinute}
          onMeridiem={setEdMeridiem}
          error={edValid ? null : 'That’s before the booking time — pick a later time.'}
          onCancel={() => setPickerMode(null)}
          onOk={applyPicker}
        />
      </ResponsiveModal>

      {/* ── Add / manage device media — Add Media: Photo | Video tiles, then
          Choose from Gallery / Take Photo (or Record Video). ──────────── */}
      <ResponsiveModal visible={!!mediaSheet} onClose={() => setMediaSheet(null)} maxWidth={480} edgeToEdge>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: rs(12) }} />
        <View className="flex-row items-center" style={{ marginBottom: rs(10) }}>
          {(mediaSheet?.mode === 'add' && mediaSheet.kind) || mediaSheet?.mode === 'replace' ? (
            <Pressable
              onPress={() => setMediaSheet(mediaSheet.mode === 'replace' ? { ...mediaSheet, mode: 'item' } : { mode: 'add' })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="items-center justify-center active:opacity-70"
              style={{ height: rs(32), width: rs(32), borderRadius: rs(16), marginRight: rs(8), backgroundColor: PAGE_BG }}
            >
              <MaterialIcons name="arrow-back" size={rf(20)} color={INK} />
            </Pressable>
          ) : null}
          <Text style={{ flex: 1, fontSize: rf(16), fontWeight: '800', color: INK }} numberOfLines={1}>
            {mediaSheet?.mode === 'item'
              ? (mediaSheet.kind === 'video' ? 'Video' : `Photo ${mediaSheet.index + 1}`)
              : mediaSheet?.mode === 'replace'
                ? (mediaSheet.kind === 'video' ? 'Replace Video' : `Replace Photo ${mediaSheet.index + 1}`)
                : mediaSheet?.kind === 'video' ? 'Add Video' : mediaSheet?.kind === 'photo' ? 'Add Photo' : 'Add Media'}
          </Text>
        </View>

        {mediaSheet?.mode === 'item' ? (
          <>
            <SheetOption
              icon={mediaSheet.kind === 'video' ? 'play-circle-outline' : 'visibility'}
              label={mediaSheet.kind === 'video' ? 'Play Video' : 'Preview'}
              onPress={() => previewMedia(mediaSheet.kind, mediaSheet.index)}
            />
            <SheetOption icon="autorenew" label="Replace" onPress={() => setMediaSheet({ ...mediaSheet, mode: 'replace' })} />
            <SheetOption icon="delete-outline" label="Remove" danger onPress={() => { removeMedia(mediaSheet.kind, mediaSheet.index); setMediaSheet(null); }} />
          </>
        ) : mediaSheet?.kind ? (
          // Second step (add or replace): where the photo / video comes from.
          <>
            <SheetOption
              icon="photo-library"
              label="Choose from Gallery"
              onPress={() => chooseMedia(mediaSheet.kind, false, mediaSheet.mode === 'replace' ? { index: mediaSheet.index } : {})}
            />
            <SheetOption
              icon={mediaSheet.kind === 'video' ? 'videocam' : 'photo-camera'}
              label={mediaSheet.kind === 'video' ? 'Record Video' : 'Take Photo'}
              onPress={() => chooseMedia(mediaSheet.kind, true, mediaSheet.mode === 'replace' ? { index: mediaSheet.index } : {})}
            />
          </>
        ) : (
          // First step: Photo or Video, as two tiles.
          <View className="flex-row" style={{ gap: rs(12) }}>
            {[['photo', 'photo-camera', 'Photo', canAddPhoto ? `${photoUrls.length} of ${PHOTO_KEYS.length} added` : '5 photos added'],
              ['video', 'videocam', 'Video', videoUrl ? 'Replaces the current video' : 'Optional · up to 15 s']].map(([kind, icon, title, hint]) => {
              const off = kind === 'photo' && !canAddPhoto;
              return (
                <Pressable
                  key={kind}
                  onPress={() => setMediaSheet({ mode: 'add', kind })}
                  disabled={off}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${title}`}
                  className="flex-1 items-center justify-center active:opacity-80"
                  style={{
                    minHeight: rs(124), paddingVertical: rs(14), paddingHorizontal: rs(8), borderRadius: rs(16),
                    borderWidth: 1, borderColor: LINE, backgroundColor: SCREEN_BG, opacity: off ? 0.45 : 1,
                  }}
                >
                  <View className="items-center justify-center" style={{ height: rs(52), width: rs(52), borderRadius: rs(26), backgroundColor: MINT }}>
                    <MaterialIcons name={icon} size={rf(28)} color={ACCENT} />
                  </View>
                  <Text style={{ marginTop: rs(8), fontSize: rf(15), fontWeight: '800', color: INK }}>{title}</Text>
                  <Text style={{ marginTop: rs(2), fontSize: rf(11.5), color: MUTED, textAlign: 'center' }} numberOfLines={2}>{hint}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={() => setMediaSheet(null)}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-80"
          style={{ marginTop: rs(12), height: rs(46), borderRadius: rs(12), borderWidth: 1, borderColor: LINE, backgroundColor: SCREEN_BG }}
        >
          <Text style={{ fontSize: rf(14), fontWeight: '700', color: INK }}>Cancel</Text>
        </Pressable>
      </ResponsiveModal>

      <ImageViewerModal
        visible={preview !== null}
        images={photoUrls.map((u, i) => ({ uri: u, label: `Photo ${i + 1}` }))}
        index={preview || 0}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

/** One row of the media bottom sheet: Material icon in a tinted circle + label. */
function SheetOption({ icon, label, onPress, danger = false, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="flex-row items-center active:opacity-70"
      style={{ minHeight: rs(54), opacity: disabled ? 0.4 : 1 }}
    >
      <View style={{ height: rs(40), width: rs(40), borderRadius: rs(20), alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? 'rgba(220, 38, 38, 0.10)' : MINT }}>
        <MaterialIcons name={icon} size={rf(21)} color={danger ? '#DC2626' : ACCENT} />
      </View>
      <Text style={{ flex: 1, marginLeft: rs(14), fontSize: rf(14.5), fontWeight: '600', color: danger ? '#DC2626' : INK }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Dropdown well for hour / minute / AM-PM.
 *
 * The height lives HERE and not only on `h-full` inside the Select: if that
 * class is ever missing from the compiled stylesheet, the Select still sits
 * centred in a correctly sized well instead of collapsing the row.
 */
const timeWell = {
  height: rs(42),
  borderRadius: rs(10),
  overflow: 'hidden',
  backgroundColor: SOFT,
  justifyContent: 'center',
};

/**
 * Every card on this page.
 *
 * The page is white, so a shadow alone cannot separate a white card from it —
 * the hairline border is what makes the edges visible.
 */
const card = {
  backgroundColor: SCREEN_BG,
  borderRadius: rs(14),
  borderWidth: 1,
  borderColor: LINE,
};

/** Accent-tinted pill: model number, "N services added". */
const chip = {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: ACCENT_08,
  borderRadius: 999,
  paddingHorizontal: rs(10),
  paddingVertical: rs(4),
};
