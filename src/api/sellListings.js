import { marketplaceApi } from './client';

// Partner Sell module API (contract: docs/SELL-MODULE-API.md).
//
// The shop-scoped /shop/marketplace/* endpoints are new. Until a server has
// them, listing calls fall back to the legacy /marketplace/products endpoints
// (same table, same rows) and enquiry calls throw SERVER_UPDATE_REQUIRED —
// the screens say so instead of pretending. Fields the legacy server has no
// column for (quantity, negotiable, fulfilment, video, listing type, item
// condition, clientRef) are also kept in assessmentJson.sellMeta, so they
// survive on either server.

export const LISTING_STATUSES = ['ACTIVE', 'DRAFT', 'SOLD', 'INACTIVE'];
export const FULFILMENT = { PICKUP: 'PICKUP', SHIPPING: 'SHIPPING' };
export const MAX_PHOTOS = 10;
export const MIN_DEVICE_PHOTOS = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export function newClientRef() {
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

function unwrap(data) {
  return Array.isArray(data) ? data : (data?.content || data?.data || []);
}

function serverUpdateError(feature) {
  const err = new Error(`${feature} needs the latest NearGFix server update. Ask your admin to deploy the marketplace service.`);
  err.code = 'SERVER_UPDATE_REQUIRED';
  return err;
}

// An endpoint the server doesn't have. Older marketplace-service builds answer
// an unknown path with HTTP 500 "No static resource …" (Spring's
// NoResourceFoundException) instead of 404; the raw text is in devMessage.
const isMissing = (e) => e?.status === 404 || e?.status === 405
  || (e?.status >= 500 && /no static resource|no handler found|no endpoint/i.test(`${e?.devMessage || ''} ${e?.message || ''}`));

// 'v2' when /shop/marketplace/* exists, 'legacy' otherwise. Probed once per
// app run; a network failure is rethrown, never cached.
let modePromise = null;
export function resetSellServerMode() { modePromise = null; }
async function serverMode() {
  if (!modePromise) {
    modePromise = marketplaceApi.get('/shop/marketplace/summary')
      .then(() => 'v2')
      .catch((e) => {
        if (isMissing(e)) return 'legacy';
        modePromise = null;
        throw e;
      });
  }
  return modePromise;
}

// ── Normalisation ───────────────────────────────────────────────────────────

function parseJson(s) {
  if (!s || typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

export function normalizeStatus(raw) {
  const s = String(raw || 'ACTIVE').toUpperCase();
  if (s === 'COMPLETED') return 'SOLD';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'INACTIVE';
  return s;
}

/** Product row with the sellMeta fallbacks folded in and `_status` normalised. */
export function normalizeProduct(p) {
  if (!p) return p;
  const assessment = parseJson(p.assessmentJson) || {};
  const meta = assessment.sellMeta || {};
  const pick = (k, d) => (p[k] != null ? p[k] : meta[k] != null ? meta[k] : d);
  const extra = Array.isArray(p.extraImageUrls) ? p.extraImageUrls.filter(Boolean) : [];
  return {
    ...p,
    _status: normalizeStatus(p.status),
    _assessment: assessment,
    listingType: pick('listingType', p.descriptionType === 'SPARE_PARTS' ? 'SPARE_PART' : 'DEVICE'),
    itemCondition: pick('itemCondition', null),
    quantity: Number(pick('quantity', 1)),
    soldQuantity: Number(pick('soldQuantity', 0)),
    negotiable: !!pick('negotiable', false),
    fulfilmentOptions: pick('fulfilmentOptions', ['PICKUP']),
    videoUrl: pick('videoUrl', null),
    clientRef: pick('clientRef', null),
    images: [p.imageUrl, ...extra].filter(Boolean),
  };
}

/**
 * ProductRequest from plain fields: drops non-UUID ids (master data can hand
 * back placeholder ids like "ram:6 GB", which the server rejects) and mirrors
 * the new fields into assessmentJson.sellMeta.
 */
export function toProductRequest(fields) {
  const { assessment = {}, images = [], ...rest } = fields;
  const urls = images.filter(Boolean).slice(0, MAX_PHOTOS);
  const sellMeta = {
    listingType: rest.listingType || 'DEVICE',
    itemCondition: rest.itemCondition || null,
    quantity: rest.quantity ?? 1,
    negotiable: !!rest.negotiable,
    fulfilmentOptions: rest.fulfilmentOptions || ['PICKUP'],
    videoUrl: rest.videoUrl || null,
    clientRef: rest.clientRef || null,
  };
  const body = {
    ...rest,
    type: 'SELL',
    imageUrl: urls[0] || null,
    extraImageUrls: urls.slice(1),
    assessmentJson: JSON.stringify({ ...assessment, sellMeta }),
  };
  ['brandId', 'modelId', 'ramOptionId', 'storageOptionId', 'batchId'].forEach((k) => {
    if (!isUuid(body[k])) body[k] = null;
  });
  return body;
}

// ── Legacy helpers ──────────────────────────────────────────────────────────

const LEGACY_STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE', 'SOLD', 'COMPLETED', 'CANCELLED'];

async function legacyMine({ shopId, userId }) {
  const fetchStatus = async (status) => unwrap(await marketplaceApi.get('/marketplace/products', { query: { type: 'SELL', status } }));
  // Only the ACTIVE request failing is an error; the others add nothing on failure.
  const [base, ...rest] = await Promise.all([
    fetchStatus('ACTIVE'),
    ...LEGACY_STATUSES.slice(1).map((s) => fetchStatus(s).catch(() => [])),
  ]);
  const seen = new Set();
  return [...base, ...rest.flat()]
    .filter((p) => {
      if (!p?.id || seen.has(String(p.id))) return false;
      seen.add(String(p.id));
      return shopId ? p.shopId === shopId : !!userId && p.sellerUserId === userId;
    })
    .map(normalizeProduct)
    .filter((p) => p._status !== 'DELETED')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

function matchesQuery(p, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [p.title, p.description, p.imei, p.color, p.storageLabel, p.ramLabel, p.conditionLabel]
    .some((v) => String(v || '').toLowerCase().includes(needle));
}

function countsOf(list) {
  const counts = { ALL: list.length, ACTIVE: 0, DRAFT: 0, SOLD: 0, INACTIVE: 0 };
  list.forEach((p) => { if (counts[p._status] != null) counts[p._status] += 1; });
  return counts;
}

// ── Listings ────────────────────────────────────────────────────────────────

/** { content, page, size, totalElements, totalPages, counts, legacy } */
export async function listMyListings({ status = 'ALL', q = '', page = 0, size = 20 } = {}, ctx = {}) {
  if ((await serverMode()) === 'v2') {
    const res = await marketplaceApi.get('/shop/marketplace/products', { query: { status, q: q || undefined, page, size } });
    return { ...res, content: unwrap(res).map(normalizeProduct), legacy: false };
  }
  const mine = await legacyMine(ctx);
  const counts = countsOf(mine);
  const filtered = mine.filter((p) => (status === 'ALL' || p._status === status) && matchesQuery(p, q.trim()));
  return {
    content: filtered.slice(page * size, page * size + size),
    page,
    size,
    totalElements: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    counts,
    legacy: true,
  };
}

/** { active, draft, sold, inactive, enquiriesOpen, purchaseRequestsOpen, enquiriesUnread, legacy } */
export async function getSellSummary(ctx = {}) {
  if ((await serverMode()) === 'v2') {
    return { ...(await marketplaceApi.get('/shop/marketplace/summary')), legacy: false };
  }
  const counts = countsOf(await legacyMine(ctx));
  return {
    active: counts.ACTIVE, draft: counts.DRAFT, sold: counts.SOLD, inactive: counts.INACTIVE,
    enquiriesOpen: null, purchaseRequestsOpen: null, enquiriesUnread: null, legacy: true,
  };
}

export async function getMyListing(id) {
  if ((await serverMode()) === 'v2') return normalizeProduct(await marketplaceApi.get(`/shop/marketplace/products/${id}`));
  return normalizeProduct(await marketplaceApi.get(`/marketplace/products/${id}`));
}

export async function createListing(fields, ctx = {}) {
  const body = toProductRequest(fields);
  if ((await serverMode()) === 'v2') return normalizeProduct(await marketplaceApi.post('/shop/marketplace/products', { body }));
  return normalizeProduct(await marketplaceApi.post('/marketplace/products', { body: { ...body, shopId: ctx.shopId || null } }));
}

export async function updateListing(id, fields) {
  const body = toProductRequest(fields);
  if ((await serverMode()) === 'v2') return normalizeProduct(await marketplaceApi.put(`/shop/marketplace/products/${id}`, { body }));
  return normalizeProduct(await marketplaceApi.put(`/marketplace/products/${id}`, { body }));
}

/** Price-only edit; keeps every other field (and sellMeta) as stored. */
export async function updateListingPrice(product, price) {
  if ((await serverMode()) === 'v2') {
    return normalizeProduct(await marketplaceApi.put(`/shop/marketplace/products/${product.id}`, { body: { price } }));
  }
  return normalizeProduct(await marketplaceApi.put(`/marketplace/products/${product.id}`, { body: { price } }));
}

const TRANSITIONS = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['INACTIVE', 'DRAFT', 'SOLD'],
  INACTIVE: ['ACTIVE', 'DRAFT', 'SOLD'],
};
export function canTransition(from, to) {
  return (TRANSITIONS[normalizeStatus(from)] || []).includes(to);
}

/** status change; `quantitySold` < quantity sells part of the stock. */
export async function setListingStatus(product, status, { quantitySold } = {}) {
  if (!canTransition(product._status || product.status, status)) {
    const err = new Error(`A ${String(product._status || product.status).toLowerCase()} listing can't be marked ${status.toLowerCase()}.`);
    err.status = 409;
    throw err;
  }
  if ((await serverMode()) === 'v2') {
    return normalizeProduct(await marketplaceApi.patch(`/shop/marketplace/products/${product.id}/status`, { body: { status, quantitySold } }));
  }
  const p = normalizeProduct(product);
  // The legacy server doesn't check publishability (v2 answers 400), so apply the contract's rule here.
  if (status === 'ACTIVE') {
    let problem = null;
    if (!String(p.title || '').trim()) problem = 'Add a title before publishing this listing.';
    else if (!(Number(p.price) > 0)) problem = 'Set a price above ₹0 before publishing this listing.';
    else if (!(p.quantity >= 1)) problem = 'Set the quantity to at least 1 before publishing this listing.';
    else if (p.listingType === 'DEVICE' && p.images.length < MIN_DEVICE_PHOTOS) {
      problem = `A device needs at least ${MIN_DEVICE_PHOTOS} photos to go live. Edit the listing to add photos.`;
    }
    if (problem) {
      const err = new Error(problem);
      err.status = 400;
      throw err;
    }
  }
  if (status === 'SOLD' && quantitySold && quantitySold < p.quantity) {
    const assessment = { ...p._assessment, sellMeta: { ...(p._assessment.sellMeta || {}), quantity: p.quantity - quantitySold, soldQuantity: p.soldQuantity + quantitySold } };
    return normalizeProduct(await marketplaceApi.put(`/marketplace/products/${p.id}`, { body: { assessmentJson: JSON.stringify(assessment) } }));
  }
  const body = { status };
  if (status === 'SOLD') {
    body.assessmentJson = JSON.stringify({ ...p._assessment, sellMeta: { ...(p._assessment.sellMeta || {}), quantity: 0, soldQuantity: p.soldQuantity + p.quantity } });
  }
  return normalizeProduct(await marketplaceApi.put(`/marketplace/products/${p.id}`, { body }));
}

export async function deleteListing(id) {
  if ((await serverMode()) === 'v2') return marketplaceApi.del(`/shop/marketplace/products/${id}`);
  return marketplaceApi.del(`/marketplace/products/${id}`);
}

/**
 * Bulk create. items: [{ clientRef, ...fields }] (fields as for createListing).
 * Returns the contract's bulk result. On a legacy server each item is posted
 * one by one with the same result shape; callers skip rows that already have
 * a productId, so a retry never posts a row twice.
 */
export async function bulkCreateListings({ batchId, publish, items }, ctx = {}) {
  const bodies = items.map((it) => toProductRequest({ ...it, batchId }));
  if ((await serverMode()) === 'v2') {
    return marketplaceApi.post('/shop/marketplace/products/bulk', { body: { batchId, publish, items: bodies } });
  }
  const results = [];
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    try {
      const res = await marketplaceApi.post('/marketplace/products', { body: { ...body, shopId: ctx.shopId || null } });
      results.push({ index, clientRef: items[index].clientRef, outcome: 'CREATED', status: normalizeStatus(res?.status), productId: res?.id, errors: [], warnings: [] });
    } catch (e) {
      results.push({ index, clientRef: items[index].clientRef, outcome: 'FAILED', status: null, productId: null, errors: [e?.message || 'Could not save this item'], warnings: [] });
    }
  }
  const count = (fn) => results.filter(fn).length;
  return {
    batchId,
    results,
    created: count((r) => r.outcome === 'CREATED'),
    existing: 0,
    failed: count((r) => r.outcome === 'FAILED'),
    published: count((r) => r.outcome !== 'FAILED' && r.status === 'ACTIVE'),
    drafts: count((r) => r.outcome !== 'FAILED' && r.status === 'DRAFT'),
    legacy: true,
  };
}

// ── Enquiries & quotations (v2 only) ────────────────────────────────────────

export async function requireV2(feature) {
  if ((await serverMode()) !== 'v2') throw serverUpdateError(feature);
}

/** { content, page, size, totalElements, totalPages, counts } */
export async function listEnquiries({ status = 'ACTIVE', kind, productId, page = 0, size = 20 } = {}) {
  await requireV2('Buyer enquiries');
  return marketplaceApi.get('/shop/marketplace/enquiries', { query: { status, kind, productId, page, size } });
}
export async function getEnquiry(id) {
  await requireV2('Buyer enquiries');
  return marketplaceApi.get(`/shop/marketplace/enquiries/${id}`);
}
export async function sendEnquiryOffer(id, { amount, note }) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/shop/marketplace/enquiries/${id}/offers`, { body: { amount, note: note || null } });
}
export async function acceptEnquiry(id) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/shop/marketplace/enquiries/${id}/accept`);
}
export async function rejectEnquiry(id, reason) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/shop/marketplace/enquiries/${id}/reject`, { body: { reason: reason || null } });
}
export async function confirmEnquiry(id, fulfilment) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/shop/marketplace/enquiries/${id}/confirm`, { body: { fulfilment } });
}
