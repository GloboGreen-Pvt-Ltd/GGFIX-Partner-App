import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ClipboardList, House, Settings, ShoppingBag, Tag } from 'lucide-react-native';
import colors from '../theme/colors';
import BackButton from '../components/BackButton';
import { getTabBarContentHeight, isTabletWidth, MIN_SAFE_BOTTOM } from './tabBarMetrics';
import { rf, rs } from '../utils/responsive';

// White-tinted back arrow for the green-header screens (Shop Info, Pickup
// Options). The shared BackButton renders a dark arrow which is invisible on
// the green native header bar.
function GreenHeaderBack({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
        backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'transparent',
      })}
    >
      <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} />
    </Pressable>
  );
}
import DashboardScreen from '../screens/owner/DashboardScreen';
import MyAccountScreen from '../screens/owner/MyAccountScreen';
// All booking-related screens are now grouped under owner/AllBooking/
import BookingHistoryScreen from '../screens/owner/AllBooking/BookingHistoryScreen';
import BookingStatusScreen from '../screens/owner/BookingStatusScreen';
import BookingStatusReportScreen from '../screens/owner/BookingStatusReportScreen';
import BookingPreviousReportScreen from '../screens/owner/BookingPreviousReportScreen';
import OwnerBuyListingDetailsScreen from '../screens/owner/OwnerBuyListingDetailsScreen';
import SellRequestsScreen from '../screens/owner/SellRequestsScreen';
import OwnerBuyListingScreen from '../screens/owner/OwnerBuyListingScreen';
import OwnerCartScreen from '../screens/owner/OwnerCartScreen';
import OwnerNotificationsScreen from '../screens/owner/OwnerNotificationsScreen';
import OwnerSearchScreen from '../screens/owner/OwnerSearchScreen';
import ScanSearchScreen from '../screens/owner/ScanSearchScreen';
import ProductScanScreen from '../screens/owner/ProductScanScreen';
import OwnerBuyHomeScreen from '../screens/owner/OwnerBuyHomeScreen';
import OwnerSellHubScreen from '../screens/owner/OwnerSellHubScreen';
import TicketDetailScreen from '../screens/owner/AllBooking/TicketDetailScreen';
import DeviceDetailScreen from '../screens/owner/AllBooking/DeviceDetailScreen';
import BookingSummaryScreen from '../screens/owner/AllBooking/BookingSummaryScreen';
import BookingTimelineScreen from '../screens/owner/AllBooking/BookingTimelineScreen';
import PickupHistoryScreen from '../screens/owner/AllBooking/PickupHistoryScreen';
import BarcodePrintScreen from '../screens/owner/AllBooking/BarcodePrintScreen';
import DeliveryInvoiceScreen from '../screens/owner/AllBooking/DeliveryInvoiceScreen';
import InvoiceGeneratorScreen from '../screens/owner/AllBooking/InvoiceGeneratorScreen';
import DeliveryInvoiceReportScreen from '../screens/owner/AllBooking/DeliveryInvoiceReportScreen';
import AssignTechnicianScreen from '../screens/owner/AssignTechnicianScreen';
import InventoryScreen from '../screens/owner/InventoryScreen';
import MarketplaceSellScreen from '../screens/owner/MarketplaceSellScreen';
import OwnerSellSparePartsScreen from '../screens/owner/OwnerSellSparePartsScreen';
import OwnerSellMobileChoiceScreen from '../screens/owner/OwnerSellMobileChoiceScreen';
import SellDeviceDetailsScreen from '../screens/owner/service-booking-shop/DeviceDetailsScreen';
import OwnerSellGadgetPriceScreen from '../screens/owner/OwnerSellGadgetPriceScreen';
import OwnerSellListedScreen from '../screens/owner/OwnerSellListedScreen';
import OwnerSellHomeScreen from '../screens/owner/OwnerSellHomeScreen';
import MarketplaceOrdersScreen from '../screens/owner/MarketplaceOrdersScreen';
import MarketplaceListingDetailsScreen from '../screens/owner/MarketplaceListingDetailsScreen';
// Shared device pickers — also used by the owner sell mobile flow.
import SelectCategoryScreen from '../screens/shared/device/SelectCategoryScreen';
import SelectBrandScreen from '../screens/shared/device/SelectBrandScreen';
import SelectSeriesScreen from '../screens/shared/device/SelectSeriesScreen';
import SelectModelScreen from '../screens/shared/device/SelectModelScreen';
import SelectVariantScreen from '../screens/shared/device/SelectVariantScreen';
// Shared sell-flow screens — also used by the owner-list (Detailed / Dead Short) paths.
import SellScreeningScreen from '../screens/shared/sell/SellScreeningScreen';
import SellScreenConditionScreen from '../screens/shared/sell/SellScreenConditionScreen';
import SellFunctionalScreen from '../screens/shared/sell/SellFunctionalScreen';
import SellDeviceConfigScreen from '../screens/shared/sell/SellDeviceConfigScreen';
import SellAccessoriesWarrantyScreen from '../screens/shared/sell/SellAccessoriesWarrantyScreen';
import SellImagesScreen from '../screens/shared/sell/SellImagesScreen';
import ReportsScreen from '../screens/owner/ReportsScreen';
import OwnerRevenueScreen from '../screens/owner/OwnerRevenueScreen';
import OwnerCashBookScreen from '../screens/owner/OwnerCashBookScreen';
import OwnerLedgerPartyAddScreen from '../screens/owner/OwnerLedgerPartyAddScreen';
import OwnerContactPickerScreen from '../screens/owner/OwnerContactPickerScreen';
import OwnerLedgerPartyDetailScreen from '../screens/owner/OwnerLedgerPartyDetailScreen';
import OwnerLedgerEntryAddScreen from '../screens/owner/OwnerLedgerEntryAddScreen';
import OwnerLedgerStatementScreen from '../screens/owner/OwnerLedgerStatementScreen';
import OwnerPersonalInfoScreen from '../screens/owner/OwnerPersonalInfoScreen';
import OwnerShopInfoScreen from '../screens/owner/OwnerShopInfoScreen';
import OwnerKycIntroScreen from '../screens/owner/OwnerKycIntroScreen';
import OwnerKycUploadScreen from '../screens/owner/OwnerKycUploadScreen';
import OwnerKycReviewScreen from '../screens/owner/OwnerKycReviewScreen';
import OwnerKycPendingScreen from '../screens/owner/OwnerKycPendingScreen';
import OwnerKycViewScreen from '../screens/owner/OwnerKycViewScreen';
import OwnerPickupSlotsScreen from '../screens/owner/OwnerPickupSlotsScreen';
import OwnerPickupServiceListScreen from '../screens/owner/OwnerPickupServiceListScreen';
import OwnerPickupServiceDetailScreen from '../screens/owner/OwnerPickupServiceDetailScreen';
import OwnerEmployeeListScreen from '../screens/owner/OwnerEmployeeListScreen';
import OwnerEmployeeDetailScreen from '../screens/owner/OwnerEmployeeDetailScreen';
import OwnerEmployeeCreatedScreen from '../screens/owner/OwnerEmployeeCreatedScreen';
import OwnerEmployeeAddScreen from '../screens/owner/OwnerEmployeeAddScreen';
import OwnerEmployeeAttendanceScreen from '../screens/owner/OwnerEmployeeAttendanceScreen';
import OwnerStaffReportScreen from '../screens/owner/OwnerStaffReportScreen';
import OwnerEmployeeLeaveScreen from '../screens/owner/OwnerEmployeeLeaveScreen';
import OwnerEmployeeSalaryReportScreen from '../screens/owner/OwnerEmployeeSalaryReportScreen';
import OwnerEmployeePayslipScreen from '../screens/owner/OwnerEmployeePayslipScreen';
import OwnerEmployeeShiftDetailsScreen from '../screens/owner/OwnerEmployeeShiftDetailsScreen';
import OwnerEmployeePermissionScreen from '../screens/owner/OwnerEmployeePermissionScreen';
import OwnerJobReportScreen from '../screens/owner/OwnerJobReportScreen';
import OwnerEmployeePickupReportScreen from '../screens/owner/OwnerEmployeePickupReportScreen';
import OwnerEmployeeAddAdvanceScreen from '../screens/owner/OwnerEmployeeAddAdvanceScreen';
import OwnerEmployeeApplyLeaveScreen from '../screens/owner/OwnerEmployeeApplyLeaveScreen';
import OwnerQrCodeScreen from '../screens/owner/OwnerQrCodeScreen';
import OwnerModelCompatibilityScreen from '../screens/owner/OwnerModelCompatibilityScreen';
import RepairServiceBookingShop from '../screens/owner/service-booking-shop/RepairServiceBookingShop';
import ScanImeiScreen from '../screens/owner/service-booking-shop/ScanImeiScreen';
import DevicePhotoCaptureScreen from '../screens/owner/service-booking-shop/DevicePhotoCaptureScreen';
import ScanQrCodeScreen from '../screens/owner/service-booking-shop/ScanQrCodeScreen';
import ShopServiceStatusScreen from '../screens/owner/ShopServiceStatusScreen';
import OwnerLeaveRequestsScreen from '../screens/owner/OwnerLeaveRequestsScreen';
import ShopChatInboxScreen from '../screens/owner/chat/ShopChatInboxScreen';
import ShopChatThreadScreen from '../screens/owner/chat/ShopChatThreadScreen';
import SubscriptionScreen from '../screens/owner/SubscriptionScreen';
import LegalDocumentScreen from '../legal/LegalDocumentScreen';
import HelpSupportScreen from '../screens/owner/HelpSupportScreen';
import { subscriptionApi } from '../api/client';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const OWNER_TAB_ICONS = {
  Home: House,
  Bookings: ClipboardList,
  Buy: ShoppingBag,
  Sell: Tag,
  MyAccount: Settings,
};

