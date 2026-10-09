import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { getSession } from '../../auth/session';
import { fetchMe, updateOwnerProfile } from '../../api/auth';
import { uploadMedia } from '../../api/masterData';
import { getOwnerKycDocuments } from '../../api/shops';
import { notify } from '../../components/confirm';
import { rs } from '../../utils/responsive';
import { T } from '../../components/dashboard/theme';
import { useResponsive } from '../../theme/responsive';

// Same green + white palette as My Account, so the two screens read as one.
const G = '#09AD2A';             // Primary green
const G_DEEP = '#07921F';        // Pressed / gradient end
const ACCENT = G;
const BRIGHT = G;
const MINT = '#EAF8EC';          // Very light green (icon tiles, pills)
const SOFT_MINT = '#F6FBF7';     // Input / note panels
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#ECECEC';
const TEXT = '#1E1E1E';
const MUTED = '#6B6B6B';
const SUCCESS = G;
// Header colours — taken from the Buy / Sell / Booking headers.
const HEADER_BORDER = '#DCE7E2';
const HEADER_TEXT = '#111827';

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function OwnerPersonalInfoScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [shopName, setShopName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [additional, setAdditional] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  // Same rule as My Account: "Verified" only once the owner's KYC is APPROVED.
  const [isVerified, setIsVerified] = useState(false);

  // View / Edit mode — purely a UI state, doesn't touch any profile data.
  const [isEditing, setIsEditing] = useState(false);

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  const r = useResponsive();
  // Tablet/iPad: cap the column and centre it so a form doesn't stretch
  // edge-to-edge. Phones keep contentW undefined and are unaffected.
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 900) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  // Avatar scales with the device class: smaller on small phones, larger on tablets.
  const avatarSize = r.isTablet ? rs(76) : r.isSmallPhone ? rs(52) : rs(60);
  const avatarBox = { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 };
  // Explicit pixel size for the photo (circle minus its 3px border each side) —
  // Android's Image renders nothing, or at the photo's own size, without it.
  const photoSize = avatarSize - 6;
  const photoBox = { width: photoSize, height: photoSize, borderRadius: photoSize / 2 };

  // Guards so the async /auth/me fetch doesn't clobber whatever the user has
  // already typed. Without these the network response would overwrite the
  // controlled `value` mid-typing and reset the TextInput cursor — what the
  // user described as the "auto loop moving cursor" bug.
  const hydratedRef = useRef(false);
  const dirtyRef = useRef({
    fullName: false,
    email: false,
    mobile: false,
    additional: false,
  });

  useEffect(() => {
    let cancelled = false;
    getOwnerKycDocuments()
      .then((kyc) => { if (!cancelled) setIsVerified(kyc?.status === 'APPROVED'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Pull live data from /auth/me so the form reflects what's actually in
    // Postgres, not a snapshot from login time. The dirty-flag guards skip
    // any field the user has already started editing.
    if (hydratedRef.current) return;
    (async () => {
      const apply = (s) => {
        if (s?.name && !dirtyRef.current.fullName) setFullName(s.name);
        if (s?.email && !dirtyRef.current.email) setEmail(s.email);
        if (s?.phone && !dirtyRef.current.mobile) setMobile(s.phone);
        // Hydrate the secondary number too. Without this the field always loaded
        // blank and handleSave then sent secondaryMobile: null, wiping any saved
        // value on every routine profile edit.
        if (s?.secondaryMobile && !dirtyRef.current.additional) setAdditional(s.secondaryMobile);
        if (s?.shopName) setShopName(s.shopName);
        if (s?.avatarUrl) setAvatarUrl(s.avatarUrl);
      };
      try {
        apply(await fetchMe());
      } catch {
        apply(await getSession());
      } finally {
        hydratedRef.current = true;
        setLoading(false);
      }
    })();
  }, []);

  // Stable per-field change handlers — flip the dirty flag on first keystroke
  // so the (possibly still-running) /auth/me call won't overwrite this value.
  const onChangeFullName = useCallback((v) => { dirtyRef.current.fullName = true; setFullName(v); }, []);
  const onChangeEmail    = useCallback((v) => { dirtyRef.current.email = true; setEmail(v); }, []);
  const onChangeMobile   = useCallback((v) => { dirtyRef.current.mobile = true; setMobile(v); }, []);
  const onChangeAdditional = useCallback((v) => { dirtyRef.current.additional = true; setAdditional(v); }, []);

  const initials = useMemo(() => initialsOf(fullName), [fullName]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', 'Allow media library access to update your photo.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingAvatar(true);
      const url = await uploadMedia(result.assets[0], 'avatars');
      if (!url) throw new Error('Upload returned no URL');
      setAvatarUrl(url);
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Basic client-side validation so bad values don't reach the server (and the
  // user gets an immediate, specific message).
  const validate = () => {
    if (!fullName.trim()) return 'Name is required.';
    const e = email.trim();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Enter a valid email address.';
    const m = mobile.replace(/\D/g, '');
    if (m && m.length !== 10) return 'Mobile number must be 10 digits.';
    const a = additional.replace(/\D/g, '');
    if (a && a.length !== 10) return 'Additional number must be 10 digits.';
    return null;
  };

  const runSavedFlash = () => {
    setSaving(false);
    setSavedFlash(true);
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(flashOpacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setSavedFlash(false);
      // Land back on View Mode with the just-saved values already in state —
      // no navigation away, per the View/Edit flow this screen now has.
      setIsEditing(false);
    });
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { notify('Check details', err); return; }
    setSaving(true);
    try {
      const sess = await getSession();
      const ownerId = sess?.userId || sess?.id;
      if (!ownerId) throw new Error('Could not resolve your account.');
      await updateOwnerProfile(ownerId, {
        name: fullName.trim(),
        email: email.trim() || null,
        phone: mobile.replace(/\D/g, '') || null,
        secondaryMobile: additional.replace(/\D/g, '') || null,
        avatarUrl: avatarUrl || null,
      });
      // Refresh the persisted session so other screens reflect the new values.
      try { await fetchMe(); } catch (_) {}
      runSavedFlash();
    } catch (e) {
      setSaving(false);
      notify('Save failed', e?.message || 'Could not update your profile. Try again.', { preset: 'error', haptic: 'error' });
    }
  };

  const handleBack = () => {
    // Edit Mode's back arrow returns to View Mode first; only a second press
    // (now that isEditing is false) actually leaves the screen.
    if (isEditing) { setIsEditing(false); return; }
    if (navigation.canGoBack()) navigation.goBack();
  };

  // The header pencil is the only way into Edit Mode.
  const openEdit = () => setIsEditing(true);

  return (
    <View style={styles.root}>
      {/* Header — same pattern as the Buy / Sell / Booking screens: white bar
          with a bottom border, round back button, centred title + subtitle,
          round action button on the right (Edit in View Mode). */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={styles.hero}>
          <View style={[styles.heroTopRow, capStyle]}>
            <Pressable
              onPress={handleBack}
              hitSlop={8}
              style={({ pressed }) => [styles.heroIconBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={19} color={HEADER_TEXT} />
            </Pressable>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {isEditing ? 'Edit Personal Info' : 'Personal Information'}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                {isEditing ? 'Update your profile details' : 'View and manage your profile details'}
              </Text>
            </View>
            {!isEditing ? (
              <Pressable
                onPress={openEdit}
                hitSlop={8}
                style={({ pressed }) => [styles.heroIconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="pencil" size={16} color={G} />
              </Pressable>
            ) : (
              <View style={{ width: rs(36) }} />
            )}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? rs(8) : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile summary — white block (avatar, name, shop, verified). */}
          <View style={[styles.identity, capStyle]}>
            <View style={styles.identityTopRow}>
              <View style={avatarBox}>
                <Pressable
                  onPress={pickAvatar}
                  disabled={uploadingAvatar}
                  style={({ pressed }) => [styles.avatar, avatarBox, pressed && { opacity: 0.85 }]}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={photoBox} resizeMode="cover" />
                  ) : null}
                  {uploadingAvatar ? (
                    <View style={[styles.avatarSpinner, photoBox]}>
                      <ActivityIndicator color={G} />
                    </View>
                  ) : avatarUrl ? null : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.identityText}>
                <Text style={styles.name} numberOfLines={1}>
                  {fullName || 'Shop Owner'}
                </Text>
                {shopName ? (
                  <View style={styles.shopRow}>
                    <Ionicons name="storefront-outline" size={12} color={MUTED} />
                    <Text style={styles.shopName} numberOfLines={1}>
                      {shopName}
                    </Text>
                  </View>
                ) : null}
                {isVerified ? (
                  <View style={styles.verifiedPill}>
                    <Ionicons name="shield-checkmark" size={10} color={SUCCESS} />
                    <Text style={styles.verifiedText}>Verified Owner</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {isEditing ? (
              <Pressable
                onPress={pickAvatar}
                disabled={uploadingAvatar}
                style={({ pressed }) => [styles.changePhotoBtn, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.changePhotoIconWrap}>
                  <Ionicons name="camera-outline" size={18} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.changePhotoTitle}>Change Profile Photo</Text>
                  <Text style={styles.changePhotoSub}>JPG, PNG up to 5 MB</Text>
                </View>
              </Pressable>
            ) : null}
          </View>

          {/* ONE card for all the details — Personal Details and Contact
              Numbers are groups inside it, split by a divider. */}
          <View style={[styles.card, capStyle]}>
            <SectionHeader title="Personal Details" />

            <View style={styles.cardBody}>
              {isEditing ? (
                <>
                  <Field
                    icon="person-outline"
                    label="Full Name"
                    value={fullName}
                    onChangeText={onChangeFullName}
                    placeholder="Enter your full name"
                  />
                  <Field
                    icon="mail-outline"
                    label="Email Address"
                    value={email}
                    onChangeText={onChangeEmail}
                    placeholder="name@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    last
                  />
                </>
              ) : (
                <>
                  <DetailRow icon="person-outline" label="Full Name" value={fullName || '—'} />
                  <DetailRow icon="mail-outline" label="Email Address" value={email || '—'} last />
                </>
              )}
            </View>

            <View style={styles.groupDivider} />
            <SectionHeader title="Contact Numbers" />

            <View style={styles.cardBody}>
              {isEditing ? (
                <>
                  <PhoneField
                    icon="call-outline"
                    label="Mobile Number"
                    value={mobile}
                    onChangeText={onChangeMobile}
                    placeholder="Mobile number"
                    keyboardType="phone-pad"
                  />
                  <PhoneField
                    icon="add-outline"
                    label="Additional Number (Optional)"
                    value={additional}
                    onChangeText={onChangeAdditional}
                    placeholder="Enter additional number"
                    keyboardType="phone-pad"
                    last
                  />
                </>
              ) : (
                <>
                  <DetailRow
                    icon="call-outline"
                    label="Mobile Number"
                    value={mobile ? `+91 ${mobile}` : '—'}
                  />
                  <DetailRow
                    icon="add-outline"
                    label="Additional Number"
                    value={additional ? `+91 ${additional}` : 'Not added'}
                    muted={!additional}
                    last
                  />
                </>
              )}
            </View>
          </View>

          {/* Privacy note — plain text line, not another card. */}
          <View style={[styles.privacyNote, capStyle]}>
            <Ionicons name="shield-checkmark" size={14} color={ACCENT} />
            <Text style={styles.privacyText}>
              Your contact details stay private and are only used for service updates.
            </Text>
          </View>

          {loading ? (
            <View style={[styles.loadingRow, capStyle]}>
              <ActivityIndicator color={ACCENT} />
              <Text style={styles.loadingText}>Loading profile…</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky save bar — Edit Mode only */}
        {isEditing ? (
          <SafeAreaView edges={['bottom']} style={styles.saveBarSafe}>
            <View style={[styles.saveBar, capStyle]}>
              <Pressable
                style={({ pressed }) => [
                  styles.buttonShadow,
                  (saving || loading) && { opacity: 0.7 },
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
                disabled={saving || loading || savedFlash}
                onPress={handleSave}
              >
                <LinearGradient
                  colors={savedFlash ? [SUCCESS, SUCCESS] : [G, G_DEEP]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.button}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : savedFlash ? (
                    <Animated.View style={[styles.buttonInner, { opacity: flashOpacity }]}>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.buttonText}>Updated</Text>
                    </Animated.View>
                  ) : (
                    <View style={styles.buttonInner}>
                      <Ionicons name="save-outline" size={18} color="#fff" />
                      <Text style={styles.buttonText}>Save Changes</Text>
                    </View>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

// Group label inside the details card.
function SectionHeader({ title }) {
  return <Text style={styles.groupLabel}>{title}</Text>;
}

// View Mode — a compact read-only label/value row with a hairline divider
// between rows (skipped on `last`).
function DetailRow({ icon, label, value, muted, last }) {
  return (
    <View>
      <View style={styles.viewRow}>
        {icon ? (
          <View style={styles.viewRowIconWrap}>
            <Ionicons name={icon} size={16} color={ACCENT} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.viewRowLabel} numberOfLines={1}>{label}</Text>
          <Text style={[styles.viewRowValue, muted && styles.viewRowValueMuted]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
      {!last ? <View style={styles.viewRowDivider} /> : null}
    </View>
  );
}

// Edit Mode — plain text field. No local focus state, no React.memo trick:
// each TextInput owns its own native cursor and nothing here reacts to focus
// changes, so the cursor never gets pulled into a different field.
function Field({ icon, iconColor, label, last, ...inputProps }) {
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        {icon ? (
          <View style={styles.inputIconWrap}>
            <Ionicons name={icon} size={15} color={iconColor || ACCENT} />
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          placeholderTextColor="#9A9A9A"
          {...inputProps}
        />
      </View>
    </View>
  );
}

// Edit Mode — phone field: icon chip, a static "+91" country code (with a
// purely decorative chevron — there is no country list to open), a divider,
// then the number itself.
function PhoneField({ icon, iconColor, label, last, ...inputProps }) {
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <View style={styles.inputIconWrap}>
          <Ionicons name={icon} size={15} color={iconColor || ACCENT} />
        </View>
        <View style={styles.phoneCodeWrap}>
          <Text style={styles.phoneCodeText}>+91</Text>
          <Ionicons name="chevron-down" size={12} color={MUTED} />
        </View>
        <TextInput
          style={styles.input}
          placeholderTextColor="#9A9A9A"
          {...inputProps}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },

  // Header (Buy / Sell / Booking pattern)
  hero: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: rs(16),
    paddingTop: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: 1,
    borderBottomColor: HEADER_BORDER,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4FBF8',
    borderWidth: 1,
    borderColor: HEADER_BORDER,
  },
  heroTitleWrap: { flex: 1, alignItems: 'center', marginHorizontal: rs(8) },
  heroTitle: {
    color: HEADER_TEXT,
    fontSize: T.headline,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: '#667085',
    fontSize: T.caption2,
    marginTop: rs(2),
  },

  content: {
    paddingHorizontal: rs(16),
    paddingTop: rs(12),
    paddingBottom: rs(90),
  },

  // Profile summary — white block, no border, same look as the details card.
  identity: {
    backgroundColor: CARD_BG,
    borderRadius: rs(18),
    paddingHorizontal: rs(14),
    paddingVertical: rs(14),
    marginBottom: rs(12),
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    marginLeft: rs(14),
    justifyContent: 'center',
  },
  avatar: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: MINT,
  },
  avatarSpinner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  avatarText: { color: G, fontSize: T.title3, fontWeight: '800', letterSpacing: 1 },
  name: { fontSize: T.headline, fontWeight: '700', color: TEXT },
  shopRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(4) },
  shopName: { fontSize: T.caption1, color: MUTED, marginLeft: rs(5), fontWeight: '500' },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MINT,
    paddingHorizontal: rs(9),
    paddingVertical: rs(3),
    borderRadius: 999,
    marginTop: rs(6),
  },
  verifiedText: {
    fontSize: T.caption2,
    color: ACCENT,
    fontWeight: '700',
    marginLeft: rs(4),
  },

  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: rs(14),
    backgroundColor: MINT,
    borderWidth: 1,
    borderColor: BRIGHT,
    borderRadius: rs(16),
    paddingHorizontal: rs(14),
    paddingVertical: rs(12),
  },
  changePhotoIconWrap: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: rs(10),
  },
  changePhotoTitle: { fontSize: T.footnote, fontWeight: '700', color: ACCENT },
  changePhotoSub: { fontSize: T.caption2, color: MUTED, marginTop: rs(1) },

  // The one details card, with group labels inside.
  card: {
    backgroundColor: CARD_BG,
    borderRadius: rs(18),
    paddingHorizontal: rs(14),
    paddingVertical: rs(12),
    marginBottom: rs(12),
  },
  cardBody: { marginTop: rs(4) },
  groupLabel: { fontSize: T.caption2, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  groupDivider: { height: 1, backgroundColor: BORDER, marginVertical: rs(10) },

  // View Mode rows — icon tile, small label above its value (stacked, so a
  // long label never truncates the value beside it).
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(10),
  },
  viewRowIconWrap: {
    width: rs(34), height: rs(34), borderRadius: rs(10),
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: rs(12),
  },
  viewRowLabel: { fontSize: T.caption2, color: MUTED, fontWeight: '500' },
  viewRowValue: { fontSize: T.footnote, color: TEXT, fontWeight: '600', marginTop: rs(2) },
  viewRowValueMuted: { color: MUTED, fontWeight: '500' },
  viewRowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginLeft: rs(46) },

  // Edit Mode fields
  field: { marginBottom: rs(14) },
  fieldLast: { marginBottom: 0 },
  label: { fontSize: T.caption2, color: MUTED, fontWeight: '700', marginBottom: rs(6), letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOFT_MINT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: rs(14),
    paddingHorizontal: rs(8),
    minHeight: rs(52),
  },
  inputIconWrap: {
    width: rs(30),
    height: rs(30),
    borderRadius: rs(11),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MINT,
    marginRight: rs(8),
  },
  phoneCodeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: rs(8),
    marginRight: rs(8),
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: BORDER,
  },
  phoneCodeText: { fontSize: T.footnote, color: TEXT, fontWeight: '700', marginRight: rs(3) },
  input: {
    flex: 1,
    paddingVertical: rs(8),
    fontSize: T.footnote,
    color: TEXT,
    fontWeight: '600',
  },

  // Privacy note
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(6),
    marginBottom: rs(14),
  },
  privacyText: { flex: 1, fontSize: T.caption2, color: MUTED, marginLeft: rs(6), lineHeight: 16, fontWeight: '500' },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(10),
    paddingVertical: rs(12),
  },
  loadingText: { color: MUTED, marginLeft: rs(8), fontSize: T.caption2 },

  // Sticky save bar
  saveBarSafe: { backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  saveBar: { paddingHorizontal: rs(18), paddingTop: rs(10), paddingBottom: rs(6) },
  buttonShadow: {
    borderRadius: 999,
    shadowColor: ACCENT,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: rs(14),
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center' },
  buttonText: { fontSize: T.subhead, fontWeight: '800', color: '#FFFFFF', marginLeft: rs(8), letterSpacing: 0.3 },
});
