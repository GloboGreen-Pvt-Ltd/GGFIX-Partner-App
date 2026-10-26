// Normalised-rectangle helpers shared by the live scanner overlay and the
// photo crop. All rects are { x, y, w, h } in 0..1 of their own space.
//
// The preview fills the screen with resizeMode 'cover', so the camera image
// (aspect `imageAspect` = width / height, upright) is scaled until it covers
// the view (aspect `viewAspect`) and the overflow is cut off-centre-evenly.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** View-normalised rect → image-normalised rect (what part of the photo it shows). */
export function viewRectToImage(rect, viewAspect, imageAspect) {
  if (!rect || !(viewAspect > 0) || !(imageAspect > 0)) return rect;
  if (imageAspect > viewAspect) {
    // Image is wider than the view: full height visible, sides cropped.
    const f = viewAspect / imageAspect;
    return { x: 0.5 + (rect.x - 0.5) * f, y: rect.y, w: rect.w * f, h: rect.h };
  }
  const f = imageAspect / viewAspect;
  return { x: rect.x, y: 0.5 + (rect.y - 0.5) * f, w: rect.w, h: rect.h * f };
}

/** Image-normalised rect → view-normalised rect (for drawing the box). */
export function imageRectToView(rect, viewAspect, imageAspect) {
  if (!rect || !(viewAspect > 0) || !(imageAspect > 0)) return rect;
  if (imageAspect > viewAspect) {
    const f = viewAspect / imageAspect;
    return { x: 0.5 + (rect.x - 0.5) / f, y: rect.y, w: rect.w / f, h: rect.h };
  }
  const f = imageAspect / viewAspect;
  return { x: rect.x, y: 0.5 + (rect.y - 0.5) / f, w: rect.w, h: rect.h / f };
}

/**
 * Pads a detected box so the whole device (and its label/sticker edges) stays
 * in the crop, enforces a minimum size, and clamps to the image. Returns null
 * when the crop would be (nearly) the whole image anyway.
 */
export function padCrop(rect, { pad = 0.12, min = 0.3 } = {}) {
  if (!rect || !(rect.w > 0) || !(rect.h > 0)) return null;
  let w = Math.max(min, rect.w * (1 + pad * 2));
  let h = Math.max(min, rect.h * (1 + pad * 2));
  w = Math.min(1, w);
  h = Math.min(1, h);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const x = clamp01(Math.min(cx - w / 2, 1 - w));
  const y = clamp01(Math.min(cy - h / 2, 1 - h));
  if (w * h > 0.9) return null;
  return { x, y, w, h };
}

/** Normalised rect → integer pixel crop inside a width x height image. */
export function toPixelCrop(rect, width, height) {
  const originX = Math.max(0, Math.min(width - 1, Math.round(rect.x * width)));
  const originY = Math.max(0, Math.min(height - 1, Math.round(rect.y * height)));
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(width - originX, Math.round(rect.w * width))),
    height: Math.max(1, Math.min(height - originY, Math.round(rect.h * height))),
  };
}
