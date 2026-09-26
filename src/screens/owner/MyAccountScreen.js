import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  User,
  QrCode,
  Store,
  FileText,
  Truck,
  ShoppingBag,
  Camera,
  Users,
  CalendarClock,
  BadgeCheck,
  Phone,
  Mail,
  ArrowLeftRight,
  X,
  Check,
  ChevronRight,
  ScrollText,
  HelpCircle,
  Headphones,
  LogOut,
  Crown,
  ShieldCheck,
  Fingerprint,
  Plus,
} from 'lucide-react-native';
import { getSession } from '../../auth/session';
import { switchShop, fetchMe } from '../../api/auth';
import {
  FEATURE,
  canAddShop as canAddShopOnPlan,
  fetchEntitlements,
} from '../../subscription/entitlements';
import { showLimitPopup } from '../../subscription/limitPopup';
import { getOwnerKycDocuments } from '../../api/shops';
import { isAppLockEnabled, setAppLockEnabled, isDeviceSecure, authenticate } from '../../auth/appLock';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';       // Dark Green
const PRIMARY = '#006B57';      // Primary Green
const BRIGHT = '#00A86B';       // Bright Green
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const DANGER = '#DC2626';
const ICON_STROKE = 2; // ONE weight for every icon on the screen.

// Icon-tile colour tones. One small named palette, assigned once per row
// below, so a call site picks a NAME instead of inventing a bg/fg pair —
// matches the reference design's colour-coded categories (KYC purple, pickup
// orange, team pink, …) while staying centralised the same way the old
// single-tint system was.
const TONE = {
  green:  { bg: MINT,          fg: ACCENT },
  amber:  { bg: '#FDF0DC',     fg: '#B45309' },
  blue:   { bg: '#E7F0FF',     fg: '#2563EB' },
  purple: { bg: '#F1EBFF',     fg: '#9333EA' },
  orange: { bg: '#FFEADC',     fg: '#F59E0B' },
  pink:   { bg: '#FDE7EF',     fg: '#DB2777' },
};

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MyAccountScreen({ onLogout, navigation }) {
  const [user, setUser] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  // null = unknown (haven't checked yet); true/false once we know.
  const [hasKycDocs, setHasKycDocs] = useState(null);
  // Same rule as the Home header: the only reviewed, admin-approved signal
  // is the owner's KYC status, which is owner-wide (not per-shop).
  const [kycStatus, setKycStatus] = useState(null);

  // The app's single responsive system (see theme/responsive.js). Tablets get
  // a capped, centred column so this settings list doesn't stretch edge to
  // edge — the same rule OwnerPersonalInfoScreen applies to its form.
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 920) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

  const reloadSession = async () => {
    // Prefer live /auth/me so the screen reflects DB state (shopName, shops,
    // phone, avatar...) — heals old sessions taken before LoginResponse grew.
    try {
      const me = await fetchMe();
      setUser(me);
    } catch {
      try { setUser(await getSession()); } catch { setUser(null); }
    }
  };

  // Reload identity on every focus, not just mount — returning from editing
  // name/phone/avatar in OwnerPersonalInfo (a separate stack screen) otherwise
  // left this always-mounted tab showing the old values.
  useFocusEffect(useCallback(() => { reloadSession(); }, []));

  // Refresh KYC submission status whenever this screen comes into focus, so the
  // KYC Documents row can route the user to View (already uploaded) vs Intro
  // (first time) without a manual reload.
  useFocusEffect(
    useCallback(() => {
      const sid = user?.shopId;
      if (!sid) return;
      let cancelled = false;
      (async () => {
        try {
          const kyc = await getOwnerKycDocuments();
          if (!cancelled) {
            setHasKycDocs(!!(kyc && (kyc.aadharFrontUrl || kyc.aadharBackUrl || kyc.panUrl)));
            setKycStatus(kyc?.status || null);
          }
        } catch {
          if (!cancelled) {
            setHasKycDocs(false);
            setKycStatus(null);
          }
        }
      })();
      return () => { cancelled = true; };
    }, [user?.shopId])
  );

  // Shop-mobile logins (loginScope=SHOP / loginType=SHOP_LOGIN) are scoped to a
  // single shop. The account screen then surfaces the SHOP (front image, name,
  // mobile) instead of the owner, hides owner-only rows, and drops the switcher.
  const isShopLogin = user?.loginScope === 'SHOP' || user?.loginType === 'SHOP_LOGIN';
  const activeShopObj = user?.activeShop || user?.shops?.find?.((s) => s.isActive) || null;

  const ownerName = user?.name || 'Shop Owner';
  const shopName = user?.shopName || activeShopObj?.name || '';
  const shopSlug = activeShopObj?.slug || '';
  const shopMobile = activeShopObj?.mobile || activeShopObj?.mobilePrimary || activeShopObj?.phone || '';
  const shopFrontImage = activeShopObj?.frontImageUrl || '';

  const displayName = isShopLogin ? (shopName || 'Your Shop') : ownerName;
  const displayPhone = isShopLogin ? shopMobile : (user?.phone || '');
  // Owner-only — a shop-scoped login has no personal inbox to show here.
  const displayEmail = isShopLogin ? '' : (user?.email || '');
  // Falls back to the shop's front image, same as the Home header — an owner
  // who hasn't set a personal photo was showing a blank avatar here while
  // Home showed the shop image, which read as a broken image on this screen.
  const displayAvatar = isShopLogin ? shopFrontImage : (user?.avatarUrl || shopFrontImage);
  const isVerified = kycStatus === 'APPROVED';

  const shops = user?.shops || [];
  // Shop-scoped sessions can't switch shops — the JWT is locked to one shop.
  const hasMultipleShops = !isShopLogin && shops.length > 1;
  // Only a true owner-wide session may add another business location — same
  // rule the home screen's Switch Account sheet uses.
  const canAddShop = !isShopLogin && (user?.roles || []).includes('SHOP_OWNER');
  // An owner with a single shop still needs a way in here: the sheet is where
  // Add Shop lives, so it opens whenever there is either a shop to switch to
  // or a shop to add.
  const canOpenSwitcher = !isShopLogin && (hasMultipleShops || canAddShop);
  const initials = useMemo(() => initialsOf(displayName), [displayName]);

  // The brand's small uppercase kicker above the page title — the active
  // shop's own name (real data), not a fixed brand string.
  const brandKicker = (shopName || 'GGFIX').toUpperCase();

  /**
   * Same plan gate the home screen applies: at the subscription's shop ceiling
   * the form must not open. Checked against a freshly fetched allowance, and
   * the server enforces it again on POST .../locations either way.
   */
  const handleAddShop = async () => {
    const ent = await fetchEntitlements().catch(() => null);
    if (ent && !canAddShopOnPlan(ent)) {
      setShowSwitcher(false);
      await showLimitPopup(navigation, FEATURE.SHOPS, ent);
      return;
    }
    setShowSwitcher(false);
    navigation?.navigate?.('OwnerShopInfo', { mode: 'create' });
  };

  const handleSwitch = async (shopId) => {
    if (!shopId || shopId === user?.shopId) { setShowSwitcher(false); return; }
    setSwitching(true);
    try {
      await switchShop(shopId);
      await reloadSession();
      setShowSwitcher(false);
    } catch (e) {
      setShowSwitcher(false);
    } finally {
      setSwitching(false);
    }
  };

  // "My Profile" — the 6 rows the reference screenshot shows (fewer for a
  // shop-scoped login, which has no personal identity or KYC of its own).
  // Built as data, not inline JSX conditionals, so the rendered rows and the
  // "N Options" pill count can never drift apart.
  const profileRows = [
    !isShopLogin && {
      key: 'personal',
      tone: 'green',
      Icon: User,
      label: 'Personal Information',
      sub: 'Name, mobile, email',
      onPress: () => navigation?.navigate?.('OwnerPersonalInfo'),
    },
    {
      key: 'subscription',
      tone: 'amber',
      Icon: Crown,
      label: 'Subscription',
      sub: isShopLogin ? 'View current plan' : 'View your plan & upgrade',
      onPress: () => navigation?.navigate?.('OwnerSubscription'),
    },
    {
      key: 'qr',
      tone: 'blue',
      Icon: QrCode,
      label: 'My QR Code',
      sub: 'Share your shop instantly',
      onPress: () => navigation?.navigate?.('OwnerQrCode'),
    },
    {
      key: 'shop',
      tone: 'green',
      Icon: Store,
      label: 'Shop Information',
      sub: 'Address, opening hours, GST',
      onPress: () => navigation?.navigate?.('OwnerShopInfo'),
    },
    !isShopLogin && {
      key: 'kyc',
      tone: 'purple',
      Icon: FileText,
      label: 'KYC Documents',
      sub: 'Aadhar, PAN, GST / Udyam',
      onPress: () => navigation?.navigate?.(hasKycDocs ? 'OwnerKycView' : 'OwnerKycIntro'),
    },
    {
      key: 'pickup',
      tone: 'orange',
      Icon: Truck,
      label: 'Pickup Service',
      sub: 'Turn pickup on/off, slot timings & zones',
      onPress: () => navigation?.navigate?.('OwnerPickupSlots'),
    },
  ].filter(Boolean);

  // A second, un-numbered group for the rows the reference doesn't picture —
  // kept exactly as they were (same routes, same visibility rule: always
  // shown regardless of login type), just moved out of the "6 Options" count
  // so that pill stays accurate to what the reference actually shows.
  const moreToolsRows = [
    {
      key: 'orders',
      tone: 'blue',
      Icon: ShoppingBag,
      label: 'My Orders',
      sub: 'View your orders & history',
      onPress: () => navigation?.navigate?.('MarketplaceOrders'),
    },
    {
      key: 'employees',
      tone: 'pink',
      Icon: Users,
      label: 'Employee Management',
      sub: 'Add, edit & track your team',
      onPress: () => navigation?.navigate?.('OwnerEmployeeList'),
    },
    {
      key: 'leave',
      tone: 'green',
      Icon: CalendarClock,
      label: 'Leave Requests',
      sub: 'Approve or reject leave',
      onPress: () => navigation?.navigate?.('OwnerLeaveRequests'),
    },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      <SafeAreaView edges={['top']} style={{ backgroundColor: PAGE_BG }}>
        {/* Header — decorative mint leaf shapes behind the title block, same
            low-risk plain-View approximation used elsewhere in this app (no
            new SVG dependency). */}
        <View style={{ paddingHorizontal: rs(16), paddingTop: rs(5), paddingBottom: rs(6), overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: -rs(30), right: -rs(20), height: rs(140), width: rs(140), borderRadius: rs(70), backgroundColor: MINT, opacity: 0.6 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: rs(30), right: rs(30), height: rs(70), width: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT, opacity: 0.8 }} />

          <View style={capStyle}>
            <View className="flex-row items-start justify-between">
              <View style={{ flex: 1 }}>
                <Text className="uppercase font-extrabold" style={{ fontSize: rf(10.5), letterSpacing: 1.4, color: BRIGHT }} numberOfLines={1}>
                  {brandKicker}
                </Text>
                <Text className="font-extrabold" style={{ fontSize: rf(28), color: ACCENT, marginTop: rs(2) }} numberOfLines={1}>
                  My Account
                </Text>
                <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
                  Manage your profile, shop and preferences
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <View
                  className="flex-row items-center rounded-full"
                  style={{ paddingHorizontal: rs(12), paddingVertical: rs(7), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, ...softShadow }}
                >
                  {isShopLogin
                    ? <Store size={rf(12)} color={ACCENT} strokeWidth={ICON_STROKE} />
                    : <Crown size={rf(12)} color={ACCENT} strokeWidth={ICON_STROKE} />}
                  <Text className="font-extrabold" style={{ fontSize: rf(10.5), color: ACCENT, marginLeft: rs(5), letterSpacing: 0.5 }}>
                    {isShopLogin ? 'SHOP' : 'OWNER'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={capStyle}>
        {/* Identity card */}
        <View
          style={{ backgroundColor: CARD_BG, borderRadius: rs(18), padding: rs(9), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
        >
          <Pressable
            onPress={() => navigation?.navigate?.(isShopLogin ? 'OwnerShopInfo' : 'OwnerPersonalInfo')}
            className="flex-row items-center"
            hitSlop={4}
          >
            <View style={{ position: 'relative' }}>
              <View
                style={{
                  padding: 2,
                  borderRadius: rs(31),
                  backgroundColor: '#FFFFFF',
                  borderWidth: 2,
                  borderColor: MINT,
                }}
              >
                <View
                  style={{
                    width: rs(50), height: rs(50), borderRadius: rs(25),
                    backgroundColor: ACCENT,
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {displayAvatar ? (
                    <Image
                      source={{ uri: displayAvatar }}
                      style={{ width: rs(50), height: rs(50), borderRadius: rs(25) }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text className="text-white font-extrabold" style={{ fontSize: rf(16.5), letterSpacing: 1 }}>
                      {initials}
                    </Text>
                  )}
                </View>
              </View>
              {/* Camera badge — the whole row now navigates to profile/photo
                  editing, this is just the visual affordance for it. */}
              <View
                style={{
                  position: 'absolute', right: -rs(1), bottom: -rs(1),
                  width: rs(18), height: rs(18), borderRadius: rs(9),
                  backgroundColor: ACCENT,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#FFFFFF',
                }}
              >
                <Camera size={rf(9)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
              </View>
            </View>
            <View className="flex-1 ml-3">
              <View className="flex-row items-center flex-wrap">
                <Text className="font-extrabold mr-2" style={{ fontSize: rf(16), color: TEXT_PRIMARY }} numberOfLines={1}>
                  {displayName}
                </Text>
                {isVerified ? (
                  <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(6), paddingVertical: rs(2), backgroundColor: MINT }}>
                    <BadgeCheck size={rf(10)} color={ACCENT} strokeWidth={ICON_STROKE} />
                    <Text className="font-extrabold" style={{ fontSize: rf(8.5), color: ACCENT, marginLeft: rs(2), letterSpacing: 0.4 }}>
                      VERIFIED
                    </Text>
                  </View>
                ) : null}
              </View>
              {displayPhone ? (
                <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                  <Phone size={rf(10)} color={TEXT_SECONDARY} strokeWidth={ICON_STROKE} />
                  <Text className="font-semibold" style={{ fontSize: rf(11), color: TEXT_SECONDARY, marginLeft: rs(4) }} numberOfLines={1}>
                    {displayPhone}
                  </Text>
                </View>
              ) : null}
              {displayEmail ? (
                <View className="flex-row items-center" style={{ marginTop: rs(1) }}>
                  <Mail size={rf(10)} color={TEXT_SECONDARY} strokeWidth={ICON_STROKE} />
                  <Text className="font-semibold" style={{ fontSize: rf(11), color: TEXT_SECONDARY, marginLeft: rs(4) }} numberOfLines={1}>
                    {displayEmail}
                  </Text>
                </View>
              ) : null}
            </View>
            <ChevronRight size={rf(17)} color={TEXT_SECONDARY} strokeWidth={ICON_STROKE} />
          </Pressable>

          {/* Active shop card — hidden for shop-scoped logins (single shop) */}
          {!isShopLogin ? (
          <Pressable
            onPress={() => canOpenSwitcher && setShowSwitcher(true)}
            disabled={!canOpenSwitcher}
            className="flex-row items-center"
            hitSlop={4}
            style={{
              marginTop: rs(7), borderRadius: rs(14), padding: rs(7),
              backgroundColor: canOpenSwitcher ? MINT : SOFT_MINT,
              borderWidth: 1,
              borderColor: canOpenSwitcher ? BRIGHT : BORDER,
            }}
          >
            <View
              style={{
                width: rs(32), height: rs(32), borderRadius: rs(10),
                backgroundColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
                marginRight: rs(8),
              }}
            >
              <Store size={rf(14)} color={ACCENT} strokeWidth={ICON_STROKE} />
            </View>
            <View className="flex-1">
              <Text className="font-extrabold" style={{ fontSize: rf(9), color: PRIMARY, letterSpacing: 1 }}>
                ACTIVE SHOP
              </Text>
              <Text className="font-extrabold" style={{ fontSize: rf(13.5), color: TEXT_PRIMARY, marginTop: 0 }} numberOfLines={1}>
                {shopName || 'No shop linked'}
              </Text>
              {shopSlug ? (
                <Text className="font-semibold" style={{ fontSize: rf(10), color: TEXT_SECONDARY, marginTop: 0 }} numberOfLines={1}>
                  Shop ID: #{shopSlug.toUpperCase()}
                </Text>
              ) : null}
            </View>
            {hasMultipleShops ? (
              <View
                className="flex-row items-center rounded-full"
                style={{ paddingHorizontal: rs(11), paddingVertical: rs(6), backgroundColor: ACCENT, ...cardShadow, shadowOpacity: 0.18 }}
              >
                <ArrowLeftRight size={rf(11)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                <Text className="text-white font-extrabold" style={{ fontSize: rf(11), marginLeft: rs(5) }}>
                  Switch ({shops.length})
                </Text>
              </View>
            ) : canAddShop ? (
              // One shop and nothing to switch between — the pill still opens
              // the sheet, so it advertises what it actually does from here.
              <View
                className="flex-row items-center rounded-full"
                style={{ paddingHorizontal: rs(11), paddingVertical: rs(6), backgroundColor: ACCENT }}
              >
                <Plus size={rf(11)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                <Text className="text-white font-extrabold" style={{ fontSize: rf(11), marginLeft: rs(5) }}>
                  Add Shop
                </Text>
              </View>
            ) : null}
          </Pressable>
          ) : null}
        </View>

        {/* My Profile group — the reference's 6 (or fewer, for a shop login)
            core rows, each its own standalone premium card. */}
        <SectionLabel subtitle="Manage your personal and shop details" count={profileRows.length} countIcon={User}>
          My Profile
        </SectionLabel>
        {profileRows.map(({ key, ...row }, i) => (
          <MenuRow key={key} {...row} last={i === profileRows.length - 1} standalone />
        ))}

        {/* More tools — same rows as before, just no longer counted in the
            "My Profile" pill above so that count stays true to what the
            reference actually shows. */}
        <SectionLabel subtitle="Orders, team and time off">More Tools</SectionLabel>
        {moreToolsRows.map(({ key, ...row }, i) => (
          <MenuRow key={key} {...row} last={i === moreToolsRows.length - 1} standalone />
        ))}

        {/* Security group */}
        <SectionLabel subtitle="Keep your account safe and secure">Security</SectionLabel>
        <View style={{ backgroundColor: CARD_BG, borderRadius: rs(14), paddingHorizontal: rs(12), borderWidth: 1, borderColor: BORDER, ...softShadow, marginBottom: rs(8) }}>
          <AppLockRow />
        </View>

        {/* More group */}
        <SectionLabel subtitle="Legal, support and other information">More</SectionLabel>
        <MenuRow tone="blue" Icon={ScrollText} label="Terms & Conditions" sub="Platform usage rules" standalone />
        <MenuRow tone="green" Icon={ShieldCheck} label="Privacy Policy" sub="How we handle your data" standalone />
        <MenuRow tone="purple" Icon={HelpCircle} label="FAQs" sub="Common questions answered" standalone />
        <MenuRow tone="orange" Icon={Headphones} label="Help & Support" sub="Talk to the GGfix team" last standalone />

        {/* Logout */}
        {onLogout ? (
          <Pressable
            onPress={onLogout}
            className="flex-row items-center justify-center"
            hitSlop={4}
            style={{
              marginTop: rs(3), borderRadius: rs(14), paddingVertical: rs(8),
              backgroundColor: '#FDECEE',
              borderWidth: 1,
              borderColor: '#F8C9CF',
            }}
          >
            <LogOut size={rf(16)} color={DANGER} strokeWidth={ICON_STROKE} />
            <Text className="font-extrabold" style={{ fontSize: rf(14), color: DANGER, marginLeft: rs(8) }}>
              Log Out
            </Text>
          </Pressable>
        ) : null}

        {/* Trust footer — reassurance only, no state or navigation. */}
        <View
          className="flex-row items-center"
          style={{ borderRadius: rs(14), marginTop: rs(5), padding: rs(8), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER }}
        >
          <View
            style={{
              width: rs(28), height: rs(28), borderRadius: rs(14),
              backgroundColor: ACCENT,
              alignItems: 'center', justifyContent: 'center',
              marginRight: rs(9),
            }}
          >
            <ShieldCheck size={rf(13)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
          </View>
          <View className="flex-1">
            <Text className="font-extrabold" style={{ fontSize: rf(12), color: ACCENT }}>
              Your data is safe with us
            </Text>
            <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: 0, lineHeight: rf(13) }}>
              We follow industry-standard security practices to protect your information.
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>

      {/* Shop switcher modal */}
      <Modal
        visible={showSwitcher}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSwitcher(false)}
      >
        <Pressable
          onPress={() => setShowSwitcher(false)}
          style={{ flex: 1, backgroundColor: 'rgba(16, 32, 27, 0.55)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 28,
            }}
          >
            <View
              style={{
                alignSelf: 'center', width: 44, height: 5,
                borderRadius: 999, backgroundColor: BORDER,
                marginBottom: 12,
              }}
            />
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[17px] font-extrabold" style={{ color: TEXT_PRIMARY }}>Switch Shop</Text>
              <Pressable
                onPress={() => setShowSwitcher(false)}
                hitSlop={8}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: SOFT_MINT }}
              >
                <X size={14} color={TEXT_PRIMARY} strokeWidth={ICON_STROKE} />
              </Pressable>
            </View>
            <Text className="text-[12px] mb-3" style={{ color: TEXT_SECONDARY }}>
              {canAddShop
                ? 'Choose which of your shops to manage, or add a new one.'
                : 'Choose which of your shops to manage.'}
            </Text>
            {/* Capped and scrollable: the list grows every time Add Shop is
                used, and an un-scrolled sheet pushes the Add Shop row itself
                off the bottom of the screen once an owner has a handful. */}
            <ScrollView
              style={{ maxHeight: 340 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            {shops.map((s) => {
              const active = s.id === user?.shopId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => handleSwitch(s.id)}
                  disabled={switching || active}
                  className="flex-row items-center rounded-2xl border mb-2"
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    backgroundColor: active ? MINT : '#FFFFFF',
                    borderColor: active ? BRIGHT : BORDER,
                  }}
                >
                  <View
                    className="w-9 h-9 rounded-2xl items-center justify-center mr-3"
                    style={{ backgroundColor: active ? ACCENT : MINT }}
                  >
                    <Store size={16} color={active ? '#FFFFFF' : ACCENT} strokeWidth={ICON_STROKE} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-[14px] font-extrabold"
                      style={{ color: active ? ACCENT : TEXT_PRIMARY }}
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                    <Text className="text-[11px] mt-0.5" style={{ color: TEXT_SECONDARY }} numberOfLines={1}>
                      {s.slug}
                    </Text>
                  </View>
                  {active ? (
                    <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: MINT }}>
                      <Check size={16} color={ACCENT} strokeWidth={ICON_STROKE} />
                    </View>
                  ) : (
                    <ChevronRight size={16} color={TEXT_SECONDARY} strokeWidth={ICON_STROKE} />
                  )}
                </Pressable>
              );
            })}
            {/* Add Shop closes the list: it is the one row that doesn't switch
                anything, so it sits below every shop with a dashed border to
                read as an action rather than another shop to pick. */}
            {canAddShop ? (
              <Pressable
                onPress={handleAddShop}
                disabled={switching}
                className="flex-row items-center rounded-2xl border mb-2"
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  backgroundColor: '#FFFFFF',
                  borderColor: BRIGHT,
                  borderStyle: 'dashed',
                  opacity: switching ? 0.5 : 1,
                }}
              >
                <View className="w-9 h-9 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: MINT }}>
                  <Plus size={16} color={ACCENT} strokeWidth={ICON_STROKE} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold" style={{ color: ACCENT }} numberOfLines={1}>
                    Add Shop
                  </Text>
                  <Text className="text-[11px] mt-0.5" style={{ color: TEXT_SECONDARY }} numberOfLines={1}>
                    Open another business location
                  </Text>
                </View>
                <ChevronRight size={16} color={ACCENT} strokeWidth={ICON_STROKE} />
              </Pressable>
            ) : null}
            </ScrollView>
            {switching ? (
              <View className="flex-row items-center justify-center mt-2">
                <ActivityIndicator color={ACCENT} />
                <Text className="ml-2 text-[12px]" style={{ color: TEXT_SECONDARY }}>Switching…</Text>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SectionLabel({ children, subtitle, count, countIcon: CountIcon }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: rs(8), marginBottom: rs(4) }}>
      <View style={{ width: 3, height: rs(16), borderRadius: 2, backgroundColor: BRIGHT, marginRight: rs(7) }} />
      <View style={{ flex: 1 }}>
        <Text className="font-extrabold" style={{ fontSize: rf(14), color: TEXT_PRIMARY }}>{children}</Text>
        {subtitle ? (
          <Text style={{ fontSize: rf(10.5), color: TEXT_SECONDARY, marginTop: 0 }}>{subtitle}</Text>
        ) : null}
      </View>
      {typeof count === 'number' ? (
        <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: MINT }}>
          {CountIcon ? <CountIcon size={rf(11)} color={ACCENT} strokeWidth={ICON_STROKE} /> : null}
          <Text className="font-extrabold" style={{ fontSize: rf(10.5), color: ACCENT, marginLeft: CountIcon ? rs(4) : 0 }}>
            {count} Option{count === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AppLockRow() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { (async () => { setOn(await isAppLockEnabled()); setReady(true); })(); }, []);
  const toggle = async (next) => {
    if (next) {
      if (!(await isDeviceSecure())) {
        Alert.alert('Set a screen lock', 'Add a fingerprint, pattern or PIN in your phone settings first, then turn on App Lock.');
        return;
      }
      if (!(await authenticate())) return;
    }
    await setAppLockEnabled(next);
    setOn(next);
  };
  const tone = TONE.blue;
  return (
    <View className="flex-row items-center" style={{ paddingVertical: rs(5) }}>
      <View
        style={{ height: rs(37), width: rs(37), borderRadius: rs(11), backgroundColor: tone.bg }}
        className="items-center justify-center mr-3"
      >
        <Fingerprint size={rf(18)} color={tone.fg} strokeWidth={ICON_STROKE} />
      </View>
      <View className="flex-1">
        <Text className="font-extrabold" style={{ fontSize: rf(14), color: TEXT_PRIMARY }}>App Lock</Text>
        <Text style={{ fontSize: rf(11), color: TEXT_SECONDARY, marginTop: 0 }}>Require fingerprint / pattern / PIN to open</Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        disabled={!ready}
        trackColor={{ true: PRIMARY, false: BORDER }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

// Each row picks a tone NAME from the shared TONE palette above instead of an
// ad-hoc colour pair, so the colour-coding (green/amber/blue/purple/orange/
// pink) stays centralised and can't drift call-site by call-site.
// `standalone` renders it as its own rounded card with a bottom margin
// (the reference's individual menu-card look); omitting it keeps the old
// grouped-list-row look for anywhere still using it.
function MenuRow({ Icon, label, sub, onPress, last, tone = 'green', standalone }) {
  const t = TONE[tone] || TONE.green;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: SOFT_MINT }}
      className="flex-row items-center"
      hitSlop={4}
      style={
        standalone
          ? {
              backgroundColor: CARD_BG, borderRadius: rs(14), paddingHorizontal: rs(12), paddingVertical: rs(5),
              minHeight: rs(50),
              borderWidth: 1, borderColor: BORDER, marginBottom: last ? 0 : rs(5),
              ...softShadow,
            }
          : {
              paddingVertical: rs(5),
              borderBottomWidth: last ? 0 : 1,
              borderBottomColor: '#EFF5EE',
            }
      }
    >
      <View
        style={{
          width: rs(37), height: rs(37), borderRadius: rs(11),
          backgroundColor: t.bg,
          alignItems: 'center', justifyContent: 'center',
          marginRight: rs(10),
        }}
      >
        <Icon size={rf(18)} color={t.fg} strokeWidth={ICON_STROKE} />
      </View>
      <View className="flex-1">
        <Text className="font-bold" style={{ fontSize: rf(14), color: TEXT_PRIMARY, lineHeight: rf(16.5) }}>{label}</Text>
        {sub ? (
          <Text style={{ fontSize: rf(11), color: TEXT_SECONDARY, marginTop: 0, lineHeight: rf(13.5) }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={rf(16)} color={ACCENT} strokeWidth={ICON_STROKE} />
    </Pressable>
  );
}
