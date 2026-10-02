import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Shared design tokens for the auth screens (Login / CreateAccount / forgot-password).
export const GREEN = '#087A0A';
export const MUTED = '#667066';
export const INK = '#172117';
export const SCREEN_BG = '#F7FAF7';
export const FIELD_BG = '#FFFFFF';
export const FIELD_BORDER = '#E2E8E2';

/** Standard auth layout shell: gradient header, optional back arrow, centered scroll content. */
export function AuthShell({ onBack, children }) {
  const { width, height } = useWindowDimensions();
  // 768 (not 600) — matches the breakpoint used across the rest of the
  // pre-auth flow (Intro, Login, OTP) so a 600–767px device gets the same
  // compact/phone treatment everywhere instead of switching per screen.
  const isWide = width >= 768;
  // On a tablet the 440-wide card used to float in a mostly-blank page —
  // widen the card and scale the decorative gradient with the screen height
  // instead of a flat 320, so the layout reads as designed for the bigger
  // canvas rather than a phone screen centred in empty space.
  const gradientHeight = isWide ? Math.min(height * 0.55, 460) : 320;
  return (
    <View style={{ flex: 1, backgroundColor: SCREEN_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#E6F7E3" />
      <LinearGradient
        colors={['#E6F7E3', '#F0F8EF', SCREEN_BG]}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: gradientHeight }}
      />
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 56 : 28,
            left: 18,
            zIndex: 10,
            height: 38,
            width: 38,
            borderRadius: 12,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#E6F7E3',
          }}
        >
          <ArrowLeft size={20} color={GREEN} />
        </Pressable>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 32,
            justifyContent: isWide ? 'center' : 'flex-start',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              flex: isWide ? undefined : 1,
              width: '100%',
              maxWidth: isWide ? 560 : undefined,
              alignSelf: 'center',
              paddingHorizontal: isWide ? 48 : 22,
              paddingTop: Platform.OS === 'ios' ? (isWide ? 64 : 96) : (isWide ? 48 : 72),
            }}
          >
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <View
      style={{
        backgroundColor: '#FEF2F2',
        borderColor: '#FECACA',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 8,
      }}
    >
      <Text style={{ fontSize: 12, color: '#B91C1C', lineHeight: 18 }}>{msg}</Text>
    </View>
  );
}

export const authStyles = {
  h1: { fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 19 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: INK, marginBottom: 5, marginTop: 14, marginLeft: 2 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FIELD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    paddingHorizontal: 14,
    height: 46,
  },
  fieldInput: { fontSize: 13, color: INK, height: '100%', paddingVertical: 0 },
  ccChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    marginRight: 2,
    borderRightWidth: 1,
    borderRightColor: FIELD_BORDER,
    height: '60%',
  },
  ccText: { fontSize: 13, fontWeight: '700', color: INK },
  link: { fontSize: 13, fontWeight: '700', color: GREEN },
};
