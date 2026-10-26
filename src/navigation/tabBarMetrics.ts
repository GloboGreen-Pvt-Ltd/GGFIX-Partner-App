/**
 * Single source of truth for the owner bottom tab bar's size, shared between
 * `GlassTabBar` (OwnerNavigator.js) and any screen that needs to reserve
 * scroll space below the (custom, non-reserving) tab bar — e.g. Dashboard's
 * ScrollView bottom padding. Keeping both readings in one place means they
 * can't drift apart when the bar's height changes.
 */

import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rs } from '../utils/responsive';

export const TABLET_BREAKPOINT = 600;
export const TAB_BAR_HEIGHT_PHONE = 68;
export const TAB_BAR_HEIGHT_TABLET = 76;
/** Floor applied to `insets.bottom` so a device reporting 0 (old Android
 * 3-button nav) still gets a little breathing room above the nav buttons. */
export const MIN_SAFE_BOTTOM = 8;

export function isTabletWidth(width: number): boolean {
  return width >= TABLET_BREAKPOINT;
}

/** Tab row height only — excludes the safe-area bottom inset. */
export function getTabBarContentHeight(isTablet: boolean): number {
  // Scales with the screen like the rest of the app (rs), same value the
  // bar and Dashboard's scroll padding both read.
  return rs(isTablet ? TAB_BAR_HEIGHT_TABLET : TAB_BAR_HEIGHT_PHONE);
}

/** Full on-screen height of the bar, inset included — what a screen behind it must clear. */
export function getTabBarTotalHeight(isTablet: boolean, insetBottom: number): number {
  return getTabBarContentHeight(isTablet) + Math.max(insetBottom, MIN_SAFE_BOTTOM);
}

/**
 * Bottom space a tab screen's scroll content needs: the bar floats over the
 * page (no background strip), so content must clear its full height.
 */
export function useTabBarSpace(extra: number = 16): number {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return getTabBarTotalHeight(isTabletWidth(width), insets.bottom) + rs(extra);
}
