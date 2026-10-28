import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown, ChevronLeft, CircleAlert, CircleCheckBig, Download, Eye, FileText, Pencil,
  Printer, Share2, Smartphone, Store, Trash2, Truck, UserRound, Wrench,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { confirm, notify } from '../../../components/confirm';
import { sendWhatsAppText } from '../../../lib/whatsappShare';
import { saveToDownloads, notifyDownloaded, shareLocalFile, viewLocalFile } from '../../../lib/downloads';
import { ticketApi, authApi } from '../../../api/client';
import { getSession } from '../../../auth/session';
import { useImeiApplies } from '../../../utils/imeiPolicy';
import { specDisplayParts } from '../../../utils/deviceSpecs';
import { getModel, parseModelNumbers } from '../../../api/masterData';
import { useResponsive } from '../../../theme/responsive';

// "Apple iPhone 11 · A2221 (64 GB / Black)" → { name: "Apple iPhone 11", modelNumber: "A2221" }.
function splitDisplayName(raw) {
  const str = String(raw || '').trim();
  const m = /^(.*?)(?: · ([^()]+?))?(?: \(([^)]*)\))?$/.exec(str);
  return { name: (m?.[1] || str).trim(), modelNumber: m?.[2]?.trim() || null };
}

// expo-print / expo-sharing / expo-file-system are platform-native; require
// lazily so the web bundle (and dev environments without the modules
// installed) still load. expo-file-system ships as a peer of expo-print
// so it's available without an explicit install.
const getPrintModule = () => {
  try { return require('expo-print'); } catch { return null; }
};
const getSharingModule = () => {
  try { return require('expo-sharing'); } catch { return null; }
};

