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
import { ion, mci } from '../../components/dashboard/solidIcons';
import { SERIF } from '../../components/dashboard/theme';
import { Ionicons } from '@expo/vector-icons';
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

// My Account palette — green + white only (per the redesign brief).
const G = '#09AD2A';            // Primary green
const G_LIGHT = '#EAF8EC';      // Very light green (icon tiles, badges)
const DARK = '#1E1E1E';         // Dark text
const MUTED = '#6B6B6B';        // Muted dark grey (subtitles)
const LIGHT = '#F3F3F3';        // Secondary light (borders, toggle off)
const BG = '#F8F8F8';           // Page background

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
  green:  { bg: MINT,          fg: ACCENT,    dark: '#16A34A' },
  amber:  { bg: '#FDF0DC',     fg: '#B45309', dark: '#F59E0B' },
  blue:   { bg: '#E7F0FF',     fg: '#2563EB', dark: '#3B82F6' },
  purple: { bg: '#F1EBFF',     fg: '#9333EA', dark: '#A855F7' },
  orange: { bg: '#FFEADC',     fg: '#F59E0B', dark: '#F97316' },
  pink:   { bg: '#FDE7EF',     fg: '#DB2777', dark: '#EC4899' },
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
      Icon: SOLID.personal,
      label: 'Personal Information',
      sub: 'Name, mobile, email',
      onPress: () => navigation?.navigate?.('OwnerPersonalInfo'),
    },
    {
      key: 'subscription',
      tone: 'amber',
      Icon: SOLID.subscription,
      label: 'Subscription',
      sub: isShopLogin ? 'View current plan' : 'View your plan & upgrade',
      onPress: () => navigation?.navigate?.('OwnerSubscription'),
    },
    {
      key: 'qr',
      tone: 'blue',
      Icon: SOLID.qr,
      label: 'My QR Code',
      sub: 'Share your shop instantly',
      onPress: () => navigation?.navigate?.('OwnerQrCode'),
    },
    {
      key: 'shop',
      tone: 'green',
      Icon: SOLID.shop,
      label: 'Shop Information',
      sub: 'Address, opening hours, GST',
      onPress: () => navigation?.navigate?.('OwnerShopInfo'),
    },
    !isShopLogin && {
      key: 'kyc',
      tone: 'purple',
      Icon: SOLID.kyc,
      label: 'KYC Documents',
      sub: 'Aadhar, PAN, GST / Udyam',
      onPress: () => navigation?.navigate?.(hasKycDocs ? 'OwnerKycView' : 'OwnerKycIntro'),
    },
    {
      key: 'pickup',
      tone: 'orange',
      Icon: SOLID.pickup,
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
      Icon: SOLID.orders,
      label: 'My Orders',
      sub: 'View your orders & history',
      onPress: () => navigation?.navigate?.('MarketplaceOrders'),
    },
    {
      key: 'employees',
      tone: 'pink',
      Icon: SOLID.employees,
      label: 'Employee Management',
      sub: 'Add, edit & track your team',
      onPress: () => navigation?.navigate?.('OwnerEmployeeList'),
    },
    {
      key: 'leave',
      tone: 'green',
      Icon: SOLID.leave,
      label: 'Leave Requests',
      sub: 'Approve or reject leave',
      onPress: () => navigation?.navigate?.('OwnerLeaveRequests'),
    },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <SafeAreaView edges={['top']} style={{ backgroundColor: BG }}>
        <View style={{ paddingHorizontal: rs(16), paddingTop: 0, paddingBottom: rs(8) }}>
          <View style={capStyle}>
            <View className="flex-row items-start justify-between">
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: G }} numberOfLines={1}>
                  {brandKicker}
                </Text>
                <Text style={{ fontSize: 25, fontWeight: '700', fontFamily: SERIF, color: DARK, marginTop: rs(2) }} numberOfLines={1}>
                  My Account
                </Text>
                <Text style={{ fontSize: 12, color: MUTED, marginTop: rs(1) }} numberOfLines={1}>
                  Manage your profile, shop and preferences
                </Text>
              </View>
              <View
                className="flex-row items-center rounded-full"
                style={{ paddingHorizontal: rs(11), paddingVertical: rs(6), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: G }}
              >
                {isShopLogin
                  ? <Store size={rf(12)} color={G} strokeWidth={ICON_STROKE} />
                  : <Crown size={rf(12)} color={G} strokeWidth={ICON_STROKE} />}
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: G, marginLeft: rs(5), letterSpacing: 0.5 }}>
                  {isShopLogin ? 'SHOP' : 'OWNER'}
                </Text>
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
        {/* ONE card: profile row, divider, active-shop row — no box inside a box. */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: rs(20), borderWidth: 1, borderColor: LIGHT, ...softShadow }}>
          <View
            className="flex-row items-center"
            style={{ paddingHorizontal: rs(12), paddingVertical: rs(12) }}
          >
            <View style={{ position: 'relative' }}>
              <View
                style={{
                  width: rs(54), height: rs(54), borderRadius: rs(27),
                  backgroundColor: G,
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  borderWidth: 2, borderColor: G_LIGHT,
                }}
              >
                {displayAvatar ? (
                  <Image source={{ uri: displayAvatar }} style={{ width: rs(54), height: rs(54) }} resizeMode="cover" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15.5, letterSpacing: 1 }}>{initials}</Text>
                )}
              </View>
              <View
                style={{
                  position: 'absolute', right: -rs(1), bottom: -rs(1),
                  width: rs(18), height: rs(18), borderRadius: rs(9),
                  backgroundColor: G,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#FFFFFF',
                }}
              >
                <Camera size={rf(9)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
              </View>
            </View>
            <View className="flex-1" style={{ marginLeft: rs(12) }}>
              <View className="flex-row items-center flex-wrap">
                <Text style={{ fontSize: 15, fontWeight: '800', color: DARK, marginRight: rs(6) }} numberOfLines={1}>
                  {displayName}
                </Text>
                {isVerified ? (
                  <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(6), paddingVertical: rs(2), backgroundColor: G_LIGHT }}>
                    <BadgeCheck size={rf(10)} color={G} strokeWidth={ICON_STROKE} />
                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: G, marginLeft: rs(2), letterSpacing: 0.4 }}>VERIFIED</Text>
                  </View>
                ) : null}
              </View>
              {displayPhone ? (
                <View className="flex-row items-center" style={{ marginTop: rs(3) }}>
                  <Phone size={rf(10)} color={MUTED} strokeWidth={ICON_STROKE} />
                  <Text style={{ fontSize: 11.5, color: MUTED, marginLeft: rs(5) }} numberOfLines={1}>{displayPhone}</Text>
                </View>
              ) : null}
              {displayEmail ? (
                <View className="flex-row items-center" style={{ marginTop: rs(1) }}>
                  <Mail size={rf(10)} color={MUTED} strokeWidth={ICON_STROKE} />
                  <Text style={{ fontSize: 11.5, color: MUTED, marginLeft: rs(5) }} numberOfLines={1}>{displayEmail}</Text>
                </View>
              ) : null}
              {!isShopLogin ? (
                <View className="flex-row items-center" style={{ marginTop: rs(5) }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: G }} numberOfLines={1}>
                      {shopName || 'No shop linked'}
                    </Text>
                    {shopSlug ? (
                      <Text style={{ fontSize: 10.5, color: MUTED }} numberOfLines={1}>
                        Shop ID: #{shopSlug.toUpperCase()}
                      </Text>
                    ) : null}
                  </View>
                  {/* Shop icon beside the shop name, "Switch" under it — the card's
                      only tap target; opens Switch Shop. */}
                  {canOpenSwitcher ? (
                    <Pressable
                      onPress={() => setShowSwitcher(true)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Switch shop"
                      style={{ alignItems: 'center', marginLeft: rs(8) }}
                    >
                      <View style={{ width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: G_LIGHT, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="storefront" size={rf(18)} color={G} />
                      </View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: G, marginTop: rs(2) }}>Switch</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

        </View>

        <SectionLabel subtitle="Manage your personal and shop details" count={profileRows.length}>
          My Profile
        </SectionLabel>
        <View style={LIST_STYLE}>
          {profileRows.map(({ key, ...row }, i) => (
            <MenuRow key={key} {...row} last={i === profileRows.length - 1} />
          ))}
        </View>

        <SectionLabel subtitle="Orders, team and time off">More Tools</SectionLabel>
        <View style={LIST_STYLE}>
          {moreToolsRows.map(({ key, ...row }, i) => (
            <MenuRow key={key} {...row} last={i === moreToolsRows.length - 1} />
          ))}
        </View>

        <SectionLabel subtitle="Keep your account safe and secure">Security</SectionLabel>
        <View style={LIST_STYLE}>
          <AppLockRow />
        </View>

        <SectionLabel subtitle="Legal, support and other information">More</SectionLabel>
        <View style={LIST_STYLE}>
          <MenuRow tone="blue" Icon={SOLID.terms} label="Terms & Conditions" sub="Platform usage rules" />
          <MenuRow tone="green" Icon={SOLID.privacy} label="Privacy Policy" sub="How we handle your data" />
          <MenuRow tone="purple" Icon={SOLID.faq} label="FAQs" sub="Common questions answered" />
          <MenuRow tone="orange" Icon={SOLID.support} label="Help & Support" sub="Talk to the GGfix team" last />
        </View>

        {onLogout ? (
          <Pressable
            onPress={onLogout}
            className="flex-row items-center"
            hitSlop={4}
            style={{ ...ROW_STYLE, marginTop: rs(6) }}
          >
            <View style={{ ...ICON_TILE, backgroundColor: '#FDEEEE' }}>
              <LogOut size={rf(18)} color={DANGER} strokeWidth={ICON_STROKE} />
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: DANGER }}>Log Out</Text>
          </Pressable>
        ) : null}

        {/* Trust footer — reassurance only, no state or navigation. */}
        <View className="flex-row items-center" style={{ borderRadius: rs(14), marginTop: rs(8), padding: rs(11), backgroundColor: G_LIGHT }}>
          <ShieldCheck size={rf(16)} color={G} strokeWidth={ICON_STROKE} />
          <Text style={{ flex: 1, fontSize: 11, color: DARK, marginLeft: rs(8), lineHeight: rf(15) }}>
            Your data is safe with us — we follow industry-standard security practices.
          </Text>
        </View>
        </View>
      </ScrollView>

      {/* Switch Shop bottom sheet — real shops from the session, existing switch/add logic. */}
      <Modal visible={showSwitcher} transparent animationType="fade" onRequestClose={() => setShowSwitcher(false)}>
        <Pressable onPress={() => setShowSwitcher(false)} style={{ flex: 1, backgroundColor: 'rgba(16, 24, 20, 0.5)', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 }}
          >
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: LIGHT, marginBottom: 12 }} />
            <View className="flex-row items-center justify-between">
              <Text style={{ fontSize: 17.5, fontWeight: '700', fontFamily: SERIF, color: DARK }}>Switch Shop</Text>
              <Pressable onPress={() => setShowSwitcher(false)} hitSlop={8} className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: LIGHT }}>
                <X size={14} color={DARK} strokeWidth={ICON_STROKE} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 12 }}>Choose the shop you want to manage</Text>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {shops.map((s) => {
                const active = s.id === user?.shopId;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => handleSwitch(s.id)}
                    disabled={switching || active}
                    className="flex-row items-center"
                    style={{ ...ROW_STYLE, borderColor: active ? G : LIGHT, backgroundColor: active ? G_LIGHT : '#FFFFFF' }}
                  >
                    <View style={{ ...ICON_TILE, backgroundColor: active ? G : G_LIGHT }}>
                      <Ionicons name="storefront" size={rf(18)} color={active ? '#FFFFFF' : G} />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontSize: 13, fontWeight: '800', color: DARK }} numberOfLines={1}>{s.name}</Text>
                      {s.slug ? (
                        <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>Shop ID: #{String(s.slug).toUpperCase()}</Text>
                      ) : null}
                    </View>
                    {active ? (
                      <View style={{ backgroundColor: G, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>ACTIVE</Text>
                      </View>
                    ) : (
                      <ChevronRight size={16} color={MUTED} strokeWidth={ICON_STROKE} />
                    )}
                  </Pressable>
                );
              })}
              {canAddShop ? (
                <Pressable
                  onPress={handleAddShop}
                  disabled={switching}
                  className="flex-row items-center justify-center"
                  style={{ marginTop: 4, borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: G, opacity: switching ? 0.5 : 1 }}
                >
                  <Plus size={16} color={G} strokeWidth={ICON_STROKE} />
                  <Text style={{ color: G, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>Add New Shop</Text>
                </Pressable>
              ) : null}
            </ScrollView>
            {switching ? (
              <View className="flex-row items-center justify-center mt-2">
                <ActivityIndicator color={G} />
                <Text className="ml-2 text-[12px]" style={{ color: MUTED }}>Switching…</Text>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// One white list per section; rows inside are flat and divider-separated.
const LIST_STYLE = {
  backgroundColor: '#FFFFFF',
  borderRadius: rs(16),
  borderWidth: 1,
  borderColor: LIGHT,
  paddingHorizontal: rs(12),
};
// Flat list row (reference listing style): no box, thin divider underneath.
const LIST_ROW = {
  minHeight: rs(64),
  paddingVertical: rs(11),
};

// Compact single-line row (Airtel-style list), shared by every list item.
const ROW_STYLE = {
  backgroundColor: '#FFFFFF',
  borderRadius: rs(14),
  borderWidth: 1,
  borderColor: LIGHT,
  paddingHorizontal: rs(12),
  minHeight: rs(60),
  paddingVertical: rs(9),
  marginBottom: rs(7),
  shadowColor: '#000000',
  shadowOpacity: 0.03,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};
const ICON_TILE = {
  width: rs(36), height: rs(36), borderRadius: rs(10),
  backgroundColor: G_LIGHT,
  alignItems: 'center', justifyContent: 'center',
  marginRight: rs(11),
};

function SectionLabel({ children, subtitle, count }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: rs(16), marginBottom: rs(8) }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', fontFamily: SERIF, color: DARK }}>{children}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {typeof count === 'number' ? (
        <View className="rounded-full" style={{ paddingHorizontal: rs(9), paddingVertical: rs(3), backgroundColor: G_LIGHT }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: G }}>
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
  return (
    <View className="flex-row items-center" style={LIST_ROW}>
      <View style={{ ...ICON_TILE, backgroundColor: TONE.blue.dark }}>
        <Ionicons name="lock-closed" size={rf(18)} color="#FFFFFF" />
      </View>
      <View className="flex-1">
        <Text style={{ fontSize: 13, fontWeight: '700', color: DARK }}>App Lock</Text>
        <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>Require fingerprint / pattern / PIN to open</Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        disabled={!ready}
        trackColor={{ true: G, false: LIGHT }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={LIGHT}
      />
    </View>
  );
}

// Solid glyphs for the menu rows — green on a very light green tile.
const SOLID = {
  personal: ion('person'),
  subscription: mci('crown'),
  qr: ion('qr-code'),
  shop: ion('storefront'),
  kyc: ion('document-text'),
  pickup: mci('truck'),
  orders: ion('bag-handle'),
  employees: ion('people'),
  leave: mci('calendar-clock'),
  terms: mci('script-text'),
  privacy: mci('shield-check'),
  faq: ion('help-circle'),
  support: ion('headset'),
};

// One list row: [medium-colour tile + white icon] Title / subtitle, with a thin
// divider under every row except the section's last.
function MenuRow({ Icon, label, sub, onPress, tone = 'green', last }) {
  const t = TONE[tone] || TONE.green;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: LIGHT }}
      className="flex-row items-center"
      hitSlop={2}
      style={{ ...LIST_ROW, borderBottomWidth: last ? 0 : 1, borderBottomColor: LIGHT }}
    >
      <View style={{ ...ICON_TILE, backgroundColor: t.dark }}>
        <Icon size={rf(19)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
      </View>
      <View className="flex-1">
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: DARK }} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}
