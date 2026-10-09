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

// Shared design tokens for the auth screens (Login / CreateAccount / forgot-password),
// on the GGFIX brand sheet (see theme/colors.js). GREEN is for icons and fills;
// green TEXT uses GREEN_TEXT, the deeper shade that stays readable at small sizes.
export const GREEN = '#09AD2A';
export const GREEN_TEXT = '#078F23';
export const MUTED = '#6B6B6B';
export const INK = '#1E1E1E';
export const SCREEN_BG = '#F8F8F8';
export const FIELD_BG = '#FFFFFF';
export const FIELD_BORDER = '#E6E6E6';
// Soft brand-green wash at the top of every auth screen, fading into the page.
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
// Error box: brand red on its soft tint.
const DANGER = '#F84141';
const DANGER_TINT = '#FEECEC';
const DANGER_LINE = '#FBB9B9';

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
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />
      <LinearGradient
        colors={[MINT, '#F3FAF4', SCREEN_BG]}
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
            borderColor: MINT_LINE,
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
        backgroundColor: DANGER_TINT,
        borderColor: DANGER_LINE,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 8,
      }}
    >
      <Text style={{ fontSize: 12, color: DANGER, lineHeight: 18 }}>{msg}</Text>
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
  link: { fontSize: 13, fontWeight: '700', color: GREEN_TEXT },
};
