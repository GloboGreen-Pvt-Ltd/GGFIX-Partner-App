import React from 'react';
import { Animated, Text, View, useWindowDimensions } from 'react-native';
import { Bell, Check, ShoppingCart, X } from 'lucide-react-native';
import {
  BADGE_ICON_SIZE,
  BADGE_STROKE,
  C,
  getSizeClass,
  HAIRLINE,
  HEADER_ACTION_STROKE,
  MIN_TOUCH,
  PINE,
  SERIF,
  SHOP_NAME_COLOR,
  T,
  Touchable,
  UNVERIFIED_ICON,
  VERIFIED_ICON,
} from './theme';
import { DashboardSearchBar } from './DashboardSearchBar';
import colors from '../../theme/colors';
import { ProfileAvatar } from '../ProfileAvatar';

// Soft brand tint behind the header + search (the reference's lavender band, in teal).
const HEADER_TINT = '#E2F2F4';
const VERIFIED_GREEN = '#16A34A';
const UNVERIFIED_RED = '#DC2626';

// Hit-slop that pads a button's real (compact) footprint out to the
// accessibility minimum touch target, without growing what's actually drawn.
function hitSlopFor(size: number) {
  const p = Math.max(0, Math.ceil((MIN_TOUCH - size) / 2));
  return { top: p, bottom: p, left: p, right: p };
}

export interface DashboardHeaderProps {
  insetsTop: number;
  pad: number;
  greeting: string;
  shopName: string;
  shopImage: string | null;
  isVerified: boolean;
  notifUnread: number;
  onAvatarPress: () => void;
  onIdentityPress: () => void;
  onSwitchAccountPress: () => void;
  onNotificationsPress: () => void;
  onCartPress: () => void;
  onSearchPress: () => void;
  onScanPress: (mode: 'qr' | 'lens') => void;
  onVoicePress?: () => void;
  /** Scrolling down hides the avatar / greeting row (search stays); scrolling up brings it back. */
  collapsed?: boolean;
  /** Full header height, so the page can pad its scroll content to clear it. */
  onHeightChange?: (height: number) => void;
}

/**
 * Static identity header — avatar + greeting/shop name on the left,
 * switch-account/notifications/cart on the right, search bar directly
 * below, all inside one tablet-centered container. Rendered as a normal
 * document-flow sibling ABOVE the scroll content (never absolutely
 * positioned), so it can neither overlap nor be overlapped by it — the
 * previous floating-overlay version relied on measuring its own height
 * after first paint to keep the scroll view's top padding in sync, which
 * is exactly the class of bug (content briefly/persistently underlapping
 * the header) normal flow removes by construction.
 */
