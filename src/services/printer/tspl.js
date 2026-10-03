/**
 * TSPL2 command builder for the booking QR label, sized by the selected
 * Page Setup preset (labelPresets.js: BarCode 38x25mm / BarCode1 50x25mm).
 *
 * Best-evidenced protocol bet for the TVS LP-46 Dlite (no official TVS
 * technical manual is publicly indexed): Bluetooth Classic SPP + TSPL2, the
 * standard combination for this class of budget 203dpi label printer.
 * PENDING physical verification — element positions below are a first-pass
 * layout sized from the label's printable area, not confirmed against real
 * printed output. Recalibrate the constants here (single source, per the
 * "don't bury these values" requirement) once a real printer is available.
 *
 * Content/layout (no headings anywhere — matches the on-screen LabelPreview):
 *   top-center    service number
 *   left           QR code (printer-generated, not a bitmap)
 *   right          brand+model / customer name / device security (3 lines)
 *   bottom-center  created-on date + time, one line
 *
 * Pure/unit-testable: takes booking fields, returns the exact command
 * string write() sends over the socket. No React Native / native-module
 * imports here on purpose.
 */
import { DEFAULT_LABEL_PRESET, mmToDots as mm, resolveLabelPreset } from './labelPresets';

// --- Label geometry (TSPL2 dots, DPI from labelPresets.js) ---------------
// Label width/height/gap come from the selected Page Setup preset
// (labelPresets.js) — nothing below hard-codes a label size. The fixed
// values here are margins, fonts and the QR module size, shared by every preset.
const MARGIN_MM = 2;

// Built-in TSPL bitmap fonts (203dpi cell sizes, TSPL2 manual): "1" 8x12,
// "2" 12x20, "3" 16x24. TSPL has no native text-align, so centering and the
// per-line character caps are estimated from these per-character widths.
// Approximate — recalibrate against a real print.
const TOP_FONT = { name: '3', charWidth: 16, height: 24 }; // service number, centered
const TEXT_FONT = { name: '2', charWidth: 12, height: 20 }; // brand+model / customer / security
const BOTTOM_FONT = { name: '1', charWidth: 10, height: 12 }; // created-on (10, not 8: conservative)

// Main row: QR on the left, three unlabeled detail lines on the right.
const QR_Y_MM = 6;
const QR_CELL_SIZE = 4; // dots per QR module — smaller than a full-height QR
// so the top/bottom bands have room; still readable/scannable at 25mm tall.
const QR_TEXT_GAP_MM = 1.5;
// Detail lines, as offsets from the QR's top edge.
const TEXT_LINE_OFFSETS_MM = [1.5, 6, 10.5];
// Bottom band sits this far above the label's bottom edge.
const BOTTOM_FROM_EDGE_MM = 4;

const MAX_COPIES = 10;

// QR capacity per version (1..10) at ECC level H, by encoding mode — used
// only to know how many modules wide the printer-generated QR will be, so the
// text column starts after it instead of on top of it. The QR content and
// the QRCODE command itself are unchanged.
const QR_H_CAPACITY = {
  numeric: [17, 34, 58, 82, 106, 139, 154, 202, 235, 288],
  alphanumeric: [10, 20, 35, 50, 64, 84, 93, 122, 143, 174],
  byte: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119],
};

