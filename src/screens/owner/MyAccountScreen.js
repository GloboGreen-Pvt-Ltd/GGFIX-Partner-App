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
  ArrowLeftRight,
  X,
  Check,
  ChevronRight,
  ScrollText,
  Lock,
  HelpCircle,
  Headphones,
  LogOut,
  Crown,
  CreditCard,
  CircleCheck,
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

// Swiggy / Zomato green palette — shared with the rest of the owner app.
const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN     = '#087A0A';
const DANGER           = '#DC2626';

// Icon system — lifted verbatim from the Home screen (owner/DashboardScreen.js)
// so Home and My Account read as one app rather than two.
//
// PINE is the brand's deep pine at luminance 0.055, i.e. DARK: ~10:1 as a
// foreground on the white cards here and 9.4:1 on the PINE_TINT tile. If it
// ever moves, the thing to check is that the replacement is still dark — a
// light value silently breaks every foreground use while fills keep working.
//
// ICON_STROKE is ONE weight for every icon on the screen. These had drifted to
// per-call-site values (none, 2.2, 2.3), which is why the rows, the switcher
// and the header never quite looked like one set.
const PINE       = '#004C40';
const PINE_TINT  = 'rgba(0,76,64,0.10)';  // the single icon-tile fill
const ICON_STROKE = 2;

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
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
          if (!cancelled) setHasKycDocs(!!(kyc && (kyc.aadharFrontUrl || kyc.aadharBackUrl || kyc.panUrl)));
        } catch {
          if (!cancelled) setHasKycDocs(false);
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
  const shopMobile = activeShopObj?.mobile || activeShopObj?.mobilePrimary || activeShopObj?.phone || '';
  const shopFrontImage = activeShopObj?.frontImageUrl || '';

  const displayName = isShopLogin ? (shopName || 'Your Shop') : ownerName;
  const displayPhone = isShopLogin ? shopMobile : (user?.phone || '');
  const displayAvatar = isShopLogin ? shopFrontImage : (user?.avatarUrl || '');

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

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Slim white header — back/title row + small badge. Subtitle and big copy
          have been moved into the content area so the header band stays short. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 6,
            paddingBottom: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center">
            <Text className="flex-1 text-text text-[24px] font-extrabold" numberOfLines={1}>
              My Account
            </Text>
            <View
              className="flex-row items-center px-2.5 py-1 rounded-full bg-surface-muted"
            >
              {isShopLogin
                ? <Store size={11} color={PINE} strokeWidth={ICON_STROKE} />
                : <Crown size={11} color={PINE} strokeWidth={ICON_STROKE} />}
              <Text
                className="ml-1 text-text text-[10.5px] font-extrabold"
                style={{ letterSpacing: 0.6 }}
              >
                {isShopLogin ? 'SHOP' : 'OWNER'}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28, paddingTop: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity card */}
        <View
          className="bg-white rounded-3xl p-4"
          style={cardShadow}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => navigation?.navigate?.(isShopLogin ? 'OwnerShopInfo' : 'OwnerPersonalInfo')}
              style={{ position: 'relative' }}
            >
              <View
                style={{
                  padding: 3,
                  borderRadius: 36,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 2,
                  borderColor: '#E6F7E3',
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: BRAND_GREEN_DARK,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {displayAvatar ? (
                    <Image
                      source={{ uri: displayAvatar }}
                      style={{ width: 56, height: 56, borderRadius: 28 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text
                      className="text-white font-extrabold"
                      style={{ fontSize: 19, letterSpacing: 1 }}
                    >
                      {initials}
                    </Text>
                  )}
                </View>
              </View>
              {/* Camera badge — tap the avatar to edit profile / photo */}
              <View
                style={{
                  position: 'absolute', right: -1, bottom: -1,
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: BRAND_GREEN_DARK,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#FFFFFF',
                }}
              >
                <Camera size={11} color="#FFFFFF" strokeWidth={ICON_STROKE} />
              </View>
            </Pressable>
            <View className="flex-1 ml-3">
              <View className="flex-row items-center flex-wrap">
                <Text className="text-[16px] font-extrabold text-gray-900 mr-2" numberOfLines={1}>
                  {displayName}
                </Text>
                <View
                  className="flex-row items-center px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <BadgeCheck size={10} color={PINE} strokeWidth={ICON_STROKE} />
                  <Text
                    className="ml-0.5 text-[8.5px] font-extrabold"
                    style={{ color: BRAND_GREEN_DARK, letterSpacing: 0.4 }}
                  >
                    VERIFIED
                  </Text>
                </View>
              </View>
              {displayPhone ? (
                <View className="flex-row items-center mt-1.5">
                  <Phone size={11} color="#667066" strokeWidth={ICON_STROKE} />
                  <Text className="ml-1 text-[12px] font-semibold text-gray-500">
                    {displayPhone}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Active shop pill — hidden for shop-scoped logins (single shop) */}
          {!isShopLogin ? (
          <Pressable
            onPress={() => canOpenSwitcher && setShowSwitcher(true)}
            disabled={!canOpenSwitcher}
            className="mt-3.5 flex-row items-center rounded-2xl px-3 py-2.5"
            style={{
              backgroundColor: canOpenSwitcher ? '#F0F8EF' : '#F7FAF7',
              borderWidth: 1,
              borderColor: canOpenSwitcher ? '#C8EEBF' : '#E2E8E2',
            }}
          >
            <View
              style={{
                width: 32, height: 32, borderRadius: 10,
                backgroundColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 10,
                borderWidth: 1, borderColor: '#C8EEBF',
              }}
            >
              <Store size={14} color={PINE} strokeWidth={ICON_STROKE} />
            </View>
            <View className="flex-1">
              <Text
                className="text-[9.5px] font-extrabold"
                style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}
              >
                ACTIVE SHOP
              </Text>
              <Text className="text-[13.5px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
                {shopName || 'No shop linked'}
              </Text>
            </View>
            {hasMultipleShops ? (
              <View
                className="flex-row items-center px-2.5 py-1.5 rounded-full"
                style={{ backgroundColor: BRAND_GREEN_DARK }}
              >
                <ArrowLeftRight size={11} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                <Text className="ml-1 text-white text-[10.5px] font-extrabold">
                  Switch ({shops.length})
                </Text>
              </View>
            ) : canAddShop ? (
              // One shop and nothing to switch between — the pill still opens
              // the sheet, so it advertises what it actually does from here.
              <View
                className="flex-row items-center px-2.5 py-1.5 rounded-full"
                style={{ backgroundColor: BRAND_GREEN_DARK }}
              >
                <Plus size={11} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                <Text className="ml-1 text-white text-[10.5px] font-extrabold">
                  Add Shop
                </Text>
              </View>
            ) : null}
          </Pressable>
          ) : null}
        </View>

        {/* My Profile group */}
        <SectionLabel>My Profile</SectionLabel>
        <View className="bg-white rounded-2xl px-3 mt-1" style={softShadow}>
          {!isShopLogin ? (
            <MenuRow
              Icon={User}
              label="Personal Information"
              sub="Name, mobile, email"
              onPress={() => navigation?.navigate?.('OwnerPersonalInfo')}
            />
          ) : null}
          <MenuRow
            Icon={CircleCheck}
            label="Subscription"
            sub={isShopLogin ? 'View current plan' : 'View your plan & upgrade'}
            onPress={() => navigation?.navigate?.('OwnerSubscription')}
          />
          <MenuRow
            Icon={QrCode}
            label="My QR Code"
            sub="Share your shop instantly"
            onPress={() => navigation?.navigate?.('OwnerQrCode')}
          />
          <MenuRow
            Icon={Store}
            label="Shop Information"
            sub="Address, opening hours, GST"
            onPress={() => navigation?.navigate?.('OwnerShopInfo')}
          />
          {!isShopLogin ? (
            <MenuRow
              Icon={FileText}
              label="KYC Documents"
              sub="Aadhar, PAN, GST / Udyam"
              onPress={() => navigation?.navigate?.(hasKycDocs ? 'OwnerKycView' : 'OwnerKycIntro')}
            />
          ) : null}
          <MenuRow
            Icon={Truck}
            label="Pickup Service"
            sub="Turn pickup on/off, slot timings & zones"
            onPress={() => navigation?.navigate?.('OwnerPickupSlots')}
          />
          <MenuRow
            Icon={ShoppingBag}
            label="My Orders"
            sub="View your orders & history"
            onPress={() => navigation?.navigate?.('MarketplaceOrders')}
          />
          <MenuRow
            Icon={Users}
            label="Employee Management"
            sub="Add, edit & track your team"
            onPress={() => navigation?.navigate?.('OwnerEmployeeList')}
          />
          <MenuRow
            Icon={CalendarClock}
            label="Leave Requests"
            sub="Approve or reject leave"
            onPress={() => navigation?.navigate?.('OwnerLeaveRequests')}
            last
          />
        </View>

        {/* Security group */}
        <SectionLabel>Security</SectionLabel>
        <View className="bg-white rounded-2xl px-3 mt-1" style={softShadow}>
          <AppLockRow />
        </View>

        {/* More group */}
        <SectionLabel>More</SectionLabel>
        <View className="bg-white rounded-2xl px-3 mt-1" style={softShadow}>
          <MenuRow
            Icon={ScrollText}
            label="Terms & Conditions"
            sub="Platform usage rules"
          />
          <MenuRow
            Icon={Lock}
            label="Privacy Policy"
            sub="How we handle your data"
          />
          <MenuRow
            Icon={HelpCircle}
            label="FAQs"
            sub="Common questions answered"
          />
          <MenuRow
            Icon={Headphones}
            label="Help & Support"
            sub="Talk to the GGfix team"
            last
          />
        </View>

        {/* Logout */}
        {onLogout ? (
          <Pressable
            onPress={onLogout}
            className="mt-4 flex-row items-center justify-center rounded-2xl py-3.5 bg-white"
            style={{
              borderWidth: 1,
              borderColor: '#FEE2E2',
              ...softShadow,
            }}
          >
            <LogOut size={16} color={DANGER} strokeWidth={ICON_STROKE} />
            <Text className="ml-2 text-[14px] font-extrabold" style={{ color: DANGER }}>
              Log Out
            </Text>
          </Pressable>
        ) : null}
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
          style={{ flex: 1, backgroundColor: 'rgba(23, 33, 23, 0.55)', justifyContent: 'flex-end' }}
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
                borderRadius: 999, backgroundColor: '#E2E8E2',
                marginBottom: 12,
              }}
            />
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[17px] font-extrabold text-gray-900">Switch Shop</Text>
              <Pressable
                onPress={() => setShowSwitcher(false)}
                hitSlop={8}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: '#EFF5EE' }}
              >
                <X size={14} color="#172117" strokeWidth={ICON_STROKE} />
              </Pressable>
            </View>
            <Text className="text-[12px] text-gray-500 mb-3">
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
                    backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
                    borderColor: active ? BRAND_GREEN : '#E2E8E2',
                  }}
                >
                  <View
                    className="w-9 h-9 rounded-2xl items-center justify-center mr-3"
                    style={{ backgroundColor: active ? BRAND_GREEN : '#E6F7E3' }}
                  >
                    <Store size={16} color={active ? '#FFFFFF' : PINE} strokeWidth={ICON_STROKE} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-[14px] font-extrabold"
                      style={{ color: active ? BRAND_GREEN_DARK : '#172117' }}
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                    <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                      {s.slug}
                    </Text>
                  </View>
                  {active ? (
                    <View
                      className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#E6F7E3' }}
                    >
                      <Check size={16} color={PINE} strokeWidth={ICON_STROKE} />
                    </View>
                  ) : (
                    <ChevronRight size={16} color="#8FA08F" strokeWidth={ICON_STROKE} />
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
                  borderColor: '#C8EEBF',
                  borderStyle: 'dashed',
                  opacity: switching ? 0.5 : 1,
                }}
              >
                <View
                  className="w-9 h-9 rounded-2xl items-center justify-center mr-3"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Plus size={16} color={PINE} strokeWidth={ICON_STROKE} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-[14px] font-extrabold"
                    style={{ color: BRAND_GREEN_DARK }}
                    numberOfLines={1}
                  >
                    Add Shop
                  </Text>
                  <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                    Open another business location
                  </Text>
                </View>
                <ChevronRight size={16} color={PINE} strokeWidth={ICON_STROKE} />
              </Pressable>
            ) : null}
            </ScrollView>
            {switching ? (
              <View className="flex-row items-center justify-center mt-2">
                <ActivityIndicator color={BRAND_GREEN_DARK} />
                <Text className="ml-2 text-[12px] text-gray-500">Switching…</Text>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SectionLabel({ children }) {
  return (
    <View className="mt-4 mb-1 ml-1">
      <Text
        className="text-[11px] font-extrabold uppercase"
        style={{ color: BRAND_GREEN_DARK, letterSpacing: 1.2 }}
      >
        {children}
      </Text>
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
    <View className="flex-row items-center px-3 py-3.5">
      <View className="h-10 w-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: PINE_TINT }}>
        <Fingerprint size={18} color={PINE} strokeWidth={ICON_STROKE} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-extrabold text-gray-900">App Lock</Text>
        <Text className="text-[11.5px] text-gray-500 mt-0.5">Require fingerprint / pattern / PIN to open</Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        disabled={!ready}
        trackColor={{ true: ACCENT_GREEN, false: '#CBD5CB' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
// Every row draws the SAME pine glyph on the SAME tint. The per-row `tint` /
// `accent` props are gone: they encoded a colour hierarchy (amber for KYC, red
// for Leave Requests, grey for the More group) that no longer survives a
// single-colour icon set, and leaving them would let call sites drift back.
function MenuRow({ Icon, label, sub, onPress, last }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#F7FAF7' }}
      className="flex-row items-center"
      style={{
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#EFF5EE',
      }}
    >
      <View
        style={{
          width: 36, height: 36, borderRadius: 12,
          backgroundColor: PINE_TINT,
          alignItems: 'center', justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Icon size={17} color={PINE} strokeWidth={ICON_STROKE} />
      </View>
      <View className="flex-1">
        <Text className="text-[13.5px] font-extrabold text-gray-900">{label}</Text>
        {sub ? (
          <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color="#8FA08F" strokeWidth={ICON_STROKE} />
    </Pressable>
  );
}
