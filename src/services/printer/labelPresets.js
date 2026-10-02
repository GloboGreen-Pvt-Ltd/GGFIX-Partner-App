/**
 * Page Setup presets for the booking QR label — the ONE place label sizes
 * live. Names/sizes mirror the TVS LP-46 Dlite driver's own stock list
 * ("BarCode (38.0mm x 25.0mm)", "BarCode1 (50.0mm x 25.0mm)").
 *
 * Pure data + math (no React Native imports): the TSPL builder (tspl.js),
 * the on-screen LabelPreview and the web-print fallback all read from here,
 * so the preview and the printed label can't drift apart.
 */

// The printer's print head resolution — TSPL2 coordinates are in dots.
export const PRINTER_DPI = 203;
export const MM_TO_DOTS = PRINTER_DPI / 25.4;
export const mmToDots = (mm) => Math.round(mm * MM_TO_DOTS);

// gapMm = gap between die-cut labels on the roll (TSPL `GAP`).
export const LABEL_PRESETS = [
  { id: 'barcode', name: 'BarCode', widthMm: 38, heightMm: 25, gapMm: 2 },
  { id: 'barcode1', name: 'BarCode1', widthMm: 50, heightMm: 25, gapMm: 2 },
];

export const DEFAULT_LABEL_PRESET = LABEL_PRESETS[0];

/** Preset by id; anything unknown falls back to the default (38 x 25). */
export function getLabelPreset(id) {
  return LABEL_PRESETS.find((p) => p.id === id) || DEFAULT_LABEL_PRESET;
}

/** Accepts a preset object or an id. */
export function resolveLabelPreset(preset) {
  if (preset && typeof preset === 'object') return getLabelPreset(preset.id);
  return getLabelPreset(preset);
}

/** "38.0 mm × 25.0 mm" */
export function presetSizeText(preset) {
  return `${preset.widthMm.toFixed(1)} mm × ${preset.heightMm.toFixed(1)} mm`;
}

/** "BarCode (38.0 mm × 25.0 mm)" */
export function presetLabel(preset) {
  return `${preset.name} (${presetSizeText(preset)})`;
}
