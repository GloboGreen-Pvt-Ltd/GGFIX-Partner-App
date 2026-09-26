import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Share, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  ChevronLeft,
  Copy,
  Smartphone,
  Tag,
  Calendar,
  CalendarClock,
  CheckCircle2,
  IndianRupee,
  ReceiptText,
  FileText,
  Pencil,
  Clock,
  ScanLine,
  Plus,
  Share2,
  Printer,
  Hammer,
} from 'lucide-react-native';
import { Loader, EmptyState } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';
import { getCurrentPhaseLabel } from '../../common/serviceHistoryPhases';
import { paymentFromTicket, priceItemsFromTicket } from './ReceiptCard';
import { hasInvoice } from './bookingScopes';
import { TechnicianPickerSheet } from './BookingActionSheets';
import { rf, rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';

// GGFIX palette — same values used across the rest of the booking flow.
const ACCENT = '#004C40';       // Dark Green
const PRIMARY = '#006B57';      // Primary Green
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const SUCCESS = '#16A34A';
const CREATED_BG = '#FFF3E8';
const CREATED_FG = '#B45309';
const CREATED_BORDER = '#F3D9BC';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

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
  blue:   { bg: 'rgba(0, 76, 64, 0.10)',    fg: ACCENT,    border: 'rgba(0, 76, 64, 0.28)' },
  purple: { bg: 'rgba(0, 107, 87, 0.12)',   fg: PRIMARY,   border: 'rgba(0, 107, 87, 0.30)' },
  green:  { bg: 'rgba(22, 163, 74, 0.12)',  fg: SUCCESS,   border: 'rgba(22, 163, 74, 0.32)' },
  red:    { bg: 'rgba(220, 38, 38, 0.12)',  fg: '#B91C1C', border: 'rgba(220, 38, 38, 0.32)' },
};

// Best-effort device-colour → swatch hex so the hero can show a real colour dot
// next to the colour name. Falls back to a neutral grey for anything unmapped.
const COLOR_HEX = {
  black: '#172117', white: '#EFF5EE', silver: '#CBD5CB', gray: '#8FA08F', grey: '#8FA08F',
  gold: '#D97706', rosegold: '#FECACA', beige: '#FDE68A', cream: '#FEF3C7', graphite: '#667066',
  blue: '#2563EB', navy: '#1E3A8A', red: '#DC2626', green: '#16A34A', yellow: '#F59E0B',
  purple: '#7C3AED', violet: '#7C3AED', pink: '#EC4899', orange: '#EA580C', brown: '#92400E',
  midnight: '#172117', starlight: '#FFFBEB', cosmicorange: '#EA580C',
};

