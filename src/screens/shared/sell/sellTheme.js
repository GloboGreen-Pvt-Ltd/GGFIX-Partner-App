import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Check, PencilLine } from 'lucide-react-native';

/**
 * Shared look for the Sell flow (Sell home → Your Device → Choose Description
 * → assessment steps → price → listed). GGFIX palette: green #09AD2A, ink
 * #1E1E1E, white, neutrals #F8F8F8 / #F3F3F3.
 *
 * Kept local to the Sell flow on purpose — theme/colors.js and
 * components/ui.js are shared by 40+ other screens.
 *
 * Every pressable here uses a STATIC style object: NativeWind's jsx interop
 * drops `style={({ pressed }) => …}` functions (see components/ios/index.js).
 */
export const SELL = {
  green: '#09AD2A',
  greenDark: '#078F23', // green text on white / light-green fills
  greenLight: '#EAF8EC',
  greenLine: '#CDEFD5',
  ink: '#1E1E1E',
  muted: '#6B6B6B',
  subtle: '#8E8E8E',
  line: '#E6E6E6',
  soft: '#F3F3F3',
  page: '#F8F8F8',
  card: '#FFFFFF',
  danger: '#DC2626',
  dangerLight: '#FDECEC',
  amber: '#F59E0B',
  amberDark: '#B45309',
  amberLight: '#FEF3C7',
};

export const sellShadow = {
  shadowColor: '#1E1E1E',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

/** Full-width pill CTA. `variant="outline"` for the secondary action. */
export function SellButton({ title, onPress, disabled, loading, arrow = false, variant = 'primary', style }) {
  const outline = variant === 'outline';
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={{
        minHeight: 50,
        borderRadius: 999,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: outline ? SELL.card : SELL.green,
        borderWidth: outline ? 1.5 : 0,
        borderColor: SELL.line,
        opacity: disabled && !loading ? 0.45 : 1,
        ...style,
      }}
    >
      {loading ? (
        <ActivityIndicator color={outline ? SELL.green : '#FFFFFF'} />
      ) : (
        <>
          <Text style={{ fontSize: 15, fontWeight: '800', color: outline ? SELL.ink : '#FFFFFF' }} numberOfLines={1}>
            {title}
          </Text>
          {arrow ? <ArrowRight size={18} color={outline ? SELL.ink : '#FFFFFF'} strokeWidth={2.4} style={{ marginLeft: 8 }} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

/**
 * Sticky footer for a step's CTA, padded clear of the gesture / 3-button nav
 * bar. `caption` is a small status line above the button ("3 of 4 answered").
 */
export function SellFooter({ caption, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10) + 4,
        backgroundColor: SELL.card,
        borderTopWidth: 1,
        borderTopColor: SELL.soft,
        shadowColor: '#1E1E1E',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
        elevation: 10,
      }}
    >
      {caption ? (
        <Text style={{ fontSize: 12, color: SELL.muted, textAlign: 'center', marginBottom: 8 }} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** Step intro: bold title + one helper line, above the step's cards. */
export function SellIntro({ title, caption }) {
  return (
    <View style={{ marginBottom: 12, paddingHorizontal: 2 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: SELL.ink }}>{title}</Text>
      {caption ? <Text style={{ fontSize: 13, color: SELL.muted, marginTop: 3, lineHeight: 18 }}>{caption}</Text> : null}
    </View>
  );
}

/** White rounded section card. */
export function SellCard({ children, style }) {
  return (
    <View
      style={{
        backgroundColor: SELL.card,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: SELL.soft,
        ...sellShadow,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

/** Amber "Editing order" note shown when an existing sell order is re-opened. */
export function EditingBanner({ text }) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: SELL.amberLight,
        borderRadius: 14, padding: 12, marginBottom: 12,
      }}
    >
      <PencilLine size={16} color={SELL.amberDark} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: SELL.amberDark, letterSpacing: 0.5 }}>EDITING ORDER</Text>
        <Text style={{ fontSize: 12, color: SELL.ink, fontWeight: '600', marginTop: 2 }}>{text}</Text>
      </View>
    </View>
  );
}

/** Small filled check used on selected tiles. */
export function CheckDot({ size = 18 }) {
  return (
    <View style={{ height: size, width: size, borderRadius: size / 2, backgroundColor: SELL.green, alignItems: 'center', justifyContent: 'center' }}>
      <Check size={size * 0.62} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

/** Empty radio ring (unselected). */
export function RadioRing({ size = 20 }) {
  return <View style={{ height: size, width: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#C9C9C9', backgroundColor: SELL.card }} />;
}
