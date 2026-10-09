import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, TextInput, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordingPresets, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import {
  ArrowLeft,
  MoreHorizontal,
  Smartphone,
  Hash,
  ScanLine,
  ReceiptText,
  Calendar,
  Timer,
  Truck,
  ShieldCheck,
  CircleCheck,
  Circle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Tag,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Eraser,
  Wrench,
  HelpCircle,
} from 'lucide-react-native';
import { Select } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ResponsiveModal } from '../../../components/responsive';
import { useResponsive } from '../../../theme/responsive';
import { rf, rs } from '../../../utils/responsive';
import { uploadMedia } from '../../../api/masterData';
import { specDisplayParts } from '../../../utils/deviceSpecs';

/**
 * Service Price & Issue Estimate.
 *
 * Laid out from the supplied reference: sectioned cards on a white page, each
 * section introduced by an icon + uppercase label + a hairline rule, and a
 * split footer (total on the left, Continue pill on the right) rather than one
 * full-bleed bar.
 *
 * GGFIX palette: #09AD2A for fills / icons / selected states, #078F23 for green
 * TEXT on white or mint (so it stays legible), #EAF8EC tints with a #CDEFD4 edge,
 * on a #F8F8F8 page with compact white cards.
 */
const ACCENT = '#09AD2A';       // fills, icons, selected
const ACCENT_TEXT = '#078F23';  // green text on white / mint
const ACCENT_08 = '#EAF8EC';    // light green tint
const ACCENT_30 = '#CDEFD4';    // light green border

const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const SUBTLE = '#8A8A8A';
const RED = '#F84141';
const RED_TINT = '#FEECEC';
const RED_LINE = '#FBD0D0';
const RED_TEXT = '#D63232';

const PAGE_BG = '#F8F8F8';
const SCREEN_BG = '#FFFFFF';   // card / input / sheet white
const MINT = '#EAF8EC';
const SOFT = '#F3F3F3';
const LINE = '#E6E6E6';        // input + bar borders
const HAIR = '#F3F3F3';        // card hairline on the grey page
/** One height for every single-line field, so the rows line up across sections. */
const FIELD_H = 42;   // pass through rs() at each use site

const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 12, 24, 48].map((h) => ({ value: h, label: `${h} hr` }));

const formatINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatDate = (d) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

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

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

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

// A native date/time picker would need @react-native-community/datetimepicker,
// and android/ is committed here, so a new native module means a full rebuild
// before anyone could use it. The calendar and dropdowns below are pure JS.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HOUR_OPTS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1, label: String(i + 1).padStart(2, '0'),
}));
// 00-59. There is no :60 — that IS the next hour, and offering it would let the
// sheet build a time an hour away from the one it displays.
const MINUTE_OPTS = Array.from({ length: 60 }, (_, m) => ({
  value: m, label: String(m).padStart(2, '0'),
}));
const MERIDIEM_OPTS = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];

/** One popup width for hour, minute and AM/PM, so they don't resize between taps. */
const TIME_MENU_W = 130;


