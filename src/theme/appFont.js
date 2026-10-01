// App-wide Inter font.
//
// There is no supported "default font" in React Native, and the usual global
// hooks don't work on this version:
//   - React 19 ignores `Text.defaultProps` on function components, and
//   - React Native 0.86's <Text>/<TextInput> are plain function components
//     (the `component(...)` syntax), so there is no `.render` to wrap — the
//     older patch in ./fontScaling.js silently never applies.
//
// What every <Text>/<TextInput> in the app DOES do is create its native view —
// RCTText / RCTVirtualText / RCTSelectableText, or AndroidTextInput /
// RCTSinglelineTextInputView / RCTMultilineTextInputView — through NativeWind's
// JSX runtime (react-native-css-interop/jsx-runtime, babel's jsxImportSource),
// looked up on that module at every call. Wrapping its jsx/jsxs lets us set
// the Inter face on exactly those native views, everywhere — including text
// inside third-party components (navigation headers, gluestack, …).
//
// Rules:
//   - Only text with no font family, or a generic system/serif family, is
//     switched. Icon fonts (Ionicons, MaterialCommunityIcons, …) and any
//     deliberate family (e.g. monospace) keep theirs.
//   - Inter ships one file per weight and Android can't derive a true bold
//     from one custom font, so each text's weight picks its own Inter face and
//     fontWeight/fontStyle are then dropped (no synthetic bold/slant on top).
//   - Nested text with no weight/style/family of its own is left alone, so it
//     inherits its parent's face instead of being reset to Regular.
//   - Off until App.js has loaded the fonts (enableInterFont); a failed load
//     simply leaves the system font in place.

import { StyleSheet } from 'react-native';

let enabled = false;
export function enableInterFont() {
  enabled = true;
}

const INTER_BY_WEIGHT = {
  // 100/200 aren't loaded — Light is the lightest face App.js registers.
  100: 'Inter_300Light',
  200: 'Inter_300Light',
  300: 'Inter_300Light',
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
  900: 'Inter_900Black',
};

const GENERIC_FAMILIES = new Set(['system', 'sans-serif', 'serif', 'georgia', 'roboto', 'helvetica', 'arial']);

const TEXT_VIEWS = new Set(['RCTText', 'RCTSelectableText']);
const NESTED_TEXT_VIEWS = new Set(['RCTVirtualText']);
const INPUT_VIEWS = new Set(['AndroidTextInput', 'RCTSinglelineTextInputView', 'RCTMultilineTextInputView']);

function weightOf(fontWeight) {
  if (fontWeight === 'bold') return 700;
  if (fontWeight == null || fontWeight === 'normal') return 400;
  const n = parseInt(fontWeight, 10);
  return Number.isFinite(n) ? Math.min(900, Math.max(100, Math.round(n / 100) * 100)) : 400;
}

export function interFamily(fontWeight, fontStyle) {
  const w = weightOf(fontWeight);
  if (fontStyle === 'italic') {
    // Italic faces registered: Regular, SemiBold, Bold.
    if (w <= 450) return 'Inter_400Regular_Italic';
    if (w <= 650) return 'Inter_600SemiBold_Italic';
    return 'Inter_700Bold_Italic';
  }
  return INTER_BY_WEIGHT[w] || INTER_BY_WEIGHT[400];
}

/** The style with an Inter face applied, or null to leave the view untouched. */
export function applyInter(style, nested) {
  const flat = StyleSheet.flatten(style) || {};
  const fam = flat.fontFamily;
  if (fam && !GENERIC_FAMILIES.has(String(fam).toLowerCase())) return null;
  if (nested && fam == null && flat.fontWeight == null && flat.fontStyle == null) return null;
  const next = { ...flat, fontFamily: interFamily(flat.fontWeight, flat.fontStyle) };
  delete next.fontWeight;
  delete next.fontStyle;
  return next;
}

function wrapJsx(original) {
  if (typeof original !== 'function' || original.__ggfixInter) return original;
  const wrapped = function ggfixInterJsx(type, props, ...rest) {
    if (enabled && typeof type === 'string' && props) {
      const nested = NESTED_TEXT_VIEWS.has(type);
      if (nested || TEXT_VIEWS.has(type) || INPUT_VIEWS.has(type)) {
        const style = applyInter(props.style, nested);
        if (style) props = { ...props, style };
      }
    }
    return original(type, props, ...rest);
  };
  wrapped.__ggfixInter = true;
  return wrapped;
}

// Patch the runtime module objects the compiled code calls into (the same
// module instances — same specifier — Metro resolves for every file).
function patchRuntime(runtime, names) {
  if (!runtime) return;
  names.forEach((name) => {
    if (typeof runtime[name] === 'function') runtime[name] = wrapJsx(runtime[name]);
  });
}

patchRuntime(require('react-native-css-interop/jsx-runtime'), ['jsx', 'jsxs']);
patchRuntime(require('react-native-css-interop/jsx-dev-runtime'), ['jsxDEV']);
