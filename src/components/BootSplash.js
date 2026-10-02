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

function TrustItem({ icon, label, labelFont }) {
  return (
    <View style={styles.trustItem}>
      {icon}
      <Text style={[styles.trustLabel, { fontSize: labelFont, lineHeight: labelFont * 1.32 }]}>{label}</Text>
    </View>
  );
}

export default function BootSplash() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 600;
  const contentWidth = isTablet ? Math.min(width * 0.62, 460) : Math.min(width, 460);

  // Three height tiers instead of one continuous scale — every dimension
  // below picks its own value per tier (logo/hero/fonts/gaps all tuned
  // separately, not just multiplied by one factor), so a short screen
  // compresses gaps first and only shrinks the hero image / fonts as far as
  // it actually needs to. This replaces the previous single `vScale` clamp,
  // which could still let the total content height exceed a short screen's
  // available space (content is centered, not scrollable, so overflow used
  // to clip at both edges — "Keep Devices Moving" cut off at the bottom).
  const isSmallHeight = height < 700;
  const isMediumHeight = height >= 700 && height < 850;
  // tier(small, medium, large) — picks by height bucket; isTablet overrides
  // are applied separately per-element below where the tablet target differs
  // from just "the large-height phone value".
  const tier = (small, medium, large) => (isSmallHeight ? small : isMediumHeight ? medium : large);

  // Gaps compress first (priority #1 in a short-screen squeeze), on their own
  // scale independent of font/image sizing.
  const gapScale = tier(0.62, 0.82, 1);
  const gap = (n) => rs(n) * gapScale;

  const logoSize = isTablet ? clamp(width * 0.13, 90, 112) : tier(74, 86, 96);
  const titleFont = isTablet ? 60 : tier(46, 52, 58);
  const bylineFont = isTablet ? 17 : tier(14, 15, 16);
  const servicesFont = isTablet ? 18 : tier(15, 16, 17);
  const taglineFont = isTablet ? 27 : tier(21, 24, 26);
  const loadingLabelFont = isTablet ? 18 : tier(15, 16, 17);
  const trustLabelFont = isTablet ? 15 : tier(12, 13, 14);
  const trustIconSize = isTablet ? 34 : tier(26, 28, 30);
  const scriptFont = isTablet ? 28 : tier(21, 24, 27);

  const progressWidth = Math.min(contentWidth * tier(0.7, 0.68, 0.66), isTablet ? 500 : 260);

  // Device.png's real aspect ratio isn't known ahead of time — read it off the
  // image that's actually rendering (expo-image's onLoad) so the hero art
  // never stretches, with a sane fallback before it resolves.
  const [deviceRatio, setDeviceRatio] = useState(0.62);

  // The hero image is the single biggest reason a short screen could
  // overflow, so it gets TWO caps and takes whichever is smaller: a width cap
  // (same idea as before — a % of the content column) AND a height cap (a %
  // of the actual window height). On a short/wide-aspect device the height
  // cap wins and the image shrinks well below its width-only size instead of
  // pushing the trust row / "Keep Devices Moving" off screen.
  const heroWidthCap = contentWidth * tier(0.78, 0.8, 0.8);
  const heroHeightCap = height * tier(0.2, 0.235, 0.26);
  const deviceWidth = Math.min(heroWidthCap, heroHeightCap / deviceRatio);

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
        style={StyleSheet.absoluteFill}
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
              style={{ width: logoSize, height: logoSize, marginBottom: gap(14) }}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={{ alignItems: 'center', opacity: textAnim, marginTop: gap(8) }}>
            <Text style={[styles.wordmark, { fontSize: rf(titleFont) }]}>
              GG<Text style={{ color: BRIGHT_GREEN }}>FIX</Text>
            </Text>
            <Text style={[styles.byline, { fontSize: rf(bylineFont), marginTop: gap(6) }]}>BY GLOBO GREEN</Text>
            <Text style={[styles.services, { fontSize: rf(servicesFont), marginTop: gap(10) }]}>
              Repair  •  Pickup  •  Buy  •  Sell
            </Text>
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
            <Text style={[styles.tagline, { fontSize: rf(taglineFont), lineHeight: rf(taglineFont) * 1.4 }]}>
              ALL YOUR TECH NEEDS,{'\n'}COVERED.
            </Text>
            <View style={[styles.taglineUnderline, { marginTop: gap(10) }]} />
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
            <Text style={[styles.loadingLabel, { fontSize: rf(loadingLabelFont), marginTop: gap(10) }]}>
              LOADING...
            </Text>
          </View>

          <View style={[styles.trustRow, { marginTop: gap(24) }]}>
            <TrustItem icon={<ShieldCheck size={rs(trustIconSize)} color={MINT} strokeWidth={2} />} label={'TRUSTED\nSERVICE'} labelFont={rf(trustLabelFont)} />
            <View style={styles.divider} />
            <TrustItem
              icon={<Users size={rs(trustIconSize)} color={MINT} strokeWidth={2} />}
              label={'THOUSANDS\nOF HAPPY CUSTOMERS'}
              labelFont={rf(trustLabelFont)}
            />
            <View style={styles.divider} />
            <TrustItem icon={<MapPin size={rs(trustIconSize)} color={MINT} strokeWidth={2} />} label={'ACROSS\nINDIA'} labelFont={rf(trustLabelFont)} />
          </View>

          <View style={{ alignItems: 'center', marginTop: gap(16) }}>
            <Text style={[styles.script, { fontSize: rf(scriptFont) }]}>Keep Devices Moving</Text>
            <View style={[styles.scriptUnderline, { marginTop: gap(6) }]} />
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
  // of being dumped into one gap partway down. Kept deliberately over
  // `space-between`: every element's size/gap above is now tiered so the
  // block's natural height already fits a short screen, and `space-between`
  // is what previously produced a shrunken logo up top with a large dead
  // zone in the middle — switching back to it would reintroduce that.
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
    fontWeight: '700',
    letterSpacing: 2.4,
    color: TEXT_SECONDARY,
  },
  services: {
    fontWeight: '500',
    color: TEXT_SECONDARY,
    letterSpacing: 0.3,
  },
  tagline: {
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 1.4,
    color: TEXT_PRIMARY,
  },
  taglineUnderline: {
    width: rs(40),
    height: rs(3),
    borderRadius: rs(2),
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
    fontWeight: '600',
    letterSpacing: 2,
    color: TEXT_SECONDARY,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    width: '100%',
  },
  trustItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: rs(6),
    maxWidth: rs(110),
  },
  trustLabel: {
    textAlign: 'center',
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  divider: {
    width: 1,
    height: rs(30),
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  script: {
    fontStyle: 'italic',
    fontWeight: '600',
    color: MINT,
  },
  scriptUnderline: {
    width: rs(90),
    height: rs(2),
    borderRadius: rs(1),
    backgroundColor: HIGHLIGHT_GREEN,
  },
});
