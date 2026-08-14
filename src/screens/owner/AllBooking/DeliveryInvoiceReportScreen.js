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
import { ChevronLeft, Download, Share2, Printer } from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { saveToDownloads, notifyDownloaded } from '../../../lib/downloads';
import { ticketApi, authApi } from '../../../api/client';
import { getSession } from '../../../auth/session';

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
// expo-file-system v19+ ships two surfaces:
//   - top-level `Paths` / `File` / `Directory` classes (the new API)
//   - `expo-file-system/legacy` with the old `cacheDirectory` /
//     `copyAsync` / `deleteAsync` (the top-level legacy fns THROW
//     at runtime — they only stay as type-level shims).
// Try the new API first, then fall back to the legacy submodule.
const getFileSystemModule = () => {
  try { return require('expo-file-system'); } catch { return null; }
};
const getLegacyFileSystem = () => {
  try { return require('expo-file-system/legacy'); } catch { return null; }
};

// Sanitise a string for safe use as a filename on Android / iOS / Windows.
function safeFilename(s) {
  return String(s || 'document')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
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

function safeJson(s, fallback) {
  if (!s) return fallback;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}

export default function DeliveryInvoiceReportScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [shop, setShop] = useState(null);     // public shop card (name/mobile/address/gst)
  const [owner, setOwner] = useState(null);   // logged-in owner session (name + phone)
  const [customer, setCustomer] = useState(null); // customer record (for address fallback)
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
      if (t?.customerPhone && !t?.customerAddress) {
        try {
          const c = await ticketApi.get(`/customers/lookup`, { query: { mobile: t.customerPhone } });
          setCustomer(c || null);
        } catch { setCustomer(null); }
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader label="Loading invoice..." />;
  if (!invoice) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: '#F0F8EF' }}>
        <Text className="text-[15px] font-extrabold text-gray-700">No invoice generated yet</Text>
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
  const shopName    = shop?.name || ticket?.shopName || 'GGFix Service Center';
  const shopMobile  = shop?.mobile || owner?.phone || '';
  const shopAddress = shop?.address || ticket?.shopAddress || '';
  const shopGst     = shop?.gstNumber || invoice?.gstNo || '';
  const ownerDisplayName = owner?.name || '';
  const customerName = ticket?.customerName || '';
  const trackingId = ticket?.trackingId || invoice?.invoiceNo || ticketId;

  // Resolved customer address: prefer the ticket's denormalized snapshot,
  // then the fetched customer's `address` (legacy concat), then a freshly
  // composed line from structured columns (addressLine / area / district /
  // state / pincode). Falls back to '—' so the receipt always shows the row.
  const composedCustomerAddr = customer
    ? [customer.addressLine, customer.area || customer.locality, customer.district || customer.city, customer.state, customer.pincode]
        .filter((p) => p && String(p).trim())
        .join(', ')
    : '';
  const customerAddress =
    ticket?.customerAddress
    || customer?.address
    || composedCustomerAddr
    || '—';

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
    customerName, customerAddress, trackingId,
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
    const fail = (title, message) => Alert.alert(title, message || '');
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
        stem: `GGFix_Invoice_${safeFilename(invoice.invoiceNo || trackingId)}`,
        extension: 'pdf',
        mimeType: 'application/pdf',
        sourceUri: printed.uri,
      });
      notify('Invoice downloaded successfully to Downloads.', saved.name, { preset: 'done' });
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
    const fail = (title, message) => Alert.alert(title, message || '');

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

      // Step 2: best-effort rename. The renamed file makes the receiving app
      // (WhatsApp/Drive/Gmail) display a friendly filename. If anything
      // breaks here we silently keep the temp URI — share must still fire.
      const fileBase = `Mobile_service_Invoice_${safeFilename(invoice.invoiceNo || trackingId)}`;
      const fileName = `${fileBase}.pdf`;
      let sharedUri = tempUri;
      try {
        sharedUri = await renamePdf(tempUri, fileName) || tempUri;
      } catch (_) { /* fall through with tempUri */ }

      // Step 3: share. Don't gate on isAvailableAsync — on Android it can
      // return false in some build types even though shareAsync works fine.
      try {
        await Sharing.shareAsync(sharedUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: fileName,
        });
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

  // Best-effort PDF rename. Tries new expo-file-system v19+ API first
  // (`Paths.cache` + `new File(...).copy()`), then the legacy submodule.
  // Returns the renamed URI or null when both paths fail.
  const renamePdf = async (sourceUri, fileName) => {
    const FileSystem = getFileSystemModule();
    if (FileSystem && FileSystem.Paths && FileSystem.File) {
      try {
        const cacheDir = FileSystem.Paths.cache;
        const dest = new FileSystem.File(cacheDir, fileName);
        try { dest.delete(); } catch (_) {}
        const src = new FileSystem.File(sourceUri);
        const maybePromise = src.copy(dest);
        if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
        return dest.uri;
      } catch (_) { /* fall through to legacy */ }
    }
    const Legacy = getLegacyFileSystem();
    if (Legacy?.cacheDirectory && Legacy?.copyAsync) {
      try {
        const targetUri = Legacy.cacheDirectory + fileName;
        try { await Legacy.deleteAsync(targetUri, { idempotent: true }); } catch (_) {}
        await Legacy.copyAsync({ from: sourceUri, to: targetUri });
        return targetUri;
      } catch (_) { /* give up */ }
    }
    return null;
  };

  const Cell = ({ children, w, bold, right, mono }) => (
    <Text
      className={`text-[10px] ${bold ? 'font-extrabold text-gray-900' : 'text-gray-700'} ${right ? 'text-right' : ''}`}
      style={{ width: w, paddingHorizontal: 4, paddingVertical: 6 }}
      numberOfLines={2}
    >
      {children}
    </Text>
  );

  const HeaderCell = ({ children, w, right }) => (
    <Text
      className={`text-[9px] font-extrabold text-gray-700 ${right ? 'text-right' : ''}`}
      style={{ width: w, paddingHorizontal: 4, paddingVertical: 6, letterSpacing: 0.4 }}
    >
      {children}
    </Text>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

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
            Deliver Invoice
          </Text>
          {/* Ticket no · Download · Share. These used to be a sticky bar across
              the bottom of the screen, which cost a whole row of the invoice on
              every scroll for two buttons. The number is a label, not a button,
              so it stays flat; the two actions get tap targets. */}
          <View
            className="px-2 py-1 rounded-full bg-surface-muted"
            style={{ maxWidth: 108 }}
          >
            <Text className="text-text text-[10.5px] font-extrabold" numberOfLines={1}>
              #{invoice.invoiceNo}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDownload}
            disabled={downloading || sharing}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Download invoice PDF"
            className="w-9 h-9 rounded-full items-center justify-center ml-1.5 bg-surface-muted"
            style={{ opacity: downloading || sharing ? 0.5 : 1 }}
          >
            {downloading
              ? <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
              : <Download size={18} color={BRAND_GREEN_DARK} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            disabled={downloading || sharing}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share invoice PDF"
            className="w-9 h-9 rounded-full items-center justify-center ml-1.5 bg-surface-muted"
            style={{ opacity: downloading || sharing ? 0.5 : 1 }}
          >
            {sharing
              ? <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
              : <Share2 size={17} color={BRAND_GREEN_DARK} />}
          </TouchableOpacity>
        </View>

        {/* Hero — key number surfaced in the header so the owner sees the
            payable amount immediately, without scrolling to the summary. */}
        <View className="flex-row items-end justify-between mt-3">
          <View>
            <Text className="text-[9.5px] font-bold text-text-muted" style={{ letterSpacing: 0.8 }}>
              INVOICE TOTAL
            </Text>
            <Text className="text-text text-[27px] font-extrabold" style={{ marginTop: 1, letterSpacing: -0.5 }}>
              ₹{fmt(invoice.finalPayableAmount)}
            </Text>
          </View>
          <View className="items-end pb-1">
            <Text className="text-[9.5px] text-text-muted">Delivery date</Text>
            <Text className="text-text text-[11px] font-bold mt-0.5" numberOfLines={1}>
              {formatDateTime(invoice.generatedAt || invoice.deliveryDate)}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Letterhead + Meta — shop legal name on the left, invoice
            metadata on the right. Delivery Date now reflects the moment
            the invoice was generated (not the booking's estimated delivery)
            so the line tracks the actual invoice timestamp. */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            <View className="flex-row items-start">
              <View className="flex-1 pr-3">
                <Text className="text-[18px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                  {shopName}
                </Text>
                {ownerDisplayName ? (
                  <Text className="text-[11px] font-semibold text-gray-700 mt-0.5">
                    {ownerDisplayName}
                  </Text>
                ) : null}
                {shopMobile ? (
                  <Text className="text-[10.5px] text-gray-500 mt-1">Mobile : {shopMobile}</Text>
                ) : null}
              </View>
              <View>
                <Text className="text-[10px] font-extrabold text-gray-500 text-right" style={{ letterSpacing: 0.4 }}>
                  Original for Deliver Receipt
                </Text>
                <MetaRow label="Invoice No" value={invoice.invoiceNo} />
                <MetaRow label="Ticket Date" value={formatDateTime(invoice.ticketDate)} />
                <MetaRow label="Delivery Date" value={formatDateTime(invoice.generatedAt || invoice.deliveryDate)} />
                {shopGst ? <MetaRow label="GST No" value={shopGst} /> : null}
              </View>
            </View>

            <View className="my-3" style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2' }} />

            {/* Bill To / From */}
            <View className="flex-row">
              <View className="flex-1 pr-2">
                <Text className="text-[10px] font-extrabold text-gray-500" style={{ letterSpacing: 0.4 }}>
                  TO:
                </Text>
                <Text className="text-[13px] font-extrabold text-gray-900 mt-1">
                  {ticket?.customerName || '—'}
                </Text>
                {customerAddress && customerAddress !== '—' ? (
                  <Text className="text-[11px] text-gray-600 mt-1 leading-4">
                    {customerAddress}
                  </Text>
                ) : null}
                {ticket?.customerPhone ? (
                  <Text className="text-[11px] text-gray-700 mt-2 font-semibold">
                    Mobile : {ticket.customerPhone}
                  </Text>
                ) : null}
              </View>
              <View className="flex-1 pl-2 items-end">
                <Text className="text-[10px] font-extrabold text-gray-500" style={{ letterSpacing: 0.4 }}>
                  FROM:
                </Text>
                <Text className="text-[13px] font-extrabold text-gray-900 mt-1 text-right">
                  {shopName}
                </Text>
                {shopMobile ? (
                  <Text className="text-[11px] text-gray-700 mt-1 text-right font-semibold">
                    Mobile : {shopMobile}
                  </Text>
                ) : null}
                {shopAddress ? (
                  <Text className="text-[11px] text-gray-600 mt-1 text-right leading-4">
                    {shopAddress}
                  </Text>
                ) : null}
                {shopGst ? (
                  <Text className="text-[11px] text-gray-700 mt-1 text-right font-semibold">
                    GSTIN : {shopGst}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* (A) Service — 8 columns matching the reference (adds Total). */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl overflow-hidden" style={cardShadow}>
            <View className="px-4 pt-3 pb-1">
              <SectionLabel>(A) Service</SectionLabel>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ backgroundColor: '#F7FAF7', flexDirection: 'row' }}>
                  <HeaderCell w={28}>Sl</HeaderCell>
                  <HeaderCell w={130}>Description</HeaderCell>
                  <HeaderCell w={70} right>Rate (₹)</HeaderCell>
                  <HeaderCell w={82} right>Taxable Value</HeaderCell>
                  <HeaderCell w={60} right>CGST</HeaderCell>
                  <HeaderCell w={60} right>SGST</HeaderCell>
                  <HeaderCell w={72} right>Total GST</HeaderCell>
                  <HeaderCell w={70} right>Total</HeaderCell>
                </View>
                {serviceLines.length === 0 ? (
                  <View className="px-3 py-3"><Text className="text-[11px] text-gray-500">—</Text></View>
                ) : serviceLines.map((row, i) => {
                  const br = serviceBreaks[i];
                  return (
                    <View
                      key={i}
                      className="flex-row"
                      style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
                    >
                      <Cell w={28}>{row.slNo || i + 1}</Cell>
                      <Cell w={130}>{row.description}</Cell>
                      <Cell w={70} right>{fmt(row.rate)}</Cell>
                      <Cell w={82} right>{fmt(br.base)}</Cell>
                      <Cell w={60} right>{fmt(br.cgst)}</Cell>
                      <Cell w={60} right>{fmt(br.sgst)}</Cell>
                      <Cell w={72} right bold>{fmt(br.totalGst)}</Cell>
                      <Cell w={70} right bold>{fmt(br.total)}</Cell>
                    </View>
                  );
                })}
                <View
                  className="flex-row"
                  style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2', backgroundColor: '#F0F8EF' }}
                >
                  <Cell w={28} bold></Cell>
                  <Cell w={130} bold>Total Amount (₹)</Cell>
                  <Cell w={70} right bold>{fmt(totalServiceGross)}</Cell>
                  <Cell w={82} right bold>{fmt(totalServiceBreak.base)}</Cell>
                  <Cell w={60} right bold>{fmt(totalServiceBreak.cgst)}</Cell>
                  <Cell w={60} right bold>{fmt(totalServiceBreak.sgst)}</Cell>
                  <Cell w={72} right bold>{fmt(totalServiceBreak.totalGst)}</Cell>
                  <Cell w={70} right bold>{fmt(totalServiceBreak.total)}</Cell>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>

        {/* (B) Spares table — also horizontal-scrollable so the right-edge
            GST column can't slip behind a floating overflow menu. */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl overflow-hidden" style={cardShadow}>
            <View className="px-4 pt-3 pb-1">
              <SectionLabel>(B) Spares</SectionLabel>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ backgroundColor: '#F7FAF7', flexDirection: 'row' }}>
                  <HeaderCell w={28}>Sl</HeaderCell>
                  <HeaderCell w={130}>Description</HeaderCell>
                  <HeaderCell w={64}>Warranty</HeaderCell>
                  <HeaderCell w={44} right>Qty</HeaderCell>
                  <HeaderCell w={68} right>Rate</HeaderCell>
                  <HeaderCell w={82} right>Taxable Value</HeaderCell>
                  <HeaderCell w={60} right>CGST</HeaderCell>
                  <HeaderCell w={60} right>SGST</HeaderCell>
                  <HeaderCell w={72} right>Total GST</HeaderCell>
                  <HeaderCell w={70} right>Total</HeaderCell>
                </View>
                {spareLines.length === 0 ? (
                  <View className="px-3 py-3"><Text className="text-[11px] text-gray-500">—</Text></View>
                ) : spareLines.map((row, i) => {
                  const br = spareBreaks[i];
                  return (
                    <View
                      key={i}
                      className="flex-row"
                      style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
                    >
                      <Cell w={28}>{row.slNo || i + 1}</Cell>
                      <Cell w={130}>{row.description}</Cell>
                      <Cell w={64}>{row.warranty || '—'}</Cell>
                      <Cell w={44} right>{Number(row.qty || 1).toFixed(2)}</Cell>
                      <Cell w={68} right>{fmt(row.rate)}</Cell>
                      <Cell w={82} right>{fmt(br.base)}</Cell>
                      <Cell w={60} right>{fmt(br.cgst)}</Cell>
                      <Cell w={60} right>{fmt(br.sgst)}</Cell>
                      <Cell w={72} right bold>{fmt(br.totalGst)}</Cell>
                      <Cell w={70} right bold>{fmt(br.total)}</Cell>
                    </View>
                  );
                })}
                <View
                  className="flex-row"
                  style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2', backgroundColor: '#F0F8EF' }}
                >
                  <Cell w={28} bold></Cell>
                  <Cell w={130} bold>Total Amount (₹)</Cell>
                  <Cell w={64}></Cell>
                  <Cell w={44}></Cell>
                  <Cell w={68} right bold>{fmt(totalSpareGross)}</Cell>
                  <Cell w={82} right bold>{fmt(totalSpareBreak.base)}</Cell>
                  <Cell w={60} right bold>{fmt(totalSpareBreak.cgst)}</Cell>
                  <Cell w={60} right bold>{fmt(totalSpareBreak.sgst)}</Cell>
                  <Cell w={72} right bold>{fmt(totalSpareBreak.totalGst)}</Cell>
                  <Cell w={70} right bold>{fmt(totalSpareBreak.total)}</Cell>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Tax Summary — consolidated Service + Spares + Grand Total. */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl overflow-hidden" style={cardShadow}>
            <View className="px-4 pt-3 pb-1">
              <SectionLabel>Tax Summary</SectionLabel>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ backgroundColor: '#F7FAF7', flexDirection: 'row' }}>
                  <HeaderCell w={28}>Sl</HeaderCell>
                  <HeaderCell w={120}>Description</HeaderCell>
                  <HeaderCell w={92} right>Taxable Value</HeaderCell>
                  <HeaderCell w={68} right>CGST</HeaderCell>
                  <HeaderCell w={68} right>SGST</HeaderCell>
                  <HeaderCell w={80} right>Total GST</HeaderCell>
                  <HeaderCell w={80} right>Total</HeaderCell>
                </View>
                <View className="flex-row" style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}>
                  <Cell w={28}>1</Cell>
                  <Cell w={120}>Service</Cell>
                  <Cell w={92} right>{fmt(totalServiceBreak.base)}</Cell>
                  <Cell w={68} right>{fmt(totalServiceBreak.cgst)}</Cell>
                  <Cell w={68} right>{fmt(totalServiceBreak.sgst)}</Cell>
                  <Cell w={80} right>{fmt(totalServiceBreak.totalGst)}</Cell>
                  <Cell w={80} right bold>{fmt(totalServiceBreak.total)}</Cell>
                </View>
                <View className="flex-row" style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}>
                  <Cell w={28}>2</Cell>
                  <Cell w={120}>Spares</Cell>
                  <Cell w={92} right>{fmt(totalSpareBreak.base)}</Cell>
                  <Cell w={68} right>{fmt(totalSpareBreak.cgst)}</Cell>
                  <Cell w={68} right>{fmt(totalSpareBreak.sgst)}</Cell>
                  <Cell w={80} right>{fmt(totalSpareBreak.totalGst)}</Cell>
                  <Cell w={80} right bold>{fmt(totalSpareBreak.total)}</Cell>
                </View>
                <View
                  className="flex-row"
                  style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2', backgroundColor: '#F0F8EF' }}
                >
                  <Cell w={28} bold></Cell>
                  <Cell w={120} bold>Total payable by customer (₹)</Cell>
                  <Cell w={92} right bold>{fmt(grandTotalBreak.base)}</Cell>
                  <Cell w={68} right bold>{fmt(grandTotalBreak.cgst)}</Cell>
                  <Cell w={68} right bold>{fmt(grandTotalBreak.sgst)}</Cell>
                  <Cell w={80} right bold>{fmt(grandTotalBreak.totalGst)}</Cell>
                  <Cell w={80} right bold>{fmt(grandTotalBreak.total)}</Cell>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Total Payable Summary — Taxable Amount → Total GST → Discount →
            Invoice Total (matches the requested 4-row structure). */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            <SectionLabel>Total Payable Summary</SectionLabel>
            <View className="flex-row justify-between py-1">
              <Text className="text-[12px] text-gray-700">Taxable Amount</Text>
              <Text className="text-[12.5px] font-bold text-gray-900">₹{fmt(grandTotalBreak.base)}</Text>
            </View>
            <View className="flex-row justify-between py-1">
              <Text className="text-[12px] text-gray-700">Total GST Tax (₹)</Text>
              <Text className="text-[12.5px] font-bold text-gray-900">₹{fmt(grandTotalBreak.totalGst)}</Text>
            </View>
            <View
              className="flex-row justify-between py-1"
              style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE', borderStyle: 'dashed' }}
            >
              <Text className="text-[12px] text-gray-700">Discount</Text>
              <Text className="text-[12.5px] font-bold" style={{ color: '#B45309' }}>− ₹{fmt(invoice.discount)}</Text>
            </View>
            <View
              className="mt-3 p-3 rounded-2xl flex-row items-center justify-between"
              style={{ backgroundColor: BRAND_GREEN_DARK }}
            >
              <Text className="text-white text-[13.5px] font-extrabold">Invoice Total</Text>
              <Text className="text-white text-[18px] font-extrabold">
                ₹{fmt(invoice.finalPayableAmount)}
              </Text>
            </View>
            {invoice.amountInWords ? (
              <Text className="text-[11px] text-gray-600 mt-2 italic">
                In words: {invoice.amountInWords}
              </Text>
            ) : null}

            {/* Payment & credit. Rendered only when money has actually moved or
                is still owed — on a plain cash-and-carry bill (nothing advanced,
                nothing outstanding) these rows would be four zeroes and noise. */}
            {payShown ? (
              <View
                className="mt-3 pt-3"
                style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
              >
                {advancePaid > 0 ? (
                  <View className="flex-row justify-between py-1">
                    <Text className="text-[12px] text-gray-700">Advance Already Paid</Text>
                    <Text className="text-[12.5px] font-bold" style={{ color: '#B45309' }}>
                      − ₹{fmt(advancePaid)}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row justify-between py-1">
                  <Text className="text-[12px] text-gray-700">Net Payable</Text>
                  <Text className="text-[12.5px] font-bold text-gray-900">₹{fmt(netPayable)}</Text>
                </View>
                {amountPaid > 0 ? (
                  <View className="flex-row justify-between py-1">
                    <Text className="text-[12px] text-gray-700">Amount Paid</Text>
                    <Text className="text-[12.5px] font-bold" style={{ color: '#B45309' }}>
                      − ₹{fmt(amountPaid)}
                    </Text>
                  </View>
                ) : null}
                <View
                  className="mt-2 p-3 rounded-2xl flex-row items-center justify-between"
                  style={{ backgroundColor: creditAmount > 0 ? '#FEF3C7' : '#E6F7E3' }}
                >
                  <Text
                    className="text-[12.5px] font-extrabold"
                    style={{ color: creditAmount > 0 ? '#B45309' : BRAND_GREEN_DARK }}
                  >
                    {creditAmount > 0 ? 'Credit / Balance Payable' : 'Balance Payable'}
                  </Text>
                  <Text
                    className="text-[16px] font-extrabold"
                    style={{ color: creditAmount > 0 ? '#B45309' : BRAND_GREEN_DARK }}
                  >
                    ₹{fmt(creditAmount)}
                  </Text>
                </View>
                {creditAmount > 0 && invoice.paymentNote ? (
                  <Text className="text-[11px] text-gray-600 mt-2 italic">
                    Note: {invoice.paymentNote}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Signature + declaration — the customer's name stands under the
            label on its own; the ruled line it used to sit below is gone, since
            nothing is signed by hand on a screen. The right tile carries the
            legal shop name AND the logged-in owner's name. The shared PDF keeps
            its own ruled line, which is the copy that does get signed. */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            <View className="flex-row">
              <View className="flex-1 pr-2">
                <Text className="text-[11px] text-gray-700">Customer Signature :</Text>
                {customerName ? (
                  <Text className="text-[11px] font-extrabold text-gray-800 mt-1">
                    {customerName}
                  </Text>
                ) : null}
              </View>
              <View
                className="flex-1 ml-2 rounded-xl p-3 items-center"
                style={{ backgroundColor: '#EFF5EE' }}
              >
                <Text className="text-[11px] font-extrabold text-gray-800" numberOfLines={2}>
                  {shopName}
                </Text>
                {ownerDisplayName ? (
                  <Text className="text-[10.5px] font-semibold text-gray-700 mt-0.5" numberOfLines={1}>
                    {ownerDisplayName}
                  </Text>
                ) : null}
                <Text className="text-[10px] text-gray-500 mt-1">Authorised Signatory</Text>
              </View>
            </View>
            <Text className="text-[10px] font-extrabold text-gray-700 mt-4">Declaration</Text>
            <Text className="text-[10.5px] text-gray-600 mt-1 leading-4">
              We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
            </Text>
          </View>
        </View>
      </ScrollView>

    </View>
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

// Consistent section label: a green accent bar + uppercase-ish title, mirroring
// the `.sec` style used in the printable PDF so screen and paper match.
function SectionLabel({ children, color = BRAND_GREEN_DARK }) {
  return (
    <View className="flex-row items-center mb-2">
      <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: BRAND_GREEN, marginRight: 7 }} />
      <Text className="text-[11.5px] font-extrabold" style={{ color, letterSpacing: 0.4 }}>
        {children}
      </Text>
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
function fmtDateH(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Render the on-screen invoice as a printable HTML document. The
// <title> drives the suggested file name on Android share sheets.
function buildHtml({
  invoice, ticket, spareLines, serviceLines,
  shopName, shopMobile, shopAddress, shopGst, ownerDisplayName,
  customerName, customerAddress, trackingId,
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
  const grandTotal = {
    base: +(serviceTotal.base + sparesTotal.base).toFixed(2),
    cgst: +(serviceTotal.cgst + sparesTotal.cgst).toFixed(2),
    sgst: +(serviceTotal.sgst + sparesTotal.sgst).toFixed(2),
    totalGst: +(serviceTotal.totalGst + sparesTotal.totalGst).toFixed(2),
    total: +(serviceTotal.total + sparesTotal.total).toFixed(2),
  };

  const serviceRows = serviceLines.map((row, i) => {
    const br = serviceBreaks[i];
    return `<tr>
      <td>${esc(row.slNo || i + 1)}</td>
      <td>${esc(row.description)}</td>
      <td class="r">${fmtH(row.rate)}</td>
      <td class="r">${fmtH(br.base)}</td>
      <td class="r">${fmtH(br.cgst)}</td>
      <td class="r">${fmtH(br.sgst)}</td>
      <td class="r b">${fmtH(br.totalGst)}</td>
      <td class="r b">${fmtH(br.total)}</td>
    </tr>`;
  }).join('');

  const spareRows = spareLines.map((row, i) => {
    const br = spareBreaks[i];
    return `<tr>
      <td>${esc(row.slNo || i + 1)}</td>
      <td>${esc(row.description)}</td>
      <td>${esc(row.warranty || '—')}</td>
      <td class="r">${Number(row.qty || 1).toFixed(2)}</td>
      <td class="r">${fmtH(row.rate)}</td>
      <td class="r">${fmtH(br.base)}</td>
      <td class="r">${fmtH(br.cgst)}</td>
      <td class="r">${fmtH(br.sgst)}</td>
      <td class="r b">${fmtH(br.totalGst)}</td>
      <td class="r b">${fmtH(br.total)}</td>
    </tr>`;
  }).join('');

  // Compact one-page sharing receipt — paper-thin top header (no big green
  // band), four-up meta strip, side-by-side parties block with both addresses,
  // tight tables, prominent total band, and a single-line "Customer
  // Signature : <name>" + "Authorised Signatory : <shop / owner>" footer.
  // Padding and font sizes tuned so the whole receipt fits one A4 page.
  const customerAddrLine = customerAddress || '—';
  const gt = grandTotalBreak || { base: 0, totalGst: 0, total: 0 };
  const taxableAmount   = gt.base;
  const totalGstTax     = gt.totalGst;
  const discountAmount  = Number(invoice.discount) || 0;
  const invoiceTotal    = Number(invoice.finalPayableAmount) || 0;

  // Payment & credit, mirroring the on-screen card so the PDF the customer is
  // handed carries the same outstanding figure the shop is chasing. Suffixed
  // to stay distinct from the screen-scope copies — buildHtml is a module-level
  // function and shares no scope with the component.
  const advancePaidH  = Number(invoice.advancePaid) || 0;
  const amountPaidH   = Number(invoice.amountPaid) || 0;
  const creditAmountH = Number(invoice.creditAmount) || 0;
  const netPayableH   = Number(invoice.netPayableAmount) || Math.max(0, invoiceTotal - advancePaidH);
  const payShownH     = advancePaidH > 0 || amountPaidH > 0 || creditAmountH > 0;
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
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    margin: 0; padding: 0;
    color: #172117;
    background: #ffffff;
    font-size: 10.5px;
    line-height: 1.4;
  }
  .page { max-width: 760px; margin: 0 auto; padding: 10px 14px; }

  /* Receipt-style header — green left bar + brand + invoice meta. No big band. */
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 12px 12px 14px;
    border-left: 4px solid #16BB05;
    border-bottom: 2px solid #087A0A;
    background: #F0F8EF;
    border-radius: 6px 6px 0 0;
  }
  .head .brand { font-size: 19px; font-weight: 900; color: #087A0A; line-height: 1.05; }
  .head .sub   { font-size: 10.5px; color: #172117; margin-top: 2px; font-weight: 600; }
  .head .right { text-align: right; font-size: 10px; }
  .pill {
    display: inline-block;
    background: #E6F7E3;
    color: #087A0A;
    border: 1px solid #7ED957;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 9px;
    letter-spacing: .5px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .head .inv { font-size: 13px; font-weight: 900; color: #172117; margin-top: 4px; }

  /* Meta strip — four in a row, no gaps, divider style like Amazon receipt */
  .meta-strip {
    display: flex;
    border: 1px solid #E2E8E2;
    border-top: 0;
    border-radius: 0 0 6px 6px;
    background: #F0F8EF;
  }
  .meta-strip .col {
    flex: 1;
    padding: 6px 10px;
    border-right: 1px solid #E2E8E2;
  }
  .meta-strip .col:last-child { border-right: 0; }
  .meta-strip .k {
    font-size: 8.5px;
    color: #667066;
    letter-spacing: .35px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .meta-strip .v { font-size: 11px; color: #172117; font-weight: 800; margin-top: 1px; }

  /* Cards */
  .card {
    background: #ffffff;
    border: 1px solid #E2E8E2;
    border-radius: 6px;
    padding: 8px 12px;
    margin-top: 8px;
  }
  .sec {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9.5px;
    font-weight: 900;
    color: #087A0A;
    letter-spacing: .6px;
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .sec::before {
    content: "";
    display: inline-block;
    width: 3px; height: 11px;
    border-radius: 2px;
    background: #16BB05;
  }

  /* Bill To / From */
  .tofrom { display: flex; gap: 12px; }
  .tofrom > div { flex: 1; }
  .tofrom .lbl { color: #667066; font-size: 9px; letter-spacing: .4px; font-weight: 800; text-transform: uppercase; }
  .tofrom .nm  { font-size: 12px; font-weight: 900; margin-top: 2px; color: #172117; }
  .tofrom .ln  { font-size: 10.5px; color: #667066; margin-top: 1px; }

  /* Tables */
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 10px;
    border: 1px solid #E2E8E2;
    border-radius: 6px;
    overflow: hidden;
  }
  th, td { padding: 5px 7px; vertical-align: top; }
  th {
    background: #F0F8EF;
    color: #087A0A;
    font-size: 8.5px;
    letter-spacing: .35px;
    text-transform: uppercase;
    text-align: left;
    border-bottom: 1px solid #E2E8E2;
    font-weight: 800;
  }
  th.r { text-align: right; }
  tbody tr + tr td { border-top: 1px solid #EFF5EE; }
  tbody tr:nth-child(even) td { background: #F0F8EF; }
  .r { text-align: right; }
  .b { font-weight: 800; }
  .totalrow td {
    background: #F0F8EF !important;
    font-weight: 800;
    border-top: 2px solid #E6F7E3;
    color: #087A0A;
  }

  /* Bill summary */
  .sum-card {
    margin-top: 8px;
    background: #ffffff;
    border: 1px solid #E2E8E2;
    border-radius: 6px;
    padding: 8px 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 11px;
    color: #172117;
  }
  .row b { color: #172117; }
  .row.sep { border-top: 1px dashed #E2E8E2; margin-top: 3px; padding-top: 5px; }
  .final {
    margin-top: 6px;
    background: linear-gradient(135deg, #087A0A 0%, #087A0A 100%);
    color: #fff;
    padding: 9px 14px;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .final .lbl { font-weight: 800; letter-spacing: .2px; font-size: 11.5px; }
  .final .amt { font-size: 16px; font-weight: 900; }
  .words {
    font-size: 10px;
    color: #667066;
    margin-top: 5px;
    font-style: italic;
  }

  /* Single-line signatures + declaration */
  .sigs {
    margin-top: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border: 1px solid #E2E8E2;
    border-radius: 6px;
    background: #F0F8EF;
    font-size: 10.5px;
  }
  .sigs .l { color: #667066; font-weight: 800; text-transform: uppercase; font-size: 9px; letter-spacing: .4px; }
  .sigs .v { font-weight: 800; color: #172117; margin-left: 4px; font-size: 11px; }
  .sigs .v small { font-weight: 600; color: #172117; }

  .decl {
    margin-top: 8px;
    padding: 6px 12px;
    background: #FFFBEB;
    border: 1px dashed #FDE68A;
    border-radius: 6px;
    font-size: 9.5px;
    color: #92400E;
  }
  .decl b { color: #92400E; }

  .thank { margin-top: 6px; text-align: center; font-size: 9.5px; color: #667066; font-style: italic; }
</style>
</head>
<body>
  <div class="page">

    <!-- Compact receipt header -->
    <div class="head">
      <div>
        <span class="pill">Tax Invoice</span>
        <div class="brand" style="margin-top:4px">${esc(shopName)}</div>
        ${ownerDisplayName ? `<div class="sub">${esc(ownerDisplayName)}${shopMobile ? ` · ${esc(shopMobile)}` : ''}</div>` : (shopMobile ? `<div class="sub">${esc(shopMobile)}</div>` : '')}
      </div>
      <div class="right">
        <span class="pill" style="background:#fff;border-color:#16BB05">Original Copy</span>
      </div>
    </div>

    <!-- Meta strip (Amazon-style horizontal info row) -->
    <div class="meta-strip">
      <div class="col"><div class="k">Invoice No</div><div class="v">${esc(invoice.invoiceNo)}</div></div>
      <div class="col"><div class="k">Ticket Date</div><div class="v">${fmtDateH(invoice.ticketDate)}</div></div>
      <div class="col"><div class="k">Delivery Date</div><div class="v">${fmtDateH(invoice.generatedAt || invoice.deliveryDate)}</div></div>
      ${shopGst ? `<div class="col"><div class="k">GSTIN</div><div class="v">${esc(shopGst)}</div></div>` : ''}
    </div>

    <!-- Bill To / From -->
    <div class="card">
      <div class="sec">Parties</div>
      <div class="tofrom">
        <div>
          <div class="lbl">Billed To</div>
          <div class="nm">${esc(customerName || '—')}</div>
          ${ticket?.customerPhone ? `<div class="ln">Mobile · ${esc(ticket.customerPhone)}</div>` : ''}
          <div class="ln">Address · ${esc(customerAddrLine)}</div>
        </div>
        <div style="text-align:right">
          <div class="lbl">Issued By</div>
          <div class="nm">${esc(shopName)}</div>
          ${shopMobile ? `<div class="ln">Mobile · ${esc(shopMobile)}</div>` : ''}
          ${shopAddress ? `<div class="ln">${esc(shopAddress)}</div>` : ''}
          ${shopGst ? `<div class="ln">GSTIN · ${esc(shopGst)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- (A) Service — adds Total (₹) column matching the reference layout -->
    <div class="card">
      <div class="sec">(A) Service</div>
      <table>
        <thead><tr>
          <th>Sl</th><th>Description</th>
          <th class="r">Rate (₹)</th>
          <th class="r">Taxable Value (₹)</th>
          <th class="r">CGST (₹)</th>
          <th class="r">SGST (₹)</th>
          <th class="r">Total GST (₹)</th>
          <th class="r">Total (₹)</th>
        </tr></thead>
        <tbody>
          ${serviceRows || '<tr><td colspan="8" style="text-align:center;color:#8FA08F">—</td></tr>'}
          <tr class="totalrow">
            <td></td><td>Total Amount (₹)</td>
            <td class="r">${fmtH(totalServiceGross)}</td>
            <td class="r">${fmtH(serviceTotal.base)}</td>
            <td class="r">${fmtH(serviceTotal.cgst)}</td>
            <td class="r">${fmtH(serviceTotal.sgst)}</td>
            <td class="r">${fmtH(serviceTotal.totalGst)}</td>
            <td class="r">${fmtH(serviceTotal.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- (B) Spares — adds CGST / SGST / Total GST / Total (₹) columns -->
    <div class="card">
      <div class="sec">(B) Spares</div>
      <table>
        <thead><tr>
          <th>Sl</th><th>Description</th><th>Warranty</th>
          <th class="r">Qty</th>
          <th class="r">Rate (₹)</th>
          <th class="r">Taxable Value (₹)</th>
          <th class="r">CGST (₹)</th>
          <th class="r">SGST (₹)</th>
          <th class="r">Total GST (₹)</th>
          <th class="r">Total (₹)</th>
        </tr></thead>
        <tbody>
          ${spareRows || '<tr><td colspan="10" style="text-align:center;color:#8FA08F">—</td></tr>'}
          <tr class="totalrow">
            <td></td><td>Total Amount (₹)</td><td></td><td></td>
            <td class="r">${fmtH(totalSpareGross)}</td>
            <td class="r">${fmtH(sparesTotal.base)}</td>
            <td class="r">${fmtH(sparesTotal.cgst)}</td>
            <td class="r">${fmtH(sparesTotal.sgst)}</td>
            <td class="r">${fmtH(sparesTotal.totalGst)}</td>
            <td class="r">${fmtH(sparesTotal.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Consolidated tax summary — rolls (A) Service and (B) Spares into one
         table the reference receipt shows above the Bill Summary. -->
    <div class="card">
      <div class="sec">Tax Summary</div>
      <table>
        <thead><tr>
          <th>Sl</th><th>Description</th>
          <th class="r">Taxable Value (₹)</th>
          <th class="r">CGST (₹)</th>
          <th class="r">SGST (₹)</th>
          <th class="r">Total GST (₹)</th>
          <th class="r">Total (₹)</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>1</td><td>Service</td>
            <td class="r">${fmtH(serviceTotal.base)}</td>
            <td class="r">${fmtH(serviceTotal.cgst)}</td>
            <td class="r">${fmtH(serviceTotal.sgst)}</td>
            <td class="r">${fmtH(serviceTotal.totalGst)}</td>
            <td class="r b">${fmtH(serviceTotal.total)}</td>
          </tr>
          <tr>
            <td>2</td><td>Spares</td>
            <td class="r">${fmtH(sparesTotal.base)}</td>
            <td class="r">${fmtH(sparesTotal.cgst)}</td>
            <td class="r">${fmtH(sparesTotal.sgst)}</td>
            <td class="r">${fmtH(sparesTotal.totalGst)}</td>
            <td class="r b">${fmtH(sparesTotal.total)}</td>
          </tr>
          <tr class="totalrow">
            <td></td><td>Total payable by customer (₹)</td>
            <td class="r">${fmtH(grandTotal.base)}</td>
            <td class="r">${fmtH(grandTotal.cgst)}</td>
            <td class="r">${fmtH(grandTotal.sgst)}</td>
            <td class="r">${fmtH(grandTotal.totalGst)}</td>
            <td class="r">${fmtH(grandTotal.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Total Payable Summary — Taxable Amount → Total GST → Discount →
         Invoice Total (matches the requested 4-row structure). -->
    <div class="sum-card">
      <div class="sec">Total Payable Summary</div>
      <div class="row"><span>Taxable Amount</span><b>₹${fmtH(taxableAmount)}</b></div>
      <div class="row"><span>Total GST Tax (₹)</span><b>₹${fmtH(totalGstTax)}</b></div>
      <div class="row sep"><span>Discount</span><b style="color:#b45309">− ₹${fmtH(discountAmount)}</b></div>
      <div class="final"><span class="lbl">Invoice Total</span><span class="amt">₹${fmtH(invoiceTotal)}</span></div>
      ${invoice.amountInWords ? `<div class="words">In words : ${esc(invoice.amountInWords)}</div>` : ''}
      ${payShownH ? `
      ${advancePaidH > 0 ? `<div class="row sep" style="margin-top:6px">
        <span>Advance Already Paid</span><b style="color:#b45309">− ₹${fmtH(advancePaidH)}</b>
      </div>` : ''}
      <div class="row"><span>Net Payable</span><b>₹${fmtH(netPayableH)}</b></div>
      ${amountPaidH > 0 ? `<div class="row"><span>Amount Paid</span><b style="color:#b45309">− ₹${fmtH(amountPaidH)}</b></div>` : ''}
      <div class="final" style="background:${creditAmountH > 0 ? '#fef3c7' : '#e6f7e3'}">
        <span class="lbl" style="color:${creditAmountH > 0 ? '#b45309' : '#087a0a'}">${creditAmountH > 0 ? 'Credit / Balance Payable' : 'Balance Payable'}</span>
        <span class="amt" style="color:${creditAmountH > 0 ? '#b45309' : '#087a0a'}">₹${fmtH(creditAmountH)}</span>
      </div>
      ${creditAmountH > 0 && invoice.paymentNote ? `<div class="words">Note : ${esc(invoice.paymentNote)}</div>` : ''}
      ` : ''}
    </div>

    <!-- Single-line signature row: customer name + authorised signatory -->
    <div class="sigs">
      <div>
        <span class="l">Customer Signature :</span>
        <span class="v">${esc(customerName || '—')}</span>
      </div>
      <div style="text-align:right">
        <span class="l">Authorised Signatory :</span>
        <span class="v">${esc(shopName)}${ownerDisplayName ? ` <small>· ${esc(ownerDisplayName)}</small>` : ''}</span>
      </div>
    </div>

    <div class="decl">
      <b>Declaration :</b> We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
    </div>

    <div class="thank">Thank you for choosing ${esc(shopName)}</div>
  </div>
</body></html>`;
}
