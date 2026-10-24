import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Smartphone,
  Filter,
  Phone,
  Wrench,
  ClipboardList,
  X,
  ArrowLeft,
  User,
  CircleCheck,
  Calendar,
  Truck,
  UserCog,
  Share2,
  QrCode,
  FileText,
  ReceiptIndianRupee,
  Pencil,
  History,
  CalendarClock,
  ListChecks,
  UserCheck,
  CheckCircle2,
  RefreshCcw,
  Copy,
  Calculator,
  ScanLine,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { ResponsiveModal } from '../../../components/responsive';
import {
  SearchBar,
  EmptyState,
  Loader,
} from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';
import SafeModal from '../../../components/SafeModal';
import { confirmShopRepairBooking, listShopRepairBookings } from '../../../api/orders';
import { useFocusPolling } from '../../../lib/hooks/useFocusPolling';
import { getModelsByBrand, getRamOptions, getStorageOptions, parseModelNumbers } from '../../../api/masterData';
import {
  SCOPES, SCOPE_LIST, countScope, hasInvoice, pickupsOnly, scopeFor, scopeListFor,
  scopeMatches, statusOf,
} from './bookingScopes';
import {
  ImeiGateSheet,
  PickupPersonPickerSheet,
  PickupStatusSheet,
  RescheduleSheet,
  ServiceStatusSheet,
  ShareReceiptSheet,
  TechnicianPickerSheet,
} from './BookingActionSheets';
import { hasCategorySpecs, specDisplayParts } from '../../../utils/deviceSpecs';
import { imeiApplies, primeModelCategory, resolveRecordCategory } from '../../../utils/imeiPolicy';
import { useTabBarSpace } from '../../../navigation/tabBarMetrics';
import { estimatedTotalOf, paymentFromTicket } from './ReceiptCard';

// Swiggy / Zomato green palette — same as the booking-flow screens.
const BRAND_GREEN = '#035C6C';
const BRAND_GREEN_DARK = '#035C6C';
const ACCENT_GREEN = '#035C6C';

// Status → label + tinted background colour for the badge. The status family
// (warning / primary / success / danger) decides the colour without bringing
// back the legacy Badge component which doesn't match the green theme.
const STATUS_VARIANT = {
  CREATED:              { label: 'Service Accepted',     tone: 'amber' },
  ASSIGNED:             { label: 'Technician Assigned',  tone: 'blue' },
  IN_DIAGNOSIS:         { label: 'In Diagnosis',         tone: 'purple' },
  IN_REPAIR:            { label: 'In Service Process',   tone: 'purple' },
  QUOTED:               { label: 'Re-Estimated',         tone: 'amber' },
  APPROVED:             { label: 'Customer Approved',    tone: 'blue' },
  READY:                { label: 'Ready for Delivery',   tone: 'green' },
  INVOICE_GENERATED:    { label: 'Invoice Generated',    tone: 'amber' },
  INVOICE_READY:        { label: 'Invoice Ready',        tone: 'amber' },
  DELIVERED_PROCESSING: { label: 'Delivered Processing', tone: 'amber' },
  DELIVERED:            { label: 'Delivered',            tone: 'green' },
  CANCELLED:            { label: 'Cancelled',            tone: 'red' },
  RETURNED:             { label: 'Returned',             tone: 'red' },
};

const TONE_STYLE = {
  amber:  { bg: 'rgba(245, 158, 11, 0.12)', fg: '#B45309', border: 'rgba(245, 158, 11, 0.35)' },
  blue:   { bg: 'rgba(3, 92, 108, 0.12)', fg: '#035C6C', border: 'rgba(3, 92, 108, 0.35)' },
  purple: { bg: 'rgba(53, 125, 137, 0.12)', fg: '#035C6C', border: 'rgba(53, 125, 137, 0.35)' },
  green:  { bg: 'rgba(3, 92, 108, 0.12)',  fg: BRAND_GREEN_DARK, border: 'rgba(3, 92, 108, 0.35)' },
  red:    { bg: 'rgba(220, 38, 38, 0.12)',  fg: '#B91C1C', border: 'rgba(220, 38, 38, 0.35)' },
};

// Pickup-booking statuses (order-service) → badge label + tone. Separate from
// STATUS_VARIANT above, which covers ticket statuses.
const PICKUP_STATUS_VARIANT = {
  ORDER_PLACED:               { label: 'New Request',        tone: 'amber' },
  PICKUP_REQUESTED:           { label: 'Pickup Requested',   tone: 'amber' },
  PICKUP_ACCEPTED:            { label: 'Pickup Accepted',    tone: 'blue' },
  ORDER_SERVICE_CONFIRMED:    { label: 'Confirmed',          tone: 'blue' },
  PICKUP_PERSON_ASSIGNED:     { label: 'Pickup Assigned',    tone: 'blue' },
  PICKUP_ASSIGNED:            { label: 'Pickup Assigned',    tone: 'blue' },
  PICKUP_ON_THE_WAY:          { label: 'On The Way',         tone: 'purple' },
  REACHED_CUSTOMER_LOCATION:  { label: 'At Customer',        tone: 'purple' },
  REPAIR_ESTIMATE_PROCESSING: { label: 'Estimate Submitted', tone: 'amber' },
  DEVICE_PICKED_UP:           { label: 'Device Picked Up',   tone: 'purple' },
  PICKED_UP:                  { label: 'Device Picked Up',   tone: 'purple' },
  REACHED_SHOP:               { label: 'Reached Shop',       tone: 'green' },
  ACCEPTED:                   { label: 'Accepted',           tone: 'blue' },
  IN_TRANSIT:                 { label: 'In Transit',         tone: 'purple' },
  COMPLETED:                  { label: 'Completed',          tone: 'green' },
  CANCELLED:                  { label: 'Cancelled',          tone: 'red' },
};

// The Filters sheet's Booking Status section is now the scope list itself
// (SCOPE_LIST), so the old per-status pill set — Accepted / In Service / Ready /
// Invoice / Delivering / Cancelled — is gone rather than sitting alongside it
// as a second, overlapping status control.

const DATE_FILTERS = ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 3 Months', 'Last 6 Months'];

// Pickup rows carry a booking date rather than a ticket createdAt; fall back so
// the date filter and the newest-first sort work across both sources.
const rowDate = (row) => row?.createdAt || row?.bookingDate || row?.pickupDate || null;

