import React from 'react';
import { ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CalendarClock,
  FileText,
  LogOut,
  Package,
  PlusCircle,
  QrCode,
  ShoppingCart,
  Store,
  Truck,
  User,
  Users,
} from 'lucide-react-native';
import type { AccountMenuItem, SessionData, ShopSummary, SheetMode } from '../../types/dashboard';
import {
  C,
  Group,
  GLASS,
  IconSquare,
  Row,
  RowGroup,
  SHEET_RADIUS,
  T,
  Touchable,
  shopInitial,
} from './theme';
import { DashboardSection } from './DashboardSection';

// Mirrors the My Account screen's profile list. KYC routes to View/Intro based on submission.
const ACCOUNT_MENU: AccountMenuItem[] = [
  { route: 'OwnerPersonalInfo', label: 'Personal Information', sub: 'Name, mobile, email', icon: User, color: C.tone },
  { route: 'OwnerQrCode', label: 'My QR Code', sub: 'Share your shop', icon: QrCode, color: C.toneLime },
  { route: 'OwnerShopInfo', label: 'Shop Information', sub: 'Address, hours, GST', icon: Store, color: C.tone },
  { route: 'KYC', label: 'KYC Documents', sub: 'Aadhar, PAN, GST / Udyam', icon: FileText, color: C.toneDeep },
  { route: 'OwnerPickupSlots', label: 'Pickup Service', sub: 'On/off, slots & zones', icon: Truck, color: C.tone },
  { route: 'MarketplaceOrders', label: 'My Orders', sub: 'Marketplace purchases', icon: Package, color: C.toneDeep },
  { route: 'OwnerCart', label: 'My Cart', sub: 'Items in your cart', icon: ShoppingCart, color: C.toneLime },
  { route: 'OwnerEmployeeList', label: 'Employee Management', sub: 'Add, edit & track team', icon: Users, color: C.tone },
  { route: 'OwnerLeaveRequests', label: 'Leave Requests', sub: 'Approve or reject leave', icon: CalendarClock, color: C.warn },
];

export interface DashboardAccountSheetProps {
  rendered: boolean;
  anim: Animated.Value;
  insets: EdgeInsets;
  session: SessionData | null;
  shopName: string;
  shopImage: string | null;
  shops: ShopSummary[];
  canAddShop: boolean;
  showShopList: boolean;
  switching: boolean;
  hasKycDocs: boolean;
  mode: SheetMode;
  onToggleShopList: () => void;
  onSwitch: (shopId: string) => void;
  onClose: () => void;
  onNavigate: (route: string) => void;
  onLogout: () => void;
  onAddShop: () => void;
}

/**
 * Account sheet — slides up from the bottom with a grabber, an inset-grouped
 * menu, a shop switcher and a destructive Log Out group. `mode: 'shops'`
 * (the ⇄ header button) shows the switcher only, with no settings menu.
 */
