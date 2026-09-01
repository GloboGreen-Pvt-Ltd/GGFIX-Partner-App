import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View, TouchableOpacity, StatusBar, useWindowDimensions, Linking, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import {
  Smartphone,
  Clock,
  FileText,
  CalendarClock,
  Calendar,
  CheckCircle2,
  Camera,
  PlayCircle,
  ShieldCheck,
  PackageX,
  Wrench,
  Users,
  Phone,
  IndianRupee,
  Wallet,
  ChevronLeft,
  Tag,
  ScanLine,
  Play,
  Pause,
  Square,
} from 'lucide-react-native';
import { Loader, EmptyState } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { getCurrentPhaseLabel } from '../../common/serviceHistoryPhases';
import ImageViewerModal from '../../../components/ImageViewerModal';
import { paymentFromTicket } from './ReceiptCard';

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

const cardShadow = {
  borderWidth: 1,
  borderColor: '#E2E8E2',
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

// Status → display label + tone, used for the hero status pill. Mirrors the
// Booking Details screen's vocabulary so the pill reads the same across screens.
const STATUS_VARIANT = {
  CREATED:              { label: 'Service Accepted',     tone: 'amber' },
  ASSIGNED:             { label: 'Technician Assigned',  tone: 'blue' },
  IN_DIAGNOSIS:         { label: 'In Diagnosis',         tone: 'purple' },
  IN_REPAIR:            { label: 'In Service',           tone: 'purple' },
  QUOTED:               { label: 'Re-Estimated',         tone: 'amber' },
  APPROVED:             { label: 'Approved',             tone: 'blue' },
  READY:                { label: 'Ready for Delivery',   tone: 'green' },
  RETURN_DELIVERY:      { label: 'Return Delivery',      tone: 'amber' },
  INVOICE_GENERATED:    { label: 'Invoice Generated',    tone: 'amber' },
  INVOICE_READY:        { label: 'Invoice Sent',         tone: 'amber' },
  DELIVERED_PROCESSING: { label: 'Delivery Processing',  tone: 'amber' },
  DELIVERED:            { label: 'Delivered',            tone: 'green' },
  CANCELLED:            { label: 'Cancelled',            tone: 'red' },
};

const TONE = {
  amber:  { bg: 'rgba(245, 158, 11, 0.14)', fg: '#B45309', border: 'rgba(245, 158, 11, 0.35)' },
  blue:   { bg: 'rgba(22, 187, 5, 0.12)', fg: '#16BB05', border: 'rgba(22, 187, 5, 0.35)' },
  purple: { bg: 'rgba(126, 217, 87, 0.12)', fg: '#087A0A', border: 'rgba(126, 217, 87, 0.35)' },
  green:  { bg: 'rgba(8, 122, 10, 0.12)',  fg: BRAND_GREEN_DARK, border: 'rgba(8, 122, 10, 0.35)' },
  red:    { bg: 'rgba(220, 38, 38, 0.12)',  fg: '#B91C1C', border: 'rgba(220, 38, 38, 0.35)' },
};

// Best-effort device-colour → swatch hex so the hero can show a real colour dot
// next to the colour name (e.g. "Beige"). Falls back to a neutral gray.
const COLOR_HEX = {
  black: '#172117', white: '#EFF5EE', silver: '#CBD5CB', gray: '#8FA08F', grey: '#8FA08F',
  gold: '#D97706', rosegold: '#FECACA', beige: '#FDE68A', cream: '#FEF3C7', graphite: '#667066',
  blue: '#16BB05', navy: '#087A0A', red: '#DC2626', green: '#16BB05', yellow: '#F59E0B',
  purple: '#7ED957', violet: '#16BB05', pink: '#16BB05', orange: '#F59E0B', brown: '#92400E',
  midnight: '#172117', starlight: '#FFFBEB',
};

function colorToHex(name) {
  if (!name) return '#CBD5CB';
  const k = String(name).trim().toLowerCase();
  return COLOR_HEX[k] || COLOR_HEX[k.replace(/\s+/g, '')] || COLOR_HEX[k.split(/\s+/)[0]] || '#CBD5CB';
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7517869).
function splitTrackingId(id) {
  const s = String(id ?? '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// Hero "Booked On" stamp — e.g. "Mon, Jul 20 2026 11:37 am".
function fmtBooked(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${wd}, ${mo} ${d.getDate()} ${d.getFullYear()} ${time}`;
}

function parseDevicePhotos(ticket) {
  if (ticket?.devicePhotosJson) {
    try {
      const p = JSON.parse(ticket.devicePhotosJson);
      if (p && typeof p === 'object') return p;
    } catch (_) {}
  }
  return {};
}

function parseTechnicianPhotos(ticket) {
  if (!ticket?.technicianPhotosJson) return [];
  try {
    const p = JSON.parse(ticket.technicianPhotosJson);
    if (!Array.isArray(p)) return [];
    return p
      .map((x) => (typeof x === 'string' ? x : (x?.url || x?.uri || x?.imageUrl || null)))
      .filter(Boolean);
  } catch (_) { return []; }
}

function parseMissingParts(ticket) {
  if (!ticket?.missingPartsJson) return [];
  try {
    const p = JSON.parse(ticket.missingPartsJson);
    if (Array.isArray(p)) return p.map((x) => (typeof x === 'string' ? x : (x?.name || x?.label))).filter(Boolean);
  } catch (_) {}
  return [];
}

function priceItemsFromTicket(ticket) {
  if (Array.isArray(ticket?.priceItems)) return ticket.priceItems;
  if (ticket?.priceItemsJson) {
    try {
      const parsed = JSON.parse(ticket.priceItemsJson);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return ticket?.services?.map?.((s) => ({ id: s.id, label: s.serviceName, amount: s.price })) || [];
}

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // e.g. "Thu, 09 Jul, 2026 10:48 pm" — padded day, non-padded lowercase time.
  const wd = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const mo = d.toLocaleDateString('en-IN', { month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${wd}, ${day} ${mo}, ${d.getFullYear()} ${time}`;
}

// Uniform, neutral section header — gray chip + green icon — so the screen
// reads cleanly instead of using a different colour per section.
function SectionHeader({ icon: Icon, label }) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: '#E6F7E3' }}
      >
        <Icon size={14} color={BRAND_GREEN_DARK} />
      </View>
      <Text
        className="text-[11px] font-extrabold tracking-widest text-gray-900 flex-1"
        style={{ letterSpacing: 1.2 }}
      >
        {label}
      </Text>
    </View>
  );
}

