import { createDraftStore } from '../draft';
import { MAX_PHOTOS, MIN_DEVICE_PHOTOS, newClientRef } from '../../../../api/sellListings';

// Bulk listing draft: one batch at a time, persisted so Back, re-opening the
// flow and an app restart never lose rows, photos or results. Every bulk
// screen reads and writes this one object.

export const BATCH = {
  SAME_MODEL: 'SAME_MODEL',
  MULTI_MODEL: 'MULTI_MODEL',
  SPARE_PARTS: 'SPARE_PARTS',
  ACCESSORIES: 'ACCESSORIES',
  CSV: 'CSV',
};

export const LISTING = { DEVICE: 'DEVICE', SPARE_PART: 'SPARE_PART', ACCESSORY: 'ACCESSORY' };

export const BATCH_META = {
  SAME_MODEL: {
    title: 'Same Model, Multiple Quantity',
    sub: 'List one model in different quantities (e.g., iPhone 13 – 10 pcs)',
    listingType: LISTING.DEVICE,
  },
  MULTI_MODEL: {
    title: 'Different Models Upload',
    sub: 'List multiple models at once (e.g., iPhone, Samsung, OnePlus)',
    listingType: LISTING.DEVICE,
  },
  SPARE_PARTS: {
    title: 'Spare Parts Batch',
    sub: 'List multiple spare parts (e.g., Displays, Batteries, Cameras)',
    listingType: LISTING.SPARE_PART,
  },
  ACCESSORIES: {
    title: 'Accessories Batch',
    sub: 'List accessories in bulk (e.g., Cables, Chargers, Cases)',
    listingType: LISTING.ACCESSORY,
  },
  CSV: {
    title: 'CSV / Excel Upload',
    sub: 'Upload a prepared sheet to create multiple listings quickly',
    listingType: LISTING.DEVICE,
  },
};

/** One bulk call carries at most 100 items (server contract). */
export const MAX_ROWS = 100;
export const MAX_QTY = 9999;
export const MAX_PRICE = 9999999;

