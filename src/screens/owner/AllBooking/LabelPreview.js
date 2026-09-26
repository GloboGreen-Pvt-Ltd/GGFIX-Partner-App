import React from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const INK = '#10201B';

/**
 * Presentational mock of the physical 38x25mm sticker: service number
 * centered on top, QR left + brand/customer/security on the right (no
 * headings), created-on centered on the bottom. Matches
 * src/services/printer/tspl.js's content/order exactly — this is a preview
 * only, the printer generates its own QR from the TSPL `QRCODE` command, not
 * from this component.
 *
 * `scale` lets the same component read right both tiny (inside
 * PrinterConnectSheet, scale=1) and large (BarcodePrintScreen's main
 * preview, scale>1) without duplicating the layout.
 */
export default function LabelPreview({ trackingId, brandModel, customerName, deviceSecurity, createdOn, scale = 1 }) {
  const s = (n) => Math.round(n * scale);
  const createdLine = createdOn ? `${createdOn.date}  ${createdOn.time}` : null;

  return (
    <View
      style={{
        aspectRatio: 38 / 25,
        width: '100%',
        borderWidth: 1.5,
        borderColor: INK,
        borderRadius: s(6),
        backgroundColor: '#FFFFFF',
        padding: s(8),
      }}
    >
      <Text
        style={{ fontSize: s(12), fontWeight: '800', color: INK, textAlign: 'center' }}
        numberOfLines={1}
      >
        {trackingId || '—'}
      </Text>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginTop: s(4) }}>
        <View
          style={{
            aspectRatio: 1,
            height: '92%',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(8),
          }}
        >
          <QRCode value={String(trackingId || 'NO-ID')} size={s(54)} color="#000000" backgroundColor="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(10), fontWeight: '700', color: INK }} numberOfLines={1}>
            {brandModel || '—'}
          </Text>
          <Text style={{ fontSize: s(10), fontWeight: '700', color: INK, marginTop: s(3) }} numberOfLines={1}>
            {customerName || '—'}
          </Text>
          <Text style={{ fontSize: s(10), fontWeight: '700', color: INK, marginTop: s(3) }} numberOfLines={1}>
            {deviceSecurity || '—'}
          </Text>
        </View>
      </View>

      {createdLine ? (
        <Text style={{ fontSize: s(8.5), fontWeight: '600', color: INK, textAlign: 'center' }} numberOfLines={1}>
          {createdLine}
        </Text>
      ) : null}
    </View>
  );
}