// Routes registered on the tab navigator but intentionally NOT shown in the
// bar. None at the moment: Invoices used to be one (a hidden "Billing" tab);
// it is now the bookings list with menu 'INVOICE', pushed from Home.
const HIDDEN_TABS = [];

// ── Bottom bar — "liquid glass" (iOS 26 / WhatsApp reference) ─────────────
// Frosted pill floating over the page: real blur of the content behind it
// (expo-blur), a white wash + top sheen, a white inner rim and a hairline
// outline. The active tab is a raised teal circle (white ring + white icon)
// that glides between tabs; every tab keeps its label (active in teal).
//
// expo-blur is native: it only works in a build that includes it (a new
// dev / EAS build). Older builds get a near-opaque white bar instead of a
// crash — the JS module isn't even loaded unless the native side exists.
const HAS_BLUR = !!requireOptionalNativeModule('ExpoBlur');
const BlurLib = HAS_BLUR ? require('expo-blur') : null;
// Android blurs a BlurTargetView (wrapped round the tab screens in OwnerTabs).
const blurTargetRef = React.createRef();

const GLASS_WASH = HAS_BLUR ? 'rgba(255,255,255,0.9)' : '#FFFFFF';
const GLASS_RIM = '#FFFFFF'; // bright white glass edge
const RIM_W = 3;             // its width — the circle's position accounts for it
const GLASS_OUTLINE = 'rgba(17,17,17,0.08)';
// Active tab: raised brand-teal circle, white ring + white icon.
const NAV_TEAL = '#035C6C';
const ICON_ON = NAV_TEAL;       // active label
const ICON_OFF = '#6B7280';     // inactive icon + label