function utf8Length(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Modules per side of the QR the printer will draw for `data` (upper bound). */
function qrModules(data) {
  const s = String(data ?? '');
  const mode = /^\d*$/.test(s) ? 'numeric' : /^[0-9A-Z $%*+\-./:]*$/.test(s) ? 'alphanumeric' : 'byte';
  const len = mode === 'byte' ? utf8Length(s) : s.length;
  const idx = QR_H_CAPACITY[mode].findIndex((cap) => len <= cap);
  const version = idx === -1 ? QR_H_CAPACITY[mode].length : idx + 1;
  return 17 + 4 * version;
}

/**
 * Every position on the label, in printer dots, for one preset — the single
 * layout both the TSPL command below and the on-screen LabelPreview use.
 * The QR is always square at the same module size on every preset; a wider
 * preset (50mm) gives all of its extra width to the text column.
 */
export function computeLabelLayout(preset = DEFAULT_LABEL_PRESET, qrData = '') {
  const p = resolveLabelPreset(preset);
  const widthDots = mm(p.widthMm);
  const heightDots = mm(p.heightMm);
  const margin = mm(MARGIN_MM);
  const innerWidth = widthDots - 2 * margin;

  const top = { ...TOP_FONT, x: margin, y: margin, width: innerWidth, maxChars: Math.floor(innerWidth / TOP_FONT.charWidth) };
  const bottomY = heightDots - mm(BOTTOM_FROM_EDGE_MM);
  const bottom = { ...BOTTOM_FONT, x: margin, y: bottomY, width: innerWidth, maxChars: Math.floor(innerWidth / BOTTOM_FONT.charWidth) };

  // Square QR between the top and bottom bands. QR_CELL_SIZE holds for every
  // realistic tracking id; only an unusually long one (more modules than fit
  // the band) steps the module size down so it can't run into the created-on line.
  const qrY = mm(QR_Y_MM);
  const modules = qrModules(qrData);
  const qrMaxSize = bottomY - mm(0.5) - qrY;
  const cell = Math.max(2, Math.min(QR_CELL_SIZE, Math.floor(qrMaxSize / modules)));
  const qr = { x: margin, y: qrY, size: modules * cell, cell };

  const textX = qr.x + qr.size + mm(QR_TEXT_GAP_MM);
  const textWidth = widthDots - margin - textX;
  const text = {
    ...TEXT_FONT,
    x: textX,
    ys: TEXT_LINE_OFFSETS_MM.map((o) => qr.y + mm(o)),
    width: textWidth,
    maxChars: Math.max(1, Math.floor(textWidth / TEXT_FONT.charWidth)),
  };

  return { preset: p, widthDots, heightDots, margin, top, qr, text, bottom };
}

/** Escapes `"` and `\` so a value can't break out of a TSPL quoted string field. */
function esc(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Caps a single-line field so it can't push a neighbouring field off the label. */
function truncate(value, max) {
  const s = String(value ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Rough horizontal center within a band, with no native TSPL text-align. */
function centerX(text, band) {
  const widthDots = text.length * band.charWidth;
  return Math.max(band.x, Math.round(band.x + (band.width - widthDots) / 2));
}

/**
 * The exact (truncated) strings that go on the label for a layout — each
 * capped to what fits its band on ONE line, so nothing clips off the label
 * or runs into the QR. LabelPreview shows these same strings.
 */
export function labelTexts(data, layout) {
  return {
    serviceNumber: truncate(data?.trackingId, layout.top.maxChars),
    brandModel: truncate(data?.brandModel, layout.text.maxChars),
    customerName: truncate(data?.customerName, layout.text.maxChars),
    deviceSecurity: truncate(data?.deviceSecurity, layout.text.maxChars),
    createdLine: data?.createdOn
      ? truncate(`${data.createdOn.date}  ${data.createdOn.time}`, layout.bottom.maxChars)
      : '',
  };
}

/**
 * Builds the raw TSPL2 command string for one booking's label.
 *
 * @param {{ trackingId: string, brandModel: string, customerName: string,
 *           deviceSecurity: string, createdOn?: { date: string, time: string } }} data
 * @param {{ copies?: number, preset?: object|string }} [opts] preset = a
 *   LABEL_PRESETS entry (or its id); defaults to BarCode 38 x 25 mm.
 * @returns {string}
 */
export function buildLabelCommand(data, opts = {}) {
  const copies = Math.min(MAX_COPIES, Math.max(1, Math.round(opts.copies || 1)));
  const layout = computeLabelLayout(opts.preset, data?.trackingId);
  const { preset, top, qr, text, bottom } = layout;
  const t = labelTexts(data, layout);

  const lines = [
    `SIZE ${preset.widthMm} mm,${preset.heightMm} mm`,
    `GAP ${preset.gapMm} mm,0 mm`,
    'DIRECTION 0',
    'CLS',
    `TEXT ${centerX(t.serviceNumber, top)},${top.y},"${top.name}",0,1,1,"${esc(t.serviceNumber)}"`,
    // QRCODE x,y,ECC level,cell width,mode,rotation,"data" — the exact
    // trackingId the on-screen QR already encodes (LabelPreview.js /
    // BarcodePrintScreen.js), unchanged.
    `QRCODE ${qr.x},${qr.y},H,${qr.cell},A,0,"${esc(data?.trackingId)}"`,
    `TEXT ${text.x},${text.ys[0]},"${text.name}",0,1,1,"${esc(t.brandModel)}"`,
    `TEXT ${text.x},${text.ys[1]},"${text.name}",0,1,1,"${esc(t.customerName)}"`,
    `TEXT ${text.x},${text.ys[2]},"${text.name}",0,1,1,"${esc(t.deviceSecurity)}"`,
    ...(t.createdLine ? [`TEXT ${centerX(t.createdLine, bottom)},${bottom.y},"${bottom.name}",0,1,1,"${esc(t.createdLine)}"`] : []),
    `PRINT ${copies}`,
  ];
  return `${lines.join('\r\n')}\r\n`;
}
