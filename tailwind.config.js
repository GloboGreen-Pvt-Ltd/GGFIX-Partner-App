/**
 * GGFix palette, budgeted 60 / 30 / 10. Mirrors src/theme/colors.js — the two
 * MUST stay in step, since roughly half the app styles with className strings
 * and the other half with StyleSheet objects reading `tokens`.
 *
 *   60%  BACKGROUND + SURFACE — page wash #F7FAF7, cards/inputs #FFFFFF.
 *   30%  GREEN — #16BB05 and #087A0A plus their tints.
 *   10%  ACCENT — lime #7ED957, attention #F59E0B, danger #DC2626.
 *
 * ── One departure from the brand sheet's labels, on purpose ────────────────
 * The sheet calls #16BB05 "Primary" and #087A0A "Secondary". Here the token
 * named `primary` is #087A0A, and #16BB05 is `primary-bright`.
 *
 * Why: white on #16BB05 is 2.6:1 — under the 3:1 floor even for large bold
 * text — so it cannot carry a button label, and at 2.6:1 against white it
 * cannot be body text or an icon either. It is a FILL: large areas, active
 * tab bars, gradients, progress, icon circles. Every interactive surface
 * needs #087A0A (white on it is 5.6:1; it is 5.6:1 on white).
 *
 * Since `bg-primary` is what Button and Badge default to, binding `primary` to
 * the readable green is what keeps 114 existing call sites correct. Reach for
 * `primary-bright` deliberately, when nothing white sits on top.
 *
 * `accent` is the brand lime and takes DARK text (white on it is 1.9:1).
 * `attention` is the pending/warning amber — likewise dark text (white 2.1:1).
 * It is a separate token rather than a reuse of `accent` because this codebase
 * already had an accent role meaning "in progress / pickup", and collapsing the
 * two would make `bg-accent` mean lime in one file and amber in the next.
 */

// Green ramp. 400/500/600 are the brand's three greens verbatim; the rest are
// tints and shades of the same hue, needed because screens use -50/-200 steps.
const green = {
  50: '#F0F8EF',
  100: '#E6F7E3',
  200: '#C8EEBF',
  300: '#A6E58C',
  400: '#7ED957', // Accent — Fresh Lime Green
  500: '#16BB05', // Primary — GGFix Green
  600: '#004C40', // Secondary — Deep Green (was #087A0A)
  700: '#076808',
  800: '#065C07',
  900: '#044504',
};

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
        accent: {
          DEFAULT: green[400],
          light: green[200],
          dark: green[500],
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
        // Mirrors theme/colors.js — the two must stay in step.
        background: '#FFFFFF',
        card: '#FFFFFF',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F8F8F8',
        },
        // Text
        text: {
          DEFAULT: '#172117',
          muted: '#667066',
          subtle: '#8FA08F',
        },
        // Lines
        border: {
          DEFAULT: '#E2E8E2',
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
