import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { listAddresses } from '../api/customer';

/**
 * Resolve the customer's current lat/lng — Swiggy/Zomato style.
 *
 * Priority on auto-load:
 *   1. window.__GGFIX_FORCE_LOCATION (manual dev override)
 *   2. Default saved address with non-null lat/lng
 *   3. Browser GPS — only if accuracy is reasonable (≤ 5 km)
 *   4. DEFAULT (CUDDALORE) — so the demo never silently shows "no shops".
 *
 * `detectGps()` is the explicit "use my current location" action (tap on the
 * header pill). It requests a high-accuracy fix, accepts it regardless of the
 * accuracy gate, and reverse-geocodes it to a readable area label.
 *
 * Returns: { lat, lng, source, loading, error, addressLabel, refresh, detectGps }
 *   source: 'override' | 'address' | 'gps' | 'default'
 */

const DEFAULT_LOCATION = {
  lat: 11.7480,
  lng: 79.7714,
  label: 'Cuddalore (default)',
};

const GPS_MAX_ACCURACY_METERS = 5000;

// On native (iOS/Android), navigator.geolocation isn't reliably polyfilled in
// Expo SDK 54 — we use expo-location which handles the runtime permission
// prompt + native fix. On web, expo-location internally calls the browser
// Geolocation API so the same code path works.
function geolocationAvailable() {
  // expo-location loads on all platforms; for web we still want navigator as a
  // sanity check since some embedded webviews disable Geolocation entirely.
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  }
  return true;
}

async function ensurePermission() {
  let res = await Location.getForegroundPermissionsAsync();
  if (res.status === 'granted') return true;
  res = await Location.requestForegroundPermissionsAsync();
  return res.status === 'granted';
}

async function getPosition(options = {}) {
  if (!geolocationAvailable()) throw new Error('Geolocation not available');
  const ok = await ensurePermission();
  if (!ok) throw new Error('Location permission denied');
  // Mirror the navigator.geolocation shape so the rest of the hook is unchanged.
  const pos = await Location.getCurrentPositionAsync({
    accuracy: options.enableHighAccuracy ? Location.Accuracy.Highest : Location.Accuracy.Balanced,
    timeInterval: 0,
    distanceInterval: 0,
  });
  return {
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    },
  };
}

// Best-effort reverse geocode (keyless, CORS-enabled client endpoint). Falls
// back to null on any failure so the caller can show "Current location".
async function reverseGeocode(lat, lng) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const area = j.locality || j.city || j.principalSubdivision;
    const pin = j.postcode;
    const label = [pin, area].filter(Boolean).join(', ');
    return label || area || null;
  } catch (_) {
    return null;
  }
}

export function useCustomerLocation({ enableGps = true } = {}) {
  const [state, setState] = useState({
    lat: null,
    lng: null,
    source: null,
    loading: true,
    error: null,
    addressLabel: null,
  });

  // No demo-coord fallback: customers must grant GPS or set an address with
  // saved coords. Without one, lat/lng stay null and the screen shows a
  // permission-prompt empty state instead of pretending we're in Cuddalore.
  const setDefault = useCallback((extraError) => {
    setState({
      lat: null,
      lng: null,
      source: null,
      loading: false,
      error: extraError || 'Location permission required — tap below to allow.',
      addressLabel: null,
    });
  }, []);

  // Apply a resolved GPS fix, then enrich the label via reverse geocoding.
  const applyGps = useCallback(async (latitude, longitude) => {
    setState({
      lat: latitude,
      lng: longitude,
      source: 'gps',
      loading: false,
      error: null,
      addressLabel: 'Current location',
    });
    const label = await reverseGeocode(latitude, longitude);
    if (label) {
      setState((s) => (s.source === 'gps' ? { ...s, addressLabel: label } : s));
    }
  }, []);

  // Explicit "use my current location" — high accuracy, no accuracy gate.
  const detectGps = useCallback(async () => {
    if (!geolocationAvailable()) {
      setState((s) => ({ ...s, loading: false, error: 'Location not available on this device' }));
      return false;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const pos = await getPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      await applyGps(pos.coords.latitude, pos.coords.longitude);
      return true;
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Could not get your location' }));
      return false;
    }
  }, [applyGps]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // 1. Manual dev override
      if (typeof window !== 'undefined' && window.__GGFIX_FORCE_LOCATION) {
        const o = window.__GGFIX_FORCE_LOCATION;
        if (typeof o.lat === 'number' && typeof o.lng === 'number') {
          setState({
            lat: o.lat,
            lng: o.lng,
            source: 'override',
            loading: false,
            error: null,
            addressLabel: o.label || 'Forced test location',
          });
          return;
        }
      }

      // 2. Saved default address with stored coords
      const addresses = await listAddresses().catch(() => []);
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      if (def?.latitude != null && def?.longitude != null) {
        setState({
          lat: Number(def.latitude),
          lng: Number(def.longitude),
          source: 'address',
          loading: false,
          error: null,
          addressLabel: def.label || def.city || 'Saved address',
        });
        return;
      }

      // 3. Native / browser GPS via expo-location (asks runtime permission on
      //    first call). Accuracy-gated so IP fallbacks don't poison things.
      if (enableGps && geolocationAvailable()) {
        try {
          const pos = await getPosition({ enableHighAccuracy: true });
          const { latitude, longitude, accuracy } = pos.coords;
          if (accuracy && accuracy > GPS_MAX_ACCURACY_METERS) {
            setDefault(`Location too imprecise (~${Math.round(accuracy / 1000)} km). Tap to use current location.`);
            return;
          }
          await applyGps(latitude, longitude);
          return;
        } catch (e) {
          // Permission denied / no signal — fall through to the no-location state.
        }
      }

      // 4. No GPS available → demo default
      setDefault();
    } catch (e) {
      setDefault(e?.message || 'Failed to resolve location');
    }
  }, [enableGps, applyGps, setDefault]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load, detectGps };
}
