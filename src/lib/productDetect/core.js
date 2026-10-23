/**
 * Product detection core — SHARED by the Customer and Partner apps.
 * This file is byte-identical in both: src/lib/productDetect/core.js.
 * Pure JS (no imports) so it can be unit-tested in Node.
 *
 * Inputs are evidence from one photo (on-device OCR text, the server's Google
 * Vision identify result, optional visual-similarity result) plus our own
 * catalogue. Every candidate comes from the catalogue; AI output only votes.
 *
 * Priority (strongest first):
 *   1. exact model number read by OCR            → ocr-model-number   (100)
 *   2. catalogue model number as prefix of a code → ocr-model-prefix   (95)
 *   3. brand + model name read by OCR / label    → ocr-name / label-name (≤88)
 *   4. server / visual ranking                   → server-rank / visual (≤70)
 *   5. top candidate fallback (never auto-selected)
 * A conflicting brand, a missing model digit (S22 vs S23) or an unmatched
 * variant word (Pro / Ultra / Plus …) lowers a candidate's score.
 */

const VARIANTS = new Set(['pro', 'max', 'plus', 'ultra', 'lite', 'mini', 'fe', 'neo', 'prime', 'power', 'play', 'turbo', 'se', 'air', 'fold', 'flip', 'edge', '5g', '4g']);
// Network suffixes are often left off a label ("Oppo F31" for "Oppo F31 5G"): soft.
const SOFT_VARIANTS = new Set(['5g', '4g', 'lte']);
const STOP = new Set(['the', 'and', 'with', 'for', 'new', 'gen', 'generation', 'series', 'edition', 'model', 'laptop', 'notebook', 'phone', 'mobile', 'smartphone', 'tablet', 'watch', 'smartwatch', 'wireless', 'earbuds', 'buds', 'gb', 'tb']);
// Product words that name the brand even when the brand itself isn't printed.
const BRAND_ALIASES = {
  apple: ['iphone', 'ipad', 'macbook', 'airpods', 'imac'],
  samsung: ['galaxy'],
  google: ['pixel'],
  oneplus: ['one plus', 'oneplus'],
  xiaomi: ['redmi', 'poco'],
  realme: ['narzo'],
  lenovo: ['thinkpad', 'ideapad', 'legion', 'yoga'],
  hp: ['pavilion', 'envy', 'omen', 'elitebook', 'probook', 'victus'],
  dell: ['inspiron', 'latitude', 'vostro', 'xps', 'alienware'],
  asus: ['vivobook', 'zenbook', 'rog', 'tuf'],
  acer: ['aspire', 'nitro', 'predator', 'swift'],
};

// Device type from a category name or from generic words in the evidence
// (Google often only says "smartphone" / "laptop" / "earbuds").
const KIND_WORDS = {
  mobile: ['smartphone', 'mobile phone', 'cell phone', 'phone', 'iphone', 'mobile'],
  laptop: ['laptop', 'notebook', 'netbook', 'macbook'], // not "computer": Google says "tablet computer"
  tablet: ['tablet', 'ipad'],
  watch: ['smartwatch', 'smart watch', 'watch', 'wristwatch'],
  audio: ['earbuds', 'earphones', 'headphones', 'headset', 'airpods', 'earpiece', 'speaker', 'audio'],
};
function kindOfCategory(name) {
  const n = normalize(name);
  if (/mobile|phone/.test(n)) return 'mobile';
  if (/laptop|notebook/.test(n)) return 'laptop';
  if (/tablet/.test(n)) return 'tablet';
  if (/watch/.test(n)) return 'watch';
  if (/audio|ear|head|speaker/.test(n)) return 'audio';
  return null;
}
function kindsIn(ev) {
  const out = new Set();
  if (ev.empty) return out;
  Object.entries(KIND_WORDS).forEach(([k, words]) => { if (words.some((w) => ev.joined.includes(` ${w} `))) out.add(k); });
  return out;
}

export const AUTO_SELECT = 0.85; // confidence needed to auto-select one device
const MIN_SHOW = 0.4;            // weaker candidates are never offered as matches
const MIN_SUGGEST = 0.15;        // 'none': still offered as "pick your device" suggestions
const MARGIN = 0.12;             // lead the auto-selected device needs over #2

