/**
 * One grid for every device picker — Category, Brand, Series, Model, Variant.
 *
 * These five screens are walked in sequence, so any difference in column count,
 * gutter, card width or image size shows up as the layout jumping at each step.
 * They had FOUR separate copies of `gridMetrics`, which had already drifted
 * (3/4 columns here, 5 there, gaps of 8 and 12), so this is the single source.
 *
 * COLUMNS follow the ACTUAL width, not a device name — a 412pt phone and a
 * 320pt phone are genuinely different, and a 1024pt tablet is not just a big
 * phone. Callers pass the live `useWindowDimensions().width`, so the count
 * re-computes on rotation, fold and split-screen.
 *
 * The card is sized so its IMAGE is square: the image box is the card width
 * minus its padding, used for both dimensions. Equal image boxes plus a fixed
 * label height are what keep every card in a row the same height.
 */

export const PICKER_PAD = 14;   // page gutter either side of the grid
export const PICKER_GAP = 8;    // space between cards

/**
 * Column count by available width.
 *
 * @param width  live window width
 * @param dense  true for the denser sets (models, series) which carry short
 *               labels; false for brands, whose names run longer.
 */
export function pickerColumns(width, dense = false) {
  if (width >= 1000) return dense ? 7 : 6;
  if (width >= 840) return dense ? 6 : 5;
  if (width >= 600) return dense ? 5 : 4;
  if (width >= 400) return dense ? 4 : 3;
  return 3;
}

/**
 * @returns {{ numColumns:number, cardWidth:number, imageSize:number }}
 *          `imageSize` is square — use it for BOTH width and height.
 */
export function pickerMetrics(width, { dense = false, cardPadding = 6, imageRatio = 1 } = {}) {
  const numColumns = pickerColumns(width, dense);
  // Math.floor: a sub-pixel residue is enough to wrap the last card onto a
  // new row, which reads as a broken grid.
  const cardWidth = Math.floor(
    (width - PICKER_PAD * 2 - PICKER_GAP * (numColumns - 1)) / numColumns,
  );
  // Square, and never below 28 so a fallback glyph still has somewhere to sit
  // once a wide screen pushes the column count up.
  //
  // `imageRatio` shrinks the square WITHIN the card, which is the only lever
  // that shortens a card without changing the column count: at ratio 1 the
  // image is as wide as the card, so card height ≈ card width and a 3-column
  // grid on a 390pt phone gives 115pt-tall rows. A brand LOGO does not need
  // that — 0.66 takes ~35pt off every row while the image stays square.
  const box = (cardWidth - cardPadding * 2) * imageRatio;
  const imageSize = Math.max(28, Math.round(box));
  return { numColumns, cardWidth, imageSize };
}
