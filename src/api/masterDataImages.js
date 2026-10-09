import { normalizeDeviceImageUrl } from '../utils/images';

/**
 * Resolve image source for master data (brands, models) from API.
 * Prefers base64 when present (no network), else falls back to imageUrl.
 * imageUrl is run through normalizeDeviceImageUrl so Cloudinary `.avif` assets
 * (which RN <Image> renders blank on Android) are forced to JPEG.
 * @param {{ imageBase64?: string | null, imageUrl?: string | null }} item - brand or model from GET /master/brands or /master/brands/:id/models
 * @param {string} [fallbackUrl] - optional fallback when both are missing
 * @returns {{ uri: string } | number} - source for <Image source={...} /> or require() for local
 */
export function getMasterImageSource(item, fallbackUrl) {
  const fallback = fallbackUrl ? { uri: normalizeDeviceImageUrl(fallbackUrl) || fallbackUrl } : { uri: '' };
  if (!item) return fallback;
  const b64 = item.imageBase64 && item.imageBase64.trim();
  if (b64) return { uri: `data:image/png;base64,${b64}` };
  const url = item.imageUrl && item.imageUrl.trim();
  if (url) return { uri: normalizeDeviceImageUrl(url) || url };
  return fallback;
}
