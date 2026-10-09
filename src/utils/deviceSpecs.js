/**
 * Category-specific device specifications — the ONE definition behind both
 * "Your Device" screens:
 *   Booking → service-booking-shop/DeviceColorStorageScreen
 *   Sell    → shared/device/SelectVariantScreen
 * and every booking / listing display that reads the values back.
 *
 * MOBILE and TABLET are deliberately absent from CATEGORY_FIELDS: they keep
 * their existing master RAM + Storage option-id pickers, untouched. Only
 * LAPTOP, SMARTWATCH and AUDIO_DEVICE render from here.
 *
 * Stored vs shown: values live in the STORED form the backend normalizes to
 * (Server common-device-specs) — "16GB", "NVME_SSD", "44MM", "GPS_CELLULAR" —
 * and are only turned into "16 GB" / "NVMe SSD" / "44 mm" / "GPS + Cellular"
 * for display. The normalizers below mirror DeviceSpecNormalizer.java; the
 * alias and config-code tables mirror DeviceSpecCategory / DeviceSpecKey.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// ─── Categories ──────────────────────────────────────────────────────────────

export const SPEC_CATEGORY = {
  MOBILE: 'MOBILE',
  TABLET: 'TABLET',
  LAPTOP: 'LAPTOP',
  SMARTWATCH: 'SMARTWATCH',
  AUDIO_DEVICE: 'AUDIO_DEVICE',
};

// master_device_categories.code spellings → spec category. The live catalogue
// uses MOBILE, TABLET, LAPTOP, SMARTWATCHES and AUDIO_DEVICE.
const CATEGORY_ALIASES = {
  MOBILE: 'MOBILE', MOBILES: 'MOBILE', SMARTPHONE: 'MOBILE', SMARTPHONES: 'MOBILE', PHONE: 'MOBILE',
  TABLET: 'TABLET', TABLETS: 'TABLET',
  LAPTOP: 'LAPTOP', LAPTOPS: 'LAPTOP',
  SMARTWATCH: 'SMARTWATCH', SMARTWATCHES: 'SMARTWATCH', SMART_WATCH: 'SMARTWATCH',
  SMART_WATCHES: 'SMARTWATCH', WATCH: 'SMARTWATCH', WATCHES: 'SMARTWATCH',
  AUDIO_DEVICE: 'AUDIO_DEVICE', AUDIO_DEVICES: 'AUDIO_DEVICE', AUDIO: 'AUDIO_DEVICE',
};

/**
 * First candidate (category code or name, any casing) that names a category.
 * UUIDs are skipped — resolve those through master data first. Falls back to
 * the substring keywords the screens have always used ('WATCH', 'AUDIO'…).
 */
export function resolveSpecCategory(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!s || isUuid(s)) continue;
    const key = s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
    if (key.includes('LAPTOP')) return 'LAPTOP';
    if (key.includes('WATCH')) return 'SMARTWATCH';
    // Before the PHONE check: "Headphones" / "Earphones" contain it.
    if (/AUDIO|HEADPHONE|EARPHONE|EARBUD|SPEAKER|SOUNDBAR/.test(key)) return 'AUDIO_DEVICE';
    if (key.includes('TABLET')) return 'TABLET';
    if (key.includes('MOBILE') || key.includes('PHONE')) return 'MOBILE';
  }
  return null;
}

// ─── Normalizers (input → stored form; null when not a valid value) ─────────

const stripZeroFraction = (n) => (n.includes('.') ? n.replace(/\.?0+$/, '') : n);

/** "16 GB" / "16gb" / "16" → "16GB"; "1 tb" → "1TB". */
export function normalizeCapacity(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(gb|tb|mb|g|t|m)?$/i);
  if (!m) return null;
  const unit = (m[2] || 'gb').toLowerCase();
  const suffix = unit.startsWith('t') ? 'TB' : unit.startsWith('m') ? 'MB' : 'GB';
  return `${stripZeroFraction(m[1])}${suffix}`;
}

