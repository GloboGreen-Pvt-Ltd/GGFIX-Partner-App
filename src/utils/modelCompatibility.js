/**
 * Model compatibility — which devices take the same spare part.
 *
 * A repair shop decides this from the MANUFACTURER MODEL NUMBER printed on the
 * part and on the device's label (Samsung SM-A127F, Apple A2221, Infinix X6851,
 * Xiaomi 22011119UY…), not from the marketing name. Two catalogue entries that
 * carry the same code are the same hardware sold under different names, so a
 * display / battery / housing bought for one fits the other.
 *
 * `master_models.model_number` is a jsonb array of exactly those codes and is
 * already maintained in the admin Models screen, so the relation is derivable
 * from data we have — there is no separate compatibility table, and this module
 * deliberately does not invent one.
 *
 * Two strengths of match are produced, and the UI must keep them apart:
 *
 *   EXACT   — the two models share at least one model number. Interchangeable;
 *             the shared code is shown so the shop can verify against the part.
 *   SERIES  — same series, different model numbers. A hint only ("check before
 *             ordering"), NOT a guarantee: an iPhone 14 and 14 Pro sit in one
 *             series and share almost no parts.
 *
 * Everything here is pure and operates on the `GET /master/models` projection
 * (`getAllModels`), so it can be reasoned about without the network.
 */

import { parseModelNumbers } from '../api/masterData';

/** Codes are compared case-insensitively; the display keeps the stored casing. */
export function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * Model names are admin-entered and a number of them carry stray whitespace —
 * several Honor rows are literally "Honor\t200 Pro". Left alone that renders as
 * a gap in the row AND makes the name unsearchable ("honor 200" never matches),
 * so collapse every whitespace run to a single space for display and search.
 */
export function displayName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A model's part numbers, de-duplicated and upper-cased. `parseModelNumbers`
 * already handles the three shapes the column arrives in (jsonb array, legacy
 * slash/comma string, JSON text); this adds the case-insensitive de-dupe those
 * shapes can leave behind (e.g. "sm-a127f" and "SM-A127F" in one row).
 */