/** One tab: icon + label; the active icon is drawn in the floating circle. */
const TabBarItem = React.memo(function TabBarItem({ Icon, label, isFocused, onPress, onLongPress, iconSize, activeIconSize, labelSize }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={String(label)}
      // Switch on touch-down, not release — the tab opens as the finger lands.
      onPressIn={onPress}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* The active icon is drawn in the floating circle; keep its slot. */}
      {isFocused ? <View style={{ width: iconSize, height: iconSize }} /> : (
        <Icon size={iconSize} color={ICON_OFF} strokeWidth={2} />
      )}
      {/* Label only on the active tab (semi-bold); others are icon-only. */}
      {isFocused ? (
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={{ fontSize: labelSize, marginTop: rs(3), color: ICON_ON, fontWeight: '800' }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
});

/**
 * Floating liquid-glass tab bar, absolutely positioned over the page (tab
 * screens pad their content with useTabBarSpace()). Height comes from
 * tabBarMetrics so the bar and that padding read the same number.
 */
function GlassTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isTablet = isTabletWidth(winW);

  const routes = state.routes.filter((r) => !HIDDEN_TABS.includes(r.name));
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(0, routes.findIndex((r) => r.key === activeKey));

  // Fast tab access: once startup settles, mount the other tabs in the
  // background (one by one) so the first tap on each opens instantly.
  useEffect(() => {
    if (typeof navigation.preload !== 'function') return undefined;
    const timers = [];
    const preloadAll = () => {
      routes.forEach((r, i) => {
        if (r.key === activeKey) return;
        timers.push(setTimeout(() => navigation.preload(r.name), 600 + i * 250));
      });
    };
    // requestIdleCallback replaces the deprecated InteractionManager; a short
    // timer stands in where it isn't available.
    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(preloadAll, { timeout: 1500 })
      : null;
    if (idle == null) timers.push(setTimeout(preloadAll, 500));
    return () => {
      if (idle != null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barHeight = getTabBarContentHeight(isTablet);
  const radius = barHeight / 2;
  const iconSize = rs(isTablet ? 24 : 22);
  const activeIconSize = rs(isTablet ? 26 : 24);
  const labelSize = rf(isTablet ? 12 : 11);
  const padH = rs(6);

  // Capsule geometry from the measured bar width (plain numbers — the
  // worklets below must not call rs()/rf()).
  const [barW, setBarW] = useState(0);
  const itemW = barW > 0 ? (barW - RIM_W * 2 - padH * 2) / Math.max(routes.length, 1) : 0;
  const circ = rs(isTablet ? 56 : 50);
  const circTop = -Math.round(circ * 0.38); // rises above the glass

  const pos = useSharedValue(activeIndex);
  const stretch = useSharedValue(1);
  useEffect(() => {
    // Quick ease-out glide (~180ms) — snappy, never overshoots Home / Settings.
    pos.value = withTiming(activeIndex, { duration: 180, easing: Easing.out(Easing.cubic) });
    // Liquid feel: the circle swells as it lands on the new tab, then settles.
    // Quick, small pulse (~180ms total) — no long springy zoom.
    stretch.value = withSequence(withTiming(1.08, { duration: 70 }), withTiming(1, { duration: 110 }));
  }, [activeIndex, pos, stretch]);
  const circleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: RIM_W + padH + pos.value * itemW + (itemW - circ) / 2 },
      { scale: stretch.value },
    ],
  }), [itemW, circ, padH]);
  const ActiveIcon = OWNER_TAB_ICONS[routes[activeIndex]?.name] || House;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        paddingHorizontal: rs(isTablet ? 20 : 14),
        paddingBottom: Math.max(insets.bottom, MIN_SAFE_BOTTOM),
      }}
    >
      {/* Outline + soft shadow live on this wrapper; the glass itself clips. */}
      <View
        style={{
          width: '100%',
          maxWidth: isTablet ? 660 : '100%',
          alignSelf: 'center',
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: GLASS_OUTLINE,
          shadowColor: '#111111',
          shadowOpacity: 0.1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <View
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
          style={{
            flexDirection: 'row',
            height: barHeight,
            paddingHorizontal: padH,
            borderRadius: radius,
            overflow: 'hidden',
            borderWidth: RIM_W,
            borderColor: GLASS_RIM,
          }}
        >
          {HAS_BLUR ? (
            <BlurLib.BlurView
              pointerEvents="none"
              intensity={Platform.OS === 'ios' ? 60 : 40}
              tint={Platform.OS === 'ios' ? 'systemChromeMaterialLight' : 'light'}
              blurMethod="dimezisBlurView"
              blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {/* White wash + top sheen — the "glass" body and its highlight. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_WASH }]} />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barHeight * 0.55 }}
          />


          {routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label = options.tabBarLabel ?? options.title ?? route.name;
            const Icon = OWNER_TAB_ICONS[route.name] || House;
            const isFocused = index === activeIndex;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

            return (
              <TabBarItem
                key={route.key}
                Icon={Icon}
                label={label}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                iconSize={iconSize}
                activeIconSize={activeIconSize}
                labelSize={labelSize}
              />
            );
          })}
        </View>

        {/* Active tab: teal circle + white ring, floating above the glass
            (outside its clip) and gliding between tabs. */}
        {itemW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: circTop,
                width: circ,
                height: circ,
                borderRadius: circ / 2,
                backgroundColor: NAV_TEAL,
                borderWidth: rs(4),
                borderColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#111111',
                shadowOpacity: 0.16,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 5,
              },
              circleStyle,
            ]}
          >
            <ActiveIcon size={activeIconSize} color="#FFFFFF" strokeWidth={2.3} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

// Android: the tab screens + bar sit inside the BlurTargetView the glass blurs.
const glassLayout = HAS_BLUR && Platform.OS === 'android'
  ? ({ children }) => (
    <BlurLib.BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>{children}</BlurLib.BlurTargetView>
  )
  : undefined;

function OwnerTabs({ onLogout }) {
  return (
    <Tab.Navigator
      layout={glassLayout}
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" options={{ title: 'Home' }}>
        {(props) => <DashboardScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen name="Bookings" component={BookingHistoryScreen} />
      <Tab.Screen name="Buy" component={OwnerBuyHomeScreen} options={{ title: 'Buy' }} />
      <Tab.Screen
        name="Sell"
        component={OwnerSellHubScreen}
        options={{ title: 'Sell' }}
        initialParams={{ flow: 'OWNER_LIST' }}
      />
      <Tab.Screen name="MyAccount" options={{ title: 'Settings' }}>
        {(props) => <MyAccountScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ── Subscription access gate ──────────────────────────────────────────────
// After login, check the owner's subscription. If it is affirmatively EXPIRED
// or CANCELLED, lock the app to the Subscription screen until a plan is
// activated. CRITICAL: this FAILS OPEN — any error, timeout, missing id, null
// row, or unknown status grants full access, so a subscription-service outage
// can never lock owners out of the app.
function useOwnerAccess(session) {
  const [state, setState] = useState('loading'); // 'loading' | 'full' | 'blocked'

  const check = useCallback(async () => {
    const uid = session?.userId || session?.id || null;
    if (!uid) { setState('full'); return; }
    setState('loading');
    try {
      const timeout = new Promise((resolve) => setTimeout(() => resolve('__timeout__'), 5000));
      const res = await Promise.race([
        subscriptionApi.get(`/subscriptions/owner/${uid}`),
        timeout,
      ]);
      if (res === '__timeout__') { setState('full'); return; }
      const status = res?.status;
      // Gate ONLY on an affirmative expired/cancelled status. ACTIVE, FREE_TRIAL,
      // null (no row) and anything unexpected → full access.
      setState(status === 'EXPIRED' || status === 'CANCELLED' ? 'blocked' : 'full');
    } catch {
      setState('full');
    }
  }, [session]);

  useEffect(() => { check(); }, [check]);
  return { state, recheck: check };
}

function GateLoader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color="#035C6C" />
    </View>
  );
}

export default function OwnerNavigator({ session, onLogout }) {
  const { state, recheck } = useOwnerAccess(session);

  if (state === 'loading') return <GateLoader />;
  // Trial expired / subscription lapsed → lock to the Subscription screen.
  if (state === 'blocked') {
    return <SubscriptionScreen gated onUnlock={recheck} onLogout={onLogout} />;
  }

  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.headerBg },
        headerShadowVisible: true,
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontSize: 17, fontWeight: '800', color: colors.headerText },
        headerTitleAlign: 'center',
        headerTitleAllowFontScaling: false,
        headerLeft: () => {
          if (!navigation.canGoBack()) return null;
          return <BackButton onPress={() => navigation.goBack()} />;
        },
        headerBackVisible: false,
      })}
    >
      <Stack.Screen name="OwnerTabs" options={{ headerShown: false }}>
        {(props) => <OwnerTabs {...props} onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen name="RepairServiceBookingShop" component={RepairServiceBookingShop} options={{ headerShown: false }} />
      <Stack.Screen name="ScanQrCode" component={ScanQrCodeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ScanImei" component={ScanImeiScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DevicePhotoCapture" component={DevicePhotoCaptureScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShopServiceStatus" component={ShopServiceStatusScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeviceDetail" component={DeviceDetailScreen} options={{ headerShown: false }} />
      {/* Removed: EditBooking + Legacy device screens — registered but never
          navigated to. The live Edit flow uses the RepairServiceBookingShop
          wizard, and EditBooking also carried customerApproved/field bugs. */}
      <Stack.Screen name="BookingSummary" component={BookingSummaryScreen} options={{ title: 'Booking Successful' }} />
      <Stack.Screen name="BookingTimeline" component={BookingTimelineScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BarcodePrint" component={BarcodePrintScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeliveryInvoice" component={DeliveryInvoiceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="InvoiceGenerator" component={InvoiceGeneratorScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeliveryInvoiceReport" component={DeliveryInvoiceReportScreen} options={{ headerShown: false }} />
      {/* Stack copy of the Bookings tab list. Pushed (not switched-to) so a
          status preset — e.g. { preset: 'ACTIVE' } from the Home snapshot —
          lives on its own screen instance with a real back button, instead of
          sticking to the Bookings tab the next time the bar is tapped. */}
      <Stack.Screen name="BookingList" component={BookingHistoryScreen} options={{ headerShown: false }} />
      {/* The BookingHistoryLog mount is gone with the Home "History" shortcut
          that was its only entry point — it was a third copy of this same list
          whose only difference was what a card tap did. A booking's history is
          now a button on the booking's own card in the Bookings list, so it is
          reached from the row it describes instead of from a parallel list you
          had to find that row in again. BookingTimeline (below) is unchanged. */}
      <Stack.Screen name="BookingStatus" component={BookingStatusScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookingStatusReport" component={BookingStatusReportScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookingPreviousReport" component={BookingPreviousReportScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LegacyAssignTechnician" component={AssignTechnicianScreen} options={{ title: 'Assign Technician' }} />
      <Stack.Screen name="MarketplaceSell" component={MarketplaceSellScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerCart" component={OwnerCartScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerNotifications" component={OwnerNotificationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSearch" component={OwnerSearchScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ScanSearch" component={ScanSearchScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProductScan" component={ProductScanScreen} options={{ headerShown: false }} />
      {/* Buy listing (search / category results) and the previous Sell home,
          now opened from the Customer-style Buy / Sell tabs. */}
      <Stack.Screen name="OwnerBuyListing" component={OwnerBuyListingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellHome" component={OwnerSellHomeScreen} options={{ headerShown: false }} initialParams={{ flow: 'OWNER_LIST' }} />
      <Stack.Screen name="OwnerBuyListingDetails" component={OwnerBuyListingDetailsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellRequests" component={SellRequestsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellMobile" component={OwnerSellMobileChoiceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellSpareParts" component={OwnerSellSparePartsScreen} options={{ headerShown: false }} />
      {/* Sell: category → the booking flow's one-page Device Details picker. */}
      <Stack.Screen name="SellDeviceDetails" component={SellDeviceDetailsScreen} options={{ headerShown: false }} />
      {/* Shared device pickers — screens render their own ScreenHeader, so
          hide the native stack header to avoid the "two headers stacked" bug. */}
      <Stack.Screen name="SelectCategory" component={SelectCategoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectBrand" component={SelectBrandScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectSeries" component={SelectSeriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectModel" component={SelectModelScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectVariant" component={SelectVariantScreen} options={{ headerShown: false }} />
      {/* Shared sell-flow screens (also registered in the customer stack). */}
      <Stack.Screen name="SellScreening" component={SellScreeningScreen} options={{ title: 'Screening Question' }} />
      <Stack.Screen name="SellScreenCondition" component={SellScreenConditionScreen} options={{ title: 'Screen' }} />
      <Stack.Screen name="SellFunctional" component={SellFunctionalScreen} options={{ title: 'Functional' }} />
      <Stack.Screen name="SellDeviceConfig" component={SellDeviceConfigScreen} options={{ title: 'Device Configuration' }} />
      <Stack.Screen name="SellAccessoriesWarranty" component={SellAccessoriesWarrantyScreen} options={{ title: 'Accessories & Warranty' }} />
      <Stack.Screen name="SellImages" component={SellImagesScreen} options={{ title: 'Sell Device Images' }} />
      <Stack.Screen name="OwnerSellGadgetPrice" component={OwnerSellGadgetPriceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellListed" component={OwnerSellListedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MarketplaceOrders" component={MarketplaceOrdersScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MarketplaceListingDetails" component={MarketplaceListingDetailsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Inventory' }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name="OwnerRevenue" component={OwnerRevenueScreen} options={{ headerShown: false }} />
      {/* The cash book and its two account screens render their own headers, so
          the native one is off across the flow — a native bar appearing only on
          the middle screen of three would read as a different app. */}
      <Stack.Screen name="OwnerCashBook" component={OwnerCashBookScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerLedgerPartyAdd" component={OwnerLedgerPartyAddScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerContactPicker" component={OwnerContactPickerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerLedgerPartyDetail" component={OwnerLedgerPartyDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerLedgerEntryAdd" component={OwnerLedgerEntryAddScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerLedgerStatement" component={OwnerLedgerStatementScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerPersonalInfo" component={OwnerPersonalInfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerShopInfo" component={OwnerShopInfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerKycIntro" component={OwnerKycIntroScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerKycUpload" component={OwnerKycUploadScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerKycReview" component={OwnerKycReviewScreen} options={{ title: 'KYC Documents' }} />
      <Stack.Screen name="OwnerKycPending" component={OwnerKycPendingScreen} options={{ title: 'KYC Status' }} />
      <Stack.Screen name="OwnerKycView" component={OwnerKycViewScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="OwnerPickupSlots"
        component={OwnerPickupSlotsScreen}
        options={({ navigation }) => ({
          title: 'Pickup Service',
          headerStyle: { backgroundColor: '#035C6C' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
          headerLeft: () => navigation.canGoBack() ? <GreenHeaderBack onPress={() => navigation.goBack()} /> : null,
        })}
      />
      <Stack.Screen name="OwnerPickupServiceList" component={OwnerPickupServiceListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerPickupServiceDetail" component={OwnerPickupServiceDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerPickupHistory" component={PickupHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerEmployeeList" component={OwnerEmployeeListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerEmployeeAdd" component={OwnerEmployeeAddScreen} options={{ title: 'Add Staff' }} />
      <Stack.Screen
        name="OwnerEmployeeDetail"
        component={OwnerEmployeeDetailScreen}
        options={{
          title: 'Employee Details',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen name="OwnerEmployeeCreated" component={OwnerEmployeeCreatedScreen} options={{ title: 'Employee Created', headerShown: false }} />
      <Stack.Screen
        name="OwnerEmployeeAttendance"
        component={OwnerEmployeeAttendanceScreen}
        options={{
          title: 'Attendance',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen name="OwnerStaffReport" component={OwnerStaffReportScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="OwnerEmployeeLeave"
        component={OwnerEmployeeLeaveScreen}
        options={{
          title: 'Leave details',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeePermission"
        component={OwnerEmployeePermissionScreen}
        options={{
          title: 'Permission Report',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeeSalaryReport"
        component={OwnerEmployeeSalaryReportScreen}
        options={{
          title: 'Salary Report',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeePayslip"
        component={OwnerEmployeePayslipScreen}
        options={{
          title: 'Pay Slip',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeeShiftDetails"
        component={OwnerEmployeeShiftDetailsScreen}
        options={{
          title: 'Shift details',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      {/* Both report screens serve two modes. Opened from an employee's detail
          page they carry an `employee` param and show that one person; opened
          from the dashboard tiles they carry no param and show every technician
          / pickup person. The title follows, so the header never says "Working
          Record" over a list that spans the whole team. */}
      <Stack.Screen
        name="OwnerEmployeeWorkingRecord"
        component={OwnerJobReportScreen}
        // Draws its own header (Employee app's Job Report design):
        // "Job's Report" from the tile, "Working Record" for one employee.
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OwnerEmployeePickupReport"
        component={OwnerEmployeePickupReportScreen}
        options={({ route }) => ({
          title: route?.params?.employee ? 'Pickup report' : 'Pickup Report',
        })}
      />
      <Stack.Screen name="OwnerEmployeeAddAdvance" component={OwnerEmployeeAddAdvanceScreen} options={{ title: 'Add advance' }} />
      <Stack.Screen
        name="OwnerEmployeeApplyLeave"
        component={OwnerEmployeeApplyLeaveScreen}
        options={{
          title: 'Apply for leave',
          headerTitleAlign: 'center',
          headerTintColor: '#035C6C',
          headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
        }}
      />
      <Stack.Screen name="OwnerLeaveRequests" component={OwnerLeaveRequestsScreen} options={{ headerShown: false }} />
      {/* Same screen, PERMISSION-type requests only (Dashboard → Permissions). */}
      <Stack.Screen name="OwnerPermissionRequests" component={OwnerLeaveRequestsScreen} initialParams={{ kind: 'PERMISSION' }} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerQrCode" component={OwnerQrCodeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerModelCompatibility" component={OwnerModelCompatibilityScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShopChatInbox" component={ShopChatInboxScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShopChatThread" component={ShopChatThreadScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSubscription" component={SubscriptionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Terms" component={LegalDocumentScreen} initialParams={{ type: 'TERMS' }} options={{ headerShown: false }} />
      <Stack.Screen name="PrivacyPolicy" component={LegalDocumentScreen} initialParams={{ type: 'PRIVACY' }} options={{ headerShown: false }} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
