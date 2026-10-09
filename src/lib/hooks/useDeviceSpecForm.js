import { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigFields, getDeviceCategories } from '../../api/masterData';
import {
  getDeviceFieldsByCategory,
  isUuid,
  missingRequiredSpecs,
  pickSpecValues,
  resolveSpecCategory,
  specRequestFields,
  usesCategorySpecs,
} from '../../utils/deviceSpecs';

// Device categories change about never — one request per app session.
let categoriesPromise = null;
function loadCategories() {
  if (!categoriesPromise) {
    categoriesPromise = getDeviceCategories().catch(() => {
      categoriesPromise = null;
      return [];
    });
  }
  return categoriesPromise;
}

/**
 * State for the category-specific part of a "Your Device" screen.
 *
 * Booking (service-booking-shop/DeviceColorStorageScreen) and Sell
 * (shared/device/SelectVariantScreen) both run on this, so they cannot drift:
 * same fields, same options, same required rules, same request fields. Each
 * screen only decides how a field LOOKS, in its own existing tile style.
 *
 * For MOBILE / TABLET (or a category that can't be resolved) `usesSpecs` is
 * false and the screen keeps its existing RAM + Storage form.
 *
 * @param {object} args
 * @param {Array}  args.hints           category code / name candidates, most specific first
 * @param {string} [args.categoryId]    category UUID (or code) from the picker
 * @param {string} [args.modelId]       catalogue model id; while set, waits for modelOptions
 * @param {object} [args.modelOptions]  getModelOptions() result, once loaded
 * @param {object} [args.initial]       saved values for edit mode — stored ("16GB") or display ("16 GB") form
 * @param {object} [args.legacy]        { ramOptionId, storageOptionId, ramLabel, storageLabel } of a
 *                                      record saved before category specs (see the seeding effect)
 * @param {string} [args.context]       'BOOKING' for Booking → Your Device (Smartwatch / Audio
 *                                      Device ask Color only there); omit for Sell
 */
export default function useDeviceSpecForm({ hints = [], categoryId, modelId, modelOptions, initial, legacy, context }) {
  const hinted = resolveSpecCategory(...hints);
  // The picker's UUID wins; the model's own category is the fallback (the
  // booking edit path only knows the category through the model).
  const uuidCandidate = isUuid(categoryId) ? categoryId : (isUuid(modelOptions?.categoryId) ? modelOptions.categoryId : null);
  const waitingForModel = !!modelId && !modelOptions;

  const [category, setCategory] = useState(hinted);
  const [configFields, setConfigFields] = useState([]);
  const [resolving, setResolving] = useState(true);
  const [values, setValues] = useState(() => ({ ...(initial || {}) }));

  useEffect(() => {
    if (waitingForModel) return undefined;
    let cancelled = false;
    setResolving(true);
    (async () => {
      let cat = hinted;
      let uuid = uuidCandidate;
      // Master categories are needed when only a UUID is known, or when a
      // spec category arrived as a code and its UUID is needed for config fields.
      if (!cat || (usesCategorySpecs(cat) && !uuid)) {
        const list = await loadCategories();
        const row = (uuid && list.find((c) => c.id === uuid))
          || (cat && list.find((c) => resolveSpecCategory(c.code, c.name) === cat));
        if (row) {
          cat = cat || resolveSpecCategory(row.code, row.name);
          uuid = uuid || row.id;
        }
      }
      // Admin-managed options (e.g. Laptop "Available RAM") and any optional
      // attribute master data enables for this category.
      const rows = usesCategorySpecs(cat) && uuid ? await getConfigFields(uuid).catch(() => []) : [];
      if (cancelled) return;
      setCategory(cat);
      setConfigFields(Array.isArray(rows) ? rows : []);
      setResolving(false);
    })();
    return () => { cancelled = true; };
  }, [hinted, uuidCandidate, waitingForModel]);

  // A laptop booked before category specs existed has its RAM / storage only
  // as master option ids. Carry them into the new fields once, so editing that
  // booking opens with RAM and Storage Capacity still selected (Storage Type,
  // which was never captured, is left for the shop to pick).
  const [legacySeeded, setLegacySeeded] = useState(false);
  useEffect(() => {
    if (legacySeeded || resolving || !modelOptions || category !== 'LAPTOP' || !legacy) return;
    setLegacySeeded(true);
    const ramText = legacy.ramLabel || modelOptions.allRams?.find((r) => r.id === legacy.ramOptionId)?.label;
    const storageText = legacy.storageLabel || modelOptions.allStorages?.find((s) => s.id === legacy.storageOptionId)?.label;
    setValues((prev) => ({
      ...prev,
      ram: prev.ram || ramText || null,
      storageCapacity: prev.storageCapacity || storageText || null,
    }));
  }, [legacySeeded, resolving, modelOptions, category, legacy]);

  const fields = useMemo(
    () => getDeviceFieldsByCategory(category, {
      modelColors: modelOptions?.colors || [],
      modelRamStorage: modelOptions?.ramStorage || [],
      configFields,
      context,
    }),
    [category, modelOptions, configFields, context],
  );

  // Only what the current category shows survives — a Laptop's RAM / storage
  // carried in from an earlier pick is dropped for a Smartwatch here, before
  // it can reach a request.
  const effective = useMemo(() => pickSpecValues(fields, values), [fields, values]);

  const setValue = useCallback((key, value) => {
    setValues((prev) => ({ ...prev, [key]: value || null }));
  }, []);

  const missing = missingRequiredSpecs(fields, effective);

  return {
    category,
    usesSpecs: usesCategorySpecs(category),
    loading: resolving || waitingForModel,
    fields,
    values: effective,
    setValue,
    missing,
    ready: missing.length === 0,
    /** { deviceCategory, ram, storageCapacity, storageType, caseSize, connectivity, deviceType } */
    requestFields: specRequestFields(category, effective),
  };
}