/** "Galaxy S23+ (8GB)" → "galaxy s23 plus 8gb" */
export function normalize(text) {
  return String(text ?? '').toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const tokens = (text) => normalize(text).split(' ').filter(Boolean);
const hasDigit = (t) => /\d/.test(t);

// Units and network generations stay one word when letters and digits are
// split apart ("5g", "150w", "64gb").
const UNIT = /^\d+(g|gb|tb|mb|w|mah|hz|mp|k)$/;
/**
 * Name words with letters and digits split: "realme GT Neo3 150W" →
 * [realme, gt, neo, 3, 150w]. The catalogue and a photo space the same model
 * differently ("GT Neo3" / "GT NEO 3T" in the catalogue, "GT Neo 3" on a box
 * or from Google / Groq), so names are compared in this form.
 */
function seq(text) {
  return tokens(text).flatMap((t) => (UNIT.test(t) ? [t]
    : t.replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(' ').filter(Boolean)));
}
// A word right after a matched name that makes it a LONGER model's name:
// "GT Neo 3" + "T" / "150W" / "Pro" / "2".
const extendsName = (t) => !!t && ((t.length === 1 && /[a-z]/.test(t)) || /^\d+$/.test(t) || VARIANTS.has(t) || UNIT.test(t));

/** A model-number key: "(Type 81M8)" → "81M8", "SM-S911B/DS" → ["SMS911BDS", "SMS911B"]. */
function codeKeys(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[()]/g, ' ').replace(/\bTYPE\b/g, ' ');
  const out = new Set();
  const full = s.replace(/[^A-Z0-9]/g, '');
  if (full.length >= 4 && hasDigit(full) && /[A-Z]/.test(full)) out.add(full);
  s.split(/[\s,;|/]+/).forEach((part) => {
    const k = part.replace(/[^A-Z0-9]/g, '');
    if (k.length >= 4 && hasDigit(k) && /[A-Z]/.test(k)) out.add(k);
  });
  return [...out];
}
const numberList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n|]+/)).filter(Boolean);

/**
 * rows: [{ id, brand, name, category, modelNumbers, ref }] — the app's catalogue.
 * Built once per session (8–10k models is a few ms).
 */
export function buildIndex(rows) {
  const byNumber = new Map();
  const brands = new Map(); // normalized brand → brand tokens
  const modelTokens = new Map(); // normalized brand → digit-bearing model tokens ("f31", "a3x")
  const prepared = (rows || []).filter((r) => r && r.id && r.name && /[a-z]/i.test(r.name)).map((r) => {
    const nb = normalize(r.brand);
    if (nb) brands.set(nb, nb.split(' '));
    const brandToks = new Set(nb.split(' '));
    // "(Lightning)", "(Bluetooth, 4.4 cm)" qualify a model; they're optional evidence.
    const bare = String(r.name).replace(/\([^)]*\)?/g, ' ');
    const nameToks = tokens(bare).filter((t) => !brandToks.has(t) && !STOP.has(t));
    const nameSeq = seq(bare).filter((t) => !brandToks.has(t) && !STOP.has(t) && !SOFT_VARIANTS.has(t));
    const row = {
      id: r.id,
      brand: r.brand || '',
      name: r.name,
      category: r.category || '',
      kind: kindOfCategory(r.category),
      ref: r.ref,
      nb,
      core: nameToks.filter((t) => !VARIANTS.has(t)),
      // From the split form, so "GT Neo3" carries "neo" like "GT Neo 3" does.
      variants: nameSeq.filter((t) => VARIANTS.has(t)),
      // Model identifiers only ("f31", "s23") — not variant words like "5g".
      digits: nameToks.filter((t) => hasDigit(t) && !VARIANTS.has(t)),
      // The name as a phrase (see seq / phraseScore), and its brand's words.
      seq: nameSeq,
      brandToks,
      // "Realme 3": a bare number is only that model next to its brand.
      numOnly: nameSeq.length > 0 && nameSeq.every((t) => /^\d+$/.test(t)),
    };
    if (nb) {
      if (!modelTokens.has(nb)) modelTokens.set(nb, new Set());
      row.digits.forEach((t) => modelTokens.get(nb).add(t));
    }
    numberList(r.modelNumbers).forEach((n) => codeKeys(n).forEach((k) => {
      if (!byNumber.has(k)) byNumber.set(k, []);
      byNumber.get(k).push(row);
    }));
    return row;
  });
  return { rows: prepared, byNumber, brands, modelTokens };
}

