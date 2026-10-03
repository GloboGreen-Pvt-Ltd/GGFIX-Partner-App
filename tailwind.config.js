/**
 * GGFix palette — brand sheet (Oct 2026). Mirrors src/theme/colors.js — the
 * two MUST stay in step, since roughly half the app styles with className
 * strings and the other half with StyleSheet objects reading `tokens`. Key
 * names are unchanged (every existing `bg-primary` / `tokens.x` call site keeps
 * working); only the hex values move — see the header comment in
 * theme/colors.js for the six brand colours and the shades derived from them.
 *
 *   Green  #09AD2A — `primary` (DEFAULT / -500). `primary-dark` (#078F23) is
 *                    the shade for green TEXT on light backgrounds.
 *   Red    #F84141 — `danger` / `error`.
 *   Ink    #1E1E1E — `text`.
 *   Page   #F8F8F8 — `background`, behind white `card`s.
 *   Muted  #F3F3F3 — `surface-muted`.
 *   Yellow #F3BF23 — `attention` / `warning`. DARK text only.
 */

// Green ramp around the brand green (#09AD2A at 500). The tints match the
// mint fills the redesigned screens already use; 600 is the text shade.
const green = {
  50: '#EAF8EC',
  100: '#EAF8EC',
  200: '#CDEFD4',
  300: '#8FDB9F',
  400: '#4CC463',
  500: '#09AD2A', // Brand green — fills, active states, progress
  600: '#078F23', // Deep green — green text on light backgrounds
  700: '#06701B',
  800: '#055A16',
  900: '#033F0F',
};

// Attention ramp around the brand yellow (#F3BF23 at 500) — pending / warning.
// 100 + 700 are the soft fill and the dark text that sits on it.
const amber = {
  50: '#FFFBEA',
  100: '#FFF8E1',
  200: '#FBE7A6',
  300: '#F8D66B',
  500: '#F3BF23',
  600: '#D9A60F',
  700: '#8A6A00',
  800: '#6B5200',
};

// Danger ramp around the brand red (#F84141 at 500).
const red = {
  50: '#FEECEC',
  100: '#FDDADA',
  200: '#FBB9B9',
  300: '#FA8A8A',
  500: '#F84141',
  700: '#C82A2A',
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
        // Primary — the interactive brand green (see the note above).
        primary: {
          DEFAULT: green[500],
          bright: green[500],
          light: green[500],
          dark: green[600],
          soft: green[100],
          ...green,
        },
        // Accent — the same brand green; `dark` is the text shade and
        // `light` / `soft` the mint tints (dark text only).
        accent: {
          DEFAULT: green[500],
          light: green[200],
          dark: green[600],
          soft: green[50],
          ...green,
        },
        // Attention — pending / warning (brand yellow). Pairs with `text-text`
        // or `text-attention-dark`, never `text-white`.
        attention: {
          DEFAULT: amber[500],
          light: amber[300],
          dark: amber[700],
          soft: amber[100],
          ...amber,
        },
        // Secondary — kept as an alias for the screens that still use it: the
        // deep green, for filled secondary buttons and selected states.
        // Mirrors `secondary: tokens.primaryDark` in theme/colors.js.
        secondary: {
          DEFAULT: green[600],
          light: green[500],
          dark: green[700],
          soft: green[100],
          ...green,
        },
        // Surfaces
        // Mirrors theme/colors.js — the two must stay in step. `background`
        // is the page wash behind pure-white `card`/`surface`.
        background: '#F8F8F8',
        card: '#FFFFFF',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F3F3F3',
        },
        // Text
        text: {
          DEFAULT: '#1E1E1E',
          muted: '#6B6B6B',
          subtle: '#8A8A8A',
        },
        // Lines
        border: {
          DEFAULT: '#E6E6E6',
          strong: '#D6D6D6',
        },
        // Status
        success: green[500],
        warning: amber[500],
        danger: red[500],
        error: red[500],
        // No blue in the palette; "info" was only ever a neutral notice.
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
