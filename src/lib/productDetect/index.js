/**
 * Photo → device, SHARED by the Customer and Partner apps (byte-identical
 * src/lib/productDetect/index.js in both). App-specific I/O lives in
 * ./sources.js (server identify, visual search, catalogue); ranking in ./core.js.
 *
 *   camera / gallery → preparePhoto (resize + JPEG) → OCR ∥ server identify
 *   → catalogue ranking → visual search only if still unsure → result
 */
import { Platform } from 'react-native';
import { buildIndex, detectProduct } from './core';
import sources from './sources';

const MAX_EDGE = 1600;   // long edge sent to OCR / server: sharp enough for labels, fast to upload
const JPEG_QUALITY = 0.75;
const VISUAL_TIMEOUT_MS = 15000; // server OCR + image matching on a CPU

// Native modules are required lazily so a build that predates them degrades
// (no resize / no OCR) instead of failing to start.
let Manipulator;
let TextRecognition;
const lazy = (load) => { try { return load(); } catch (_) { return null; } };

/** Downscale + re-encode as JPEG. Falls back to the original photo. */
export async function preparePhoto(uri, { width, height } = {}) {
  if (!uri) return null;
  if (Manipulator === undefined) Manipulator = lazy(() => require('expo-image-manipulator'));
  try {
    if (!Manipulator?.manipulateAsync) throw new Error('no manipulator');
    const long = Math.max(Number(width) || 0, Number(height) || 0);
    const resize = !long || long > MAX_EDGE
      ? [{ resize: (Number(width) || 0) >= (Number(height) || 0) ? { width: MAX_EDGE } : { height: MAX_EDGE } }]
      : [];
    const out = await Manipulator.manipulateAsync(uri, resize, { compress: JPEG_QUALITY, format: Manipulator.SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
  } catch (_) {
    return { uri, mimeType: 'image/jpeg', width, height };
  }
}

/** On-device OCR (ML Kit on Android, Apple Vision on iOS). Never throws. */
export async function runOcr(uri) {
  if (Platform.OS === 'web' || !uri) return { ok: false, text: '', message: 'OCR is not available here.' };
  if (TextRecognition === undefined) TextRecognition = lazy(() => require('@react-native-ml-kit/text-recognition').default);
  try {
    if (!TextRecognition?.recognize) throw new Error('native module missing');
    const result = await TextRecognition.recognize(uri);
    return { ok: true, text: result?.text || '' };
  } catch (e) {
    const missing = /native module|seem to be linked|null is not an object|cannot read prop.*null|missing/i.test(String(e?.message || ''));
    return { ok: false, text: '', devBuildRequired: missing, message: missing ? 'On-device text recognition needs a development build.' : (e?.message || 'Text recognition failed.') };
  }
}

let indexPromise = null;
function catalogIndex() {
  if (!indexPromise) {
    indexPromise = sources.catalog().then(buildIndex).catch((e) => { indexPromise = null; throw e; });
  }
  return indexPromise;
}
/** Build the catalogue index ahead of the first photo (screen mount). */
export function warmProductDetect() { catalogIndex().catch(() => {}); }

/**
 * uri (+ optional { width, height } from the camera / picker) →
 * { status: 'exact'|'choose'|'none', best, candidates (≤3, each with .ref =
 *   the app's own catalogue row and .confidence 0..1), confidence, reason, label }
 * Throws only when the catalogue itself can't load (offline).
 */
export async function detectProductFromPhoto(uri, dims) {
  const started = Date.now();
  const photo = await preparePhoto(uri, dims);
  const [ocr, identify, index, visual] = await Promise.all([
    runOcr(photo.uri),
    sources.identify(photo).catch((e) => ({ ok: false, error: e?.message || 'identify failed' })),
    catalogIndex(),
    // In parallel from the start: the matcher service also READS the photo's
    // text server-side (model name / number on the device, box, sticker or
    // About-phone screen) — the strongest signal when this build has no OCR.
    // Capped so a slow / unreachable service never stalls the scanner.
    sources.visual
      ? Promise.race([
        sources.visual(photo, {}).catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), VISUAL_TIMEOUT_MS)),
      ])
      : Promise.resolve(null),
  ]);
  const ocrText = [ocr.text, visual?.ocrText].filter(Boolean).join('\n');
  const result = detectProduct(index, { ocrText, identify, visual: visual?.ok ? visual : null });
  // Debug trail: why this device (or none) and how sure.
  console.log('[DETECT]', JSON.stringify({
    status: result.status,
    reason: result.reason,
    confidence: Math.round(result.confidence * 100),
    ms: Date.now() - started,
    ocr: ocr.ok ? 'ok' : (ocr.devBuildRequired ? 'not in this build' : (ocr.message || 'off')),
    serverText: visual?.ocrText ? visual.ocrText.replace(/\n/g, ' | ').slice(0, 160) : null,
    identify: identify.ok ? 'ok' : (identify.error || 'off'),
    visual: visual ? (visual.ok ? 'ok' : 'off') : 'skipped',
    ...result.debug,
  }));
  return result;
}
