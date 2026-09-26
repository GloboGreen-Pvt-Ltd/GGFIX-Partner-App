/**
 * App theme tokens. Mirrored in tailwind.config.js — use the palette in
 * NativeWind className strings (e.g. `bg-primary text-white`). The named
 * default exports are kept for screens that still use StyleSheet.
 *
 * GGFix palette — 2026 refresh. Same key names as before (nothing renamed,
 * so every existing `tokens.x` / `bg-x` call site across the app keeps
 * working); only the underlying hex values move to the current brand sheet:
 *
 *   Deep Green (primary):     #004C40 — unchanged, was already this value.
 *   Primary Green (mid):      #008F72 — replaces the old bright lime-green
 *                              #16BB05 in the `primaryBright`/`primaryLight`
 *                              role (large fills: tab bars, gradients, progress).
 *   Accent Green:             #16A36A — replaces the old lime `#7ED957`.
 *                              Unlike the old lime, this is dark enough to
 *                              carry white text, so `accentDark` (white-safe)
 *                              is now the one to reach for on filled buttons/
 *                              badges — `accent`/`accentLight` (still lime-ish
 *                              light tints) stay DARK-text-only, unchanged.
 *   Light Green Background:   #EAF8F3 — the shared "mint" tint used for soft
 *                              fills/icon tiles (`primarySoft`/`accentSoft`).
 *   Page Background:          #F7F9F8 — distinct from card background. Almost
 *                              every screen redesigned this app cycle already
 *                              drew this exact distinction locally (a tinted
 *                              page wash behind pure-white cards); this makes
 *                              it a real, reusable token instead of N local
 *                              copies (`pageBackground`, new key, additive).
 *   Card Background:          #FFFFFF — unchanged.
 *   Main Text:                #102A2E — was #172117.
 *   Secondary Text:           #667875 — was #667066.
 *   Border:                  #E4EBE8 — was #E2E8E2.
 *   Error:                   #DC2626 — UNCHANGED, per explicit instruction to
 *                              keep the existing app error color as-is.
 *
 * Contrast notes carried over from the previous palette (still true at the
 * new hexes — re-verify before reusing this reasoning for a new pairing):
 * `accent`/`accentLight` and `attention` (amber) take DARK text only; `primary`,
 * `primaryDark`, `success` and `danger` are dark enough for white text/icons.
 */
const tokens = {
  // Primary — the interactive green
  primary: '#004C40',
  primaryBright: '#008F72',
  primaryLight: '#008F72',
  primaryDark: '#004C40',
  primarySoft: '#EAF8F3',

  // Accent — brand green. `accentDark` is white-text-safe (interactive fills,
  // badges); `accent`/`accentLight` stay the lighter, dark-text-only tints.
  accent: '#7ED957',
  accentLight: '#C8EEBF',
  accentDark: '#16A36A',
  accentSoft: '#EAF8F3',

  // Attention — pending / warning states. DARK text only.
  attention: '#F59E0B',
  attentionLight: '#FCD34D',
  attentionDark: '#B45309',
  attentionSoft: '#FEF3C7',

  // Surfaces
  // Page wash is a soft mint-white, distinct from pure-white cards — see the
  // header note. `background` is kept as the page wash for existing
  // consumers; `pageBackground` is the same value under an explicit name for
  // new/migrated screens that want to be unambiguous about which surface
  // they mean.
  background: '#F7F9F8',
  pageBackground: '#F7F9F8',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8F8F8',

  // Text
  text: '#102A2E',
  textMuted: '#667875',
  textSubtle: '#8FA08F',

  // Lines
  border: '#E4EBE8',
  borderStrong: '#CBD5CB',

  // Status
  success: '#004C40',
  warning: '#F59E0B',
  danger: '#DC2626',
  error: '#DC2626',
  // No blue survives the palette; "info" was only ever a neutral notice.
  info: '#008F72',
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
