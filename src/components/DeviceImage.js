import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import { resolveDeviceImageSource } from '../utils/images';

/**
 * Renders catalog images (brand logos, category/model thumbnails) via
 * expo-image instead of RN's built-in <Image>.
 *
 * Why: many catalog images are stored as inline `data:image/avif;base64,…`
 * (AVIF with an alpha channel — the MediaController base64 fallback). RN's
 * built-in Android <Image> mis-decodes AVIF-with-alpha on some OEM decoders
 * (e.g. MIUI/Redmi), painting the transparent area solid BLACK, while newer
 * decoders (e.g. ColorOS/OPPO) render it fine. expo-image uses the Glide
 * pipeline, which decodes AVIF + alpha consistently across devices.
 *
 * Accepts { url, base64 } exactly as the pickers already hold them; returns
 * null when there's no image so callers can render their own fallback.
 */
export default function DeviceImage({ url, base64, style, contentFit = 'contain', ...rest }) {
  const uri = resolveDeviceImageSource({ url, base64 });
  if (!uri) return null;
  return <ExpoImage source={uri} style={style} contentFit={contentFit} transition={0} {...rest} />;
}
