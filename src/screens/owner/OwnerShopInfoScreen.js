import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  ChevronLeft,
  Store,
  Wrench,
  MapPin,
  Camera,
  Smartphone,
  Apple,
  CalendarDays,
  Pencil,
  Eye,
  CheckCircle2,
  Save,
  Search,
  Crosshair,
  Phone,
  Clock,
  FileText,
  Plus,
  Image as ImageIcon,
} from 'lucide-react-native';
import { fetchMe, updateOwnerShop, createOwnerShop, switchShop } from '../../api/auth';
import { getSession } from '../../auth/session';
import { uploadMedia } from '../../api/masterData';
import { confirm, notify } from '../../components/confirm';

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN     = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Coordinate entry. iOS has a keyboard with digits + punctuation; Android does
// not, and an unknown keyboardType there silently becomes the default text
// keyboard — hence the platform split plus a filter on what gets stored.
const COORD_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad';

// Keep only digits, one leading minus and one decimal point, so `Number(value)`
// in the save payload can never come out NaN.
function sanitizeCoord(text) {
  const cleaned = String(text ?? '').replace(/[^0-9.-]/g, '');
  const negative = cleaned.startsWith('-');
  const digits = cleaned.replace(/-/g, '');
  const [whole, ...rest] = digits.split('.');
  const body = rest.length ? `${whole}.${rest.join('')}` : whole;
  return (negative ? '-' : '') + body;
}

