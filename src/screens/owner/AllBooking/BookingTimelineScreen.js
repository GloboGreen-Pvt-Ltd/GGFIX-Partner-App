import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Text, TouchableOpacity,
  View, StatusBar,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  Apple,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  List,
  Package,
  ReceiptIndianRupee,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Wrench,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import {
  ServiceHistoryTimeline,
  getCurrentPhaseLabel,
  getServiceProgress,
} from '../../common/serviceHistoryPhases';
import { rf, rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';

// GGFIX palette — same values used across the rest of the booking flow.
const ACCENT = '#09AD2A';       // GGFIX green
const PRIMARY = '#078F23';      // deeper GGFIX green
const MINT = '#EAF8EC';
const SOFT_MINT = '#F8F8F8';
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E6E6E6';
const TEXT_PRIMARY = '#1E1E1E';
const TEXT_SECONDARY = '#6B6B6B';
const SUCCESS = '#09AD2A';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

// Best-effort device-colour → swatch hex, same map used on Device Details.
const COLOR_HEX = {
  black: '#172117', white: '#EFF5EE', silver: '#CBD5CB', gray: '#8FA08F', grey: '#8FA08F',
  gold: '#D97706', rosegold: '#FECACA', beige: '#FDE68A', cream: '#FEF3C7', graphite: '#667066',
  blue: '#2563EB', navy: '#1E3A8A', red: '#DC2626', green: '#16A34A', yellow: '#F59E0B',
  purple: '#7C3AED', violet: '#7C3AED', pink: '#EC4899', orange: '#EA580C', brown: '#92400E',
  midnight: '#172117', starlight: '#FFFBEB', cosmicorange: '#EA580C',
};
function colorToHex(name) {
  if (!name) return '#D6D6D6';
  const k = String(name).trim().toLowerCase().replace(/\s+/g, '');
  return COLOR_HEX[k] || COLOR_HEX[k.split(/(?=[A-Z])/)[0]] || '#D6D6D6';
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

// A short, human line under the current status — keyed on the specific event
// status (not the coarse ticket status), so it reads as specifically as the
// reference's own example ("Technician Work Started" → "Your device is now
// with our technician."). Falls back to a generic line for any status not
// worth a bespoke sentence.
const STATUS_SUBTITLE = {
  BOOKING_CREATED_BY_SHOP: 'Your service request has been registered.',
  SERVICE_ACCEPTED: 'The shop has accepted your service request.',
  ASSIGNED_TO_TECHNICIAN: 'A technician has been assigned to your device.',
  AWAITING_TECHNICIAN_ACCEPTANCE: 'Waiting for the technician to accept this job.',
  REASSIGNED_TO_TECHNICIAN: 'Your device has been re-assigned to another technician.',
  TECHNICIAN_ACCEPTED_SERVICE: 'The technician has accepted this job.',
  TECHNICIAN_WORK_STARTED: 'Your device is now with our technician.',
  TECHNICIAN_UPLOADED_DEVICE_IMAGES: 'The technician has documented your device’s condition.',
  RE_ESTIMATED_CONFIRMED: 'A revised estimate is ready for your review.',
  CUSTOMER_APPROVED: 'The revised estimate has been approved.',
  IN_REPAIR: 'Repair work is currently in progress.',
  PARTS_REQUIRED: 'Waiting on a spare part for this repair.',
  REPAIR_COMPLETED: 'Repair work has been completed.',
  QUALITY_CHECK_COMPLETED: 'Quality check passed — your device is ready for delivery.',
  READY: 'Your device is ready for delivery.',
  DELIVERED_PROCESSING: 'Your device is being prepared for handover.',
  INVOICE_GENERATED: 'An invoice has been generated for this service.',
  CUSTOMER_REJECTED: 'You’ve declined the revised estimate.',
  REPAIR_NOT_COMPLETED: 'The device is being returned without a repair.',
  RETURN_DELIVERY: 'Your device is on its way back to you.',
  DELIVERED: 'This service is complete — your device has been delivered.',
  CANCELLED: 'This booking has been cancelled.',
};

function SectionHeader({ icon: Icon, label, subtitle, right }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: rs(12) }}>
      <View
        className="items-center justify-center"
        style={{ height: rs(32), width: rs(32), borderRadius: rs(11), backgroundColor: MINT, marginRight: rs(9) }}
      >
        <Icon size={rf(14)} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 10, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
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
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      // The invoice is fetched alongside rather than inferred from the
      // INVOICE_GENERATED event: the event says the step happened, the invoice
      // row is the document itself, and the card below needs its number and the
      // moment it was raised. 404 = none yet.
      const [t, ev, inv] = await Promise.all([
        ticketApi.get(`/tickets/${ticketId}`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/events`).catch(() => []),
        ticketApi.get(`/tickets/${ticketId}/invoice`).catch(() => null),
      ]);
      setTicket(t);
      setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
      setInvoice(inv || null);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load history');
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => { await load(); if (active) setLoading(false); })();
    timer.current = setInterval(load, 10000);
    return () => { active = false; if (timer.current) clearInterval(timer.current); };
  }, [load]));

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

  const currentLabel = getCurrentPhaseLabel(events, ticket?.status);
  const tid = splitTrackingId(ticket?.trackingId || ticketId);
  const qcEvent = events.find((e) => (e.status || '').toUpperCase() === QC_STATUS_KEY) || null;
  const qcByOwner = (qcEvent?.actor || '').toUpperCase() === 'OWNER';
  const progress = getServiceProgress(events, 'SERVICE');
  const progressPct = progress.total > 0 ? Math.min(1, progress.completed / progress.total) : 0;

  // The most recent event's own status key drives the subtitle line — more
  // specific than the ticket's coarse macro-status. Falls back to that macro
  // status, then a generic line, exactly mirroring getCurrentPhaseLabel's own
  // fallback order without touching that function.
  const sortedEvents = events.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const latestStatusKey = (sortedEvents[0]?.status || ticket?.status || '').toUpperCase();
  const currentSubtitle = STATUS_SUBTITLE[latestStatusKey] || 'We’re tracking every step of your repair.';

  const deviceName = ticket?.deviceDisplayName || ticket?.deviceModelName || ticket?.modelName || 'Device';
  const storageLabel = ticket?.storageLabel || ticket?.ramLabel || null;
  const colorName = ticket?.color || null;
  // Best-effort brand — the device name's own first word (e.g. "Apple iPhone
  // 17"), not a fabricated split. There's no separate brand field on a saved
  // ticket, so anything more specific would be a guess this can't verify.
  const brandName = deviceName.split(/\s+/)[0] || null;
  const isApple = /^apple$/i.test(brandName || '');
  // Honest, status-derived repair-state label — "Under Repair" only while the
  // booking is genuinely mid-service, not claimed once it's actually ready,
  // delivered or cancelled.
  const statusUpper = String(ticket?.status || '').toUpperCase();
  const repairStateLabel = statusUpper === 'DELIVERED'
    ? 'Delivered'
    : statusUpper === 'CANCELLED'
      ? 'Cancelled'
      : ['READY', 'DELIVERED_PROCESSING', 'INVOICE_GENERATED', 'INVOICE_READY'].includes(statusUpper)
        ? 'Ready for Delivery'
        : 'Under Repair';

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
              <ChevronLeft size={rf(19)} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY }} numberOfLines={1}>
                Service History
              </Text>
              <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                Track the complete journey of this device
              </Text>
            </View>
            <TouchableOpacity
              onPress={copyTrackingId}
              activeOpacity={0.8}
              className="flex-row items-center"
              style={{ maxWidth: rs(160), borderRadius: 999, paddingHorizontal: rs(11), paddingVertical: rs(8), backgroundColor: MINT }}
            >
              <Text style={{ fontSize: 10, fontWeight: '800' }} numberOfLines={1}>
                <Text style={{ color: TEXT_PRIMARY }}>#{tid.prefix}</Text>
                <Text style={{ color: ACCENT }}>{tid.digits}</Text>
              </Text>
              <Copy size={rf(11)} color={ACCENT} style={{ marginLeft: rs(6) }} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(24) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} colors={[ACCENT]} />
        }
      >
        <View style={colStyle}>
          {/* Device Summary Card */}
          {ticket ? (
            <View className="px-4" style={{ marginTop: rs(14) }}>
              <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, overflow: 'hidden', ...cardShadow }}>
                {/* Apple watermark — only shown when the device genuinely is
                    one; a fabricated brand-specific mark on a non-Apple
                    device would misrepresent it. */}
                {isApple ? (
                  <View pointerEvents="none" style={{ position: 'absolute', top: rs(10), right: rs(14), alignItems: 'center', opacity: 0.16 }}>
                    <Apple size={rf(52)} color={ACCENT} />
                  </View>
                ) : null}
                {isApple ? (
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: rs(12), right: rs(14), alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4, color: TEXT_SECONDARY, opacity: 0.55 }}>THINK</Text>
                    <Text style={{ fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4, color: TEXT_SECONDARY, opacity: 0.55 }}>DIFFERENT</Text>
                    <Text style={{ fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4, color: TEXT_SECONDARY, opacity: 0.55 }}>ALWAYS</Text>
                  </View>
                ) : null}

                <View className="flex-row items-center">
                  {ticket.deviceImageUrl ? (
                    <Image
                      source={{ uri: ticket.deviceImageUrl }}
                      style={{ width: rs(64), height: rs(64), borderRadius: rs(16), backgroundColor: MINT, marginRight: rs(13) }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      className="items-center justify-center"
                      style={{ width: rs(64), height: rs(64), borderRadius: rs(16), marginRight: rs(13), backgroundColor: MINT }}
                    >
                      <Smartphone size={rf(26)} color={ACCENT} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text className="uppercase font-bold" style={{ fontSize: 9.5, letterSpacing: 0.7, color: TEXT_SECONDARY }}>
                      DEVICE
                    </Text>
                    <Text className="font-extrabold" style={{ fontSize: 14.5, marginTop: rs(2), color: TEXT_PRIMARY }} numberOfLines={2}>
                      {deviceName}{storageLabel ? ` (${storageLabel})` : ''}
                    </Text>
                    <View className="flex-row items-center flex-wrap" style={{ marginTop: rs(7) }}>
                      {colorName ? (
                        <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(4), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER, marginRight: rs(7), marginBottom: rs(4) }}>
                          <View style={{ width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: colorToHex(colorName) }} />
                          <Text className="font-semibold" style={{ fontSize: 10.5, color: TEXT_PRIMARY, marginLeft: rs(5) }} numberOfLines={1}>{colorName}</Text>
                        </View>
                      ) : null}
                      {brandName ? (
                        <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(4), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER, marginBottom: rs(4) }}>
                          {isApple ? <Apple size={rf(10)} color={TEXT_PRIMARY} /> : <Smartphone size={rf(10)} color={TEXT_PRIMARY} />}
                          <Text className="font-semibold" style={{ fontSize: 10.5, color: TEXT_PRIMARY, marginLeft: rs(5) }} numberOfLines={1}>{brandName}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View className="flex-row items-center" style={{ marginTop: rs(12) }}>
                  <View className="flex-row items-center" style={{ marginRight: rs(16) }}>
                    <ShieldCheck size={rf(13)} color={ACCENT} />
                    <Text className="font-semibold" style={{ fontSize: 10.5, color: TEXT_PRIMARY, marginLeft: rs(5) }}>Genuine Device</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Package size={rf(13)} color={ACCENT} />
                    <Text className="font-semibold" style={{ fontSize: 10.5, color: TEXT_PRIMARY, marginLeft: rs(5) }}>{repairStateLabel}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {/* Current Status hero card */}
          <View className="px-4" style={{ marginTop: rs(14) }}>
            <View
              className="rounded-2xl"
              style={{ backgroundColor: MINT, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow, shadowOpacity: 0.04 }}
            >
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center"
                  style={{ height: rs(52), width: rs(52), borderRadius: rs(26), marginRight: rs(13), backgroundColor: '#FFFFFF' }}
                >
                  <Wrench size={rf(23)} color={ACCENT} />
                </View>
                <View className="flex-1">
                  <Text className="uppercase font-bold" style={{ fontSize: 9.5, letterSpacing: 0.8, color: PRIMARY }}>
                    CURRENT STATUS
                  </Text>
                  <Text className="font-extrabold" style={{ fontSize: 16, marginTop: rs(2), color: ACCENT }} numberOfLines={2}>
                    {currentLabel || 'Booking Placed'}
                  </Text>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={2}>
                    {currentSubtitle}
                  </Text>
                </View>
                {progress.total > 0 ? (
                  <View className="items-center" style={{ marginLeft: rs(6) }}>
                    <View
                      className="items-center"
                      style={{ borderRadius: rs(13), paddingHorizontal: rs(10), paddingVertical: rs(7), backgroundColor: '#FFFFFF' }}
                    >
                      <Text className="uppercase font-bold" style={{ fontSize: 7.5, letterSpacing: 0.5, color: TEXT_SECONDARY }}>Step</Text>
                      <Text className="font-extrabold" style={{ fontSize: 13, color: ACCENT }}>{progress.completed} / {progress.total}</Text>
                      <View style={{ width: rs(44), height: rs(4), borderRadius: rs(2), backgroundColor: BORDER, marginTop: rs(4), overflow: 'hidden' }}>
                        <View style={{ width: `${progressPct * 100}%`, height: '100%', backgroundColor: SUCCESS }} />
                      </View>
                      <Text className="font-semibold" style={{ fontSize: 8, color: TEXT_SECONDARY, marginTop: rs(3) }}>
                        {Math.round(progressPct * 100)}% complete
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Live status strip */}
          <View className="px-4" style={{ marginTop: rs(10) }}>
            <View
              className="flex-row items-center justify-between"
              style={{ backgroundColor: SOFT_MINT, borderRadius: rs(14), paddingHorizontal: rs(13), paddingVertical: rs(9) }}
            >
              <View className="flex-row items-center flex-1">
                <RotateCw size={rf(11)} color={TEXT_SECONDARY} />
                <Text className="flex-1" style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginLeft: rs(6) }} numberOfLines={1}>
                  {events.length} event{events.length === 1 ? '' : 's'} • Updated live • Pull to refresh
                </Text>
              </View>
              <View className="flex-row items-center" style={{ marginLeft: rs(8) }}>
                <View style={{ width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: SUCCESS, marginRight: rs(5) }} />
                <Text className="font-extrabold" style={{ fontSize: 9.5, color: SUCCESS }}>Live Updates</Text>
                <ChevronRight size={rf(12)} color={SUCCESS} style={{ marginLeft: rs(2) }} />
              </View>
            </View>
          </View>

          {/* Quality check — the shop's own way to close this step. Either side
              can record it; the card reflects whichever happened, including a
              technician's tap, so the two apps never disagree. */}
          <View className="px-4" style={{ marginTop: rs(14) }}>
            <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
              <SectionHeader
                icon={BadgeCheck}
                label="Quality Check"
                right={!qcEvent ? (
                  <View className="rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(4), backgroundColor: '#FEF3C7' }}>
                    <Text className="font-extrabold" style={{ fontSize: 9.5, color: '#B45309' }}>Pending</Text>
                  </View>
                ) : null}
              />
              {qcEvent ? (
                <View className="flex-row items-center">
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(11), backgroundColor: MINT }}
                  >
                    <BadgeCheck size={rf(17)} color={ACCENT} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }}>
                      Quality Check Completed
                    </Text>
                    <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: rs(1) }}>
                      {fmtEventTime(qcEvent.createdAt)}
                      {qcByOwner ? '  ·  Marked by shop' : '  ·  Marked by technician'}
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginBottom: rs(12), lineHeight: rf(16) }}>
                    Not recorded yet. The assigned technician can mark this from their app —
                    or record it here if the shop did the check.
                  </Text>
                  <TouchableOpacity
                    onPress={markQualityCheckCompleted}
                    disabled={qcSaving}
                    activeOpacity={0.85}
                    className="flex-row items-center justify-center"
                    style={{ borderRadius: rs(16), paddingVertical: rs(13), backgroundColor: ACCENT, opacity: qcSaving ? 0.6 : 1 }}
                  >
                    {qcSaving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <BadgeCheck size={rf(15)} color="#FFFFFF" />
                        <Text className="text-white font-extrabold" style={{ fontSize: 12.5, marginLeft: rs(7) }}>
                          Mark Quality Check Completed
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Invoice — the document behind the "Invoice Generated" step. Shown
              only once one exists, and it opens the saved invoice rather than the
              generator, so reading the history can't raise a second bill. Not
              part of the reference's section list, but kept — it's real,
              conditional data this screen already surfaced. */}
          {invoice ? (
            <View className="px-4" style={{ marginTop: rs(14) }}>
              <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
                <SectionHeader icon={ReceiptIndianRupee} label="Invoice" />
                <View className="flex-row items-center">
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(11), backgroundColor: '#FEF3C7' }}
                  >
                    <ReceiptIndianRupee size={rf(17)} color="#B45309" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }} numberOfLines={1}>
                      Invoice #{String(invoice.invoiceNo || '').replace(/^#+/, '') || '—'}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: rs(1) }}>
                      {fmtEventTime(invoice.generatedAt) || 'Generated'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('DeliveryInvoiceReport', { ticketId })}
                    activeOpacity={0.85}
                    style={{ borderRadius: rs(12), paddingHorizontal: rs(14), paddingVertical: rs(10), backgroundColor: ACCENT }}
                  >
                    <Text className="text-white font-extrabold" style={{ fontSize: 11.5 }}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {error ? (
            <View className="px-4" style={{ marginTop: rs(14) }}>
              <View
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
              >
                <Text className="font-semibold" style={{ fontSize: 11.5, color: '#B91C1C' }}>{error}</Text>
              </View>
            </View>
          ) : null}

          {/* Service Timeline */}
          <View className="px-4" style={{ marginTop: rs(14) }}>
            <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
              <SectionHeader
                icon={History}
                label="Service Timeline"
                subtitle="Track each step of your device repair"
                right={(
                  <TouchableOpacity
                    onPress={() => setTimelineExpanded((v) => !v)}
                    activeOpacity={0.8}
                    className="flex-row items-center"
                    style={{ borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(6), borderWidth: 1, borderColor: ACCENT }}
                  >
                    <List size={rf(11)} color={ACCENT} />
                    <Text className="font-extrabold" style={{ fontSize: 10, color: ACCENT, marginLeft: rs(4) }}>
                      {timelineExpanded ? 'Show Less' : 'View All'}
                    </Text>
                  </TouchableOpacity>
                )}
              />
              <ServiceHistoryTimeline
                events={events}
                status={ticket?.status}
                phaseFilter="SERVICE"
                visibleStageLimit={timelineExpanded ? undefined : 2}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
