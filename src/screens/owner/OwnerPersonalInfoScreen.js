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

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';        // Deep Green
const PRIMARY = '#006B57';       // Hero Dark Green
const BRIGHT = '#00A86B';        // Bright Green
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT = '#111827';
const MUTED = '#667085';
const SUCCESS = '#16A34A';

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Real "member since" derived from the active shop's own createdAt (the same
// field OwnerShopInfoScreen already reads off session.activeShop) — a month +
// year label, and a rough duration string. Never fabricated: returns null
// when the shop carries no createdAt, and the caller hides the block then.
function memberSinceOf(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const months = Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const years = Math.floor(months / 12);
  const duration = years >= 1
    ? `${years}+ year${years > 1 ? 's' : ''}`
    : months >= 1
      ? `${Math.floor(months)}+ month${Math.floor(months) > 1 ? 's' : ''}`
      : 'New';
  return { label, duration };
}

export default function OwnerPersonalInfoScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopSlug, setShopSlug] = useState('');
  const [shopSince, setShopSince] = useState(null);
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
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 900) : undefined;
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
        if (s?.shopSlug) setShopSlug(s.shopSlug);
        if (s?.activeShop?.createdAt) setShopSince(s.activeShop.createdAt);
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
  const memberSince = useMemo(() => memberSinceOf(shopSince), [shopSince]);

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

  // Every "Edit" affordance on this screen (hero, Personal Details, Contact
  // Numbers) opens the SAME single edit mode / SAME single Save action —
  // there's no per-field editor on the backend, so three separate save flows
  // would just be three copies of one PATCH and a real risk of drift. This
  // keeps the reference's three entry points without duplicating that logic.
  const openEdit = () => setIsEditing(true);

  return (
    <View style={styles.root}>
      {/* Hero header — decorative leaf shapes behind the title block, same
          low-risk plain-View approximation used elsewhere in this app (no new
          SVG dependency). Sized to its own content only; the profile card
          below sits in normal flow with a plain positive margin, never a
          negative one, so it can never render underneath the header. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: PRIMARY }}>
        <LinearGradient
          colors={[PRIMARY, ACCENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View pointerEvents="none" style={{ position: 'absolute', top: -rs(20), right: -rs(30), height: rs(130), width: rs(130), borderRadius: rs(65), backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -rs(40), right: rs(40), height: rs(90), width: rs(90), borderRadius: rs(45), backgroundColor: 'rgba(255,255,255,0.05)' }} />

          <View style={[styles.heroTopRow, capStyle]}>
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={({ pressed }) => [styles.heroBackBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={rf(19)} color="#FFFFFF" />
            </Pressable>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {isEditing ? 'Edit Personal Information' : 'Personal Information'}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                {isEditing ? 'Update your profile details' : 'View and manage your profile details'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.heroKickerPill}>
                <Ionicons name="shield-checkmark" size={rf(12)} color={ACCENT} />
                <Text style={styles.heroKicker}>OWNER</Text>
              </View>
              <View style={{ marginTop: rs(8), alignItems: 'flex-end' }}>
                <Text style={styles.heroBrandLine}>MANAGE</Text>
                <Text style={styles.heroBrandLine}>SECURE</Text>
                <Text style={styles.heroBrandLine}>STAY CONNECTED</Text>
              </View>
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
          {/* Profile summary card */}
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
                <Pressable
                  onPress={pickAvatar}
                  disabled={uploadingAvatar}
                  style={styles.avatarEditBtn}
                  hitSlop={8}
                >
                  <Ionicons name="camera" size={rf(12)} color="#fff" />
                </Pressable>
              </View>

              <View style={styles.identityText}>
                <Text style={styles.name} numberOfLines={1}>
                  {fullName || 'Shop Owner'}
                </Text>
                {shopName ? (
                  <View style={styles.shopRow}>
                    <Ionicons name="storefront-outline" size={rf(12)} color={MUTED} />
                    <Text style={styles.shopName} numberOfLines={1}>
                      {shopName}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.verifiedPill}>
                  <Ionicons name="shield-checkmark" size={rf(11)} color={SUCCESS} />
                  <Text style={styles.verifiedText}>Verified Owner</Text>
                </View>
              </View>

              {!isEditing ? (
                <Pressable
                  onPress={openEdit}
                  style={({ pressed }) => [styles.editPillBtn, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="pencil" size={rf(13)} color={ACCENT} />
                  <Text style={styles.editPillText}>Edit Profile</Text>
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
                  <Ionicons name="camera-outline" size={rf(18)} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.changePhotoTitle}>Change Profile Photo</Text>
                  <Text style={styles.changePhotoSub}>JPG, PNG up to 5 MB</Text>
                </View>
              </Pressable>
            ) : null}

            {/* Account Type / Shop / Member Since — real data only. Member
                Since is dropped (not faked) when the active shop carries no
                createdAt. */}
            <View style={styles.metaDivider} />
            <View style={styles.metaRow}>
              <MetaBlock icon="ribbon-outline" label="ACCOUNT TYPE" value="Owner" />
              <View style={styles.metaVDivider} />
              <MetaBlock icon="storefront-outline" label="SHOP" value={shopName || '—'} sub={shopSlug ? `#${shopSlug.toUpperCase()}` : null} />
              {memberSince ? (
                <>
                  <View style={styles.metaVDivider} />
                  <MetaBlock icon="calendar-outline" label="MEMBER SINCE" value={memberSince.label} sub={memberSince.duration} />
                </>
              ) : null}
            </View>
          </View>

          {/* Personal Details */}
          <View style={[styles.card, capStyle]}>
            <SectionHeader
              icon="person-outline"
              title="Personal Details"
              subtitle={isEditing ? 'Keep your information up to date' : 'Your basic account information'}
              onEdit={!isEditing ? openEdit : null}
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
                  <DetailRow icon="person-outline" label="Full Name" value={fullName || '—'} />
                  <DetailRow icon="mail-outline" label="Email Address" value={email || '—'} last />
                </>
              )}
            </View>
          </View>

          {/* Contact Numbers */}
          <View style={[styles.card, capStyle]}>
            <SectionHeader
              icon="call-outline"
              title="Contact Numbers"
              subtitle={isEditing ? 'Add or update your contact number(s)' : 'Phone numbers for service updates'}
              onEdit={!isEditing ? openEdit : null}
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
                    label="Mobile Number (WhatsApp)"
                    value={mobile ? `+91 ${mobile}` : '—'}
                    trailing={<Ionicons name="logo-whatsapp" size={rf(16)} color="#25D366" style={{ marginLeft: rs(8) }} />}
                  />
                  <DetailRow
                    icon="add-outline"
                    label="Additional Number"
                    value={additional ? `+91 ${additional}` : 'Not added'}
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
              <Ionicons name="shield-checkmark" size={rf(18)} color={ACCENT} />
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
                  colors={savedFlash ? [SUCCESS, SUCCESS] : [PRIMARY, ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.button}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : savedFlash ? (
                    <Animated.View style={[styles.buttonInner, { opacity: flashOpacity }]}>
                      <Ionicons name="checkmark-circle" size={rf(18)} color="#fff" />
                      <Text style={styles.buttonText}>Updated</Text>
                    </Animated.View>
                  ) : (
                    <View style={styles.buttonInner}>
                      <Ionicons name="save-outline" size={rf(18)} color="#fff" />
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

// Shared card header — icon chip + title(+subtitle), with an optional
// standalone-mint "Edit" button on the right (View Mode only).
function SectionHeader({ icon, title, subtitle, onEdit }) {
  return (
    <View style={styles.cardHeaderRow}>
      <View style={styles.cardHeaderIconWrap}>
        <Ionicons name={icon} size={rf(16)} color={ACCENT} />
      </View>
      <View style={styles.cardHeaderTextWrap}>
        <Text style={styles.cardHeaderTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardHeaderHelper} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.headerEditBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="pencil" size={rf(12)} color={ACCENT} />
          <Text style={styles.headerEditText}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// One meta block (Account Type / Shop / Member Since) — equal-flex column
// with a mint icon tile, uppercase muted label, and a bold value(+sub).
function MetaBlock({ icon, label, value, sub }) {
  return (
    <View style={styles.metaBlock}>
      <View style={styles.metaIconWrap}>
        <Ionicons name={icon} size={rf(15)} color={ACCENT} />
      </View>
      <Text style={styles.metaLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.metaSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

// View Mode — a compact read-only label/value row with a hairline divider
// between rows (skipped on `last`).
function DetailRow({ icon, label, value, muted, trailing, last }) {
  return (
    <View>
      <View style={styles.viewRow}>
        <View style={styles.viewRowLeft}>
          {icon ? (
            <View style={styles.viewRowIconWrap}>
              <Ionicons name={icon} size={rf(14)} color={ACCENT} />
            </View>
          ) : null}
          <Text style={styles.viewRowLabel} numberOfLines={1}>{label}</Text>
        </View>
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
            <Ionicons name={icon} size={rf(15)} color={iconColor || ACCENT} />
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
          <Ionicons name={icon} size={rf(15)} color={iconColor || ACCENT} />
        </View>
        <View style={styles.phoneCodeWrap}>
          <Text style={styles.phoneCodeText}>+91</Text>
          <Ionicons name="chevron-down" size={rf(12)} color={MUTED} />
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
  root: { flex: 1, backgroundColor: PAGE_BG },

  // Hero header
  hero: {
    paddingHorizontal: rs(16),
    paddingTop: rs(8),
    paddingBottom: rs(16),
    borderBottomLeftRadius: rs(26),
    borderBottomRightRadius: rs(26),
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroBackBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginRight: rs(10),
  },
  heroTitleWrap: { flex: 1, marginRight: rs(8), paddingTop: rs(4) },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: rf(20),
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: rf(11.5),
    fontWeight: '500',
    marginTop: rs(3),
  },
  heroKickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(12),
    paddingVertical: rs(7),
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  heroKicker: {
    color: ACCENT,
    fontSize: rf(10.5),
    fontWeight: '800',
    letterSpacing: 0.7,
    marginLeft: rs(5),
  },
  heroBrandLine: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: rf(8),
    fontWeight: '800',
    letterSpacing: 1,
  },

  content: {
    paddingHorizontal: rs(14),
    paddingTop: rs(12),
    paddingBottom: rs(90),
  },

  // Profile summary card — plain flow, plain positive spacing above/below.
  identityCard: {
    backgroundColor: CARD_BG,
    borderRadius: rs(22),
    padding: rs(12),
    marginBottom: rs(12),
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#0B1F14',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
    width: rs(58),
    height: rs(58),
    borderRadius: rs(29),
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: MINT,
  },
  avatarImage: { width: rs(52), height: rs(52) },
  avatarText: { color: '#fff', fontSize: rf(23), fontWeight: '800', letterSpacing: 1 },
  avatarEditBtn: {
    position: 'absolute',
    right: -rs(2),
    bottom: -rs(2),
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  name: { fontSize: rf(19), fontWeight: '800', color: TEXT },
  shopRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(4) },
  shopName: { fontSize: rf(12.5), color: MUTED, marginLeft: rs(5), fontWeight: '600' },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MINT,
    paddingHorizontal: rs(9),
    paddingVertical: rs(4),
    borderRadius: 999,
    marginTop: rs(7),
  },
  verifiedText: {
    fontSize: rf(10),
    color: ACCENT,
    fontWeight: '800',
    marginLeft: rs(4),
  },
  editPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT,
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
    borderRadius: rs(14),
  },
  editPillText: { fontSize: rf(11.5), fontWeight: '800', color: ACCENT, marginLeft: rs(5) },

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
  changePhotoTitle: { fontSize: rf(13), fontWeight: '700', color: ACCENT },
  changePhotoSub: { fontSize: rf(10.5), color: MUTED, marginTop: rs(1) },

  // Account Type / Shop / Member Since meta row
  metaDivider: { height: 1, backgroundColor: BORDER, marginTop: rs(14), marginBottom: rs(12) },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start' },
  metaBlock: { flex: 1, alignItems: 'flex-start' },
  metaIconWrap: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginBottom: rs(6),
  },
  metaLabel: { fontSize: rf(9), fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  metaValue: { fontSize: rf(13.5), fontWeight: '800', color: TEXT, marginTop: rs(2) },
  metaSub: { fontSize: rf(9.5), fontWeight: '600', color: MUTED, marginTop: rs(1) },
  metaVDivider: { width: 1, alignSelf: 'stretch', backgroundColor: BORDER, marginHorizontal: rs(8) },

  // Form cards — shared header row (icon + title[/subtitle]) + optional Edit
  card: {
    backgroundColor: CARD_BG,
    borderRadius: rs(20),
    paddingHorizontal: rs(13),
    paddingVertical: rs(11),
    marginBottom: rs(12),
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#0B1F14',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  cardHeaderIconWrap: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(13),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MINT,
    marginRight: rs(11),
  },
  cardHeaderTextWrap: { flex: 1 },
  cardHeaderTitle: { fontSize: rf(16), fontWeight: '800', color: TEXT },
  cardHeaderHelper: { fontSize: rf(11), color: MUTED, fontWeight: '500', marginTop: rs(2) },
  cardBody: { marginTop: rs(13) },
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRIGHT,
    backgroundColor: MINT,
    paddingHorizontal: rs(10),
    paddingVertical: rs(7),
    borderRadius: rs(12),
  },
  headerEditText: { fontSize: rf(11), fontWeight: '800', color: ACCENT, marginLeft: rs(4) },

  // View Mode rows — soft inner panel per the reference, each row's own icon
  // tile on the left, value right-aligned.
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rs(12),
    paddingHorizontal: rs(4),
  },
  viewRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: rs(8) },
  viewRowIconWrap: {
    width: rs(28), height: rs(28), borderRadius: rs(14),
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: rs(9),
  },
  viewRowLabel: { fontSize: rf(13), color: MUTED, fontWeight: '600', flexShrink: 1 },
  viewRowValueWrap: { flexDirection: 'row', alignItems: 'center' },
  viewRowValue: { fontSize: rf(14.5), color: TEXT, fontWeight: '700' },
  viewRowValueMuted: { color: MUTED, fontWeight: '600' },
  viewRowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: rs(4) },
  dash: { fontSize: rf(14), color: MUTED, fontWeight: '700', marginLeft: rs(8) },

  // Edit Mode fields
  field: { marginBottom: rs(14) },
  fieldLast: { marginBottom: 0 },
  label: { fontSize: rf(11), color: MUTED, fontWeight: '700', marginBottom: rs(6), letterSpacing: 0.3 },
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
    backgroundColor: SOFT_MINT,
    borderRadius: rs(20),
    borderWidth: 1,
    borderColor: BORDER,
  },
  privacyIconWrap: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rs(11),
  },
  privacyHeading: { fontSize: rf(13), color: ACCENT, fontWeight: '800' },
  privacyText: { fontSize: rf(11), color: MUTED, marginTop: rs(3), lineHeight: rf(15.5), fontWeight: '500' },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(10),
    backgroundColor: CARD_BG,
    borderRadius: rs(14),
    paddingVertical: rs(12),
    borderWidth: 1,
    borderColor: BORDER,
  },
  loadingText: { color: MUTED, marginLeft: rs(8), fontSize: rf(11) },

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
  buttonText: { fontSize: rf(15), fontWeight: '800', color: '#FFFFFF', marginLeft: rs(8), letterSpacing: 0.3 },
});
