// Copied from the Customer app's utils/currentDevice.js (minus expo-device).
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBrands, getModelsByBrand, getModelByNumber } from '../api/masterData';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Plausible marketed tiers so a raw reading (e.g. 5.6 GB RAM, 119 GB disk)
// snaps to the size printed on the box (6 GB, 128 GB).
const RAM_TIERS = [1, 2, 3, 4, 6, 8, 12, 16, 18, 24];
const STORAGE_TIERS = [16, 32, 64, 128, 256, 512, 1024];

// Google's public "supported devices" list — maps Build.MODEL codes (e.g.
// "CPH1809") to their marketing name ("OPPO A5"). Used only for values that
// look like a code; multi-word Build.MODELs ("Redmi Note 11T 5G") are already
// marketing names and shown as-is.
const DEVICE_CSV = 'https://storage.googleapis.com/play_public/supported_devices.csv';

function snap(value, tiers) {
  if (!value || value <= 0) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const t of tiers) {
    const d = Math.abs(t - value);
    if (d < bestDiff) { bestDiff = d; best = t; }
  }
  return best;
}

// A single-token value with a digit (CPH1809, V2027, SM-A505F) is almost always
// a raw model code; anything with a space is already a marketing name.
function looksLikeCode(model) {
  const s = String(model || '').trim();
  if (!s || s.includes(' ')) return false;
  return /\d/.test(s);
}

