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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { getSession } from '../../auth/session';
import { fetchMe, updateOwnerProfile } from '../../api/auth';
import { uploadMedia } from '../../api/masterData';
import { notify } from '../../components/confirm';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// Swiggy / Zomato green palette — same as the rest of the owner-side flows.
// Constant names left as PRIMARY etc. so the rest of the file keeps reading
// naturally; only the hex values are swapped.
const PRIMARY = '#087A0A';        // BRAND_GREEN_DARK
const PRIMARY_MID = '#087A0A';    // ACCENT_GREEN
const PRIMARY_LIGHT = '#16BB05';  // BRAND_GREEN
const SUCCESS = '#087A0A';
const TEXT = '#172117';
const MUTED = '#667066';
const BORDER = '#E2E8E2';
const BG = '#F0F8EF';
const PRIMARY_SOFT = '#E6F7E3';

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

  // View / Edit mode — purely a UI state, doesn't touch any profile data.
  const [isEditing, setIsEditing] = useState(false);

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  const r = useResponsive();
  // Tablet/iPad: cap the column and centre it so a form doesn't stretch
  // edge-to-edge. Phones keep contentW undefined and are unaffected.
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 740) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  return (
    <View style={styles.root}>
      {/* Compact gradient header — sized to its own content (back button +
          title/subtitle + OWNER badge) only. The profile card below sits in
          normal document flow with a plain positive margin, never a negative
          one, so there is no way for it to render underneath the header. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: PRIMARY }}>
        <LinearGradient
          colors={[PRIMARY_LIGHT, PRIMARY]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={[styles.heroTopRow, capStyle]}>
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={({ pressed }) => [styles.heroBackBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {isEditing ? 'Edit Personal Information' : 'Personal Information'}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                {isEditing ? 'Update your profile details' : 'View your profile details'}
              </Text>
            </View>
            <View style={styles.heroKickerPill}>
              <Ionicons name="shield-checkmark" size={11} color="#FFFFFF" />
              <Text style={styles.heroKicker}>OWNER</Text>
            </View>
          </View>
        </LinearGradient>
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
          {/* Profile summary card — normal flow, plain positive margin below
              the header. Never overlaps it. */}
          <View style={[styles.identityCard, capStyle]}>
            <View style={styles.identityTopRow}>
              <View style={styles.avatarWrap}>
                <Pressable
                  onPress={pickAvatar}
                  disabled={uploadingAvatar}
                  style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.85 }]}
                >
                  {uploadingAvatar ? (
                    <ActivityIndicator color="#fff" />
                  ) : avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </Pressable>
                {isEditing ? (
                  <Pressable
                    onPress={pickAvatar}
                    disabled={uploadingAvatar}
                    style={styles.avatarEditBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="camera" size={11} color="#fff" />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.identityText}>
                <Text style={styles.name} numberOfLines={1}>
                  {fullName || 'Shop Owner'}
                </Text>
                <View style={styles.shopRow}>
                  <Ionicons name="storefront-outline" size={12} color={MUTED} />
                  <Text style={styles.shopName} numberOfLines={1}>
                    {shopName}
                  </Text>
                </View>
                <View style={styles.verifiedPill}>
                  <Ionicons name="shield-checkmark" size={10} color={SUCCESS} />
                  <Text style={styles.verifiedText}>Verified Owner</Text>
                </View>
              </View>

              {!isEditing ? (
                <Pressable
                  onPress={() => setIsEditing(true)}
                  style={({ pressed }) => [styles.editPillBtn, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="pencil" size={13} color={PRIMARY} />
                  <Text style={styles.editPillText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>

            {isEditing ? (
              <Pressable
                onPress={pickAvatar}
                disabled={uploadingAvatar}
                style={({ pressed }) => [styles.changePhotoBtn, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.changePhotoIconWrap}>
                  <Ionicons name="camera-outline" size={18} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.changePhotoTitle}>Change Profile Photo</Text>
                  <Text style={styles.changePhotoSub}>JPG, PNG up to 5 MB</Text>
                </View>
              </Pressable>
            ) : null}
          </View>

          {/* Personal Details */}
          <View style={[styles.card, capStyle]}>
            <SectionHeader
              icon="person-outline"
              title="Personal Details"
              subtitle={isEditing ? 'Keep your information up to date' : null}
            />

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
                  <DetailRow label="Full Name" value={fullName || '—'} />
                  <DetailRow label="Email Address" value={email || '—'} last />
                </>
              )}
            </View>
          </View>

          {/* Contact Numbers */}
          <View style={[styles.card, capStyle]}>
            <SectionHeader
              icon="call-outline"
              title="Contact Numbers"
              subtitle={isEditing ? 'Add or update your contact number(s)' : null}
            />

            <View style={styles.cardBody}>
              {isEditing ? (
                <>
                  <PhoneField
                    icon="logo-whatsapp"
                    iconColor="#25D366"
                    label="Mobile Number (WhatsApp)"
                    value={mobile}
                    onChangeText={onChangeMobile}
                    placeholder="Mobile number"
                    keyboardType="phone-pad"
                  />
                  <PhoneField
                    icon="call-outline"
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
                    label="Mobile Number (WhatsApp)"
                    value={mobile ? `+91  ${mobile}` : '—'}
                    trailing={<Ionicons name="logo-whatsapp" size={16} color="#25D366" style={{ marginLeft: rs(8) }} />}
                  />
                  <DetailRow
                    label="Additional Number"
                    value={additional ? `+91  ${additional}` : 'Not added'}
                    muted={!additional}
                    trailing={!additional ? <Text style={styles.dash}>—</Text> : null}
                    last
                  />
                </>
              )}
            </View>
          </View>

          {/* Privacy / information note */}
          <View style={[styles.privacyCard, capStyle]}>
            <View style={styles.privacyIconWrap}>
              <Ionicons name="lock-closed" size={16} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyHeading}>Your information is safe with us</Text>
              <Text style={styles.privacyText}>
                Your contact details stay private and are only used for service updates.
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={[styles.loadingRow, capStyle]}>
              <ActivityIndicator color={PRIMARY} />
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
                  colors={
                    savedFlash
                      ? [SUCCESS, '#087A0A']
                      : [PRIMARY, PRIMARY_MID, PRIMARY_LIGHT]
                  }
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

// Shared card header — icon chip + title, with an optional subtitle (Edit
// Mode only; View Mode intentionally has no section description).
function SectionHeader({ icon, title, subtitle }) {
  return (
    <View style={styles.cardHeaderRow}>
      <View style={styles.cardHeaderIconWrap}>
        <Ionicons name={icon} size={16} color={PRIMARY} />
      </View>
      <View style={styles.cardHeaderTextWrap}>
        <Text style={styles.cardHeaderTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardHeaderHelper} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// View Mode — a compact read-only label/value row with a hairline divider
// between rows (skipped on `last`).
function DetailRow({ label, value, muted, trailing, last }) {
  return (
    <View>
      <View style={styles.viewRow}>
        <Text style={styles.viewRowLabel} numberOfLines={1}>{label}</Text>
        <View style={styles.viewRowValueWrap}>
          <Text style={[styles.viewRowValue, muted && styles.viewRowValueMuted]} numberOfLines={1}>
            {value}
          </Text>
          {trailing}
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
            <Ionicons name={icon} size={15} color={iconColor || PRIMARY} />
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          placeholderTextColor="#8FA08F"
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
          <Ionicons name={icon} size={15} color={iconColor || PRIMARY} />
        </View>
        <View style={styles.phoneCodeWrap}>
          <Text style={styles.phoneCodeText}>+91</Text>
          <Ionicons name="chevron-down" size={12} color={MUTED} />
        </View>
        <TextInput
          style={styles.input}
          placeholderTextColor="#8FA08F"
          {...inputProps}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Compact gradient header
  hero: {
    paddingHorizontal: rs(20),
    paddingTop: rs(10),
    paddingBottom: rs(18),
    borderBottomLeftRadius: rs(28),
    borderBottomRightRadius: rs(28),
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroBackBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginRight: rs(12),
  },
  heroTitleWrap: { flex: 1, marginRight: rs(8) },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: rf(17),
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: rf(11.5),
    fontWeight: '500',
    marginTop: rs(2),
  },
  heroKickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroKicker: {
    color: '#FFFFFF',
    fontSize: rf(10.5),
    fontWeight: '800',
    letterSpacing: 0.7,
    marginLeft: rs(4),
  },

  content: {
    paddingHorizontal: rs(18),
    paddingTop: rs(16),
    paddingBottom: rs(100),
  },

  // Profile summary card — plain flow, plain positive spacing above/below.
  identityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(24),
    padding: rs(16),
    marginBottom: rs(16),
    shadowColor: '#172117',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
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
  avatarWrap: {},
  avatar: {
    width: rs(66),
    height: rs(66),
    borderRadius: rs(33),
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: PRIMARY,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarImage: { width: rs(60), height: rs(60) },
  avatarText: { color: '#fff', fontSize: rf(23), fontWeight: '800', letterSpacing: 1 },
  avatarEditBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  name: { fontSize: rf(16.5), fontWeight: '800', color: TEXT },
  shopRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(4) },
  shopName: { fontSize: rf(12), color: MUTED, marginLeft: rs(4), fontWeight: '600' },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: PRIMARY_SOFT,
    paddingHorizontal: rs(8),
    paddingVertical: rs(3),
    borderRadius: 999,
    marginTop: rs(6),
  },
  verifiedText: {
    fontSize: rf(9.5),
    color: PRIMARY,
    fontWeight: '800',
    marginLeft: rs(3),
  },
  editPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_SOFT,
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: rs(14),
  },
  editPillText: { fontSize: rf(12.5), fontWeight: '800', color: PRIMARY, marginLeft: rs(5) },

  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: rs(14),
    backgroundColor: PRIMARY_SOFT,
    borderWidth: 1,
    borderColor: PRIMARY_LIGHT,
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
  changePhotoTitle: { fontSize: rf(13), fontWeight: '700', color: PRIMARY },
  changePhotoSub: { fontSize: rf(10.5), color: MUTED, marginTop: rs(1) },

  // Form cards — shared header row (icon + title[/subtitle in Edit Mode])
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(22),
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
    marginBottom: rs(16),
    shadowColor: '#172117',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  cardHeaderIconWrap: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_SOFT,
    marginRight: rs(10),
  },
  cardHeaderTextWrap: { flex: 1 },
  cardHeaderTitle: { fontSize: rf(15.5), fontWeight: '800', color: TEXT },
  cardHeaderHelper: { fontSize: rf(11.5), color: MUTED, fontWeight: '500', marginTop: rs(2) },
  cardBody: { marginTop: rs(12) },

  // View Mode rows
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rs(11),
  },
  viewRowLabel: { fontSize: rf(12.5), color: MUTED, fontWeight: '600', flex: 1, marginRight: rs(8) },
  viewRowValueWrap: { flexDirection: 'row', alignItems: 'center' },
  viewRowValue: { fontSize: rf(13.5), color: TEXT, fontWeight: '700' },
  viewRowValueMuted: { color: MUTED, fontWeight: '600' },
  viewRowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  dash: { fontSize: rf(14), color: MUTED, fontWeight: '700', marginLeft: rs(8) },

  // Edit Mode fields
  field: { marginBottom: rs(14) },
  fieldLast: { marginBottom: 0 },
  label: { fontSize: rf(11), color: MUTED, fontWeight: '700', marginBottom: rs(6), letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAF7',
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
    backgroundColor: PRIMARY_SOFT,
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
  phoneCodeText: { fontSize: rf(13), color: TEXT, fontWeight: '700', marginRight: rs(3) },
  input: {
    flex: 1,
    paddingVertical: rs(8),
    fontSize: rf(14),
    color: TEXT,
    fontWeight: '600',
  },

  // Privacy / information card
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(14),
    paddingVertical: rs(14),
    marginBottom: rs(14),
    backgroundColor: PRIMARY_SOFT,
    borderRadius: rs(20),
  },
  privacyIconWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(17),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rs(10),
  },
  privacyHeading: { fontSize: rf(12.5), color: PRIMARY, fontWeight: '700' },
  privacyText: { fontSize: rf(11), color: MUTED, marginTop: rs(3), lineHeight: rf(15.5), fontWeight: '500' },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(10),
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    shadowColor: '#172117',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  loadingText: { color: MUTED, marginLeft: rs(8), fontSize: rf(11) },

  // Sticky save bar
  saveBarSafe: { backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  saveBar: { paddingHorizontal: rs(18), paddingTop: rs(10), paddingBottom: rs(6) },
  buttonShadow: {
    borderRadius: 999,
    shadowColor: PRIMARY,
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
  buttonText: { fontSize: rf(15), fontWeight: '800', color: '#FFFFFF', marginLeft: rs(8), letterSpacing: 0.3 },
});