// Free-text match for pickup rows. Tickets are searched server-side via ?q=,
// but the pickup feed comes back whole, so filter it here with the same query.
function pickupMatchesQuery(b, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [b.bookingNumber, b.customerName, b.customerMobile, b.pickupAddressText, b.issueSummary]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

// Client-side date-range filter (createdAt vs the chosen chip).
function inDateRange(d, filter) {
  if (!filter || !d) return true;
  const date = new Date(d);
  if (isNaN(date.getTime())) return true;
  const now = new Date();
  const startOfDay = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const today = startOfDay(now);
  const dDay = startOfDay(date);
  const DAY = 86400000;
  switch (filter) {
    case 'Today':         return dDay.getTime() === today.getTime();
    case 'Yesterday':     return dDay.getTime() === today.getTime() - DAY;
    case 'This Week':     { const wk = new Date(today); wk.setDate(today.getDate() - today.getDay()); return date >= wk; }
    case 'This Month':    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    case 'Last 3 Months': { const m = new Date(today); m.setMonth(today.getMonth() - 3); return date >= m; }
    case 'Last 6 Months': { const m = new Date(today); m.setMonth(today.getMonth() - 6); return date >= m; }
    default: return true;
  }
}

function formatDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(d) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Home screen tool-tile disc colours (DashboardScreen), cycled across the tiles.
const HOME_TILE_TONES = ['#357D89', '#5E9440', '#3B82F6', '#6B7280'];

export default function BookingHistoryScreen({ navigation, route }) {
  // The tab bar floats over the page; keep the last items clear of it.
  const tabSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const numCols = winW >= 680 ? 2 : 1;
  const isSmall = winW < 360;
  // Scope-tile icon metrics — scaled off the window so the grid stays
  // proportional from a 320px phone up.
  // Scope tiles are deliberately small: three rows of them sit between the
  // search bar and the first booking, so every pixel they take is a pixel of
  // list the shop owner has to scroll past on every visit.
  const chipIcon  = isSmall ? 20 : 22;
  const chipGlyph = isSmall ? 11 : 12.5;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);       // tickets (ticket-service)
  const [pickups, setPickups] = useState([]);   // pickup repair-bookings (order-service)
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Which tile set this instance shows. `menu: 'PICKUP'` (Home → Quick Actions →
  // Pickup) narrows it to the four doorstep stages; anything else keeps the full
  // ticket book. Fixed per mount — the tiles are the screen's identity, not a
  // filter you can switch between.
  const menuList = useMemo(
    () => scopeListFor(route?.params?.menu, route?.params?.preset),
    [route?.params?.menu, route?.params?.preset],
  );
  const defaultScope = menuList[0] || SCOPES.ALL;

  // Scope tiles per row. A phone keeps the 2-up grid — at 3-up the label had
  // barely 50px and wrapped mid-word. A TABLET puts the whole set on ONE line:
  // every menu is 4 tiles or fewer (4 default / 4 pickup / 2 re-estimated /
  // 1 invoice), and at that width a 768pt tablet leaves plenty of label room
  // for the longest one ("Ready for Delivery").
  // That is two rows of vertical space handed back above the first booking.
  // A one-tile menu (Invoice) spans the row instead of sitting at half width.
  // Phone: 4 per row, each tile stacked (icon + count over the label).
  // Tablet: the whole set on one row, tiles laid out side by side.
  // Up to six scopes sit on one row on a phone too (Bookings · Active ·
  // Delivery Ready · Delivered · Cancelled · Returned); a longer set wraps at 4.
  const chipCols = numCols > 1 || menuList.length <= 6 ? Math.max(1, menuList.length) : 4;
  const chipStacked = numCols === 1;

  // Where a tapped ticket row goes. Default is nowhere — the card's own button
  // row names every destination, so a bare tap has nothing unambiguous to mean.
  // There was a second mode, 'TIMELINE', for the Home → History shortcut: a
  // whole extra copy of this list whose only difference was that a card tap
  // opened the booking's status history. Both are gone; History is a labelled
  // button on every card now, which is where it was always being looked for.
  const rowTarget = String(route?.params?.rowTarget || '').toUpperCase();
  // Re-Estimated: a tapped row goes straight into the edit wizard rather than
  // the detail screen. It routes VIA TicketDetail with autoEdit, because
  // entering the wizard needs the ticket's line items and a category lookup that
  // already live there — duplicating that here would mean two copies of
  // buildEditParams drifting apart.
  const opensEdit = rowTarget === 'EDIT';
  // Home → Invoice: every booking here is already billed, so assigning a
  // technician has no place on its cards.
  const isInvoiceMenu = String(route?.params?.menu || '').toUpperCase() === 'INVOICE';

  // Optional header overrides, so a mount can name itself something other than
  // its scope ("SERVICE HISTORY" rather than "ALL BOOKINGS") without inventing a
  // scope that filters identically to one that already exists.
  //
  // They apply ONLY while the mount's own default tile is selected. Once you tap
  // Delivered, the header must say DELIVERED BOOKINGS — the count next to it is
  // the delivered count, and a stale "SERVICE HISTORY" beside it would read as
  // the total.
  const paramEyebrow = route?.params?.eyebrow;
  const paramNoun = route?.params?.noun;

  // The chip row and the scope are the same control: arriving with a `preset`
  // route param (Home snapshot card) just preselects the matching chip, so the
  // highlighted chip and the header count can never disagree. Tapping any chip
  // afterwards re-scopes the screen normally.
  const [scopeKey, setScopeKey] = useState(() => (scopeFor(route?.params?.preset) || defaultScope).key);
  const [dateFilter, setDateFilter] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const scope = SCOPES[scopeKey] || defaultScope;
  const isPickupScope = scope.source === 'PICKUP';
  const onDefaultScope = scope.key === defaultScope.key;
  const eyebrowText = (onDefaultScope && paramEyebrow) || scope.eyebrow;
  const nounText = (onDefaultScope && paramNoun) || scope.noun;

  // Re-scope when the screen is re-entered with a different preset (the stack
  // copy is pushed fresh each time, but a param change on the tab copy would
  // otherwise be ignored after mount).
  const presetParam = route?.params?.preset;
  useEffect(() => {
    const next = scopeFor(presetParam);
    if (next) setScopeKey(next.key);
  }, [presetParam]);

  // The Bookings *tab* screen is never unmounted, so without this a chip you
  // picked would still be applied the next time you opened the tab: select
  // Delivered, go back to Home, reopen Bookings, and it was still showing only
  // the delivered rows. Re-entering the tab now starts clean on All Bookings.
  //
  // Returning from a screen pushed on top (a ticket detail) must NOT reset —
  // you'd lose your place in the list you were working through. Those two cases
  // are indistinguishable at focus time, because the pushed screen has already
  // popped by then, so which one happened is recorded at blur time from the
  // parent stack's index: index > 0 means something was pushed over us, index 0
  // means the tab itself was switched away from.
  //
  // The pushed BookingList copy opts out entirely — its preset IS its identity,
  // and it unmounts on back anyway.
  const coveredByPushRef = useRef(false);
  useEffect(() => {
    if (presetParam) return undefined;
    const parent = navigation.getParent?.();
    const unsubBlur = navigation.addListener('blur', () => {
      coveredByPushRef.current = (parent?.getState?.()?.index ?? 0) > 0;
    });
    const unsubFocus = navigation.addListener('focus', () => {
      if (!coveredByPushRef.current) {
        setScopeKey(defaultScope.key);
        setDateFilter(null);
        setQuery('');
      }
      coveredByPushRef.current = false;
    });
    return () => { unsubBlur(); unsubFocus(); };
  }, [navigation, presetParam, defaultScope.key]);

  // ── Booking actions sheet ───────────────────────────────────────────
  // Tapping a ticket row goes straight to its detail screen. It used to open an
  // actions sheet first (Assign Technician / Share Receipt / Barcode / View
  // Details), but the card now carries those same actions as a button row, so
  // the sheet was an extra tap in front of the one destination people wanted.
  const [actionBooking, setActionBooking] = useState(null);   // sheet target
  const [techPickerOpen, setTechPickerOpen] = useState(false); // sheet 1
  const [shareOpen, setShareOpen] = useState(false);           // sheet 2
  // Card tap → Update Service Status. The card's button row keeps the six
  // navigation actions; the tap itself is now the status change, which is the
  // thing the owner does to a booking from this list most often.
  const [statusOpen, setStatusOpen] = useState(false);
  // Requote list only: the card's Reschedule button (new delivery date & time).
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // IMEI gate in front of the invoice generator, plus the value handed back by
  // the scanner route (null on a manual open).
  const [imeiGateOpen, setImeiGateOpen] = useState(false);
  const [scannedImei, setScannedImei] = useState(null);
  const [preparing, setPreparing] = useState(false);
  // Full ticket for the receipt preview. List rows carry only the card
  // fields — the receipt needs services, prices and the address, so it is
  // fetched on demand when Share Image is tapped. ShareReceiptSheet renders
  // and captures the receipt itself now (see BookingActionSheets.js).
  const [receiptTicket, setReceiptTicket] = useState(null);

  const closeSheets = useCallback(() => {
    setTechPickerOpen(false);
    setShareOpen(false);
    setStatusOpen(false);
    setRescheduleOpen(false);
    setImeiGateOpen(false);
  }, []);

  const openStatusFor = useCallback((b) => {
    if (!b?.id) return;
    setActionBooking(b);
    setStatusOpen(true);
  }, []);

  const goInvoiceGeneratorFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('InvoiceGenerator', { ticketId: b.id });
  }, [closeSheets, navigation]);

  // The invoice this booking ALREADY has. Opens the saved document (the report
  // screen reads /tickets/{id}/invoice), it does not raise a second one —
  // raising is Update Service Status → Invoice Generated, which routes through
  // the generator above. The action only appears on a card whose ticket came
  // back carrying an invoice, so there is always one to show.
  const goInvoiceFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('DeliveryInvoiceReport', { ticketId: b.id });
  }, [closeSheets, navigation]);

  // Picking "Invoice Generated" in the status sheet lands here instead of
  // writing the status: the invoice has to exist first, and it must name the
  // handset it belongs to. InvoiceGenerator emits INVOICE_GENERATED itself when
  // the invoice saves, then hands on to the delivery report, so coming back and
  // reopening the status sheet finds the step done and offers Delivered to
  // Customer next.
  //
  // The IMEI gate is only for bookings that have no number yet. When one is
  // already on the booking it is taken as given and the generator opens
  // straight away — there is no confirmation step, because the number was
  // checked when it was entered and re-asking on every invoice was a tap that
  // told the owner nothing they hadn't just seen on the card. Bookings reached
  // from Billing / Booking Status Report already navigate straight in; this
  // makes the bookings list behave the same way.
  const startInvoiceFor = useCallback(async (b) => {
    if (!b?.id) return;
    // Only mobile phones are gated on an IMEI; other devices have none.
    if (String(b.imei || '').trim() || !imeiApplies(await resolveRecordCategory(b))) {
      goInvoiceGeneratorFor(b);
      return;
    }
    setActionBooking(b);
    setScannedImei(null);
    setImeiGateOpen(true);
  }, [goInvoiceGeneratorFor]);

  // Scanning is a full-screen camera route, so the gate closes, the scan runs,
  // and the result reopens the gate with the digits pre-filled for review —
  // scanners misread, and an IMEI is not something to save unseen.
  const openImeiScannerFor = useCallback((b) => {
    if (!b?.id) return;
    navigation.navigate('ScanImei', {
      onScan: (imei) => {
        setActionBooking(b);
        setScannedImei(imei);
        setImeiGateOpen(true);
      },
    });
  }, [navigation]);

  // ── Pickup action sheets ────────────────────────────────────────────
  // Separate state from the ticket sheets above rather than a shared "open
  // sheet" enum: the two card types never render at the same time, but the
  // targets are different shapes (repair-booking vs ticket) and sharing
  // `actionBooking` between them would hand a pickup row to the technician
  // picker, which patches /tickets/{id} — a pickup has no ticket until it
  // reaches the shop.
  const [pickupTarget, setPickupTarget] = useState(null);
  const [pickupStatusOpen, setPickupStatusOpen] = useState(false);
  const [pickupAssignOpen, setPickupAssignOpen] = useState(false);

  const closePickupSheets = useCallback(() => {
    setPickupStatusOpen(false);
    setPickupAssignOpen(false);
  }, []);

  // Booking card tap → action grid (Status first, then the card's other actions).
  const [bookingMenuFor, setBookingMenuFor] = useState(null);
  const fromBookingMenu = (fn) => () => {
    const b = bookingMenuFor;
    setBookingMenuFor(null);
    setTimeout(() => fn(b), 320);
  };
  // Same rules the old action row used: Re-Est / Reschedule only on the
  // Re-Estimated list, no Assign on the Invoice list, Invoice only once there
  // is one, Receipt / Barcode dropped once delivered AND invoiced.
  const bookingActionsFor = (b) => {
    if (!b) return [];
    const invoiced = hasInvoice(b);
    const delivered = String(b.status || '').toUpperCase() === 'DELIVERED';
    const done = delivered && invoiced;
    // Order: Edit · Re-Schedule · Assign · History · Receipt · Barcode ·
    // Details · Update Status (Re-Schedule and History on every list now).
    return [
      // Edit on every list (the booking's edit wizard); called Re-Estimate on
      // the Re-Estimated list. Not offered once delivered AND invoiced.
      opensEdit || !done ? { key: 'edit', label: opensEdit ? 'Re-Estimate' : 'Edit', icon: Pencil, run: goEditFor } : null,
      // Re-Estimate, right after Edit: straight to this booking's services &
      // prices. Not on the Re-Estimated list (its Edit already is Re-Estimate)
      // and not once delivered.
      opensEdit || delivered ? null : { key: 'reestimate', label: 'Re-Estimate', icon: Calculator, run: goReEstimateFor },
      done ? null : { key: 'reschedule', label: 'Re-Schedule', icon: CalendarClock, run: openRescheduleFor },
      // Delivered: no Assign / Update Status — Re-Service starts a new linked booking.
      isInvoiceMenu || delivered ? null : { key: 'assign', label: 'Assign', icon: UserCog, run: openTechPickerFor },
      { key: 'history', label: 'History', icon: History, run: goTimelineFor },
      done ? null : { key: 'receipt', label: 'Receipt', icon: Share2, run: openShareFor },
      done ? null : { key: 'barcode', label: 'Barcode', icon: QrCode, run: goBarcodeFor },
      invoiced ? { key: 'invoice', label: 'Invoice', icon: ReceiptIndianRupee, run: goInvoiceFor } : null,
      { key: 'details', label: 'Details', icon: FileText, run: goDetailsFor },
      delivered ? null : { key: 'status', label: 'Update Status', icon: ListChecks, run: openStatusFor },
      delivered ? { key: 'reservice', label: 'Re-Service', icon: RefreshCcw, run: goReServiceFor } : null,
    ].filter(Boolean);
  };

  // Pickup card tap → this action sheet (Status · Assign · History · Details).
  const [pickupMenuFor, setPickupMenuFor] = useState(null);
  // Status / Assign open their own sheets — let this one slide away first
  // (two RN Modals swapping in one tick is unreliable on iOS).
  const fromPickupMenu = (fn) => () => {
    const b = pickupMenuFor;
    setPickupMenuFor(null);
    setTimeout(() => fn(b), 320);
  };

  // "Accepted" tile: a pickup still waiting for the shop is accepted right
  // here in one tap (same call as the status sheet's "Confirm pickup
  // request"); a pickup already past that opens the status sheet instead.
  const [accepting, setAccepting] = useState(false);
  const isUnconfirmedPickup = (b) => ['ORDER_PLACED', 'PICKUP_REQUESTED'].includes(String(b?.status || '').toUpperCase());
  const acceptPickup = async () => {
    const b = pickupMenuFor;
    if (!b?.id || accepting) return;
    if (!isUnconfirmedPickup(b)) { fromPickupMenu(openPickupStatusFor)(); return; }
    setAccepting(true);
    try {
      await confirmShopRepairBooking(b.id);
      notify('Pickup accepted', 'You can assign a pickup person now.', { preset: 'done' });
      setPickupMenuFor(null);
      loadPickups();
    } catch (e) {
      notify('Could not accept', e?.body?.error || e?.body?.message || e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setAccepting(false);
    }
  };

  const openPickupStatusFor = useCallback((b) => {
    if (!b?.id) return;
    setPickupTarget(b);
    setPickupStatusOpen(true);
  }, []);

  const openPickupAssignFor = useCallback((b) => {
    if (!b?.id) return;
    setPickupTarget(b);
    setPickupAssignOpen(true);
  }, []);

  const goPickupDetailsFor = useCallback((b) => {
    if (!b?.id) return;
    closePickupSheets();
    navigation.navigate('OwnerPickupServiceDetail', { id: b.id, booking: b });
  }, [closePickupSheets, navigation]);

  // The pickup timeline used to live at the bottom of Pickup Details; it is its
  // own screen now, so it gets its own action rather than a scroll to the end
  // of a screen that is about the device and the customer.
  const goPickupHistoryFor = useCallback((b) => {
    if (!b?.id) return;
    closePickupSheets();
    navigation.navigate('OwnerPickupHistory', { id: b.id, booking: b });
  }, [closePickupSheets, navigation]);

  // Resolved here, not in the sheet: PICKUP_STATUS_VARIANT lives in this file
  // and is what the card badge behind the sheet already used, so the two can't
  // word the same status differently.
  const pickupStatusLabel = useMemo(() => {
    if (!pickupTarget) return null;
    return PICKUP_STATUS_VARIANT[statusOf(pickupTarget)]?.label
      || pickupTarget.status
      || 'Pending';
  }, [pickupTarget]);

  // Each action takes its booking explicitly rather than reading actionBooking:
  // the card's button row fires before any sheet has set that state.
  const goBarcodeFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('BarcodePrint', { ticketId: b.id, mode: 'barcode' });
  }, [closeSheets, navigation]);

  // "Details" opens Device Details, not the Booking Details working screen —
  // what this list is for is looking a booking up, and Device Details is the
  // read-only view of it. Booking Details is still reachable from there.
  const goDetailsFor = useCallback((b) => {
    console.log('[BookingHistory][DEBUG] goDetailsFor, b.id =', b?.id, 'b.trackingId =', b?.trackingId);
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('DeviceDetail', { ticketId: b.id });
  }, [closeSheets, navigation]);

  // Into the booking's status history. This is now the only way in: the
  // separate Service History list, where you got here by tapping the card
  // itself, is gone. The row of actions under the card is what the card
  // actually offers, and History belongs in it — it is a question you ask about
  // one booking, not a mode you put a whole list into.
  const goTimelineFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('BookingTimeline', { ticketId: b.id });
  }, [closeSheets, navigation]);

  // Re-Service: a delivered device is back (same or a different issue). Opens
  // the booking wizard pre-filled with this device + customer via TicketDetail,
  // and the new ticket is linked to this one for repair history.
  const goReServiceFor = useCallback((b) => {
    if (!b?.id) return;
    navigation.navigate('TicketDetail', { ticketId: b.id, autoReService: true });
  }, [navigation]);

  // Requote list: the slot History takes elsewhere opens the Reschedule sheet.
  const openRescheduleFor = useCallback((b) => {
    if (!b?.id) return;
    setActionBooking(b);
    setRescheduleOpen(true);
  }, []);

  // Into the edit wizard. Same destination as goDetailsFor plus autoEdit, and
  // shared by the two ways in on the Re-Estimated list — the card tap and the
  // Re-Estimate button — so they can't drift to different params.
  const goEditFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('TicketDetail', { ticketId: b.id, autoEdit: true });
  }, [closeSheets, navigation]);

  // Into the same wizard at Services, as an edit of this booking (TicketDetail
  // → onAction('reestimate')).
  const goReEstimateFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('TicketDetail', { ticketId: b.id, autoReEstimate: true });
  }, [closeSheets, navigation]);

  // AssignTechnician's own screen lives in the nested RepairServiceBookingShop
  // stack, but the sheet assigns inline, so no navigation happens here — just
  // open the technician sheet on the right booking.
  const openTechPickerFor = useCallback((b) => {
    if (!b?.id) return;
    setActionBooking(b);
    setShareOpen(false);
    setTechPickerOpen(true);
  }, []);

  // Share Image opens the receipt preview sheet rather than sharing straight
  // away. The full ticket is fetched while that sheet is up: a list row
  // carries only the card fields, but the receipt needs services, prices and
  // the address, so the sheet shows a loading state until it lands.
  const openShareFor = useCallback(async (b) => {
    if (!b?.id) return;
    setActionBooking(b);
    setTechPickerOpen(false);
    setShareOpen(true);
    setPreparing(true);
    try {
      const full = await ticketApi.get(`/tickets/${b.id}`).catch(() => null);
      setReceiptTicket(full || b); // the card fields are a usable fallback
    } finally {
      setPreparing(false);
    }
  }, []);

  // Keep `load` stable (deps []) by reading the live query from a ref, so the
  // focus effect doesn't re-create load and re-fire a fetch on every keystroke.
  const queryRef = useRef(query);
  queryRef.current = query;

  // Fetch all bookings (search server-side; status/date/tab filtering happens
  // client-side so the tab counts always reflect the full result set).
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        // Everything below (tab counts, the preset scope, the header total) is
        // computed off this one page, so it has to be big enough to hold a
        // shop's whole book — at size 50 the header read "50 Bookings" for any
        // busier shop and the preset counts capped out with it.
        const data = await ticketApi.get('/tickets', {
          query: { page: 0, size: 500, q: queryRef.current || undefined },
        });
        const content = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
        // Enrich each ticket with the model's catalog image and proper name —
        // tickets don't always carry deviceImageUrl / deviceDisplayName, but we
        // have brandId+modelId on every row.
        const brandIds = Array.from(new Set(content.map((t) => t.brandId).filter(Boolean)));
        const modelById = {};
        // Master RAM/Storage options so the ticket's option UUIDs can be shown as
        // human labels ("8 GB" / "128 GB") on the card's RAM · Storage line.
        const [ramOpts, storageOpts] = await Promise.all([
          getRamOptions().catch(() => []),
          getStorageOptions().catch(() => []),
        ]);
        const ramById = {}; (ramOpts || []).forEach((r) => { ramById[r.id] = r.label; });
        const storageById = {}; (storageOpts || []).forEach((s) => { storageById[s.id] = s.label; });
        if (brandIds.length) {
          await Promise.all(brandIds.map(async (bId) => {
            try {
              const models = await getModelsByBrand(bId);
              (models || []).forEach((m) => { modelById[m.id] = m; primeModelCategory(m); });
            } catch (_) {}
          }));
        }
        const enriched = content.map((t) => {
          const m = t.modelId ? modelById[t.modelId] : null;
          const modelUrl = m?.imageUrl || (m?.imageBase64 ? `data:image/png;base64,${m.imageBase64}` : null);
          const ramLabel = t.ramOptionId ? ramById[t.ramOptionId] : null;
          const storageLabel = t.storageOptionId ? storageById[t.storageOptionId] : null;
          return {
            ...t,
            _modelName: m?.name || t.deviceDisplayName || t.modelName || null,
            _modelNumber: parseModelNumbers(m?.modelNumber).join(' - ') || null,
            _ramStorage: hasCategorySpecs(t)
              ? specDisplayParts(t).join(' · ')
              : ([ramLabel, storageLabel].filter(Boolean).join(' + ') || null),
            _modelImage: t.deviceImageUrl || modelUrl || null,
          };
        });
        setItems(enriched);
      } catch (e) {
        setError(e.message || 'Failed to load bookings');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  // Defined after `load` because it refetches: the assignment can move the
  // ticket's status server-side (CREATED → ASSIGNED), so the row's badge has to
  // come back from the server rather than be guessed at here. The local
  // assignedTechnicianId update keeps this screen's copy of the booking in step
  // with what the sheet just wrote.
  //
  // The sheet is deliberately NOT closed: it switches to its assigned-technician
  // face, which is the confirmation that the assignment landed. Closing it here
  // put the owner back on the list with no sign of what had happened.
  const onTechnicianAssigned = useCallback((tech) => {
    setActionBooking((b) => (b ? { ...b, assignedTechnicianId: tech?.id } : b));
    load(true);
  }, [load]);

  // Doorstep pickups come from order-service, not /tickets — loaded alongside
  // so the Pickup Request / Pickup Accepted chips have something to count. A
  // failure here is deliberately silent: it must not blank the ticket list.
  const loadPickups = useCallback(async () => {
    try {
      setPickups(pickupsOnly(await listShopRepairBookings()));
    } catch (_) { /* leave the previous pickup snapshot in place */ }
  }, []);

  // Reload on focus (e.g. returning from a detail screen), and — separately —
  // debounce the search so typing doesn't fire a request per keystroke.
  useFocusEffect(useCallback(() => { load(); loadPickups(); }, [load, loadPickups]));
  // loadPickups is already silent; polling surfaces new customer pickups live.
  useFocusPolling(loadPickups);
  const didSearchMount = useRef(false);
  useEffect(() => {
    if (!didSearchMount.current) { didSearchMount.current = true; return; }
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
  }, [query, load]);

  // Live chip counts, one per scope, off the full loaded sets so a chip's badge
  // never depends on which chip happens to be selected.
  const counts = useMemo(() => {
    const out = {};
    // Both sets, so the header count is present whichever tile set is mounted
    // (PICKUP_ALL only exists in the pickup one).
    for (const s of [...SCOPE_LIST, ...menuList]) out[s.key] = countScope(s, { tickets: items, pickups });
    return out;
  }, [items, pickups, menuList]);

  // Rows for the current scope: pickups come from the order-service feed,
  // everything else from the ticket book. The date filter narrows within that,
  // and the result is sorted newest-first.
  const visible = useMemo(() => {
    const source = isPickupScope ? pickups : items;
    const filtered = source.filter((r) => {
      if (!scopeMatches(scope, r)) return false;
      if (isPickupScope && !pickupMatchesQuery(r, query)) return false;
      if (dateFilter && !inDateRange(rowDate(r), dateFilter)) return false;
      return true;
    });
    const ts = (d) => { const t = new Date(d || 0).getTime(); return isNaN(t) ? 0 : t; };
    return filtered.slice().sort((a, b) => ts(rowDate(b)) - ts(rowDate(a)));
  }, [items, pickups, scope, isPickupScope, query, dateFilter]);

  // Status is picked from the scope grid, not the sheet, so Booking Time is the
  // only thing the Filters badge can be counting.
  const activeFilters = dateFilter ? 1 : 0;
  // True when the empty list is the result of a search/filter rather than the
  // scope genuinely having nothing in it — decides which empty copy to show.
  const narrowed = Boolean(query) || activeFilters > 0;

  const selectScope = (key) => setScopeKey(key);

  // Pad to an even count in 2-col mode so the last lone card stays half-width.
  const listData = numCols > 1 && visible.length % 2 === 1
    ? [...visible, { id: '__ghost__', _ghost: true }]
    : visible;

  // ── Pickup card ───────────────────────────────────────────────────
  // Pickup rows are repair-bookings, not tickets: no device/model catalog data
  // yet, but they do carry the address + slot the shop needs to act on. Tapping
  // one opens the pickup detail screen rather than the ticket detail.
  const renderPickup = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1, marginHorizontal: 0 }} />;
    const statusMeta = PICKUP_STATUS_VARIANT[statusOf(item)] || { label: item.status || 'Pending', tone: 'amber' };
    const tone = TONE_STYLE[statusMeta.tone] || TONE_STYLE.amber;
    // bookingNumber already ships with a leading '#', so strip it — the badge
    // below adds its own and the two combined rendered as "##CSPQX…".
    const ref = String(item.bookingNumber || (item.id ? String(item.id).slice(0, 8).toUpperCase() : '-')).replace(/^#+/, '');
    const services = Array.isArray(item.services)
      ? item.services.map((s) => s?.serviceName).filter(Boolean).join(', ')
      : (item.issueSummary || '');
    const dateStr = formatDate(rowDate(item));
    const timeStr = formatTime(item.createdAt);

    return (
      <Pressable
        onPress={() => setPickupMenuFor(item)}
        className="bg-card rounded-2xl mb-3 active:opacity-90"
        style={{
          flex: numCols > 1 ? 1 : undefined,
          padding: 12,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          shadowColor: '#111111',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View className="h-16 w-16 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: '#E5F3F5' }}>
            <Truck size={26} color="#035C6C" />
          </View>

          <View className="flex-1 flex-row">
            <View className="flex-1 pr-2">
              <View className="self-start rounded-md px-1.5 py-0.5 mb-1" style={{ backgroundColor: 'rgba(3, 92, 108, 0.12)' }}>
                <Text className="text-[9.5px] font-extrabold" style={{ color: '#035C6C' }}>#{ref}</Text>
              </View>
              <Text className="text-[13px] font-extrabold text-text" numberOfLines={1}>Repair Pickup</Text>
              {item.pickupAddressText ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5" numberOfLines={2}>{item.pickupAddressText}</Text>
              ) : null}
            </View>

            <View className="items-end" style={{ maxWidth: 118 }}>
              <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}>
                <Text className="text-[9px] font-extrabold" style={{ color: tone.fg }} numberOfLines={1}>
                  {statusMeta.label.toUpperCase()}
                </Text>
              </View>
              {dateStr ? (
                <View className="flex-row items-center mt-2">
                  <Calendar size={11} color="#6B7280" />
                  <Text className="text-[10.5px] text-text-muted font-semibold ml-1">{dateStr}</Text>
                </View>
              ) : null}
              {timeStr ? <Text className="text-[10.5px] text-text-muted mt-0.5">{timeStr}</Text> : null}
            </View>
          </View>
        </View>

        <View className="h-px bg-border my-2.5" />
        {/* 2 × 2 grid: Customer · Mobile, then Services · Pickup By. */}
        <View className="flex-row">
          <InfoCell icon={<User size={11} color="#6B7280" />} label="Customer" value={item.customerName || '-'} />
          <InfoCell align="right" icon={<Phone size={11} color="#6B7280" />} label="Mobile" value={item.customerMobile || '-'} />
        </View>
        <View className="flex-row" style={{ marginTop: 6 }}>
          <InfoCell icon={<Wrench size={11} color="#6B7280" />} label="Services" value={services || '—'} />
          <InfoCell
            align="right"
            icon={<UserCheck size={11} color="#6B7280" />}
            label="Pickup By"
            value={item.pickupPersonName || 'Not assigned'}
            valueColor={item.pickupPersonName ? '#111111' : '#9CA3AF'}
          />
        </View>
        {/* Status / Assign / History / Details moved into the tap sheet. */}
      </Pressable>
    );
  };

  // The card's small call button: straight to the phone dialer with the number.
  const callPhone = (phone) => {
    const tel = String(phone).replace(/[^\d+]/g, '');
    if (!tel) return;
    Linking.openURL(`tel:${tel}`).catch(() => notify('Could not call', 'This device cannot place calls.', { preset: 'error' }));
  };

  // The card's small copy button next to the customer's number.
  const copyPhone = async (phone) => {
    try {
      await Clipboard.setStringAsync(String(phone));
      notify('Copied', `${phone} copied.`, { preset: 'done' });
    } catch (e) {
      notify('Copy failed', e?.message || 'Could not copy the number.', { preset: 'error' });
    }
  };

  // ── Card row ──────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1, marginHorizontal: 0 }} />;
    const deviceName = item._modelName || item.deviceDisplayName || item.deviceModelName || item.modelName || 'Device';
    const deviceImage = item._modelImage || item.deviceImageUrl || null;
    const specs = [item._modelNumber, item._ramStorage].filter(Boolean).join(' - ');
    const color = item.color;
    const trackingId = item.trackingId || (item.id ? item.id.slice(0, 8).toUpperCase() : '-');
    const statusMeta = STATUS_VARIANT[String(item.status || '').toUpperCase()] || { label: item.status || 'Pending', tone: 'amber' };
    const customerName = item.customerName || item.customerFullName || item.customer?.name || '-';
    const phone = item.customerPhone || item.customer?.phone || '';
    const services = item.repairServicesSummary || (item.services?.map?.((s) => s.serviceName).join(', ')) || '';
    const tone = TONE_STYLE[statusMeta.tone] || TONE_STYLE.amber;
    const dateStr = formatDate(item.createdAt);
    const timeStr = formatTime(item.createdAt);
    // Invoice total (finalPrice) once one is raised, otherwise the estimate —
    // summed from the line items when estimatedPrice is null. Always shown,
    // ₹0 included, so a missing price reads as zero rather than a blank card.
    const amountNum = Number(item.finalPrice ?? estimatedTotalOf(item)) || 0;
    const amountStr = `₹${amountNum.toLocaleString('en-IN')}`;
    // Payment rows, one per line (label left, value right): Estimate, what was
    // collected (Advance / Full Paid), Balance. A delivered booking was settled
    // at the counter, so it reads Full Paid rather than "Pay on delivery".
    const estimateNum = Number(estimatedTotalOf(item)) || 0;
    const billTotal = Number(item.finalPrice ?? estimateNum) || 0;
    const pay = paymentFromTicket(item, billTotal);
    const deliveredPaid = String(item.status || '').toUpperCase() === 'DELIVERED';
    const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
    const balanceNum = deliveredPaid ? 0 : pay ? pay.balance : billTotal;
    const payRows = [
      { label: 'Estimate', value: inr(estimateNum), fg: '#035C6C', bg: '#E5F3F5' },
      deliveredPaid || pay?.label === 'Full Payment'
        ? { label: 'Full Paid', value: inr(deliveredPaid ? billTotal : pay.amount), fg: '#15803D', bg: '#DCFCE7' }
        : pay
          ? { label: 'Advance', value: inr(pay.amount), fg: '#8A6A00', bg: '#FFF8E1' }
          : { label: 'Payment', value: 'Pay on delivery', fg: '#6B7280', bg: '#F3F4F6' },
      balanceNum > 0
        ? { label: 'Balance', value: inr(balanceNum), fg: '#B45309', bg: '#FFEDD5' }
        : { label: 'Balance', value: 'Settled', fg: '#15803D', bg: '#DCFCE7' },
    ];

    // A card tap opens Update Service Status. Every *destination* the card could
    // navigate to is already a labelled button in the row underneath, so the tap
    // is free for the one thing that isn't a destination — changing where the
    // booking is in its flow. The Re-Estimated mount keeps its edit shortcut on
    // the "Re-Est" button rather than on the card itself.
    const onCardPress = () => setBookingMenuFor(item);

