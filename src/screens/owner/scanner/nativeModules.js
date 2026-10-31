// Guarded loader for the live-scanner native modules (VisionCamera 5 + ML Kit +
// TFLite + GPU resizer). Every one of them creates its Nitro HybridObject the
// moment it is required, which THROWS on a dev client / store build that was
// compiled before these packages were added. Requiring them here, once, inside
// try/catch lets ProductScanScreen fall back to the old expo-camera capture
// instead of crashing until the next native (EAS) build is installed.
import { Platform } from 'react-native';

// Why each module failed to load, for liveModulesDiagnosis().
const failures = {};
const tryRequire = (load, name) => {
  try { return load(); } catch (e) {
    if (name) failures[name] = String(e?.message || e).split(/\r?\n/)[0].slice(0, 160);
    return null;
  }
};
const tryCall = (fn) => {
  try { return !!fn(); } catch (_) { return false; }
};

let cached;

/**
 * @returns {null | {
 *   VC, MLKit, Resizer, Tflite, scheduleOnRN,
 *   frames: boolean,   // frame outputs (worklets) usable
 *   ocr: boolean,      // ML Kit text recognition compiled in
 *   barcodes: boolean, // ML Kit barcode scanning compiled in
 *   resizer: boolean,  // GPU resizer usable on this device (Vulkan / Metal)
 *   tflite: boolean,   // react-native-fast-tflite linked
 * }}
 */
export function getLiveModules() {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === 'web') return cached;

  const VC = tryRequire(() => require('react-native-vision-camera'), 'react-native-vision-camera');
  if (!VC?.Camera || !VC?.usePhotoOutput || !VC?.useCameraDevice || !VC?.useCameraPermission) return cached;

  const worklets = tryRequire(() => require('react-native-worklets'), 'react-native-worklets');
  const vcWorklets = tryRequire(() => require('react-native-vision-camera-worklets'), 'react-native-vision-camera-worklets');
  const frames = !!(vcWorklets?.provider && typeof worklets?.scheduleOnRN === 'function' && VC.useFrameOutput);

  const MLKit = tryRequire(() => require('react-native-vision-camera-mlkit'));
  const keys = MLKit?.MLKIT_FEATURE_KEYS || {};
  const ocr = !!MLKit && tryCall(() => MLKit.isFeatureAvailable(keys.TEXT_RECOGNITION));
  const barcodes = !!MLKit && tryCall(() => MLKit.isFeatureAvailable(keys.BARCODE_SCANNING));

  const Resizer = tryRequire(() => require('react-native-vision-camera-resizer'), 'react-native-vision-camera-resizer');
  const resizer = !!Resizer?.useResizer && tryCall(() => Resizer.isResizerAvailable());

  const Tflite = tryRequire(() => require('react-native-fast-tflite'), 'react-native-fast-tflite');

  cached = {
    VC,
    MLKit: ocr || barcodes ? MLKit : null,
    Resizer: resizer ? Resizer : null,
    Tflite: Tflite?.loadTensorflowModel ? Tflite : null,
    scheduleOnRN: frames ? worklets.scheduleOnRN : null,
    frames,
    ocr: frames && ocr,
    barcodes: frames && barcodes,
    staticOcr: ocr,
    staticBarcodes: barcodes,
    resizer: frames && resizer,
    tflite: !!Tflite?.loadTensorflowModel,
  };
  return cached;
}

/**
 * Human-readable reason the on-device detector can't run here (for logs and
 * the "Device verification unavailable" screen). Typical: the app is running
 * in Expo Go, or in a dev client / APK built before these native packages.
 */
export function liveModulesDiagnosis() {
  if (Platform.OS === 'web') return 'web has no native detector';
  // 'storeClient' = Expo Go (can never load these modules); 'bare' = a GGFIX build.
  const C = tryRequire(() => require('expo-constants').default);
  const host = C ? `${C.executionEnvironment || '?'}${C.executionEnvironment === 'storeClient' ? ' = EXPO GO' : ''}, app ${C.expoConfig?.android?.package || C.expoConfig?.slug || '?'}` : 'unknown host';
  if (!getLiveModules()) {
    const why = failures['react-native-vision-camera'] || 'VisionCamera API incomplete';
    return `native camera module not in this app build [${host}] (${why}) — install the NearGFix dev build, not Expo Go`;
  }
  const m = getLiveModules();
  if (!m) {
    const why = failures['react-native-vision-camera'] || 'VisionCamera API incomplete';
    return `native camera module not in this app build (${why}) — install the NearGFix dev build, not Expo Go`;
  }
  if (!m.tflite) return `TFLite not in this app build (${failures['react-native-fast-tflite'] || 'loadTensorflowModel missing'})`;
  return 'native modules loaded';
}
