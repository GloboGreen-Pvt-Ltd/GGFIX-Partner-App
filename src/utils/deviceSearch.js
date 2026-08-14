import { getAllModels, getBrands, getDeviceCategories, parseModelNumbers } from '../api/masterData';
import { resolveDeviceImageSource } from './images';

/**
 * Device/model search — the single normalisation + ranking used by every search
 * surface, so text, voice and image all resolve to the SAME model object.
 *
 * NORMALISATION strips everything that is not a letter or a digit and
 * lower-cases the rest, which is what makes these all the same query:
 *
 *   "OPPO A5"   "oppo a5"   "oppo-a5"   "Oppo  A5"   "oppo_a5"
 *
 * MATCHING is per token, not on the whole string. Each token must appear in the
 * model's haystack (brand + model + category + model numbers). That is what
 * lets "Oppo A5 mobile" match — "mobile" hits the CATEGORY name, not the model
 * name, and a whole-string comparison would have found nothing.
 *
 * The catalogue rows carry `brandId` / `categoryId` but no names, so brands and
 * categories are joined in here once and cached with the models.
 */

export const normalize = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Brand + model as one label, without doubling the brand.
 *
 * The catalogue is inconsistent: some rows are ("Apple", "iPhone 11") and
 * others are ("Apple", "Apple iPhone 11"). Joining unconditionally produced
 * "Apple Apple iPhone 11" for the second kind.
 */
export function displayNameFor(brandName, modelName) {
  const b = String(brandName || '').trim();
  const m = String(modelName || '').trim();
  if (!b) return m;
  if (!m) return b;
  return normalize(m).startsWith(normalize(b)) ? m : `${b} ${m}`;
}
export const tokenize = (v) => String(v ?? '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);

let cache = null; // { at, rows }
const TTL_MS = 5 * 60 * 1000;

/**
 * The catalogue, enriched with brand and category names and a prebuilt
 * haystack. `getAllModels` has its own cache; this one exists so the join and
 * the haystack are not rebuilt on every keystroke.
 */
export async function loadSearchableModels({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [models, brands, categories] = await Promise.all([
    getAllModels({ force }),
    getBrands().catch(() => []),
    getDeviceCategories().catch(() => []),
  ]);

  const brandById = new Map((brands || []).map((b) => [b.id, b]));
  const catById = new Map((categories || []).map((c) => [c.id, c]));

  const rows = (models || []).map((m) => {
    const brand = brandById.get(m.brandId) || null;
    const cat = catById.get(m.categoryId) || null;
    const numbers = parseModelNumbers(m.modelNumber);
    return {
      // ── the structured object every flow receives (see buildDeviceParams) ──
      modelId: m.id,
      modelName: m.name || '',
      // What to SHOW. Many catalogue rows already carry the brand in the model
      // name ("Apple iPhone 11"), so blindly prefixing the brand rendered
      // "Apple Apple iPhone 11". Prefix only when the model does not already
      // start with the brand.
      displayName: displayNameFor(brand?.name, m.name),
      brandId: m.brandId || brand?.id || null,
      brandName: brand?.name || '',
      categoryId: m.categoryId || cat?.id || null,
      categoryName: cat?.name || '',
      categoryCode: cat?.code || undefined,
      seriesId: m.seriesId || undefined,
      modelNumber: numbers[0] || undefined,
      modelNumbers: numbers,
      modelImageUrl: resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 }) || undefined,
      sellActive: m.sellActive !== false,
      // ── search index ──
      _model: normalize(m.name),
      _brand: normalize(brand?.name),
      _haystack: normalize(
        [brand?.name, m.name, cat?.name, ...numbers].filter(Boolean).join(' '),
      ),
    };
  });

  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * Rank order, strongest first. Exact model matches win outright, which is the
 * "OPPO A5 must beat OPPO A5x" requirement — a plain `includes` puts them in
 * catalogue order and buries the exact one.
 */
function score(row, q, tokens) {
  const brandModel = row._brand + row._model;
  if (row._model === q) return 0;                       // exact model
  if (brandModel === q) return 1;                       // exact "oppoa5"
  if (row._model.startsWith(q)) return 2;               // prefix on model
  if (brandModel.startsWith(q)) return 3;
  if (row._model.includes(q)) return 4;
  if (tokens.every((t) => row._haystack.includes(t))) return 5; // all tokens somewhere
  return Infinity;
}

/**
 * @param {Array}  rows   from loadSearchableModels()
 * @param {string} query  raw user text (typed, spoken, or image-detected)
 * @param {number} limit
 */
export function searchModels(rows, query, limit = 25) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = tokenize(query);

  const hits = [];
  for (const row of rows) {
    const s = score(row, q, tokens);
    if (s !== Infinity) hits.push({ row, s });
  }
  hits.sort((a, b) => (a.s - b.s) || a.row.modelName.localeCompare(b.row.modelName));
  return hits.slice(0, limit).map((h) => h.row);
}

/**
 * The complete structured object handed to Book Service / Sell / Buy.
 *
 * Built ONCE from the selected row and passed whole, so no downstream screen
 * re-searches by name and lands on a different record — the requirement that
 * the same device is reused across all three actions. Shape mirrors what
 * SelectModelScreen's own `onPick` builds, so the existing screens receive
 * exactly the params they already expect.
 */
export function buildDeviceParams(row, flow) {
  if (!row?.modelId) return null; // caller must refuse to navigate
  return {
    flow,
    categoryId: row.categoryId,
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    brandId: row.brandId,
    brandName: row.brandName,
    seriesId: row.seriesId,
    modelId: row.modelId,
    modelName: row.modelName,
    modelNumber: row.modelNumber,
    modelNumbers: row.modelNumbers,
    modelImageUrl: row.modelImageUrl,
    imageUrl: row.modelImageUrl,
  };
}
