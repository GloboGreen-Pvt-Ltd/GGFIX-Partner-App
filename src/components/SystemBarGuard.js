import React from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Keeps every screen clear of the Android system navigation bar.
 *
 * Android edge-to-edge is always on here (Expo SDK 54+ / RN 0.86), so the app
 * window draws UNDER the navigation bar. Only some screens padded for it, so
 * on a 3-button-bar phone (Galaxy S9+ and the like — the tallest bar) the end
 * of a scroll and footer buttons such as Confirm sat behind the Back / Home /
 * Recents keys. Instead of fixing screens one by one, the whole app is laid
 * out above the bar: the root is padded by the bar's real height (the 3-button
 * bar, the gesture handle, or 0) and the bar area gets a plain white strip.
 *
 * A second SafeAreaProvider inside the padded root measures its OWN frame, so
 * useSafeAreaInsets() / SafeAreaView below report bottom = 0 on Android and
 * screens that already padded the bar don't pad it twice. Modals are separate
 * windows and measure their own insets (components/SafeModal.js).
 *
 * iOS is unchanged: screens there already use the home-indicator inset.
 */
export default function SystemBarGuard({ children }) {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'android') return children;
  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: '#FFFFFF' }}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </View>
  );
}
