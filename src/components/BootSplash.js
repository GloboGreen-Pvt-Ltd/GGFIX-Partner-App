import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * NearGFix Partner boot screen, shown by RootNavigator while the session
 * loads (RootNavigator owns the fade-out). Dark teal gradient with cyan/gold
 * glow waves, glyph in a glowing frame, wordmark, gold PARTNER, four service
 * icons and an indeterminate gold shimmer bar (no real progress is available,
 * so it never shows a percentage). All loops use the native driver.
 */
const GLYPH = require('../../assets/boot-logo-glyph.png');

const T1 = '#035C6C';
const T3 = '#012F38';
const CYAN = '#4FD1E0';
const GOLD = '#E8B84A';
const GOLD_LIGHT = '#F8DC8A';
const LEAF = '#4CC38A';

const SERVICES = [
  { icon: 'tools', label: 'Repair' },
  { icon: 'truck-fast-outline', label: 'Pickup' },
  { icon: 'cart-outline', label: 'Buy' },
  { icon: 'tag-outline', label: 'Sell' },
];
const SPARKS = [0.18, 0.42, 0.66, 0.88]; // x-positions along the bar

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const FONT_CAP = 1.15;

function Waves({ W, h, flip }) {
  // Two soft glowing curves (cyan + gold) for the top/bottom edges.
  const y = (f) => h * f;
  const p1 = `M0 ${y(0.55)}C${W * 0.3} ${y(0.95)} ${W * 0.65} ${y(0.15)} ${W} ${y(0.5)}`;
  const p2 = `M0 ${y(0.75)}C${W * 0.35} ${y(0.4)} ${W * 0.7} ${y(1)} ${W} ${y(0.7)}`;
  return (
    <Svg pointerEvents="none" width={W} height={h} style={[{ position: 'absolute', left: 0 }, flip ? { bottom: 0, transform: [{ scaleY: -1 }] } : { top: 0 }]}>
      <Path d={p1} stroke={CYAN} strokeOpacity={0.12} strokeWidth={10} fill="none" />
      <Path d={p1} stroke={CYAN} strokeOpacity={0.55} strokeWidth={1.2} fill="none" />
      <Path d={p2} stroke={GOLD} strokeOpacity={0.12} strokeWidth={10} fill="none" />
      <Path d={p2} stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

export default function BootSplash() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availH = H - insets.top - insets.bottom;

  const k = clamp(Math.min(W / 390, availH / 780), 0.8, 1.2);
  const u = (n) => Math.round(n * k);
  const frame = clamp(Math.min(W * 0.28, availH * 0.15), 80, 120);
  const logoSz = frame * 0.62 + 20; // visible logo size (+20dp)
  const barW = clamp(W * 0.8, 240, 440);
  const waveH = clamp(availH * 0.16, 90, 160);

  const enter = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const spin = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    spin.start();
    return () => spin.stop();
  }, [enter, slide]);
  const spinner = clamp(34 * k, 28, 40);
  const sr = spinner / 2 - 2; // arc radius
  const circ = 2 * Math.PI * sr;

  const textProps = { numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: FONT_CAP };
  const rise = (d) => ({ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [d, 0] }) }] });

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading NearGFix Partner" style={[StyleSheet.absoluteFill, styles.root]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={W} height={H}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor={T1} />
            <Stop offset="1" stopColor={T3} />
          </LinearGradient>
          <RadialGradient id="glow" cx="50%" cy="40%" r="55%">
            <Stop offset="0" stopColor={CYAN} stopOpacity={0.18} />
            <Stop offset="1" stopColor={CYAN} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#glow)" />
      </Svg>

      <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.center, { paddingBottom: availH * 0.04 }]}>
          <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center' }, rise(6)]}>
            <View style={styles.frame}>
              <Image source={GLYPH} style={{ width: logoSz, height: logoSz }} resizeMode="contain" fadeDuration={0} />
            </View>
          </Animated.View>

          <Animated.View style={[styles.block, { marginTop: u(16) }, rise(10)]}>
            <Text {...textProps} style={[styles.word, { fontSize: clamp(40 * k, 30, 48) }]}>
              Near<Text style={{ color: CYAN }}>GFix</Text>
            </Text>
            <View style={[styles.partnerRow, { marginTop: u(10) }]}>
              <View style={styles.goldLine} />
              <View style={[styles.pill, { paddingHorizontal: u(14), paddingVertical: u(4) }]}>
                <Text {...textProps} style={[styles.partner, { fontSize: clamp(12 * k, 10.5, 14) }]}>PARTNER</Text>
              </View>
              <View style={styles.goldLine} />
            </View>

            <View style={[styles.services, { width: barW, marginTop: u(30) }]}>
              {SERVICES.map((s) => (
                <View key={s.label} style={[styles.card, { paddingVertical: u(12), borderRadius: u(14) }]}>
                  <MaterialCommunityIcons name={s.icon} size={u(24)} color={GOLD} />
                  <Text {...textProps} style={[styles.serviceLabel, { fontSize: clamp(12 * k, 10, 13.5), marginTop: u(6) }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Cyan circular spinner (native-driver rotation). */}
            <Animated.View
              style={{
                marginTop: u(32), width: spinner, height: spinner,
                shadowColor: CYAN, shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                transform: [{ rotate: slide.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
              }}
            >
              <Svg width={spinner} height={spinner}>
                <Circle cx={spinner / 2} cy={spinner / 2} r={sr} stroke={CYAN} strokeOpacity={0.15} strokeWidth={2.5} fill="none" />
                <Circle
                  cx={spinner / 2} cy={spinner / 2} r={sr} stroke={CYAN} strokeWidth={2.5} fill="none"
                  strokeLinecap="round" strokeDasharray={`${circ * 0.28} ${circ}`}
                />
              </Svg>
            </Animated.View>
          </Animated.View>
        </View>

        <View style={{ marginBottom: u(18) }}>
          <View style={styles.footer}>
            <View style={styles.footLine} />
            <Text {...textProps} style={[styles.footerText, { fontSize: clamp(10 * k, 9, 11.5) }]}>Powered by</Text>
            <View style={styles.footLine} />
          </View>
          <View style={[styles.footer, { marginTop: u(6) }]}>
            <MaterialCommunityIcons name="leaf" size={clamp(14 * k, 12, 16)} color={LEAF} style={{ marginRight: 6 }} />
            <Text {...textProps} minimumFontScale={0.7} style={[styles.company, { flexShrink: 1, fontSize: clamp(11.5 * k, 9.5, 13) }]}>
              Globogreen System & Technology Pvt Ltd
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: T1, zIndex: 1000, elevation: 1000, overflow: 'hidden' },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  frame: {
    alignItems: 'center', justifyContent: 'center',
  },
  block: { alignItems: 'center', alignSelf: 'stretch' },
  word: { fontWeight: '800', letterSpacing: -0.6, color: '#FFFFFF', includeFontPadding: false },
  partnerRow: { flexDirection: 'row', alignItems: 'center' },
  goldLine: { width: 32, height: 1, backgroundColor: GOLD, opacity: 0.8, marginHorizontal: 10 },
  floatIcon: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    backgroundColor: 'rgba(1,30,36,0.55)', shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: GOLD, backgroundColor: 'rgba(232,184,74,0.1)' },
  partner: { fontWeight: '700', letterSpacing: 5, paddingLeft: 5, color: GOLD },
  services: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  card: {
    flex: 1, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,209,224,0.35)',
    backgroundColor: 'rgba(1,30,36,0.45)',
  },
  serviceLabel: { fontWeight: '600', color: '#FFFFFF' },
  edgeGlow: { position: 'absolute', backgroundColor: '#FFFFFF', shadowColor: GOLD_LIGHT, shadowOpacity: 1, shadowRadius: 8, elevation: 6 },
  footLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },
  barGlow: { shadowColor: GOLD, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  bar: { padding: 1, borderWidth: 1, borderColor: GOLD, backgroundColor: '#012A31', overflow: 'hidden' },
  spark: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: GOLD_LIGHT },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  footerText: { flexShrink: 1, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2 },
  company: { fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
});
