// Shared scan → search pipeline used by BOTH the QR/barcode scanner and the
// Lens/visual scanner (see ScanSearchScreen.js), and by nothing else — this
// is the ONE place a scanned/recognised value turns into a database lookup,
// so the two scan entry points and the existing OwnerSearchScreen text
// search all resolve through the same sources instead of three separate
// systems:
//
//   text (OwnerSearchScreen)  \
//   QR scan                    >--> normalize --> ticketApi / device
//   Lens scan                 /       catalogue / pickup feed (existing)
//
// No new GGFIX backend endpoint for text/QR search: this reuses exactly the
// calls OwnerSearchScreen already makes (ticketApi '/tickets?q=',
// listShopRepairBookings(), loadSearchableModels()/searchModels()) — see
// that screen's own header comment for why those are the right three
// sources. The one exception is `runVisualSearch` below, which calls the
// separate ggfix-visual-search-service (real CLIP-based image matching —
// see that function's own comment and the service's README.md).

import { ticketApi } from '../api/client';
import { listShopRepairBookings } from '../api/orders';
import { pickupsOnly } from '../screens/owner/AllBooking/bookingScopes';
import { loadSearchableModels, searchModels } from './deviceSearch';
import { visualSearch as visualSearchRequest } from '../api/masterData';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same needle-normaliser OwnerSearchScreen uses for ticket/pickup matching
// (case-insensitive, '#' and spaces dropped) — kept identical so a scanned
// value and a typed one match the same records the same way.
const norm = (v) => String(v ?? '').toLowerCase().replace(/[#\s]/g, '');

/**
 * Turn whatever a QR/barcode/OCR pass produced into a clean search string.
 * Never throws — unrecognised content falls through as plain trimmed text
 * rather than being rejected, since a camera can capture almost anything.
 *
 *   1. trims whitespace
 *   2. decodes a URL-encoded payload if the raw value is one
 *   3. unwraps a GGFIX URL (?trackingId=/?id=/?ticketId=, or the last path
 *      segment) down to just the identifier it points at
 *   4. detects a 14–17 digit run as an IMEI/IMEISV and returns just the
 *      digits (matches ScanImeiScreen's own `normaliseImei` rule, so a QR
 *      encoding an IMEI and the dedicated IMEI scanner agree)
 *   5. anything else (tracking ID, model code, serial, plain text) is
 *      returned trimmed, untouched — it's on the caller to search it
 */
export function normalizeScannedIdentifier(rawValue) {
  if (rawValue == null) return '';
  let value = String(rawValue).trim();
  if (!value) return '';

  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try { value = decodeURIComponent(value); } catch (_) { /* not actually encoded — keep as-is */ }
  }
  value = value.trim();

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const fromParam = url.searchParams.get('trackingId')
        || url.searchParams.get('id')
        || url.searchParams.get('ticketId')
        || url.searchParams.get('q');
      if (fromParam) {
        value = fromParam;
      } else {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length) value = segments[segments.length - 1];
      }
    } catch (_) { /* not a well-formed URL — fall through with the raw string */ }
    value = value.trim();
  }

  const digitsOnly = value.replace(/[^0-9]/g, '');
  const looksNumericWithSeparators = /^[0-9\s-]+$/.test(value);
  if (looksNumericWithSeparators && digitsOnly.length >= 14 && digitsOnly.length <= 17) {
    return digitsOnly;
  }

  return value;
}

/**
 * Fast path for an exact identifier (what a QR/barcode almost always
 * encodes): try a direct ticket-by-id fetch when it's UUID-shaped, then an
 * exact trackingId match off the same `/tickets?q=` search the text search
 * uses. Mirrors ScanQrCodeScreen's existing `resolveTicket`, generalised so
 * ScanSearchScreen doesn't duplicate it.
 */
export async function resolveExactTicket(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  if (UUID_RE.test(value)) {
    const byId = await ticketApi.get(`/tickets/${value}`).catch(() => null);
    if (byId) return byId;
  }

  const page = await ticketApi.get('/tickets', { query: { q: value, size: 5 } }).catch(() => null);
  const list = Array.isArray(page?.content) ? page.content : Array.isArray(page) ? page : [];
  const exact = list.find((t) => norm(t.trackingId || t.id) === norm(value));
  if (exact) return exact;

  // Some deployments accept the raw id without dashes as a path segment too.
  if (!UUID_RE.test(value)) {
    const byRaw = await ticketApi.get(`/tickets/${value}`).catch(() => null);
    if (byRaw) return byRaw;
  }
  return null;
}

/**
 * The broad, multi-source search OwnerSearchScreen's own `run()` performs —
 * extracted here so a scan result that ISN'T an exact single ticket (a
 * model code, a customer name read off a slip, a partial match) still
 * searches the real catalogue/tickets/pickups instead of dead-ending.
 *
 * Devices resolve from the already-cached catalogue (no network round trip);
 * tickets and pickups both hit the same live endpoints the Bookings list and
 * OwnerSearchScreen already use.
 */
