import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar, Clock, MapPin, FileText, User, IndianRupee, Smartphone, Truck, Phone, UserCheck, CheckCircle2, Camera, Video, CalendarClock } from 'lucide-react-native';
import { Badge, Button, Loader, ScreenHeader } from '../../components/rnr';
import { confirmShopRepairBooking, getShopRepairBooking, markPickupReceivedAtShop } from '../../api/orders';
import { getBrands, getModelsByBrand, getRamOptions, getStorageOptions } from '../../api/masterData';
import { cleanIssueSummary } from '../../utils/pickupEstimateMeta';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { notify } from '../../components/confirm';

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

function Row({ icon: Icon, label, value }) {
  return (
    <View className="flex-row items-start py-1">
      <View className="h-7 w-7 rounded-lg bg-primary/10 items-center justify-center mr-2.5">
        <Icon size={13} color="#087A0A" />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] text-text-muted">{label}</Text>
        <Text className="text-[13px] font-bold text-text" selectable>{value || '—'}</Text>
      </View>
    </View>
  );
}

function repairServiceText(item) {
  const services = Array.isArray(item?.services)
    ? item.services.map((s) => s?.serviceName).filter(Boolean)
    : [];
  // Fall back to the cleaned issue summary so the PICKUP_ESTIMATE_META JSON
  // appendix never leaks into the UI when the services list is empty.
  return services.length ? services.join(', ') : cleanIssueSummary(item?.issueSummary);
}