// Resolve a Build.MODEL code to its marketing name via the Google device list.
// Cached per-model in AsyncStorage so the (~MB) CSV is fetched at most once
// ever. Returns the marketing name, or null on miss/failure.
async function resolveMarketingName(model) {
  if (!looksLikeCode(model)) return null;
  const key = `ggfix.mktname.${model}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached != null) return cached || null; // '' = looked up, not found
  } catch (_) { /* ignore */ }
  try {
    const res = await fetch(DEVICE_CSV);
    // The CSV is UTF-16LE; RN's text() yields each char followed by a NUL. Drop
    // NULs + BOM to recover the (ASCII) text (a no-op if the body is UTF-8).
    const text = (await res.text()).replace(/\u0000/g, '').replace(/[\uFEFF\uFFFE]/g, '');
    if (!text.includes(',')) return null;
    const wanted = String(model).trim().toLowerCase();
    let name = '';
    for (const line of text.split('\n')) {
      // columns: Retail Branding, Marketing Name, Device, Model
      const cols = line.split(',');
      if (cols.length >= 4 && cols[3].trim().toLowerCase() === wanted) {
        const mkt = (cols[1] || '').trim();
        if (mkt) { name = mkt; break; }
      }
    }
    try { await AsyncStorage.setItem(key, name); } catch (_) { /* ignore */ }
    return name || null;
  } catch (_) {
    return null;
  }
}

// Match a (brand, marketing-name) against the app's master_models catalog to
// pull the real device image. Best-effort: needs the admin to have that model.
async function matchMasterImage(brandName, modelName) {
  if (!modelName || !brandName) return null;
  try {
    const brands = await getBrands().catch(() => []);
    const nb = norm(brandName);
    const brand = (brands || []).find(
      (b) => norm(b.name) === nb || (nb && (norm(b.name).includes(nb) || nb.includes(norm(b.name)))),
    );
    if (!brand) return null;
    const models = await getModelsByBrand(brand.id).catch(() => []);
    const nm = norm(modelName);
    const m = (models || []).find((x) => norm(x.name) === nm)
      || (models || []).find((x) => nm && (norm(x.name).includes(nm) || nm.includes(norm(x.name))));
    if (!m) return null;
    return m.imageUrl || (m.imageBase64 ? `data:image/png;base64,${m.imageBase64}` : null);
  } catch (_) {
    return null;
  }
}

/**
 * Detects the phone the app is running on: model, brand, RAM (GB), storage (GB).
 *
 * Everything is best-effort and guarded:
 *  - model/brand  -> RN core `Platform.constants` (Android, no native module) with
 *                    expo-device as the better source once it's in the build.
 *  - RAM          -> expo-device `totalMemory` — a NATIVE module that only resolves
 *                    after the app is rebuilt, so `ramGb` stays null until then.
 *  - storage      -> expo-file-system `Paths.totalDiskSpace` (already bundled).
 *
 * When the model reads as a code, it's upgraded to the marketing name async
 * (Google device list), so the card first shows the raw value then refines it.
 */
export function useCurrentDevice() {
  const [dev, setDev] = useState({ model: null, brand: null, ramGb: null, storageGb: null, image: null, named: false, ready: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let model = null;
      let brand = null;
      let ramGb = null;
      let storageGb = null;

      // Model/brand from RN core (Android; no native module needed). The
      // Customer app's copy also reads expo-device, which this app doesn't ship.
      if (Platform.OS === 'android') {
        const c = Platform.constants || {};
        if (!model) model = c.Model || null;
        if (!brand) brand = c.Brand || c.Manufacturer || null;
      }

      // Total storage via expo-file-system modern API (already bundled).
      try {
        // eslint-disable-next-line global-require
        const { Paths } = require('expo-file-system');
        const bytes = Paths?.totalDiskSpace;
        if (bytes && bytes > 0) storageGb = snap(bytes / 1e9, STORAGE_TIERS);
      } catch (_) { /* ignore — storage stays null */ }

      if (cancelled) return;
      setDev({ model, brand, ramGb, storageGb, image: null, named: false, ready: true });

      // PRIMARY: resolve the raw Build.MODEL code against the master_models
      // catalog (model_number jsonb) — the authoritative source. A hit gives us
      // both the proper marketing name ("OPPO A5 5G") and the catalog device
      // image in one call, so we skip the Google-list guesswork below.
      try {
        const hit = await getModelByNumber(model);
        if (hit && hit.name) {
          const img = hit.imageUrl
            || (hit.imageBase64 ? `data:image/png;base64,${hit.imageBase64}` : null);
          if (!cancelled) setDev((d) => ({ ...d, model: hit.name, named: true, image: img || d.image }));
          return; // catalog is authoritative — no need for the fallbacks
        }
      } catch (_) { /* ignore — fall through to the Google-list fallback */ }

      // FALLBACK (no catalog match): upgrade a model code to its marketing name
      // via the Google device list (async, non-blocking).
      const mkt = await resolveMarketingName(model);
      if (!cancelled && mkt) setDev((d) => ({ ...d, model: mkt, named: true }));

      // Once we have a real name (not a code), pull the device image from the
      // master_models catalog by name.
      const displayName = mkt || model;
      if (!looksLikeCode(displayName)) {
        const image = await matchMasterImage(brand, displayName);
        if (!cancelled && image) setDev((d) => ({ ...d, image }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return dev;
}

/**
 * Display model name — the resolved marketing name, else brand + model.
 * Returns null when the model is still a raw CODE (e.g. "21091116AI") so the
 * card can HIDE it rather than show a meaningless number.
 */
export function deviceName(dev) {
  if (dev?.named && dev.model) return String(dev.model).trim();
  const model = String(dev?.model || '').trim();
  if (looksLikeCode(model)) return null; // unresolved model code — hide it
  const brand = String(dev?.brand || '').trim();
  if (!model) return brand || null;
  if (!brand) return model;
  return model.toLowerCase().includes(brand.toLowerCase()) ? model : `${brand} ${model}`;
}

/**
 * "OPPO A5 (6 GB / 128 GB)" — name plus specs. When the name is an unresolved
 * code it's dropped and we fall back to "Your device (…specs…)", so a model
 * number is never shown.
 */
export function deviceTitle(dev) {
  const specs = [dev?.ramGb ? `${dev.ramGb} GB` : null, dev?.storageGb ? `${dev.storageGb} GB` : null]
    .filter(Boolean).join(' / ');
  const label = deviceName(dev) || 'Your device';
  return specs ? `${label} (${specs})` : label;
}

/**
 * A rough resale estimate for the card teaser only — deliberately NOT a real
 * quote (the user asked not to wire up exact Cashify pricing). The firm price
 * comes from the Sell flow's shop quotes after the customer taps "Sell Now".
 */
export function roughEstimate(dev) {
  const ram = dev?.ramGb || 4;
  const sto = dev?.storageGb || 64;
  const est = 2500 + ram * 900 + sto * 15;
  return Math.max(1500, Math.round(est / 10) * 10);
}
