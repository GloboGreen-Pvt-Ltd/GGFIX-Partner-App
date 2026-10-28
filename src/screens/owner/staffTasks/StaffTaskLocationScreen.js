import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, LocateFixed, History, MapPin, Pencil, CircleCheck } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { recentLocations } from './staffTaskStore';
import { C, TaskHeader, cardShadow } from './staffTaskUi';

/** Readable one-line address from an expo-location reverse-geocode result. */
const joinAddress = (a) => [a?.name, a?.street, a?.district || a?.subregion, a?.city, a?.region, a?.postalCode]
  .filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ');

/**
 * Optional task location. Uses the phone's own geocoder (expo-location — no
 * API key): search text → places, current position → address, plus recently
 * used locations and manual entry. params: { initial: { address, coords }, onConfirm(loc) }
 */
export default function StaffTaskLocationScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const p = route?.params || {};
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState('');
  const [recent, setRecent] = useState([]);
  const [chosen, setChosen] = useState(p.initial?.address ? p.initial : null);
  const [manual, setManual] = useState(p.initial?.address || '');

  useEffect(() => { recentLocations().then(setRecent); }, []);

  const search = async () => {
    const text = q.trim();
    if (!text) return;
    setSearching(true); setMsg(''); setResults([]);
    try {
      const hits = (await Location.geocodeAsync(text)).slice(0, 5);
      const named = await Promise.all(hits.map(async (h) => {
        const coords = { lat: h.latitude, lng: h.longitude };
        const rev = await Location.reverseGeocodeAsync({ latitude: h.latitude, longitude: h.longitude }).catch(() => []);
        return { address: joinAddress(rev[0]) || text, coords };
      }));
      setResults(named);
      if (!named.length) setMsg('No places found. Try another search or type the address below.');
    } catch (_) {
      setMsg('Search is not available on this phone. Type the address below.');
    } finally {
      setSearching(false);
    }
  };

  const useCurrent = async () => {
    setLocating(true); setMsg('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setMsg('Location permission is off. Allow it in Settings, or type the address.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const rev = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng }).catch(() => []);
      const loc = { address: joinAddress(rev[0]) || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, coords };
      setChosen(loc); setManual(loc.address);
    } catch (_) {
      setMsg('Could not get the current location. Try again or type the address.');
    } finally {
      setLocating(false);
    }
  };

  const pick = (loc) => { setChosen(loc); setManual(loc.address); };

  const confirm = () => {
    const address = manual.trim();
    if (!address) return;
    // Typed text that differs from the picked place keeps no coordinates.
    const loc = chosen && chosen.address === address ? chosen : { address, coords: null };
    p.onConfirm?.(loc);
    navigation.goBack();
  };

  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' } : null;
  const Row = ({ icon: Icon, title, sub, onPress, on }) => (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={[{ flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 6, borderRadius: 12, backgroundColor: on ? C.mint : C.card, borderWidth: on ? 1.5 : 1, borderColor: on ? C.primary : C.line }, cardShadow]}>
      <View style={{ height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.mint }}><Icon size={15} color={C.primary} /></View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {on ? <CircleCheck size={18} color={C.primary} /> : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title="Select Location" onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }}>
        <View style={col}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
            <Search size={16} color={C.muted} />
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={search} returnKeyType="search" placeholder="Search location…" placeholderTextColor={C.subtle}
              style={{ flex: 1, marginLeft: 8, fontSize: 14, color: C.ink, paddingVertical: 8 }} />
            {searching ? <ActivityIndicator size="small" color={C.primary} /> : (
              <Pressable onPress={search} hitSlop={8} accessibilityLabel="Search"><Text style={{ fontSize: 13, fontWeight: '800', color: C.primary }}>Search</Text></Pressable>
            )}
          </View>

          <View style={{ marginTop: 8 }}>
            <Row icon={LocateFixed} title={locating ? 'Getting current location…' : 'Use current location'} sub="Needs location permission" onPress={useCurrent} />
          </View>
          {msg ? <Text style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{msg}</Text> : null}

          {results.length ? <Text style={{ marginTop: 6, marginBottom: 4, fontSize: 13, fontWeight: '800', color: C.ink }}>Results</Text> : null}
          {results.map((loc, i) => (
            <Row key={`r${i}`} icon={MapPin} title={loc.address} sub={`${loc.coords.lat.toFixed(5)}, ${loc.coords.lng.toFixed(5)}`} onPress={() => pick(loc)} on={chosen?.address === loc.address} />
          ))}

          {recent.length ? <Text style={{ marginTop: 6, marginBottom: 4, fontSize: 13, fontWeight: '800', color: C.ink }}>Recently used</Text> : null}
          {recent.map((loc, i) => (
            <Row key={`h${i}`} icon={History} title={loc.address} onPress={() => pick(loc)} on={chosen?.address === loc.address} />
          ))}

          <Text style={{ marginTop: 6, marginBottom: 4, fontSize: 13, fontWeight: '800', color: C.ink }}>Address</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
            <Pencil size={15} color={C.muted} style={{ marginTop: 12 }} />
            <TextInput value={manual} onChangeText={setManual} placeholder="Type the address or landmark" placeholderTextColor={C.subtle} multiline maxLength={200}
              style={{ flex: 1, marginLeft: 8, minHeight: 60, fontSize: 14, color: C.ink, paddingVertical: 10, textAlignVertical: 'top' }} />
          </View>
          {chosen?.coords && chosen.address === manual.trim() ? (
            <Text style={{ marginTop: 4, fontSize: 11, color: C.muted }}>Map point saved: {chosen.coords.lat.toFixed(5)}, {chosen.coords.lng.toFixed(5)}</Text>
          ) : null}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
        <Pressable onPress={confirm} disabled={!manual.trim()} accessibilityRole="button"
          style={[{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: manual.trim() ? C.primary : '#9CA3AF' }, col]}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Confirm Location</Text>
        </Pressable>
      </View>
    </View>
  );
}
