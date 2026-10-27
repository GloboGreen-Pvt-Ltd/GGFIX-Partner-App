// STRICT, fail-closed validation of a booking's device photo against the
// booking's device category, fully offline, with one of two engines (same 90
// COCO classes):
//   1. native TFLite EfficientDet-Lite0 (fast) — needs NitroModules in the
//      installed build;
//   2. otherwise pure-JS TensorFlow.js COCO-SSD lite (jsDetector.js) — runs on
//      any build Metro serves, a few seconds per photo.
//
//   photo → RGB → engine → every detection → verdict →
//   padded crop around the device (≤1600 px JPEG) → Laplacian sharpness.
//
// Only 'ok' may ever be accepted. Every other verdict is a rejection:
//   wrong_device — something else is (more) clearly in the photo
//   no_device    — nothing recognisable
//   uncertain    — the right kind of device, but not confidently
//   blurry       — right device, too blurry
//   unavailable  — the model can't run here, or can't verify this category
//
// What the model can verify (COCO has no tablet / smartwatch / audio class):
//   MOBILE → "cell phone"        TABLET → "cell phone" or "tv"
//   LAPTOP → "laptop"            SMARTWATCH, AUDIO_DEVICE → unavailable
// so the booking screen makes the photo optional for watch / audio.
//
// Only photos registered through markValidated() may be uploaded; the booking
// screen checks consumeValidated() before anything reaches the upload.
import jpeg from 'jpeg-js';
import { File, Paths } from 'expo-file-system';
import { getLiveModules, liveModulesDiagnosis } from './nativeModules';
import { DETECT_MIN_SCORE, loadDeviceDetector, parseAllDetections } from './objectDetector';
import { detectJs } from './jsDetector';
import { padCrop, toPixelCrop } from './geometry';

// Score a detection needs to count as confident.
export const DETECT_OK = 0.55;
// Laplacian variance of the ≤480 px crop below which the photo reads blurry.
export const BLUR_MIN = 40;

const PHONE = 76;
const LAPTOP = 72;
const TV = 71;
export const CATEGORY_CLASSES = {
  MOBILE: [PHONE],
  TABLET: [PHONE, TV],
  LAPTOP: [LAPTOP],
  SMARTWATCH: [],
  AUDIO_DEVICE: [],
};
/** Categories the model can verify. Others: photo optional, never auto-accepted. */
export const isVerifiableCategory = (c) => !!CATEGORY_CLASSES[c]?.length;

export const CATEGORY_LABEL = {
  MOBILE: 'Mobile Phone',
  TABLET: 'Tablet',
  LAPTOP: 'Laptop',
  SMARTWATCH: 'Smartwatch',
  AUDIO_DEVICE: 'Audio Device',
};
export const categoryLabel = (c) => CATEGORY_LABEL[c] || 'Device';
export const acceptedClasses = (c) => CATEGORY_CLASSES[c] || [];

// JS engine input: longest edge (COCO-SSD resizes to 300x300 internally).
const JS_EDGE = 400;
const SHARP_EDGE = 480;
const OUTPUT_EDGE = 1600;

// ── Validated-photo registry ───────────────────────────────────────────────
const validated = new Map(); // uri → { category, score }
export function markValidated(uri, info) { if (uri) validated.set(uri, info); }
export function isValidatedPhoto(uri) { return !!uri && validated.has(uri); }
/** One upload per validation: the entry is removed when read. */
export function consumeValidated(uri) {
  const info = validated.get(uri) || null;
  validated.delete(uri);
  return info;
}

/** Deletes a temp image this app created (cache dir only — never a gallery original). */
export function discardTempImage(uri) {
  try {
    validated.delete(uri);
    const cache = Paths?.cache?.uri;
    if (!uri || !cache || !String(uri).startsWith(cache)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (_) { /* best effort */ }
}

let Manipulator;
const manipulator = () => {
  if (Manipulator === undefined) {
    try { Manipulator = require('expo-image-manipulator'); } catch (_) { Manipulator = null; }
  }
  return Manipulator;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < B64.length; i += 1) t[B64.charCodeAt(i)] = i;
  return t;
})();

