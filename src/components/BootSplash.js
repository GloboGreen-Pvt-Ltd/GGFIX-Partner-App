import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MapPin, ShieldCheck, Users } from 'lucide-react-native';
import { rf, rs } from '../utils/responsive';
import { since } from '../utils/bootClock'; // TEMP DEBUG — remove with the other [BOOT] logs

/**
 * The loader shown while RootNavigator reads the stored session (see
 * RootNavigator's `sessionLoading` state — this component owns no session,
 * timer, or navigation logic of its own; it just renders until that flips
 * false, plus a little past that — see RootNavigator's boot-overlay fade).
 *
 * Visuals only: full-bleed brand background + device hero art pulled from
 * the CDN (not bundled — swap the two URLs below to update the art without
 * a JS change). Uses expo-image (already a project dependency) rather than
 * RN's Image for both remote assets, for its disk cache — a cold app launch
 * is the one moment these can't already be warm in memory.
 */
const BACKGROUND_URL = 'https://media.ggfix.in/GGFIX-Partner-App/Background.png';
const DEVICE_URL = 'https://media.ggfix.in/GGFIX-Partner-App/Device.png';

// Fires the moment this module is first imported (RootNavigator imports it at
// the top of the file, so this runs at app startup, before BootSplash ever
// mounts) — warms expo-image's disk cache for both URLs. Best-effort only:
// never gates rendering or the native-splash handoff on this resolving, so a
// slow network never adds startup delay — the fallback color below covers it.
ExpoImage.prefetch([BACKGROUND_URL, DEVICE_URL], 'disk').catch(() => {});

const BG_FALLBACK = '#004C40';
const BRIGHT_GREEN = '#00E68A';
const HIGHLIGHT_GREEN = '#22F5A2';
const MINT = '#8AF5C5';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = 'rgba(255,255,255,0.80)';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function TrustItem({ icon, label }) {
  return (
    <View style={styles.trustItem}>
      {icon}
      <Text style={styles.trustLabel}>{label}</Text>
    </View>
  );
}

