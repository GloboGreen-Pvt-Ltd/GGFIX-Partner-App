import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Share, Linking, Platform } from 'react-native';
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

  // Option 1 — capture the receipt card as a PNG and open the system share
  // sheet (WhatsApp & others attach the image). Falls back to a text share.
  const shareImage = async () => {
    setShareOpen(false);
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

  // Option 2 — share the booking details as text. The bare `sms:` URL scheme
  // doesn't reliably pre-fill the body on Android (Samsung Messages drops it),
  // so we use Share.share — the text is the payload, so it always lands in the
  // SMS body (or WhatsApp text, etc.) when the user picks an app.
  const shareSms = async () => {
    setShareOpen(false);
    try {
      await Share.share({ message: buildMessage() });
    } catch (e) {
      notify('Share failed', e?.message || 'Could not open the share sheet.');
    }
  };

  return (
    <View className="flex-1 bg-background">
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
        <View className="bg-text rounded-3xl px-5 py-6 mb-4" style={{ shadowColor: '#172117', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View className="items-center mb-5">
            <View className="bg-card rounded-full p-1.5 mb-2">
              <Ionicons name="checkmark-circle" size={56} color="#16BB05" />
            </View>
            <Text className="text-success text-2xl font-extrabold">Thank You!</Text>
            <Text className="text-white text-[12px] mt-1 opacity-80">Your booking has been placed.</Text>
            <View className="bg-success/20 px-3 py-1 rounded-full mt-2">
              <Text className="text-success text-[11px] font-extrabold">#{trackingId}</Text>
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
                <Text className="flex-1 text-white text-[12px]" numberOfLines={2}>{i + 1}. {d.modelName}</Text>
                <Text className="flex-1 text-white text-[12px]" numberOfLines={2}>
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
            color="#7ED957"
            label="Assign Technician"
            onPress={() => navigation.navigate('AssignTechnician', { tickets, customer, devices })}
          />
          <ActionTile
            icon="share-social-outline"
            color="#16BB05"
            label="Share Receipt"
            onPress={() => setShareOpen(true)}
          />
          <ActionTile
            icon="qr-code-outline"
            color="#7ED957"
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
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: '#E6F7E3' }}>
                <Ionicons name="logo-whatsapp" size={20} color="#087A0A" />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-extrabold text-text">Send image to WhatsApp</Text>
                <Text className="text-[11px] text-text-muted mt-0.5">Share the receipt image (WhatsApp & more)</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CBD5CB" />
            </Pressable>

            <Pressable
              onPress={shareSms}
              className="flex-row items-center rounded-2xl p-3 active:opacity-80"
              style={{ borderWidth: 1, borderColor: '#E2E8E2' }}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: '#E6F7E3' }}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#16BB05" />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-extrabold text-text">Send details by SMS</Text>
                <Text className="text-[11px] text-text-muted mt-0.5">Share the booking details as a message</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CBD5CB" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ label, children, noMargin }) {
  return (
    <View className={noMargin ? '' : 'mb-4'}>
      <Text className="text-white font-extrabold text-[13px] mb-2">{label}</Text>
      <View className="bg-text-muted/20 rounded-xl p-3">{children}</View>
    </View>
  );
}

function SectionRow({ label, value }) {
  return (
    <View className="flex-row mb-1">
      <Text className="flex-1 text-text-muted text-[11px]">{label}</Text>
      <Text className="flex-1 text-[12px] text-white font-semibold">{value || '-'}</Text>
    </View>
  );
}

function ActionTile({ icon, color, label, onPress }) {
  return (
    <Pressable className="items-center flex-1 mx-1 active:opacity-80" onPress={onPress}>
      <View
        style={{ backgroundColor: color, shadowColor: color, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
        className="rounded-2xl w-14 h-14 items-center justify-center"
      >
        <Ionicons name={icon} size={26} color="#fff" />
      </View>
      <Text className="text-text text-[11px] font-bold mt-2 text-center" numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}