/** Uppercase alphanumeric codes printed in OCR text (model numbers, SKUs). */
export function extractCodes(text) {
  const out = new Set();
  const words = String(text ?? '').toUpperCase().split(/[\s,;:|/]+/).map((w) => w.replace(/[^A-Z0-9-]/g, '').replace(/-/g, '')).filter(Boolean);
  const add = (k) => { if (k.length >= 4 && k.length <= 20 && hasDigit(k) && /[A-Z]/.test(k)) out.add(k); };
  words.forEach((w, i) => {
    add(w);
    // OCR often splits a code ("SM S911B", "VIVO 1610"): try adjacent pairs too.
    if (i + 1 < words.length) add(w + words[i + 1]);
  });
  return [...out];
}

function evidenceOf(text) {
  const toks = tokens(text);
  return { set: new Set(toks), joined: ` ${toks.join(' ')} `, compact: toks.join(''), empty: !toks.length };
}

/** Catalogue brands named in the evidence (directly or via a product word). */
function brandsIn(ev, index) {
  const found = new Set();
  if (ev.empty) return found;
  index.brands.forEach((parts, nb) => {
    if (ev.joined.includes(` ${parts.join(' ')} `)) found.add(nb);
  });
  Object.entries(BRAND_ALIASES).forEach(([nb, words]) => {
    if (index.brands.has(nb) && words.some((w) => ev.joined.includes(` ${w} `))) found.add(nb);
  });
  return found;
}

/** Each line of the evidence as name words (seq form). */
const linesOf = (texts) => texts.flatMap((t) => String(t ?? '').split(/\r?\n/)).map(seq).filter((l) => l.length);

/**
 * 0..1 — the evidence NAMES this model: its whole name appears as a phrase
 * in one line, not followed by a word that makes it a longer model's name,
 * and covering most of that line (≥ 0.7; 1 = the line is exactly the name).
 * So "realme GT Neo 3" is the GT Neo3 (1.0) — and not "Realme 3" or
 * "Realme GT", whose words merely sit inside it. A bare-number name
 * ("Realme 3") needs its brand on the same line.
 */
function phraseScore(row, lines) {
  const n = row.seq.length;
  if (!n) return 0;
  let best = 0;
  lines.forEach((line) => {
    const core = line.filter((t) => !row.brandToks.has(t) && !STOP.has(t) && !SOFT_VARIANTS.has(t));
    if (!core.length) return;
    const withBrand = row.nb && line.length > core.length && line.some((t) => row.brandToks.has(t));
    for (let i = 0; i + n <= core.length; i += 1) {
      let hit = true;
      for (let j = 0; j < n && hit; j += 1) hit = core[i + j] === row.seq[j];
      if (!hit || extendsName(core[i + n])) continue;
      const cover = n / core.length;
      if (cover < 0.999 && (cover < 0.7 || row.numOnly)) continue;
      if (row.numOnly && !withBrand) continue;
      best = Math.max(best, cover);
    }
  });
  return best;
}


const RANK_BASE = { high: 70, medium: 55, low: 35 };

/**
 * evidence: { ocrText, identify: { ok, confidence, label, brand, labels, matches:[{id, similarity}] },
 *             visual: { ok, confidence, matches:[{id, similarity}] } }
 * → { status: 'exact'|'choose'|'none', best, candidates (≤3), confidence (0..1),
 *     reason, label, debug }
 */
