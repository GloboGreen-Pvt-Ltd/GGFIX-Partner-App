import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Store,
  Camera,
  BadgeCheck,
  Phone,
  Mail,
  X,
  ChevronRight,
  LogOut,
  Crown,
  ShieldCheck,
  Plus,
} from 'lucide-react-native';
import { getSession } from '../../auth/session';
import { ion, mci } from '../../components/dashboard/solidIcons';
import { T } from '../../components/dashboard/theme';
import { brand } from '../../theme/colors';
import SafeModal, { ModalInsets } from '../../components/SafeModal';
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
import { useTabBarSpace } from '../../navigation/tabBarMetrics';
import { notify } from '../../components/confirm';

// My Account palette — the Oct 2026 brand sheet (theme/colors.js `brand`).
const G = brand.teal;           // Primary teal: header, key actions
const G_DARK = '#02414C';       // Header gradient end
const G_LIGHT = '#E5F3F5';      // Light teal tint
const NAVY = brand.navy;        // Headings
const DARK = brand.black;       // Body text
const MUTED = '#6B7280';        // Subtitles
const LIGHT = '#E9EDF0';        // Dividers, toggle off
const BG = brand.lightGray;     // Page background
const DANGER = brand.red;
const ICON_STROKE = 2; // ONE weight for every icon on the screen.

// Icon-tile tones: solid brand colour with a white glyph. Rows pick a NAME,
// so the colours stay in this one table.
const TONE = {
  teal:   { bg: brand.teal,   fg: '#FFFFFF' },
  navy:   { bg: brand.navy,   fg: '#FFFFFF' },
  blue:   { bg: brand.blue,   fg: '#FFFFFF' },
  green:  { bg: brand.green,  fg: '#FFFFFF' },
  orange: { bg: brand.orange, fg: '#FFFFFF' },
  red:    { bg: brand.red,    fg: '#FFFFFF' },
};

