/**
 * TSPL2 command builder for the 38x25mm booking QR label.
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

// --- Label geometry (203dpi TSPL2 dots) ---------------------------------
const DPI = 203;
const MM_TO_DOTS = DPI / 25.4;
const LABEL_WIDTH_MM = 38;
const LABEL_HEIGHT_MM = 25;
const GAP_MM = 2; // Gap between labels on the roll — recalibrate against the actual die-cut stock.

const mm = (n) => Math.round(n * MM_TO_DOTS);

const MARGIN_MM = 2;
const LABEL_WIDTH_DOTS = mm(LABEL_WIDTH_MM);

// Top band: service number, centered.
const TOP_Y = mm(MARGIN_MM);
const TOP_FONT = '3'; // built-in TSPL bitmap font — "3" reads clearly at 38mm width.
// TSPL has no native text-align; center by estimating the string's printed
// width from a per-character dot-width constant for this font, then
// offsetting X. Approximate — recalibrate against a real print.
const TOP_FONT_CHAR_WIDTH_DOTS = 16;

// Main row: QR on the left, three unlabeled detail lines on the right —
// vertically shares the band between the top and bottom text bands.
const QR_X = mm(MARGIN_MM);
const QR_Y = mm(6);
const QR_CELL_SIZE = 4; // dots per QR module — smaller than a full-height QR
// so the top/bottom bands have room; still readable/scannable at 38x25mm.

const TEXT_X = mm(15); // clears a QR box up to ~13mm wide (QR_CELL_SIZE 4 x ~28-33 modules for a typical alphanumeric tracking id at ECC H).
const TEXT_FONT = '2';
const TEXT_LINE_Y = [mm(7.5), mm(12), mm(16.5)];

// Bottom band: created-on date + time, centered, smaller font than the top line.
const BOTTOM_Y = mm(21);
const BOTTOM_FONT = '1';
const BOTTOM_FONT_CHAR_WIDTH_DOTS = 10;

const MAX_COPIES = 10;
// Right column has ~21mm of width at TEXT_X (font "2" runs roughly 6-7
// dots/char per the previous layout's own calibration) — 22 chars is a safe
// cap under that, comfortably fitting a real "Samsung Galaxy A15"-length value.
const FIELD_MAX_CHARS = 22;
const TOP_MAX_CHARS = 16; // service number line.
const BOTTOM_MAX_CHARS = 26; // "Wed, 31 Aug 2026  11:05 AM" — the longest realistic createdOn line.

/** Escapes `"` and `\` so a value can't break out of a TSPL quoted string field. */
function esc(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Caps a single-line field so it can't push a neighbouring field off the label. */
function truncate(value, max) {
  const s = String(value ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Rough horizontal center for a line with no native TSPL text-align. */
function centerX(text, charWidthDots) {
  const widthDots = text.length * charWidthDots;
  return Math.max(mm(MARGIN_MM), Math.round((LABEL_WIDTH_DOTS - widthDots) / 2));
}

/**
 * Builds the raw TSPL2 command string for one booking's label.
 *
 * @param {{ trackingId: string, brandModel: string, customerName: string,
 *           deviceSecurity: string, createdOn?: { date: string, time: string } }} data
 * @param {{ copies?: number }} [opts]
 * @returns {string}
 */
export function buildLabelCommand(data, opts = {}) {
  const copies = Math.min(MAX_COPIES, Math.max(1, Math.round(opts.copies || 1)));
  const serviceNumber = truncate(data?.trackingId, TOP_MAX_CHARS);
  const brandModel = truncate(data?.brandModel, FIELD_MAX_CHARS);
  const customerName = truncate(data?.customerName, FIELD_MAX_CHARS);
  const deviceSecurity = truncate(data?.deviceSecurity, FIELD_MAX_CHARS);
  const createdLine = data?.createdOn
    ? truncate(`${data.createdOn.date}  ${data.createdOn.time}`, BOTTOM_MAX_CHARS)
    : '';

  const topX = centerX(serviceNumber, TOP_FONT_CHAR_WIDTH_DOTS);
  const bottomX = centerX(createdLine, BOTTOM_FONT_CHAR_WIDTH_DOTS);

  const lines = [
    `SIZE ${LABEL_WIDTH_MM} mm,${LABEL_HEIGHT_MM} mm`,
    `GAP ${GAP_MM} mm,0 mm`,
    'DIRECTION 0',
    'CLS',
    `TEXT ${topX},${TOP_Y},"${TOP_FONT}",0,1,1,"${esc(serviceNumber)}"`,
    // QRCODE x,y,ECC level,cell width,mode,rotation,"data" — the exact
    // trackingId the on-screen QR already encodes (LabelPreview.js /
    // BarcodePrintScreen.js), unchanged.
    `QRCODE ${QR_X},${QR_Y},H,${QR_CELL_SIZE},A,0,"${esc(data?.trackingId)}"`,
    `TEXT ${TEXT_X},${TEXT_LINE_Y[0]},"${TEXT_FONT}",0,1,1,"${esc(brandModel)}"`,
    `TEXT ${TEXT_X},${TEXT_LINE_Y[1]},"${TEXT_FONT}",0,1,1,"${esc(customerName)}"`,
    `TEXT ${TEXT_X},${TEXT_LINE_Y[2]},"${TEXT_FONT}",0,1,1,"${esc(deviceSecurity)}"`,
    ...(createdLine ? [`TEXT ${bottomX},${BOTTOM_Y},"${BOTTOM_FONT}",0,1,1,"${esc(createdLine)}"`] : []),
    `PRINT ${copies}`,
  ];
  return `${lines.join('\r\n')}\r\n`;
}
