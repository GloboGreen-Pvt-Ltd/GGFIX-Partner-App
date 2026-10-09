// master_models.image_url is stored as .avif on Cloudinary, which RN's
// <Image> can't decode on Android (renders blank). Run every device-image
// URL through this normalizer to force Cloudinary to return JPEG bytes.

const CLOUDINARY_HOST = 'res.cloudinary.com';
const UNSUPPORTED_EXT = /\.(avif|heic|heif)(\?.*)?$/i;

export function normalizeDeviceImageUrl(url) {
  if (!url) return null;
  const s = String(url);
  if (s.startsWith('data:')) return s;
  if (!s.includes(CLOUDINARY_HOST)) return s;
  if (!UNSUPPORTED_EXT.test(s)) return s;
  if (/\/upload\/[^/]*f_(jpg|png|webp|auto)/i.test(s)) return s;
  return s.replace('/upload/', '/upload/f_jpg/');
}

export function resolveDeviceImageSource({ url, base64 } = {}) {
  const normalized = normalizeDeviceImageUrl(url);
  if (normalized) return normalized;
  if (!base64) return null;
  const value = String(base64);
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

// Shop/owner avatar photos come from a direct S3 upload (no Cloudinary
// transform available), so unlike normalizeDeviceImageUrl above this can't
// force a decodable format server-side — it only trims/validates the URL
// and upgrades http:// to https:// (ColorOS and other stricter Android
// builds can block cleartext image requests outright). The actual
// cross-device decode fix is ProfileAvatar.tsx rendering via expo-image
// instead of RN's built-in <Image>, same reasoning as DeviceImage.js.
export function normalizeImageUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed.replace('http://', 'https://');
  return trimmed;
}
