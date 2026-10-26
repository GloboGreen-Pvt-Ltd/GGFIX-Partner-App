import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { UserPlus, User, Mail, Phone, ArrowLeft, ChevronRight as ChevronRightIcon, UploadCloud, MapPin, Search, Check, X, IdCard } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ticketApi } from '../../../api/client';
import { uploadMedia, getDeviceCategories } from '../../../api/masterData';
import { notify } from '../../../components/confirm';
import { ResponsiveModal } from '../../../components/responsive';
import DeviceImage from '../../../components/DeviceImage';
import { Smartphone, RefreshCcw } from 'lucide-react-native';

// One "House No, Street, Area, City, Pincode" line from a customer's saved
// address parts, falling back to the legacy concatenated `address`.
const composeAddress = (c = {}) =>
  [c.addressLine, c.area || c.locality, c.taluk, c.district || c.city, c.pincode]
    .filter(Boolean).join(', ') || c.address || '';

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
const INPUT_H = 46;
const INPUT_STYLE = { height: INPUT_H, textAlignVertical: 'center', includeFontPadding: false };

// GGFIX palette. Explicit hexes rather than Tailwind's `primary` / `success`
// tokens, because those still resolve to the old teal theme until the shared
// config moves — a class would leave this screen half-teal.
const ACCENT = '#035C6C';       // fills, icons, selected states, cursor
const ACCENT_TEXT = '#035C6C';  // green TEXT on white / mint
// Translucent wash of ACCENT (#035C6C), still used by the panels below.
const ACCENT_10 = 'rgba(3, 92, 108,0.10)';
const INK = '#111111';
const MUTED = '#6B7280';
const PLACEHOLDER = '#9CA3AF';
const BORDER = '#E5E7EB';       // input borders
const HAIRLINE = '#F3F4F6';     // card borders on the grey page
const PAGE_BG = '#F3F4F6';

// Field icons are neutral ink, per the reference design.
const USER_ICON = <User size={19} color={INK} strokeWidth={1.75} />;
const MAIL_ICON = <Mail size={19} color={INK} strokeWidth={1.75} />;
const PIN_ICON = <MapPin size={19} color={INK} strokeWidth={1.75} />;
const PHONE_ICON = <Phone size={19} color={INK} strokeWidth={1.75} />;
const ADDRESS_STYLE = { minHeight: 80, textAlignVertical: 'top', paddingTop: 13, paddingBottom: 13 };

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
const CAT_TILE_BG = '#F3F4F6';

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
  MOBILE: '#EAF3FF', TABLET: '#F1ECFF', LAPTOP: '#E5F3F5', SMARTWATCH: '#E5F3F5', AUDIO: '#FFF1E8',
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

// One status for every way a customer is resolved (search pick, typed mobile,
// Save). Existing = already booked with this shop; App user = on the platform
// but new to this shop (linked on Save); Already Linked = linked from here.
function customerStatus(c, linkedIds) {
  if (!c) return 'new';
  if (c.source === 'shop' || Number(c.bookingCount) > 0) return 'existing';
  return linkedIds?.has(c.id) ? 'linked' : 'app';
}

const LOOKUP_STATUS = {
  checking: { text: 'Checking customer…' },
  existing: { text: 'Existing Customer', ok: true },
  app: { text: 'App User Found · linked to this shop on Save', ok: true },
  linked: { text: 'Already Linked', ok: true },
  new: { text: 'New Customer' },
  error: { text: "Couldn't check this number — it will be checked again on Save", warn: true },
};

function LookupStatus({ status }) {
  const s = LOOKUP_STATUS[status];
  if (!s) return null;
  return (
    <View className="flex-row items-center mt-2">
      {status === 'checking' ? (
        <ActivityIndicator size="small" color={ACCENT} style={{ marginRight: 6 }} />
      ) : s.ok ? (
        <View className="h-5 w-5 rounded-full bg-success items-center justify-center mr-1.5">
          <Check size={12} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : s.warn ? null : (
        <UserPlus size={14} color={MUTED} style={{ marginRight: 6 }} />
      )}
      <Text className="text-[12px] font-semibold flex-1" style={{ color: s.ok ? ACCENT_TEXT : s.warn ? '#B45309' : MUTED }}>
        {s.text}
      </Text>
    </View>
  );
}

// Bold label above each field: red * when required, muted "(Optional)" otherwise.
function Field({ label, required, optional, children, className }) {
  return (
    <View className={`mb-4 ${className || ''}`}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 8 }}>
        {label}
        {required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
        {optional ? <Text style={{ fontWeight: '400', color: MUTED }}> (Optional)</Text> : null}
      </Text>
      {children}
    </View>
  );
}

