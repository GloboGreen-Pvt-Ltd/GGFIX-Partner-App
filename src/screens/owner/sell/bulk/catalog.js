import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBrandsForCategory, getDeviceCategories, getModelOptions, getModelsByBrand, getModelsBySeries, getSeriesForCategoryBrand,
} from '../../../../api/masterData';
import { resolveDeviceImageSource } from '../../../../utils/images';
import { safeErrorText } from '../../../../lib/safeError';

// Master data for the bulk flow, cached per app session. A failed or empty
// answer is never cached, so Retry really asks the server again.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cache = new Map();
const asList = (v) => (Array.isArray(v) ? v : []);

function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const p = fn().then(
    (v) => { if (Array.isArray(v) && !v.length) cache.delete(key); return v; },
    (e) => { cache.delete(key); throw e; },
  );
  cache.set(key, p);
  return p;
}

export const loadCategories = () => cached('cats', async () => asList(await getDeviceCategories()));

export const loadBrands = (categoryId) => cached(`brands:${categoryId || ''}`, async () => asList(await getBrandsForCategory(categoryId || null)));

export const loadSeries = (categoryId, brandId) => (
  categoryId && brandId
    ? cached(`series:${categoryId}:${brandId}`, async () => asList(await getSeriesForCategoryBrand(categoryId, brandId)))
    : Promise.resolve([])
);

/** Models of a series, or of a brand (filtered to the category) when there is no series. */
export function loadModels({ categoryId, brandId, seriesId }) {
  if (seriesId) return cached(`models:s:${seriesId}`, async () => asList(await getModelsBySeries(seriesId)));
  if (!brandId) return Promise.resolve([]);
  return cached(`models:b:${brandId}:${categoryId || ''}`, async () => {
    const list = asList(await getModelsByBrand(brandId));
    return UUID_RE.test(String(categoryId || '')) ? list.filter((m) => !m.categoryId || m.categoryId === categoryId) : list;
  });
}

/** getModelOptions(modelId) — with no model, just the master colour / RAM / storage lists. */
export const loadModelOptions = (modelId) => cached(`opts:${modelId || ''}`, () => getModelOptions(modelId || null));

export const imageOf = (row) => (row ? resolveDeviceImageSource({ url: row.imageUrl || row.logoUrl, base64: row.imageBase64 }) : null);

export const toOptions = (list, sub) => asList(list).map((x) => ({ id: x.id, label: x.name || x.label, sub: sub ? sub(x) : undefined, image: imageOf(x), row: x }));

/** Identity of a loader's inputs, to tell whose answer `data` is. */
export const depsKey = (deps) => JSON.stringify(deps.map((d) => (d == null ? null : d)));

/**
 * { data, loading, error, key, reload } for an async loader. `key` is the
 * depsKey() the current data / error belongs to. `enabled=false`
 * keeps it idle (data stays as the initial value).
 */
export function useLoad(fn, deps, { enabled = true, initial = null } = {}) {
  const [state, setState] = useState({ data: initial, loading: !!enabled, error: null, key: null });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    const key = depsKey(deps);
    if (!enabled) { setState({ data: initial, loading: false, error: null, key: null }); return; }
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => { if (id === seq.current) setState({ data, loading: false, error: null, key }); })
      .catch((e) => { if (id === seq.current) setState({ data: initial, loading: false, error: safeErrorText(e, 'Could not load. Check your connection and retry.'), key }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  useEffect(() => { run(); return () => { seq.current += 1; }; }, [run]);
  return { ...state, reload: run };
}
