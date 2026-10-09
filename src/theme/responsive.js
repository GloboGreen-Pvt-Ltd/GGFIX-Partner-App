import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The app's single responsive system: breakpoints, spacing tokens and the
 * `useResponsive()` hook every screen should read instead of measuring the
 * window itself.
 *
 * ── WHY THIS EXISTS, AND WHAT IT FIXES ────────────────────────────────────
 * The app already had three scale modules — `utils/responsive.js`,
 * `theme/fontScaling.js`, `theme/metrics.js` — and all three do this:
 *
 *     const { width, height } = Dimensions.get('window');   // module load
 *
 * Read ONCE, at import. That is fine for type and spacing scale, which are
 * meant to be device constants, and those modules stay as they are. It is
 * wrong for LAYOUT: rotate the device, unfold a foldable, or enter Android
 * split-screen and the numbers are stale, so no layout keyed off them can
 * respond. Anything that must react to the live window has to read it during
 * render, which is what this hook does via `useWindowDimensions()`.
 *
 * ── HOW IT RELATES TO THE EXISTING SCALES ─────────────────────────────────
 * Keep using `rf()` for font size and `rs()` for padding/margins: they encode
 * "this device is slightly bigger, breathe slightly more". This hook answers a
 * different question — "how many columns, which layout, how wide may content
 * get" — and the two compose. Do not reimplement either here.
 */

/**
 * Breakpoints, on the SHORT side in portrait and on width in landscape — i.e.
 * on the actual available width. Matching the spec:
 *   < 360   small phone
 *   360-599 phone
 *   600-839 tablet
 *   840+    large tablet / expanded
 */
export const BREAKPOINTS = { small: 0, phone: 360, tablet: 600, large: 840 };

/**
 * Spacing scale. One ladder for the whole app so screens stop inventing
 * one-off margins — the thing that makes two screens look subtly unrelated.
 * These are BASE values; pass them through `rs()` when you want them to scale
 * with the device as well.
 */
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * Maximum content width per breakpoint. A form stretched across a 1024pt iPad
 * is unreadable — the eye has to travel the whole edge-to-edge line — so
 * content is capped and centred instead.
 */
export const CONTENT_MAX = { form: 560, list: 720, wide: 960 };

/** Touch-target floors: Android 48dp, iOS 44pt. Use the larger. */
export const TOUCH_MIN = 48;

function breakpointFor(width) {
  if (width >= BREAKPOINTS.large) return 'large';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  if (width >= BREAKPOINTS.phone) return 'phone';
  return 'small';
}

/**
 * Live layout facts for the current render.
 *
 * @returns {{
 *   width:number, height:number,
 *   breakpoint:'small'|'phone'|'tablet'|'large',
 *   isSmallPhone:boolean, isPhone:boolean, isTablet:boolean, isLargeScreen:boolean,
 *   isLandscape:boolean, isPortrait:boolean,
 *   insets:object, spacing:object,
 *   select:Function, columns:Function, maxWidth:Function,
 * }}
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const isLandscape = width > height;
    const bp = breakpointFor(width);
    const isTablet = bp === 'tablet' || bp === 'large';

    /**
     * Pick a value for the current breakpoint, falling DOWN to the nearest
     * smaller one that was supplied. `select({ phone: 1, tablet: 2 })` on a
     * large tablet returns 2, not undefined — so a caller only has to name the
     * breakpoints where the value actually changes.
     */
    const select = (map = {}) => {
      const order = ['small', 'phone', 'tablet', 'large'];
      for (let i = order.indexOf(bp); i >= 0; i -= 1) {
        if (map[order[i]] !== undefined) return map[order[i]];
      }
      return map.default;
    };

    /** Column count for a grid, defaulting to a sensible ladder. */
    const columns = (map) => select({ small: 1, phone: 2, tablet: 3, large: 4, ...(map || {}) });

    /** Capped, centred content width. `maxWidth('form')` etc. */
    const maxWidth = (kind = 'list') => {
      const cap = CONTENT_MAX[kind] ?? CONTENT_MAX.list;
      return isTablet ? Math.min(cap, width) : width;
    };

    return {
      width,
      height,
      breakpoint: bp,
      isSmallPhone: bp === 'small',
      isPhone: bp === 'small' || bp === 'phone',
      isTablet,
      isLargeScreen: bp === 'large',
      isLandscape,
      isPortrait: !isLandscape,
      insets,
      spacing: SPACING,
      select,
      columns,
      maxWidth,
    };
  }, [width, height, insets]);
}
