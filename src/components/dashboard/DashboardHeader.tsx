import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { BadgeCheck, BadgeX, Bell, ArrowLeftRight, ShoppingCart } from 'lucide-react-native';
import {
  BADGE_ICON_SIZE,
  BADGE_STROKE,
  C,
  getSizeClass,
  GREEN_DARK,
  HAIRLINE,
  HEADER_ACTION_STROKE,
  MIN_TOUCH,
  PINE,
  SHOP_NAME_COLOR,
  T,
  Touchable,
  UNVERIFIED_ICON,
  VERIFIED_ICON,
} from './theme';
import { DashboardSearchBar } from './DashboardSearchBar';
import { ProfileAvatar } from '../ProfileAvatar';

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
}: DashboardHeaderProps) {
  const { width } = useWindowDimensions();
  const cls = getSizeClass(width);
  const isTablet = cls === 'tablet';

  // Tablet gets a centered, width-capped inner container instead of every
  // element stretching across the full screen width; phone just fills it.
  const maxContentWidth = isTablet ? 1000 : undefined;

  const avatarSize = isTablet ? 56 : 52;
  const shopNameSize = isTablet ? 22 : cls === 'large' ? 19 : T.headline;
  const greetingSize = isTablet ? 14 : 13;
  const actionIconSize = isTablet ? 26 : 24;
  const actionGap = isTablet ? 20 : 16;

  const avatarHitSlop = hitSlopFor(avatarSize);
  const actionHitSlop = hitSlopFor(actionIconSize);

  return (
    <View style={{ backgroundColor: '#FFFFFF', paddingTop: insetsTop, borderBottomWidth: HAIRLINE, borderBottomColor: C.separator }}>
      <View style={{ width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', paddingHorizontal: pad }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 10 }}>
          {/* Left: avatar + greeting/shop name. flexShrink so a long shop
              name truncates instead of pushing the action icons offscreen. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexShrink: 1 }}>
            {/* Verification badge is a SIBLING of the Touchable, not a
                child: the avatar clips to a circle, which would shear a
                badge overhanging its bottom-right corner. */}
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
                  backgroundColor={GREEN_DARK}
                  borderWidth={1}
                  borderColor="rgba(255,255,255,0.75)"
                />
              </Touchable>

              {/* Decorative to the a11y tree — the avatar button's own label
                  carries the verification status. */}
              <View
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -4,
                  height: BADGE_ICON_SIZE + 4,
                  width: BADGE_ICON_SIZE + 4,
                  borderRadius: (BADGE_ICON_SIZE + 4) / 2,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: HAIRLINE,
                  borderColor: C.separator,
                }}
              >
                {isVerified ? (
                  <BadgeCheck size={BADGE_ICON_SIZE} color={VERIFIED_ICON} strokeWidth={BADGE_STROKE} />
                ) : (
                  <BadgeX size={BADGE_ICON_SIZE} color={UNVERIFIED_ICON} strokeWidth={BADGE_STROKE} />
                )}
              </View>
            </View>

            {/* Greeting · shop name — opens the account sheet. */}
            <Touchable
              onPress={onIdentityPress}
              accessibilityRole="button"
              accessibilityLabel={`${greeting}, ${shopName}`}
              style={{ flexShrink: 1, marginLeft: 11, marginRight: 8 }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <Text style={{ fontSize: greetingSize, color: C.label2, letterSpacing: -0.1 }} numberOfLines={1} ellipsizeMode="tail">
                {greeting}
              </Text>
              <Text
                style={{
                  fontSize: shopNameSize,
                  lineHeight: shopNameSize + 4,
                  fontWeight: '700',
                  color: SHOP_NAME_COLOR,
                  marginTop: 1,
                }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {shopName}
              </Text>
              <Text style={{ fontSize: 12, color: C.label2, marginTop: 1 }} numberOfLines={1} ellipsizeMode="tail">
                Let's keep your business moving!
              </Text>
            </Touchable>
          </View>

          {/* Right: switch account / notifications / cart. `gap` (not
              space-around) keeps these tight on tablet instead of
              spreading across the wider row. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: actionGap }}>
            <Touchable
              onPress={onSwitchAccountPress}
              accessibilityRole="button"
              accessibilityLabel="Switch account"
              hitSlop={actionHitSlop}
              pressedStyle={{ opacity: 0.4 }}
            >
              <ArrowLeftRight size={actionIconSize} color={PINE} strokeWidth={HEADER_ACTION_STROKE} />
            </Touchable>
            <Touchable
              onPress={onNotificationsPress}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={actionHitSlop}
              pressedStyle={{ opacity: 0.4 }}
            >
              <Bell size={actionIconSize} color={PINE} strokeWidth={HEADER_ACTION_STROKE} />
              {notifUnread > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -1,
                    minWidth: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: C.error,
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }}
                />
              ) : null}
            </Touchable>
            <Touchable
              onPress={onCartPress}
              accessibilityRole="button"
              accessibilityLabel="Cart"
              hitSlop={actionHitSlop}
              pressedStyle={{ opacity: 0.4 }}
            >
              <ShoppingCart size={actionIconSize} color={PINE} strokeWidth={HEADER_ACTION_STROKE} />
            </Touchable>
          </View>
        </View>

        {/* Search — always below the profile row, inside the same
            centered/width-capped container so it lines up with it on
            tablet instead of stretching edge-to-edge on its own. */}
        <View style={{ paddingBottom: 12 }}>
          <DashboardSearchBar pad={0} onSearchPress={onSearchPress} />
        </View>
      </View>
    </View>
  );
}