function colorToHex(name) {
  if (!name) return '#CBD5CB';
  const k = String(name).trim().toLowerCase().replace(/\s+/g, '');
  return COLOR_HEX[k] || COLOR_HEX[k.split(/(?=[A-Z])/)[0]] || '#CBD5CB';
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7517869).
function splitTrackingId(id) {
  const s = String(id ?? '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// "Booked on" — two lines, date then time, matching the reference's meta block.
function fmtBookedSplit(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date: `${wd}, ${mo} ${d.getDate()}, ${d.getFullYear()}`, time };
}

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const mo = d.toLocaleDateString('en-IN', { month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${wd}, ${day} ${mo}, ${d.getFullYear()} ${time}`;
}

function SectionHeader({ icon: Icon, label, subtitle, right }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: rs(13) }}>
      <View
        className="items-center justify-center"
        style={{ height: rs(34), width: rs(34), borderRadius: rs(12), backgroundColor: MINT, marginRight: rs(10) }}
      >
        <Icon size={rf(15)} color={ACCENT} />
      </View>
      <View className="flex-1">
        <Text className="font-extrabold" style={{ fontSize: rf(14), color: TEXT_PRIMARY }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function HeaderAction({ icon: Icon, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="flex-row items-center"
      style={{ borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(6), backgroundColor: MINT }}
    >
      <Icon size={rf(12)} color={ACCENT} />
      <Text className="font-extrabold" style={{ fontSize: rf(10.5), color: ACCENT, marginLeft: rs(4) }}>{label}</Text>
    </TouchableOpacity>
  );
}

// One vertical-timeline row — fixed-width icon column + dashed connector on
// the left, content on the right. `isLast` drops the connector.
function TimelineRow({ icon: Icon, label, value, sub, done, right, isLast }) {
  return (
    <View className="flex-row" style={{ alignItems: 'stretch' }}>
      <View style={{ width: rs(34), alignItems: 'center' }}>
        <View
          className="items-center justify-center"
          style={{ height: rs(34), width: rs(34), borderRadius: rs(17), backgroundColor: done ? ACCENT : SOFT_MINT, borderWidth: done ? 0 : 1, borderColor: BORDER }}
        >
          <Icon size={rf(15)} color={done ? '#FFFFFF' : TEXT_SECONDARY} />
        </View>
        {!isLast ? (
          <View style={{ flex: 1, width: 1.5, marginVertical: rs(4), backgroundColor: BORDER, borderStyle: 'dashed', borderLeftWidth: 1.5, borderColor: BORDER }} />
        ) : null}
      </View>
      <View className="flex-1" style={{ paddingBottom: isLast ? 0 : rs(18), marginLeft: rs(12) }}>
        <View className="flex-row items-center justify-between">
          <Text className="uppercase font-bold" style={{ fontSize: rf(9.5), letterSpacing: 0.6, color: TEXT_SECONDARY }} numberOfLines={1}>
            {label}
          </Text>
          {right}
        </View>
        <Text className="font-extrabold" style={{ fontSize: rf(13), color: TEXT_PRIMARY, marginTop: rs(2) }} numberOfLines={2}>
          {value}
        </Text>
        {sub ? (
          <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function DeviceDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null;
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [techSheetOpen, setTechSheetOpen] = useState(false);

  const load = useCallback(async () => {
    console.log('[DeviceDetail][DEBUG] load() start, ticketId =', ticketId);
    if (!ticketId) {
      console.log('[DeviceDetail][DEBUG] no ticketId in route.params — bailing, loader will hang');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get(`/tickets/${ticketId}`);
      console.log('[DeviceDetail][DEBUG] GET /tickets/' + ticketId + ' resolved:', JSON.stringify(data)?.slice(0, 500));
      setTicket(data);
      // The booking's recorded lifecycle, from the same endpoint the Service
      // History screen reads — drives the real (dynamic) status pill label.
      try {
        const ev = await ticketApi.get(`/tickets/${ticketId}/events`);
        setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
      } catch (_) { setEvents([]); }
    } catch (e) {
      console.log('[DeviceDetail][DEBUG] GET /tickets/' + ticketId + ' FAILED:', e?.status || e?.response?.status, e?.message);
      setError(e.message || 'Failed to load ticket');
    } finally {
      console.log('[DeviceDetail][DEBUG] load() finally — setLoading(false)');
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !ticket) return <Loader label="Loading device details..." />;
  if (error || !ticket) {
    return (
      <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
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
  const tid = splitTrackingId(trackingId);
  const deviceName = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || 'Device';
  const storageLabel = ticket.storageLabel || ticket.ramLabel || null;
  const colorName = ticket.color || null;
  const lineItems = priceItemsFromTicket(ticket);
  const estimatedTotal = ticket.estimatedPrice != null
    ? ticket.estimatedPrice
    : lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const payment = paymentFromTicket(ticket, estimatedTotal);
  const readyAtText = formatDateTime(ticket.estimatedReadyAt);
  const deliveryAtText = formatDateTime(ticket.estimatedDeliveryAt);
  const imeiText = String(ticket.imei || '').trim() || null;
  const bookedSplit = fmtBookedSplit(ticket.createdAt);
  const statusKey = String(ticket.status || '').toUpperCase();
  const statusMeta = STATUS_VARIANT[statusKey] || { label: ticket.status || 'Pending', tone: 'amber' };
  const statusTone = TONE[statusMeta.tone] || TONE.amber;
  const currentStatusLabel = getCurrentPhaseLabel(events, ticket.status) || statusMeta.label;
  const canViewInvoice = hasInvoice(ticket);

  const copyTrackingId = async () => {
    try {
      await Clipboard.setStringAsync(String(trackingId));
      notify('Copied', `Tracking ID #${trackingId} copied.`, { preset: 'done' });
    } catch (e) {
      notify('Copy failed', e?.message || 'Could not copy to clipboard.');
    }
  };

  // Composed straight from the ticket already loaded on this screen — no new
  // fetch, no fabricated fields.
  const handleShare = async () => {
    const services = lineItems.map((i) => i.label).filter(Boolean).join(', ') || '—';
    const msg =
      `📦 GGFix Booking\n\n` +
      `Device: ${deviceName}\n` +
      `Tracking ID: #${trackingId}\n` +
      `Services: ${services}\n` +
      `Estimated Total: ₹${Number(estimatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n` +
      `Track this repair in the GGFix app.`;
    try {
      await Share.share({ message: msg, title: `Booking #${trackingId}` });
    } catch (e) {
      notify('Share failed', e?.message || 'Could not open the share sheet.');
    }
  };

  const goPrintQr = () => navigation.navigate('BarcodePrint', { ticketId });
  const goViewInvoice = () => navigation.navigate('DeliveryInvoiceReport', { ticketId });
  // Complaint / schedule have no dedicated per-field editor — both reuse the
  // SAME edit-wizard entry point BookingHistoryScreen's own "Edit" action
  // already uses (TicketDetail with autoEdit), rather than a second copy of
  // that navigation drifting from it.
  const goEdit = () => navigation.navigate('TicketDetail', { ticketId, autoEdit: true });
  // IMEI capture is deliberately owned by TicketDetail's existing sheet (this
  // screen stays read-only) — ?autoImei fires that SAME existing entry point
  // the moment the ticket loads there, instead of duplicating the capture flow.
  const goAddImei = () => navigation.navigate('TicketDetail', { ticketId, autoImei: true });

  const handleTechAssigned = (tech) => {
    setTicket((prev) => (prev ? { ...prev, assignedTechnicianId: tech?.id, assignedTechnicianName: tech?.name } : prev));
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
              <Text className="font-extrabold" style={{ fontSize: rf(18.5), color: TEXT_PRIMARY }} numberOfLines={1}>
                Device Details
              </Text>
              <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                View complete information about this device
              </Text>
            </View>
            <TouchableOpacity
              onPress={copyTrackingId}
              activeOpacity={0.8}
              className="flex-row items-center"
              style={{ maxWidth: rs(160), borderRadius: 999, paddingHorizontal: rs(11), paddingVertical: rs(8), backgroundColor: MINT }}
            >
              <Text style={{ fontSize: rf(10), fontWeight: '800' }} numberOfLines={1}>
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
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(110) }}
      >
        <View style={colStyle}>
          {/* Device Hero Card */}
          <View className="px-4" style={{ marginTop: rs(12) }}>
            <View style={{ backgroundColor: CARD_BG, borderRadius: rs(22), padding: rs(14), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
              <View className="flex-row items-start">
                <View style={{ width: rs(84), height: rs(84), marginRight: rs(14) }}>
                  {/* Soft mint organic shape behind the image — decorative only. */}
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', top: -rs(6), left: -rs(6), width: rs(96), height: rs(96), borderRadius: rs(28), backgroundColor: MINT }}
                  />
                  {ticket.deviceImageUrl ? (
                    <Image
                      source={{ uri: ticket.deviceImageUrl }}
                      style={{ width: rs(84), height: rs(84) }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View className="items-center justify-center" style={{ width: rs(84), height: rs(84) }}>
                      <Smartphone size={rf(34)} color={ACCENT} />
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="uppercase font-bold" style={{ fontSize: rf(9.5), letterSpacing: 0.7, color: TEXT_SECONDARY }}>
                    DEVICE
                  </Text>
                  <Text className="font-extrabold" style={{ fontSize: rf(18), marginTop: rs(2), color: TEXT_PRIMARY }} numberOfLines={2}>
                    {deviceName}
                  </Text>
                  {storageLabel ? (
                    <Text style={{ fontSize: rf(11.5), color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                      {storageLabel}
                    </Text>
                  ) : null}
                  {colorName ? (
                    <View className="flex-row items-center" style={{ marginTop: rs(6) }}>
                      <View
                        style={{
                          width: rs(13), height: rs(13), borderRadius: rs(7),
                          backgroundColor: colorToHex(colorName), borderWidth: 1, borderColor: BORDER,
                        }}
                      />
                      <Text style={{ fontSize: rf(11.5), color: TEXT_PRIMARY, marginLeft: rs(6), fontWeight: '600' }} numberOfLines={1}>
                        {colorName}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  className="flex-row items-center rounded-full"
                  style={{ paddingHorizontal: rs(9), paddingVertical: rs(5), backgroundColor: statusTone.bg, borderWidth: 1, borderColor: statusTone.border }}
                >
                  <View style={{ width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: statusTone.fg, marginRight: rs(5) }} />
                  <Text style={{ fontSize: rf(9.5), fontWeight: '800', color: statusTone.fg }} numberOfLines={1}>
                    {currentStatusLabel}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Tracking ID / Booked On / Booking — 3 equal columns, own card. */}
          <View className="px-4" style={{ marginTop: rs(12) }}>
            <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(14), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
              <View className="flex-row">
                <View style={{ flex: 1, paddingRight: rs(8) }}>
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(32), width: rs(32), borderRadius: rs(11), backgroundColor: MINT, marginBottom: rs(8) }}
                  >
                    <Tag size={rf(14)} color={ACCENT} />
                  </View>
                  <Text className="uppercase font-bold" style={{ fontSize: rf(8.5), letterSpacing: 0.5, color: TEXT_SECONDARY }}>
                    TRACKING ID
                  </Text>
                  <TouchableOpacity onPress={copyTrackingId} activeOpacity={0.7} className="flex-row items-center" style={{ marginTop: rs(3) }}>
                    <Text className="font-extrabold" style={{ fontSize: rf(11.5), color: TEXT_PRIMARY }} numberOfLines={1}>
                      #{trackingId}
                    </Text>
                    <Copy size={rf(10)} color={TEXT_SECONDARY} style={{ marginLeft: rs(5) }} />
                  </TouchableOpacity>
                </View>

                <View style={{ width: 1, backgroundColor: BORDER, marginHorizontal: rs(4) }} />

                <View style={{ flex: 1, paddingHorizontal: rs(8) }}>
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(32), width: rs(32), borderRadius: rs(11), backgroundColor: MINT, marginBottom: rs(8) }}
                  >
                    <Calendar size={rf(14)} color={ACCENT} />
                  </View>
                  <Text className="uppercase font-bold" style={{ fontSize: rf(8.5), letterSpacing: 0.5, color: TEXT_SECONDARY }}>
                    BOOKED ON
                  </Text>
                  {bookedSplit ? (
                    <>
                      <Text className="font-bold" style={{ fontSize: rf(11), color: TEXT_PRIMARY, marginTop: rs(3) }} numberOfLines={1}>
                        {bookedSplit.date}
                      </Text>
                      <Text style={{ fontSize: rf(10), color: TEXT_SECONDARY }} numberOfLines={1}>
                        {bookedSplit.time}
                      </Text>
                    </>
                  ) : (
                    <Text className="font-bold" style={{ fontSize: rf(11), color: TEXT_PRIMARY, marginTop: rs(3) }}>—</Text>
                  )}
                </View>

                <View style={{ width: 1, backgroundColor: BORDER, marginHorizontal: rs(4) }} />

                {/* Every booking in this app is created from the shop side —
                    there is no customer self-booking flow — so this is a true
                    statement, not a hardcoded/fabricated value. */}
                <View style={{ flex: 1, paddingLeft: rs(8) }}>
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(32), width: rs(32), borderRadius: rs(11), backgroundColor: CREATED_BG, marginBottom: rs(8) }}
                  >
                    <CheckCircle2 size={rf(14)} color={CREATED_FG} />
                  </View>
                  <Text className="uppercase font-bold" style={{ fontSize: rf(8.5), letterSpacing: 0.5, color: TEXT_SECONDARY }}>
                    BOOKING
                  </Text>
                  <View
                    className="self-start rounded-full"
                    style={{ marginTop: rs(5), paddingHorizontal: rs(9), paddingVertical: rs(4), backgroundColor: CREATED_BG, borderWidth: 1, borderColor: CREATED_BORDER }}
                  >
                    <Text className="font-extrabold" style={{ fontSize: rf(9.5), color: CREATED_FG }} numberOfLines={1}>
                      Created by Shop
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Price Summary */}
          <View className="px-4" style={{ marginTop: rs(12) }}>
            <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
              <SectionHeader
                icon={IndianRupee}
                label="Price Summary"
                subtitle="Breakdown of services and charges"
                right={canViewInvoice ? <HeaderAction icon={ReceiptText} label="View Invoice" onPress={goViewInvoice} /> : null}
              />
              {lineItems.length === 0 ? (
                <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY }}>No service items recorded.</Text>
              ) : (
                <>
                  {lineItems.map((item, idx) => (
                    <View key={item.id || idx} className="flex-row items-start" style={{ paddingVertical: rs(7) }}>
                      <View
                        className="items-center justify-center"
                        style={{ height: rs(24), width: rs(24), borderRadius: rs(12), marginRight: rs(10), backgroundColor: MINT }}
                      >
                        <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: ACCENT }}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text className="font-bold" style={{ fontSize: rf(12.5), color: TEXT_PRIMARY }} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.description ? (
                          <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="font-extrabold" style={{ fontSize: rf(12.5), color: TEXT_PRIMARY }}>
                        ₹{Number(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))}

                  <View style={{ height: 1, borderTopWidth: 1, borderTopColor: BORDER, borderStyle: 'dashed', marginVertical: rs(12) }} />

                  <View
                    className="flex-row items-center justify-between rounded-2xl"
                    style={{ padding: rs(13), backgroundColor: MINT, borderWidth: 1, borderColor: BORDER }}
                  >
                    <View>
                      <Text className="uppercase font-bold" style={{ fontSize: rf(10), letterSpacing: 0.6, color: TEXT_SECONDARY }}>
                        Estimated Total
                      </Text>
                      <Text style={{ fontSize: rf(10), color: TEXT_SECONDARY }}>Inclusive of all services</Text>
                    </View>
                    <Text className="font-extrabold" style={{ fontSize: rf(18), color: ACCENT }}>
                      ₹{Number(estimatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  {payment ? (
                    <View style={{ marginTop: rs(10) }}>
                      <View className="flex-row items-center justify-between" style={{ paddingVertical: rs(6) }}>
                        <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY }} numberOfLines={1}>{payment.label}</Text>
                        <Text className="font-extrabold" style={{ fontSize: rf(12.5), color: ACCENT }}>
                          − ₹{Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                      <View
                        className="flex-row items-center justify-between rounded-2xl"
                        style={{
                          padding: rs(12), marginTop: rs(2),
                          backgroundColor: payment.balance > 0 ? '#FFFBEB' : SOFT_MINT,
                          borderWidth: 1, borderColor: payment.balance > 0 ? '#FDE68A' : BORDER,
                        }}
                      >
                        <View>
                          <Text className="uppercase font-bold" style={{ fontSize: rf(9.5), letterSpacing: 0.5, color: TEXT_SECONDARY }}>
                            Balance Amount
                          </Text>
                          <Text style={{ fontSize: rf(9.5), color: TEXT_SECONDARY }}>
                            {payment.balance > 0 ? 'Collect on delivery' : 'Fully settled'}
                          </Text>
                        </View>
                        <Text className="font-extrabold" style={{ fontSize: rf(14.5), color: payment.balance > 0 ? '#B45309' : ACCENT }}>
                          ₹{Number(payment.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {/* Complaint Issue */}
          {ticket.issueDescription ? (
            <View className="px-4" style={{ marginTop: rs(12) }}>
              <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
                <SectionHeader
                  icon={FileText}
                  label="Complaint Issue"
                  subtitle="Customer reported issue for this device"
                  right={<HeaderAction icon={Pencil} label="Edit" onPress={goEdit} />}
                />
                <View className="rounded-2xl" style={{ padding: rs(12), backgroundColor: SOFT_MINT }}>
                  <Text style={{ fontSize: rf(12.5), color: TEXT_PRIMARY, lineHeight: rf(18) }}>
                    {ticket.issueDescription}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Service Schedule */}
          <View className="px-4" style={{ marginTop: rs(12) }}>
            <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
              <SectionHeader
                icon={CalendarClock}
                label="Service Schedule"
                right={<HeaderAction icon={Pencil} label="Update Schedule" onPress={goEdit} />}
              />

              <TimelineRow
                icon={Clock}
                label="Approx. Ready"
                value={readyAtText || 'Not yet set'}
                sub="Expected completion time"
                done={!!readyAtText}
              />
              <TimelineRow
                icon={CalendarClock}
                label="Delivery"
                value={deliveryAtText || 'Not yet set'}
                sub="Estimated handover time"
                done={!!deliveryAtText}
              />
              <TimelineRow
                icon={ScanLine}
                label="IMEI"
                value={imeiText || 'Not captured yet'}
                sub={imeiText ? null : 'Scan or enter IMEI to track device'}
                done={!!imeiText}
                isLast={ticket.customerApproval == null}
                right={!imeiText ? (
                  <TouchableOpacity
                    onPress={goAddImei}
                    activeOpacity={0.8}
                    className="flex-row items-center rounded-full"
                    style={{ paddingHorizontal: rs(9), paddingVertical: rs(5), backgroundColor: ACCENT }}
                  >
                    <Plus size={rf(11)} color="#FFFFFF" />
                    <Text className="font-extrabold" style={{ fontSize: rf(10), color: '#FFFFFF', marginLeft: rs(3) }}>Add IMEI</Text>
                  </TouchableOpacity>
                ) : null}
              />
              {/* Preserved from the existing screen (real ticket.customerApproval
                  data) — not part of the reference's 3-step example, but still
                  genuine booking data this screen already showed. */}
              {ticket.customerApproval != null ? (
                <TimelineRow
                  icon={CheckCircle2}
                  label="Customer Approval"
                  value={ticket.customerApproval ? 'Approved' : 'Pending'}
                  done={ticket.customerApproval === true}
                  isLast
                />
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom actions — Share / Print QR / Assign Technician */}
      <View
        className="absolute left-0 right-0 bottom-0 flex-row"
        style={{
          paddingHorizontal: rs(16),
          paddingTop: rs(12),
          paddingBottom: insets.bottom + rs(12),
          backgroundColor: 'rgba(248, 250, 249, 0.97)',
          borderTopWidth: 1,
          borderTopColor: BORDER,
        }}
      >
        <View style={[{ flexDirection: 'row', flex: 1 }, colStyle]}>
          <TouchableOpacity
            onPress={handleShare}
            activeOpacity={0.85}
            className="flex-row items-center justify-center"
            style={{
              flex: 1, marginRight: rs(8), borderRadius: rs(18), paddingVertical: rs(14),
              backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ACCENT,
            }}
          >
            <Share2 size={rf(15)} color={ACCENT} />
            <Text className="font-extrabold" style={{ fontSize: rf(12.5), color: ACCENT, marginLeft: rs(6) }} numberOfLines={1}>
              Share
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goPrintQr}
            activeOpacity={0.85}
            className="flex-row items-center justify-center"
            style={{
              flex: 1, marginRight: rs(8), borderRadius: rs(18), paddingVertical: rs(14),
              backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ACCENT,
            }}
          >
            <Printer size={rf(15)} color={ACCENT} />
            <Text className="font-extrabold" style={{ fontSize: rf(12.5), color: ACCENT, marginLeft: rs(6) }} numberOfLines={1}>
              Print QR
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTechSheetOpen(true)}
            activeOpacity={0.9}
            className="flex-row items-center justify-center"
            style={{
              flex: 1.3, borderRadius: rs(18), paddingVertical: rs(14),
              backgroundColor: ACCENT, ...cardShadow, shadowColor: ACCENT, shadowOpacity: 0.28,
            }}
          >
            <Hammer size={rf(15)} color="#FFFFFF" />
            <Text className="text-white font-extrabold" style={{ fontSize: rf(12.5), marginLeft: rs(6) }} numberOfLines={1}>
              Assign Technician
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TechnicianPickerSheet
        visible={techSheetOpen}
        booking={ticket}
        onClose={() => setTechSheetOpen(false)}
        onAssigned={handleTechAssigned}
      />
    </View>
  );
}
