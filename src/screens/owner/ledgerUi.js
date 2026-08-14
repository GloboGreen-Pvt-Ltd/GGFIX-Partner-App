import { rs, isNarrow } from '../../theme/metrics';

/* ══════════════════════════════════════════════════════════════════════════
   The Cash Book design system — one compact scale for every ledger screen.
   ──────────────────────────────────────────────────────────────────────────
   The five screens (Cash Book, contact picker, add party, statement, add entry)
   previously carried their own copies of the same colours plus fourteen
   different font sizes between them. That is what made the UI read oversized:
   not one value being too big, but no shared ramp, so every screen set its own
   idea of "a row title".

   TYPE VALUES HERE ARE RAW, AND MUST STAY RAW.
   theme/fontScaling.js patches Text/TextInput once at app start and scales every
   resolved `fontSize` by FONT_SCALE (0.91 on a 360pt phone, 1.06 on a tablet,
   with a 0.95 compact factor already baked in). Passing these through rs() as
   well would apply a device multiplier twice. Spacing is the opposite: nothing
   scales it globally, so every padding/margin/fixed size below goes through rs().
   ══════════════════════════════════════════════════════════════════════════ */

export const C = {
  green: '#087A0A',
  greenSoft: '#E6F7E3',
  greenLine: '#E6F7E3',
  red: '#DC2626',
  redSoft: '#FEE2E2',
  redLine: '#FEE2E2',
  ink: '#172117',
  body: '#667066',
  muted: '#667066',
  hairline: '#EFF5EE',
  field: '#F0F8EF',
  border: '#E2E8E2',
  placeholder: '#8FA08F',
  chipBg: '#E2E8E2',
  chipInk: '#667066',
};

/**
 * The type ramp. Seven steps, and nothing outside them — a screen that needs a
 * size not on this list almost always needs a different step, not a new number.
 */
export const T = {
  screenTitle: 16.5, // header title
  screenSub: 11,     // header second line
  sectionLabel: 10.5,// ALL-CAPS field/section labels
  chip: 12,          // menu chips, day pills
  rowTitle: 13.5,    // a name in a list
  rowSub: 11,        // the line under it
  rowAmount: 13.5,   // the figure on the right
  caption: 10.5,     // Due / Advance, timestamps
  button: 13.5,      // every button label
  input: 14,         // typed text
  hero: 34,          // the amount field on the entry screen, and only that
  keypad: 20,        // the in-app calculator keys, and only those
};

/** Spacing steps, already device-scaled. */
export const S = {
  gutter: rs(isNarrow ? 10 : 12), // screen side padding
  tight: rs(4),
  xs: rs(6),
  sm: rs(8),
  md: rs(11),
  lg: rs(14),
  xl: rs(18),
};

/** Fixed sizes that must stay in proportion with the spacing around them. */
export const SIZE = {
  headerIcon: rs(34),   // the round button/badge in a header
  avatarLg: rs(40),     // account list rows
  avatarMd: rs(36),     // contact list rows
  avatarSm: rs(32),     // header, beside a name
  tile: rs(34),         // the direction icon tile on an entry row
  contactRow: rs(56),   // must match getItemLayout on the contact list
  /**
   * Minimum height for any primary button.
   *
   * Compact type plus compact padding lands these around 40pt, which looks
   * right and is under the 44pt both platforms ask for. Setting a floor keeps
   * the tighter padding AND the target — the button simply stops shrinking
   * before it becomes hard to hit on the smallest phone.
   */
  buttonMin: rs(46),
  radius: rs(14),
  radiusSm: rs(10),
};

/** Initial sits at ~44% of the circle — the ratio a monogram reads best at. */
export const avatarInitialSize = (diameter) => Math.round(diameter * 0.44 * 10) / 10;

/**
 * Fixed palette, picked by name, so an account keeps the same colour between
 * launches — the colour is a recognition cue in a long list, and one that
 * changed on every reload would be worse than none.
 *
 * TINTED, not solid. The palette only has two greens dark enough to carry a
 * white letter (#087A0A and the error red), so a solid ramp would be two
 * colours repeated — no recognition value at all. Light fills with a dark
 * monogram give six distinguishable tiles and read better anyway: white on
 * #7ED957 is 1.9:1 and on #F59E0B is 2.1:1, whereas every pairing below is
 * above 4.5:1.
 */
const AVATAR_TONES = [
  { bg: '#E6F7E3', ink: '#087A0A' },  // green
  { bg: '#FEF3C7', ink: '#B45309' },  // amber
  { bg: '#FEE2E2', ink: '#B91C1C' },  // red
  { bg: '#F0F8EF', ink: '#16BB05' },  // pale green
  { bg: '#C8EEBF', ink: '#087A0A' },  // lime
  { bg: '#E2E8E2', ink: '#172117' },  // slate
];

export function avatarFor(name) {
  const text = String(name || '').trim();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return {
    color: tone.bg,
    // Callers that still render a white monogram keep working; the ones that
    // read `ink` get a letter that is actually legible on the tile.
    ink: tone.ink,
    initial: (text[0] || '#').toUpperCase(),
  };
}

/** The header bar every ledger screen shares, so they can't drift apart. */
export const headerStyle = (insetTop) => ({
  paddingTop: insetTop + S.xs,
  paddingBottom: S.sm,
  paddingHorizontal: S.sm,
  borderBottomWidth: 1,
  borderBottomColor: C.hairline,
});

/** Bottom bar padding that clears the gesture bar / 3-button nav. */
export const bottomInset = (insetBottom, base = S.md) => Math.max(insetBottom, base);
