// App-wide toast. One <ToastHost /> sits at the app root; showToast() (and
// notify() in components/confirm) can be called from anywhere. One toast at a
// time — a new one replaces the current — and the same text inside 3 s is
// dropped, so a screen handler and a shared handler never stack duplicates.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X, TriangleAlert, Info } from 'lucide-react-native';

const TYPES = {
  success: { color: '#609138', bg: '#EEF5E8', Icon: Check },
  error: { color: '#F32C26', bg: '#FDEAE9', Icon: X },
  warning: { color: '#FAA700', bg: '#FFF4DB', Icon: TriangleAlert },
  info: { color: '#035C6C', bg: '#E5F3F5', Icon: Info },
};
const DEDUPE_MS = 3000;
// Clears the floating bottom navigation bar on tab screens.
const NAV_CLEARANCE = 76;

let listener = null;
let last = { key: '', at: 0 };
let seq = 0;

/** showToast({ type: 'success' | 'error' | 'warning' | 'info', title, message, duration }) */
export function showToast({ type = 'info', title = '', message = '', duration = 3000 } = {}) {
  const t = String(title || '').trim();
  const m = String(message || '').trim();
  if (!t && !m) return;
  const key = `${type}|${t}|${m}`;
  const now = Date.now();
  if (key === last.key && now - last.at < DEDUPE_MS) return;
  last = { key, at: now };
  listener?.({ id: ++seq, type: TYPES[type] ? type : 'info', title: t || m, message: t ? m : '', duration });
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const [kb, setKb] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => {
    listener = (next) => {
      clearTimeout(timer.current);
      setToast(next);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, next.duration);
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e?.endCoordinates?.height || 0));
    const off = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => { listener = null; clearTimeout(timer.current); show.remove(); off.remove(); };
  }, []);

  const hide = () => {
    clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) setToast(null); });
  };

  if (!toast) return null;
  const { color, bg, Icon } = TYPES[toast.type];
  const bottom = kb ? kb + 12 : insets.bottom + NAV_CLEARANCE;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center', paddingHorizontal: 16, zIndex: 9999, elevation: 9999 }}>
      <Animated.View style={{
        width: '100%', maxWidth: 440, opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}>
        <Pressable onPress={hide} accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
            backgroundColor: bg, borderWidth: 1, borderColor: `${color}33`,
            shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
          }}>
          <View style={{ height: 28, width: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
            <Icon size={15} color="#FFFFFF" strokeWidth={3} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#111111' }} numberOfLines={2}>{toast.title}</Text>
            {toast.message ? <Text style={{ marginTop: 1, fontSize: 12, color: '#4B5563' }} numberOfLines={2}>{toast.message}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