export async function searchGlobalRecords(query) {
  const q = String(query || '').trim();
  const needle = norm(q);
  if (needle.length < 2) return { devices: [], tickets: [], pickups: [] };

  const catalogue = await loadSearchableModels().catch(() => []);
  const devices = searchModels(catalogue, q);

  const [tRes, pRes] = await Promise.allSettled([
    ticketApi.get('/tickets', { query: { page: 0, size: 100, q } }),
    listShopRepairBookings(),
  ]);

  let tickets = [];
  if (tRes.status === 'fulfilled') {
    const d = tRes.value;
    const rows = Array.isArray(d) ? d : d?.content ?? d?.data ?? [];
    tickets = rows.filter((t) => [t.trackingId, t.customerName, t.customerMobile, t.customerPhone, t.id, t.imei]
      .filter(Boolean).some((v) => norm(v).includes(needle)));
  }

  let pickups = [];
  if (pRes.status === 'fulfilled') {
    pickups = pickupsOnly(pRes.value || []).filter((b) =>
      [b.bookingNumber, b.customerName, b.customerMobile, b.id].filter(Boolean).some((v) => norm(v).includes(needle)));
  }

  return { devices, tickets, pickups };
}

// Brand list for the Lens/OCR scanner only — used to pull a brand token out
// of free OCR text. Not a device-catalogue dependency: the catalogue's own
// brand list is per-shop/paginated and a network call, and this only needs
// to recognise a handful of common names well enough to prioritise a search
// candidate, not to validate anything.
const KNOWN_BRANDS = [
  'Apple', 'Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Redmi', 'Oppo', 'Vivo', 'iQOO',
  'Realme', 'Motorola', 'Nokia', 'Huawei', 'Honor', 'Asus', 'Sony', 'LG', 'Lenovo',
  'Infinix', 'Tecno', 'Poco', 'Nothing',
];

// GGFIX tracking IDs look like a short letter prefix + digits (e.g.
// CSPEN1014799) — matches how `splitTrackingId` (DeviceDetailScreen.js) and
// the printed slip (BarcodePrintScreen.js) already treat them.
const TRACKING_ID_RE = /\b([A-Z]{3,6}\d{6,12})\b/g;
const IMEI_RE = /\b(\d{14,17})\b/g;
// A "model code" here means a compact alphanumeric SKU, not a full sentence:
// "A2215", "SM-S928B", "GA04123-IN" — letters+digits, 4–12 chars, at least
// one digit and one letter, no spaces.
const MODEL_CODE_RE = /\b([A-Z]{1,4}-?\d[A-Z0-9-]{2,10})\b/g;

function dedupe(arr) { return Array.from(new Set(arr.filter(Boolean))); }

/**
 * OCR text → structured candidates. Never throws, never invents a value —
 * every candidate returned is a literal substring (or dash-trimmed slice) of
 * the OCR text, so a wrong OCR read can only ever miss, not fabricate a
 * different identifier.
 *
 * Prefers explicit "LABEL: value" / "LABEL" + next-line pairs (what a
 * printed device label or the GGFIX test slip actually looks like — see the
 * "GGFIX VISUAL SCANNER TEST" sample), then falls back to pattern matching
 * across the whole text for anything not explicitly labelled.
 */