function base64ToBytes(b64) {
  const s = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_INDEX[s.charCodeAt(i)];
    const b = B64_INDEX[s.charCodeAt(i + 1)];
    const c = i + 2 < s.length ? B64_INDEX[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < s.length ? B64_INDEX[s.charCodeAt(i + 3)] : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < s.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < s.length) out[o++] = ((c & 3) << 6) | d;
  }
  return o === out.length ? out : out.subarray(0, o);
}

/** Renders `ctx`, returns decoded RGBA { width, height, data } of the JPEG. */
async function decode(ctx) {
  const M = manipulator();
  const img = await ctx.renderAsync();
  try {
    const saved = await img.saveAsync({ compress: 0.92, format: M.SaveFormat?.JPEG || 'jpeg', base64: true });
    if (saved.uri) discardTempImage(saved.uri);
    return jpeg.decode(base64ToBytes(saved.base64 || ''), { useTArray: true, formatAsRGBA: true });
  } finally {
    try { img.release?.(); } catch (_) { /* already released */ }
  }
}

/** Variance of the 4-neighbour Laplacian over a greyscale RGBA image. */
export function sharpness({ width, height, data }) {
  if (width < 3 || height < 3) return 0;
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; i < g.length; i += 1, p += 4) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const l = g[i - 1] + g[i + 1] + g[i - width] + g[i + width] - 4 * g[i];
      sum += l;
      sq += l * l;
      n += 1;
    }
  }
  const mean = sum / n;
  return sq / n - mean * mean;
}

// The model calls tablets "cell phone" too, so a phone-class box is told apart
// by its shape (long / short side, in pixels). Phones run 16:9 → 20:9
// (1.78–2.22; measured 1.99–2.14 on real photos), tablets 4:3 → 16:10
// (1.33–1.6). Between the bands it's "can't confirm" → retake.
const TABLET_MAX_SHAPE = 1.62;
const PHONE_MIN_SHAPE = 1.7;
const PHONE_SURE_SHAPE = 1.8;
const shapeOf = (d, imgAspect) => {
  const w = (d.u1 - d.u0) * imgAspect;
  const h = d.v1 - d.v0;
  return w > 0 && h > 0 ? Math.max(w, h) / Math.min(w, h) : null;
};

// People / hands / furniture around the device don't compete with it; any
// other object scoring higher than the device does (keyboard, book, laptop…).
const BACKGROUND = new Set([0, 61, 62, 64, 66]); // person, chair, couch, bed, dining table

/**
 * Pure verdict — no I/O, unit-tested.
 * dets: every detection ≥ DETECT_MIN_SCORE, highest score first.
 * sharp: sharpness of the device crop, or null when not measured yet.
 * imgAspect: image width / height — enables the phone-vs-tablet shape check
 *   (null skips it).
 * → { status, detected } — `detected` is what the model saw (for the message).
 */
export function decidePhoto(category, dets, sharp, imgAspect = null) {
  if (!isVerifiableCategory(category)) return { status: 'unavailable', detected: null };
  const accept = acceptedClasses(category);
  const expected = dets.find((d) => accept.includes(d.cls)) || null;
  const rival = dets.find((d) => !accept.includes(d.cls) && !BACKGROUND.has(d.cls)) || null;

  if (expected && expected.score >= DETECT_OK) {
    if (rival && rival.score > expected.score) return { status: 'wrong_device', detected: rival.label };
    const shape = imgAspect && expected.cls === PHONE && expected.u1 != null ? shapeOf(expected, imgAspect) : null;
    if (shape != null && category === 'MOBILE') {
      if (shape < TABLET_MAX_SHAPE) return { status: 'wrong_device', detected: 'Tablet' };
      if (shape < PHONE_MIN_SHAPE) return { status: 'uncertain', detected: expected.label };
    }
    if (shape != null && category === 'TABLET') {
      if (shape >= PHONE_SURE_SHAPE) return { status: 'wrong_device', detected: 'Mobile Phone' };
      if (shape >= PHONE_MIN_SHAPE) return { status: 'uncertain', detected: expected.label };
    }
    if (sharp != null && sharp < BLUR_MIN) return { status: 'blurry', detected: expected.label };
    return { status: 'ok', detected: expected.label };
  }
  if (rival && rival.score >= DETECT_OK) return { status: 'wrong_device', detected: rival.label };
  if (expected) return { status: 'uncertain', detected: expected.label };
  return { status: 'no_device', detected: rival ? rival.label : null };
}

