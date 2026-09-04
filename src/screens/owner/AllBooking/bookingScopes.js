import {
  CheckCircle2, Clock, ClipboardCheck, FileText, PackageCheck, Pencil,
  ReceiptIndianRupee, Truck,
} from 'lucide-react-native';

// ════════════════════════════════════════════════════════════════════════════
// Booking scopes — the single vocabulary shared by the Home snapshot cards and
// the chip row on the bookings list, so a card and the chip it lands on always
// carry the same number.
//
// Two different backends feed these:
//   • TICKET  — ticket-service /tickets. A ticket only exists once the device
//               is physically at the shop.
//   • PICKUP  — order-service /repair-bookings/shop, filtered to
//               serviceMode === 'PICKUP'. A doorstep pickup lives here for its
//               whole request → accepted → picked-up life and only mints a
//               ticket at RECEIVED_AT_SHOP. That is why the old single "Pickup"
//               chip — which filtered tickets — always read 0 while the Pickup
//               Service screen showed a queue.
//
// The scopes are filters, not a partition: ALL counts the ticket book only, and
// the pickup scopes count the pickup feed — the two never sum together. They are
// split across two tile sets (SCOPE_ORDER / PICKUP_SCOPE_ORDER) so a list only
// ever offers tiles that belong to the source it is showing.
// ════════════════════════════════════════════════════════════════════════════

// A ticket in one of these has left the pipeline.
const TICKET_TERMINAL = ['DELIVERED', 'CANCELLED'];

// A pickup awaiting the shop's first action.
const PICKUP_REQUESTED = ['ORDER_PLACED', 'PICKUP_REQUESTED'];

// A pickup that is finished either way — neither requested nor in flight.
const PICKUP_CLOSED = ['COMPLETED', 'CANCELLED', 'DELIVERED'];

/**
 * Repaired and not yet handed over — the whole band, not just READY.
 *
 * ticket.status walks a ladder (…, IN_REPAIR, READY, INVOICE_GENERATED,
 * INVOICE_READY, DELIVERED_PROCESSING, DELIVERED), so raising the invoice moves
 * a booking OFF READY while the device is still on the shelf. Matching 'READY'
 * alone therefore emptied this tile the moment billing started: the Service
 * History rail — which reads events, not status — still showed a green "Ready
 * for Delivery" while the chip counted 0.
 *
 * Exported so the Home tile sums exactly these keys; a card and the chip it
 * drills into must carry the same number.
 */
export const READY_BAND = [
  'READY',
  'INVOICE_GENERATED',
  'INVOICE_READY',
  'DELIVERED_PROCESSING',
];

