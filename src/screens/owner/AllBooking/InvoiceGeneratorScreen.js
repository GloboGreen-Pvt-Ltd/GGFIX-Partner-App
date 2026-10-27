import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useResponsive } from '../../../theme/responsive';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronDown,
  Package,
  ReceiptText,
  Percent,
  IndianRupee,
  CheckCircle2,
  FileText,
  Wallet,
  BookText,
  AlertTriangle,
  ChevronUp,
  Eye,
  Pencil,
  Phone,
  Plus,
  Smartphone,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { ticketApi } from '../../../api/client';
import { stepBlockedBy } from '../../common/serviceHistoryPhases';
// The same validator the Cash Book uses, and deliberately the same rule as
// InvoiceService.normalizePhone on the server — a credit is posted to the
// account keyed by this number, so "would this be accepted?" has to be one
// question with one answer on both sides.
import { formatPhone, isValidPhone } from '../../../api/ledgerParties';

const BRAND_GREEN = '#035C6C';
const BRAND_GREEN_DARK = '#035C6C';
const ACCENT_GREEN = '#035C6C';

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

const TAX_MODES = [
  { value: 'WITHOUT',   label: 'Without' },
  { value: 'INCLUSIVE', label: 'Inclusive' },
  { value: 'EXCLUSIVE', label: 'Exclusive' },
];

const GST_OPTIONS = [0, 3, 5, 12, 18, 28];

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The one amber in the palette, reused for every "someone still owes this"
// surface in the app (see the Home Ready-for-Delivery chip).
const CREDIT_AMBER = '#B45309';
const CREDIT_AMBER_BG = '#FEF3C7';

// `YYYY-MM-DD` in the DEVICE's local calendar. Deliberately not toISOString(),
// which converts to UTC and files an evening bill under the previous day —
// identical to toApiDate in api/ledgerParties.js, which the Cash Book entry
// this screen writes will be filed under.
function toApiDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

