import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable, Image, Alert, Modal, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
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
} from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';

// Swiggy / Zomato green palette — same as the rest of the booking flow.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

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
    deviceDisplayName: d.modelName ? `${d.modelName}${d.modelNumber ? ` · ${d.modelNumber}` : ''}${d.ramLabel || d.storageLabel ? ` (${[d.ramLabel, d.storageLabel].filter(Boolean).join(' / ')})` : ''}` : null,
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
            <Text className="text-text text-[16px] font-bold text-center" numberOfLines={1}>
              Service Booking Devices List
            </Text>
          </View>
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
        {/* ── Customer card overlapping hero ────────────────────────── */}
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
              <View className="h-14 w-14 rounded-2xl bg-success/10 items-center justify-center mr-3">
                <User size={22} color={ACCENT_GREEN} />
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-text-muted font-bold tracking-widest">CUSTOMER</Text>
                <Text className="text-[15px] font-extrabold text-text mt-0.5" numberOfLines={1}>
                  {customerName}
                </Text>
                {customerPhone ? (
                  <View className="flex-row items-center mt-0.5">
                    <Phone size={11} color="#667066" />
                    <Text className="text-[11.5px] text-text-muted ml-1">{customerPhone}</Text>
                  </View>
                ) : null}
              </View>
              <View className="bg-success/10 rounded-full px-2.5 py-1 flex-row items-center">
                <CircleCheck size={11} color={ACCENT_GREEN} />
                <Text className="text-success text-[10px] font-extrabold ml-1">VERIFIED</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Section rail ──────────────────────────────────────── */}
        <View className="px-4 pt-5 pb-2 flex-row items-center">
          <ReceiptText size={14} color={BRAND_GREEN_DARK} />
          <Text className="text-text font-extrabold text-[12.5px] tracking-widest ml-1.5">
            DEVICES IN THIS BOOKING
          </Text>
          <View className="flex-1 h-px bg-border ml-2" />
          <View className="bg-success/10 rounded-full px-2 py-0.5 ml-2">
            <Text className="text-success text-[10px] font-extrabold">{deviceCount}</Text>
          </View>
        </View>

        {/* ── Device cards ──────────────────────────────────────── */}
        <View className="px-4">
          {devices.map((d, idx) => {
            const subTotal = totalFor(d);
            const summary = [d.ramLabel, d.storageLabel, d.color].filter(Boolean).join(' · ');
            return (
              <View
                key={idx}
                className="bg-card rounded-2xl mb-3 overflow-hidden"
                style={cardShadow}
              >
                {/* Device head */}
                <View className="flex-row items-center px-3.5 pt-3.5 pb-2">
                  <View className="h-14 w-14 rounded-2xl bg-success/10 items-center justify-center overflow-hidden mr-3">
                    {d.imageUrl ? (
                      <Image source={{ uri: d.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Smartphone size={26} color={ACCENT_GREEN} />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-extrabold text-text" numberOfLines={1}>
                      {d.modelName || 'Device'}
                    </Text>
                    {summary ? (
                      <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={1}>
                        {summary}
                      </Text>
                    ) : null}
                    {(d.brandName || d.modelNumber) ? (
                      <View className="flex-row items-center flex-wrap mt-1">
                        {d.brandName ? (
                          <View className="bg-primary/10 rounded-md px-1.5 py-0.5 mr-1.5">
                            <Text className="text-primary text-[10px] font-extrabold">{d.brandName}</Text>
                          </View>
                        ) : null}
                        {d.modelNumber ? (
                          <View className="flex-row items-center bg-primary/10 rounded-md px-1.5 py-0.5">
                            <Hash size={9} color="#087A0A" />
                            <Text className="text-primary text-[10px] font-extrabold ml-0.5">{d.modelNumber}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Services list */}
                {(d.services || []).length > 0 ? (
                  <View className="px-3.5 pb-3">
                    <View className="h-px bg-border mb-2.5" />
                    <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2">
                      REPAIR SERVICES
                    </Text>
                    {(d.services || []).map((s, i) => (
                      <View key={i} className="flex-row items-center mb-1.5">
                        <View
                          className="h-5 w-5 rounded-md items-center justify-center mr-2"
                          style={{ backgroundColor: 'rgba(22, 187, 5, 0.14)' }}
                        >
                          <Text className="text-[9.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                            {i + 1}
                          </Text>
                        </View>
                        <Text className="flex-1 text-text text-[12.5px]" numberOfLines={1}>
                          {s.serviceName}
                        </Text>
                        <Text className="text-text font-extrabold text-[12.5px]">
                          ₹{formatINR(s.price)}
                        </Text>
                      </View>
                    ))}

                    {/* Dashed separator + per-device subtotal */}
                    <View
                      className="my-2"
                      style={{ borderTopWidth: 1, borderColor: '#E2E8E2', borderStyle: 'dashed' }}
                    />
                    <View className="flex-row items-center">
                      <Tag size={12} color={BRAND_GREEN_DARK} />
                      <Text className="flex-1 text-text font-extrabold text-[12.5px] ml-1.5">
                        Estimated repair amount
                      </Text>
                      <Text className="font-extrabold text-[14px]" style={{ color: BRAND_GREEN_DARK }}>
                        ₹{formatINR(subTotal)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* Empty state */}
          {devices.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center" style={cardShadow}>
              <Smartphone size={28} color="#8FA08F" />
              <Text className="text-text font-extrabold text-[13px] mt-2">No device added yet</Text>
              <Text className="text-text-muted text-[11px] mt-1 text-center">
                Tap "Add device" below to start.
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Add More Device — Swiggy "Add address" pattern ─────── */}
        {params.editMode ? null : (
          <View className="px-4 mt-1">
            <Pressable
              onPress={addMore}
              className="rounded-2xl items-center justify-center py-3 active:opacity-80"
              style={{
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: ACCENT_GREEN,
                backgroundColor: 'rgba(8, 122, 10, 0.04)',
              }}
            >
              <View className="flex-row items-center">
                <View
                  className="h-7 w-7 rounded-full items-center justify-center mr-2"
                  style={{ backgroundColor: ACCENT_GREEN }}
                >
                  <Plus size={14} color="#fff" />
                </View>
                <Text className="text-[13px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                  Add another device
                </Text>
              </View>
              <Text className="text-[10.5px] text-text-muted mt-1 px-2 text-center">
                Same customer? Book multiple devices in one go.
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Grand total — Swiggy "Bill summary" pattern ───────── */}
        {deviceCount > 0 ? (
          <>
            <View className="px-4 pt-5 pb-2 flex-row items-center">
              <ReceiptText size={14} color={BRAND_GREEN_DARK} />
              <Text className="text-text font-extrabold text-[12.5px] tracking-widest ml-1.5">
                BILL SUMMARY
              </Text>
              <View className="flex-1 h-px bg-border ml-2" />
            </View>
            <View className="px-4">
              <View className="bg-card rounded-2xl p-4" style={cardShadow}>
                {devices.map((d, i) => (
                  <View key={i} className="flex-row items-center mb-2">
                    <Text className="flex-1 text-text text-[12.5px]" numberOfLines={1}>
                      {d.modelName || `Device ${i + 1}`}
                    </Text>
                    <Text className="text-text font-extrabold text-[12.5px]">
                      ₹{formatINR(totalFor(d))}
                    </Text>
                  </View>
                ))}
                <View
                  className="my-2.5"
                  style={{ borderTopWidth: 1, borderColor: '#E2E8E2', borderStyle: 'dashed' }}
                />
                <View className="flex-row items-center">
                  <Text className="flex-1 text-text font-extrabold text-[13.5px]">Grand Total</Text>
                  <Text className="text-[19px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                    ₹{formatINR(grandTotal)}
                  </Text>
                </View>
                <Text className="text-text-muted text-[10.5px] mt-1">
                  Final amount may vary slightly based on parts availability.
                </Text>
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
          />
        ) : null}

      </ScrollView>

      {/* ── Sticky green CTA ───────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={submit}
          disabled={submitting || deviceCount === 0}
          className="active:opacity-90"
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            opacity: (submitting || deviceCount === 0) ? 0.6 : 1,
            shadowColor: BRAND_GREEN_DARK,
            shadowOpacity: (submitting || deviceCount === 0) ? 0 : 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: (submitting || deviceCount === 0) ? 0 : 10,
          }}
        >
          <LinearGradient
            colors={(submitting || deviceCount === 0) ? ['#8FA08F', '#667066'] : [BRAND_GREEN, BRAND_GREEN_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text className="text-white text-[11px] font-bold opacity-90">
                {deviceCount === 0
                  ? 'NO DEVICE YET'
                  : `GRAND TOTAL · ${deviceCount} DEVICE${deviceCount > 1 ? 'S' : ''}`}
              </Text>
              <Text className="text-white text-[19px] font-extrabold">
                ₹{formatINR(grandTotal)}
              </Text>
            </View>
            <View className="flex-row items-center">
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Send size={15} color="#fff" />
                  <Text className="text-white text-[14px] font-extrabold ml-1.5">
                    {params.editMode ? 'Update' : 'Submit'}
                  </Text>
                  <ChevronRight size={18} color="#fff" />
                </>
              )}
            </View>
          </LinearGradient>
        </Pressable>
        {deviceCount === 0 ? (
          <Text className="text-text-muted text-[10.5px] text-center mt-2">
            Add at least one device to submit.
          </Text>
        ) : null}
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
  paymentType, paidText, balanceDue, grandTotal, onChangeMode, onChangeAmount,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedLabel = labelForMode(paymentType);
  const paid = Number(paidText) || 0;
  const overTotal = paid > grandTotal;

  return (
    <>
      <View className="px-4 pt-5 pb-2 flex-row items-center">
        <Wallet size={14} color={BRAND_GREEN_DARK} />
        <Text className="text-text font-extrabold text-[12.5px] tracking-widest ml-1.5">
          PAYMENT
        </Text>
        <View className="flex-1 h-px bg-border ml-2" />
        {paymentType ? (
          <View className="bg-success/10 rounded-full px-2 py-0.5 ml-2 flex-row items-center">
            <CircleCheck size={10} color={ACCENT_GREEN} />
            <Text className="text-success text-[10px] font-extrabold ml-1">₹{formatINR(paid)}</Text>
          </View>
        ) : (
          <Text className="text-text-muted text-[10px] font-bold ml-2">OPTIONAL</Text>
        )}
      </View>

      <View className="px-4">
        <View className="bg-card rounded-2xl p-3.5" style={cardShadow}>
          <View className="flex-row items-center">
            {/* Mode dropdown */}
            <Pressable
              onPress={() => setPickerOpen(true)}
              className="flex-1 flex-row items-center rounded-xl px-3 py-3 mr-2.5 active:opacity-70"
              style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#F7FAF7' }}
            >
              <Text
                className="flex-1 text-[12.5px] font-bold"
                numberOfLines={1}
                style={{ color: selectedLabel ? '#172117' : '#8FA08F' }}
              >
                {selectedLabel || 'Payment mode'}
              </Text>
              <ChevronDown size={15} color="#667066" />
            </Pressable>

            {/* Amount */}
            <View
              className="flex-row items-center rounded-xl px-3"
              style={{
                width: 122,
                borderWidth: 1,
                borderColor: overTotal ? '#DC2626' : '#E2E8E2',
                backgroundColor: '#F7FAF7',
              }}
            >
              <Text className="text-[13px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>₹</Text>
              <TextInput
                value={paidText}
                onChangeText={(t) => onChangeAmount(sanitizeAmount(t))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#8FA08F"
                editable={!!paymentType}
                className="flex-1 text-[13.5px] font-extrabold text-text"
                style={{ paddingVertical: 11, paddingLeft: 4, textAlign: 'right' }}
              />
            </View>
          </View>

          {/* Consequence line — what the customer still owes, or why the field
              is inert. Both answer the question the row just raised. */}
          {!paymentType ? (
            <Text className="text-text-muted text-[10.5px] mt-2.5">
              Pick a mode to record money collected now. Leave it blank if the customer pays on delivery.
            </Text>
          ) : overTotal ? (
            <Text className="text-danger text-[10.5px] font-bold mt-2.5">
              More than the grand total ₹{formatINR(grandTotal)}.
            </Text>
          ) : (
            <View className="flex-row items-center mt-2.5">
              <Text className="flex-1 text-text-muted text-[11px]">
                {paymentType === 'ADVANCE' ? 'Balance on delivery' : 'Balance'}
              </Text>
              <Text
                className="text-[12.5px] font-extrabold"
                style={{ color: balanceDue > 0 ? '#172117' : BRAND_GREEN_DARK }}
              >
                ₹{formatINR(balanceDue)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Mounted only while open — a permanently mounted Modal would re-render
          its option list on every keystroke in the amount field above. */}
      {pickerOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <Pressable className="flex-1 bg-black/50 justify-center px-8" onPress={() => setPickerOpen(false)}>
            <Pressable className="bg-card rounded-2xl overflow-hidden" onPress={(e) => e.stopPropagation()}>
              <Text className="text-text font-extrabold text-[13px] px-4 pt-4 pb-2">
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
                      <Text className="text-text text-[13px] font-bold">{m.label}</Text>
                      <Text className="text-text-muted text-[10.5px] mt-0.5">{m.hint}</Text>
                    </View>
                    {active ? <Check size={16} color={ACCENT_GREEN} /> : null}
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
                  <Text className="text-text-muted text-[12.5px] font-bold">No payment collected now</Text>
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
const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