export default function ServicePriceEstimateScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const services = params.services || [];
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
  const [imei, setImei] = useState(params.prefillImei || '');
  const [complaint, setComplaint] = useState(params.prefillComplaint || '');
  const [duration, setDuration] = useState(() => {
    if (params.prefillEstimatedReadyIso && params.prefillEstimatedDeliveryIso) {
      const ms = new Date(params.prefillEstimatedDeliveryIso) - new Date(params.prefillEstimatedReadyIso);
      const hrs = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
      if (DURATIONS.some((d) => d.value === hrs)) return hrs;
    }
    return 2;
  });
  const [approval, setApproval] = useState(params.prefillCustomerApproved ?? false);
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

  const openReadyEditor = () => {
    const d = delivery;
    setEdDay(startOfDay(d));
    setCalMonth(startOfMonth(d));
    const h = d.getHours();
    setEdMeridiem(h >= 12 ? 'PM' : 'AM');
    setEdHour12(h % 12 || 12);
    // Exact minute now that all 60 are selectable — the old 15-minute snap
    // could shift a re-opened estimate by up to 7 minutes.
    setEdMinute(d.getMinutes());
    setEdOpen(true);
  };

  const applyReady = () => {
    if (!edValid) return;
    setReadyOverride(edDate);
    setEdOpen(false);
  };

  const clearReady = () => {
    setReadyOverride(null);
    setEdOpen(false);
  };

  // Continue allowed once the user has SOME description of the issue (text or
  // audio) AND has explicitly toggled customer approval. Don't gate on IMEI —
  // it's optional and not every device has one (laptops, audio gear).
  const hasIssue = complaint.trim().length > 0 || !!audioUrl;
  const isReady = hasIssue && approval && !uploadingAudio && !isRecording;

  const onContinue = () => {
    if (!isReady) return;
    navigation.navigate('DeviceInformation', {
      ...params,
      imei: imei.trim(),
      complaint: complaint.trim(),
      issueAudioUrl: audioUrl || null,
      estimatedAt: `${dateLabel} ${timeLabel}, ${effectiveHours}Hr`,
      estimatedDelivery: `${deliveryDateLabel} - ${deliveryTimeLabel}`,
      estimatedReadyIso: now.toISOString(),
      estimatedDeliveryIso: delivery.toISOString(),
      durationHours: effectiveHours,
      customerApproved: approval,
    });
  };

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
    : 'Record a voice note (optional)';

  // Tablets get a capped, centred column; a 1024pt-wide bill row is unreadable.
  const colStyle = r.isTablet
    ? { width: '100%', maxWidth: 900, alignSelf: 'center' }
    : null;

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      {/* ── Header — back · title · overflow ─────────────────────────── */}
      <View
        style={{
          backgroundColor: SCREEN_BG,
          paddingTop: insets.top + rs(10),
          paddingBottom: rs(14),
          paddingHorizontal: rs(16),
        }}
      >
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, colStyle]}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="active:opacity-70"
            style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={rf(20)} color="#172117" strokeWidth={2} />
          </Pressable>

          <Text
            className="flex-1 text-text text-center"
            style={{ fontSize: 17, fontWeight: '800', paddingHorizontal: rs(8) }}
            numberOfLines={1}
          >
            Service Price & Issue Estimate
          </Text>

          <Pressable
            onPress={() => setMenuOpen(true)}
            className="active:opacity-70"
            style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MoreHorizontal size={rf(20)} color="#172117" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: rs(150) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={colStyle}>
          {/* ── Device summary — plain white card, image well,
              optional brand text, and a trailing chevron. ────────────────── */}
          <View style={{ paddingHorizontal: rs(14) }}>
            <View style={[card, { padding: rs(11) }]}>
              <View className="flex-row items-center">
                <View
                  style={{
                    height: rs(48), width: rs(48), borderRadius: rs(14), backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: LINE,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: rs(10),
                  }}
                >
                  {params.imageUrl ? (
                    <Image source={{ uri: params.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Smartphone size={rf(21)} color={ACCENT} strokeWidth={2} />
                  )}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="flex-1 text-text" style={{ fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                      {params.modelName || 'Device'}
                    </Text>
                    {params.brandName ? (
                      <Text className="text-text-muted" style={{ fontSize: 11, fontWeight: '600', marginLeft: rs(6) }} numberOfLines={1}>
                        {params.brandName}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-text-muted" style={{ fontSize: 12, marginTop: rs(2) }} numberOfLines={1}>
                    {specDisplayParts(params, { withColor: true }).join(' · ')}
                  </Text>
                  <View className="flex-row items-center flex-wrap" style={{ marginTop: rs(8) }}>
                    {params.modelNumber ? (
                      <View style={[chip, { marginRight: rs(8) }]}>
                        <Hash size={rf(10)} color={ACCENT} strokeWidth={2.5} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: ACCENT, marginLeft: rs(3) }}>
                          {params.modelNumber}
                        </Text>
                      </View>
                    ) : null}
                    <View style={chip}>
                      <Wrench size={rf(10)} color={ACCENT} strokeWidth={2.5} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: ACCENT, marginLeft: rs(4) }}>
                        {services.length} service{services.length === 1 ? '' : 's'} added
                      </Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={rf(16)} color="#B8C4BE" strokeWidth={2} style={{ marginLeft: rs(4) }} />
              </View>
            </View>
          </View>

          {/* ── Bill details ───────────────────────────────────────────────
              "N item(s)" is real data (services.length). "+ Add Service"
              and per-row delete are NOT added — this screen has no
              add/remove-service capability of its own (it only ever reads
              `params.services`, set on the previous screen); wiring a fake
              button or building new local remove-state here would change
              what actually reaches `total`/`onContinue`, which the brief
              explicitly rules out. See the final report for the full note. */}
          <SectionHeader
            icon={ReceiptText}
            label="Bill Details"
            subtitle="Services selected for this device"
            right={(
              <View
                className="items-center"
                style={{ borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: ACCENT_08 }}
              >
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: ACCENT }}>
                  {services.length} item{services.length === 1 ? '' : 's'}
                </Text>
              </View>
            )}
          />
          <View style={{ paddingHorizontal: rs(16) }}>
            <View style={[card, { padding: rs(10) }]}>
              {services.map((s, i) => (
                <View
                  key={i}
                  className="flex-row items-center"
                  style={{
                    paddingVertical: rs(6),
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: '#F2F5F3',
                  }}
                >
                  <View
                    style={{
                      height: rs(30), width: rs(30), borderRadius: rs(9), backgroundColor: MINT,
                      alignItems: 'center', justifyContent: 'center', marginRight: rs(10),
                    }}
                  >
                    <Wrench size={rf(13)} color={ACCENT} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-text" style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{s.serviceName}</Text>
                    {/* Real data only — warranty, when the service carries
                        one; no fabricated issue-description subtitle (that
                        field doesn't exist on this object). */}
                    {s.warranty ? (
                      <Text className="text-text-muted" style={{ fontSize: 11, marginTop: rs(1) }} numberOfLines={1}>
                        Warranty: {s.warranty}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-text" style={{ fontSize: 13, fontWeight: '700' }}>₹{formatINR(s.price)}</Text>
                </View>
              ))}
              {services.length === 0 ? (
                <View className="items-center" style={{ paddingVertical: rs(14) }}>
                  <Text className="text-text-muted" style={{ fontSize: 12 }}>No services selected.</Text>
                </View>
              ) : null}

              <View
                style={{
                  marginTop: rs(10), borderRadius: rs(12), padding: rs(10),
                  backgroundColor: MINT,
                }}
              >
                <View className="flex-row items-center">
                  <Tag size={rf(14)} color={ACCENT} strokeWidth={2} />
                  <Text className="flex-1 text-text" style={{ fontSize: 13, fontWeight: '700', marginLeft: rs(7) }}>
                    Estimated Total
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: ACCENT }}>₹{formatINR(total)}</Text>
                </View>
                <Text className="text-text-muted" style={{ fontSize: 11, marginTop: rs(3) }}>
                  Final amount may vary slightly based on parts availability.
                </Text>
              </View>
            </View>
          </View>

          {/* ── Device IMEI ────────────────────────────────────────────── */}
          <SectionHeader
            icon={ScanLine}
            label="Device IMEI"
            right={(
              <View className="flex-row items-center">
                <HelpCircle size={rf(12)} color="#8FA08F" strokeWidth={2} />
                <Text className="text-text-muted" style={{ fontSize: 11, fontWeight: '600', marginLeft: rs(4) }}>
                  Where to find IMEI?
                </Text>
              </View>
            )}
          />
          <View style={{ paddingHorizontal: rs(16) }}>
            {/* Scan sits BESIDE the field, not inside its border — inside, the
                pill ate the right third of a 15-digit number on a 360pt phone. */}
            <View className="flex-row items-center">
              <View
                className="flex-1 flex-row items-center"
                style={{
                  borderWidth: 1, borderColor: LINE, borderRadius: rs(14),
                  backgroundColor: SCREEN_BG, paddingHorizontal: rs(12), marginRight: rs(8),
                }}
              >
                <ScanLine size={rf(15)} color="#8FA08F" strokeWidth={2} style={{ marginRight: rs(6) }} />
                <TextInput
                  className="text-text flex-1"
                  placeholder="Enter 15-digit IMEI"
                  placeholderTextColor="#8FA08F"
                  value={imei}
                  onChangeText={setImei}
                  keyboardType="number-pad"
                  maxLength={17}
                  style={{ height: rs(FIELD_H), paddingVertical: 0, fontSize: 13 }}
                />
              </View>
              <Pressable
                onPress={() => navigation.navigate('ScanImei', { onScan: (value) => setImei(value) })}
                className="flex-row items-center justify-center active:opacity-80"
                style={{
                  height: rs(FIELD_H), backgroundColor: MINT, borderRadius: rs(14),
                  paddingHorizontal: rs(14),
                }}
                accessibilityRole="button"
                accessibilityLabel="Scan IMEI barcode"
              >
                <ScanLine size={rf(15)} color={ACCENT} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: ACCENT, marginLeft: rs(5) }}>Scan</Text>
              </Pressable>
            </View>
            {/* Same tip text as before, always visible — now a soft mint
                info strip instead of plain muted text below the field. */}
            <View
              className="flex-row items-center"
              style={{ marginTop: rs(8), borderRadius: rs(10), padding: rs(9), backgroundColor: MINT }}
            >
              <HelpCircle size={rf(13)} color={ACCENT} strokeWidth={2} />
              <Text className="text-text" style={{ fontSize: 11, marginLeft: rs(7), lineHeight: rf(16), flex: 1 }}>
                Tip: dial <Text style={{ fontWeight: '700' }}>*#06#</Text> on the device to display IMEI as a barcode.
              </Text>
            </View>
          </View>

          {/* ── Issue description ──────────────────────────────────────── */}
          <SectionHeader icon={Pencil} label="Issue Description" subtitle="Type the issue, or record the customer explaining it" />
          <View style={{ paddingHorizontal: rs(16) }}>
            <TextInput
              className="text-text"
              placeholder="What's wrong with the device? e.g. Screen cracked, battery drains fast…"
              placeholderTextColor="#8FA08F"
              value={complaint}
              onChangeText={setComplaint}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{
                minHeight: rs(78), fontSize: 13, lineHeight: rf(19),
                borderWidth: 1, borderColor: LINE, borderRadius: rs(14),
                paddingHorizontal: rs(12), paddingTop: rs(10), paddingBottom: rs(10),
              }}
            />
            {/* Display-only counter — no maxLength was added to the input
                above, so this never blocks or truncates typing; it's purely
                informational, same as the rest of this pass. */}
            <Text className="text-text-muted" style={{ fontSize: 10.5, textAlign: 'right', marginTop: rs(4) }}>
              {complaint.length}/500
            </Text>
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
                  <Text className="text-text" style={{ fontSize: 13, fontWeight: '700' }}>
                    Record Voice Note
                  </Text>
                  <Text className="text-text-muted" style={{ fontSize: 12, marginTop: rs(1) }} numberOfLines={1}>
                    {voiceHint}
                  </Text>
                </View>
                {voiceExpanded
                  ? <ChevronDown size={rf(18)} color="#8FA08F" strokeWidth={2} />
                  : <ChevronRight size={rf(18)} color="#8FA08F" strokeWidth={2} />}
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
                        <Text className="text-danger" style={{ fontSize: 12, fontWeight: '600' }}>Recording…</Text>
                        <Text className="text-danger" style={{ fontSize: 11, fontWeight: '500' }}>{recLabel}</Text>
                      </View>
                      <Pressable
                        onPress={stopRecording}
                        className="flex-row items-center active:opacity-80"
                        style={{ backgroundColor: '#DC2626', borderRadius: rs(999), paddingHorizontal: rs(14), paddingVertical: rs(8) }}
                      >
                        <Square size={rf(12)} color="#fff" fill="#fff" />
                        <Text className="text-white" style={{ fontSize: 12, fontWeight: '600', marginLeft: rs(6) }}>STOP</Text>
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
                        <Text className="text-text" style={{ fontSize: 13, fontWeight: '600' }}>Voice note attached</Text>
                        <Text className="text-text-muted" style={{ fontSize: 12 }}>
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
                      <Text className="text-white" style={{ fontSize: 13, fontWeight: '600', marginLeft: rs(8) }}>
                        Record voice note
                      </Text>
                    </Pressable>
                  )}
                </View>
            ) : null}
            </View>
          </View>

          {/* ── Estimated delivery — a horizontal 3-segment mini-timeline
              (Received → Duration → Ready By) with small connector arrows,
              replacing the previous "two fields in a row, one field below"
              layout. Every interactive element (the Duration Select, the
              Ready By editor Pressable) is the exact same component/handler
              as before — only the surrounding layout changed. ────────────── */}
          {/* Edit moved into the section header's right slot per this pass's
              explicit request — same `openReadyEditor` handler as the
              standalone Edit row used to call, just repositioned. */}
          <SectionHeader
            icon={Truck}
            label="Estimated Delivery"
            right={(
              <Pressable
                onPress={openReadyEditor}
                className="flex-row items-center active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel="Edit ready-by time"
              >
                <Pencil size={rf(12)} color={ACCENT} strokeWidth={2} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: ACCENT, marginLeft: rs(4) }}>Edit</Text>
              </Pressable>
            )}
          />
          <View style={{ paddingHorizontal: rs(16) }}>
            {/* Each card is icon-LEFT / content-RIGHT, with the icon in a
                fixed-width column vertically centred against the WHOLE
                3-line text stack (label + date + time) — not just centred
                against the label's own row, which is what still read as
                "icon floating above the content" even after the icon was
                already technically inline with the caption. `items-stretch`
                on the row (not `items-center`) is what keeps all 3 cards the
                same height regardless of label-wrap differences. */}
            <View className="flex-row items-stretch">
              {/* Received */}
              <View
                className="flex-1 flex-row items-center"
                style={{ borderRadius: rs(12), backgroundColor: MINT, paddingVertical: rs(9), paddingHorizontal: rs(9) }}
              >
                <View style={{ width: rs(20), alignItems: 'center' }}>
                  <Calendar size={rf(15)} color={ACCENT} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginLeft: rs(6) }}>
                  <Text className="text-text-muted" style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 0.8 }} numberOfLines={1}>RECEIVED</Text>
                  <Text className="text-text" style={{ fontSize: 11, fontWeight: '700', marginTop: rs(3) }} numberOfLines={1}>{dateLabel}</Text>
                  <Text className="text-text-muted" style={{ fontSize: 10, marginTop: rs(1) }} numberOfLines={1}>{timeLabel}</Text>
                </View>
              </View>

              <ChevronRight size={rf(14)} color="#B8C4BE" strokeWidth={2.5} style={{ marginHorizontal: rs(4), alignSelf: 'center' }} />

              {/* Duration — same Select, same handler, now the middle
                  segment of the timeline instead of a separate side field. */}
              <View
                className="flex-1 flex-row items-center"
                style={{ borderRadius: rs(12), backgroundColor: MINT, paddingVertical: rs(9), paddingHorizontal: rs(9) }}
              >
                <View style={{ width: rs(20), alignItems: 'center' }}>
                  <Timer size={rf(15)} color={ACCENT} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginLeft: rs(6) }}>
                  <Text className="text-text-muted" style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 0.8 }} numberOfLines={1}>DURATION</Text>
                  {/* With an override in force there is no matching option,
                      so Select falls back to `displayValue` — the derived
                      span. Choosing an hour from the list clears the
                      override, which is what puts the two back in sync. */}
                  <View style={{ marginTop: rs(3), alignSelf: 'flex-start' }}>
                    <Select
                      value={readyOverride ? null : duration}
                      displayValue={spanLabel}
                      options={DURATIONS}
                      menuWidth={rs(150)}
                      menuTitle="DURATION"
                      onChange={(v) => { setDuration(v); setReadyOverride(null); }}
                      className="py-0 px-0 bg-transparent border-0"
                    />
                  </View>
                </View>
              </View>

              <ChevronRight size={rf(14)} color="#B8C4BE" strokeWidth={2.5} style={{ marginHorizontal: rs(4), alignSelf: 'center' }} />

              {/* Ready by — same Pressable/openReadyEditor as before. */}
              <Pressable
                onPress={openReadyEditor}
                className="flex-1 flex-row items-center active:opacity-80"
                style={{ borderRadius: rs(12), backgroundColor: ACCENT, paddingVertical: rs(9), paddingHorizontal: rs(9) }}
                accessibilityRole="button"
                accessibilityLabel={'Ready by ' + deliveryDateLabel + ' ' + deliveryTimeLabel + '. Edit.'}
              >
                <View style={{ width: rs(20), alignItems: 'center' }}>
                  <ShieldCheck size={rf(15)} color="#fff" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginLeft: rs(6) }}>
                  <Text style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 0.8, color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>READY BY</Text>
                  <Text className="text-white" style={{ fontSize: 11, fontWeight: '700', marginTop: rs(3) }} numberOfLines={1}>{deliveryDateLabel}</Text>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: rs(1) }} numberOfLines={1}>{deliveryTimeLabel}</Text>
                </View>
              </Pressable>
            </View>

            <View className="flex-row items-center" style={{ marginTop: rs(8) }}>
              <View
                className="flex-row items-center"
                style={{ borderRadius: rs(999), paddingHorizontal: rs(8), paddingVertical: rs(3), backgroundColor: ACCENT_08 }}
              >
                <ShieldCheck size={rf(11)} color={ACCENT} strokeWidth={2} />
                <Text style={{ fontSize: 10, fontWeight: '600', color: ACCENT, marginLeft: rs(4) }}>ON TIME</Text>
              </View>
            </View>

            {readyOverride ? (
              <Text className="text-text-muted" style={{ fontSize: 11, marginTop: rs(5) }}>
                Set manually · {spanLabel} from now
              </Text>
            ) : null}

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
                  : <Circle size={rf(20)} color="#CBD5CB" strokeWidth={2} />}
                <View className="flex-1" style={{ marginLeft: rs(10) }}>
                  <Text className="text-text" style={{ fontSize: 12, fontWeight: '600' }}>Customer repair approval</Text>
                  <Text className="text-text-muted" style={{ fontSize: 11, marginTop: rs(1) }}>
                    Customer agreed to the estimated price & timing.
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Footer — total on the left, Continue pill on the right ────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: 0, paddingBottom: insets.bottom + rs(8), paddingHorizontal: rs(16), paddingTop: rs(10), backgroundColor: SCREEN_BG }}
      >
        <View style={colStyle}>
          <View
            className="flex-row items-center"
            style={{
              backgroundColor: SCREEN_BG,
              borderRadius: rs(18),
              borderWidth: 1,
              borderColor: LINE,
              paddingHorizontal: rs(14),
              paddingVertical: rs(10),
              shadowColor: '#172117',
              shadowOpacity: 0.08,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <View
              className="items-center justify-center"
              style={{ height: rs(38), width: rs(38), borderRadius: rs(12), backgroundColor: MINT, marginRight: rs(10) }}
            >
              <ReceiptText size={rf(17)} color={ACCENT} strokeWidth={2} />
            </View>

            <View className="flex-1">
              <Text className="text-text-muted" style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>
                ESTIMATED TOTAL
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: ACCENT }}>₹{formatINR(total)}</Text>
            </View>

            <Pressable
              onPress={onContinue}
              disabled={!isReady}
              className="flex-row items-center justify-center active:opacity-90"
              style={{
                backgroundColor: isReady ? ACCENT : '#B8C4BE',
                borderRadius: rs(16),
                paddingHorizontal: rs(22),
                paddingVertical: rs(14),
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isReady }}
            >
              <Text className="text-white" style={{ fontSize: 13, fontWeight: '600' }}>Continue</Text>
              <ChevronRight size={rf(18)} color="#fff" strokeWidth={2} />
            </Pressable>
          </View>

          {!isReady && (uploadingAudio || isRecording || hasIssue) ? (
            <Text className="text-text-muted text-center" style={{ fontSize: 12, marginTop: rs(6) }}>
              {uploadingAudio
                ? 'Uploading voice note…'
                : isRecording
                ? 'Stop the recording first.'
                : !approval
                ? 'Confirm customer approval to continue.'
                : 'Add an issue description to continue.'}
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
            <Text className="text-text" style={{ fontSize: 13, fontWeight: '600' }}>Clear this estimate</Text>
            <Text className="text-text-muted" style={{ fontSize: 12, marginTop: rs(1) }}>
              Resets IMEI, issue, voice note, duration and approval.
            </Text>
          </View>
        </Pressable>
      </ResponsiveModal>

      {/* ── Ready-by editor ──────────────────────────────────────────── */}
      <ResponsiveModal visible={edOpen} onClose={() => setEdOpen(false)} maxWidth={480}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: rs(14) }} />
        <Text className="text-text" style={{ fontSize: 15, fontWeight: '700' }}>Ready by</Text>
        <Text className="text-text-muted" style={{ fontSize: 12, marginTop: rs(2) }}>
          Pick the date and time the device will be ready. Duration follows it.
        </Text>

        {/* `flexShrink: 1` is what keeps the preview and the buttons reachable:
            it lets this region give up height inside the panel's own maxHeight
            when a 6-row month makes the content tall. ResponsiveModal's
            `scrollable` prop cannot do that — it wraps the panel from OUTSIDE,
            so the panel's maxHeight clips the overflow instead of scrolling it.
            That prop is why the old chip layout had to be squeezed to ~500pt. */}
        <ScrollView
          style={{ flexShrink: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Month header ──────────────────────────────────────── */}
          <View className="flex-row items-center" style={{ marginTop: rs(12) }}>
            <Pressable
              onPress={() => setCalMonth((m) => addMonths(m, -1))}
              disabled={!canPrev}
              className="active:opacity-70"
              style={{
                height: rs(32), width: rs(32), borderRadius: rs(9), backgroundColor: SOFT,
                alignItems: 'center', justifyContent: 'center', opacity: canPrev ? 1 : 0.35,
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <ChevronLeft size={rf(16)} color="#172117" strokeWidth={2} />
            </Pressable>
            <Text
              className="flex-1 text-text text-center"
              style={{ fontSize: 13, fontWeight: '700' }}
            >
              {MONTHS[calMonth.getMonth()]}, {calMonth.getFullYear()}
            </Text>
            <Pressable
              onPress={() => setCalMonth((m) => addMonths(m, 1))}
              className="active:opacity-70"
              style={{
                height: rs(32), width: rs(32), borderRadius: rs(9), backgroundColor: SOFT,
                alignItems: 'center', justifyContent: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <ChevronRight size={rf(16)} color="#172117" strokeWidth={2} />
            </Pressable>
          </View>

          {/* ── Weekday header ────────────────────────────────────── */}
          <View className="flex-row" style={{ marginTop: rs(10) }}>
            {WEEKDAYS.map((w) => (
              <Text
                key={w}
                className="flex-1 text-text-muted text-center"
                style={{ fontSize: 10.5, fontWeight: '600' }}
              >
                {w}
              </Text>
            ))}
          </View>

          {/* ── Day grid ──────────────────────────────────────────── */}
          {weeks.map((week, wi) => (
            <View key={wi} className="flex-row" style={{ marginTop: rs(4) }}>
              {week.map((d) => {
                const outside = d.getMonth() !== calMonth.getMonth();
                const past = d < today0;
                const sel = sameDay(d, edDay);
                return (
                  <Pressable
                    key={d.toISOString()}
                    onPress={() => setEdDay(startOfDay(d))}
                    disabled={past}
                    className="flex-1 items-center active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={formatDate(d)}
                    accessibilityState={{ selected: sel, disabled: past }}
                  >
                    <View
                      style={{
                        height: rs(32), width: rs(32), borderRadius: rs(16),
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: sel ? ACCENT : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: sel ? '700' : '500',
                          color: sel ? '#FFFFFF' : past ? '#C7CFC7' : outside ? '#8FA08F' : '#172117',
                        }}
                      >
                        {String(d.getDate()).padStart(2, '0')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* ── Time: hour + minute on the left, AM/PM on the right ── */}
          <View className="flex-row items-end" style={{ marginTop: rs(16) }}>
            <View style={{ width: rs(78) }}>
              <FieldLabel>HOUR</FieldLabel>
              <View style={timeWell}>
                <Select
                  value={edHour12}
                  options={HOUR_OPTS}
                  menuWidth={rs(TIME_MENU_W)}
                  menuTitle="HOUR"
                  onChange={(v) => setEdHour12(v)}
                  className="h-full py-0 px-3 bg-transparent border-0"
                />
              </View>
            </View>
            <View style={{ width: rs(78), marginLeft: rs(8) }}>
              <FieldLabel>MINUTE</FieldLabel>
              <View style={timeWell}>
                <Select
                  value={edMinute}
                  options={MINUTE_OPTS}
                  menuWidth={rs(TIME_MENU_W)}
                  menuTitle="MINUTE"
                  onChange={(v) => setEdMinute(v)}
                  className="h-full py-0 px-3 bg-transparent border-0"
                />
              </View>
            </View>
            <View className="flex-1" />
            <View style={{ width: rs(86) }}>
              <FieldLabel>AM / PM</FieldLabel>
              <View style={timeWell}>
                <Select
                  value={edMeridiem}
                  options={MERIDIEM_OPTS}
                  menuWidth={rs(TIME_MENU_W)}
                  menuTitle="AM / PM"
                  onChange={(v) => setEdMeridiem(v)}
                  className="h-full py-0 px-3 bg-transparent border-0"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View
          style={{
            marginTop: rs(14), borderRadius: rs(12), padding: rs(12),
            backgroundColor: edValid ? ACCENT_08 : 'rgba(220, 38, 38, 0.08)',
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: '700', color: edValid ? ACCENT : '#DC2626' }}
            numberOfLines={1}
          >
            {formatDate(edDate)} – {formatTime(edDate)}
          </Text>
          <Text className="text-text-muted" style={{ fontSize: 11, marginTop: rs(2) }}>
            {edValid
              ? formatSpan(Math.round((edDate - now) / 60000)) + ' from now'
              : 'That time has already passed — pick a later one.'}
          </Text>
        </View>

        <View className="flex-row" style={{ marginTop: rs(14) }}>
          <Pressable
            onPress={clearReady}
            className="flex-1 items-center justify-center active:opacity-70"
            style={{
              borderRadius: rs(14), paddingVertical: rs(13), marginRight: rs(10),
              borderWidth: 1, borderColor: ACCENT_30, backgroundColor: SCREEN_BG,
            }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: ACCENT }}>Use duration</Text>
          </Pressable>
          <Pressable
            onPress={applyReady}
            disabled={!edValid}
            className="flex-1 items-center justify-center active:opacity-90"
            style={{ borderRadius: rs(14), paddingVertical: rs(13), backgroundColor: edValid ? ACCENT : '#B8C4BE' }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !edValid }}
          >
            <Text className="text-white" style={{ fontSize: 13, fontWeight: '600' }}>Set ready by</Text>
          </Pressable>
        </View>
      </ResponsiveModal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function SectionHeader({ icon: Icon, label, subtitle, right }) {
  return (
    <View style={{ paddingHorizontal: rs(16), paddingTop: rs(16), paddingBottom: rs(8) }}>
      <View className="flex-row items-center">
        <Icon size={rf(15)} color={ACCENT} strokeWidth={2} />
        <Text
          className="text-text"
          style={{ fontSize: 12, fontWeight: '700', marginLeft: rs(7), flex: right ? 1 : undefined }}
        >
          {label}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text className="text-text-muted" style={{ fontSize: 12, marginTop: rs(6), marginLeft: rs(22) }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Small uppercase caption above each group of chips in the editor. */
function FieldLabel({ children }) {
  return (
    <Text
      className="text-text-muted"
      style={{ fontSize: 10.5, fontWeight: '600', letterSpacing: 1.2, marginBottom: rs(6) }}
    >
      {children}
    </Text>
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