return (
      <Pressable
        onPress={onCardPress || undefined}
        // Without this the card still dims on touch, which reads as "that did
        // nothing" rather than "that isn't a button".
        disabled={!onCardPress}
        className="bg-card rounded-2xl mb-2 active:opacity-90"
        style={{
          flex: numCols > 1 ? 1 : undefined,
          padding: 10,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          shadowColor: '#111111',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        {/* Top: image + info (left) + status/date/time (right) */}
        <View className="flex-row items-start">
          <View className="h-12 w-12 rounded-2xl bg-success/10 items-center justify-center mr-2.5 overflow-hidden">
            {deviceImage ? (
              <Image source={{ uri: deviceImage }} style={{ width: 48, height: 48 }} resizeMode="cover" />
            ) : (
              <Smartphone size={22} color={ACCENT_GREEN} />
            )}
          </View>

          <View className="flex-1 flex-row">
            {/* left info column */}
            <View className="flex-1 pr-2">
              <View className="self-start rounded-md px-1.5 py-0.5 mb-1" style={{ backgroundColor: 'rgba(3, 92, 108, 0.12)' }}>
                <Text className="text-[9.5px] font-extrabold" style={{ color: ACCENT_GREEN }}>#{trackingId}</Text>
              </View>
              {item.parentTicketId ? (
                <View className="self-start rounded-md px-1.5 py-0.5 mb-1" style={{ backgroundColor: '#FFF8E1' }}>
                  <Text className="text-[9.5px] font-extrabold" style={{ color: '#8A6A00' }}>
                    RE-SERVICE{item.parentTrackingId ? ` · #${item.parentTrackingId}` : ''}
                  </Text>
                </View>
              ) : null}
              <Text className="text-[13px] font-extrabold text-text" numberOfLines={1}>{deviceName}</Text>
              {specs ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5" numberOfLines={1}>{specs}</Text>
              ) : null}
              {color ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5" numberOfLines={1}>{color}</Text>
              ) : null}
            </View>

            {/* right meta column: status pill, then date + time */}
            <View className="items-end" style={{ maxWidth: 118 }}>
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}
              >
                <Text className="text-[9px] font-extrabold" style={{ color: tone.fg }} numberOfLines={1}>
                  {statusMeta.label.toUpperCase()}
                </Text>
              </View>
              {dateStr ? (
                <View className="flex-row items-center mt-1.5">
                  <Calendar size={11} color="#6B7280" />
                  <Text className="text-[10.5px] text-text-muted font-semibold ml-1">{dateStr}</Text>
                </View>
              ) : null}
              {timeStr ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5">{timeStr}</Text>
              ) : null}
              {amountStr ? (
                <Text className="text-[12px] font-extrabold mt-0.5" style={{ color: ACCENT_GREEN }} numberOfLines={1}>{amountStr}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Divider + detail rows */}
        <View className="h-px bg-border my-2" />
        {/* Customer - mobile on one line, with a small copy button for the number. */}
        <View className="flex-row items-center py-0.5">
          <View className="w-4 items-center mr-1.5"><User size={11} color="#6B7280" /></View>
          <Text className="text-[10px] text-text-muted w-16">Customer</Text>
          <Text className="text-[11px] text-text font-semibold" style={{ flexShrink: 1 }} numberOfLines={1}>{customerName}</Text>
          {phone ? (
            <>
              <Text className="text-[11px] text-text-muted"> - </Text>
              <Text className="text-[11px] text-text font-semibold">{phone}</Text>
              <Pressable
                onPress={() => callPhone(phone)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Call ${phone}`}
                className="items-center justify-center active:opacity-60"
                style={{ marginLeft: 6, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(96, 145, 56, 0.14)' }}
              >
                <Phone size={10} color="#609138" />
              </Pressable>
              <Pressable
                onPress={() => copyPhone(phone)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Copy mobile number ${phone}`}
                className="items-center justify-center active:opacity-60"
                style={{ marginLeft: 6, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(3, 92, 108, 0.12)' }}
              >
                <Copy size={10} color={ACCENT_GREEN} />
              </Pressable>
            </>
          ) : null}
        </View>

        {/* Estimate · Advance / Full Paid · Balance — one coloured line each. */}
        <View className="mt-1.5">
          {payRows.map((r, i) => (
            <View
              key={r.label}
              className="flex-row items-center justify-between"
              style={{ marginTop: i ? 3 : 0, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: r.bg }}
            >
              <Text className="text-[10.5px] font-semibold" style={{ color: r.fg }} numberOfLines={1}>{r.label}</Text>
              <Text className="text-[10.5px] font-extrabold" style={{ color: r.fg }} numberOfLines={1}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* Services footer line — every service, in full. */}
        <View className="flex-row items-start mt-1">
          <View className="flex-1 flex-row items-start pr-2">
            <View className="w-4 items-center mr-1.5" style={{ marginTop: 2 }}><Wrench size={11} color="#6B7280" /></View>
            <Text className="text-[10px] text-text-muted w-16" style={{ marginTop: 1 }}>Services</Text>
            <Text className="text-[11px] text-text flex-1 font-semibold">{services || '—'}</Text>
          </View>
        </View>

        {/* Actions (Update Status, Assign, History, Receipt, Barcode,
            Details…) open as a grid when the card is tapped. */}
      </Pressable>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      {/* ── White header: back + title + Filters button ──────────── */}
      <View
        className="border-b border-border"
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.popTo('OwnerTabs', { screen: 'Home' }))}
            hitSlop={6}
            className="h-9 w-9 rounded-full bg-surface-muted items-center justify-center mr-2.5 active:opacity-70"
          >
            <ArrowLeft size={19} color="#111111" />
          </Pressable>
          {/* Title block centred on the SCREEN (not between the two buttons,
              which differ in width); padded so it never runs under them. */}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -4, bottom: -4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 56 }}>
            <Text className="text-text-muted text-[11px] font-bold tracking-widest text-center" numberOfLines={1}>{eyebrowText}</Text>
            <Text className="text-text text-[17px] font-extrabold mt-0.5 text-center" numberOfLines={1}>
              {counts[scope.key] ?? 0}{' '}
              {(counts[scope.key] ?? 0) === 1 ? nounText : `${nounText}s`}
            </Text>
          </View>
          <View className="flex-1" />
          {/* Filters — icon only: white on the medium teal, darker teal while
              open / filtering; the active-filter count rides as a badge. */}
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={activeFilters > 0 ? `Filters, ${activeFilters} active` : 'Filters'}
            className="h-9 w-9 rounded-full items-center justify-center active:opacity-80"
            style={{ backgroundColor: showFilters || activeFilters > 0 ? ACCENT_GREEN : '#357D89' }}
          >
            <Filter size={16} color="#FFFFFF" />
            {activeFilters > 0 ? (
              <View
                className="absolute items-center justify-center rounded-full"
                style={{ top: -3, right: -3, minWidth: 16, height: 16, paddingHorizontal: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ACCENT_GREEN }}
              >
                <Text className="text-[9px] font-extrabold" style={{ color: ACCENT_GREEN }}>{activeFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* ── Full-width search bar ────────────────────────────────── */}
      <View className="px-4" style={{ marginTop: 10 }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by Tracking ID, Customer name, Mobile…"
          onClear={() => setQuery('')}
          // Scan the booking's QR (job sheet / slip) to open it straight away.
          rightAccessory={(
            <Pressable
              onPress={() => navigation.navigate('ScanQrCode')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Scan booking QR code"
              className="items-center justify-center active:opacity-60"
              style={{ marginLeft: 8, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: '#E5E7EB' }}
            >
              <ScanLine size={18} color={ACCENT_GREEN} strokeWidth={2.2} />
            </Pressable>
          )}
        />
      </View>

      {/* ── Scope grid (wraps downward — no sideways scrolling) ──────────
          Every scope in the mounted set is on screen at once, so the selected one
          is always visible and nothing has to be swiped into view. This
          replaces the horizontal rail, which put Out for Delivery / Delivered
          off the right edge and — as a bare flex child of this column — also
          fought the booking list for vertical space. A plain wrapping View
          sizes to its own content, so the grid's height no longer depends on
          how many bookings are underneath.

          Each tile reads left-to-right as icon → count → label. Column count
          is responsive — see `chipCols`: two per row on a phone (at 3-up the
          label had barely 50px and wrapped mid-word), and the entire set on one
          row on a tablet, where the width is there for the taking and three
          rows of half-empty tiles were pure waste. */}
      {chipStacked ? (
        // Phone: the Home screen Services-grid look — one white panel, each
        // scope a white icon on a medium teal / green / blue / grey disc (the
        // same cycle as Home's tool tiles), the count as a badge
        // on the disc and the label underneath. The selected scope gets a
        // ring in its colour and a coloured label.
        <View
          style={{
            marginHorizontal: 12, marginTop: 8, paddingVertical: 6,
            backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB',
            flexDirection: 'row', flexWrap: 'wrap',
          }}
        >
          {menuList.map((s, idx) => {
            const Icon = s.icon;
            const active = scope.key === s.key;
            const tone = HOME_TILE_TONES[idx % HOME_TILE_TONES.length];
            // Six to a row leaves ~56px a tile on a phone — a slightly smaller disc.
            const disc = chipCols >= 6 ? (isSmall ? 28 : 30) : (isSmall ? 32 : 34);
            return (
              <Pressable
                key={s.key}
                onPress={() => selectScope(s.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${s.chipLabel || s.label}, ${counts[s.key] ?? 0}`}
                className="items-center active:opacity-80"
                style={{ width: `${100 / chipCols}%`, paddingVertical: 5, paddingHorizontal: 4 }}
              >
                <View style={{ padding: 2, borderRadius: 999, borderWidth: 2, borderColor: active ? tone : 'transparent' }}>
                  <View className="items-center justify-center" style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: tone }}>
                    <Icon size={chipCols >= 6 ? (isSmall ? 13 : 14) : (isSmall ? 15 : 16)} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                  <View
                    className="absolute items-center justify-center"
                    style={{ top: -4, right: -6, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: tone }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', color: tone }} numberOfLines={1}>{counts[s.key] ?? 0}</Text>
                  </View>
                </View>
                <Text
                  style={{ marginTop: 4, fontSize: isSmall ? 10 : 11, lineHeight: isSmall ? 13 : 14, fontWeight: active ? '800' : '600', color: active ? tone : '#111111', textAlign: 'center' }}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {s.chipLabel || s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
      <View
        style={{
          paddingHorizontal: 10,
          paddingTop: 6,
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {menuList.map((s) => {
          const Icon = s.icon;
          const active = scope.key === s.key;
          return (
            <View key={s.key} style={{ width: `${100 / chipCols}%`, padding: 2.5 }}>
              <Pressable
                onPress={() => selectScope(s.key)}
                className="flex-row items-center rounded-xl active:opacity-80"
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: isSmall ? 7 : 8,
                  // Each scope's own tint; the selected one gets its colour as the border.
                  backgroundColor: s.bg,
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? s.color : s.bg,
                }}
              >
                <>
                <View
                  className="rounded-full items-center justify-center mr-1.5"
                  style={{ height: chipIcon, width: chipIcon, backgroundColor: '#FFFFFF' }}
                >
                  <Icon size={chipGlyph} color={s.color} strokeWidth={2.3} />
                </View>
                <Text
                  className="font-extrabold text-text mr-1"
                  style={{ fontSize: isSmall ? 12 : 13 }}
                  numberOfLines={1}
                >
                  {counts[s.key] ?? 0}
                </Text>
                <Text
                  className="font-semibold flex-1"
                  style={{
                    fontSize: isSmall ? 9.5 : 10.5,
                    color: active ? s.color : '#1F2937',
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {s.chipLabel || s.label}
                </Text>
                </>
              </Pressable>
            </View>
          );
        })}
      </View>
      )}

      {error ? (
        <View className="mx-4 mt-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
        >
          <Text className="text-[12px] text-danger font-bold">{error}</Text>
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <Loader label="Loading bookings..." />
      ) : (
        <FlatList
          data={listData}
          key={numCols}
          numColumns={numCols}
          columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
          keyExtractor={(item, index) => item.id || item.trackingId || String(index)}
          renderItem={isPickupScope ? renderPickup : renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { load(true); loadPickups(); }}
              tintColor={ACCENT_GREEN}
              colors={[ACCENT_GREEN]}
            />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: tabSpace }}
          ListEmptyComponent={
            <EmptyState
              icon={<ClipboardList size={26} color={ACCENT_GREEN} />}
              title={narrowed ? 'No bookings found' : scope.emptyTitle}
              description={narrowed ? 'Try clearing filters.' : scope.emptyDescription}
              actionLabel={narrowed ? 'Clear filters' : null}
              onAction={() => { setQuery(''); setDateFilter(null); }}
            />
          }
        />
      )}

      {/* ── Filter popup (modal, slides up from bottom) ──────────── */}
      <SafeModal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 17, 17, 0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} />
          {/* Pads this modal window's own nav-bar / home-indicator inset. */}
          <SafeAreaView
            edges={['bottom']}
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 16,
              maxHeight: winH * 0.78,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[15px] font-extrabold text-text">Filters</Text>
              <Pressable
                onPress={() => setShowFilters(false)}
                hitSlop={8}
                className="h-8 w-8 rounded-full items-center justify-center"
                style={{ backgroundColor: '#E5F3F5' }}
              >
                <X size={16} color="#111111" />
              </Pressable>
            </View>

            {/* Sections stack vertically, one full-width row per option, and
                scroll as a group — the sheet is capped at 78% of the window so
                a long list can never push the Clear all / Apply buttons off
                the bottom of the screen. */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
              {/* Booking Status doubles as the scope picker, so it only appears
                  on the unfiltered "Bookings" scope. Once a scope is chosen —
                  Pickup Accepted, Delivered, … — the status is already decided
                  and Booking Time is the only thing left to narrow by. */}
              {scope.key === defaultScope.key ? (
                <>
                  <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2">BOOKING STATUS</Text>
                  <View className="mb-4">
                    {menuList.map((s) => {
                      const Icon = s.icon;
                      return (
                        <FilterRow
                          key={s.key}
                          label={s.label}
                          active={scope.key === s.key}
                          onPress={() => { selectScope(s.key); setShowFilters(false); }}
                          leading={
                            <View
                              className="h-7 w-7 rounded-full items-center justify-center mr-2.5"
                              style={{ backgroundColor: s.bg }}
                            >
                              <Icon size={14} color={s.color} strokeWidth={2.3} />
                            </View>
                          }
                          trailing={
                            <Text className="text-[13px] font-extrabold text-text mr-2">{counts[s.key] ?? 0}</Text>
                          }
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2">BOOKING TIME</Text>
              <View>
                {DATE_FILTERS.map((d) => (
                  <FilterRow
                    key={d}
                    label={d}
                    active={dateFilter === d}
                    onPress={() => setDateFilter(dateFilter === d ? null : d)}
                    leading={
                      <View className="h-7 w-7 rounded-full items-center justify-center mr-2.5" style={{ backgroundColor: '#E5F3F5' }}>
                        <Calendar size={14} color="#6B7280" strokeWidth={2.3} />
                      </View>
                    }
                  />
                ))}
              </View>
            </ScrollView>

            <View className="flex-row mt-4">
              <Pressable
                onPress={() => { setDateFilter(null); setQuery(''); }}
                className="flex-1 mr-1.5 py-3 rounded-xl items-center active:opacity-70"
                style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' }}
              >
                <Text className="text-[13px] font-extrabold text-text">Clear all</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowFilters(false)}
                className="flex-1 ml-1.5 rounded-xl active:opacity-90 overflow-hidden"
              >
                <LinearGradient
                  colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                >
                  <CircleCheck size={14} color="#fff" />
                  <Text className="text-[13px] font-extrabold text-white ml-1.5">Apply</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeModal>

      {/* ── Technician list sheet (from the card's "Assign" button) ────── */}
      <TechnicianPickerSheet
        visible={techPickerOpen}
        booking={actionBooking}
        onClose={closeSheets}
        onAssigned={onTechnicianAssigned}
      />

      {/* ── Update Service Status (from a card tap) ─────────────────────
          Refetches rather than patching the row: the scope tiles count off the
          same array, so moving a booking to Delivered has to move those counts
          with it. */}
      {/* Booking actions — opened by tapping a booking card. Home tool-tile
          look: white icon on a teal / green / blue / grey disc, 4 per row. */}
      <ResponsiveModal visible={!!bookingMenuFor} onClose={() => setBookingMenuFor(null)}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
          {bookingMenuFor ? (bookingMenuFor._modelName || bookingMenuFor.deviceDisplayName || bookingMenuFor.deviceModelName || bookingMenuFor.modelName || 'Booking') : ''}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 10 }} numberOfLines={1}>
          #{bookingMenuFor ? (bookingMenuFor.trackingId || String(bookingMenuFor.id || '').slice(0, 8).toUpperCase()) : ''}
          {bookingMenuFor?.customerName ? ` · ${bookingMenuFor.customerName}` : ''}
        </Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {bookingActionsFor(bookingMenuFor).map((a, i) => {
            const Icon = a.icon;
            return (
              <Pressable
                key={a.key}
                onPress={fromBookingMenu(a.run)}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                className="items-center active:opacity-70"
                style={{ width: '25%', paddingHorizontal: 4, paddingVertical: 8 }}
              >
                <View className="items-center justify-center" style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: HOME_TILE_TONES[i % HOME_TILE_TONES.length] }}>
                  <Icon size={19} color="#FFFFFF" />
                </View>
                <Text style={{ marginTop: 6, fontSize: 11.5, fontWeight: '600', color: '#111111', textAlign: 'center' }} numberOfLines={2}>
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ResponsiveModal>

      <ServiceStatusSheet
        visible={statusOpen}
        booking={actionBooking}
        statusLabel={
          actionBooking
            ? (STATUS_VARIANT[String(actionBooking.status || '').toUpperCase()]?.label
              || actionBooking.status
              || 'Pending')
            : null
        }
        onClose={closeSheets}
        onUpdated={load}
        onGenerateInvoice={startInvoiceFor}
      />

      {/* ── Reschedule (Requote list) — refetches so the card shows the new time. */}
      <RescheduleSheet
        visible={rescheduleOpen}
        booking={actionBooking}
        onClose={closeSheets}
        onUpdated={load}
      />

      {/* ── IMEI gate: only for a booking with no IMEI on file ─────────── */}
      <ImeiGateSheet
        visible={imeiGateOpen}
        booking={actionBooking}
        scannedImei={scannedImei}
        onClose={closeSheets}
        onVerified={goInvoiceGeneratorFor}
        onScanRequest={openImeiScannerFor}
      />

      {/* ── Share Image sheet ───────────────────────────────────────────── */}
      <ShareReceiptSheet
        visible={shareOpen}
        preparing={preparing}
        ticket={receiptTicket || actionBooking}
        onClose={closeSheets}
      />

      {/* ── Pickup sheets (from the pickup card's action row) ──────────────
          Both refetch rather than patching the row in place: the scope tiles
          count off the same `pickups` array, so a confirm that moves a row out
          of Pickup Request has to move the two counts with it. */}
      {/* Pickup actions — opened by tapping a pickup card. */}
      <ResponsiveModal visible={!!pickupMenuFor} onClose={() => setPickupMenuFor(null)}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
          {pickupMenuFor?.customerName || 'Pickup'}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 10 }} numberOfLines={1}>
          #{String(pickupMenuFor?.bookingNumber || (pickupMenuFor?.id ? String(pickupMenuFor.id).slice(0, 8).toUpperCase() : '')).replace(/^#+/, '')}
        </Text>
        <View className="flex-row" style={{ marginHorizontal: -4 }}>
          {[
            // Home screen tool-tile look: white icon on a medium teal / green /
            // blue / grey disc, black label underneath, no tile box.
            { key: 'accept', label: 'Accepted', icon: CheckCircle2, color: HOME_TILE_TONES[0], run: acceptPickup, busy: accepting },
            { key: 'assign', label: 'Assign', icon: UserCheck, color: HOME_TILE_TONES[1], run: fromPickupMenu(openPickupAssignFor) },
            { key: 'history', label: 'History', icon: History, color: HOME_TILE_TONES[2], run: fromPickupMenu(goPickupHistoryFor) },
            { key: 'details', label: 'Details', icon: FileText, color: HOME_TILE_TONES[3], run: fromPickupMenu(goPickupDetailsFor) },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <Pressable
                key={a.key}
                onPress={a.run}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                disabled={!!a.busy}
                className="flex-1 items-center active:opacity-70"
                style={{ marginHorizontal: 4, paddingVertical: 8 }}
              >
                <View className="items-center justify-center" style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: a.color }}>
                  {a.busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon size={19} color="#FFFFFF" />}
                </View>
                <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: '#111111', textAlign: 'center' }} numberOfLines={1}>
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ResponsiveModal>

      <PickupStatusSheet
        visible={pickupStatusOpen}
        booking={pickupTarget}
        statusLabel={pickupStatusLabel}
        onClose={closePickupSheets}
        onUpdated={loadPickups}
      />

      <PickupPersonPickerSheet
        visible={pickupAssignOpen}
        booking={pickupTarget}
        onClose={closePickupSheets}
        onAssigned={loadPickups}
      />

    </View>
  );
}

// One cell of the pickup card's 2 × 2 detail grid: small grey label (with its
// icon) over the bold value. Left column aligns left, right column aligns right.
function InfoCell({ icon, label, value, valueColor = '#111111', align = 'left' }) {
  const right = align === 'right';
  return (
    <View style={{ flex: 1, minWidth: 0, [right ? 'paddingLeft' : 'paddingRight']: 8, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <View className="flex-row items-center">
        {icon}
        <Text className="text-[10px] text-text-muted" style={{ marginLeft: 4 }}>{label}</Text>
      </View>
      <Text className="text-[11.5px] font-semibold" style={{ color: valueColor, marginTop: 1, textAlign: right ? 'right' : 'left', alignSelf: 'stretch' }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Full-width filter row. Replaces the old horizontal pill rail: with six
// options per section the pills ran off the right edge, so the ones at the end
// were invisible until you swiped.
function FilterRow({ label, active, onPress, leading, trailing }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-xl px-3 py-2.5 mb-2 active:opacity-80"
      style={{
        backgroundColor: active ? '#E5F3F5' : '#FFFFFF',
        borderWidth: 1.5,
        borderColor: active ? ACCENT_GREEN : '#E5E7EB',
      }}
    >
      {leading || null}
      <Text
        className="flex-1 text-[13px] font-bold"
        style={{ color: active ? BRAND_GREEN_DARK : '#111111' }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing || null}
      {active ? <CircleCheck size={17} color={ACCENT_GREEN} /> : null}
    </Pressable>
  );
}