export function modelCodes(model) {
  const seen = new Set();
  const out = [];
  for (const raw of parseModelNumbers(model?.modelNumber)) {
    const code = normalizeCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Build the lookup structures once per catalogue load. O(models × codes), which
 * on the live catalogue is ~1400 models / ~1600 codes — a few milliseconds, and
 * far cheaper than re-scanning the list for every keystroke.
 *
 * `brands` / `categories` are optional; when supplied, each model is decorated
 * with resolved `brandName` / `categoryName` so rows can render without the
 * screen threading two more maps through every component.
 */
export function buildCompatIndex(models, { brands = [], categories = [] } = {}) {
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const byCode = new Map();     // CODE -> [entry]
  const bySeries = new Map();   // seriesId -> [entry]
  const byId = new Map();       // id -> entry
  const entries = [];

  for (const model of Array.isArray(models) ? models : []) {
    if (!model?.id) continue;
    const codes = modelCodes(model);
    const label = displayName(model.name);
    const entry = {
      ...model,
      codes,
      // `name` is overwritten with the cleaned label rather than shadowed: every
      // consumer wants the readable form, and keeping the raw one around only
      // invites rendering it by mistake.
      name: label,
      brandName: displayName(brandName.get(model.brandId)),
      categoryName: displayName(categoryName.get(model.categoryId)),
      // Pre-lowered once, because search compares against it on every keystroke.
      searchName: label.toLowerCase(),
    };
    entries.push(entry);
    byId.set(entry.id, entry);
    for (const code of codes) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(entry);
    }
    if (model.seriesId) {
      if (!bySeries.has(model.seriesId)) bySeries.set(model.seriesId, []);
      bySeries.get(model.seriesId).push(entry);
    }
  }

  return { entries, byId, byCode, bySeries };
}

/**
 * Models that share a part number with `model`, strongest match first (a match
 * on two codes is more certain than a match on one). Each result carries the
 * `sharedCodes` that produced it so the UI can show WHY they're compatible.
 */
export function findInterchangeable(index, model) {
  if (!index || !model) return [];
  const self = index.byId.get(model.id) || model;
  const hits = new Map(); // id -> { model, sharedCodes }

  for (const code of self.codes || []) {
    for (const other of index.byCode.get(code) || []) {
      if (other.id === self.id) continue;
      let hit = hits.get(other.id);
      if (!hit) {
        hit = { model: other, sharedCodes: [] };
        hits.set(other.id, hit);
      }
      hit.sharedCodes.push(code);
    }
  }

  return [...hits.values()].sort(
    (a, b) =>
      b.sharedCodes.length - a.sharedCodes.length ||
      a.model.name.localeCompare(b.model.name),
  );
}

/**
 * Other models in the same series, excluding anything already reported as an
 * exact match (an exact match is strictly better information — showing it twice
 * would imply two separate reasons to believe it).
 */
export function findSeriesSiblings(index, model, excludeIds = new Set()) {
  if (!index || !model?.seriesId) return [];
  return (index.bySeries.get(model.seriesId) || [])
    .filter((m) => m.id !== model.id && !excludeIds.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every model carrying a given part number — the "I have the part, what does it fit?" direction. */
export function findByCode(index, code) {
  if (!index) return [];
  return [...(index.byCode.get(normalizeCode(code)) || [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Search by marketing name OR part number, because the shop has one or the
 * other in front of it — the box says "Galaxy A12", the part says "SM-A127F".
 *
 * Results are ranked so the least ambiguous interpretation wins: an exact code
 * hit is what someone typing "SM-A127F" means, and it must not be buried under
 * models whose NAME happens to contain the string.
 */
const RANK_CODE_EXACT = 0;
const RANK_CODE_PREFIX = 1;
const RANK_NAME_PREFIX = 2;
const RANK_CODE_PART = 3;
const RANK_NAME_PART = 4;

// Deliberately uncapped. A "top 80" slice would make the screen's own match
// count a lie, and the count is what tells the shop whether its query was
// specific enough. FlatList virtualises the rows, so a broad query costs
// layout, not memory.
export function searchModels(index, query, { categoryId = null } = {}) {
  if (!index) return [];
  const raw = String(query ?? '').trim();
  if (raw.length < 2) return [];
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const scored = [];
  for (const entry of index.entries) {
    if (categoryId && entry.categoryId !== categoryId) continue;

    let rank = null;
    for (const code of entry.codes) {
      if (code === upper) { rank = RANK_CODE_EXACT; break; }
      if (code.startsWith(upper)) { rank = Math.min(rank ?? RANK_CODE_PREFIX, RANK_CODE_PREFIX); }
      else if (code.includes(upper)) { rank = Math.min(rank ?? RANK_CODE_PART, RANK_CODE_PART); }
    }
    if (rank !== RANK_CODE_EXACT) {
      if (entry.searchName.startsWith(lower)) rank = Math.min(rank ?? RANK_NAME_PREFIX, RANK_NAME_PREFIX);
      else if (entry.searchName.includes(lower)) rank = Math.min(rank ?? RANK_NAME_PART, RANK_NAME_PART);
    }
    if (rank === null) continue;
    scored.push({ entry, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
  return scored.map((s) => s.entry);
}

/**
 * Models that have at least one exact cross-fit, so the screen has something
 * genuinely useful to show before anything is typed — these are precisely the
 * devices where compatibility is non-obvious and worth looking up.
 */
export function modelsWithCrossFit(index, { categoryId = null } = {}) {
  if (!index) return [];
  const out = [];
  for (const entry of index.entries) {
    if (categoryId && entry.categoryId !== categoryId) continue;
    const shares = entry.codes.some((c) => (index.byCode.get(c) || []).length > 1);
    if (shares) out.push(entry);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