const STORAGE_TYPE_ALIASES = {
  HDD: 'HDD', HARDDISK: 'HDD', HARDDISKDRIVE: 'HDD', HARDDISKDRIVEHDD: 'HDD',
  SATASSD: 'SATA_SSD', SSD: 'SATA_SSD',
  NVME: 'NVME_SSD', NVMESSD: 'NVME_SSD',
};

/** "NVMe SSD" / "nvme" / "NVME_SSD" → "NVME_SSD". */
export function normalizeStorageType(raw) {
  const key = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return STORAGE_TYPE_ALIASES[key] || null;
}

/** "44 mm" / "44mm" / "44" → "44MM". */
export function normalizeCaseSize(raw) {
  const m = String(raw ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(mm)?$/i);
  return m ? `${stripZeroFraction(m[1])}MM` : null;
}

/** "GPS + Cellular" → "GPS_CELLULAR", "Bluetooth + Wi-Fi" → "BLUETOOTH_WIFI", "3.5 mm" → "AUX_3_5MM". */
export function toSpecCode(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
    .replace(/WI[\s-]?FI/g, 'WIFI')
    .replace(/USB[\s-]?C\b|TYPE[\s-]?C\b/g, 'USB_C')
    .replace(/3\.5\s*MM/g, 'AUX_3_5MM')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s && s.length <= 40 ? s : null;
}

export function normalizeSpecValue(key, raw) {
  if (raw == null || String(raw).trim() === '') return null;
  switch (key) {
    case 'ram':
    case 'storageCapacity': return normalizeCapacity(raw);
    case 'storageType': return normalizeStorageType(raw);
    case 'caseSize': return normalizeCaseSize(raw);
    case 'connectivity':
    case 'deviceType': return toSpecCode(raw);
    case 'color': return String(raw).trim();
    default: return null;
  }
}

// ─── Options (value = stored form, label = UI) ───────────────────────────────

const capacityLabel = (v) => String(v).replace(/^(\d+(?:\.\d+)?)(MB|GB|TB)$/, '$1 $2');
const caseSizeLabel = (v) => String(v).replace(/^(\d+(?:\.\d+)?)MM$/, '$1 mm');
const sized = (values, label) => values.map((value) => ({ value, label: label(value) }));

const RAM_OPTIONS = sized(['4GB', '8GB', '12GB', '16GB', '24GB', '32GB', '64GB'], capacityLabel);
const STORAGE_CAPACITY_OPTIONS = sized(['128GB', '256GB', '512GB', '1TB', '2TB', '4TB'], capacityLabel);
const CASE_SIZE_OPTIONS = sized(['38MM', '40MM', '41MM', '42MM', '44MM', '45MM', '46MM', '49MM'], caseSizeLabel);

// A closed set: the backend accepts only these three.
export const STORAGE_TYPE_OPTIONS = [
  { value: 'HDD', label: 'Hard Disk Drive (HDD)', short: 'HDD' },
  { value: 'SATA_SSD', label: 'SATA SSD' },
  { value: 'NVME_SSD', label: 'NVMe SSD' },
];

const SMARTWATCH_CONNECTIVITY_OPTIONS = [
  { value: 'BLUETOOTH', label: 'Bluetooth' },
  { value: 'BLUETOOTH_WIFI', label: 'Bluetooth + Wi-Fi' },
  { value: 'GPS', label: 'GPS' },
  { value: 'GPS_CELLULAR', label: 'GPS + Cellular' },
  { value: 'LTE', label: 'LTE' },
  { value: 'WIFI', label: 'Wi-Fi' },
];

const AUDIO_CONNECTIVITY_OPTIONS = [
  { value: 'BLUETOOTH', label: 'Bluetooth' },
  { value: 'WIRED', label: 'Wired' },
  { value: 'BLUETOOTH_WIRED', label: 'Bluetooth + Wired' },
  { value: 'USB', label: 'USB' },
  { value: 'USB_C', label: 'USB-C' },
  { value: 'AUX_3_5MM', label: '3.5 mm' },
  { value: 'WIFI', label: 'Wi-Fi' },
];

