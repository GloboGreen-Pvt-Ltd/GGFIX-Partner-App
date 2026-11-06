// CSV helpers for bulk listing: a small RFC 4180 parser (quotes, escaped
// quotes, commas inside quotes, CR / LF / CRLF, BOM, ; or tab delimiters from
// European Excel), the sheet → row mapper with per-row validation, and the
// writer used for the sample sheet and the upload report.
// Pure JS — no React Native imports — so it runs under plain node.

export const SHEET_HEADERS = ['title', 'model', 'color', 'ram', 'storage', 'condition', 'quantity', 'price', 'imei', 'listingType'];

const HEADER_ALIASES = {
  title: ['title', 'name', 'itemname', 'listingtitle', 'productname', 'product', 'item'],
  model: ['model', 'modelname', 'device', 'compatiblemodel', 'compatiblewith'],
  color: ['color', 'colour'],
  ram: ['ram', 'memory'],
  storage: ['storage', 'rom', 'internalstorage', 'capacity'],
  condition: ['condition', 'itemcondition', 'grade'],
  quantity: ['quantity', 'qty', 'stock', 'units', 'pcs'],
  price: ['price', 'sellingprice', 'priceinr', 'amount', 'rate', 'mrp'],
  imei: ['imei', 'imei1', 'imeino', 'imeinumber'],
  listingType: ['listingtype', 'type', 'itemtype'],
};

const normHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function detectDelimiter(text) {
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && counts[ch] != null) counts[ch] += 1;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  return ',';
}

/** Text → array of rows (arrays of raw cell strings). */
export function parseCsv(input, delimiter) {
  const text = String(input == null ? '' : input).replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field.trim() === '') { inQuotes = true; field = ''; i += 1; continue; }
    if (ch === d) { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i += 1;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const FORMULA_START = /^[=+@]|^-(?!\d)/;

function escapeCell(v) {
  let s = v == null ? '' : String(v);
  // A cell that starts like a formula is opened as text, not run, by Excel.
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n;\t]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Array of rows → CSV text (CRLF, with a BOM so Excel reads ₹ correctly). */
export function toCsv(rows, { bom = true } = {}) {
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
  return `${bom ? '﻿' : ''}${body}\r\n`;
}

export function sampleCsv() {
  return toCsv([
    SHEET_HEADERS,
    ['EXAMPLE - delete this row', 'iPhone 13', 'Blue', '', '128 GB', 'Used (Good)', '5', '34000', '', 'DEVICE'],
    ['EXAMPLE - delete this row', 'Galaxy S21 FE', 'Graphite', '8 GB', '128 GB', 'Refurbished', '1', '21500', '', 'DEVICE'],
    ['EXAMPLE - Display for iPhone 12', 'iPhone 12', 'Black', '', '', 'New', '6', '5500', '', 'SPARE_PART'],
    ['EXAMPLE - Type-C Cable 1m', '', 'White', '', '', 'New', '3', '249', '', 'ACCESSORY'],
  ]);
}

// ── Cell parsers ────────────────────────────────────────────────────────────

/** "128", "128gb", "128 GB", "1TB" → "128 GB" / "1 TB"; anything else unchanged. */
export function normalizeMemory(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(gb|g|tb|t|mb)?$/i);
  if (!m) return s;
  const unit = (m[2] || 'gb').toLowerCase();
  if (unit.startsWith('t')) return `${m[1]} TB`;
  if (unit === 'mb') return `${m[1]} MB`;
  return `${m[1]} GB`;
}

/** Size in GB from a memory label, or null. */
export function parseGb(label) {
  const m = String(label || '').match(/(\d+(?:\.\d+)?)\s*(tb|gb|mb)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || 'gb').toLowerCase();
  if (unit === 'tb') return n * 1024;
  if (unit === 'mb') return n / 1024;
  return n;
}

