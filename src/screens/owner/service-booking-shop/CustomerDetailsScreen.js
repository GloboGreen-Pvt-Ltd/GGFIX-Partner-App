import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { UserPlus, User, Mail, ChevronDown, ChevronLeft, UploadCloud, Save, MapPin, Search, Check, X } from 'lucide-react-native';
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

// Comfortable, consistent field height + readable text across the whole form.
const INPUT_CLS = 'py-3 text-[15px]';
// Hoisted so their identity is stable across renders — required for the
// memoized <Input> to skip re-rendering when a sibling field changes.
// `textAlignVertical:center` + `includeFontPadding:false` keep the text and the
// caret sitting dead-centre in the box on Android (the default font padding is
// what makes the cursor look too high / off inside a tall input).
const INPUT_STYLE = { textAlignVertical: 'center', includeFontPadding: false };

// The IMEI "Identify Device" step is hidden for now — the IMEI.info account
// isn't funded yet, so the lookup always falls back to manual selection and the
// extra screen is just friction. Flip to true (and fund the IMEI.info token /
// set IMEI_API_SERVICE_ID) to re-enable scan → auto-detect. All the code stays.
// ONE accent for this screen: #004C40. Replaces the old #087A0A green AND the
// brighter #16BB05 tick, so the screen reads as a single colour.
//
// The washes are explicit rgba rather than Tailwind's `bg-primary/10`, because
// that class resolves through the shared `primary` token — still the old green
// — and would have left tinted panels green while everything around them moved.
const ACCENT = '#004C40';
const ACCENT_05 = 'rgba(0,76,64,0.05)';
const ACCENT_10 = 'rgba(0,76,64,0.10)';
const ACCENT_30 = 'rgba(0,76,64,0.30)';
const ACCENT_40 = 'rgba(0,76,64,0.40)';