export function detectProduct(index, { ocrText = '', identify = null, visual = null } = {}) {
  const byId = new Map(index.rows.map((r) => [r.id, r]));
  const scores = new Map(); // id → { row, signals: { reason: score } }
  const vote = (row, reason, score) => {
    if (!row || score <= 0) return;
    const e = scores.get(row.id) || { row, signals: {} };
    e.signals[reason] = Math.max(e.signals[reason] || 0, score);
    scores.set(row.id, e);
  };

  const ocr = evidenceOf(ocrText);
  const labelText = identify?.ok ? [identify.label, ...(identify.labels || []).slice(0, 3)].filter(Boolean).join(' \n ') : '';
  const label = evidenceOf(labelText);
  const brandSet = new Set([...brandsIn(ocr, index), ...brandsIn(label, index)]);
  const kinds = new Set([...kindsIn(ocr), ...kindsIn(label)]);
  const serverBrand = normalize(identify?.ok ? identify.brand : '');
  if (serverBrand && index.brands.has(serverBrand)) brandSet.add(serverBrand);

  // 1–2. Model numbers printed on the device / box / sticker.
  const codes = extractCodes(ocrText);
  codes.forEach((code) => {
    const exact = index.byNumber.get(code);
    if (exact) { exact.forEach((r) => vote(r, 'ocr-model-number', 100)); return; }
    for (let len = code.length - 1; len >= 6; len -= 1) {
      const hit = index.byNumber.get(code.slice(0, len));
      if (hit) { hit.forEach((r) => vote(r, 'ocr-model-prefix', 95)); return; }
    }
  });

  // 3. Brand + model name in the photo's text or the recognised label — as a
  // whole phrase (phraseScore), so a label's stray number or brand word
  // never picks an unrelated model.
  const ocrLines = linesOf([ocrText]);
  const labelLines = identify?.ok ? linesOf([identify.label, ...(identify.labels || []).slice(0, 3)]) : [];
  const nameCandidates = brandSet.size ? index.rows.filter((r) => brandSet.has(r.nb)) : index.rows;
  // Models the photo's own text (or a non-AI label) names exactly: any other
  // model is contradicted (a server guess "A02" for a box reading "OPPO F31").
  const named = new Set();
  nameCandidates.forEach((r) => {
    const o = phraseScore(r, ocrLines);
    if (o > 0) vote(r, 'ocr-name', Math.round(o * 88));
    const l = phraseScore(r, labelLines);
    if (l > 0) vote(r, 'label-name', Math.round(l * 82));
    // An AI guess's label doesn't get to contradict its alternatives.
    if (o >= 0.999 || (!identify?.ai && l >= 0.999)) named.add(r.id);
  });

  // 4. Server (Google Vision / Groq / visual vector → catalogue) and the
  // visual-similarity service. Only genuine server matches vote: brand
  // fill-ins, name-alike siblings and partial names are what used to show as
  // "unrelated" models, and a server verdict of NONE means nothing matched.
  const genuine = (m) => !['brand', 'similar', 'partial'].includes(String(m?.matchedBy || '').toLowerCase());
  const ranked = (src, reason) => {
    if (!src?.ok || src.identification === 'NONE') return;
    const base = RANK_BASE[src.confidence] || RANK_BASE.low;
    (src.matches || []).filter(genuine).slice(0, 8).forEach((m, i) => {
      const sim = Number(m?.similarity);
      const s = Number.isFinite(sim) && sim > 0 ? Math.max(base - i * 6, Math.round(sim * base)) : base - i * 6;
      vote(byId.get(m?.id), reason, s);
    });
  };
  ranked(identify, 'server-rank');
  ranked(visual, 'visual');
  // The server's EXACT verdict (a printed model number it read, or look and
  // AI agreeing at a calibrated ≥ 85 %) — strong, still below our own OCR read.
  if (identify?.ok && identify.exactId) vote(byId.get(identify.exactId), 'server-exact', 92);

  // Combine: the strongest signal leads, agreeing signals add a little (≤8).
  // Only a printed model number can reach 100; name / ranking evidence is
  // capped below it so it can never tie or beat one.
  const numberHit = [...scores.values()].some((e) => e.signals['ocr-model-number'] || e.signals['ocr-model-prefix']);
  const list = [...scores.values()].map(({ row, signals }) => {
    const vals = Object.values(signals).sort((a, b) => b - a);
    const byNumber = !!(signals['ocr-model-number'] || signals['ocr-model-prefix']);
    let score = (byNumber ? vals[0] : Math.min(vals[0], 94)) + Math.min(8, vals.slice(1).reduce((n, v) => n + v * 0.15, 0));
    if (brandSet.size && !brandSet.has(row.nb)) score *= 0.4; // contradicts the brand we read
    if (!byNumber) {
      if (numberHit) score *= 0.8; // the photo printed a different model's number
      if (named.size && !named.has(row.id)) score *= 0.5; // the photo names a different model
      if (kinds.size && row.kind && !kinds.has(row.kind)) score *= 0.6; // e.g. AirPods for a "smartphone" photo
      // Similar models: a variant word in the evidence the model doesn't have.
      const extra = [...VARIANTS].filter((v) => !SOFT_VARIANTS.has(v) && (ocr.set.has(v) || label.set.has(v)) && !row.variants.includes(v) && row.core.length);
      score -= extra.length * 15;
    }
    const reason = Object.entries(signals).sort((a, b) => b[1] - a[1])[0][0];
    return { id: row.id, brand: row.brand, name: row.name, category: row.category, ref: row.ref, reason, signals, confidence: Math.max(0, Math.min(1, score / 100)) };
  }).sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));

  const top = list[0];
  const second = list[1];
  const shown = list.filter((c) => c.confidence >= MIN_SHOW).slice(0, 3);
  // 'exact' = the model is VERIFIED: its model number was read off the
  // device / box, or the server says EXACT. A name, an AI guess or a look
  // alone is never exact — those are offered for the user to confirm. Even
  // 'exact' is a card the user taps; nothing navigates on its own.
  const verifiedTop = !!top && ['ocr-model-number', 'ocr-model-prefix', 'server-exact'].some((k) => top.signals[k]);
  const auto = verifiedTop && top.confidence >= AUTO_SELECT && (!second || top.confidence - second.confidence >= MARGIN);
  // Search text for a caller with no candidate: something specific only.
  const specific = [identify?.label, identify?.brand, ...brandSet].find((t) => t && (hasDigit(t) || index.brands.has(normalize(t))));
  const debug = {
    codes,
    brands: [...brandSet],
    named: [...named].map((id) => byId.get(id)?.name),
    kinds: [...kinds],
    ocrChars: String(ocrText || '').length,
    server: identify?.ok ? { confidence: identify.confidence, label: identify.label, brand: identify.brand || null, labels: (identify.labels || []).slice(0, 5), matches: (identify.matches || []).length } : null,
    visual: visual?.ok ? { confidence: visual.confidence, matches: (visual.matches || []).length } : null,
    top: list.slice(0, 5).map((c) => `${c.brand} ${c.name} ${Math.round(c.confidence * 100)}% ${c.reason}`),
  };
  if (auto) return { status: 'exact', best: top, candidates: shown, confidence: top.confidence, reason: top.reason, label: specific || null, debug };
  if (shown.length) return { status: 'choose', best: shown[0], candidates: shown, confidence: shown[0].confidence, reason: shown[0].reason, label: specific || null, debug };
  // Not confident: no match. The closest few with the photo's OWN evidence (a
  // name it reads, or an image that looks like it) come back as suggestions,
  // of the device type the photo shows — never a server ranking alone, never
  // a brand's model list. With none, the caller says "Exact model not
  // identified" and offers manual search.
  const typed = (c) => !kinds.size || (index.rows.find((r) => r.id === c.id)?.kind && kinds.has(index.rows.find((r) => r.id === c.id).kind));
  const evidenced = (c) => Object.keys(c.signals).some((k) => k !== 'server-rank');
  const suggestions = list
    .filter((c) => c.confidence >= MIN_SUGGEST && typed(c) && evidenced(c))
    .slice(0, 3);
  return { status: 'none', best: null, candidates: [], suggestions, confidence: top ? top.confidence : 0, reason: top ? top.reason : 'no-evidence', label: specific || null, debug };
}
