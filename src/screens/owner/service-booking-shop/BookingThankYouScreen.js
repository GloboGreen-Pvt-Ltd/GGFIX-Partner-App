import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, Pressable, Modal, Share, Linking, NativeModules, Platform,
} from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenHeader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { getSession } from '../../../auth/session';
import { paymentAcrossTickets } from '../AllBooking/ReceiptCard';
import { rf, rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';

const ACCENT = '#004C40';       // Dark Green
const PRIMARY = '#006B57';      // Primary Green
const MINT = '#E7F7F1';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#0E1F1A';
const TEXT_SECONDARY = '#667085';
const ACCENT_10 = 'rgba(0, 76, 64, 0.10)';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

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
  const [shareOpen, setShareOpen] = useState(false);

  // The real shop name comes from the logged-in shop session, not the customer.
  const [shopName, setShopName] = useState(customer.shopName || '');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (cancelled) return;
        const name = s?.shopName || s?.activeShop?.name || s?.shops?.find?.((x) => x.isActive)?.name;
        if (name) setShopName(name);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const buildMessage = () => {
    const deviceLines = devices.map((d, i) => {
      const svcs = (d.services || []).map((s) => s.serviceName).join(', ') || '-';
      const price = (d.services || []).reduce((s, x) => s + (Number(x.price) || 0), 0);
      return `${i + 1}. ${d.modelName || 'Device'}\n   Services: ${svcs}\n   Price: ₹${price.toLocaleString('en-IN')}`;
    }).join('\n');
    return (
      `🧾 GGFix Booking Receipt\n\n` +
      `— CUSTOMER DETAILS —\n` +
      `Shop: ${shopName || 'Your Shop'}\n` +
      `Name: ${customer.name || '-'}\n` +
      `Mobile: ${customer.phone || '-'}\n` +
      (customer.address ? `Address: ${customer.address}\n` : '') +
      `\n— DEVICE & REPAIR DETAILS —\n${deviceLines}\n\n` +
      `— SERVICE INFORMATION —\n` +
      `Tracking ID: #${trackingId}\n` +
      `Service Status: Order Placed\n` +
      `Estimated Repair Price: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      (payment
        ? `${payment.label}: ₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
          `Balance Amount: ₹${payment.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`
        : '') +
      `\nTrack your repair in the GGFix app.`
    );
  };

  /**
   * Load react-native-share only if this binary actually has the native module.
   *
   * Wrapping `require` in try/catch is NOT enough, and that was a bug elsewhere
   * in this app: the library's spec calls TurboModuleRegistry.getEnforcing('RNShare')
   * at module scope, and Metro hands a module-init throw to
   * ErrorUtils.reportFatalError — a dev red screen, a production crash — instead
   * of the caller's catch. So the module must never be evaluated on a binary that
   * can't support it. `get` is the non-throwing sibling of `getEnforcing`;
   * NativeModules covers the old architecture.
   */
  const shareSingleModule = () => {
    let native = null;
    try { native = TurboModuleRegistry?.get?.('RNShare') || null; } catch (_) { native = null; }
    if (!native && !NativeModules?.RNShare) return null;
    try {
      // eslint-disable-next-line global-require
      const mod = require('react-native-share');
      return mod?.default || mod || null;
    } catch (_) {
      return null;
    }
  };

  /**
   * Option 1 — the receipt image, straight into WhatsApp.
   *
   * shareSingle fires ACTION_SEND at package com.whatsapp, so WhatsApp opens
   * with the image attached instead of a Quick Share / Telegram / Drive chooser.
   *
   * NO whatsAppNumber, deliberately. Passing it retargets
   * com.whatsapp.Conversation with a `jid` extra; that activity opens the right
   * chat but ignores EXTRA_STREAM, so the image is dropped and only text
   * arrives. One intent cannot carry both an image and a pre-addressed chat —
   * the image is the half worth keeping, and WhatsApp's own contact picker is
   * one tap.
   *
   * react-native-share is a NATIVE module, so on a binary built before it was
   * added this falls back to the system sheet rather than crashing.
   */
  const shareImage = async () => {
    setShareOpen(false);

    let base64 = null;
    try {
      base64 = await captureRef(receiptRef, { format: 'png', quality: 1, result: 'base64' });
    } catch (_) { /* handled below */ }

    const RNShare = shareSingleModule();
    if (base64 && RNShare?.shareSingle && RNShare?.Social?.WHATSAPP) {
      const payload = {
        message: buildMessage(),
        url: `data:image/png;base64,${base64}`,
        filename: `ggfix-receipt-${trackingId}`,
        type: 'image/png',
        // Load-bearing. With this false (the default) the library decodes to
        // getExternalCacheDir(), but its own FileProvider only declares
        // <external-path> and <cache-path> — the external CACHE matches neither,
        // so getUriForFile throws "Failed to find configured root".
        useInternalStorage: true,
      };
      // Plenty of shops run only WhatsApp Business, so "not installed" on the
      // consumer app should try the other before giving up.
      const targets = [RNShare.Social.WHATSAPP, RNShare.Social.WHATSAPPBUSINESS].filter(Boolean);
      let missing = 0;
      for (const social of targets) {
        try {
          await RNShare.shareSingle({ ...payload, social });
          return;
        } catch (e) {
          const msg = String(e?.message || '').toLowerCase();
          if (msg.includes('cancel')) return;          // a decision, not a failure
          if (msg.includes('not installed') || msg.includes('no app')) { missing += 1; continue; }
          break;
        }
      }
      if (missing === targets.length) {
        notify('WhatsApp not found', 'Neither WhatsApp nor WhatsApp Business is installed.');
        return;
      }
    }

    // Fallback: system sheet with the image (an un-rebuilt binary, or capture
    // failed). Still sends the receipt; just asks which app first.
    try {
      const uri = await captureRef(receiptRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Booking #${trackingId}`, UTI: 'public.png' });
        return;
      }
    } catch (_) { /* fall through */ }
    try {
      await Share.share({ message: buildMessage(), title: `Booking #${trackingId}` });
    } catch (e) {
      notify('Share failed', e?.message || 'Could not open share sheet');
    }
  };

  /**
   * Option 2 — text only, straight into the messaging app.
   *
   * `sms:` opens Messages directly with the customer's number and the body
   * pre-filled, which is what was asked for. The separator differs by platform:
   * iOS wants `&body=`, Android `?body=`.
   *
   * KNOWN LIMIT, and the reason this used to be a Share.share: a few Android
   * OEM messaging apps (Samsung Messages among them) ignore the body extra, so
   * the compose window can open addressed but empty. The share sheet always
   * carried the text but made the user pick an app first. Direct is the ask, so
   * direct it is — and if there is no SMS handler at all we fall back rather
   * than dead-end.
   */
  const shareSms = async () => {
    setShareOpen(false);
    const body = encodeURIComponent(buildMessage());
    const number = String(customer.phone || '').replace(/[^\d+]/g, '');
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${number}${sep}body=${body}`;
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch (_) { /* fall through */ }
    try {
      await Share.share({ message: buildMessage() });
    } catch (e) {
      notify('Share failed', e?.message || 'Could not open the messaging app.');
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

  // Same destination the "Assign Technician" action tile already uses — the
  // confirmation banner is a second, larger entry point to it, not a new one.
  const goToAssignTechnician = () => navigation.navigate('AssignTechnician', { tickets, customer, devices });

  const r = useResponsive();
  // Tablet / large-screen: cap the column and centre it, same convention as
  // the other booking-flow screens.
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 960), alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: '#F8FAF9' }}>
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
            <Text style={{ fontSize: rf(8.5), fontWeight: '800', letterSpacing: 1, color: ACCENT }}>REPAIR TODAY</Text>
            <Text style={{ fontSize: rf(8.5), fontWeight: '700', letterSpacing: 0.5, color: TEXT_SECONDARY }}>A BRIGHTER TOMORROW</Text>
          </View>
        )}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: rs(48) }}>
        {/* Hero card — wrapped so Share Receipt can capture it as a PNG.
            Everything inside ViewShot is what gets shared; the confirmation
            banner and action tiles below stay outside it on purpose. */}
        <ViewShot ref={receiptRef} options={{ format: 'png', quality: 1 }}>
        {/* No transparency anywhere in this tree — ViewShot captures this
            view for the shared receipt PNG, and a transparent fill renders
            as black in most chat apps. The mint gradient is a real opaque
            fill, so that constraint still holds. */}
        <LinearGradient
          colors={['#E7F7F1', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(20) }}
        >
          <View style={colStyle}>
            <View className="items-center" style={{ marginBottom: rs(20) }}>
              <View style={{ width: rs(96), height: rs(96) }}>
                {/* Small sparkle accents — restrained, not an animated
                    confetti system (spec explicitly asks to avoid heavy
                    animation). */}
                <Ionicons name="sparkles" size={rf(14)} color="#F59E0B" style={{ position: 'absolute', left: -rs(6), top: rs(6) }} />
                <Ionicons name="sparkles" size={rf(10)} color={ACCENT} style={{ position: 'absolute', right: -rs(2), top: rs(2) }} />
                <Ionicons name="sparkles-outline" size={rf(11)} color="#00A86B" style={{ position: 'absolute', right: rs(2), bottom: rs(2) }} />
                <View
                  className="items-center justify-center"
                  style={{ position: 'absolute', left: rs(8), top: rs(8), height: rs(80), width: rs(80), borderRadius: rs(40), backgroundColor: MINT }}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      height: rs(62), width: rs(62), borderRadius: rs(31), backgroundColor: ACCENT,
                      shadowColor: ACCENT, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5,
                    }}
                  >
                    <Ionicons name="checkmark" size={rf(32)} color="#FFFFFF" />
                  </View>
                </View>
              </View>
              <Text className="font-extrabold" style={{ fontSize: rf(27), color: ACCENT, marginTop: rs(12) }}>Thank You!</Text>
              <Text style={{ fontSize: rf(12.5), color: TEXT_SECONDARY, marginTop: rs(3) }}>Your booking has been placed.</Text>
              <Pressable
                onPress={copyTrackingId}
                className="flex-row items-center active:opacity-80"
                style={{
                  borderRadius: 999, paddingHorizontal: rs(14), paddingVertical: rs(8), marginTop: rs(12),
                  backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER,
                  shadowColor: '#0B1F14', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
                }}
              >
                <Ionicons name="pricetag-outline" size={rf(13)} color={ACCENT} />
                <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: ACCENT, marginLeft: rs(6) }}>#{trackingId}</Text>
                <View style={{ width: 1, height: rs(14), backgroundColor: BORDER, marginHorizontal: rs(8) }} />
                <Ionicons name="copy-outline" size={rf(13)} color={TEXT_SECONDARY} />
              </Pressable>
            </View>

          <Section label="Customer Details" right="OUR VALUED CUSTOMER">
            <SectionRow icon="storefront-outline" label="Shop Name" value={shopName || 'Your Shop'} />
            {/* Hardcoded per explicit instruction ("for now display this
                exact shop number") — not derived from any session/customer
                data, and intentionally a separate row from the customer's
                own Mobile Number below. */}
            <SectionRow icon="call-outline" label="Shop Number" value="9500824814" />
            <SectionRow icon="person-outline" label="Customer Name" value={customer.name} />
            <SectionRow icon="call-outline" label="Mobile Number" value={customer.phone} />
            <SectionRow icon="location-outline" label="Address" value={customer.address} />
          </Section>

          <Section label="Device & Repair Details" right="GETTING YOU FIXED">
            {devices.map((d, i) => (
              <View
                key={i}
                className="flex-row items-center"
                style={{ marginBottom: i === devices.length - 1 ? 0 : rs(10), paddingBottom: i === devices.length - 1 ? 0 : rs(10), borderBottomWidth: i === devices.length - 1 ? 0 : 1, borderBottomColor: BORDER }}
              >
                <View className="flex-1">
                  <Text style={{ fontSize: rf(9.5), fontWeight: '700', letterSpacing: 0.5, color: TEXT_SECONDARY }}>DEVICE</Text>
                  <View className="flex-row items-center" style={{ marginTop: rs(4) }}>
                    <View
                      className="items-center justify-center overflow-hidden"
                      style={{ height: rs(34), width: rs(34), borderRadius: rs(10), marginRight: rs(8), backgroundColor: MINT }}
                    >
                      {d.imageUrl ? (
                        <Image source={{ uri: d.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Ionicons name="phone-portrait-outline" size={rf(15)} color={ACCENT} />
                      )}
                    </View>
                    <Text className="flex-1 text-text font-bold" style={{ fontSize: rf(12.5) }} numberOfLines={1}>
                      {devices.length > 1 ? `${i + 1}. ` : ''}{d.modelName || 'Device'}
                    </Text>
                  </View>
                </View>
                <View style={{ width: 1, height: rs(38), backgroundColor: BORDER, marginHorizontal: rs(12) }} />
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Ionicons name="build-outline" size={rf(11)} color={ACCENT} />
                    <Text style={{ fontSize: rf(9.5), fontWeight: '700', letterSpacing: 0.5, color: TEXT_SECONDARY, marginLeft: rs(4) }}>REPAIR SERVICES</Text>
                  </View>
                  <Text className="text-text font-bold" style={{ fontSize: rf(12.5), marginTop: rs(4) }} numberOfLines={2}>
                    {(d.services || []).map((s) => s.serviceName).join(', ') || '—'}
                  </Text>
                </View>
              </View>
            ))}
          </Section>

          <Section label="Service Information" right="TRACK YOUR REPAIR" noMargin>
            <SectionRow icon="pricetag-outline" label="Tracking ID" value={`#${trackingId}`} bold />
            <View className="flex-row items-center" style={{ marginBottom: rs(11) }}>
              <View className="flex-row items-center" style={{ width: rs(112) }}>
                <Ionicons name="time-outline" size={rf(13)} color={ACCENT} style={{ marginRight: rs(6) }} />
                <Text style={{ fontSize: rf(10.5), fontWeight: '600', color: TEXT_SECONDARY }}>Status</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <View className="rounded-full" style={{ paddingHorizontal: rs(10), paddingVertical: rs(4), backgroundColor: MINT, borderWidth: 1, borderColor: BORDER }}>
                  <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: ACCENT }}>Order Placed</Text>
                </View>
              </View>
            </View>
            <SectionRow
              icon="cash-outline"
              label="Estimated Repair Price"
              value={`₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            />
            {/* Only when a payment was actually recorded — the same rule the
                Device Details Price Summary follows, so the receipt and the
                screen can never tell the customer two different stories. */}
            {payment ? (
              <>
                <SectionRow
                  icon="checkmark-done-outline"
                  label={payment.label}
                  value={`₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                />
                <SectionRow
                  icon="wallet-outline"
                  label="Balance Amount"
                  value={`₹${payment.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  last
                />
              </>
            ) : null}
          </Section>
          </View>
        </LinearGradient>
        </ViewShot>

        {/* ── Confirmation banner — same destination as the "Assign
            Technician" tile below, not a new route. ────────────────────── */}
        <View style={{ paddingHorizontal: rs(16), marginTop: rs(14) }}>
          <View style={colStyle}>
            <Pressable
              onPress={goToAssignTechnician}
              className="flex-row items-center active:opacity-85"
              style={{
                borderRadius: rs(16), padding: rs(11), backgroundColor: MINT, borderWidth: 1, borderColor: BORDER,
                shadowColor: '#0B1F14', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
              }}
            >
              <View
                className="items-center justify-center"
                style={{ height: rs(38), width: rs(38), borderRadius: rs(13), marginRight: rs(11), backgroundColor: ACCENT }}
              >
                <Ionicons name="checkmark-circle-outline" size={rf(19)} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold" style={{ fontSize: rf(13), color: ACCENT }}>Booking confirmed!</Text>
                <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={2}>
                  Your request is ready for technician assignment.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={rf(18)} color={ACCENT} />
            </Pressable>
          </View>
        </View>

        {/* Action tiles */}
        <View className="flex-row justify-between" style={[{ paddingHorizontal: rs(16), marginTop: rs(14) }, colStyle]}>
          <ActionTile
            icon="construct-outline"
            label="Assign Technician"
            sub="HANDOVER TO EXPERT"
            onPress={goToAssignTechnician}
          />
          <ActionTile
            icon="share-social-outline"
            label="Share Receipt"
            sub="SHARE BOOKING DETAILS"
            onPress={() => setShareOpen(true)}
          />
          <ActionTile
            icon="qr-code-outline"
            label="Barcode Print"
            sub="PRINT BOOKING SLIP"
            onPress={() => {
              const tid = tickets[0]?.id;
              if (tid) navigation.navigate('BarcodePrint', { ticketId: tid });
              else navigation.navigate('ScanQrCode');
            }}
          />
        </View>
      </ScrollView>

      {/* Share Receipt chooser */}
      <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(23, 33, 23, 0.5)', justifyContent: 'flex-end' }}
          onPress={() => setShareOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 }}
          >
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: '#E2E8E2', marginBottom: 14 }} />
            <Text className="text-[15px] font-extrabold text-text mb-3">Share Receipt</Text>

            <Pressable
              onPress={shareImage}
              className="flex-row items-center rounded-2xl p-3 mb-2.5 active:opacity-80"
              style={{ borderWidth: 1, borderColor: '#E2E8E2' }}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: ACCENT_10 }}>
                <Ionicons name="logo-whatsapp" size={20} color={ACCENT} />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-extrabold text-text">Send image to WhatsApp</Text>
                <Text className="text-[11px] text-text-muted mt-0.5">Opens WhatsApp with the receipt image</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CBD5CB" />
            </Pressable>

            <Pressable
              onPress={shareSms}
              className="flex-row items-center rounded-2xl p-3 active:opacity-80"
              style={{ borderWidth: 1, borderColor: '#E2E8E2' }}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: ACCENT_10 }}>
                <Ionicons name="chatbubble-ellipses" size={20} color={ACCENT} />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-extrabold text-text">Send details by SMS</Text>
                <Text className="text-[11px] text-text-muted mt-0.5">Opens Messages with the details as text</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CBD5CB" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ label, right, children, noMargin }) {
  return (
    <View style={{ marginBottom: noMargin ? 0 : rs(18) }}>
      <View className="flex-row items-center" style={{ marginBottom: rs(9) }}>
        <View style={{ width: rs(3), height: rs(13), borderRadius: 2, backgroundColor: ACCENT, marginRight: rs(7) }} />
        <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: TEXT_PRIMARY }}>{label}</Text>
        <View className="flex-1" />
        {right ? (
          <View className="rounded-full" style={{ paddingHorizontal: rs(8), paddingVertical: rs(3), backgroundColor: MINT }}>
            <Text style={{ fontSize: rf(8.5), fontWeight: '800', letterSpacing: 0.6, color: ACCENT }} numberOfLines={1}>
              {right}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          borderRadius: rs(16), padding: rs(11), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, ...cardShadow,
        }}
      >
        {children}
      </View>
    </View>
  );
}

// Fixed-width LEFT column (icon + label) and a `flex: 1` RIGHT column for the
// value, both top-aligned. Previously the label carried `flex: 1` itself,
// which made it (not the value) claim the row's free space — squeezing a long
// value like an address down to a sliver and forcing it to wrap into tiny
// awkward lines. A true two-column split fixes that: the value column always
// gets the full remaining width to wrap into, no matter how long it is.
function SectionRow({ icon, label, value, bold, last }) {
  return (
    <View className="flex-row" style={{ alignItems: 'flex-start', marginBottom: last ? 0 : rs(11) }}>
      <View className="flex-row items-center" style={{ width: rs(112) }}>
        {icon ? <Ionicons name={icon} size={rf(13)} color={ACCENT} style={{ marginRight: rs(6) }} /> : null}
        <Text style={{ flex: 1, fontSize: rf(10.5), fontWeight: '600', color: TEXT_SECONDARY, lineHeight: rf(14) }} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text
        style={{ flex: 1, fontSize: rf(12.5), color: TEXT_PRIMARY, fontWeight: bold ? '800' : '700', textAlign: 'left', lineHeight: rf(17) }}
      >
        {value || '—'}
      </Text>
    </View>
  );
}

function ActionTile({ icon, label, sub, onPress }) {
  return (
    <Pressable style={{ flex: 1, marginHorizontal: rs(4) }} className="active:opacity-85" onPress={onPress}>
      <LinearGradient
        colors={[PRIMARY, ACCENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: rs(18), paddingVertical: rs(14), paddingHorizontal: rs(8), alignItems: 'center',
          shadowColor: ACCENT, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
        }}
      >
        <View
          className="items-center justify-center"
          style={{ height: rs(38), width: rs(38), borderRadius: rs(13), backgroundColor: 'rgba(255,255,255,0.18)' }}
        >
          <Ionicons name={icon} size={rf(19)} color="#fff" />
        </View>
        <Text className="text-white font-extrabold text-center" style={{ fontSize: rf(11.5), marginTop: rs(8) }} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={{ fontSize: rf(8), fontWeight: '700', letterSpacing: 0.3, color: 'rgba(255,255,255,0.75)', marginTop: rs(2) }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={rf(13)} color="rgba(255,255,255,0.75)" style={{ marginTop: rs(4) }} />
      </LinearGradient>
    </Pressable>
  );
}
