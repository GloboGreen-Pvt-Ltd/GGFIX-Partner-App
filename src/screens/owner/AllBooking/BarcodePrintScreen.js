import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Printer,
  Smartphone,
  Wrench,
  ChevronLeft,
  QrCode,
  Copy,
  Hash,
  User,
  Lock,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';
import { getModelsByBrand } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';
import { rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import LabelPreview from './LabelPreview';
import PrinterConnectSheet from './PrinterConnectSheet';
import { useLabelPreset } from '../../../services/printer/useLabelPreset';
import { presetSizeText } from '../../../services/printer/labelPresets';
import { specDisplayParts } from '../../../utils/deviceSpecs';

// GGFIX palette — green #09AD2A, ink #1E1E1E, white, neutrals #F8F8F8/#F3F3F3
// (same as Home / Buy and the Print QR Label sheet).
const ACCENT = '#09AD2A';       // GGFIX green — icons, chips, accents
const PRIMARY = '#078F23';      // deeper green — gradient partner on Print QR Slip
const MINT = '#EAF8EC';         // light green tint
const SOFT_MINT = '#F3F3F3';
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E6E6E6';
const TEXT_PRIMARY = '#1E1E1E';
const TEXT_SECONDARY = '#6B6B6B';

const cardShadow = {
  shadowColor: '#1E1E1E',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const card = {
  backgroundColor: CARD_BG,
  borderRadius: 18,
  padding: 12,
  borderWidth: 1,
  borderColor: '#F3F3F3',
  ...cardShadow,
};

// Booking-card detail line: icon + label left, full value right (wraps, never
// truncates).
function DetailRow({ icon: Icon, label, children, isLast }) {
  return (
    <View
      className="flex-row items-center"
      style={{ paddingVertical: 7, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#F3F3F3' }}
    >
      <View className="items-center justify-center" style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: MINT, marginRight: 8 }}>
        <Icon size={11} color={ACCENT} />
      </View>
      <Text style={{ width: 78, fontSize: 11, color: TEXT_SECONDARY, fontWeight: '600' }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

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

// "Booked on" stamp for the slip's Created On field — e.g. "Mon, 21 Sep 2024" /
// "5:57 PM" as two lines, same split the reference shows.
function fmtCreatedOn(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date: `${wd}, ${d.getDate()} ${mo} ${d.getFullYear()}`, time };
}

// Label media size comes from the Page Setup preset the shop picked on the
// Print QR Label sheet (src/services/printer/labelPresets.js — BarCode
// 38.0 x 25.0mm by default, or BarCode1 50.0 x 25.0mm), never an arbitrary
// size: feeding the print CSS anything other than the printer driver's own
// stock makes Chrome fall back to the driver's default media, which is what
// produced the multi-page, oversized-QR print bug. The on-screen "Print Size"
// picker that used to sit next to Number of Copies offered 58mm/80mm and
// never actually drove this — it's been removed entirely.

// expo-print's web implementation (node_modules/expo-print/build/ExponentPrint.web.js)
// is a stub that ignores the `html` option entirely and just calls
// `window.print()` on whatever page is currently open — on this screen that
// prints the WHOLE app (scrollable content + the Share/Print action bar,
// whose icons blow up to fill the page) across several sheets instead of the
// slip. Render the slip HTML into a detached hidden iframe and print that
// instead, so only the slip content reaches the browser's print dialog.
function printHtmlOnWeb(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      iframe.remove();
      resolve();
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      win.focus();
      win.print();
      // `afterprint` fires once the print dialog closes (printed or
      // cancelled) — remove the iframe then. Some browsers never fire it
      // reliably, so back it up with a timeout.
      win.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 60000);
    };
    iframe.srcdoc = html;
  });
}