export function extractIdentifiersFromOCR(text) {
  const out = { trackingIds: [], imeis: [], modelCodes: [], modelNames: [], brands: [], serials: [] };
  const raw = String(text || '');
  if (!raw.trim()) return out;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joinedUpper = lines.join(' ').toUpperCase();

  const LABELS = [
    { key: 'trackingIds', re: /^TRACKING\s*ID\b[:\s]*/i },
    { key: 'imeis', re: /^IMEI\b[:\s]*/i },
    { key: 'modelCodes', re: /^MODEL\s*(CODE|NO\.?|NUMBER)?\b[:\s]*/i },
    { key: 'brands', re: /^BRAND\b[:\s]*/i },
    { key: 'modelNames', re: /^DEVICE\b[:\s]*/i },
    { key: 'serials', re: /^SERIAL\s*(NO\.?|NUMBER)?\b[:\s]*/i },
  ];
  lines.forEach((line, i) => {
    for (const { key, re } of LABELS) {
      if (!re.test(line)) continue;
      const inline = line.replace(re, '').trim();
      const value = inline || (lines[i + 1] && !LABELS.some((l) => l.re.test(lines[i + 1])) ? lines[i + 1] : '');
      if (value) out[key].push(value.replace(/^#/, '').trim());
    }
  });

  // Pattern fallback — catches the same identifiers when the photo has no
  // (or OCR missed) an explicit label line.
  let m;
  TRACKING_ID_RE.lastIndex = 0;
  while ((m = TRACKING_ID_RE.exec(joinedUpper))) out.trackingIds.push(m[1]);
  IMEI_RE.lastIndex = 0;
  while ((m = IMEI_RE.exec(raw))) out.imeis.push(m[1]);
  MODEL_CODE_RE.lastIndex = 0;
  while ((m = MODEL_CODE_RE.exec(joinedUpper))) {
    // A tracking ID or IMEI already matched above shouldn't also show up as
    // a "model code" candidate.
    if (out.trackingIds.includes(m[1]) || /^\d+$/.test(m[1])) continue;
    out.modelCodes.push(m[1]);
  }
  KNOWN_BRANDS.forEach((b) => { if (joinedUpper.includes(b.toUpperCase())) out.brands.push(b); });

  // Model name: a line containing a known brand plus following words reads
  // as "Apple iPhone 11 Pro" — only kept when it's not itself a label line.
  lines.forEach((line) => {
    if (LABELS.some((l) => l.re.test(line))) return;
    if (KNOWN_BRANDS.some((b) => line.toUpperCase().includes(b.toUpperCase())) && line.length <= 40) {
      out.modelNames.push(line);
    }
  });

  out.trackingIds = dedupe(out.trackingIds);
  out.imeis = dedupe(out.imeis);
  out.modelCodes = dedupe(out.modelCodes);
  out.modelNames = dedupe(out.modelNames);
  out.brands = dedupe(out.brands);
  out.serials = dedupe(out.serials);
  return out;
}

/**
 * Try each OCR candidate against the real database in the priority order
 * the product spec calls for: exact tracking ID → exact IMEI → exact model
 * code → exact serial → model name (+ brand) → nothing left to try.
 * Returns as soon as something actually matches; every match comes straight
 * from `resolveExactTicket`/`searchGlobalRecords`, never fabricated from the
 * OCR text itself.
 */
export async function searchByIdentifiers(candidates) {
  const tried = [];
  const ordered = [
    ...candidates.trackingIds,
    ...candidates.imeis,
    ...candidates.modelCodes,
    ...candidates.serials,
    ...candidates.modelNames,
    ...(candidates.modelNames.length === 0 && candidates.brands.length ? candidates.brands : []),
  ];

  for (const value of dedupe(ordered)) {
    tried.push(value);
    const ticket = await resolveExactTicket(value);
    if (ticket) return { matchedOn: value, tried, kind: 'ticket', ticket };

    const { devices, tickets, pickups } = await searchGlobalRecords(value);
    const total = devices.length + tickets.length + pickups.length;
    if (total === 0) continue;
    if (tickets.length === 1 && devices.length === 0 && pickups.length === 0) {
      return { matchedOn: value, tried, kind: 'ticket', ticket: tickets[0] };
    }
    if (pickups.length === 1 && devices.length === 0 && tickets.length === 0) {
      return { matchedOn: value, tried, kind: 'pickup', pickup: pickups[0] };
    }
    if (devices.length === 1 && tickets.length === 0 && pickups.length === 0) {
      return { matchedOn: value, tried, kind: 'device', device: devices[0] };
    }
    return { matchedOn: value, tried, kind: 'multi', query: value, count: total };
  }

  return { matchedOn: null, tried, kind: 'none' };
}

/**
 * Real image-to-image device lookup for the Lens scanner — calls the
 * standalone ggfix-visual-search-service (CLIP embeddings over the actual
 * GGFIX catalogue's own product photos; see that service's README.md and
 * api/masterData.js's `visualSearch` for how it works and why it's a
 * separate service). `ocrText` is passed through so the service can boost/
 * exact-match on a model code its own multi-signal fusion reads off the
 * same photo — this function does no reranking itself, the server is the
 * single source of truth for match ordering and confidence thresholds.
 *
 * Never invents a result: a thrown request error (service not configured,
 * unreachable, or the index hasn't been built yet) comes back as
 * `{ ok: false, unavailable: true, message }`, which callers must show
 * honestly and fall back to the database text search below — never papered
 * over with a fake match list.
 */
export async function runVisualSearch(uri, { limit = 5, ocrText, barcode } = {}) {
  if (!uri) return { ok: true, confidence: 'low', bestMatch: null, matches: [] };
  try {
    const { confidence, bestMatch, matches } = await visualSearchRequest(
      { uri, name: 'scan.jpg', type: 'image/jpeg' },
      { limit, ocrText, barcode },
    );
    return { ok: true, confidence, bestMatch, matches: Array.isArray(matches) ? matches : [] };
  } catch (e) {
    const message = e?.notConfigured
      ? 'Visual device search is not set up for this build yet.'
      : e?.status === 503
        ? 'Visual search is starting up — its device index has not finished building yet. Try again shortly.'
        : e?.status === 0
          ? 'Unable to connect. Check your internet connection.'
          : (e?.message || 'Device search failed. Please try again.');
    return { ok: false, unavailable: true, message };
  }
}
