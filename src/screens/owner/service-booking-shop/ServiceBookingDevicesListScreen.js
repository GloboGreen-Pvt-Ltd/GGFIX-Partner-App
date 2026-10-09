import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable, Image, Alert, Modal, TextInput } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronDown,
  Smartphone,
  Hash,
  Plus,
  Check,
  CircleCheck,
  ReceiptText,
  Tag,
  User,
  Phone,
  Send,
  Wallet,
  Star,
  Wrench,
} from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import { specDisplayParts, specRequestFields } from '../../../utils/deviceSpecs';

// One deep green for the whole screen, matching the rest of the booking flow.
// Explicit values rather than `text-primary`/`bg-success` classes: NativeWind
// compiles its stylesheet at build time and this project's cached copy still
// holds the old #087A0A, so the token classes keep painting green.
const ACCENT = '#09AD2A';       // GGFIX green — fills, icons
const PRIMARY = '#078F23';      // green TEXT on white / mint
const INK = '#1E1E1E';
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const SOFT_MINT = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E6E6E6';
const HAIR = '#F3F3F3';         // card hairline on the grey page
const TEXT_SECONDARY = '#6B6B6B';
const ACCENT_10 = '#EAF8EC';

// The two modes the counter actually deals in. Values match the ADVANCE|FULL
// CHECK constraint on tickets.payment_type (migration 85) — the API stores the
// value verbatim, so these strings are not free text.
const PAYMENT_MODES = [
  { value: 'ADVANCE', label: 'Advance Payment', hint: 'Deposit now, balance on delivery' },
  { value: 'FULL', label: 'Full Payment', hint: 'Whole bill settled up front' },
];

const labelForMode = (value) => PAYMENT_MODES.find((m) => m.value === value)?.label || null;

/** Digits only. Rupees, not paise — the rest of this flow prices in whole rupees. */
const sanitizeAmount = (text) => String(text || '').replace(/[^0-9]/g, '');

const formatINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function serviceSummaryFor(device) {
  return (device.services || [])
    .map((service) => service.serviceName)
    .filter(Boolean)
    .join(', ');
}

function priceItemsJsonFor(device) {
  const items = (device.services || []).map((service) => ({
    id: service.serviceId || null,
    code: service.serviceCode || null,
    label: service.serviceName || 'Service',
    amount: Number(service.price) || 0,
    warranty: service.warranty || null,
  }));
  return items.length ? JSON.stringify(items) : null;
}

export default function ServiceBookingDevicesListScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();

  // Build a device record from the just-finished flow (if any modelId came through).
  const newDevice = params.modelId ? {
    modelName: params.modelName,
    modelNumber: params.modelNumber,
    modelId: params.modelId,
    imageUrl: params.imageUrl,
    brandId: params.brandId,
    brandName: params.brandName,
    color: params.color,
    ramLabel: params.ramLabel,
    storageLabel: params.storageLabel,
    ramOptionId: params.ramOptionId,
    storageOptionId: params.storageOptionId,
    // Laptop / Smartwatch / Audio Device attributes from Your Device (stored
    // form, e.g. { ram: '16GB', storageType: 'NVME_SSD' }); absent for Mobile/Tablet.
    deviceCategory: params.deviceCategory,
    specs: params.specs,
    imei: params.imei,
    complaint: params.complaint,
    issueAudioUrl: params.issueAudioUrl || null,
    services: params.services || [],
    lock: params.lock,
    missingParts: params.missingParts,
    devicePhotos: params.devicePhotos,
    estimatedAt: params.estimatedAt,
    estimatedDelivery: params.estimatedDelivery,
    estimatedReadyIso: params.estimatedReadyIso,
    estimatedDeliveryIso: params.estimatedDeliveryIso,
    customerApproved: params.customerApproved,
  } : null;

  const existing = Array.isArray(params.existingDevices) ? params.existingDevices : [];
  // Priority: pre-built devices list > existing + new > existing > new alone.
  let initial;
  if (Array.isArray(params.devices) && params.devices.length > 0) {
    initial = params.devices;
  } else if (existing.length > 0 && newDevice) {
    initial = [...existing, newDevice];
  } else if (existing.length > 0) {
    initial = existing;
  } else if (newDevice) {
    initial = [newDevice];
  } else {
    initial = [];
  }

  const [devices] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  // Remembers tickets already created in a previous submit attempt (index → response),
  // so a retry after a partial failure never re-posts an already-booked device.
  const createdRef = useRef({});

  const totalFor = (d) => (d.services || []).reduce((s, x) => s + (Number(x.price) || 0), 0);
  const grandTotal = devices.reduce((s, d) => s + totalFor(d), 0);

  // ── Payment collected at the counter ───────────────────────────────────
  // Starts unset on a fresh booking, on purpose: defaulting to "Full Payment"
  // would silently record money as received on every walk-in that pays only on
  // delivery. The owner states it. Edit mode reloads what the ticket already
  // holds so re-saving doesn't wipe a recorded payment.
  const [paymentType, setPaymentType] = useState(params.prefillPaymentType || null);
  const [paidText, setPaidText] = useState(
    params.prefillPaymentAmount != null && params.prefillPaymentAmount !== ''
      ? sanitizeAmount(String(Math.round(Number(params.prefillPaymentAmount) || 0)))
      : '',
  );

  const paidAmount = Number(paidText) || 0;
  const balanceDue = Math.max(0, grandTotal - paidAmount);

  // Choosing Full Payment fills in the grand total — it is the only amount that
  // mode can mean. Still editable afterwards, since a counter discount makes
  // "paid in full" and "paid the estimate" diverge by a couple of hundred.
  const onChangeMode = useCallback((value) => {
    setPaymentType(value);
    if (value === 'FULL') setPaidText(grandTotal > 0 ? String(Math.round(grandTotal)) : '');
    else setPaidText('');
  }, [grandTotal]);

  // One booking, one payment — but each device becomes its own ticket, so the
  // amount is split across them in proportion to what each device is estimated
  // at. The parts must add back up to exactly what the customer handed over,
  // and no part may exceed its own device's estimate: the backend refuses a
  // ticket paid over its bill, so an overshoot on one device would 400 the
  // whole submit.
  const paidSplit = useMemo(() => {
    if (!paymentType || paidAmount <= 0 || devices.length === 0) {
      return devices.map(() => null);
    }
    if (devices.length === 1) return [paidAmount];
    const subs = devices.map(totalFor);
    if (grandTotal <= 0) return devices.map((_, i) => (i === 0 ? paidAmount : 0));

    // Multiply before dividing. The other order asks floating point for
    // 100/301*301, gets 99.99999999999999, and floors a device that should
    // have had its whole estimate covered one rupee short.
    const shares = subs.map((s) => Math.floor((paidAmount * s) / grandTotal));
    let remainder = paidAmount - shares.reduce((sum, x) => sum + x, 0);

    // Largest fractions first, and never past a device's own estimate. Headroom
    // is always enough: every share started at or below its exact proportion.
    const byFraction = subs
      .map((s, i) => ({ i, frac: (paidAmount * s) / grandTotal - shares[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let pass = 0; remainder > 0 && pass < devices.length; pass++) {
      for (const { i } of byFraction) {
        if (remainder <= 0) break;
        if (shares[i] < subs[i]) { shares[i] += 1; remainder -= 1; }
      }
    }
    return shares;
  }, [paymentType, paidAmount, devices, grandTotal]);

  const addMore = () => {
    navigation.navigate('ChooseDevice', {
      customerId: params.customerId,
      customer: params.customer,
      existingDevices: devices,
    });
  };

  const buildTicketBody = (d, index = 0) => ({
    customerId: params.customerId,
    customerName: params.customer?.name || params.customer?.fullName || null,
    customerPhone: params.customer?.phone || params.customer?.mobile || null,
    brandId: d.brandId,
    modelId: d.modelId,
    ramOptionId: d.ramOptionId,
    storageOptionId: d.storageOptionId,
    color: d.color,
    // deviceCategory + ram / storageCapacity / storageType / caseSize /
    // connectivity / deviceType, each its own ticket column (null when the
    // category doesn't take it). Mobile/Tablet send only deviceCategory.
    ...specRequestFields(d.deviceCategory, d.specs),
    imei: d.imei,
    issueDescription: d.complaint,
    issueAudioUrl: d.issueAudioUrl || null,
    estimatedPrice: totalFor(d),
    // Null mode → the backend drops the amount too, so an unanswered payment
    // section leaves the ticket at PENDING rather than recording a ₹0 payment.
    // paymentStatus / balanceAmount / paymentPaidAt are NOT sent: the backend
    // derives all three, so nothing here can date a receipt from a device clock.
    paymentType: paymentType || null,
    paymentAmount: paidSplit[index] ?? null,
    deviceDisplayName: d.modelName ? `${d.modelName}${d.modelNumber ? ` · ${d.modelNumber}` : ''}${specDisplayParts(d).length ? ` (${specDisplayParts(d).join(' / ')})` : ''}` : null,
    deviceImageUrl: d.imageUrl || null,
    repairServicesSummary: serviceSummaryFor(d) || null,
    priceItemsJson: priceItemsJsonFor(d),
    deviceSecurityType: d.lock?.type || 'NONE',
    deviceSecurityValue: d.lock?.value || null,
    missingPartsJson: (d.missingParts && d.missingParts.length) ? JSON.stringify(d.missingParts) : null,
    devicePhotosJson: d.devicePhotos ? JSON.stringify(d.devicePhotos) : null,
    estimatedReadyAt: d.estimatedReadyIso || null,
    estimatedDeliveryAt: d.estimatedDeliveryIso || null,
    customerApproval: d.customerApproved ?? null,
  });

  const submit = async () => {
    if (!params.customerId) { notify('Missing', 'Customer is required'); return; }
    // Payment is optional — but a half-answered one isn't. A mode with no
    // amount, or an amount with no mode, would store a number nobody can read
    // back as either a deposit or a settled bill.
    if (paymentType && paidAmount <= 0) {
      notify('Payment', `Enter the amount collected for ${labelForMode(paymentType)}`);
      return;
    }
    if (!paymentType && paidText) {
      notify('Payment', 'Choose Advance or Full Payment for the amount entered');
      return;
    }
    if (paidAmount > grandTotal) {
      notify('Payment', `Amount collected can't be more than the grand total ₹${formatINR(grandTotal)}`);
      return;
    }
    setSubmitting(true);
    try {
      // Edit mode: update the existing ticket in place via PUT and route to the
      // same Thank You / Receipt / Barcode flow as a fresh booking.
      if (params.editMode && params.editTicketId) {
        const d = devices[0] || {};
        const res = await ticketApi.put(`/tickets/${params.editTicketId}`, { body: buildTicketBody(d) });

        // A saved re-estimate moves the ticket to QUOTED — the status the app
        // already labels "Re-Estimated" on the card badge and counts in the
        // Re-Estimated tile. Without it the edit updated price and timing but
        // left the ticket at CREATED, so a re-estimated booking still read
        // "Service Accepted" and the tile stayed at 0.
        //
        // A SEPARATE call on purpose: TicketRequest carries no status field, so
        // putting one in the update body is silently dropped. Status changes go
        // through the dedicated endpoint, the same one Update Status uses.
        //
        // Not fatal if it fails — the re-estimate itself is saved by then, and
        // losing the whole submit over a badge would be worse than a stale one.
        try {
          await ticketApi.patch(`/tickets/${params.editTicketId}/status`, {
            query: { status: 'QUOTED' },
          });
        } catch (statusErr) {
          console.log('Re-estimate saved, status → QUOTED failed:', statusErr?.message);
        }
        navigation.replace('BookingThankYou', {
          customer: params.customer,
          devices,
          tickets: [res],
          editMode: true,
        });
        return;
      }

      // Post each device, remembering which ones already succeeded so a retry
      // after a partial failure only re-submits the devices that still failed —
      // otherwise tapping Submit again would duplicate the already-created tickets.
      for (let i = 0; i < devices.length; i++) {
        if (createdRef.current[i]) continue; // already booked on a previous attempt
        const res = await ticketApi.post('/tickets', { body: buildTicketBody(devices[i], i) });
        createdRef.current[i] = res;
      }
      const created = devices.map((_, i) => createdRef.current[i]);
      navigation.replace('BookingThankYou', {
        customer: params.customer,
        devices,
        tickets: created,
      });
    } catch (e) {
      const status = e?.status ? ` (HTTP ${e.status})` : '';
      const done = Object.keys(createdRef.current).length;
      const remaining = devices.length - done;
      // Tell the owner what already got booked, so they know a retry continues
      // rather than duplicating.
      const partial = (devices.length > 1 && done > 0)
        ? `\n\n${done} of ${devices.length} devices were already booked. Tapping Submit again will only book the remaining ${remaining} device${remaining > 1 ? 's' : ''}.`
        : '';
      const msg = `${e?.message || 'Failed to submit booking'}${status}${partial}`;
      // Log the full error so it can be read from the Metro console too.
      console.log('Booking submit error →', e?.status, e?.message, e);
      // Alert stays on screen until dismissed, so the message is readable
      // (the toast disappears in ~2s).
      Alert.alert('Booking failed', msg);
    } finally { setSubmitting(false); }
  };

  const customerName = params.customer?.name || params.customer?.fullName || 'Customer';
  const customerPhone = params.customer?.phone || params.customer?.mobile || '';
  const deviceCount = devices.length;

  const r = useResponsive();
  // Tablet / large-screen: cap the column and centre it, same convention as
  // the other booking-flow screens. Memoized so its object identity is
  // stable across re-renders — this is passed into `PaymentSection`, which
  // is `memo()`'d specifically to avoid re-rendering on every keystroke in
  // the amount field; a fresh object here on every render would defeat that.
  const colStyle = useMemo(
    () => (r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null),
    [r.isTablet, r.width],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F8F8F8' }}>
      {/* ── White header — compact, with a subtitle. Right side: Add another
          device (new bookings only; an edit is one ticket), else a spacer
          that keeps the title centred. ─────────────────────────────────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + rs(8), paddingBottom: rs(12), paddingHorizontal: rs(14), borderBottomWidth: 1, borderBottomColor: BORDER }}
      >
        <View className="flex-row items-center" style={colStyle}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER }}
          >
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View className="flex-1" style={{ paddingHorizontal: rs(8) }}>
            <Text className="text-center" style={{ color: INK, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>
              Service Booking Devices List
            </Text>
            <Text className="text-center" style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
              Review customer devices and services
            </Text>
          </View>
          {params.editMode ? (
            <View style={{ width: 36 }} />
          ) : (
            <Pressable
              onPress={addMore}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add another device"
              className="items-center justify-center active:opacity-80"
              style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: ACCENT }}
            >
              <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      </View>

      {/* The payment amount is the only input on this screen and it sits at the
          very bottom of the content, directly under the sticky CTA. Under
          SDK 54 edge-to-edge Android no longer resizes the window for us, so
          without this the keyboard opens straight over the field being typed
          into. Wrapping the CTA too keeps it riding above the keyboard instead
          of vanishing behind it. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 170 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Customer summary card ─────────────────────────────────────
            "Regular Customer" from the reference isn't added — there is no
            such field anywhere in this app (checked: no isReturning /
            regularCustomer / repeat-customer signal exists), so it would be
            fabricated. "Verified" is kept as-is — it was already here,
            unconditional, before this pass. ──────────────────────────── */}
        <View className="px-4" style={{ marginTop: rs(12) }}>
          <View style={colStyle}>
            <View
              className="overflow-hidden"
              style={{
                borderRadius: 16, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE,
                paddingHorizontal: 12, paddingVertical: 10,
              }}
            >
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center"
                  style={{ height: 40, width: 40, borderRadius: 13, marginRight: 10, backgroundColor: '#FFFFFF' }}
                >
                  <User size={18} color={ACCENT} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: TEXT_SECONDARY }}>CUSTOMER</Text>
                  <Text className="font-extrabold" style={{ color: INK, fontSize: 15, marginTop: rs(1) }} numberOfLines={1}>
                    {customerName}
                  </Text>
                  {customerPhone ? (
                    <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                      <Phone size={11} color={TEXT_SECONDARY} strokeWidth={2} />
                      <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: rs(4) }}>{customerPhone}</Text>
                    </View>
                  ) : null}
                </View>
                <View
                  className="flex-row items-center"
                  style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FFFFFF' }}
                >
                  <CircleCheck size={11} color={ACCENT} strokeWidth={2} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY, marginLeft: 3 }}>Verified</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Section rail ──────────────────────────────────────── */}
        <View className="flex-row items-center" style={[{ paddingHorizontal: rs(16), paddingTop: rs(14), paddingBottom: rs(6) }, colStyle]}>
          <ReceiptText size={14} color={ACCENT} strokeWidth={2} />
          <Text className="font-extrabold" style={{ color: INK, fontSize: 11, letterSpacing: 1, marginLeft: rs(6) }}>
            DEVICES IN THIS BOOKING
          </Text>
          <View className="flex-1" />
          <View className="rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: ACCENT_10 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY }}>
              {deviceCount} Device{deviceCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {/* ── Device cards ──────────────────────────────────────────────
            No "..." menu and no card-level chevron: neither has a backing
            action on this screen (nothing here opens a per-device detail
            view), so neither was added — see the final report. "Primary
            Device" is shown on index 0 only: real, derivable from the
            array's own order, not a stored/fabricated flag. ────────────── */}
        <View style={{ paddingHorizontal: rs(16) }}>
          <View style={colStyle}>
            {devices.map((d, idx) => {
              const subTotal = totalFor(d);
              const summary = specDisplayParts(d, { withColor: true }).join(' · ');
              const serviceCount = (d.services || []).length;
              return (
                <View
                  key={idx}
                  style={{
                    marginBottom: 8, borderRadius: 16, overflow: 'hidden',
                    backgroundColor: CARD_BG, borderWidth: 1, borderColor: HAIR,
                    shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
                  }}
                >
                  {/* Device head */}
                  <View className="flex-row items-center" style={{ padding: 10, paddingBottom: 8 }}>
                    <View
                      className="items-center justify-center overflow-hidden"
                      style={{ height: 50, width: 46, borderRadius: 12, marginRight: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR }}
                    >
                      {d.imageUrl ? (
                        <Image source={{ uri: d.imageUrl }} style={{ width: 38, height: 44 }} resizeMode="contain" />
                      ) : (
                        <Smartphone size={21} color={ACCENT} strokeWidth={2} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="font-extrabold" style={{ color: INK, fontSize: 13 }} numberOfLines={1}>
                        {d.modelName || 'Device'}
                      </Text>
                      {summary ? (
                        <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
                          {summary}
                        </Text>
                      ) : null}
                      <View className="flex-row items-center flex-wrap" style={{ marginTop: 5, gap: 5 }}>
                        {d.brandName ? (
                          <View className="rounded-full" style={{ paddingHorizontal: rs(7), paddingVertical: rs(2), backgroundColor: MINT }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY }}>{d.brandName}</Text>
                          </View>
                        ) : null}
                        {d.modelNumber ? (
                          <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(7), paddingVertical: rs(2), backgroundColor: MINT }}>
                            <Hash size={9} color={ACCENT} />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY, marginLeft: 2 }}>{d.modelNumber}</Text>
                          </View>
                        ) : null}
                        {idx === 0 ? (
                          <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(7), paddingVertical: rs(2), backgroundColor: '#F3F3F3' }}>
                            <Star size={9} color={TEXT_SECONDARY} fill={TEXT_SECONDARY} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: TEXT_SECONDARY, marginLeft: 2 }}>Primary Device</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Services list — read-only here. This screen has no
                      add/remove-service capability of its own (services were
                      finalized on the previous screen), so no "+ Add
                      Service" button or delete icons are shown — adding
                      them with no backing handler would be fake UI. */}
                  {serviceCount > 0 ? (
                    <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
                      <View style={{ borderTopWidth: 1, borderColor: HAIR, marginBottom: 8 }} />
                      <View className="flex-row items-center" style={{ marginBottom: 6 }}>
                        <Wrench size={12} color={ACCENT} strokeWidth={2} />
                        <Text className="font-extrabold" style={{ color: INK, fontSize: 11, letterSpacing: 0.5, marginLeft: rs(6) }}>
                          REPAIR SERVICES ({serviceCount})
                        </Text>
                      </View>
                      {d.complaint ? (
                        <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 6 }} numberOfLines={2}>
                          {d.complaint}
                        </Text>
                      ) : null}
                      <View style={{ borderRadius: 12, backgroundColor: SOFT_MINT, paddingHorizontal: 9, paddingVertical: 8 }}>
                        {(d.services || []).map((s, i) => (
                          <View
                            key={i}
                            className="flex-row items-center"
                            style={{ marginBottom: i === serviceCount - 1 ? 0 : 7 }}
                          >
                            <View
                              className="items-center justify-center"
                              style={{ height: 20, width: 20, borderRadius: 7, marginRight: 8, backgroundColor: '#FFFFFF' }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY }}>{i + 1}</Text>
                            </View>
                            <Text className="flex-1" style={{ color: INK, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                              {s.serviceName}
                            </Text>
                            <Text className="font-extrabold" style={{ color: INK, fontSize: 12 }}>
                              ₹{formatINR(s.price)}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Estimated repair amount — mint strip */}
                      <View
                        className="flex-row items-center"
                        style={{ marginTop: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: MINT }}
                      >
                        <Tag size={12} color={ACCENT} strokeWidth={2} />
                        <Text className="flex-1 font-extrabold" style={{ color: INK, fontSize: 12, marginLeft: rs(6) }}>
                          Estimated repair amount
                        </Text>
                        <Text className="font-extrabold" style={{ fontSize: 13, color: PRIMARY }}>
                          ₹{formatINR(subTotal)}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Empty state */}
          {devices.length === 0 ? (
            <View className="rounded-2xl p-6 items-center" style={cardOutline}>
              <Smartphone size={28} color="#8A8A8A" />
              <Text style={{ color: INK, fontSize: 13, fontWeight: '800', marginTop: 8 }}>No device added yet</Text>
              {params.editMode ? null : (
                <Pressable
                  onPress={addMore}
                  accessibilityRole="button"
                  className="flex-row items-center active:opacity-80"
                  style={{ marginTop: 10, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: ACCENT }}
                >
                  <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginLeft: 5 }}>Add device</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        {/* ── Bill summary ─────────────────────────────────────────────── */}
        {deviceCount > 0 ? (
          <>
            <View className="flex-row items-center" style={[{ paddingHorizontal: rs(16), paddingTop: rs(14), paddingBottom: rs(6) }, colStyle]}>
              <ReceiptText size={14} color={ACCENT} strokeWidth={2} />
              <Text className="font-extrabold" style={{ color: INK, fontSize: 11, letterSpacing: 1, marginLeft: rs(6) }}>
                BILL SUMMARY
              </Text>
            </View>
            <View style={{ paddingHorizontal: rs(16) }}>
              <View style={colStyle}>
                <View
                  style={{
                    borderRadius: 16, padding: 12, backgroundColor: CARD_BG, borderWidth: 1, borderColor: HAIR,
                    shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
                  }}
                >
                  {devices.map((d, i) => (
                    <View key={i} style={{ marginBottom: 8 }}>
                      <View className="flex-row items-center">
                        <Text className="flex-1 font-extrabold" style={{ color: INK, fontSize: 13 }} numberOfLines={1}>
                          {d.modelName || `Device ${i + 1}`}
                        </Text>
                        <Text className="font-extrabold" style={{ color: INK, fontSize: 13 }}>
                          ₹{formatINR(totalFor(d))}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(1) }}>
                        {(d.services || []).length} service{(d.services || []).length === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ))}
                  <View
                    style={{ borderTopWidth: 1, borderColor: BORDER, borderStyle: 'dashed', marginBottom: 8 }}
                  />
                  <View className="flex-row items-center">
                    <Text className="flex-1 font-extrabold" style={{ color: INK, fontSize: 13 }}>Grand Total</Text>
                    <Text className="font-extrabold" style={{ fontSize: 17, color: PRIMARY }}>
                      ₹{formatINR(grandTotal)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(5) }}>
                    Final amount may vary slightly based on parts availability.
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* ── Payment collected at the counter ────────────────────── */}
        {deviceCount > 0 ? (
          <PaymentSection
            paymentType={paymentType}
            paidText={paidText}
            balanceDue={balanceDue}
            grandTotal={grandTotal}
            onChangeMode={onChangeMode}
            onChangeAmount={setPaidText}
            colStyle={colStyle}
          />
        ) : null}

      </ScrollView>

      {/* ── Sticky submit bar ─────────────────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + rs(4), paddingHorizontal: rs(16) }}
      >
        <View style={colStyle}>
          <View
            className="flex-row items-center"
            style={{
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: (submitting || deviceCount === 0) ? '#B8B8B8' : ACCENT,
              shadowColor: ACCENT,
              shadowOpacity: (submitting || deviceCount === 0) ? 0 : 0.22,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: (submitting || deviceCount === 0) ? 0 : 3,
            }}
          >
            <View className="flex-1">
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                {deviceCount === 0
                  ? 'NO DEVICE YET'
                  : `GRAND TOTAL · ${deviceCount} DEVICE${deviceCount > 1 ? 'S' : ''}`}
              </Text>
              <Text className="text-white font-extrabold" style={{ fontSize: 17, marginTop: rs(1) }}>
                ₹{formatINR(grandTotal)}
              </Text>
            </View>
            <Pressable
              onPress={submit}
              disabled={submitting || deviceCount === 0}
              className="flex-row items-center active:opacity-80"
              style={{
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9,
                backgroundColor: '#FFFFFF',
              }}
            >
              {submitting ? (
                <ActivityIndicator color={ACCENT} />
              ) : (
                <>
                  <Text className="font-extrabold" style={{ fontSize: 13, color: PRIMARY }}>
                    {params.editMode ? 'Update Booking' : 'Submit Booking'}
                  </Text>
                  <Send size={15} color={ACCENT} strokeWidth={2} style={{ marginLeft: rs(6) }} />
                </>
              )}
            </Pressable>
          </View>
          {deviceCount === 0 ? (
            <Text className="text-center" style={{ color: TEXT_SECONDARY, fontSize: 11, marginTop: rs(8) }}>
              Add at least one device to submit.
            </Text>
          ) : null}
        </View>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Payment
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mode dropdown on the left, amount on the right — the two halves of a single
 * statement ("₹5,000 as an advance"), so they sit on one row rather than as two
 * stacked fields.
 *
 * Memoized because it owns the screen's only TextInput: without it every
 * keystroke re-renders the whole devices list and bill summary above, and that
 * per-keystroke cost is what makes the Android caret jump. The props it takes
 * are primitives plus two stable callbacks, so it re-renders only when the
 * payment itself changes.
 */
const PaymentSection = memo(function PaymentSection({
  paymentType, paidText, balanceDue, grandTotal, onChangeMode, onChangeAmount, colStyle,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedLabel = labelForMode(paymentType);
  const paid = Number(paidText) || 0;
  const overTotal = paid > grandTotal;

  return (
    <>
      <View className="flex-row items-center" style={[{ paddingHorizontal: rs(16), paddingTop: rs(14), paddingBottom: rs(6) }, colStyle]}>
        <Wallet size={14} color={ACCENT} strokeWidth={2} />
        <Text className="font-extrabold" style={{ color: INK, fontSize: 11, letterSpacing: 1, marginLeft: rs(6) }}>
          PAYMENT
        </Text>
        <View className="flex-1" />
        {paymentType ? (
          <View className="rounded-full flex-row items-center" style={{ paddingHorizontal: rs(8), paddingVertical: rs(3), backgroundColor: ACCENT_10 }}>
            <CircleCheck size={10} color={ACCENT} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY, marginLeft: rs(4) }}>₹{formatINR(paid)}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 10, fontWeight: '700', color: TEXT_SECONDARY }}>OPTIONAL</Text>
        )}
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <View style={colStyle}>
          <View
            style={{
              borderRadius: 16, padding: 12, backgroundColor: CARD_BG, borderWidth: 1, borderColor: HAIR,
            }}
          >
            <View className="flex-row items-center flex-wrap" style={{ gap: rs(8) }}>
              {/* Mode dropdown */}
              <Pressable
                onPress={() => setPickerOpen(true)}
                className="flex-row items-center active:opacity-70"
                style={{ flex: 1, minWidth: rs(140), borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT_MINT }}
              >
                <Text
                  className="flex-1"
                  numberOfLines={1}
                  style={{ fontSize: 12, fontWeight: '700', color: selectedLabel ? INK : '#8A8A8A' }}
                >
                  {selectedLabel || 'Payment mode'}
                </Text>
                <ChevronDown size={15} color={TEXT_SECONDARY} strokeWidth={2} />
              </Pressable>

              {/* Amount */}
              <View
                className="flex-row items-center"
                style={{
                  width: rs(122), borderRadius: 10, paddingHorizontal: 11,
                  borderWidth: 1, borderColor: overTotal ? '#F84141' : BORDER, backgroundColor: SOFT_MINT,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: PRIMARY }}>₹</Text>
                <TextInput
                  value={paidText}
                  onChangeText={(t) => onChangeAmount(sanitizeAmount(t))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#8A8A8A"
                  editable={!!paymentType}
                  className="flex-1 font-extrabold"
                  style={{ color: INK, paddingVertical: 9, paddingLeft: 4, fontSize: 13, textAlign: 'right' }}
                />
              </View>
            </View>

            {/* Consequence line — what the customer still owes, or why the field
                is inert. Both answer the question the row just raised. */}
            {!paymentType ? (
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(10) }}>
                Pick a mode to record money collected now. Leave it blank if the customer pays on delivery.
              </Text>
            ) : overTotal ? (
              <Text  style={{ color: '#F84141', fontSize: 11, fontWeight: '700', marginTop: rs(10) }}>
                More than the grand total ₹{formatINR(grandTotal)}.
              </Text>
            ) : (
              <View className="flex-row items-center" style={{ marginTop: rs(10) }}>
                <Text className="flex-1" style={{ fontSize: 11, color: TEXT_SECONDARY }}>
                  {paymentType === 'ADVANCE' ? 'Balance on delivery' : 'Balance'}
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: '800', color: balanceDue > 0 ? INK : ACCENT }}
                >
                  ₹{formatINR(balanceDue)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Mounted only while open — a permanently mounted Modal would re-render
          its option list on every keystroke in the amount field above. */}
      {pickerOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <Pressable className="flex-1 bg-black/50 justify-center px-8" onPress={() => setPickerOpen(false)}>
            <Pressable className="bg-card rounded-2xl overflow-hidden" onPress={(e) => e.stopPropagation()}>
              <Text style={{ color: INK, fontSize: 13, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                Payment mode
              </Text>
              {PAYMENT_MODES.map((m) => {
                const active = m.value === paymentType;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => { onChangeMode(m.value); setPickerOpen(false); }}
                    className="flex-row items-center px-4 py-3 border-t border-border active:bg-background"
                  >
                    <View className="flex-1">
                      <Text style={{ color: INK, fontSize: 13, fontWeight: '700' }}>{m.label}</Text>
                      <Text style={{ color: TEXT_SECONDARY, fontSize: 11, marginTop: 2 }}>{m.hint}</Text>
                    </View>
                    {active ? <Check size={16} color={ACCENT} /> : null}
                  </Pressable>
                );
              })}
              {/* Undo — the section is optional, so there has to be a way back
                  out of it once a mode has been picked. */}
              {paymentType ? (
                <Pressable
                  onPress={() => { onChangeMode(null); setPickerOpen(false); }}
                  className="px-4 py-3 border-t border-border active:bg-background"
                >
                  <Text style={{ color: TEXT_SECONDARY, fontSize: 12, fontWeight: '700' }}>No payment collected now</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
});

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
/**
 * Cards are outlines now, not shadows. On a white page the hairline is what
 * makes a white card's edges visible, and the drop shadow on top of it was
 * doing the same job twice — which read as heavy.
 */
const cardOutline = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E6E6E6',
};