const USER_ICON = <User size={18} color={ACCENT} />;
const MAIL_ICON = <Mail size={18} color={ACCENT} />;

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
    <View className={`${half ? 'flex-1' : ''} mb-2.5 ${className || ''}`}>
      <Label className="text-[12px] mb-1">
        {label}{required ? <Text className="text-danger"> *</Text> : null}
      </Label>
      {children}
    </View>
  );
}

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
      if (!q.trim()) { setResults([]); return; }
      setSearching(true);
      try {
        const d = await ticketApi.get('/customers', { query: { q: q.trim() } });
        if (!cancelled) setResults(Array.isArray(d) ? d : []);
      } catch (_) { if (!cancelled) setResults([]); }
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
      const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 };
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
  const pickCategory = (c) => {
    setCatOpen(false);
    navigation.navigate('SelectBrand', {
      customerId: savedCustomer?.id,
      customer: savedCustomer,
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
        style={{ paddingTop: insets.top + 10 }}
        className="px-4 pb-4"
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="h-11 w-11 items-center justify-center rounded-2xl active:opacity-70"
            style={{ marginLeft: -8 }}
          >
            <ChevronLeft size={22} color={ACCENT} />
          </Pressable>
          <View className="flex-1 items-center px-2">
            <Text className="text-[19px] font-extrabold text-text">Customer Details</Text>
          </View>
          <View className="h-11 w-11" />
        </View>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >

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
              style={{ paddingVertical: 0, fontSize: 12.5 }}
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

          {!searching && q.trim() && dedupedResults.length === 0 ? (
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
            <Text className="text-[15px] font-extrabold text-text">Personal Info</Text>
          </View>

          <Field label="Customer Name" required>
            <FormTextInput icon={USER_ICON} placeholder="Enter customer name" value={data.name} onChangeText={onName} className={INPUT_CLS} style={INPUT_STYLE} cursorColor={ACCENT} autoCapitalize="words" />
          </Field>

          <Field label="Mobile Number" required>
            <View className="flex-row">
              <Pressable className="bg-card border border-border rounded-2xl px-3 py-2.5 mr-2 flex-row items-center">
                <Text className="text-[16px] mr-1">🇮🇳</Text>
                <Text className="text-[15px] text-text font-semibold mr-1">+91</Text>
                <ChevronDown size={14} color="#667066" />
              </Pressable>
              <View className="flex-1">
                <Input
                  className={INPUT_CLS}
                  placeholder="10-digit number"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={data.phone}
                  onChangeText={onPhone}
                  style={INPUT_STYLE}
                  cursorColor={ACCENT}
                />
              </View>
            </View>
            {existing ? (
              <View className="flex-row items-center mt-2">
                <View className="h-5 w-5 rounded-full bg-success items-center justify-center mr-1.5">
                  <Check size={12} color="#FFFFFF" strokeWidth={3} />
                </View>
                <Text className="text-[12.5px] text-success font-semibold flex-1">
                  {existing.source === 'platform' ? 'App user found — will be linked to this shop' : 'Existing customer in this shop'}
                </Text>
              </View>
            ) : null}
          </Field>

          <Field label="Email Address" className="mb-0">
            <FormTextInput icon={MAIL_ICON} placeholder="email@example.com" autoCapitalize="none" keyboardType="email-address" value={data.email} onChangeText={onEmail} className={INPUT_CLS} style={INPUT_STYLE} cursorColor={ACCENT} />
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
            <Text className="text-[15px] font-extrabold text-text">Address</Text>
          </View>

          <View className="flex-row -mx-1.5">
            <View className="px-1.5 flex-1">
              <Field label="State" half>
                <Select value={data.state} options={STATES} onChange={onState} className="rounded-2xl py-2.5" />
              </Field>
            </View>
            <View className="px-1.5 flex-1">
              <Field label="District" half>
                <Select value={data.district} options={DISTRICTS_TN} placeholder="Select district" onChange={onDistrict} className="rounded-2xl py-2.5" />
              </Field>
            </View>
          </View>

          <View className="flex-row -mx-1.5">
            <View className="px-1.5 flex-1">
              <Field label="Taluk" half>
                <Select value={data.taluk} options={TALUKS} placeholder="Select Taluk" onChange={onTaluk} className="rounded-2xl py-2.5" />
              </Field>
            </View>
            <View className="px-1.5 flex-1">
              <Field label="Area" half>
                <FormTextInput placeholder="Area" value={data.area} onChangeText={onArea} className={INPUT_CLS} style={INPUT_STYLE} cursorColor={ACCENT} />
              </Field>
            </View>
          </View>

          <View className="flex-row -mx-1.5">
            <View className="px-1.5 flex-1">
              <Field label="Door no. / Street" half className="mb-0">
                <FormTextInput placeholder="Door No. / Street" value={data.addressLine} onChangeText={onAddressLine} className={INPUT_CLS} style={INPUT_STYLE} cursorColor={ACCENT} />
              </Field>
            </View>
            <View className="px-1.5 flex-1">
              <Field label="Pin Code" half className="mb-0">
                <FormTextInput placeholder="Pincode" keyboardType="number-pad" maxLength={6} value={data.pincode} onChangeText={onPincode} className={INPUT_CLS} style={INPUT_STYLE} cursorColor={ACCENT} />
              </Field>
            </View>
          </View>
        </View>

        {/* Upload ID Proof */}
        {idProofUploading ? (
          <View className="border border-dashed rounded-3xl py-4 items-center mb-3" style={{ borderColor: ACCENT_40, backgroundColor: ACCENT_05 }}>
            <ActivityIndicator color={ACCENT} />
            <Text className="font-semibold text-[13px] mt-2" style={{ color: ACCENT }}>Uploading…</Text>
          </View>
        ) : idProofUrl ? (
          <View className="border rounded-3xl p-3.5 mb-3 flex-row items-center" style={{ borderColor: ACCENT_30, backgroundColor: ACCENT_05 }}>
            <Image source={{ uri: idProofUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
            <View className="flex-1 ml-3">
              <Text className="text-[14px] font-extrabold text-text">ID Proof uploaded</Text>
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
            className="border border-dashed rounded-3xl py-4 items-center active:opacity-80 mb-3" style={{ borderColor: ACCENT_40, backgroundColor: ACCENT_05 }}
          >
            <View className="h-11 w-11 rounded-full items-center justify-center" style={{ backgroundColor: ACCENT_10 }}>
              <UploadCloud size={20} color={ACCENT} />
            </View>
            <Text className="font-extrabold text-[14px] mt-1.5" style={{ color: ACCENT }}>Upload ID Proof</Text>
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
              <Text style={{ color: ACCENT, fontSize: 14, fontWeight: '700', marginLeft: 7 }}>
                Save & Continue
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker. `ResponsiveModal` makes this a bottom sheet on a
          phone and a centred dialog on a tablet, and caps its height to the
          window so a long list in landscape can still be scrolled to the end.
          Dismissing without choosing is deliberate and safe: the customer is
          already saved, so Save & Continue simply reopens this. */}
      <ResponsiveModal visible={catOpen} onClose={() => setCatOpen(false)} maxWidth={480}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8E2', marginBottom: 10 }} />
        <Text className="text-[15px] font-extrabold text-text">Select Category</Text>
        <Text className="text-[11.5px] text-text-muted mb-2.5" numberOfLines={1}>
          What is {savedCustomer?.name || 'the customer'} bringing in?
        </Text>

        {catsLoading ? (
          <View className="py-8 items-center"><ActivityIndicator color={ACCENT} /></View>
        ) : cats.length === 0 ? (
          <Text className="text-[12.5px] text-text-muted py-6 text-center">
            No device categories published yet.
          </Text>
        ) : (
          // THREE across, so the five categories sit 3 + 2.
          //
          // The tiles carry no border. On the sheet's white surface a white
          // tile with no border would be invisible, so the fill is the soft
          // grey the rest of the app uses for exactly this — the tile is read
          // by its fill rather than by a box drawn around it.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -CAT_TILE_GAP / 2 }}>
            {cats.map((c) => (
              <View
                key={c.id}
                style={{ width: '33.333%', paddingHorizontal: CAT_TILE_GAP / 2, marginBottom: CAT_TILE_GAP }}
              >
                <Pressable
                  onPress={() => pickCategory(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  className="items-center rounded-xl active:opacity-70"
                  // Comfortably past the 48dp Android / 44pt iOS touch floor.
                  style={{ backgroundColor: CAT_TILE_BG, paddingVertical: 12, paddingHorizontal: 6, minHeight: 88 }}
                >
                  <View
                    className="rounded-lg items-center justify-center overflow-hidden"
                    style={{ height: 36, width: 36, backgroundColor: '#FFFFFF', marginBottom: 6 }}
                  >
                    {c.imageUrl || c.imageBase64 ? (
                      <DeviceImage
                        url={c.imageUrl}
                        base64={c.imageBase64}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="contain"
                      />
                    ) : (
                      <Smartphone size={18} color={ACCENT} strokeWidth={2} />
                    )}
                  </View>
                  {/* Two lines plus shrink: "Audio Device" and "Smartwatch" do
                      not fit one line in a third of a phone-width sheet. */}
                  <Text
                    className="text-[12px] font-medium text-text"
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={{ textAlign: 'center', width: '100%' }}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ResponsiveModal>
    </View>
  );
}