export const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'USED', label: 'Used' },
  { value: 'REFURBISHED', label: 'Refurbished' },
];
export const GRADES = [
  { value: 'LIKE_NEW', label: 'Excellent' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
];
export const PART_QUALITY = [
  { value: 'ORIGINAL', label: 'Original' },
  { value: 'OEM', label: 'OEM' },
  { value: 'COMPATIBLE', label: 'Compatible' },
];
export const PART_TYPES = [
  'Display / Combo', 'Battery', 'Back Panel', 'Front Camera', 'Back Camera', 'Charging Board',
  'Motherboard', 'Speaker / Mic', 'Frame / Housing', 'Flex Cable', 'Other',
];
export const ACCESSORY_TYPES = [
  'Charger / Adapter', 'Cable', 'Case / Cover', 'Screen Guard', 'Earphones / Headset',
  'Power Bank', 'Watch Strap', 'Holder / Stand', 'Other',
];

const COND_LABEL = { NEW: 'New', USED: 'Used', REFURBISHED: 'Refurbished' };
const GRADE_LABEL = { LIKE_NEW: 'Excellent', GOOD: 'Good', FAIR: 'Fair' };
const QUALITY_LABEL = { ORIGINAL: 'Original', OEM: 'OEM', COMPATIBLE: 'Compatible' };

export function conditionLabel(itemCondition, grade) {
  const base = COND_LABEL[itemCondition];
  if (!base) return null;
  return itemCondition === 'USED' && GRADE_LABEL[grade] ? `${base} (${GRADE_LABEL[grade]})` : base;
}
export const qualityLabel = (q) => QUALITY_LABEL[q] || null;

// One-tap condition chips (Condition & Description, Add Variant). Used grades
// first, as buyers see them; New / Refurbished for parts and accessories.
export const CONDITION_CHOICES = [
  { value: 'USED:LIKE_NEW', label: 'Excellent', itemCondition: 'USED', conditionGrade: 'LIKE_NEW' },
  { value: 'USED:GOOD', label: 'Good', itemCondition: 'USED', conditionGrade: 'GOOD' },
  { value: 'USED:FAIR', label: 'Fair', itemCondition: 'USED', conditionGrade: 'FAIR' },
  { value: 'NEW', label: 'New', itemCondition: 'NEW', conditionGrade: 'GOOD' },
  { value: 'REFURBISHED', label: 'Refurbished', itemCondition: 'REFURBISHED', conditionGrade: 'GOOD' },
];
export const conditionKey = (itemCondition, grade) => (itemCondition === 'USED' ? `USED:${grade || 'GOOD'}` : itemCondition || null);
export const conditionChip = (row) => CONDITION_CHOICES.find((c) => c.value === conditionKey(row.itemCondition, row.conditionGrade))?.label || null;

/** The condition every editable row shares, or null when they differ. */
export function sharedConditionKey(draft) {
  const rows = draft.rows.filter((r) => !r.result?.productId);
  const keys = [...new Set(rows.map((r) => conditionKey(r.itemCondition, r.conditionGrade)))];
  if (keys.length === 1) return keys[0];
  return rows.length ? null : conditionKey(draft.template.itemCondition, draft.template.conditionGrade);
}

export const WARRANTY_OPTIONS = [0, 1, 3, 6, 12].map((m) => ({ id: String(m), label: m ? `${m} Month${m > 1 ? 's' : ''}` : 'No Warranty' }));
export const warrantyLabel = (m) => WARRANTY_OPTIONS.find((o) => o.id === String(m || 0))?.label || 'No Warranty';
export const ACCESSORY_INCLUDED = ['Charger', 'Box', 'Cable', 'Bill'];
export const DESCRIPTION_MAX = 250;
export const DESCRIPTION_MIN = 10;

/** Batch details as they're appended to each listing's description. */
function detailsLines(details) {
  const d = details || {};
  const lines = [];
  if (d.warrantyMonths > 0) lines.push(`Warranty: ${warrantyLabel(d.warrantyMonths)} (shop)`);
  if ((d.accessories || []).length) lines.push(`Accessories included: ${d.accessories.join(', ')}`);
  return lines;
}

let seq = 0;
export function newKey(prefix = 'k') {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function emptyBulkDraft(batchType = null) {
  return {
    version: 1,
    batchType,                 // BATCH.* or null before a type is picked
    batchId: newClientRef(),   // one per batch; sent with every item
    createdAt: Date.now(),
    template: {
      categoryId: null, categoryCode: null, categoryName: null,
      brandId: null, brandName: null,
      seriesId: null, seriesName: null,
      hasSeries: null,         // false when the brand has no series in this category
      modelId: null, modelName: null, modelImageUrl: null,
      itemCondition: batchType === BATCH.ACCESSORIES ? 'NEW' : 'USED',
      conditionGrade: 'GOOD',
      partType: null,
      accessoryType: null,
    },
    rows: [],                  // see newRow()
    media: {
      common: [],              // photos for every item: [{ key, uri, url, status, error, asset }]
      commonCoverKey: null,
      video: null,             // { key, uri, url, status, error, duration, asset }
    },
    details: {                 // Condition & Description (applies to every item)
      warrantyMonths: 0,       // 0 = no warranty; shop warranty otherwise
      accessories: [],         // included with each item
      description: '',
    },
    pricing: {
      priceMode: 'VARIANT',    // SAME (one price for all) | VARIANT
      negotiable: false,
      discountType: 'NONE',    // NONE | FLAT | PERCENT
      discountValue: '',
      fulfilment: ['PICKUP'],  // PICKUP | SHIPPING (at least one)
      publishMode: 'PUBLISH',  // PUBLISH | DRAFT
    },
    lastSubmit: null,          // { at, legacy }
  };
}

export const bulkDraftStore = createDraftStore('ggfix.sell.bulk.v1', emptyBulkDraft);
export const useBulkDraft = bulkDraftStore.useDraft;

/** Listing type new rows get by default. */
export function defaultListingType(batchType) {
  return BATCH_META[batchType]?.listingType || LISTING.DEVICE;
}

/** A fresh row prefilled from the template. clientRef is fixed for life. */
export function newRow(draft, overrides = {}) {
  const t = draft.template || {};
  return {
    key: newKey('r'),
    clientRef: newClientRef(),
    listingType: defaultListingType(draft.batchType),
    brandId: t.brandId, brandName: t.brandName,
    seriesId: t.seriesId, seriesName: t.seriesName,
    modelId: t.modelId, modelName: t.modelName, modelImageUrl: t.modelImageUrl,
    title: '',
    partType: t.partType, partQuality: null,
    accessoryType: t.accessoryType,
    variant: '',
    color: null,
    ramOptionId: null, ramLabel: null,
    storageOptionId: null, storageLabel: null,
    itemCondition: t.itemCondition || 'USED',
    conditionGrade: t.conditionGrade || 'GOOD',
    quantity: 1,
    imei: '',
    price: '',
    photos: [],
    coverKey: null,
    source: 'MANUAL',
    csvLine: null,
    notes: [],                 // non-blocking import notes, cleared when the row is edited
    result: null,              // { productId, outcome, status, errors, warnings, at }
    ...overrides,
  };
}

// ── Row text ────────────────────────────────────────────────────────────────

export function memoryLabel(row) {
  if (row.ramLabel && row.storageLabel) return `${row.ramLabel} / ${row.storageLabel}`;
  return row.storageLabel || row.ramLabel || null;
}

export function rowTitle(row) {
  const custom = String(row.title || '').trim();
  if (row.listingType === LISTING.SPARE_PART) {
    return custom || [row.partType, row.modelName].filter(Boolean).join(' – ') || 'Spare part';
  }
  if (row.listingType === LISTING.ACCESSORY) {
    return custom || [row.brandName, row.accessoryType].filter(Boolean).join(' ') || 'Accessory';
  }
  if (custom) return custom;
  const spec = [memoryLabel(row), row.color].filter(Boolean).join(', ');
  return `${row.modelName || 'Device'}${spec ? ` (${spec})` : ''}`;
}

/** "128GB | Blue | Used (Good)" */
export function rowSpecLine(row) {
  const cond = conditionLabel(row.itemCondition, row.conditionGrade);
  if (row.listingType === LISTING.SPARE_PART) {
    return [qualityLabel(row.partQuality), row.color, cond].filter(Boolean).join(' | ');
  }
  if (row.listingType === LISTING.ACCESSORY) {
    return [row.variant, row.accessoryType, row.color, cond].filter(Boolean).join(' | ');
  }
  return [memoryLabel(row), row.color, cond].filter(Boolean).join(' | ');
}

export function rowDescription(row) {
  const lines = [];
  const cond = conditionLabel(row.itemCondition, row.conditionGrade);
  if (cond) lines.push(`Condition: ${cond}`);
  if (row.listingType === LISTING.DEVICE) {
    if (row.brandName && row.modelName) {
      // Master model names often already start with the brand ("Apple iPhone 13").
      const named = row.modelName.toLowerCase().startsWith(row.brandName.toLowerCase());
      lines.push(`Model: ${named ? row.modelName : `${row.brandName} ${row.modelName}`}`);
    }
    if (row.ramLabel) lines.push(`RAM: ${row.ramLabel}`);
    if (row.storageLabel) lines.push(`Storage: ${row.storageLabel}`);
  } else if (row.listingType === LISTING.SPARE_PART) {
    if (row.partType) lines.push(`Part type: ${row.partType}`);
    if (row.partQuality) lines.push(`Quality: ${qualityLabel(row.partQuality)}`);
    if (row.modelName) lines.push(`Compatible with: ${[row.brandName, row.modelName].filter(Boolean).join(' ')}`);
  } else {
    if (row.accessoryType) lines.push(`Type: ${row.accessoryType}`);
    if (row.variant) lines.push(`Specification: ${row.variant}`);
    if (row.brandName) lines.push(`Brand: ${row.brandName}`);
  }
  if (row.color) lines.push(`Colour: ${row.color}`);
  if (Number(row.quantity) > 1) lines.push(`Available quantity: ${row.quantity}`);
  return lines.join('\n');
}

// ── Photos ──────────────────────────────────────────────────────────────────

export function minPhotosFor(listingType) {
  return listingType === LISTING.DEVICE ? MIN_DEVICE_PHOTOS : 1;
}

const doneOf = (list) => (list || []).filter((p) => p.status === 'done' && p.url);

/** Room left for item photos once the common gallery is counted. */
export function itemPhotoRoom(draft, row) {
  return Math.max(0, MAX_PHOTOS - (draft.media.common || []).length - (row.photos || []).length);
}
/** Room left in the common gallery so no item ever goes past 10 photos. */
export function commonPhotoRoom(draft) {
  const maxItem = Math.max(0, ...draft.rows.map((r) => (r.photos || []).length));
  return Math.max(0, MAX_PHOTOS - (draft.media.common || []).length - maxItem);
}

/** Uploaded URLs for one item: cover first, then common, then item photos; max 10. */
export function rowPhotoUrls(draft, row) {
  const common = doneOf(draft.media.common);
  const own = doneOf(row.photos);
  const all = [...common, ...own];
  const cover = own.find((p) => p.key === row.coverKey)
    || own[0]
    || common.find((p) => p.key === draft.media.commonCoverKey)
    || common[0];
  if (!cover) return [];
  return [cover, ...all.filter((p) => p !== cover)].slice(0, MAX_PHOTOS).map((p) => p.url);
}

/** Key of the photo that will be this item's cover (for the badge). */
export function rowCoverKey(draft, row) {
  const own = doneOf(row.photos);
  const common = doneOf(draft.media.common);
  return (own.find((p) => p.key === row.coverKey) || own[0]
    || common.find((p) => p.key === draft.media.commonCoverKey) || common[0])?.key || null;
}

export function commonCoverKey(draft) {
  const common = doneOf(draft.media.common);
  return (common.find((p) => p.key === draft.media.commonCoverKey) || common[0])?.key || null;
}

export function uploadState(draft) {
  const all = [...(draft.media.common || []), ...draft.rows.flatMap((r) => r.photos || [])];
  if (draft.media.video) all.push(draft.media.video);
  return {
    uploading: all.filter((p) => p.status === 'uploading').length,
    failed: all.filter((p) => p.status === 'error').length,
  };
}

// ── Pricing ─────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;

export function discountError(pricing) {
  if (pricing.discountType === 'NONE') return null;
  const v = Number(pricing.discountValue);
  if (!pricing.discountValue || !(v > 0)) return 'Enter the discount amount';
  if (pricing.discountType === 'PERCENT' && v >= 100) return 'Percentage must be below 100';
  return null;
}

/** Selling price after the bulk rule, never below ₹1. null when unpriced. */
export function finalPrice(row, pricing) {
  const base = Number(row.price);
  if (!(base > 0)) return null;
  const v = Number(pricing.discountValue);
  if (pricing.discountType === 'NONE' || !(v > 0) || discountError(pricing)) return round2(base);
  const next = pricing.discountType === 'FLAT' ? base - v : base * (1 - v / 100);
  return Math.max(1, round2(next));
}

export function priceError(row) {
  const v = Number(row.price);
  if (row.price === '' || row.price == null || !(v > 0)) return 'Enter a selling price';
  if (v > MAX_PRICE) return 'Price looks too high';
  return null;
}

// ── Validation ──────────────────────────────────────────────────────────────

const IMEI_RE = /^\d{15}$/;

/** Field errors for one row (blocking). `others` = the batch's other rows. */
export function validateRow(row, others = []) {
  const e = {};
  const qty = Number(row.quantity);
  if (row.listingType === LISTING.DEVICE) {
    if (!String(row.modelName || '').trim()) e.model = 'Select the model';
  } else if (String(row.title || '').trim().length < 3) {
    e.title = row.listingType === LISTING.SPARE_PART ? 'Enter the part name' : 'Enter the accessory name';
  }
  if (!row.itemCondition) e.condition = 'Select the condition';
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) e.quantity = `Quantity must be 1–${MAX_QTY}`;
  const imei = String(row.imei || '').trim();
  if (row.listingType === LISTING.DEVICE && imei) {
    if (!IMEI_RE.test(imei)) e.imei = 'IMEI must be 15 digits';
    else if (others.some((o) => o.key !== row.key && o.listingType === LISTING.DEVICE && String(o.imei || '').trim() === imei)) {
      e.imei = 'This IMEI is already used by another item in this batch';
    } else if (qty !== 1) e.quantity = 'A device with an IMEI is one unit — set quantity to 1';
  }
  return e;
}

/** { [rowKey]: string[] } of blocking item errors (pricing excluded). */
export function validateRows(draft) {
  const out = {};
  draft.rows.forEach((r) => {
    if (r.result?.productId) return;
    const msgs = Object.values(validateRow(r, draft.rows));
    if (msgs.length) out[r.key] = msgs;
  });
  return out;
}

export const pendingRows = (draft) => draft.rows.filter((r) => !r.result?.productId);

/** Will this row go live if published now? */
export function meetsPhotoRule(draft, row) {
  return rowPhotoUrls(draft, row).length >= minPhotosFor(row.listingType);
}

export function draftReason(draft, row) {
  const reasons = [];
  const have = rowPhotoUrls(draft, row).length;
  const need = minPhotosFor(row.listingType);
  if (have < need) reasons.push(`Needs ${need - have} more photo${need - have > 1 ? 's' : ''}`);
  if (draft.pricing.publishMode === 'DRAFT') reasons.push('Saved as draft');
  return reasons.join(' · ');
}

// ── Submit mapping ──────────────────────────────────────────────────────────

/** Fields for one bulkCreateListings item. */
export function toBulkItem(row, draft) {
  const t = draft.template;
  const pr = draft.pricing;
  const images = rowPhotoUrls(draft, row);
  const live = pr.publishMode === 'PUBLISH' && images.length >= minPhotosFor(row.listingType);
  const isDevice = row.listingType === LISTING.DEVICE;
  const rowIndex = draft.rows.findIndex((r) => r.key === row.key) + 1;
  return {
    clientRef: row.clientRef,
    listingType: row.listingType,
    itemCondition: row.itemCondition,
    title: rowTitle(row),
    description: [String(draft.details?.description || '').trim(), rowDescription(row), ...detailsLines(draft.details)].filter(Boolean).join('\n'),
    price: finalPrice(row, pr),
    negotiable: !!pr.negotiable,
    quantity: Number(row.quantity) || 1,
    fulfilmentOptions: pr.fulfilment,
    status: live ? 'ACTIVE' : 'DRAFT',
    brandId: row.brandId || null,
    modelId: row.modelId || null,
    ramOptionId: row.ramOptionId || null,
    storageOptionId: row.storageOptionId || null,
    color: row.color || null,
    ramLabel: row.ramLabel || null,
    storageLabel: row.storageLabel || null,
    imei: isDevice && String(row.imei || '').trim() ? String(row.imei).trim() : null,
    conditionLabel: conditionLabel(row.itemCondition, row.conditionGrade),
    descriptionType: row.listingType === LISTING.SPARE_PART ? 'SPARE_PARTS' : 'SHORT',
    images,
    videoUrl: draft.media.video?.status === 'done' ? draft.media.video.url : null,
    assessment: {
      bulk: { batchType: draft.batchType, rowIndex },
      // Same keys as a single listing (sell/draft.js toListingFields).
      accessories: draft.details?.accessories || [],
      warranty: draft.details?.warrantyMonths > 0 ? 'SHOP' : 'NONE',
      warrantyMonths: draft.details?.warrantyMonths || 0,
      listing: {
        category: { id: t.categoryId, code: t.categoryCode, name: t.categoryName },
        brandName: row.brandName || null,
        seriesId: row.seriesId || null,
        seriesName: row.seriesName || null,
        modelName: row.modelName || null,
        partName: row.listingType === LISTING.SPARE_PART ? rowTitle(row) : null,
        partType: row.partType || null,
        partQuality: row.partQuality || null,
        compatibleModels: row.listingType === LISTING.SPARE_PART ? row.modelName || null : null,
        accessoryType: row.accessoryType || null,
        accessoryName: row.listingType === LISTING.ACCESSORY ? rowTitle(row) : null,
        variant: row.variant || null,
      },
    },
  };
}

/** Bulk result entry → what a row keeps. */
export function toRowResult(r) {
  return {
    productId: r?.outcome === 'FAILED' ? null : r?.productId || null,
    outcome: r?.outcome || 'FAILED',
    status: r?.status ? String(r.status).toUpperCase() : null,
    errors: Array.isArray(r?.errors) ? r.errors.filter(Boolean).map(String) : [],
    warnings: Array.isArray(r?.warnings) ? r.warnings.filter(Boolean).map(String) : [],
    at: Date.now(),
  };
}

/** Apply a bulk response to the rows that were sent (matched by clientRef, then index). */
export function applyBulkResponse(rows, sent, res) {
  const results = Array.isArray(res?.results) ? res.results : [];
  const byRef = new Map(results.filter((r) => r?.clientRef).map((r) => [r.clientRef, r]));
  const sentIndex = new Map(sent.map((row, i) => [row.key, i]));
  return rows.map((row) => {
    if (!sentIndex.has(row.key)) return row;
    const i = sentIndex.get(row.key);
    const hit = byRef.get(row.clientRef) || results.find((r) => r?.index === i);
    return {
      ...row,
      result: hit ? toRowResult(hit) : toRowResult({ outcome: 'FAILED', errors: ['No result came back for this item. Retry to check it.'] }),
    };
  });
}

export function resultCounts(draft) {
  const c = { published: 0, drafts: 0, failed: 0, processed: 0 };
  draft.rows.forEach((r) => {
    if (!r.result) return;
    c.processed += 1;
    if (r.result.outcome === 'FAILED' || !r.result.productId) c.failed += 1;
    else if (r.result.status === 'ACTIVE') c.published += 1;
    else c.drafts += 1;
  });
  return c;
}

/** Unfinished work worth asking about before starting a new batch. */
export function hasProgress(draft) {
  if (!draft?.batchType) return false;
  if (draft.rows.length) return draft.rows.some((r) => !r.result?.productId);
  const t = draft.template;
  return !!(t.categoryId || t.brandId || t.modelId || draft.media.common.length);
}

/** Where to pick a saved batch back up. */
export function resumeRoute(draft) {
  if (draft.rows.length && draft.rows.every((r) => r.result)) return 'BulkStatus';
  if (draft.rows.length) return 'BulkItems';
  return 'BulkTemplate';
}
