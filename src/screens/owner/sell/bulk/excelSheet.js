import { Platform } from 'react-native';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { strFromU8, unzipSync } from 'fflate';
import { BATCH } from './bulkDraft';
import { FileError } from './bulkFiles';
import { parseCsv, toCsv } from './csv';

// Bulk Listing (Excel): pick a .xlsx / .csv (max 10 MB) and read its first
// sheet into rows of cell strings; the downloadable template and the error
// report. .xlsx is a zip of XML parts — read with fflate, no other library.

export const MAX_SHEET_BYTES = 10 * 1024 * 1024;
const SHEET_EXT = /\.(xlsx|csv)$/i;

export const TEMPLATE_HEADERS = [
  'Category', 'Brand', 'Model', 'Storage', 'Color', 'Condition', 'IMEI/Serial', 'Price', 'Quantity', 'Warranty (Months)', 'Buyer Category', 'Fulfillment Option',
];

/** The template as CSV (opens in Excel). Example rows start with "EXAMPLE" and are skipped on upload. */
export function templateCsv(batchType) {
  const same = batchType === BATCH.SAME_MODEL;
  const rows = same
    ? [
      ['EXAMPLE - Mobile', 'Apple', 'iPhone 11', '128 GB', 'Black', 'Used (Good)', '356789123456789;356789123456790', '25000', '2', '6', 'Customer', 'Delivery to Home (20 km)'],
      ['EXAMPLE - Mobile', 'Apple', 'iPhone 11', '256 GB', 'Blue', 'Refurbished', '', '29000', '3', '6', 'Customer', 'Delivery to Home (20 km)'],
    ]
    : [
      ['EXAMPLE - Mobile', 'Apple', 'iPhone 11', '64 GB', 'Black', 'Used (Good)', '', '20000', '5', '6', 'Customer', 'Direct Visit to Shop'],
      ['EXAMPLE - Mobile', 'Samsung', 'Galaxy S21', '128 GB', 'Gray', 'Refurbished', '', '28000', '3', '3', 'Customer', 'Direct Visit to Shop'],
    ];
  return toCsv([TEMPLATE_HEADERS, ...rows]);
}

export function errorReportCsv(errors) {
  return toCsv([['Sheet Line', 'Product', 'Qty', 'Price', 'Error'], ...errors.map((e) => [e.line, e.details, e.qty ?? '', e.price ?? '', e.reason])]);
}

function documentPicker() {
  try {
    // eslint-disable-next-line global-require
    const DP = require('expo-document-picker');
    if (typeof DP?.getDocumentAsync === 'function') return DP;
  } catch (_) { /* older build */ }
  throw new FileError('PICKER_UNAVAILABLE', 'File upload needs the latest app build');
}

/** { name, size, uri, file } of the picked sheet, or null when cancelled. */
export async function pickSheetFile() {
  const DP = documentPicker();
  let res;
  try {
    res = await DP.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  } catch (_) {
    throw new FileError('READ', 'Could not open the file picker. Please try again.');
  }
  if (!res || res.canceled) return null;
  const a = res.assets?.[0];
  if (!a?.uri) return null;
  const name = a.name || a.uri.split('/').pop() || 'sheet';
  if (!SHEET_EXT.test(name)) throw new FileError('TYPE', 'Choose an Excel (.xlsx) or CSV (.csv) file.');
  if (a.size && a.size > MAX_SHEET_BYTES) throw new FileError('SIZE', 'The file is larger than 10 MB.');
  return { name, size: a.size || null, uri: a.uri, file: a.file || null };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64) {
  const s = String(b64).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length && o < out.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length && o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

const unescapeXml = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
const colIndex = (ref) => [...String(ref).replace(/\d+/g, '').toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

/** First worksheet of an .xlsx → rows of cell strings. */
export function xlsxRows(bytes) {
  let files;
  try {
    files = unzipSync(bytes, { filter: (f) => /^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(f.name) });
  } catch (_) {
    throw new FileError('READ', 'This Excel file could not be opened. Save it again as .xlsx or .csv and retry.');
  }
  const read = (p) => (files[p] ? strFromU8(files[p]) : '');
  // First sheet in workbook order → its part via the relationships file.
  const firstId = (read('xl/workbook.xml').match(/<sheet\b[^>]*\br:id="([^"]+)"/) || [])[1];
  const target = firstId ? (read('xl/_rels/workbook.xml.rels').match(new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`)) || [])[1] : null;
  const sheetPath = target ? `xl/${target.replace(/^\/?xl\//, '')}` : Object.keys(files).filter((k) => k.startsWith('xl/worksheets/')).sort()[0];
  const sheet = read(sheetPath);
  if (!sheet) throw new FileError('READ', 'No worksheet found in this Excel file.');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v != null ? unescapeXml(v) : '';
      const idx = ref ? colIndex(ref) : cells.length;
      while (cells.length < idx) cells.push('');
      cells[idx] = String(value);
    }
    rows.push(cells);
  }
  return rows;
}

/** The picked file → rows of cell strings (first sheet / CSV). */
export async function readSheetRows(picked) {
  const xlsx = /\.xlsx$/i.test(picked.name);
  try {
    if (Platform.OS === 'web') {
      const blob = picked.file || await (await fetch(picked.uri)).blob();
      if (xlsx) return xlsxRows(new Uint8Array(await blob.arrayBuffer()));
      return parseCsv(await blob.text());
    }
    if (xlsx) return xlsxRows(base64ToBytes(await readAsStringAsync(picked.uri, { encoding: EncodingType.Base64 })));
    return parseCsv(await readAsStringAsync(picked.uri, { encoding: EncodingType.UTF8 }));
  } catch (e) {
    if (e instanceof FileError) throw e;
    throw new FileError('READ', 'Could not read this file. Make sure it is a .xlsx or .csv file and try again.');
  }
}