export default function BootSplash() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 600;
  const shortDevice = height < 700;
  const contentWidth = isTablet ? Math.min(width * 0.62, 460) : Math.min(width, 460);

  // Previously this screen used `justifyContent: 'space-between'` to spread
  // sections down the full height — on any screen taller than the design
  // reference that dumps ALL of the slack into a single gap between whatever
  // two sections happen to be adjacent, which is exactly what produced a
  // shrunken-looking logo up top, a large dead zone in the middle, and
  // everything else pushed toward the bottom. Fixed below by centering the
  // whole content block as one unit (`safe` styles) and sizing every gap
  // explicitly, scaled by how tall the screen actually is (`vScale`) so nothing
  // needs a ScrollView and nothing overflows on a short device either.
  const vScale = clamp(height / 812, 0.78, 1.2);
  const gap = (n) => rs(n) * vScale;

  const logoSize = clamp(width * (shortDevice ? 0.2 : 0.26), 72, isTablet ? 120 : 132);
  const deviceWidth = Math.min(contentWidth * (shortDevice ? 0.72 : 0.84), shortDevice ? 260 : 340);
  const progressWidth = Math.min(contentWidth * 0.66, 260);

  // Device.png's real aspect ratio isn't known ahead of time — read it off the
  // image that's actually rendering (expo-image's onLoad) so the hero art
  // never stretches, with a sane fallback before it resolves.
  const [deviceRatio, setDeviceRatio] = useState(0.62);

  const logoAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const deviceAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log('[BOOT] BootSplash mounted @', since()); // TEMP DEBUG — remove once verified on a real device/dev-client build
    Animated.stagger(140, [
      Animated.timing(logoAnim, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(textAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(deviceAnim, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 1000,
      delay: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animates `width`, which the native driver can't touch
    }).start();
  }, [logoAnim, textAnim, deviceAnim, barAnim]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ExpoImage
        source={BACKGROUND_URL}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        cachePolicy="disk"
        onLoad={() => console.log('[BOOT] Background loaded @', since())} // TEMP DEBUG
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.content, { maxWidth: contentWidth, paddingHorizontal: rs(24) }]}>
          <Animated.View
            style={{
              alignItems: 'center',
              opacity: logoAnim,
              transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            }}
          >
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: logoSize, height: logoSize, marginBottom: rs(14) }}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={{ alignItems: 'center', opacity: textAnim, marginTop: gap(8) }}>
            <Text style={[styles.wordmark, { fontSize: rf(shortDevice ? 34 : 40) }]}>
              GG<Text style={{ color: BRIGHT_GREEN }}>FIX</Text>
            </Text>
            <Text style={styles.byline}>BY GLOBO GREEN</Text>
            <Text style={styles.services}>Repair  •  Pickup  •  Buy  •  Sell</Text>
          </Animated.View>

          <Animated.View
            style={{
              width: deviceWidth,
              aspectRatio: 1 / deviceRatio,
              marginTop: gap(20),
              opacity: deviceAnim,
              transform: [{ translateY: deviceAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }}
          >
            <ExpoImage
              source={DEVICE_URL}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              cachePolicy="disk"
              onLoad={(e) => {
                console.log('[BOOT] Device image loaded @', since()); // TEMP DEBUG
                const { width: w, height: h } = e?.source || {};
                if (w > 0 && h > 0) setDeviceRatio(h / w);
              }}
            />
          </Animated.View>

          <View style={{ alignItems: 'center', marginTop: gap(18) }}>
            <Text style={styles.tagline}>ALL YOUR TECH NEEDS,{'\n'}COVERED.</Text>
            <View style={styles.taglineUnderline} />
          </View>

          <View style={{ width: progressWidth, marginTop: gap(22), alignItems: 'center' }}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '70%'] }) },
                ]}
              />
            </View>
            <Text style={styles.loadingLabel}>LOADING...</Text>
          </View>

          <View style={[styles.trustRow, { marginTop: gap(24) }]}>
            <TrustItem icon={<ShieldCheck size={rs(20)} color={MINT} strokeWidth={2} />} label={'TRUSTED\nSERVICE'} />
            <View style={styles.divider} />
            <TrustItem
              icon={<Users size={rs(20)} color={MINT} strokeWidth={2} />}
              label={'THOUSANDS\nOF HAPPY CUSTOMERS'}
            />
            <View style={styles.divider} />
            <TrustItem icon={<MapPin size={rs(20)} color={MINT} strokeWidth={2} />} label={'ACROSS\nINDIA'} />
          </View>

          <View style={{ alignItems: 'center', marginTop: gap(16) }}>
            <Text style={styles.script}>Keep Devices Moving</Text>
            <View style={styles.scriptUnderline} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_FALLBACK },
  // justifyContent: 'center' treats the whole splash as one block and centers
  // it — extra space on a tall screen is split evenly above and below instead
  // of being dumped into one gap partway down (see the note above `vScale`).
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.5,
    color: TEXT_PRIMARY,
  },
  byline: {
    marginTop: rs(6),
    fontSize: rf(11),
    fontWeight: '700',
    letterSpacing: 2.4,
    color: TEXT_SECONDARY,
  },
  services: {
    marginTop: rs(10),
    fontSize: rf(13),
    fontWeight: '500',
    color: TEXT_SECONDARY,
    letterSpacing: 0.3,
  },
  tagline: {
    textAlign: 'center',
    fontSize: rf(15),
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: rf(21),
    color: TEXT_PRIMARY,
  },
  taglineUnderline: {
    width: rs(40),
    height: rs(3),
    borderRadius: rs(2),
    marginTop: rs(10),
    backgroundColor: HIGHLIGHT_GREEN,
  },
  progressTrack: {
    width: '100%',
    height: rs(5),
    borderRadius: rs(3),
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: rs(3),
    backgroundColor: BRIGHT_GREEN,
  },
  loadingLabel: {
    marginTop: rs(10),
    fontSize: rf(11),
    fontWeight: '600',
    letterSpacing: 2,
    color: TEXT_SECONDARY,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(16),
  },
  trustItem: {
    alignItems: 'center',
    gap: rs(6),
    maxWidth: rs(96),
  },
  trustLabel: {
    textAlign: 'center',
    fontSize: rf(9.5),
    fontWeight: '600',
    lineHeight: rf(12.5),
    color: TEXT_SECONDARY,
  },
  divider: {
    width: 1,
    height: rs(30),
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  script: {
    fontSize: rf(20),
    fontStyle: 'italic',
    fontWeight: '600',
    color: MINT,
  },
  scriptUnderline: {
    width: rs(90),
    height: rs(2),
    borderRadius: rs(1),
    marginTop: rs(6),
    backgroundColor: HIGHLIGHT_GREEN,
  },
});
