/**
 * App theme tokens. Mirrored in tailwind.config.js — use the palette in
 * NativeWind className strings (e.g. `bg-primary text-white`). The named
 * default exports are kept for screens that still use StyleSheet.
 *
 * GGFIX palette — the Home screen's teal palette, applied app-wide (Oct 2026).
 * Same key names as before (every `tokens.x` / `bg-x` call site keeps working);
 * only the hex values moved:
 *
 *   Teal        #035C6C — primary: buttons, active navigation, highlights.
 *   Light Teal  #E5F3F5 — selected cards, icon backgrounds (#C7E6EA its line).
 *   Green       #609138 — success, positive status.
 *   Black       #111111 — headings, primary text.
 *   Dark Gray   #6B7280 — secondary text (#9CA3AF subtle / placeholders).
 *   Light Gray  #F3F4F6 — page / section backgrounds, soft fills.
 *   Border Gray #E5E7EB — borders, dividers (#D1D5DB strong).
 *   Red #F84141 danger · Yellow #F3BF23 attention (dark text only).
 */
const tokens = {
  // Primary — the interactive green
  primary: '#035C6C',
  primaryBright: '#035C6C',
  primaryLight: '#035C6C',
  primaryDark: '#035C6C',
  primarySoft: '#E5F3F5',

  // Accent — same brand green. `accentDark` is the deep shade for text;
  // `accentLight` / `accentSoft` are the mint tints (dark text only).
  accent: '#035C6C',
  accentLight: '#C7E6EA',
  accentDark: '#035C6C',
  accentSoft: '#E5F3F5',

  // Attention — pending / warning states. DARK text only.
  attention: '#F3BF23',
  attentionLight: '#F8D66B',
  attentionDark: '#8A6A00',
  attentionSoft: '#FFF8E1',

  // Surfaces
  // `background` is the page wash behind white cards; `pageBackground` is the
  // same value under an explicit name for screens that want to be unambiguous
  // about which surface they mean.
  background: '#F3F4F6',
  pageBackground: '#F3F4F6',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',

  // Text
  text: '#111111',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',

  // Lines
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  // Status
  success: '#609138',
  warning: '#F3BF23',
  danger: '#F84141',
  error: '#F84141',
  // No blue in the palette; "info" was only ever a neutral notice.
  info: '#035C6C',
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
    shadowColor: '#111111',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  bar: {
    shadowColor: '#111111',
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