function PhotoSlot({ label, uri, icon: Icon, onPress }) {
  // Only a FILLED slot is tappable — an empty dashed placeholder has nothing to
  // open, and making it pressable would give the owner a dead target.
  const Wrapper = uri && onPress ? TouchableOpacity : View;
  const wrapperProps = uri && onPress
    ? { onPress, activeOpacity: 0.85, accessibilityRole: 'button', accessibilityLabel: `${label}, tap to view` }
    : {};
  return (
    <View style={{ width: '33.333%' }} className="p-1">
      <Text className="text-[10px] font-bold text-gray-500 text-center mb-1" numberOfLines={1}>{label}</Text>
      <Wrapper
        {...wrapperProps}
        className="rounded-xl overflow-hidden items-center justify-center"
        style={{
          aspectRatio: 1,
          backgroundColor: '#F7FAF7',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: '#E2E8E2',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Icon size={22} color="#8FA08F" />
        )}
      </Wrapper>
    </View>
  );
}

const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Voice-note audio player for the compliance-note card: play / pause, stop, a
// 1x ⇄ 2x speed toggle, and a progress bar with elapsed / total time. Each row
// owns its own Audio.Sound and releases it on unmount so navigating away
// doesn't leak a player or block the next one.
function VoiceNotePlayer({ uri }) {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => () => {
    try { soundRef.current?.unloadAsync?.(); } catch (_) {}
  }, []);

  const onStatus = (s) => {
    if (!s || !s.isLoaded) return;
    setPos(s.positionMillis || 0);
    if (s.durationMillis) setDur(s.durationMillis);
    setPlaying(!!s.isPlaying);
    if (s.didJustFinish) { setPlaying(false); setPos(0); }
  };

  const ensureSound = async () => {
    if (soundRef.current) return soundRef.current;
    try { await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }); } catch (_) {}
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { rate, shouldCorrectPitch: true, progressUpdateIntervalMillis: 200 },
      onStatus,
    );
    soundRef.current = sound;
    return sound;
  };

  // Preload the clip so its total duration shows before the first play.
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    (async () => {
      try {
        const sound = await ensureSound();
        const st = await sound.getStatusAsync();
        if (!cancelled && st.isLoaded && st.durationMillis) setDur(st.durationMillis);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [uri]);

  const togglePlay = async () => {
    try {
      const sound = await ensureSound();
      const st = await sound.getStatusAsync();
      if (st.isLoaded && st.isPlaying) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        if (st.isLoaded && (st.didJustFinish || st.positionMillis >= (st.durationMillis || 0))) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
        setPlaying(true);
      }
    } catch (_) { /* best-effort playback */ }
  };

  const stop = async () => {
    try {
      if (!soundRef.current) return;
      await soundRef.current.stopAsync();
      await soundRef.current.setPositionAsync(0);
      setPlaying(false);
      setPos(0);
    } catch (_) {}
  };

  const cycleRate = async () => {
    const next = rate >= 2 ? 1 : 2;
    setRate(next);
    try { await soundRef.current?.setRateAsync(next, true); } catch (_) {}
  };

  const pct = dur > 0 ? Math.min(1, pos / dur) : 0;

  return (
    <View
      className="mt-2 rounded-xl px-3 py-2.5"
      style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#F7FAF7' }}
    >
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={togglePlay}
          className="w-9 h-9 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: ACCENT_GREEN }}
        >
          {playing ? <Pause size={15} color="#fff" /> : <Play size={15} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={stop}
          className="w-8 h-8 rounded-full items-center justify-center mr-2"
          style={{ borderWidth: 1, borderColor: '#CBD5CB', backgroundColor: '#FFFFFF' }}
        >
          <Square size={12} color="#667066" fill="#667066" />
        </TouchableOpacity>
        <View className="flex-1">
          <View style={{ height: 4, borderRadius: 2, backgroundColor: '#E2E8E2' }}>
            <View style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: ACCENT_GREEN }} />
          </View>
          <Text className="text-[10px] text-gray-500 mt-1">
            {fmtClock(pos)} / {fmtClock(dur)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={cycleRate}
          className="ml-2 px-2.5 py-1.5 rounded-full"
          style={{ backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#E2E8E2' }}
        >
          <Text className="text-[11px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>{rate}x</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


// "Issue Verified & Updated" card on the owner's Device Detail screen.
// Lists every compliance note the technician has submitted (from
// /tickets/{id}/notes) with the typed text, optional voice note, and the
// image attachments. Returns null when the technician hasn't submitted any.
function ComplianceNotesCard({ notes, onOpenImage }) {
  const list = Array.isArray(notes) ? notes : [];
  if (list.length === 0) return null;
  return (
    <View className="px-4 mt-4">
      <View
        className="bg-white rounded-2xl p-4"
        style={cardShadow}
      >
        <SectionHeader icon={FileText} label="ISSUE VERIFIED & UPDATED" tint="#FEF3C7" accent="#B45309" />
        {list.map((n, idx) => {
          const imgs = Array.isArray(n.imageUrls) ? n.imageUrls : [];
          return (
            <View
              key={n.id || idx}
              className="flex-row mt-1"
              style={{
                paddingTop: idx > 0 ? 12 : 0,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: '#EFF5EE',
                marginTop: idx > 0 ? 12 : 0,
              }}
            >
              <View
                style={{ width: 3, borderRadius: 2, backgroundColor: '#F59E0B', marginRight: 10 }}
              />
              <View className="flex-1">
                {n.note ? (
                  <Text className="text-[13px] text-gray-900 leading-5">{n.note}</Text>
                ) : null}
                {n.audioUrl ? <VoiceNotePlayer uri={n.audioUrl} /> : null}
                {imgs.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                    <View className="flex-row">
                      {imgs.map((u, j) => (
                        <TouchableOpacity
                          key={j}
                          activeOpacity={0.85}
                          onPress={() => onOpenImage?.(imgs.map((x, k) => ({ uri: x, label: `Issue photo ${k + 1}` })), j)}
                          accessibilityRole="button"
                          accessibilityLabel={`Issue photo ${j + 1}, tap to view`}
                        >
                          <Image
                            source={{ uri: u }}
                            style={{ width: 72, height: 72, borderRadius: 8, marginRight: 6 }}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                ) : null}
                {n.createdAt ? (
                  <Text className="text-[10px] text-gray-500 mt-1.5">
                    {formatDateTime(n.createdAt) || ''}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function DeviceDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, 760);
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [technician, setTechnician] = useState(null);
  const [complianceNotes, setComplianceNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Image viewer. `images` is the whole set the tapped thumbnail belongs to,
  // so a swipe inside the viewer moves through that section's siblings and not
  // across unrelated sections.
  //
  // MUST live up here with the rest of the state, NOT beside the derived photo
  // sets further down: the two early returns below (`loading && !ticket`, and
  // "Booking not found") bail before that point, so a hook placed after them
  // runs on some renders and not others — "Rendered more hooks than during the
  // previous render", which is exactly what it did.
  const [viewer, setViewer] = useState({ open: false, images: [], index: 0 });
  const openViewer = (images, index) => setViewer({ open: true, images, index });
  const closeViewer = () => setViewer((v) => ({ ...v, open: false }));

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(data);
      // The booking's recorded lifecycle, from the same endpoint the Service
      // History screen reads. This screen used to render nothing but
      // ticket.status, so every step that isn't a lifecycle status — the
      // technician's acceptance, the quality check, the invoice — was simply
      // absent here while History showed it. Same booking id, same events.
      try {
        const ev = await ticketApi.get(`/tickets/${ticketId}/events`);
        setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
      } catch (_) { setEvents([]); }
      if (data?.assignedTechnicianId) {
        try {
          const list = await ticketApi.get('/technicians');
          const arr = Array.isArray(list) ? list : (list?.content || []);
          setTechnician(arr.find((x) => x.id === data.assignedTechnicianId) || null);
        } catch (_) { setTechnician(null); }
      } else {
        setTechnician(null);
      }
      // Compliance notes drive the "Issue Verified & Updated" card below.
      // Failure here shouldn't break the rest of the screen — leave the
      // section hidden if the call errors out.
      try {
        const notes = await ticketApi.get(`/tickets/${ticketId}/notes`);
        setComplianceNotes(Array.isArray(notes) ? notes : []);
      } catch (_) { setComplianceNotes([]); }
    } catch (e) {
      setError(e.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !ticket) return <Loader label="Loading device details..." />;
  if (error || !ticket) {
    return (
      <View className="flex-1 bg-background">
        <EmptyState
          title="Booking not found"
          description={error || 'We could not load this booking.'}
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  const trackingId = ticket.trackingId || ticket.id;
  const deviceName = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || 'Device';
  const lineItems = priceItemsFromTicket(ticket);
  const estimatedTotal = ticket.estimatedPrice != null
    ? ticket.estimatedPrice
    : lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const payment = paymentFromTicket(ticket, estimatedTotal);
  const photos = parseDevicePhotos(ticket);
  const technicianPhotos = parseTechnicianPhotos(ticket);
  // Labelled, gap-free sets for the viewer. The grids render fixed slots and
  // can hold blanks; the viewer must not page onto an empty one, so the empties
  // are dropped here rather than in the grid.
  const devicePhotoSet = [
    { uri: photos.front, label: 'Front Side' },
    { uri: photos.back, label: 'Back Side' },
  ].filter((x) => !!x.uri);
  const technicianPhotoSet = (technicianPhotos || [])
    .map((u, i) => ({ uri: u, label: `Technician photo ${i + 1}` }))
    .filter((x) => !!x.uri);
  const missingParts = parseMissingParts(ticket);
  const readyAtText = formatDateTime(ticket.estimatedReadyAt);
  const deliveryAtText = formatDateTime(ticket.estimatedDeliveryAt);
  const approvalText = ticket.customerApproval === true ? 'Done'
    : ticket.customerApproval === false ? 'Pending' : null;
  // Read-only here. Ticket Details owns capturing it — a booking can't be marked
  // Ready for Delivery without one, and that gate is the sheet on that screen.
  const imeiText = String(ticket.imei || '').trim() || null;
  const securityType = ticket.deviceSecurityType && ticket.deviceSecurityType !== 'NONE'
    ? ticket.deviceSecurityType : null;
  const securityValue = ticket.deviceSecurityValue || null;

  const tid = splitTrackingId(trackingId);
  const bookedText = fmtBooked(ticket.createdAt);
  const statusKey = String(ticket.status || '').toUpperCase();
  const statusMeta = STATUS_VARIANT[statusKey] || { label: ticket.status || 'Pending', tone: 'amber' };
  const statusTone = TONE[statusMeta.tone] || TONE.amber;
  // The pill names the furthest step actually recorded, not the coarser
  // lifecycle status behind it — so a booking whose quality check just passed
  // doesn't read "In Service" here while Service History reads "Quality Check
  // Completed". The tone still comes from the lifecycle status, which is what
  // decides whether the booking is open, done or cancelled.
  const currentStatusLabel = getCurrentPhaseLabel(events, ticket.status) || statusMeta.label;
  const StatusIcon = statusKey === 'CANCELLED' ? PackageX : CheckCircle2;
  const techPhone = technician?.phone || null;

  // Green call button in the Assigned Technician card — dials the technician.
  const contactTechnician = () => {
    if (!techPhone) return;
    Linking.openURL(`tel:${techPhone}`).catch(() => {});
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* White header (slim — replaces native white header) */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
            Device Details
          </Text>
          <View
            className="px-2.5 py-1 rounded-full"
            style={{ maxWidth: 180, backgroundColor: '#E6F7E3' }}
          >
            <Text className="text-[11px] font-extrabold" numberOfLines={1}>
              <Text style={{ color: '#172117' }}>#{tid.prefix}</Text>
              <Text style={{ color: BRAND_GREEN_DARK }}>{tid.digits}</Text>
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={{ width: contentW, alignSelf: 'center' }}>
        {/* Floating device card */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            {/* Top — image + device name + colour swatch */}
            <View className="flex-row items-center">
              {ticket.deviceImageUrl ? (
                <Image
                  source={{ uri: ticket.deviceImageUrl }}
                  style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: '#EFF5EE', marginRight: 12 }}
                />
              ) : (
                <View
                  className="w-16 h-16 rounded-2xl items-center justify-center mr-3"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Smartphone size={28} color={BRAND_GREEN_DARK} />
                </View>
              )}
              <View className="flex-1">
                <Text className="text-[10.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.7 }}>
                  Device
                </Text>
                <Text className="text-[15px] font-extrabold text-gray-900 mt-0.5" numberOfLines={2}>
                  {deviceName}
                </Text>
                {ticket.color ? (
                  <View className="flex-row items-center mt-1.5">
                    <View
                      style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: colorToHex(ticket.color),
                        borderWidth: 1, borderColor: '#E2E8E2',
                      }}
                    />
                    <Text className="text-[12px] text-gray-600 ml-1.5 font-semibold">{ticket.color}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: '#EFF5EE', marginVertical: 14 }} />

            {/* Bottom — Tracking ID · Booked On · Status */}
            <View className="flex-row items-center">
              {/* Tracking ID */}
              <View className="flex-row items-center flex-1">
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#E6F7E3' }}>
                  <Tag size={14} color={BRAND_GREEN_DARK} />
                </View>
                <View className="ml-2 flex-1">
                  <Text className="text-[9.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.4 }}>
                    Tracking ID
                  </Text>
                  <Text className="text-[11.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK }} numberOfLines={1}>
                    #{trackingId}
                  </Text>
                </View>
              </View>

              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: '#EFF5EE', marginHorizontal: 8 }} />

              {/* Booked On */}
              {bookedText ? (
                <View className="flex-row items-center flex-1">
                  <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#E6F7E3' }}>
                    <Calendar size={14} color={BRAND_GREEN_DARK} />
                  </View>
                  <View className="ml-2 flex-1">
                    <Text className="text-[9.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.4 }}>
                      Booked On
                    </Text>
                    <Text className="text-[11px] font-bold text-gray-900" numberOfLines={2}>
                      {bookedText}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Status pill */}
              <View
                className="flex-row items-center rounded-full px-2.5 py-1.5 ml-2"
                style={{ backgroundColor: statusTone.bg, borderWidth: 1, borderColor: statusTone.border }}
              >
                <StatusIcon size={12} color={statusTone.fg} />
                <Text className="text-[9.5px] font-extrabold ml-1" style={{ color: statusTone.fg }} numberOfLines={1}>
                  {currentStatusLabel.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Price Summary */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={IndianRupee} label="PRICE SUMMARY" />
            {lineItems.length === 0 ? (
              <Text className="text-[12px] text-gray-500">No service items recorded.</Text>
            ) : (
              <>
                {lineItems.map((item, idx) => (
                  <View key={item.id || idx} className="flex-row items-center py-1.5">
                    <View
                      className="w-6 h-6 rounded-full items-center justify-center mr-2.5"
                      style={{ backgroundColor: '#E6F7E3' }}
                    >
                      <Text
                        className="text-[10.5px] font-extrabold"
                        style={{ color: BRAND_GREEN_DARK }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <Text className="text-[12.5px] text-gray-700 flex-1" numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text className="text-[12.5px] font-bold text-gray-900">
                      ₹{Number(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))}

                <View
                  className="my-3"
                  style={{ height: 1, borderTopWidth: 1, borderTopColor: '#E2E8E2', borderStyle: 'dashed' }}
                />

                <View
                  className="p-3 rounded-2xl flex-row items-center justify-between"
                  style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
                >
                  <View>
                    <Text className="text-[10.5px] uppercase font-bold text-gray-500" style={{ letterSpacing: 0.6 }}>
                      Estimated Total
                    </Text>
                    <Text className="text-[10.5px] text-gray-500">
                      Inclusive of all services
                    </Text>
                  </View>
                  <Text
                    className="text-[18px] font-extrabold"
                    style={{ color: BRAND_GREEN_DARK }}
                  >
                    ₹{Number(estimatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {/* Payment, straight from the API — tickets.payment_type /
                    payment_amount / balance_amount. Rendered only when money
                    was actually collected: a booking that pays on delivery has
                    no second and third line to show, and "Advance Payment ₹0"
                    would read as a failed payment rather than none. */}
                {payment ? (
                  <View className="mt-2.5">
                    <View className="flex-row items-center py-2">
                      <View
                        className="w-6 h-6 rounded-full items-center justify-center mr-2.5"
                        style={{ backgroundColor: '#E6F7E3' }}
                      >
                        <Wallet size={12} color={BRAND_GREEN_DARK} />
                      </View>
                      <Text className="text-[12.5px] text-gray-700 flex-1" numberOfLines={1}>
                        {payment.label}
                      </Text>
                      <Text className="text-[13px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                        − ₹{Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    <View
                      className="p-3 rounded-2xl flex-row items-center justify-between mt-1"
                      style={{
                        backgroundColor: payment.balance > 0 ? '#FFFBEB' : '#F0F8EF',
                        borderWidth: 1,
                        borderColor: payment.balance > 0 ? '#FDE68A' : '#C8EEBF',
                      }}
                    >
                      <View>
                        <Text className="text-[10.5px] uppercase font-bold text-gray-500" style={{ letterSpacing: 0.6 }}>
                          Balance Amount
                        </Text>
                        <Text className="text-[10.5px] text-gray-500">
                          {payment.balance > 0 ? 'Collect on delivery' : 'Fully settled'}
                        </Text>
                      </View>
                      <Text
                        className="text-[16px] font-extrabold"
                        style={{ color: payment.balance > 0 ? '#B45309' : BRAND_GREEN_DARK }}
                      >
                        ₹{Number(payment.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    <Text className="text-[10.5px] text-gray-500 mt-2">
                      {payment.statusLabel}
                      {formatDateTime(payment.paidAt) ? ` · ${formatDateTime(payment.paidAt)}` : ''}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* Complaint */}
        {ticket.issueDescription ? (
          <View className="px-4 mt-4">
            <View
              className="bg-white rounded-2xl p-4"
              style={cardShadow}
            >
              <SectionHeader icon={FileText} label="COMPLAINT ISSUE" tint="#E6F7E3" accent="#16BB05" />
              <View
                className="p-3 rounded-xl"
                style={{ backgroundColor: '#F7FAF7' }}
              >
                <Text className="text-[12.5px] text-gray-700 leading-5" numberOfLines={8}>
                  {ticket.issueDescription}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Schedule + Approval — connected timeline */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            <SectionHeader icon={CalendarClock} label="SERVICE SCHEDULE" />

            {/* Same four rows, in the same order, as Ticket Details' Service Info
                card — the two screens describe one booking, so they can't list
                its schedule differently. IMEI sits third for that reason: it is
                device identity rather than a date, but splitting it out into a
                card of its own would put the two screens out of step. */}
            {[
              { icon: Clock,         label: 'Approx. Ready',     value: readyAtText || 'Not yet set',    done: !!readyAtText },
              { icon: CalendarClock, label: 'Delivery',          value: deliveryAtText || 'Not yet set', done: !!deliveryAtText },
              {
                icon: ScanLine,
                label: 'IMEI',
                value: imeiText || 'Not captured yet',
                done: !!imeiText,
                valueColor: imeiText ? '#172117' : '#667066',
              },
              {
                icon: CheckCircle2,
                label: 'Customer Approval',
                value: approvalText || 'Pending',
                done: approvalText === 'Done',
                valueColor: approvalText === 'Done' ? BRAND_GREEN_DARK : '#667066',
              },
            ].map((r, i, arr) => {
              const Icon = r.icon;
              const isLast = i === arr.length - 1;
              return (
                <View key={r.label} style={{ flexDirection: 'row', alignItems: 'stretch', paddingVertical: 6 }}>
                  {/* Icon + dashed connector column */}
                  <View style={{ width: 32, alignItems: 'center' }}>
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: r.done ? '#E6F7E3' : '#F0F8EF' }}
                    >
                      <Icon size={14} color={r.done ? BRAND_GREEN_DARK : ACCENT_GREEN} />
                    </View>
                    {!isLast ? (
                      <View
                        style={{
                          flex: 1,
                          marginTop: 3,
                          marginBottom: -9,
                          borderLeftWidth: 1.5,
                          borderStyle: 'dashed',
                          borderColor: '#CBD5CB',
                        }}
                      />
                    ) : null}
                  </View>
                  <View className="flex-1 ml-3" style={{ justifyContent: 'center', paddingVertical: 2 }}>
                    <Text className="text-[10.5px] uppercase font-semibold text-gray-400 mb-0.5" style={{ letterSpacing: 0.6 }}>
                      {r.label}
                    </Text>
                    <Text className="text-[13.5px] font-bold leading-5" style={{ color: r.valueColor || '#172117' }}>
                      {r.value}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Device Photos */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={Camera} label="DEVICE PHOTOS" tint="#F0F8EF" accent="#087A0A" />
            <View className="flex-row -mx-1 mt-1">
              {/* Front and back open the zoom viewer as a 2-image set. The
                  Coverage Video slot deliberately does NOT — it is a video, and
                  feeding it to an <Image> viewer would show a broken still. */}
              <PhotoSlot
                label="Front Side"
                uri={photos.front}
                icon={Camera}
                onPress={() => openViewer(devicePhotoSet, devicePhotoSet.findIndex((x) => x.uri === photos.front))}
              />
              <PhotoSlot
                label="Back Side"
                uri={photos.back}
                icon={Camera}
                onPress={() => openViewer(devicePhotoSet, devicePhotoSet.findIndex((x) => x.uri === photos.back))}
              />
              <PhotoSlot label="Coverage Video" uri={photos.video} icon={PlayCircle} />
            </View>
          </View>
        </View>

        {/* Device Security + Service / Damage Parts — side by side */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl p-4 flex-row" style={cardShadow}>
            {/* Device Security */}
            <View className="flex-1 pr-3">
              <SectionHeader icon={ShieldCheck} label="DEVICE SECURITY" />
              {securityType || securityValue ? (
                <View>
                  {securityType ? (
                    <Text className="text-[10.5px] uppercase font-bold text-gray-500" style={{ letterSpacing: 0.6 }}>
                      {securityType}
                    </Text>
                  ) : null}
                  <Text className="text-[13.5px] font-extrabold text-gray-900 mt-0.5">
                    {securityValue || '—'}
                  </Text>
                </View>
              ) : (
                <Text className="text-[12.5px] text-gray-500">Not provided</Text>
              )}
            </View>

            {/* Divider */}
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: '#EFF5EE' }} />

            {/* Service / Damage Parts */}
            <View className="flex-1 pl-3">
              <SectionHeader icon={Wrench} label="SERVICE / DAMAGE PARTS" />
              {missingParts.length === 0 ? (
                <View className="flex-row items-center">
                  <CheckCircle2 size={15} color={BRAND_GREEN_DARK} />
                  <Text className="ml-1.5 text-[12.5px] font-semibold flex-1" style={{ color: BRAND_GREEN_DARK }}>
                    No missing parts reported
                  </Text>
                </View>
              ) : (
                <View className="flex-row flex-wrap -mx-0.5">
                  {missingParts.map((p, i) => (
                    <View
                      key={i}
                      className="px-2.5 py-1 rounded-full m-0.5 flex-row items-center"
                      style={{ backgroundColor: '#FEE2E2' }}
                    >
                      <PackageX size={10} color="#B91C1C" />
                      <Text className="ml-1 text-[11px] font-semibold" style={{ color: '#B91C1C' }}>
                        {p}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Technician */}
        {(ticket.assignedTechnicianId || technician) ? (
          <View className="px-4 mt-4">
            <View
              className="bg-white rounded-2xl p-4"
              style={cardShadow}
            >
              <SectionHeader icon={Users} label="ASSIGNED TECHNICIAN" />
              <View className="flex-row items-center">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: BRAND_GREEN }}
                >
                  <Text className="text-white text-[15px] font-extrabold">
                    {(technician?.name || 'T').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold text-gray-900">
                    {technician?.name || 'Assigned'}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    {technician?.id ? (
                      <Text className="text-[11px] text-gray-500">
                        ID: {String(technician.id).slice(0, 8).toUpperCase()}
                      </Text>
                    ) : null}
                    {technician?.roleLabel ? (
                      <Text className="text-[11px] text-gray-500 ml-2">
                        • {technician.roleLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {techPhone ? (
                  <TouchableOpacity
                    onPress={contactTechnician}
                    activeOpacity={0.8}
                    className="w-11 h-11 rounded-full items-center justify-center ml-2"
                    style={{ borderWidth: 1.5, borderColor: ACCENT_GREEN, backgroundColor: '#F0F8EF' }}
                  >
                    <Phone size={17} color={ACCENT_GREEN} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* Technician uploaded device photos */}
        {(ticket.assignedTechnicianId || technician || technicianPhotos.length > 0) ? (
          <View className="px-4 mt-4">
            <View
              className="bg-white rounded-2xl p-4"
              style={cardShadow}
            >
              <SectionHeader icon={Camera} label="TECHNICIAN UPLOADS" tint="#F0F8EF" accent="#087A0A" />
              <Text className="text-[11.5px] text-gray-500 mb-2" numberOfLines={1}>
                {(technician?.name || ticket.assignedTechnicianName || 'Technician')}
                {technician?.id ? `  •  ${String(technician.id).slice(0, 8).toUpperCase()}` : (
                  ticket.assignedTechnicianCode ? `  •  ${ticket.assignedTechnicianCode}` : ''
                )}
              </Text>
              <View className="flex-row -mx-1">
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ width: '33.333%' }} className="p-1">
                    <View
                      className="rounded-xl items-center justify-center overflow-hidden"
                      style={{
                        aspectRatio: 1,
                        backgroundColor: '#F7FAF7',
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: '#E2E8E2',
                      }}
                    >
                      {technicianPhotos[i] ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => openViewer(technicianPhotoSet, technicianPhotoSet.findIndex((x) => x.uri === technicianPhotos[i]))}
                          accessibilityRole="button"
                          accessibilityLabel={`Technician photo ${i + 1}, tap to view`}
                          style={{ width: '100%', height: '100%' }}
                        >
                          <Image source={{ uri: technicianPhotos[i] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </TouchableOpacity>
                      ) : (
                        <View className="items-center px-2">
                          <Camera size={20} color="#8FA08F" />
                          <Text className="text-[9px] text-gray-500 text-center mt-1">
                            Awaiting photo
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* Technician's compliance / issue-verified note. Renders after the
            Technician Uploads block — mirrors the order of the technician's
            own Ticket Detail screen (Your Side images, then Issue Verified
            & Updated). Hidden when the technician hasn't submitted any. */}
        <ComplianceNotesCard notes={complianceNotes} onOpenImage={openViewer} />

        </View>
      </ScrollView>

      <ImageViewerModal
        visible={viewer.open}
        images={viewer.images}
        index={viewer.index}
        onClose={closeViewer}
      />
    </View>
  );
}
