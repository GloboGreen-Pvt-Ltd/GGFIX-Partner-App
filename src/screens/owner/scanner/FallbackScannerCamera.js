// expo-camera capture for builds that predate the VisionCamera 5 scanner (or
// web). Same ref API as LiveScannerCamera: capture() → { uri, crop, ... } with
// the centre reticle as the crop; barcodes are still read live.
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { padCrop, viewRectToImage } from './geometry';
import { rf } from '../../../utils/responsive';

const TEAL = '#035C6C';
const BARCODE_TYPES = ['qr', 'datamatrix', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'pdf417'];

function reticle(layout) {
  const vw = layout.width || 1;
  const vh = layout.height || 1;
  const w = Math.min(vw * 0.74, 320);
  const h = Math.min(vh * 0.6, w * 1.3);
  return { x: (vw - w) / 2 / vw, y: (vh - h) / 2 / vh, w: w / vw, h: h / vh };
}

function FallbackScannerCameraImpl({ isActive, torch, hint, onCodes, onCameraError }, ref) {
  const camRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const seen = useRef(new Map());

  useImperativeHandle(ref, () => ({
    async capture() {
      if (!camRef.current || !ready) throw new Error('Camera is not ready yet.');
      const pic = await camRef.current.takePictureAsync({ quality: 0.85 });
      if (!pic?.uri) throw new Error('The camera returned no photo.');
      const aspect = pic.width && pic.height ? pic.width / pic.height : 3 / 4;
      const crop = layout.width && layout.height
        ? padCrop(viewRectToImage(reticle(layout), layout.width / layout.height, aspect), { pad: 0.06, min: 0.3 })
        : null;
      const now = Date.now();
      return {
        uri: pic.uri,
        crop,
        cropSource: crop ? 'reticle' : 'full',
        detected: null,
        liveText: '',
        liveCodes: [...seen.current.entries()].filter(([, at]) => now - at < 15000).map(([v]) => v),
      };
    },
  }), [ready, layout]);

  const onBarcode = ({ data }) => {
    const v = String(data || '').slice(0, 300);
    if (!v) return;
    const now = Date.now();
    const last = seen.current.get(v);
    seen.current.set(v, now);
    if (!last || now - last > 3000) onCodes?.([v]);
  };

  const r = reticle(layout);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={!!isActive}
        enableTorch={!!torch}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={isActive ? onBarcode : undefined}
        onCameraReady={() => setReady(true)}
        onMountError={(e) => {
          console.warn('[SCANNER] camera mount error:', e?.message || String(e));
          onCameraError?.(e);
        }}
      />
      {layout.width ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', left: r.x * layout.width, top: r.y * layout.height, width: r.w * layout.width, height: r.h * layout.height }}>
            {[[0, 0], [0, 1], [1, 0], [1, 1]].map(([v, h]) => (
              <View
                key={`${v}${h}`}
                style={{
                  position: 'absolute', width: 30, height: 30, borderColor: TEAL,
                  [v ? 'bottom' : 'top']: 0, [h ? 'right' : 'left']: 0,
                  [v ? 'borderBottomWidth' : 'borderTopWidth']: 4, [h ? 'borderRightWidth' : 'borderLeftWidth']: 4,
                  [`border${v ? 'Bottom' : 'Top'}${h ? 'Right' : 'Left'}Radius`]: 14,
                }}
              />
            ))}
          </View>
          {hint ? (
            <Text style={{ position: 'absolute', left: 24, right: 24, top: (r.y + r.h) * layout.height + 14, fontSize: rf(12.5), color: '#FFFFFF', textAlign: 'center', lineHeight: rf(18), textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 }}>
              {hint}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default forwardRef(FallbackScannerCameraImpl);