export function DashboardAccountSheet({
  rendered,
  anim,
  insets,
  session,
  shopName,
  shopImage,
  shops,
  canAddShop,
  showShopList,
  switching,
  hasKycDocs,
  mode = 'account',
  onToggleShopList,
  onSwitch,
  onClose,
  onNavigate,
  onLogout,
  onAddShop,
}: DashboardAccountSheetProps) {
  const { height: winH } = useWindowDimensions();
  const shopsOnly = mode === 'shops';
  const sheetH = Math.min(winH * (shopsOnly ? 0.58 : 0.9), winH - Math.max(insets.top, 24) - 10);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] });
  const canSwitch = session?.loginScope !== 'SHOP';

  const listOpen = shopsOnly || showShopList;
  const shopRows: React.ReactElement[] = shopsOnly
    ? []
    : [
        <Row
          key="manage"
          leading={<IconSquare icon={Store} color={C.tone} />}
          title="Manage Account"
          subtitle={shops.length > 1 ? `Switch between ${shops.length} shops` : shopName || 'Your shop'}
          onPress={onToggleShopList}
        />,
      ];
  if (listOpen) {
    if (shops.length === 0) {
      shopRows.push(<Row key="none" title="No other shops linked" titleColor={C.label2} accessory="none" />);
    } else {
      shops.forEach((s) => {
        const active = s.id === session?.shopId;
        shopRows.push(
          <Row
            key={s.id}
            leading={<IconSquare icon={Store} color={active ? C.tone : C.muted} />}
            title={s.name}
            subtitle={s.slug || undefined}
            titleColor={active ? C.tint : C.label}
            accessory={active ? 'check' : 'none'}
            disabled={switching || active}
            onPress={active ? undefined : () => onSwitch(s.id)}
          />,
        );
      });
    }
    if (canAddShop) {
      shopRows.push(
        <Row key="add" leading={<IconSquare icon={PlusCircle} color={C.tone} />} title="Add Shop" titleColor={C.tint} onPress={onAddShop} />,
      );
    }
  }

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, opacity: anim }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={{
            height: sheetH,
            backgroundColor: C.groupedBg,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            transform: [{ translateY }],
            overflow: 'hidden',
            shadowColor: '#0B1F14',
            shadowOpacity: 0.24,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: -8 },
            elevation: 16,
          }}
        >
          <LinearGradient
            colors={['#F0F8EF', C.groupedBg]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
            pointerEvents="none"
          />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: SHEET_RADIUS, right: SHEET_RADIUS, height: 1, backgroundColor: GLASS.edge }} />

          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(23, 33, 23, 0.3)' }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 46 }}>
            <View style={{ width: 52 }} />
            <Text style={{ flex: 1, textAlign: 'center', fontSize: T.headline, fontWeight: '600', color: C.label, letterSpacing: -0.4 }} numberOfLines={1}>
              {shopsOnly ? 'Switch Account' : 'Account'}
            </Text>
            <Touchable onPress={onClose} accessibilityRole="button" hitSlop={8} style={{ width: 52, alignItems: 'flex-end' }} pressedStyle={{ opacity: 0.4 }}>
              <Text style={{ fontSize: T.body, color: C.tint, fontWeight: '600' }}>Done</Text>
            </Touchable>
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.separator }} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 18, paddingBottom: (insets.bottom || 12) + 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Group pad={16}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                <View style={{ height: 56, width: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  {shopImage ? (
                    <Image source={{ uri: shopImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: T.title3 }}>{shopInitial(shopName)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: T.title3, fontWeight: '600', color: C.label, letterSpacing: -0.4 }} numberOfLines={1}>
                    {session?.name || 'Shop Owner'}
                  </Text>
                  <Text style={{ fontSize: T.subhead, color: C.label2, marginTop: 2 }} numberOfLines={1}>
                    {shopName}
                  </Text>
                </View>
              </View>
            </Group>

            {canSwitch ? (
              <View style={{ marginTop: 24 }}>
                <DashboardSection title={shopsOnly ? 'Your Shops' : 'Shop'} pad={16} />
                <Group pad={16}>
                  <RowGroup>{shopRows}</RowGroup>
                </Group>
                {switching ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>
                    <ActivityIndicator size="small" color={C.placeholder} />
                    <Text style={{ marginLeft: 8, fontSize: T.footnote, color: C.label2 }}>Switching shop…</Text>
                  </View>
                ) : null}
              </View>
            ) : shopsOnly ? (
              <View style={{ marginTop: 24 }}>
                <Group pad={16}>
                  <Row leading={<IconSquare icon={Store} color={C.muted} />} title="Single-shop login" subtitle="This login is tied to one shop" accessory="none" last />
                </Group>
              </View>
            ) : null}

            {shopsOnly ? null : (
              <View style={{ marginTop: 24 }}>
                <DashboardSection title="Settings" pad={16} />
                <Group pad={16}>
                  <RowGroup>
                    {ACCOUNT_MENU.map((m) => (
                      <Row
                        key={m.route}
                        leading={<IconSquare icon={m.icon} color={m.color} />}
                        title={m.label}
                        subtitle={m.sub}
                        onPress={() => onNavigate(m.route === 'KYC' ? (hasKycDocs ? 'OwnerKycView' : 'OwnerKycIntro') : m.route)}
                      />
                    ))}
                  </RowGroup>
                </Group>
              </View>
            )}

            {shopsOnly ? null : (
              <View style={{ marginTop: 24 }}>
                <Group pad={16}>
                  <Touchable
                    onPress={onLogout}
                    accessibilityRole="button"
                    style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
                    pressedStyle={{ backgroundColor: C.highlight }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <LogOut size={17} color={C.error} strokeWidth={2} />
                      <Text style={{ fontSize: T.body, color: C.error, marginLeft: 8, letterSpacing: -0.4 }}>Log Out</Text>
                    </View>
                  </Touchable>
                </Group>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