async function buildInfo() {
  try {
    const A = require('expo-application');
    const installed = await A.getInstallationTimeAsync?.().catch(() => null);
    const updated = await A.getLastUpdateTimeAsync?.().catch(() => null);
    return `installed build ${A.nativeApplicationVersion}(${A.nativeBuildVersion}), installed ${installed ? new Date(installed).toISOString() : '?'}, updated ${updated ? new Date(updated).toISOString() : '?'}`;
  } catch (_) {
    return 'build info unavailable';
  }
}

const rgbOf = (img) => {
  const rgb = new Uint8Array(img.width * img.height * 3);
  for (let i = 0, p = 0; i < rgb.length; i += 3, p += 4) {
    rgb[i] = img.data[p];
    rgb[i + 1] = img.data[p + 1];
    rgb[i + 2] = img.data[p + 2];
  }
  return rgb;
};

/**
 * Runs the best available engine on the upright image.
 * → { engine, dets (best first, boxes normalised to the image), ms, note }
 * Throws with every engine's real error when none can run.
 */
async function runDetector(M, base) {
  const errors = [];
  const LIVE = getLiveModules();
  if (LIVE?.Tflite) {
    try {
      const detector = await loadDeviceDetector(LIVE.Tflite);
      const small = await decode(M.ImageManipulator.manipulate(base).resize({ width: detector.width, height: detector.height }));
      if (small.width !== detector.width || small.height !== detector.height) throw new Error('detector input size mismatch');
      const t0 = Date.now();
      const outputs = await detector.model.run([rgbOf(small).buffer]);
      return { engine: 'native TFLite EfficientDet-Lite0', dets: parseAllDetections(outputs, DETECT_MIN_SCORE), ms: Date.now() - t0 };
    } catch (e) {
      errors.push(`native: ${e?.message || e}`);
    }
  } else {
    errors.push(`native: ${liveModulesDiagnosis()}`);
  }
  try {
    const W = base.width;
    const H = base.height;
    const ctx = M.ImageManipulator.manipulate(base);
    if (Math.max(W, H) > JS_EDGE) ctx.resize(W >= H ? { width: JS_EDGE } : { height: JS_EDGE });
    const t1 = Date.now();
    const small = await decode(ctx);
    console.log(`[PHOTO CHECK] JS input ${small.width}x${small.height} decoded (${Date.now() - t1} ms); native skipped: ${errors[0]}`);
    const t0 = Date.now();
    const dets = await detectJs(rgbOf(small), small.width, small.height, DETECT_MIN_SCORE);
    return { engine: 'JS TensorFlow.js COCO-SSD lite', dets, ms: Date.now() - t0, note: errors[0] };
  } catch (e) {
    errors.push(`js: ${e?.message || e}`);
  }
  throw new Error(errors.join(' | '));
}

/**
 * @returns {Promise<{
 *   status: 'ok'|'wrong_device'|'no_device'|'uncertain'|'blurry'|'unavailable',
 *   uri: string,           // cropped JPEG when ok/blurry, else the original
 *   temp: string[],        // files this check created (for cleanup)
 *   detected?: string|null, reason?: string,
 *   width?: number, height?: number, score?: number, sharp?: number,
 * }>}
 */
