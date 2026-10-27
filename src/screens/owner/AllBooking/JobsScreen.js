import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { railSizes } from '../../../components/report/ReportRail';
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
  Search,
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
  DELIVERED_PROCESSING: { label: 'Dispatched', tone: 'amber' },
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

// Parent booking number of a device on a multi-device booking (GTS-001 for
// GTS-001-A), or null for a single-device ticket. Prefers the server's
// bookingNumber + deviceSuffix; falls back to the -A/-B tail of the id.
function bulkKeyOf(t) {
  if (!t) return null;
  if (t.deviceSuffix && t.bookingNumber) return String(t.bookingNumber);
  const m = String(t.trackingId || '').match(/^([A-Z0-9]TS-\d{3,})-[A-Z]{1,2}$/);
  return m ? m[1] : null;
}

// Payment chips, one per line (label left, value right): Estimate, what was
// collected (Advance / Full Paid), Balance. A delivered booking was settled
// at the counter, so it reads Full Paid rather than "Pay on delivery".
// Shared by the booking card and the bulk device list, so both read the same.
function payRowsFor(item) {
  const inv = item._invoice;
  if (inv) {
    const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
    const paid = (Number(inv.advancePaid) || 0) + (Number(inv.amountPaid) || 0);
    const credit = Number(inv.creditAmount) || 0;
    return [
      { label: 'Bill', short: 'Bill', value: inr(inv.finalPayableAmount), fg: '#035C6C', bg: '#E5F3F5' },
      { label: 'Paid', short: 'Paid', value: inr(paid), fg: '#15803D', bg: '#DCFCE7' },
      credit > 0
        ? { label: 'Balance', short: 'Bal', value: inr(credit), fg: '#B45309', bg: '#FFEDD5' }
        : { label: 'Balance', short: 'Bal', value: 'Settled', fg: '#15803D', bg: '#DCFCE7' },
    ];
  }
  const estimateNum = Number(estimatedTotalOf(item)) || 0;
  const billTotal = Number(item.finalPrice ?? estimateNum) || 0;
  const pay = paymentFromTicket(item, billTotal);
  const deliveredPaid = String(item.status || '').toUpperCase() === 'DELIVERED';
  const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
  const balanceNum = deliveredPaid ? 0 : pay ? pay.balance : billTotal;
  return [
    { label: 'Estimate', short: 'Est', value: inr(estimateNum), fg: '#035C6C', bg: '#E5F3F5' },
    deliveredPaid || pay?.label === 'Full Payment'
      ? { label: 'Full Paid', short: 'Paid', value: inr(deliveredPaid ? billTotal : pay.amount), fg: '#15803D', bg: '#DCFCE7' }
      : pay
        ? { label: 'Advance', short: 'Adv', value: inr(pay.amount), fg: '#8A6A00', bg: '#FFF8E1' }
        : { label: 'Payment', short: 'Pay', value: 'on delivery', fg: '#6B7280', bg: '#F3F4F6' },
    balanceNum > 0
      ? { label: 'Balance', short: 'Bal', value: inr(balanceNum), fg: '#B45309', bg: '#FFEDD5' }
      // ₹0 balance is only "Settled" once something was actually settled: the
      // booking is delivered, fully paid, or a real estimate is covered. A ₹0
      // estimate with pay-on-delivery has no balance, so no Bal chip at all.
      : deliveredPaid || pay?.label === 'Full Payment' || billTotal > 0
        ? { label: 'Balance', short: 'Bal', value: 'Settled', fg: '#15803D', bg: '#DCFCE7' }
        : null,
  ].filter(Boolean);
}

// The booking card's right-side amount: invoice total once raised, else the estimate.
const deviceAmount = (item) => Number(item._invoice?.finalPayableAmount ?? item.finalPrice ?? estimatedTotalOf(item)) || 0;
// Ticket statuses past "Invoice Generated" — the only rows worth an invoice fetch.
const INVOICED_STATUS = /READY|INVOICE|DELIVER|COMPLETE|CLOSE|RETURN/i;
const inrAmount = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