const money = (s) => {
  const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Convert a number to Indian-numbering words (lakh/crore). Used for the
// "Total amount in words" line on the rendered Deliver Invoice report.
function numberToIndianWords(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  const n = Math.round(Number(num));
  if (n === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two = (x) => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
  const three = (x) => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    return (h ? ones[h] + ' Hundred' + (r ? ' and ' : '') : '') + (r ? two(r) : '');
  };
  let s = '';
  const crore = Math.floor(n / 10000000);
  const lakh  = Math.floor((n % 10000000) / 100000);
  const thou  = Math.floor((n % 100000) / 1000);
  const rest  = n % 1000;
  if (crore) s += two(crore) + ' Crore ';
  if (lakh)  s += two(lakh)  + ' Lakh ';
  if (thou)  s += two(thou)  + ' Thousand ';
  if (rest)  s += three(rest);
  return s.trim();
}

function SectionHeader({ icon: Icon, label, tint = '#E5F3F5', accent = BRAND_GREEN_DARK }) {
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

function priceItemsFromTicket(ticket) {
  if (Array.isArray(ticket?.priceItems)) return ticket.priceItems;
  if (ticket?.priceItemsJson) {
    try {
      const parsed = JSON.parse(ticket.priceItemsJson);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return ticket?.services?.map?.((s) => ({ id: s.id, label: s.serviceName, amount: s.price, warranty: s.warranty })) || [];
}

// Booking's own service-charge price line (Devices & Repair → Service Charge).
const SERVICE_CHARGE_CODE = 'SERVICE_CHARGE';
// Taxable value per unit: the rate, unless the owner set a different one.
// (A part priced after booking used to keep an empty taxable value, so its
// rate never reached the total — ₹1,000 part + ₹500 service billed ₹500.)
const taxableOf = (sp) => (sp?.taxableEdited ? Number(sp.taxableValue) || 0 : Number(sp?.rate) || 0);

export default function InvoiceGeneratorScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  // Tablets: cap the form column and centre it (sticky bar matches via padding).
  const formW = r.maxWidth('form');
  const barPadX = Math.max(16, (r.width - formW) / 2);
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [existing, setExisting] = useState(null);
  // The booking's Service History — a NEW invoice records "Invoice Generated"
  // on it, so it waits its turn like any other step (see invoiceBlockedBy).
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state — the visible inputs the owner edits
  const [serviceChargesStr, setServiceChargesStr] = useState('');
  const [discountStr, setDiscountStr] = useState('');
  const [taxMode, setTaxMode] = useState('WITHOUT');
  const [gstPercent, setGstPercent] = useState(0);
  // Editable spare lines: [{id, description, rate, warranty, qty, taxableValue}]
  const [spareLines, setSpareLines] = useState([]);

  // Payment & credit. The advance is NOT state: it is whatever the booking
  // actually collected (tickets.payment_amount) and is shown read-only, so the
  // bill can't disagree with the receipt the customer already holds. It used to
  // be a seeded, editable field — and it read 0 on any booking that already had
  // an invoice, because the seed preferred the saved invoice's advancePaid and
  // that column is absent on servers without migration 89. The deposit is
  // recorded on the ticket; that is the figure to deduct.
  //
  // `paidNowStr` is what is being handed over at delivery; the credit is
  // whatever is left and is never typed directly, so the three figures cannot
  // contradict each other.
  const [paidNowStr, setPaidNowStr] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  // Compact-layout UI state: Cash Book fold, preview.
  const [cashOpen, setCashOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [t, inv, ev] = await Promise.all([
        ticketApi.get(`/tickets/${ticketId}`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/invoice`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/events`).catch(() => []),
      ]);
      setTicket(t || {});
      setExisting(inv || null);
      setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));

      // Spare lines ALWAYS come from the current booking items — never from a
      // prior invoice snapshot. If we trust the saved snapshot we end up
      // hiding items that were added (or fixing) after the first generation,
      // which is exactly the "Screen Broken missing" bug.
      const allItems = priceItemsFromTicket(t);
      const isCharge = (it) => String(it?.code || it?.serviceCode || '').toUpperCase() === SERVICE_CHARGE_CODE;
      const bookedCharge = allItems.filter(isCharge).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
      const items = allItems.filter((it) => !isCharge(it));
      setSpareLines(items.map((it, i) => {
        const rate = Number(it.amount || 0);
        return {
          id: it.id || `spare-${i}`,
          description: it.label || it.serviceName || `Item ${i + 1}`,
          rate: rate || '',
          warranty: it.warranty || '',
          qty: 1,
          // Taxable value follows the rate (taxableOf) until the owner sets a
          // different one in the part sheet.
          taxableEdited: false,
          taxableValue: '',
        };
      }));

      // Service Charges (A) is always a fresh manual entry, starting empty
      // (0 is the placeholder, so typing 100 doesn't read 0100).
      // The tax / GST / discount picks are user preferences worth keeping
      // across visits, so those still rehydrate from the prior invoice.
      // Service Charges: the saved invoice's figure, else the booking's own
      // Service Charge line, else empty (0 placeholder).
      const savedCharge = Number(inv?.serviceCharges) || 0;
      setServiceChargesStr(savedCharge > 0 ? String(savedCharge) : bookedCharge > 0 ? String(bookedCharge) : '');
      if (inv) {
        setDiscountStr(Number(inv.discount) > 0 ? String(Number(inv.discount)) : '');
        const mode = inv.taxMode || 'WITHOUT';
        setTaxMode(mode);
        // Normalised on the way IN as well as on change: an invoice saved before
        // the rate was cleared alongside the mode can carry WITHOUT + 18%, and
        // re-generating it untouched would write that phantom rate straight back.
        setGstPercent(mode === 'WITHOUT' ? 0 : Number(inv.gstPercent || 0));
      }

      // No advance to restore — it is read straight off the ticket every time
      // (see the state block above), so a re-generated bill deducts the same
      // deposit as the first one.
      setPaidNowStr(Number(inv?.amountPaid) > 0 ? String(Number(inv.amountPaid)) : '');
      setPaymentNote(inv?.paymentNote || '');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Mutate a single field on one spare line — used by every editable cell.
  const updateSpareField = useCallback((index, field, value) => {
    setSpareLines((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  // Derived totals — recomputed on every render so the bottom card always
  // matches the inputs. Same formulas the backend stores verbatim.
  const totals = useMemo(() => {
    const serviceCharges = Number(serviceChargesStr) || 0;
    const discount       = Number(discountStr) || 0;
    const totalRepairAmount = spareLines.reduce((s, r) => s + (Number(r.rate) || 0) * (Number(r.qty) || 1), 0);
    const spareUtility = spareLines.reduce((s, r) => s + taxableOf(r) * (Number(r.qty) || 1), 0);
    const amount2plus3 = serviceCharges + spareUtility - discount;
    const gst = Number(gstPercent) || 0;

    let baseAmount, totalGst, finalPayable;
    if (taxMode === 'INCLUSIVE') {
      baseAmount = gst > 0 ? amount2plus3 / (1 + gst / 100) : amount2plus3;
      totalGst   = amount2plus3 - baseAmount;
      finalPayable = amount2plus3;
    } else if (taxMode === 'EXCLUSIVE') {
      baseAmount = amount2plus3;
      totalGst   = amount2plus3 * (gst / 100);
      finalPayable = amount2plus3 + totalGst;
    } else {
      baseAmount = amount2plus3;
      totalGst   = 0;
      finalPayable = amount2plus3;
    }
    return {
      serviceCharges, discount, totalRepairAmount, spareUtility,
      amount2plus3, baseAmount, totalGst, finalPayable,
    };
  }, [serviceChargesStr, discountStr, spareLines, gstPercent, taxMode]);

  // Build the per-row charges-summary table the screenshots show under
  // Inclusive / Exclusive modes. Split GST evenly between CGST + SGST.
  const chargesSummary = useMemo(() => {
    const gst = Number(gstPercent) || 0;
    const halfRate = gst / 200; // CGST = SGST = gst/2 / 100
    const buildRow = (label, gross) => {
      // Inclusive: gross already contains GST, so base = gross/(1+gst%).
      //   Per-row total GST is the exact diff (gross-base) — using
      //   cgst+sgst alone drifts by half-paise from rounding, hence the
      //   "Rounded Value" column on the reference shows that delta.
      // Exclusive: gross is the pre-tax base; total = base + gst.
      let base, totalGstRow, total;
      if (taxMode === 'INCLUSIVE') {
        base = gst > 0 ? gross / (1 + gst / 100) : gross;
        totalGstRow = +(gross - base).toFixed(2);
        total = +gross.toFixed(2);
      } else {
        base = gross;
        totalGstRow = +(base * (gst / 100)).toFixed(2);
        total = +(base + totalGstRow).toFixed(2);
      }
      const cgst = +(base * halfRate).toFixed(2);
      const sgst = +(base * halfRate).toFixed(2);
      const rounded = +((cgst + sgst) - totalGstRow).toFixed(2);
      return {
        label,
        base: +base.toFixed(2),
        cgst,
        sgst,
        rounded,
        totalGst: totalGstRow,
        total,
      };
    };
    const rows = [];
    if (totals.serviceCharges > 0) rows.push(buildRow('A', totals.serviceCharges));
    spareLines.forEach((sp, i) => {
      const grossGross = taxableOf(sp) * (Number(sp.qty) || 1);
      if (grossGross > 0) rows.push(buildRow(String.fromCharCode(66 + i), grossGross));
    });
    return rows;
  }, [taxMode, gstPercent, totals.serviceCharges, spareLines]);

  const showChargesSummary = taxMode !== 'WITHOUT' && Number(gstPercent) > 0;

  // The payment chain. Every step is clamped the same way the server clamps it
  // (InvoiceService.applyPayment), so what the owner reads here is exactly what
  // gets written — including the edge cases: an advance bigger than the bill (a
  // re-estimate that came down) reads as nothing owed rather than a negative
  // credit, and paying more than is due cannot mint a credit in reverse.
  // What the booking took as a deposit. The single source for the deduction
  // below and for the row that displays it.
  const advancePaid = Number(ticket?.paymentAmount || 0);

  const pay = useMemo(() => {
    const finalPayable = totals.finalPayable;
    const advance = Math.min(Math.max(advancePaid, 0), Math.max(finalPayable, 0));
    const netPayable = Math.max(0, finalPayable - advance);
    const paidNow = Math.min(money(paidNowStr), netPayable);
    const credit = Math.max(0, netPayable - paidNow);
    return {
      finalPayable,
      advance,
      netPayable,
      paidNow,
      credit,
      // A bill with nothing left on it, however it got there — fully prepaid,
      // or settled at the counter. Drives the "Settled" pill.
      settled: credit <= 0,
    };
  }, [totals.finalPayable, advancePaid, paidNowStr]);

  // A credit can only be tracked against an account, and an account is keyed by
  // phone number. Without one the bill still records the debt but the Cash Book
  // never hears about it — worth saying out loud rather than letting it pass
  // for filed.
  const creditTrackable = isValidPhone(ticket?.customerPhone);

  // A first invoice is the "Invoice Generated" step, so it can't be raised
  // before Ready for Delivery / Return Delivery. Re-generating one that exists
  // records nothing new, so it is never held back.
  const invoiceBlockedBy = existing ? null : stepBlockedBy(events, 'INVOICE_GENERATED');

  const onGenerate = async () => {
    if (invoiceBlockedBy) {
      notify('Complete the previous step first', `Record "${invoiceBlockedBy}" before generating the invoice.`);
      return;
    }
    setSubmitting(true);
    try {
      // Build a slNo→breakdown map from chargesSummary so spare lines carry
      // the exact CGST/SGST/RoundedValue/TotalGst the user saw on screen.
      // The Delivery Invoice Report later renders straight from this JSON,
      // avoiding any recompute drift.
      const breakdownByLabel = Object.fromEntries(
        chargesSummary.map((r) => [r.label, r])
      );
      const serviceBd = breakdownByLabel['A'];
      const serviceLines = totals.serviceCharges > 0 ? [{
        slNo: 'A',
        description: 'Service Charges',
        rate: totals.serviceCharges,
        taxableValue: serviceBd ? serviceBd.base : (
          taxMode === 'INCLUSIVE' && gstPercent > 0
            ? +(totals.serviceCharges / (1 + gstPercent / 100)).toFixed(2)
            : totals.serviceCharges
        ),
        cgst: serviceBd?.cgst ?? 0,
        sgst: serviceBd?.sgst ?? 0,
        roundedValue: serviceBd?.rounded ?? 0,
        totalGst: serviceBd?.totalGst ?? 0,
        totalAmount: serviceBd?.total ?? totals.serviceCharges,
      }] : [];
      const body = {
        ticketDate: ticket?.createdAt || null,
        deliveryDate: ticket?.deliveredAt || null,
        gstNo: ticket?.shopGstNo || null,
        serviceCharges: totals.serviceCharges,
        totalRepairAmount: totals.totalRepairAmount,
        spareUtilityCharge: totals.spareUtility,
        discount: totals.discount,
        taxMode,
        gstPercent,
        amount2Plus3: totals.amount2plus3,
        baseAmount: +totals.baseAmount.toFixed(2),
        totalGst: +totals.totalGst.toFixed(2),
        finalPayableAmount: +totals.finalPayable.toFixed(2),
        amountInWords: `Rupees ${numberToIndianWords(totals.finalPayable)} Only`,
        // Payment & credit. The server re-derives net and credit from these
        // rather than trusting them — they're sent so the request reads as the
        // form it came from, not because the figures are authoritative.
        advancePaid: +pay.advance.toFixed(2),
        netPayableAmount: +pay.netPayable.toFixed(2),
        amountPaid: +pay.paidNow.toFixed(2),
        creditAmount: +pay.credit.toFixed(2),
        paymentNote: paymentNote.trim(),
        paymentDate: toApiDate(new Date()),
        spareLinesJson: JSON.stringify(spareLines.map((sp, i) => {
          const slNo = String.fromCharCode(66 + i);
          const bd = breakdownByLabel[slNo];
          return {
            slNo,
            description: sp.description,
            rate: Number(sp.rate) || 0,
            warranty: sp.warranty || '',
            qty: Number(sp.qty) || 1,
            taxableValue: taxableOf(sp),
            cgst: bd?.cgst ?? 0,
            sgst: bd?.sgst ?? 0,
            roundedValue: bd?.rounded ?? 0,
            totalGst: bd?.totalGst ?? 0,
            totalAmount: bd?.total ?? (taxableOf(sp) * (Number(sp.qty) || 1)),
          };
        })),
        serviceLinesJson: JSON.stringify(serviceLines),
      };
      const resp = await ticketApi.post(`/tickets/${ticketId}/invoice`, { body });
      // Mirror the save to the service history rail so the BookingTimeline /
      // customer history shows an "Invoice Generated" step the moment the
      // invoice lands. emitProgressStepEvent is idempotent server-side, so
      // re-generating the same invoice won't duplicate the timeline row —
      // it refreshes the existing note + timestamp instead.
      try {
        await ticketApi.post(`/tickets/${ticketId}/progress-events`, {
          body: {
            statusKey: 'INVOICE_GENERATED',
            note: `Invoice #${resp.invoiceNo || ticket?.trackingId || ticketId} generated`,
            actor: 'SHOP',
          },
        });
      } catch (_) { /* timeline event is non-critical — the invoice still saved */ }
      // Say where the credit went. The owner's next question after generating a
      // bill with money still on it is "is that being tracked?", and the answer
      // differs: posted to the Cash Book, or recorded on the bill only because
      // the ticket has no number to open an account against.
      //
      // The credit is read from the response when the server sends one back,
      // and from what this screen just computed when it doesn't. A server
      // without the invoice payment columns (migration 89) echoes no
      // creditAmount at all, and `Number(undefined || 0)` turned that silence
      // into "Fully paid." — telling the owner a debt was settled at the very
      // moment it went unrecorded. Absent means unknown, not zero.
      const serverCredit = resp.creditAmount == null ? null : Number(resp.creditAmount);
      const credit = serverCredit == null ? pay.credit : serverCredit;
      const posted = credit > 0 && !!resp.creditLedgerEntryId;
      const detail = credit <= 0
        ? `Invoice #${resp.invoiceNo || ticket?.trackingId || ticketId} saved. Fully paid.`
        : posted
        ? `Invoice #${resp.invoiceNo} saved. ₹${fmt(credit)} credit added to ${ticket?.customerName || 'the customer'}'s Cash Book account.`
        : creditTrackable
        // A number is on file, so the account could have been opened — the post
        // itself did not happen. Name that instead of blaming the phone number.
        ? `Invoice #${resp.invoiceNo} saved with ₹${fmt(credit)} credit, but the server did NOT record it in the Cash Book. Add it to ${ticket?.customerName || 'the customer'}'s account by hand, or report this.`
        : `Invoice #${resp.invoiceNo} saved with ₹${fmt(credit)} credit, but it could NOT be added to the Cash Book — this booking has no valid mobile number.`;
      notify('Invoice Generated', detail, { preset: posted || credit <= 0 ? 'done' : 'error' });
      navigation.replace('DeliveryInvoiceReport', { ticketId, invoiceId: resp.id });
    } catch (e) {
      notify('Generate failed', e?.message || 'Could not generate invoice');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader label="Loading invoice generator..." />;

  // ── Display bits ──────────────────────────────────────────────────────
  const shownDevice = /^(.*?)(?: · ([^()]+?))?(?: \(([^)]*)\))?$/.exec(String(ticket?.deviceDisplayName || '').trim()) || [];
  const modelName = (shownDevice[1] || '').trim() || ticket?.deviceModelName || ticket?.modelName || 'Device';
  const specLine = [ticket?.modelNumber || (shownDevice[2] || '').trim(), (shownDevice[3] || '').replace(/ \/ /g, ' · ')]
    .filter(Boolean).join(' · ');
  const deviceImg = ticket?.deviceImageUrl || ticket?.modelImageUrl || null;
  const payStatus = pay.credit <= 0 ? 'Paid' : (pay.paidNow > 0 || pay.advance > 0) ? 'Partially Paid' : 'Unpaid / Credit';
  const payTone = pay.credit <= 0 ? '#476B26' : CREDIT_AMBER;
  const partsTotal = totals.spareUtility;
  const rateTotal = totals.totalRepairAmount;


  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── 1. Header ── */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: formW, alignSelf: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityLabel="Go back"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={20} color="#111111" />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#111111' }} numberOfLines={1}>Invoice Generator</Text>
          <View style={{ minWidth: 36, maxWidth: 140, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#E5F3F5' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND_GREEN, textAlign: 'center' }} numberOfLines={1}>
              {ticket?.trackingId ? `#${ticket.trackingId}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={110}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: insets.bottom + 120, width: '100%', maxWidth: formW, alignSelf: 'center' }}
      >
        {/* ── 2. Customer & device ── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              {deviceImg ? <Image source={{ uri: deviceImg }} style={{ width: '88%', height: '88%' }} resizeMode="contain" />
                : <Smartphone size={24} color={BRAND_GREEN} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#111111' }} numberOfLines={2}>{modelName}</Text>
              {specLine ? <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }} numberOfLines={1}>{specLine}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <User size={13} color={BRAND_GREEN} />
                  <Text style={{ marginLeft: 4, fontSize: 12, color: '#374151' }} numberOfLines={1}>{ticket?.customerName || '—'}</Text>
                </View>
                {ticket?.customerPhone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Phone size={13} color={BRAND_GREEN} />
                    <Text style={{ marginLeft: 4, fontSize: 12, color: '#374151' }} numberOfLines={1}>{formatPhone(ticket.customerPhone)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Card>

        {/* ── 3. Service charges ── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND_GREEN, alignItems: 'center', justifyContent: 'center' }}>
              <Wrench size={15} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <Text style={{ flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '800', color: '#1C3053' }}>Service Charges</Text>
            <AmountBox value={serviceChargesStr} onChangeText={setServiceChargesStr} />
          </View>
        </Card>

        {/* ── 4. Spare parts — each line's Rate, Qty and Warranty, inline ── */}
        <Card>
          <Head Icon={Package} title={`Spare Parts${spareLines.length ? ` (${spareLines.length})` : ''}`} />
          {spareLines.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#6B7280', paddingVertical: 4 }}>No spare parts on this booking.</Text>
          ) : spareLines.map((sp, i) => {
            const box = { height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' };
            const input = { flex: 1, padding: 0, fontSize: 13.5, fontWeight: '700', color: '#111111' };
            const cap = { fontSize: 11, color: '#6B7280', marginBottom: 3 };
            return (
              <View key={sp.id || i} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#F3F4F6' }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#111111', marginBottom: 6 }} numberOfLines={2}>
                  {sp.description || `Item ${i + 1}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1.4 }}>
                    <Text style={cap}>Rate</Text>
                    <View style={box}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', marginRight: 4 }}>₹</Text>
                      <TextInput
                        value={String(sp.rate ?? '')}
                        onChangeText={(v) => updateSpareField(i, 'rate', v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#9CA3AF"
                        cursorColor={BRAND_GREEN}
                        accessibilityLabel={`${sp.description} rate`}
                        style={[input, { textAlign: 'right' }]}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 0.7 }}>
                    <Text style={cap}>Qty</Text>
                    <View style={box}>
                      <TextInput
                        value={String(sp.qty ?? '')}
                        onChangeText={(v) => updateSpareField(i, 'qty', v.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor="#9CA3AF"
                        cursorColor={BRAND_GREEN}
                        accessibilityLabel={`${sp.description} quantity`}
                        style={[input, { textAlign: 'center' }]}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 1.3 }}>
                    <Text style={cap}>Warranty</Text>
                    <View style={box}>
                      <TextInput
                        value={String(sp.warranty ?? '')}
                        onChangeText={(v) => updateSpareField(i, 'warranty', v)}
                        placeholder="e.g. 3 Months"
                        placeholderTextColor="#9CA3AF"
                        cursorColor={BRAND_GREEN}
                        accessibilityLabel={`${sp.description} warranty`}
                        style={input}
                      />
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>

        {/* ── 5. Charges & discount → 6. Tax & GST → 7. Final amount ── */}
        <Card>
          <Head Icon={ReceiptText} title="Charges & Discount" />
          <Row label="Parts Total" value={`₹${fmt(partsTotal)}`} sub={rateTotal !== partsTotal ? `Rate total ₹${fmt(rateTotal)} · billed on taxable value` : null} />
          <Row label="Service Charges" value={`₹${fmt(totals.serviceCharges)}`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ flex: 1, fontSize: 13, color: '#374151' }}>Discount</Text>
            <AmountBox value={discountStr} onChangeText={setDiscountStr} />
          </View>
          <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 6 }} />
          <Row label="Subtotal" value={`₹${fmt(totals.amount2plus3)}`} bold />

          <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Percent size={14} color={BRAND_GREEN} />
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '800', color: '#1C3053' }}>Tax & GST</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1.3 }}>
              <InlineDropdown
                value={taxMode}
                options={TAX_MODES}
                onChange={(v) => {
                  setTaxMode(v);
                  // "Without" means no GST at all, so the rate goes with it.
                  if (v === 'WITHOUT') setGstPercent(0);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <InlineDropdown
                value={gstPercent}
                options={GST_OPTIONS}
                onChange={setGstPercent}
                formatLabel={(v) => `${v}%`}
                disabled={taxMode === 'WITHOUT'}
                disabledLabel="N/A"
              />
            </View>
            <View style={{ flex: 1, minHeight: 38, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#111111' }} numberOfLines={1}>₹{fmt(totals.totalGst)}</Text>
            </View>
          </View>
          {showChargesSummary ? (
            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>
              Base ₹{fmt(totals.baseAmount)} · CGST {Number(gstPercent) / 2}% + SGST {Number(gstPercent) / 2}% · {taxMode === 'INCLUSIVE' ? 'tax included in prices' : 'tax added on top'}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#E5F3F5' }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: BRAND_GREEN }}>Final Payable Amount</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color: BRAND_GREEN }}>₹{fmt(totals.finalPayable)}</Text>
          </View>
        </Card>

        {/* ── 8. Payment & credit ── */}
        <Card>
          <Head
            Icon={Wallet}
            title="Payment & Credit"
            right={(
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: pay.credit <= 0 ? '#EDF4E7' : CREDIT_AMBER_BG }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: payTone }}>{payStatus}</Text>
              </View>
            )}
          />
          <Row label="Final Amount" value={`₹${fmt(pay.finalPayable)}`} />
          {/* Read-only: the deposit was recorded when the booking was taken. */}
          <Row label="Advance Paid" value={`− ₹${fmt(pay.advance)}`} sub={advancePaid > 0 ? 'Collected at booking' : null} />
          <Row label="Net Payable Now" value={`₹${fmt(pay.netPayable)}`} bold color={BRAND_GREEN} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ flex: 1, fontSize: 13, color: '#374151' }}>Amount Paid Now</Text>
            {pay.netPayable > 0 && pay.paidNow < pay.netPayable ? (
              <Pressable onPress={() => setPaidNowStr(String(+pay.netPayable.toFixed(2)))} accessibilityRole="button"
                style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND_GREEN }}>Full</Text>
              </Pressable>
            ) : null}
            <AmountBox value={paidNowStr} onChangeText={setPaidNowStr} editable={pay.netPayable > 0} />
          </View>
          {money(paidNowStr) > pay.netPayable && pay.netPayable >= 0 ? (
            <Text style={{ fontSize: 11, color: '#DC2626', textAlign: 'right' }}>More than due — only ₹{fmt(pay.netPayable)} is counted.</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: pay.credit <= 0 ? '#EDF4E7' : CREDIT_AMBER_BG }}>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '800', color: payTone }}>Balance Due</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: payTone }}>₹{fmt(pay.credit)}</Text>
          </View>
        </Card>

        {/* ── 9. Cash Book (collapsible) ── */}
        <Card style={{ paddingVertical: 10 }}>
          <Pressable onPress={() => setCashOpen((v) => !v)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: creditTrackable ? '#609138' : '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
              {creditTrackable ? <BookText size={15} color="#FFFFFF" /> : <AlertTriangle size={15} color="#FFFFFF" />}
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1C3053' }}>Cash Book Entry</Text>
              <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={1}>
                {pay.credit > 0 ? (creditTrackable ? `₹${fmt(pay.credit)} goes on the customer's account` : 'Balance can’t be tracked — no mobile number') : 'Nothing outstanding'}
              </Text>
            </View>
            {cashOpen ? <ChevronUp size={18} color="#6B7280" /> : <ChevronDown size={18} color="#6B7280" />}
          </Pressable>
          {cashOpen ? (
            <View style={{ marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: creditTrackable ? '#E5F3F5' : '#FEE2E2' }}>
              <Row label="Customer" value={`${ticket?.customerName || 'Customer'}${creditTrackable ? ` · ${formatPhone(ticket?.customerPhone)}` : ''}`} />
              <Row label="Invoice" value={`#${ticket?.trackingId || '—'} · ${toApiDate(new Date())}`} />
              <Row label="Received now" value={`₹${fmt(pay.paidNow)}`} />
              <Row label="Outstanding balance" value={`₹${fmt(pay.credit)}`} bold color={pay.credit > 0 ? CREDIT_AMBER : '#476B26'} />
              <Text style={{ fontSize: 11, color: creditTrackable ? '#6B7280' : '#B91C1C', marginTop: 4 }}>
                {creditTrackable
                  ? 'Only money received is recorded as cash in. When they pay later, record it on their Cash Book account — the balance drops by what they hand over.'
                  : 'This booking has no valid 10-digit mobile number, so no customer account can be opened for the balance. Add one on the booking first.'}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* ── 10. Payment note (optional) ── */}
        <Card>
          <TextInput
            value={paymentNote}
            onChangeText={setPaymentNote}
            placeholder="Payment remarks (optional)"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={200}
            cursorColor={BRAND_GREEN}
            style={{ minHeight: 44, maxHeight: 90, padding: 0, fontSize: 13.5, color: '#111111', textAlignVertical: 'top' }}
          />
        </Card>

        {/* ── 11. Invoice preview ── */}
        <Pressable onPress={() => setPreviewOpen(true)} accessibilityRole="button" className="active:opacity-85"
          style={{ marginTop: 10, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: BRAND_GREEN, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Eye size={16} color={BRAND_GREEN} />
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: BRAND_GREEN }}>Preview Invoice</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      {/* ── 12. Sticky footer — stays above the keyboard ── */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={{ paddingHorizontal: barPadX, paddingTop: 10, paddingBottom: insets.bottom + 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          {invoiceBlockedBy ? (
            <Text style={{ fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 6, color: '#B45309' }}>
              Record &quot;{invoiceBlockedBy}&quot; first — Service History moves one step at a time.
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#6B7280', letterSpacing: 0.6 }}>BALANCE DUE</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: payTone }} numberOfLines={1} adjustsFontSizeToFit>
                ₹{fmt(pay.credit)}{pay.credit <= 0 ? ' · Paid' : ''}
              </Text>
              <Text style={{ fontSize: 10.5, color: '#6B7280' }} numberOfLines={1}>Bill ₹{fmt(pay.finalPayable)}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={submitting || !!invoiceBlockedBy}
              onPress={onGenerate}
              style={{ height: 50, paddingHorizontal: 20, borderRadius: 14, backgroundColor: BRAND_GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: invoiceBlockedBy ? 0.45 : submitting ? 0.7 : 1 }}
            >
              {submitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <FileText size={17} color="#FFFFFF" />}
              <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                {submitting ? 'Generating…' : existing ? 'Update Invoice' : 'Generate Invoice'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardStickyView>

      {/* Invoice preview — built from what is on this screen right now. */}
      <SafeModal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <ModalInsets>
          {({ insets: mi }) => (
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.5)', justifyContent: 'center', padding: 16, paddingTop: mi.top + 16, paddingBottom: mi.bottom + 16 }} onPress={() => setPreviewOpen(false)}>
              <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, maxHeight: '100%', width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#111111' }}>Invoice Preview</Text>
                  <Pressable onPress={() => setPreviewOpen(false)} hitSlop={8} accessibilityLabel="Close"><X size={20} color="#6B7280" /></Pressable>
                </View>
                <ScrollView contentContainerStyle={{ padding: 14 }}>
                  {ticket?.shopName ? <Text style={{ fontSize: 14, fontWeight: '800', color: '#111111' }}>{ticket.shopName}</Text> : null}
                  <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                    #{ticket?.trackingId || '—'} · {toApiDate(new Date())}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: '#111111', marginTop: 8 }}>{ticket?.customerName || 'Customer'}{ticket?.customerPhone ? ` · ${formatPhone(ticket.customerPhone)}` : ''}</Text>
                  <Text style={{ fontSize: 12.5, color: '#111111', marginTop: 2 }}>{[modelName, specLine].filter(Boolean).join(' · ')}</Text>
                  <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 10 }} />
                  {totals.serviceCharges > 0 ? <Row label="Service Charge" value={`₹${fmt(totals.serviceCharges)}`} /> : null}
                  {spareLines.map((sp, i) => (
                    <Row key={sp.id || i}
                      label={`${sp.description || `Item ${i + 1}`}${(Number(sp.qty) || 1) > 1 ? ` × ${Number(sp.qty)}` : ''}`}
                      value={`₹${fmt(taxableOf(sp) * (Number(sp.qty) || 1))}`}
                      sub={sp.warranty ? `Warranty: ${sp.warranty}` : null} />
                  ))}
                  {totals.discount > 0 ? <Row label="Discount" value={`− ₹${fmt(totals.discount)}`} color="#476B26" /> : null}
                  <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 }} />
                  <Row label="Total (before tax)" value={`₹${fmt(totals.baseAmount)}`} />
                  <Row label={`GST (${Number(gstPercent) || 0}%)`} value={`₹${fmt(totals.totalGst)}`} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#E5F3F5' }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: BRAND_GREEN }}>Final Amount</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_GREEN }}>₹{fmt(totals.finalPayable)}</Text>
                  </View>
                  {pay.advance > 0 ? <Row label="Advance paid" value={`− ₹${fmt(pay.advance)}`} /> : null}
                  {pay.paidNow > 0 ? <Row label="Paid now" value={`− ₹${fmt(pay.paidNow)}`} /> : null}
                  <Row label="Balance due" value={`₹${fmt(pay.credit)}`} bold color={payTone} />
                  <Text style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 8 }}>
                    PDF, print and share are on the invoice report after you generate it.
                  </Text>
                </ScrollView>
              </Pressable>
            </Pressable>
          )}
        </ModalInsets>
      </SafeModal>
    </View>
  );
}

