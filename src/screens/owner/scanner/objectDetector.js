// On-device "is there a device in frame, and where?" for the live product
// scanner. The box is only used to crop the photo before it is uploaded and to
// draw the outline — it never names a model (that is the server's job, and
// the user always confirms the model with a tap).
//
// Model: EfficientDet-Lite0 (COCO, 320x320 uint8 RGB in; TFLite detection
// post-processing out: location [1,25,4] (ymin,xmin,ymax,xmax 0..1),
// category [1,25], score [1,25], count [1]). Apache-2.0, from the official
// TensorFlow Lite task-library bucket:
// https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/object_detection/android/lite-model_efficientdet_lite0_detection_metadata_1.tflite
// (same model as tfhub.dev/tensorflow/lite-model/efficientdet/lite0/detection/metadata/1).
import { Asset } from 'expo-asset';

// eslint-disable-next-line global-require
const MODEL_ASSET = require('../../../../assets/models/efficientdet_lite0.tflite');

// 0-based COCO label-map indices (labelmap.txt embedded in the model) that
// count as "a device" for GGFIX: phones/tablets, laptops, screens, watches,
// keyboards/mice and remotes (often how a phone face-down reads).
export const DEVICE_LABELS = {
  76: 'Phone',
  72: 'Laptop',
  71: 'Screen',
  84: 'Watch',
  75: 'Keyboard',
  73: 'Mouse',
  74: 'Remote',
};
export const DETECT_MIN_SCORE = 0.32;
export const PHONE_CLASS = 76;

let loading = null;

/**
 * Loads the bundled model once per app session. Resolves to
 * { model, width, height, inputBytes }; rejects (never throws synchronously)
 * when the model or the TFLite runtime is unavailable — callers then fall back
 * to the centre reticle crop.
 */
export function loadDeviceDetector(Tflite) {
  if (!Tflite?.loadTensorflowModel) return Promise.reject(new Error('TFLite is not in this build'));
  if (!loading) {
    loading = (async () => {
      // expo-asset copies the bundled file (res/raw in release, Metro in dev)
      // to a local file:// path, which the TFLite asset loader can read.
      const asset = Asset.fromModule(MODEL_ASSET);
      await asset.downloadAsync();
      const url = asset.localUri || asset.uri;
      if (!url) throw new Error('model asset has no uri');
      const model = await Tflite.loadTensorflowModel({ url }, []);
      const input = model?.inputs?.[0];
      const shape = input?.shape || [];
      const height = Number(shape[1]) || 0;
      const width = Number(shape[2]) || 0;
      if (!height || !width || Number(shape[3]) !== 3 || input.dataType !== 'uint8') {
        throw new Error(`unexpected detector input ${input?.dataType} [${shape.join(',')}]`);
      }
      console.log(`[DETECTOR] model loaded: input ${input.dataType} [${shape.join(',')}], ${model.outputs?.length ?? '?'} outputs`);
      return { model, width, height, inputBytes: width * height * 3 };
    })().catch((e) => {
      console.warn('[DETECTOR] model load failed:', e?.message || String(e));
      loading = null; // allow a retry on the next scanner mount
      throw e;
    });
  }
  return loading;
}

/** True when every sampled value is (close to) a whole number — class ids are, scores aren't. */
function looksIntegral(arr, count) {
  'worklet';
  const n = Math.min(arr.length, Math.max(3, count));
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(arr[i] - Math.round(arr[i])) > 0.0001) return false;
  }
  return true;
}

