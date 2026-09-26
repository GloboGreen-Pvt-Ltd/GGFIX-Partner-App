/**
 * GGFix palette — 2026 refresh. Mirrors src/theme/colors.js — the two MUST
 * stay in step, since roughly half the app styles with className strings and
 * the other half with StyleSheet objects reading `tokens`. Key names are
 * unchanged from before (every existing `bg-primary` / `tokens.x` call site
 * across the app keeps working, including the ~114 sites `bg-primary` alone
 * covers); only the hex values move to the current brand sheet — see the
 * header comment in theme/colors.js for the full before/after mapping.
 *
 *   Deep Green (primary):    #004C40 — unchanged.
 *   Primary Green (mid):     #008F72 — `primary-bright` / `primary-light`.
 *   Accent Green:            #16A36A — `accent-dark` (white-text-safe).
 *   Light Green Background:  #EAF8F3 — `primary-soft` / `accent-soft`.
 *   Page Background:         #F7F9F8 — `background`, distinct from `card`.
 *   Border:                  #E4EBE8
 *
 * `accent`/`accent-light` are still the lighter lime tints and stay
 * DARK-text-only (white on them is under the 3:1 floor). `accent-dark` is the
 * new, darker Accent Green and IS white-text-safe — reach for it on filled
 * buttons/badges instead of the lime. `attention` (amber, pending/warning)
 * is unchanged and also DARK-text-only.
 */

// Green ramp. 400/500/600 are the brand's three greens verbatim; the rest are
// tints and shades of the same hue, needed because screens use -50/-200 steps.
const green = {
  50: '#EAF8F3',
  100: '#EAF8F3',
  200: '#C8EEBF',
  300: '#A6E58C',
  400: '#7ED957', // Light lime tint — dark-text-only badges/highlights
  500: '#008F72', // Primary Green (mid) — large fills, gradients, progress
  600: '#004C40', // Deep Green — the interactive/primary green
  700: '#076808',
  800: '#065C07',
  900: '#044504',
};

// Accent Green — genuinely distinct from the primary-bright mid-green above,
// so it isn't folded into the ramp (which only has room for one value per step).
const accentDarkGreen = '#16A36A';

// Attention ramp — pending / warning states.
const amber = {
  50: '#FFFBEB',
  100: '#FEF3C7',
  200: '#FDE68A',
  300: '#FCD34D',
  500: '#F59E0B',
  600: '#D97706',
  700: '#B45309',
  800: '#92400E',
};

// Danger ramp.
const red = {
  50: '#FEF2F2',
  100: '#FEE2E2',
  200: '#FECACA',
  300: '#FCA5A5',
  500: '#DC2626',
  700: '#B91C1C',
};

/* ── Responsive spacing tokens: `26p` means "26px at the reference width" ───
 *
 * Tailwind's own spacing scale is rem-based, and metro.config.js now leaves rem
 * unresolved so `src/theme/remScaling.js` can set it per device. That makes
 * `p-4` / `mt-6` / `h-11` responsive for free — but only for values that land
 * on Tailwind's 0.25rem grid (3.5px steps at our base). Real designs use 18,
 * 26, 46, 79, and forcing those onto the grid would silently retune a screen.
 *
 * So: one token per pixel value, with the VALUE expressed in rem. `mt-26p` is
 * `1.857rem`, which resolves to exactly 26 on the 392pt reference device and
 * scales with everything else elsewhere. Same idea as `rs(26)` in
 * theme/metrics.js, reachable from a className.
 *
 * Read the suffix as "p for px". Plain `mt-[26px]` still works and still means
 * a FIXED 26 — use it deliberately, for things that must not scale (hairlines,
 * a 1px specular edge). Type is the other deliberate exception: `text-[17px]`
 * stays px because theme/fontScaling.js already scales font sizes, and putting
 * type on rem too would apply the multiplier twice.
 *
 * REM_BASE must stay in step with src/theme/remScaling.js.
 */
const REM_BASE = 14;
const pxRem = (n) => `${Math.round((n / REM_BASE) * 10000) / 10000}rem`;
const pxScale = (max) => {
  const out = {};
  for (let n = 0; n <= max; n += 1) out[`${n}p`] = pxRem(n);
  return out;
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Primary — the interactive green (see the note above).
        primary: {
          DEFAULT: green[600],
          bright: green[500],
          light: green[500],
          dark: green[600],
          soft: green[100],
          ...green,
        },
        // Accent — brand lime. Highlights, badges, success emphasis.
        // Pair with `text-text`, never `text-white`.
        // `dark` is the newer Accent Green (#16A36A) — unlike the lime
        // DEFAULT/light, it IS white-text-safe; use it for filled
        // buttons/badges instead of the lime.
        accent: {
          DEFAULT: green[400],
          light: green[200],
          dark: accentDarkGreen,
          soft: green[50],
          ...green,
        },
        // Attention — pending / warning. Also pairs with `text-text`.
        attention: {
          DEFAULT: amber[500],
          light: amber[300],
          dark: amber[700],
          soft: amber[100],
          ...amber,
        },
        // Secondary — kept as an alias for the screens that still use it. Under
        // this palette the secondary role IS the deep green (filled secondary
        // buttons, selected states), which is what its consumers want.
        secondary: {
          DEFAULT: green[600],
          light: green[500],
          dark: green[700],
          soft: green[100],
          ...green,
        },
        // Surfaces
        // Mirrors theme/colors.js — the two must stay in step. `background`
        // is the page wash — a soft mint-white, distinct from pure-white
        // `card`/`surface` — matching the app's own established convention of
        // a tinted page behind white cards.
        background: '#F7F9F8',
        card: '#FFFFFF',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F8F8F8',
        },
        // Text
        text: {
          DEFAULT: '#102A2E',
          muted: '#667875',
          subtle: '#8FA08F',
        },
        // Lines
        border: {
          DEFAULT: '#E4EBE8',
          strong: '#CBD5CB',
        },
        // Status
        success: green[600],
        warning: amber[500],
        danger: red[500],
        error: red[500],
        // No blue survives the palette; "info" was only ever a neutral notice.
        info: green[500],
      },
      fontFamily: {
        sans: ['System'],
      },
      // `p-12p`, `mt-26p`, `h-46p`, `gap-8p`, `-right-6p`, `min-h-54p` … — see
      // the note at the top of this file. Covers 0-160px; anything larger is
      // layout, not spacing, and should be solved against the window instead.
      spacing: pxScale(160),
      borderRadius: {
        xl: '16px',
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '28px',
        // `rounded-20p` etc. Radii scale WITH the box they round, so a 23p
        // radius stays exactly half of a 46p avatar on every device.
        ...pxScale(64),
      },
    },
  },
  plugins: [],
};
