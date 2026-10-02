import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenHeader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { getSession } from '../../../auth/session';
import { shareReceiptToWhatsApp } from '../../../lib/whatsappShare';
import {
  paymentAcrossTickets, BookingReceipt, ReceiptSlip, buildBookingReceiptText, receiptShopFromSession,
} from '../AllBooking/ReceiptCard';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';

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
      variant: [d.ramLabel, d.storageLabel, d.color].filter(Boolean).join(' · '),
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

  // Share to WhatsApp — the ONLY share on this screen; never the system share
  // sheet or any other app (see lib/whatsappShare).
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

        {/* Share to WhatsApp — the only action on this screen. */}
        <View style={{ paddingHorizontal: rs(14), marginTop: rs(10) }}>
          <View style={colStyle}>
            <Pressable
              onPress={shareWhatsApp}
              disabled={sharing}
              accessibilityRole="button"
              accessibilityLabel="Share to WhatsApp"
              className="active:opacity-85"
              style={{ opacity: sharing ? 0.7 : 1 }}
            >
              <LinearGradient
                colors={[ACCENT, PRIMARY]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
                }}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                    <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Share to WhatsApp</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </ScrollView>

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
