// Responsive SPACING for the shop app — the other half of theme/fontScaling.js.
//
// fontScaling.js already makes every `fontSize` device-relative by patching
// Text/TextInput once at app start, so screens must NOT scale font sizes
// themselves — doing both would apply the multiplier twice and the type would
// grow on a big phone exactly where it was meant to stay put.
//
// Nothing does that for padding, margins, gaps or fixed heights, which are still
// raw pixels everywhere. On a 360pt phone a 16pt gutter eats proportionally more
// of the screen than the same gutter on a 412pt one, so a layout tuned on one
// reads cramped or wasteful on the other. `rs()` closes that gap.
//
// Deliberately the SAME curve as fontScaling: half the width delta, clamped, off
// a 392pt baseline. Type and spacing that drift apart is what makes a screen
// look subtly wrong at the edges of the device range.

import { Dimensions, PixelRatio } from 'react-native';

const { width, height } = Dimensions.get('window');
// Short side, so rotating a phone or opening on a tablet can't inflate the
// layout the way tracking `width` alone would.
const shortSide = Math.min(width, height);

const GUIDELINE_BASE_WIDTH = 392; // ~iPhone 14 / Pixel 7
const widthScale = shortSide / GUIDELINE_BASE_WIDTH;

// Track only half the delta, then clamp. A small phone tightens a little, a
// tablet loosens a little, and neither runs away.
export const SPACE_SCALE = Math.min(Math.max(1 + (widthScale - 1) * 0.5, 0.88), 1.14);

/**
 * Responsive spacing. Use for padding, margin, gap, and any FIXED height or
 * width that has to stay in proportion with them (avatars, icon tiles, rows).
 *
 * Rounded to the device pixel grid rather than to whole points: a 0.5pt residue
 * on a 2.75x screen is a visibly soft hairline, and borders are the main thing
 * this is used on.
 */
export const rs = (n) =>
  typeof n === 'number' && Number.isFinite(n)
    ? PixelRatio.roundToNearestPixel(n * SPACE_SCALE)
    : n;

/** Phones narrower than this lose a gutter or two — see the ledger screens. */
export const isNarrow = shortSide < 360;