export async function checkDevicePhoto(uri, category) {
  if (!isVerifiableCategory(category)) {
    return { status: 'unavailable', uri, temp: [], reason: `no detector class for ${category || 'unknown category'}` };
  }
  const M = manipulator();
  if (!uri || !M?.ImageManipulator?.manipulate) {
    const reason = 'expo-image-manipulator missing';
    console.warn(`[PHOTO CHECK] device verification unavailable: ${reason}`);
    return { status: 'unavailable', uri, temp: [], reason };
  }

  let base = null;
  const t0 = Date.now();
  try {
    console.log(`[PHOTO CHECK] start · ${category}`);
    base = await M.ImageManipulator.manipulate(uri).renderAsync();
    const W = base.width;
    const H = base.height;
    console.log(`[PHOTO CHECK] image ${W}x${H} loaded (+${Date.now() - t0} ms)`);

    const { engine, dets, ms, note } = await runDetector(M, base);
    if (note) console.log(`[PHOTO CHECK] native engine skipped → ${note}`);
    const top = dets.slice(0, 5).map((d) => `${d.label}(${d.cls}) ${d.score.toFixed(2)}`).join(', ') || `nothing ≥ ${DETECT_MIN_SCORE}`;
    console.log(`[PHOTO CHECK] ${category} · ${W}x${H} · ${engine} · inference ${ms} ms · detected: ${top}`);

    const first = decidePhoto(category, dets, null, W / H);
    if (first.status !== 'ok') console.log(`[PHOTO CHECK] REJECTED ${first.status} · detected ${first.detected || '-'} · needs ${acceptedClasses(category).join('/')} ≥ ${DETECT_OK}`);
    if (first.status !== 'ok') return { status: first.status, detected: first.detected, uri, temp: [], score: dets[0]?.score || 0 };

    // Right device, confidently: crop around it and measure sharpness there.
    const best = dets.find((d) => acceptedClasses(category).includes(d.cls));
    const box = best ? { x: best.u0, y: best.v0, w: best.u1 - best.u0, h: best.v1 - best.v0 } : null;
    const crop = box ? padCrop(box, { pad: 0.08, min: 0.25 }) : null;
    const px = crop ? toPixelCrop(crop, W, H) : { originX: 0, originY: 0, width: W, height: H };

    const sharpCtx = M.ImageManipulator.manipulate(base).crop(px);
    if (Math.max(px.width, px.height) > SHARP_EDGE) {
      sharpCtx.resize(px.width >= px.height ? { width: SHARP_EDGE } : { height: SHARP_EDGE });
    }
    const sharp = sharpness(await decode(sharpCtx));
    const final = decidePhoto(category, dets, sharp, W / H);
    console.log(`[PHOTO CHECK] ${final.status === 'ok' ? 'ACCEPTED' : `REJECTED ${final.status}`} · ${final.detected} ${best?.score?.toFixed(2)} · sharpness ${Math.round(sharp)} (min ${BLUR_MIN}) · crop ${crop ? 'yes' : 'no'}`);

    const outCtx = M.ImageManipulator.manipulate(base);
    if (crop) outCtx.crop(px);
    if (Math.max(px.width, px.height) > OUTPUT_EDGE) {
      outCtx.resize(px.width >= px.height ? { width: OUTPUT_EDGE } : { height: OUTPUT_EDGE });
    }
    const outImg = await outCtx.renderAsync();
    const out = await outImg.saveAsync({ compress: 0.85, format: M.SaveFormat?.JPEG || 'jpeg' });
    try { outImg.release?.(); } catch (_) { /* already released */ }

    return {
      status: final.status, detected: final.detected, uri: out.uri, temp: [out.uri],
      width: out.width, height: out.height, score: best?.score, sharp,
    };
  } catch (e) {
    const reason = e?.message || String(e);
    console.warn(`[PHOTO CHECK] device verification unavailable: ${reason} · ${await buildInfo()}`);
    return { status: 'unavailable', uri, temp: [], reason };
  } finally {
    try { base?.release?.(); } catch (_) { /* already released */ }
  }
}
