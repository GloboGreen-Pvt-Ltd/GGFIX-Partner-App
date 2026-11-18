// Compact 6-digit PIN pad: masked dots, numeric keypad, auto-submit at 6 digits.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const C = { bg: '#FFFFFF', primary: '#035C6C', border: '#E5E7EB', text: '#1F2937', muted: '#6B7280', error: '#DC2626', tint: '#E6F2F4' };

export default function PinPad({ title, subtitle, error, busy, onComplete, onBiometric, resetKey, footer }) {
  const [pin, setPin] = useState('');
  useEffect(() => { setPin(''); }, [resetKey, error]);

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
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Ionicons name="lock-closed" size={24} color={C.primary} />
      </View>
      {title ? <Text style={{ fontSize: 19, fontWeight: '800', color: C.text }}>{title}</Text> : null}
      {subtitle ? <Text style={{ fontSize: 13, color: C.muted, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
      <View style={{ flexDirection: 'row', marginTop: 22 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const filled = i < pin.length;
          const active = i === pin.length && !busy;
          return (
            <View
              key={i}
              style={{
                width: 40, height: 46, borderRadius: 12, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center',
                borderWidth: active || filled || error ? 1.5 : 1, borderColor: error ? C.error : active || filled ? C.primary : C.border,
                backgroundColor: filled ? C.tint : C.bg,
              }}
            >
              {filled ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} /> : null}
            </View>
          );
        })}
      </View>
      <View style={{ minHeight: 22, justifyContent: 'center', marginTop: 10 }}>
        {busy ? <ActivityIndicator size="small" color={C.primary} />
          : error ? <Text style={{ color: C.error, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{error}</Text> : null}
      </View>
      <View style={{ marginTop: 8, alignItems: 'center' }}>
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
      </View>
      {footer}
    </View>
  );
}