export const SCOPES = {
  ALL: {
    key: 'ALL',
    label: 'Bookings',
    eyebrow: 'BOOKINGS',
    noun: 'Booking',
    source: 'TICKET',
    match: () => true,
    icon: FileText,
    color: '#087A0A',
    bg: '#E6F7E3',
    emptyTitle: 'No bookings found',
    emptyDescription: 'Bookings will appear here as they are created.',
  },
  /**
   * Bookings that have been re-estimated.
   *
   * Keyed off the existing QUOTED status — the same one BookingHistoryScreen's
   * STATUS_VARIANT labels "Re-Estimated" on the card badge — so no new status
   * and no migration are needed.
   *
   * That only holds because TicketService.update() calls markReEstimated() when
   * it detects a price/line-item change: for a long while it emitted the
   * RE_ESTIMATED_CONFIRMED timeline event and nothing else, leaving ticket.status
   * at CREATED. The Service History screen (which reads events) then said
   * "Service Re-estimated" while this tile — which reads status — sat at 0. If
   * that symptom ever comes back, check the backend write, not this filter.
   */
  RE_ESTIMATED: {
    key: 'RE_ESTIMATED',
    label: 'Re-Estimated',
    eyebrow: 'RE-ESTIMATED',
    noun: 'Re-Estimated booking',
    source: 'TICKET',
    match: (s) => s === 'QUOTED',
    icon: Pencil,
    color: '#16BB05',
    bg: '#E6F7E3',
    emptyTitle: 'No re-estimated bookings',
    emptyDescription: 'A booking appears here once it has been re-estimated.',
  },
  ACTIVE: {
    key: 'ACTIVE',
    label: 'Active',
    eyebrow: 'ACTIVE BOOKINGS',
    noun: 'Active Booking',
    source: 'TICKET',
    // By exclusion rather than a status whitelist, so intermediate statuses
    // (READY, INVOICE_*, QUOTED …) can't silently fall out of the count.
    match: (status) => !TICKET_TERMINAL.includes(status),
    icon: Clock,
    color: '#16BB05',
    bg: '#E6F7E3',
    emptyTitle: 'No active bookings',
    emptyDescription: 'Bookings still in the service pipeline will appear here.',
  },
  PICKUP_ALL: {
    key: 'PICKUP_ALL',
    label: 'All Pickups',
    eyebrow: 'ALL PICKUPS',
    noun: 'Pickup',
    source: 'PICKUP',
    match: () => true,
    icon: Truck,
    color: '#087A0A',
    bg: '#E6F7E3',
    emptyTitle: 'No pickups yet',
    emptyDescription: 'Doorstep pickups for this shop will appear here.',
  },
  PICKUP_REQUEST: {
    key: 'PICKUP_REQUEST',
    label: 'Pickup Request',
    eyebrow: 'PICKUP REQUESTS',
    noun: 'Pickup Request',
    source: 'PICKUP',
    match: (status) => PICKUP_REQUESTED.includes(status),
    icon: Truck,
    color: '#16BB05',
    bg: '#F0F8EF',
    emptyTitle: 'No pickup requests',
    emptyDescription: 'New doorstep pickup requests will appear here.',
  },
  PICKUP_ACCEPTED: {
    key: 'PICKUP_ACCEPTED',
    label: 'Pickup Accepted',
    eyebrow: 'ACCEPTED PICKUPS',
    noun: 'Accepted Pickup',
    source: 'PICKUP',
    // Everything the shop has taken on and not yet closed — accepted, person
    // assigned, on the way, picked up, reached shop.
    match: (status) => !PICKUP_REQUESTED.includes(status) && !PICKUP_CLOSED.includes(status),
    icon: ClipboardCheck,
    color: '#087A0A',
    bg: '#E6F7E3',
    emptyTitle: 'No accepted pickups',
    emptyDescription: 'Pickups you have accepted will appear here until they reach the shop.',
  },
  /**
   * Repaired and waiting to go back to the customer.
   *
   * Matches the whole READY_BAND, not the single READY status: the billing and
   * handover substates that follow READY (INVOICE_GENERATED, INVOICE_READY,
   * DELIVERED_PROCESSING) all describe a device that is repaired and still in
   * the shop's hands, which is exactly what an owner scanning this tile is
   * looking for. Narrowing it to READY made a booking vanish from here as soon
   * as its invoice was generated.
   *
   * The label stays "Ready for Delivery" — the scopes are filters, not a
   * partition, so the substates are simply counted by more than one tile.
   */
  READY_FOR_DELIVERY: {
    key: 'READY_FOR_DELIVERY',
    label: 'Ready for Delivery',
    eyebrow: 'READY FOR DELIVERY',
    noun: 'Booking Ready for Delivery',
    source: 'TICKET',
    match: (status) => READY_BAND.includes(status),
    icon: CheckCircle2,
    color: '#D97706',
    bg: '#FEF3C7',
    emptyTitle: 'Nothing ready for delivery',
    emptyDescription: 'Repaired devices waiting to be handed back to the customer will appear here.',
  },
  /**
   * Bookings that have an invoice.
   *
   * The only scope that reads a ROW rather than a status, and deliberately so:
   * an invoice is a row in `invoices`, not a stage of the repair. Counting the
   * INVOICE_GENERATED status instead would have been wrong twice over — it
   * misses every booking that has since moved on to Out for Delivery or
   * Delivered (still invoiced), and it counts a booking whose invoice write
   * failed after the status advanced. ticket.invoiceNo comes straight from the
   * invoices table (TicketService.toResponse), so this tile is a count of real
   * bills.
   */
  INVOICE: {
    key: 'INVOICE',
    label: 'Invoice',
    eyebrow: 'INVOICES',
    noun: 'Invoice',
    source: 'TICKET',
    matchRow: (row) => hasInvoice(row),
    icon: ReceiptIndianRupee,
    color: '#B45309',
    bg: '#FEF3C7',
    emptyTitle: 'No invoices yet',
    emptyDescription: 'A booking appears here once its invoice has been generated.',
  },
  DELIVERED: {
    key: 'DELIVERED',
    label: 'Delivered',
    eyebrow: 'DELIVERED BOOKINGS',
    noun: 'Delivered Booking',
    source: 'TICKET',
    match: (status) => status === 'DELIVERED',
    icon: PackageCheck,
    color: '#087A0A',
    bg: '#E6F7E3',
    emptyTitle: 'No delivered bookings',
    emptyDescription: 'Bookings handed back to the customer will appear here.',
  },
};

