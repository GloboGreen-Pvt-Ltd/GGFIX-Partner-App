import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  ChevronLeft,
  Copy,
  Smartphone,
  Calendar,
  CalendarClock,
  CheckCircle2,
  IndianRupee,
  ReceiptText,
  FileText,
  Clock,
  ScanLine,
  Store,
  User,
  Wrench,
} from 'lucide-react-native';
import { Loader, EmptyState } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';
import { getModelsByBrand } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';
import { getCurrentPhaseLabel } from '../../common/serviceHistoryPhases';
import { paymentFromTicket, priceItemsFromTicket } from './ReceiptCard';
import { hasInvoice } from './bookingScopes';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import { hasCategorySpecs, specDisplayParts } from '../../../utils/deviceSpecs';

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
const CREATED_BG = '#FFF3E8';
const CREATED_FG = '#B45309';
const CREATED_BORDER = '#F3D9BC';

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
  blue:   { bg: 'rgba(9, 173, 42, 0.10)',    fg: ACCENT,    border: 'rgba(9, 173, 42, 0.28)' },
  purple: { bg: 'rgba(7, 143, 35, 0.12)',   fg: PRIMARY,   border: 'rgba(7, 143, 35, 0.30)' },
  green:  { bg: 'rgba(9, 173, 42, 0.12)',  fg: SUCCESS,   border: 'rgba(9, 173, 42, 0.32)' },
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
  if (!name) return '#D6D6D6';
  const k = String(name).trim().toLowerCase().replace(/\s+/g, '');
  if (COLOR_HEX[k]) return COLOR_HEX[k];
  // Marketing names ("Amazonian Red", "Deep Sea Blue") — match the longest
  // known colour word they contain.
  const hit = Object.keys(COLOR_HEX).sort((a, b) => b.length - a.length).find((c) => k.includes(c));
  return hit ? COLOR_HEX[hit] : '#D6D6D6';
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7517869).
function splitTrackingId(id) {
  const s = String(id ?? '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// "Thu, Oct 1, 2026 · 11:22 AM" — booked date and time on one line.
function fmtBookedLine(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${wd}, ${mo} ${d.getDate()}, ${d.getFullYear()} · ${time}`;
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
    <View className="flex-row items-center" style={{ marginBottom: 10 }}>
      <View className="items-center justify-center" style={{ height: 28, width: 28, borderRadius: 9, backgroundColor: MINT, marginRight: 9 }}>
        <Icon size={14} color={ACCENT} />
      </View>
      <View className="flex-1">
        <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text> : null}
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
      style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: MINT }}
    >
      <Icon size={12} color={PRIMARY} />
      <Text className="font-extrabold" style={{ fontSize: 11, color: PRIMARY, marginLeft: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Device-card detail line: icon + label on the left, the full value on the
// right. The value wraps instead of truncating, so nothing is ever cut off.
function DetailRow({ icon: Icon, label, children, isLast }) {
  return (
    <View
      className="flex-row items-center"
      style={{ paddingVertical: 6, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#F3F3F3' }}
    >
      <View className="items-center justify-center" style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: MINT, marginRight: 7 }}>
        <Icon size={11} color={ACCENT} />
      </View>
      <Text style={{ width: 72, fontSize: 11, color: TEXT_SECONDARY, fontWeight: '600' }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

// One compact vertical-timeline row — icon column + connector on the left,
// label / value / hint on the right. `isLast` drops the connector.
function TimelineRow({ icon: Icon, label, value, sub, done, isLast }) {
  return (
    <View className="flex-row" style={{ alignItems: 'stretch' }}>
      <View style={{ width: 28, alignItems: 'center' }}>
        <View
          className="items-center justify-center"
          style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: done ? ACCENT : SOFT_MINT, borderWidth: done ? 0 : 1, borderColor: BORDER }}
        >
          <Icon size={13} color={done ? '#FFFFFF' : TEXT_SECONDARY} />
        </View>
        {!isLast ? <View style={{ flex: 1, width: 1.5, marginVertical: 3, backgroundColor: BORDER }} /> : null}
      </View>
      <View className="flex-1" style={{ paddingBottom: isLast ? 0 : 12, marginLeft: 10 }}>
        <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.6, color: TEXT_SECONDARY }}>{label}</Text>
        <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY, marginTop: 1 }}>{value}</Text>
        {sub ? <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DeviceDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null;
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The model's catalogue photo, for bookings that carry no deviceImageUrl —
  // the same fallback the Home "Recent Bookings" cards use.
  const [modelImage, setModelImage] = useState(null);

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
      if (!data?.deviceImageUrl && data?.brandId && data?.modelId) {
        getModelsByBrand(data.brandId)
          .then((models) => {
            const m = (models || []).find((x) => x.id === data.modelId);
            const url = resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
            if (url) setModelImage(url);
          })
          .catch(() => {});
      }
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
  const storageLabel = hasCategorySpecs(ticket)
    ? specDisplayParts(ticket).join(' · ')
    : (ticket.storageLabel || ticket.ramLabel || null);
  const colorName = ticket.color || null;
  const lineItems = priceItemsFromTicket(ticket);
  const estimatedTotal = ticket.estimatedPrice != null
    ? ticket.estimatedPrice
    : lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const payment = paymentFromTicket(ticket, estimatedTotal);
  const readyAtText = formatDateTime(ticket.estimatedReadyAt);
  const deliveryAtText = formatDateTime(ticket.estimatedDeliveryAt);
  const imeiText = String(ticket.imei || '').trim() || null;
  const bookedLine = fmtBookedLine(ticket.createdAt);
  const deviceImage = ticket.deviceImageUrl || modelImage || null;
  const customerText = [ticket.customerName, ticket.customerPhone].filter(Boolean).join(' · ') || null;
  const technicianName = ticket.assignedTechnicianName || ticket.technicianName || null;
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

  const goViewInvoice = () => navigation.navigate('DeliveryInvoiceReport', { ticketId });

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
                Device Details
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                View complete information about this device
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 20 }}
      >
        <View style={colStyle}>
          {/* ── Device card: photo, full name, variant, colour, status, and the
              booked date · time + who created the booking on one line. ── */}
          <View style={[card, { padding: 11 }]}>
            <View className="flex-row items-center">
              <View style={{ width: 58, height: 62, borderRadius: 12, backgroundColor: CARD_BG, borderWidth: 1, borderColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 10 }}>
                {deviceImage ? (
                  <Image source={{ uri: deviceImage }} style={{ width: 50, height: 56 }} resizeMode="contain" />
                ) : (
                  <Smartphone size={24} color={ACCENT} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* "DEVICE" + the tracking ID (tap to copy) share the top line. */}
                <View className="flex-row items-center">
                  <Text className="uppercase font-bold" style={{ flex: 1, fontSize: 10, letterSpacing: 0.7, color: TEXT_SECONDARY }}>Device</Text>
                  <TouchableOpacity
                    onPress={copyTrackingId}
                    activeOpacity={0.75}
                    hitSlop={6}
                    className="flex-row items-center"
                    style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: MINT }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800' }}>
                      <Text style={{ color: TEXT_PRIMARY }}>#{tid.prefix}</Text>
                      <Text style={{ color: ACCENT }}>{tid.digits}</Text>
                    </Text>
                    <Copy size={10} color={ACCENT} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
                <Text className="font-extrabold" style={{ fontSize: 15, lineHeight: 19, marginTop: 1, color: TEXT_PRIMARY }} numberOfLines={2}>
                  {deviceName}
                </Text>
                <View className="flex-row items-center flex-wrap" style={{ marginTop: 3, rowGap: 4 }}>
                  {storageLabel ? <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginRight: 8 }} numberOfLines={1}>{storageLabel}</Text> : null}
                  {colorName ? (
                    <View className="flex-row items-center" style={{ marginRight: 8 }}>
                      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colorToHex(colorName), borderWidth: 1, borderColor: BORDER }} />
                      <Text style={{ fontSize: 11, color: TEXT_PRIMARY, marginLeft: 4, fontWeight: '600' }} numberOfLines={1}>{colorName}</Text>
                    </View>
                  ) : null}
                  <View
                    className="flex-row items-center rounded-full"
                    style={{ paddingHorizontal: 7, paddingVertical: 2, backgroundColor: statusTone.bg, borderWidth: 1, borderColor: statusTone.border, maxWidth: '100%' }}
                  >
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusTone.fg, marginRight: 4 }} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: statusTone.fg, flexShrink: 1 }} numberOfLines={1}>{currentStatusLabel}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#F3F3F3' }}>
              <DetailRow icon={Calendar} label="Booked on">
                <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' }}>{bookedLine || '—'}</Text>
              </DetailRow>
              {customerText ? (
                <DetailRow icon={User} label="Customer">
                  <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' }}>{customerText}</Text>
                </DetailRow>
              ) : null}
              {technicianName ? (
                <DetailRow icon={Wrench} label="Technician">
                  <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' }}>{technicianName}</Text>
                </DetailRow>
              ) : null}
              {/* Every booking in this app is created from the shop side —
                  there is no customer self-booking flow — so this is a true
                  statement, not a fabricated value. */}
              <DetailRow icon={Store} label="Booking" isLast>
                <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: 7, paddingVertical: 2, backgroundColor: CREATED_BG, borderWidth: 1, borderColor: CREATED_BORDER }}>
                  <Text className="font-extrabold" style={{ fontSize: 10, color: CREATED_FG }}>Created by Shop</Text>
                </View>
              </DetailRow>
            </View>
          </View>

          {/* ── Price Summary ── */}
          <View style={[card, { marginTop: 10 }]}>
            <SectionHeader
              icon={IndianRupee}
              label="Price Summary"
              subtitle="Breakdown of services and charges"
              right={canViewInvoice ? <HeaderAction icon={ReceiptText} label="View Invoice" onPress={goViewInvoice} /> : null}
            />
            {lineItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>No service items recorded.</Text>
            ) : (
              <>
                {lineItems.map((item, idx) => (
                  <View key={item.id || idx} className="flex-row items-center" style={{ paddingVertical: 5 }}>
                    <View className="items-center justify-center" style={{ height: 20, width: 20, borderRadius: 10, marginRight: 9, backgroundColor: MINT }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text className="font-bold" style={{ fontSize: 12, color: TEXT_PRIMARY }} numberOfLines={1}>{item.label}</Text>
                      {item.description ? <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>{item.description}</Text> : null}
                    </View>
                    <Text className="font-extrabold" style={{ fontSize: 12, color: TEXT_PRIMARY, marginLeft: 8 }}>{money(item.amount)}</Text>
                  </View>
                ))}

                <View className="flex-row items-center justify-between" style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: MINT }}>
                  <View>
                    <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.6, color: TEXT_SECONDARY }}>Estimated Total</Text>
                    <Text style={{ fontSize: 10, color: TEXT_SECONDARY }}>Inclusive of all services</Text>
                  </View>
                  <Text className="font-extrabold" style={{ fontSize: 17, color: PRIMARY }}>{money(estimatedTotal)}</Text>
                </View>

                {payment ? (
                  <View style={{ marginTop: 8 }}>
                    <View className="flex-row items-center justify-between" style={{ paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: TEXT_SECONDARY }} numberOfLines={1}>{payment.label}</Text>
                      <Text className="font-extrabold" style={{ fontSize: 12, color: PRIMARY }}>− {money(payment.amount)}</Text>
                    </View>
                    <View
                      className="flex-row items-center justify-between"
                      style={{
                        marginTop: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
                        backgroundColor: payment.balance > 0 ? '#FFF8E1' : SOFT_MINT,
                      }}
                    >
                      <View>
                        <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.5, color: TEXT_SECONDARY }}>Balance Amount</Text>
                        <Text style={{ fontSize: 10, color: TEXT_SECONDARY }}>{payment.balance > 0 ? 'Collect on delivery' : 'Fully settled'}</Text>
                      </View>
                      <Text className="font-extrabold" style={{ fontSize: 13, color: payment.balance > 0 ? '#8A6A00' : PRIMARY }}>{money(payment.balance)}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* ── Complaint Issue ── */}
          {ticket.issueDescription ? (
            <View style={[card, { marginTop: 10 }]}>
              <SectionHeader icon={FileText} label="Complaint Issue" subtitle="Customer reported issue for this device" />
              <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: SOFT_MINT }}>
                <Text style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 17 }}>{ticket.issueDescription}</Text>
              </View>
            </View>
          ) : null}

          {/* ── Service Schedule (read-only) ── */}
          <View style={[card, { marginTop: 10 }]}>
            <SectionHeader icon={CalendarClock} label="Service Schedule" />
            <TimelineRow icon={Clock} label="Approx. Ready" value={readyAtText || 'Not yet set'} sub="Expected completion time" done={!!readyAtText} />
            <TimelineRow icon={CalendarClock} label="Delivery" value={deliveryAtText || 'Not yet set'} sub="Estimated handover time" done={!!deliveryAtText} />
            <TimelineRow
              icon={ScanLine}
              label="IMEI"
              value={imeiText || 'Not captured yet'}
              done={!!imeiText}
              isLast={ticket.customerApproval == null}
            />
            {/* Real ticket.customerApproval data, as before. */}
            {ticket.customerApproval != null ? (
              <TimelineRow
                icon={CheckCircle2}
                label="Customer Booking Approval"
                value={ticket.customerApproval ? 'Approved' : 'Pending'}
                done={ticket.customerApproval === true}
                isLast
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