const AUDIO_DEVICE_TYPE_OPTIONS = [
  { value: 'TWS_EARBUDS', label: 'TWS Earbuds' },
  { value: 'WIRELESS_EARBUDS', label: 'Wireless Earbuds' },
  { value: 'WIRED_EARPHONES', label: 'Wired Earphones' },
  { value: 'WIRELESS_HEADPHONES', label: 'Wireless Headphones' },
  { value: 'WIRED_HEADPHONES', label: 'Wired Headphones' },
  { value: 'BLUETOOTH_SPEAKER', label: 'Bluetooth Speaker' },
  { value: 'SOUNDBAR', label: 'Soundbar' },
  { value: 'OTHER', label: 'Other' },
];

// Used only when the model has no colours configured in master data (every
// catalogue laptop / watch / audio model has them; a model typed through
// "Other" does not).
const FALLBACK_COLORS = {
  LAPTOP: ['Black', 'Silver', 'Grey', 'Space Grey', 'White', 'Blue', 'Gold', 'Other'],
  SMARTWATCH: ['Black', 'Silver', 'Gold', 'Rose Gold', 'White', 'Blue', 'Green', 'Pink', 'Other'],
  AUDIO_DEVICE: ['Black', 'White', 'Grey', 'Blue', 'Silver', 'Red', 'Green', 'Pink', 'Other'],
};

// Every known code → label, for turning stored values back into UI text.
const CODE_LABELS = {};
[...STORAGE_TYPE_OPTIONS, ...SMARTWATCH_CONNECTIVITY_OPTIONS, ...AUDIO_CONNECTIVITY_OPTIONS, ...AUDIO_DEVICE_TYPE_OPTIONS]
  .forEach((o) => { if (!CODE_LABELS[o.value]) CODE_LABELS[o.value] = o.label; });

/** Stored value → UI text: "16GB" → "16 GB", "NVME_SSD" → "NVMe SSD", "44MM" → "44 mm". */
export function formatSpecValue(key, value) {
  if (value == null || value === '') return '';
  const v = String(value);
  switch (key) {
    case 'ram':
    case 'storageCapacity': return capacityLabel(v);
    case 'caseSize': return caseSizeLabel(v);
    case 'storageType':
    case 'connectivity':
    case 'deviceType':
      return CODE_LABELS[v]
        || v.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    default: return v;
  }
}

// ─── Fields per category ─────────────────────────────────────────────────────

const FIELD_DEFS = {
  color: { key: 'color', label: 'Color', hint: 'Pick the colour' },
  ram: { key: 'ram', label: 'RAM', hint: 'Pick the memory size' },
  storageCapacity: { key: 'storageCapacity', label: 'Storage Capacity', hint: 'Pick the capacity' },
  storageType: { key: 'storageType', label: 'Storage Type', hint: 'HDD, SATA SSD or NVMe SSD' },
  caseSize: { key: 'caseSize', label: 'Case Size', hint: 'Pick the case size' },
  connectivity: { key: 'connectivity', label: 'Connectivity', hint: 'How it connects' },
  deviceType: { key: 'deviceType', label: 'Device Type', hint: 'What kind of audio device' },
};

/** The attributes each category always asks for, in screen order. All required. */
export const CATEGORY_FIELDS = {
  LAPTOP: ['color', 'ram', 'storageCapacity', 'storageType'],
  SMARTWATCH: ['color', 'caseSize', 'connectivity'],
  AUDIO_DEVICE: ['deviceType', 'color', 'connectivity'],
};

/**
 * Per-flow narrowing of CATEGORY_FIELDS, keyed by the `context` passed to
 * getDeviceFieldsByCategory. Booking → Your Device asks a Smartwatch or an
 * Audio Device for its colour only; Laptop booking and every Sell category
 * keep the full set above. A narrowed form gets no optional master-enabled
 * extras either.
 */
const CONTEXT_FIELDS = {
  BOOKING: {
    SMARTWATCH: ['color'],
    AUDIO_DEVICE: ['color'],
  },
};

/** Every category-specific attribute key (colour has its own `color` field everywhere). */
export const SPEC_ATTRIBUTE_KEYS = ['ram', 'storageCapacity', 'storageType', 'caseSize', 'connectivity', 'deviceType'];

