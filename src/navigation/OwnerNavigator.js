import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, LayoutGrid, FileText, Receipt, Settings, ShoppingBag, Tag } from 'lucide-react-native';
import colors from '../theme/colors';
import BackButton from '../components/BackButton';

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
import BillingScreen from '../screens/owner/BillingScreen';
import BookingStatusScreen from '../screens/owner/BookingStatusScreen';
import BookingStatusReportScreen from '../screens/owner/BookingStatusReportScreen';
import BookingPreviousReportScreen from '../screens/owner/BookingPreviousReportScreen';
import OwnerBuyListingDetailsScreen from '../screens/owner/OwnerBuyListingDetailsScreen';
import OwnerBuyListingScreen from '../screens/owner/OwnerBuyListingScreen';
import OwnerCartScreen from '../screens/owner/OwnerCartScreen';
import OwnerNotificationsScreen from '../screens/owner/OwnerNotificationsScreen';
import OwnerSearchScreen from '../screens/owner/OwnerSearchScreen';
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
import OwnerSellChooseSalesCategoryScreen from '../screens/owner/OwnerSellChooseSalesCategoryScreen';
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
import OwnerEmployeeWorkingRecordScreen from '../screens/owner/OwnerEmployeeWorkingRecordScreen';
import OwnerEmployeePickupReportScreen from '../screens/owner/OwnerEmployeePickupReportScreen';
import OwnerEmployeeAddAdvanceScreen from '../screens/owner/OwnerEmployeeAddAdvanceScreen';
import OwnerEmployeeApplyLeaveScreen from '../screens/owner/OwnerEmployeeApplyLeaveScreen';
import OwnerQrCodeScreen from '../screens/owner/OwnerQrCodeScreen';
import OwnerModelCompatibilityScreen from '../screens/owner/OwnerModelCompatibilityScreen';
import RepairServiceBookingShop from '../screens/owner/service-booking-shop/RepairServiceBookingShop';
import ScanImeiScreen from '../screens/owner/service-booking-shop/ScanImeiScreen';
import ScanQrCodeScreen from '../screens/owner/service-booking-shop/ScanQrCodeScreen';
import ShopServiceStatusScreen from '../screens/owner/ShopServiceStatusScreen';
import OwnerLeaveRequestsScreen from '../screens/owner/OwnerLeaveRequestsScreen';
import ShopChatInboxScreen from '../screens/owner/chat/ShopChatInboxScreen';
import ShopChatThreadScreen from '../screens/owner/chat/ShopChatThreadScreen';
import SubscriptionScreen from '../screens/owner/SubscriptionScreen';
import { subscriptionApi } from '../api/client';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const OWNER_TAB_ICONS = {
  Home: LayoutGrid,
  Bookings: FileText,
  Billing: Receipt,
  Buy: ShoppingBag,
  Sell: Tag,
  MyAccount: Settings,
};

// Routes registered on the tab navigator but intentionally NOT shown in the
// bar. Billing (Invoices) stays navigable from the Dashboard, just off the bar.
const HIDDEN_TABS = ['Billing'];

/**
 * iOS / WhatsApp-style bottom bar: black icons + black labels with a
 * translucent "glass" pill that slides to the active tab (spring animation).
 */
function GlassTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => !HIDDEN_TABS.includes(r.name));
  const [barW, setBarW] = useState(0);

  const HPAD = 6;         // container horizontal padding
  const PILL_INSET = 8;   // gap between a slot edge and the pill
  const count = routes.length || 1;
  const slot = barW > 0 ? (barW - HPAD * 2) / count : 0;

  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(0, routes.findIndex((r) => r.key === activeKey));

  const anim = useRef(new Animated.Value(activeIndex)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 14,
      tension: 120,
    }).start();
  }, [activeIndex, slot]);

  const translateX = anim.interpolate({
    inputRange: routes.map((_, i) => i),
    outputRange: routes.map((_, i) => HPAD + i * slot + PILL_INSET),
    extrapolate: 'clamp',
  });

  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: 8,
        paddingBottom: insets.bottom || 10,
        paddingHorizontal: 14,
      }}
    >
      {/* Floating rounded capsule (iOS style) */}
      <View
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: 30,
          paddingHorizontal: HPAD,
          height: 62,
          borderWidth: 1,
          borderColor: 'rgba(23, 33, 23, 0.06)',
          shadowColor: '#172117',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        {/* Sliding translucent "glass" pill */}
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 8,
              left: 0,
              width: slot - PILL_INSET * 2,
              height: 46,
              borderRadius: 18,
              backgroundColor: 'rgba(23, 33, 23, 0.06)',
              borderWidth: 1,
              borderColor: 'rgba(23, 33, 23, 0.05)',
              shadowColor: '#172117',
              shadowOpacity: 0.05,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              transform: [{ translateX }],
            }}
          />
        ) : null}

        {routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const Icon = OWNER_TAB_ICONS[route.name] || LayoutGrid;
          const isFocused = index === activeIndex;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={{ width: slot, height: 46, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon size={21} color="#172117" strokeWidth={isFocused ? 2.5 : 1.9} />
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={{ fontSize: 10.5, marginTop: 3, color: '#172117', fontWeight: isFocused ? '800' : '600' }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OwnerTabs({ onLogout }) {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" options={{ title: 'Home' }}>
        {(props) => <DashboardScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen name="Bookings" component={BookingHistoryScreen} />
      <Tab.Screen name="Billing" component={BillingScreen} options={{ tabBarLabel: 'Invoices' }} />
      <Tab.Screen name="Buy" component={OwnerBuyListingScreen} options={{ title: 'Buy' }} />
      <Tab.Screen
        name="Sell"
        component={OwnerSellHomeScreen}
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
      <ActivityIndicator size="large" color="#087A0A" />
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
        headerTitleStyle: { fontSize: 17, fontWeight: '700', color: colors.headerText },
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
      <Stack.Screen name="OwnerBuyListingDetails" component={OwnerBuyListingDetailsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellMobile" component={OwnerSellMobileChoiceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellSpareParts" component={OwnerSellSparePartsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSellChooseSalesCategory" component={OwnerSellChooseSalesCategoryScreen} options={{ headerShown: false }} />
      {/* Shared device pickers — screens render their own ScreenHeader, so
          hide the native stack header to avoid the "two headers stacked" bug. */}
      <Stack.Screen name="SelectCategory" component={SelectCategoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectBrand" component={SelectBrandScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectSeries" component={SelectSeriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectModel" component={SelectModelScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectVariant" component={SelectVariantScreen} options={{ title: 'Your Device' }} />
      {/* Shared sell-flow screens (also registered in the customer stack). */}
      <Stack.Screen name="SellScreening" component={SellScreeningScreen} options={{ title: 'Screening Question' }} />
      <Stack.Screen name="SellScreenCondition" component={SellScreenConditionScreen} options={{ title: 'Screen' }} />
      <Stack.Screen name="SellFunctional" component={SellFunctionalScreen} options={{ title: 'Functional' }} />
      <Stack.Screen name="SellDeviceConfig" component={SellDeviceConfigScreen} options={{ title: 'Device Configuration' }} />
      <Stack.Screen name="SellAccessoriesWarranty" component={SellAccessoriesWarrantyScreen} options={{ title: 'Accessoires & Warranty' }} />
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
      <Stack.Screen name="OwnerKycUpload" component={OwnerKycUploadScreen} options={{ title: 'KYC Documents' }} />
      <Stack.Screen name="OwnerKycReview" component={OwnerKycReviewScreen} options={{ title: 'KYC Documents' }} />
      <Stack.Screen name="OwnerKycPending" component={OwnerKycPendingScreen} options={{ title: 'KYC Status' }} />
      <Stack.Screen name="OwnerKycView" component={OwnerKycViewScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="OwnerPickupSlots"
        component={OwnerPickupSlotsScreen}
        options={({ navigation }) => ({
          title: 'Pickup Service',
          headerStyle: { backgroundColor: '#087A0A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
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
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      <Stack.Screen name="OwnerEmployeeCreated" component={OwnerEmployeeCreatedScreen} options={{ title: 'Employee Created', headerShown: false }} />
      <Stack.Screen
        name="OwnerEmployeeAttendance"
        component={OwnerEmployeeAttendanceScreen}
        options={{
          title: 'Attendance',
          headerTitleAlign: 'center',
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      <Stack.Screen name="OwnerStaffReport" component={OwnerStaffReportScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="OwnerEmployeeLeave"
        component={OwnerEmployeeLeaveScreen}
        options={{
          title: 'Leave details',
          headerTitleAlign: 'center',
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeeSalaryReport"
        component={OwnerEmployeeSalaryReportScreen}
        options={{
          title: 'Salary Report',
          headerTitleAlign: 'center',
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeePayslip"
        component={OwnerEmployeePayslipScreen}
        options={{
          title: 'Pay Slip',
          headerTitleAlign: 'center',
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      <Stack.Screen
        name="OwnerEmployeeShiftDetails"
        component={OwnerEmployeeShiftDetailsScreen}
        options={{
          title: 'Shift details',
          headerTitleAlign: 'center',
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      {/* Both report screens serve two modes. Opened from an employee's detail
          page they carry an `employee` param and show that one person; opened
          from the dashboard tiles they carry no param and show every technician
          / pickup person. The title follows, so the header never says "Working
          Record" over a list that spans the whole team. */}
      <Stack.Screen
        name="OwnerEmployeeWorkingRecord"
        component={OwnerEmployeeWorkingRecordScreen}
        options={({ route }) => ({
          title: route?.params?.employee ? 'Working Record' : 'Service Report',
          headerTitleAlign: 'center',
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        })}
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
          headerTintColor: '#087A0A',
          headerTitleStyle: { color: '#172117', fontWeight: '800', fontSize: 20 },
        }}
      />
      <Stack.Screen name="OwnerLeaveRequests" component={OwnerLeaveRequestsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerQrCode" component={OwnerQrCodeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerModelCompatibility" component={OwnerModelCompatibilityScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShopChatInbox" component={ShopChatInboxScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShopChatThread" component={ShopChatThreadScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OwnerSubscription" component={SubscriptionScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