/** → { itemCondition, conditionGrade } | { error } | null (blank). */
export function parseCondition(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (/refurb|renewed/.test(s)) return { itemCondition: 'REFURBISHED', conditionGrade: null };
  if (/like\s*new|mint|excellent/.test(s)) return { itemCondition: 'USED', conditionGrade: 'LIKE_NEW' };
  if (/^(brand\s*)?new\b|sealed|unused|box\s*pack/.test(s)) return { itemCondition: 'NEW', conditionGrade: null };
  const grade = /fair|average|ok\b|poor/.test(s) ? 'FAIR' : /good/.test(s) ? 'GOOD' : null;
  if (/used|pre-?owned|second\b|\bold\b/.test(s) || grade) return { itemCondition: 'USED', conditionGrade: grade || 'GOOD' };
  return { error: `Unknown condition "${String(raw).trim()}" — use New, Used, Used (Good), Used (Fair) or Refurbished` };
}

/** → 'DEVICE' | 'SPARE_PART' | 'ACCESSORY' | { error } | null (blank). */
export function parseListingType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (/spare|part/.test(s)) return 'SPARE_PART';
  if (/access/.test(s)) return 'ACCESSORY';
  if (/device|mobile|phone|tablet|laptop|watch/.test(s)) return 'DEVICE';
  return { error: `Unknown listing type "${String(raw).trim()}" — use DEVICE, SPARE_PART or ACCESSORY` };
}

export function parsePrice(raw) {
  const s = String(raw || '').replace(/₹|rs\.?|inr|\/-|,|\s/gi, '');
  if (!s) return { value: '' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `Price "${String(raw).trim()}" is not a number` };
  const n = Number(s);
  if (!(n > 0)) return { error: 'Price must be more than ₹0' };
  if (n > 9999999) return { error: 'Price looks too high' };
  return { value: s };
}

export function parseQuantity(raw) {
  const s = String(raw || '').replace(/\s|pcs?|units?/gi, '');
  if (!s) return { value: 1 };
  if (!/^\d+$/.test(s)) return { error: `Quantity "${String(raw).trim()}" must be a whole number` };
  const n = Number(s);
  if (n < 1 || n > 9999) return { error: 'Quantity must be 1–9999' };
  return { value: n };
}

export function parseImei(raw) {
  const original = String(raw || '').trim();
  if (!original) return { value: '' };
  if (/e\+?\d+$/i.test(original)) return { error: 'IMEI was shortened by Excel — format the IMEI column as Text and export again' };
  const s = original.replace(/[\s-]/g, '');
  if (!/^\d{15}$/.test(s)) return { error: `IMEI "${original}" must be 15 digits` };
  return { value: s };
}

// ── Sheet → rows ────────────────────────────────────────────────────────────

/** { field: columnIndex } from a header row; unknown columns listed separately. */
export function mapHeaders(headerRow) {
  const map = {};
  const unknown = [];
  headerRow.forEach((h, idx) => {
    const n = normHeader(h);
    if (!n) return;
    const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(n));
    if (field && map[field] == null) map[field] = idx;
    else if (!field) unknown.push(String(h).trim());
  });
  return { map, unknown };
}

const looksBinary = (text) => /^PK\u0003\u0004/.test(text) || /\u0000/.test(text.slice(0, 2000));

/**
 * Parse a bulk sheet.
 * Returns { rows, sheetErrors, sheetWarnings, skipped, truncated }.
 * rows: [{ line, listingType, title, model, color, ramLabel, storageLabel,
 *          itemCondition, conditionGrade, quantity, price, imei, errors, warnings }]
 * `line` is the 1-based line in the sheet (header = line 1).
 */
