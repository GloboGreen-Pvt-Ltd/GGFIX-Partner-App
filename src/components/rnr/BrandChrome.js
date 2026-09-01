import React from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';

const GREEN = '#087A0A';

const headerShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};

// A grid of faint dots — subtle brand texture behind the content.
function DotGrid({ rows = 5, cols = 6, gap = 15, r = 2.3, color = GREEN, opacity = 0.16, style }) {
  const w = (cols - 1) * gap + r * 2;
  const h = (rows - 1) * gap + r * 2;
  const dots = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      dots.push(<Circle key={`${x}-${y}`} cx={r + x * gap} cy={r + y * gap} r={r} fill={color} />);
    }
  }
  return (
    <Svg width={w} height={h} style={style} pointerEvents="none">
      <G opacity={opacity}>{dots}</G>
    </Svg>
  );
}

// Layered soft-green swoosh anchored in the top-right corner.
function CornerWave() {
  return (
    <Svg
      width={260}
      height={200}
      viewBox="0 0 260 200"
      style={{ position: 'absolute', top: 0, right: 0 }}
      pointerEvents="none"
    >
      <Path d="M260,0 L260,150 C205,150 150,118 130,58 C118,22 152,-6 260,0 Z" fill="#C8EEBF" opacity={0.5} />
      <Path d="M260,0 L260,104 C214,104 176,84 166,50 C158,24 186,0 260,0 Z" fill="#7ED957" opacity={0.5} />
      <Path d="M260,0 L260,58 C231,58 206,47 201,30 C197,14 216,2 260,0 Z" fill="#7ED957" opacity={0.4} />
    </Svg>
  );
}

// Faint concentric circles, partly off the bottom-left edge.
function CornerCircles() {
  return (
    <Svg
      width={340}
      height={340}
      viewBox="0 0 340 340"
      style={{ position: 'absolute', left: -120, bottom: -92 }}
      pointerEvents="none"
    >
      <Circle cx={170} cy={170} r={162} fill="#E6F7E3" opacity={0.55} />
      <Circle cx={170} cy={170} r={112} fill="#C8EEBF" opacity={0.4} />
      <Circle cx={170} cy={170} r={62} fill="#E6F7E3" opacity={0.55} />
    </Svg>
  );
}

/**
 * Soft mint gradient backdrop with the brand corner-wave, used across the
 * booking flow. Renders as an absolute-fill layer — place it as the first
 * child of a `flex-1` screen root and let the content sit on top.
 *   dots    — add the faint dot grids (busier backgrounds like the landing screen)
 *   circles — add the bottom-left concentric circles
 *   wave    — the top-RIGHT corner wave. On by default because it is the
 *             flow's signature mark; pass false for a plain page.
 */
/**
 * Full-bleed brand backdrop for the booking flow.
 *
 * `color` defaults to the mint the component is named for; New Booking passes
 * white. The decorations (wave, circles, dots) are pale greens — #C8EEBF,
 * #E6F7E3, #7ED957 — which were chosen against mint. On white they read
 * lighter but still register, so they are kept rather than hidden: dropping
 * them would strip the flow's brand chrome, not just recolour it.
 */
export function MintBackdrop({ dots = false, circles = false, wave = true, color = '#F0F8EF' }) {
  const { height } = useWindowDimensions();
  return (
    <>
      <LinearGradient
        colors={[color, color]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        {wave ? <CornerWave /> : null}
        {circles ? <CornerCircles /> : null}
        {dots ? <DotGrid rows={5} cols={6} style={{ position: 'absolute', right: 22, top: Math.round(height * 0.5) }} /> : null}
        {dots ? <DotGrid rows={6} cols={7} style={{ position: 'absolute', left: 18, top: Math.round(height * 0.74) }} /> : null}
      </View>
    </>
  );
}

/**
 * Booking-flow header: white squircle back button with a green chevron and a
 * centered bold title, sitting transparently over the MintBackdrop.
 */
export function BrandHeader({ title, onBack, right }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-row items-center px-4" style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          className="items-center justify-center active:opacity-70"
          style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: '#FFFFFF', ...headerShadow }}
        >
          <ChevronLeft size={22} color="#004C40" />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <View className="flex-1 items-center">
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#172117' }}>{title}</Text>
      </View>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}
