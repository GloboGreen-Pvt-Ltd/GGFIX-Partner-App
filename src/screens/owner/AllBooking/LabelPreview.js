import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { DEFAULT_LABEL_PRESET } from '../../../services/printer/labelPresets';
import { computeLabelLayout, labelTexts } from '../../../services/printer/tspl';

const INK = '#111111';

/**
 * Presentational mock of the physical sticker for the selected Page Setup
 * preset (38x25 or 50x25mm): service number centered on top, QR left +
 * brand/customer/security on the right (no headings), created-on centered
 * on the bottom. Drawn from the SAME dot layout and truncated strings
 * src/services/printer/tspl.js prints (computeLabelLayout / labelTexts),
 * scaled to the measured preview width — so the aspect ratio, QR position
 * and text positions follow the preset exactly. Preview only: the printer
 * generates its own QR from the TSPL `QRCODE` command, not from this.
 *
 * `scale` only softens the frame's corner radius on the large main preview.
 */
export default function LabelPreview({
  trackingId, brandModel, customerName, deviceSecurity, createdOn,
  preset = DEFAULT_LABEL_PRESET, scale = 1,
}) {
  const [innerWidth, setInnerWidth] = useState(0);
  const layout = useMemo(() => computeLabelLayout(preset, trackingId), [preset, trackingId]);
  const t = useMemo(
    () => labelTexts({ trackingId, brandModel, customerName, deviceSecurity, createdOn }, layout),
    [trackingId, brandModel, customerName, deviceSecurity, createdOn, layout],
  );
  // Preview pixels per printer dot.
  const k = innerWidth / layout.widthDots;
  const { top, qr, text, bottom } = layout;

  const line = (band, y, value, { align = 'left', weight = '700', x = band.x, width = band.width, boost = 0 } = {}) => (
    <View style={{ position: 'absolute', left: x * k, top: y * k, width: width * k, height: band.height * k, justifyContent: 'center' }}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          fontSize: band.height * k * 0.82 + boost,
          lineHeight: band.height * k,
          fontWeight: weight,
          color: INK,
          textAlign: align,
          includeFontPadding: false,
        }}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        aspectRatio: layout.preset.widthMm / layout.preset.heightMm,
        width: '100%',
        borderWidth: 1.5,
        borderColor: INK,
        borderRadius: Math.round(6 * scale),
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      <View style={{ flex: 1 }} onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
        {k > 0 ? (
          <>
            {line({ ...top, height: t.topLine.font.height }, top.y + t.topLine.dy, t.topLine.text || '—', { align: 'center', weight: '800' })}
            {/* QR drawn 2px smaller than its slot, centred in it. */}
            <View style={{ position: 'absolute', left: qr.x * k, top: qr.y * k, width: qr.size * k, height: qr.size * k, alignItems: 'center', justifyContent: 'center' }}>
              <QRCode value={String(trackingId || 'NO-ID')} size={Math.max(1, Math.floor(qr.size * k) - 2)} color="#000000" backgroundColor="#FFFFFF" />
            </View>
            {/* Same fitted lines the printer gets (smaller font / two lines when long). */}
            {t.details.map((d, i) => d.lines.map((l, j) => (
              <React.Fragment key={`d${i}-${j}`}>
                {line({ ...text, height: d.font.height }, text.ys[i] + l.dy, l.text || '—')}
              </React.Fragment>
            )))}
            {/* BarCode1: date / time 1px larger. */}
            {t.createdLine ? line(bottom, bottom.y, t.createdLine, { align: 'center', weight: '600', boost: layout.preset.id === 'barcode1' ? 1 : 0 }) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