// The same compact chips the booking card shows under the device colour.
function PayChips({ item, style }) {
  return (
    <View className="flex-row flex-wrap" style={[{ gap: 3 }, style]}>
      {payRowsFor(item).map((r) => (
        <View key={r.label} style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 5, backgroundColor: r.bg }}>
          <Text className="text-[9px] font-extrabold" style={{ color: r.fg }} numberOfLines={1}>
            {r.short} {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// "2 Mobiles" when every device of a bulk booking is a phone, else "3 Devices".
function bulkCountLabel(devices) {
  const n = devices.length;
  const allMobile = devices.every((d) => /mobile|phone/i.test(String(d.deviceCategory || d.categoryName || d.categoryCode || 'MOBILE')));
  return `${n} ${allMobile ? (n === 1 ? 'Mobile' : 'Mobiles') : (n === 1 ? 'Device' : 'Devices')}`;
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
// Left menu colours (Jobs + Pickup), from the brand sheet (theme/colors.js `brand`).
const SCOPE_TONE = {
  ALL: '#035C6C',                // Primary Teal
  ACTIVE: '#0788C9',             // Bright Blue
  RE_ESTIMATED: '#FAA700',       // Orange
  READY_FOR_DELIVERY: '#609138', // Green
  INVOICE_GENERATED: '#357D89',  // Deep Teal
  DISPATCHED: '#0571A8',         // Deep Blue
  CANCELLED: '#F32C26',          // Red
  RETURNED: '#1C3053',           // Navy
  DELIVERED: '#035C6C',          // Primary Teal
  PICKUP_ALL: '#035C6C',
  PICKUP_REQUEST: '#FAA700',
  PICKUP_ACCEPTED: '#0788C9',
};

export default function JobsScreen({ navigation, route }) {
  // The tab bar floats over the page; keep the last items clear of it.
  const insets = useSafeAreaInsets();
  // Full-screen stack page now (no bottom tab bar): just clear the home indicator.
  const tabSpace = insets.bottom + 16;
  const { width: winW, height: winH } = useWindowDimensions();
  const isSmall = winW < 360;
  // Left side: the scope menu as a vertical rail; right side: the bookings list.
  const railW = winW >= 680 ? 104 : (isSmall ? 70 : 78);
  const [query, setQuery] = useState('');
  // Search bar is hidden until the header's Search icon opens it.
  const [searchOpen, setSearchOpen] = useState(false);
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
  // One booking per row; two only when the list is wide (tablets).
  const numCols = winW - railW >= 680 ? 2 : 1;
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
  // Bulk booking card tap → device list first; the bulk group the action grid
  // was opened from, so closing it goes back to that list.
  const [devicePickerFor, setDevicePickerFor] = useState(null);
  const [menuFromBulk, setMenuFromBulk] = useState(null);
  const fromBookingMenu = (fn) => () => {
    const b = bookingMenuFor;
    setBookingMenuFor(null);
    setMenuFromBulk(null);
    setTimeout(() => fn(b), 320);
  };
  // Device row → the same action grid, for that device's own ticket. Two RN
  // Modals swapping in one tick is unreliable, so let the list slide away first.
  const openDeviceActions = (group, device) => {
    setDevicePickerFor(null);
    setMenuFromBulk(group);
    setTimeout(() => setBookingMenuFor(device), 320);
  };
  // Closing the action grid without picking an action: back to the device
  // list when it came from one, otherwise just closed.
  const closeBookingMenu = () => {
    const group = menuFromBulk;
    setBookingMenuFor(null);
    setMenuFromBulk(null);
    if (group) setTimeout(() => setDevicePickerFor(group), 320);
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

  // "Details" opens the Booking Details screen.
  const goDetailsFor = useCallback((b) => {
    console.log('[BookingHistory][DEBUG] goDetailsFor, b.id =', b?.id, 'b.trackingId =', b?.trackingId);
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('TicketDetail', { ticketId: b.id });
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
  // Kept across reloads, so coming back to this screen (e.g. after generating
  // an invoice) costs one /tickets call instead of re-fetching every lookup and
  // every booking's invoice before the list can update.
  const lookupsRef = useRef({ ramById: null, storageById: null, modelById: {}, brands: new Set() });
  const invoiceCacheRef = useRef(new Map()); // ticketId → { key, inv }

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
        // A child ticket number (GTS-058-A) searches by its parent (GTS-058),
        // so every device of that bulk booking comes back and groups into the
        // one parent card instead of a lone child card.
        const rawQ = (queryRef.current || '').trim();
        const childQ = rawQ.replace(/^#/, '').match(/^([A-Z0-9]TS-\d{3,})-[A-Z]{1,2}$/i);
        const data = await ticketApi.get('/tickets', {
          query: { page: 0, size: 500, q: (childQ ? childQ[1].toUpperCase() : rawQ) || undefined },
        });
        const content = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
        // Enrich each ticket with the model's catalog image and proper name —
        // tickets don't always carry deviceImageUrl / deviceDisplayName, but we
        // have brandId+modelId on every row.
        const L = lookupsRef.current;
        // Only brands not fetched yet this session.
        const brandIds = Array.from(new Set(content.map((t) => t.brandId).filter(Boolean))).filter((b) => !L.brands.has(b));
        const modelById = L.modelById;
        // Master RAM/Storage options so the ticket's option UUIDs can be shown as
        // human labels ("8 GB" / "128 GB") on the card's RAM · Storage line.
        if (!L.ramById) {
          const [ramOpts, storageOpts] = await Promise.all([
            getRamOptions().catch(() => null),
            getStorageOptions().catch(() => null),
          ]);
          const ramById = {}; (ramOpts || []).forEach((r) => { ramById[r.id] = r.label; });
          const storageById = {}; (storageOpts || []).forEach((s) => { storageById[s.id] = s.label; });
          // A failed fetch isn't cached — the next load tries again.
          if (ramOpts && storageOpts) { L.ramById = ramById; L.storageById = storageById; }
          else { L.tmpRam = ramById; L.tmpStorage = storageById; }
        }
        const ramById = L.ramById || L.tmpRam || {};
        const storageById = L.storageById || L.tmpStorage || {};
        if (brandIds.length) {
          await Promise.all(brandIds.map(async (bId) => {
            try {
              const models = await getModelsByBrand(bId);
              (models || []).forEach((m) => { modelById[m.id] = m; primeModelCategory(m); });
              L.brands.add(bId);
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
        // The invoice (bill total, paid, credit) lives on its own row, not the
        // ticket — without it a closed booking whose estimate was 0 read
        // "Est ₹0 · Paid ₹0 · Bal Settled" even with a credit still owed.
        // Last-known invoices fill the list instantly; every invoice is then
        // re-read (an edited invoice can change without the ticket changing).
        const invCache = invoiceCacheRef.current;
        const invKey = (t) => t.id;
        const stale = [];
        enriched.forEach((t) => {
          if (!INVOICED_STATUS.test(String(t.status || ''))) return;
          const c = invCache.get(t.id);
          if (c?.inv) t._invoice = c.inv;
          stale.push(t);
        });
        // Show the fresh list now; changed rows get their invoice right after.
        setItems(enriched);
        if (stale.length) {
          await Promise.all(stale.map(async (t) => {
            const inv = await ticketApi.get(`/tickets/${t.id}/invoice`).catch(() => undefined);
            if (inv === undefined) return; // failed — not cached, retried next load
            const ok = inv && inv.finalPayableAmount != null ? inv : null;
            invCache.set(t.id, { key: invKey(t), inv: ok });
            if (ok) t._invoice = ok;
          }));
          setItems([...enriched]);
        }
      } catch (e) {
        setError(e.message || 'Failed to load jobs');
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

  // Bulk bookings: the devices of one multi-device booking (GTS-001-A, -B …)
  // collapse into ONE card, placed where its newest device would sort. A lone
  // visible device (the scope filtered out its siblings) stays a normal card.
  const rows = useMemo(() => {
    if (isPickupScope) return visible;
    // A booking that started single (GTS-001, no suffix) and later got
    // GTS-001-B: the original joins its siblings' card by its own id.
    const bulkKeys = new Set(visible.map(bulkKeyOf).filter(Boolean));
    const keyFor = (t) => bulkKeyOf(t) || (bulkKeys.has(t.trackingId) ? t.trackingId : null);
    const groups = new Map();
    for (const t of visible) {
      const key = keyFor(t);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const out = [];
    const placed = new Set();
    for (const t of visible) {
      const key = keyFor(t);
      const devices = key ? groups.get(key) : null;
      if (!devices || devices.length < 2) { out.push(t); continue; }
      if (placed.has(key)) continue;
      placed.add(key);
      out.push({
        id: `bulk:${key}`,
        _bulk: true,
        bookingNumber: key,
        devices: devices.slice().sort((a, b) => String(a.trackingId).localeCompare(String(b.trackingId))),
      });
    }
    return out;
  }, [visible, isPickupScope]);

  // Pad to an even count in 2-col mode so the last lone card stays half-width.
  const listData = numCols > 1 && rows.length % 2 === 1
    ? [...rows, { id: '__ghost__', _ghost: true }]
    : rows;

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

    const phone = item.customerMobile || '';

    // Same tile as a booking: left panel (status tag · call · VIEW) with the
    // pickup truck, right: ref · Pickup By, services, customer, address, date / time.
    return (
      <Pressable onPress={() => setPickupMenuFor(item)} className="active:opacity-90" style={tileCard}>
        <View className="items-center justify-center overflow-hidden" style={{ ...tilePanel, backgroundColor: '#E5F3F5' }}>
          <Truck size={tileRow ? 34 : 44} color="#035C6C" />
          <View className="absolute" style={{ top: 0, left: 0, maxWidth: '86%', backgroundColor: tone.fg, paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }} numberOfLines={1}>{statusMeta.label}</Text>
          </View>
          <View pointerEvents="none" className="absolute" style={{ ...viewBtn, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ACCENT_GREEN, borderRadius: 10 }}>
            <Text style={{ color: ACCENT_GREEN, fontSize: tileRow ? 11 : 12, fontWeight: '800' }}>VIEW</Text>
          </View>
        </View>

        <View style={tileText}>
        <View className="flex-row items-center" style={{ marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: ACCENT_GREEN }} numberOfLines={1}>#{ref}</Text>
          <Text style={{ marginLeft: 6, fontSize: 11, fontWeight: '800', color: item.pickupPersonName ? '#15803D' : '#9CA3AF' }} numberOfLines={1}>
            {item.pickupPersonName || 'Not assigned'}
          </Text>
        </View>
        <Text className="text-text" style={{ marginTop: 4, fontSize: 12, fontWeight: '800', lineHeight: 16 }} numberOfLines={2}>{services || 'Repair Pickup'}</Text>
        <Text className="text-text-muted" style={{ marginTop: 2, fontSize: 12 }} numberOfLines={1}>{item.customerName || '-'}</Text>
        {item.pickupAddressText ? (
          <Text className="text-text-muted" style={{ marginTop: 1, fontSize: 11 }} numberOfLines={1}>{item.pickupAddressText}</Text>
        ) : null}
        {dateStr || timeStr ? (
          <View className="flex-row items-center justify-between" style={{ marginTop: 1 }}>
            <Text className="text-text-muted" style={{ fontSize: 11 }} numberOfLines={1}>{dateStr}</Text>
            <Text className="text-text-muted" style={{ fontSize: 11, marginLeft: 6 }} numberOfLines={1}>{timeStr}</Text>
          </View>
        ) : null}
        {/* Call (left) + copy (right), on the line after date / time. */}
        {phone ? (
          <View className="flex-row items-center justify-between" style={{ marginTop: 4 }}>
              <>
                <Pressable
                  onPress={() => callPhone(phone)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${phone}`}
                  className="items-center justify-center active:opacity-70"
                  style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: '#E5F3F5' }}
                >
                  <Phone size={12} color={ACCENT_GREEN} />
                </Pressable>
                <Pressable
                  onPress={() => copyPhone(phone)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy mobile number ${phone}`}
                  className="items-center justify-center active:opacity-70"
                  style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: '#E5F3F5' }}
                >
                  <Copy size={12} color={ACCENT_GREEN} />
                </Pressable>
              </>
          </View>
        ) : null}
        </View>
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
  // ── Bulk booking card — one card for every device of GTS-001-A, -B …; a tap
  // opens the device list, never an action on the parent number.
  // Outer card shared by the booking and bulk-booking tiles. One column (phone):
  // the earlier card layout — image on the left, the same details on the right.
  // Two columns (tablet): image on top.
  const tileRow = numCols === 1;
  const tileCard = {
    flex: 1, marginBottom: 12, borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden',
    borderWidth: 1, borderColor: '#E5E7EB',
    ...(tileRow ? { flexDirection: 'row' } : null),
  };
  const tilePanel = tileRow
    ? { width: 116, minHeight: 116, alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRightWidth: 1, borderRightColor: '#E5E7EB' }
    : { aspectRatio: 1, backgroundColor: '#FFFFFF' };
  const tileText = tileRow
    ? { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingBottom: 8 }
    : { paddingHorizontal: 8, paddingBottom: 8 };
  const viewBtn = tileRow
    ? { right: 6, bottom: 6, paddingHorizontal: 10, paddingVertical: 3 }
    : { right: 8, bottom: 8, paddingHorizontal: 14, paddingVertical: 5 };

  const renderBulk = (group) => {
    const first = group.devices[0] || {};
    const newest = group.devices.reduce((acc, d) => (new Date(d.createdAt || 0) > new Date(acc.createdAt || 0) ? d : acc), first);
    const customerName = first.customerName || first.customerFullName || first.customer?.name || '-';
    const dateStr = formatDate(newest.createdAt);
    const timeStr = formatTime(newest.createdAt);
    const image = group.devices.map((d) => d._modelImage || d.deviceImageUrl).find(Boolean) || null;
    // Same tile as a single booking: image panel (BULK tag · VIEW), booking
    // number · total, one line per device (ticket + status), customer, date / time.
    return (
      <Pressable onPress={() => setDevicePickerFor(group)} className="active:opacity-90" style={tileCard}>
        <View className="items-center justify-center overflow-hidden" style={tilePanel}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '76%', height: '76%' }} resizeMode="contain" />
          ) : (
            <Smartphone size={40} color={ACCENT_GREEN} />
          )}
          <View className="absolute" style={{ top: 0, left: 0, maxWidth: '86%', backgroundColor: ACCENT_GREEN, paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }} numberOfLines={1}>Bulk · {bulkCountLabel(group.devices)}</Text>
          </View>
          <View pointerEvents="none" className="absolute" style={{ ...viewBtn, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ACCENT_GREEN, borderRadius: 10 }}>
            <Text style={{ color: ACCENT_GREEN, fontSize: tileRow ? 11 : 12, fontWeight: '800' }}>VIEW</Text>
          </View>
        </View>

        <View style={tileText}>
        <View className="flex-row items-center" style={{ marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: ACCENT_GREEN }} numberOfLines={1}>#{group.bookingNumber}</Text>
          {/* Whole booking: every device's amount added up. */}
          <View style={{ marginLeft: 6, backgroundColor: ACCENT_GREEN, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
              {inrAmount(group.devices.reduce((sum, d) => sum + deviceAmount(d), 0))}
            </Text>
          </View>
        </View>
        {/* One line per device: its ticket number (left) and status (right). */}
        {group.devices.map((d) => {
          const meta = STATUS_VARIANT[String(d.status || '').toUpperCase()] || { label: d.status || 'Pending', tone: 'amber' };
          const tone = TONE_STYLE[meta.tone] || TONE_STYLE.amber;
          return (
            <View key={d.id} className="flex-row items-center" style={{ marginTop: 4 }}>
              <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{d.trackingId}</Text>
              <Text style={{ marginLeft: 4, fontSize: 9.5, fontWeight: '800', color: tone.fg }} numberOfLines={1}>{meta.label}</Text>
            </View>
          );
        })}
        {/* Assignment progress across the booking's device tickets. */}
        {(() => {
          const n = group.devices.length;
          const done = group.devices.filter((d) => d.assignedTechnicianId || d.assignedTechnicianName).length;
          return (
            <Text style={{ marginTop: 4, fontSize: 11, fontWeight: '800', color: done === n ? '#609138' : done ? '#B45309' : '#6B7280' }} numberOfLines={1}>
              {done} Assigned{n - done ? ` · ${n - done} Unassigned` : ''}
            </Text>
          );
        })()}
        <Text className="text-text-muted" style={{ marginTop: 2, fontSize: 12 }} numberOfLines={1}>{customerName}</Text>
        {dateStr || timeStr ? (
          <View className="flex-row items-center justify-between" style={{ marginTop: 1 }}>
            <Text className="text-text-muted" style={{ fontSize: 11 }} numberOfLines={1}>{dateStr}</Text>
            <Text className="text-text-muted" style={{ fontSize: 11, marginLeft: 6 }} numberOfLines={1}>{timeStr}</Text>
          </View>
        ) : null}
        </View>
      </Pressable>
    );
  };

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1, marginHorizontal: 0 }} />;
    if (item._bulk) return renderBulk(item);
    const deviceName = item._modelName || item.deviceDisplayName || item.deviceModelName || item.modelName || 'Device';
    const deviceImage = item._modelImage || item.deviceImageUrl || null;
    const trackingId = item.trackingId || (item.id ? item.id.slice(0, 8).toUpperCase() : '-');
    const statusMeta = STATUS_VARIANT[String(item.status || '').toUpperCase()] || { label: item.status || 'Pending', tone: 'amber' };
    const customerName = item.customerName || item.customerFullName || item.customer?.name || '-';
    const phone = item.customerPhone || item.customer?.phone || '';
    const tone = TONE_STYLE[statusMeta.tone] || TONE_STYLE.amber;
    const dateStr = formatDate(item.createdAt);
    const timeStr = formatTime(item.createdAt);
    const amountStr = `₹${deviceAmount(item).toLocaleString('en-IN')}`;
    // Price block, from the same rows as the old chips: [Est | Bill], [Adv | Full
    // Paid | Paid | Pay on delivery], [Bal] (no Bal row for a ₹0 estimate).
    const payRows = payRowsFor(item);
    const payRow = payRows[1] || null;
    const balRow = payRows.find((x) => x.short === 'Bal') || null;
    const paidStr = payRow && payRow.value !== 'on delivery' ? payRow.value : null;

    const onCardPress = () => goDetailsFor(item);

    // Product-card tile: image panel (status tag · call · VIEW), price chip,
    // balance line, device name, then specs and customer.
    return (
      <Pressable onPress={onCardPress} className="active:opacity-90" style={tileCard}>
        <View
          className="items-center justify-center overflow-hidden"
          style={tilePanel}
        >
          {deviceImage ? (
            <Image source={{ uri: deviceImage }} style={{ width: '76%', height: '76%' }} resizeMode="contain" />
          ) : (
            <Smartphone size={40} color={ACCENT_GREEN} />
          )}
          {/* Status tag, top-left corner. */}
          <View
            className="absolute"
            style={{ top: 0, left: 0, maxWidth: '78%', backgroundColor: tone.fg, paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }} numberOfLines={1}>{statusMeta.label}</Text>
          </View>
          {/* VIEW, bottom-right — the whole tile opens Booking Details too. */}
          <View
            pointerEvents="none"
            className="absolute"
            style={{ ...viewBtn, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ACCENT_GREEN, borderRadius: 10 }}
          >
            <Text style={{ color: ACCENT_GREEN, fontSize: tileRow ? 11 : 12, fontWeight: '800' }}>VIEW</Text>
          </View>
        </View>

        <View style={tileText}>
        {/* Tracking ID (left) · Est (right), then Bal (left) · Paid (right). */}
        <View className="flex-row items-center" style={{ marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: ACCENT_GREEN }} numberOfLines={1}>#{trackingId}</Text>
          <View style={{ marginLeft: 6, backgroundColor: ACCENT_GREEN, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }} numberOfLines={1}>{amountStr}</Text>
          </View>
        </View>
        {balRow || paidStr ? (
          <View className="flex-row items-center" style={{ marginTop: 5 }}>
            {balRow ? (
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: balRow.fg }} numberOfLines={1}>Bal {balRow.value}</Text>
            ) : null}
            <View style={{ flex: 1 }} />
            {paidStr ? (
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#15803D' }} numberOfLines={1}>Paid {paidStr}</Text>
            ) : null}
          </View>
        ) : null}
        <Text className="text-text" style={{ marginTop: 4, fontSize: 12, fontWeight: '800', lineHeight: 16 }} numberOfLines={2}>{deviceName}</Text>
        <Text className="text-text-muted" style={{ marginTop: 2, fontSize: 12 }} numberOfLines={1}>{customerName}</Text>
        {/* Date left, time right. */}
        {dateStr || timeStr ? (
          <View className="flex-row items-center justify-between" style={{ marginTop: 1 }}>
            <Text className="text-text-muted" style={{ fontSize: 11 }} numberOfLines={1}>{dateStr}</Text>
            <Text className="text-text-muted" style={{ fontSize: 11, marginLeft: 6 }} numberOfLines={1}>{timeStr}</Text>
          </View>
        ) : null}
        {/* Call (left) + copy (right), on the line after date / time. */}
        {phone ? (
          <View className="flex-row items-center justify-between" style={{ marginTop: 4 }}>
              <>
                <Pressable
                  onPress={() => callPhone(phone)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${phone}`}
                  className="items-center justify-center active:opacity-70"
                  style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: '#E5F3F5' }}
                >
                  <Phone size={12} color={ACCENT_GREEN} />
                </Pressable>
                <Pressable
                  onPress={() => copyPhone(phone)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy mobile number ${phone}`}
                  className="items-center justify-center active:opacity-70"
                  style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: '#E5F3F5' }}
                >
                  <Copy size={12} color={ACCENT_GREEN} />
                </Pressable>
              </>
          </View>
        ) : null}
        </View>
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
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -4, bottom: -4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 96 }}>
            <Text className="text-text-muted text-[11px] font-bold tracking-widest text-center" numberOfLines={1}>{eyebrowText}</Text>
            <Text className="text-text text-[17px] font-extrabold mt-0.5 text-center" numberOfLines={1}>
              {counts[scope.key] ?? 0}{' '}
              {(counts[scope.key] ?? 0) === 1 ? nounText : `${nounText}s`}
            </Text>
          </View>
          <View className="flex-1" />
          {/* Search (opens the search bar) + Scan booking QR, top right. */}
          <Pressable
            onPress={() => { if (searchOpen) setQuery(''); setSearchOpen((v) => !v); }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Close search' : 'Search jobs'}
            className="h-9 w-9 rounded-full items-center justify-center active:opacity-80"
            style={{ backgroundColor: searchOpen ? ACCENT_GREEN : '#E5F3F5' }}
          >
            <Search size={16} color={searchOpen ? '#FFFFFF' : ACCENT_GREEN} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('ScanQrCode')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Scan booking QR code"
            className="h-9 w-9 rounded-full items-center justify-center ml-2 active:opacity-80"
            style={{ backgroundColor: '#E5F3F5' }}
          >
            <ScanLine size={16} color={ACCENT_GREEN} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {/* ── Search bar — only while the header's Search icon has it open ── */}
      {searchOpen || query ? (
        <View className="px-4" style={{ marginTop: 10 }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search by Tracking ID, Customer name, Mobile…"
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      {/* ── Left: scope menu rail · Right: bookings list ── */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <ScrollView
          style={{ width: railW, flexGrow: 0, borderRightWidth: 1, borderRightColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}
          contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 5, paddingBottom: tabSpace }}
          showsVerticalScrollIndicator={false}
        >
          {menuList.map((s, idx) => {
            const Icon = s.icon;
            const active = scope.key === s.key;
            const tone = SCOPE_TONE[s.key] || HOME_TILE_TONES[idx % HOME_TILE_TONES.length];
            const rz = railSizes(winW);
            const disc = rz.disc;
            return (
              <Pressable
                key={s.key}
                onPress={() => selectScope(s.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${s.chipLabel || s.label}, ${counts[s.key] ?? 0}`}
                className="active:opacity-80"
                style={{
                  marginVertical: 4, borderRadius: 14, backgroundColor: '#FFFFFF',
                  // Soft coloured drop shadow under each menu tile.
                  shadowColor: tone, shadowOpacity: active ? 0.12 : 0.06, shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 }, elevation: active ? 2 : 1,
                }}
              >
                {/* White at the top fading to a light tint of the tile's colour. */}
                <LinearGradient
                  colors={['#FFFFFF', `${tone}${active ? '24' : '10'}`]} // lighter tint (~14% active, ~6% idle)
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{
                    alignItems: 'center', paddingVertical: 9, paddingHorizontal: 3, borderRadius: 14,
                    borderWidth: active ? 1.5 : 1, borderColor: active ? tone : `${tone}22`,
                  }}
                >
                <View>
                  <View className="items-center justify-center" style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: tone }}>
                    <Icon size={rz.icon} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                  <View
                    className="absolute items-center justify-center"
                    style={{ top: -4, right: -8, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: tone }}
                  >
                    <Text style={{ fontSize: rz.badge, fontWeight: '800', color: tone }} numberOfLines={1}>{counts[s.key] ?? 0}</Text>
                  </View>
                </View>
                <Text
                  style={{ marginTop: 5, fontSize: rz.font, lineHeight: rz.line, fontWeight: active ? '800' : '700', color: tone, textAlign: 'center' }}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {s.chipLabel || s.label}
                </Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }}>
      {error ? (
        <View className="mx-4 mt-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
        >
          <Text className="text-[12px] text-danger font-bold">{error}</Text>
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <Loader label="Loading jobs..." />
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
          // Single column (phones, narrow tablets): cap the cards so they don't stretch.
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: tabSpace, ...(numCols === 1 ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : null) }}
          ListEmptyComponent={
            <EmptyState
              icon={<ClipboardList size={26} color={ACCENT_GREEN} />}
              title={narrowed ? 'No jobs found' : scope.emptyTitle}
              description={narrowed ? 'Try clearing filters.' : scope.emptyDescription}
              actionLabel={narrowed ? 'Clear filters' : null}
              onAction={() => { setQuery(''); setDateFilter(null); }}
            />
          }
        />
      )}
        </View>
      </View>

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
              // Tablets: a centred sheet, not a full-width strip.
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
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
      <ResponsiveModal visible={!!bookingMenuFor} onClose={closeBookingMenu}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        {menuFromBulk ? (
          <Pressable onPress={closeBookingMenu} hitSlop={6} className="flex-row items-center active:opacity-70" style={{ alignSelf: 'flex-start', marginBottom: 6 }}>
            <ArrowLeft size={14} color={ACCENT_GREEN} />
            <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '700', color: ACCENT_GREEN }}>
              All devices · {menuFromBulk.bookingNumber}
            </Text>
          </Pressable>
        ) : null}
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
          {bookingMenuFor ? (bookingMenuFor._modelName || bookingMenuFor.deviceDisplayName || bookingMenuFor.deviceModelName || bookingMenuFor.modelName || 'Job') : ''}
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

      {/* Bulk booking → pick a device; its row opens the action grid above for
          that device's own ticket (never the parent number). */}
      <ResponsiveModal visible={!!devicePickerFor} onClose={() => setDevicePickerFor(null)} scrollable>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        <View className="self-start rounded-md px-1.5 py-0.5 mb-1" style={{ backgroundColor: 'rgba(3, 92, 108, 0.12)' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: ACCENT_GREEN }}>BULK JOB · {devicePickerFor?.bookingNumber}</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
          {devicePickerFor
            ? [devicePickerFor.bookingNumber, bulkCountLabel(devicePickerFor.devices), devicePickerFor.devices[0]?.customerName].filter(Boolean).join(' · ')
            : ''}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 10 }} numberOfLines={1}>
          Tap a device to see its actions
        </Text>
        {(devicePickerFor?.devices || []).map((d) => {
          const meta = STATUS_VARIANT[String(d.status || '').toUpperCase()] || { label: d.status || 'Pending', tone: 'amber' };
          const tone = TONE_STYLE[meta.tone] || TONE_STYLE.amber;
          const image = d._modelImage || d.deviceImageUrl || null;
          return (
            <Pressable
              key={d.id}
              onPress={() => { setDevicePickerFor(null); goDetailsFor(d); }}
              accessibilityRole="button"
              accessibilityLabel={`${d.trackingId} actions`}
              className="flex-row items-center active:opacity-80"
              style={{ padding: 10, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}
            >
              <View className="items-center justify-center overflow-hidden" style={{ height: 44, width: 44, borderRadius: 12, backgroundColor: 'rgba(3, 92, 108, 0.10)', marginRight: 10 }}>
                {image ? <Image source={{ uri: image }} style={{ width: 44, height: 44 }} resizeMode="cover" /> : <Smartphone size={20} color={ACCENT_GREEN} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: ACCENT_GREEN }}>#{d.trackingId}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#111111', marginTop: 1 }} numberOfLines={1}>
                  {d._modelName || d.deviceDisplayName || d.deviceModelName || d.modelName || 'Device'}
                </Text>
                {/* Its own issue / services — each device is a separate repair. */}
                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }} numberOfLines={1}>
                  {d.repairServicesSummary || (d.services?.map?.((s) => s.serviceName).join(', ')) || d.issueDescription || '—'}
                </Text>
                {/* This device's own Est / Adv / Bal — same chips as its card. */}
                <PayChips item={d} style={{ marginTop: 4 }} />
              </View>
              <View className="items-end" style={{ marginLeft: 6, maxWidth: 120 }}>
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: tone.fg }} numberOfLines={1}>{meta.label.toUpperCase()}</Text>
                </View>
                {/* Right-side amount, as on the booking card: invoice total, else estimate. */}
                <Text style={{ fontSize: 12, fontWeight: '800', color: ACCENT_GREEN, marginTop: 4 }} numberOfLines={1}>
                  {inrAmount(deviceAmount(d))}
                </Text>
              </View>
            </Pressable>
          );
        })}
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
