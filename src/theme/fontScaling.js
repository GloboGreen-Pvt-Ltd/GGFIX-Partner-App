// Global responsive + compact font scaling for the whole shop app.
//
// The UI sets text sizes as absolute pixels — NativeWind `text-[13px]` classes
// and inline `fontSize` — spread across hundreds of components. To make every
// text responsive to the device (and a touch more compact) WITHOUT editing each
// screen, we wrap React Native's `Text` / `TextInput` render once, at app start,
// and scale the resolved `fontSize` (and `lineHeight`).
//
// It also forces `allowFontScaling = false`, so a phone's system "large font"
// accessibility setting can't inflate the UI on top of our own scaling — that
// OS multiplier is the usual reason text looks "over high".
//
// Why a monkey-patch: React 19 removed `Component.defaultProps`, so the old
// `Text.defaultProps.allowFontScaling = false` global no longer applies.
// `Text`/`TextInput` are forwardRef components whose render fn lives on
// `.render`; wrapping that is the supported way to affect every instance now.
// Import this file ONCE, as early as possible in App.js.

import React from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
// Use the short side so rotating the device (or a tablet's aspect ratio) can't
// blow the type up.
const shortSide = Math.min(width, height);

// Baseline = a standard modern phone (~iPhone 14 / Pixel 7 ≈ 392pt wide).
// Moderate scaling (track only HALF the width delta) keeps small phones from
// shrinking too hard and big phones/tablets from ballooning. COMPACT trims a
// few % so the overall type reads tighter. Result is clamped to a safe band.
const GUIDELINE_BASE_WIDTH = 392;
const COMPACT = 0.95;
const widthScale = shortSide / GUIDELINE_BASE_WIDTH;
const raw = (1 + (widthScale - 1) * 0.5) * COMPACT;

export const FONT_SCALE = Math.min(Math.max(raw, 0.82), 1.06);

// Scale a single font size. Non-numbers / non-positive values pass through.
export const scaleFont = (size) =>
  typeof size === 'number' && size > 0 ? Math.round(size * FONT_SCALE * 10) / 10 : size;

function patchFontScaling(Component) {
  if (!Component || Component.__ggfixFontPatched) return;
  const originalRender = Component.render;
  // Only forwardRef-style components expose a `.render` function we can wrap.
  if (typeof originalRender !== 'function') return;
  Component.__ggfixFontPatched = true;

  Component.render = function ggfixScaledRender(props, ref) {
    const element = originalRender.call(this, props, ref);
    if (!React.isValidElement(element)) return element;

    const flat = StyleSheet.flatten(element.props.style);
    let style = element.props.style;
    if (flat && typeof flat.fontSize === 'number') {
      style = { ...flat, fontSize: scaleFont(flat.fontSize) };
      if (typeof flat.lineHeight === 'number') {
        style.lineHeight = Math.round(flat.lineHeight * FONT_SCALE);
      }
    }

    return React.cloneElement(element, {
      // Respect an explicit per-instance choice; otherwise disable OS scaling.
      allowFontScaling: element.props.allowFontScaling ?? false,
      style,
    });
  };
}

patchFontScaling(RNText);
patchFontScaling(RNTextInput);
