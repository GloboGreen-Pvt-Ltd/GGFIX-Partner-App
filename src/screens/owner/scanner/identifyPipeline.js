// Photo → ranked catalogue matches for the product scanner.
//
//   capture / gallery
//     → crop to the detected device box (or the reticle) → ≤1024 px JPEG
//     → static ML Kit OCR + barcodes on the full photo (merged with live reads)
//     → POST /master/device-identify  (file, ocrText, codes, categoryCode, source)
//     → server matches mapped onto the cached catalogue rows
//   server not configured / unreachable / empty
//     → the existing on-device fallbacks: OCR text + optional visual-search
//       service ranked by lib/productDetect/core, then brand / model-number
//       text matching (catalogueMatchesFromText).
//
// Nothing here ever picks a device: it returns a list, the user taps one.
import { identifyDevice, sendDeviceIdentifyFeedback } from '../../../api/masterData';
import { loadSearchableModels } from '../../../utils/deviceSearch';
import { buildIndex, detectProduct } from '../../../lib/productDetect/core';
import sources from '../../../lib/productDetect/sources';
import { runOcr } from '../../../lib/productDetect';
import {
  catalogueMatchesFromText,
  extractIdentifiersFromOCR,
  normalizeScannedIdentifier,
  resolveExactTicket,
} from '../../../utils/scanSearch';
import { getLiveModules } from './nativeModules';
import { toPixelCrop } from './geometry';

const UPLOAD_MAX_EDGE = 1024;
const UPLOAD_QUALITY = 0.8;
const OCR_MAX_EDGE = 2048; // ML Kit on Android rejects static images over 4 MP
const MAX_RESULTS = 6;
const VISUAL_TIMEOUT_MS = 15000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACKING_RE = /^([A-Z]{3,6}\d{6,12}|[A-Z0-9]TS-\d{3,})$/i;
const IMEI_RE = /^\d{14,17}$/;

let Manipulator;
const manipulator = () => {
  if (Manipulator === undefined) {
    try { Manipulator = require('expo-image-manipulator'); } catch (_) { Manipulator = null; }
  }
  return Manipulator;
};

const withTimeout = (promise, ms, fallback) => Promise.race([
  promise.catch(() => fallback),
  new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
]);
const dedupe = (arr) => [...new Set(arr.filter(Boolean))];

/** A scanned/read value that names one booking (tracking ID, IMEI, ticket id). */
export function looksLikeBookingId(raw) {
  const v = normalizeScannedIdentifier(raw);
  return v && (IMEI_RE.test(v) || TRACKING_RE.test(v) || UUID_RE.test(v)) ? v : null;
}

/**
 * Two JPEGs from one photo: `upload` (cropped, ≤1024 px) for the server and
 * `ocr` (whole photo, ≤2048 px) for text/barcode reading. Never throws —
 * falls back to a plain resize, then to the original file.
 */
export async function prepareScanImages(uri, crop) {
  const M = manipulator();
  if (!uri || !M) return { uploadUri: uri, ocrUri: uri, cropped: false };
  const JPEG = M.SaveFormat?.JPEG || 'jpeg';
  if (M.ImageManipulator?.manipulate) {
    let base = null;
    try {
      base = await M.ImageManipulator.manipulate(uri).renderAsync();
      const W = base.width;
      const H = base.height;

      let ocrUri = uri;
      if (Math.max(W, H) > OCR_MAX_EDGE) {
        const ctx = M.ImageManipulator.manipulate(base);
        ctx.resize(W >= H ? { width: OCR_MAX_EDGE } : { height: OCR_MAX_EDGE });
        ocrUri = (await (await ctx.renderAsync()).saveAsync({ compress: 0.85, format: JPEG })).uri;
      }

      const ctx = M.ImageManipulator.manipulate(base);
      let cw = W;
      let ch = H;
      if (crop) {
        const px = toPixelCrop(crop, W, H);
        ctx.crop(px);
        cw = px.width;
        ch = px.height;
      }
      if (Math.max(cw, ch) > UPLOAD_MAX_EDGE) ctx.resize(cw >= ch ? { width: UPLOAD_MAX_EDGE } : { height: UPLOAD_MAX_EDGE });
      const out = await (await ctx.renderAsync()).saveAsync({ compress: UPLOAD_QUALITY, format: JPEG });
      return { uploadUri: out.uri, width: out.width, height: out.height, ocrUri, cropped: !!crop };
    } catch (e) {
      console.warn('[SCAN] crop/resize failed, sending a plain resize:', e?.message || String(e));
    } finally {
      try { base?.release?.(); } catch (_) { /* already released */ }
    }
  }
  try {
    const out = await M.manipulateAsync(uri, [{ resize: { width: UPLOAD_MAX_EDGE } }], { compress: UPLOAD_QUALITY, format: JPEG });
    return { uploadUri: out.uri, width: out.width, height: out.height, ocrUri: out.uri, cropped: false };
  } catch (_) {
    return { uploadUri: uri, ocrUri: uri, cropped: false };
  }
}

