import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { UserPlus, User, Mail, ChevronLeft, ChevronRight as ChevronRightIcon, ChevronDown, UploadCloud, Save, MapPin, Search, Check, X, IdCard } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input, Label, Select } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { uploadMedia, getDeviceCategories } from '../../../api/masterData';
import { notify } from '../../../components/confirm';
import { ResponsiveModal } from '../../../components/responsive';
import DeviceImage from '../../../components/DeviceImage';
import { Smartphone } from 'lucide-react-native';

const STATES = [
  { value: 'Tamil Nadu', label: 'Tamil Nadu' },
  { value: 'Karnataka', label: 'Karnataka' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
];

const DISTRICTS_TN = [
  'Chennai', 'Cuddalore', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli',
  'Tirunelveli', 'Vellore', 'Erode', 'Thanjavur',
].map((d) => ({ value: d, label: d }));

const TALUKS = ['Cuddalore', 'Chidambaram', 'Bhuvanagiri', 'Panruti', 'Virudhachalam', 'Kattumannar Koil']
  .map((t) => ({ value: t, label: t }));

// Keep the form value and lookup key consistent when an API response contains
// an Indian country prefix (for example, "+91 8939615914").
const normalizeMobile = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

// Hoisted so its identity is stable across renders — required for the
// memoized <Input> to skip re-rendering when a sibling field changes.
// `textAlignVertical:center` + `includeFontPadding:false` keep the text and the
// caret sitting dead-centre in the box on Android (the default font padding is
// what makes the cursor look too high / off inside a tall input).
// One fixed height for every field (text inputs AND selects) so the two-column
// Address grid lines up row by row; paddingVertical 9 sits inside it.
const INPUT_H = 40;
const INPUT_STYLE = { height: INPUT_H, textAlignVertical: 'center', includeFontPadding: false };

// GGFIX palette. Explicit hexes rather than Tailwind's `primary` / `success`
// tokens, because those still resolve to the old teal theme until the shared
// config moves — a class would leave this screen half-teal.
const ACCENT = '#09AD2A';       // fills, icons, selected states, cursor
const ACCENT_TEXT = '#078F23';  // green TEXT on white / mint
const MINT = '#EAF8EC';         // icon wells, tinted pills
// Translucent washes of ACCENT (#09AD2A), still used by the panels below.
const ACCENT_05 = 'rgba(9,173,42,0.05)';
const ACCENT_10 = 'rgba(9,173,42,0.10)';
const ACCENT_30 = 'rgba(9,173,42,0.30)';
const ACCENT_40 = 'rgba(9,173,42,0.40)';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const PLACEHOLDER = '#8A8A8A';
const BORDER = '#E6E6E6';       // input borders
const BORDER_STRONG = '#D6D6D6';
const HAIRLINE = '#F3F3F3';     // card borders on the grey page
const PAGE_BG = '#F8F8F8';

// The rnr <Input> paints its focus shadow in the shared (old teal) primary;
// this only retints that shadow — it does nothing while the field is unfocused.
const MOBILE_INPUT_STYLE = { ...INPUT_STYLE, shadowColor: ACCENT };

// White section card on the grey page.
const CARD = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: HAIRLINE,
  padding: 12,
  marginBottom: 10,
  shadowColor: INK,
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

const USER_ICON = <User size={15} color={ACCENT} />;
const MAIL_ICON = <Mail size={15} color={ACCENT} />;

// The IMEI "Identify Device" step is hidden for now — the IMEI.info account
// isn't funded yet, so the lookup always falls back to manual selection and the
// extra screen is just friction. Flip to true (and fund the IMEI.info token /
// set IMEI_API_SERVICE_ID) to re-enable scan → auto-detect. All the code stays.
const IDENTIFY_DEVICE_ENABLED = false;

/**
 * Order the category sheet lists in: Mobile, Tablet, Laptop, Smartwatch,
 * Audio Device.
 *
 * The API returns categories in its own order, which is not the order a shop
 * reaches for them. Each entry lists the CODES that map to that slot, because
 * the catalogue uses several spellings for the same thing (MOBILE vs
 * SMARTPHONE, SMARTWATCH vs SMARTWATCHES, AUDIO vs AUDIO_DEVICES).
 *
 * Anything not named here is kept and sorted to the END rather than dropped —
 * if an admin publishes a new category it must still be bookable, and a
 * hard-coded whitelist would silently hide it.
 */
// Category sheet tiles: 3 across, borderless, read by their fill.
const CAT_TILE_GAP = 8;
const CAT_TILE_BG = '#F8F8F8';

const CATEGORY_ORDER = [
  ['MOBILE', 'SMARTPHONE'],
  ['TABLET'],
  ['LAPTOP'],
  ['SMARTWATCH', 'SMARTWATCHES'],
  ['AUDIO', 'AUDIO_DEVICES', 'SPEAKER'],
];

function categoryRank(c) {
  const code = String(c?.code || '').toUpperCase();
  const name = String(c?.name || '').toUpperCase().replace(/[^A-Z]/g, '');
  const i = CATEGORY_ORDER.findIndex((codes) =>
    codes.includes(code) || codes.some((k) => name === k.replace(/_/g, '')));
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function orderCategories(list) {
  return [...(list || [])].sort((a, b) => {
    const d = categoryRank(a) - categoryRank(b);
    // Unranked extras fall to the end, alphabetically among themselves.
    return d !== 0 ? d : String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

// One soft pastel per category, matched the same way `categoryRank` matches
// (code first, then name) — a "device image gallery" tile reads as generic
// grey-on-grey without a colour identity per category.
const CAT_TILE_PASTELS = {
  MOBILE: '#EAF3FF', TABLET: '#F1ECFF', LAPTOP: '#E9F9F1', SMARTWATCH: '#E9FBEF', AUDIO: '#FFF1E8',
};
function categoryTileColor(c) {
  const code = String(c?.code || '').toUpperCase();
  const name = String(c?.name || '').toUpperCase();
  if (code.includes('MOBILE') || code.includes('SMARTPHONE') || name.includes('MOBILE')) return CAT_TILE_PASTELS.MOBILE;
  if (code.includes('TABLET') || name.includes('TABLET')) return CAT_TILE_PASTELS.TABLET;
  if (code.includes('LAPTOP') || name.includes('LAPTOP')) return CAT_TILE_PASTELS.LAPTOP;
  if (code.includes('WATCH') || name.includes('WATCH')) return CAT_TILE_PASTELS.SMARTWATCH;
  if (code.includes('AUDIO') || name.includes('AUDIO')) return CAT_TILE_PASTELS.AUDIO;
  return '#F1F5F3';
}

/**
 * Save & Continue used to `replace()` straight onto the ChooseDevice screen,
 * i.e. a whole screen push just to pick one of five categories. It now saves
 * the customer and opens a category sheet in place; picking one goes on to
 * SelectBrand — the same destination ChooseDevice sends you to, with the same
 * params, so nothing downstream changes.
 *
 * ChooseDevice itself STAYS: IdentifyDevice, ServiceBookingDevicesList and the
 * owner-side CustomerDetails all still route to it.
 */

function Field({ label, required, children, half = false, className }) {
  return (
    <View className={`${half ? 'flex-1' : ''} mb-2 ${className || ''}`}>
      <Label className="text-[11px] mb-1">
        {label}{required ? <Text className="text-danger"> *</Text> : null}
      </Label>
      {children}
    </View>
  );
}

// One cell of the two-column Address grid. Plain static styles: the old
// `half` Field put `flex-1` on a column inside an auto-height ScrollView row,
// which collapses the row to 0 height on Android and drew every address
// field on top of the next. `flex: 1` here sits on the ROW's child, so it
// only splits the width and the height comes from the content.
function GridField({ label, children }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Label className="text-[11px] mb-1">{label}</Label>
      {children}
    </View>
  );
}
const GRID_ROW = { flexDirection: 'row', gap: 10, marginBottom: 10 };
const GRID_ROW_LAST = { flexDirection: 'row', gap: 10 };
// Same 40dp height as the text inputs so each grid row lines up.
const SELECT_CLS = 'rounded-2xl h-10 py-0';

// The text input fills the full card and the icon is purely decorative. This
// prevents the icon wrapper from receiving a tap intended for the text field
// on Android, which was leaving the mobile field's caret active.
function FormTextInput({ icon, className, style, ...props }) {
  return (
    <View className="relative">
      <TextInput
        {...props}
        placeholderTextColor="#8FA08F"
        className={`bg-card border border-border rounded-2xl ${icon ? 'pl-12 pr-4' : 'px-4'} ${className || ''}`}
        style={style}
      />
      {icon ? (
        <View
          pointerEvents="none"
          className="absolute left-4 top-0 bottom-0 justify-center"
        >
          {icon}
        </View>
      ) : null}
    </View>
  );
}

export default function CustomerDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  // Tighter end of the spec's recommended ranges on a short phone screen;
  // looser end otherwise — both stay within "compact", neither is cramped.
  const compact = winH < 760;
  const isTablet = winW >= 600;
  const formMaxWidth = isTablet ? 760 : undefined;
  // Input height ~40-44dp compact / ~44-46dp roomier — both within the
  // recommended range, stays a stable string (so the memoized <Input>/
  // <FormTextInput> below still skip re-render on an unrelated keystroke)
  // as long as `compact` itself hasn't changed.
  const inputCls = compact ? 'py-2 text-[13px]' : 'py-2.5 text-[13px]';
  const initial = route?.params?.initial || {};
  // The picker passes the resolved customer in `existing`; the ticket-service
  // CustomerResponse now carries structured address fields (state/city/
  // locality/addressLine/pincode) sourced from the platform customer_addresses
  // row. Fall back to `initial` so callers that already split the address
  // themselves still work.
  const existingPick = route?.params?.existing || {};
  const [data, setData] = useState({
    name: initial.name || '',
    phone: normalizeMobile(initial.phone || existingPick.phone || existingPick.mobile),
    email: initial.email || '',
    state: initial.state || existingPick.state || 'Tamil Nadu',
    district: initial.district || existingPick.district || existingPick.city || '',
    taluk: initial.taluk || existingPick.taluk || '',
    area: initial.area || existingPick.area || existingPick.locality || '',
    addressLine: initial.addressLine || existingPick.addressLine || '',
    pincode: initial.pincode || existingPick.pincode || '',
  });
  const [saving, setSaving] = useState(false);
  // Category sheet, opened by Save & Continue once the customer is stored.
  const [catOpen, setCatOpen] = useState(false);
  const [cats, setCats] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);
  // The customer row the save resolved to — carried into the next screen.
  const [savedCustomer, setSavedCustomer] = useState(null);

  /* ── Customer search ───────────────────────────────────────────────────
     Moved here from the New Booking screen, which existed only to host it.
     Book Service now lands straight on this form; searching a name or mobile
     fills it in, and typing into it directly is the "new customer" path — no
     separate button or screen for that any more. */
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  // A customer can exist BOTH shop-side and platform-side under the same
  // phone. Collapse on name+phone and prefer the shop row: booking needs a
  // shop `customers.id`.
  const dedupedResults = useMemo(() => {
    const byKey = new Map();
    for (const c of results) {
      const phone = String(c.phone || c.mobile || '').replace(/\s|\+|-/g, '');
      const key = `${String(c.name || '').toLowerCase().trim()}|${phone}`;
      const prev = byKey.get(key);
      if (!prev) { byKey.set(key, c); continue; }
      if (prev.source === 'platform' && c.source === 'shop') byKey.set(key, c);
    }
    return Array.from(byKey.values());
  }, [results]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); setSearchError(false); return; }
      setSearching(true);
      setSearchError(false);
      try {
        const d = await ticketApi.get('/customers', { query: { q: q.trim() } });
        if (!cancelled) setResults(Array.isArray(d) ? d : []);
      } catch (_) {
        // A failed lookup is NOT the same as "no matching customer" — the
        // customer may well exist; the request just didn't complete. Showing
        // the generic "will create a new one" copy here would risk a
        // duplicate customer row. Keep whatever results were last shown
        // (don't wipe a previous successful search) and flag the failure
        // distinctly instead.
        if (!cancelled) setSearchError(true);
      }
      finally { if (!cancelled) setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  /** Fill the form from a search hit, then collapse the results. */
  const pickCustomer = (c) => {
    Keyboard.dismiss();
    setData((d) => ({
      ...d,
      name: c.name || '',
      phone: normalizeMobile(c.phone || c.mobile || ''),
      email: c.email || '',
      state: c.state || d.state,
      district: c.district || c.city || d.district,
      taluk: c.taluk || d.taluk,
      area: c.area || c.locality || d.area,
      addressLine: c.addressLine || d.addressLine,
      pincode: c.pincode || d.pincode,
    }));
    // Record the resolved row so Save & Continue reuses it instead of
    // upserting a duplicate — this is the job the removed phone lookup did.
    setExisting(c);
    existingPhoneRef.current = normalizeMobile(c.phone || c.mobile || '');
    setQ('');
    setResults([]);
  };
  // ID-proof upload. Set only when the owner picks + uploads a document in this
  // session (never pre-filled from a lookup), so a non-empty value always means
  // "attach this to whichever customer we resolve on Save & Continue".
  const [idProofUrl, setIdProofUrl] = useState('');
  const [idProofUploading, setIdProofUploading] = useState(false);
  // When a lookup hits an existing customer (shop or platform), remember the
  // resolved row so Save & Continue can reuse / link it instead of creating
  // a duplicate. Cleared whenever the phone field changes.
  // Set when a customer is chosen from the search above, or pre-seeded by a
  // caller that already picked one. Save reuses this row instead of upserting.
  const [existing, setExisting] = useState(route?.params?.existing || null);
  const phoneInputRef = useRef(data.phone);
  // `existing` is only safe to reuse while it matches the current phone.
  // Holding the match key separately prevents a quick phone edit + Save from
  // linking the booking to the customer returned for the previous number.
  const existingPhoneRef = useRef(normalizeMobile(initial.phone || existingPick.phone || existingPick.mobile));
  const editedFieldsRef = useRef(new Set());

  // Functional field setter — every keystroke merges into the LATEST state
  // rather than a captured `data` snapshot, so an interleaved update can never
  // revert the character just typed. Matches the app's other forms.
  // Stable across renders (only touches refs + setState via functional update),
  // so the per-field handlers below keep a fixed identity and let the memoized
  // <Input>/<Select> children bail out of re-render on unrelated keystrokes.
  const set = useCallback((k, v) => {
    editedFieldsRef.current.add(k);
    if (k === 'phone') {
      const changed = phoneInputRef.current !== v;
      phoneInputRef.current = v;
      if (changed) {
        // Editing the number invalidates a customer picked from the search —
        // otherwise Save could attach the booking to the previous person.
        existingPhoneRef.current = '';
        setExisting(null);
      }
    }
    setData((d) => (d[k] === v ? d : { ...d, [k]: v }));
  }, []);

  // One stable callback per field. Because their identity never changes, an
  // unfocused field's props stay shallow-equal on a keystroke elsewhere and it
  // skips re-render — keeping the focused input's update cheap (no caret jump).
  const onName        = useCallback((v) => set('name', v), [set]);
  const onPhone       = useCallback((v) => set('phone', v), [set]);
  const onEmail       = useCallback((v) => set('email', v), [set]);
  const onState       = useCallback((v) => set('state', v), [set]);
  const onDistrict    = useCallback((v) => set('district', v), [set]);
  const onTaluk       = useCallback((v) => set('taluk', v), [set]);
  const onArea        = useCallback((v) => set('area', v), [set]);
  const onAddressLine = useCallback((v) => set('addressLine', v), [set]);
  const onPincode     = useCallback((v) => set('pincode', v), [set]);

  // Pick an ID-proof image from the camera or gallery, enforce the 1MB cap
  // shown on the box, upload it to /media/upload, and remember the hosted URL.
  const pickIdProof = async (fromCamera = false) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', `Allow ${fromCamera ? 'camera' : 'media library'} access to upload the ID proof.`);
      return;
    }
    try {
      const opts = { mediaTypes: 'images', allowsEditing: false, quality: 0.7 };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Honour the "Max 1MB" hint whenever the picker reports a size.
      if (asset.fileSize && asset.fileSize > 1024 * 1024) {
        notify('File too large', 'The ID proof must be 1MB or smaller. Please pick a smaller image.');
        return;
      }
      setIdProofUploading(true);
      const url = await uploadMedia(asset, 'customer-id-proof');
      if (!url) throw new Error('Upload returned no URL');
      setIdProofUrl(url);
    } catch (e) {
      notify('Upload failed', e?.message || 'Could not upload the ID proof. Try again.');
    } finally {
      setIdProofUploading(false);
    }
  };

  // Web's Alert.alert collapses to window.alert (no multi-button sheet), so on
  // web we skip straight to the library picker.
  const promptPickIdProof = () => {
    if (Platform.OS === 'web') { pickIdProof(false); return; }
    Alert.alert('Upload ID Proof', '', [
      { text: 'Take Photo', onPress: () => pickIdProof(true) },
      { text: 'Choose from Gallery', onPress: () => pickIdProof(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Fetched on mount, not on open: the sheet appears the instant Save
  // succeeds, and waiting on a request at that point would read as a hang
  // right after the button's own spinner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getDeviceCategories();
        if (!cancelled) setCats(orderCategories(Array.isArray(list) ? list : []));
      } catch {
        if (!cancelled) setCats([]);
      } finally {
        if (!cancelled) setCatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Same destination and params ChooseDevice's own `onPick` produces, so the
   * rest of the booking flow cannot tell which route the category came from.
   */
  const pickCategory = (c, customer = savedCustomer) => {
    setCatOpen(false);
    navigation.navigate('SelectBrand', {
      customerId: customer?.id,
      customer,
      flow: 'BOOKING',
      categoryId: c.id,
      categoryCode: (c.code || '').toUpperCase(),
      categoryName: c.name,
    });
  };

  const save = async () => {
    const phone = normalizeMobile(data.phone);
    if (!data.name.trim() || phone.length !== 10) {
      notify('Required', 'Enter the customer name and a valid 10-digit mobile number.');
      return;
    }
    if (idProofUploading) {
      notify('Please wait', 'The ID proof is still uploading.');
      return;
    }
    setSaving(true);
    try {
      let resolved = existingPhoneRef.current === phone ? existing : null;
      // If we have a platform match, materialize the shop-scoped row now.
      if (resolved && resolved.source === 'platform') {
        resolved = await ticketApi.post('/customers/link', {
          body: { platformUserId: resolved.platformUserId || resolved.id },
        });
      }
      // Nothing matched — create a fresh customer in customer_users +
      // customer_addresses. Structured fields land in their own columns so
      // the customer app can prefill them later; we also still send the
      // legacy `address` concat so older backends keep working.
      if (!resolved) {
        const structured = {
          addressLine: data.addressLine?.trim() || null,
          locality:    data.taluk?.trim()       || data.area?.trim() || null,
          city:        data.district?.trim()    || null,
          state:       data.state?.trim()       || null,
          pincode:     data.pincode?.trim()     || null,
        };
        resolved = await ticketApi.post('/customers', {
          body: {
            name: data.name.trim(),
            phone,
            email: data.email.trim() || null,
            idProofUrl: idProofUrl || null,
            ...structured,
            address: [data.addressLine, data.area, data.taluk, data.district, data.state, data.pincode]
              .filter(Boolean).join(', '),
          },
        });
      } else if (idProofUrl) {
        // Existing / linked customer, but the owner just uploaded a fresh ID
        // proof — attach it. POST /customers upserts by mobile and only writes
        // idProofUrl when provided (no address is inserted when the fields are
        // omitted), so this won't disturb their existing name or address.
        await ticketApi.post('/customers', {
          body: { name: data.name.trim(), phone, idProofUrl },
        });
      }
      // Home's Repair popup already chose the category: go straight on to
      // SelectBrand with the same params the category sheet would send.
      const preselected = route?.params?.preselectedCategory;
      if (preselected?.id) {
        setSavedCustomer(resolved);
        pickCategory(preselected, resolved);
        return;
      }
      // With the IMEI step enabled the flow still goes through its own screen.
      // Otherwise the category sheet opens here instead of pushing ChooseDevice.
      if (IDENTIFY_DEVICE_ENABLED) {
        navigation.replace('IdentifyDevice', { customerId: resolved.id, customer: resolved });
        return;
      }
      setSavedCustomer(resolved);
      setCatOpen(true);
    } catch (e) {
      notify('Error', e?.message || 'Failed to save customer');
    } finally { setSaving(false); }
  };

  return (
    // Explicit white rather than the `bg-background` class. The token IS white
    // now, but NativeWind compiles tailwind.config.js at BUILD time — the class
    // keeps its old value until Metro is restarted with --clear, so a plain
    // style is what makes this screen white without a rebuild.
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Header on the plain page: the soft corner circle is gone and the strip
          no longer paints its own card fill. */}
      <View
        style={{ paddingTop: insets.top + (compact ? 6 : 8), paddingBottom: compact ? 6 : 10 }}
        className="px-4"
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={6}
            className="h-9 w-9 items-center justify-center rounded-2xl active:opacity-70"
            style={{ marginLeft: -6 }}
          >
            <ChevronLeft size={20} color={ACCENT} />
          </Pressable>
          <View className="flex-1 items-center px-2">
            <Text className="text-[17px] font-extrabold text-text">Customer Details</Text>
          </View>
          <View className="h-9 w-9" />
        </View>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={{
          padding: compact ? 10 : 12,
          paddingBottom: compact ? 16 : 20,
          alignItems: isTablet ? 'center' : undefined,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Width-capped + centered on tablet/large screens (section 8) — plain
            View wrapper, phone gets full width (maxWidth undefined). */}
        <View style={{ width: '100%', maxWidth: formMaxWidth }}>

        {/* ── Find an existing customer ──────────────────────────────────
            Type a name or a mobile number; hits fill the form below. Typing
            straight into the form instead is the new-customer path. */}
        <View className="mb-3">
          <View
            className="flex-row items-center rounded-full px-3"
            style={{ height: 44, borderWidth: 1, borderColor: ACCENT_30 }}
          >
            <Search size={18} color={ACCENT} strokeWidth={1.5} />
            <TextInput
              placeholder="Search name or mobile number"
              placeholderTextColor="#8FA08F"
              value={q}
              onChangeText={setQ}
              returnKeyType="search"
              autoCapitalize="words"
              className="flex-1 ml-2 text-text"
              style={{ paddingVertical: 0, fontSize: 12 }}
            />
            {searching ? <ActivityIndicator size="small" color={ACCENT} /> : null}
            {!searching && q ? (
              <Pressable onPress={() => { setQ(''); setResults([]); }} hitSlop={8}>
                <X size={15} color="#8FA08F" />
              </Pressable>
            ) : null}
          </View>

          {dedupedResults.map((c) => (
            <Pressable
              key={`${c.source || 'shop'}:${c.id}`}
              onPress={() => pickCustomer(c)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${c.name || 'customer'}`}
              className="flex-row items-center rounded-xl px-3 mt-1.5 active:opacity-80"
              style={{ minHeight: 48, backgroundColor: CAT_TILE_BG }}
            >
              <View className="flex-1">
                <Text className="text-[13px] font-extrabold text-text" numberOfLines={1}>{c.name}</Text>
                <Text className="text-[12px] text-text-muted mt-0.5" numberOfLines={1}>
                  {c.phone || c.mobile || ''}
                </Text>
              </View>
              {c.source === 'platform' ? (
                <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: ACCENT_10 }}>
                  <Text className="text-[10px] font-bold" style={{ color: ACCENT }}>App user</Text>
                </View>
              ) : null}
            </Pressable>
          ))}

          {!searching && q.trim() && searchError ? (
            <Text className="text-[12px] text-center py-3" style={{ color: '#B45309' }}>
              Couldn&apos;t check for an existing customer. Check your connection and try again.
            </Text>
          ) : !searching && q.trim() && dedupedResults.length === 0 ? (
            <Text className="text-[12px] text-text-muted text-center py-3">
              No matching customer — the details below will create a new one.
            </Text>
          ) : null}
        </View>

        {/* Personal info */}
        {/* No card surface: on the white page the section is grouped by its
            heading and spacing rather than by a box. */}
        <View className="mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-9 w-9 rounded-full bg-success/10 items-center justify-center mr-2.5">
              <UserPlus size={17} color={ACCENT} />
            </View>
            <Text className="text-[13px] font-extrabold text-text">Personal Info</Text>
          </View>

          <Field label="Customer Name" required>
            <FormTextInput icon={USER_ICON} placeholder="Enter customer name" value={data.name} onChangeText={onName} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} autoCapitalize="words" />
          </Field>

          <Field label="Mobile Number" required>
            {/* No visible +91/flag prefix — the number is still normalized to
                a plain 10-digit value on submit (normalizeMobile, unchanged)
                and the API payload is untouched; this only removes UI that
                was purely decorative. */}
            <Input
              className={inputCls}
              placeholder="Enter mobile number"
              keyboardType="number-pad"
              maxLength={10}
              value={data.phone}
              onChangeText={onPhone}
              style={INPUT_STYLE}
              cursorColor={ACCENT}
            />
            {existing ? (
              <View className="flex-row items-center mt-2">
                <View className="h-5 w-5 rounded-full bg-success items-center justify-center mr-1.5">
                  <Check size={12} color="#FFFFFF" strokeWidth={3} />
                </View>
                <Text className="text-[12px] text-success font-semibold flex-1">
                  {existing.source === 'platform' ? 'App user found — will be linked to this shop' : 'Existing customer in this shop'}
                </Text>
              </View>
            ) : null}
          </Field>

          <Field label="Email Address" className="mb-0">
            <FormTextInput icon={MAIL_ICON} placeholder="email@example.com" autoCapitalize="none" keyboardType="email-address" value={data.email} onChangeText={onEmail} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} />
          </Field>
        </View>

        {/* Address */}
        {/* No card surface: on the white page the section is grouped by its
            heading and spacing rather than by a box. */}
        <View className="mb-3">
          <View className="flex-row items-center mb-2.5">
            <View className="h-9 w-9 rounded-full items-center justify-center mr-2.5" style={{ backgroundColor: ACCENT_10 }}>
              <MapPin size={17} color={ACCENT} />
            </View>
            <Text className="text-[13px] font-extrabold text-text">Address</Text>
          </View>

          <View style={GRID_ROW}>
            <GridField label="State">
              <Select value={data.state} options={STATES} onChange={onState} className={SELECT_CLS} />
            </GridField>
            <GridField label="District">
              <Select value={data.district} options={DISTRICTS_TN} placeholder="Select district" onChange={onDistrict} className={SELECT_CLS} />
            </GridField>
          </View>

          <View style={GRID_ROW}>
            <GridField label="Taluk">
              <Select value={data.taluk} options={TALUKS} placeholder="Select Taluk" onChange={onTaluk} className={SELECT_CLS} />
            </GridField>
            <GridField label="Area">
              <FormTextInput placeholder="Area" value={data.area} onChangeText={onArea} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} />
            </GridField>
          </View>

          <View style={GRID_ROW_LAST}>
            <GridField label="Door no. / Street">
              <FormTextInput placeholder="Door No. / Street" value={data.addressLine} onChangeText={onAddressLine} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} />
            </GridField>
            <GridField label="Pin Code">
              <FormTextInput placeholder="Pincode" keyboardType="number-pad" maxLength={6} value={data.pincode} onChangeText={onPincode} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} />
            </GridField>
          </View>
        </View>

        {/* Upload ID Proof */}
        {idProofUploading ? (
          <View className="border border-dashed rounded-3xl py-3 items-center mb-3" style={{ borderColor: ACCENT_40, backgroundColor: ACCENT_05 }}>
            <ActivityIndicator color={ACCENT} />
            <Text className="font-semibold text-[13px] mt-2" style={{ color: ACCENT }}>Uploading…</Text>
          </View>
        ) : idProofUrl ? (
          <View className="border rounded-3xl p-3.5 mb-3 flex-row items-center" style={{ borderColor: ACCENT_30, backgroundColor: ACCENT_05 }}>
            <Image source={{ uri: idProofUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
            <View className="flex-1 ml-3">
              <Text className="text-[13px] font-extrabold text-text">ID Proof uploaded</Text>
              <Pressable onPress={promptPickIdProof} hitSlop={6}>
                <Text className="text-[12px] font-semibold mt-0.5" style={{ color: ACCENT }}>Replace</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setIdProofUrl('')}
              hitSlop={8}
              className="h-9 w-9 rounded-full bg-danger/10 items-center justify-center"
            >
              <X size={16} color="#DC2626" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={promptPickIdProof}
            className="border border-dashed rounded-3xl py-3 items-center active:opacity-80 mb-3" style={{ borderColor: ACCENT_40, backgroundColor: ACCENT_05 }}
          >
            <View className="h-10 w-10 rounded-full items-center justify-center" style={{ backgroundColor: ACCENT_10 }}>
              <UploadCloud size={18} color={ACCENT} />
            </View>
            <Text className="font-extrabold text-[13px] mt-1.5" style={{ color: ACCENT }}>Upload ID Proof</Text>
            <Text className="text-[11px] text-text-muted mt-0.5">Optional · Max 1MB</Text>
          </Pressable>
        )}

        {/* Outline, not the filled rnr Button: no background, ACCENT border,
            label and icon. Matches the New Customer / Booking buttons.
            Written as a Pressable because the shared Button paints a variant
            fill, and overriding that fights the component. */}
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save and continue"
          className="flex-row items-center justify-center active:opacity-85"
          style={{
            height: 48,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: ACCENT,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <>
              <Save size={17} color={ACCENT} />
              <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '700', marginLeft: 7 }}>
                Save & Continue
              </Text>
            </>
          )}
        </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker. `ResponsiveModal` makes this a bottom sheet on a
          phone and a centred dialog on a tablet, and caps its height to the
          window so a long list in landscape can still be scrolled to the end.
          Dismissing without choosing is deliberate and safe: the customer is
          already saved, so Save & Continue simply reopens this. */}
      <ResponsiveModal visible={catOpen} onClose={() => setCatOpen(false)} maxWidth={480}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8E2', marginBottom: 10 }} />
        <Text className="text-[13px] font-extrabold text-text">Select Category</Text>
        <Text className="text-[11px] text-text-muted mb-2.5" numberOfLines={1}>
          What is {savedCustomer?.name || 'the customer'} bringing in?
        </Text>

        {catsLoading ? (
          <View className="py-8 items-center"><ActivityIndicator color={ACCENT} /></View>
        ) : cats.length === 0 ? (
          <Text className="text-[12px] text-text-muted py-6 text-center">
            No device categories published yet.
          </Text>
        ) : (
          // 3 across on phone (five categories sit 3 + 2); 5 across on
          // tablet, where `ResponsiveModal` already widens this sheet.
          //
          // The tiles carry no border. On the sheet's white surface a white
          // tile with no border would be invisible, so the fill is the soft
          // grey the rest of the app uses for exactly this — the tile is read
          // by its fill rather than by a box drawn around it.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -CAT_TILE_GAP / 2 }}>
            {cats.map((c) => {
              const pastel = categoryTileColor(c);
              return (
                <View
                  key={c.id}
                  style={{ width: `${100 / (isTablet ? 5 : 3)}%`, paddingHorizontal: CAT_TILE_GAP / 2, marginBottom: CAT_TILE_GAP }}
                >
                  <Pressable
                    onPress={() => pickCategory(c)}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                    className="items-center rounded-2xl active:opacity-70"
                    // Comfortably past the 48dp Android / 44pt iOS touch floor.
                    style={{
                      backgroundColor: pastel,
                      paddingVertical: 11,
                      paddingHorizontal: 6,
                      minHeight: 96,
                      shadowColor: '#0B1F14',
                      shadowOpacity: 0.06,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 1,
                    }}
                  >
                    <View
                      className="rounded-xl items-center justify-center overflow-hidden"
                      style={{ height: 48, width: 48, backgroundColor: '#FFFFFF', marginBottom: 6 }}
                    >
                      {c.imageUrl || c.imageBase64 ? (
                        <DeviceImage
                          url={c.imageUrl}
                          base64={c.imageBase64}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="contain"
                        />
                      ) : (
                        <Smartphone size={24} color={ACCENT} strokeWidth={2} />
                      )}
                    </View>
                    {/* Two lines plus shrink: "Audio Device" and "Smartwatch" do
                        not fit one line in a third of a phone-width sheet. */}
                    <Text
                      className="text-[12px] font-semibold text-text"
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {c.name}
                    </Text>
                    {/* Decorative affordance only — this sheet is tap-to-
                        navigate (picking a category opens SelectBrand
                        immediately), so there's no persisted "selected"
                        state to highlight; this just signals "opens next". */}
                    <View
                      className="items-center justify-center"
                      style={{ position: 'absolute', top: 8, right: 8, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.85)' }}
                    >
                      <ChevronRightIcon size={12} color={ACCENT} strokeWidth={2.5} />
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ResponsiveModal>
    </View>
  );
}
