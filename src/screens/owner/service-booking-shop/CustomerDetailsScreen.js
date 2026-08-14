import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { UserPlus, User, Mail, ChevronDown, ChevronLeft, UploadCloud, Save, MapPin, Search, CheckCircle2, Check, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Label, Select } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { uploadMedia } from '../../../api/masterData';
import { notify } from '../../../components/confirm';

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
const USER_ICON = <User size={18} color="#087A0A" />;
const MAIL_ICON = <Mail size={18} color="#087A0A" />;

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

// The IMEI "Identify Device" step is hidden for now — the IMEI.info account
// isn't funded yet, so the lookup always falls back to manual selection and the
// extra screen is just friction. Flip to true (and fund the IMEI.info token /
// set IMEI_API_SERVICE_ID) to re-enable scan → auto-detect. All the code stays.
const IDENTIFY_DEVICE_ENABLED = false;

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
  const [lookupLoading, setLookupLoading] = useState(false);
  // ID-proof upload. Set only when the owner picks + uploads a document in this
  // session (never pre-filled from a lookup), so a non-empty value always means
  // "attach this to whichever customer we resolve on Save & Continue".
  const [idProofUrl, setIdProofUrl] = useState('');
  const [idProofUploading, setIdProofUploading] = useState(false);
  // When a lookup hits an existing customer (shop or platform), remember the
  // resolved row so Save & Continue can reuse / link it instead of creating
  // a duplicate. Cleared whenever the phone field changes.
  // Pre-seeded when the caller already picked an existing customer (e.g. from
  // the New Booking search results) so we skip the lookup round-trip.
  const [existing, setExisting] = useState(route?.params?.existing || null);
  // Don't pre-seed: even when the picker handed us an `existing` row, the
  // search endpoint may have returned it without the structured address
  // overlay. Letting the auto-lookup run once re-fetches via /customers/lookup
  // which guarantees state/city/locality/addressLine/pincode from the platform
  // customer_addresses row.
  const prePickedRef = useRef(!!route?.params?.existing);
  const phoneInputRef = useRef(data.phone);
  const lookupRequestRef = useRef(0);
  // `existing` is only safe to reuse while it matches the current phone.
  // Holding the match key separately prevents a quick phone edit + Save from
  // linking the booking to the customer returned for the previous number.
  const existingPhoneRef = useRef(normalizeMobile(initial.phone || existingPick.phone || existingPick.mobile));
  const editedFieldsRef = useRef(new Set());

  // Functional field setter — every keystroke merges into the LATEST state
  // rather than a captured `data` snapshot. Critical here because the debounced
  // phone auto-lookup also calls setData; with the old `{ ...data, x }` closure
  // an interleaved update could revert the character you just typed, which felt
  // like the cursor "not responding". Matches the app's other forms.
  // Stable across renders (only touches refs + setState via functional update),
  // so the per-field handlers below keep a fixed identity and let the memoized
  // <Input>/<Select> children bail out of re-render on unrelated keystrokes.
  const set = useCallback((k, v) => {
    editedFieldsRef.current.add(k);
    if (k === 'phone') {
      // Invalidate an in-flight lookup before React renders the new value.
      // This prevents an old response from resetting the Android caret.
      const changed = phoneInputRef.current !== v;
      phoneInputRef.current = v;
      lookupRequestRef.current += 1;
      if (changed) {
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

  const doLookup = async (rawPhone, { silentMissing = false, silentFound = false } = {}) => {
    const phone = normalizeMobile(rawPhone);
    if (phone.length !== 10) {
      if (!silentMissing) notify('Mobile number', 'Enter a valid 10-digit mobile number first.');
      return;
    }
    const requestId = ++lookupRequestRef.current;
    const isCurrentLookup = () => (
      requestId === lookupRequestRef.current
      && normalizeMobile(phoneInputRef.current) === phone
    );
    setLookupLoading(true);
    try {
      const found = await ticketApi.get('/customers/lookup', { query: { mobile: phone } });
      if (!isCurrentLookup()) return;
      if (!found) {
        setExisting(null);
        existingPhoneRef.current = '';
        if (!silentMissing) {
          notify('New customer', 'No existing customer with this mobile. Fill in the details to create one.');
        }
        return;
      }
      setExisting(found);
      existingPhoneRef.current = phone;
      setData((d) => ({
        ...d,
        // Never replace phone from a lookup response: it resets TextInput
        // selection while the owner is typing. Other manually edited fields
        // are also left untouched.
        name: editedFieldsRef.current.has('name') ? d.name : (found.name || d.name),
        email: editedFieldsRef.current.has('email') ? d.email : (found.email || d.email),
        state: editedFieldsRef.current.has('state') ? d.state : (found.state || d.state),
        // Prefer the new structured fields from migration 55; fall back to
        // legacy city/locality so this still works against old DTOs in flight.
        district: editedFieldsRef.current.has('district') ? d.district : (found.district || found.city || d.district),
        taluk: editedFieldsRef.current.has('taluk') ? d.taluk : (found.taluk || d.taluk),
        area: editedFieldsRef.current.has('area') ? d.area : (found.area || found.locality || d.area),
        addressLine: editedFieldsRef.current.has('addressLine') ? d.addressLine : (found.addressLine || d.addressLine),
        pincode: editedFieldsRef.current.has('pincode') ? d.pincode : (found.pincode || d.pincode),
      }));
      if (!silentFound) {
        const where = found.source === 'platform'
          ? 'This mobile is registered in the app. Details auto-filled — review and Save & Continue to add them to this shop.'
          : 'This customer already exists in this shop. Details auto-filled — Save & Continue will reuse them.';
        notify('Customer found', where);
      }
    } catch (_) {
      // Network or other error: stay silent on auto-lookup, surface on manual.
      if (isCurrentLookup() && !silentMissing) notify('Lookup failed', 'Could not check existing customers. Continue manually.');
    } finally {
      if (isCurrentLookup()) setLookupLoading(false);
    }
  };

  // Auto-lookup once the phone reaches 10 digits, debounced.
  useEffect(() => {
    const phone = normalizeMobile(data.phone);
    if (phone.length !== 10) {
      if (existing) setExisting(null);
      existingPhoneRef.current = '';
      return;
    }
    const wasPrePicked = prePickedRef.current;
    prePickedRef.current = false;
    const t = setTimeout(() => {
      doLookup(data.phone, { silentMissing: true, silentFound: wasPrePicked });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.phone]);

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
      // Next step: the IMEI "Identify Device" screen when enabled, otherwise
      // straight to the manual device picker (see IDENTIFY_DEVICE_ENABLED above).
      navigation.replace(
        IDENTIFY_DEVICE_ENABLED ? 'IdentifyDevice' : 'ChooseDevice',
        { customerId: resolved.id, customer: resolved },
      );
    } catch (e) {
      notify('Error', e?.message || 'Failed to save customer');
    } finally { setSaving(false); }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Branded header — elevated white back button + soft green flourish, per design */}
      <View
        style={{ paddingTop: insets.top + 10 }}
        className="bg-card px-4 pb-4 relative overflow-hidden"
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -46, right: -34, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(8, 122, 10, 0.10)' }}
        />
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="h-11 w-11 items-center justify-center rounded-2xl bg-card active:opacity-70"
            style={{ shadowColor: '#172117', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
          >
            <ChevronLeft size={22} color="#087A0A" />
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

        {/* Personal info */}
        <View className="bg-card border border-border rounded-3xl p-3.5 mb-3" style={cardShadow}>
          <View className="flex-row items-center mb-2.5">
            <View className="h-9 w-9 rounded-full bg-success/10 items-center justify-center mr-2.5">
              <UserPlus size={17} color="#087A0A" />
            </View>
            <Text className="text-[15px] font-extrabold text-text">Personal Info</Text>
          </View>

          <Field label="Customer Name" required>
            <FormTextInput icon={USER_ICON} placeholder="Enter customer name" value={data.name} onChangeText={onName} className={INPUT_CLS} style={INPUT_STYLE} cursorColor="#087A0A" autoCapitalize="words" />
          </Field>

          <Field label="Mobile Number" required>
            <View className="flex-row">
              <Pressable className="bg-card border border-border rounded-2xl px-3 py-2.5 mr-2 flex-row items-center">
                <Text className="text-[16px] mr-1">🇮🇳</Text>
                <Text className="text-[15px] text-text font-semibold mr-1">+91</Text>
                <ChevronDown size={14} color="#667066" />
              </Pressable>
              <View className="flex-1 relative">
                <Input
                  className={`${INPUT_CLS} pr-9`}
                  placeholder="10-digit number"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={data.phone}
                  onChangeText={onPhone}
                  style={INPUT_STYLE}
                  cursorColor="#087A0A"
                />
                <Pressable
                  onPress={() => doLookup(data.phone)}
                  className="absolute right-2 top-0 bottom-0 items-center justify-center px-1"
                  hitSlop={6}
                >
                  {lookupLoading ? (
                    <ActivityIndicator size="small" color="#087A0A" />
                  ) : existing ? (
                    <CheckCircle2 size={18} color="#16BB05" />
                  ) : (
                    <Search size={18} color="#667066" />
                  )}
                </Pressable>
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
            <FormTextInput icon={MAIL_ICON} placeholder="email@example.com" autoCapitalize="none" keyboardType="email-address" value={data.email} onChangeText={onEmail} className={INPUT_CLS} style={INPUT_STYLE} cursorColor="#087A0A" />
          </Field>
        </View>

        {/* Address */}
        <View className="bg-card border border-border rounded-3xl p-3.5 mb-3" style={cardShadow}>
          <View className="flex-row items-center mb-2.5">
            <View className="h-9 w-9 rounded-full bg-primary/10 items-center justify-center mr-2.5">
              <MapPin size={17} color="#087A0A" />
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
                <FormTextInput placeholder="Area" value={data.area} onChangeText={onArea} className={INPUT_CLS} style={INPUT_STYLE} cursorColor="#087A0A" />
              </Field>
            </View>
          </View>

          <View className="flex-row -mx-1.5">
            <View className="px-1.5 flex-1">
              <Field label="Door no. / Street" half className="mb-0">
                <FormTextInput placeholder="Door No. / Street" value={data.addressLine} onChangeText={onAddressLine} className={INPUT_CLS} style={INPUT_STYLE} cursorColor="#087A0A" />
              </Field>
            </View>
            <View className="px-1.5 flex-1">
              <Field label="Pin Code" half className="mb-0">
                <FormTextInput placeholder="Pincode" keyboardType="number-pad" maxLength={6} value={data.pincode} onChangeText={onPincode} className={INPUT_CLS} style={INPUT_STYLE} cursorColor="#087A0A" />
              </Field>
            </View>
          </View>
        </View>

        {/* Upload ID Proof */}
        {idProofUploading ? (
          <View className="border border-dashed border-primary/40 bg-primary/5 rounded-3xl py-4 items-center mb-3">
            <ActivityIndicator color="#087A0A" />
            <Text className="text-primary font-semibold text-[13px] mt-2">Uploading…</Text>
          </View>
        ) : idProofUrl ? (
          <View className="border border-primary/30 bg-primary/5 rounded-3xl p-3.5 mb-3 flex-row items-center">
            <Image source={{ uri: idProofUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} resizeMode="cover" />
            <View className="flex-1 ml-3">
              <Text className="text-[14px] font-extrabold text-text">ID Proof uploaded</Text>
              <Pressable onPress={promptPickIdProof} hitSlop={6}>
                <Text className="text-[12px] text-primary font-semibold mt-0.5">Replace</Text>
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
            className="border border-dashed border-primary/40 bg-primary/5 rounded-3xl py-4 items-center active:opacity-80 mb-3"
          >
            <View className="h-11 w-11 rounded-full bg-primary/10 items-center justify-center">
              <UploadCloud size={20} color="#087A0A" />
            </View>
            <Text className="text-primary font-extrabold text-[14px] mt-1.5">Upload ID Proof</Text>
            <Text className="text-[11px] text-text-muted mt-0.5">Optional · Max 1MB</Text>
          </Pressable>
        )}

        <Button onPress={save} loading={saving} fullWidth size="lg" leftIcon={<Save size={18} color="#fff" />}>
          Save & Continue
        </Button>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
