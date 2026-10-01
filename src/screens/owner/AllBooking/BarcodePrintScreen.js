import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Share, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Share2,
  Printer,
  Smartphone,
  Wrench,
  ChevronLeft,
  Check,
  QrCode,
  Copy,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';
import { rf, rs } from '../../../utils/responsive';
import { useResponsive } from '../../../theme/responsive';
import LabelPreview from './LabelPreview';
import PrinterConnectSheet from './PrinterConnectSheet';
import { useLabelPreset } from '../../../services/printer/useLabelPreset';

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
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
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
  const deviceImageUrl = ticket?.deviceImageUrl || null;
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
  const colStyle = r.isTablet ? { width: Math.min(r.width - rs(48), 920), alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Subtle decorative mint curved shapes — purely decorative,
          non-interactive, sit behind everything. Plain positioned circles
          rather than an SVG wave (no new dependency, and at this low an
          opacity the exact silhouette doesn't read anyway). */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rs(260), overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: -rs(90), right: -rs(70), height: rs(220), width: rs(220), borderRadius: rs(110), backgroundColor: MINT, opacity: 0.5 }} />
        <View style={{ position: 'absolute', top: rs(40), left: -rs(90), height: rs(180), width: rs(180), borderRadius: rs(90), backgroundColor: SOFT_MINT, opacity: 0.6 }} />
      </View>

      {/* Header — circular back button, title, subtitle, service-id pill
          (real `trackingId`, unchanged), and a small decorative brand mark
          in the top-right of the page background. */}
      <View
        style={{
          backgroundColor: 'transparent',
          paddingTop: insets.top + rs(10),
          paddingBottom: rs(14),
          paddingHorizontal: rs(16),
        }}
      >
        <View style={colStyle}>
          <View className="flex-row items-start">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              style={{
                height: rs(52), width: rs(52), borderRadius: rs(26), marginRight: rs(12),
                alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: BORDER, ...cardShadow, shadowOpacity: 0.05,
              }}
            >
              <ChevronLeft size={rf(24)} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1, paddingTop: rs(2) }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>
                QR E-Print
              </Text>
              <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: rs(3) }} numberOfLines={1}>
                Generate and print a QR slip for easy tracking
              </Text>
            </View>
            <View
              className="items-center justify-center"
              style={{ maxWidth: rs(170), height: rs(46), borderRadius: 999, paddingHorizontal: rs(12), backgroundColor: MINT }}
            >
              <Text style={{ fontSize: 10.5, fontWeight: '800' }} numberOfLines={1}>
                <Text style={{ color: TEXT_PRIMARY }}>#{tid.prefix}</Text>
                <Text style={{ color: ACCENT }}>{tid.digits}</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Hero banner — "One Scan. Complete Service Details." An icon-based
            phone+QR mark stands in for a full illustration graphic (no image
            asset was supplied and adding one is out of scope for a UI-only
            pass), paired with the REPAIR / TRACK / RESOLVE checklist moved
            up from the header into its proper spot here. */}
        <View className="px-4" style={{ marginTop: rs(6) }}>
          <View style={colStyle}>
            <LinearGradient
              colors={[MINT, '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: rs(22), padding: rs(16), borderWidth: 1, borderColor: BORDER }}
            >
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center"
                  style={{ height: rs(46), width: rs(46), borderRadius: rs(15), marginRight: rs(12), backgroundColor: '#FFFFFF' }}
                >
                  <QrCode size={rf(21)} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="font-extrabold" style={{ fontSize: 14, lineHeight: rf(19), color: TEXT_PRIMARY }}>
                    One Scan.{'\n'}Complete Service Details.
                  </Text>
                  <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: rs(3) }} numberOfLines={1}>
                    Faster service. Better tomorrow.
                  </Text>
                </View>
                {/* Compact phone + QR mark, standing in for a full illustration. */}
                <View
                  className="items-center justify-center"
                  style={{ height: rs(50), width: rs(38), borderRadius: rs(10), marginLeft: rs(8), backgroundColor: ACCENT }}
                >
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(24), width: rs(24), borderRadius: rs(5), backgroundColor: '#FFFFFF' }}
                  >
                    <QrCode size={rf(14)} color={ACCENT} />
                  </View>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: BORDER, marginVertical: rs(12) }} />

              <View className="flex-row" style={{ justifyContent: 'space-between' }}>
                {['REPAIR', 'TRACK', 'RESOLVE'].map((w) => (
                  <View key={w} className="flex-row items-center">
                    <View
                      className="items-center justify-center"
                      style={{ height: rs(16), width: rs(16), borderRadius: rs(8), backgroundColor: ACCENT, marginRight: rs(5) }}
                    >
                      <Check size={rf(10)} color="#FFFFFF" strokeWidth={3} />
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: TEXT_PRIMARY }}>{w}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Booking summary card */}
        <View className="px-4" style={{ marginTop: rs(14) }}>
          <View style={colStyle}>
            <View
              className="flex-row items-center"
              style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(14), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
            >
              <View
                className="items-center justify-center overflow-hidden"
                style={{
                  height: rs(58), width: rs(58), borderRadius: rs(18), marginRight: rs(12),
                  backgroundColor: MINT, borderWidth: 1, borderColor: BORDER,
                }}
              >
                {deviceImageUrl ? (
                  <Image source={{ uri: deviceImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Smartphone size={rf(24)} color={ACCENT} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.7, color: TEXT_SECONDARY }}>
                  Booking
                </Text>
                <Text className="font-extrabold" style={{ fontSize: 17, marginTop: rs(2), color: TEXT_PRIMARY }} numberOfLines={1}>
                  {deviceName}
                </Text>
                <View className="flex-row items-center flex-wrap" style={{ marginTop: rs(6) }}>
                  <View className="rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: MINT, marginRight: rs(6), marginBottom: rs(2) }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: ACCENT }} numberOfLines={1}>
                      #{trackingId}
                    </Text>
                  </View>
                  {serviceCountLabel ? (
                    <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: MINT, marginBottom: rs(2) }}>
                      <Wrench size={rf(9.5)} color={ACCENT} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: ACCENT, marginLeft: rs(4) }} numberOfLines={1}>
                        {serviceCountLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                onPress={handleCopy}
                activeOpacity={0.8}
                className="flex-row items-center"
                style={{
                  borderRadius: 999, paddingHorizontal: rs(14), paddingVertical: rs(10), backgroundColor: MINT,
                  borderWidth: 1, borderColor: ACCENT,
                }}
              >
                <Copy size={rf(13)} color={ACCENT} />
                <Text
                  className="font-extrabold"
                  style={{ fontSize: 11, letterSpacing: 0.8, color: ACCENT, marginLeft: rs(6) }}
                >
                  COPY
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* QR label preview — compact, matches the physical printed label for
            the selected Page Setup preset (38x25 or 50x25mm): no headings,
            service number centered on top, QR +
            brand/model / customer / device security on the right, created-on
            centered on the bottom (LabelPreview.js — the same component the
            Bluetooth print sheet shows, and the same content/order as the
            Bluetooth TSPL label and the web-print fallback below). */}
        <View className="px-4" style={{ marginTop: rs(16) }}>
          <View style={colStyle}>
            <View
              ref={slipRef}
              collapsable={false}
              style={{
                borderRadius: rs(20), padding: rs(16), backgroundColor: CARD_BG,
                borderWidth: 1, borderColor: BORDER, ...cardShadow, alignItems: 'center',
              }}
            >
              <View style={{ width: '100%', maxWidth: rs(340) }}>
                <LabelPreview
                  preset={labelPreset}
                  trackingId={trackingId}
                  brandModel={brandModel}
                  customerName={customerName}
                  deviceSecurity={security}
                  createdOn={createdOn}
                  scale={1.8}
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
        className="absolute left-0 right-0 bottom-0 flex-row"
        style={{
          paddingHorizontal: rs(16),
          paddingTop: rs(12),
          paddingBottom: insets.bottom + rs(12),
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          borderTopWidth: 1,
          borderTopColor: BORDER,
        }}
      >
        <View style={[{ flexDirection: 'row', flex: 1 }, colStyle]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleShare}
            className="flex-row items-center justify-center"
            style={{
              flex: 1, marginRight: rs(8), borderRadius: rs(20), paddingVertical: rs(16),
              backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ACCENT, ...cardShadow,
            }}
          >
            <Share2 size={rf(17)} color={ACCENT} />
            <Text className="font-extrabold" style={{ fontSize: 13.5, color: ACCENT, marginLeft: rs(8) }} numberOfLines={1}>
              Share QR Slip
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handlePrint}
            disabled={printing}
            style={{ flex: 1, marginLeft: rs(8), borderRadius: rs(20), overflow: 'hidden', ...cardShadow, shadowColor: ACCENT, shadowOpacity: 0.28 }}
          >
            <LinearGradient
              colors={[ACCENT, PRIMARY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: rs(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                opacity: printing ? 0.7 : 1,
              }}
            >
              <Printer size={rf(17)} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ fontSize: 13.5, marginLeft: rs(8) }} numberOfLines={1}>
                {printing ? 'Printing…' : 'Print QR Slip'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
