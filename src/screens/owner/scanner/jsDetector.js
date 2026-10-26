// Pure-JavaScript device detector: TensorFlow.js (CPU backend) running
// COCO-SSD lite MobileNet-v2 — the same 90 COCO classes as the native
// EfficientDet, so "cell phone" / "laptop" / "keyboard" … mean the same.
//
// Why it exists: the native TFLite engine needs NitroModules compiled into the
// installed app. An older build (e.g. 58.0.5 (466)) doesn't have them, and
// Metro can't ship native code. This engine is plain JS, so it runs on ANY
// build served by Metro — slower than native (seconds per photo), but real
// inference, fully offline: the weights are bundled in assets/models/coco-ssd-lite.
//
// Model: COCO-SSD lite_mobilenet_v2 (Apache-2.0), from
// https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { COCO_LABELS } from './objectDetector';

/* eslint-disable global-require */
const MODEL_JSON = require('../../../../assets/models/coco-ssd-lite/model.json');
const SHARDS = [
  require('../../../../assets/models/coco-ssd-lite/group1-shard1of5.bin'),
  require('../../../../assets/models/coco-ssd-lite/group1-shard2of5.bin'),
  require('../../../../assets/models/coco-ssd-lite/group1-shard3of5.bin'),
  require('../../../../assets/models/coco-ssd-lite/group1-shard4of5.bin'),
  require('../../../../assets/models/coco-ssd-lite/group1-shard5of5.bin'),
];
/* eslint-enable global-require */

let tf;
let cocoSsd;
let nameToCls;

const stage = (t0, msg) => console.log(`[DETECTOR] JS ${msg} (+${Date.now() - t0} ms)`);
/** Rejects with `what timed out` instead of spinning forever. */
export const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms)),
]);

function utf8Decode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = ((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

/**
 * Hermes is neither a browser nor Node, so tfjs registers no platform by
 * itself. This is the minimal one it needs (fetch / clock / text codecs).
 */
const RN_PLATFORM = {
  fetch: (path, init) => fetch(path, init),
  now: () => (global.performance?.now ? global.performance.now() : Date.now()),
  encode: (text) => {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    const s = unescape(encodeURIComponent(text));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
    return out;
  },
  decode: (bytes, encoding) => {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder(encoding || 'utf-8').decode(bytes);
    return utf8Decode(bytes);
  },
  isTypedArray: (a) => a instanceof Float32Array || a instanceof Int32Array || a instanceof Uint8Array || a instanceof Uint8ClampedArray,
  setTimeoutCustom: (fn, delay) => setTimeout(fn, delay),
};

/** Reads one bundled asset's bytes (Metro in dev, the APK in release). */
async function assetBytes(mod, i, t0) {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error(`model shard ${i + 1} has no uri`);
  const bytes = new Uint8Array(await new File(uri).arrayBuffer());
  stage(t0, `shard ${i + 1}/${SHARDS.length} read: ${bytes.length} bytes`);
  return bytes;
}

let loading = null;

/** Loads tfjs + the model once per session. Rejects with the real error. */
export function loadJsDetector() {
  if (!loading) {
    loading = (async () => {
      const t0 = Date.now();
      stage(t0, 'loading engine…');
      tf = require('@tensorflow/tfjs-core');
      require('@tensorflow/tfjs-backend-cpu');
      require('@tensorflow/tfjs-converter');
      cocoSsd = require('@tensorflow-models/coco-ssd');
      const { CLASSES } = require('@tensorflow-models/coco-ssd/dist/classes');
      nameToCls = {};
      Object.keys(CLASSES).forEach((id) => { nameToCls[CLASSES[id].displayName] = Number(id) - 1; });

      stage(t0, 'tfjs modules loaded');
      if (!tf.env().platformName) tf.setPlatform('rn', RN_PLATFORM);
      await tf.setBackend('cpu');
      await tf.ready();
      stage(t0, `backend ${tf.getBackend()} ready, platform ${tf.env().platformName}`);

      const parts = [];
      for (let i = 0; i < SHARDS.length; i += 1) parts.push(await assetBytes(SHARDS[i], i, t0));
      const total = parts.reduce((n, p) => n + p.length, 0);
      const weightData = new Uint8Array(total);
      let off = 0;
      parts.forEach((p) => { weightData.set(p, off); off += p.length; });
      const handler = {
        load: async () => ({
          modelTopology: MODEL_JSON.modelTopology,
          weightSpecs: MODEL_JSON.weightsManifest.flatMap((g) => g.weights),
          weightData: weightData.buffer,
        }),
      };
      stage(t0, 'weights read, building graph (includes a warm-up run)…');
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: handler });
      console.log(`[DETECTOR] JS engine ready: COCO-SSD lite (tfjs ${tf.version_core}, backend ${tf.getBackend()}, platform ${tf.env().platformName}), ${(total / 1048576).toFixed(1)} MB weights, ${Date.now() - t0} ms`);
      return model;
    })().catch((e) => {
      loading = null;
      console.warn('[DETECTOR] JS engine load failed:', e?.message || String(e));
      throw e;
    });
  }
  return loading;
}

/**
 * RGB (Uint8Array, width*height*3, upright) → detections like
 * parseAllDetections: [{ cls, label, score, u0, v0, u1, v1 }], best first.
 */
export async function detectJs(rgb, width, height, minScore) {
  const model = await withTimeout(loadJsDetector(), 180000, 'JS engine load');
  const input = tf.tensor3d(Int32Array.from(rgb), [height, width, 3], 'int32');
  try {
    const t0 = Date.now();
    stage(t0, `inference start on ${width}x${height}`);
    const preds = await withTimeout(model.detect(input, 20, minScore), 180000, 'JS inference');
    stage(t0, `inference done: ${preds.length} objects`);
    return preds
      .map((p) => {
        const [x, y, w, h] = p.bbox;
        const cls = nameToCls[p.class] ?? -1;
        return {
          cls, label: COCO_LABELS[cls] || p.class, score: p.score,
          u0: Math.max(0, x / width), v0: Math.max(0, y / height),
          u1: Math.min(1, (x + w) / width), v1: Math.min(1, (y + h) / height),
        };
      })
      .sort((a, b) => b.score - a.score);
  } finally {
    input.dispose();
  }
}
