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
// A detail line too long for TEXT_FONT drops to this smaller font, then wraps
// onto two lines — so the narrow 38mm label shows the full value, not "…".
const SMALL_FONT = { name: '1', charWidth: 8, height: 12 };
const SMALL_LINE_STEP = 14; // dots from one wrapped small line to the next
const BIG_FONT = { name: '3', charWidth: 16, height: 24 };
// Device-lock line goes one built-in font size up (TSPL fonts are fixed sizes,
// so this is the closest to a small bump): 20→24 dots, or 24→32 on BarCode1.
// Still falls back to the normal fonts when the value is too long.
const XL_FONT = { name: '4', charWidth: 24, height: 32 };
const bumpFont = (f) => (f.height < BIG_FONT.height ? BIG_FONT : XL_FONT);

// Per-preset sizing. The wider 50mm BarCode1 label has room for a bigger QR
// (5-dot modules) and a bigger detail font; each detail line uses the first
// font in `detailFonts` it fits in, the last one wrapping onto two lines.
const DEFAULT_TUNING = { qrCell: 4, detailFonts: [TEXT_FONT, SMALL_FONT] };
const PRESET_TUNING = {
  // qrShift moves the QR (and the detail column with it); textShift adds dots
  // between the QR and the detail column.
  barcode1: { qrCell: 5, detailFonts: [BIG_FONT, TEXT_FONT, SMALL_FONT], qrShift: 10, textShift: 2 },
};

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
  const tuning = PRESET_TUNING[p.id] || DEFAULT_TUNING;
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
  const cell = Math.max(2, Math.min(tuning.qrCell || QR_CELL_SIZE, Math.floor(qrMaxSize / modules)));
  const qr = { x: Math.max(0, margin + (tuning.qrShift || 0)), y: qrY, size: modules * cell, cell };

  const textX = qr.x + qr.size + mm(QR_TEXT_GAP_MM) + (tuning.textShift || 0);
  const textWidth = widthDots - margin - textX;
  const text = {
    ...TEXT_FONT,
    x: textX,
    ys: TEXT_LINE_OFFSETS_MM.map((o) => qr.y + mm(o)),
    width: textWidth,
    maxChars: Math.max(1, Math.floor(textWidth / TEXT_FONT.charWidth)),
    fonts: tuning.detailFonts,
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

/**
 * Fits one detail value into the text column: TEXT_FONT on one line if it fits,
 * else SMALL_FONT on one line, else SMALL_FONT word-wrapped onto two lines
 * (only a value longer than two small lines still ends in "…").
 * `dy` is each line's offset from the slot's y, keeping the block centred on it.
 */
export function fitDetail(value, text) {
  const s = String(value ?? '').trim();
  const fonts = text.fonts || DEFAULT_TUNING.detailFonts;
  const slotH = fonts[0].height;
  const maxFor = (f) => Math.max(1, Math.floor(text.width / f.charWidth));
  for (const f of fonts) {
    if (s.length <= maxFor(f)) return { font: f, lines: [{ text: s, dy: Math.round((slotH - f.height) / 2) }] };
  }
  const small = fonts[fonts.length - 1];
  const smallMax = maxFor(small);
  let first = '';
  for (const w of s.split(/\s+/)) {
    const next = first ? `${first} ${w}` : w;
    if (next.length > smallMax) break;
    first = next;
  }
  if (!first) first = s.slice(0, smallMax);
  const rest = truncate(s.slice(first.length), smallMax);
  const top = Math.round((slotH - small.height) / 2) - Math.round(SMALL_LINE_STEP / 2);
  return { font: small, lines: [{ text: first, dy: top }, { text: rest, dy: top + SMALL_LINE_STEP }] };
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
  // The three detail lines, fitted (font + one or two lines each).
  const baseFonts = layout.text.fonts || DEFAULT_TUNING.detailFonts;
  const securityText = { ...layout.text, fonts: [bumpFont(baseFonts[0]), ...baseFonts] };
  const details = [data?.brandModel, data?.customerName, data?.deviceSecurity]
    .map((v, i) => fitDetail(v, i === 2 ? securityText : layout.text));
  const joined = (d) => d.lines.map((l) => l.text).join(' ');
  return {
    serviceNumber: truncate(data?.trackingId, layout.top.maxChars),
    details,
    brandModel: joined(details[0]),
    customerName: joined(details[1]),
    deviceSecurity: joined(details[2]),
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
    ...t.details.flatMap((d, i) => d.lines.map((l) => `TEXT ${text.x},${text.ys[i] + l.dy},"${d.font.name}",0,1,1,"${esc(l.text)}"`)),
    ...(t.createdLine ? [`TEXT ${centerX(t.createdLine, bottom)},${bottom.y},"${bottom.name}",0,1,1,"${esc(t.createdLine)}"`] : []),
    `PRINT ${copies}`,
  ];
  return `${lines.join('\r\n')}\r\n`;
}
