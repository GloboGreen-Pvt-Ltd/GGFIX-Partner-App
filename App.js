// TEMP DEBUG — imported first, before anything else, so its clock starts as
// close to true app start as this codebase can observe. Remove alongside the
// other [BOOT] logs once real device timing is confirmed.
import { since } from './src/utils/bootClock';
import './global.css';
// Global responsive font scaling — must load before any screen renders so the
// Text/TextInput patch is in place. See src/theme/fontScaling.js.
import './src/theme/fontScaling';
// …and the spacing half of the same idea: sets NativeWind's runtime `rem` to
// the device curve, so every rem-based className (p-4, mt-6, h-11, gap-3 …)
// scales the way `rs()` does. Must also run before the first render.
// See src/theme/remScaling.js.
import './src/theme/remScaling';
import React, { useCallback, useEffect, useRef } from 'react';
import { LogBox, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { store } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import colors from './src/theme/colors';
import { attachDownloadNotifications } from './src/lib/downloads';

// @gluestack-ui/themed's own bundled SafeAreaView wrapper
// (node_modules/@gluestack-ui/themed/build/components/SafeAreaView/styled-components/Root.js)
// imports RN's deprecated SafeAreaView directly — not our code, and not
// something a local import fix can touch (it's inside their published
// build, gone on the next `npm install`). Nothing in this app renders it;
// this only silences that third-party noise so it doesn't read as our bug.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

// Keeps the native launch splash up past its own default auto-hide timing.
// Called once here, at module scope — the earliest point userland code runs —
// so it always wins the race against the native hide. Paired with
// SplashScreen.hideAsync() below, called only after the root view's first
// real paint, so the handoff to BootSplash.js has no gap and no flash.
SplashScreen.preventAutoHideAsync()
  .then(() => console.log('[BOOT] Native splash prevented @', since())) // TEMP DEBUG — remove once verified on a real device/dev-client build
  .catch(() => {});

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.headerBg,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

export default function App() {
  // Download receipts in the notification shade: the banner has to be allowed
  // through while the app is foregrounded (which is when a download finishes),
  // and a tap on one has to open the saved file. Both are app-wide concerns, so
  // they are wired once here rather than by the screen that saves the file.
  useEffect(() => attachDownloadNotifications(), []);
  useEffect(() => console.log('[BOOT] App root mounted @', since()), []); // TEMP DEBUG — remove once verified

  // RootNavigator's first render is synchronous and is always BootSplash (its
  // `loading` state starts true) — so "the root view finished its first
  // layout" already means BootSplash is painted underneath. Hiding the native
  // splash exactly here, and not a moment earlier or later, is what makes the
  // handoff a single cut with nothing else able to show in between. Guarded by
  // a ref because onLayout can fire more than once (rotation, keyboard, etc.)
  // and hideAsync must only run the first time.
  const hasHiddenSplash = useRef(false);
  const handleRootLayout = useCallback(() => {
    if (hasHiddenSplash.current) return;
    hasHiddenSplash.current = true;
    console.log('[BOOT] Native splash hiding @', since()); // TEMP DEBUG — remove once verified
    SplashScreen.hideAsync()
      .then(() => console.log('[BOOT] Native splash hidden @', since())) // TEMP DEBUG
      .catch(() => {});
  }, []);

  return (
    // backgroundColor matches BootSplash's own dark wash — a safety base so
    // there is no white frame from the platform's default root background in
    // the instant between the native splash hiding and BootSplash's own
    // (network-loaded) background image painting on top of it.
    <View style={{ flex: 1, backgroundColor: '#004C40' }} onLayout={handleRootLayout}>
      <Provider store={store}>
        <GluestackUIProvider config={config}>
          {/* KeyboardProvider must sit above the navigation tree so every screen's
              KeyboardAwareScrollView can read the native keyboard (IME) insets.
              On Expo SDK 54 this is what makes keyboard avoidance consistent under
              Android edge-to-edge, where windowSoftInputMode="adjustResize" alone
              is unreliable device-to-device. */}
          <KeyboardProvider>
            <SafeAreaProvider>
              <StatusBar style="dark" />
              <NavigationContainer theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
            </SafeAreaProvider>
          </KeyboardProvider>
        </GluestackUIProvider>
      </Provider>
    </View>
  );
}
