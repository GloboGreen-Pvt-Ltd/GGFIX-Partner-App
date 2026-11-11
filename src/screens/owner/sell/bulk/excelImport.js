import { BATCH, MAX_QTY, MAX_ROWS, newRow } from './bulkDraft';
import { loadBrands, loadCategories, loadModelOptions, loadModels } from './catalog';
import { matchKey, normalizeMemory, parseCondition, parseGb, parsePrice, parseQuantity } from './csv';

// Bulk Listing (Excel) → draft rows. Each line is matched to the catalogue
// (category → brand → model, then storage / colour); lines that can't be
// listed come back as errors with the reason, never as guesses.

const ALIASES = {
  category: ['category', 'devicecategory'],
  brand: ['brand', 'make'],
  model: ['model', 'modelname', 'device'],
  storage: ['storage', 'rom', 'variant', 'internalstorage', 'capacity'],
  ram: ['ram', 'memory'],
  color: ['color', 'colour'],
  condition: ['condition', 'grade', 'itemcondition'],
  imei: ['imeiserial', 'imei', 'serial', 'imeinumber', 'serialnumber', 'imeis'],
  price: ['price', 'sellingprice', 'priceinr', 'amount', 'rate'],
  quantity: ['quantity', 'qty', 'stock', 'units'],
  warranty: ['warrantymonths', 'warranty'],
  buyer: ['buyercategory', 'buyer', 'buyertype'],
  fulfilment: ['fulfillmentoption', 'fulfilmentoption', 'fulfillment', 'fulfilment', 'delivery'],
};
const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const IMEI = /^\d{15}$/;
const SERIAL = /^[0-9A-Z]{6,20}$/;

function headerMap(cells) {
  const map = {};
  cells.forEach((h, i) => {
    const k = norm(h);
    const field = Object.keys(ALIASES).find((f) => ALIASES[f].includes(k));
    if (field && map[field] == null) map[field] = i;
  });
  return map;
}

/** First non-empty Buyer Category / Fulfillment cells → defaults for Publishing Options. */
function publishDefaults(lines) {
  const buyerRaw = lines.map((l) => l.buyer).find(Boolean) || '';
  const fulRaw = lines.map((l) => l.fulfilment).find(Boolean) || '';
  const buyerType = /shop/i.test(buyerRaw) ? 'SHOP' : /customer/i.test(buyerRaw) ? 'CUSTOMER' : null;
  let option = null;
  if (/home|deliver/i.test(fulRaw)) option = 'HOME';
  else if (/visit/i.test(fulRaw)) option = buyerType === 'SHOP' ? 'SHOP' : 'VISIT';
  else if (/courier|ship/i.test(fulRaw)) option = 'COURIER';
  else if (/shop/i.test(fulRaw)) option = 'SHOP';
  const radius = option === 'HOME' ? (fulRaw.match(/(\d{1,3})/) || [])[1] || '' : '';
  return { buyerType, option, radius };
}

/**
 * rows: sheet rows (first = headers). Returns
 * { total, rows: draftRows, errors: [{ line, details, qty, price, reason }], template, defaults, sheetError }.
 */
