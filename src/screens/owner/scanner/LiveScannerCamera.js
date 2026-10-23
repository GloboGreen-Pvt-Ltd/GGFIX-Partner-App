// Live product-scanner camera (react-native-vision-camera 5).
//
//   preview  — continuous auto-focus, native pinch-zoom, tap-to-focus (+ ring),
//              zoom chips, torch
//   frames   — one worklet on the camera thread, throttled round-robin so only
//              one heavy job runs per frame: EfficientDet device box (~2/s),
//              ML Kit OCR (~1/s) and ML Kit barcodes (~1.5/s). Frames that
//              arrive while it is busy are dropped, never queued.
//   capture  — photo + the latest box (or the centre reticle when no device is
//              detected / the model could not load) as a normalised crop.
//
// Only mount this when getLiveModules() is non-null (see ProductScanScreen):
// the hooks below are picked once per app session from that result.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import { getLiveModules } from './nativeModules';
import { DETECT_MIN_SCORE, loadDeviceDetector, orientBox, parseBestDevice } from './objectDetector';
import { imageRectToView, padCrop, viewRectToImage } from './geometry';
import { rf } from '../../../utils/responsive';

const LIVE = getLiveModules();
const VC = LIVE?.VC;

const TEAL = '#035C6C';
const DETECT_INTERVAL_MS = 450;
const OCR_INTERVAL_MS = 1100;
const BARCODE_INTERVAL_MS = 650;
const BOX_FRESH_MS = 1500;
const TEXT_FRESH_MS = 8000;
const CODE_FRESH_MS = 15000;
const DEFAULT_ASPECT = 3 / 4; // upright 4:3 frames / photos

// Stable option objects: the ML Kit / resizer hooks memoise on identity, so an
// inline object would rebuild the native recognisers on every render.
const PHOTO_OPTIONS = VC ? { targetResolution: VC.CommonResolutions.FHD_4_3, quality: 0.9, qualityPrioritization: 'balanced' } : null;
const FRAME_RESOLUTION = VC ? VC.CommonResolutions.HD_4_3 : null;
const TEXT_OPTIONS = { language: 'LATIN' };
const BARCODE_OPTIONS = {
  formats: ['QR_CODE', 'CODE_128', 'CODE_39', 'CODE_93', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'DATA_MATRIX', 'ITF', 'PDF417'],
};
const MODEL_SIZE = 320;
const RESIZER_OPTIONS = { width: MODEL_SIZE, height: MODEL_SIZE, channelOrder: 'rgb', dataType: 'uint8', scaleMode: 'stretch', pixelLayout: 'interleaved' };

// Hook choice is fixed for the whole session (module-level flags), so hook
// order never changes between renders.
const useTextRecognitionMaybe = LIVE?.ocr ? () => LIVE.MLKit.useTextRecognition(TEXT_OPTIONS) : () => null;
const useBarcodeScanningMaybe = LIVE?.barcodes ? () => LIVE.MLKit.useBarcodeScanning(BARCODE_OPTIONS) : () => null;
const useResizerMaybe = LIVE?.resizer && LIVE?.tflite ? () => LIVE.Resizer.useResizer(RESIZER_OPTIONS) : () => null;
const useFrameOutputMaybe = LIVE?.frames ? (opts) => VC.useFrameOutput(opts) : () => null;

/** Centre reticle, as a fraction of the camera view. */
function reticleRect(layout) {
  const vw = layout.width || 1;
  const vh = layout.height || 1;
  const w = Math.min(vw * 0.74, 320);
  const h = Math.min(vh * 0.6, w * 1.3);
  return { x: (vw - w) / 2 / vw, y: (vh - h) / 2 / vh, w: w / vw, h: h / vh };
}