function MediaTile({ uri, label, video }) {
  const FallbackIcon = video ? Video : Camera;
  return (
    <View className="flex-1 px-1">
      <View
        className="rounded-xl bg-background items-center justify-center overflow-hidden"
        style={{ height: 96, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C8EEBF' }}
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
            <FallbackIcon size={22} color="#8FA08F" />
            <Text className="text-[9px] text-text-muted mt-1">+ Add</Text>
          </View>
        )}
      </View>
      <Text className="text-[10px] text-text-muted text-center mt-1" numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function OwnerPickupServiceDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const preloaded = route?.params?.booking;
  // Seed with whatever the list passed in. Avoids a flash of "Loading" and
  // sidesteps the shop-side single-booking endpoint when the list already has
  // all the fields the detail view needs.
  const [data, setData] = useState(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState(null);
  const [device, setDevice] = useState({});

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

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Pickup Details" onBack={() => navigation.goBack()} />
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
        <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
          {/* Booking header */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <View className="flex-row items-center">
              <View className="h-10 w-10 rounded-xl bg-success/10 items-center justify-center mr-2.5">
                <Truck size={18} color="#087A0A" />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-extrabold text-text" numberOfLines={1}>
                  {data.bookingNumber || '—'}
                </Text>
                <Text className="text-[11px] text-text-muted">Repair Pickup</Text>
              </View>
              {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
            </View>
          </View>

          {/* Device card — Tracking ID + resolved model label + Color */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <View className="flex-row items-start">
              <View className="w-14 h-14 rounded-xl bg-primary/10 items-center justify-center mr-3 overflow-hidden">
                {device.image ? (
                  <Image source={{ uri: device.image }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <Smartphone size={24} color="#087A0A" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[10px] text-text-muted">Tracking ID</Text>
                <Text className="text-[13px] font-extrabold text-text" numberOfLines={1} selectable>
                  {data.bookingNumber || data.id}
                </Text>
                <Text className="text-[11px] text-text mt-1" numberOfLines={2}>
                  <Text className="text-text-muted">Device : </Text>
                  <Text className="font-bold">{device.name || 'Device'}</Text>
                  {device.specs ? <Text className="text-text-muted"> · {device.specs}</Text> : null}
                </Text>
                {data.color ? (
                  <Text className="text-[11px] text-text mt-0.5">
                    <Text className="text-text-muted">Color : </Text>
                    <Text className="font-bold">{data.color}</Text>
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Price Summary */}
          {(lineItems.length > 0 || data.estimateAmount != null) ? (
            <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
              <View className="flex-row items-center mb-2">
                <IndianRupee size={14} color="#16BB05" />
                <Text className="text-[12px] font-extrabold text-text ml-1.5">Price Summary</Text>
              </View>
              {lineItems.length === 0 ? (
                <Text className="text-[11px] text-text-muted">No itemized services recorded.</Text>
              ) : (
                lineItems.map((s, i) => (
                  <View key={s.repairServiceId || i} className="flex-row items-center py-1">
                    <View className="h-5 w-5 rounded-full border border-border items-center justify-center mr-2">
                      <Text className="text-[10px] font-bold text-text">{i + 1}</Text>
                    </View>
                    <Text className="text-[12px] text-text flex-1" numberOfLines={1}>{s.serviceName || s.serviceCode || 'Service'}</Text>
                    <Text className="text-[12px] font-bold text-text">₹{formatINR(s.estimatedPrice)}</Text>
                  </View>
                ))
              )}
              <View className="border-t border-border mt-2 pt-2 flex-row items-center">
                <Text className="flex-1 text-[12px] font-extrabold text-text">Estimated Repair Amount</Text>
                <Text className="text-[13px] font-extrabold text-primary">₹{formatINR(priceTotal)}</Text>
              </View>
            </View>
          ) : null}

          {/* Complaint Issue */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <View className="flex-row items-center mb-1.5">
              <FileText size={14} color="#16BB05" />
              <Text className="text-[12px] font-extrabold text-text ml-1.5">Complaint Issue</Text>
            </View>
            <Text className="text-[12px] text-text" selectable>
              {cleanIssue || serviceText || '—'}
            </Text>
          </View>

          {/* Service Schedule — estimated_ready_at / estimated_duration_hours /
              estimated_delivery_at / customer_approval. Always visible so the
              shop sees the schedule placeholders before the estimate is
              submitted. */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <View className="flex-row items-center mb-1.5">
              <CalendarClock size={14} color="#F59E0B" />
              <Text className="text-[12px] font-extrabold text-text ml-1.5">Service Schedule</Text>
            </View>
            <Row icon={Clock}         label="Estimated Approximate Time" value={estApproxTimeText || 'Not yet set'} />
            <Row icon={CalendarClock} label="Estimated Delivery Date"    value={deliveryAtText || 'Not yet set'} />
            <View className="flex-row items-start py-1">
              <View className="h-7 w-7 rounded-lg bg-primary/10 items-center justify-center mr-2.5">
                <CheckCircle2 size={13} color={approvalDone ? '#16BB05' : '#8FA08F'} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] text-text-muted">Customer Repair Approval</Text>
                <Text className={`text-[13px] font-bold ${approvalDone ? 'text-success' : 'text-text-muted'}`}>
                  {approvalText}
                </Text>
              </View>
            </View>
          </View>

          {/* Device Photos — always shown so the slot layout matches the
              estimate wizard even before the pickup person uploads anything. */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <View className="flex-row items-center mb-2">
              <Camera size={14} color="#16BB05" />
              <Text className="text-[12px] font-extrabold text-text ml-1.5">Device Photo's</Text>
            </View>
            <View className="flex-row -mx-1">
              <MediaTile uri={data.frontImageUrl} label="Front Side" />
              <MediaTile uri={data.backImageUrl} label="Back Side" />
              <MediaTile uri={data.videoUrl} label="Full Coverage Video" video />
            </View>
          </View>

          {/* Pickup customer + address */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <Text className="text-[12px] font-extrabold text-text mb-1">Customer & Pickup</Text>
            <Row icon={User}     label="Customer"     value={data.customerName || data.customerUserId} />
            {data.customerMobile ? (
              <Row icon={Phone}  label="Mobile"       value={data.customerMobile} />
            ) : null}
            <Row icon={Calendar} label="Pickup Date"  value={fmtDate(data.pickupDate)} />
            <Row icon={Clock}    label="Pickup Slot"  value={slot} />
            <Row icon={MapPin}
                 label={data.pickupAddressLabel ? `Address (${data.pickupAddressLabel})` : 'Pickup Address'}
                 value={data.pickupAddressText || data.pickupAddressId} />
          </View>

          {/* Owner actions — confirm order, assign pickup, mark received */}
          {isUnconfirmed ? (
            <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
              <View className="flex-row items-center">
                <View className="h-9 w-9 rounded-lg bg-warning/10 items-center justify-center mr-2.5">
                  <CheckCircle2 size={16} color="#D97706" />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-[10px] text-text-muted">Service status</Text>
                  <Text className="text-[13px] font-bold text-text" numberOfLines={1}>
                    Confirm pickup request
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant="primary"
                  elevated={false}
                  loading={confirming}
                  onPress={handleConfirmOrder}
                >
                  Confirm
                </Button>
              </View>
            </View>
          ) : null}

          {/* Read-only. Both assigning and reassigning live on the Bookings
              list → Pickup Assign sheet, which lists the pickup staff with the
              current agent marked in red; this card just reports the outcome. */}
          <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
            <View className="flex-row items-center">
              <View className="h-9 w-9 rounded-lg bg-primary/10 items-center justify-center mr-2.5">
                <UserCheck size={16} color="#087A0A" />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] text-text-muted">Pickup Person</Text>
                <Text
                  className="text-[13px] font-bold"
                  style={{ color: pickupAgent ? '#172117' : '#8FA08F' }}
                  numberOfLines={1}
                >
                  {pickupAgent || 'Not assigned'}
                </Text>
                {data.pickupPersonPhone ? (
                  <Text className="text-[10px] text-text-muted mt-0.5">{data.pickupPersonPhone}</Text>
                ) : null}
              </View>
            </View>
          </View>

          {data.status === 'REACHED_SHOP' || data.status === 'RECEIVED_AT_SHOP' ? (
            <View className="bg-card border border-border rounded-2xl px-3 py-2.5 mb-2">
              <View className="flex-row items-center">
                <View className={`h-9 w-9 rounded-lg ${data.status === 'RECEIVED_AT_SHOP' ? 'bg-success/10' : 'bg-warning/10'} items-center justify-center mr-2.5`}>
                  <CheckCircle2 size={16} color={data.status === 'RECEIVED_AT_SHOP' ? '#087A0A' : '#D97706'} />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-[10px] text-text-muted">Shop hand-off</Text>
                  <Text className="text-[13px] font-bold text-text" numberOfLines={1}>
                    {data.status === 'RECEIVED_AT_SHOP'
                      ? `Received${data.receivedByUserName ? ' by ' + data.receivedByUserName : ''}`
                      : 'Confirm device received by shop staff'}
                  </Text>
                  {data.status === 'RECEIVED_AT_SHOP' && data.receivedAtShopAt ? (
                    <Text className="text-[10px] text-text-muted mt-0.5">{fmtInstant(data.receivedAtShopAt)}</Text>
                  ) : null}
                </View>
                {data.status === 'REACHED_SHOP' ? (
                  <Button size="sm" variant="primary" elevated={false}
                    loading={receiving} onPress={handleMarkReceived}>
                    Mark Received
                  </Button>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* The event timeline that used to close this screen now has its own
              screen — Bookings list → pickup card → Pickup History — where it
              polls for live stage changes instead of only refreshing on
              focus. */}
        </ScrollView>
      )}
    </View>
  );
}
