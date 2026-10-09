import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * GGFIX boot screen (same design as the Customer app's LaunchOverlay), shown
 * by RootNavigator while the session loads; RootNavigator owns the fade-out:
 * green wavy top (glowing logo, wordmark, services), the device line-up over
 * the wave edge, then tagline · progress · trust row on a light base.
 *  - All art ships in the app (assets/boot-device.png, boot-logo-glyph.png;
 *    the rest is drawn), so it shows instantly on a cold launch.
 *  - The whole block scales down to fit between the system bars.
 */
const DEVICE = require('../../assets/boot-device.png');
const GLYPH = require('../../assets/boot-logo-glyph.png');
const DEVICE_RATIO = 675 / 900; // height / width of boot-device.png

const BASE = '#F4F6F5';
const INK = '#141414';
const GREEN = '#0FA046';
const NEON = '#2BEA7F';
const YELLOW = '#F3BF23';
const MINT = '#E2F4E8';

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function TrustIcon({ kind, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'shield' ? (
        <>
          <Path d="M12 2.2l7.6 2.9v6c0 5-3.4 8.9-7.6 10.7-4.2-1.8-7.6-5.7-7.6-10.7v-6z" fill={GREEN} />
          <Path d="M8.3 12.1l2.6 2.6 5-5.2" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'people' ? (
        <>
          <Path d="M12 1.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill={YELLOW} />
          <Circle cx={6.2} cy={11.2} r={2.1} fill={GREEN} />
          <Circle cx={17.8} cy={11.2} r={2.1} fill={GREEN} />
          <Circle cx={12} cy={10.4} r={2.6} fill={GREEN} />
          <Path d="M2.4 20.5c0-2.6 1.7-4.4 3.8-4.4s3.8 1.8 3.8 4.4zM14 20.5c0-2.6 1.7-4.4 3.8-4.4s3.8 1.8 3.8 4.4z" fill={GREEN} />
          <Path d="M7 21.4c0-3.3 2.2-5.6 5-5.6s5 2.3 5 5.6z" fill={GREEN} />
        </>
      ) : (
        <>
          <Path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" fill={GREEN} />
          <Circle cx={12} cy={9} r={3} fill={YELLOW} />
        </>
      )}
    </Svg>
  );
}

function TrustItem({ kind, label, circle, font }) {
  return (
    <View style={styles.trustItem}>
      <View style={{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
        <TrustIcon kind={kind} size={circle * 0.56} />
      </View>
      <Text style={[styles.trustLabel, { fontSize: font, lineHeight: font * 1.3, marginTop: 6 }]}>{label}</Text>
    </View>
  );
}

export default function BootSplash() {
  const { width: W, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fit, setFit] = useState(1);
  const [device, setDevice] = useState(null); // { y, h } of the device art inside the block

  // Size tiers from the height actually available between the system bars.
  const availH = height - insets.top - insets.bottom;
  const tier = (s, m, l) => (availH < 680 ? s : availH < 820 ? m : l);
  const k = clamp(W / 390, 0.82, 1.3);
  const cw = Math.min(W, 460); // content column
  const gap = (n) => n * tier(0.6, 0.8, 1) * k;

  const logo = tier(78, 90, 100) * k;
  const word = tier(42, 48, 54) * k;
  const devW = Math.min(cw * 0.86, (availH * tier(0.24, 0.26, 0.28)) / DEVICE_RATIO);
  const devH = devW * DEVICE_RATIO;
  const tag = tier(21, 24, 27) * k;
  const barW = Math.min(cw * 0.62, 300);

  // Green area: everything above roughly the middle of the device art.
  const devTop = device ? device.y : 300;
  const D = device ? device.h : devH;
  const EXT = height; // the shape runs far above / beside the block so scaling never uncovers an edge
  const SW = W * 1.8;
  const ox = W * 0.4;
  const yL = devTop + D * 0.02 + EXT; // edge at the far left
  const yR = devTop + D * 0.62 + EXT; // edge at the far right
  const greenPath = `M0 0H${SW}V${yR}C${ox + W * 0.75} ${yR - D * 0.05} ${ox + W * 0.55} ${devTop + D * 0.55 + EXT} ${ox + W * 0.3} ${devTop + D * 0.3 + EXT}S${ox - W * 0.1} ${yL - D * 0.1} 0 ${yL}Z`;
  const mintPath = `M0 ${yL + D * 0.05}C${ox} ${yL - D * 0.05} ${ox + W * 0.25} ${devTop + D * 0.5 + EXT} ${ox + W * 0.45} ${devTop + D * 0.62 + EXT}S${ox + W * 0.9} ${yR + D * 0.12} ${SW} ${yR + D * 0.2}V${yR + D * 0.32}C${ox + W * 0.6} ${yR + D * 0.42} ${ox + W * 0.2} ${yL + D * 0.15} 0 ${yL + D * 0.55}Z`;
  const glowPath = `M${ox + W * 0.55} 0C${ox + W * 0.9} ${EXT + D * 0.4} ${ox + W * 1.05} ${EXT + devTop * 0.5} ${SW} ${EXT + devTop * 0.9}V0Z`;

  const logoAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const deviceAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(logoAnim, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(textAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(deviceAnim, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [logoAnim, textAnim, deviceAnim]);

  // RootNavigator keeps this up for its minimum boot time (~5 s) and then
  // fades it, so the bar fills over that window.
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: 0.95,
      duration: 4600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false, // animates `width`, which the native driver can't touch
    }).start();
  }, [barAnim]);


  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading GGFIX"
      style={[StyleSheet.absoluteFill, styles.root]}
    >
      <StatusBar style="light" />
      {/* Soft light waves along the bottom edge. */}
      <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: 0 }} width={W} height={height * 0.22} viewBox={`0 0 ${W} 100`} preserveAspectRatio="none">
        <Path d={`M0 30C${W * 0.25} 10 ${W * 0.45} 70 ${W} 40V100H0Z`} fill="#EAF0EC" />
        <Path d={`M0 70C${W * 0.35} 45 ${W * 0.6} 95 ${W} 75V100H0Z`} fill="#E3ECE6" />
      </Svg>

      <View style={[styles.safe, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <View
          onLayout={(e) => {
            // Shrink the whole block if it's still taller than the space.
            const h = e.nativeEvent.layout.height;
            const room = availH - 16;
            const next = h > room ? Math.max(0.7, room / h) : 1;
            if (Math.abs(next - fit) > 0.01) setFit(next);
          }}
          style={[styles.content, { transform: [{ scale: fit }] }]}
        >
          {/* Green wavy backdrop (drawn behind the block, bleeding past every edge). */}
          <Svg pointerEvents="none" style={{ position: 'absolute', left: -ox, top: -EXT }} width={SW} height={yR + D * 0.5}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#0A5E31" />
                <Stop offset="0.55" stopColor="#0C7F3E" />
                <Stop offset="1" stopColor="#12A350" />
              </LinearGradient>
            </Defs>
            <Path d={mintPath} fill={MINT} />
            <Path d={greenPath} fill="url(#g)" />
            <Path d={glowPath} fill="#FFFFFF" opacity={0.06} />
            <Circle cx={ox + W * 1.02} cy={EXT - 30} r={W * 0.36} fill="none" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={1} />
          </Svg>

          {/* Logo — white glyph in a glowing ring. */}
          <Animated.View style={{ opacity: logoAnim, transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
            <View
              style={{
                width: logo, height: logo, borderRadius: logo / 2, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#0B6A36', borderWidth: 2.5, borderColor: NEON,
                shadowColor: NEON, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 12,
              }}
            >
              <Image source={GLYPH} style={{ width: logo * 0.64, height: logo * 0.64 }} resizeMode="contain" />
            </View>
          </Animated.View>

          <Animated.View style={{ alignItems: 'center', opacity: textAnim, marginTop: gap(16) }}>
            <Text style={[styles.wordmark, { fontSize: word, lineHeight: word * 1.08 }]}>
              GG<Text style={{ color: NEON }}>FIX</Text>
            </Text>
            <Text style={[styles.byline, { fontSize: 13 * k, marginTop: gap(6) }]}>BY GLOBO GREEN</Text>
            <Text style={[styles.services, { fontSize: 15 * k, marginTop: gap(14) }]}>
              Repair  <Text style={{ color: YELLOW }}>•</Text>  Pickup  <Text style={{ color: YELLOW }}>•</Text>  Buy  <Text style={{ color: YELLOW }}>•</Text>  Sell
            </Text>
          </Animated.View>

          {/* Devices over the wave edge, with small accent ticks either side. */}
          <Animated.View
            onLayout={(e) => {
              const { y, height: h } = e.nativeEvent.layout;
              if (!device || Math.abs(device.y - y) > 1 || Math.abs(device.h - h) > 1) setDevice({ y, h });
            }}
            style={{
              width: devW, height: devH, marginTop: gap(18),
              opacity: deviceAnim,
              transform: [{ translateY: deviceAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }}
          >
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 75">
              <Path d="M-4 22l6 6M-6 31l7 2" stroke={GREEN} strokeWidth={1.6} strokeLinecap="round" />
              <Path d="M95 12l-4 6M101 19l-7 3" stroke={YELLOW} strokeWidth={1.6} strokeLinecap="round" />
            </Svg>
            <Image source={DEVICE} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          </Animated.View>

          <View style={{ alignItems: 'center', marginTop: gap(14) }}>
            <Text style={[styles.tagline, { fontSize: tag, lineHeight: tag * 1.22 }]}>ALL YOUR TECH NEEDS,</Text>
            <Text style={[styles.tagline, { fontSize: tag * 1.08, lineHeight: tag * 1.3, color: GREEN }]}>COVERED.</Text>
            <Svg width={tag * 5.4} height={tag * 0.45} viewBox="0 0 120 10" style={{ marginTop: -2 }}>
              <Path d="M2 8h7" stroke={YELLOW} strokeWidth={2.4} strokeLinecap="round" />
              <Path d="M24 7.5Q70 1 116 6" stroke={YELLOW} strokeWidth={2.8} strokeLinecap="round" fill="none" />
            </Svg>
          </View>

          <View style={{ width: barW, marginTop: gap(20), alignItems: 'center' }}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
                <View style={styles.progressShine} />
              </Animated.View>
            </View>
            <Text style={[styles.loadingLabel, { fontSize: 13 * k, marginTop: gap(12) }]}>LOADING...</Text>
          </View>

          <View style={[styles.trustRow, { width: cw - 40, marginTop: gap(24) }]}>
            <TrustItem kind="shield" circle={tier(44, 50, 56) * k} font={11 * k} label={'TRUSTED\nSERVICE'} />
            <View style={styles.divider} />
            <TrustItem kind="people" circle={tier(44, 50, 56) * k} font={11 * k} label={'THOUSANDS\nOF HAPPY\nCUSTOMERS'} />
            <View style={styles.divider} />
            <TrustItem kind="pin" circle={tier(44, 50, 56) * k} font={11 * k} label={'ACROSS\nINDIA'} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BASE, zIndex: 1000, elevation: 1000, overflow: 'hidden' },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', alignItems: 'center' },
  wordmark: { fontWeight: '900', letterSpacing: -1, color: '#FFFFFF' },
  byline: { fontWeight: '600', letterSpacing: 4, color: '#FFFFFF' },
  services: { fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  tagline: { textAlign: 'center', fontWeight: '900', letterSpacing: 0.2, color: INK },
  progressTrack: {
    width: '100%', height: 13, borderRadius: 7, backgroundColor: '#E1E7E3', overflow: 'hidden',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  progressFill: { height: '100%', borderRadius: 6, backgroundColor: GREEN, overflow: 'hidden' },
  progressShine: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.22)' },
  loadingLabel: { fontWeight: '600', letterSpacing: 5, color: '#3A3A3A' },
  trustRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around' },
  trustItem: { flex: 1, alignItems: 'center' },
  trustLabel: { textAlign: 'center', fontWeight: '800', color: INK },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: 8, backgroundColor: '#DCE3DE' },
});