// Sanitise a string for safe use as a filename on Android / iOS / Windows.
function safeFilename(s) {
  return String(s || 'document')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const BRAND_GREEN = '#035C6C';
const BRAND_GREEN_DARK = '#035C6C';

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

// Once the device is out for delivery (or the booking is closed) the invoice is
// part of the handover, so it can no longer be edited or deleted. The server
// refuses a delete past this point too (409).
const INVOICE_LOCKED_STATUSES = ['DELIVERED_PROCESSING', 'DELIVERED', 'CANCELLED', 'RETURNED'];

function safeJson(s, fallback) {
  if (!s) return fallback;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}

// Address is optional on Customer Details, but bookings still get region
// names filled in ("Tamil Nadu, Tamil Nadu"). Drop repeated parts and return
// '' when nothing but state / district / city names (or a pincode) is left.
function enteredAddress(raw, regions) {
  const region = new Set(regions.filter(Boolean).map((r) => String(r).trim().toLowerCase()));
  const seen = new Set();
  const parts = String(raw || '').split(',').map((p) => p.trim()).filter((p) => {
    const k = p.toLowerCase();
    if (!k || k === '—' || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const isRegion = (p) => region.has(p.toLowerCase()) || /^\d{6}$/.test(p);
  return parts.every(isRegion) ? '' : parts.join(', ');
}

export default function DeliveryInvoiceReportScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [shop, setShop] = useState(null);     // public shop card (name/mobile/address/gst)
  const [owner, setOwner] = useState(null);   // logged-in owner session (name + phone)
  const [customer, setCustomer] = useState(null); // customer record (for address fallback)
  const [model, setModel] = useState(null);       // catalogue model (device name fallback)
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [openRows, setOpenRows] = useState({});       // expanded repair-item rows
  const showImei = useImeiApplies(ticket); // mobile phones only

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [t, inv, s] = await Promise.all([
        ticketApi.get(`/tickets/${ticketId}`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/invoice`).catch(() => null),
        getSession().catch(() => null),
      ]);
      setTicket(t || {});
      setInvoice(inv || null);
      setOwner(s || null);
      // Public shop card for the "FROM" / letterhead block.
      if (t?.shopId) {
        try {
          const sh = await authApi.get(`/auth/shops/${t.shopId}/public`);
          setShop(sh || null);
        } catch { setShop(null); }
      }
      // The ticket's customerAddress field is a denormalized snapshot — for
      // older bookings or pickup flows it can be NULL even though the
      // customer DOES have an address row. Fall back to a lookup by phone
      // so the printed invoice still carries the address.
      // Always fetched: its state / district / city tell an entered address
      // apart from the auto-filled region names (see enteredAddress).
      if (t?.customerPhone) {
        try {
          const c = await ticketApi.get(`/customers/lookup`, { query: { mobile: t.customerPhone } });
          setCustomer(c || null);
        } catch { setCustomer(null); }
      }
      // Older bookings carry no deviceDisplayName — name the device from its
      // catalogue model instead.
      if (t?.modelId && !String(t?.deviceDisplayName || '').trim()) {
        setModel(await getModel(t.modelId).catch(() => null));
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const invoiceEditable = !INVOICE_LOCKED_STATUSES.includes(String(ticket?.status || '').toUpperCase());

  // Replace, not navigate: the generator replaces itself with this report on
  // save, so the stack ends with one report rather than two.
  const handleEdit = () => navigation.replace('InvoiceGenerator', { ticketId });

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete invoice?',
      message: `Invoice #${invoice?.invoiceNo} will be deleted, its Cash Book credit removed and "Invoice Generated" taken off the Service History.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await ticketApi.del(`/tickets/${ticketId}/invoice`);
      notify('Invoice deleted', 'Generate a new invoice from Update Service Status.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Delete failed', e?.message || 'Could not delete invoice', { preset: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Loader label="Loading invoice..." />;
  if (!invoice) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: '#E5F3F5' }}>
        <Text className="text-[13px] font-extrabold text-gray-700">No invoice generated yet</Text>
        <Text className="text-[12px] text-gray-500 mt-2 text-center">
          Open the Invoice Generator from the Invoices screen to create one.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mt-5 px-6 py-3 rounded-2xl"
          style={{ backgroundColor: BRAND_GREEN_DARK }}
        >
          <Text className="text-white font-extrabold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const spareLines = safeJson(invoice.spareLinesJson, []);
  const serviceLines = safeJson(invoice.serviceLinesJson, []);
  const halfGst = (Number(invoice.gstPercent) || 0) / 2;

  // Resolve shop / owner display fields. Prefer the freshly-fetched shop
  // (auth-service /shops/{id}/public) for legal info; fall back to the
  // logged-in owner's session for fields the public shop view doesn't carry.
  const shopName    = shop?.name || ticket?.shopName || 'Near G Fix Service Center';
  const shopMobile  = shop?.mobile || owner?.phone || '';
  const shopAddress = shop?.address || ticket?.shopAddress || '';
  const shopGst     = shop?.gstNumber || invoice?.gstNo || '';
  const ownerDisplayName = owner?.name || '';
  const customerName = ticket?.customerName || '';
  const trackingId = ticket?.trackingId || invoice?.invoiceNo || ticketId;

  // Resolved customer address: prefer the ticket's denormalized snapshot,
  // then the fetched customer's `address` (legacy concat), then a freshly
  // composed line from structured columns (addressLine / area / district /
  // state / pincode). Address is optional, so it is '' (row hidden) unless
  // the customer actually entered one.
  const composedCustomerAddr = customer
    ? [customer.addressLine, customer.area || customer.locality, customer.district || customer.city, customer.state, customer.pincode]
        .filter((p) => p && String(p).trim())
        .join(', ')
    : '';
  const customerAddress = enteredAddress(
    ticket?.customerAddress || customer?.address || composedCustomerAddr,
    [customer?.state, customer?.district, customer?.city, customer?.taluk],
  );

  // TO block device line: "Apple iPhone 13 · A2633", IMEI for phones only.
  const shownDevice = splitDisplayName(ticket?.deviceDisplayName);
  const deviceModel = shownDevice.name
    ? [shownDevice.name, shownDevice.modelNumber].filter(Boolean).join(' · ')
    : [model?.name, parseModelNumbers(model?.modelNumber)[0]].filter(Boolean).join(' · ');
  const deviceImei = showImei ? String(ticket?.imei || '').trim() : '';
  // Selected variant (RAM / storage / colour) and the customer's alternate number.
  const deviceVariant = ticket ? specDisplayParts(ticket, { withColor: true }).join(' · ') : '';
  const altPhone = String(customer?.alternatePhone || '').trim();

  // Per-row tax breakdown. Returns 0 GST when taxMode = WITHOUT or 0% so
  // the rendered tables match the saved invoice.totalGst.
  const gstPct = Number(invoice.gstPercent) || 0;
  const breakRow = (gross) => {
    if (invoice.taxMode === 'WITHOUT' || gstPct === 0) {
      return { base: +gross.toFixed(2), cgst: 0, sgst: 0, totalGst: 0, total: +gross.toFixed(2) };
    }
    if (invoice.taxMode === 'INCLUSIVE') {
      const base = gross / (1 + gstPct / 100);
      const cgst = +(base * (halfGst / 100)).toFixed(2);
      const sgst = +(base * (halfGst / 100)).toFixed(2);
      return {
        base: +base.toFixed(2), cgst, sgst,
        totalGst: +(gross - base).toFixed(2),
        total: +gross.toFixed(2),
      };
    }
    const base = gross;
    const cgst = +(base * (halfGst / 100)).toFixed(2);
    const sgst = +(base * (halfGst / 100)).toFixed(2);
    const totalGstRow = +(base * (gstPct / 100)).toFixed(2);
    return {
      base: +base.toFixed(2), cgst, sgst,
      totalGst: totalGstRow,
      total: +(base + totalGstRow).toFixed(2),
    };
  };

  const accumulate = (rows) => rows.reduce((acc, br) => ({
    base: +(acc.base + br.base).toFixed(2),
    cgst: +(acc.cgst + br.cgst).toFixed(2),
    sgst: +(acc.sgst + br.sgst).toFixed(2),
    totalGst: +(acc.totalGst + br.totalGst).toFixed(2),
    total: +(acc.total + br.total).toFixed(2),
  }), { base: 0, cgst: 0, sgst: 0, totalGst: 0, total: 0 });

  // Prefer the per-line breakdown the Invoice Generator already stored —
  // service lines store taxableValue = base (already divided) while spare
  // lines store taxableValue = gross, so re-running breakRow gives wrong
  // numbers for one of them. Using the stored cgst/sgst/totalGst/totalAmount
  // guarantees the Deliver Invoice mirrors what the owner saw on the
  // Generator's "Charges Summary" exactly.
  const breakLine = (row, fallbackGross) => {
    if (row && (row.totalGst !== undefined || row.cgst !== undefined || row.totalAmount !== undefined)) {
      const cgst = Number(row.cgst) || 0;
      const sgst = Number(row.sgst) || 0;
      const totalGst = Number(row.totalGst) || 0;
      const total = Number(row.totalAmount) || fallbackGross;
      return { base: +(total - totalGst).toFixed(2), cgst, sgst, totalGst, total };
    }
    return breakRow(fallbackGross);
  };

  const serviceBreaks = serviceLines.map((r) => breakLine(r, Number(r.totalAmount) || Number(r.rate) || 0));
  const spareBreaks = spareLines.map((r) => breakLine(r, Number(r.totalAmount) || ((Number(r.taxableValue) || 0) * (Number(r.qty) || 1))));
  const totalServiceGross = serviceLines.reduce((s, r) => s + (Number(r.taxableValue) || Number(r.rate) || 0), 0);
  const totalSpareGross = spareLines.reduce((s, r) => s + (Number(r.taxableValue) || 0) * (Number(r.qty) || 1), 0);
  const totalServiceBreak = accumulate(serviceBreaks);
  const totalSpareBreak = accumulate(spareBreaks);
  const grandTotalBreak = {
    base: +(totalServiceBreak.base + totalSpareBreak.base).toFixed(2),
    cgst: +(totalServiceBreak.cgst + totalSpareBreak.cgst).toFixed(2),
    sgst: +(totalServiceBreak.sgst + totalSpareBreak.sgst).toFixed(2),
    totalGst: +(totalServiceBreak.totalGst + totalSpareBreak.totalGst).toFixed(2),
    total: +(totalServiceBreak.total + totalSpareBreak.total).toFixed(2),
  };

  // Payment & credit (migration 89). Read straight off the invoice row rather
  // than recomputed: these are the figures the owner confirmed at generation
  // time, and the credit among them is already a debt on the customer's Cash
  // Book account — a reprint that quietly disagreed with it would be the worse
  // of the two documents.
  //
  // netPayable falls back to the invoice total for rows written before the
  // migration, where the column defaults to 0 and would otherwise print a bill
  // that looks fully settled.
  const advancePaid  = Number(invoice.advancePaid) || 0;
  const amountPaid   = Number(invoice.amountPaid) || 0;
  const creditAmount = Number(invoice.creditAmount) || 0;
  const netPayable   = Number(invoice.netPayableAmount)
    || Math.max(0, (Number(invoice.finalPayableAmount) || 0) - advancePaid);
  // A plain cash-and-carry bill — nothing advanced, nothing paid separately,
  // nothing owed — would render these as four zeroes, so it doesn't.
  const payShown = advancePaid > 0 || amountPaid > 0 || creditAmount > 0;

  // Render the on-screen invoice as a print-quality HTML page so expo-print
  // can rasterize it to a PDF. The <title> drives the suggested file name
  // on Android when the user picks "Save to PDF" from the share sheet.
  const buildInvoiceHtml = () => buildHtml({
    invoice, ticket, spareLines, serviceLines,
    shopName, shopMobile, shopAddress, shopGst, ownerDisplayName,
    customerName, customerAddress, trackingId, deviceModel, deviceImei, deviceVariant, altPhone,
    totalServiceGross, totalServiceBreak, totalSpareGross, totalSpareBreak,
    grandTotalBreak,
  });

  /**
   * Save the invoice PDF onto the phone, rather than handing it to another app
   * the way Share does. Same render path as Share so the two can never disagree
   * about what the document says.
   *
   * saveToDownloads throws on failure and never returns null: there is no
   * folder picker to back out of, and no picker to fall back to.
   */
  const handleDownload = async () => {
    const fail = (title, message) => notify(title, message || '', { preset: 'error' });
    const Print = getPrintModule();
    if (!Print) {
      fail('PDF module not installed', 'expo-print is missing. Run `npm install --legacy-peer-deps` and restart Metro with `npx expo start --clear`.');
      return;
    }
    setDownloading(true);
    try {
      const printed = await Print.printToFileAsync({ html: buildInvoiceHtml(), base64: false });
      if (!printed?.uri) {
        fail('PDF render failed', 'No file URI returned by expo-print.');
        return;
      }
      const saved = await saveToDownloads({
        stem: `NearGFix_Invoice_${safeFilename(invoice.invoiceNo || trackingId)}`,
        extension: 'pdf',
        mimeType: 'application/pdf',
        sourceUri: printed.uri,
      });
      if (!saved.shared) notify('Invoice downloaded successfully to Downloads.', saved.name, { preset: 'done' });
      notifyDownloaded(saved);
    } catch (e) {
      fail('Download failed', e?.message || 'Could not save the invoice.');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    // Use native Alert.alert for errors — guaranteed to render on every
    // Android/iOS build regardless of whether Burnt's native toast is wired
    // up. (`notify` failed silently for some users on this screen.)
    const fail = (title, message) => notify(title, message || '', { preset: 'error' });

    // Customer's number on file → the invoice goes to their WhatsApp chat as text.
    const lines = [...serviceLines, ...spareLines]
      .map((row) => `• ${row.description || 'Item'} — ₹${fmt(Number(row.totalAmount) || Number(row.rate) || 0)}`);
    const invoiceText = [
      `🧾 *Invoice ${invoice.invoiceNo || trackingId}*`,
      shopName ? `${shopName}` : null,
      '',
      `Customer: ${customerName || '-'}`,
      deviceModel ? `Device: ${deviceModel}` : null,
      `Tracking ID: #${trackingId}`,
      '',
      ...lines,
      '',
      `*Total: ₹${fmt(invoice.finalPayableAmount)}*`,
      advancePaid > 0 ? `Advance paid: ₹${fmt(advancePaid)}` : null,
      amountPaid > 0 ? `Paid: ₹${fmt(amountPaid)}` : null,
      creditAmount > 0 ? `Balance due: ₹${fmt(creditAmount)}` : null,
      '',
      'Thank you!',
    ].filter((l) => l !== null).join('\n');
    if (Platform.OS !== 'web' && await sendWhatsAppText(ticket?.customerPhone, invoiceText)) return;

    try {
      const html = buildInvoiceHtml();
      // Web has no native share-file API — fall back to the text Share dialog.
      if (Platform.OS === 'web') {
        await Share.share({
          message:
            `🧾 Invoice ${trackingId}\nFinal Payable: ₹${fmt(invoice.finalPayableAmount)}\n${invoice.amountInWords || ''}`,
          title: `Invoice ${trackingId}`,
        });
        return;
      }

      const Print = getPrintModule();
      const Sharing = getSharingModule();
      if (!Print) {
        fail('PDF module not installed', 'expo-print is missing. Run `npm install --legacy-peer-deps` and restart Metro with `npx expo start --clear`.');
        return;
      }
      if (!Sharing) {
        fail('Share module not installed', 'expo-sharing is missing. Run `npm install --legacy-peer-deps` and restart Metro.');
        return;
      }

      setSharing(true);

      // Step 1: render the PDF (this is the must-succeed step).
      let tempUri;
      try {
        const printed = await Print.printToFileAsync({ html, base64: false });
        tempUri = printed?.uri;
      } catch (e) {
        fail('PDF render failed', e?.message || 'Could not generate PDF');
        return;
      }
      if (!tempUri) {
        fail('PDF render failed', 'No file URI returned by expo-print.');
        return;
      }

      // Step 2: share under a friendly filename (WhatsApp/Drive/Gmail show it).
      // shareLocalFile renames next to the print output — a path expo-sharing
      // is always allowed to read — and falls back to the temp URI if refused.
      // Don't gate on isAvailableAsync — on Android it can return false in some
      // build types even though shareAsync works fine.
      const fileName = `Mobile_service_Invoice_${safeFilename(invoice.invoiceNo || trackingId)}.pdf`;
      try {
        await shareLocalFile(tempUri, fileName, 'application/pdf');
      } catch (e) {
        // Some Android versions throw "User did not share" on cancel — that
        // isn't a real failure. Surface only message-bearing errors.
        const msg = e?.message || '';
        if (msg && !/cancel|dismiss|user/i.test(msg)) {
          fail('Share failed', msg);
        }
      }
    } catch (e) {
      fail('Share failed', e?.message || 'Try again');
    } finally {
      setSharing(false);
    }
  };

  /** System print dialog (Wi-Fi / USB / cloud printers, or Save as PDF) —
   *  works on every build, with or without the Bluetooth label printer. */
  const handlePrint = async () => {
    const Print = getPrintModule();
    if (!Print) {
      notify('PDF is not available on this build', '', { type: 'warning' });
      return;
    }
    setPrinting(true);
    try {
      await Print.printAsync({ html: buildInvoiceHtml() });
    } catch (e) {
      const msg = e?.message || '';
      if (!/cancel|dismiss/i.test(msg)) notify('Print failed', 'Could not open the printer.', { preset: 'error' });
    } finally {
      setPrinting(false);
    }
  };

  /** Render the exact PDF that Download / Share produce and open it. */
  const handlePreview = async () => {
    const Print = getPrintModule();
    if (!Print) {
      notify('PDF is not available on this build', '', { type: 'warning' });
      return;
    }
    setPreviewing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(), base64: false });
      try {
        await viewLocalFile(uri, 'application/pdf');
      } catch (_) {
        // No PDF viewer installed (or iOS): the print preview shows the same file.
        await Print.printAsync({ uri });
      }
    } catch (e) {
      const msg = e?.message || '';
      if (!/cancel|dismiss/i.test(msg)) notify('Preview failed', 'Could not open the PDF.', { preset: 'error' });
    } finally {
      setPreviewing(false);
    }
  };

  /** Existing status transition; success only after the server accepts it. */
  const handleConfirmDelivery = async () => {
    const ok = await confirm({
      title: 'Confirm delivery?',
      message: `${trackingId} will be marked Delivered to Customer.`,
      confirmText: 'Confirm Delivery',
    });
    if (!ok) return;
    setDelivering(true);
    try {
      await ticketApi.patch(`/tickets/${ticketId}/status`, { query: { status: 'DELIVERED' } });
      notify('Delivered', `${trackingId} delivered to the customer.`, { preset: 'done' });
      load();
    } catch (e) {
      notify('Delivery not confirmed', e?.message || 'Try again', { preset: 'error', haptic: 'error' });
    } finally {
      setDelivering(false);
    }
  };

  const busy = downloading || sharing || printing || previewing;
  const wide = r.isTablet;
  const statusKey = String(ticket?.status || '').toUpperCase();
  const statusLabel = STATUS_LABEL[statusKey] || 'Invoice Ready';
  const delivered = statusKey === 'DELIVERED';
  const canConfirmDelivery = statusKey === 'DELIVERED_PROCESSING';
  const paidTotal = advancePaid + amountPaid;
  const modelNumber = shownDevice.modelNumber || ticket?.modelNumber || '';
  const deviceName = shownDevice.name || model?.name || ticket?.modelName || '';
  const serialNumber = String(ticket?.serialNumber || '').trim();
  const toggleRow = (key) => setOpenRows((o) => ({ ...o, [key]: !o[key] }));

  return (
    <View className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header — title, invoice number and the three document actions. */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="w-10 h-10 rounded-full items-center justify-center mr-2.5 bg-surface-muted"
          >
            <ChevronLeft size={22} color={C.text} />
          </TouchableOpacity>
          <View className="flex-1 mr-2">
            <Text className="text-[17px] font-extrabold" style={{ color: C.text }} numberOfLines={1}>
              Deliver Invoice
            </Text>
            <Text className="text-[11.5px] font-extrabold" style={{ color: C.teal }} numberOfLines={1}>
              #{invoice.invoiceNo}
            </Text>
          </View>
          <HeaderAction icon={Download} label="Download invoice PDF" onPress={handleDownload} busy={downloading} disabled={busy} />
          <HeaderAction icon={Share2} label="Share invoice PDF" onPress={handleShare} busy={sharing} disabled={busy} />
          <HeaderAction icon={Printer} label="Print invoice" onPress={handlePrint} busy={printing} disabled={busy} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 20, width: '100%', maxWidth: r.maxWidth('list'), alignSelf: 'center' }}
      >
        {/* Invoice summary */}
        <View className="rounded-2xl p-4" style={{ backgroundColor: C.light }}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-[10px] font-bold" style={{ color: C.muted, letterSpacing: 0.8 }}>INVOICE TOTAL</Text>
              <Text className="text-[24px] font-extrabold" style={{ color: C.text, letterSpacing: -0.5 }}>
                ₹{fmt(invoice.finalPayableAmount)}
              </Text>
            </View>
            <Pill label={statusLabel} tone={delivered ? 'success' : 'teal'} />
          </View>
          <View className="flex-row items-center mt-1.5">
            <Text className="text-[11.5px]" style={{ color: C.muted }}>Delivery Date  </Text>
            <Text className="text-[11.5px] font-bold" style={{ color: C.text }}>
              {formatDate(invoice.generatedAt || invoice.deliveryDate)}
            </Text>
          </View>
          {invoiceEditable ? (
            <View className="flex-row mt-3">
              <TouchableOpacity
                onPress={handleEdit}
                disabled={deleting}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Edit invoice"
                className="flex-1 flex-row items-center justify-center h-9 rounded-xl mr-2 bg-white"
                style={{ opacity: deleting ? 0.5 : 1 }}
              >
                <Pencil size={14} color={C.teal} />
                <Text className="text-[12px] font-extrabold ml-1.5" style={{ color: C.teal }}>Edit Invoice</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Delete invoice"
                className="flex-1 flex-row items-center justify-center h-9 rounded-xl"
                style={{ backgroundColor: '#FEE2E2', opacity: deleting ? 0.5 : 1 }}
              >
                {deleting ? <ActivityIndicator size="small" color="#B91C1C" /> : <Trash2 size={14} color="#B91C1C" />}
                <Text className="text-[12px] font-extrabold ml-1.5" style={{ color: '#B91C1C' }}>Delete Invoice</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Shop details */}
        <Card icon={Store} title="Shop Details" caption="Original for Deliver Receipt">
          <View style={{ flexDirection: wide ? 'row' : 'column' }}>
            <View style={{ flex: wide ? 1 : undefined }}>
              <Text className="text-[16px] font-extrabold" style={{ color: C.teal }}>{shopName}</Text>
              {ownerDisplayName ? <Text className="text-[12px] font-semibold mt-0.5" style={{ color: C.text }}>{ownerDisplayName}</Text> : null}
              {shopMobile ? <Text className="text-[11.5px] mt-0.5" style={{ color: C.muted }}>Mobile: {shopMobile}</Text> : null}
              {shopAddress ? <Text className="text-[11.5px] mt-0.5 leading-4" style={{ color: C.muted }}>{shopAddress}</Text> : null}
              {shopGst ? <Text className="text-[11.5px] font-semibold mt-0.5" style={{ color: C.text }}>GSTIN: {shopGst}</Text> : null}
            </View>
            <View style={wide ? { marginLeft: 16 } : { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
              <MetaRow label="Invoice No" value={invoice.invoiceNo} />
              <MetaRow label="Ticket Date" value={formatDateTime(invoice.ticketDate)} />
              <MetaRow label="Delivery Date" value={formatDateTime(invoice.generatedAt || invoice.deliveryDate)} />
            </View>
          </View>
        </Card>

        {/* Customer & device */}
        <Card icon={UserRound} title="Customer & Device">
          <View style={{ flexDirection: wide ? 'row' : 'column' }}>
            <View style={{ flex: wide ? 1 : undefined }}>
              <Text className="text-[14px] font-extrabold" style={{ color: C.text }}>{customerName || '—'}</Text>
              {ticket?.customerPhone ? <KV label="Mobile" value={ticket.customerPhone} /> : null}
              {altPhone ? <KV label="Alt. Mobile" value={altPhone} /> : null}
              {customerAddress ? <KV label="Address" value={customerAddress} /> : null}
            </View>
            <View style={wide ? { flex: 1, marginLeft: 16 } : { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
              <View className="flex-row items-center">
                <Smartphone size={14} color={C.teal} />
                <Text className="text-[13px] font-extrabold ml-1.5 flex-1" style={{ color: C.text }} numberOfLines={2}>
                  {deviceName || 'Device'}
                </Text>
              </View>
              {ticket?.categoryName ? <KV label="Category" value={ticket.categoryName} /> : null}
              {ticket?.brandName ? <KV label="Brand" value={ticket.brandName} /> : null}
              {modelNumber ? <KV label="Model No" value={modelNumber} /> : null}
              {deviceVariant ? <KV label="Variant" value={deviceVariant} /> : null}
              {deviceImei ? <KV label="IMEI" value={deviceImei} /> : null}
              {serialNumber ? <KV label="Serial No" value={serialNumber} /> : null}
            </View>
          </View>
        </Card>

        {/* Repair items — rows instead of wide tables; tap a row for its tax split. */}
        <Card icon={Wrench} title="Repair Items">
          <SubHead label="A · Service Charges" total={serviceLines.length ? totalServiceBreak.total : null} />
          {serviceLines.length === 0 ? (
            <Text className="text-[12px] py-2" style={{ color: C.muted }}>No service charges</Text>
          ) : serviceLines.map((row, i) => (
            <ItemRow
              key={`s${i}`}
              title={row.description || `Service ${i + 1}`}
              meta={`Rate ₹${fmt(row.rate)}${serviceBreaks[i].totalGst ? ` · GST ₹${fmt(serviceBreaks[i].totalGst)}` : ''}`}
              total={serviceBreaks[i].total}
              br={serviceBreaks[i]}
              open={!!openRows[`s${i}`]}
              onToggle={() => toggleRow(`s${i}`)}
            />
          ))}

          <View style={{ height: 12 }} />
          <SubHead label="B · Spare Parts" total={spareLines.length ? totalSpareBreak.total : null} />
          {spareLines.length === 0 ? (
            <Text className="text-[12px] py-2" style={{ color: C.muted }}>No spare parts</Text>
          ) : spareLines.map((row, i) => (
            <ItemRow
              key={`p${i}`}
              title={row.description || `Part ${i + 1}`}
              meta={`Qty ${Number(row.qty || 1)} · Rate ₹${fmt(row.rate)} · Warranty ${row.warranty || '—'}`}
              total={spareBreaks[i].total}
              br={spareBreaks[i]}
              open={!!openRows[`p${i}`]}
              onToggle={() => toggleRow(`p${i}`)}
            />
          ))}
        </Card>

        {/* Tax & payment */}
        <Card icon={FileText} title="Tax & Payment">
          <KVRow label="Taxable Amount" value={`₹${fmt(grandTotalBreak.base)}`} />
          {gstPct > 0 ? (
            <>
              <KVRow label={`CGST (${halfGst}%)`} value={`₹${fmt(grandTotalBreak.cgst)}`} />
              <KVRow label={`SGST (${halfGst}%)`} value={`₹${fmt(grandTotalBreak.sgst)}`} />
            </>
          ) : (
            <KVRow label="GST" value="Not applied" muted />
          )}
          {Number(invoice.discount) > 0 ? (
            <KVRow label="Discount" value={`− ₹${fmt(invoice.discount)}`} color="#B45309" />
          ) : null}
          <View className="mt-2 px-3 py-2.5 rounded-xl flex-row items-center justify-between" style={{ backgroundColor: C.teal }}>
            <Text className="text-white text-[13px] font-extrabold">Invoice Total</Text>
            <Text className="text-white text-[17px] font-extrabold">₹{fmt(invoice.finalPayableAmount)}</Text>
          </View>
          {invoice.amountInWords ? (
            <Text className="text-[11px] mt-1.5 italic" style={{ color: C.muted }}>In words: {invoice.amountInWords}</Text>
          ) : null}

          <View className="mt-3 pt-2.5" style={{ borderTopWidth: 1, borderTopColor: C.border }}>
            {payShown ? (
              <>
                {advancePaid > 0 ? <KVRow label="Advance Paid" value={`₹${fmt(advancePaid)}`} /> : null}
                {advancePaid > 0 ? <KVRow label="Net Payable" value={`₹${fmt(netPayable)}`} /> : null}
                <KVRow label="Amount Paid" value={`₹${fmt(paidTotal)}`} />
                <KVRow
                  label="Balance Payable"
                  value={`₹${fmt(creditAmount)}`}
                  color={creditAmount > 0 ? '#B45309' : C.text}
                  bold
                />
                <View className="mt-2 flex-row">
                  {creditAmount > 0
                    ? <Pill label={`Balance due ₹${fmt(creditAmount)}`} tone="amber" icon={CircleAlert} />
                    : <Pill label="Payment Completed" tone="success" icon={CircleCheckBig} />}
                </View>
                {creditAmount > 0 && invoice.paymentNote ? (
                  <Text className="text-[11px] mt-1.5 italic" style={{ color: C.muted }}>Note: {invoice.paymentNote}</Text>
                ) : null}
              </>
            ) : (
              <Text className="text-[11.5px]" style={{ color: C.muted }}>No payment recorded on this invoice.</Text>
            )}
          </View>
        </Card>

        <Text className="text-[10.5px] mt-3 px-1 leading-4" style={{ color: C.muted }}>
          <Text className="font-extrabold">Declaration: </Text>
          We declare that this invoice reflects the actual service charges and spare parts used for the above-mentioned device, and all the particulars stated above are true and correct.
        </Text>
      </ScrollView>

      {/* Sticky actions */}
      <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 }}>
        <View className="flex-row" style={{ width: '100%', maxWidth: r.maxWidth('list'), alignSelf: 'center' }}>
          <TouchableOpacity
            onPress={handlePreview}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            className="flex-1 h-12 rounded-xl flex-row items-center justify-center"
            style={{ borderWidth: 1.5, borderColor: C.teal, backgroundColor: '#FFFFFF', opacity: busy ? 0.6 : 1 }}
          >
            {previewing ? <ActivityIndicator size="small" color={C.teal} /> : <Eye size={16} color={C.teal} />}
            <Text className="text-[13px] font-extrabold ml-1.5" style={{ color: C.teal }}>
              Preview PDF
            </Text>
          </TouchableOpacity>
          {canConfirmDelivery ? (
            <TouchableOpacity
              onPress={handleConfirmDelivery}
              disabled={delivering}
              activeOpacity={0.8}
              accessibilityRole="button"
              className="flex-1 h-12 rounded-xl flex-row items-center justify-center ml-2"
              style={{ backgroundColor: C.teal, opacity: delivering ? 0.6 : 1 }}
            >
              {delivering ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Truck size={16} color="#FFFFFF" />}
              <Text className="text-[13px] font-extrabold ml-1.5 text-white">Confirm Delivery</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

    </View>
  );
}

/* ── presentational pieces ─────────────────────────────────────────────── */

const C = {
  teal: '#035C6C',
  bg: '#F3F4F6',
  light: '#E5F3F5',
  text: '#111111',
  muted: '#6B7280',
  success: '#609138',
  border: '#E5E7EB',
};

const STATUS_LABEL = {
  DELIVERED: 'Delivered',
  DELIVERED_PROCESSING: 'Dispatched',
  INVOICE_GENERATED: 'Invoice Ready',
  INVOICE_READY: 'Invoice Ready',
  READY: 'Ready for Delivery',
  RETURN_DELIVERY: 'Return Delivery',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function HeaderAction({ icon: Icon, label, onPress, busy, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-9 h-9 rounded-full items-center justify-center ml-1.5 bg-surface-muted"
      style={{ opacity: disabled && !busy ? 0.5 : 1 }}
    >
      {busy ? <ActivityIndicator size="small" color={C.teal} /> : <Icon size={17} color={C.teal} />}
    </TouchableOpacity>
  );
}

function Card({ icon: Icon, title, caption, children }) {
  return (
    <View className="bg-white rounded-2xl p-4 mt-3" style={cardShadow}>
      <View className="flex-row items-center mb-2.5">
        {Icon ? <Icon size={15} color={C.teal} /> : null}
        <Text className="flex-1 text-[13px] font-extrabold ml-1.5" style={{ color: C.text }}>{title}</Text>
        {caption ? <Text className="text-[10.5px] font-bold" style={{ color: C.muted }}>{caption}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Pill({ label, tone = 'teal', icon: Icon }) {
  const t = {
    teal: { bg: '#FFFFFF', fg: C.teal },
    success: { bg: '#EAF3E2', fg: C.success },
    amber: { bg: '#FEF3C7', fg: '#B45309' },
    muted: { bg: '#F3F4F6', fg: C.muted },
  }[tone];
  return (
    <View className="flex-row items-center px-2.5 py-1 rounded-full" style={{ backgroundColor: t.bg }}>
      {Icon ? <Icon size={12} color={t.fg} /> : null}
      <Text className="text-[11px] font-extrabold" style={{ color: t.fg, marginLeft: Icon ? 4 : 0 }}>{label}</Text>
    </View>
  );
}

function KV({ label, value }) {
  return (
    <View className="flex-row mt-1">
      <Text className="text-[11.5px]" style={{ color: C.muted, width: 72 }}>{label}</Text>
      <Text className="flex-1 text-[11.5px] font-semibold leading-4" style={{ color: C.text }}>{value}</Text>
    </View>
  );
}

function KVRow({ label, value, color, bold, muted }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-[12px]" style={{ color: bold ? C.text : '#374151', fontWeight: bold ? '800' : '400' }}>{label}</Text>
      <Text className="text-[12px]" style={{ color: muted ? C.muted : color || C.text, fontWeight: muted ? '400' : '700' }}>{value}</Text>
    </View>
  );
}

function SubHead({ label, total }) {
  return (
    <View className="flex-row items-center justify-between pb-1.5" style={{ borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text className="text-[11px] font-extrabold" style={{ color: C.teal, letterSpacing: 0.4 }}>{label}</Text>
      {total != null ? <Text className="text-[12px] font-extrabold" style={{ color: C.text }}>₹{fmt(total)}</Text> : null}
    </View>
  );
}

function ItemRow({ title, meta, total, br, open, onToggle }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className="py-2"
      style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <Text className="text-[12.5px] font-bold" style={{ color: C.text }}>{title}</Text>
          <Text className="text-[11px] mt-0.5" style={{ color: C.muted }}>{meta}</Text>
        </View>
        <Text className="text-[12.5px] font-extrabold" style={{ color: C.text }}>₹{fmt(total)}</Text>
        <ChevronDown size={15} color={C.muted} style={{ marginLeft: 4, marginTop: 1, transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </View>
      {open ? (
        <View className="mt-1.5 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: '#F8FAFB' }}>
          <KVRow label="Taxable value" value={`₹${fmt(br.base)}`} />
          <KVRow label="CGST" value={`₹${fmt(br.cgst)}`} />
          <KVRow label="SGST" value={`₹${fmt(br.sgst)}`} />
          <KVRow label="Total GST" value={`₹${fmt(br.totalGst)}`} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function MetaRow({ label, value }) {
  return (
    <View className="flex-row items-center mt-1">
      <Text className="text-[10px] text-gray-500" style={{ width: 84 }}>{label}</Text>
      <Text className="text-[10px] text-gray-700 font-semibold">: </Text>
      <Text className="text-[10px] font-bold text-gray-900" numberOfLines={1}>{value}</Text>
    </View>
  );
}

// HTML escape — keep the invoice safe from values containing &, <, >, etc.
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function fmtH(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const MONTHS_H = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "27 Oct 2026 · 16:27" — the date style of the printed invoice.
function fmtStampH(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${MONTHS_H[d.getMonth()]} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Render the on-screen invoice as a printable HTML document. The
// <title> drives the suggested file name on Android share sheets.
function buildHtml({
  invoice, ticket, spareLines, serviceLines,
  shopName, shopMobile, shopAddress, shopGst, ownerDisplayName,
  customerName, customerAddress, trackingId, deviceModel, deviceImei, deviceVariant, altPhone,
  totalServiceGross, totalServiceBreak, totalSpareGross, totalSpareBreak,
  grandTotalBreak,
}) {
  const gstPct = Number(invoice.gstPercent) || 0;
  const halfGst = gstPct / 2;
  // Per-row tax breakdown. Returns base / cgst / sgst / totalGst / total
  // consistent with the saved invoice.taxMode — so when the invoice was saved
  // as WITHOUT, every per-row GST cell is 0 (matching invoice.totalGst).
  const breakRow = (gross) => {
    if (invoice.taxMode === 'WITHOUT' || gstPct === 0) {
      return { base: +gross.toFixed(2), cgst: 0, sgst: 0, totalGst: 0, total: +gross.toFixed(2) };
    }
    if (invoice.taxMode === 'INCLUSIVE') {
      const base = gross / (1 + gstPct / 100);
      const cgst = +(base * (halfGst / 100)).toFixed(2);
      const sgst = +(base * (halfGst / 100)).toFixed(2);
      return {
        base: +base.toFixed(2),
        cgst, sgst,
        totalGst: +(gross - base).toFixed(2),
        total: +gross.toFixed(2),
      };
    }
    // EXCLUSIVE
    const base = gross;
    const cgst = +(base * (halfGst / 100)).toFixed(2);
    const sgst = +(base * (halfGst / 100)).toFixed(2);
    const totalGstRow = +(base * (gstPct / 100)).toFixed(2);
    return {
      base: +base.toFixed(2),
      cgst, sgst,
      totalGst: totalGstRow,
      total: +(base + totalGstRow).toFixed(2),
    };
  };

  // Same accumulator + stored-breakdown preference used by the on-screen
  // tables. Avoids the double-divide bug where serviceLinesJson stores
  // taxableValue = base (already divided) and the PDF re-divided it.
  const accumulate = (rows) => rows.reduce((acc, br) => ({
    base: +(acc.base + br.base).toFixed(2),
    cgst: +(acc.cgst + br.cgst).toFixed(2),
    sgst: +(acc.sgst + br.sgst).toFixed(2),
    totalGst: +(acc.totalGst + br.totalGst).toFixed(2),
    total: +(acc.total + br.total).toFixed(2),
  }), { base: 0, cgst: 0, sgst: 0, totalGst: 0, total: 0 });

  const breakLine = (row, fallbackGross) => {
    if (row && (row.totalGst !== undefined || row.cgst !== undefined || row.totalAmount !== undefined)) {
      const cgst = Number(row.cgst) || 0;
      const sgst = Number(row.sgst) || 0;
      const totalGst = Number(row.totalGst) || 0;
      const total = Number(row.totalAmount) || fallbackGross;
      return { base: +(total - totalGst).toFixed(2), cgst, sgst, totalGst, total };
    }
    return breakRow(fallbackGross);
  };

  const serviceBreaks = serviceLines.map((row) => breakLine(row, Number(row.totalAmount) || Number(row.rate) || 0));
  const spareBreaks = spareLines.map((row) => breakLine(row, Number(row.totalAmount) || ((Number(row.taxableValue) || 0) * (Number(row.qty) || 1))));
  const serviceTotal = accumulate(serviceBreaks);
  const sparesTotal = accumulate(spareBreaks);

  // Device line as "Vivo Y20G (V2037)": deviceModel arrives "name · model no".
  const [deviceName, ...deviceNos] = String(deviceModel || '').split(' · ');
  const deviceLabel = deviceNos.length ? `${deviceName} (${deviceNos.join(' · ')})` : deviceName;
  const phoneH = (m) => {
    const d = String(m || '').replace(/\D/g, '');
    return d.length === 10 ? `+91 ${d}` : String(m || '');
  };
  const qtyH = (q) => {
    const n = Number(q) || 1;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  };

  const serviceRows = serviceLines.length ? serviceLines.map((row, i) => {
    const br = serviceBreaks[i];
    return `<tr>
      <td>${esc(row.description || `Service ${i + 1}`)}</td>
      <td class="r">₹${fmtH(row.rate)}</td>
      <td class="r">₹${fmtH(br.base)}</td>
      <td class="r">₹${fmtH(br.totalGst)}</td>
      <td class="r t">₹${fmtH(br.total)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="none">No service charges</td></tr>';

  const spareRows = spareLines.length ? spareLines.map((row, i) => {
    const br = spareBreaks[i];
    return `<tr>
      <td>${esc(row.description || `Part ${i + 1}`)}</td>
      <td class="c">${esc(row.warranty || '—')}</td>
      <td class="c">${qtyH(row.qty)}</td>
      <td class="r">₹${fmtH(row.rate)}</td>
      <td class="r">₹${fmtH(br.totalGst)}</td>
      <td class="r t">₹${fmtH(br.total)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="none">No spare parts</td></tr>';

  const gt = grandTotalBreak || { base: 0, cgst: 0, sgst: 0, totalGst: 0, total: 0 };
  const discountAmount  = Number(invoice.discount) || 0;
  const invoiceTotal    = Number(invoice.finalPayableAmount) || 0;

  // Payment & credit, read off the invoice row exactly like the on-screen
  // card, so the PDF carries the same outstanding figure the Cash Book holds.
  // A bill with nothing paid or owed shows no Paid / Balance rows rather than
  // a "₹0.00 due" it cannot vouch for.
  const advancePaidH  = Number(invoice.advancePaid) || 0;
  const amountPaidH   = Number(invoice.amountPaid) || 0;
  const creditAmountH = Number(invoice.creditAmount) || 0;
  const payShownH     = advancePaidH > 0 || amountPaidH > 0 || creditAmountH > 0;
  const dueTone = creditAmountH > 0
    ? { bg: '#FEF3C7', fg: '#B45309' }
    : { bg: '#E7F4EC', fg: '#2F8F5B' };
  // Filename hint for Android share sheets: many viewers (WhatsApp,
  // Drive, etc.) suggest the HTML <title> as the saved filename when
  // the file is shared, so we set it to match the renamed PDF.
  const fileTitle = `Mobile_service_Invoice_${String(invoice.invoiceNo || trackingId).replace(/[^A-Za-z0-9_-]+/g, '_')}`;
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>${esc(fileTitle)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #111827; font-size: 11px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .card { border: 1px solid #E1E8EB; border-radius: 12px; padding: 11px 14px 12px; margin-top: 9px; page-break-inside: avoid; break-inside: avoid; }
  .lbl { font-size: 8.5px; color: #6B7280; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
  .sec { display: flex; align-items: center; font-size: 11px; font-weight: 800; color: #035C6C; text-transform: uppercase; letter-spacing: .3px; margin-bottom: 8px; }
  .sec::before { content: ''; width: 4px; height: 13px; background: #035C6C; border-radius: 2px; margin-right: 10px; }

  /* Header band */
  .hdr { background: #E5F3F5; border-left: 5px solid #035C6C; border-radius: 14px; padding: 11px 18px 13px; page-break-inside: avoid; }
  .hdr .top { display: flex; justify-content: space-between; }
  .pill { background: #FFFFFF; color: #035C6C; font-weight: 700; font-size: 9px; letter-spacing: .4px; padding: 4px 18px; border-radius: 999px; }
  .hdr .body { display: flex; align-items: center; margin-top: 7px; }
  .hdr .shop { flex: 1; padding-right: 16px; }
  .hdr h1 { font-size: 23px; font-weight: 800; color: #035C6C; letter-spacing: -.3px; }
  .hdr .who { font-size: 11.5px; margin-top: 3px; }
  .hdr .addr { font-size: 9.5px; color: #6B7280; margin-top: 4px; }
  .hdr .tot { border-left: 1px solid #B7D7DD; padding: 4px 0 4px 18px; text-align: right; min-width: 170px; }
  .hdr .tot .v { font-size: 22px; font-weight: 800; color: #035C6C; margin-top: 3px; }

  /* Invoice meta strip */
  .meta { display: flex; background: #F5FAFB; border: 1px solid #DCE7EA; border-radius: 10px; margin-top: 8px; page-break-inside: avoid; }
  .meta > div { flex: 1; padding: 7px 14px 8px; }
  .meta > div + div { border-left: 1px solid #DCE7EA; }
  .meta .v { font-size: 11.5px; font-weight: 700; margin-top: 4px; }

  /* Parties */
  .parties { display: flex; }
  .parties > div { flex: 1; }
  .parties > div + div { border-left: 1px solid #E5E7EB; padding-left: 18px; }
  .parties .name { font-size: 14px; font-weight: 800; margin-top: 3px; }
  .parties .ln { font-size: 10px; color: #6B7280; margin-top: 3px; }
  .parties .ln.d { color: #111827; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  th { background: #F1F6F7; color: #6B7280; font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; text-align: left; padding: 6px 10px; }
  td { font-size: 11px; padding: 7px 10px; border-bottom: 1px solid #E5E7EB; }
  .r { text-align: right; }
  .c { text-align: center; }
  .t { color: #035C6C; font-weight: 700; }
  .none { color: #6B7280; font-style: italic; }
  tr.sub td { border-bottom: none; color: #6B7280; font-size: 10px; font-weight: 600; padding: 6px 10px 1px; }
  tr.sub td.t { color: #035C6C; font-size: 11px; font-weight: 700; }
  tr.tax td { border-bottom: none; font-size: 12px; font-weight: 700; padding-top: 8px; padding-bottom: 2px; }

  /* Payment */
  .pay { display: flex; }
  .pay .lft { flex: 1; padding-right: 16px; border-right: 1px solid #E5E7EB; }
  .pay .rgt { flex: 1; padding-left: 16px; }
  .row { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; color: #6B7280; }
  .row b { color: #111827; font-weight: 700; }
  .words { font-size: 9px; color: #6B7280; font-style: italic; margin-top: 4px; }
  .totbox { background: #035C6C; color: #FFFFFF; border-radius: 10px; padding: 8px 14px 9px; }
  .totbox .l { font-size: 9px; font-weight: 700; letter-spacing: .4px; }
  .totbox .v { font-size: 19px; font-weight: 800; text-align: right; margin-top: 1px; }
  .due { display: flex; justify-content: space-between; align-items: center; border-radius: 8px; padding: 6px 12px; margin-top: 4px; }
  .due .l { font-size: 9px; font-weight: 700; letter-spacing: .4px; }
  .due .v { font-size: 15px; font-weight: 800; }

  /* Footer: declaration, then customer / authorised person names, then thanks.
     One unit for pagination — never split, never alone on a blank page. */
  .foot { margin-top: 10px; page-break-inside: avoid; break-inside: avoid; }
  .decl { background: #F3F8F9; border-radius: 10px; padding: 8px 14px 9px; font-size: 9.5px; line-height: 1.45; color: #374151; }
  .decl .dh { color: #035C6C; font-weight: 800; text-transform: uppercase; font-size: 9.5px; letter-spacing: .3px; margin-bottom: 2px; }
  .names { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 11px; padding: 0 2px; }
  .names .v { font-weight: 800; color: #111111; font-size: 12.5px; margin-top: 4px; }
  .names .s { color: #6B7280; font-size: 9.5px; margin-top: 2px; }
  .thank { margin-top: 10px; padding-top: 7px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 10px; color: #6B7280; }
</style></head>
<body>
  <div class="hdr">
    <div class="top"><span class="pill">TAX INVOICE</span><span class="pill">ORIGINAL COPY</span></div>
    <div class="body">
      <div class="shop">
        <h1>${esc(shopName)}</h1>
        <div class="who">${ownerDisplayName ? `${esc(ownerDisplayName)}&nbsp;&nbsp;|&nbsp;&nbsp;` : ''}${esc(phoneH(shopMobile))}</div>
        ${shopAddress ? `<div class="addr">${esc(shopAddress)}</div>` : ''}
        ${shopGst ? `<div class="addr">GSTIN : ${esc(shopGst)}</div>` : ''}
      </div>
      <div class="tot">
        <div class="lbl">Invoice Total</div>
        <div class="v">₹${fmtH(invoiceTotal)}</div>
      </div>
    </div>
  </div>

  <div class="meta">
    <div><div class="lbl">Invoice No</div><div class="v">${esc(invoice.invoiceNo)}</div></div>
    <div><div class="lbl">Ticket Date</div><div class="v">${esc(fmtStampH(invoice.ticketDate))}</div></div>
    <div><div class="lbl">Delivered On</div><div class="v">${esc(fmtStampH(invoice.generatedAt || invoice.deliveryDate))}</div></div>
  </div>

  <div class="card">
    <div class="sec">Parties &amp; Device</div>
    <div class="parties">
      <div>
        <div class="lbl">Billed To</div>
        <div class="name">${esc(customerName || '—')}</div>
        ${ticket?.customerPhone ? `<div class="ln">Mobile&nbsp;·&nbsp;${esc(ticket.customerPhone)}</div>` : ''}
        ${altPhone ? `<div class="ln">Alt. Mobile&nbsp;·&nbsp;${esc(altPhone)}</div>` : ''}
        ${customerAddress ? `<div class="ln">${esc(customerAddress)}</div>` : ''}
        ${deviceLabel ? `<div class="ln d">Device&nbsp;·&nbsp;${esc(deviceLabel)}</div>` : ''}
        ${deviceVariant ? `<div class="ln d">Variant&nbsp;·&nbsp;${esc(deviceVariant)}</div>` : ''}
        ${deviceImei ? `<div class="ln d">IMEI&nbsp;·&nbsp;${esc(deviceImei)}</div>` : ''}
      </div>
      <div>
        <div class="lbl">Issued By</div>
        <div class="name">${esc(shopName)}</div>
        ${shopMobile ? `<div class="ln">Mobile&nbsp;·&nbsp;${esc(shopMobile)}</div>` : ''}
        ${shopAddress ? `<div class="ln">${esc(shopAddress)}</div>` : ''}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="sec">A&nbsp;&nbsp;/&nbsp;&nbsp;Service Charges</div>
    <table>
      <thead><tr><th>Description</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">Total</th></tr></thead>
      <tbody>
        ${serviceRows}
        <tr class="sub"><td colspan="4">Service Subtotal</td><td class="r t">₹${fmtH(serviceTotal.total)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="sec">B&nbsp;&nbsp;/&nbsp;&nbsp;Spare Parts</div>
    <table>
      <thead><tr><th>Description</th><th class="c">Warranty</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Tax</th><th class="r">Total</th></tr></thead>
      <tbody>
        ${spareRows}
        <tr class="sub"><td colspan="5">Spare Parts Subtotal</td><td class="r t">₹${fmtH(sparesTotal.total)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="sec">Tax Summary</div>
    <table>
      <thead><tr>
        <th>Taxable Value</th>
        <th class="r">CGST${halfGst ? ` (${halfGst}%)` : ''}</th>
        <th class="r">SGST${halfGst ? ` (${halfGst}%)` : ''}</th>
        <th class="r">IGST</th>
        <th class="r">Total Tax</th>
      </tr></thead>
      <tbody><tr class="tax">
        <td>₹${fmtH(gt.base)}</td>
        <td class="r">₹${fmtH(gt.cgst)}</td>
        <td class="r">₹${fmtH(gt.sgst)}</td>
        <td class="r">₹${fmtH(0)}</td>
        <td class="r t">₹${fmtH(gt.totalGst)}</td>
      </tr></tbody>
    </table>
  </div>

  <div class="card">
    <div class="sec">Payment Summary</div>
    <div class="pay">
      <div class="lft">
        <div class="row"><span>Taxable amount</span><b>₹${fmtH(gt.base)}</b></div>
        <div class="row"><span>GST</span><b>₹${fmtH(gt.totalGst)}</b></div>
        <div class="row"><span>Discount</span><b style="color:#C2410C">− ₹${fmtH(discountAmount)}</b></div>
        ${invoice.amountInWords ? `<div class="words">In words : ${esc(invoice.amountInWords)}</div>` : ''}
      </div>
      <div class="rgt">
        <div class="totbox"><div class="l">INVOICE TOTAL</div><div class="v">₹${fmtH(invoiceTotal)}</div></div>
        ${payShownH ? `
        ${advancePaidH > 0 ? `<div class="row" style="margin-top:4px"><span>Advance paid</span><b>₹${fmtH(advancePaidH)}</b></div>` : ''}
        <div class="row" style="${advancePaidH > 0 ? '' : 'margin-top:4px'}"><span>${advancePaidH > 0 ? 'Paid now' : 'Paid'}</span><b>₹${fmtH(amountPaidH)}</b></div>
        <div class="due" style="background:${dueTone.bg};color:${dueTone.fg}">
          <span class="l">BALANCE DUE</span><span class="v">₹${fmtH(creditAmountH)}</span>
        </div>
        ${creditAmountH > 0 && invoice.paymentNote ? `<div class="words">Note : ${esc(invoice.paymentNote)}</div>` : ''}
        ` : ''}
      </div>
    </div>
  </div>

  <!-- Footer: Declaration → Customer Name (left) + Authorised Person (right)
       → Thank you. Names only, no signature boxes. -->
  <div class="foot">
    <div class="decl">
      <div class="dh">Declaration</div>
      We declare that this invoice reflects the actual service charges and spare parts used for the above-mentioned device, and all the particulars stated above are true and correct.
    </div>
    <div class="names">
      <div>
        <div class="lbl">Customer Name</div>
        <div class="v">${esc(customerName || '—')}</div>
      </div>
      <div style="text-align:right">
        <div class="lbl">Authorised Person</div>
        <div class="v">${esc(ownerDisplayName || shopName)}</div>
        ${ownerDisplayName ? `<div class="s">${esc(shopName)}</div>` : ''}
      </div>
    </div>
    <div class="thank">Thank you for choosing ${esc(shopName)}</div>
  </div>
</body></html>`;
}
