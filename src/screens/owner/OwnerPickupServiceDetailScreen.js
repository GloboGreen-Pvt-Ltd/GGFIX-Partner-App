import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Calendar, Clock, MapPin, FileText, User, IndianRupee, Smartphone, Phone, UserCheck, CheckCircle2, Camera, Video, CalendarClock, History, ListChecks } from 'lucide-react-native';
import { PickupPersonPickerSheet } from './AllBooking/BookingActionSheets';
import ImageViewerModal from '../../components/ImageViewerModal';
import { labelFor } from './AllBooking/PickupHistoryScreen';

const PICKUP_STAGES = new Set([
  'ORDER_PLACED', 'BOOKING_CREATED_BY_SHOP', 'PENDING', 'PICKUP_REQUESTED', 'PICKUP_ACCEPTED',
  'ORDER_SERVICE_CONFIRMED', 'PICKUP_PERSON_ASSIGNED', 'PICKUP_ASSIGNED', 'PICKUP_REASSIGNED',
  'PICKUP_ON_THE_WAY', 'REACHED_CUSTOMER_LOCATION', 'REPAIR_ESTIMATE_PROCESSING', 'ESTIMATE_SENT_TO_CUSTOMER',
  'DEVICE_PICKED_UP', 'PICKED_UP', 'REACHED_SHOP', 'RECEIVED_AT_SHOP', 'CANCELLED',
]);

// Booking Details tile / icon colours.
const TONES = ['#035C6C', '#0788C9', '#609138', '#E08E00', '#1C3053', '#F32C26', '#357D89', '#0571A8'];
import { Badge, Button, Loader } from '../../components/rnr';
import { confirmShopRepairBooking, getShopRepairBooking, markPickupReceivedAtShop } from '../../api/orders';
import { useFocusPolling } from '../../lib/hooks/useFocusPolling';
import { getBrands, getModelsByBrand, getRamOptions, getStorageOptions } from '../../api/masterData';
import { cleanIssueSummary } from '../../utils/pickupEstimateMeta';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { notify } from '../../components/confirm';
import { useResponsive } from '../../theme/responsive';
import { rf, rs } from '../../utils/responsive';

const fmtInstantDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const STATUS_VARIANT = {
  ORDER_PLACED:            { variant: 'softWarning',  label: 'New Request' },
  PICKUP_REQUESTED:        { variant: 'softWarning',  label: 'Pickup Requested' },
  PICKUP_ACCEPTED:         { variant: 'softPrimary',  label: 'Pickup Accepted' },
  ORDER_SERVICE_CONFIRMED: { variant: 'softPrimary',  label: 'Confirmed' },
  PICKUP_PERSON_ASSIGNED:  { variant: 'softPrimary',  label: 'Pickup Assigned' },
  PICKUP_ASSIGNED:         { variant: 'softPrimary',  label: 'Pickup Assigned' },
  PICKUP_ON_THE_WAY:       { variant: 'softSecondary',label: 'On The Way' },
  REACHED_CUSTOMER_LOCATION: { variant: 'softSecondary', label: 'At Customer' },
  REPAIR_ESTIMATE_PROCESSING: { variant: 'softWarning', label: 'Estimate Submitted' },
  DEVICE_PICKED_UP:        { variant: 'softSecondary',label: 'Device Picked Up' },
  PICKED_UP:               { variant: 'softSecondary',label: 'Device Picked Up' },
  REACHED_SHOP:            { variant: 'softSuccess',  label: 'Reached Shop' },
  RECEIVED_AT_SHOP:        { variant: 'softSuccess',  label: 'Received at Shop' },
  ACCEPTED:                { variant: 'softPrimary',  label: 'Accepted' },
  IN_TRANSIT:              { variant: 'softSecondary',label: 'In Transit' },
  COMPLETED:               { variant: 'softSuccess',  label: 'Completed' },
  CANCELLED:               { variant: 'softDanger',   label: 'Cancelled' },
};

