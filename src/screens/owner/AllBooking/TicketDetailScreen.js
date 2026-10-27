import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, StatusBar, useWindowDimensions, PanResponder, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Smartphone,
  Clock,
  Share2,
  QrCode,
  UserPlus,
  RefreshCcw,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
  User,
  Users,
  Phone,
  MapPin,
  IndianRupee,
  ShieldCheck,
  FileText,
  Calendar,
  Wrench,
  ChevronRight,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  ScanLine,
  Plus,
  Pencil,
  Calculator,
  CalendarClock,
  History as HistoryIcon,
  ListChecks,
  Lock,
  Camera,
  Eye,
  SquarePen,
  Settings,
  Search,
  BadgeCheck,
  PackageCheck,
  Truck,
  CircleX,
  ThumbsDown,
} from 'lucide-react-native';
import { Loader, EmptyState } from '../../../components/rnr';
import { confirm, notify } from '../../../components/confirm';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { ticketApi } from '../../../api/client';
import { getModelsByBrand } from '../../../api/masterData';
// The receipt lives in its own module so the Bookings list can share the same
// one from its actions sheet.
import { priceItemsFromTicket, paymentFromTicket } from './ReceiptCard';
// Share Image sheet — same component the Bookings list uses, so the
// experience (and the receipt it renders) is identical everywhere.
import { RescheduleSheet, ShareReceiptSheet } from './BookingActionSheets';
import ImageViewerModal from '../../../components/ImageViewerModal';
import WhatsAppIcon from '../../../components/WhatsAppIcon';
import { bookingPhotoUrls } from '../../../utils/bookingPhotos';
import { stepBlockedBy } from '../../common/serviceHistoryPhases';
import { specDisplayParts, specsFromRecord } from '../../../utils/deviceSpecs';
import { useImeiApplies } from '../../../utils/imeiPolicy';

// Swiggy / Zomato green palette — same as the rest of the booking flow.
const BRAND_GREEN = '#035C6C';
const BRAND_GREEN_DARK = '#035C6C';
const ACCENT_GREEN = '#035C6C';

// Closing booking steps the owner records by ticking + Submit. Two parallel
// paths after the repair stage: READY (repair completed, device going back to
// customer fixed) OR RETURN_DELIVERY (device not repaired, returning as-is).
// Both paths terminate at DELIVERED. The invoice / delivery-processing
// substeps are recorded automatically by the Invoice Generator + delivery
// flows, so they no longer need a manual checkbox here.
const OWNER_PROGRESS_ROWS = [
  { key: 'READY',           label: 'Ready for Delivery' },
  { key: 'RETURN_DELIVERY', label: 'Return Delivery' },
  { key: 'DELIVERED',       label: 'Delivered to Customer' },
];

// Status → tone + label. Same tone vocabulary the list screen uses so the
// pill rendered here matches the row in BookingHistory.
const STATUS_VARIANT = {
  CREATED:              { label: 'Service Accepted',     tone: 'amber' },
  ASSIGNED:             { label: 'Technician Assigned',  tone: 'blue' },
  IN_DIAGNOSIS:         { label: 'In Diagnosis',         tone: 'purple' },
  IN_REPAIR:            { label: 'In Service',           tone: 'purple' },
  QUOTED:               { label: 'Re-Estimated',         tone: 'amber' },
  APPROVED:             { label: 'Approved',             tone: 'blue' },
  READY:                { label: 'Ready for Delivery',                tone: 'green' },
  RETURN_DELIVERY:      { label: 'Return Delivery',                   tone: 'amber' },
  INVOICE_GENERATED:    { label: 'Billing & Delivery Invoice Generated', tone: 'amber' },
  INVOICE_READY:        { label: 'Invoice Sent',                      tone: 'amber' },
  DELIVERED_PROCESSING: { label: 'Dispatched',               tone: 'amber' },
  DELIVERED:            { label: 'Delivered',                         tone: 'green' },
  CANCELLED:            { label: 'Cancelled',                         tone: 'red' },
};

const TONE = {
  amber:  { bg: 'rgba(245, 158, 11, 0.12)', fg: '#B45309',        border: 'rgba(245, 158, 11, 0.35)' },
  blue:   { bg: 'rgba(3, 92, 108, 0.12)', fg: '#035C6C',        border: 'rgba(3, 92, 108, 0.35)' },
  purple: { bg: 'rgba(53, 125, 137, 0.12)', fg: '#035C6C',        border: 'rgba(53, 125, 137, 0.35)' },
  green:  { bg: 'rgba(3, 92, 108, 0.12)',  fg: BRAND_GREEN_DARK,  border: 'rgba(3, 92, 108, 0.35)' },
  red:    { bg: 'rgba(220, 38, 38, 0.12)',  fg: '#B91C1C',        border: 'rgba(220, 38, 38, 0.35)' },
};

// Linear booking lifecycle (matches the backend's LIFECYCLE_ORDER). Used so a
// Service Progress step counts as "done" once the ticket status is at/past it —
// e.g. after the invoice is generated, "Ready for Delivery" is already behind us.
const LIFECYCLE_ORDER = [
  'CREATED', 'IN_DIAGNOSIS', 'QUOTED', 'APPROVED', 'IN_REPAIR',
  'READY', 'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED',
];

// Statuses that imply the technician has actively picked up the job.
const ACCEPTED_STATUSES = new Set([
  'IN_DIAGNOSIS', 'IN_REPAIR', 'QUOTED', 'APPROVED', 'READY',
  'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED',
]);

// Re-Estimated moved to the Home screen, next to New Booking and Pickup — it is
// a way IN to a booking, not something you do from inside one, so it belongs
// with the other entry points rather than among this screen's per-ticket actions.
// Bottom-bar actions, 4 per row. Delivered bookings can't be edited,
// re-estimated, re-scheduled or moved on — they get Re-Service instead.
const ACTION_TILES = [
  { key: 'edit',       label: 'Edit',     icon: Pencil },
  { key: 'reestimate',   label: 'Re-Est',        icon: Calculator }, // add issues, amount & time
  { key: 'editestimate', label: 'Price Revised', icon: SquarePen },  // remove issues or edit amount
  { key: 'reschedule', label: 'Resched.', icon: CalendarClock },
  { key: 'history',    label: 'History',  icon: HistoryIcon },
  { key: 'share',      label: 'Receipt',  icon: Share2 },
  { key: 'barcode',    label: 'Barcode',  icon: QrCode },
  { key: 'status',     label: 'Status',   icon: ListChecks },
];
// Bottom-bar icon discs: a different brand colour per action (Teal, Bright
// Blue, Green, Orange, Navy, Red, then deeper teal / blue), white icons.
const HOME_TILE_TONES = ['#035C6C', '#0788C9', '#609138', '#E08E00', '#1C3053', '#F32C26', '#357D89', '#0571A8'];
const DELIVERED_TILES = [
  { key: 'history',   label: 'History',    icon: HistoryIcon },
  { key: 'share',     label: 'Receipt',    icon: Share2 },
  { key: 'barcode',   label: 'Barcode',    icon: QrCode },
  { key: 'reservice', label: 'Re-Service', icon: RefreshCcw },
];

// "Update Status" auto-advances the booking one stage at a time along this
// owner-facing flow — the owner no longer hand-picks an arbitrary status.
// Cancelled sits outside the linear flow (reached via the Cancel action).
// In Diagnosis isn't used; Re-Estimated / Customer Approved are set by the
// Re-Estimate flow itself, so they aren't manual options either.
const ADVANCE_FLOW = ['CREATED', 'IN_REPAIR', 'READY', 'DELIVERED'];

// The Service History step each advance writes, where it writes one. Advancing
// is held to the same one-step-at-a-time rule as every other status action
// (stepBlockedBy) — otherwise "Advance To Ready for Delivery" would tick that
// row with Repair Completed and Quality Check still blank above it.
const ADVANCE_STEP = {
  QUOTED: 'RE_ESTIMATED_CONFIRMED',
  APPROVED: 'CUSTOMER_APPROVED',
  IN_REPAIR: 'IN_REPAIR',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
};

// Rank every lifecycle status so we can resolve "the next stage" even for
// statuses that sit off the linear owner flow (ASSIGNED, INVOICE_*, etc.).
const STATUS_RANK = {
  CREATED: 0, ASSIGNED: 0.5, IN_DIAGNOSIS: 1, QUOTED: 2, APPROVED: 3, IN_REPAIR: 4,
  READY: 5, INVOICE_GENERATED: 5.5, INVOICE_READY: 5.6, RETURN_DELIVERY: 5.7,
  DELIVERED_PROCESSING: 5.8, DELIVERED: 6,
};

