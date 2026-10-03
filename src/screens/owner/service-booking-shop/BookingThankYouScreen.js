import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Clipboard from 'expo-clipboard';
import { ScreenHeader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ResponsiveModal } from '../../../components/responsive';
import { getSession } from '../../../auth/session';
import { shareReceiptToWhatsApp } from '../../../lib/whatsappShare';
import { openSmsComposer } from '../../../lib/smsShare';
import {
  paymentAcrossTickets, BookingReceipt, ReceiptSlip, buildBookingReceiptText, receiptShopFromSession,
} from '../AllBooking/ReceiptCard';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import { specDisplayParts } from '../../../utils/deviceSpecs';

// GGFIX palette.
const ACCENT = '#09AD2A';       // GGFIX green — fills, icons
const PRIMARY = '#078F23';      // deeper green — green TEXT, gradient partner
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const TEXT_SECONDARY = '#6B6B6B';

export default function BookingThankYouScreen({ navigation, route }) {
  const { customer = {}, devices = [], tickets = [] } = route?.params || {};
  const trackingId = tickets[0]?.trackingId || 'CSPEN00000000';
  const total = devices.reduce(
    (sum, d) => sum + (d.services || []).reduce((s, x) => s + (Number(x.price) || 0), 0),
    0,
  );

  // Read back off the created tickets, not off the payment the user typed on
  // the previous screen. If the backend didn't record it, the receipt must not
  // claim it did — a printed "Advance Paid ₹5,000" that no row backs up is a
  // dispute at the counter later.
  const payment = paymentAcrossTickets(tickets, total);

  const receiptRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  // The real shop name + picture come from the logged-in shop session, not
  // the customer.
  const [shop, setShop] = useState({ name: customer.shopName || '', imageUrl: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (cancelled) return;
        const next = receiptShopFromSession(s);
        setShop((prev) => ({ name: next.name || prev.name, imageUrl: next.imageUrl }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Booking time printed on the receipt: the ticket's own createdAt, else the
  // moment this screen opened (it opens right after submit).
  const [bookedAt] = useState(() => tickets[0]?.createdAt || new Date().toISOString());

  // One set of props for both receipts (AllBooking/ReceiptCard): the on-screen
  // <BookingReceipt> and the <ReceiptSlip> image that Share to WhatsApp sends —
  // the same slip the Bookings "Share image" sheet sends.
  const receiptProps = {
    shop,
    createdAt: bookedAt,
    customer,
    devices: devices.map((d) => ({
      modelName: d.modelName,
      imageUrl: d.imageUrl,
      variant: specDisplayParts(d, { withColor: true }).join(' · '),
      imei: d.imei || null,
      serviceNames: (d.services || []).map((x) => x.serviceName).filter(Boolean),
      price: (d.services || []).reduce((sum, x) => sum + (Number(x.price) || 0), 0),
    })),
    trackingId,
    statusLabel: 'Order Placed',
    total,
    payment,
  };

  const buildMessage = () => buildBookingReceiptText(receiptProps);

  // Tickets that were actually created — Assign and Barcode Print act on these.
  // tickets[i] is devices[i]'s ticket (ServiceBookingDevicesList posts in order).
  const bookedTickets = tickets
    .map((t, i) => (t?.id ? { ticket: t, device: devices[i] || {} } : null))
    .filter(Boolean);
  const [barcodePickerOpen, setBarcodePickerOpen] = useState(false);

  // Assign — the booking flow's own Technician Assign screen, which patches
  // every ticket of this booking and then shows Booking Successful.
  const assignTechnician = () => {
    if (!bookedTickets.length) {
      notify('Not available', 'This booking has no ticket to assign yet.');
      return;
    }
    navigation.navigate('AssignTechnician', {
      tickets: bookedTickets.map((b) => b.ticket),
      customer,
      devices,
    });
  };

  // SMS — the same receipt text WhatsApp sends, in the customer's SMS app.
  const shareSms = () => openSmsComposer({ phone: customer.phone, message: buildMessage() });

  // Barcode Print — same Barcode / QR screen the Bookings list opens. It
  // prints one ticket, so a multi-device booking asks which device first.
  const openBarcodeFor = (ticket) => {
    setBarcodePickerOpen(false);
    navigation.navigate('BarcodePrint', { ticketId: ticket.id, mode: 'barcode' });
  };
  const printBarcode = () => {
    if (!bookedTickets.length) {
      notify('Not available', 'This booking has no ticket to print yet.');
      return;
    }
    if (bookedTickets.length === 1) {
      openBarcodeFor(bookedTickets[0].ticket);
      return;
    }
    setBarcodePickerOpen(true);
  };

  // Share to WhatsApp — WhatsApp only, never the system share sheet or any
  // other app (see lib/whatsappShare).
  const shareWhatsApp = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareReceiptToWhatsApp({
        viewRef: receiptRef,
        message: buildMessage(),
        phone: customer.phone,
        filename: `ggfix-receipt-${trackingId}`,
      });
    } finally {
      setSharing(false);
    }
  };

  // `expo-clipboard` is already a project dependency (used nowhere in this
  // file before) — a real copy, not a decorative icon with no handler.
  const copyTrackingId = async () => {
    try {
      await Clipboard.setStringAsync(trackingId);
      notify('Copied', `Tracking ID #${trackingId} copied.`);
    } catch (e) {
      notify('Copy failed', e?.message || 'Could not copy the tracking ID.');
    }
  };

  const r = useResponsive();
  // Tablet / large-screen: cap the column and centre it, same convention as
  // the other booking-flow screens.
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: '#F8F8F8' }}>
      {/* popToTop() only unwinds to the top of the BOOKING stack, which lands on
          the first wizard step — Back from a finished booking would restart the
          one just completed. Go to Home instead: the booking is done, so the
          wizard is not somewhere to return to.
          Transparent so it blends into the mint hero below, with a small
          subtle brand line in the existing `right` slot. */}
      <ScreenHeader
        title=""
        transparent
        onBack={() => navigation.navigate('OwnerTabs', { screen: 'Home' })}
        right={(
          <View className="items-end">
            <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1, color: PRIMARY }}>REPAIR TODAY</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: TEXT_SECONDARY }}>A BRIGHTER TOMORROW</Text>
          </View>
        )}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: rs(32) }}>
        {/* On-screen Thank You receipt — shown here, never sent. */}
        <BookingReceipt
          {...receiptProps}
          padding={rs(14)}
          contentStyle={colStyle}
          onCopyTrackingId={copyTrackingId}
        />

        {/* ── Confirmation banner — information only. ─────────────────── */}
        <View style={{ paddingHorizontal: rs(14), marginTop: rs(4) }}>
          <View style={colStyle}>
            <View
              className="flex-row items-center"
              style={{
                borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE,
              }}
            >
              <View
                className="items-center justify-center"
                style={{ height: 32, width: 32, borderRadius: 11, marginRight: 10, backgroundColor: ACCENT }}
              >
                <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold" style={{ fontSize: 13, color: PRIMARY }}>Booking confirmed!</Text>
                <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={2}>
                  Your request is ready for technician assignment.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Booking actions — Assign · WhatsApp · SMS · Barcode Print, the
            same actions a booking offers on the Bookings list. */}
        <View style={{ paddingHorizontal: rs(14), marginTop: rs(10) }}>
          <View className="flex-row" style={[{ marginHorizontal: -4 }, colStyle]}>
            <ActionTile icon="person-add-outline" label="Assign" color={PRIMARY} tint={MINT} onPress={assignTechnician} />
            <ActionTile icon="logo-whatsapp" label="WhatsApp" color="#16A34A" tint="#E6F7E3" onPress={shareWhatsApp} busy={sharing} disabled={sharing} />
            <ActionTile icon="chatbubble-ellipses-outline" label="SMS" color="#2563EB" tint="#E4EEFF" onPress={shareSms} />
            <ActionTile icon="barcode-outline" label="Barcode Print" color="#B45309" tint="#FFF0D2" onPress={printBarcode} />
          </View>
        </View>
      </ScrollView>

      {/* Multi-device booking: pick whose barcode to print. */}
      <ResponsiveModal visible={barcodePickerOpen} onClose={() => setBarcodePickerOpen(false)}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E1E1E' }}>Print barcode for</Text>
        <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2, marginBottom: 10 }}>Each device has its own tracking ID.</Text>
        {bookedTickets.map(({ ticket, device }) => (
          <Pressable
            key={ticket.id}
            onPress={() => openBarcodeFor(ticket)}
            accessibilityRole="button"
            className="flex-row items-center active:opacity-80"
            style={{ borderRadius: 14, borderWidth: 1, borderColor: '#E6E6E6', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 }}
          >
            <View className="items-center justify-center" style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: '#FFF0D2', marginRight: 10 }}>
              <Ionicons name="barcode-outline" size={17} color="#B45309" />
            </View>
            <View className="flex-1">
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E1E1E' }} numberOfLines={1}>{device.modelName || 'Device'}</Text>
              {ticket.trackingId ? (
                <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }}>#{ticket.trackingId}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={TEXT_SECONDARY} />
          </Pressable>
        ))}
      </ResponsiveModal>

      {/* The image Share to WhatsApp sends: the GGFix receipt slip, rendered
          off-screen at a phone receipt's width so captureRef has a laid-out
          view to draw. Not visible, not touchable. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0, width: 360 }}>
        <ViewShot ref={receiptRef} options={{ format: 'png', quality: 1 }} collapsable={false} style={{ backgroundColor: '#FFFFFF' }}>
          <ReceiptSlip {...receiptProps} />
        </ViewShot>
      </View>
    </View>
  );
}

/** One of the four booking actions: tinted icon circle over a short label. */
function ActionTile({ icon, label, color, tint, onPress, busy = false, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center active:opacity-80"
      style={{
        marginHorizontal: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F3F3', opacity: disabled && !busy ? 0.5 : 1,
        shadowColor: '#1E1E1E', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
      }}
    >
      <View className="items-center justify-center" style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: tint }}>
        {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={19} color={color} />}
      </View>
      <Text
        style={{ marginTop: 6, fontSize: 11.5, fontWeight: '800', color: '#1E1E1E', textAlign: 'center' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}