export function parseBulkSheet(text, { defaultListingType = 'DEVICE', maxRows = 100 } = {}) {
  const out = { rows: [], sheetErrors: [], sheetWarnings: [], skipped: [], truncated: 0 };
  const raw = String(text == null ? '' : text);
  if (looksBinary(raw)) {
    out.sheetErrors.push('This looks like an Excel (.xlsx) file. Save it as CSV (File → Save As → CSV) and upload again.');
    return out;
  }
  const all = parseCsv(raw).map((cells, i) => ({ cells, line: i + 1 }));
  const nonBlank = all.filter((r) => r.cells.some((c) => String(c).trim() !== ''));
  if (!nonBlank.length) {
    out.sheetErrors.push('The sheet is empty.');
    return out;
  }
  const [header, ...body] = nonBlank;
  const { map, unknown } = mapHeaders(header.cells);
  if (map.title == null && map.model == null) {
    out.sheetErrors.push(`The first row must be the column headers: ${SHEET_HEADERS.join(', ')}.`);
    return out;
  }
  if (unknown.length) out.sheetWarnings.push(`Ignored column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
  if (!body.length) {
    out.sheetErrors.push('The sheet has headers but no item rows.');
    return out;
  }

  const cell = (cells, field) => (map[field] == null ? '' : String(cells[map[field]] ?? '').trim());
  const seenImei = new Map();

  body.forEach(({ cells, line }) => {
    const title = cell(cells, 'title');
    if (/^example\b/i.test(title)) {
      out.skipped.push({ line, reason: 'Example row skipped' });
      return;
    }
    if (out.rows.length >= maxRows) {
      out.truncated += 1;
      return;
    }
    const errors = [];
    const warnings = [];

    const lt = parseListingType(cell(cells, 'listingType'));
    let listingType = defaultListingType;
    if (lt && typeof lt === 'object') errors.push(lt.error);
    else if (lt) listingType = lt;

    const model = cell(cells, 'model');
    if (listingType === 'DEVICE' && !model) errors.push('Model is required for a device');
    if (listingType !== 'DEVICE' && title.length < 3) {
      errors.push(listingType === 'SPARE_PART' ? 'Title (part name) is required' : 'Title (accessory name) is required');
    }

    const cond = parseCondition(cell(cells, 'condition'));
    let itemCondition = null;
    let conditionGrade = null;
    if (cond?.error) errors.push(cond.error);
    else if (cond) ({ itemCondition, conditionGrade } = cond);
    else warnings.push('Condition missing — the batch condition will be used');

    const qty = parseQuantity(cell(cells, 'quantity'));
    if (qty.error) errors.push(qty.error);

    const price = parsePrice(cell(cells, 'price'));
    if (price.error) errors.push(price.error);
    else if (!price.value) warnings.push('Price missing — set it on the Pricing step');

    const imei = parseImei(cell(cells, 'imei'));
    if (imei.error) errors.push(imei.error);
    if (imei.value) {
      if (listingType !== 'DEVICE') {
        warnings.push('IMEI ignored — only devices carry an IMEI');
        imei.value = '';
      } else if (seenImei.has(imei.value)) {
        errors.push(`Same IMEI as line ${seenImei.get(imei.value)}`);
      } else {
        seenImei.set(imei.value, line);
        if (!qty.error && qty.value !== 1) errors.push('A device with an IMEI is one unit — quantity must be 1');
      }
    }

    out.rows.push({
      line,
      listingType,
      title,
      model,
      color: cell(cells, 'color'),
      ramLabel: normalizeMemory(cell(cells, 'ram')),
      storageLabel: normalizeMemory(cell(cells, 'storage')),
      itemCondition,
      conditionGrade,
      quantity: qty.error ? 1 : qty.value,
      price: price.error ? '' : price.value,
      imei: imei.error ? '' : imei.value,
      errors,
      warnings,
    });
  });

  if (out.truncated) out.sheetWarnings.push(`Only the first ${maxRows} items are imported per batch — ${out.truncated} more were left out.`);
  if (!out.rows.length && !out.sheetErrors.length) out.sheetErrors.push('No item rows found (example rows are skipped).');
  return out;
}

/** Case/spacing/punctuation-insensitive key for matching catalogue names. */
export const matchKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
