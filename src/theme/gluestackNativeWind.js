// Makes `className` work on the gluestack-ui primitives.
//
// NativeWind's JSX transform does NOT translate `className` on every component
// — it swaps a component for a className-aware wrapper only if that component
// was registered with `cssInterop`, and the registry is keyed by component
// identity (react-native-css-interop's `interopComponents` map). React Native's
// own View / Text / Pressable / Image / ScrollView / ActivityIndicator are
// registered by the library itself; anything from a third-party package —
// gluestack included — is not. Without this file a `className` on <Box> is
// handed to gluestack as an unknown prop and silently dropped, which looks
// exactly like "the styles didn't apply".
//
// Import this module once, before the first gluestack element renders. It is
// idempotent (cssInterop overwrites the same registry key), so importing it
// from several screens is harmless.
//
// ── Why only these four ────────────────────────────────────────────────────
// gluestack-style merges the incoming `style` prop BEFORE its own resolved
// styles (styled.js: `[props.style, ...resolvedStyleProps.style]`), and in a
// React Native style array the LAST entry wins. So a gluestack component's base
// style always beats a NativeWind class.
//
// That is harmless for the layout primitives, whose bases are empty or purely
// structural and are exactly what the class would have said anyway:
//
//     Box      {}
//     HStack   { flexDirection: 'row' }
//     VStack   { flexDirection: 'column' }
//     Center   { alignItems: 'center', justifyContent: 'center' }
//
// It is NOT harmless for gluestack's <Text>, whose base sets color, fontSize
// (size="md"), fontWeight, fontFamily and letterSpacing — every one of which
// would override the corresponding `text-*` / `font-*` / `tracking-*` class and
// flatten the screen's typography. Text therefore stays React Native's own,
// which is what gluestack's Text renders underneath in any case, and is also
// the component `theme/fontScaling.js` patches for app-wide font scaling.
//
// Same reasoning excludes <Divider> (base sets bg + height) and <Image> (base
// sets maxWidth and a default size variant).
import { cssInterop } from 'nativewind';
import { Box, Center, HStack, VStack } from '@gluestack-ui/themed';

[Box, HStack, VStack, Center].forEach((Component) => {
  cssInterop(Component, { className: 'style' });
});
