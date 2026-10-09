import { useState, useEffect, useCallback } from 'react';
import {
  getBrands,
  getModelsByBrand,
  getRamOptions,
  getStorageOptions,
  getRepairServices,
} from '../masterData';

export function useBrands() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBrands()
      .then((list) => { if (!cancelled) setData(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load brands'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { brands: data, loading, error };
}

export function useModels(brandId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!brandId) {
      setData([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getModelsByBrand(brandId)
      .then((list) => { if (!cancelled) setData(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load models'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId]);
  return { models: data, loading, error };
}

export function useRamOptions() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRamOptions()
      .then((list) => { if (!cancelled) setData(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load RAM options'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { ramOptions: data, loading, error };
}

export function useStorageOptions() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStorageOptions()
      .then((list) => { if (!cancelled) setData(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load storage options'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { storageOptions: data, loading, error };
}

export function useRepairServices() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRepairServices()
      .then((list) => { if (!cancelled) setData(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load repair services'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { repairServices: data, loading, error };
}