const clamp01 = (v) => {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

/**
 * Model outputs → the most likely device box, in model-input (= frame buffer)
 * normalised coordinates, or null. Picks outputs by size so a differently
 * ordered export still parses: count has 1 value, boxes 4x the others.
 * `onlyCls` (optional) keeps a single COCO class, e.g. 76 for phones only.
 */
/** Model outputs → { boxes, classes, scores, count }, or null when unparseable. */
function splitOutputs(outputs) {
  'worklet';
  if (!outputs || outputs.length < 3) return null;
  const arrays = [];
  for (let i = 0; i < outputs.length; i += 1) arrays.push(new Float32Array(outputs[i]));
  let num = null;
  const rest = [];
  for (let i = 0; i < arrays.length; i += 1) {
    if (arrays[i].length === 1 && num === null) num = arrays[i];
    else rest.push(arrays[i]);
  }
  let boxes = null;
  for (let i = 0; i < rest.length && !boxes; i += 1) {
    for (let j = 0; j < rest.length; j += 1) {
      if (i !== j && rest[j].length * 4 === rest[i].length) { boxes = rest[i]; break; }
    }
  }
  if (!boxes) return null;
  const pair = [];
  for (let i = 0; i < rest.length; i += 1) if (rest[i] !== boxes && rest[i].length * 4 === boxes.length) pair.push(rest[i]);
  if (pair.length < 2) return null;
  let classes = pair[0];
  let scores = pair[1];
  const detected = num ? Math.round(num[0]) : scores.length;
  const count = Math.max(0, Math.min(detected, scores.length, boxes.length / 4));
  if (looksIntegral(scores, count) && !looksIntegral(classes, count)) { const t = classes; classes = scores; scores = t; }
  return { boxes, classes, scores, count };
}

export function parseBestDevice(outputs, minScore, onlyCls) {
  'worklet';
  const split = splitOutputs(outputs);
  if (!split) return null;
  const { boxes, classes, scores, count } = split;
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const score = scores[i];
    if (!(score >= minScore)) continue;
    const cls = Math.round(classes[i]);
    const label = DEVICE_LABELS[cls];
    if (!label || (onlyCls != null && onlyCls >= 0 && cls !== onlyCls)) continue;
    const v0 = clamp01(boxes[i * 4]);
    const u0 = clamp01(boxes[i * 4 + 1]);
    const v1 = clamp01(boxes[i * 4 + 2]);
    const u1 = clamp01(boxes[i * 4 + 3]);
    const w = u1 - u0;
    const h = v1 - v0;
    if (w < 0.04 || h < 0.04) continue;
    // Prefer confident, central, reasonably large boxes (what the user aims at).
    const cx = (u0 + u1) / 2 - 0.5;
    const cy = (v0 + v1) / 2 - 0.5;
    const central = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) / 0.7);
    const rank = score * (0.7 + 0.3 * central) * (0.8 + 0.2 * Math.min(1, w * h * 3));
    if (!best || rank > best.rank) best = { cls, label, score, rank, u0, v0, u1, v1 };
  }
  return best;
}

/**
 * Every detection ≥ minScore, any COCO class, highest score first:
 * [{ cls, label, score, u0, v0, u1, v1 }] (box normalised to the model input).
 */
export function parseAllDetections(outputs, minScore) {
  const split = splitOutputs(outputs);
  if (!split) return [];
  const { boxes, classes, scores, count } = split;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (!(scores[i] >= minScore)) continue;
    const cls = Math.round(classes[i]);
    out.push({
      cls, label: COCO_LABELS[cls] || 'Unknown object', score: scores[i],
      v0: clamp01(boxes[i * 4]), u0: clamp01(boxes[i * 4 + 1]), v1: clamp01(boxes[i * 4 + 2]), u1: clamp01(boxes[i * 4 + 3]),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// 0-based COCO-90 label map (the one embedded in the model; '' = unused id).
export const COCO_LABELS = [
  'Person', 'Bicycle', 'Car', 'Motorcycle', 'Airplane', 'Bus', 'Train', 'Truck', 'Boat', 'Traffic light',
  'Fire hydrant', '', 'Stop sign', 'Parking meter', 'Bench', 'Bird', 'Cat', 'Dog', 'Horse', 'Sheep',
  'Cow', 'Elephant', 'Bear', 'Zebra', 'Giraffe', '', 'Backpack', 'Umbrella', '', '',
  'Handbag', 'Tie', 'Suitcase', 'Frisbee', 'Skis', 'Snowboard', 'Sports ball', 'Kite', 'Baseball bat', 'Baseball glove',
  'Skateboard', 'Surfboard', 'Tennis racket', 'Bottle', '', 'Wine glass', 'Cup', 'Fork', 'Knife', 'Spoon',
  'Bowl', 'Banana', 'Apple', 'Sandwich', 'Orange', 'Broccoli', 'Carrot', 'Hot dog', 'Pizza', 'Donut',
  'Cake', 'Chair', 'Couch', 'Potted plant', 'Bed', '', 'Dining table', '', '', 'Toilet',
  '', 'TV / Monitor', 'Laptop', 'Mouse', 'Remote', 'Keyboard', 'Mobile Phone', 'Microwave', 'Oven', 'Toaster',
  'Sink', 'Refrigerator', '', 'Book / Notebook', 'Clock', 'Vase', 'Scissors', 'Teddy bear', 'Hair drier', 'Toothbrush',
];

/**
 * Buffer-space box → upright (what the user sees) normalised { x, y, w, h }.
 * Frame.orientation says how the buffer is rotated relative to upright
 * ('left' = rotated -90°, so it is turned +90° to stand up; Android's usual
 * portrait case), see VisionCamera's Frame.orientation docs.
 */
export function orientBox(u0, v0, u1, v1, orientation, mirrored) {
  'worklet';
  const map = (u, v) => {
    if (orientation === 'left') return [1 - v, u];
    if (orientation === 'right') return [v, 1 - u];
    if (orientation === 'down') return [1 - u, 1 - v];
    return [u, v];
  };
  const a = map(u0, v0);
  const b = map(u1, v1);
  let x0 = Math.min(a[0], b[0]);
  let x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  if (mirrored) { const t = x0; x0 = 1 - x1; x1 = 1 - t; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
