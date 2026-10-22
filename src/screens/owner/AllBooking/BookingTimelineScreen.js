import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Image, RefreshControl, ScrollView, Text, TouchableOpacity,
  View, StatusBar,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  BadgeCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Lock,
  ReceiptIndianRupee,
  Smartphone,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { getBrands, getDeviceCategories, getModelsByBrand, getRamOptions, getStorageOptions } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';
import { stepBlockedBy } from '../../common/serviceHistoryPhases';
import {
  ServiceMilestoneTracker,
  buildMilestones,
  fmtTrackTime,
  getTrackingSummary,
  labelOf,
} from '../../common/serviceMilestones';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import { hasCategorySpecs, specDisplayParts } from '../../../utils/deviceSpecs';
import { bookingPhotoUrls } from '../../../utils/bookingPhotos';

// GGFIX palette — same values used across the rest of the booking flow.
const ACCENT = '#035C6C';       // GGFIX green
const PRIMARY = '#035C6C';      // deeper GGFIX green
const MINT = '#E5F3F5';
const SOFT_MINT = '#F3F4F6';
const PAGE_BG = '#F3F4F6';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT_PRIMARY = '#111111';
const TEXT_SECONDARY = '#6B7280';
const SUCCESS = '#609138';      // GGFIX green — live dot, completed milestones
const DANGER = '#F84141';

// How often the open screen re-reads the booking. Technician actions in the
// Employee App land as events on the booking, so this is how fast they show.
// Not lower: GET /events also re-syncs the booking mirror server-side (writes),
// so a tighter poll multiplies database writes per open screen.
const POLL_MS = 10000;

const listOf = (v) => (Array.isArray(v) ? v : (v?.content ?? []));