export async function importSheet(sheetRows, draft) {
  const same = draft.batchType === BATCH.SAME_MODEL;
  const out = { total: 0, rows: [], errors: [], template: null, defaults: {}, sheetError: null };
  const nonBlank = (sheetRows || []).map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => String(c).trim()));
  if (!nonBlank.length) { out.sheetError = 'The file is empty.'; return out; }
  const [head, ...body] = nonBlank;
  const map = headerMap(head.cells);
  if (map.model == null || map.brand == null) { out.sheetError = 'The first row must be the template headers (Category, Brand, Model, …). Download the template and use it.'; return out; }
  const cell = (cells, f) => (map[f] == null ? '' : String(cells[map[f]] ?? '').trim());
  const lines = body
    .map(({ cells, line }) => ({ line, ...Object.fromEntries(Object.keys(ALIASES).map((f) => [f, cell(cells, f)])) }))
    .filter((l) => !/^example\b/i.test(l.category) && !/^example\b/i.test(l.brand));
  out.total = lines.length;
  if (!lines.length) { out.sheetError = 'No product rows found (example rows are skipped).'; return out; }
  out.defaults = publishDefaults(lines);

  const cats = await loadCategories().catch(() => []);
  const seenImei = new Map();
  let fixed = null; // Same Model: the model of the first valid row

  for (const l of lines) {
    const details = [l.model, l.storage, l.color].filter(Boolean).join(' · ') || `Line ${l.line}`;
    const priceP = parsePrice(l.price);
    const qtyP = parseQuantity(l.quantity || '1');
    const fail = (reason) => out.errors.push({ line: l.line, details, qty: qtyP.value ?? l.quantity, price: priceP.value ?? l.price, reason });
    if (out.rows.length >= MAX_ROWS) { fail(`Only ${MAX_ROWS} rows per bulk`); continue; }
    if (!l.brand || !l.model) { fail('Brand and Model are required'); continue; }

    const cat = l.category ? cats.find((c) => matchKey(c.name) === matchKey(l.category) || matchKey(c.code) === matchKey(l.category)) : null;
    if (l.category && !cat) { fail(`Category "${l.category}" not found`); continue; }
    // eslint-disable-next-line no-await-in-loop
    const brands = await loadBrands(cat?.id || null).catch(() => []);
    const brand = brands.find((b) => matchKey(b.name) === matchKey(l.brand));
    if (!brand) { fail(`Brand "${l.brand}" not found${cat ? ` in ${cat.name}` : ''}`); continue; }
    // eslint-disable-next-line no-await-in-loop
    const models = await loadModels({ categoryId: cat?.id || null, brandId: brand.id }).catch(() => []);
    const model = models.find((m) => matchKey(m.name) === matchKey(l.model) || matchKey(`${brand.name} ${m.name}`) === matchKey(l.model));
    if (!model) { fail(`Model "${l.model}" not found under ${brand.name}`); continue; }
    if (same && fixed && fixed.model.id !== model.id) { fail(`Different model — this bulk is for ${fixed.model.name}`); continue; }

    const cond = parseCondition(l.condition || '');
    if (!cond || cond.error) { fail(cond?.error || 'Condition is required'); continue; }
    if (priceP.error || !(Number(priceP.value) > 0)) { fail(priceP.error || 'Invalid price'); continue; }
    if (qtyP.error || !(qtyP.value >= 1 && qtyP.value <= MAX_QTY)) { fail(qtyP.error || `Quantity must be 1–${MAX_QTY}`); continue; }
    // Excel may keep a 15-digit IMEI as a number in scientific notation (exact below 2^53).
    const imeiCell = /^\d(\.\d+)?E\+\d+$/i.test(l.imei) ? String(Math.round(Number(l.imei))) : l.imei;
    const imeis = String(imeiCell || '').toUpperCase().split(/[;|/\s,]+/).map((s) => s.replace(/[^0-9A-Z]/g, '')).filter(Boolean);
    const badImei = imeis.find((v) => !(IMEI.test(v) || (SERIAL.test(v) && !/^\d+$/.test(v))));
    if (badImei) { fail(`Invalid IMEI/Serial "${badImei}"`); continue; }
    if (imeis.length > qtyP.value) { fail(`${imeis.length} IMEIs for quantity ${qtyP.value}`); continue; }
    const dup = imeis.find((v) => seenImei.has(v));
    if (dup) { fail(`IMEI ${dup} repeats line ${seenImei.get(dup)}`); continue; }
    const warranty = l.warranty === '' ? 0 : Number(String(l.warranty).replace(/[^0-9]/g, ''));
    if (!(warranty >= 0 && warranty <= 24)) { fail('Warranty must be 0–24 months'); continue; }

    // eslint-disable-next-line no-await-in-loop
    const opts = await loadModelOptions(model.id).catch(() => ({}));
    const gb = parseGb(normalizeMemory(l.storage));
    const spec = (opts.specs || []).find((s) => parseGb(s.storageLabel) === gb && (!l.ram || parseGb(s.ramLabel) === parseGb(normalizeMemory(l.ram))));
    const stor = spec ? null : (opts.allStorages || []).find((s) => (s.valueGb != null ? Number(s.valueGb) : parseGb(s.label)) === gb);
    const colors = (opts.colors || []).length ? opts.colors : opts.allColors || [];
    const color = l.color ? (colors.find((c) => matchKey(c.name) === matchKey(l.color))?.name || l.color) : null;

    imeis.forEach((v) => seenImei.set(v, l.line));
    if (!fixed) fixed = { cat, brand, model };
    out.rows.push(newRow(draft, {
      brandId: brand.id, brandName: brand.name, seriesId: model.seriesId || null, seriesName: null,
      modelId: model.id, modelName: model.name, modelImageUrl: model.imageUrl || null,
      ramOptionId: spec && !spec.storageOnly ? spec.ramOptionId : null, ramLabel: spec && !spec.storageOnly ? spec.ramLabel : null,
      storageOptionId: spec?.storageOptionId || stor?.id || null, storageLabel: spec?.storageLabel || stor?.label || normalizeMemory(l.storage) || null,
      color,
      itemCondition: cond.itemCondition, conditionGrade: cond.conditionGrade || 'GOOD',
      quantity: qtyP.value, price: String(priceP.value),
      imeis, imei: imeis.length === 1 && qtyP.value === 1 && IMEI.test(imeis[0]) ? imeis[0] : '',
      warrantyMonths: warranty,
      source: 'CSV', csvLine: l.line,
    }));
  }
  if (fixed) {
    out.template = {
      categoryId: fixed.cat?.id || null, categoryName: fixed.cat?.name || null, categoryCode: fixed.cat?.code || null,
      brandId: fixed.brand.id, brandName: fixed.brand.name, modelId: same ? fixed.model.id : null, modelName: same ? fixed.model.name : null,
      modelImageUrl: same ? fixed.model.imageUrl || null : null,
    };
  }
  return out;
}
