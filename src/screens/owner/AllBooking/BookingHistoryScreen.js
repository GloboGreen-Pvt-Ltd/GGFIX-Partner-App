import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import ViewShot, { captureRef } from 'react-native-view-shot';
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
  ListChecks,
  UserCheck,
} from 'lucide-react-native';
import {
  SearchBar,
  EmptyState,
  Loader,
} from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';
import { listShopRepairBookings } from '../../../api/orders';
import { getModelsByBrand, getRamOptions, getStorageOptions, parseModelNumbers } from '../../../api/masterData';
import {
  SCOPES, SCOPE_LIST, countScope, hasInvoice, pickupsOnly, scopeFor, scopeListFor,
  scopeMatches, statusOf,
} from './bookingScopes';
import {
  ImeiGateSheet,
  PickupPersonPickerSheet,
  PickupStatusSheet,
  ServiceStatusSheet,
  ShareReceiptSheet,
  TechnicianPickerSheet,
} from './BookingActionSheets';
import { ReceiptCard, buildReceiptMessage } from './ReceiptCard';

// Swiggy / Zomato green palette — same as the booking-flow screens.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

// The Re-Estimated action borrows its blue from the scope itself rather than
// hardcoding one, so the card button, the Re-Estimated tile and the Home
// shortcut can't drift to three different blues.
const RE_ESTIMATED_BLUE = SCOPES.RE_ESTIMATED.color;

// The History action's colour. Kept from the retired Home "History" shortcut
// tile so the button reads the same as the surface it replaced, and so the
// ticket card's History matches the pickup card's.
const HISTORY_CYAN = '#16BB05';

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
  blue:   { bg: 'rgba(22, 187, 5, 0.12)', fg: '#16BB05', border: 'rgba(22, 187, 5, 0.35)' },
  purple: { bg: 'rgba(126, 217, 87, 0.12)', fg: '#087A0A', border: 'rgba(126, 217, 87, 0.35)' },
  green:  { bg: 'rgba(8, 122, 10, 0.12)',  fg: BRAND_GREEN_DARK, border: 'rgba(8, 122, 10, 0.35)' },
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

