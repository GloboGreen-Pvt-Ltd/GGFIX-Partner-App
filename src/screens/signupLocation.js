import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, UIManager, View } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Check, Crosshair, MapPin, Search } from 'lucide-react-native';
import { GREEN, MUTED, INK, FIELD_BORDER } from './authUi';
import { authApi } from '../api/client';

// Create Account: Google Places search (shop name + map search) and a compact
// map to confirm the shop's exact pin. Reuses the app's Android Maps key
// (app.config.js → GOOGLE_MAPS_ANDROID_API_KEY) for the map; search is via
// the backend Places proxy. Everything is optional —
// manual entry always works when Google / the map is unavailable.

const KEY = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || ''; // map only
let Maps = null;
try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
const HAS_MAP = Platform.OS === 'android' && !!KEY && !!Maps && !!UIManager.hasViewManagerConfig?.('AIRMap');
const DEFAULT_REGION = { latitude: 11.0168, longitude: 76.9558 }; // Coimbatore

const newSession = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Places search goes through the backend proxy (/auth/places/*, server key):
// Google rejects the Android-restricted Maps key on the Places REST API.
async function autocomplete(input, session, establishmentsOnly) {
  if (input.trim().length < 3) return [];
  const qs = `q=${encodeURIComponent(input.trim())}&session=${session}${establishmentsOnly ? '&business=true' : ''}`;
  const r = await authApi.get(`/auth/places/autocomplete?${qs}`);
  return r?.suggestions || [];
}

/** { placeId, name, address, pincode, phone, city, district, state, area, latitude, longitude } */
export async function placeDetails(placeId, session) {
  const d = await authApi.get(`/auth/places/details/${encodeURIComponent(placeId)}${session ? `?session=${session}` : ''}`);
  return { ...d, phone: String(d?.phone || '').slice(-10) };
}

/** Typeahead list under an input. onPick(details). */
function Suggestions({ query, establishmentsOnly, onPick, active }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const session = useRef(newSession());
  useEffect(() => {
    if (!active || query.trim().length < 3) { setItems([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      autocomplete(query, session.current, establishmentsOnly).then((r) => { if (alive) setItems(r.slice(0, 5)); }).catch(() => {});
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query, active, establishmentsOnly]);
  if (!items.length) return null;
  const pick = async (it) => {
    setBusy(true);
    try {
      const d = await placeDetails(it.placeId, session.current);
      session.current = newSession();
      setItems([]);
      onPick(d);
    } catch (_) { /* manual entry still works */ } finally { setBusy(false); }
  };
  return (
    <View style={{ marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: FIELD_BORDER, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
      {items.map((it) => (
        <Pressable key={it.placeId} onPress={() => pick(it)} disabled={busy}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
          <MapPin size={15} color={GREEN} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{it.main}</Text>
            {it.secondary ? <Text style={{ fontSize: 11, color: MUTED }} numberOfLines={1}>{it.secondary}</Text> : null}
          </View>
        </Pressable>
      ))}
      {busy ? <ActivityIndicator size="small" color={GREEN} style={{ margin: 6 }} /> : null}
      <Text style={{ fontSize: 10, color: MUTED, padding: 6, textAlign: 'right' }}>Not listed? Just type your shop name.</Text>
    </View>
  );
}

/** Google business suggestions under the existing Shop Name field. */
export function ShopNameSuggestions({ query, focused, onPick }) {
  return <Suggestions query={query} active={focused} establishmentsOnly onPick={onPick} />;
}

/**
 * Compact map in Shop Address: Search Location · Use Current Location ·
 * Adjust Pin (drag / tap) · Confirm Location.
 * value = { latitude, longitude, placeId, confirmed }; onChange(next, filled?)
 * where filled = { address, pincode } to auto-fill (manual edits stay allowed).
 */
export function ShopLocationPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [qFocus, setQFocus] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState(null);
  const mapRef = useRef(null);
  const has = value?.latitude != null && value?.longitude != null;
  const center = has ? { latitude: value.latitude, longitude: value.longitude } : DEFAULT_REGION;

  useEffect(() => {
    if (has) mapRef.current?.animateToRegion?.({ ...center, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 300);
  }, [value?.latitude, value?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const reverse = async (latitude, longitude) => {
    try {
      const [r] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (!r) return null;
      const address = [r.name, r.street, r.district || r.subregion, r.city, r.region].filter(Boolean)
        .filter((x, i, a) => a.indexOf(x) === i).join(', ');
      return { address, pincode: r.postalCode || '' };
    } catch (_) { return null; }
  };

  const movePin = async ({ latitude, longitude }, keepPlace = false) => {
    onChange({ latitude, longitude, placeId: keepPlace ? value?.placeId : null, confirmed: false }, await reverse(latitude, longitude));
  };

  const useCurrent = async () => {
    setErr(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission is needed to use your current location.');
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await movePin(p.coords);
    } catch (e) { setErr(e?.message || 'Could not get your location.'); } finally { setLocating(false); }
  };

  const btn = (label, Icon, onPress, primary, disabled) => (
    <Pressable onPress={onPress} disabled={disabled}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: 10, marginHorizontal: 3,
        backgroundColor: primary ? GREEN : '#FFFFFF', borderWidth: 1, borderColor: primary ? GREEN : FIELD_BORDER, opacity: disabled ? 0.45 : 1 }}>
      <Icon size={14} color={primary ? '#FFFFFF' : GREEN} />
      <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '800', color: primary ? '#FFFFFF' : GREEN }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: MUTED, marginBottom: 6 }}>Exact Shop Location (Google Maps)</Text>
      {(
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 12, borderWidth: 1, borderColor: FIELD_BORDER, backgroundColor: '#F9FAFB', paddingHorizontal: 10 }}>
            <Search size={16} color="#7A7A7A" />
            <TextInput value={q} onChangeText={setQ} onFocus={() => setQFocus(true)} onBlur={() => setTimeout(() => setQFocus(false), 250)}
              placeholder="Search location" placeholderTextColor="#BDBDBD" accessibilityLabel="Search location"
              style={{ flex: 1, marginLeft: 8, fontSize: 14, color: INK }} />
          </View>
          <Suggestions query={q} active={qFocus} onPick={(d) => {
            setQ('');
            if (d.latitude != null) onChange({ latitude: d.latitude, longitude: d.longitude, placeId: d.placeId, confirmed: false }, { address: d.address, pincode: d.pincode });
          }} />
        </>
      )}
      {HAS_MAP ? (
        <View style={{ height: 170, borderRadius: 12, overflow: 'hidden', marginTop: 8, borderWidth: 1, borderColor: FIELD_BORDER }}>
          <Maps.default
            ref={mapRef}
            provider={Maps.PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            initialRegion={{ ...center, latitudeDelta: has ? 0.004 : 0.08, longitudeDelta: has ? 0.004 : 0.08 }}
            onPress={(e) => movePin(e.nativeEvent.coordinate)}
            toolbarEnabled={false}
          >
            {has ? <Maps.Marker coordinate={center} draggable pinColor={GREEN} onDragEnd={(e) => movePin(e.nativeEvent.coordinate)} /> : null}
          </Maps.default>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', marginTop: 8, marginHorizontal: -3 }}>
        {btn(locating ? 'Locating…' : 'Use Current Location', Crosshair, useCurrent, false, locating)}
        {btn(value?.confirmed ? 'Confirmed' : 'Confirm Location', Check, () => onChange({ ...value, confirmed: true }), true, !has || value?.confirmed)}
      </View>
      <Text style={{ fontSize: 11, color: err ? '#B3261E' : MUTED, marginTop: 6 }}>
        {err || (has
          ? (value?.confirmed ? `Location confirmed · ${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}` : 'Adjust Pin: drag the pin or tap the map, then Confirm Location.')
          : 'Optional — search, or use your current location.')}
      </Text>
    </View>
  );
}
