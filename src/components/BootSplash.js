import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, {
  Circle, Defs, G, LinearGradient, Mask, Path, Pattern, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { MapPin, ShieldCheck, Users } from 'lucide-react-native';
import { rf, rs } from '../utils/responsive';
import { since } from '../utils/bootClock'; // TEMP DEBUG — remove with the other [BOOT] logs

/**
 * The loader shown while RootNavigator reads the stored session (see
 * RootNavigator's `sessionLoading` state — this component owns no session,
 * timer, or navigation logic of its own; it just renders until that flips
 * false, plus a little past that — see RootNavigator's boot-overlay fade).
 *
 * Visuals only: a light brand page (GGFIX brand sheet — see theme/colors.js)
 * with device hero art pulled from the CDN (not bundled — swap the URL below
 * to update the art without a JS change). Uses expo-image (already a project
 * dependency) rather than RN's Image for the remote asset, for its disk cache —
 * a cold app launch is the one moment it can't already be warm in memory.
 *
 * The page BASE is still a flat colour, not an image: the old dark-teal
 * Background.png doesn't belong to the brand sheet, and a flat #F8F8F8 also
 * matches the native launch splash (app.config.js) and App.js's root view, so
 * the handoff from the OS splash to this one is a single cut with no colour
 * jump. The brand backdrop (SplashBackdrop below) is vector art drawn on top of
 * that base and faded in after mount, so the cut stays seamless and the page
 * still doesn't read as a plain sheet once it settles.
 */
const DEVICE_URL = 'https://media.ggfix.in/GGFIX-Partner-App/Device.png';

// Fires the moment this module is first imported (RootNavigator imports it at
// the top of the file, so this runs at app startup, before BootSplash ever
// mounts) — warms expo-image's disk cache for the hero art. Best-effort only:
// never gates rendering or the native-splash handoff on this resolving, so a
// slow network never adds startup delay.
ExpoImage.prefetch([DEVICE_URL], 'disk').catch(() => {});

const PAGE_BG = '#F8F8F8';      // brand page background
const GREEN = '#09AD2A';        // brand green — "FIX", progress, icons
const GREEN_TEXT = '#078F23';   // deeper green for green copy on the light page
const YELLOW = '#F3BF23';       // brand yellow — accent underlines
const TEXT_PRIMARY = '#1E1E1E'; // ink
const TEXT_SECONDARY = '#6B6B6B';
const TRACK = '#E6E6E6';        // progress track + trust-row dividers

const MINT = '#EAF8EC';         // brand mint — top wash, front wave

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// A "+" mark centred on (x, y) — the small tech accents scattered on the page.
const plusPath = (x, y, s) => `M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`;

/**
 * The brand backdrop behind the splash content: a mint wash from the top, a
 * dot grid that fades out down the page, signal rings in two corners, a soft
 * green glow behind the device art (its own layer, so it can breathe), a few
 * green / yellow accents and two soft waves grounding the footer. Everything is
 * low-contrast tint on the #F8F8F8 base so the copy on top keeps its contrast.
 *
 * Drawn in window coordinates. The content column is vertically centred, so the
 * hero art sits close to the same fraction of the height on every phone — the
 * glow is anchored there rather than measured, which would cost a layout pass.
 */
function SplashBackdrop({ width: W, height: H, opacity, glow }) {
  const glowY = H * 0.46;
  const glowR = Math.max(W, 360) * 0.62;
  const ring = (cx, cy, radii) => radii.map((r, i) => (
    <Circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={GREEN} strokeWidth={1.5} strokeOpacity={0.16 - i * 0.03} />
  ));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="splashWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={MINT} stopOpacity="1" />
            <Stop offset="0.38" stopColor={MINT} stopOpacity="0" />
          </LinearGradient>
          <Pattern id="splashDots" width="18" height="18" patternUnits="userSpaceOnUse">
            <Circle cx="2" cy="2" r="1.4" fill={GREEN} fillOpacity="0.28" />
          </Pattern>
          <LinearGradient id="splashDotFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <Mask id="splashDotMask" x="0" y="0" width={W} height={H} maskUnits="userSpaceOnUse">
            <Rect x="0" y="0" width={W} height={H} fill="url(#splashDotFade)" />
          </Mask>
          <LinearGradient id="splashWave" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GREEN} stopOpacity="0.13" />
            <Stop offset="1" stopColor={GREEN} stopOpacity="0.04" />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width={W} height={H} fill="url(#splashWash)" />
        <Rect x="0" y="0" width={W} height={H} fill="url(#splashDots)" mask="url(#splashDotMask)" />

        {ring(W + W * 0.02, H * 0.05, [W * 0.18, W * 0.3, W * 0.42, W * 0.54])}
        {ring(-W * 0.06, H * 0.74, [W * 0.14, W * 0.24, W * 0.34])}

        <G>
          <Path d={plusPath(W * 0.13, H * 0.2, 6)} stroke={GREEN} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
          <Path d={plusPath(W * 0.9, H * 0.4, 5)} stroke={GREEN} strokeOpacity={0.28} strokeWidth={2} strokeLinecap="round" />
          <Path d={plusPath(W * 0.94, H * 0.76, 4)} stroke={YELLOW} strokeOpacity={0.7} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={W * 0.82} cy={H * 0.19} r={4} fill={YELLOW} fillOpacity={0.75} />
          <Circle cx={W * 0.07} cy={H * 0.43} r={3} fill={YELLOW} fillOpacity={0.6} />
          <Circle cx={W * 0.17} cy={H * 0.6} r={5} fill={GREEN} fillOpacity={0.14} />
          <Circle cx={W * 0.93} cy={H * 0.56} r={3} fill={GREEN} fillOpacity={0.3} />
        </G>

        <Path
          d={`M0 ${H * 0.86} C${W * 0.3} ${H * 0.81} ${W * 0.58} ${H * 0.91} ${W} ${H * 0.85} L${W} ${H} L0 ${H} Z`}
          fill="url(#splashWave)"
        />
        <Path
          d={`M0 ${H * 0.92} C${W * 0.36} ${H * 0.97} ${W * 0.64} ${H * 0.88} ${W} ${H * 0.93} L${W} ${H} L0 ${H} Z`}
          fill={MINT}
          fillOpacity={0.9}
        />
      </Svg>

      {/* Glow behind the device art — separate layer so it can breathe. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: glow }]}>
        <Svg width={W} height={H}>
          <Defs>
            <RadialGradient id="splashGlow" cx={W / 2} cy={glowY} r={glowR} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={GREEN} stopOpacity="0.26" />
              <Stop offset="0.5" stopColor={GREEN} stopOpacity="0.09" />
              <Stop offset="1" stopColor={GREEN} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={W / 2} cy={glowY} r={glowR} fill="url(#splashGlow)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

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
  // Backdrop fades in over the flat base (keeps the native-splash cut seamless);
  // the hero glow then breathes slowly for as long as the splash is up.
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    console.log('[BOOT] BootSplash mounted @', since()); // TEMP DEBUG — remove once verified on a real device/dev-client build
    Animated.timing(backdropAnim, {
      toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    breathe.start();
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
    return () => breathe.stop();
  }, [logoAnim, textAnim, deviceAnim, barAnim, backdropAnim, glowAnim]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SplashBackdrop width={width} height={height} opacity={backdropAnim} glow={glowAnim} />
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
              GG<Text style={{ color: GREEN }}>FIX</Text>
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
            <TrustItem icon={<ShieldCheck size={rs(trustIconSize)} color={GREEN} strokeWidth={2} />} label={'TRUSTED\nSERVICE'} labelFont={rf(trustLabelFont)} />
            <View style={styles.divider} />
            <TrustItem
              icon={<Users size={rs(trustIconSize)} color={GREEN} strokeWidth={2} />}
              label={'THOUSANDS\nOF HAPPY CUSTOMERS'}
              labelFont={rf(trustLabelFont)}
            />
            <View style={styles.divider} />
            <TrustItem icon={<MapPin size={rs(trustIconSize)} color={GREEN} strokeWidth={2} />} label={'ACROSS\nINDIA'} labelFont={rf(trustLabelFont)} />
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
  root: { flex: 1, backgroundColor: PAGE_BG },
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
    backgroundColor: YELLOW,
  },
  progressTrack: {
    width: '100%',
    height: rs(5),
    borderRadius: rs(3),
    backgroundColor: TRACK,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: rs(3),
    backgroundColor: GREEN,
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
    backgroundColor: TRACK,
  },
  script: {
    fontStyle: 'italic',
    fontWeight: '600',
    color: GREEN_TEXT,
  },
  scriptUnderline: {
    width: rs(90),
    height: rs(2),
    borderRadius: rs(1),
    backgroundColor: YELLOW,
  },
});
