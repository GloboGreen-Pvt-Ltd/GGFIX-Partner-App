// Device-responsive spacing for every NativeWind class in the app.
//
// ── THE PROBLEM ────────────────────────────────────────────────────────────
// `theme/fontScaling.js` already makes every fontSize device-relative, and
// `theme/metrics.js` exposes `rs()` for padding/margins — but `rs()` is a JS
// function, so only a screen that CALLS it benefits. Screens styled with
// NativeWind `className` strings (most of the app) had no way in: a class is
// compiled at build time and cannot call a function.
//
// ── THE FIX ────────────────────────────────────────────────────────────────
// Tailwind's whole spacing scale is rem-based — `p-4` is 1rem, `mt-6` is
// 1.5rem, `h-11` is 2.75rem. NativeWind resolves rem against a runtime
// observable IF the build does not inline it, so setting that observable once
// makes every rem-based class in every file scale together.
//
// Two halves, and both are required:
//   1. `inlineRem: false` in metro.config.js  — stop baking rem into the CSS.
//   2. `rem.set(...)` here                    — feed it the device curve.
//
// ── THE CURVE ──────────────────────────────────────────────────────────────
// Deliberately `SPACE_SCALE` from theme/metrics.js, not a second curve of its
// own: type (fontScaling), `rs()` and now className spacing all track half the
// width delta off a 392pt baseline, clamped to 0.88–1.14. Spacing and type
// that drift apart is what makes a screen look subtly wrong at the edges of
// the device range.
//
// BASE 14, not 16. That is the value NativeWind was inlining before this file
// existed, so on a 392pt reference device (SPACE_SCALE === 1) every screen in
// the app renders byte-identical to how it did — this change is purely
// additive. A 360pt phone tightens to ~12.3, a tablet loosens to ~16.
//
// NOT for type. Font sizes stay in px (`text-[17px]`) precisely because
// fontScaling.js already scales them; putting type on rem as well would apply
// the multiplier twice and the text would grow on a big phone exactly where it
// was meant to hold still. Spacing scales here, type scales there.
//
// Import ONCE, as early as possible in App.js — before the first screen
// renders, or the first frame paints at the unscaled base.
import { rem } from 'nativewind';
import { SPACE_SCALE } from './metrics';

// Matches NativeWind's own default base so the app's existing 120-odd
// className files keep their current values at the reference width.
export const REM_BASE = 14;

export const REM = Math.round(REM_BASE * SPACE_SCALE * 100) / 100;

rem.set(REM);