// Outlined field box shared by every input on the form.
const FIELD_BOX = { borderWidth: 1, borderColor: BORDER, borderRadius: 12, backgroundColor: '#FFFFFF' };

// The text input fills the full card and the icon is purely decorative. This
// prevents the icon wrapper from receiving a tap intended for the text field
// on Android, which was leaving the mobile field's caret active. `iconTop`
// pins the icon to the first line of a multiline field (Address).
function FormTextInput({ icon, iconTop = false, className, style, ...props }) {
  return (
    <View className="relative">
      <TextInput
        {...props}
        placeholderTextColor={PLACEHOLDER}
        className={`text-text ${icon ? 'pl-12 pr-4' : 'px-4'} ${className || ''}`}
        style={[FIELD_BOX, style]}
      />
      {icon ? (
        <View
          pointerEvents="none"
          className={`absolute left-4 ${iconTop ? 'top-3' : 'top-0 bottom-0 justify-center'}`}
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
    // Single free-text address (House No, Street, Area, City, Pincode).
    address: composeAddress(initial) || composeAddress(existingPick),
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
    // Same flow as a typed mobile match; an explicit pick fills every field.
    applyMatch(c, { force: true });
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
  // Inline mobile status: '' | checking | existing | app | linked | new | error.
  const [lookupStatus, setLookupStatus] = useState(() => (existingPick.id ? customerStatus(existingPick) : ''));
  // App users linked to this shop by a Save on this screen.
  const linkedIdsRef = useRef(new Set());

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
  const onAddress     = useCallback((v) => set('address', v), [set]);

  /**
   * The one place a resolved customer lands — from a search pick or a typed
   * mobile match. Fills saved details (a typed-number match never overwrites
   * a field the owner typed; an explicit pick does), and records the row so
   * Save reuses / links it instead of re-posting it.
   */
  const applyMatch = useCallback((c, { force = false } = {}) => {
    const phone = normalizeMobile(c.phone || c.mobile || '');
    const saved = {
      name: c.name,
      email: c.email,
      state: c.state,
      address: composeAddress(c),
    };
    setData((d) => {
      const next = { ...d, phone: phone || d.phone };
      for (const [k, v] of Object.entries(saved)) {
        if (v && (force || !editedFieldsRef.current.has(k))) next[k] = v;
      }
      return next;
    });
    if (phone) phoneInputRef.current = phone;
    existingPhoneRef.current = phone;
    setExisting(c);
    setLookupStatus(customerStatus(c, linkedIdsRef.current));
  }, []);

  // A valid 10-digit mobile checks shop customers + Customer App users.
  // Skipped when that number is already resolved (pick, seed, earlier match).
  const phoneDigits = normalizeMobile(data.phone);
  useEffect(() => {
    if (phoneDigits.length !== 10) { setLookupStatus(''); return undefined; }
    if (existing && existingPhoneRef.current === phoneDigits) return undefined;
    let cancelled = false;
    setLookupStatus('checking');
    const t = setTimeout(async () => {
      try {
        const found = await ticketApi.get('/customers/lookup', { query: { mobile: phoneDigits } });
        if (cancelled) return;
        if (found?.id) applyMatch(found);
        else setLookupStatus('new');
      } catch (_) {
        if (!cancelled) setLookupStatus('error');
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phoneDigits, existing, applyMatch]);

  // Pick an ID-proof image from the camera or gallery, enforce the 10MB cap
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
      // Honour the "Max 10MB" hint (the /media/upload limit) whenever the picker reports a size.
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        notify('File too large', 'The ID proof must be 10MB or smaller. Please pick a smaller image.');
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
      // The inline check didn't finish (offline / saved mid-check): check once
      // more so a known customer is reused, not re-posted over their details.
      if (!resolved && lookupStatus !== 'new') {
        try {
          const found = await ticketApi.get('/customers/lookup', { query: { mobile: phone } });
          if (found?.id) resolved = found;
        } catch (_) { /* POST /customers below upserts by mobile — still no duplicate */ }
      }
      // If we have a platform match, materialize the shop-scoped row now.
      if (resolved && resolved.source === 'platform') {
        resolved = await ticketApi.post('/customers/link', {
          body: { platformUserId: resolved.platformUserId || resolved.id },
        });
        linkedIdsRef.current.add(resolved.id);
        existingPhoneRef.current = phone;
        setExisting(resolved);
        setLookupStatus(customerStatus(resolved, linkedIdsRef.current));
      }
      // Nothing matched — create a fresh customer in customer_users +
      // customer_addresses. Structured fields land in their own columns so
      // the customer app can prefill them later; we also still send the
      // legacy `address` concat so older backends keep working.
      if (!resolved) {
        // One free-text address now: it lands in addressLine, and a 6-digit
        // pincode in it still fills its own column. No address typed → no
        // address row (state alone isn't one).
        const address = data.address.trim();
        const structured = {
          addressLine: address || null,
          locality:    null,
          city:        null,
          state:       address ? (data.state?.trim() || null) : null,
          pincode:     address.match(/\b\d{6}\b/)?.[0] || null,
        };
        resolved = await ticketApi.post('/customers', {
          body: {
            name: data.name.trim(),
            phone,
            email: data.email.trim() || null,
            idProofUrl: idProofUrl || null,
            ...structured,
            address,
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
      if (IDENTIFY_DEVICE_ENABLED) {
        navigation.replace('IdentifyDevice', { customerId: resolved.id, customer: resolved });
        return;
      }
      // Device Details picks category → brand → model → colour / storage on
      // one screen (a category chosen earlier, e.g. from Home, comes along).
      setSavedCustomer(resolved);
      const preselected = route?.params?.preselectedCategory;
      // Editing a booking: carry its edit params (editMode, editTicketId,
      // device, services, photos…) on to Device Details with the customer.
      // Re-Service carries the device + its parentTicketId link the same way.
      const editCarry = (route?.params?.editMode || route?.params?.reService)
        ? (({ initial: _i, existing: _e, ...rest }) => rest)(route.params)
        : {};
      navigation.navigate('DeviceDetails', {
        ...editCarry,
        // Add Device on an existing booking: every device booked from here
        // joins that booking number (next suffix) instead of drawing a new one.
        ...(route?.params?.addToBookingNumber ? { addToBookingNumber: route.params.addToBookingNumber } : {}),
        customerId: resolved.id,
        customer: resolved,
        ...(preselected?.id ? { preselectedCategory: preselected } : {}),
      });
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
      {/* White header — same as Service Booking Devices List: round back
          button, centred title + subtitle, hairline under the strip. */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: BORDER }}
          >
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View className="flex-1" style={{ paddingHorizontal: 8 }}>
            <Text className="text-center" style={{ color: INK, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>
              Customer Details
            </Text>
            <Text className="text-center" style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              Search or add the customer for this booking
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>
      {/* KeyboardAwareScrollView (repo pattern): lifts the focused field above
          the keyboard on both platforms, incl. the address fields near Next. */}
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        bottomOffset={24}
        contentContainerStyle={{
          padding: compact ? 10 : 12,
          // Next is the last item — keep it above the gesture / 3-button bar.
          paddingBottom: (compact ? 16 : 20) + insets.bottom,
          alignItems: isTablet ? 'center' : undefined,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Width-capped + centered on tablet/large screens (section 8) — plain
            View wrapper, phone gets full width (maxWidth undefined). */}
        <View style={{ width: '100%', maxWidth: formMaxWidth }}>

        {/* Re-Service: a new repair for a device this shop already serviced. */}
        {route?.params?.reService ? (
          <View className="flex-row items-center mb-3" style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F8D66B' }}>
            <RefreshCcw size={16} color="#8A6A00" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#8A6A00' }}>
                Re-Service{route.params.parentTrackingId ? ` of #${route.params.parentTrackingId}` : ''}
              </Text>
              <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }}>New repair for a previously serviced device — linked to the original booking.</Text>
            </View>
          </View>
        ) : null}

        {/* ── Find an existing customer ──────────────────────────────────
            Type a mobile number; hits fill the form below. Typing straight
            into the form instead is the new-customer path. */}
        <View className="mb-4">
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 8 }}>
            Search Customer by Mobile Number
          </Text>
          <View
            className="flex-row items-center px-4"
            style={{ ...FIELD_BOX, height: INPUT_H }}
          >
            <Search size={19} color={INK} strokeWidth={1.75} />
            <TextInput
              placeholder="Enter mobile number"
              placeholderTextColor={PLACEHOLDER}
              value={q}
              onChangeText={setQ}
              returnKeyType="search"
              keyboardType="number-pad"
              maxLength={10}
              cursorColor={ACCENT}
              className="flex-1 ml-3 text-text"
              style={{ paddingVertical: 0, fontSize: 13 }}
            />
            {searching ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : q ? (
              <Pressable onPress={() => { setQ(''); setResults([]); }} hitSlop={8}>
                <X size={17} color={MUTED} />
              </Pressable>
            ) : (
              <User size={19} color={INK} strokeWidth={1.75} />
            )}
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
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: ACCENT_10 }}>
                <Text className="text-[10px] font-bold" style={{ color: ACCENT }}>
                  {{ existing: 'Existing', linked: 'Linked', app: 'App user' }[customerStatus(c, linkedIdsRef.current)]}
                </Text>
              </View>
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

        {/* ── OR ── */}
        <View className="flex-row items-center mb-4">
          <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          <Text style={{ marginHorizontal: 14, fontSize: 12, fontWeight: '700', color: INK }}>OR</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
        </View>

        {/* Section rail — same format as DEVICES IN THIS BOOKING. */}
        <View className="flex-row items-center mb-3">
          <User size={14} color={ACCENT} strokeWidth={2} />
          <Text className="font-extrabold" style={{ color: INK, fontSize: 11, letterSpacing: 1, marginLeft: 6 }}>
            PERSONAL INFORMATION
          </Text>
        </View>

        <Field label="Customer Name" required>
          <FormTextInput icon={USER_ICON} placeholder="Enter customer name" value={data.name} onChangeText={onName} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} autoCapitalize="words" />
        </Field>

        <Field label="Mobile Number" required>
          <FormTextInput icon={PHONE_ICON} placeholder="Enter mobile number" keyboardType="number-pad" maxLength={10} value={data.phone} onChangeText={onPhone} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} />
          <LookupStatus status={lookupStatus} />
        </Field>

        <Field label="Email" optional>
          <FormTextInput icon={MAIL_ICON} placeholder="Enter email address" autoCapitalize="none" keyboardType="email-address" value={data.email} onChangeText={onEmail} className={inputCls} style={INPUT_STYLE} cursorColor={ACCENT} />
        </Field>

        <Field label="Address" optional>
          <FormTextInput icon={PIN_ICON} iconTop multiline placeholder="House No, Street, Area, City, Pincode" value={data.address} onChangeText={onAddress} className="text-[13px]" style={ADDRESS_STYLE} cursorColor={ACCENT} />
        </Field>

        {/* ID Proof — an input-style field like the ones above: tap to pick
            from camera / gallery, then it shows the file with Replace + remove. */}
        <Field label="ID Proof" optional>
          <Pressable
            onPress={idProofUploading ? undefined : promptPickIdProof}
            disabled={idProofUploading}
            accessibilityRole="button"
            accessibilityLabel={idProofUrl ? 'Replace ID proof' : 'Upload ID proof'}
            className="flex-row items-center pl-4 pr-3 active:opacity-80"
            style={{ ...FIELD_BOX, height: INPUT_H }}
          >
            {idProofUploading ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : idProofUrl ? (
              <Image source={{ uri: idProofUrl }} style={{ width: 26, height: 26, borderRadius: 6 }} resizeMode="cover" />
            ) : (
              <IdCard size={19} color={INK} strokeWidth={1.75} />
            )}
            <Text
              className="flex-1 ml-3"
              style={{ fontSize: 13, color: idProofUrl ? INK : PLACEHOLDER, fontWeight: idProofUrl ? '600' : '400' }}
              numberOfLines={1}
            >
              {idProofUploading ? 'Uploading…' : idProofUrl ? 'ID proof uploaded' : 'Upload ID proof (Max 10MB)'}
            </Text>
            {idProofUploading ? null : idProofUrl ? (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: ACCENT_TEXT, marginRight: 10 }}>Replace</Text>
                <Pressable
                  onPress={() => setIdProofUrl('')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove ID proof"
                  className="h-7 w-7 rounded-full bg-danger/10 items-center justify-center"
                >
                  <X size={14} color="#DC2626" />
                </Pressable>
              </>
            ) : (
              <UploadCloud size={19} color={ACCENT} strokeWidth={1.75} />
            )}
          </Pressable>
        </Field>

        {/* Filled ACCENT "Next" — saves the customer, then opens the category
            sheet (same save() as before). Written as a Pressable because the
            shared Button paints its own variant fill. */}
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Next"
          className="flex-row items-center justify-center active:opacity-85"
          style={{
            height: 48,
            borderRadius: 999,
            backgroundColor: ACCENT,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                Next
              </Text>
              <ChevronRightIcon size={18} color="#FFFFFF" strokeWidth={2.25} style={{ marginLeft: 4 }} />
            </>
          )}
        </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {/* Category picker. `ResponsiveModal` makes this a bottom sheet on a
          phone and a centred dialog on a tablet, and caps its height to the
          window so a long list in landscape can still be scrolled to the end.
          Dismissing without choosing is deliberate and safe: the customer is
          already saved, so Save & Continue simply reopens this. */}
      <ResponsiveModal visible={catOpen} onClose={() => setCatOpen(false)} maxWidth={480}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
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
                      shadowColor: '#111111',
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