export function DashboardHeader({
  insetsTop,
  pad,
  greeting,
  shopName,
  shopImage,
  isVerified,
  notifUnread,
  onAvatarPress,
  onIdentityPress,
  onSwitchAccountPress,
  onNotificationsPress,
  onCartPress,
  onSearchPress,
  onScanPress,
  onVoicePress,
  collapsed = false,
  onHeightChange,
}: DashboardHeaderProps) {
  // The header floats over the page (fixed height, so the scroll never jumps).
  // Collapsing slides it up by the identity row's height — only the search bar
  // stays under the status bar — and fades that row; all on the native driver.
  const [rowH, setRowH] = React.useState(0);
  const fold = React.useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  React.useEffect(() => {
    Animated.timing(fold, { toValue: collapsed ? 0 : 1, duration: 220, useNativeDriver: true }).start();
  }, [collapsed, fold]);

  const { width } = useWindowDimensions();
  const cls = getSizeClass(width);
  const isTablet = cls === 'tablet';

  // Tablet gets a centered, width-capped inner container instead of every
  // element stretching across the full screen width; phone just fills it.
  const maxContentWidth = isTablet ? 1000 : undefined;

  const avatarSize = isTablet ? 44 : 38;
  const shopNameSize = isTablet ? 22 : cls === 'large' ? 20 : 19;
  const greetingSize = isTablet ? 14 : 13;
  const actionIconSize = isTablet ? 16 : 14;
  const actionButtonSize = isTablet ? 38 : 34;
  const actionGap = isTablet ? 14 : 8;

  const avatarHitSlop = hitSlopFor(avatarSize);
  // Outlined white circle behind each header action icon — the Customer
  // app's Home header (IconCircle) treatment.
  const actionButtonStyle = {
    width: actionButtonSize,
    height: actionButtonSize,
    borderRadius: actionButtonSize / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View
      pointerEvents="box-none"
      // zIndex for iOS; elevation for Android, where the page's raised cards
      // (elevation > 0) would otherwise draw over the floating header.
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, elevation: 20 }}
    >
    <Animated.View
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
      style={{
        backgroundColor: HEADER_TINT, paddingTop: insetsTop,
        transform: [{ translateY: fold.interpolate({ inputRange: [0, 1], outputRange: [-rowH, 0] }) }],
      }}
    >
      <View style={{ width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', paddingHorizontal: pad }}>
        <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={{ opacity: fold }}>
        <View
          onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0 && Math.abs(h - rowH) > 0.5) setRowH(h); }}
          style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 10 }}
        >
          {/* Left (reference: bold ETA line + address line with ▾): verified
              greeting on top, then the shop name. */}
          <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            {/* Greeting on top (taps open the shop switcher)… */}
            <Touchable
              onPress={onSwitchAccountPress}
              accessibilityRole="button"
              accessibilityLabel={`${greeting}. Switch shop`}
              style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <Text style={{ fontSize: greetingSize, color: C.label2 }} numberOfLines={1}>{greeting}</Text>
            </Touchable>
            {/* …then the shop name (taps open the account sheet). */}
            <Touchable
              onPress={onIdentityPress}
              accessibilityRole="button"
              accessibilityLabel={shopName}
              style={{ alignSelf: 'flex-start', maxWidth: '100%', marginTop: 1 }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <Text style={{ fontSize: shopNameSize, lineHeight: shopNameSize + 5, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
                {shopName}
              </Text>
            </Touchable>
          </View>

          {/* Right: notifications · cart · profile (the reference's profile circle). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: actionGap }}>
            <Touchable
              onPress={onNotificationsPress}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={{ ...actionButtonStyle, backgroundColor: '#FFFFFF' }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <Bell size={actionIconSize} color="#111111" strokeWidth={HEADER_ACTION_STROKE} />
              {notifUnread > 0 ? (
                <View
                  style={{
                    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, borderWidth: 1.5, borderColor: '#FFFFFF',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{notifUnread > 9 ? '9+' : notifUnread}</Text>
                </View>
              ) : null}
            </Touchable>
            <Touchable
              onPress={onCartPress}
              accessibilityRole="button"
              accessibilityLabel="Cart"
              style={{ ...actionButtonStyle, backgroundColor: '#FFFFFF' }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <ShoppingCart size={actionIconSize} color="#111111" strokeWidth={HEADER_ACTION_STROKE} />
            </Touchable>
            <View>
            <Touchable
              onPress={onAvatarPress}
              accessibilityRole="button"
              accessibilityLabel={isVerified ? 'Account, verified shop' : 'Account, shop not verified'}
              hitSlop={avatarHitSlop}
              style={{ height: avatarSize, width: avatarSize }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <ProfileAvatar
                imageUrl={shopImage}
                name={shopName}
                size={avatarSize}
                // White behind the photo: a transparent PNG logo no longer sits on brand teal.
                backgroundColor="#FFFFFF"
                textColor="#035C6C" // initials (no photo) in teal, readable on white
                borderWidth={1.5}
                borderColor="#FFFFFF"
              />
            </Touchable>
            {/* Verification badge on the avatar's bottom-right: green + white tick,
                or red + white ✕ (decorative — the avatar's label says it). */}
            <View
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{
                position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: 8,
                backgroundColor: isVerified ? VERIFIED_GREEN : UNVERIFIED_RED,
                borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isVerified ? <Check size={9} color="#FFFFFF" strokeWidth={3.5} /> : <X size={9} color="#FFFFFF" strokeWidth={3.5} />}
            </View>
            </View>
          </View>
        </View>
        </Animated.View>

        {/* Search — always below the profile row, inside the same
            centered/width-capped container so it lines up with it on
            tablet instead of stretching edge-to-edge on its own. */}
        {/* Search box: 10 from the screen edges (less than the header row's pad). */}
        <View style={{ paddingBottom: 10, marginHorizontal: -Math.max(0, pad - 10) }}>
          <DashboardSearchBar pad={0} onSearchPress={onSearchPress} onScanPress={onScanPress} onVoicePress={onVoicePress} />
        </View>
      </View>
    </Animated.View>
    {/* Status-bar strip stays put and covers the identity row as it slides under it. */}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insetsTop, backgroundColor: HEADER_TINT }} />
    </View>
  );
}
