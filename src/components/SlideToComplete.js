import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Text, View } from 'react-native';
import { ChevronsRight, Lock } from 'lucide-react-native';

// Port of the Staff app's "Slide to Completed" (Quality Check row): a full
// swipe fires onComplete once; a partial swipe springs back; the knob nudges
// right while idle as a hint. `completed` locks it at the end.
const GREEN = '#476B26';
const GREEN_TINT = '#EEF4E8';
const H = 48;
const KNOB = H - 6;

export default function SlideToComplete({ label = 'Slide to Complete', doneLabel = 'Completed', disabled: off, completed, onComplete }) {
  const disabled = off || completed;
  const [w, setW] = useState(0);
  const max = Math.max(0, w - KNOB - 6);
  const x = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const firing = useRef(false);
  const loop = useRef(null);
  const startHint = useCallback(() => {
    loop.current = Animated.loop(Animated.sequence([
      Animated.timing(hint, { toValue: 8, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(hint, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(900),
    ]));
    loop.current.start();
  }, [hint]);
  const stopHint = useCallback(() => { loop.current?.stop(); hint.setValue(0); }, [hint]);
  useEffect(() => {
    if (disabled) return undefined;
    startHint();
    return stopHint;
  }, [disabled, startHint, stopHint]);
  const springBack = useCallback(() => {
    Animated.spring(x, { toValue: 0, bounciness: 6, useNativeDriver: true }).start(() => { if (!disabled) startHint(); });
  }, [x, disabled, startHint]);
  const fire = useCallback(() => {
    if (firing.current) return;
    firing.current = true;
    Animated.timing(x, { toValue: max, duration: 90, useNativeDriver: true }).start(() => {
      Promise.resolve(onComplete?.()).finally(() => { firing.current = false; springBack(); });
    });
  }, [x, max, onComplete, springBack]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled && !firing.current,
    onMoveShouldSetPanResponder: (_, g) => !disabled && !firing.current && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: stopHint,
    onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(max, g.dx))),
    onPanResponderRelease: (_, g) => { if (g.dx >= max * 0.9) fire(); else springBack(); },
    onPanResponderTerminate: springBack,
  }), [disabled, stopHint, x, max, fire, springBack]);

  if (completed) {
    return (
      <View accessible accessibilityLabel={`${doneLabel}, locked`}
        style={{ height: H, borderRadius: H / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: GREEN, paddingLeft: 18, paddingRight: 3 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>{doneLabel}</Text>
        <View style={{ width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Lock size={16} color={GREEN} strokeWidth={2.6} />
        </View>
      </View>
    );
  }
  return (
    <View
      {...responder.panHandlers}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => { if (!disabled) fire(); }}
      style={{ height: H, borderRadius: H / 2, justifyContent: 'center', backgroundColor: GREEN_TINT, borderWidth: 1, borderColor: GREEN, opacity: disabled ? 0.5 : 1, overflow: 'hidden' }}
    >
      <Animated.Text numberOfLines={1}
        style={{ position: 'absolute', left: KNOB + 10, right: 10, textAlign: 'center', fontSize: 14, fontWeight: '800', color: GREEN,
          opacity: x.interpolate({ inputRange: [0, Math.max(1, max * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
        {label}
      </Animated.Text>
      <Animated.View style={{ width: KNOB, height: KNOB, borderRadius: KNOB / 2, marginLeft: 3, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: Animated.add(x, hint) }] }}>
        <ChevronsRight size={20} color="#FFFFFF" strokeWidth={2.6} />
      </Animated.View>
    </View>
  );
}
