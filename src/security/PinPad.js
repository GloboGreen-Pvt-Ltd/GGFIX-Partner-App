// Compact 6-digit PIN pad: masked dots, numeric keypad, auto-submit at 6 digits.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Current on-screen keyboard height (0 when hidden) so PIN screens can stay above it. */
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e?.endCoordinates?.height || 0));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

export const C = { bg: '#FFFFFF', primary: '#035C6C', border: '#E5E7EB', text: '#1F2937', muted: '#6B7280', error: '#DC2626', tint: '#E6F2F4' };

export default function PinPad({ title, subtitle, error, busy, onComplete, onBiometric, resetKey, footer, systemKeyboard, hideIcon }) {
  const [pin, setPin] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { setPin(''); if (systemKeyboard) setTimeout(() => { inputRef.current?.blur(); inputRef.current?.focus(); }, 300); }, [resetKey, error, systemKeyboard]);
  const type = (v) => {
    if (busy) return;
    const next = v.replace(/\D/g, '').slice(0, 6);
    setPin(next);
    if (next.length === 6) onComplete?.(next);
  };

  const press = (d) => {
    if (busy || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) onComplete?.(next);
  };
  const back = () => { if (!busy) setPin((p) => p.slice(0, -1)); };

  // Static styles only (no style function): some interop layers drop function styles.
  const Key = ({ children, onPress, label, plain }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={label}
      android_ripple={{ color: C.tint, borderless: true, radius: 36 }}
      style={{ width: 72, height: 72, borderRadius: 36, marginHorizontal: 10, marginVertical: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: plain ? 'transparent' : '#F1F5F6' }}
    >
      {children}
    </Pressable>
  );
  const digit = (d) => (
    <Key key={d} onPress={() => press(d)} label={d}>
      <Text style={{ fontSize: 26, fontWeight: '600', color: C.text }}>{d}</Text>
    </Key>
  );
  const accent = error ? C.error : C.primary;

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      {hideIcon ? null : (
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Ionicons name="lock-closed" size={24} color={C.primary} />
        </View>
      )}
      {title ? <Text style={{ fontSize: 19, fontWeight: '800', color: C.text }}>{title}</Text> : null}
      {subtitle ? <Text style={{ fontSize: 13, color: C.muted, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
      <View style={{ flexDirection: 'row', marginTop: 22, alignSelf: 'stretch', justifyContent: 'center' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const filled = i < pin.length;
          const active = i === pin.length && !busy;
          return (
            <View
              key={i}
              style={{
                flex: 1, maxWidth: systemKeyboard ? 46 : 40, height: systemKeyboard ? 52 : 46, borderRadius: 12, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center',
                borderWidth: active || filled || error ? 1.5 : 1, borderColor: error ? C.error : active || filled ? C.primary : C.border,
                backgroundColor: filled ? C.tint : C.bg,
              }}
            >
              {filled ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} /> : null}
            </View>
          );
        })}
        {systemKeyboard ? (
          // Real (near-invisible) input laid over the boxes: tapping a box focuses it natively.
          <TextInput
            ref={inputRef}
            value={pin}
            onChangeText={type}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            showSoftInputOnFocus
            caretHidden
            contextMenuHidden
            autoComplete="off"
            importantForAutofill="no"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', fontSize: 1 }}
          />
        ) : null}
      </View>
      <View style={{ minHeight: 22, justifyContent: 'center', marginTop: 10 }}>
        {busy ? <ActivityIndicator size="small" color={C.primary} />
          : error ? <Text style={{ color: C.error, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{error}</Text>
          : systemKeyboard ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="keypad-outline" size={14} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 12.5, marginLeft: 6 }}>Tap the boxes to open the keypad</Text>
            </View>
          ) : null}
      </View>
      {systemKeyboard && onBiometric ? (
        <Pressable onPress={onBiometric} accessibilityLabel="Biometric" style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44, borderRadius: 22, backgroundColor: C.tint }}>
          <Ionicons name="finger-print" size={22} color={C.primary} />
          <Text style={{ marginLeft: 8, color: C.primary, fontWeight: '700', fontSize: 13.5 }}>Use fingerprint</Text>
        </Pressable>
      ) : null}
      {systemKeyboard ? null : <View style={{ marginTop: 8, alignItems: 'center' }}>
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row) => (
          <View key={row[0]} style={{ flexDirection: 'row' }}>{row.map(digit)}</View>
        ))}
        <View style={{ flexDirection: 'row' }}>
          <Key plain onPress={onBiometric} label="Biometric">
            {onBiometric ? <Ionicons name="finger-print" size={32} color={C.primary} /> : null}
          </Key>
          {digit('0')}
          <Key plain onPress={pin.length ? back : undefined} label="Delete">
            {pin.length ? <Ionicons name="backspace-outline" size={28} color={C.text} /> : null}
          </Key>
        </View>
      </View>}
      {footer}
    </View>
  );
}
