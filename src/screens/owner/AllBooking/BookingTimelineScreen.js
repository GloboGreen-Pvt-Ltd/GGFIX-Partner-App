import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Text, TouchableOpacity,
  View, StatusBar,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
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
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { getBrands, getDeviceCategories, getModelsByBrand } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';
import {
  ServiceHistoryTimeline,
  getServiceProgress,
} from '../../common/serviceHistoryPhases';
import { rs } from '../../../utils/responsive';
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
  shadowColor: '#1E1E1E',
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
  borderColor: '#F3F3F3',
  ...cardShadow,
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
  if (COLOR_HEX[k]) return COLOR_HEX[k];
  // Marketing names ("Amazonian Red") — the longest colour word they contain.
  const hit = Object.keys(COLOR_HEX).sort((a, b) => b.length - a.length).find((c) => k.includes(c));
  return hit ? COLOR_HEX[hit] : '#D6D6D6';
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


function SectionHeader({ icon: Icon, label, subtitle, right }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 10 }}>
      <View
        className="items-center justify-center"
        style={{ height: 28, width: 28, borderRadius: 9, backgroundColor: MINT, marginRight: 9 }}
      >
        <Icon size={14} color={ACCENT} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text>
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
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  // Catalogue facts the ticket itself doesn't carry: the model photo (for
  // bookings without a deviceImageUrl — same fallback Home and Device Details
  // use), the brand name and the device category. Looked up once, not on
  // every 10 s poll.
  const [deviceMeta, setDeviceMeta] = useState({ image: null, brand: null, categoryCode: null, categoryName: null });
  const metaLookup = useRef(false);
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
      if (!metaLookup.current && t?.brandId) {
        metaLookup.current = true;
        Promise.all([
          t.modelId ? getModelsByBrand(t.brandId).catch(() => []) : [],
          getBrands().catch(() => []),
          getDeviceCategories().catch(() => []),
        ]).then(([models, brands, cats]) => {
          const m = (models || []).find((x) => x.id === t.modelId);
          const brand = (brands || []).find((b) => b.id === t.brandId);
          const cat = m?.categoryId ? (cats || []).find((c) => c.id === m.categoryId) : null;
          setDeviceMeta({
            image: resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 }) || null,
            brand: brand?.name || null,
            categoryCode: cat?.code || null,
            categoryName: cat?.name || null,
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

  const tid = splitTrackingId(ticket?.trackingId || ticketId);
  const qcEvent = events.find((e) => (e.status || '').toUpperCase() === QC_STATUS_KEY) || null;
  const qcByOwner = (qcEvent?.actor || '').toUpperCase() === 'OWNER';
  const progress = getServiceProgress(events, 'SERVICE');
  const progressPct = progress.total > 0 ? Math.min(1, progress.completed / progress.total) : 0;

  const deviceName = ticket?.deviceDisplayName || ticket?.deviceModelName || ticket?.modelName || 'Device';
  const storageLabel = ticket?.storageLabel || null;
  const ramLabel = ticket?.ramLabel && ticket.ramLabel !== ticket?.storageLabel ? ticket.ramLabel : null;
  const colorName = ticket?.color || null;
  const deviceImage = ticket?.deviceImageUrl || deviceMeta.image || null;
  const osName = deviceOs(deviceMeta.brand, deviceMeta.categoryCode);
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
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY }} numberOfLines={1}>
                Service History
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={2}>
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
              <Copy size={11} color={ACCENT} style={{ marginLeft: rs(6) }} />
            </TouchableOpacity>
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
                    borderWidth: 1, borderColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}
                >
                  {deviceImage ? (
                    <Image source={{ uri: deviceImage }} style={{ width: 56, height: 56 }} resizeMode="contain" />
                  ) : (
                    <Smartphone size={26} color={ACCENT} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.7, color: TEXT_SECONDARY }}>
                    Device{deviceMeta.categoryName ? ` · ${deviceMeta.categoryName}` : ''}
                  </Text>
                  <Text className="font-extrabold" style={{ fontSize: 15, lineHeight: 19, marginTop: 1, color: TEXT_PRIMARY }} numberOfLines={2}>
                    {deviceName}
                  </Text>
                  {/* Storage · colour · OS on one line under the name — only
                      the parts this booking actually has. */}
                  {(storageLabel || ramLabel || colorName || osName) ? (
                    <View className="flex-row items-center flex-wrap" style={{ marginTop: 3 }}>
                      {[storageLabel, ramLabel ? `${ramLabel} RAM` : null].filter(Boolean).length ? (
                        <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginRight: 8 }}>
                          {[storageLabel, ramLabel ? `${ramLabel} RAM` : null].filter(Boolean).join(' · ')}
                        </Text>
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
                  <View className="flex-row items-center flex-wrap" style={{ marginTop: 5 }}>
                    <View className="flex-row items-center" style={{ marginRight: 14 }}>
                      <ShieldCheck size={12} color={ACCENT} />
                      <Text className="font-semibold" style={{ fontSize: 11, color: TEXT_PRIMARY, marginLeft: 4 }}>Genuine Device</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Package size={12} color={ACCENT} />
                      <Text className="font-semibold" style={{ fontSize: 11, color: TEXT_PRIMARY, marginLeft: 4 }}>{repairStateLabel}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {/* Live status strip */}
          <View
            className="flex-row items-center justify-between"
            style={{ marginTop: 8, paddingHorizontal: 4, paddingVertical: 4 }}
          >
            <View className="flex-row items-center flex-1">
              <RotateCw size={11} color={TEXT_SECONDARY} />
              <Text className="flex-1" style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 6 }} numberOfLines={1}>
                {events.length} event{events.length === 1 ? '' : 's'} • Updated live • Pull to refresh
              </Text>
            </View>
            <View className="flex-row items-center" style={{ marginLeft: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS, marginRight: 5 }} />
              <Text className="font-extrabold" style={{ fontSize: 10, color: PRIMARY }}>Live Updates</Text>
              <ChevronRight size={12} color={PRIMARY} style={{ marginLeft: 2 }} />
            </View>
          </View>

          {/* Quality check — the shop's own way to close this step. Either side
              can record it; the card reflects whichever happened, including a
              technician's tap, so the two apps never disagree. */}
          <View style={[card, { marginTop: 8 }]}>
            <SectionHeader
              icon={BadgeCheck}
              label="Quality Check"
              subtitle={qcEvent ? null : 'Not recorded yet'}
              right={!qcEvent ? (
                <View className="rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FFF8E1' }}>
                  <Text className="font-extrabold" style={{ fontSize: 10, color: '#8A6A00' }}>Pending</Text>
                </View>
              ) : (
                <View className="rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: MINT }}>
                  <Text className="font-extrabold" style={{ fontSize: 10, color: PRIMARY }}>Done</Text>
                </View>
              )}
            />
            {qcEvent ? (
              <View className="flex-row items-center" style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: MINT }}>
                <BadgeCheck size={16} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: 9 }}>
                  <Text className="font-extrabold" style={{ fontSize: 12, color: TEXT_PRIMARY }}>
                    Quality Check Completed
                  </Text>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }}>
                    {fmtEventTime(qcEvent.createdAt)}
                    {qcByOwner ? '  ·  Marked by shop' : '  ·  Marked by technician'}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 10, lineHeight: 16 }}>
                  The assigned technician can mark this from their app —
                  or record it here if the shop did the check.
                </Text>
                <TouchableOpacity
                  onPress={markQualityCheckCompleted}
                  disabled={qcSaving}
                  activeOpacity={0.85}
                  className="flex-row items-center justify-center"
                  style={{ borderRadius: 12, paddingVertical: 10, backgroundColor: ACCENT, opacity: qcSaving ? 0.6 : 1 }}
                >
                  {qcSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <BadgeCheck size={14} color="#FFFFFF" />
                      <Text className="text-white font-extrabold" style={{ fontSize: 12, marginLeft: 7 }}>
                        Mark Quality Check Completed
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Invoice — the document behind the "Invoice Generated" step. Shown
              only once one exists, and it opens the saved invoice rather than the
              generator, so reading the history can't raise a second bill. */}
          {invoice ? (
            <View style={[card, { marginTop: 10 }]}>
              <View className="flex-row items-center">
                <View className="items-center justify-center" style={{ height: 32, width: 32, borderRadius: 16, marginRight: 10, backgroundColor: '#FFF8E1' }}>
                  <ReceiptIndianRupee size={15} color="#8A6A00" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }} numberOfLines={1}>
                    Invoice #{String(invoice.invoiceNo || '').replace(/^#+/, '') || '—'}
                  </Text>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }}>
                    {fmtEventTime(invoice.generatedAt) || 'Generated'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('DeliveryInvoiceReport', { ticketId })}
                  activeOpacity={0.85}
                  style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: ACCENT }}
                >
                  <Text className="text-white font-extrabold" style={{ fontSize: 11 }}>View</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={{ marginTop: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD0D0' }}>
              <Text className="font-semibold" style={{ fontSize: 11, color: '#D63232' }}>{error}</Text>
            </View>
          ) : null}

          {/* Service Timeline — every step as a list row */}
          <View style={[card, { marginTop: 10 }]}>
            <SectionHeader
              icon={History}
              label="Service Timeline"
              subtitle={progress.total > 0
                ? `Step ${progress.completed} of ${progress.total} · ${Math.round(progressPct * 100)}% complete`
                : 'Track each step of your device repair'}
              right={(
                <TouchableOpacity
                  onPress={() => setTimelineExpanded((v) => !v)}
                  activeOpacity={0.8}
                  className="flex-row items-center"
                  style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: MINT }}
                >
                  <List size={11} color={PRIMARY} />
                  <Text className="font-extrabold" style={{ fontSize: 11, color: PRIMARY, marginLeft: 4 }}>
                    {timelineExpanded ? 'Show Less' : 'View All'}
                  </Text>
                </TouchableOpacity>
              )}
            />
            {progress.total > 0 ? (
              <View style={{ height: 4, borderRadius: 2, backgroundColor: '#F3F3F3', overflow: 'hidden', marginTop: -2, marginBottom: 12 }}>
                <View style={{ width: `${progressPct * 100}%`, height: '100%', backgroundColor: SUCCESS }} />
              </View>
            ) : null}
            <ServiceHistoryTimeline
              events={events}
              status={ticket?.status}
              phaseFilter="SERVICE"
              visibleStageLimit={timelineExpanded ? undefined : 2}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
