import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, TextInput, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import {
  ArrowLeft,
  Smartphone,
  Hash,
  ScanLine,
  ReceiptText,
  Clock,
  Calendar,
  Timer,
  Truck,
  ShieldCheck,
  CircleCheck,
  Circle,
  ChevronRight,
  Pencil,
  Tag,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
} from 'lucide-react-native';
import { Select } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { uploadMedia } from '../../../api/masterData';

// Swiggy / Zomato-inspired palette — green theme, matches the rest of the
// booking flow (Color/Storage, Services) so the whole journey feels continuous.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

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

export default function ServicePriceEstimateScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
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
  const recordingRef = useRef(null);
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
      try { recordingRef.current?.stopAndUnloadAsync?.(); } catch (_) {}
      try { soundRef.current?.unloadAsync?.(); } catch (_) {}
    };
  }, []);

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        notify('Microphone needed', 'Allow microphone access to record the customer\'s issue.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
    } catch (e) {
      notify('Could not start recording', e?.message || 'Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      const rec = recordingRef.current;
      if (!rec) return;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
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
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }
      const uriToPlay = audioUrl || localUri;
      if (!uriToPlay) return;
      // Unload any previous sound so we don't leak.
      if (soundRef.current) { try { await soundRef.current.unloadAsync(); } catch (_) {} }
      const { sound } = await Audio.Sound.createAsync({ uri: uriToPlay });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish) setIsPlaying(false);
      });
      await sound.playAsync();
      setIsPlaying(true);
    } catch (e) {
      notify('Could not play', e?.message || 'Try again.');
    }
  };

  const removeAudio = async () => {
    try {
      if (isPlaying && soundRef.current) {
        await soundRef.current.stopAsync();
      }
      if (soundRef.current) await soundRef.current.unloadAsync();
    } catch (_) {}
    soundRef.current = null;
    setIsPlaying(false);
    setLocalUri('');
    setAudioUrl('');
  };

  const dateLabel = formatDate(now);
  const timeLabel = formatTime(now);
  const delivery = new Date(now.getTime() + duration * 60 * 60 * 1000);
  const deliveryDateLabel = formatDate(delivery);
  const deliveryTimeLabel = formatTime(delivery);

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
      estimatedAt: `${dateLabel} ${timeLabel}, ${duration}Hr`,
      estimatedDelivery: `${deliveryDateLabel} - ${deliveryTimeLabel}`,
      estimatedReadyIso: now.toISOString(),
      estimatedDeliveryIso: delivery.toISOString(),
      durationHours: duration,
      customerApproved: approval,
    });
  };

  const recSeconds = Math.floor(recordingMs / 1000);
  const recLabel = `${String(Math.floor(recSeconds / 60)).padStart(2, '0')}:${String(recSeconds % 60).padStart(2, '0')}`;

  return (
    <View className="flex-1 bg-background">
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
              Service Price & Issue Estimate
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 150 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Device card overlapping hero ─────────────────────────────── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-card rounded-2xl p-3.5"
            style={{
              shadowColor: '#172117',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View className="flex-row items-center">
              <View className="h-[67px] w-[67px] rounded-2xl bg-primary/10 items-center justify-center overflow-hidden mr-3">
                {params.imageUrl ? (
                  <Image source={{ uri: params.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Smartphone size={28} color="#087A0A" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-extrabold text-text" numberOfLines={1}>
                  {params.modelName || 'Device'}
                </Text>
                <Text className="text-[12px] text-text-muted mt-0.5" numberOfLines={1}>
                  {[params.ramLabel, params.storageLabel, params.color].filter(Boolean).join(' · ')}
                </Text>
                <View className="flex-row items-center flex-wrap mt-1.5">
                  {params.modelNumber ? (
                    <View className="flex-row items-center bg-primary/10 rounded-md px-1.5 py-0.5 mr-1.5">
                      <Hash size={9} color="#087A0A" />
                      <Text className="text-primary text-[11px] font-extrabold ml-0.5">{params.modelNumber}</Text>
                    </View>
                  ) : null}
                  <View className="bg-primary/10 rounded-md px-1.5 py-0.5">
                    <Text className="text-primary text-[11px] font-extrabold">
                      {services.length} service{services.length > 1 ? 's' : ''} added
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Bill summary — Swiggy "Bill Details" card ──────────────── */}
        <SectionHeader icon={ReceiptText} label="BILL DETAILS" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            {services.map((s, i) => (
              <View key={i} className="flex-row items-center mb-2.5">
                <View className="h-6 w-6 rounded-md items-center justify-center mr-2" style={{ backgroundColor: 'rgba(22, 187, 5, 0.14)' }}>
                  <Text className="text-[12px] font-extrabold" style={{ color: BRAND_GREEN }}>{i + 1}</Text>
                </View>
                <Text className="flex-1 text-text text-[13px]" numberOfLines={1}>{s.serviceName}</Text>
                <Text className="text-text font-extrabold text-[13px]">₹{formatINR(s.price)}</Text>
              </View>
            ))}
            {services.length === 0 ? (
              <View className="py-4 items-center">
                <Text className="text-text-muted text-[12px]">No services selected.</Text>
              </View>
            ) : null}

            {/* Dashed separator — Swiggy bill pattern */}
            <View className="my-2.5" style={{ borderTopWidth: 1, borderColor: '#E2E8E2', borderStyle: 'dashed' }} />

            <View className="flex-row items-center">
              <Tag size={13} color={BRAND_GREEN} />
              <Text className="flex-1 text-text font-extrabold text-[14px] ml-1.5">Estimated Total</Text>
              <Text className="text-[18px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>₹{formatINR(total)}</Text>
            </View>
            <Text className="text-text-muted text-[12px] mt-1">
              Final amount may vary slightly based on parts availability.
            </Text>
          </View>
        </View>

        {/* ── IMEI section — "delivery address" style card ────────────── */}
        <SectionHeader icon={ScanLine} label="DEVICE IMEI" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-3.5" style={cardShadow}>
            <View
              className="flex-row items-center rounded-xl px-3"
              style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#FFFFFF' }}
            >
              <TextInput
                className="flex-1 py-3 text-text text-[14px]"
                placeholder="Enter 15-digit IMEI"
                placeholderTextColor="#8FA08F"
                value={imei}
                onChangeText={setImei}
                keyboardType="number-pad"
                maxLength={17}
              />
              <Pressable
                onPress={() => navigation.navigate('ScanImei', { onScan: (value) => setImei(value) })}
                className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-80"
                style={{ backgroundColor: 'rgba(22, 187, 5, 0.14)' }}
                accessibilityRole="button"
                accessibilityLabel="Scan IMEI barcode"
              >
                <ScanLine size={14} color={BRAND_GREEN} />
                <Text className="text-[12px] font-extrabold ml-1" style={{ color: BRAND_GREEN }}>SCAN</Text>
              </Pressable>
            </View>
            <Text className="text-text-muted text-[12px] mt-2 leading-4">
              Tip: dial <Text className="font-extrabold text-text">*#06#</Text> on the device to display IMEI as a barcode.
            </Text>
          </View>
        </View>

        {/* ── Issue description + audio recorder ────────────────────── */}
        <SectionHeader icon={Pencil} label="ISSUE DESCRIPTION" subtitle="Type the issue, or record the customer explaining it" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-3.5" style={cardShadow}>
            <TextInput
              className="text-text text-[14px]"
              placeholder="What's wrong with the device? e.g. Screen cracked, battery drains fast…"
              placeholderTextColor="#8FA08F"
              value={complaint}
              onChangeText={setComplaint}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={{ minHeight: 96 }}
            />

            {/* Divider */}
            <View className="h-px bg-border my-3" />

            {/* Audio recorder block — three visual states:
                  (a) idle, no clip  → big green "Record" pill
                  (b) recording      → red pulse with timer + Stop button
                  (c) clip ready     → play/pause + duration + remove */}
            <Text className="text-[11px] font-extrabold text-text-muted tracking-widest mb-2">VOICE NOTE</Text>

            {isRecording ? (
              <View
                className="flex-row items-center rounded-2xl px-3 py-2.5"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
              >
                <View className="h-3 w-3 rounded-full mr-2" style={{ backgroundColor: '#DC2626' }} />
                <View className="flex-1">
                  <Text className="text-danger text-[12px] font-extrabold">Recording…</Text>
                  <Text className="text-danger text-[11px] font-bold">{recLabel}</Text>
                </View>
                <Pressable
                  onPress={stopRecording}
                  className="flex-row items-center rounded-full px-3 py-2 active:opacity-80"
                  style={{ backgroundColor: '#DC2626' }}
                >
                  <Square size={12} color="#fff" fill="#fff" />
                  <Text className="text-white text-[12px] font-extrabold ml-1.5">STOP</Text>
                </Pressable>
              </View>
            ) : (audioUrl || localUri) ? (
              <View
                className="flex-row items-center rounded-2xl px-3 py-2.5"
                style={{ backgroundColor: 'rgba(8, 122, 10, 0.08)', borderWidth: 1, borderColor: 'rgba(8, 122, 10, 0.35)' }}
              >
                <Pressable
                  onPress={togglePlayback}
                  className="h-10 w-10 rounded-full items-center justify-center active:opacity-80"
                  style={{ backgroundColor: ACCENT_GREEN }}
                  disabled={uploadingAudio}
                >
                  {isPlaying ? (
                    <Pause size={16} color="#fff" fill="#fff" />
                  ) : (
                    <Play size={16} color="#fff" fill="#fff" />
                  )}
                </Pressable>
                <View className="flex-1 ml-2.5">
                  <Text className="text-text text-[13px] font-extrabold">Voice note attached</Text>
                  <Text className="text-text-muted text-[12px]">
                    {uploadingAudio ? 'Uploading to cloud…' : (audioUrl ? 'Uploaded · tap play to preview' : 'Tap play to preview')}
                  </Text>
                </View>
                {uploadingAudio ? (
                  <ActivityIndicator color={ACCENT_GREEN} />
                ) : (
                  <Pressable
                    onPress={removeAudio}
                    className="h-9 w-9 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: 'rgba(220, 38, 38, 0.12)' }}
                  >
                    <Trash2 size={15} color="#DC2626" />
                  </Pressable>
                )}
              </View>
            ) : (
              <Pressable
                onPress={startRecording}
                className="flex-row items-center justify-center rounded-2xl py-3 active:opacity-90"
                style={{
                  backgroundColor: ACCENT_GREEN,
                  shadowColor: ACCENT_GREEN,
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 3,
                }}
              >
                <Mic size={16} color="#fff" />
                <Text className="text-white text-[13px] font-extrabold ml-2">Record voice note</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Estimated time — "Delivery in X" Zomato block ───────────── */}
        <SectionHeader icon={Truck} label="ESTIMATED DELIVERY" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            {/* Top: received "now" + duration selector */}
            <View className="flex-row">
              <View className="flex-1 mr-2">
                <Text className="text-[10px] text-text-muted font-bold tracking-widest mb-1.5">RECEIVED ON</Text>
                <View
                  className="rounded-xl px-3 justify-center"
                  style={{ height: 35, backgroundColor: 'rgba(22, 187, 5, 0.08)', borderWidth: 1, borderColor: 'rgba(22, 187, 5, 0.30)' }}
                >
                  <View className="flex-row items-center">
                    <Calendar size={13} color={BRAND_GREEN} />
                    <Text className="text-text text-[11px] font-extrabold ml-1.5">{dateLabel} - {timeLabel}</Text>
                  </View>
                </View>
              </View>

              <View className="w-28">
                <Text className="text-[10px] text-text-muted font-bold tracking-widest mb-1.5">DURATION</Text>
                <View
                  className="rounded-xl overflow-hidden"
                  style={{ height: 35, borderWidth: 1, borderColor: 'rgba(22, 187, 5, 0.30)', backgroundColor: 'rgba(22, 187, 5, 0.08)' }}
                >
                  <Select value={duration} options={DURATIONS} onChange={(v) => setDuration(v)} className="h-full py-0" />
                </View>
              </View>
            </View>

            {/* Big delivery promise band — Swiggy "Delivery in 25 min" pattern */}
            <View
              className="mt-3 rounded-xl p-3 flex-row items-center"
              style={{ backgroundColor: '#172117' }}
            >
              <View className="h-10 w-10 rounded-xl items-center justify-center mr-2.5" style={{ backgroundColor: 'rgba(255, 255, 255, 0.10)' }}>
                <Timer size={18} color={BRAND_GREEN} />
              </View>
              <View className="flex-1">
                <Text className="text-white/70 text-[10px] font-bold tracking-widest">READY BY</Text>
                <Text className="text-white text-[11px] font-extrabold mt-0.5" numberOfLines={1}>
                  {deliveryDateLabel} · {deliveryTimeLabel}
                </Text>
              </View>
              <View className="bg-success/20 rounded-full px-2.5 py-1 flex-row items-center">
                <ShieldCheck size={11} color={ACCENT_GREEN} />
                <Text className="text-[10px] font-extrabold ml-1" style={{ color: '#7ED957' }}>ON TIME</Text>
              </View>
            </View>

            {/* Customer approval toggle — Swiggy-style row */}
            <Pressable
              onPress={() => setApproval(!approval)}
              className="flex-row items-center mt-3 rounded-xl px-3 py-2.5 active:opacity-80"
              style={{
                backgroundColor: approval ? 'rgba(8, 122, 10, 0.08)' : '#FFFFFF',
                borderWidth: 1,
                borderColor: approval ? 'rgba(8, 122, 10, 0.35)' : '#E2E8E2',
              }}
            >
              {approval ? (
                <CircleCheck size={20} color={ACCENT_GREEN} />
              ) : (
                <Circle size={20} color="#CBD5CB" />
              )}
              <View className="flex-1 ml-2.5">
                <Text className="text-[11px] font-extrabold text-text">Customer repair approval</Text>
                <Text className="text-[11px] text-text-muted">Customer agreed to the estimated price & timing.</Text>
              </View>
            </Pressable>
          </View>
        </View>

      </ScrollView>

      {/* ── Sticky Swiggy-style "Place Order" CTA ──────────────────────── */}
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
            opacity: isReady ? 1 : 0.55,
            shadowColor: BRAND_GREEN_DARK,
            shadowOpacity: isReady ? 0.35 : 0,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: isReady ? 10 : 0,
          }}
        >
          <LinearGradient
            colors={isReady ? [BRAND_GREEN, BRAND_GREEN_DARK] : ['#8FA08F', '#667066']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text className="text-white text-[11px] font-bold opacity-90">ESTIMATED TOTAL</Text>
              <Text className="text-white text-[20px] font-extrabold">₹{formatINR(total)}</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-white text-[14px] font-extrabold">Continue</Text>
              <ChevronRight size={18} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>
        {!isReady && (uploadingAudio || isRecording || hasIssue) ? (
          <Text className="text-text-muted text-[12px] text-center mt-2">
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
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function SectionHeader({ icon: Icon, label, subtitle }) {
  return (
    <View className="px-4 pt-5 pb-2">
      <View className="flex-row items-center">
        <Icon size={14} color={BRAND_GREEN} />
        <Text className="text-text font-extrabold text-[13px] tracking-widest ml-1.5">{label}</Text>
        <View className="flex-1 h-px bg-border ml-2" />
      </View>
      {subtitle ? (
        <Text className="text-text-muted text-[12px] mt-1.5 ml-[22px]">{subtitle}</Text>
      ) : null}
    </View>
  );
}

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