/** Box / reticle / focus ring — keeps the ~2-per-second box updates out of the parent's renders. */
const Overlay = forwardRef(function Overlay({ layout, hint }, ref) {
  const [box, setBox] = useState(null);
  const [ring, setRing] = useState(null);
  const missRef = useRef(0);
  const ringTimer = useRef(null);
  useImperativeHandle(ref, () => ({
    setBox(next) {
      if (next) {
        missRef.current = 0;
        setBox((prev) => {
          if (!prev || prev.label !== next.label) return next;
          // Light smoothing so the outline glides instead of jittering.
          const k = 0.55;
          return { ...next, x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k, w: prev.w + (next.w - prev.w) * k, h: prev.h + (next.h - prev.h) * k };
        });
      } else if (++missRef.current >= 2) {
        setBox(null);
      }
    },
    showFocus(x, y) {
      clearTimeout(ringTimer.current);
      setRing({ x, y, key: Date.now() });
      ringTimer.current = setTimeout(() => setRing(null), 900);
    },
  }), []);
  useEffect(() => () => clearTimeout(ringTimer.current), []);

  const vw = layout.width;
  const vh = layout.height;
  if (!vw || !vh) return null;
  const ret = reticleRect(layout);
  const viewBox = box ? imageRectToView(box, vw / vh, box.aspect || DEFAULT_ASPECT) : null;
  const corner = 30;
  const frame = viewBox
    ? { left: viewBox.x * vw, top: viewBox.y * vh, width: viewBox.w * vw, height: viewBox.h * vh }
    : { left: ret.x * vw, top: ret.y * vh, width: ret.w * vw, height: ret.h * vh };
  const color = viewBox ? '#3DDC97' : TEAL;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', ...frame }}>
        {[[0, 0], [0, 1], [1, 0], [1, 1]].map(([v, h]) => (
          <View
            key={`${v}${h}`}
            style={{
              position: 'absolute', width: corner, height: corner, borderColor: color,
              [v ? 'bottom' : 'top']: 0, [h ? 'right' : 'left']: 0,
              [v ? 'borderBottomWidth' : 'borderTopWidth']: 4, [h ? 'borderRightWidth' : 'borderLeftWidth']: 4,
              [`border${v ? 'Bottom' : 'Top'}${h ? 'Right' : 'Left'}Radius`]: 14,
            }}
          />
        ))}
        {viewBox ? (
          <View style={{ position: 'absolute', top: -26, left: 0, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#FFFFFF', fontSize: rf(11), fontWeight: '800' }}>{box.label} found</Text>
          </View>
        ) : null}
      </View>
      {ring ? (
        <View key={ring.key} style={{ position: 'absolute', left: ring.x - 32, top: ring.y - 32, width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#FFFFFF' }} />
      ) : null}
      {hint ? (
        <Text style={{ position: 'absolute', left: 24, right: 24, top: frame.top + frame.height + 14, fontSize: rf(12.5), color: '#FFFFFF', textAlign: 'center', lineHeight: rf(18), textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 }}>
          {viewBox ? `${box.label} detected — tap the shutter` : hint}
        </Text>
      ) : null}
    </View>
  );
});

function LiveScannerCameraImpl({ isActive, torch, hint, chipsBottom = 28, onText, onCodes, onCameraError }, ref) {
  const device = VC.useCameraDevice('back');
  const photoOutput = VC.usePhotoOutput(PHOTO_OPTIONS);
  const text = useTextRecognitionMaybe();
  const barcode = useBarcodeScanningMaybe();
  const resizerState = useResizerMaybe();

  const [detector, setDetector] = useState(null);
  useEffect(() => {
    if (!LIVE?.tflite || !LIVE?.resizer) return undefined;
    let alive = true;
    loadDeviceDetector(LIVE.Tflite)
      .then((d) => {
        if (!alive) return;
        if (d.width === MODEL_SIZE && d.height === MODEL_SIZE) setDetector(d);
        else console.warn(`[SCANNER] detector input ${d.width}x${d.height} != ${MODEL_SIZE} — using the centre reticle`);
      })
      .catch((e) => console.warn('[SCANNER] object detector unavailable, using the centre reticle:', e?.message || String(e)));
    return () => { alive = false; };
  }, []);

  const camRef = useRef(null);
  const overlayRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onText, onCodes, onCameraError };
  const latest = useRef({ box: null, boxAt: 0, text: '', textAt: 0, codes: new Map() });
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Results from the camera thread land here (via scheduleOnRN). Stable
  // identity so the frame worklet isn't re-created on every render.
  const emit = useMemo(() => (kind, payload) => {
    const L = latest.current;
    if (kind === 'box') {
      L.box = payload;
      L.boxAt = Date.now();
      overlayRef.current?.setBox(payload);
    } else if (kind === 'text') {
      L.text = payload;
      L.textAt = Date.now();
      handlers.current.onText?.(payload);
    } else if (kind === 'codes') {
      const now = Date.now();
      payload.forEach((v) => L.codes.set(v, now));
      handlers.current.onCodes?.(payload);
    } else if (kind === 'error') {
      console.warn('[SCANNER] frame processing error (frames keep flowing):', payload);
    }
  }, []);

  // A paused camera forgets its last box so a retake never crops to a stale one.
  useEffect(() => {
    if (isActive) return;
    latest.current.box = null;
    overlayRef.current?.setBox(null);
    overlayRef.current?.setBox(null);
  }, [isActive]);

  const model = detector?.model ?? null;
  const inputBytes = detector?.inputBytes ?? 0;
  const resizer = resizerState?.resizer ?? null;
  const textFn = text?.textRecognition ?? null;
  const barFn = barcode?.barcodeScanning ?? null;
  const enabled = !!isActive;

  const onFrame = useCallback((frame) => {
    'worklet';
    try {
      if (!enabled) return;
      const g = globalThis;
      const now = Date.now();
      g.__ggfixStage = '';
      // A stage that keeps throwing (unsupported device / format) is switched
      // off for the session instead of failing on every frame.
      if (model != null && resizer != null && !((g.__ggfixDetFails || 0) > 5) && now - (g.__ggfixDetAt || 0) >= DETECT_INTERVAL_MS) {
        g.__ggfixDetAt = now;
        g.__ggfixStage = 'det';
        const gpu = resizer.resize(frame);
        let outputs = null;
        try {
          const input = gpu.getPixelBuffer();
          if (input.byteLength === inputBytes) outputs = model.runSync([input]);
          else if (!g.__ggfixSizeWarned) {
            g.__ggfixSizeWarned = true;
            scheduleOnRN(emit, 'error', `detector input is ${input.byteLength} bytes, expected ${inputBytes}`);
          }
        } finally {
          gpu.dispose();
        }
        const best = outputs ? parseBestDevice(outputs, DETECT_MIN_SCORE) : null;
        if (best) {
          const o = frame.orientation;
          const sideways = o === 'left' || o === 'right';
          const r = orientBox(best.u0, best.v0, best.u1, best.v1, o, frame.isMirrored);
          scheduleOnRN(emit, 'box', {
            x: r.x, y: r.y, w: r.w, h: r.h,
            aspect: sideways ? frame.height / frame.width : frame.width / frame.height,
            label: best.label, cls: best.cls, score: best.score,
          });
        } else {
          scheduleOnRN(emit, 'box', null);
        }
      } else if (textFn != null && !((g.__ggfixOcrFails || 0) > 5) && now - (g.__ggfixOcrAt || 0) >= OCR_INTERVAL_MS) {
        g.__ggfixOcrAt = now;
        g.__ggfixStage = 'ocr';
        const r = textFn(frame, { outputOrientation: 'portrait' });
        const t = r && r.text ? String(r.text).trim() : '';
        // Same text is re-sent every few seconds so it stays "fresh" for capture.
        if (t && (t !== g.__ggfixLastText || now - (g.__ggfixTextSentAt || 0) > 4000)) {
          g.__ggfixLastText = t;
          g.__ggfixTextSentAt = now;
          scheduleOnRN(emit, 'text', t.slice(0, 2000));
        }
      } else if (barFn != null && !((g.__ggfixBarFails || 0) > 5) && now - (g.__ggfixBarAt || 0) >= BARCODE_INTERVAL_MS) {
        g.__ggfixBarAt = now;
        g.__ggfixStage = 'bar';
        const r = barFn(frame, { outputOrientation: 'portrait' });
        const list = r && r.barcodes ? r.barcodes : [];
        const values = [];
        for (let i = 0; i < list.length && i < 5; i += 1) {
          const v = list[i].rawValue || list[i].displayValue;
          if (v) values.push(String(v).slice(0, 300));
        }
        if (values.length) scheduleOnRN(emit, 'codes', values);
      }
    } catch (e) {
      const g = globalThis;
      if (g.__ggfixStage === 'det') g.__ggfixDetFails = (g.__ggfixDetFails || 0) + 1;
      else if (g.__ggfixStage === 'ocr') g.__ggfixOcrFails = (g.__ggfixOcrFails || 0) + 1;
      else if (g.__ggfixStage === 'bar') g.__ggfixBarFails = (g.__ggfixBarFails || 0) + 1;
      if (!g.__ggfixErrAt || Date.now() - g.__ggfixErrAt > 10000) {
        g.__ggfixErrAt = Date.now();
        scheduleOnRN(emit, 'error', `${g.__ggfixStage}: ${String((e && e.message) || e)}`);
      }
    } finally {
      frame.dispose();
    }
  }, [enabled, model, resizer, inputBytes, textFn, barFn, emit]);

  const frameOutput = useFrameOutputMaybe({
    targetResolution: FRAME_RESOLUTION,
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped: noop,
  });

  const outputs = useMemo(() => (frameOutput ? [photoOutput, frameOutput] : [photoOutput]), [photoOutput, frameOutput]);
  const constraints = useMemo(
    () => (frameOutput ? [{ resolutionBias: photoOutput }, { resolutionBias: frameOutput }] : [{ resolutionBias: photoOutput }]),
    [photoOutput, frameOutput],
  );

  // ── zoom ──
  const [zoom, setZoom] = useState(null); // { ratio, min, max, display }
  const readZoom = useCallback((retry = true) => {
    const c = camRef.current?.controller;
    if (!c) {
      if (retry) setTimeout(() => readZoom(false), 400);
      return;
    }
    const ratio = c.zoom > 0 && c.displayableZoomFactor > 0 ? c.displayableZoomFactor / c.zoom : 1;
    setZoom({ ratio, min: c.minZoom, max: c.maxZoom, display: Math.round(c.zoom * ratio * 10) / 10 });
  }, []);
  const chips = useMemo(() => {
    if (!zoom) return [];
    const minD = zoom.min * zoom.ratio;
    const maxD = zoom.max * zoom.ratio;
    const out = [];
    if (minD < 0.95) out.push(Math.round(minD * 10) / 10);
    out.push(1);
    if (maxD >= 2) out.push(2);
    if (maxD >= 4) out.push(maxD >= 5 ? 5 : 4);
    return out;
  }, [zoom]);
  const setDisplayZoom = useCallback((d) => {
    const c = camRef.current?.controller;
    if (!c || !zoom) return;
    const z = Math.max(c.minZoom, Math.min(c.maxZoom, d / zoom.ratio));
    c.setZoom(z).then(() => readZoom(false), () => {});
    setZoom((prev) => (prev ? { ...prev, display: d } : prev));
  }, [zoom, readZoom]);

  // ── tap to focus (pinch is the native gesture) ──
  const touch = useRef(null);
  const onTouchStart = (e) => {
    const n = e.nativeEvent;
    touch.current = { x: n.locationX, y: n.locationY, t: Date.now(), multi: (n.touches?.length || 1) > 1 };
  };
  const onTouchMove = (e) => {
    if (touch.current && (e.nativeEvent.touches?.length || 1) > 1) touch.current.multi = true;
  };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    if (s.multi) { setTimeout(() => readZoom(false), 120); return; }
    // Taps on the zoom chips aren't focus taps.
    if (chips.length > 1 && s.y > layoutRef.current.height - chipsBottom - 48) return;
    const n = e.nativeEvent;
    const moved = Math.hypot((n.locationX ?? s.x) - s.x, (n.locationY ?? s.y) - s.y);
    if (moved > 12 || Date.now() - s.t > 350) return;
    overlayRef.current?.showFocus(s.x, s.y);
    camRef.current?.focusTo({ x: s.x, y: s.y }, { responsiveness: 'snappy', adaptiveness: 'continuous', autoResetAfter: 4 }).catch(() => {});
  };

  useImperativeHandle(ref, () => ({
    /** Takes the photo; resolves { uri, crop, cropSource, detected, liveText, liveCodes }. */
    async capture() {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false }, {});
      const path = String(file?.filePath || '');
      if (!path) throw new Error('The camera returned no photo.');
      const uri = /^file:\/\//.test(path) ? path : `file://${path}`;
      const now = Date.now();
      const L = latest.current;
      const box = L.box && now - L.boxAt < BOX_FRESH_MS ? L.box : null;
      let crop = box ? padCrop(box) : null;
      if (!crop && !box) {
        const lay = layoutRef.current;
        if (lay.width && lay.height) crop = padCrop(viewRectToImage(reticleRect(lay), lay.width / lay.height, DEFAULT_ASPECT), { pad: 0.06, min: 0.3 });
      }
      const pxW = box ? box.w * (box.aspect || DEFAULT_ASPECT) : 0;
      const pxH = box ? box.h : 0;
      return {
        uri,
        crop,
        cropSource: box ? 'detector' : crop ? 'reticle' : 'full',
        detected: box ? { label: box.label, cls: box.cls, score: box.score, elongation: pxW && pxH ? Math.max(pxW, pxH) / Math.min(pxW, pxH) : 0 } : null,
        liveText: now - L.textAt < TEXT_FRESH_MS ? L.text : '',
        liveCodes: [...L.codes.entries()].filter(([, at]) => now - at < CODE_FRESH_MS).map(([v]) => v),
      };
    },
  }), [photoOutput]);

  const onError = useCallback((e) => {
    console.warn('[SCANNER] camera error:', e?.message || String(e));
    handlers.current.onCameraError?.(e);
  }, []);
  const hasTorch = !!device?.hasTorch;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {device ? (
        <VC.Camera
          ref={camRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={!!isActive}
          outputs={outputs}
          constraints={constraints}
          orientationSource="interface"
          torchMode={torch && hasTorch ? 'on' : 'off'}
          enableNativeZoomGesture
          resizeMode="cover"
          onStarted={readZoom}
          onError={onError}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      <Overlay ref={overlayRef} layout={layout} hint={hint} />
      {chips.length > 1 && isActive ? (
        <View style={{ position: 'absolute', bottom: chipsBottom, alignSelf: 'center', flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 4 }}>
          {chips.map((d) => {
            const on = zoom && Math.abs(zoom.display - d) < 0.15;
            return (
              <Pressable
                key={d}
                onPress={() => setDisplayZoom(d)}
                accessibilityRole="button"
                accessibilityLabel={`Zoom ${d}x`}
                hitSlop={4}
                style={{ minWidth: 38, height: 32, borderRadius: 16, marginHorizontal: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#FFFFFF' : 'transparent' }}
              >
                <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: on ? '#111111' : '#FFFFFF' }}>{`${d}x`}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function noop() {}

const LiveScannerCamera = forwardRef(LiveScannerCameraImpl);
export default LiveScannerCamera;

/** True when this build has VisionCamera 5 linked (else use the expo-camera fallback). */
export const LIVE_SCANNER_AVAILABLE = !!VC && Platform.OS !== 'web';