function parseList(raw) {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
const urlOf = (x) => (typeof x === 'string' ? x : x?.url || x?.uri || x?.imageUrl || null);

// Technician material kept outside the event log, shaped for the tracker
// (display only — it never ticks a milestone): the device photos on the
// ticket, every issue note with its voice clip / photos, and solution-pack
// files.
function technicianExtras(ticket, notes, packs) {
  const out = [];
  // The photos taken at booking — shown under Booking Confirmed, where they were taken.
  const atBooking = bookingPhotoUrls(ticket);
  if (atBooking.length) out.push({ milestone: 'BOOKED', imageUrls: atBooking });
  const photos = parseList(ticket?.technicianPhotosJson).map(urlOf).filter(Boolean);
  if (photos.length) out.push({ milestone: 'DIAGNOSED', imageUrls: photos });
  // Issue notes (description + voice + photos) sit on Technician Issue Verified & Updated.
  notes.forEach((n) => out.push({
    milestone: 'DIAGNOSED',
    note: n.note, audioUrl: n.audioUrl || null, imageUrls: n.imageUrls || [], createdAt: n.createdAt,
  }));
  packs.forEach((p) => {
    const files = parseList(p.filesJson);
    out.push({
      milestone: 'DIAGNOSED',
      createdAt: p.createdAt,
      imageUrls: files.filter((f) => (f?.type || 'image') === 'image').map(urlOf).filter(Boolean),
      audioUrl: urlOf(files.find((f) => f?.type === 'audio')) || null,
    });
  });
  return out;
}

function timeAgo(v) {
  const t = Date.parse(v || '');
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return fmtTrackTime(v);
}

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const card = {
  backgroundColor: CARD_BG,
  borderRadius: 18,
  padding: 12,
  borderWidth: 1,
  borderColor: '#F3F4F6',
  ...cardShadow,
};

// Best-effort device-colour → swatch hex, same map used on Device Details.
const COLOR_HEX = {
  black: '#111111', white: '#E5F3F5', silver: '#D1D5DB', gray: '#9CA3AF', grey: '#9CA3AF',
  gold: '#D97706', rosegold: '#FECACA', beige: '#FDE68A', cream: '#FEF3C7', graphite: '#6B7280',
  blue: '#2563EB', navy: '#1E3A8A', red: '#DC2626', green: '#609138', yellow: '#F59E0B',
  purple: '#7C3AED', violet: '#7C3AED', pink: '#EC4899', orange: '#EA580C', brown: '#92400E',
  midnight: '#111111', starlight: '#FFFBEB', cosmicorange: '#EA580C',
};
function colorToHex(name) {
  if (!name) return '#D1D5DB';
  const k = String(name).trim().toLowerCase().replace(/\s+/g, '');
  if (COLOR_HEX[k]) return COLOR_HEX[k];
  // Marketing names ("Amazonian Red") — the longest colour word they contain.
  const hit = Object.keys(COLOR_HEX).sort((a, b) => b.length - a.length).find((c) => k.includes(c));
  return hit ? COLOR_HEX[hit] : '#D1D5DB';
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7626488).
function splitTrackingId(id) {
  const s = String(id ?? '').replace(/^#/, '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// Quality Check Completed is the one service step the shop can record itself —
// on a walk-in, or when the owner does the final check on the bench rather than
// the assigned technician. It is the same repair_booking_events row the
// technician's checklist writes (POST /tickets/{id}/progress-events), so
// whoever gets there first records it and the other side sees it as done. The
// row carries actor=OWNER, which is what distinguishes a deliberate shop tap
// from the actor=SHOP rows the backend auto-emits.
const QC_STATUS_KEY = 'QUALITY_CHECK_COMPLETED';

function fmtEventTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${date} · ${time}`;
}

// A ticket has no OS field, so it is derived from the device's real brand
// (master brands) and its catalogue category (master device-categories) —
// only where that pairing is unambiguous. Anything else shows "—".
function deviceOs(brandName, categoryCode) {
  const apple = /^apple$/i.test(String(brandName || '').trim());
  switch (String(categoryCode || '').toUpperCase()) {
    case 'MOBILE': return apple ? 'iOS' : 'Android';
    case 'TABLET': return apple ? 'iPadOS' : 'Android';
    case 'SMARTWATCHES': return apple ? 'watchOS' : null;
    case 'LAPTOP': return apple ? 'macOS' : null;
    default: return null;
  }
}


export default function BookingTimelineScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null;
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [qcSaving, setQcSaving] = useState(false);
  const [extras, setExtras] = useState([]);
  // Catalogue facts the ticket itself doesn't carry: the model photo (for
  // bookings without a deviceImageUrl — same fallback Home and Device Details
  // use), the brand name and the device category. Looked up once, not on
  // every 10 s poll.
  const [deviceMeta, setDeviceMeta] = useState({ image: null, brand: null, categoryCode: null, categoryName: null, ram: null, storage: null });
  const metaLookup = useRef(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      // The invoice is fetched alongside rather than inferred from the
      // INVOICE_GENERATED event: the event says the step happened, the invoice
      // row is the document itself, and the card below needs its number and the
      // moment it was raised. 404 = none yet.
      // Notes and solution packs carry technician material the event log
      // doesn't: every issue note (the event keeps only the latest) and the
      // pack's photos / voice clips.
      const [t, ev, inv, notes, packs] = await Promise.all([
        ticketApi.get(`/tickets/${ticketId}`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/events`).catch(() => []),
        ticketApi.get(`/tickets/${ticketId}/invoice`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/notes`).catch(() => []),
        ticketApi.get(`/tickets/${ticketId}/solution-packs`).catch(() => []),
      ]);
      setTicket(t);
      setExtras(technicianExtras(t, listOf(notes), listOf(packs)));
      if (!metaLookup.current && t?.brandId) {
        metaLookup.current = true;
        Promise.all([
          t.modelId ? getModelsByBrand(t.brandId).catch(() => []) : [],
          getBrands().catch(() => []),
          getDeviceCategories().catch(() => []),
          // The ticket carries only option ids — the labels ("6 GB", "128 GB") come from master data.
          t.ramOptionId ? getRamOptions().catch(() => []) : [],
          t.storageOptionId ? getStorageOptions().catch(() => []) : [],
        ]).then(([models, brands, cats, rams, storages]) => {
          const m = (models || []).find((x) => x.id === t.modelId);
          const brand = (brands || []).find((b) => b.id === t.brandId);
          const cat = m?.categoryId ? (cats || []).find((c) => c.id === m.categoryId) : null;
          setDeviceMeta({
            image: resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 }) || null,
            brand: brand?.name || null,
            categoryCode: cat?.code || null,
            categoryName: cat?.name || null,
            ram: (rams || []).find((x) => x.id === t.ramOptionId)?.label || null,
            storage: (storages || []).find((x) => x.id === t.storageOptionId)?.label || null,
          });
        });
      }
      setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
      setInvoice(inv || null);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load history');
    }
  }, [ticketId]);

  // Live while the screen is in front: poll every POLL_MS, stop when the app
  // goes to the background, and re-read the moment it comes back.
  useFocusEffect(useCallback(() => {
    let active = true;
    const start = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(load, POLL_MS);
    };
    (async () => { await load(); if (active) setLoading(false); })();
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { load(); start(); } else if (timer.current) { clearInterval(timer.current); timer.current = null; }
    });
    return () => {
      active = false;
      sub.remove();
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [load]));

  // "Updated 2 min ago" ages between polls too.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Mark the quality check done from the shop side. Idempotent on the backend
  // (emit-or-update keyed by status), so a double tap refreshes the row instead
  // of adding a second one — but confirm first, because this also advances the
  // ticket to Ready for Delivery via the master work-status mapping.
  const markQualityCheckCompleted = () => {
    Alert.alert(
      'Mark quality check completed?',
      'This records Quality Check Completed on the customer\'s Service History and moves the booking to Ready for Delivery.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark completed',
          onPress: async () => {
            setQcSaving(true);
            try {
              await ticketApi.post(`/tickets/${ticketId}/progress-events`, {
                body: { statusKey: QC_STATUS_KEY, actor: 'OWNER' },
              });
              await load();
            } catch (e) {
              Alert.alert('Could not save', e?.message || 'Please try again.');
            } finally {
              setQcSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <Loader label="Loading history..." />;

  const tid = splitTrackingId(ticket?.trackingId || ticketId);
  const qcEvent = events.find((e) => (e.status || '').toUpperCase() === QC_STATUS_KEY) || null;
  // Shop = the QC button here (OWNER) or Ticket Detail's progress rows (SHOP).
  const qcByOwner = ['OWNER', 'SHOP'].includes((qcEvent?.actor || '').toUpperCase());
  // One step at a time: the check is of a finished repair, so the button stays
  // locked until Repair Completed is on the timeline — recording it at Service
  // Accepted would jump the booking fifteen steps ahead.
  const qcBlockedBy = qcEvent ? null : stepBlockedBy(events, QC_STATUS_KEY);
  const milestones = buildMilestones(events, extras);
  const summary = getTrackingSummary(events, milestones);
  // Expected date only while the job is still open — Amazon's "Arriving Thu".
  const eta = summary.closed ? null : (ticket?.estimatedDeliveryAt || ticket?.estimatedReadyAt || null);
  const current = milestones.find((m) => m.state === 'current') || null;
  // Finished milestones — plus the re-estimate row from the moment it is
  // submitted (it only exists once a re-estimate is on the booking), shown as
  // in progress until the customer approves or rejects.
  const completed = milestones.filter((m) => m.state === 'done' || (m.key === 'APPROVAL' && m.state === 'current'));
  const currentNote = current?.latest?.note && current.latest.note !== labelOf(current.latest.status)
    ? current.latest.note : null;

  // What hangs under a milestone — on a finished row in the tracker, or in the
  // status card while that milestone is the one in progress.
  const milestoneExtra = (m) => {
    // The shop can close the quality check itself (walk-in, or the owner
    // checked it on the bench) — offered only while the repair is in progress.
    if (m.key === 'QUALITY_CHECK' && m.state === 'current' && !qcEvent) {
      return (
        <TouchableOpacity
          onPress={markQualityCheckCompleted}
          disabled={qcSaving || !!qcBlockedBy}
          activeOpacity={0.85}
          className="flex-row items-center justify-center"
          style={{
            marginTop: 8, borderRadius: 10, paddingVertical: 8,
            backgroundColor: qcBlockedBy ? SOFT_MINT : ACCENT, opacity: qcSaving ? 0.6 : 1,
          }}
        >
          {qcSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : qcBlockedBy ? (
            <>
              <Lock size={12} color={TEXT_SECONDARY} />
              <Text className="font-extrabold" style={{ fontSize: 11.5, marginLeft: 6, color: TEXT_SECONDARY }}>
                Quality check after {qcBlockedBy}
              </Text>
            </>
          ) : (
            <>
              <BadgeCheck size={13} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ fontSize: 11.5, marginLeft: 6 }}>
                Mark Quality Check Completed
              </Text>
            </>
          )}
        </TouchableOpacity>
      );
    }
    if (m.key === 'QUALITY_CHECK' && qcEvent) {
      return (
        <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 3 }}>
          {qcByOwner ? 'Shop QC Completed' : 'Technician QC Completed'}
        </Text>
      );
    }
    // The invoice opens the saved document, never the generator, so reading
    // the history can't raise a second bill.
    if (m.key === 'DELIVERED' && invoice) {
      return (
        <TouchableOpacity
          onPress={() => navigation.navigate('DeliveryInvoiceReport', { ticketId })}
          activeOpacity={0.85}
          className="flex-row items-center"
          style={{ marginTop: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: MINT }}
        >
          <ReceiptIndianRupee size={14} color={PRIMARY} />
          <Text className="font-extrabold" style={{ flex: 1, fontSize: 11.5, color: PRIMARY, marginLeft: 6 }} numberOfLines={1}>
            Invoice #{String(invoice.invoiceNo || '').replace(/^#+/, '') || '—'}
            <Text style={{ fontWeight: '500', color: TEXT_SECONDARY }}>  {fmtEventTime(invoice.generatedAt)}</Text>
          </Text>
          <Text className="font-extrabold" style={{ fontSize: 11.5, color: PRIMARY }}>View</Text>
          <ChevronRight size={13} color={PRIMARY} />
        </TouchableOpacity>
      );
    }
    return null;
  };

  // deviceDisplayName is saved as "Model · Model No. (specs)" — name, number
  // and specs each get their own line instead of one run-on title.
  const shownName = /^(.*?)(?: · ([^()]+?))?(?: \(([^)]*)\))?$/.exec(String(ticket?.deviceDisplayName || '').trim());
  const deviceName = shownName?.[1]?.trim() || ticket?.deviceModelName || ticket?.modelName || 'Device';
  const modelNumber = ticket?.modelNumber || shownName?.[2]?.trim() || null;
  const ramLabel = ticket?.ramLabel || deviceMeta.ram || null;
  const storageLabel = ticket?.storageLabel || deviceMeta.storage || null;
  // RAM, Storage (or the category's own specs), then Colour.
  const specLine = hasCategorySpecs(ticket)
    ? specDisplayParts(ticket).join(' · ')
    : [ramLabel ? `${ramLabel} RAM` : null, storageLabel && storageLabel !== ramLabel ? storageLabel : null]
      .filter(Boolean).join(' · ') || shownName?.[3]?.trim() || null;
  const colorName = ticket?.color || null;
  const deviceImage = ticket?.deviceImageUrl || deviceMeta.image || null;
  const osName = deviceOs(deviceMeta.brand, deviceMeta.categoryCode);

  const copyTrackingId = async () => {
    try {
      await Clipboard.setStringAsync(String(ticket?.trackingId || ticketId));
      Alert.alert('Copied', `Tracking ID #${ticket?.trackingId || ticketId} copied.`);
    } catch (_) {}
  };

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + rs(8),
          paddingBottom: rs(12),
          paddingHorizontal: rs(14),
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <View style={colStyle}>
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={6}
              style={{
                height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(10),
                alignItems: 'center', justifyContent: 'center', backgroundColor: SOFT_MINT,
                borderWidth: 1, borderColor: BORDER,
              }}
            >
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            {/* Centred title; the spacer mirrors the back button so it stays centred. */}
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
              <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY, textAlign: 'center' }} numberOfLines={1}>
                Service History
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(2), textAlign: 'center' }} numberOfLines={1}>
                Track the complete journey of this device
              </Text>
            </View>
            <View style={{ width: rs(36), marginLeft: rs(10) }} />
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} colors={[ACCENT]} />
        }
      >
        <View style={colStyle}>
          {/* ── Device card: photo, name, category, condition, then
              Storage / Colour / OS ── */}
          {ticket ? (
            <View style={card}>
              <View className="flex-row items-center">
                <View
                  style={{
                    width: 64, height: 64, borderRadius: 16, marginRight: 12, backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}
                >
                  {deviceImage ? (
                    <Image source={{ uri: deviceImage }} style={{ width: 56, height: 56 }} resizeMode="contain" />
                  ) : (
                    <Smartphone size={26} color={ACCENT} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Ticket number (tap to copy) — moved here from the header. */}
                  <TouchableOpacity
                    onPress={copyTrackingId}
                    activeOpacity={0.8}
                    className="flex-row items-center self-start"
                    style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 5, backgroundColor: MINT }}
                    accessibilityLabel={`Copy ticket number ${ticket?.trackingId || ticketId}`}
                  >
                    <Text style={{ fontSize: 10.5, fontWeight: '800' }} numberOfLines={1}>
                      <Text style={{ color: TEXT_PRIMARY }}>#{tid.prefix}</Text>
                      <Text style={{ color: ACCENT }}>{tid.digits}</Text>
                    </Text>
                    <Copy size={11} color={ACCENT} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                  <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.7, color: TEXT_SECONDARY }}>
                    Device{deviceMeta.categoryName ? ` · ${deviceMeta.categoryName}` : ''}
                  </Text>
                  {/* Model name → Model number → RAM · Storage · Colour, one per line. */}
                  <Text className="font-extrabold" style={{ fontSize: 15, lineHeight: 19, marginTop: 1, color: TEXT_PRIMARY }} numberOfLines={2}>
                    {deviceName}
                  </Text>
                  {modelNumber ? (
                    <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={1}>
                      Model No. <Text className="font-bold" style={{ color: TEXT_PRIMARY }}>{modelNumber}</Text>
                    </Text>
                  ) : null}
                  {(specLine || colorName || osName) ? (
                    <View className="flex-row items-center flex-wrap" style={{ marginTop: 3 }}>
                      {specLine ? (
                        <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginRight: 8 }}>{specLine}</Text>
                      ) : null}
                      {colorName ? (
                        <View className="flex-row items-center" style={{ marginRight: 8 }}>
                          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colorToHex(colorName), borderWidth: 1, borderColor: BORDER, marginRight: 4 }} />
                          <Text style={{ fontSize: 11, color: TEXT_SECONDARY }}>{colorName}</Text>
                        </View>
                      ) : null}
                      {osName ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: PRIMARY }}>{osName}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={{ marginTop: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD0D0' }}>
              <Text className="font-semibold" style={{ fontSize: 11, color: '#D63232' }}>{error}</Text>
            </View>
          ) : null}

          {/* Order tracking — where the job is now, then the milestones. Every
              tick comes from a real event on the booking; the step-by-step
              detail stays in the backend history and only surfaces as each
              milestone's latest update, notes, photos and voice note. */}
          <View style={[card, { marginTop: 10, padding: 14 }]}>
            <View className="flex-row items-start">
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-extrabold" style={{ fontSize: 17, lineHeight: 22, color: summary.danger ? DANGER : PRIMARY }}>
                  {summary.headline}
                </Text>
                {summary.latestLabel ? (
                  <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={1}>
                    Latest: {summary.latestLabel} · {timeAgo(summary.latestAt)}
                  </Text>
                ) : null}
              </View>
              {!summary.closed ? (
                <View className="flex-row items-center" style={{ marginLeft: 8, marginTop: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: MINT }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS, marginRight: 5 }} />
                  <Text className="font-extrabold" style={{ fontSize: 10, color: PRIMARY }}>Live</Text>
                </View>
              ) : null}
            </View>
            {eta ? (
              <View className="flex-row items-center" style={{ marginTop: 8 }}>
                <CalendarClock size={13} color={PRIMARY} />
                <Text style={{ fontSize: 11.5, color: TEXT_PRIMARY, marginLeft: 6 }}>
                  Expected by <Text className="font-extrabold">{fmtTrackTime(eta)}</Text>
                </Text>
              </View>
            ) : null}
            {/* The step in progress is told here, not drawn on the tracker:
                its latest note and the action that belongs to it. */}
            {currentNote ? (
              <Text style={{ fontSize: 12, color: TEXT_PRIMARY, marginTop: 6 }} numberOfLines={2}>{currentNote}</Text>
            ) : null}
            {current ? milestoneExtra(current) : null}
            {/* One by one: a milestone joins the tracker only once it is
                finished — nothing in progress or still to come is listed. */}
            {completed.length ? (
              <View style={{ marginTop: 14 }}>
                <ServiceMilestoneTracker milestones={completed} renderExtra={milestoneExtra} />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
