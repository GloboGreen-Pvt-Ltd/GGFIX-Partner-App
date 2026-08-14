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
