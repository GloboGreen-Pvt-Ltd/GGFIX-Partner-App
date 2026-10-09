import { Dimensions, PixelRatio } from 'react-native';

/**
 * Responsive sizing for the shop app. Mirrors the customer and employee apps'
 * src/utils/responsive.js so a value means the same thing in all three.
 *
 * Two independent things make the SAME screen look "text too big on one phone,
 * too small on another":
 *
 *  1. SCREEN WIDTH — a fixed 14px reads fine on a 375px design phone but wraps
 *     on a 320px phone and looks cramped on a 430px+ one. Every size is scaled
 *     by width against a 375px guideline, CLAMPED to ±12% so it never runs away
 *     in either direction.
 *
 *  2. OS FONT-SIZE SETTING — Android/iOS "Font size" multiplies all text by
 *     1.0–2.0×, and that multiplier differs per device, so the same dp size
 *     renders bigger on a phone set to "Large". That multiplier is CAPPED at
 *     1.2× here — which is what stops a shop tablet set to a large system font
 *     from pushing a price field's label onto three lines.
 *
 * The cap is applied INSIDE rf() rather than via `Text.defaultProps
 * .maxFontSizeMultiplier`, because React 19 (Expo SDK 54) ignores defaultProps
 * on function components — RN's <Text> is one — so that global hook silently
 * no-ops. Instead we pre-divide by the real OS scale and let RN re-apply it
 * (allowFontScaling defaults to true), which nets out to the capped multiplier
 * on every <Text> that uses rf().
 *
 * Both scales are read once at module load. The app is portrait-locked and a
 * font-size change needs an app restart to take effect, so a single read is
 * sufficient — matching how Dimensions is used elsewhere in this codebase.
 */
const GUIDELINE_WIDTH = 375;
const MIN_WIDTH_SCALE = 0.88;
const MAX_WIDTH_SCALE = 1.12;
const MAX_OS_FONT_SCALE = 1.2;

const { width, height } = Dimensions.get('window');
// Short side = portrait width even if the device briefly reports landscape.
const shortSide = Math.min(width, height);

const rawWidthScale = shortSide / GUIDELINE_WIDTH;
export const fontScale = Math.min(Math.max(rawWidthScale, MIN_WIDTH_SCALE), MAX_WIDTH_SCALE);

const osFontScale = PixelRatio.getFontScale() || 1;
const cappedOsScale = Math.min(osFontScale, MAX_OS_FONT_SCALE);
// RN re-multiplies a Text's fontSize by osFontScale, so pre-divide to land on
// the capped scale. lineHeight is NOT re-multiplied by RN, so it uses the
// capped scale directly (see rlh) — otherwise lines clip on large-font phones.
const osCorrection = cappedOsScale / osFontScale;

/** Responsive font size in px (width-scaled + OS-scale capped), pixel-rounded. */
export function rf(size) {
  return PixelRatio.roundToNearestPixel(size * fontScale * osCorrection);
}

/**
 * Responsive line height paired with an rf() font size. Applies the capped OS
 * scale directly (not the correction factor) because RN leaves lineHeight
 * un-scaled — this keeps line height proportional to the rendered font size so
 * text never clips when the device font size is large.
 */
export function rlh(size) {
  return PixelRatio.roundToNearestPixel(size * fontScale * cappedOsScale);
}

/**
 * Responsive SPACING (padding / margin / gap / fixed pixel sizes). Unlike rf(),
 * this is NOT affected by the OS font-size setting — only by screen width,
 * against the same 375px guideline and clamped to the same ±12%. Use it for
 * gaps, card padding, icon boxes and any fixed dp size that should breathe a
 * little more on large phones and tighten on small ones.
 */
export function rs(size) {
  return PixelRatio.roundToNearestPixel(size * fontScale);
}

// Portrait short-side width, read once at module load (app is portrait-locked).
export const screenWidth = shortSide;

// Coarse device buckets for layout decisions.
export const isSmallDevice = shortSide < 360;
export const isLargeDevice = shortSide >= 414;
export const isTablet = shortSide >= 600;