export default function BookingHistoryScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const numCols = winW >= 680 ? 2 : 1;
  const isSmall = winW < 360;
  // The pickup card carries four actions. At 10px labels "Service Status ·
  // Pickup Assign · Pickup History · Details" needs ~340dp of card width, which
  // a 360dp phone (and either column of the 2-up tablet grid) does not have —
  // so the two-word labels are only used where they actually fit, and the icons
  // carry the meaning elsewhere.
  const wideActions = numCols === 1 && winW >= 420;
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
  // every menu is 5 tiles or fewer (5 default / 4 pickup / 2 re-estimated), and
  // at 5-up a 768pt tablet still leaves ~78pt of label room, which the existing
  // adjustsFontSizeToFit covers for the longest one ("Ready for Delivery").
  // That is two rows of vertical space handed back above the first booking.
  const chipCols = numCols > 1 ? Math.max(1, menuList.length) : 2;

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
  // IMEI gate in front of the invoice generator, plus the value handed back by
  // the scanner route (null on a manual open).
  const [imeiGateOpen, setImeiGateOpen] = useState(false);
  const [scannedImei, setScannedImei] = useState(null);
  const [preparing, setPreparing] = useState(false);
  // Full ticket for the hidden receipt. List rows carry only the card fields —
  // the receipt needs services, prices and the address, so it is fetched on
  // demand when Share Receipt is tapped.
  const [receiptTicket, setReceiptTicket] = useState(null);
  const receiptRef = useRef(null);

  const closeSheets = useCallback(() => {
    setTechPickerOpen(false);
    setShareOpen(false);
    setStatusOpen(false);
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
  const startInvoiceFor = useCallback((b) => {
    if (!b?.id) return;
    if (String(b.imei || '').trim()) {
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

  // Into the edit wizard. Same destination as goDetailsFor plus autoEdit, and
  // shared by the two ways in on the Re-Estimated list — the card tap and the
  // Re-Estimate button — so they can't drift to different params.
  const goEditFor = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('TicketDetail', { ticketId: b.id, autoEdit: true });
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

  // Share Receipt opens a chooser (image vs SMS) rather than sharing straight
  // away. The full ticket is fetched while that sheet is up: a list row carries
  // only the card fields, but both options need the services and prices, so
  // they stay disabled until it lands.
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

  // Option 1 — capture the hidden receipt as a PNG and hand it to the system
  // share sheet so WhatsApp (and others) attach the image. The ViewShot lives
  // on this screen, not inside a modal: a view inside a closed Modal isn't
  // mounted and captureRef would fail on it.
  const shareImage = useCallback(async () => {
    const ticket = receiptTicket || actionBooking;
    if (!ticket) return;
    setShareOpen(false);
    try {
      // The receipt only mounts once receiptTicket is set, so the first capture
      // can land before it has laid out. Retry with a longer wait rather than
      // dropping straight to the text share — a silent downgrade to plain text
      // looks like the image share is broken.
      let uri = null;
      for (const wait of [80, 300]) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          uri = await captureRef(receiptRef, { format: 'png', quality: 1, result: 'tmpfile' });
          break;
        } catch (_) { /* not laid out yet — retry, then fall back */ }
      }

      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Booking ${ticket.trackingId || ticket.id}`,
          UTI: 'public.png',
        });
        return;
      }
      await Share.share({
        message: buildReceiptMessage(ticket),
        title: `Booking ${ticket.trackingId || ticket.id}`,
      });
    } catch (e) {
      notify('Share failed', e?.message || 'Could not open the share sheet.', { preset: 'error' });
    }
  }, [receiptTicket, actionBooking]);

  // Option 2 — share the booking details as text. A bare `sms:` URL doesn't
  // reliably pre-fill the body on Android, so the text goes through Share.share
  // and lands in whichever app the user picks.
  const shareSms = useCallback(async () => {
    const ticket = receiptTicket || actionBooking;
    if (!ticket) return;
    setShareOpen(false);
    try {
      await Share.share({ message: buildReceiptMessage(ticket) });
    } catch (e) {
      notify('Share failed', e?.message || 'Could not open the share sheet.', { preset: 'error' });
    }
  }, [receiptTicket, actionBooking]);

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
              (models || []).forEach((m) => { modelById[m.id] = m; });
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
            _modelNumber: parseModelNumbers(m?.modelNumber).join(' · ') || null,
            _ramStorage: [ramLabel, storageLabel].filter(Boolean).join(' + ') || null,
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
        onPress={() => navigation.navigate('OwnerPickupServiceDetail', { id: item.id, booking: item })}
        className="bg-card rounded-2xl mb-3 active:opacity-90"
        style={{
          flex: numCols > 1 ? 1 : undefined,
          padding: 12,
          borderWidth: 1,
          borderColor: '#E2E8E2',
          shadowColor: '#172117',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View className="h-16 w-16 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: '#F0F8EF' }}>
            <Truck size={26} color="#16BB05" />
          </View>

          <View className="flex-1 flex-row">
            <View className="flex-1 pr-2">
              <View className="self-start rounded-md px-1.5 py-0.5 mb-1" style={{ backgroundColor: 'rgba(22, 187, 5, 0.12)' }}>
                <Text className="text-[9.5px] font-extrabold" style={{ color: '#16BB05' }}>#{ref}</Text>
              </View>
              <Text className="text-[14.5px] font-extrabold text-text" numberOfLines={1}>Repair Pickup</Text>
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
                  <Calendar size={11} color="#667066" />
                  <Text className="text-[10.5px] text-text-muted font-semibold ml-1">{dateStr}</Text>
                </View>
              ) : null}
              {timeStr ? <Text className="text-[10.5px] text-text-muted mt-0.5">{timeStr}</Text> : null}
            </View>
          </View>
        </View>

        <View className="h-px bg-border my-2.5" />
        <Row icon={<User size={11} color="#667066" />} label="Customer" value={item.customerName || '-'} />
        {item.customerMobile ? <Row icon={<Phone size={11} color="#667066" />} label="Mobile" value={item.customerMobile} /> : null}

        <View className="flex-row items-center mt-1">
          <View className="flex-1 flex-row items-center pr-2">
            <View className="w-4 items-center mr-1.5"><Wrench size={11} color="#667066" /></View>
            <Text className="text-[10px] text-text-muted w-16">Services</Text>
            <Text className="text-[11.5px] text-text flex-1 font-semibold" numberOfLines={1}>{services || '—'}</Text>
          </View>
        </View>

        {/* Who is carrying this pickup. The action row below only ever says
            "Pickup Assign", so without this line the card gave no sign whether
            anyone had been assigned — the owner had to open the sheet to find
            out. Colour is inline so the "Not assigned" grey can't be lost to
            className merging. */}
        <View className="flex-row items-center py-0.5">
          <View className="w-4 items-center mr-1.5"><UserCheck size={11} color="#667066" /></View>
          <Text className="text-[10px] text-text-muted w-16">Pickup By</Text>
          <Text
            className="text-[11.5px] flex-1 font-semibold"
            style={{ color: item.pickupPersonName ? '#172117' : '#8FA08F' }}
            numberOfLines={1}
          >
            {item.pickupPersonName || 'Not assigned'}
          </Text>
        </View>

        {/* Action row — the pickup equivalent of the ticket card's, with the
            verbs a doorstep job actually takes. The old "View details" chevron
            that sat on the Services line is gone: Details is one of these
            buttons now, and keeping both meant two controls for one
            destination. The card itself still opens Details on tap.
            Nested Pressables — RN gives the responder to the inner one, so a
            button tap does NOT also fire the card. */}
        <View className="flex-row items-center mt-2 pt-2 border-t border-border">
          <CardAction
            icon={<ListChecks size={13} color="#16BB05" />}
            label={wideActions ? 'Service Status' : 'Status'}
            flex={wideActions ? 1.35 : 1}
            onPress={() => openPickupStatusFor(item)}
          />
          <CardAction
            icon={<UserCheck size={13} color="#B45309" />}
            label={wideActions ? 'Pickup Assign' : 'Assign'}
            flex={wideActions ? 1.3 : 1}
            onPress={() => openPickupAssignFor(item)}
          />
          <CardAction
            icon={<History size={13} color="#087A0A" />}
            label={wideActions ? 'Pickup History' : 'History'}
            flex={wideActions ? 1.35 : 1}
            onPress={() => goPickupHistoryFor(item)}
          />
          <CardAction
            icon={<FileText size={13} color="#667066" />}
            label="Details"
            onPress={() => goPickupDetailsFor(item)}
          />
        </View>
      </Pressable>
    );
  };

  // ── Card row ──────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1, marginHorizontal: 0 }} />;
    const deviceName = item._modelName || item.deviceDisplayName || item.deviceModelName || item.modelName || 'Device';
    const deviceImage = item._modelImage || item.deviceImageUrl || null;
    const specs = [item._modelNumber, item._ramStorage].filter(Boolean).join(' · ');
    const color = item.color;
    const trackingId = item.trackingId || (item.id ? item.id.slice(0, 8).toUpperCase() : '-');
    const statusMeta = STATUS_VARIANT[String(item.status || '').toUpperCase()] || { label: item.status || 'Pending', tone: 'amber' };
    const customerName = item.customerName || item.customerFullName || item.customer?.name || '-';
    const phone = item.customerPhone || item.customer?.phone || '';
    const services = item.repairServicesSummary || (item.services?.map?.((s) => s.serviceName).join(', ')) || '';
    const tone = TONE_STYLE[statusMeta.tone] || TONE_STYLE.amber;
    const dateStr = formatDate(item.createdAt);
    const timeStr = formatTime(item.createdAt);

    // A card tap opens Update Service Status. Every *destination* the card could
    // navigate to is already a labelled button in the row underneath, so the tap
    // is free for the one thing that isn't a destination — changing where the
    // booking is in its flow. The Re-Estimated mount keeps its edit shortcut on
    // the "Re-Est" button rather than on the card itself.
    const onCardPress = () => openStatusFor(item);

    // Invoice is only offered once the booking HAS one — the action opens the
    // saved document, so on a booking with no invoice it would be a button that
    // can only report its own absence.
    const invoiced = hasInvoice(item);

    // Once a booking is delivered AND has its invoice, Receipt and Barcode drop
    // off the row. The invoice supersedes the receipt — it is the same summary,
    // billed rather than quoted — and the barcode exists to find a handset that
    // is still in the shop, which a delivered one no longer is. Dropping them
    // also takes the delivered card from six buttons to four, which is what
    // makes the remaining labels legible.
    const delivered = String(item.status || '').toUpperCase() === 'DELIVERED';
    const showReceipt = !(delivered && invoiced);
    const showBarcode = !(delivered && invoiced);

    // Base row is Assign · History · Details, plus whichever of Receipt,
    // Barcode, Invoice and Re-Estimate apply. At six or more an equal split
    // leaves each slot too narrow for a 10px label beside a 13px glyph, so the
    // whole row steps down a size rather than letting "Barcode" and "Details"
    // ellipsise. Under 360dp five is already crowded.
    const actionCount = 3
      + (showReceipt ? 1 : 0)
      + (showBarcode ? 1 : 0)
      + (invoiced ? 1 : 0)
      + (opensEdit ? 1 : 0);
    const crowded = actionCount > 5 || isSmall;
    const actionGlyph = crowded ? 12 : 13;

    return (
      <Pressable
        onPress={onCardPress || undefined}
        // Without this the card still dims on touch, which reads as "that did
        // nothing" rather than "that isn't a button".
        disabled={!onCardPress}
        className="bg-card rounded-2xl mb-3 active:opacity-90"
        style={{
          flex: numCols > 1 ? 1 : undefined,
          padding: 12,
          borderWidth: 1,
          borderColor: '#E2E8E2',
          shadowColor: '#172117',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
        {/* Top: image + info (left) + status/date/time (right) */}
        <View className="flex-row items-start">
          <View className="h-16 w-16 rounded-2xl bg-success/10 items-center justify-center mr-3 overflow-hidden">
            {deviceImage ? (
              <Image source={{ uri: deviceImage }} style={{ width: 64, height: 64 }} resizeMode="cover" />
            ) : (
              <Smartphone size={26} color={ACCENT_GREEN} />
            )}
          </View>

          <View className="flex-1 flex-row">
            {/* left info column */}
            <View className="flex-1 pr-2">
              <View className="self-start rounded-md px-1.5 py-0.5 mb-1" style={{ backgroundColor: 'rgba(8, 122, 10, 0.12)' }}>
                <Text className="text-[9.5px] font-extrabold" style={{ color: ACCENT_GREEN }}>#{trackingId}</Text>
              </View>
              <Text className="text-[14.5px] font-extrabold text-text" numberOfLines={1}>{deviceName}</Text>
              {specs ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5" numberOfLines={1}>{specs}</Text>
              ) : null}
              {color ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5" numberOfLines={1}>Color: {color}</Text>
              ) : null}
            </View>

            {/* right meta column: status pill, then date + time */}
            <View className="items-end" style={{ maxWidth: 118 }}>
              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}
              >
                <Text className="text-[9px] font-extrabold" style={{ color: tone.fg }} numberOfLines={1}>
                  {statusMeta.label.toUpperCase()}
                </Text>
              </View>
              {dateStr ? (
                <View className="flex-row items-center mt-2">
                  <Calendar size={11} color="#667066" />
                  <Text className="text-[10.5px] text-text-muted font-semibold ml-1">{dateStr}</Text>
                </View>
              ) : null}
              {timeStr ? (
                <Text className="text-[10.5px] text-text-muted mt-0.5">{timeStr}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Divider + detail rows */}
        <View className="h-px bg-border my-2.5" />
        <Row icon={<User size={11} color="#667066" />} label="Customer" value={customerName} />
        {phone ? <Row icon={<Phone size={11} color="#667066" />} label="Mobile" value={phone} /> : null}

        {/* Services footer line */}
        <View className="flex-row items-center mt-1">
          <View className="flex-1 flex-row items-center pr-2">
            <View className="w-4 items-center mr-1.5"><Wrench size={11} color="#667066" /></View>
            <Text className="text-[10px] text-text-muted w-16">Services</Text>
            <Text className="text-[11.5px] text-text flex-1 font-semibold" numberOfLines={1}>{services || '—'}</Text>
          </View>
        </View>

        {/* Action row — every action this card offers, one tap away. Five on
            every list (Assign · History · Receipt · Barcode · Details), plus
            Re-Estimate on the one mount that is about exactly that.
            Labels are shortened because full ones ("Assign Technician",
            "Share Receipt"…) don't fit a phone-width card on a single line.
            On the ordinary lists this row is the ONLY way off the card — the
            card itself is inert. On the Re-Estimated mount, where it isn't,
            these stay nested Pressables: RN hands the responder to the inner
            one, so a button tap doesn't also fire the card's own destination. */}
        <View className="flex-row items-center mt-2 pt-2 border-t border-border">
          {/* Re-Estimated list only, and deliberately first: there the card tap
              already opens the edit wizard, but nothing on the card SAID so —
              the "View details" chevron is suppressed above for that very
              reason, which left the screen's whole purpose unlabelled. This is
              that missing affordance, using the same Pencil + blue as the
              Re-Estimated tile and the Home shortcut so the three read as one
              thing. */}
          {opensEdit ? (
            <CardAction
              icon={<Pencil size={actionGlyph} color={RE_ESTIMATED_BLUE} />}
              // The sixth slot leaves no room for the long form anywhere, so
              // this label no longer gets the extra flex it used to take from
              // the others — it takes the even split under the short name.
              label="Re-Est"
              compact={crowded}
              onPress={() => goEditFor(item)}
            />
          ) : null}
          <CardAction
            icon={<UserCog size={actionGlyph} color={BRAND_GREEN_DARK} />}
            label="Assign"
            compact={crowded}
            onPress={() => openTechPickerFor(item)}
          />
          {/* Straight after Assign, on every list. It used to appear only on the
              Service History mount that the Home shortcut opened; that shortcut
              is gone, because a booking's history belongs to the booking, not to
              a whole separate copy of this list you had to find the row in
              again. Keeps the History glyph and colour that tile used. */}
          <CardAction
            icon={<History size={actionGlyph} color={HISTORY_CYAN} />}
            label="History"
            compact={crowded}
            onPress={() => goTimelineFor(item)}
          />
          {showReceipt ? (
            <CardAction
              icon={<Share2 size={actionGlyph} color="#16BB05" />}
              label="Receipt"
              compact={crowded}
              onPress={() => openShareFor(item)}
            />
          ) : null}
          {/* Next to Receipt because they are the same question asked twice —
              what the customer was quoted, and what they were billed. Same
              glyph and amber as the Invoice scope tile. On a delivered booking
              it stands alone: see showReceipt above. */}
          {invoiced ? (
            <CardAction
              icon={<ReceiptIndianRupee size={actionGlyph} color="#B45309" />}
              label="Invoice"
              compact={crowded}
              onPress={() => goInvoiceFor(item)}
            />
          ) : null}
          {showBarcode ? (
            <CardAction
              icon={<QrCode size={actionGlyph} color="#B45309" />}
              label="Barcode"
              compact={crowded}
              onPress={() => goBarcodeFor(item)}
            />
          ) : null}
          <CardAction
            icon={<FileText size={actionGlyph} color="#667066" />}
            label="Details"
            compact={crowded}
            onPress={() => goDetailsFor(item)}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── White header: back + title + Filters button ──────────── */}
      <View
        className="border-b border-border"
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 10, paddingBottom: 16, paddingHorizontal: 16 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
            className="h-10 w-10 rounded-full bg-surface-muted items-center justify-center mr-3 active:opacity-70"
          >
            <ArrowLeft size={20} color="#172117" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-text-muted text-[11px] font-bold tracking-widest">{eyebrowText}</Text>
            <Text className="text-text text-[20px] font-extrabold mt-0.5" numberOfLines={1}>
              {counts[scope.key] ?? 0}{' '}
              {(counts[scope.key] ?? 0) === 1 ? nounText : `${nounText}s`}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            className="flex-row items-center rounded-full px-3.5 py-2 active:opacity-80"
            style={{ backgroundColor: showFilters || activeFilters > 0 ? ACCENT_GREEN : '#F0F8EF' }}
          >
            <Filter size={15} color={showFilters || activeFilters > 0 ? '#fff' : ACCENT_GREEN} />
            <Text
              className="text-[13px] font-extrabold ml-1.5"
              style={{ color: showFilters || activeFilters > 0 ? '#fff' : ACCENT_GREEN }}
            >
              Filters
            </Text>
            {activeFilters > 0 ? (
              <View className="ml-1.5 px-1.5 rounded-full" style={{ backgroundColor: '#fff' }}>
                <Text className="text-[10px] font-extrabold" style={{ color: ACCENT_GREEN }}>{activeFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* ── Full-width search bar ────────────────────────────────── */}
      <View className="px-4" style={{ marginTop: 12 }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by Tracking ID, Customer name, Mobile…"
          onClear={() => setQuery('')}
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
      <View
        style={{
          paddingHorizontal: 10,
          paddingTop: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {menuList.map((s) => {
          const Icon = s.icon;
          const active = scope.key === s.key;
          return (
            <View key={s.key} style={{ width: `${100 / chipCols}%`, padding: 3 }}>
              <Pressable
                onPress={() => selectScope(s.key)}
                className="flex-row items-center rounded-xl active:opacity-80"
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: isSmall ? 7 : 8,
                  backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: active ? ACCENT_GREEN : '#E2E8E2',
                }}
              >
                <View
                  className="rounded-full items-center justify-center mr-1.5"
                  style={{ height: chipIcon, width: chipIcon, backgroundColor: s.bg }}
                >
                  <Icon size={chipGlyph} color={s.color} strokeWidth={2.3} />
                </View>
                <Text
                  className="font-extrabold text-text mr-1"
                  style={{ fontSize: isSmall ? 12.5 : 13.5 }}
                  numberOfLines={1}
                >
                  {counts[s.key] ?? 0}
                </Text>
                <Text
                  className="font-semibold flex-1"
                  style={{
                    fontSize: isSmall ? 9.5 : 10.5,
                    color: active ? ACCENT_GREEN : '#667066',
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {s.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

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
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 }}
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
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23, 33, 23, 0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} />
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: insets.bottom + 16,
              maxHeight: winH * 0.78,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8E2', marginBottom: 12 }} />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[16px] font-extrabold text-text">Filters</Text>
              <Pressable
                onPress={() => setShowFilters(false)}
                hitSlop={8}
                className="h-8 w-8 rounded-full items-center justify-center"
                style={{ backgroundColor: '#EFF5EE' }}
              >
                <X size={16} color="#172117" />
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
                      <View className="h-7 w-7 rounded-full items-center justify-center mr-2.5" style={{ backgroundColor: '#EFF5EE' }}>
                        <Calendar size={14} color="#667066" strokeWidth={2.3} />
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
                style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8E2' }}
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
          </View>
        </View>
      </Modal>

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

      {/* ── IMEI gate: only for a booking with no IMEI on file ─────────── */}
      <ImeiGateSheet
        visible={imeiGateOpen}
        booking={actionBooking}
        scannedImei={scannedImei}
        onClose={closeSheets}
        onVerified={goInvoiceGeneratorFor}
        onScanRequest={openImeiScannerFor}
      />

      {/* ── Share Receipt chooser (image vs SMS) ───────────────────────── */}
      <ShareReceiptSheet
        visible={shareOpen}
        preparing={preparing}
        onClose={closeSheets}
        onShareImage={shareImage}
        onShareSms={shareSms}
      />

      {/* ── Pickup sheets (from the pickup card's action row) ──────────────
          Both refetch rather than patching the row in place: the scope tiles
          count off the same `pickups` array, so a confirm that moves a row out
          of Pickup Request has to move the two counts with it. */}
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

      {/* ── Hidden printable receipt ───────────────────────────────────────
          Held off-screen at left:-9999 so it lays out at real pixel sizes
          (ViewShot needs a measured, non-collapsed view) but never shows.
          openShareFor() populates receiptTicket, then "Send image to WhatsApp"
          captures this to a PNG. Mounted on the screen rather than inside a
          sheet because a view inside a closed Modal isn't mounted to capture. */}
      {receiptTicket ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -9999, top: 0, width: 360 }}>
          <ViewShot
            ref={receiptRef}
            options={{ format: 'png', quality: 1 }}
            collapsable={false}
            style={{ width: 360, backgroundColor: '#FFFFFF' }}
          >
            <ReceiptCard ticket={receiptTicket} />
          </ViewShot>
        </View>
      ) : null}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function Row({ icon, label, value, numberOfLines }) {
  return (
    <View className="flex-row items-center py-0.5">
      <View className="w-4 items-center mr-1.5">{icon}</View>
      <Text className="text-[10px] text-text-muted w-16">{label}</Text>
      <Text className="text-[11.5px] text-text flex-1 font-semibold" numberOfLines={numberOfLines || 1}>{value}</Text>
    </View>
  );
}

// Full-width filter row. Replaces the old horizontal pill rail: with six
// options per section the pills ran off the right edge, so the ones at the end
// were invisible until you swiped.
// One button in the card's action row: small icon + short label, four across.
// hitSlop widens the touch target vertically without making the row taller —
// the labels are only 10px, so the visible box alone is a tight target.
//
// `flex` exists because the row is an equal split by default, which the pickup
// card breaks: its two-word labels ("Service Status", "Pickup History") need a
// bigger share than "Details", which is one short word with room to spare.
//
// `compact` is the ticket card's answer to the same pressure, and it is the
// opposite trade: there every label is already one short word, so nothing can
// give up width to anything else — the row as a whole shrinks instead. Six
// actions at ~1/6 of a phone-width card is under 50dp per slot, which a 13px
// glyph plus a 10px label overruns, and the labels are what carries the
// meaning. hitSlop keeps the touch target honest at either size.
//
// The style is a plain object, NOT the ({ pressed }) => … form — NativeWind's
// interop drops function styles on a className'd Pressable outright, taking the
// flex with it.
function CardAction({ icon, label, onPress, flex = 1, compact = false }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={{ flex }}
      className="flex-row items-center justify-center py-1 active:opacity-60"
    >
      {icon}
      <Text
        className="font-extrabold text-text"
        style={{ fontSize: compact ? 9 : 10, marginLeft: compact ? 2 : 4 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FilterRow({ label, active, onPress, leading, trailing }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-xl px-3 py-2.5 mb-2 active:opacity-80"
      style={{
        backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
        borderWidth: 1.5,
        borderColor: active ? ACCENT_GREEN : '#E2E8E2',
      }}
    >
      {leading || null}
      <Text
        className="flex-1 text-[13px] font-bold"
        style={{ color: active ? BRAND_GREEN_DARK : '#172117' }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing || null}
      {active ? <CircleCheck size={17} color={ACCENT_GREEN} /> : null}
    </Pressable>
  );
}
