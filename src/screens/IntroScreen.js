import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, ShieldCheck, Star, TrendingUp, Users } from 'lucide-react-native';
import { tokens } from '../theme/colors';
import { rf, rs } from '../utils/responsive';
import { resetOnboardingForTesting } from '../auth/onboarding';
import { useBottomBarInset } from '../components/rnr';

/**
 * Pre-login intro/onboarding screen. Shown once (see RootNavigator, which
 * decides the unauthenticated stack's `initialRouteName` from
 * `hasSeenIntro()`) — "Get Started" persists "seen" via the `onDone` prop
 * before moving on to Login.
 */
const INTRO_IMAGE_URL = 'https://media.ggfix.in/GGFIX-Partner-App/Intro-image.png';
ExpoImage.prefetch(INTRO_IMAGE_URL, 'disk').catch(() => {});

// GGFIX brand sheet (see theme/colors.js).
const PAGE_BG = '#F8F8F8';
const MINT = '#EAF8EC';       // soft green fills — blobs, icon circles
const MINT_LINE = '#CDEFD4';  // slightly stronger mint for the middle blob
const GREEN = '#09AD2A';      // brand green — headline accent, icons, CTA
const DOT = '#D6D6D6';        // inactive pagination dot
const DARK_TEXT = tokens.text;
const MUTED_TEXT = tokens.textMuted;

function BenefitItem({ icon, label, tablet }) {
  return (
    <View style={styles.benefitItem}>
      <View style={[styles.benefitIconWrap, tablet && { width: rs(58), height: rs(58), borderRadius: rs(29) }]}>{icon}</View>
      <Text style={[styles.benefitLabel, tablet && { fontSize: 12, lineHeight: rf(15) }]}>{label}</Text>
    </View>
  );
}

function PaginationDots({ count, activeIndex }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
      ))}
    </View>
  );
}