/** Static OCR: VisionCamera ML Kit when linked, else the existing @react-native-ml-kit reader. */
async function readText(uri) {
  const L = getLiveModules();
  if (L?.staticOcr && L.MLKit?.processImageTextRecognition) {
    try {
      const r = await L.MLKit.processImageTextRecognition(uri, { language: 'LATIN' });
      return { ok: true, text: r?.text || '' };
    } catch (_) { /* fall through to the older reader */ }
  }
  return runOcr(uri);
}

async function readCodes(uri) {
  const L = getLiveModules();
  if (!L?.staticBarcodes || !L.MLKit?.processImageBarcodeScanning) return [];
  try {
    const r = await L.MLKit.processImageBarcodeScanning(uri, { formats: ['ALL_FORMATS'] });
    return (r?.barcodes || []).map((b) => b.rawValue || b.displayValue).filter(Boolean).map((v) => String(v).slice(0, 300));
  } catch (_) {
    return [];
  }
}

/** Live + photo OCR, line-deduplicated, ≤ 4000 chars (server limit). */
function mergeText(...texts) {
  const seen = new Set();
  const lines = [];
  texts.forEach((t) => String(t || '').split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    const k = l.toLowerCase();
    if (l && !seen.has(k)) { seen.add(k); lines.push(l); }
  }));
  return lines.join('\n').slice(0, 4000);
}

/**
 * COCO class → a category hint, only where it is unambiguous: laptops,
 * watches, and phones shaped like phones (a tablet also reads "cell phone",
 * so a squarer box sends no hint).
 */
function categoryHint(detected) {
  if (!detected || !(detected.score >= 0.45)) return undefined;
  if (detected.cls === 72 || detected.cls === 75) return 'LAPTOP';
  if (detected.cls === 84) return 'SMARTWATCHES';
  if (detected.cls === 76 && detected.elongation >= 1.6) return 'MOBILE';
  return undefined;
}

async function findBooking(values) {
  for (const v of dedupe(values.map(looksLikeBookingId)).slice(0, 4)) {
    const t = await resolveExactTicket(v).catch(() => null);
    if (t) return t;
  }
  return null;
}

const TIERS = new Set(['high', 'medium', 'low']);
const tierOf = (p) => (p == null ? null : p >= 0.85 ? 'high' : p >= 0.55 ? 'medium' : 'low');

/** A server match → the catalogue row the booking flows expect (navigateDeviceAction). */
function rowFor(m, byId) {
  const hit = byId.get(String(m.id));
  if (hit) return hit;
  return {
    modelId: m.id,
    modelName: m.modelName || m.displayName || '',
    displayName: m.displayName || m.modelName || '',
    brandId: m.brandId || null,
    brandName: m.brand || '',
    categoryId: m.categoryId || null,
    categoryName: m.categoryName || '',
    categoryCode: m.categoryCode || undefined,
    seriesId: m.seriesId || undefined,
    modelNumber: (m.modelNumbers || [])[0] || undefined,
    modelNumbers: m.modelNumbers || [],
    modelImageUrl: m.imageUrl || undefined,
    sellActive: true,
  };
}

// Brand fill-ins, name-alike siblings and partial names (older servers send
// them) are not matches for this photo — they were the "unrelated models".
const GENUINE = (m) => !['brand', 'similar', 'partial'].includes(String(m?.matchedBy || '').toLowerCase());