function coordOrUndefined(value) {
  if (value === '' || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const WORKING_DAYS_OPTIONS = [
  { value: 'MON_FRI', label: 'Mon – Fri' },
  { value: 'MON_SAT', label: 'Mon – Sat' },
  { value: 'MON_SUN', label: 'Mon – Sun' },
];

const workingDaysLabel = (v) =>
  WORKING_DAYS_OPTIONS.find((o) => o.value === v)?.label || '';

// ── OpenStreetMap Nominatim address search ──────────────────────────────────
// Free, no API key, ~1 req/s per their usage policy — the 400 ms debounce in
// the caller keeps us well under that. `fetch` works natively in React Native.
async function nominatimSearch(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=in&limit=6`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'GGfixShopApp/1.0 (support@ggfix.in)' },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function mapNominatimRows(rows) {
  return (rows || []).map((r) => ({
    displayName: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    street:   r.address?.road || r.address?.pedestrian || r.address?.path || '',
    area:     r.address?.suburb || r.address?.neighbourhood || r.address?.village || r.address?.town || '',
    taluk:    r.address?.county || r.address?.subdistrict || '',
    district: r.address?.state_district || r.address?.county || '',
    state:    r.address?.state || '',
    pincode:  r.address?.postcode || '',
  }));
}

// Smart fallback: a brand-prefixed query ("Globo Green Cuddalore") often has no
// OSM POI, so retry with the trailing two tokens, then just the last token, so
// the city/pincode still surfaces.
async function searchAddressSuggestions(query) {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  let rows = await nominatimSearch(q);
  if (rows.length === 0) {
    const tokens = q.split(/\s+/);
    if (tokens.length >= 2) {
      const tail = tokens.slice(-2).join(' ');
      if (tail !== q) rows = await nominatimSearch(tail);
    }
  }
  if (rows.length === 0) {
    const tokens = q.split(/\s+/);
    const last = tokens[tokens.length - 1];
    if (last.length >= 3 && last !== q) rows = await nominatimSearch(last);
  }
  return mapNominatimRows(rows);
}

const ANDROID_SERVICES = [
  'Screen Repair',
  'Display Replacement',
  'Battery Replacement',
  'Charging Port Repair',
  'Camera Repair',
  'Water Damage Repair',
  'Audio Repair',
  'Button Repair',
  'Software Issues',
  'Data Recovery',
  'Phone Unlocking',
];

const APPLE_SERVICES = ANDROID_SERVICES;

/**
 * Shop Information — doubles as the ADD SHOP form.
 *
 * `route.params.mode === 'create'` opens the same form with nothing hydrated
 * and no shopId, and the save button POSTs a new location instead of PATCHing
 * the active one. Reusing this screen rather than writing a second one keeps a
 * single definition of what a shop record is: the same fields, the same
 * OpenStreetMap lookup, the same required photos.
 */
export default function OwnerShopInfoScreen({ navigation, route }) {
  const isCreate = route?.params?.mode === 'create';
  const [ownerId, setOwnerId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [shopName, setShopName] = useState('');
  const [shopSince, setShopSince] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [street, setStreet] = useState('');
  const [area, setArea] = useState('');
  const [taluk, setTaluk] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [workingDays, setWorkingDays] = useState('MON_SAT');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [frontImageUrl, setFrontImageUrl] = useState('');
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [gstCertificateUrl, setGstCertificateUrl] = useState('');
  const [udyamCertificateUrl, setUdyamCertificateUrl] = useState('');
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingGst, setUploadingGst] = useState(false);
  const [uploadingUdyam, setUploadingUdyam] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // OpenStreetMap address search + device geolocation
  const [locSearch, setLocSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [locating, setLocating] = useState(false);
  const searchTimer = useRef(null);
  // Shop ids the owner already had when this screen opened. After a create the
  // server returns ALL locations, so the new one is the id that wasn't here.
  const existingShopIds = useRef(new Set());

  useEffect(() => {
    (async () => {
      const session = (await fetchMe().catch(() => null)) || (await getSession());
      const fullShop = session?.activeShop || null;
      setOwnerId(session?.userId || null);
      existingShopIds.current = new Set((session?.shops || []).map((s) => s.id));
      // Add Shop starts from an empty form — hydrating it from the active shop
      // would pre-fill the new record with the current shop's address and
      // photos, which is the fastest way to end up with two identical shops.
      if (isCreate) {
        setEditing(true);
        setHydrated(true);
        return;
      }
      setShopId(fullShop?.id || null);
      if (fullShop) {
        setShopName(fullShop.name || '');
        setShopSince(fullShop.createdAt ? new Date(fullShop.createdAt).getFullYear().toString() : '');
        // Normalise to the bare 10 digits the field (and the save validation)
        // now expect — legacy rows can hold "+91 80123 45280", which would
        // otherwise read as 12 digits and block every save until retyped.
        setMobile((fullShop.mobile || '').replace(/[^0-9]/g, '').slice(-10));
        setGstNumber(fullShop.gstNumber || '');
        setAddressLine(fullShop.address || '');
        setStreet(fullShop.street || '');
        setArea(fullShop.area || '');
        setTaluk(fullShop.taluk || '');
        setDistrict(fullShop.district || '');
        setState(fullShop.state || '');
        setPincode(fullShop.pincode || '');
        setLatitude(fullShop.latitude != null ? String(fullShop.latitude) : '');
        setLongitude(fullShop.longitude != null ? String(fullShop.longitude) : '');
        setWorkingDays(fullShop.workingDays || 'MON_SAT');
        setOpeningTime(fullShop.openingTime || '');
        setClosingTime(fullShop.closingTime || '');
        setFrontImageUrl(fullShop.frontImageUrl || '');
        setBannerImageUrl(fullShop.bannerImageUrl || '');
        setGstCertificateUrl(fullShop.gstCertificateUrl || '');
        setUdyamCertificateUrl(fullShop.udyamCertificateUrl || '');

        // Rehydrate the Android / Apple service toggles from the saved JSON
        // snapshot. NULL = first time on this screen → keep the default
        // "all selected" so the owner sees the full list and can deselect.
        try {
          const parsed = fullShop.serviceCategoriesJson
            ? JSON.parse(fullShop.serviceCategoriesJson)
            : null;
          if (parsed && (parsed.android || parsed.apple)) {
            const a = new Set(Array.isArray(parsed.android) ? parsed.android : []);
            const b = new Set(Array.isArray(parsed.apple) ? parsed.apple : []);
            setAndroidSelected(
              Object.fromEntries(ANDROID_SERVICES.map((s) => [s, a.has(s)])),
            );
            setAppleSelected(
              Object.fromEntries(APPLE_SERVICES.map((s) => [s, b.has(s)])),
            );
          }
        } catch (_) { /* malformed JSON — fall back to defaults */ }

        const looksComplete = !!(fullShop.name && (fullShop.address || fullShop.street) && fullShop.frontImageUrl);
        setEditing(!looksComplete);
      } else {
        setEditing(true);
      }
      setHydrated(true);
    })();
  }, [isCreate]);

  // Cancel any pending debounced search when the screen unmounts.
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const pickAndUpload = async (slot) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', 'Allow photo library access to upload shop images.');
      return;
    }
    const aspect = slot === 'banner' ? [16, 9]
      : (slot === 'gst' || slot === 'udyam') ? [3, 4]
      : [1, 1];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect,
      quality: 0.75,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const setBusy = slot === 'banner' ? setUploadingBanner
      : slot === 'gst' ? setUploadingGst
      : slot === 'udyam' ? setUploadingUdyam
      : setUploadingFront;
    const setUrl = slot === 'banner' ? setBannerImageUrl
      : slot === 'gst' ? setGstCertificateUrl
      : slot === 'udyam' ? setUdyamCertificateUrl
      : setFrontImageUrl;
    setBusy(true);
    try {
      const url = await uploadMedia(result.assets[0], `shops/${slot}`);
      if (!url) throw new Error('Upload returned no URL');
      setUrl(url);
    } catch (e) {
      notify('Upload failed', e?.message || 'Could not upload image. Try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Debounced OpenStreetMap search as the owner types in the location box.
  const onSearchChange = (value) => {
    setLocSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const list = await searchAddressSuggestions(value);
      setSuggestions(list);
      setSearched(true);
      setSearching(false);
    }, 400);
  };

  // Picking a result fills the address parts + coordinates. A dedicated search
  // box means the owner's intent is to adopt the picked place, so we overwrite
  // any field the suggestion provides a value for.
  const applySuggestion = (sug) => {
    if (sug.street) setStreet(sug.street);
    if (sug.area) setArea(sug.area);
    if (sug.taluk) setTaluk(sug.taluk);
    if (sug.district) setDistrict(sug.district);
    if (sug.state) setState(sug.state);
    if (sug.pincode) setPincode(sug.pincode);
    if (Number.isFinite(sug.lat)) setLatitude(String(sug.lat));
    if (Number.isFinite(sug.lng)) setLongitude(String(sug.lng));
    setSuggestions([]);
    setSearched(false);
    setLocSearch((sug.displayName || '').split(',').slice(0, 2).join(',').trim());
  };

  // Capture GPS coordinates on-device (expo-location) and best-effort fill any
  // blank address fields via reverse geocoding.
  const getCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        notify('Permission needed', 'Allow location access to auto-fill your shop coordinates.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const la = pos.coords.latitude;
      const lo = pos.coords.longitude;
      setLatitude(String(la));
      setLongitude(String(lo));
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: la, longitude: lo });
        const g = geo?.[0];
        if (g) {
          if (!street && (g.street || g.name)) setStreet(g.street || g.name);
          if (!area && (g.district || g.city || g.subregion)) setArea(g.district || g.city || g.subregion);
          if (!taluk && g.subregion) setTaluk(g.subregion);
          if (!district && (g.subregion || g.city)) setDistrict(g.subregion || g.city);
          if (!state && g.region) setState(g.region);
          if (!pincode && g.postalCode) setPincode(g.postalCode);
        }
      } catch (_) { /* reverse geocode is a best-effort bonus */ }
    } catch (e) {
      notify('Location failed', e?.message || 'Could not get your current location. Enter coordinates manually.', { preset: 'error' });
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!ownerId || (!isCreate && !shopId)) {
      notify('Not ready', 'Could not resolve your shop. Pull to refresh and try again.', { preset: 'error' });
      return;
    }
    // Name is the one field the server refuses to create/rename without, so
    // catch it here instead of letting it come back as a generic save failure.
    const name = shopName.trim();
    if (!name) {
      notify('Shop name required', 'Enter the name customers will see for this shop.', { preset: 'error' });
      return;
    }
    // A shop mobile doubles as its login identity, so a half-typed number is
    // worse than none — reject it rather than storing something unusable.
    const mobileDigits = mobile.replace(/\D/g, '');
    if (mobile && mobileDigits.length !== 10) {
      notify('Check the mobile number', 'Shop mobile must be 10 digits.', { preset: 'error' });
      return;
    }
    if (!frontImageUrl || !bannerImageUrl) {
      notify('Photos required', 'Please upload both shop front view and shop banner / visiting card.');
      return;
    }
    setSaving(true);
    try {
      // Persist selected Android / Apple categories as an opaque JSON snapshot
      // so the View tab shows exactly what the owner chose. Without this the
      // server returned NULL on next load and the toggles snapped back to
      // "all selected" — the bug the owner reported.
      const serviceCategoriesJson = JSON.stringify({
        android: ANDROID_SERVICES.filter((s) => androidSelected[s]),
        apple:   APPLE_SERVICES.filter((s) => appleSelected[s]),
      });
      const payload = {
        name,
        // On update an empty string is an explicit "clear this"; on create it
        // would write '' where NULL is what an unset mobile should be.
        mobile: isCreate ? (mobileDigits || undefined) : mobileDigits,
        gstNumber,
        address: addressLine,
        street,
        area,
        taluk,
        district,
        state,
        pincode,
        // Blank (or a half-typed "-" / ".") → omit, so the backend PATCH leaves
        // the stored coord alone. Number('') is 0 and Number('-') is NaN, and
        // either one silently moves the shop off the map.
        latitude: coordOrUndefined(latitude),
        longitude: coordOrUndefined(longitude),
        workingDays,
        openingTime,
        closingTime,
        frontImageUrl,
        bannerImageUrl,
        // Omit when blank so a PATCH never clears a certificate the owner
        // uploaded elsewhere (the server sets any non-null field it receives).
        gstCertificateUrl: gstCertificateUrl || undefined,
        udyamCertificateUrl: udyamCertificateUrl || undefined,
        serviceCategoriesJson,
      };

      if (isCreate) {
        const view = await createOwnerShop(ownerId, payload);
        // The response carries every location, so the new shop is whichever id
        // wasn't in the session when this screen opened. An old session with no
        // `shops` list leaves that set empty, so fall back to the newest row
        // rather than picking the first (which would be the OLDEST shop).
        const fresh = (view?.locations || []).filter((l) => !existingShopIds.current.has(l.id));
        const created = fresh.length === 1
          ? fresh[0]
          : fresh
              .slice()
              .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
        await fetchMe().catch(() => null);
        // Only offer the switch when the new shop was actually identified —
        // an "OK, switch" that silently does nothing is worse than no offer.
        if (created?.id) {
          const goNow = await confirm({
            title: 'Shop added',
            message: `${name} is now under your account. Switch to it now?`,
            confirmText: 'Switch',
            cancelText: 'Later',
          });
          if (goNow) {
            try {
              await switchShop(created.id);
              await fetchMe().catch(() => null);
            } catch (e) {
              notify('Could not switch', e?.message || 'The shop was created — switch to it from My Account.', { preset: 'error' });
            }
          }
        } else {
          notify('Shop added', `${name} is now under your account.`, { preset: 'done', haptic: 'success' });
        }
        navigation.goBack();
        return;
      }

      await updateOwnerShop(ownerId, shopId, payload);
      await fetchMe().catch(() => null);
      setEditing(false);
    } catch (e) {
      notify(
        isCreate ? 'Could not add shop' : 'Save failed',
        e?.message || 'Could not save. Try again.',
        { preset: 'error', haptic: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  const [androidSelected, setAndroidSelected] = useState(
    Object.fromEntries(ANDROID_SERVICES.map((s) => [s, true])),
  );
  const [appleSelected, setAppleSelected] = useState(
    Object.fromEntries(APPLE_SERVICES.map((s) => [s, true])),
  );

  const toggleAndroid = (key) =>
    setAndroidSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleApple = (key) =>
    setAppleSelected((prev) => ({ ...prev, [key]: !prev[key] }));

  const fullAddress = useMemo(() => {
    const parts = [street, addressLine, area, taluk, district, state, pincode].filter(Boolean);
    return parts.join(', ');
  }, [street, addressLine, area, taluk, district, state, pincode]);

  const activeAndroid = ANDROID_SERVICES.filter((s) => androidSelected[s]);
  const activeApple = APPLE_SERVICES.filter((s) => appleSelected[s]);

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#F0F8EF' }}>
        <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
      </View>
    );
  }

  // Shared green hero — slim single row + edit/view chip.
  const renderHero = () => (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: 6, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: '#EFF5EE' }}
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="flex-1 text-text text-[24px] font-extrabold" numberOfLines={1}>
            {isCreate ? 'Add Shop' : 'Shop Information'}
          </Text>
          {/* No preview/edit toggle while adding — there is nothing saved to
              preview yet, and switching to the view tab would strand the owner
              on an empty card with an "Edit Shop Information" button. */}
          {isCreate ? (
            <View className="px-3 py-1.5 rounded-full flex-row items-center" style={{ backgroundColor: '#E6F7E3' }}>
              <Plus size={13} color={BRAND_GREEN_DARK} />
              <Text className="ml-1.5 text-[11px] font-extrabold" style={{ color: BRAND_GREEN_DARK, letterSpacing: 0.5 }}>
                NEW
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setEditing((v) => !v)}
              hitSlop={6}
              className="px-3 py-1.5 rounded-full flex-row items-center"
              style={{ backgroundColor: '#E6F7E3' }}
            >
              {editing ? <Eye size={13} color={BRAND_GREEN_DARK} /> : <Pencil size={13} color={BRAND_GREEN_DARK} />}
              <Text className="ml-1.5 text-[11px] font-extrabold" style={{ color: BRAND_GREEN_DARK, letterSpacing: 0.5 }}>
                {editing ? 'PREVIEW' : 'EDIT'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {renderHero()}

      {!editing ? (
        <>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
        >
          {/* Identity card */}
          <View className="bg-white rounded-2xl p-4 flex-row items-center" style={cardShadow}>
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mr-3 overflow-hidden"
              style={{ backgroundColor: '#E6F7E3' }}
            >
              {frontImageUrl ? (
                <Image source={{ uri: frontImageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
              ) : (
                <Store size={24} color={BRAND_GREEN_DARK} />
              )}
            </View>
            <View className="flex-1">
              <Text
                className="text-[10.5px] font-extrabold uppercase"
                style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}
              >
                Shop
              </Text>
              <Text className="text-[16px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
                {shopName || '—'}
              </Text>
              {shopSince ? (
                <View className="flex-row items-center mt-1">
                  <CalendarDays size={11} color="#8FA08F" />
                  <Text className="ml-1 text-[11px] text-gray-500">Since {shopSince}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Repair categories */}
          <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
            <SectionHeader Icon={Wrench} label="REPAIR SERVICE CATEGORIES" />
            <View className="flex-row -mx-1">
              <CategoryColumn
                title="Android Repair"
                sub="Mobile / Tablet"
                Icon={Smartphone}
                items={activeAndroid}
              />
              <CategoryColumn
                title="Apple Repair"
                sub="iPhone / Tablet"
                Icon={Apple}
                items={activeApple}
              />
            </View>
          </View>

          {/* Address */}
          <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
            <SectionHeader Icon={MapPin} label="SHOP ADDRESS" />
            <View
              className="rounded-2xl p-3 flex-row items-start"
              style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: BRAND_GREEN_DARK }}
              >
                <MapPin size={16} color="#FFFFFF" />
              </View>
              <Text
                className="flex-1 text-[13.5px] font-bold text-gray-900 leading-5"
                numberOfLines={5}
              >
                {fullAddress || '—'}
              </Text>
            </View>
            {(mobile || openingTime || closingTime || workingDaysLabel(workingDays)) ? (
              <View className="flex-row items-center mt-3">
                {mobile ? (
                  <View className="flex-row items-center flex-shrink">
                    <Phone size={13} color="#667066" />
                    <Text className="ml-1.5 text-[12px] font-semibold text-gray-700" numberOfLines={1}>
                      {mobile}
                    </Text>
                  </View>
                ) : null}
                {(openingTime || closingTime) ? (
                  <>
                    <View style={{ width: 1, height: 14, backgroundColor: '#E2E8E2', marginHorizontal: 10 }} />
                    <View className="flex-row items-center flex-shrink">
                      <Clock size={13} color="#667066" />
                      <Text className="ml-1.5 text-[12px] font-semibold text-gray-700" numberOfLines={1}>
                        {[openingTime, closingTime].filter(Boolean).join(' - ')}
                      </Text>
                    </View>
                  </>
                ) : null}
                {workingDaysLabel(workingDays) ? (
                  <>
                    <View style={{ width: 1, height: 14, backgroundColor: '#E2E8E2', marginHorizontal: 10 }} />
                    <Text className="text-[12px] font-semibold text-gray-700" numberOfLines={1}>
                      {workingDaysLabel(workingDays)}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Photos */}
          <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <View
                  className="w-7 h-7 rounded-full items-center justify-center mr-2"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Camera size={14} color={BRAND_GREEN_DARK} />
                </View>
                <Text
                  className="text-[11px] font-extrabold tracking-widest"
                  style={{ color: BRAND_GREEN_DARK, letterSpacing: 1.3 }}
                >
                  SHOP PHOTOS
                </Text>
                <Text className="text-[12px] ml-1" style={{ color: '#DC2626' }}>*</Text>
              </View>
              {(!frontImageUrl || !bannerImageUrl) ? (
                <View
                  className="px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#FEE2E2' }}
                >
                  <Text className="text-[9.5px] font-extrabold" style={{ color: '#B91C1C' }}>
                    Both required
                  </Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row -mx-1">
              <PhotoPreview label="Front View" uri={frontImageUrl} />
              <PhotoPreview label="Banner / Visiting Card" uri={bannerImageUrl} />
            </View>
          </View>

          {/* Documents — GST & Udyam certificates */}
          <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
            <SectionHeader Icon={FileText} label="SHOP DOCUMENTS" />
            <View className="flex-row -mx-1">
              <PhotoPreview label="GST Certificate" uri={gstCertificateUrl} />
              <PhotoPreview label="Udyam Certificate" uri={udyamCertificateUrl} />
            </View>
          </View>

        </ScrollView>

        {/* Sticky Edit bar */}
        <View
          className="absolute left-0 right-0 bottom-0 px-4 pt-3"
          style={{
            paddingBottom: 16,
            backgroundColor: 'rgba(240, 248, 239, 0.96)',
            borderTopWidth: 1,
            borderTopColor: '#E2E8E2',
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setEditing(true)}
            style={cardShadow}
          >
            <LinearGradient
              colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 18,
                paddingVertical: 15,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Pencil size={16} color="#FFFFFF" />
              <Text className="ml-2 text-white text-[14px] font-extrabold">
                Edit Shop Information
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        </>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          >
            {/* Basic Info */}
            <View className="bg-white rounded-2xl p-4" style={cardShadow}>
              <SectionHeader Icon={Store} label="BASIC SHOP INFO" />
              <Field
                label="Shop name"
                value={shopName}
                onChangeText={setShopName}
                placeholder="e.g. Globo Green Mobile Care"
              />
              {/* Display-only: derived from the shop's created date (see hydrate).
                  It was editable but never included in the save payload and is
                  re-derived from createdAt on reload, so editing did nothing —
                  show it read-only rather than as a field that silently ignores
                  input. A shop being created has no created date yet. */}
              {!isCreate ? (
                <Field
                  label="Shop Since (year)"
                  value={shopSince}
                  editable={false}
                />
              ) : null}
              <View className="flex-row">
                {/* Digits only, capped at 10: this number is the shop's login
                    identity (shop-mobile OTP), so spaces, +91 prefixes and
                    half-typed numbers all produce a shop nobody can log into. */}
                <Field
                  small
                  label="Mobile"
                  value={mobile}
                  onChangeText={(t) => setMobile(t.replace(/[^0-9]/g, '').slice(0, 10))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="10-digit number"
                />
                {/* A GSTIN is exactly 15 alphanumeric characters. */}
                <Field
                  small
                  last
                  label="GST Number"
                  value={gstNumber}
                  onChangeText={(t) => setGstNumber(t.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 15))}
                  autoCapitalize="characters"
                  maxLength={15}
                  placeholder="15 characters"
                />
              </View>
            </View>

            {/* Repair Categories (edit mode) */}
            <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
              <SectionHeader Icon={Wrench} label="REPAIR SERVICE CATEGORIES" />
              <View className="flex-row -mx-1">
                <CategoryColumnEdit
                  title="Android"
                  sub="Mobile / Tablet"
                  Icon={Smartphone}
                  items={ANDROID_SERVICES}
                  selected={androidSelected}
                  onToggle={toggleAndroid}
                />
                <CategoryColumnEdit
                  title="Apple"
                  sub="iPhone / Tablet"
                  Icon={Apple}
                  items={APPLE_SERVICES}
                  selected={appleSelected}
                  onToggle={toggleApple}
                />
              </View>
            </View>

            {/* Address */}
            <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
              <SectionHeader Icon={MapPin} label="SHOP ADDRESS" />

              {/* Location search (OpenStreetMap) */}
              <Text
                className="text-[10.5px] uppercase font-bold text-gray-500 mb-1"
                style={{ letterSpacing: 0.6 }}
              >
                Search location
              </Text>
              <View
                className="flex-row items-center"
                style={{
                  backgroundColor: '#F7FAF7',
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#E2E8E2',
                  paddingHorizontal: 10,
                }}
              >
                <Search size={16} color="#667066" />
                <TextInput
                  value={locSearch}
                  onChangeText={onSearchChange}
                  placeholder="Type shop name, area or pincode"
                  placeholderTextColor="#8FA08F"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    fontSize: 13.5,
                    color: '#172117',
                  }}
                />
                {searching ? <ActivityIndicator size="small" color={BRAND_GREEN_DARK} /> : null}
              </View>
              <Text className="text-[10px] text-gray-400 mt-1">
                Type 3+ characters to search OpenStreetMap. Pick a result to auto-fill the
                address + coordinates.
              </Text>

              {suggestions.length > 0 ? (
                <View
                  style={{
                    marginTop: 6,
                    borderWidth: 1,
                    borderColor: '#E2E8E2',
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  {suggestions.map((sug, k) => (
                    <Pressable
                      key={k}
                      onPress={() => applySuggestion(sug)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderBottomWidth: k < suggestions.length - 1 ? 1 : 0,
                        borderBottomColor: '#EFF5EE',
                      }}
                    >
                      <Text numberOfLines={1} className="text-[12px] font-semibold text-gray-800">
                        {sug.displayName}
                      </Text>
                      <Text className="text-[10.5px] text-gray-500 mt-0.5" numberOfLines={1}>
                        {Number.isFinite(sug.lat) ? `${sug.lat.toFixed(4)}, ${sug.lng.toFixed(4)}` : ''}
                        {sug.pincode ? ` · ${sug.pincode}` : ''}
                        {sug.district ? ` · ${sug.district}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : searched && !searching ? (
                <Text className="text-[11px] text-gray-400 mt-1.5">
                  No matches. Try just the area or pincode, or fill the address manually below.
                </Text>
              ) : null}

              {/* Get Current Location */}
              <TouchableOpacity
                onPress={getCurrentLocation}
                disabled={locating}
                activeOpacity={0.85}
                style={{
                  marginTop: 10,
                  marginBottom: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#F0F8EF',
                  borderWidth: 1.5,
                  borderColor: '#7ED957',
                  borderRadius: 12,
                  paddingVertical: 11,
                }}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
                ) : (
                  <Crosshair size={15} color={BRAND_GREEN_DARK} />
                )}
                <Text className="ml-2 text-[12.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                  {locating ? 'Locating…' : 'Get Current Location'}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 1, backgroundColor: '#EFF5EE', marginVertical: 12 }} />

              {/* Address fields */}
              <Field label="Street" value={street} onChangeText={setStreet} placeholder="Street" />
              <Field
                label="Address line"
                value={addressLine}
                onChangeText={setAddressLine}
                placeholder="Building / landmark"
              />
              <View className="flex-row">
                <Field small label="Area" value={area} onChangeText={setArea} />
                <Field small last label="Taluk" value={taluk} onChangeText={setTaluk} />
              </View>
              <View className="flex-row">
                <Field small label="District" value={district} onChangeText={setDistrict} />
                <Field small last label="State" value={state} onChangeText={setState} />
              </View>
              <Field
                label="Pincode"
                value={pincode}
                onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
              />
              <View className="flex-row">
                {/* `numbers-and-punctuation` is iOS-only — Android fell back to
                    the full alphabetic keyboard, so a coordinate could be typed
                    with letters in it. Digits + decimal point on both, and the
                    input is filtered to what Number() can actually parse. */}
                <Field
                  small
                  label="Latitude"
                  value={latitude}
                  onChangeText={(t) => setLatitude(sanitizeCoord(t))}
                  keyboardType={COORD_KEYBOARD}
                  placeholder="e.g. 13.0776"
                />
                <Field
                  small
                  last
                  label="Longitude"
                  value={longitude}
                  onChangeText={(t) => setLongitude(sanitizeCoord(t))}
                  keyboardType={COORD_KEYBOARD}
                  placeholder="e.g. 80.2917"
                />
              </View>
              <Text className="text-[10px] text-gray-400 -mt-1">
                Latitude / longitude lets nearby customers discover your shop.
              </Text>
            </View>

            {/* Working Hours */}
            <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
              <SectionHeader Icon={Clock} label="WORKING HOURS" />
              <Text
                className="text-[10.5px] uppercase font-bold text-gray-500 mb-1.5"
                style={{ letterSpacing: 0.6 }}
              >
                Working Days
              </Text>
              <View
                className="flex-row mb-3"
                style={{ backgroundColor: '#EFF5EE', borderRadius: 12, padding: 3 }}
              >
                {WORKING_DAYS_OPTIONS.map((o) => {
                  const active = workingDays === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => setWorkingDays(o.value)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: active ? BRAND_GREEN_DARK : 'transparent',
                      }}
                    >
                      <Text
                        className="text-[11.5px] font-extrabold"
                        style={{ color: active ? '#FFFFFF' : '#667066' }}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View className="flex-row">
                <Field
                  small
                  label="Opening Time"
                  value={openingTime}
                  onChangeText={setOpeningTime}
                  placeholder="08:00 AM"
                />
                <Field
                  small
                  last
                  label="Closing Time"
                  value={closingTime}
                  onChangeText={setClosingTime}
                  placeholder="07:00 PM"
                />
              </View>
            </View>

            {/* Photos */}
            <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
              <SectionHeader Icon={Camera} label="SHOP PHOTOS" />
              <Text className="text-[11px] text-gray-500 mb-3 leading-4">
                Both photos are required to publish your shop. Front view should be a
                square; banner / visiting card works best in 16:9.
              </Text>
              <View className="flex-row -mx-1">
                <PhotoUpload
                  label="Shop Front View"
                  url={frontImageUrl}
                  busy={uploadingFront}
                  onPress={() => pickAndUpload('front')}
                />
                <PhotoUpload
                  label="Shop Banner / Visiting Card"
                  url={bannerImageUrl}
                  busy={uploadingBanner}
                  onPress={() => pickAndUpload('banner')}
                />
              </View>
            </View>

            {/* Documents — GST & Udyam certificates */}
            <View className="bg-white rounded-2xl p-4 mt-4" style={cardShadow}>
              <SectionHeader Icon={FileText} label="SHOP DOCUMENTS" />
              <Text className="text-[11px] text-gray-500 mb-3 leading-4">
                Upload your GST and / or Udyam certificate. At least one helps verify your shop faster.
              </Text>
              <View className="flex-row -mx-1">
                <PhotoUpload
                  label="GST Certificate"
                  url={gstCertificateUrl}
                  busy={uploadingGst}
                  onPress={() => pickAndUpload('gst')}
                />
                <PhotoUpload
                  label="Udyam Certificate"
                  url={udyamCertificateUrl}
                  busy={uploadingUdyam}
                  onPress={() => pickAndUpload('udyam')}
                />
              </View>
            </View>
          </ScrollView>

          {/* Sticky save bar */}
          <View
            className="absolute left-0 right-0 bottom-0 px-4 pt-3"
            style={{
              paddingBottom: 16,
              backgroundColor: 'rgba(240, 248, 239, 0.96)',
              borderTopWidth: 1,
              borderTopColor: '#E2E8E2',
            }}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={saving}
              onPress={handleSave}
              style={cardShadow}
            >
              <LinearGradient
                colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 18,
                  paddingVertical: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : isCreate ? (
                  <Plus size={18} color="#FFFFFF" />
                ) : (
                  <Save size={18} color="#FFFFFF" />
                )}
                <Text className="ml-2 text-white text-[15px] font-extrabold">
                  {saving
                    ? (isCreate ? 'Creating...' : 'Saving...')
                    : (isCreate ? 'Create Shop' : 'Save Shop Details')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ Icon, label }) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: '#E6F7E3' }}
      >
        <Icon size={14} color={BRAND_GREEN_DARK} />
      </View>
      <Text
        className="text-[11px] font-extrabold tracking-widest"
        style={{ color: BRAND_GREEN_DARK, letterSpacing: 1.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

function CategoryColumn({ title, sub, Icon, items }) {
  return (
    <View
      style={{ flex: 1, marginHorizontal: 4, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8E2' }}
    >
      <LinearGradient
        colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' }}
      >
        <Icon size={16} color="#FFFFFF" />
        <Text className="text-white text-[12.5px] font-extrabold mt-1" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-white/85 text-[10px]">{sub}</Text>
      </LinearGradient>
      <View style={{ padding: 10 }}>
        {items.length === 0 ? (
          <Text className="text-[11px] text-gray-400 text-center py-2">No services</Text>
        ) : items.map((s) => (
          <View
            key={s}
            className="flex-row items-center py-2"
          >
            <CheckCircle2 size={14} color={ACCENT_GREEN} />
            <Text className="ml-2 text-[13px] text-gray-800 flex-1" numberOfLines={1}>
              {s}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CategoryColumnEdit({ title, sub, Icon, items, selected, onToggle }) {
  return (
    <View
      style={{ flex: 1, marginHorizontal: 4, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8E2' }}
    >
      <LinearGradient
        colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' }}
      >
        <Icon size={16} color="#FFFFFF" />
        <Text className="text-white text-[12.5px] font-extrabold mt-1">{title}</Text>
        <Text className="text-white/85 text-[10px]">{sub}</Text>
      </LinearGradient>
      <View style={{ padding: 8 }}>
        {items.map((name) => {
          const active = !!selected[name];
          return (
            <Pressable
              key={name}
              onPress={() => onToggle(name)}
              className="flex-row items-center px-1 py-1.5"
            >
              <View
                style={{
                  width: 16, height: 16, borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: active ? BRAND_GREEN_DARK : '#CBD5CB',
                  backgroundColor: active ? BRAND_GREEN_DARK : '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 6,
                }}
              >
                {active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} /> : null}
              </View>
              <Text
                className="text-[11px] flex-1"
                style={{ color: active ? '#172117' : '#8FA08F' }}
                numberOfLines={1}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PhotoPreview({ label, uri }) {
  return (
    <View style={{ flex: 1, marginHorizontal: 4 }}>
      <Text className="text-[10.5px] text-gray-500 mb-1.5" numberOfLines={1}>
        {label}
      </Text>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: 110, borderRadius: 14, backgroundColor: '#F0F8EF' }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: '100%', height: 110, borderRadius: 14,
            backgroundColor: '#F0F8EF',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: '#7ED957',
          }}
        >
          <ImageIcon size={22} color={BRAND_GREEN_DARK} />
          <Text className="text-[10px] text-gray-500 mt-1">Not uploaded</Text>
        </View>
      )}
    </View>
  );
}

function PhotoUpload({ label, url, busy, onPress }) {
  return (
    <View style={{ flex: 1, marginHorizontal: 4 }}>
      <Text className="text-[10.5px] uppercase font-bold text-gray-500 mb-1.5" style={{ letterSpacing: 0.6 }}>
        {label}
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={busy}
        style={{
          width: '100%', minHeight: 130, borderRadius: 16,
          backgroundColor: '#F0F8EF',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: '#7ED957',
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {url ? (
          <>
            <Image source={{ uri: url }} style={{ width: '100%', height: 130 }} resizeMode="cover" />
            {busy ? (
              <View
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(23, 33, 23, 0.45)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : (
              <View
                style={{
                  position: 'absolute', bottom: 6, right: 6,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: 'rgba(23, 33, 23, 0.7)',
                  flexDirection: 'row', alignItems: 'center',
                }}
              >
                <Pencil size={9} color="#FFFFFF" />
                <Text className="text-white text-[9.5px] font-extrabold ml-1">Change</Text>
              </View>
            )}
          </>
        ) : busy ? (
          <ActivityIndicator color={BRAND_GREEN_DARK} />
        ) : (
          <>
            <View
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: '#E6F7E3',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Camera size={18} color={BRAND_GREEN_DARK} />
            </View>
            <Text className="text-[11px] font-extrabold mt-2" style={{ color: BRAND_GREEN_DARK }}>
              Upload photo
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function Field({ label, small, last, ...inputProps }) {
  return (
    <View
      style={{
        flex: small ? 1 : undefined,
        // `last` marks the RIGHTMOST field of a two-up row. It kept the 8px
        // gutter, so the right column stopped 8px short of the card edge and
        // sat narrower than the full-width fields above and below it.
        marginRight: small && !last ? 8 : 0,
        marginBottom: last ? 0 : 12,
      }}
    >
      <Text
        className="text-[10.5px] uppercase font-bold text-gray-500 mb-1"
        style={{ letterSpacing: 0.6 }}
      >
        {label}
      </Text>
      <TextInput
        placeholderTextColor="#8FA08F"
        {...inputProps}
        style={{
          backgroundColor: '#F7FAF7',
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: '#E2E8E2',
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 13.5,
          color: '#172117',
        }}
      />
    </View>
  );
}