/** True for LAPTOP / SMARTWATCH / AUDIO_DEVICE — the categories this file renders. */
export const usesCategorySpecs = (category) => !!CATEGORY_FIELDS[category];

// master_device_config_fields.code → attribute. Mirrors DeviceSpecKey.BY_CONFIG_CODE.
const CONFIG_FIELD_CODES = {
  RAM: 'ram', AVAILABLE_RAM: 'ram', RAM_SIZE: 'ram',
  STORAGE: 'storageCapacity', STORAGE_CAPACITY: 'storageCapacity', INTERNAL_STORAGE: 'storageCapacity',
  SIZE_OF_HARD_DISK_SSD: 'storageCapacity', SIZE_OF_HARD_DISK: 'storageCapacity', HARD_DISK_SIZE: 'storageCapacity',
  STORAGE_TYPE: 'storageType', HARD_DISK_TYPE: 'storageType',
  CASE_SIZE: 'caseSize', DIAL_SIZE: 'caseSize',
  CONNECTIVITY: 'connectivity',
  DEVICE_TYPE: 'deviceType', AUDIO_DEVICE_TYPE: 'deviceType',
};

/** The attribute a master Device Configuration field code stands for, or null. */
export const specKeyForConfigCode = (code) => CONFIG_FIELD_CODES[String(code || '').trim().toUpperCase()] || null;

const capacityBytes = (v) => {
  const m = String(v).match(/^(\d+(?:\.\d+)?)(MB|GB|TB)$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * (m[2] === 'TB' ? 1024 * 1024 : m[2] === 'GB' ? 1024 : 1);
};

/** model.ramStorage ["16GB + 512GB", "128 GB"] → { ram: Set, storageCapacity: Set } of stored values. */
function capacitiesFromRamStorage(entries) {
  const out = { ram: new Set(), storageCapacity: new Set() };
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const s = String(entry || '');
    if (s.includes('+')) {
      const [r, st] = s.split('+');
      const rv = normalizeCapacity(r);
      const sv = normalizeCapacity(st);
      if (rv) out.ram.add(rv);
      if (sv) out.storageCapacity.add(sv);
    } else {
      const sv = normalizeCapacity(s);
      if (sv) out.storageCapacity.add(sv);
    }
  });
  return out;
}

function optionsFor(key, category, { required, modelColors, modelCaps, config }) {
  if (key === 'color') {
    if (modelColors.length) {
      return modelColors.map((c) => ({ value: c.name, label: c.name, hex: c.hexCode || null }));
    }
    return (FALLBACK_COLORS[category] || []).map((n) => ({ value: n, label: n }));
  }
  if (key === 'storageType') return STORAGE_TYPE_OPTIONS;
  if (key === 'ram' || key === 'storageCapacity') {
    // Capacities are a union: the defaults (so a 12 GB / 4 TB laptop is never
    // unselectable), master Device Configuration values, and the model's own
    // RAM/storage variants. An optional, master-enabled field (storage on a
    // watch model that ships in sizes) offers only what master data lists.
    const seed = required ? (key === 'ram' ? RAM_OPTIONS : STORAGE_CAPACITY_OPTIONS).map((o) => o.value) : [];
    const all = new Set(seed);
    (config[key] || []).forEach((v) => { const n = normalizeCapacity(v); if (n) all.add(n); });
    modelCaps[key].forEach((v) => all.add(v));
    return [...all].sort((a, b) => capacityBytes(a) - capacityBytes(b)).map((value) => ({ value, label: capacityLabel(value) }));
  }
  // caseSize / connectivity / deviceType: master values when configured,
  // otherwise the built-in list.
  const fromMaster = [];
  const seen = new Set();
  (config[key] || []).forEach((text) => {
    const value = normalizeSpecValue(key, text);
    if (!value || seen.has(value)) return;
    seen.add(value);
    fromMaster.push({ value, label: key === 'caseSize' ? caseSizeLabel(value) : String(text).trim() });
  });
  if (fromMaster.length) return fromMaster;
  if (key === 'caseSize') return CASE_SIZE_OPTIONS;
  if (key === 'deviceType') return AUDIO_DEVICE_TYPE_OPTIONS;
  if (key === 'connectivity') {
    return category === 'AUDIO_DEVICE' ? AUDIO_CONNECTIVITY_OPTIONS : SMARTWATCH_CONNECTIVITY_OPTIONS;
  }
  return [];
}