// Display order for the chip row on the default (ticket book) list.
//
// The two pickup scopes are deliberately NOT here: doorstep pickups have their
// own surface now (PICKUP_SCOPE_ORDER below, reached from Home → Pickup and from
// the Home pickup cards), so showing them here as well put the same queue in two
// places and mixed order-service rows into a list whose other tiles are tickets.
export const SCOPE_ORDER = [
  'ALL',
  'ACTIVE',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'INVOICE',
];

export const SCOPE_LIST = SCOPE_ORDER.map((k) => SCOPES[k]);

// The pickup-only tile set, used when the list is opened from the Home "Pickup"
// quick action. Same screen, same data, narrowed vocabulary: the four stages a
// doorstep job actually moves through, instead of the full ticket book.
//
// Ready for Delivery is deliberately the shared ticket-sourced scope: a pickup
// mints a ticket at RECEIVED_AT_SHOP, so the return leg genuinely lives on the
// ticket (READY) and there is no pickup status for it.
export const PICKUP_SCOPE_ORDER = [
  'PICKUP_ALL',
  'PICKUP_REQUEST',
  'PICKUP_ACCEPTED',
  'READY_FOR_DELIVERY',
];

export const PICKUP_SCOPE_LIST = PICKUP_SCOPE_ORDER.map((k) => SCOPES[k]);

/** The Re-Estimated menu shows only these two tiles. */
export const RE_ESTIMATED_SCOPE_LIST = [SCOPES.ALL, SCOPES.RE_ESTIMATED];

// Which tile set a mounted list shows. `menu` arrives as a route param; the
// preset is the fallback signal.
export function scopeListFor(menu, presetKey) {
  if (String(menu || '').toUpperCase() === 'PICKUP') return PICKUP_SCOPE_LIST;
  // Re-Estimated is a two-tile surface: the whole book, and the re-estimated
  // slice of it. Active / Ready for Delivery / Delivered belong to the working
  // list, not to this one.
  if (String(menu || '').toUpperCase() === 'RE_ESTIMATED') return RE_ESTIMATED_SCOPE_LIST;
  // No explicit menu, but a pickup-only preset: still show the pickup set, or
  // the selected scope would have no tile on screen — nothing highlighted, and
  // no way to widen back out. READY_FOR_DELIVERY is in both sets, so it is
  // excluded here and stays on the default one.
  const key = String(presetKey || '').toUpperCase();
  if (key && PICKUP_SCOPE_ORDER.includes(key) && !SCOPE_ORDER.includes(key)) return PICKUP_SCOPE_LIST;
  return SCOPE_LIST;
}

export function scopeFor(key) {
  return SCOPES[String(key || '').toUpperCase()] || null;
}

export const statusOf = (row) => String(row?.status || '').toUpperCase();

/**
 * Does this booking have an invoice?
 *
 * `invoiceNo` / `invoiceId` are joined onto the ticket from the invoices table,
 * so this is the presence of a bill, not a guess from the status. Exported so
 * the scope tile and the card's Invoice action can't disagree about which
 * bookings have one.
 */
export const hasInvoice = (row) => !!(row?.invoiceNo || row?.invoiceId);

// Only pickups — a shop's repair-booking feed also carries walk-in bookings.
export const pickupsOnly = (bookings) =>
  (Array.isArray(bookings) ? bookings : []).filter((b) => b?.serviceMode === 'PICKUP');

/**
 * Does one row belong in one scope?
 *
 * Most scopes are a status test, so `match(status)` stays the common shape; a
 * scope that needs more of the row (Invoice) declares `matchRow` instead. Used
 * by both the tile counts and the visible list so a tile can never count rows
 * the list then filters out.
 */
export const scopeMatches = (scope, row) => (
  scope?.matchRow ? scope.matchRow(row) : scope.match(statusOf(row))
);

// Count one scope over the two already-loaded source lists.
/**
 * @param {any} scope
 * @param {{tickets?: any[], pickups?: any[]}} [ctx]
 */
export function countScope(scope, ctx = {}) {
  const { tickets = [], pickups = [] } = ctx;
  const rows = scope.source === 'PICKUP' ? pickups : tickets;
  return rows.filter((r) => scopeMatches(scope, r)).length;
}