export default function IntroScreen({ navigation, onDone }) {
  const insets = useSafeAreaInsets();
  // Math.max(insets.bottom, 12) guards against insets.bottom reading as 0 on
  // some Android edge-to-edge/gesture-nav configurations, which was leaving
  // the CTA footer with almost no bottom clearance — same fix already used
  // by BottomActionBar/useBottomBarInset elsewhere in this app.
  const bottomInset = useBottomBarInset(12);
  const { width, height } = useWindowDimensions();
  // 768 — matches the breakpoint used across the rest of the pre-auth flow
  // (Login, OTP) so a 600–767px device gets the same compact treatment
  // everywhere instead of switching per screen.
  const isTablet = width >= 768;
  const shortDevice = height < 700;
  // Was capped at 560 — on a big tablet that left the card floating in a
  // mostly-empty page. Widened, and every element inside it below is scaled
  // up for `isTablet` too, so the screen reads as designed for the larger
  // canvas instead of a phone layout centred in empty space.
  const contentWidth = isTablet ? Math.min(width * 0.78, 680) : width;

  // Intro-image.png's real aspect ratio isn't known ahead of time — read it
  // off the actual rendering image (expo-image's onLoad) so it never
  // stretches, with a sane fallback before it resolves.
  const [heroRatio, setHeroRatio] = useState(0.85);
  const heroWidth = Math.min(contentWidth * (isTablet ? 0.56 : 0.8), isTablet ? 460 : 320);
  const heroHeight = heroWidth * heroRatio;

  useEffect(() => console.log('[INTRO] IntroScreen mounted'), []); // TEMP DEBUG — remove once verified

  const handleContinue = async (source) => {
    console.log(`[INTRO] ${source} pressed`); // TEMP DEBUG — remove once verified
    try {
      await onDone();
      console.log('[INTRO] Onboarding saved'); // TEMP DEBUG
    } catch (_) {}
    console.log('[INTRO] Navigating to Login'); // TEMP DEBUG
    navigation.replace('Login');
  };

  // DEV-ONLY — long-press the wordmark to clear the "onboarding completed"
  // flag and see this screen again on the next app reload, without
  // reinstalling or clearing all app storage. Inert in a release build
  // (resetOnboardingForTesting() no-ops when `__DEV__` is false), and there is
  // no UI affordance hinting at it — it's for local testing only.
  const handleDevResetLongPress = __DEV__
    ? async () => {
        await resetOnboardingForTesting();
        console.log('[INTRO][DEV] Onboarding flag cleared — reload the app to see Intro again');
      }
    : undefined;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      {/* Decorative only — soft mint shapes, never intercept touches. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, { width: rs(220), height: rs(220), top: -rs(70), left: -rs(80), backgroundColor: MINT }]} />
        <View
          style={[
            styles.blob,
            { width: rs(170), height: rs(170), top: height * 0.34, left: -rs(90), backgroundColor: MINT_LINE, opacity: 0.7 },
          ]}
        />
        <View style={[styles.blob, { width: rs(240), height: rs(240), bottom: -rs(90), right: -rs(100), backgroundColor: MINT }]} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + rs(10),
          paddingBottom: rs(16),
          paddingHorizontal: rs(24),
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* No `flex: 1` anywhere in here — a flexed child inside ScrollView
            content is a known RN pitfall: the content's measured height can
            go ambiguous, so what paints on screen stops matching where the
            touch responder thinks elements are (this is what made Get
            Started render correctly but not respond to taps). The CTA is a
            fixed footer below the ScrollView instead — see the end of this
            component — so nothing in the scrollable area needs to flex. */}
        <View style={{ width: '100%', maxWidth: contentWidth }}>
          <View style={styles.headerRow}>
            <Pressable onLongPress={handleDevResetLongPress} disabled={!__DEV__}>
              <Text style={styles.wordmark}>
                GG<Text style={{ color: GREEN }}>FIX</Text>
              </Text>
              <Text style={styles.wordmarkSub}>PARTNER APP</Text>
            </Pressable>
          </View>

          <Text style={[styles.heading, { fontSize: (isTablet ? 28 : shortDevice ? 20 : 22), lineHeight: rf(isTablet ? 40 : shortDevice ? 27 : 32) }]}>
            <Text style={{ color: GREEN }}>Manage Repairs, Pickups, Buy &amp; Sell </Text>
            <Text style={{ color: DARK_TEXT }}>Devices — All in One Place</Text>
          </Text>

          <Text style={[styles.description, isTablet && { fontSize: 15, lineHeight: rf(24), marginTop: rs(18) }]}>
            Grow your business with GGFIX. Handle service orders, manage pickups, buy and sell devices, and serve more
            customers — faster and easier.
          </Text>

          <View style={{ width: heroWidth, height: heroHeight, alignSelf: 'center', marginTop: rs(shortDevice ? 18 : 26) }}>
            <ExpoImage
              source={INTRO_IMAGE_URL}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              cachePolicy="disk"
              onLoad={(e) => {
                const { width: w, height: h } = e?.source || {};
                if (w > 0 && h > 0) setHeroRatio(h / w);
              }}
            />
          </View>

          <View style={[styles.benefitsRow, { marginTop: rs(isTablet ? 34 : shortDevice ? 20 : 28) }]}>
            <BenefitItem icon={<ShieldCheck size={rs(isTablet ? 26 : 20)} color={GREEN} strokeWidth={2} />} label={'Trusted\nPlatform'} tablet={isTablet} />
            <BenefitItem icon={<Users size={rs(isTablet ? 26 : 20)} color={GREEN} strokeWidth={2} />} label={'More\nCustomers'} tablet={isTablet} />
            <BenefitItem icon={<TrendingUp size={rs(isTablet ? 26 : 20)} color={GREEN} strokeWidth={2} />} label={'Grow\nYour Business'} tablet={isTablet} />
            <BenefitItem icon={<Star size={rs(isTablet ? 26 : 20)} color={GREEN} strokeWidth={2} />} label={'All Your Tech\nNeeds, Covered'} tablet={isTablet} />
          </View>

          <PaginationDots count={4} activeIndex={0} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomInset }]}>
        <View style={{ width: '100%', maxWidth: contentWidth, alignSelf: 'center' }}>
          {/* style must stay a plain array here, NOT a `({pressed}) => [...]`
              function — NativeWind's JSX interop silently drops a function
              style on a Pressable entirely (no background, no sizing), which
              is what made this button invisible (just its unstyled text/icon
              children rendering). Pressed-state dimming dropped as a result;
              not worth reintroducing the same trap for it. */}
          <Pressable
            onPress={() => handleContinue('Get Started')}
            accessibilityRole="button"
            style={[styles.cta, isTablet && { minHeight: rs(62) }]}
          >
            <Text style={[styles.ctaText, isTablet && { fontSize: 17 }]}>Get Started</Text>
            <ArrowRight size={rs(isTablet ? 20 : 18)} color="#FFFFFF" style={{ marginLeft: rs(8) }} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  blob: { position: 'absolute', borderRadius: 999 },
  footer: {
    paddingHorizontal: rs(24),
    paddingTop: rs(10),
    backgroundColor: PAGE_BG,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: rs(20),
  },
  wordmark: {
    fontSize: 17,
    fontWeight: '800',
    color: DARK_TEXT,
    letterSpacing: -0.3,
  },
  wordmarkSub: {
    marginTop: rs(2),
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: MUTED_TEXT,
  },
  heading: {
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  description: {
    marginTop: rs(12),
    textAlign: 'center',
    fontSize: 13,
    lineHeight: rf(19),
    color: MUTED_TEXT,
  },
  benefitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  benefitItem: {
    flex: 1,
    alignItems: 'center',
    gap: rs(6),
    paddingHorizontal: rs(2),
  },
  benefitIconWrap: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: rf(12),
    color: DARK_TEXT,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: rs(6),
    marginTop: rs(20),
  },
  dot: {
    width: rs(7),
    height: rs(7),
    borderRadius: rs(4),
    backgroundColor: DOT,
  },
  dotActive: {
    width: rs(20),
    backgroundColor: GREEN,
  },
  cta: {
    width: '100%',
    minHeight: rs(56),
    borderRadius: rs(30),
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rs(20),
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
