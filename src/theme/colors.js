/**
 * App theme tokens. Mirrored in tailwind.config.js — use the palette in
 * NativeWind className strings (e.g. `bg-primary text-white`). The named
 * default exports are kept for screens that still use StyleSheet.
 *
 * GGFix palette — brand sheet (Oct 2026). Same key names as before (nothing
 * renamed, so every existing `tokens.x` / `bg-x` call site across the app
 * keeps working); only the underlying hex values move. The six brand colours:
 *
 *   Green   #09AD2A — primary: buttons, active tabs, progress, success.
 *   Red     #F84141 — danger / error. Replaces #DC2626 (the earlier "keep the
 *                     error colour as-is" note is superseded by this sheet).
 *   Ink     #1E1E1E — main text.
 *   Page    #F8F8F8 — page background, behind white cards.
 *   Surface #F3F3F3 — soft fills: inputs, chips, muted surfaces.
 *   Yellow  #F3BF23 — attention / pending / warning highlights.
 *
 * The rest are the tints and shades the redesigned screens already use
 * alongside those six (Service History, Messages, Dashboard), so token-driven
 * screens and hand-styled ones land on identical values:
 *
 *   #078F23 deep green — green TEXT on light backgrounds (`primaryDark`).
 *           #09AD2A on white is ~3:1, fine for fills and bold labels but thin
 *           for small text; the deep shade is what the app uses for green copy.
 *   #EAF8EC mint / #CDEFD4 mint line — soft green fills and their borders.
 *   #6B6B6B muted text, #8A8A8A subtle text / placeholders.
 *   #E6E6E6 border, #D6D6D6 strong border.
 *   #FFF8E1 / #8A6A00 — yellow soft fill and the dark text that sits on it.
 *
 * Contrast rules: `primary`, `success` and `danger` carry white text/icons.
 * `attention` / `warning` (yellow) take DARK text only — white on #F3BF23 is
 * under 2:1.
 */
const tokens = {
  // Primary — the interactive green
  primary: '#09AD2A',
  primaryBright: '#09AD2A',
  primaryLight: '#09AD2A',
  primaryDark: '#078F23',
  primarySoft: '#EAF8EC',

  // Accent — same brand green. `accentDark` is the deep shade for text;
  // `accentLight` / `accentSoft` are the mint tints (dark text only).
  accent: '#09AD2A',
  accentLight: '#CDEFD4',
  accentDark: '#078F23',
  accentSoft: '#EAF8EC',

  // Attention — pending / warning states. DARK text only.
  attention: '#F3BF23',
  attentionLight: '#F8D66B',
  attentionDark: '#8A6A00',
  attentionSoft: '#FFF8E1',

  // Surfaces
  // `background` is the page wash behind white cards; `pageBackground` is the
  // same value under an explicit name for screens that want to be unambiguous
  // about which surface they mean.
  background: '#F8F8F8',
  pageBackground: '#F8F8F8',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F3F3',

  // Text
  text: '#1E1E1E',
  textMuted: '#6B6B6B',
  textSubtle: '#8A8A8A',

  // Lines
  border: '#E6E6E6',
  borderStrong: '#D6D6D6',

  // Status
  success: '#09AD2A',
  warning: '#F3BF23',
  danger: '#F84141',
  error: '#F84141',
  // No blue in the palette; "info" was only ever a neutral notice.
  info: '#09AD2A',
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  '2xl': 22,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#1E1E1E',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  bar: {
    shadowColor: '#1E1E1E',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
};

export default {
  ...tokens,

  // Legacy aliases used by older screens — keep them mapped to the new palette.
  // `secondary` is the deep green: filled secondary buttons and selected
  // states, where the brand green alone would read too light.
  secondary: tokens.primaryDark,
  backgroundCard: tokens.card,
  inputBg: tokens.surfaceMuted,
  textSecondary: tokens.textMuted,
  headerBg: tokens.card,
  headerText: tokens.text,
  tabBarBg: tokens.card,
  tabBarActive: tokens.primary,
  tabBarInactive: tokens.textMuted,
  backButtonBg: tokens.surfaceMuted,
  backButtonIcon: tokens.text,
};

export { tokens };
