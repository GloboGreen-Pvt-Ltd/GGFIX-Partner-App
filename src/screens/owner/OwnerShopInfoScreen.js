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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
  ChevronRight,
  Award,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react-native';
import { fetchMe, updateOwnerShop, createOwnerShop, switchShop } from '../../api/auth';
import { getSession } from '../../auth/session';
import { uploadMedia } from '../../api/masterData';
import { confirm, notify } from '../../components/confirm';
import { rs } from '../../utils/responsive';
import ImageViewerModal from '../../components/ImageViewerModal';
import { ResponsiveModal } from '../../components/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #035C6C, red #F84141, ink #111111, neutrals
// #F3F4F6 / #F3F4F6, yellow #F3BF23. One palette for view AND edit mode.
const BRAND_GREEN      = '#035C6C';
const BRAND_GREEN_DARK = '#035C6C';

const ACCENT = '#035C6C';
const PRIMARY = '#035C6C';
const MINT = '#E5F3F5';
const SOFT_MINT = '#F3F4F6';
const PAGE_BG = '#F3F4F6';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT_PRIMARY = '#111111';
const TEXT_SECONDARY = '#6B7280';
const DANGER = '#F84141';
const DANGER_TINT = '#FEECEC';
const STAR = '#F3BF23';

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#111111',
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
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), r.maxWidth('wide')), alignSelf: 'center' } : null;
  // Service tiles in the "all services" sheet go 2 across (3 on a wide tablet).
  const serviceCols = r.width >= 900 ? 3 : 2;
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
      mediaTypes: 'images',
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

  // View mode keeps the screen short by moving the long parts into sheets:
  // every service of a category, a document's details, full-size photos.
  const [serviceSheet, setServiceSheet] = useState(null); // 'ANDROID' | 'APPLE' | null
  const [docSheet, setDocSheet] = useState(null);         // 'GST' | 'UDYAM' | null
  const [viewer, setViewer] = useState(null);             // { images: [{ uri, label }], index }

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

  // Same two categories, wording and saved service lists as before — the
  // compact card and the "all services" sheet both read from here.
  const repairCategories = [
    {
      id: 'ANDROID', title: 'Android Repair', sub: 'Mobile / Tablet', Icon: Smartphone,
      badge: 'All Major Brands Supported', items: activeAndroid, tone: 'green',
      footerIcon: Phone, footerTitle: 'Fast. Reliable. Affordable.', footerBody: 'Keep your Android devices running like new!',
    },
    {
      id: 'APPLE', title: 'Apple Repair', sub: 'iPhone / Tablet', Icon: Apple,
      badge: 'Genuine Care Expertise', items: activeApple, tone: 'dark',
      footerIcon: ShieldCheck, footerTitle: 'Premium Service. Peace of Mind.', footerBody: 'Expert care for your Apple devices!',
    },
  ];
  const shopPhotos = [
    { label: 'Front View', uri: frontImageUrl },
    { label: 'Banner / Visiting Card', uri: bannerImageUrl },
  ];
  const shopDocs = [
    { id: 'GST', label: 'GST Certificate', uri: gstCertificateUrl, numberLabel: 'GST Number', number: gstNumber },
    { id: 'UDYAM', label: 'Udyam Certificate', uri: udyamCertificateUrl },
  ];
  const sheetCategory = repairCategories.find((c) => c.id === serviceSheet) || null;
  const sheetDocIndex = shopDocs.findIndex((d) => d.id === docSheet);
  const sheetDoc = sheetDocIndex >= 0 ? shopDocs[sheetDocIndex] : null;

  // Full-screen viewer over the uploaded images of one group, opened on the
  // tapped one.
  const openViewer = (list, index) => {
    const withUri = list.filter((x) => x.uri);
    setViewer({
      images: withUri.map((x) => ({ uri: x.uri, label: x.label })),
      index: Math.max(0, withUri.indexOf(list[index])),
    });
  };

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
      </View>
    );
  }

  // Shop photo, name, since / location, trust badge and tagline — one row.
  const renderIdentity = () => (
    <View className="flex-row items-center" style={{ marginTop: rs(10) }}>
      <View style={{ position: 'relative' }}>
        <View className="items-center justify-center overflow-hidden" style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: MINT }}>
          {frontImageUrl ? (
            <Image source={{ uri: frontImageUrl }} style={{ width: 52, height: 52 }} resizeMode="cover" />
          ) : (
            <Store size={21} color={ACCENT} />
          )}
        </View>
        <TouchableOpacity
          onPress={() => setEditing(true)}
          activeOpacity={0.85}
          accessibilityLabel="Change shop photo"
          style={{
            position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11,
            backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
          }}
        >
          <Camera size={11} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        <View className="flex-row items-center">
          <Text className="font-extrabold" style={{ flexShrink: 1, fontSize: 15, color: TEXT_PRIMARY }} numberOfLines={1}>
            {shopName || '—'}
          </Text>
          <View className="rounded-full" style={{ marginLeft: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: MINT }}>
            <Text className="font-extrabold" style={{ fontSize: 9, color: PRIMARY, letterSpacing: 0.8 }}>SHOP</Text>
          </View>
        </View>
        {(shopSince || district || state) ? (
          <View className="flex-row items-center flex-wrap" style={{ marginTop: 2 }}>
            {shopSince ? (
              <View className="flex-row items-center" style={{ marginRight: 10 }}>
                <CalendarDays size={11} color={TEXT_SECONDARY} />
                <Text style={{ marginLeft: 4, fontSize: 11, color: TEXT_SECONDARY }}>Since {shopSince}</Text>
              </View>
            ) : null}
            {(district || state) ? (
              <View className="flex-row items-center" style={{ flexShrink: 1 }}>
                <MapPin size={11} color={TEXT_SECONDARY} />
                <Text style={{ marginLeft: 4, fontSize: 11, color: TEXT_SECONDARY }} numberOfLines={1}>
                  {[district, state].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View className="flex-row items-center rounded-full" style={{ alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: MINT }}>
          <ShieldCheck size={11} color={PRIMARY} />
          <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 10.5, color: PRIMARY }} numberOfLines={1}>Your Trusted Device Service Partner</Text>
        </View>
        <Text className="italic" style={{ marginTop: 2, fontSize: 10.5, color: TEXT_SECONDARY }} numberOfLines={1}>Fix Today, A Greener Tomorrow</Text>
      </View>
    </View>
  );

  // Shared hero — decorative mint leaf shapes (same low-risk plain-View
  // approximation used elsewhere in this app), title/subtitle + edit/view chip.
  const renderHero = () => (
    <SafeAreaView edges={['top']} style={{ backgroundColor: CARD_BG }}>
      <View style={{ paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(11), overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: -rs(30), right: -rs(20), height: rs(140), width: rs(140), borderRadius: rs(70), backgroundColor: MINT, opacity: 0.6 }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: rs(30), right: rs(40), height: rs(70), width: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT, opacity: 0.8 }} />

        <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={6}
            style={{
              height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(10),
              alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
              borderWidth: 1, borderColor: BORDER,
            }}
          >
            <ChevronLeft size={19} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY }} numberOfLines={1}>
              {isCreate ? 'Add Shop' : 'Shop Information'}
            </Text>
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>
              {isCreate ? 'Set up your new business location' : 'Manage your shop details and services'}
            </Text>
          </View>
          {/* No preview/edit toggle while adding — there is nothing saved to
              preview yet, and switching to the view tab would strand the owner
              on an empty card with an "Edit Shop Information" button. */}
          {isCreate ? (
            <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(13), paddingVertical: rs(9), backgroundColor: ACCENT }}>
              <Plus size={13} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ marginLeft: rs(6), fontSize: 11, letterSpacing: 0.5 }}>
                NEW
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setEditing((v) => !v)}
              hitSlop={6}
              className="flex-row items-center rounded-full"
              style={{ paddingHorizontal: rs(13), paddingVertical: rs(9), backgroundColor: ACCENT }}
            >
              {editing ? <Eye size={13} color="#FFFFFF" /> : <Pencil size={13} color="#FFFFFF" />}
              <Text className="text-white font-extrabold" style={{ marginLeft: rs(6), fontSize: 11, letterSpacing: 0.5 }}>
                {editing ? 'PREVIEW' : 'EDIT'}
              </Text>
            </Pressable>
          )}
        </View>
        {/* View mode: the shop's identity rides in the same compact header. */}
        {!editing && !isCreate ? <View style={capStyle}>{renderIdentity()}</View> : null}
      </View>
    </SafeAreaView>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {renderHero()}

      {!editing ? (
        <>
        {/* View mode is sized to fit one phone screen: compact cards, with the
            long lists and big previews moved into sheets. It still scrolls on
            a very small screen rather than clip anything. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: PAGE_BG }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 72 + Math.max(insets.bottom, 10) }}
        >
          <View style={[{ gap: 10 }, capStyle]}>
            {/* ── Repair service categories: two compact cards; tap for every service ── */}
            <View>
              <View className="flex-row items-center" style={{ marginBottom: 8 }}>
                <View className="items-center justify-center" style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: MINT, marginRight: 8 }}>
                  <Wrench size={13} color={ACCENT} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-extrabold" style={{ fontSize: 14, color: TEXT_PRIMARY }} numberOfLines={1}>Repair Service Categories</Text>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY }} numberOfLines={1}>Devices we service at our shop</Text>
                </View>
                <View className="flex-row items-center rounded-full" style={{ marginLeft: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#FFF8E1' }}>
                  <Award size={10} color={STAR} />
                  <Text className="font-extrabold" style={{ marginLeft: 3, fontSize: 10, color: TEXT_PRIMARY }} numberOfLines={1}>Wide Range · Trusted</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {repairCategories.map((cat) => (
                  <RepairCategoryTile key={cat.id} cat={cat} onPress={() => setServiceSheet(cat.id)} />
                ))}
              </View>
            </View>

            {/* ── Address + contact ── */}
            <View style={{ backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 12 }}>
              <SectionHeader compact Icon={MapPin} label="SHOP ADDRESS" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY, lineHeight: 18 }}>
                {fullAddress || '—'}
              </Text>
              {(mobile || openingTime || closingTime || workingDaysLabel(workingDays)) ? (
                <View className="flex-row flex-wrap" style={{ marginTop: 8, gap: 6 }}>
                  {mobile ? <InfoChip Icon={Phone} text={mobile} /> : null}
                  {(openingTime || closingTime) ? (
                    <InfoChip Icon={Clock} text={[openingTime, closingTime].filter(Boolean).join(' - ')} />
                  ) : null}
                  {workingDaysLabel(workingDays) ? <InfoChip Icon={CalendarDays} text={workingDaysLabel(workingDays)} /> : null}
                </View>
              ) : null}
            </View>

            {/* ── Photos | Documents — 2-column grid; tap to preview ── */}
            <View style={{ flexDirection: 'row', backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionHeader compact Icon={Camera} label="SHOP PHOTOS" required />
                <View className="flex-row" style={{ gap: 6 }}>
                  {shopPhotos.map((p, i) => (
                    <ThumbTile key={p.label} label={p.label} uri={p.uri} onPress={p.uri ? () => openViewer(shopPhotos, i) : undefined} />
                  ))}
                </View>
                {(!frontImageUrl || !bannerImageUrl) ? (
                  <View className="rounded-full" style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: DANGER_TINT }}>
                    <Text className="font-extrabold" style={{ fontSize: 10, color: DANGER }}>Both required</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ width: 1, backgroundColor: BORDER, marginHorizontal: 10 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionHeader compact Icon={FileText} label="SHOP DOCUMENTS" />
                <View className="flex-row" style={{ gap: 6 }}>
                  {shopDocs.map((d) => (
                    <ThumbTile key={d.id} label={d.label} uri={d.uri} placeholderIcon={FileText} onPress={() => setDocSheet(d.id)} />
                  ))}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Sticky Edit bar. The gradient's row layout is set in `style`:
            LinearGradient isn't wired to NativeWind, so a className there is
            ignored. */}
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) + 4,
            backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: BORDER,
          }}
        >
          <View style={capStyle}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit shop information"
              style={{ borderRadius: 999, ...softShadow, shadowColor: ACCENT, shadowOpacity: 0.25 }}
            >
              <LinearGradient
                colors={[ACCENT, PRIMARY]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 999, minHeight: 46, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <Pencil size={16} color="#FFFFFF" />
                <Text className="text-white font-extrabold" style={{ marginLeft: 8, fontSize: 13 }}>Edit Shop Information</Text>
                <ArrowRight size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Every service of one category — the full card the screen used to show. */}
        <ResponsiveModal visible={!!sheetCategory} onClose={() => setServiceSheet(null)} maxWidth={620}>
          <SheetHandle />
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {sheetCategory ? (
              <RepairCategoryCard
                title={sheetCategory.title}
                sub={sheetCategory.sub}
                Icon={sheetCategory.Icon}
                badge={sheetCategory.badge}
                items={sheetCategory.items}
                tone={sheetCategory.tone}
                cols={serviceCols}
                footerIcon={sheetCategory.footerIcon}
                footerTitle={sheetCategory.footerTitle}
                footerBody={sheetCategory.footerBody}
                style={{ flex: 0 }}
              />
            ) : null}
          </ScrollView>
          <SheetCloseButton onPress={() => setServiceSheet(null)} />
        </ResponsiveModal>

        {/* Document details — status, number (GST) and the certificate itself. */}
        <ResponsiveModal visible={!!sheetDoc} onClose={() => setDocSheet(null)} maxWidth={480}>
          <SheetHandle />
          {sheetDoc ? (
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center" style={{ marginBottom: 12 }}>
                <View className="items-center justify-center" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: MINT }}>
                  <FileText size={18} color={ACCENT} />
                </View>
                <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                  <Text className="font-extrabold" style={{ fontSize: 15, color: TEXT_PRIMARY }}>{sheetDoc.label}</Text>
                  <Text className="font-extrabold" style={{ marginTop: 1, fontSize: 11.5, color: sheetDoc.uri ? ACCENT : DANGER }}>
                    {sheetDoc.uri ? 'Uploaded' : 'Not uploaded'}
                  </Text>
                </View>
              </View>
              {sheetDoc.numberLabel ? (
                <View className="flex-row items-center" style={{ paddingVertical: 10, marginBottom: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER }}>
                  <Text style={{ flex: 1, fontSize: 12, color: TEXT_SECONDARY }}>{sheetDoc.numberLabel}</Text>
                  <Text className="font-extrabold" style={{ fontSize: 13, color: sheetDoc.number ? TEXT_PRIMARY : TEXT_SECONDARY }}>
                    {sheetDoc.number || 'Not added'}
                  </Text>
                </View>
              ) : null}
              {sheetDoc.uri ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${sheetDoc.label} full screen`}
                  onPress={() => {
                    // Close the sheet first: iOS won't present a second modal
                    // while this one is still sliding out.
                    setDocSheet(null);
                    setTimeout(() => openViewer(shopDocs, sheetDocIndex), 320);
                  }}
                >
                  <Image source={{ uri: sheetDoc.uri }} style={{ width: '100%', height: 220, borderRadius: 12, backgroundColor: PAGE_BG }} resizeMode="contain" />
                  <Text style={{ marginTop: 6, fontSize: 11, color: TEXT_SECONDARY, textAlign: 'center' }}>Tap to view full screen</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 22, borderRadius: 12, backgroundColor: MINT, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7E6EA' }}>
                  <ImageIcon size={24} color={BRAND_GREEN_DARK} />
                  <Text style={{ marginTop: 6, fontSize: 12, color: TEXT_SECONDARY, textAlign: 'center' }}>
                    Upload it from Edit Shop Information.
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : null}
          <SheetCloseButton onPress={() => setDocSheet(null)} />
        </ResponsiveModal>

        <ImageViewerModal
          visible={!!viewer}
          images={viewer?.images || []}
          index={viewer?.index || 0}
          onClose={() => setViewer(null)}
        />
        </>
      ) : (
        <>
          {/* Keyboard-aware: the focused field scrolls clear of the keyboard and
              the sticky save bar (lower address / time fields sat under it). */}
          <KeyboardAwareScrollView
            bottomOffset={90}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: PAGE_BG }}
            contentContainerStyle={{ padding: 14, paddingBottom: 110 + insets.bottom }}
          >
            <View style={capStyle}>
            {/* Basic Info */}
            <View className="bg-white rounded-2xl p-3" style={cardShadow}>
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
            <View className="bg-white rounded-2xl p-3 mt-3" style={cardShadow}>
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
            <View className="bg-white rounded-2xl p-3 mt-3" style={cardShadow}>
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
                  backgroundColor: PAGE_BG,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: BORDER,
                  paddingHorizontal: 10,
                }}
              >
                <Search size={16} color={TEXT_SECONDARY} />
                <TextInput
                  value={locSearch}
                  onChangeText={onSearchChange}
                  placeholder="Type shop name, area or pincode"
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    fontSize: 13,
                    color: TEXT_PRIMARY,
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
                    borderColor: BORDER,
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
                        borderBottomColor: SOFT_MINT,
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
                  backgroundColor: MINT,
                  borderWidth: 1.5,
                  borderColor: '#C7E6EA',
                  borderRadius: 12,
                  paddingVertical: 11,
                }}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
                ) : (
                  <Crosshair size={15} color={BRAND_GREEN_DARK} />
                )}
                <Text className="ml-2 text-[12px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                  {locating ? 'Locating…' : 'Get Current Location'}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 1, backgroundColor: SOFT_MINT, marginVertical: 12 }} />

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
            <View className="bg-white rounded-2xl p-3 mt-3" style={cardShadow}>
              <SectionHeader Icon={Clock} label="WORKING HOURS" />
              <Text
                className="text-[10.5px] uppercase font-bold text-gray-500 mb-1.5"
                style={{ letterSpacing: 0.6 }}
              >
                Working Days
              </Text>
              <View
                className="flex-row mb-3"
                style={{ backgroundColor: SOFT_MINT, borderRadius: 12, padding: 3 }}
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
                        className="text-[11px] font-extrabold"
                        style={{ color: active ? '#FFFFFF' : TEXT_SECONDARY }}
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
            <View className="bg-white rounded-2xl p-3 mt-3" style={cardShadow}>
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
            <View className="bg-white rounded-2xl p-3 mt-3" style={cardShadow}>
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
            </View>
          </KeyboardAwareScrollView>

          {/* Sticky save bar */}
          <View
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 6,
              backgroundColor: 'rgba(255,255,255,0.97)',
              borderTopWidth: 1,
              borderTopColor: BORDER,
            }}
          >
            <View style={capStyle}>
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
                  borderRadius: 999,
                  minHeight: 48,
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
                <Text className="ml-2 text-white text-[13px] font-extrabold">
                  {saving
                    ? (isCreate ? 'Creating...' : 'Saving...')
                    : (isCreate ? 'Create Shop' : 'Save Shop Details')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ Icon, label, required, compact }) {
  const d = compact ? 22 : 26;
  return (
    <View className="flex-row items-center" style={{ marginBottom: compact ? 8 : 10 }}>
      <View className="items-center justify-center" style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: MINT, marginRight: compact ? 6 : 8 }}>
        <Icon size={compact ? 12 : 13} color={BRAND_GREEN_DARK} />
      </View>
      <Text className="font-extrabold" style={{ flexShrink: 1, fontSize: 11, color: BRAND_GREEN_DARK, letterSpacing: compact ? 0.8 : 1.2 }}>
        {label}
      </Text>
      {required ? <Text style={{ marginLeft: 3, fontSize: 12, color: DANGER }}>*</Text> : null}
    </View>
  );
}

// View-mode repair category card: gradient header (icon, title, device types,
// badge), the owner's selected services as a grid of identical fixed-size
// tiles (the SAME activeAndroid / activeApple lists from the saved toggles —
// nothing fabricated), and a tagline panel. Android = green, Apple = dark.
// The gradient's row layout lives in `style` (LinearGradient ignores className).
function RepairCategoryCard({ title, sub, Icon, badge, items, tone, cols = 2, footerIcon: FooterIcon, footerTitle, footerBody, style }) {
  const dark = tone === 'dark';
  return (
    <View style={[{ flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, ...softShadow }, style]}>
      <LinearGradient
        colors={dark ? ['#363636', TEXT_PRIMARY] : [ACCENT, PRIMARY]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          <Text className="font-extrabold" style={{ fontSize: 15, color: '#FFFFFF' }} numberOfLines={1}>{title}</Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={1}>{sub}</Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 6, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Text className="font-bold" style={{ fontSize: 10, color: '#FFFFFF' }} numberOfLines={1}>{badge}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ padding: 10 }}>
        <View className="flex-row items-center" style={{ paddingHorizontal: 2, marginBottom: 6 }}>
          <Text className="font-extrabold" style={{ flex: 1, fontSize: 10.5, color: TEXT_SECONDARY, letterSpacing: 0.8 }}>SERVICES</Text>
          <Text className="font-extrabold" style={{ fontSize: 10.5, color: dark ? TEXT_PRIMARY : PRIMARY }}>{items.length}</Text>
        </View>
        {items.length === 0 ? (
          <Text style={{ fontSize: 11, color: TEXT_SECONDARY, textAlign: 'center', paddingVertical: 12 }}>No services selected</Text>
        ) : (
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
            {items.map((svc) => (
              <View key={svc} style={{ width: `${100 / cols}%`, padding: 3 }}>
                <View className="flex-row items-center" style={{ minHeight: 38, borderRadius: 10, paddingHorizontal: 9, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: SOFT_MINT }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: dark ? TEXT_PRIMARY : ACCENT, alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={11} color="#FFFFFF" />
                  </View>
                  <Text
                    style={{ flex: 1, marginLeft: 7, fontSize: 11, fontWeight: '600', color: TEXT_PRIMARY }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {svc}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="flex-row items-center" style={{ marginHorizontal: 10, marginBottom: 10, padding: 10, borderRadius: 12, backgroundColor: dark ? SOFT_MINT : MINT }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: CARD_BG, alignItems: 'center', justifyContent: 'center' }}>
          <FooterIcon size={14} color={dark ? TEXT_PRIMARY : ACCENT} />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 9 }}>
          <Text className="font-extrabold" style={{ fontSize: 12, color: TEXT_PRIMARY }} numberOfLines={1}>{footerTitle}</Text>
          <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={2}>{footerBody}</Text>
        </View>
      </View>
    </View>
  );
}

// Compact view-mode category card: title, device types, service count and
// badge. Tapping it opens the full RepairCategoryCard in a sheet.
function RepairCategoryTile({ cat, onPress }) {
  const dark = cat.tone === 'dark';
  const { Icon } = cat;
  const tint = dark ? TEXT_PRIMARY : ACCENT;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cat.title}, ${cat.items.length} services. Show all services`}
      style={{ flex: 1, minWidth: 0, borderRadius: 16, overflow: 'hidden', backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, ...softShadow }}
    >
      <LinearGradient
        colors={dark ? ['#363636', TEXT_PRIMARY] : [ACCENT, PRIMARY]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center' }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
          <Text className="font-extrabold" style={{ fontSize: 13.5, color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {cat.title}
          </Text>
          <Text style={{ marginTop: 1, fontSize: 10.5, color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>{cat.sub}</Text>
        </View>
      </LinearGradient>
      <View style={{ paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9 }}>
        <View className="flex-row items-end">
          <Text className="font-extrabold" style={{ fontSize: 20, lineHeight: 24, color: tint }}>{cat.items.length}</Text>
          <Text style={{ marginLeft: 4, marginBottom: 3, fontSize: 11, fontWeight: '600', color: TEXT_SECONDARY }}>
            {cat.items.length === 1 ? 'service' : 'services'}
          </Text>
        </View>
        <Text style={{ marginTop: 1, fontSize: 10.5, lineHeight: 14, color: TEXT_SECONDARY }} numberOfLines={2}>{cat.badge}</Text>
        <View className="flex-row items-center" style={{ marginTop: 7 }}>
          <Text className="font-extrabold" style={{ fontSize: 11.5, color: tint }}>View all</Text>
          <ChevronRight size={14} color={tint} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Phone / hours / working days pill on the address card.
function InfoChip({ Icon, text }) {
  return (
    <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: 9, paddingVertical: 4, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: BORDER }}>
      <Icon size={12} color={PRIMARY} />
      <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY }}>{text}</Text>
    </View>
  );
}

// One small preview in the Photos / Documents grid; tap opens it.
function ThumbTile({ label, uri, onPress, placeholderIcon: PlaceholderIcon = ImageIcon }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={uri ? label : `${label}, not uploaded`}
      style={{ flex: 1, minWidth: 0 }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: 64, borderRadius: 10, backgroundColor: MINT }} resizeMode="cover" />
      ) : (
        <View style={{ width: '100%', height: 64, borderRadius: 10, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7E6EA', paddingHorizontal: 2 }}>
          <PlaceholderIcon size={18} color={BRAND_GREEN_DARK} />
          <Text style={{ marginTop: 2, fontSize: 10, color: TEXT_SECONDARY, textAlign: 'center' }}>Not uploaded</Text>
        </View>
      )}
      <Text style={{ marginTop: 4, fontSize: 10.5, lineHeight: 13, color: TEXT_SECONDARY, textAlign: 'center' }} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function SheetHandle() {
  return <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, marginBottom: 12 }} />;
}

function SheetCloseButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={{ marginTop: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text className="font-extrabold" style={{ fontSize: 14, color: TEXT_PRIMARY }}>Close</Text>
    </TouchableOpacity>
  );
}

function CategoryColumnEdit({ title, sub, Icon, items, selected, onToggle }) {
  return (
    <View
      style={{ flex: 1, marginHorizontal: 4, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }}
    >
      <LinearGradient
        colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' }}
      >
        <Icon size={16} color="#FFFFFF" />
        <Text className="text-white text-[12px] font-extrabold mt-1">{title}</Text>
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
                  borderColor: active ? BRAND_GREEN_DARK : '#D1D5DB',
                  backgroundColor: active ? BRAND_GREEN_DARK : '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 6,
                }}
              >
                {active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} /> : null}
              </View>
              <Text
                className="text-[11px] flex-1"
                style={{ color: active ? TEXT_PRIMARY : '#9CA3AF' }}
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
          backgroundColor: MINT,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: '#C7E6EA',
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
                  backgroundColor: 'rgba(17, 17, 17, 0.45)',
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
                  backgroundColor: 'rgba(17, 17, 17, 0.7)',
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
                backgroundColor: MINT,
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
        placeholderTextColor="#9CA3AF"
        {...inputProps}
        style={{
          backgroundColor: PAGE_BG,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: BORDER,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 13,
          color: TEXT_PRIMARY,
        }}
      />
    </View>
  );
}