// Escape dynamic values before dropping them into the print HTML.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function BarcodePrintScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  // The Number of Copies / Print Size settings row was removed from this
  // screen — always print exactly one label per request now.
  const copies = 1;
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  // Android has a real Bluetooth thermal-printer path (modules/ggfix-printer)
  // — "Print QR Slip" opens this sheet there instead of the browser/expo-print
  // flow below, which stays only for web/iOS (see handlePrint).
  const [printerSheetOpen, setPrinterSheetOpen] = useState(false);
  // Page Setup label size — shared with PrinterConnectSheet, where it's picked.
  const [labelPreset] = useLabelPreset();
  // Ref to the on-screen QR so we can rasterise it to a PNG for the print HTML.
  const qrRef = useRef(null);
  // The model's catalogue photo, for bookings without a deviceImageUrl — the
  // same fallback Home and Device Details use.
  const [modelImage, setModelImage] = useState(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const t = await ticketApi.get(`/tickets/${ticketId}`).catch(() => null);
      setTicket(t);
      if (t && !t.deviceImageUrl && t.brandId && t.modelId) {
        getModelsByBrand(t.brandId)
          .then((models) => {
            const m = (models || []).find((x) => x.id === t.modelId);
            const url = resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
            if (url) setModelImage(url);
          })
          .catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loader label="Loading QR slip..." />;

  const trackingId = ticket?.trackingId || ticketId || 'NO-ID';
  const tid = splitTrackingId(trackingId);
  // deviceDisplayName has to be checked first — same priority TicketDetailScreen.js
  // uses for this same GET /tickets/:id response; deviceModelName/modelName are
  // often unpopulated on a ticket record (see BookingHistoryScreen.js's own note),
  // which is why this screen was showing the bare 'Device' fallback.
  const deviceName = ticket?.deviceDisplayName || ticket?.deviceModelName || ticket?.modelName || 'Device';
  // The label/print only has room for "Brand Model" (per spec), but
  // deviceDisplayName can be a longer "Name · Model No. · Storage" compound
  // string (the app's own " · " join convention, e.g. formatSecurity above,
  // _modelNumber/_ramStorage in BookingHistoryScreen.js) — keep only the
  // first segment there so it doesn't truncate mid-token ("...A2…"). The
  // Booking summary card below still shows the full `deviceName`, unchanged.
  const brandModel = String(deviceName).split(' · ')[0].trim() || deviceName;
  // Same field TicketDetailScreen.js reads off this same GET /tickets/:id
  // response (raw, no catalog-image normalization — that's only needed for
  // master_models' own .avif catalog images, not this ticket-level field).
  const deviceImageUrl = ticket?.deviceImageUrl || modelImage || null;
  const variant = specDisplayParts(ticket, { withColor: true }).join(' · ');
  const services = ticket?.repairServicesSummary
    || ticket?.services?.map?.((s) => s.serviceName).join(', ')
    || '—';
  const customerName = ticket?.customerName || '—';
  // Same field TicketDetailScreen.js reads off this same GET /tickets/:id response.
  const customerPhone = ticket?.customerPhone || '';
  const security = formatSecurity(ticket?.deviceSecurityType, ticket?.deviceSecurityValue);
  // Real count, not a fabricated one — from the services array when the API
  // returns one, else the number of comma-separated items already in the
  // summary string.
  const serviceCount = Array.isArray(ticket?.services) && ticket.services.length
    ? ticket.services.length
    : String(ticket?.repairServicesSummary || '').split(',').map((s) => s.trim()).filter(Boolean).length;
  const serviceCountLabel = serviceCount > 0
    ? `${serviceCount} service${serviceCount === 1 ? '' : 's'} added`
    : null;
  const createdOn = fmtCreatedOn(ticket?.createdAt);

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

  // Builds the physical print document: ONE <div class="label"> per copy,
  // each sized to exactly the Page Setup preset's width x height (the target
  // printer's real die-cut stock). No headings anywhere — same content/order
  // as the Bluetooth path (src/services/printer/tspl.js) and the on-screen
  // LabelPreview: service number centered on top, QR + brand/customer/
  // security on the right in the main row, created-on centered on the
  // bottom. Each extra copy is its own forced page (`page-break-before`) —
  // one physical label per page, since the printer advances the stock by one
  // label per print page, not per print job. This path is web/iOS-only
  // debugging fallback (see handlePrint) — Android prints via the real
  // Bluetooth flow instead.
  // Tiny inline SVG (not an icon font — no external/network resource for the
  // print pipeline to fail on) for the details rows. Minimalist outline
  // glyphs, pure black, sized in the markup via the .icon CSS class below.
  const ICON_DEVICE = '<svg viewBox="0 0 24 24" class="icon"><rect x="7" y="2" width="10" height="20" rx="2" fill="none" stroke="#000" stroke-width="2"/><line x1="10" y1="18" x2="14" y2="18" stroke="#000" stroke-width="2"/></svg>';
  const ICON_CUSTOMER = '<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="8" r="4" fill="#000"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="#000"/></svg>';
  const ICON_NOTE = '<svg viewBox="0 0 24 24" class="icon"><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="#000" stroke-width="2"/><line x1="7.5" y1="8" x2="16.5" y2="8" stroke="#000" stroke-width="1.6"/><line x1="7.5" y1="12" x2="16.5" y2="12" stroke="#000" stroke-width="1.6"/><line x1="7.5" y1="16" x2="13" y2="16" stroke="#000" stroke-width="1.6"/></svg>';
  const ICON_PHONE = '<svg viewBox="0 0 24 24" class="icon"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1v3.4c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.2 1.1L6.6 10.8z" fill="#000"/></svg>';

  const buildSlipHtml = (qrBase64) => {
    const LABEL_WIDTH_MM = labelPreset.widthMm;
    const LABEL_HEIGHT_MM = labelPreset.heightMm;
    const qrCell = qrBase64
      ? `<img class="qr" src="data:image/png;base64,${qrBase64}" />`
      : `<div class="qr qr-fallback">${esc(String(trackingId).toUpperCase())}</div>`;
    const createdLine = createdOn ? `${esc(createdOn.date)}&nbsp;&nbsp;${esc(createdOn.time)}` : '';
    const label = `
      <div class="label">
        <div class="service-no">${esc(trackingId)}</div>
        ${createdLine ? `<div class="created-on">${createdLine}</div>` : ''}
        <div class="main-row">
          <div class="qr-wrap">${qrCell}</div>
          <div class="details">
            <div class="d-row">${ICON_CUSTOMER}<span class="d-text">${esc(customerName)}</span></div>
            ${customerPhone ? `<div class="d-row">${ICON_PHONE}<span class="d-text">${esc(customerPhone)}</span></div>` : ''}
            <div class="d-row">${ICON_NOTE}<span class="d-text">${esc(security)}</span></div>
          </div>
        </div>
        <div class="brand-model">${ICON_DEVICE}<span>${esc(brandModel)}</span></div>
      </div>`;
    const labels = Array.from({ length: copies }, () => label).join('');
    return `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* Width only — NOT height/overflow: with N copies the document is N
           labels tall (page-break-before slices that into N physical pages
           of exactly LABEL_HEIGHT_MM each). Capping html/body to one label's
           height with overflow:hidden would clip every copy after the first
           right out of the printable page. Each .label's OWN fixed
           height + overflow:hidden below is what keeps a single label's
           content from growing past its one page — the ONE thing that must
           never come back, on top of this pass's compact redesign. */
        html, body {
          width: ${LABEL_WIDTH_MM}mm; background: #fff;
          font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #000;
        }
        @media print {
          @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
          html, body {
            width: ${LABEL_WIDTH_MM}mm !important;
            margin: 0 !important; padding: 0 !important; background: #fff !important;
          }
        }
        .label {
          width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm;
          min-width: ${LABEL_WIDTH_MM}mm; max-width: ${LABEL_WIDTH_MM}mm;
          min-height: ${LABEL_HEIGHT_MM}mm; max-height: ${LABEL_HEIGHT_MM}mm;
          box-sizing: border-box; overflow: hidden;
          padding: calc(0.8mm + 1px) 1.2mm 0.8mm 1.2mm;
          display: flex; flex-direction: column;
          background: #fff; color: #000;
          page-break-inside: avoid; break-inside: avoid;
        }
        .label + .label { page-break-before: always; break-before: page; }
        .service-no { font-size: 10px; font-weight: 800; letter-spacing: 0.2px; color: #000;
                      text-align: center; line-height: 1; margin-top: 2px;
                      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .created-on { font-size: 6.5px; font-weight: 600; color: #000; text-align: center; line-height: 1;
                      margin-top: 0.4mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .main-row { flex: 1; min-height: 0; display: flex; flex-direction: row; align-items: center;
                    gap: 1mm; margin-top: 0.4mm; }
        .qr-wrap { flex: 0 0 12.5mm; max-width: 12.5mm; display: flex; align-items: center; justify-content: center; }
        .qr { width: 11mm; height: 11mm; }
        .qr-fallback { width: 11mm; height: 11mm; display: flex; align-items: center; justify-content: center;
                       border: 0.2mm solid #000; font-weight: 700; font-size: 3.5pt; text-align: center;
                       word-break: break-all; line-height: 1; }
        .details { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.8mm; }
        .d-row { display: flex; flex-direction: row; align-items: center; gap: 0.6mm; min-width: 0; }
        .icon { flex: 0 0 auto; width: 2.2mm; height: 2.2mm; }
        .d-text { flex: 1; min-width: 0; font-size: 9px; font-weight: 600; line-height: 1.15; color: #000;
                   white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .brand-model { display: flex; flex-direction: row; align-items: center; justify-content: center;
                        gap: 0.8mm; margin-top: 0.4mm; min-width: 0; }
        .brand-model span { font-size: 11px; font-weight: 700; line-height: 1; color: #000;
                             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style></head><body>${labels}</body></html>`;
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

  const handlePrint = async () => {
    // Real Bluetooth thermal printing (TVS LP-46 Dlite over Classic/SPP) only
    // exists as a native module on Android — hand off to the connect/print
    // sheet instead of the browser-oriented flow below.
    if (Platform.OS === 'android') {
      setPrinterSheetOpen(true);
      return;
    }
    if (printing) return;
    setPrinting(true);
    try {
      const qrBase64 = await getQrPng();
      const html = buildSlipHtml(qrBase64);
      if (Platform.OS === 'web') {
        await printHtmlOnWeb(html);
      } else {
        await Print.printAsync({ html });
      }
    } catch (e) {
      const m = e?.message || '';
      // A user-cancelled print dialog isn't an error worth surfacing.
      if (!/cancel/i.test(m)) notify('Print failed', m || 'Could not open the printer.');
    } finally {
      setPrinting(false);
    }
  };

  // Tablet / large-screen: cap the column and centre it, same convention as
  // the rest of the booking flow.
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 640), alignSelf: 'center' } : null;
  // Label preview width — small enough to read as the sticker it is.
  const previewW = Math.min(250, r.width - 80);

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + rs(8),
          paddingBottom: rs(12),
          paddingHorizontal: rs(14),
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <View style={colStyle}>
          <View className="flex-row items-center">
            <TouchableOpacity
              // With no history behind this screen, a bare goBack() is an
              // unhandled GO_BACK and the button silently does nothing. Home is
              // a tab inside OwnerTabs, which React Navigation 7 won't resolve
              // by name alone, and popTo (not navigate) so the tabs aren't
              // pushed on top of this screen.
              onPress={() => (navigation.canGoBack()
                ? navigation.goBack()
                : navigation.popTo('OwnerTabs', { screen: 'Home' }))}
              activeOpacity={0.7}
              hitSlop={6}
              style={{
                height: 36, width: 36, borderRadius: 18, marginRight: 10,
                alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG,
                borderWidth: 1, borderColor: BORDER,
              }}
            >
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>
                QR E-Print
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={2}>
                Generate and print a QR slip for easy tracking
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 90 }}
      >
        <View style={colStyle}>
          {/* ── Booking card: photo, full device name, variant, services,
              then tracking ID / customer / services / device lock ── */}
          <View style={card}>
            <View className="flex-row items-center">
              <View
                style={{
                  height: 64, width: 60, borderRadius: 14, marginRight: 12, backgroundColor: '#FFFFFF',
                  borderWidth: 1, borderColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
              >
                {deviceImageUrl ? (
                  <Image source={{ uri: deviceImageUrl }} style={{ width: 52, height: 56 }} resizeMode="contain" />
                ) : (
                  <Smartphone size={24} color={ACCENT} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.7, color: TEXT_SECONDARY }}>
                  Booking
                </Text>
                <Text className="font-extrabold" style={{ fontSize: 15, lineHeight: 19, marginTop: 1, color: TEXT_PRIMARY }}>
                  {deviceName}
                </Text>
                {variant ? (
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }}>{variant}</Text>
                ) : null}
                {serviceCountLabel ? (
                  <View className="flex-row items-center rounded-full" style={{ alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: MINT }}>
                    <Wrench size={10} color={PRIMARY} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: PRIMARY, marginLeft: 4 }}>{serviceCountLabel}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#F3F3F3' }}>
              <DetailRow icon={Hash} label="Tracking ID">
                <View className="flex-row items-center">
                  <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}>
                    <Text style={{ color: TEXT_PRIMARY }}>#{tid.prefix}</Text>
                    <Text style={{ color: ACCENT }}>{tid.digits}</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={handleCopy}
                    activeOpacity={0.8}
                    hitSlop={6}
                    className="flex-row items-center"
                    style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: MINT }}
                  >
                    <Copy size={11} color={PRIMARY} />
                    <Text style={{ marginLeft: 4, fontSize: 10, fontWeight: '800', color: PRIMARY }}>Copy</Text>
                  </TouchableOpacity>
                </View>
              </DetailRow>
              <DetailRow icon={User} label="Customer">
                <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' }}>
                  {[customerName, customerPhone].filter((v) => v && v !== '—').join(' · ') || '—'}
                </Text>
              </DetailRow>
              <DetailRow icon={Wrench} label="Services">
                <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' }}>{services}</Text>
              </DetailRow>
              <DetailRow icon={Lock} label="Device Lock" isLast>
                <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY, textAlign: 'right' }}>{security}</Text>
              </DetailRow>
            </View>
          </View>

          {/* ── QR label preview — the same LabelPreview the print sheet shows,
              drawn from the printer's own layout for the selected preset ── */}
          <View style={[card, { marginTop: 10 }]}>
            <View className="flex-row items-center">
              <View className="items-center justify-center" style={{ height: 28, width: 28, borderRadius: 9, backgroundColor: MINT, marginRight: 9 }}>
                <QrCode size={14} color={ACCENT} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }}>QR Label</Text>
                <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }}>
                  {labelPreset.name} · {presetSizeText(labelPreset)}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
              <View style={{ width: previewW }}>
                <LabelPreview
                  preset={labelPreset}
                  trackingId={trackingId}
                  brandModel={brandModel}
                  customerName={customerName}
                  deviceSecurity={security}
                  createdOn={createdOn}
                  scale={1.4}
                />
              </View>
            </View>
          </View>
        </View>

      {/* Off-screen QR, purely so getQrPng() can rasterise a PNG for the
            web/iOS expo-print fallback below (handlePrint) — the physical
            Android print doesn't use this: the Bluetooth printer generates
            its own QR from TSPL's QRCODE command (src/services/printer/tspl.js).
            Moved off-screen with a large negative offset, NOT collapsed to a
            1x1 box — react-native-qrcode-svg's toDataURL() on web rasterises
            the element's actual rendered pixel size, so shrinking the
            wrapper to 1x1 captured (and then upscaled) a near-blank 1px
            sliver instead of the real 134x134 QR, which is what printed as
            garbled bars. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -9999, left: -9999 }}>
          <QRCode value={String(trackingId)} size={134} getRef={(c) => { qrRef.current = c; }} />
        </View>

      </ScrollView>

      {/* Android Bluetooth thermal-printer flow (TVS LP-46 Dlite) — opened by
          handlePrint instead of the browser/expo-print path on that platform. */}
      <PrinterConnectSheet
        visible={printerSheetOpen}
        onClose={() => setPrinterSheetOpen(false)}
        label={{ trackingId, brandModel, customerName, deviceSecurity: security, createdOn }}
        initialCopies={copies}
      />

      {/* Sticky action bar */}
      <View
        className="absolute left-0 right-0 bottom-0"
        style={{
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          borderTopWidth: 1,
          borderTopColor: BORDER,
        }}
      >
        <View style={colStyle}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handlePrint}
            disabled={printing}
            style={{ borderRadius: 14, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={[ACCENT, PRIMARY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                opacity: printing ? 0.7 : 1,
              }}
            >
              <Printer size={16} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ fontSize: 13, marginLeft: 8 }} numberOfLines={1}>
                {printing ? 'Printing…' : 'Print QR Slip'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