function serverItems(res, byId) {
  if (res.identification === 'NONE') return [];
  const list = res.matches?.length ? res.matches : res.bestMatch ? [res.bestMatch] : [];
  return list
    .filter(GENUINE)
    .map((m, rank) => {
      if (!m?.id) return null;
      const row = rowFor(m, byId);
      const p = typeof m.confidenceScore === 'number' ? m.confidenceScore : typeof m.similarity === 'number' ? m.similarity : null;
      return {
        key: `s-${m.id}-${rank}`,
        rank, // index in the server's `matches` — what feedback reports
        row,
        displayName: m.displayName || row.displayName,
        subtitle: [row.categoryName || m.categoryName, row.modelNumber].filter(Boolean).join(' · '),
        // The model's own catalogue image first — what the user is confirming.
        imageUrl: row.modelImageUrl || m.imageUrl || m.referenceImageUrl || null,
        percent: p == null ? null : Math.round(Math.max(0, Math.min(1, p)) * 100),
        tier: TIERS.has(m.confidence) ? m.confidence : tierOf(p),
        signals: Array.isArray(m.signals) ? m.signals : [],
        verified: m.verified === true,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_RESULTS);
}

let localIndex = null;
async function catalogueIndex() {
  if (!localIndex) localIndex = sources.catalog().then(buildIndex).catch((e) => { localIndex = null; throw e; });
  return localIndex;
}

/** The pre-existing on-device ranking, as a list (its 'exact' status is NOT treated as a selection). */
async function localItems({ uploadUri, ocrText }) {
  const index = await catalogueIndex().catch(() => null);
  let visual = null;
  if (sources.visual) {
    visual = await withTimeout(sources.visual({ uri: uploadUri, mimeType: 'image/jpeg' }, { ocrText }), VISUAL_TIMEOUT_MS, null);
  }
  const text = [ocrText, visual?.ocrText].filter(Boolean).join('\n');
  if (index && (text || visual?.ok)) {
    const r = detectProduct(index, { ocrText: text, identify: null, visual: visual?.ok ? visual : null });
    // Real candidates only — weak 'none' suggestions are not shown as matches.
    const cands = r.candidates || [];
    if (cands.length) {
      return {
        label: r.label || null,
        exact: r.status === 'exact',
        items: cands.map((c, i) => {
          const sig = Object.keys(c.signals || {});
          return {
            key: `l-${c.id}-${i}`,
            rank: -1, // not a server match — reported like a manual pick
            row: c.ref,
            displayName: c.ref?.displayName || `${c.brand} ${c.name}`,
            subtitle: [c.ref?.categoryName, c.ref?.modelNumber].filter(Boolean).join(' · '),
            imageUrl: c.ref?.modelImageUrl || null,
            percent: Math.round(c.confidence * 100),
            tier: c.confidence >= 0.6 ? 'medium' : 'low', // uncalibrated: never 'high'
            signals: dedupe([
              sig.some((k) => k.startsWith('ocr-model')) ? 'modelNumber' : null,
              sig.some((k) => k === 'ocr-name' || k === 'label-name') ? 'ocr' : null,
              sig.includes('visual') ? 'visual' : null,
            ]),
            verified: !!c.signals?.['ocr-model-number'],
          };
        }),
      };
    }
  }
  if (ocrText) {
    const t = await catalogueMatchesFromText(ocrText, { limit: MAX_RESULTS }).catch(() => null);
    // Only a printed model number counts here. A brand read off the photo
    // ("realme") gave that brand's whole model list — not matches; it stays
    // as the label so manual search can start from it.
    if (t && t.matchedOn !== 'modelNumber') return { label: t.brandName || null, brandName: t.brandName || null, items: [] };
    if (t?.rows?.length) {
      return {
        label: null,
        exact: !!t.exact && t.rows.length === 1,
        brandName: t.brandName,
        items: t.rows.slice(0, MAX_RESULTS).map((row, i) => ({
          key: `t-${row.modelId}-${i}`,
          rank: -1,
          row,
          displayName: row.displayName,
          subtitle: [row.categoryName, row.modelNumber].filter(Boolean).join(' · '),
          imageUrl: row.modelImageUrl || null,
          percent: null,
          tier: null,
          signals: [t.matchedOn === 'modelNumber' ? 'modelNumber' : 'ocr'],
          verified: t.matchedOn === 'modelNumber' && !!t.exact,
        })),
      };
    }
  }
  return { label: null, items: [] };
}

/**
 * shot: { uri, crop?, detected?, liveText?, liveCodes?, source: 'CAMERA'|'GALLERY' }
 * → { scanId, calibrated, confidence, confidenceScore, origin, items, label,
 *     ticket, serverError, retryAfterSeconds, ocrRead }
 */
export async function identifyScan(shot) {
  const started = Date.now();
  const prepared = await prepareScanImages(shot.uri, shot.crop || null);
  const [ocr, photoCodes] = await Promise.all([
    withTimeout(readText(prepared.ocrUri), 5000, { ok: false, text: '' }),
    withTimeout(readCodes(prepared.ocrUri), 4000, []),
  ]);
  const ocrText = mergeText(ocr?.text, shot.liveText);
  const codes = dedupe([...photoCodes, ...(shot.liveCodes || [])]).slice(0, 10);
  const ids = extractIdentifiersFromOCR(ocrText);
  const ticketPromise = findBooking([...codes, ...ids.trackingIds, ...ids.imeis]).catch(() => null);

  const [res, catalogue] = await Promise.all([
    identifyDevice(
      { uri: prepared.uploadUri, name: 'scan.jpg', type: 'image/jpeg' },
      { limit: 8, ocrText, codes, categoryCode: categoryHint(shot.detected), source: shot.source || 'CAMERA' },
    ).catch((e) => ({ configured: true, error: e?.message || 'identify failed', status: e?.status, matches: [] })),
    loadSearchableModels().catch(() => []),
  ]);
  const serverOk = res.configured !== false && !res.error;
  const byId = new Map(catalogue.map((r) => [String(r.modelId), r]));
  let items = serverOk ? serverItems(res, byId) : [];
  let origin = 'server';
  let label = serverOk ? (res.recognisedAs || (typeof res.aiGuess === 'string' ? res.aiGuess : null) || res.brand || null) : null;
  let brandName = serverOk ? res.brand || null : null;
  // EXACT = verified (a printed model number / barcode, or look and AI
  // agreeing at a calibrated ≥ 85 %) — shown as the exact model. Anything
  // else is "Exact model not identified" over the genuine matches.
  let exact = serverOk && res.identification === 'EXACT' && items.length > 0;
  if (!items.length) {
    const local = await localItems({ uploadUri: prepared.uploadUri, ocrText });
    if (local.items.length) {
      items = local.items;
      origin = 'local';
      exact = !!local.exact;
    }
    label = label || local.label || null;
    brandName = brandName || local.brandName || null;
  }
  const ticket = await withTimeout(ticketPromise, 6000, null);

  console.log('[SCAN]', JSON.stringify({
    ms: Date.now() - started,
    source: shot.source,
    crop: shot.cropSource || (shot.crop ? 'crop' : 'full'),
    detected: shot.detected ? `${shot.detected.label} ${Math.round(shot.detected.score * 100)}%` : null,
    ocrChars: ocrText.length,
    codes: codes.length,
    server: serverOk ? { provider: res.provider, matches: items.length, confidence: res.confidence, p: res.confidenceScore, calibrated: res.calibrated } : (res.error || 'not configured'),
    origin,
    ticket: !!ticket,
  }));

  return {
    scanId: serverOk ? res.scanId || null : null,
    calibrated: serverOk && origin === 'server' ? res.calibrated === true : false,
    confidence: serverOk && origin === 'server' ? res.confidence : null,
    confidenceScore: serverOk && origin === 'server' ? res.confidenceScore : null,
    origin,
    items,
    exact,
    label,
    brandName,
    ticket,
    serverError: serverOk ? null : (res.configured === false ? 'NOT_CONFIGURED' : res.error),
    retryAfterSeconds: res.retryAfterSeconds ?? null,
    ocrRead: !!ocrText,
  };
}

/** Fire-and-forget: which result the user actually continued with. */
export function reportPick(scanId, item) {
  if (!scanId || !item?.row?.modelId) return;
  sendDeviceIdentifyFeedback(scanId, { modelId: item.row.modelId, rank: Number.isInteger(item.rank) ? item.rank : -1 });
}