/**
 * The fields a category's "Your Device" form shows, with their options:
 *   [{ key, label, hint, required, options: [{ value, label, hex? }] }]
 * Empty for MOBILE / TABLET / unknown — the caller keeps its existing form.
 *
 * Beyond the category's own attributes, an optional field appears only when
 * master data explicitly supports it: an active Device Configuration field on
 * the category (e.g. "Storage" added to Smartwatch), or the model's own
 * ramStorage listing real sizes. The backend accepts exactly the same set.
 *
 * @param {string} category                 resolveSpecCategory() result
 * @param {object} [master]
 * @param {Array}  [master.modelColors]     getModelOptions().colors — [{ name, hexCode }]
 * @param {Array}  [master.modelRamStorage] the model's raw ramStorage strings
 * @param {Array}  [master.configFields]    getConfigFields(categoryId) rows
 * @param {string} [master.context]         'BOOKING' applies CONTEXT_FIELDS.BOOKING
 */
export function getDeviceFieldsByCategory(category, { modelColors = [], modelRamStorage = [], configFields = [], context } = {}) {
  const narrowed = CONTEXT_FIELDS[context]?.[category] || null;
  const base = narrowed || CATEGORY_FIELDS[category];
  if (!base) return [];

  const config = {};
  (Array.isArray(configFields) ? configFields : []).forEach((f) => {
    if (!f || f.isActive === false) return;
    const key = specKeyForConfigCode(f.code);
    if (!key) return;
    config[key] = (config[key] || []).concat(
      (f.options || []).map((o) => (typeof o === 'string' ? o : (o.value ?? o.optionValue ?? o.name))).filter(Boolean),
    );
  });
  const modelCaps = capacitiesFromRamStorage(modelRamStorage);

  const keys = [...base];
  if (!narrowed) {
    Object.keys(config).forEach((key) => { if (!keys.includes(key)) keys.push(key); });
    ['ram', 'storageCapacity'].forEach((key) => {
      if (!keys.includes(key) && modelCaps[key].size) keys.push(key);
    });
  }

  return keys.map((key) => {
    const required = base.includes(key);
    return {
      ...FIELD_DEFS[key],
      required,
      options: optionsFor(key, category, { required, modelColors, modelCaps, config }),
    };
  });
}

// ─── Device security lock (Booking) ─────────────────────────────────────────

/**
 * Lock types the Booking "Device Security Lock" step offers per category, in
 * the sheet's own order. Mobile and Tablet: Numeric PIN, Password, Pattern
 * Lock, No Lock. Laptop: Numeric PIN, Password. Smartwatch and Audio Device
 * have no lock step at all (empty list). A category that can't be resolved
 * keeps the full Mobile set, as before.
 */
const LOCK_TYPES = {
  MOBILE: ['PIN', 'PASSWORD', 'PATTERN', 'NONE'],
  TABLET: ['PIN', 'PASSWORD', 'PATTERN', 'NONE'],
  LAPTOP: ['PIN', 'PASSWORD'],
  SMARTWATCH: [],
  AUDIO_DEVICE: [],
};

export function lockTypesFor(category) {
  return LOCK_TYPES[category] || LOCK_TYPES.MOBILE;
}

// ─── Values ──────────────────────────────────────────────────────────────────

/**
 * Normalize `values` and keep only the keys `fields` shows. This is what drops
 * a Laptop's RAM / storage when the device turns out to be a Smartwatch, so a
 * stale value from an earlier pick can never ride along into the request.
 */
export function pickSpecValues(fields, values) {
  const out = {};
  (fields || []).forEach((f) => {
    const v = normalizeSpecValue(f.key, values?.[f.key]);
    if (v) out[f.key] = v;
  });
  return out;
}

/** Labels of required fields still empty — drives the Continue button. */
export function missingRequiredSpecs(fields, values) {
  return (fields || []).filter((f) => f.required && !values?.[f.key]).map((f) => f.label);
}