// Update Status options (reference design): title, hint, icon, brand colour.
const STATUS_OPTION = {
  IN_DIAGNOSIS: { title: 'In Diagnosis', sub: 'Check the device and find the fault', Icon: Search, tone: '#0788C9' },
  QUOTED: { title: 'Re-Estimated', sub: 'Extra work quoted to the customer', Icon: Calculator, tone: '#FAA700' },
  APPROVED: { title: 'Customer Approved', sub: 'Customer accepted the estimate', Icon: BadgeCheck, tone: '#609138' },
  IN_REPAIR: { title: 'In Repair', sub: 'Start the actual repair work', Icon: Wrench, tone: '#035C6C' },
  QUALITY_CHECK: { title: 'Quality Check Completed', sub: 'Repair checked and passed by the shop', Icon: ShieldCheck, tone: '#609138' },
  READY: { title: 'Ready for Delivery', sub: 'Ready to hand over to the customer', Icon: PackageCheck, tone: '#E08E00' },
  INVOICE_GENERATED: { title: 'Invoice Generated', sub: 'Create the invoice for this booking', Icon: FileText, tone: '#357D89' },
  DELIVERED_PROCESSING: { title: 'Dispatched', sub: 'Device dispatched to the customer', Icon: Truck, tone: '#1C3053' },
  DELIVERED: { title: 'Delivered', sub: 'Mark as delivered to the customer', Icon: CheckCircle2, tone: '#0788C9' },
  CUSTOMER_REJECTED: { title: 'Customer Rejected', sub: 'Customer declined the repair / estimate', Icon: ThumbsDown, tone: '#E08E00' },
  CANCELLED: { title: 'Cancelled / Closed', sub: 'Close this booking (when applicable)', Icon: CircleX, tone: '#F32C26' },
};
// Blocker marker: the re-estimate still needs the customer's approval.
const AWAIT_APPROVAL = '__AWAIT_APPROVAL__';
// Sheet options recorded as a Service History step (progress event), not a
// direct status change — the backend moves ticket.status from the step.
const STEP_OPTION_KEY = {
  QUALITY_CHECK: 'QUALITY_CHECK_COMPLETED',
  DELIVERED_PROCESSING: 'DELIVERED_PROCESSING',
  CUSTOMER_REJECTED: 'CUSTOMER_REJECTED',
};
// "Tue, Oct 27, 2026 02:35 AM"
function fmtStatusWhen(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day} ${time}`;
}

// The stage to auto-advance to from the current status — or null when the
// booking is already delivered or cancelled (nothing further to advance to).
function nextStage(statusKey) {
  const key = String(statusKey || '').toUpperCase();
  if (key === 'CANCELLED' || key === 'DELIVERED') return null;
  const rank = STATUS_RANK[key] ?? 0;
  return ADVANCE_FLOW.find((s) => (STATUS_RANK[s] ?? 0) > rank) || null;
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7627519), matching the
// design. Non-conforming ids fall back to an all-dark render.
function splitTrackingId(id) {
  const s = String(id ?? '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

export default function TicketDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  // Phones: full width. Tablets/large screens: cap + centre so the receipt and
  // info cards read as a tidy document instead of stretching edge-to-edge.
  const contentW = Math.min(winW, 760);
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [technician, setTechnician] = useState(null);
  // The booking's invoice (GET /tickets/{id}/invoice; null when none yet).
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  /**
   * Arriving from the Re-Estimated list with `autoEdit` opens the edit wizard
   * straight away, so tapping a row there lands in Re-Estimate rather than here.
   *
   * MUST live up here with the other hooks. This screen returns early while it
   * loads, so a hook declared further down runs on some renders and not others —
   * React counts a different number of hooks between renders and throws
   * "Rendered more hooks than during the previous render".
   *
   * It runs the SAME onAction('edit') the tile used to rather than a second copy
   * of the navigation: that branch owns the category lookup and buildEditParams,
   * and two copies would drift. `onAction` is declared below, which is fine —
   * effects run after the whole component body has evaluated. Waits for
   * `ticket`, since the line items and estimate derive from it, and fires once:
   * without the ref, a re-render or coming back from the wizard would relaunch it.
   */
  const autoEditFired = useRef(false);
  // State, not just the ref: the spinner below has to re-render once the wizard
  // has been launched, so that coming BACK from it shows the real detail screen
  // instead of a spinner that never resolves.
  const [autoEditLaunched, setAutoEditLaunched] = useState(false);
  // autoReService (Bookings menu → Re-Service) and autoReEstimate (Bookings
  // menu → Re-Estimate) use the same one-shot launch.
  const autoMode = route?.params?.autoEdit ? 'edit'
    : route?.params?.autoReService ? 'reservice'
      : route?.params?.autoReEstimate ? 'reestimate' : null;
  useEffect(() => {
    if (!autoMode || !ticket || autoEditFired.current) return;
    autoEditFired.current = true;
    Promise.resolve(onAction(autoMode)).finally(() => setAutoEditLaunched(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, autoMode]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pickedStatus, setPickedStatus] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // Bottom action menu starts hidden behind its handle: tap it, or swipe up /
  // down, to show or hide the actions.
  const [menuOpen, setMenuOpen] = useState(false);
  // Latest "Service Re-estimated" history step, when the booking has one.
  const [reEstimateEvent, setReEstimateEvent] = useState(null);
  // Device photos viewer: index of the photo open full-screen, null = closed.
  const [photoIndex, setPhotoIndex] = useState(null);
  const menuPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
    onPanResponderRelease: (_, g) => {
      if (g.dy < -12) setMenuOpen(true);
      else if (g.dy > 12) setMenuOpen(false);
      else setMenuOpen((v) => !v);
    },
  })).current;

  const [statusBusy, setStatusBusy] = useState(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(data);
      ticketApi.get(`/tickets/${ticketId}/invoice`)
        .then((inv) => setInvoice(inv && (inv.invoiceNo || inv.id) ? inv : null))
        .catch(() => setInvoice(null));
      if (data?.assignedTechnicianId) {
        try {
          const list = await ticketApi.get('/technicians');
          const arr = Array.isArray(list) ? list : (list?.content || []);
          setTechnician(arr.find((x) => x.id === data.assignedTechnicianId) || null);
        } catch (_) { setTechnician(null); }
      } else {
        setTechnician(null);
      }
    } catch (e) {
      setError(e.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Service Progress — owner-side submission with Mark → Done/Cancel flow,
  // matching the technician Ticket Detail screen. The `done` state is sourced
  // from /tickets/{id}/events (any actor) so steps the technician already
  // recorded show as DONE here too. Steps the OWNER controls (invoice /
  // delivery) can still be ticked + submitted from this screen.
  //
  //   progressStatus → { [statusKey]: { done: true, at: ISO } }  (server truth)
  //   progressChecked → { [statusKey]: boolean }                 (UI tick)
  //   progressBusy   → statusKey currently being submitted (for spinner)
  const [progressStatus, setProgressStatus] = useState({});
  const [progressChecked, setProgressChecked] = useState({});
  const [progressBusy, setProgressBusy] = useState(null);
  // Every status on the booking's timeline (any actor) — what the
  // one-step-at-a-time gate checks before Mark or Advance can write.
  const [recordedKeys, setRecordedKeys] = useState([]);

  // IMEI capture gate — a booking must carry an IMEI before it can be marked
  // "Ready for Delivery". If it's missing we pop a type-or-scan sheet, PATCH the
  // IMEI onto the ticket, then continue the progress submission.
  const [imeiModalOpen, setImeiModalOpen] = useState(false);
  const [imeiInput, setImeiInput] = useState('');
  const [imeiSaving, setImeiSaving] = useState(false);
  const pendingReadyRow = useRef(null); // the READY row awaiting IMEI, or null for a plain add
  const showImei = useImeiApplies(ticket); // mobile phones only

  const refreshProgress = useCallback(async () => {
    if (!ticketId) return;
    try {
      const rows = await ticketApi.get(`/tickets/${ticketId}/events`);
      const out = {};
      setRecordedKeys((Array.isArray(rows) ? rows : []).map((e) => String(e.status || '').toUpperCase()));
      setReEstimateEvent((Array.isArray(rows) ? rows : [])
        .filter((e) => String(e?.status || '').toUpperCase() === 'RE_ESTIMATED_CONFIRMED')
        .sort((x, y) => new Date(x.createdAt || 0) - new Date(y.createdAt || 0))
        .pop() || null);
      (Array.isArray(rows) ? rows : []).forEach((e) => {
        const k = (e.status || '').toUpperCase();
        if (!OWNER_PROGRESS_ROWS.some((r) => r.key === k)) return;
        // Keep the earliest timestamp per step (first-time-completed marker).
        const prev = out[k];
        if (!prev || (e.createdAt && new Date(e.createdAt) < new Date(prev.at))) {
          out[k] = { done: true, at: e.createdAt || null };
        }
      });
      setProgressStatus(out);
    } catch { /* keep current */ }
  }, [ticketId]);

  // On focus, not just mount: a step recorded on another screen (the status
  // sheet, the technician app) has to unlock the next one here when you return.
  useFocusEffect(useCallback(() => { refreshProgress(); }, [refreshProgress]));

  // Bottom-bar "Update Status" — same PATCH /tickets/{id}/status the technician
  // Update Status screen uses, exposed here as a light-themed bottom sheet. It
  // advances one lifecycle stage at a time, and only once the Service History
  // step before that stage is recorded (ADVANCE_STEP + stepBlockedBy).
  const applyStatus = useCallback(async (nextStatus) => {
    if (!ticketId) return;
    setStatusBusy(nextStatus);
    try {
      await ticketApi.patch(`/tickets/${ticketId}/status`, { query: { status: nextStatus } });
      setStatusOpen(false);
      const label = STATUS_VARIANT[nextStatus]?.label || nextStatus;
      notify('Status updated', `Booking moved to "${label}".`, { preset: 'done' });
      load();
      refreshProgress();
    } catch (e) {
      notify('Update failed', e?.message || 'Try again', { preset: 'error', haptic: 'error' });
    } finally {
      setStatusBusy(null);
    }
  }, [ticketId, load, refreshProgress]);

  // Cancelling sits outside the linear auto-advance flow, so it stays an
  // explicit, confirmed action rather than a stage the owner advances into.
  const cancelBooking = useCallback(async () => {
    const ok = await confirm({
      title: 'Cancel booking',
      message: 'Cancel this booking? This moves it to Cancelled and can\'t be undone.',
      confirmText: 'Cancel booking',
      destructive: true,
    });
    if (ok) applyStatus('CANCELLED');
  }, [applyStatus]);

  // Update Status → Quality Check Completed, recorded by the shop (actor OWNER,
  // same progress event as History's QC button). The backend then moves the
  // booking on to Ready for Delivery.
  const recordStep = useCallback(async (optKey, note) => {
    const statusKeyToRecord = STEP_OPTION_KEY[optKey];
    if (!statusKeyToRecord) return;
    setStatusBusy(optKey);
    try {
      await ticketApi.post(`/tickets/${ticketId}/progress-events`, {
        body: { statusKey: statusKeyToRecord, actor: 'OWNER', ...(note ? { note } : {}) },
      });
      setStatusOpen(false);
      notify(`${STATUS_OPTION[optKey]?.title || 'Status'} recorded`, 'Saved on the Service History.', { preset: 'done' });
      load();
      refreshProgress();
    } catch (e) {
      notify('Could not save', e?.message || 'Try again', { preset: 'error', haptic: 'error' });
    } finally {
      setStatusBusy(null);
    }
  }, [ticketId, load, refreshProgress]);

  const submitProgress = useCallback(async (row) => {
    setProgressBusy(row.key);
    try {
      await ticketApi.post(`/tickets/${ticketId}/progress-events`, {
        body: { statusKey: row.key, actor: 'SHOP' },
      });
      setProgressChecked((prev) => ({ ...prev, [row.key]: false }));
      // Optimistically mark done so the UI flips immediately; refreshProgress
      // then reconciles with the server's authoritative timestamp.
      setProgressStatus((prev) => ({
        ...prev,
        [row.key]: { done: true, at: prev[row.key]?.at || new Date().toISOString() },
      }));
      refreshProgress();
      notify('Saved', `"${row.label}" recorded.`, { preset: 'done' });
    } catch (e) {
      notify('Save failed', e?.message || 'Try again', { preset: 'error', haptic: 'error' });
    } finally {
      setProgressBusy(null);
    }
  }, [ticketId, refreshProgress]);

  // "Done" tap on a progress step. Ready for Delivery requires an IMEI on a
  // mobile phone — if the booking has none, open the capture sheet instead of
  // recording immediately. Other device types have no IMEI to ask for.
  const onProgressDone = useCallback((row) => {
    const blocker = stepBlockedBy(recordedKeys, row.key);
    if (blocker) {
      notify('Complete the previous step first', `Record "${blocker}" before "${row.label}".`);
      return;
    }
    const hasImei = !!String(ticket?.imei || '').trim();
    if (row.key === 'READY' && showImei && !hasImei) {
      pendingReadyRow.current = row;
      setImeiInput('');
      setImeiModalOpen(true);
      return;
    }
    submitProgress(row);
  }, [ticket, submitProgress, recordedKeys, showImei]);

  // Opens the same sheet from the Service Info card, just to add/fix the IMEI
  // (no progress step to continue afterwards).
  const openImeiEntry = useCallback(() => {
    pendingReadyRow.current = null;
    setImeiInput(String(ticket?.imei || ''));
    setImeiModalOpen(true);
  }, [ticket]);

  // Device Details' "+ Add IMEI" arrives here with ?autoImei=true rather than
  // duplicating the capture sheet on that (deliberately read-only) screen —
  // same precedent as autoEdit above: fire the SAME existing entry point once
  // the ticket has loaded, instead of making the owner tap the IMEI row again.
  const autoImeiFired = useRef(false);
  useEffect(() => {
    if (!route?.params?.autoImei || !ticket || autoImeiFired.current) return;
    autoImeiFired.current = true;
    openImeiEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, route?.params?.autoImei]);

  const saveImeiAndContinue = useCallback(async () => {
    const imei = normaliseImei(imeiInput);
    if (!imei) {
      notify('Enter a valid IMEI', 'IMEI must be 14–17 digits. Dial *#06# on the device to see it.', { preset: 'error' });
      return;
    }
    setImeiSaving(true);
    try {
      await ticketApi.patch(`/tickets/${ticketId}`, { body: { imei } });
      setTicket((prev) => (prev ? { ...prev, imei } : prev));
      setImeiModalOpen(false);
      const row = pendingReadyRow.current;
      pendingReadyRow.current = null;
      if (row) await submitProgress(row); // continue the Ready-for-Delivery record
      else notify('Saved', 'IMEI added to this booking.', { preset: 'done' });
    } catch (e) {
      notify('Save failed', e?.message || 'Could not save the IMEI. Try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setImeiSaving(false);
    }
  }, [imeiInput, ticketId, submitProgress]);

  if (loading && !ticket) {
    return (
      <View className="flex-1 bg-background">
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View
          className="border-b border-border"
          style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 14 }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={6}
              className="items-center justify-center active:opacity-70"
              style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={18} color="#111111" strokeWidth={2} />
            </Pressable>
            <Text style={{ flex: 1, color: '#111111', fontSize: 17, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>Booking Details</Text>
            <View style={{ width: 36 }} />
          </View>
        </View>
        <Loader label="Loading booking..." />
      </View>
    );
  }
  if (error || !ticket) {
    return (
      <View className="flex-1 bg-background">
        <EmptyState
          title="Booking not found"
          description={error || 'We could not load this booking.'}
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  const trackingId = ticket.trackingId || ticket.id;
  const tid = splitTrackingId(trackingId);
  const deviceName = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || 'Device';
  const color = ticket.color;
  const ramLabel = ticket.ramLabel;
  const storageLabel = ticket.storageLabel;
  // Device card: model name / model number - RAM / storage / colour, each on its
  // own line. deviceDisplayName is "Apple iPhone 11 · A2221 (4 GB / 64 GB / Black)".
  const shownDevice = /^(.*?)(?: · ([^()]+?))?(?: \(([^)]*)\))?$/.exec(String(ticket.deviceDisplayName || '').trim()) || [];
  const modelName = (shownDevice[1] || '').trim() || ticket.deviceModelName || ticket.modelName || 'Device';
  const modelNumber = ticket.modelNumber || (shownDevice[2] || '').trim();
  const specParts = specDisplayParts({ ...ticket, ramLabel, storageLabel });
  const specText = (specParts.length ? specParts
    : String(shownDevice[3] || '').split(' / ').map((x) => x.trim())
      .filter((x) => x && x.toLowerCase() !== String(color || '').trim().toLowerCase())).join(' / ');
  const modelLine = [modelNumber, specText].filter(Boolean).join(' - ');
  const photoUrls = bookingPhotoUrls(ticket);
  // Customer Mobile row: Call opens the dialer, WhatsApp the customer's chat.
  const contactCustomer = (scheme) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!digits) return;
    const url = scheme === 'whatsapp' ? `https://wa.me/91${digits}` : `tel:${digits}`;
    Linking.openURL(url).catch(() =>
      notify(scheme === 'whatsapp' ? 'WhatsApp not found' : 'Unable to call',
        scheme === 'whatsapp' ? 'Install WhatsApp to message this customer.' : 'Could not open the phone dialer.'));
  };
  const customerName = ticket.customerName || '—';
  const phone = ticket.customerPhone || '';
  const address = ticket.customerAddress || '';

  const lineItems = priceItemsFromTicket(ticket);
  const estimatedTotal = ticket.estimatedPrice != null
    ? ticket.estimatedPrice
    : lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const payment = paymentFromTicket(ticket, estimatedTotal);

  const statusKey = String(ticket.status || '').toUpperCase();
  // Delivered: no Assign / Update Status; the bottom bar offers Re-Service.
  const isDelivered = statusKey === 'DELIVERED';
  // Complaint without the old "IMEI not provided: …" line the booking flow used to append.
  const complaintText = String(ticket.issueDescription || '').replace(/^\s*IMEI not provided:.*$/gim, '').trim();
  const securityText = formatSecurity(ticket.deviceSecurityType, ticket.deviceSecurityValue);
  const statusMeta = STATUS_VARIANT[statusKey] || { label: ticket.status || 'Pending', tone: 'amber' };
  const statusTone = TONE[statusMeta.tone] || TONE.amber;
  const StatusIcon = statusKey === 'CANCELLED' ? AlertCircle : CheckCircle2;
  const statusIdx = LIFECYCLE_ORDER.indexOf(statusKey);
  const hasTechnician = !!ticket.assignedTechnicianId;
  const techAccepted = hasTechnician && ACCEPTED_STATUSES.has(statusKey);
  const techName = technician?.name || (hasTechnician ? 'Assigned Technician' : null);
  const techCode = technician?.code
    || (technician?.id ? String(technician.id).slice(0, 8).toUpperCase() : null);

  // Not delivered, and either nobody yet or the technician hasn't accepted.
  const canChangeTech = !isDelivered && (!hasTechnician || !techAccepted);
  // Own screen on the outer stack: back returns here and this screen reloads on focus.
  const goToAssign = () => {
    if (!canChangeTech) return;
    navigation.navigate('TechnicianAssign', {
      ticketId: ticket.id,
      trackingId,
      deviceName,
      currentTechnicianId: ticket.assignedTechnicianId || null,
    });
  };

  const onAssignPress = goToAssign;

  const onAction = async (key) => {
    switch (key) {
      // Edit = booking DETAILS only (customer, device, IMEI, complaint, photos,
      // parts, security) on one screen; it never changes status, price,
      // technician or delivery. Re-Est / Price Revised / Re-Service keep the wizard.
      case 'edit':
        if (autoMode) navigation.replace('EditBooking', { ticketId: ticket.id });
        else navigation.navigate('EditBooking', { ticketId: ticket.id });
        break;
      // Re-Est = ADDITIONAL issues + charges only, on its own screen (original
      // prices read-only; status moves through the server's re-estimate rules).
      case 'reestimate':
        if (autoMode) navigation.replace('ReEstimate', { ticketId: ticket.id });
        else navigation.navigate('ReEstimate', { ticketId: ticket.id });
        break;
      // Price Revised = change / cancel EXISTING services only, on its own screen
      // (no new services, no status change).
      case 'editestimate':
        navigation.navigate('PriceRevised', { ticketId: ticket.id });
        break;
      case 'reservice': {
        // Ticket doesn't store device categoryId — look it up from master-data
        // so SelectModel (and SelectBrand) can filter to Mobile only instead of
        // mixing in Laptops/Tablets that share the same brand (e.g. Apple).
        let categoryId = null;
        let categoryName = null;
        try {
          const list = await getModelsByBrand(ticket.brandId);
          const m = (list || []).find((x) => x.id === ticket.modelId);
          if (m?.categoryId) {
            categoryId = m.categoryId;
            categoryName = m.categoryName || null;
          }
        } catch (_) { /* fall through — unfiltered list is still OK */ }

        // Enter the nested booking stack at Customer Details (pre-filled with
        // this booking's customer), whose Next opens the one-page Device
        // Details pre-filled with its brand / model / colour / storage — the
        // same screens as a new booking — so the rest of the wizard
        // (DeviceServices, ServicePriceEstimate, ServiceBookingDevicesList)
        // resolves inside RepairServiceBookingShop.
        // Arriving via autoEdit, this screen was only a staging post — REPLACE it
        // so Back from the wizard returns to the Re-Estimated list rather than
        // to a detail screen the user never chose to open. Opened normally from
        // the tile, it is a real destination and Back should come back here.
        const enterWizard = autoMode
          ? navigation.replace.bind(navigation)
          : navigation.navigate.bind(navigation);
        // Re-Service reopens this same ticket: customer and device are already
        // known, so it skips straight to Services (new issue + estimate).
        // Re-Estimate does too, but as an EDIT of this booking (its services,
        // prices and every other saved field prefilled) — a price change there
        // is what marks the booking re-estimated on save.
        enterWizard('RepairServiceBookingShop', {
          screen: key === 'reservice' || key === 'reestimate' || key === 'editestimate' ? 'ServicePriceEstimate' : 'CustomerDetails',
          params: {
            ...(key === 'reservice' ? buildReServiceParams(ticket) : buildEditParams(ticket, { lineItems, estimatedTotal })),
            categoryId,
            categoryName,
            // Device & Service Details asks for the customer's re-estimate approval.
            reEstimate: key === 'reestimate',
            flow: 'BOOKING',
            // Customer Details seeds its form from `initial` and reuses
            // `existing` (this booking's customer row) on Save.
            initial: { name: ticket.customerName || '', phone: ticket.customerPhone || '', address: ticket.customerAddress || '' },
            existing: ticket.customerId
              ? { id: ticket.customerId, name: ticket.customerName, phone: ticket.customerPhone, address: ticket.customerAddress, source: 'shop' }
              : null,
          },
        });
        break;
      }
      case 'reschedule': setRescheduleOpen(true); break;
      case 'assign':  onAssignPress(); break;
      case 'status': {
        const n = nextStage(statusKey);
        setPickedStatus(
          n === 'READY' && !recordedKeys.includes('QUALITY_CHECK_COMPLETED') ? 'QUALITY_CHECK'
            : n === 'DELIVERED' && !recordedKeys.includes('INVOICE_GENERATED') ? 'INVOICE_GENERATED'
            : n === 'DELIVERED' && !recordedKeys.includes('DELIVERED_PROCESSING') ? 'DELIVERED_PROCESSING'
            : n,
        );
        setRejectReason('');
        setStatusOpen(true);
        break;
      }
      case 'history': navigation.navigate('BookingTimeline', { ticketId: ticket.id }); break;
      case 'share':   setShareOpen(true); break;
      case 'barcode': navigation.navigate('BarcodePrint', { ticketId: ticket.id, mode: 'barcode' }); break;
      default: break;
    }
  };

  // Coming from the Re-Estimated list, this screen is a staging post, not a
  // destination — it exists only to load the ticket the wizard needs. Showing
  // the full booking detail on the way through made it look like the wrong
  // screen had opened, so hold a plain spinner until the wizard takes over.
  if (autoMode && !autoEditLaunched) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
        <Text className="mt-3 text-[13px] text-text-muted">{autoMode === 'reservice' ? 'Opening re-service…' : 'Opening re-estimate…'}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── White header (replaces native white nav header) ── */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={6}
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={18} color="#111111" strokeWidth={2} />
          </Pressable>
          {/* Centred title + tracking id, with an equal 36pt spacer on the right
              (same header as Customer Details / Device & Service Details). */}
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8, alignItems: 'center' }}>
            <Text style={{ color: '#111111', fontSize: 17, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>
              Booking Details
            </Text>
            <View className="px-2.5 rounded-full" style={{ marginTop: 3, paddingVertical: 2, maxWidth: 200, backgroundColor: '#E5F3F5' }}>
              <Text className="text-[11px] font-extrabold" numberOfLines={1}>
                <Text style={{ color: '#111111' }}>#{tid.prefix}</Text>
                <Text style={{ color: BRAND_GREEN_DARK }}>{tid.digits}</Text>
              </Text>
            </View>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 0, paddingBottom: insets.bottom + (menuOpen ? 190 : 48) }}>
        <View style={{ width: contentW, alignSelf: 'center' }}>
        {/* ── Device hero ─────────────────────────────────────── */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View className="bg-card rounded-2xl px-3.5 py-3" style={cardShadow}>
            <View className="flex-row items-start">
              <View
                className="w-[56px] h-[56px] rounded-xl overflow-hidden items-center justify-center"
                style={{ backgroundColor: '#E5F3F5' }}
              >
                {ticket.deviceImageUrl ? (
                  <Image source={{ uri: ticket.deviceImageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <Smartphone size={24} color="#6B7280" />
                )}
              </View>
              <View className="ml-3 flex-1" style={{ minWidth: 0 }}>
                <Text className="text-[15px] font-extrabold text-text">{modelName}</Text>
                {modelLine ? (
                  <Text className="text-[12.5px] font-semibold text-text">{modelLine}</Text>
                ) : null}
                {color ? (
                  <Text className="text-[12px] text-text-muted">{color}</Text>
                ) : null}
              </View>
              {/* Right: Tracking ID and Booked on, stacked. */}
              <View className="items-end ml-2" style={{ maxWidth: 130 }}>
                <Text className="text-[10px] text-text-muted">Tracking ID</Text>
                <Text className="text-[13px] font-extrabold text-primary text-right">#{trackingId}</Text>
                {ticket.createdAt ? (
                  <>
                    <Text className="text-[10px] text-text-muted" style={{ marginTop: 6 }}>Booked on</Text>
                    <Text className="text-[11px] font-bold text-text text-right" style={{ marginTop: 1 }}>{fmtInstant(ticket.createdAt) || '-'}</Text>
                  </>
                ) : null}
              </View>
            </View>
            {/* Status, starting at the card's left edge under the image. */}
            <View
              className="self-start flex-row items-center rounded-full px-2 py-0.5 mt-2"
              style={{ backgroundColor: statusTone.bg, borderWidth: 1, borderColor: statusTone.border }}
            >
              <StatusIcon size={12} color={statusTone.fg} />
              <Text className="text-[10px] font-extrabold ml-1 flex-shrink" style={{ color: statusTone.fg }}>
                {statusMeta.label.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Customer ────────────────────────────────────────── */}
        {(customerName || phone || address) ? (
          <>
            <SectionHeader icon={User} label="CUSTOMER" />
            <View className="px-4">
              <View className="bg-card rounded-2xl px-4 py-2" style={cardShadow}>
                {customerName ? <DetailRow icon={User} label="Name" value={customerName} /> : null}
                {phone ? (
                  <View className="flex-row items-center py-1.5">
                    <View className="w-7 h-7 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                      <Phone size={14} color={ACCENT_GREEN} />
                    </View>
                    <Text className="text-[12px] text-text-muted" style={{ width: 78 }}>Mobile</Text>
                    <Text className="text-[13px] text-text font-bold flex-1" numberOfLines={1}>{phone}</Text>
                    <Pressable
                      onPress={() => contactCustomer('tel')}
                      hitSlop={4}
                      className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                      style={{ backgroundColor: '#E5F3F5' }}
                      accessibilityRole="button"
                      accessibilityLabel="Call customer"
                    >
                      <Phone size={15} color={ACCENT_GREEN} />
                    </Pressable>
                    <Pressable
                      onPress={() => contactCustomer('whatsapp')}
                      hitSlop={4}
                      className="w-8 h-8 rounded-full items-center justify-center ml-2 active:opacity-70"
                      style={{ backgroundColor: 'rgba(37, 211, 102, 0.14)' }}
                      accessibilityRole="button"
                      accessibilityLabel="WhatsApp customer"
                    >
                      <WhatsAppIcon size={16} color="#25D366" />
                    </Pressable>
                  </View>
                ) : null}
                {address ? <DetailRow icon={MapPin} label="Address" value={address} /> : null}
              </View>
            </View>
          </>
        ) : null}

        {/* ── Device photos (taken at booking) — tap one, or View, to open full-screen ── */}
        {photoUrls.length ? (
          <>
            <SectionHeader icon={Camera} label="DEVICE PHOTOS" />
            <View className="px-4">
              <View className="bg-card rounded-2xl p-3" style={cardShadow}>
                <View className="flex-row items-center justify-between" style={{ marginBottom: 8 }}>
                  <Text className="text-[12px] text-text-muted">
                    {photoUrls.length} photo{photoUrls.length > 1 ? 's' : ''}
                  </Text>
                  <Pressable
                    onPress={() => setPhotoIndex(0)}
                    className="flex-row items-center rounded-full px-2.5 py-1 active:opacity-80"
                    style={{ backgroundColor: '#E5F3F5' }}
                    accessibilityRole="button"
                    accessibilityLabel="View device photos"
                  >
                    <Eye size={12} color={BRAND_GREEN_DARK} />
                    <Text className="text-[11px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>View</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {photoUrls.map((uri, i) => (
                    <Pressable
                      key={uri}
                      onPress={() => setPhotoIndex(i)}
                      className="rounded-xl overflow-hidden active:opacity-80"
                      style={{ width: 64, height: 64, backgroundColor: '#E5F3F5' }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Device photo ${i + 1}`}
                    >
                      <Image source={{ uri }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </>
        ) : null}

        {/* ── Price summary ───────────────────────────────────── */}
        <SectionHeader icon={IndianRupee} label="PRICE SUMMARY" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            {lineItems.length === 0 ? (
              <Text className="text-[12px] text-text-muted">No service items recorded.</Text>
            ) : (
              lineItems.map((item, idx) => (
                <View
                  key={item.id || idx}
                  className="flex-row items-center py-2"
                  style={{ borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: '#E5F3F5' }}
                >
                  <View className="w-6 h-6 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                    <Text className="text-[11px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>{idx + 1}</Text>
                  </View>
                  <Text className="flex-1 text-text text-[13px] font-semibold" numberOfLines={1}>{item.label}</Text>
                  <Text className="font-extrabold text-text text-[13px]">₹{Number(item.amount || 0).toLocaleString('en-IN')}</Text>
                </View>
              ))
            )}
            <View className="flex-row items-center mt-1 pt-2.5" style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
              <Text className="flex-1 font-extrabold text-text text-[13px]">Estimated Total</Text>
              <Text className="font-extrabold text-[15px]" style={{ color: ACCENT_GREEN }}>
                ₹{Number(estimatedTotal || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* Same three lines as Device Details, from the same API fields.
                Two screens showing the same bill must not disagree about
                whether a deposit was taken. */}
            {payment ? (
              <>
                <View className="flex-row items-center pt-2">
                  <Text className="flex-1 text-text text-[13px] font-semibold">{payment.label}</Text>
                  <Text className="font-extrabold text-[13px]" style={{ color: ACCENT_GREEN }}>
                    − ₹{Number(payment.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View className="flex-row items-center mt-1 pt-2.5" style={{ borderTopWidth: 1, borderTopColor: '#E5F3F5' }}>
                  <Text className="flex-1 font-extrabold text-text text-[13px]">Balance Amount</Text>
                  <Text
                    className="font-extrabold text-[13px]"
                    style={{ color: payment.balance > 0 ? '#B45309' : ACCENT_GREEN }}
                  >
                    ₹{Number(payment.balance).toLocaleString('en-IN')}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* ── Service info ────────────────────────────────────── */}
        <SectionHeader icon={Wrench} label="SERVICE INFO" />
        <View className="px-4">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            {complaintText ? (
              <View className="flex-row items-start py-1.5">
                <View className="w-7 h-7 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                  <FileText size={14} color={ACCENT_GREEN} />
                </View>
                <Text className="text-[12px] text-text-muted" style={{ width: 78, marginTop: 6 }}>Complaint</Text>
                <Text className="flex-1 text-[13px] text-text font-bold leading-5" style={{ marginTop: 4 }} numberOfLines={3}>
                  {complaintText}
                </Text>
              </View>
            ) : null}
            <DetailRow icon={Clock} label="Est. Time" value={fmtInstant(ticket.estimatedReadyAt) || '-'} />
            <DetailRow icon={Calendar} label="Delivery" value={fmtInstant(ticket.estimatedDeliveryAt) || '-'} />
            {/* IMEI (mobile phones only) — shows the number, or a "-" with an Add shortcut when missing. */}
            {showImei ? (
            <View className="flex-row items-center py-1.5">
              <View className="w-7 h-7 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                <ScanLine size={14} color={ACCENT_GREEN} />
              </View>
              <Text className="text-[12px] text-text-muted" style={{ width: 78 }}>IMEI</Text>
              {ticket.imei ? (
                <Text className="text-[13px] text-text font-bold flex-1" numberOfLines={1}>{String(ticket.imei)}</Text>
              ) : (
                <View className="flex-1 flex-row items-center justify-between">
                  <Text className="text-[13px] text-text-muted font-bold">-</Text>
                  <Pressable
                    onPress={openImeiEntry}
                    className="flex-row items-center rounded-full px-2.5 py-1 active:opacity-80"
                    style={{ backgroundColor: '#E5F3F5' }}
                  >
                    <Plus size={12} color={BRAND_GREEN_DARK} />
                    <Text className="text-[11px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>Add</Text>
                  </Pressable>
                </View>
              )}
            </View>
            ) : null}
            <View className="flex-row items-center py-1.5">
              <View className="w-7 h-7 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                <ShieldCheck size={14} color={ACCENT_GREEN} />
              </View>
              <Text className="text-[12px] text-text-muted" style={{ width: 78 }}>Approval</Text>
              {ticket.customerApproval ? (
                <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: '#E5F3F5' }}>
                  <CheckCircle2 size={13} color={BRAND_GREEN_DARK} />
                  <Text className="text-[12px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>Approved</Text>
                </View>
              ) : (
                <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: '#FEF3C7' }}>
                  <AlertCircle size={13} color="#B45309" />
                  <Text className="text-[12px] font-bold ml-1" style={{ color: '#B45309' }}>Pending</Text>
                </View>
              )}
            </View>
            <DetailRow icon={Lock} label="Security" value={securityText} />
          </View>
        </View>

        {/* ── Re-Estimated — only once the booking has been re-estimated ── */}
        {reEstimateEvent || statusKey === 'QUOTED' ? (
          <>
            <SectionHeader icon={Calculator} label="RE-ESTIMATED" />
            <View className="px-4">
              <View className="bg-card rounded-2xl p-4" style={cardShadow}>
                <DetailRow icon={Clock} label="Re-Est. On" value={fmtInstant(reEstimateEvent?.createdAt) || '-'} />
                <DetailRow icon={IndianRupee} label="Revised" value={`₹${Number(estimatedTotal || 0).toLocaleString('en-IN')}`} />
                {lineItems.length ? (
                  <DetailRow icon={Wrench} label="Services" value={lineItems.map((i) => i.label).filter(Boolean).join(', ')} />
                ) : null}
                {ticket.originalEstimatedDeliveryAt ? (
                  <DetailRow icon={Calendar} label="Original" value={fmtInstant(ticket.originalEstimatedDeliveryAt) || '-'} />
                ) : null}
                <DetailRow icon={CalendarClock} label="New Delivery" value={fmtInstant(ticket.estimatedDeliveryAt) || '-'} />
                <View className="flex-row items-center py-1.5">
                  <View className="w-7 h-7 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                    <ShieldCheck size={14} color={ACCENT_GREEN} />
                  </View>
                  <Text className="text-[12px] text-text-muted" style={{ width: 78 }}>Approval</Text>
                  {ticket.customerApproval ? (
                    <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: '#E5F3F5' }}>
                      <CheckCircle2 size={13} color={BRAND_GREEN_DARK} />
                      <Text className="text-[12px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>Approved</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: '#FEF3C7' }}>
                      <AlertCircle size={13} color="#B45309" />
                      <Text className="text-[12px] font-bold ml-1" style={{ color: '#B45309' }}>Pending</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* ── Invoice — once generated: number, date, amount, View Invoice.
            Ready (not yet billed): a Generate Invoice shortcut. ── */}
        {invoice || statusKey === 'READY' ? (
          <>
            <SectionHeader icon={FileText} label="INVOICE" />
            <View className="px-4">
              {invoice ? (
                <View style={[cardShadow, { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#357D89', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={18} color="#FFFFFF" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
                        {invoice.invoiceNo ? `Invoice ${invoice.invoiceNo}` : 'Invoice'}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
                        {invoice.generatedAt ? `Generated ${fmtStatusWhen(invoice.generatedAt)}` : 'Generated'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#035C6C', marginLeft: 8 }} numberOfLines={1}>
                      ₹{Number(invoice.finalPayableAmount ?? invoice.netPayableAmount ?? 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {Number(invoice.amountPaid) > 0 || Number(invoice.advancePaid) > 0 ? (
                    <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                      <Text style={{ flex: 1, fontSize: 12, color: '#6B7280' }}>
                        Paid ₹{(Number(invoice.amountPaid || 0) + Number(invoice.advancePaid || 0)).toLocaleString('en-IN')}
                      </Text>
                      {Number(invoice.netPayableAmount) - Number(invoice.amountPaid || 0) > 0 ? (
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>
                          Balance ₹{(Number(invoice.netPayableAmount) - Number(invoice.amountPaid || 0)).toLocaleString('en-IN')}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#476B26' }}>Settled</Text>
                      )}
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => navigation.navigate('DeliveryInvoiceReport', { ticketId: ticket.id })}
                    accessibilityRole="button"
                    className="items-center justify-center active:opacity-85"
                    style={{ marginTop: 10, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: '#035C6C', flexDirection: 'row' }}
                  >
                    <Eye size={15} color="#035C6C" />
                    <Text style={{ marginLeft: 6, fontSize: 13.5, fontWeight: '800', color: '#035C6C' }}>View Invoice</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => navigation.navigate('InvoiceGenerator', { ticketId: ticket.id })}
                  accessibilityRole="button"
                  className="active:opacity-90"
                  style={[cardShadow, { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 }]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#357D89', backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={18} color="#357D89" strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#111111' }}>No invoice yet</Text>
                    <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>Ready for delivery — generate the bill</Text>
                  </View>
                  <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Generate</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </>
        ) : null}

        {/* ── Technician — one tappable card; opens Assign / Change Technician. ── */}
        <SectionHeader icon={Users} label="TECHNICIAN" />
        <View className="px-4">
          <Pressable
            onPress={goToAssign}
            disabled={!canChangeTech}
            accessibilityRole="button"
            accessibilityLabel={hasTechnician ? `Technician ${techName}` : 'Assign technician'}
            className="active:opacity-90"
            style={[cardShadow, { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 }]}
          >
            {hasTechnician ? (
              <View className="items-center justify-center" style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: ACCENT_GREEN }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                  {String(techName || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </Text>
              </View>
            ) : (
              <View className="items-center justify-center" style={{ height: 44, width: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: ACCENT_GREEN, backgroundColor: '#E5F3F5' }}>
                <UserPlus size={19} color={ACCENT_GREEN} strokeWidth={2} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
                {hasTechnician ? techName : 'No technician assigned'}
                {hasTechnician && techCode ? <Text style={{ color: '#6B7280', fontWeight: '600' }}> · {techCode}</Text> : null}
              </Text>
              {hasTechnician ? (
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: techAccepted ? '#EDF4E7' : '#FFF4DB' }}>
                    {techAccepted ? <CheckCircle2 size={11} color="#476B26" /> : <AlertCircle size={11} color="#B45309" />}
                    <Text style={{ marginLeft: 4, fontSize: 10.5, fontWeight: '800', color: techAccepted ? '#476B26' : '#B45309' }}>
                      {techAccepted ? 'Accepted' : 'Waiting for acceptance'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
                  {isDelivered ? 'Delivered without a technician' : 'Assign a technician to start the repair'}
                </Text>
              )}
            </View>
            {canChangeTech ? (
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 32, borderRadius: 16, marginLeft: 8,
                  backgroundColor: hasTechnician ? '#FFFFFF' : ACCENT_GREEN, borderWidth: 1.5, borderColor: ACCENT_GREEN,
                }}
              >
                {hasTechnician ? <RefreshCcw size={12} color={ACCENT_GREEN} strokeWidth={2.5} /> : <UserPlus size={13} color="#FFFFFF" strokeWidth={2.5} />}
                <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '800', color: hasTechnician ? ACCENT_GREEN : '#FFFFFF' }}>
                  {hasTechnician ? 'Change' : 'Assign'}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        </View>
      </ScrollView>

      {/* ── Bottom action menu — hidden behind a handle; open it for every
          booking action, 4 per row. ── */}
      <View
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: '#000000',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
          elevation: 12,
          // Tablets: line the buttons up with the capped content column.
          paddingHorizontal: Math.max(8, (winW - contentW) / 2 + 8),
          paddingBottom: insets.bottom + (menuOpen ? 8 : 4),
        }}
      >
        <View
          {...menuPan.panHandlers}
          style={{ alignItems: 'center', paddingTop: 8, paddingBottom: menuOpen ? 6 : 8 }}
          accessible
          accessibilityRole="button"
          accessibilityLabel={menuOpen ? 'Hide booking actions' : 'Show booking actions'}
          accessibilityState={{ expanded: menuOpen }}
        >
          {/* Brand Red pill, white arrow: ▲ opens the actions, ▼ hides them (tap or swipe). */}
          <View style={{ width: 58, height: 24, borderRadius: 12, backgroundColor: '#F32C26', alignItems: 'center', justifyContent: 'center' }}>
            {menuOpen
              ? <ChevronDownIcon size={18} color="#FFFFFF" strokeWidth={3} />
              : <ChevronUp size={18} color="#FFFFFF" strokeWidth={3} />}
          </View>
        </View>
        {menuOpen ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(isDelivered ? DELIVERED_TILES : ACTION_TILES).map((a, i) => {
          const Icon = a.icon;
          return (
            <Pressable
              key={a.key}
              onPress={() => { setMenuOpen(false); onAction(a.key); }}
              className="items-center active:opacity-70"
              style={{ width: '25%', paddingVertical: 6 }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <View className="items-center justify-center" style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: HOME_TILE_TONES[i % HOME_TILE_TONES.length] }}>
                <Icon size={18} color="#FFFFFF" />
              </View>
              <Text className="text-[11px] font-extrabold text-text text-center" style={{ marginTop: 4 }} numberOfLines={1}>{a.label}</Text>
            </Pressable>
          );
        })}
        </View>
        ) : null}
      </View>

      <ImageViewerModal
        visible={photoIndex != null}
        images={photoUrls.map((uri, i) => ({ uri, label: `Photo ${i + 1}` }))}
        index={photoIndex || 0}
        onClose={() => setPhotoIndex(null)}
      />

      <RescheduleSheet visible={rescheduleOpen} booking={ticket} onClose={() => setRescheduleOpen(false)} onUpdated={load} />

      {/* ── Share Image sheet — same component JobsScreen uses,
          so the experience is identical wherever it is reached from. ── */}
      <ShareReceiptSheet
        visible={shareOpen}
        ticket={ticket}
        technicianName={technician?.name || null}
        onClose={() => setShareOpen(false)}
      />

      {/* ── Update Status sheet — jumps the booking to any lifecycle stage ── */}
      <SafeModal visible={statusOpen} transparent animationType="fade" onRequestClose={() => setStatusOpen(false)}>
        {/* The modal window's own insets — the screen's don't reach it. */}
        <ModalInsets>
          {({ insets }) => (
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(17, 17, 17, 0.5)', justifyContent: 'flex-end' }}
              onPress={() => (statusBusy ? null : setStatusOpen(false))}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: insets.bottom + 16,
                  // Tablets: a centred sheet, not a full-width strip.
                  width: '100%',
                  maxWidth: 560,
                  alignSelf: 'center',
                }}
              >
                <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: '#E5E7EB', marginBottom: 14 }} />
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[13px] font-extrabold text-gray-900">Update Status</Text>
                  <Pressable
                    onPress={() => setStatusOpen(false)}
                    hitSlop={8}
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{ backgroundColor: '#E5F3F5' }}
                  >
                    <X size={14} color="#111111" />
                  </Pressable>
                </View>
                <Text className="text-[11px] text-text-muted mb-3">
                  Booking #{trackingId} · moves forward one stage at a time.
                </Text>

                {/* Current status — read-only card */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5F3F5', borderWidth: 1, borderColor: '#C7E6EA', borderRadius: 16, padding: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND_GREEN, alignItems: 'center', justifyContent: 'center' }}>
                    <Settings size={21} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                    <Text style={{ fontSize: 11.5, color: '#6B7280', fontWeight: '600' }}>Current Status</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111', marginTop: 1 }} numberOfLines={1}>{statusMeta.label}</Text>
                    <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>{fmtStatusWhen(ticket.updatedAt || ticket.createdAt)}</Text>
                  </View>
                </View>

                {(() => {
                  const next = nextStage(statusKey);
                  if (!next) {
                    const cancelled = statusKey === 'CANCELLED';
                    return (
                      <View
                        className="rounded-2xl px-3.5 py-4 items-center mt-3"
                        style={{ backgroundColor: cancelled ? '#FDEBEA' : '#E5F3F5', borderWidth: 1, borderColor: cancelled ? '#F9C5C3' : '#C7E6EA' }}
                      >
                        {cancelled ? <AlertCircle size={20} color="#C81E1A" /> : <CheckCircle2 size={20} color={BRAND_GREEN_DARK} />}
                        <Text className="text-[13px] font-extrabold text-text mt-1.5">
                          {cancelled ? 'This booking was cancelled.' : 'Final stage reached.'}
                        </Text>
                        <Text className="text-[11px] text-text-muted mt-0.5 text-center">
                          {cancelled ? 'No further status updates.' : 'This booking has been delivered.'}
                        </Text>
                      </View>
                    );
                  }

                  // Upcoming stages in order; only the very next one (and Cancel)
                  // can be picked — status still moves one stage at a time.
                  const rank = STATUS_RANK[statusKey] ?? 0;
                  const upcoming = ADVANCE_FLOW.filter((s) => (STATUS_RANK[s] ?? 0) > rank);
                  const blockedBy = ADVANCE_STEP[next] ? stepBlockedBy(recordedKeys, ADVANCE_STEP[next]) : null;
                  const qcDone = recordedKeys.includes('QUALITY_CHECK_COMPLETED');
                  const qcBlockedBy = qcDone ? null : stepBlockedBy(recordedKeys, 'QUALITY_CHECK_COMPLETED');
                  const dpDone = statusKey === 'DELIVERED_PROCESSING' || recordedKeys.includes('DELIVERED_PROCESSING');
                  // Invoice Generated comes from the invoice screen (it saves the
                  // invoice and records the step), so it opens that screen.
                  const invDone = dpDone || recordedKeys.includes('INVOICE_GENERATED')
                    || ['INVOICE_GENERATED', 'INVOICE_READY'].includes(statusKey);
                  // Customer Rejected: before the repair is ready, and only while
                  // the customer hasn't approved / rejected already.
                  const canReject = rank < (STATUS_RANK.READY ?? 5)
                    && !recordedKeys.includes('CUSTOMER_REJECTED') && !recordedKeys.includes('CUSTOMER_APPROVED');
                  const options = [
                    ...upcoming.flatMap((k) => (
                      k === 'READY' && !qcDone ? ['QUALITY_CHECK', k]
                        : k === 'DELIVERED' && !dpDone ? [...(invDone ? [] : ['INVOICE_GENERATED']), 'DELIVERED_PROCESSING', k]
                        : [k])),
                    ...(canReject ? ['CUSTOMER_REJECTED'] : []),
                    'CANCELLED',
                  ];
                  // Pickable now: the next stage, Cancel, Customer Rejected, QC once
                  // Ready is next and Dispatched once Delivered is next.
                  const selectable = (k) => k === 'CANCELLED' || k === 'CUSTOMER_REJECTED' || k === next
                    || (k === 'QUALITY_CHECK' && next === 'READY')
                    || ((k === 'DELIVERED_PROCESSING' || k === 'INVOICE_GENERATED') && next === 'DELIVERED');
                  // A re-estimate waiting on the customer holds the repair back.
                  const awaitingApproval = statusKey === 'QUOTED';
                  const blockerFor = (k) => (
                    k === next ? (awaitingApproval ? AWAIT_APPROVAL : blockedBy)
                      : k === 'QUALITY_CHECK' ? qcBlockedBy
                      : k === 'DELIVERED_PROCESSING' || k === 'CUSTOMER_REJECTED' || k === 'INVOICE_GENERATED' ? stepBlockedBy(recordedKeys, k)
                      : null);
                  const picked = pickedStatus && options.includes(pickedStatus) ? pickedStatus : null;
                  const pickedMeta = picked ? STATUS_OPTION[picked] : null;
                  const isCancel = picked === 'CANCELLED';
                  const isStep = !!STEP_OPTION_KEY[picked];
                  const isReject = picked === 'CUSTOMER_REJECTED';
                  const isInvoice = picked === 'INVOICE_GENERATED';
                  const reasonOk = !isReject || rejectReason.trim().length >= 3;
                  const busy = statusBusy != null;
                  const canApply = !!picked && !busy && selectable(picked) && !blockerFor(picked) && reasonOk;
                  return (
                    <>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#1C3053', marginTop: 14, marginBottom: 8 }}>Next Status Options</Text>
                      <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                        {options.map((key, idx) => {
                          const meta = STATUS_OPTION[key] || { title: STATUS_VARIANT[key]?.label || key, sub: '', Icon: ListChecks, tone: BRAND_GREEN };
                          const OptIcon = meta.Icon;
                          const locked = !selectable(key);
                          const rowBlocker = locked ? null : blockerFor(key);
                          const blocked = !!rowBlocker;
                          const off = locked || blocked || busy;
                          const on = picked === key;
                          const prevTitle = idx > 0 ? (STATUS_OPTION[options[idx - 1]]?.title || '') : '';
                          const sub = blocked
                            ? (rowBlocker === AWAIT_APPROVAL ? 'Waiting for the customer to approve the re-estimate' : `Record "${rowBlocker}" first`)
                            : locked ? `Available after ${prevTitle}` : meta.sub;
                          return (
                            <Pressable
                              key={key}
                              onPress={off ? undefined : () => setPickedStatus(key)}
                              disabled={off}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on, disabled: off }}
                              accessibilityLabel={`${meta.title}. ${sub}`}
                              style={{
                                flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
                                borderRadius: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? BRAND_GREEN : '#E5E7EB',
                                backgroundColor: on ? '#F0F9FA' : '#FFFFFF', opacity: locked || blocked ? 0.5 : 1,
                              }}
                            >
                              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? BRAND_GREEN : '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
                                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND_GREEN }} /> : null}
                              </View>
                              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: meta.tone, alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
                                <OptIcon size={19} color="#FFFFFF" strokeWidth={2.2} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{meta.title}</Text>
                                <Text style={{ fontSize: 12, color: blocked ? '#B45309' : '#6B7280', marginTop: 2 }} numberOfLines={2}>{sub}</Text>
                              </View>
                              {locked ? <Lock size={15} color="#9CA3AF" style={{ marginLeft: 8 }} /> : null}
                              {statusBusy === key ? <ActivityIndicator size="small" color={meta.tone} style={{ marginLeft: 8 }} /> : null}
                            </Pressable>
                          );
                        })}
                      </ScrollView>

                      {isReject ? (
                        <View style={{ marginBottom: 10 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#374151', marginBottom: 6 }}>
                            Reason for rejection<Text style={{ color: '#F32C26' }}> *</Text>
                          </Text>
                          <TextInput
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            placeholder="e.g. Repair cost too high, customer will buy a new phone"
                            placeholderTextColor="#9CA3AF"
                            multiline
                            maxLength={300}
                            textAlignVertical="top"
                            cursorColor={BRAND_GREEN}
                            style={{ minHeight: 70, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 13.5, color: '#111111', includeFontPadding: false }}
                          />
                        </View>
                      ) : null}

                      <TouchableOpacity
                        onPress={() => (
                          isCancel ? cancelBooking()
                            : isInvoice ? (setStatusOpen(false), navigation.navigate('InvoiceGenerator', { ticketId: ticket.id }))
                            : isStep ? recordStep(picked, isReject ? rejectReason.trim() : null)
                            : applyStatus(picked))}
                        disabled={!canApply}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !canApply }}
                        style={{
                          marginTop: 4, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
                          backgroundColor: isCancel ? '#F32C26' : isReject ? '#E08E00' : BRAND_GREEN, opacity: canApply ? 1 : 0.45,
                        }}
                      >
                        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>
                            {!pickedMeta ? 'Select a status'
                              : isCancel ? 'Cancel Booking'
                              : isReject ? (reasonOk ? 'Mark Customer Rejected' : 'Enter the rejection reason')
                              : isInvoice ? 'Generate Invoice'
                              : isStep ? `Mark ${pickedMeta.title}`
                              : `Update to ${pickedMeta.title}`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </Pressable>
            </Pressable>
          )}
        </ModalInsets>
      </SafeModal>

      {/* ── IMEI capture sheet — type or scan, then save ─────────────────── */}
      <SafeModal
        visible={imeiModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => (imeiSaving ? null : setImeiModalOpen(false))}
      >
        {/* Centred in this window's safe area, lifted above the keyboard (autoFocus). */}
        <ModalInsets>
          {({ insets, keyboard }) => (
            <Pressable
              className="flex-1 bg-black/50 items-center justify-center px-6"
              style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, keyboard) }}
              onPress={() => (imeiSaving ? null : setImeiModalOpen(false))}
            >
              <Pressable className="bg-card rounded-3xl p-5 w-full" style={{ maxWidth: 420 }} onPress={() => {}}>
                <View className="items-center mb-1">
                  <View className="h-11 w-11 rounded-full items-center justify-center mb-2" style={{ backgroundColor: '#E5F3F5' }}>
                    <ScanLine size={20} color={BRAND_GREEN_DARK} />
                  </View>
                  <Text className="text-text text-[15px] font-extrabold">Enter IMEI Number</Text>
                  <Text className="text-text-muted text-[12px] text-center mt-1">
                    Add the device IMEI number for this booking.
                  </Text>
                </View>

                <View className="flex-row items-center rounded-xl border border-border bg-background px-3 mt-3">
                  <TextInput
                    className="flex-1 py-3 text-text text-[13px] font-bold"
                    placeholder="Enter 15-digit IMEI"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={17}
                    value={imeiInput}
                    onChangeText={setImeiInput}
                    autoFocus
                  />
                  <Pressable
                    onPress={() => {
                      setImeiModalOpen(false);
                      navigation.navigate('ScanImei', { onScan: (v) => { setImeiInput(v); setImeiModalOpen(true); } });
                    }}
                    className="flex-row items-center rounded-full px-3 py-1.5 ml-1 active:opacity-80"
                    style={{ backgroundColor: 'rgba(3, 92, 108, 0.14)' }}
                  >
                    <ScanLine size={14} color={BRAND_GREEN} />
                    <Text className="text-[12px] font-extrabold ml-1" style={{ color: BRAND_GREEN }}>SCAN</Text>
                  </Pressable>
                </View>
                <Text className="text-text-muted text-[11px] mt-2">Tip: dial *#06# on the device to show its IMEI.</Text>

                <View className="flex-row mt-4">
                  <Pressable
                    onPress={() => setImeiModalOpen(false)}
                    disabled={imeiSaving}
                    className="flex-1 mr-2 rounded-2xl bg-background border border-border py-3 items-center active:opacity-80"
                  >
                    <Text className="text-text-muted text-[13px] font-extrabold">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveImeiAndContinue}
                    disabled={imeiSaving}
                    className="flex-1 rounded-2xl py-3 items-center active:opacity-80"
                    style={{ backgroundColor: BRAND_GREEN }}
                  >
                    {imeiSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-[13px] font-extrabold">Save</Text>}
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          )}
        </ModalInsets>
      </SafeModal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

// Short timestamp for the Service Progress "RECORDED" column —
// e.g. "Jun 17 · 11:08 AM". Returns "—" for missing values.
function formatProgressTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <View className="px-4 pt-5 pb-2 flex-row items-center">
      <Icon size={14} color={BRAND_GREEN_DARK} />
      <Text className="text-text font-extrabold text-[12px] tracking-widest ml-1.5">{label}</Text>
      <View className="flex-1 h-px bg-border ml-2" />
    </View>
  );
}

// Icon + label + value row used in the redesigned section cards.
// Normalise a typed/scanned IMEI to digits; valid when 14–17 digits (15 is the
// IMEI proper; 16/17 cover IMEISV and TAC+IMEI). Returns null when out of range.
function normaliseImei(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  return digits.length >= 14 && digits.length <= 17 ? digits : null;
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <View className="flex-row items-center py-1.5">
      <View className="w-7 h-7 rounded-lg items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
        <Icon size={14} color={ACCENT_GREEN} />
      </View>
      <Text className="text-[12px] text-text-muted" style={{ width: 78 }}>{label}</Text>
      <Text className="text-[13px] text-text font-bold flex-1" numberOfLines={2}>{value}</Text>
    </View>
  );
}

// Device lock as entered at booking: "None", the PIN / password, or the pattern
// dots joined with ">" (same order the lock popup shows them).
function formatSecurity(type, value) {
  const t = String(type || 'NONE').toUpperCase();
  if (t === 'NONE') return 'None';
  const label = t === 'PIN' ? 'PIN' : t === 'PASSWORD' ? 'Password' : t === 'PATTERN' ? 'Pattern'
    : t.charAt(0) + t.slice(1).toLowerCase();
  let v = value == null ? '' : String(value).trim();
  if (t === 'PATTERN') v = v.split(',').map((d) => d.trim()).filter(Boolean).join(' > ');
  return v ? `${label} · ${v}` : label;
}

// Pretty-print an Instant/ISO string from the ticket as a fallback when display
// strings weren't carried through. Matches BookingSuccessfulScreen's helper.
function fmtInstant(iso) {
  if (!iso) return null;
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return null;
    // e.g. "Mon Jul 20 2026 1:34 pm" — non-padded hour + lowercase am/pm to match the design.
    const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    return `${dt.toDateString()} ${time}`;
  } catch { return null; }
}

// Maps a ticket loaded from /tickets/{id} into the params shape the
// owner service-booking flow screens expect. `editMode` + `editTicketId`
// tell the final ServiceBookingDevicesList to PUT instead of POST.
function buildEditParams(ticket, { lineItems, estimatedTotal }) {
  const services = (lineItems || []).map((it) => ({
    serviceId: it.serviceId || it.id || null,
    serviceCode: it.serviceCode || it.code || null,
    serviceName: it.serviceName || it.label || 'Service',
    price: Number(it.amount ?? it.price) || 0,
    warranty: it.warranty || null,
  }));

  let missingParts = [];
  if (ticket.missingPartsJson) {
    try { const p = JSON.parse(ticket.missingPartsJson); if (Array.isArray(p)) missingParts = p; } catch (_) {}
  }

  let devicePhotos = {};
  if (ticket.devicePhotosJson) {
    try { const p = JSON.parse(ticket.devicePhotosJson); if (p && typeof p === 'object') devicePhotos = p; } catch (_) {}
  }

  const modelName = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || 'Device';
  const customer = {
    id: ticket.customerId,
    name: ticket.customerName,
    phone: ticket.customerPhone,
    address: ticket.customerAddress,
  };

  return {
    editMode: true,
    editTicketId: ticket.id,
    trackingId: ticket.trackingId,
    customerId: ticket.customerId,
    customer,
    brandId: ticket.brandId,
    modelId: ticket.modelId,
    ramOptionId: ticket.ramOptionId,
    storageOptionId: ticket.storageOptionId,
    color: ticket.color,
    // Model number lives only inside the saved name "Model · Number (specs)".
    modelNumber: ticket.modelNumber || String(ticket.deviceDisplayName || '').match(/ · ([^()]+?)(?: \(|$)/)?.[1]?.trim() || undefined,
    modelName,
    imageUrl: ticket.deviceImageUrl,
    ramLabel: ticket.ramLabel,
    storageLabel: ticket.storageLabel,
    // Laptop / Smartwatch / Audio Device: the saved category and attributes
    // ({ ram: '16GB', storageType: 'NVME_SSD', … }), pre-selected on Your Device.
    deviceCategory: ticket.deviceCategory || undefined,
    specs: specsFromRecord(ticket),
    prefillServices: services,
    prefillImei: ticket.imei || '',
    prefillSerialNumber: ticket.serialNumber || '',
    prefillAccessories: ticket.accessories || '',
    prefillComplaint: ticket.issueDescription || '',
    prefillIssueAudioUrl: ticket.issueAudioUrl || '',
    prefillEstimatedReadyIso: ticket.estimatedReadyAt || null,
    prefillEstimatedDeliveryIso: ticket.estimatedDeliveryAt || null,
    prefillCustomerApproved: ticket.customerApproval ?? false,
    prefillDevicePhotos: devicePhotos,
    prefillMissingParts: missingParts,
    prefillLock: {
      type: ticket.deviceSecurityType || 'NONE',
      value: ticket.deviceSecurityValue || '',
    },
    prefillEstimatedPrice: estimatedTotal,
    // Saved issues + prices, so the save can tell a re-estimate (issue added /
    // changed) from a plain edit of the booking details.
    originalPriceItemsJson: ticket.priceItemsJson || null,
    // Payment already recorded. Carried through so re-saving an edited booking
    // re-sends it — the PUT rewrites the whole payment block, so an unprefilled
    // payment section would wipe the deposit and reset the ticket to PENDING.
    prefillPaymentType: ticket.paymentType || null,
    prefillPaymentAmount: ticket.paymentAmount ?? null,
  };
}

// Re-Service: the delivered device is back (same or a different issue), so
// THIS ticket reopens for a new repair. Device identity carries over; the
// issue, services, photos, estimate and payment start fresh. editMode makes
// the wizard PUT onto this ticket; reService makes it POST /reopen first.
function buildReServiceParams(ticket) {
  const e = buildEditParams(ticket, { lineItems: [], estimatedTotal: 0 });
  return {
    editMode: true,
    editTicketId: ticket.id,
    trackingId: ticket.trackingId,
    customerId: e.customerId,
    customer: e.customer,
    brandId: e.brandId,
    modelId: e.modelId,
    ramOptionId: e.ramOptionId,
    storageOptionId: e.storageOptionId,
    color: e.color,
    modelNumber: e.modelNumber,
    modelName: e.modelName,
    imageUrl: e.imageUrl,
    ramLabel: e.ramLabel,
    storageLabel: e.storageLabel,
    deviceCategory: e.deviceCategory,
    specs: e.specs,
    prefillImei: e.prefillImei,
    prefillSerialNumber: e.prefillSerialNumber,
    prefillLock: e.prefillLock,
    reService: true,
  };
}

const cardShadow = {
  borderWidth: 1,
  borderColor: '#E5E7EB',
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
