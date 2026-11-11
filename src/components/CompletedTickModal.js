import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import SafeModal from './SafeModal';

// Google Pay–style success: the green disc pops in with an overshoot, two
// rings ripple out behind it, the white tick DRAWS itself (stroke-dashoffset),
// then the text fades up. Auto-closes after `autoCloseMs`; tap to close sooner.
const AnimatedPath = Animated.createAnimatedComponent(Path);
const SIZE = 96;
const GREEN = '#1E8E3E';
const TICK_LEN = 48; // ≥ path length of the tick below

export default function CompletedTickModal({ visible, title = 'Completed', message, onClose, autoCloseMs = 2200 }) {
  const disc = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return undefined;
    [disc, ripple, draw, text].forEach((v) => v.setValue(0));
    Animated.sequence([
      Animated.parallel([
        Animated.spring(disc, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }),
        Animated.timing(ripple, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
    Animated.sequence([
      Animated.delay(220),
      Animated.timing(draw, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(text, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => onClose?.(), autoCloseMs);
    return () => clearTimeout(t);
  }, [visible, disc, ripple, draw, text, onClose, autoCloseMs]);

  const ring = (delay) => ({
    position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: GREEN,
    opacity: ripple.interpolate({ inputRange: [0, delay, 1], outputRange: [0, 0.28, 0] }),
    transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9 - delay] }) }],
  });

  return (
    <SafeModal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', width: '100%', maxWidth: 340 }}>
          <View style={{ width: SIZE * 1.9, height: SIZE * 1.6, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={ring(0.15)} />
            <Animated.View style={ring(0.4)} />
            <Animated.View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', transform: [{ scale: disc }] }}>
              <Svg width={52} height={52} viewBox="0 0 52 52">
                <AnimatedPath
                  d="M12 27 L22 37 L41 17"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={5.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={TICK_LEN}
                  strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [TICK_LEN, 0] })}
                />
              </Svg>
            </Animated.View>
          </View>
          <Animated.View style={{ alignItems: 'center', opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#111111' }}>{title}</Text>
            {message ? <Text style={{ marginTop: 6, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>{message}</Text> : null}
          </Animated.View>
        </View>
      </Pressable>
    </SafeModal>
  );
}
