/**
 * App theme tokens. Mirrored in tailwind.config.js — use the palette in
 * NativeWind className strings (e.g. `bg-primary text-white`). The named
 * default exports are kept for screens that still use StyleSheet.
 *
 * GGFix palette, budgeted 60 / 30 / 10:
 *   60%  BACKGROUND + SURFACE — page wash #F7FAF7, cards/inputs #FFFFFF.
 *   30%  GREEN — #16BB05 and #087A0A plus their tints.
 *   10%  ACCENT — lime #7ED957, attention #F59E0B, danger #DC2626.
 *
 * ── One departure from the brand sheet's labels, on purpose ────────────────
 * The sheet calls #16BB05 "Primary" and #087A0A "Secondary". Here `primary`
 * is #087A0A and #16BB05 is `primaryBright`.
 *
 * Why: white on #16BB05 is 2.6:1 — under the 3:1 floor even for large bold
 * text — and #16BB05 on white is also 2.6:1, so it works as neither a button
 * fill nor a foreground. It is for LARGE fills: active tab bars, gradients,
 * progress, icon circles. Anything interactive, and any green text or icon on
 * a white card, uses #087A0A (5.6:1 both ways).
 *
 * `accent` (lime) and `attention` (amber) both take DARK text — white on them
 * is 1.9:1 and 2.1:1 respectively. Use `tokens.text` on top of either.
 */
const tokens = {
  // Primary — the interactive green
  primary: '#004C40',
  primaryBright: '#16BB05',
  primaryLight: '#16BB05',
  primaryDark: '#004C40',
  primarySoft: '#E6F7E3',

  // Accent — brand lime. Highlights, badges, success emphasis. DARK text only.
  accent: '#7ED957',
  accentLight: '#C8EEBF',
  accentDark: '#16BB05',
  accentSoft: '#F0F8EF',

  // Attention — pending / warning states. DARK text only.
  attention: '#F59E0B',
  attentionLight: '#FCD34D',
  attentionDark: '#B45309',
  attentionSoft: '#FEF3C7',

  // Surfaces
  // Page wash is WHITE app-wide. Was #F7FAF7.
  // NOTE: cards are `card: '#FFFFFF'`, so any card WITHOUT a border or shadow
  // now sits invisible on the page. The shared `rnr/Card` carries
  // `border border-border` and is fine; bare `bg-card` usages are not.
  background: '#FFFFFF',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8F8F8',

  // Text
  text: '#172117',
  textMuted: '#667066',
  textSubtle: '#8FA08F',

  // Lines
  border: '#E2E8E2',
  borderStrong: '#CBD5CB',

  // Status
  success: '#004C40',
  warning: '#F59E0B',
  danger: '#DC2626',
  error: '#DC2626',
  // No blue survives the palette; "info" was only ever a neutral notice.
  info: '#16BB05',
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
    shadowColor: '#0B1F14',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  bar: {
    shadowColor: '#0B1F14',
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
  // `secondary` used to alias the old orange accent; under this palette the
  // secondary role is the deep green, which is what its consumers (filled
  // secondary buttons, selected states) actually want.
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
