import React from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { tokens } from '../theme/colors';
import { rf, rs } from '../utils/responsive';

/**
 * The loader shown while RootNavigator reads the stored session.
 *
 * The native splash (expo-splash-screen) hides as soon as the JS bundle mounts,
 * which is *before* getSession() resolves — RootNavigator used to render null in
 * that gap, so the app flashed a blank frame between the splash and Login. This
 * fills the gap and is deliberately drawn to match the native splash: same
 * white background as `splash.backgroundColor` in app.config.js, same logo, same
 * `contain` fit. The only additions are the wordmark and the spinner, so the
 * hand-off reads as the splash settling rather than as a second screen.
 *
 * Keep this in sync with app.config.js `splash` if the splash art ever changes.
 */
export default function BootSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: rs(132), height: rs(132) }}
        resizeMode="contain"
      />
      <Text
        style={{
          marginTop: rs(18),
          fontSize: rf(20),
          fontWeight: '800',
          color: tokens.primary,
          letterSpacing: 0.4,
        }}
      >
        GGFIX Shop
      </Text>
      <ActivityIndicator style={{ marginTop: rs(22) }} color={tokens.primary} />
    </View>
  );
}