const softShadow = {
  shadowColor: '#1C3053',
  shadowOpacity: 0.06,
  shadowRadius: 12,
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
  // The tab bar floats over the page; keep the last items clear of it.
  const tabSpace = useTabBarSpace();
  const isFocused = useIsFocused();
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
      tone: 'teal',
      Icon: SOLID.personal,
      label: 'Personal Information',
      sub: 'Name, mobile, email',
      onPress: () => navigation?.navigate?.('OwnerPersonalInfo'),
    },
    {
      key: 'subscription',
      tone: 'orange',
      Icon: SOLID.subscription,
      label: 'Subscription',
      sub: isShopLogin ? 'View current plan' : 'View your plan & upgrade',
      onPress: () => navigation?.navigate?.('OwnerSubscription'),
    },
    {
      key: 'qr',
      tone: 'navy',
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
      tone: 'blue',
      Icon: SOLID.kyc,
      label: 'KYC Documents',
      sub: 'Aadhar, PAN, GST / Udyam',
      onPress: () => navigation?.navigate?.(hasKycDocs ? 'OwnerKycView' : 'OwnerKycIntro'),
    },
    {
      key: 'pickup',
      tone: 'teal',
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
      tone: 'navy',
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
      {/* Light icons over the teal header — only while this tab is on screen,
          so the always-mounted tab can't leave white icons on other screens. */}
      {isFocused ? <StatusBar barStyle="light-content" backgroundColor={G} /> : null}

      {/* Teal header: title bar + profile + active shop, one block. */}
      <LinearGradient
        colors={[G, G_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderBottomLeftRadius: rs(26), borderBottomRightRadius: rs(26) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={[{ paddingHorizontal: rs(16), paddingTop: rs(6), paddingBottom: rs(18) }, capStyle]}>
            <View style={HEADER.row}>
              <Pressable
                onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate?.('Home'))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={({ pressed }) => [HEADER.iconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="chevron-back" size={19} color="#FFFFFF" />
              </Pressable>
              <View style={HEADER.titleWrap}>
                <Text style={HEADER.title} numberOfLines={1}>My Account</Text>
                <Text style={HEADER.subtitle} numberOfLines={1}>Manage your profile, shop and preferences</Text>
              </View>
              <Pressable
                onPress={() => navigation?.navigate?.('HelpSupport')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Help & Support"
                style={({ pressed }) => [HEADER.iconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="headset" size={16} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Profile */}
            <View className="flex-row items-center" style={{ marginTop: rs(18) }}>
              <View style={{ position: 'relative' }}>
                <View
                  style={{
                    width: rs(64), height: rs(64), borderRadius: rs(32),
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    borderWidth: 3, borderColor: '#FFFFFF',
                  }}
                >
                  {displayAvatar ? (
                    <Image source={{ uri: displayAvatar }} style={{ width: rs(64), height: rs(64) }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 19, letterSpacing: 1 }}>{initials}</Text>
                  )}
                </View>
                <View
                  style={{
                    position: 'absolute', right: -rs(2), bottom: -rs(2),
                    width: rs(22), height: rs(22), borderRadius: rs(11),
                    backgroundColor: brand.orange,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: '#FFFFFF',
                  }}
                >
                  <Camera size={rf(11)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                </View>
              </View>
              <View className="flex-1" style={{ marginLeft: rs(14) }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>
                  {displayName}
                </Text>
                <View className="flex-row items-center flex-wrap" style={{ marginTop: rs(5) }}>
                  <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(8), paddingVertical: rs(3), backgroundColor: brand.orange, marginRight: rs(6) }}>
                    {isShopLogin
                      ? <Store size={rf(10)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                      : <Crown size={rf(10)} color="#FFFFFF" strokeWidth={ICON_STROKE} />}
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', marginLeft: rs(3), letterSpacing: 0.5 }}>
                      {isShopLogin ? 'SHOP' : 'OWNER'}
                    </Text>
                  </View>
                  {isVerified ? (
                    <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: rs(8), paddingVertical: rs(3), backgroundColor: brand.green }}>
                      <BadgeCheck size={rf(10)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', marginLeft: rs(3), letterSpacing: 0.5 }}>VERIFIED</Text>
                    </View>
                  ) : null}
                </View>
                {displayPhone ? (
                  <View className="flex-row items-center" style={{ marginTop: rs(6) }}>
                    <Phone size={rf(11)} color="rgba(255,255,255,0.8)" strokeWidth={ICON_STROKE} />
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', marginLeft: rs(6) }} numberOfLines={1}>{displayPhone}</Text>
                  </View>
                ) : null}
                {displayEmail ? (
                  <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                    <Mail size={rf(11)} color="rgba(255,255,255,0.8)" strokeWidth={ICON_STROKE} />
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', marginLeft: rs(6) }} numberOfLines={1}>{displayEmail}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Active shop + Switch */}
            {!isShopLogin ? (
              <View
                className="flex-row items-center"
                style={{
                  marginTop: rs(16), padding: rs(10), borderRadius: rs(16),
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                <View style={{ width: rs(38), height: rs(38), borderRadius: rs(12), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="storefront" size={rf(18)} color={G} />
                </View>
                <View style={{ flex: 1, minWidth: 0, marginLeft: rs(10) }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>
                    {shopName || 'No shop linked'}
                  </Text>
                  {shopSlug ? (
                    <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', marginTop: 1 }} numberOfLines={1}>
                      Shop ID: #{shopSlug.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
                {canOpenSwitcher ? (
                  <Pressable
                    onPress={() => setShowSwitcher(true)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Switch shop"
                    className="flex-row items-center"
                    style={({ pressed }) => ({ backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: rs(12), paddingVertical: rs(7), marginLeft: rs(8), opacity: pressed ? 0.8 : 1 })}
                  >
                    <Ionicons name="swap-horizontal" size={rf(13)} color={G} />
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: G, marginLeft: rs(4) }}>Switch</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingTop: rs(4), paddingBottom: tabSpace }}
        showsVerticalScrollIndicator={false}
      >
        <View style={capStyle}>
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
          <MenuRow tone="navy" Icon={SOLID.terms} label="Terms & Conditions" sub="Platform usage rules" onPress={() => navigation?.navigate?.('Terms')} />
          <MenuRow tone="green" Icon={SOLID.privacy} label="Privacy Policy" sub="How we handle your data" onPress={() => navigation?.navigate?.('PrivacyPolicy')} />
          <MenuRow tone="blue" Icon={SOLID.faq} label="FAQs" sub="Common questions answered" />
          <MenuRow tone="orange" Icon={SOLID.support} label="Help & Support" sub="Talk to the NearGFix team" onPress={() => navigation?.navigate?.('HelpSupport')} last />
        </View>

        {onLogout ? (
          <Pressable
            onPress={onLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            className="flex-row items-center justify-center"
            hitSlop={4}
            style={({ pressed }) => ({
              marginTop: rs(18), height: rs(50), borderRadius: rs(14),
              backgroundColor: pressed ? '#FDE1DF' : '#FFFFFF',
              borderWidth: 1.5, borderColor: DANGER,
            })}
          >
            <LogOut size={rf(17)} color={DANGER} strokeWidth={ICON_STROKE} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: DANGER, marginLeft: rs(8) }}>Log Out</Text>
          </Pressable>
        ) : null}

        {/* Trust footer — reassurance only, no state or navigation. */}
        <View className="flex-row items-center" style={{ borderRadius: rs(14), marginTop: rs(12), padding: rs(12), backgroundColor: G_LIGHT }}>
          <ShieldCheck size={rf(16)} color={G} strokeWidth={ICON_STROKE} />
          <Text style={{ flex: 1, fontSize: 11, color: NAVY, marginLeft: rs(8), lineHeight: rf(15) }}>
            Your data is safe with us — we follow industry-standard security practices.
          </Text>
        </View>
        </View>
      </ScrollView>

      {/* Switch Shop bottom sheet — real shops from the session, existing switch/add logic. */}
      <SafeModal visible={showSwitcher} transparent animationType="fade" onRequestClose={() => setShowSwitcher(false)}>
        {/* Clears this modal window's own nav-bar / home-indicator inset. */}
        <ModalInsets>
          {({ insets }) => (
            <Pressable onPress={() => setShowSwitcher(false)} style={{ flex: 1, backgroundColor: 'rgba(17, 17, 17, 0.5)', justifyContent: 'flex-end' }}>
              <Pressable
                onPress={(e) => e.stopPropagation()}
                // Tablets: cap and centre the sheet.
                style={{ width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 + insets.bottom }}
              >
                <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: LIGHT, marginBottom: 12 }} />
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontSize: 17, fontWeight: '700', color: NAVY }}>Switch Shop</Text>
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
          )}
        </ModalInsets>
      </SafeModal>
    </View>
  );
}

// Header — white text and translucent round buttons on the teal gradient.
const HEADER = {
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  titleWrap: { flex: 1, alignItems: 'center', marginHorizontal: rs(8) },
  title: { color: '#FFFFFF', fontSize: T.headline, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: T.caption2, marginTop: rs(2) },
};

// One white card per section; rows inside are flat and divider-separated.
const LIST_STYLE = {
  backgroundColor: '#FFFFFF',
  borderRadius: rs(18),
  paddingHorizontal: rs(12),
  ...softShadow,
};
const LIST_ROW = {
  minHeight: rs(62),
  paddingVertical: rs(10),
};

// Bordered row used by the Switch Shop sheet.
const ROW_STYLE = {
  backgroundColor: '#FFFFFF',
  borderRadius: rs(14),
  borderWidth: 1,
  borderColor: LIGHT,
  paddingHorizontal: rs(12),
  minHeight: rs(60),
  paddingVertical: rs(9),
  marginBottom: rs(7),
};
const ICON_TILE = {
  // Rounded square tile: solid brand colour behind a white glyph.
  width: rs(40), height: rs(40), borderRadius: rs(12),
  backgroundColor: G_LIGHT,
  alignItems: 'center', justifyContent: 'center',
  marginRight: rs(12),
};

function SectionLabel({ children, subtitle, count }) {
  return (
    <View className="flex-row items-end" style={{ marginTop: rs(18), marginBottom: rs(8), paddingHorizontal: rs(2) }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: NAVY }}>{children}</Text>
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
        notify('Set a screen lock first', 'Add a fingerprint, pattern or PIN in phone settings.', { type: 'warning', duration: 4 });
        return;
      }
      if (!(await authenticate())) return;
    }
    await setAppLockEnabled(next);
    setOn(next);
  };
  return (
    <View className="flex-row items-center" style={LIST_ROW}>
      <View style={{ ...ICON_TILE, backgroundColor: TONE.teal.bg }}>
        <Ionicons name="lock-closed" size={rf(18)} color={TONE.teal.fg} />
      </View>
      <View className="flex-1">
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: DARK }}>App Lock</Text>
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

// Solid glyphs for the menu rows.
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

// One list row: [solid brand tile + white glyph] Title / subtitle  ›
// with a thin divider under every row except the section's last.
function MenuRow({ Icon, label, sub, onPress, tone = 'teal', last }) {
  const t = TONE[tone] || TONE.teal;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: LIGHT }}
      className="flex-row items-center"
      hitSlop={2}
      style={{ ...LIST_ROW, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}
    >
      <View style={{ ...ICON_TILE, backgroundColor: t.bg }}>
        <Icon size={rf(19)} color={t.fg} strokeWidth={ICON_STROKE} />
      </View>
      <View className="flex-1">
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: DARK }} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {onPress ? <ChevronRight size={rf(17)} color="#9CA3AF" strokeWidth={ICON_STROKE} /> : null}
    </Pressable>
  );
}
