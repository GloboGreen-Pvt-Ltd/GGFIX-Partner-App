import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import {
  Minus,
  Plus,
  Share2,
  Printer,
  Smartphone,
  Wrench,
  ChevronLeft,
  QrCode,
  Copy,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';

// One deep green for the whole screen, matching the rest of the app.
const ACCENT = '#004C40';
const ACCENT_10 = 'rgba(0, 76, 64, 0.10)';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

// Turn the stored device-security type/value into a human-readable line for the
// slip. Pattern values are stored as "1,2,3,6" — kept as-is so the technician
// can redraw them; PIN/password show the value inline.
function formatSecurity(type, value) {
  const t = String(type || 'NONE').toUpperCase();
  if (t === 'NONE' || !t) return 'None';
  const label =
    t === 'PIN' ? 'PIN'
    : t === 'PASSWORD' ? 'Password'
    : t === 'PATTERN' ? 'Pattern'
    : t.charAt(0) + t.slice(1).toLowerCase();
  const v = value == null ? '' : String(value).trim();
  return v ? `${label} · ${v}` : label;
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·3588549).
function splitTrackingId(id) {
  const s = String(id ?? '').replace(/^#/, '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// Escape dynamic values before dropping them into the print HTML.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function SectionHeader({ icon: Icon, label, tint = ACCENT_10, accent = ACCENT }) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: tint }}
      >
        <Icon size={14} color={accent} />
      </View>
      <Text
        className="text-[11px] font-bold tracking-widest"
        style={{ color: accent, letterSpacing: 1.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

// One labelled detail line on the right side of the slip.
function SlipField({ label, value }) {
  return (
    <View className="mb-2">
      <Text className="text-[9.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Text className="text-[12.5px] font-extrabold text-gray-900 mt-0.5" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function BarcodePrintScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [copies, setCopies] = useState(1);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  // Ref to the on-screen QR so we can rasterise it to a PNG for the print HTML.
  const qrRef = useRef(null);
  // Ref to the whole slip card so Share can rasterise it to a PNG image file.
  const slipRef = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const t = await ticketApi.get(`/tickets/${ticketId}`).catch(() => null);
      setTicket(t);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loader label="Loading QR slip..." />;

  const trackingId = ticket?.trackingId || ticketId || 'NO-ID';
  const tid = splitTrackingId(trackingId);
  const deviceName = ticket?.deviceModelName || ticket?.modelName || 'Device';
  const services = ticket?.repairServicesSummary
    || ticket?.services?.map?.((s) => s.serviceName).join(', ')
    || '—';
  const customerName = ticket?.customerName || '—';
  const security = formatSecurity(ticket?.deviceSecurityType, ticket?.deviceSecurityValue);

  // Grab the QR as a base64 PNG from the rendered <QRCode/> so it can be
  // embedded straight into the print HTML (no extra dependency needed).
  const getQrPng = () =>
    new Promise((resolve) => {
      const ref = qrRef.current;
      if (ref && typeof ref.toDataURL === 'function') {
        try { ref.toDataURL((data) => resolve(data || null)); }
        catch { resolve(null); }
      } else {
        resolve(null);
      }
    });

  const buildSlipHtml = (qrBase64) => {
    const qrCell = qrBase64
      ? `<img class="qr" src="data:image/png;base64,${qrBase64}" />`
      : `<div class="qr qr-fallback">${esc(String(trackingId).toUpperCase())}</div>`;
    const slip = `
      <div class="slip">
        ${qrCell}
        <div class="details">
          <div class="device">${esc(deviceName)}</div>
          <div class="row"><div class="label">Service No.</div><div class="value">${esc(trackingId)}</div></div>
          <div class="row"><div class="label">Customer</div><div class="value">${esc(customerName)}</div></div>
          <div class="row"><div class="label">Repair Services</div><div class="value">${esc(services)}</div></div>
          <div class="row"><div class="label">Device Security</div><div class="value">${esc(security)}</div></div>
        </div>
      </div>`;
    const slips = Array.from({ length: copies }, () => slip).join('');
    return `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact;
            font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; }
        body { margin: 0; padding: 0; color: #172117; }
        .slip { display: flex; flex-direction: row; align-items: center;
                border: 2px dashed #004C40; border-radius: 12px;
                padding: 12px; margin: 10px; page-break-inside: avoid; }
        .qr { width: 96px; height: 96px; margin-right: 14px; flex-shrink: 0; }
        .qr-fallback { display: flex; align-items: center; justify-content: center; text-align: center;
                       border: 1px solid #CBD5CB; border-radius: 8px; font-weight: 800; font-size: 11px;
                       letter-spacing: 1.5px; word-break: break-all; padding: 5px; }
        .details { flex: 1; min-width: 0; }
        .device { font-size: 12px; font-weight: 800; margin-bottom: 6px; }
        .row { margin-bottom: 5px; }
        .label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px;
                 color: #667066; font-weight: 700; }
        .value { font-size: 10px; font-weight: 800; margin-top: 2px; word-break: break-word; }
      </style></head><body>${slips}</body></html>`;
  };

  // Copy the service number to the clipboard so the shop can paste it into
  // search / chat / an invoice without retyping the tracking code.
  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(String(trackingId));
      notify('Copied', `Service number ${trackingId} copied.`, { preset: 'done' });
    } catch (e) {
      notify('Copy failed', e?.message || 'Could not copy to clipboard.');
    }
  };

  const handleShare = async () => {
    // Rasterise the slip card to a PNG and share the image file so WhatsApp,
    // Gmail, etc. attach it as a picture (not plain text). Falls back to a
    // text share on any capture / sharing failure (older builds / web).
    try {
      const uri = await captureRef(slipRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `QR Slip ${trackingId}`,
          UTI: 'public.png',
        });
        return;
      }
    } catch (_) { /* fall through to text share */ }
    const msg =
      `📦 GGFix QR Slip\n\n` +
      `Service No: ${trackingId}\n` +
      `Customer: ${customerName}\n` +
      `Device: ${deviceName}\n` +
      `Service: ${services}\n` +
      `Device Security: ${security}\n\n` +
      `Stick this slip on the device before placing it on the workbench.`;
    try {
      await Share.share({ message: msg, title: `QR Slip ${trackingId}` });
    } catch (e) {
      notify('Share failed', e?.message || 'Try again');
    }
  };

  const handlePrint = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const qrBase64 = await getQrPng();
      await Print.printAsync({ html: buildSlipHtml(qrBase64) });
    } catch (e) {
      const m = e?.message || '';
      // A user-cancelled print dialog isn't an error worth surfacing.
      if (!/cancel/i.test(m)) notify('Print failed', m || 'Could not open the printer.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Slim white header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
            QR E-Print
          </Text>
          <View
            className="px-2.5 py-1 rounded-full"
            style={{ maxWidth: 180, backgroundColor: ACCENT_10 }}
          >
            <Text className="text-[11px] font-extrabold" numberOfLines={1}>
              <Text style={{ color: '#172117' }}>#{tid.prefix}</Text>
              <Text style={{ color: ACCENT }}>{tid.digits}</Text>
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Booking summary card */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View
            className="bg-white rounded-2xl p-4 flex-row items-center"
            style={cardShadow}
          >
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mr-3"
              style={{ backgroundColor: ACCENT_10 }}
            >
              <Smartphone size={26} color={ACCENT} />
            </View>
            <View className="flex-1">
              <Text className="text-[10.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.7 }}>
                Booking
              </Text>
              <Text className="text-[15px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
                {deviceName}
              </Text>
              <Text className="text-[11.5px] text-gray-500 mt-0.5" numberOfLines={1}>
                #{trackingId}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleCopy}
              activeOpacity={0.8}
              className="px-3.5 py-2 rounded-full flex-row items-center"
              style={{ backgroundColor: ACCENT_10 }}
            >
              <Copy size={13} color={ACCENT} />
              <Text
                className="ml-1.5 text-[11px] font-extrabold tracking-wider"
                style={{ color: ACCENT, letterSpacing: 0.8 }}
              >
                COPY
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QR slip preview — left QR, right details */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={QrCode} label="QR SLIP" />
            <View
              ref={slipRef}
              collapsable={false}
              className="rounded-2xl p-3 flex-row items-center"
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: ACCENT,
              }}
            >
              {/* Left — QR code (medium) */}
              <View
                className="rounded-xl p-1.5 mr-3"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <QRCode
                  value={String(trackingId)}
                  size={120}
                  color="#172117"
                  backgroundColor="#FFFFFF"
                  getRef={(c) => { qrRef.current = c; }}
                />
              </View>

              {/* Right — details (uniform fields, balanced with the QR height) */}
              <View className="flex-1">
                <SlipField label="Service No." value={trackingId} />
                <SlipField label="Customer" value={customerName} />
                <SlipField label="Repair Services" value={services} />
                <SlipField label="Device Security" value={security} />
              </View>
            </View>
          </View>
        </View>

        {/* Copies stepper */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={Copy} label="COPIES" />
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-[13.5px] font-extrabold text-gray-900">
                  Number of copies
                </Text>
                <Text className="text-[11px] text-gray-500 mt-0.5">
                  How many slips do you want?
                </Text>
              </View>
              <View
                className="flex-row items-center rounded-full"
                style={{
                  backgroundColor: '#F0F8EF',
                  borderWidth: 1,
                  borderColor: '#C8EEBF',
                }}
              >
                <Pressable
                  onPress={() => setCopies((c) => Math.max(1, c - 1))}
                  className="h-9 w-9 rounded-full items-center justify-center active:opacity-70"
                >
                  <Minus size={14} color={ACCENT} />
                </Pressable>
                <Text
                  className="text-[15px] font-extrabold w-8 text-center"
                  style={{ color: ACCENT }}
                >
                  {copies}
                </Text>
                <Pressable
                  onPress={() => setCopies((c) => Math.min(20, c + 1))}
                  className="h-9 w-9 rounded-full items-center justify-center active:opacity-80"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Plus size={14} color="#FFFFFF" strokeWidth={3} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Hint */}
        <View className="px-4 mt-4">
          <View
            className="rounded-2xl p-3 flex-row items-start"
            style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
          >
            <View
              className="w-7 h-7 rounded-full items-center justify-center mr-2.5"
              style={{ backgroundColor: ACCENT }}
            >
              <Wrench size={13} color="#FFFFFF" />
            </View>
            <Text className="text-[11.5px] text-gray-700 flex-1 leading-4">
              Stick this slip on the device before placing it on the workbench. The QR code encodes the service number for quick scanning.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <View
        className="absolute left-0 right-0 bottom-0 flex-row px-4 pt-3"
        style={{
          paddingBottom: insets.bottom + 12,
          backgroundColor: 'rgba(240, 248, 239, 0.96)',
          borderTopWidth: 1,
          borderTopColor: '#E2E8E2',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleShare}
          className="flex-1 mr-2 rounded-2xl py-3.5 flex-row items-center justify-center"
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: ACCENT,
            ...cardShadow,
          }}
        >
          <Share2 size={16} color={ACCENT} />
          <Text className="ml-2 text-[14px] font-extrabold" style={{ color: ACCENT }}>
            Share
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handlePrint}
          disabled={printing}
          className="flex-1 ml-2"
          style={cardShadow}
        >
          <View
            style={{
              backgroundColor: ACCENT,
              borderRadius: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: printing ? 0.7 : 1,
            }}
          >
            <Printer size={16} color="#FFFFFF" />
            <Text className="ml-2 text-white text-[14px] font-extrabold">
              {printing ? 'Printing…' : 'Print'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
