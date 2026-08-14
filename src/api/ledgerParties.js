import { ticketApi } from './client';

// The shop's customer / supplier accounts — the two books behind the Cash Book
// screen's Customer and Supplier tabs. Lives in ticket-service alongside the
// cash book (backend migration 81) and is owner-only: the backend rejects a
// technician token with 403, so this module is only reachable from the owner
// stack.

export const PARTY_CUSTOMER = 'CUSTOMER';
export const PARTY_SUPPLIER = 'SUPPLIER';

/** Screen copy that differs between the two books, kept in one place. */
export const PARTY_COPY = {
  [PARTY_CUSTOMER]: {
    one: 'Customer',
    addCta: 'Add Customer',
    emptyTitle: 'No customers yet',
    emptyBody: 'Add the people you bill so their account is one tap away.',
  },
  [PARTY_SUPPLIER]: {
    one: 'Supplier',
    addCta: 'Add Supplier',
    emptyTitle: 'No suppliers yet',
    emptyBody: 'Add the shops you buy spares from so their account is one tap away.',
  },
};

export const partyCopy = (type) => PARTY_COPY[type] || PARTY_COPY[PARTY_CUSTOMER];

/**
 * Digits only, in the 10-digit national form the backend stores.
 *
 * The phone book hands numbers back written every possible way — "+91 98765
 * 43210", "098765-43210", "(044) 2345 6789" — and the server's one-account-per-
 * number rule only holds if they all collapse to the same string. Kept
 * deliberately identical to ShopLedgerPartyService.requirePhone so the client
 * can pre-validate without a round trip.
 */
export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export const isValidPhone = (value) => normalizePhone(value).length === 10;

/** `98765 43210` — grouped the way an Indian number is read aloud. */
export function formatPhone(value) {
  const d = normalizePhone(value);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : String(value || '');
}