function fmtDate(d) {
  if (!d) return '—';
  try {
    const [y, m, day] = String(d).split('-');
    return `${day}/${m}/${y}`;
  } catch (_) { return String(d); }
}

function fmtTime(t) {
  if (!t) return '';
  const [hh, mm] = String(t).split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${ampm}`;
}

function fmtInstant(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch (_) { return String(iso); }
}

// Booking Details-style row: tinted icon · label · bold value.
function Row({ icon: Icon, label, value, color = '#035C6CCC', full = false }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: full ? 'flex-start' : 'center', paddingVertical: 6 }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: color }}>
        <Icon size={14} color="#FFFFFF" />
      </View>
      <Text style={{ width: 96, marginRight: 6, fontSize: rf(11.5), color: '#6B7280', marginTop: full ? 6 : 0 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: rf(11.5), fontWeight: '700', color: '#111111', marginTop: full ? 5 : 0, lineHeight: rf(16) }} numberOfLines={full ? undefined : 2} selectable>{value || '—'}</Text>
    </View>
  );
}

// Service History-style step (same look as Booking Details): green check disc
// on a rail, bold title, "Wed, 11 Nov · 11:40 am", then the note. The current
// (last) step is a teal ring instead of a check.
function HistoryStep({ event, last }) {
  const d = event?.createdAt ? new Date(event.createdAt) : null;
  const when = d && !Number.isNaN(d.getTime())
    ? `${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
    : '';
  const title = labelFor(event?.status);
  const note = event?.note && event.note !== title ? String(event.note).trim() : '';
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: 26, alignItems: 'center' }}>
        {last ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#035C6C', backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#035C6C' }} />
          </View>
        ) : (
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#609138', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
          </View>
        )}
        {last ? null : <View style={{ width: 2, flex: 1, backgroundColor: '#609138', marginVertical: 2 }} />}
      </View>
      <View style={{ flex: 1, marginLeft: 12, paddingBottom: last ? 0 : 16 }}>
        <Text style={{ fontSize: rf(13), fontWeight: '800', color: last ? '#035C6C' : '#111111' }}>{title}</Text>
        {when ? <Text style={{ fontSize: rf(11.5), color: '#6B7280', marginTop: 2 }}>{when}</Text> : null}
        {note ? <Text style={{ fontSize: rf(12), color: '#111111', marginTop: 4, lineHeight: rf(16) }}>{note}</Text> : null}
      </View>
    </View>
  );
}