// Compact invoice building blocks (module level so inputs keep focus).
function Card({ children, style }) {
  return (
    <View style={[{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginTop: 10 }, cardShadow, style]}>
      {children}
    </View>
  );
}
function Head({ Icon, title, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND_GREEN, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '800', color: '#1C3053' }} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}
function Row({ label, value, bold, color, sub }) {
  return (
    <View style={{ paddingVertical: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 13, color: bold ? '#111111' : '#374151', fontWeight: bold ? '800' : '500' }}>{label}</Text>
        <Text style={{ fontSize: 13.5, fontWeight: bold ? '800' : '700', color: color || '#111111' }}>{value}</Text>
      </View>
      {sub ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}
function AmountBox({ value, onChangeText, placeholder = '0', width = 120, editable = true }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', width, height: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: editable ? '#FFFFFF' : '#F3F4F6' }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', marginRight: 4 }}>₹</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText?.(v.replace(/[^0-9.]/g, ''))}
        editable={editable}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        cursorColor={BRAND_GREEN}
        style={{ flex: 1, padding: 0, fontSize: 14, fontWeight: '800', color: '#111111', textAlign: 'right' }}
      />
    </View>
  );
}

// Single header cell of the bordered Spare Part Taxable Value table.
function SpareHeadCell({ w, last, children }) {
  return (
    <View
      style={{
        width: w,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: '#E5E7EB',
      }}
    >
      <Text className="text-[10.5px] font-extrabold text-gray-600">
        {children}
      </Text>
    </View>
  );
}

// Read-only body cell (used for the Sl.No badge column).
function SpareReadCell({ w, last, children }) {
  return (
    <View
      style={{
        width: w,
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text className="text-[12px] font-extrabold text-gray-700">
        {children}
      </Text>
    </View>
  );
}

// Editable body cell — every other column uses this so the table is
// inline-editable in the same row layout the reference shows.
function SpareInputCell({ w, last, value, onChange, prefix, keyboardType, accent, placeholder = '—' }) {
  return (
    <View
      style={{
        width: w,
        paddingHorizontal: 6,
        paddingVertical: 6,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: '#E5E7EB',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {prefix ? (
        <Text
          className="text-[11px] font-extrabold mr-1"
          style={{ color: accent || '#6B7280' }}
        >
          {prefix}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        style={{
          flex: 1,
          fontSize: 11,
          fontWeight: '700',
          color: accent || '#111111',
          padding: 0,
        }}
      />
    </View>
  );
}

// Pressable dropdown that opens a Modal with the option list. Used for the
// Tax mode and GST % pickers so the section matches the reference layout
// instead of the previous pill row.
function InlineDropdown({ value, options, onChange, formatLabel, placeholder, disabled, disabledLabel }) {
  const [open, setOpen] = useState(false);
  const labelFor = (opt) =>
    typeof opt === 'object'
      ? opt.label
      : formatLabel
      ? formatLabel(opt)
      : String(opt);
  const valueOf = (opt) => (typeof opt === 'object' ? opt.value : opt);
  const selected = options.find((o) => valueOf(o) === value);
  const display = disabled
    ? (disabledLabel || '—')
    : selected ? labelFor(selected) : placeholder || '—';

  return (
    <>
      <Pressable
        // `disabled` on the Pressable rather than a no-op onPress: it also stops
        // the pressed-state ripple, so the control doesn't look tappable.
        onPress={() => setOpen(true)}
        disabled={disabled}
        className="flex-row items-center justify-between px-3 rounded-xl"
        style={{
          borderWidth: 1,
          borderColor: '#E5E7EB',
          backgroundColor: disabled ? '#E5F3F5' : '#FFFFFF',
          minHeight: 38,
        }}
      >
        <Text
          className="text-[12px] font-bold"
          style={{ color: disabled ? '#9CA3AF' : '#111111' }}
          numberOfLines={1}
        >
          {display}
        </Text>
        {disabled ? null : <ChevronDown size={16} color="#6B7280" />}
      </Pressable>
      <SafeModal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center px-8"
          style={{ backgroundColor: 'rgba(17, 17, 17, 0.45)' }}
          onPress={() => setOpen(false)}
        >
          <View
            className="w-full bg-white rounded-2xl overflow-hidden"
            style={cardShadow}
          >
            {options.map((opt, i) => {
              const v = valueOf(opt);
              const lbl = labelFor(opt);
              const active = value === v;
              return (
                <Pressable
                  key={String(v)}
                  onPress={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  className="px-4 py-3"
                  style={{
                    backgroundColor: active ? '#E5F3F5' : '#FFFFFF',
                    borderBottomWidth: i < options.length - 1 ? 1 : 0,
                    borderBottomColor: '#E5F3F5',
                  }}
                >
                  <Text
                    className="text-[13px] font-bold"
                    style={{ color: active ? BRAND_GREEN_DARK : '#111111' }}
                  >
                    {lbl}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </SafeModal>
    </>
  );
}

function ChargesHead({ w, align = 'right', children }) {
  return (
    <Text
      className="text-[9px] font-extrabold text-gray-500 px-1"
      style={{ width: w, letterSpacing: 0.5, textAlign: align }}
    >
      {children}
    </Text>
  );
}

function ChargesCell({ w, align = 'right', bold, accent, children }) {
  return (
    <Text
      className="text-[11px] px-1"
      style={{
        width: w,
        textAlign: align,
        fontWeight: bold ? '800' : '500',
        color: accent || (bold ? '#111111' : '#111111'),
      }}
    >
      {children}
    </Text>
  );
}

// Simple label/value row used by the Repair Totals + Payable Summary
// blocks. Mirrors the reference's clean plain-text rows (no badges).
function PlainTotalRow({ label, value, divider }) {
  return (
    <View
      className="flex-row items-center justify-between py-2"
      style={
        divider
          ? {
              borderTopWidth: 1,
              borderTopColor: '#E5F3F5',
              borderBottomWidth: 1,
              borderBottomColor: '#E5F3F5',
            }
          : null
      }
    >
      <Text className="text-[12px] font-semibold text-gray-700 flex-1 pr-2">
        {label}
      </Text>
      <Text className="text-[13px] font-extrabold text-gray-900">{value}</Text>
    </View>
  );
}

/**
 * A label with a rupee input on the right, plus an optional hint line and an
 * optional inline shortcut button ("Full"). Used by the Payment & Credit card
 * for the two figures that ARE typed — everything else there is derived.
 */
// `readOnly` keeps the boxed field — the row stays visually in line with the
// one below it — but tints it and refuses the keyboard, so a figure that is
// recorded elsewhere reads as settled rather than as something left blank.
function MoneyInputRow({ label, hint, value, onChange, action, readOnly }) {
  return (
    <View className="py-2">
      <View className="flex-row items-center">
        <Text className="text-[12px] font-semibold text-gray-700 flex-1 pr-2">
          {label}
        </Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            className="px-2.5 py-1 rounded-full mr-2"
            style={{ backgroundColor: '#E5F3F5', borderWidth: 1, borderColor: '#C7E6EA' }}
          >
            <Text className="text-[10.5px] font-extrabold" style={{ color: ACCENT_GREEN }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
        <View
          className="flex-row items-center px-3 py-1.5 rounded-lg"
          style={{
            borderWidth: 1,
            borderColor: '#E5E7EB',
            backgroundColor: readOnly ? '#F4F7F4' : '#FFFFFF',
            minWidth: 120,
          }}
        >
          <Text className="text-[13px] font-extrabold mr-1 text-gray-700">₹</Text>
          <TextInput
            value={value}
            onChangeText={readOnly ? undefined : (v) => onChange(v.replace(/[^0-9.]/g, ''))}
            editable={!readOnly}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: '700',
              color: readOnly ? '#4B564B' : '#111111',
              textAlign: 'right',
              padding: 0,
            }}
          />
        </View>
      </View>
      {hint ? (
        <Text className="text-[10px] text-gray-400 mt-1">{hint}</Text>
      ) : null}
    </View>
  );
}