/**
 * Request fields for a booking / listing body. Every attribute key is present:
 * the ones that don't apply to the category are explicitly null, and MOBILE /
 * TABLET carry only deviceCategory (their specs stay in ramOptionId /
 * storageOptionId). Colour is not included — it has its own `color` field.
 */
export function specRequestFields(category, specs) {
  const out = { deviceCategory: category || undefined };
  const allowed = usesCategorySpecs(category);
  SPEC_ATTRIBUTE_KEYS.forEach((key) => {
    out[key] = allowed ? (normalizeSpecValue(key, specs?.[key]) || null) : null;
  });
  return out;
}

/** The stored attributes off an API record (ticket / product), or off a nested `specs`. */
export function specsFromRecord(record) {
  const src = record?.specs && typeof record.specs === 'object' ? record.specs : (record || {});
  const out = {};
  SPEC_ATTRIBUTE_KEYS.forEach((key) => {
    if (src[key] != null && src[key] !== '') out[key] = src[key];
  });
  return out;
}

// ─── Display ─────────────────────────────────────────────────────────────────

function categoryOf(src) {
  return resolveSpecCategory(src?.deviceCategory, src?.categoryCode, src?.categoryName);
}

/**
 * True when `src` (booking-flow params, a device record or an API record) is a
 * Laptop / Smartwatch / Audio Device carrying category specs. Displays branch
 * on this so a Mobile / Tablet line keeps its exact existing expression.
 */
export function hasCategorySpecs(src) {
  return !!src && usesCategorySpecs(categoryOf(src)) && Object.keys(specsFromRecord(src)).length > 0;
}

/**
 * Short spec chips for cards and summary lines, e.g.
 *   Laptop      → ["16 GB", "512 GB NVMe SSD"]
 *   Smartwatch  → ["44 mm", "GPS + Cellular"]
 *   Audio       → ["TWS Earbuds", "Bluetooth"]
 *   Mobile      → [ramLabel, storageLabel]   (unchanged)
 * Works on booking-flow params ({ deviceCategory, specs, ramLabel, … }) and on
 * API records (flat ram / storageCapacity / … fields) alike. `withColor`
 * appends the colour, matching the screens' existing "specs · colour" order.
 */
export function specDisplayParts(src, { withColor = false } = {}) {
  if (!src) return [];
  const category = categoryOf(src);
  const specs = specsFromRecord(src);
  let parts;
  if (usesCategorySpecs(category) && Object.keys(specs).length) {
    const storage = [formatSpecValue('storageCapacity', specs.storageCapacity), formatSpecValue('storageType', specs.storageType)]
      .filter(Boolean).join(' ');
    const order = {
      LAPTOP: [formatSpecValue('ram', specs.ram), storage],
      SMARTWATCH: [formatSpecValue('caseSize', specs.caseSize), formatSpecValue('connectivity', specs.connectivity), storage],
      AUDIO_DEVICE: [formatSpecValue('deviceType', specs.deviceType), formatSpecValue('connectivity', specs.connectivity), storage],
    }[category];
    parts = order;
  } else {
    // Mobile / Tablet, and any booking written before category specs existed.
    parts = [src.ramLabel, src.storageLabel];
  }
  if (withColor) parts = [...parts, src.color];
  return parts.filter(Boolean);
}

/**
 * Label/value rows for detail screens: [{ key, label, value }]. Empty for
 * Mobile / Tablet, whose screens keep their existing RAM / Storage rows.
 */
export function specDetailRows(src) {
  const category = categoryOf(src);
  if (!usesCategorySpecs(category)) return [];
  const specs = specsFromRecord(src);
  const keys = [...CATEGORY_FIELDS[category].filter((k) => k !== 'color'),
    ...SPEC_ATTRIBUTE_KEYS.filter((k) => !CATEGORY_FIELDS[category].includes(k))];
  return keys
    .filter((key) => specs[key])
    .map((key) => ({ key, label: FIELD_DEFS[key].label, value: formatSpecValue(key, specs[key]) }));
}