export async function listParties(partyType) {
  const rows = await ticketApi.get('/ledger-parties', { query: { partyType } });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Adds an account. The server upserts on (shop, type, phone), so re-importing
 * the same contact updates its name rather than creating a second account.
 */
export async function createParty({ partyType, name, phone }) {
  return await ticketApi.post('/ledger-parties', {
    body: { partyType, name: (name || '').trim(), phone: normalizePhone(phone) },
  });
}

// PATCH: only the fields sent are changed, so renaming an account doesn't have
// to resend the number.
export async function updateParty(id, patch) {
  const body = {};
  if (patch.name !== undefined) body.name = String(patch.name).trim();
  if (patch.phone !== undefined) body.phone = normalizePhone(patch.phone);
  // Tri-state, matching the server: a `YYYY-MM-DD` sets the promise, an
  // explicit null clears it, and omitting the key leaves it alone — so renaming
  // an account can't wipe the day it was promised to pay.
  if (patch.dueDate !== undefined) {
    if (patch.dueDate === null) body.clearDueDate = true;
    else body.dueDate = patch.dueDate;
  }
  return await ticketApi.patch(`/ledger-parties/${id}`, { body });
}

export async function deleteParty(id) {
  return await ticketApi.del(`/ledger-parties/${id}`);
}

/* ── entries: money moving on an account ─────────────────────────────────── */

export const RECEIVED = 'RECEIVED'; // the party paid the shop
export const GIVEN = 'GIVEN';       // the shop paid the party

/**
 * How a balance reads on screen.
 *
 * Positive means the party owes the shop, which is the state worth chasing, so
 * it is the only one shown in red. Zero is labelled "Due" but coloured like a
 * settled account — an account at zero is good news, not an outstanding debt.
 */
export function balanceTone(balance) {
  const n = Number(balance) || 0;
  if (n > 0) return { label: 'Due', danger: true };
  if (n < 0) return { label: 'Advance', danger: false };
  return { label: 'Due', danger: false };
}

/** `YYYY-MM-DD` in the DEVICE's local calendar. Deliberately not toISOString(), */
/*  which converts to UTC and files an evening entry under the previous day. */
export function toApiDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

const EMPTY_STATEMENT = { party: null, balance: 0, totalReceived: 0, totalGiven: 0, entries: [] };

/** One account: who they are, where they stand, and every movement. */
export async function getStatement(partyId) {
  const res = await ticketApi.get(`/ledger-entries/party/${partyId}`);
  if (!res) return EMPTY_STATEMENT;
  return {
    party: res.party || null,
    balance: Number(res.balance ?? 0),
    totalReceived: Number(res.totalReceived ?? 0),
    totalGiven: Number(res.totalGiven ?? 0),
    entries: Array.isArray(res.entries) ? res.entries : [],
  };
}

/** Every account's movements in a window — the Today / This Week / Month chips. */
export async function getLedgerPeriod({ from, to } = {}) {
  const res = await ticketApi.get('/ledger-entries', { query: { from, to } });
  return {
    from: res?.from ?? from ?? null,
    to: res?.to ?? to ?? null,
    totalReceived: Number(res?.totalReceived ?? 0),
    totalGiven: Number(res?.totalGiven ?? 0),
    entries: Array.isArray(res?.entries) ? res.entries : [],
  };
}

export async function createEntry(
  partyId,
  { direction, amount, entryDate, note, noteAudioUrl, billUrls, ticketId },
) {
  return await ticketApi.post(`/ledger-entries/party/${partyId}`, {
    body: {
      direction,
      amount: Number(amount),
      entryDate: entryDate ? toApiDate(entryDate) : undefined,
      // Empty string, not undefined: PATCH treats a missing field as "leave it
      // alone", so clearing a note has to be sent explicitly.
      note: (note || '').trim(),
      // The evidence behind the amount: a note spoken instead of typed, and
      // photographed bills. Both are already-uploaded media URLs — this call
      // never carries the files themselves (see uploadMedia).
      noteAudioUrl: noteAudioUrl || '',
      billUrls: Array.isArray(billUrls) ? billUrls.filter(Boolean) : [],
      // Only the id: the server re-reads the ticket and snapshots its tracking
      // id and device name itself, so a client can't put a label on a row that
      // the repair record never said.
      ticketId: ticketId || undefined,
    },
  });
}

/**
 * This shop's bookings matching a search — a phone number, a tracking id or a
 * name. Used by the entry screen's "Booking" picker to attach an advance to the
 * job it was paid against.
 *
 * Shop scoping is the token's, not a parameter: `/tickets` reads shopId from the
 * request context, so this can only ever return the caller's own jobs.
 */
export async function searchShopBookings(query, { size = 20 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const page = await ticketApi.get('/tickets', { query: { page: 0, size, q } }).catch(() => null);
  const rows = Array.isArray(page) ? page : (page?.content ?? []);
  return rows.map((t) => ({
    id: t.id,
    trackingId: t.trackingId,
    label: t.deviceDisplayName || t.repairServicesSummary || t.trackingId,
    customerName: t.customerName,
    customerPhone: t.customerPhone,
    status: t.status,
    // What is still owed on the job, as far as the ticket knows. Shown next to
    // each row so the owner can tell which job the advance belongs to.
    amount: Number(t.finalPrice ?? t.estimatedPrice ?? 0) || 0,
    createdAt: t.createdAt,
  }));
}

/**
 * Edit an entry in place. Only what is sent changes — the server treats a
 * missing field as "leave it alone" — so a corrected amount does not wipe the
 * bills or the voice note attached to the same row.
 *
 * `direction` is deliberately editable: a payment booked on the wrong side is
 * the single most common mistake at a counter, and forcing delete-and-re-add
 * loses the row's date and its evidence.
 */
export async function updateEntry(
  id,
  { direction, amount, entryDate, note, noteAudioUrl, billUrls, ticketId },
) {
  const body = {};
  if (direction !== undefined) body.direction = direction;
  if (amount !== undefined) body.amount = Number(amount);
  if (entryDate !== undefined) body.entryDate = entryDate ? toApiDate(entryDate) : undefined;
  // Empty string clears; undefined leaves alone. Same rule as createEntry.
  if (note !== undefined) body.note = (note || '').trim();
  if (noteAudioUrl !== undefined) body.noteAudioUrl = noteAudioUrl || '';
  if (billUrls !== undefined) body.billUrls = Array.isArray(billUrls) ? billUrls.filter(Boolean) : [];
  if (ticketId !== undefined) body.ticketId = ticketId || undefined;
  return await ticketApi.patch(`/ledger-entries/${id}`, { body });
}

export async function deleteEntry(id) {
  return await ticketApi.del(`/ledger-entries/${id}`);
}