// Booking Details-style section header: icon disc · LABEL · rule.
function Section({ icon: Icon, label, color }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
      <View style={{ height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
        <Icon size={12} color="#FFFFFF" />
      </View>
      <Text style={{ marginLeft: 6, fontSize: rf(11.5), fontWeight: '800', color: '#111111', letterSpacing: 1.5 }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB', marginLeft: 8 }} />
    </View>
  );
}

// Complaint text minus the schedule / approval / cost lines the booking appends.
const NOT_ISSUE = /(booking time|expected delivery|customer approved|estimated cost|expected completion)/i;
function issueOnly(text) {
  // Also drops bare times / dates left over from those lines ("12:38 pm").
  const TIME_ONLY = /^[\d\s:/.,-]*(am|pm)?[\d\s:/.,-]*$/i;
  return String(text || '').split(/\n|\s·\s/).map((l) => l.trim())
    .filter((l) => l && !NOT_ISSUE.test(l))
    .map((l) => l.split(',').map((x) => x.trim()).filter((x) => x && !TIME_ONLY.test(x)).join(', '))
    .filter(Boolean).join('\n');
}

function repairServiceText(item) {
  const services = Array.isArray(item?.services)
    ? item.services.map((s) => s?.serviceName).filter(Boolean)
    : [];
  // Fall back to the cleaned issue summary so the PICKUP_ESTIMATE_META JSON
  // appendix never leaks into the UI when the services list is empty.
  return services.length ? services.join(', ') : cleanIssueSummary(item?.issueSummary);
}

function MediaTile({ uri, label, video, onPress }) {
  const FallbackIcon = video ? Video : Camera;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="imagebutton" accessibilityLabel={label} className="flex-1 px-1">
      <View
        className="rounded-xl bg-background items-center justify-center overflow-hidden"
        style={{ height: 96, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7E6EA' }}
      >
        {uri && !video ? (
          <Image source={{ uri }} className="w-full h-full" resizeMode="cover" />
        ) : uri && video ? (
          <View className="absolute inset-0 bg-text/90 items-center justify-center">
            <Video size={22} color="#fff" />
            <Text className="text-white text-[9px] font-bold mt-0.5">VIDEO</Text>
          </View>
        ) : (
          <View className="items-center">
            <FallbackIcon size={22} color="#9CA3AF" />
            <Text className="text-[9px] text-text-muted mt-1">+ Add</Text>
          </View>
        )}
      </View>
      <Text className="text-[10px] text-text-muted text-center mt-1" numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function OwnerPickupServiceDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const preloaded = route?.params?.booking;
  const r = useResponsive();
  // Seed with whatever the list passed in. Avoids a flash of "Loading" and
  // sidesteps the shop-side single-booking endpoint when the list already has
  // all the fields the detail view needs.
  const [data, setData] = useState(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState(null);
  const [device, setDevice] = useState({});

  // Pull to refresh: re-runs the screen's load.

  const [pullRefreshing, setPullRefreshing] = useState(false);

  const onPullRefresh = async () => { setPullRefreshing(true); try { await load(); } catch {} finally { setPullRefreshing(false); } };

  const load = useCallback(async () => {
    if (!id) return;
    if (!preloaded) setLoading(true);
    setError(null);
    try {
      const res = await getShopRepairBooking(id);
      setData(res);
    } catch (e) {
      // If we already have the list-passed booking, treat fetch failures as
      // non-fatal so the user still sees customer/address info.
      if (!preloaded) setError(e?.body?.message || e?.message || 'Failed to load pickup');
    } finally {
      setLoading(false);
    }
  }, [id, preloaded]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Customer-side changes (cancel / reschedule / estimate approval) show live.
  // Silent: keeps the current data on a failed tick and never shows the loader.
  useFocusPolling(useCallback(async () => {
    if (!id) return;
    try {
      const next = await getShopRepairBooking(id);
      setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch (_) { /* keep the last snapshot */ }
  }, [id]));

  // Resolve device label + image from the booking's master-data IDs. The shop
  // endpoint returns IDs only; we want "Apple iPhone 14 Pro · 16 GB · 512 GB"
  // in the header card like the customer-facing screen.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const [brands, models, rams, storages] = await Promise.all([
        getBrands().catch(() => []),
        data.brandId ? getModelsByBrand(data.brandId).catch(() => []) : [],
        getRamOptions().catch(() => []),
        getStorageOptions().catch(() => []),
      ]);
      if (cancelled) return;
      const brand = (brands || []).find((x) => x.id === data.brandId);
      const model = (models || []).find((m) => m.id === data.modelId);
      const ramLabel = (rams || []).find((r) => r.id === data.ramOptionId)?.label;
      const storageLabel = (storages || []).find((s) => s.id === data.storageOptionId)?.label;
      const rawImage = model?.imageUrl
        || (model?.imageBase64 ? `data:image/png;base64,${model.imageBase64}` : null);
      setDevice({
        name: model?.name || (brand?.name ? `${brand.name} device` : 'Device'),
        image: normalizeDeviceImageUrl(rawImage),
        specs: [brand?.name, [ramLabel, storageLabel].filter(Boolean).join(' · ')]
          .filter(Boolean).join(' · '),
      });
    })();
    return () => { cancelled = true; };
  }, [data]);

  const status = data ? (STATUS_VARIANT[data.status] || { variant: 'muted', label: data.status || 'Unknown' }) : null;
  const slot = data && (data.pickupSlotStart || data.pickupSlotEnd)
    ? `${fmtTime(data.pickupSlotStart)} – ${fmtTime(data.pickupSlotEnd)}`
    : '—';
  const serviceText = repairServiceText(data);
  const cleanIssue = cleanIssueSummary(data?.issueSummary) || null;
  const lineItems = Array.isArray(data?.services) ? data.services : [];
  const lineItemsTotal = lineItems.reduce((sum, s) => sum + (Number(s?.estimatedPrice) || 0), 0);
  const priceTotal = data?.estimateAmount != null ? Number(data.estimateAmount) : lineItemsTotal;
  const readyAtText = fmtInstantDate(data?.estimatedReadyAt);
  const deliveryAtText = fmtInstantDate(data?.estimatedDeliveryAt);
  const estApproxTimeText = readyAtText
    ? `${readyAtText}${data?.estimatedDurationHours ? `, ${data.estimatedDurationHours}Hr` : ''}`
    : null;
  const approvalDone = String(data?.customerApproval || '').toUpperCase() === 'DONE';
  const approvalText = approvalDone ? 'Done' : (data?.customerApproval || 'Pending');
  const pickupAgent = data?.pickupPersonName || null;
  const isUnconfirmed = data?.status === 'ORDER_PLACED' || data?.status === 'PICKUP_REQUESTED';
  const [confirming, setConfirming] = useState(false);

  const handleConfirmOrder = async () => {
    if (!data?.id || confirming) return;
    setConfirming(true);
    try {
      const updated = await confirmShopRepairBooking(data.id);
      setData(updated);
    } catch (e) {
      notify('Could not confirm', e?.body?.message || e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  // Shop-staff "Received by Shop Staff" hand-off — only enabled when the
  // pickup person has already pinged Reached Shop (50m-validated server
  // side). Triggers the ticket mint so the booking shows up in the shop
  // owner's Bookings History list and unlocks technician assignment.
  const [receiving, setReceiving] = useState(false);
  const handleMarkReceived = async () => {
    if (!data?.id || receiving) return;
    setReceiving(true);
    try {
      const resp = await markPickupReceivedAtShop(data.id);
      await load();
      notify('Received', resp?.message || 'Device received at shop.', { preset: 'done' });
    } catch (e) {
      notify('Could not confirm', e?.body?.error || e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setReceiving(false);
    }
  };

  // Bottom actions (same as the Jobs pickup menu): Accept · Assign · Status ·
  // History · Call.
  const [assignOpen, setAssignOpen] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [photoAt, setPhotoAt] = useState(null); // index in `photos` for the viewer
  const photos = [
    data?.frontImageUrl ? { uri: data.frontImageUrl, label: 'Front Side' } : null,
    data?.backImageUrl ? { uri: data.backImageUrl, label: 'Back Side' } : null,
  ].filter(Boolean);
  // Pickup stages only — the repair/service steps (Service Accepted, Repair…,
  // Ready, Delivered…) belong to Booking Details, not this tracker.
  const pickupEvents = (Array.isArray(data?.events) ? data.events : [])
    .filter((e) => PICKUP_STAGES.has(String(e?.status || '').toUpperCase()));
  const tiles = data ? [
    isUnconfirmed ? { key: 'accept', label: 'Accept', icon: CheckCircle2, run: handleConfirmOrder, busy: confirming } : null,
    { key: 'assign', label: pickupAgent ? 'Reassign' : 'Assign', icon: UserCheck, run: () => setAssignOpen(true) },
    data.customerMobile ? { key: 'call', label: 'Call', icon: Phone, run: () => Linking.openURL(`tel:${String(data.customerMobile).replace(/[^\d+]/g, '')}`).catch(() => {}) } : null,
  ].filter(Boolean) : [];
  const actionCols = r.width < 380 ? 4 : 5;
  const tone = (i) => `${TONES[i % TONES.length]}CC`;

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6F8' }}>
      {/* Header — same as Booking Details: back · title · booking chip */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: r.insets.top + 2, paddingBottom: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EEF0F2', alignItems: 'center' }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back"
          style={{ position: 'absolute', left: 16, top: r.insets.top + 6, width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
          <ArrowLeft size={20} color="#111111" />
        </Pressable>
        <Text style={{ fontSize: rf(17), fontWeight: '800', color: '#111111' }}>Pickup Details</Text>
        {data?.bookingNumber ? (
          <View style={{ marginTop: 4, backgroundColor: '#E5F3F5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: '#035C6C' }} numberOfLines={1}>{data.bookingNumber}</Text>
          </View>
        ) : null}
      </View>
      {loading ? (
        <Loader />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-danger text-center">{error}</Text>
        </View>
      ) : !data ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text-muted">No pickup data.</Text>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} colors={['#035C6C']} tintColor="#035C6C" />} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24 + r.insets.bottom, width: '100%', maxWidth: r.maxWidth('list'), alignSelf: 'center' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, paddingBottom: 12 }}>
            {/* Device header — image · name · specs · colour, pickup date on the
                right (the booking number is already in the header chip). */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 14 }}>
              <View style={{ width: rs(60), height: rs(60), borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#F4F6F8' }}>
                {device.image || data.frontImageUrl ? (
                  <Image source={{ uri: device.image || data.frontImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                ) : <Smartphone size={rs(24)} color="#035C6C" />}
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: '#111111' }} numberOfLines={2}>{device.name || 'Device'}</Text>
                {device.specs ? <Text style={{ fontSize: rf(11.5), color: '#6B7280', marginTop: 2 }} numberOfLines={2}>{device.specs}</Text> : null}
                {data.color ? <Text style={{ fontSize: rf(11.5), color: '#6B7280', marginTop: 1 }} numberOfLines={1}>Color: {data.color}</Text> : null}
              </View>
              <View style={{ flexShrink: 0, alignItems: 'flex-end', marginLeft: 8 }}>
                <Text style={{ fontSize: rf(10.5), color: '#6B7280' }}>Pickup on</Text>
                <Text style={{ fontSize: rf(12), fontWeight: '700', color: '#111111', marginTop: 1 }}>{fmtDate(data.pickupDate)}</Text>
              </View>
            </View>
            {status ? <View style={{ paddingHorizontal: 14, alignItems: 'flex-start' }}><Badge variant={status.variant}>{status.label}</Badge></View> : null}

            {/* Pickup Status — first step → current step, then See All Updates
                (full timeline on the Pickup History screen). */}
            {pickupEvents.length ? (() => {
              const evs = pickupEvents;
              const steps = evs.length > 1 ? [evs[0], evs[evs.length - 1]] : [evs[0]];
              const when = (iso) => {
                const d = iso ? new Date(iso) : null;
                return d && !Number.isNaN(d.getTime())
                  ? `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
                  : '';
              };
              const done = ['COMPLETED', 'RECEIVED_AT_SHOP', 'REACHED_SHOP'].includes(String(data.status || '').toUpperCase());
              return (
                <View style={{ marginHorizontal: 12, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14 }}>
                    <Text style={{ flex: 1, fontSize: rf(15), fontWeight: '800', color: '#111111' }}>Pickup Status</Text>
                    <View style={{ backgroundColor: '#E5F3F5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: '#035C6C' }} numberOfLines={1}>{done ? 'Completed' : (status?.label || 'In Progress')}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: rf(11.5), color: '#6B7280', paddingHorizontal: 14, marginTop: 2 }} numberOfLines={1}>Pickup {data.bookingNumber || ''}</Text>
                  <View style={{ height: 1, backgroundColor: '#EEF0F2', marginHorizontal: 14, marginTop: 10 }} />
                  <View style={{ flexDirection: 'row', paddingVertical: 14 }}>
                    {steps.map((ev, i) => (
                      <View key={ev.id || `${ev.status}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
                        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ flex: 1, height: 3, backgroundColor: i === 0 ? 'transparent' : '#035C6C' }} />
                          <View style={{ width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={rs(14)} color="#FFFFFF" strokeWidth={3} />
                          </View>
                          <View style={{ flex: 1, height: 3, backgroundColor: i === steps.length - 1 ? 'transparent' : '#035C6C' }} />
                        </View>
                        <Text style={{ fontSize: rf(12), fontWeight: '800', color: '#111111', marginTop: 8, textAlign: 'center', paddingHorizontal: 4 }} numberOfLines={2}>{labelFor(ev.status)}</Text>
                        <Text style={{ fontSize: rf(10.5), color: '#6B7280', marginTop: 2 }}>{when(ev.createdAt)}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ height: 1, backgroundColor: '#EEF0F2', marginHorizontal: 14 }} />
                  {/* See All Updates expands the full timeline here; Show Less hides it. */}
                  {showAllSteps ? (
                    <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
                      {evs.map((ev, i) => (
                        <HistoryStep key={ev.id || `${ev.status}-${i}`} event={ev} last={i === evs.length - 1} />
                      ))}
                    </View>
                  ) : null}
                  <Pressable onPress={() => setShowAllSteps((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showAllSteps }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: rf(13), fontWeight: '800', color: '#111111' }}>{showAllSteps ? 'Show Less' : 'See All Updates'}</Text>
                      {showAllSteps ? null : <Text style={{ fontSize: rf(11), color: '#6B7280', marginTop: 1 }}>View full pickup tracking</Text>}
                    </View>
                    {showAllSteps ? <ChevronUp size={rs(18)} color="#111111" /> : <ChevronDown size={rs(18)} color="#111111" />}
                  </Pressable>
                </View>
              );
            })() : null}

            {/* Price Summary */}
            <Section icon={IndianRupee} label="PRICE SUMMARY" color={tone(3)} />
            <View style={{ paddingHorizontal: 16 }}>
              {lineItems.length === 0 ? (
                <Text style={{ fontSize: rf(11.5), color: '#6B7280' }}>No itemized services recorded.</Text>
              ) : lineItems.map((s, i) => (
                <View key={s.repairServiceId || i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#E5F3F5' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: '#035C6C' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: rf(11.5), fontWeight: '600', color: '#111111' }} numberOfLines={1}>{s.serviceName || s.serviceCode || 'Service'}</Text>
                  <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: '#111111' }}>₹{formatINR(s.estimatedPrice)}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                <Text style={{ flex: 1, fontSize: rf(11.5), fontWeight: '800', color: '#111111' }}>Estimated Total</Text>
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: '#609138' }}>₹{formatINR(priceTotal)}</Text>
              </View>
            </View>

            {/* Complaint Issue */}
            <Section icon={FileText} label="COMPLAINT ISSUE" color={tone(1)} />
            <View style={{ paddingHorizontal: 16 }}>
              {/* Issue details only — booking time, expected delivery, approval,
                  estimated cost and completion time are shown elsewhere. */}
              <Row icon={FileText} label="Issue" value={issueOnly(cleanIssue) || serviceText || '—'} color={tone(1)} full />
              <Row icon={Clock} label="Booking Date & Time" value={fmtInstantDate(data.createdAt) || '—'} color={tone(3)} />
            </View>

            {/* Device Photos */}
            {data.frontImageUrl || data.backImageUrl || data.videoUrl ? (
              <>
                <Section icon={Camera} label="DEVICE PHOTOS" color={tone(2)} />
                <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
                  {/* Tap a photo → full-screen popup viewer; the video opens in the player. */}
                  {data.frontImageUrl ? <MediaTile uri={data.frontImageUrl} label="Front Side" onPress={() => setPhotoAt(photos.findIndex((x) => x.uri === data.frontImageUrl))} /> : null}
                  {data.backImageUrl ? <MediaTile uri={data.backImageUrl} label="Back Side" onPress={() => setPhotoAt(photos.findIndex((x) => x.uri === data.backImageUrl))} /> : null}
                  {data.videoUrl ? <MediaTile uri={data.videoUrl} label="Full Coverage Video" video onPress={() => Linking.openURL(data.videoUrl).catch(() => {})} /> : null}
                </View>
              </>
            ) : null}


            {/* Customer & Pickup */}
            <Section icon={User} label="CUSTOMER & PICKUP" color={tone(0)} />
            <View style={{ paddingHorizontal: 16 }}>
              <Row icon={User} label="Name" value={data.customerName || data.customerUserId} color={tone(0)} />
              {data.customerMobile ? <Row icon={Phone} label="Mobile" value={data.customerMobile} color={tone(1)} /> : null}
              <Row icon={Calendar} label="Pickup Date" value={fmtDate(data.pickupDate)} color={tone(2)} />
              <Row icon={Clock} label="Pickup Slot" value={slot} color={tone(3)} />
              <Row icon={MapPin} label={data.pickupAddressLabel ? `Address (${data.pickupAddressLabel})` : 'Address'} value={data.pickupAddressText || data.pickupAddressId} color={tone(4)} full />
            </View>

            {/* Pickup Person (+ the shop hand-off once it reached the shop) */}
            {/* Shop & pickup person schedule: who collects it, then the shop's
                estimated time / delivery / approval once they are set. */}
            <Section icon={UserCheck} label="SHOP & PICKUP SCHEDULE" color={tone(4)} />
            <View style={{ paddingHorizontal: 16 }}>
              <Row icon={UserCheck} label="Pickup Person" value={pickupAgent || 'Not assigned'} color={tone(4)} />
              {estApproxTimeText ? <Row icon={Clock} label={'Est. Ready\nDate & Time'} value={estApproxTimeText} color={tone(1)} /> : null}
              {deliveryAtText ? <Row icon={CalendarClock} label={'Est. Delivery\nDate & Time'} value={deliveryAtText} color={tone(2)} /> : null}
              {estApproxTimeText || deliveryAtText ? <Row icon={CheckCircle2} label="Approval" value={approvalText} color={tone(0)} /> : null}
              {data.pickupPersonPhone ? <Row icon={Phone} label="Mobile" value={data.pickupPersonPhone} color={tone(1)} /> : null}
              {data.status === 'REACHED_SHOP' || data.status === 'RECEIVED_AT_SHOP' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '700', color: '#111111' }} numberOfLines={2}>
                    {data.status === 'RECEIVED_AT_SHOP'
                      ? `Received${data.receivedByUserName ? ' by ' + data.receivedByUserName : ''}${data.receivedAtShopAt ? ' · ' + fmtInstant(data.receivedAtShopAt) : ''}`
                      : 'Confirm device received by shop staff'}
                  </Text>
                  {data.status === 'REACHED_SHOP' ? (
                    <Button size="sm" variant="primary" elevated={false} loading={receiving} onPress={handleMarkReceived}>Mark Received</Button>
                  ) : null}
                </View>
              ) : null}
            </View>


            {/* Actions — Booking Details-style tile grid */}
            <Section icon={ListChecks} label="ACTIONS" color={tone(1)} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 }}>
              {tiles.map((a, i) => {
                const Icon = a.icon;
                return (
                  <View key={a.key} style={{ width: actionCols === 4 ? '25%' : '20%', alignItems: 'center', marginBottom: 4 }}>
                    <Pressable onPress={a.run} disabled={!!a.busy} hitSlop={4} accessibilityRole="button" accessibilityLabel={a.label}
                      style={{ width: '100%', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2 }}>
                      <View style={{ height: 42, width: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: TONES[i % TONES.length] }}>
                        {a.busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon size={18} color="#FFFFFF" />}
                      </View>
                      <Text style={{ width: '100%', marginTop: 5, fontSize: rf(10), lineHeight: rf(12), fontWeight: '800', color: '#111111', textAlign: 'center' }} numberOfLines={2}>{a.label}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}
      <ImageViewerModal visible={photoAt != null} images={photos} index={photoAt || 0} onClose={() => setPhotoAt(null)} />
      <PickupPersonPickerSheet visible={assignOpen} booking={data} onClose={() => setAssignOpen(false)} onAssigned={load} />
    </View>
  );
}
