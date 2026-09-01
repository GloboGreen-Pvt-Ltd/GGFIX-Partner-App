import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, Share, Linking, NativeModules, Platform,
} from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ScreenHeader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { getSession } from '../../../auth/session';
import { paymentAcrossTickets } from '../AllBooking/ReceiptCard';

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

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      {/* popToTop() only unwinds to the top of the BOOKING stack, which lands on
          the first wizard step — Back from a finished booking would restart the
          one just completed. Go to Home instead: the booking is done, so the
          wizard is not somewhere to return to. */}
      <ScreenHeader
        title=""
        onBack={() => navigation.navigate('OwnerTabs', { screen: 'Home' })}
      />
      <ScrollView contentContainerClassName="px-4 pt-2 pb-12">
        {/* Hero card — wrapped so Share Receipt can capture it as a PNG */}
        <ViewShot ref={receiptRef} options={{ format: 'png', quality: 1 }}>
        {/* No card. The white background is EXPLICIT rather than inherited:
            ViewShot captures this view for the shared receipt PNG, and without a
            fill the capture comes out transparent — which renders as black in
            most chat apps. */}
        {/* px-4, not px-1. ViewShot crops to exactly this view, so the capture
            inherits its padding — at px-1 the receipt's headings and grey boxes
            sat hard against the image edge, which reads as a badly cropped
            screenshot in a chat thread. Even margins on all four sides. */}
        <View className="px-4 py-5 mb-4" style={{ backgroundColor: '#FFFFFF' }}>
          <View className="items-center mb-5">
            <View className="rounded-full p-1.5 mb-2" style={{ backgroundColor: ACCENT_10 }}>
              <Ionicons name="checkmark-circle" size={56} color={ACCENT} />
            </View>
            <Text className="text-2xl font-extrabold" style={{ color: ACCENT }}>Thank You!</Text>
            <Text className="text-text-muted text-[12px] mt-1">Your booking has been placed.</Text>
            <View className="px-3 py-1 rounded-full mt-2" style={{ backgroundColor: ACCENT_10 }}>
              <Text className="text-[11px] font-extrabold" style={{ color: ACCENT }}>#{trackingId}</Text>
            </View>
          </View>

          <Section label="Customer Details">
            <SectionRow label="Shop Name" value={shopName || 'Your Shop'} />
            <SectionRow label="Customer Name" value={customer.name} />
            <SectionRow label="Mobile Number" value={customer.phone} />
            <SectionRow label="Address" value={customer.address} />
          </Section>

          <Section label="Device & Repair Details">
            <View className="flex-row mb-1">
              <Text className="flex-1 text-text-muted text-[10px] uppercase tracking-widest">Device</Text>
              <Text className="flex-1 text-text-muted text-[10px] uppercase tracking-widest">Repair Services</Text>
            </View>
            {devices.map((d, i) => (
              <View key={i} className="flex-row mb-1">
                <Text className="flex-1 text-text text-[12px]" numberOfLines={2}>{i + 1}. {d.modelName}</Text>
                <Text className="flex-1 text-text text-[12px]" numberOfLines={2}>
                  {(d.services || []).map((s) => s.serviceName).join(', ')}
                </Text>
              </View>
            ))}
          </Section>

          <Section label="Service Information" noMargin>
            <SectionRow label="Tracking ID" value={`#${trackingId}`} />
            <SectionRow label="Service Status" value="Order Placed" />
            <SectionRow
              label="Estimated Repair Price"
              value={`₹ ${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            />
            {/* Only when a payment was actually recorded — the same rule the
                Device Details Price Summary follows, so the receipt and the
                screen can never tell the customer two different stories. */}
            {payment ? (
              <>
                <SectionRow
                  label={payment.label}
                  value={`₹ ${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                />
                <SectionRow
                  label="Balance Amount"
                  value={`₹ ${payment.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                />
              </>
            ) : null}
          </Section>
        </View>
        </ViewShot>

        {/* Action tiles */}
        <View className="flex-row justify-between mt-2 px-1">
          <ActionTile
            icon="construct-outline"
            label="Assign Technician"
            onPress={() => navigation.navigate('AssignTechnician', { tickets, customer, devices })}
          />
          <ActionTile
            icon="share-social-outline"
            label="Share Receipt"
            onPress={() => setShareOpen(true)}
          />
          <ActionTile
            icon="qr-code-outline"
            label="Barcode Print"
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

const ACCENT = '#004C40';
const ACCENT_10 = 'rgba(0, 76, 64, 0.10)';
const SOFT = '#F8F8F8';

function Section({ label, children, noMargin }) {
  return (
    <View className={noMargin ? '' : 'mb-4'}>
      <Text className="text-text font-bold text-[13px] mb-2">{label}</Text>
      {/* Was `bg-text-muted/20` — a translucent light wash designed to read on
          the dark hero. On white it turns into a grey box. */}
      <View className="rounded-xl p-3" style={{ backgroundColor: SOFT }}>{children}</View>
    </View>
  );
}

function SectionRow({ label, value }) {
  return (
    <View className="flex-row mb-1">
      <Text className="flex-1 text-text-muted text-[11px]">{label}</Text>
      <Text className="flex-1 text-[12px] text-text font-semibold">{value || '-'}</Text>
    </View>
  );
}

function ActionTile({ icon, label, onPress }) {
  return (
    <Pressable className="items-center flex-1 mx-1 active:opacity-80" onPress={onPress}>
      {/* One colour for all three. The per-tile #7ED957/#16BB05 split had no
          meaning, and each tile's shadow was tinted to its own fill — a coloured
          glow that reads as a leftover once the fill is a single deep green. */}
      <View
        style={{ backgroundColor: ACCENT }}
        className="rounded-2xl w-14 h-14 items-center justify-center"
      >
        <Ionicons name={icon} size={26} color="#fff" />
      </View>
      <Text className="text-text text-[11px] font-bold mt-2 text-center" numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}
