import React, { useMemo, useRef } from 'react';
import { View, Text, ScrollView, Image, Pressable, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Card } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { uploadMedia } from '../../../api/masterData';

const APP_LINK = 'https://ggfix.app';

export default function BookingSuccessfulScreen({ navigation, route }) {
  const { tickets = [], devices = [], customer = {} } = route?.params || {};

  const goHome = () => {
    try {
      navigation.popToTop();
    } catch (_) {}
    try {
      navigation.navigate('Home');
    } catch (_) {}
  };
  const t0 = tickets[0] || {};
  const primaryTracking = t0.trackingId || 'CSPEN00000000';
  const trackingId = primaryTracking; // used for capture/share filenames
  // Render EVERY device booked (a booking can contain more than one), not just
  // the first — the receipt and totals must reflect the whole booking.
  const deviceList = devices.length ? devices : [{}];
  const totalFor = (dev) => (dev.services || []).reduce((s, x) => s + (Number(x.price) || 0), 0);
  const grandTotal = deviceList.reduce((s, dev) => s + totalFor(dev), 0);
  const trackingFor = (i) => tickets[i]?.trackingId || (i === 0 ? primaryTracking : null);
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });

  // Pretty-print an Instant/ISO string from the DB ticket as a fallback when the
  // local device record didn't carry the display strings (e.g. older bookings).
  const fmtInstant = (iso) => {
    if (!iso) return null;
    try {
      const dt = new Date(iso);
      if (isNaN(dt.getTime())) return null;
      return `${dt.toDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    } catch { return null; }
  };
  const allTracks = deviceList.map((_, i) => trackingFor(i)).filter(Boolean);
  const trackingLine = allTracks.map((t) => `#${t}`).join(', ');

  const receiptRef = useRef(null);

  // Use the ViewShot wrapper's own capture() — handles web correctly (captureRef
  // on a plain View ref throws "findNodeHandle failed to resolve view" on web).
  const capture = async () => {
    if (!receiptRef.current || typeof receiptRef.current.capture !== 'function') {
      throw new Error('Nothing to capture');
    }
    return await receiptRef.current.capture();
  };

  const buildText = (imgUrl) => {
    const names = deviceList.map((dev) => dev.modelName).filter(Boolean);
    const lines = [
      `Booking confirmed${customer.name ? ` for ${customer.name}` : ''}.`,
      trackingLine ? `Tracking: ${trackingLine}` : null,
      names.length ? `Device${names.length > 1 ? 's' : ''}: ${names.join(', ')}` : null,
      `Total: ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      imgUrl ? `Receipt: ${imgUrl}` : null,
      `Track in app: ${APP_LINK}`,
    ].filter(Boolean);
    return lines.join('\n');
  };

  // Web (and Sharing-not-available) fallback: open wa.me with text + receipt URL,
  // so WhatsApp shows the image as a link preview when sent.
  const shareTextWhatsApp = async (imgUrl) => {
    const text = buildText(imgUrl);
    const phone = (customer.phone || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
    } catch (_) {
      notify('Could not open WhatsApp', 'Install WhatsApp or copy the message manually.');
    }
  };

  const shareWhatsApp = async () => {
    let uri = null;
    try {
      uri = await capture();
    } catch (_) {
      // Silent — we fall back to the text/URL share below.
    }

    // --- Web: try the browser's Web Share API with an actual File. This is the
    // only way to attach the image into WhatsApp Web/Desktop from the browser.
    if (uri && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      try {
        const blob = await (await fetch(uri)).blob();
        const file = new File([blob], `receipt-${trackingId}.png`, { type: 'image/png' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Receipt ${trackingId}`, text: buildText('') });
          return;
        }
      } catch (_) { /* user cancelled or browser refused — fall through */ }
    }

    // --- Native: open system share sheet with the PNG file. User picks WhatsApp.
    if (uri && Platform.OS !== 'web') {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Receipt ${trackingId}`,
            UTI: 'public.png',
          });
          return;
        }
      } catch (_) { /* fall through */ }
    }

    // --- Final fallback: upload the image and open wa.me so the receipt URL
    // becomes a link-preview card in the WhatsApp message.
    let uploadedUrl = '';
    if (uri) {
      try {
        uploadedUrl = await uploadMedia({ uri, fileName: `receipt-${trackingId}.png`, mimeType: 'image/png' }, 'receipts');
      } catch (e) {
        notify('Upload failed', e?.message || 'Could not upload receipt image');
      }
    }
    await shareTextWhatsApp(uploadedUrl);
  };

  const shareSMS = async () => {
    try {
      let imgUrl = '';
      try {
        const uri = await capture();
        imgUrl = await uploadMedia({ uri, fileName: `receipt-${trackingId}.png`, mimeType: 'image/png' }, 'receipts');
      } catch (_) { /* fall back to text-only SMS */ }
      const lines = [
        `Hi${customer.name ? ' ' + customer.name : ''}, your repair booking is confirmed.`,
        `Tracking: ${trackingLine || '#' + trackingId}`,
        imgUrl ? `Receipt: ${imgUrl}` : null,
        `Track in app: ${APP_LINK}`,
      ].filter(Boolean);
      const body = lines.join('\n');
      const sep = Platform.OS === 'ios' ? '&' : '?';
      const url = `sms:${customer.phone || ''}${sep}body=${encodeURIComponent(body)}`;
      const can = await Linking.canOpenURL(url);
      if (!can) { notify('SMS not available', 'Cannot open SMS on this device.'); return; }
      await Linking.openURL(url);
    } catch (e) {
      notify('Send failed', e?.message || 'Try again');
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="bg-card px-3 py-3 flex-row items-center border-b border-border">
        <Pressable
          onPress={goHome}
          className="w-9 h-9 rounded-full items-center justify-center mr-2 active:opacity-70"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#172117" />
        </Pressable>
        <View className="w-9 h-9 rounded-full bg-success/10 items-center justify-center mr-2">
          <Ionicons name="checkmark-circle" size={20} color="#16BB05" />
        </View>
        <View className="flex-1">
          <Text className="font-extrabold text-text text-[14px]">Booking Successful</Text>
          <Text className="text-[10px] text-text-muted mt-0.5">{time} on {date}</Text>
        </View>
        <View className="bg-success/10 px-2 py-1 rounded-full">
          <Text className="text-[10px] font-bold text-success">CONFIRMED</Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="px-4 pt-3 pb-32">
        <ViewShot
          ref={receiptRef}
          options={{ format: 'png', quality: 0.95, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' }}
        >
          <Card className="p-0 overflow-hidden">
            {/* Customer (once for the whole booking) */}
            {(customer.name || customer.phone) ? (
              <View className="px-3 py-2.5 border-b border-border">
                <Text className="text-[11px] font-extrabold text-text-muted uppercase tracking-widest mb-1.5">Customer Details</Text>
                {customer.name ? <Row label="Name" value={customer.name} /> : null}
                {customer.phone ? <Row label="Mobile Number" value={customer.phone} /> : null}
              </View>
            ) : null}

            {/* One section per device in the booking */}
            {deviceList.map((dev, di) => {
              const sub = totalFor(dev);
              const track = trackingFor(di);
              const estAt = dev.estimatedAt || fmtInstant(tickets[di]?.estimatedReadyAt) || '-';
              const estDel = dev.estimatedDelivery || fmtInstant(tickets[di]?.estimatedDeliveryAt) || '-';
              return (
                <View key={di} className={di > 0 ? 'border-t-8 border-background' : ''}>
                  {/* Device header */}
                  <View className="flex-row items-center px-3 py-2.5 border-b border-border">
                    <View className="w-11 h-12 bg-border rounded-md overflow-hidden items-center justify-center">
                      {dev.imageUrl ? (
                        <Image source={{ uri: dev.imageUrl }} style={{ width: 44, height: 48 }} resizeMode="cover" />
                      ) : (
                        <Ionicons name="phone-portrait-outline" size={20} color="#667066" />
                      )}
                    </View>
                    <View className="ml-2.5 flex-1">
                      <Text className="text-[10px] text-text-muted">Tracking ID</Text>
                      <Text className="text-[13px] font-extrabold text-primary">#{track || '—'}</Text>
                      <Text className="text-[11px] text-text mt-0.5" numberOfLines={1}>
                        {dev.modelName}{dev.ramLabel ? ` · ${dev.ramLabel}` : ''}{dev.storageLabel ? ` · ${dev.storageLabel}` : ''}{dev.color ? ` · ${dev.color}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Services */}
                  <View className="px-3 py-2.5 border-b border-border">
                    <Text className="text-[11px] font-extrabold text-text-muted uppercase tracking-widest mb-1.5">Price Summary</Text>
                    {(dev.services || []).map((s, i) => (
                      <View key={i} className="flex-row items-center my-0.5">
                        <View className="w-5 h-5 bg-background rounded items-center justify-center mr-2">
                          <Text className="text-text text-[10px] font-bold">{i + 1}</Text>
                        </View>
                        <Text className="flex-1 text-text text-[12px]" numberOfLines={1}>{s.serviceName}</Text>
                        <Text className="font-bold text-text text-[12px]">₹{Number(s.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </View>
                    ))}
                    <View className="border-t border-border mt-1.5 pt-1.5 flex-row items-center">
                      <Text className="flex-1 font-extrabold text-text text-[12px]">Estimated Repair Amount</Text>
                      <Text className="font-extrabold text-primary text-[13px]">₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                    </View>
                  </View>

                  {/* Info */}
                  <View className="px-3 py-2.5 border-b border-border">
                    <Text className="text-[11px] font-extrabold text-text-muted uppercase tracking-widest mb-1.5">Service Info</Text>
                    {dev.complaint ? (
                      <View className="mb-1.5">
                        <Text className="text-[11px] text-text-muted">Complaint</Text>
                        <Text className="text-[12px] text-text">{dev.complaint}</Text>
                      </View>
                    ) : null}
                    <Row label="Estimated Time" value={estAt} />
                    <Row label="Delivery Date" value={estDel} />
                    <View className="flex-row items-center mt-1">
                      <Text className="flex-1 text-[11px] text-text-muted">Repair Approval</Text>
                      <View className="flex-row items-center">
                        <Ionicons name="checkmark-circle" size={12} color="#16BB05" />
                        <Text className="text-[12px] font-bold text-success ml-1">Done</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Grand total across all devices */}
            {deviceList.length > 1 ? (
              <View className="px-3 py-3 flex-row items-center">
                <Text className="flex-1 font-extrabold text-text text-[13px]">Grand Total · {deviceList.length} devices</Text>
                <Text className="font-extrabold text-primary text-[15px]">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
            ) : null}
          </Card>
        </ViewShot>
      </ScrollView>

      {/* Share actions */}
      <View className="absolute left-0 right-0 bottom-0 px-3 py-3 bg-card border-t border-border flex-row" style={{ shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Pressable
          onPress={shareWhatsApp}
          className="flex-1 mr-2 rounded-xl bg-success py-3 flex-row items-center justify-center active:opacity-80"
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text className="text-white font-extrabold text-[13px] ml-2">Share Image</Text>
        </Pressable>
        <Pressable
          onPress={shareSMS}
          className="flex-1 rounded-xl bg-secondary py-3 flex-row items-center justify-center active:opacity-80"
        >
          <Ionicons name="chatbubble-outline" size={18} color="#fff" />
          <Text className="text-white font-extrabold text-[13px] ml-2">Send SMS</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View className="flex-row mt-1">
      <Text className="flex-1 text-[11px] text-text-muted">{label}</Text>
      <Text className="text-[12px] text-text font-semibold">{value}</Text>
    </View>
  );
}
