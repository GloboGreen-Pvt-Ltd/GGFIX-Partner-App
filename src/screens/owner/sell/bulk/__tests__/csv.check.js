/* eslint-disable */
// Plain-node checks for bulk/csv.js (no jest in this project).
// Run from the project root:  node src/screens/owner/sell/bulk/__tests__/csv.check.js
const path = require('path');
const Module = require('module');
const assert = require('assert');
const babel = require('@babel/core');

const file = path.join(__dirname, '..', 'csv.js');
const { code } = babel.transformFileSync(file, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});
const mod = new Module(file, module);
mod.filename = file;
mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(code, file);
const csv = mod.exports;

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
}

// ── parseCsv ────────────────────────────────────────────────────────────────
test('plain rows, LF', () => {
  assert.deepStrictEqual(csv.parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
});
test('CRLF and lone CR line endings', () => {
  assert.deepStrictEqual(csv.parseCsv('a,b\r\n1,2\r3,4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
});
test('quoted commas, escaped quotes and newlines inside quotes', () => {
  const rows = csv.parseCsv('title,model\r\n"Display, OEM ""A+""","iPhone 12\nPro"\r\n');
  assert.deepStrictEqual(rows, [['title', 'model'], ['Display, OEM "A+"', 'iPhone 12\nPro']]);
});
test('BOM stripped, empty trailing cells kept', () => {
  assert.deepStrictEqual(csv.parseCsv('﻿a,b,\n1,,\n'), [['a', 'b', ''], ['1', '', '']]);
});
test('semicolon delimiter auto-detected', () => {
  assert.deepStrictEqual(csv.parseCsv('title;price\n"x;y";10'), [['title', 'price'], ['x;y', '10']]);
});
test('tab delimiter auto-detected', () => {
  assert.deepStrictEqual(csv.parseCsv('title\tprice\nx\t10'), [['title', 'price'], ['x', '10']]);
});
test('inch mark inside an unquoted field stays literal', () => {
  assert.deepStrictEqual(csv.parseCsv('t\n6.1" display'), [['t'], ['6.1" display']]);
});

// ── toCsv round trip ────────────────────────────────────────────────────────
test('toCsv escapes and round-trips', () => {
  const rows = [['a', 'b, c', 'say "hi"', 'line\nbreak', '']];
  const text = csv.toCsv(rows, { bom: false });
  assert.deepStrictEqual(csv.parseCsv(text), rows);
});
test('toCsv neutralises formula cells', () => {
  const text = csv.toCsv([['=SUM(A1)', '-5', '-x']], { bom: false });
  assert.strictEqual(text, "'=SUM(A1),-5,'-x\r\n");
});
test('toCsv adds a BOM by default', () => {
  assert.ok(csv.toCsv([['a']]).startsWith('﻿'));
});

// ── cell parsers ────────────────────────────────────────────────────────────
test('conditions', () => {
  assert.deepStrictEqual(csv.parseCondition('Used (Good)'), { itemCondition: 'USED', conditionGrade: 'GOOD' });
  assert.deepStrictEqual(csv.parseCondition('used - fair'), { itemCondition: 'USED', conditionGrade: 'FAIR' });
  assert.deepStrictEqual(csv.parseCondition('Like New'), { itemCondition: 'USED', conditionGrade: 'LIKE_NEW' });
  assert.deepStrictEqual(csv.parseCondition('NEW'), { itemCondition: 'NEW', conditionGrade: null });
  assert.deepStrictEqual(csv.parseCondition('Refurbished'), { itemCondition: 'REFURBISHED', conditionGrade: null });
  assert.strictEqual(csv.parseCondition(''), null);
  assert.ok(csv.parseCondition('shiny').error);
});
test('listing types', () => {
  assert.strictEqual(csv.parseListingType('DEVICE'), 'DEVICE');
  assert.strictEqual(csv.parseListingType('spare part'), 'SPARE_PART');
  assert.strictEqual(csv.parseListingType('SPARE_PART'), 'SPARE_PART');
  assert.strictEqual(csv.parseListingType('Accessories'), 'ACCESSORY');
  assert.strictEqual(csv.parseListingType('Mobile'), 'DEVICE');
  assert.strictEqual(csv.parseListingType(''), null);
  assert.ok(csv.parseListingType('furniture').error);
});
test('prices', () => {
  assert.deepStrictEqual(csv.parsePrice('₹34,000'), { value: '34000' });
  assert.deepStrictEqual(csv.parsePrice('Rs. 5,500/-'), { value: '5500' });
  assert.deepStrictEqual(csv.parsePrice('249.50'), { value: '249.50' });
  assert.deepStrictEqual(csv.parsePrice(''), { value: '' });
  assert.ok(csv.parsePrice('abc').error);
  assert.ok(csv.parsePrice('0').error);
});
test('quantities', () => {
  assert.deepStrictEqual(csv.parseQuantity(''), { value: 1 });
  assert.deepStrictEqual(csv.parseQuantity('5 pcs'), { value: 5 });
  assert.ok(csv.parseQuantity('2.5').error);
  assert.ok(csv.parseQuantity('0').error);
  assert.ok(csv.parseQuantity('10000').error);
});
test('IMEIs', () => {
  assert.deepStrictEqual(csv.parseImei('35 678901 234567 8'), { value: '356789012345678' });
  assert.ok(csv.parseImei('3.56789E+14').error);
  assert.ok(csv.parseImei('12345').error);
});
test('memory labels', () => {
  assert.strictEqual(csv.normalizeMemory('128'), '128 GB');
  assert.strictEqual(csv.normalizeMemory('128gb'), '128 GB');
  assert.strictEqual(csv.normalizeMemory('1TB'), '1 TB');
  assert.strictEqual(csv.parseGb('1 TB'), 1024);
  assert.strictEqual(csv.parseGb('6 GB'), 6);
});

// ── parseBulkSheet ──────────────────────────────────────────────────────────
test('sample sheet: every example row is skipped', () => {
  const out = csv.parseBulkSheet(csv.sampleCsv());
  assert.strictEqual(out.rows.length, 0);
  assert.strictEqual(out.skipped.length, 4);
  assert.ok(out.sheetErrors.length === 1 && /No item rows/.test(out.sheetErrors[0]));
});
test('header mapping is case/spacing insensitive and order-free', () => {
  const text = 'Qty,Selling Price,MODEL,Colour,Storage,Condition,Listing Type\n3,"34,000",iPhone 13,Blue,128gb,Used (Good),device\n';
  const out = csv.parseBulkSheet(text);
  assert.deepStrictEqual(out.sheetErrors, []);
  assert.strictEqual(out.rows.length, 1);
  const r = out.rows[0];
  assert.strictEqual(r.line, 2);
  assert.strictEqual(r.model, 'iPhone 13');
  assert.strictEqual(r.color, 'Blue');
  assert.strictEqual(r.storageLabel, '128 GB');
  assert.strictEqual(r.quantity, 3);
  assert.strictEqual(r.price, '34000');
  assert.strictEqual(r.itemCondition, 'USED');
  assert.strictEqual(r.conditionGrade, 'GOOD');
  assert.strictEqual(r.listingType, 'DEVICE');
  assert.deepStrictEqual(r.errors, []);
});
test('per-row validation messages', () => {
  const text = [
    'title,model,color,ram,storage,condition,quantity,price,imei,listingType',
    ',,,,,New,1,100,,DEVICE',                        // line 2: device without model
    'ab,,,,,New,2,50,,ACCESSORY',                     // line 3: title too short
    ',Galaxy S21,,,,Used,2,20000,356789012345678,DEVICE', // line 4: IMEI with qty 2
    ',Galaxy S21,,,,Used,1,20000,356789012345678,DEVICE', // line 5: duplicate IMEI
    ',Pixel 7,,,,Brand New,x,abc,,DEVICE',            // line 6: bad qty + price
    ',Pixel 7,,,,,1,,,',                              // line 7: warnings only
    'Battery for iPhone 11,iPhone 11,,,,New,4,900,356789012345670,SPARE_PART', // line 8: IMEI ignored
  ].join('\r\n');
  const out = csv.parseBulkSheet(text);
  const byLine = Object.fromEntries(out.rows.map((r) => [r.line, r]));
  assert.ok(byLine[2].errors.some((m) => /Model is required/.test(m)));
  assert.ok(byLine[3].errors.some((m) => /accessory name/.test(m)));
  assert.ok(byLine[4].errors.some((m) => /quantity must be 1/.test(m)));
  assert.ok(byLine[5].errors.some((m) => /Same IMEI as line 4/.test(m)));
  assert.ok(byLine[6].errors.length === 2);
  assert.strictEqual(byLine[6].quantity, 1);
  assert.strictEqual(byLine[6].price, '');
  assert.deepStrictEqual(byLine[7].errors, []);
  assert.ok(byLine[7].warnings.some((m) => /Condition missing/.test(m)));
  assert.ok(byLine[7].warnings.some((m) => /Price missing/.test(m)));
  assert.strictEqual(byLine[7].listingType, 'DEVICE');
  assert.strictEqual(byLine[8].imei, '');
  assert.ok(byLine[8].warnings.some((m) => /IMEI ignored/.test(m)));
});
test('default listing type applies when the column is missing', () => {
  const out = csv.parseBulkSheet('title,quantity,price\nType-C Cable 1m,3,249\n', { defaultListingType: 'ACCESSORY' });
  assert.strictEqual(out.rows[0].listingType, 'ACCESSORY');
  assert.deepStrictEqual(out.rows[0].errors, []);
});
test('blank lines ignored, unknown columns warned', () => {
  const out = csv.parseBulkSheet('\n\nmodel,notes\n\niPhone 12,hello\n\n');
  assert.strictEqual(out.rows.length, 1);
  assert.strictEqual(out.rows[0].line, 5);
  assert.ok(out.sheetWarnings.some((m) => /notes/.test(m)));
});
test('maxRows truncates with a warning', () => {
  const lines = ['model,quantity'];
  for (let i = 0; i < 7; i += 1) lines.push(`Model ${i},1`);
  const out = csv.parseBulkSheet(lines.join('\n'), { maxRows: 5 });
  assert.strictEqual(out.rows.length, 5);
  assert.strictEqual(out.truncated, 2);
  assert.ok(out.sheetWarnings.some((m) => /first 5/.test(m)));
});
test('sheet-level errors: empty, no headers, header only, xlsx bytes', () => {
  assert.ok(/empty/.test(csv.parseBulkSheet('  \n ').sheetErrors[0]));
  assert.ok(/column headers/.test(csv.parseBulkSheet('foo,bar\n1,2').sheetErrors[0]));
  assert.ok(/no item rows/.test(csv.parseBulkSheet('title,model\n').sheetErrors[0]));
  assert.ok(/Excel/.test(csv.parseBulkSheet('PK\u0003\u0004[Content_Types].xml').sheetErrors[0]));
});
test('matchKey ignores case, spaces and punctuation', () => {
  assert.strictEqual(csv.matchKey('Galaxy S21 FE'), csv.matchKey('galaxy-s21fe'));
  assert.notStrictEqual(csv.matchKey('iPhone 13'), csv.matchKey('iPhone 13+'));
});

if (failures.length) {
  console.error(`csv.check: ${failures.length} failed, ${passed} passed\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`csv.check: all ${passed} checks passed`);
