// iOS 26 "Liquid Glass" design language — shared tokens + primitives.
//
// The owner Home screen (screens/owner/DashboardScreen.tsx) introduced this look
// and still carries its own private copy of these definitions (now in
// components/dashboard/theme.tsx). This module is
// the extracted version every SUBSEQUENT screen should import, so converting
// another tab doesn't mean pasting the recipe a third time. Home is deliberately
// left untouched for now — porting it is a separate, riskier change; when it
// happens, delete its local copies and import from here.
//
// What the language means concretely:
//
//   · FLOATING GLASS CHROME. The nav bar is a translucent layer the content
//     scrolls underneath, with a bright specular top edge and a soft shadow, so
//     it reads as a lens floating above the page rather than a solid bar.
//   · CONCENTRIC RADII. A container of radius R holds children of radius
//     R − padding, so corners stay visually parallel. See `concentric()`.
//   · LARGER, SOFTER SHAPES. Cards at 26, controls as full capsules, icon tiles
//     squircle-ish (28% of their side).
//   · SPECULAR EDGES. Every glass surface carries a 1px light inner border along
//     the top (`GLASS.edge`) — the detail that sells "glass" over "grey box".
//   · CONTENT FIRST. Chrome recedes, separators are light, section headers are
//     bold inline titles rather than tiny uppercase captions.
//
// NO REAL BLUR: `expo-blur` is not a dependency and is not in the installed
// Android build, so BlurView would need a new native binary. The glass here is
// layered translucency (high-opacity whites + gradient + specular edge), which
// needs no native module and renders identically on Android and iOS. Every
// shadow below also carries an `elevation` so Android gets the float too.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronRight } from 'lucide-react-native';

export const HAIRLINE = StyleSheet.hairlineWidth;

// Brand green, kept as the app's tint colour.
export const GREEN = '#087A0A';
export const GREEN_LIGHT = '#16BB05';
export const GREEN_DARK = '#087A0A';

// iOS semantic colours (light appearance).
export const C = {
  groupedBg: '#FFFFFF',                 // systemGroupedBackground
  card: '#FFFFFF',                      // secondarySystemGroupedBackground
  fill: 'rgba(143, 160, 143, 0.12)',       // tertiarySystemFill
  highlight: 'rgba(143, 160, 143, 0.20)',  // row press highlight
  label: '#172117',
  label2: 'rgba(23, 33, 23, 0.60)',        // secondaryLabel
  label3: 'rgba(23, 33, 23, 0.30)',        // tertiaryLabel
  separator: 'rgba(23, 33, 23, 0.16)',     // lighter than iOS 18 — glass wants less line
  placeholder: '#8FA08F',
  tint: GREEN,
  // System palette for icon tiles.
  blue: '#16BB05',
  green: '#16BB05',
  indigo: '#16BB05',
  orange: '#F59E0B',
  pink: '#DC2626',
  purple: '#16BB05',
  teal: '#16BB05',
  cyan: '#16BB05',
  red: '#DC2626',
  yellow: '#F59E0B',
  grey: '#8FA08F',
};

// Liquid Glass surface recipe. `fill` is deliberately high-opacity: without a
// real backdrop blur, anything thinner smears the scrolling content behind it
// instead of frosting it.
export const GLASS = {
  fill: 'rgba(255,255,255,0.86)',       // floating chrome
  card: 'rgba(255,255,255,0.92)',       // content cards
  edge: 'rgba(255,255,255,0.85)',       // specular top edge
  hairline: 'rgba(255,255,255,0.55)',   // inner light border
  shadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.10,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  tileShadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chromeShadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
};

// SF text styles. `theme/fontScaling.js` already scales every fontSize app-wide
// against the device's short side, so these are authored at iOS point sizes
// verbatim — do NOT hand-shrink them per screen, or the global scale compounds.
export const T = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,
};

// iOS 26 corner scale.
export const R = {
  card: 26,
  control: 999,   // capsule
  tile: 20,
  sheet: 32,
};

// Concentric inner radius: a child inset by `pad` inside a radius-`outer`
// container should curve on the same centre, never tighter than 6.
export const concentric = (outer, pad) => Math.max(6, outer - pad);

// Cheap top-stop for icon gradients: lift the colour toward white ~22%.
// Accepts #RRGGBB (every colour in `C` is that form).
export function lighten(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.22);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// Pressable that swaps in a pressed style object.
//
// NOT `style={({ pressed }) => ...}`: NativeWind's jsx interop silently drops a
// style FUNCTION whole when the element also carries className, taking the
// layout with it. Tracking pressed state in React and passing a plain object is
// immune to that.
export function Touchable({ style, pressedStyle, onPressIn, onPressOut, children, ...rest }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      style={pressed && pressedStyle ? { ...style, ...pressedStyle } : style}
      onPressIn={(e) => { setPressed(true); if (onPressIn) onPressIn(e); }}
      onPressOut={(e) => { setPressed(false); if (onPressOut) onPressOut(e); }}
    >
      {children}
    </Pressable>
  );
}

// A Liquid Glass surface: translucent body, a bright specular line along the top
// edge, a light inner border and a soft float shadow. Every card / capsule / bar
// is built from this.
//
// The specular edge is an absolutely-positioned 1px child rather than a
// borderTopWidth, because a real border would also darken the sides and kill the
// "lens" read.
export function Glass({ radius = R.card, style, fill = GLASS.card, shadow = GLASS.shadow, children, tinted }) {
  // Inset the specular line so it stops before the corner arcs start. Capsules
  // pass radius 999, so this must be clamped or the line would have negative
  // width and vanish.
  const edgeInset = Math.min(radius * 0.5, 26);
  return (
    <View style={[{ borderRadius: radius, backgroundColor: fill }, shadow, style]}>
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: radius,
          borderWidth: HAIRLINE,
          borderColor: tinted ? 'rgba(255,255,255,0.35)' : GLASS.hairline,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: edgeInset, right: edgeInset,
          height: 1, backgroundColor: tinted ? 'rgba(255,255,255,0.45)' : GLASS.edge,
          borderRadius: 1,
        }}
      />
      {children}
    </View>
  );
}

// Icon tile. iOS 26 icons are squircle-ish (radius ≈ 28% of the side) and carry
// a top-down gradient plus a specular edge — the same treatment as a Home Screen
// app icon under Liquid Glass.
export function IconSquare({ icon: Icon, color, size = 30, glyph = 17 }) {
  const radius = Math.round(size * 0.28);
  return (
    <LinearGradient
      colors={[lighten(color), color]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{
        width: size, height: size, borderRadius: radius,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: color, shadowOpacity: 0.3, shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 }, elevation: 2,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: radius * 0.5, right: radius * 0.5,
          height: 1, backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      />
      <Icon size={glyph} color="#FFFFFF" strokeWidth={2.2} />
    </LinearGradient>
  );
}

// Section header. iOS 26 favours a bold inline title over the old tiny uppercase
// grouped-table caption, with a tinted trailing action.
export function GroupHeader({ title, subtitle, action, onAction, pad = 16, style }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: pad + 4, marginBottom: 10 },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: T.title3, color: C.label, letterSpacing: -0.45, fontWeight: '700' }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: T.footnote, color: C.label2, letterSpacing: -0.1, marginTop: 1 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Touchable onPress={onAction} accessibilityRole="button" hitSlop={8} pressedStyle={{ opacity: 0.4 }}>
          <Text style={{ fontSize: T.subhead, color: C.tint, fontWeight: '600', letterSpacing: -0.2 }}>
            {action}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

// Inset glass card every list sits inside.
//
// The clipping lives on an INNER view, not on the Glass root: iOS clips a view's
// own shadow when that same view sets `overflow: 'hidden'`, so putting both on
// one node would silently drop the float shadow that makes the card read as
// glass.
export function Group({ children, pad = 16, style }) {
  return (
    <Glass radius={R.card} style={[{ marginHorizontal: pad }, style]}>
      <View style={{ borderRadius: R.card, overflow: 'hidden' }}>{children}</View>
    </Glass>
  );
}

// Standard iOS table row: leading accessory, title (+ optional subtitle),
// right-aligned secondary value, then a trailing accessory. Press paints the row
// with systemFill rather than fading it, which is the native behaviour.
export function Row({
  leading, leadingWidth = 30, title, subtitle, value, valueColor, onPress,
  accessory = 'chevron', titleColor, disabled, last,
}) {
  const insetLeft = leading ? 18 + leadingWidth + 12 : 18;
  return (
    <>
      <Touchable
        onPress={onPress}
        disabled={disabled || !onPress}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          minHeight: 54,
          paddingVertical: subtitle ? 10 : 9,
          backgroundColor: 'transparent',
        }}
        pressedStyle={{ backgroundColor: C.highlight }}
      >
        {leading ? <View style={{ width: leadingWidth, marginRight: 12 }}>{leading}</View> : null}
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: T.body, color: titleColor || C.label, letterSpacing: -0.4 }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: T.subhead, color: C.label2, marginTop: 1, letterSpacing: -0.2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value !== undefined && value !== null && value !== '' ? (
          <Text
            style={{ fontSize: T.body, color: valueColor || C.label2, letterSpacing: -0.4, fontWeight: valueColor ? '700' : '400' }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {accessory === 'chevron' ? (
          <ChevronRight size={18} color={C.label3} strokeWidth={2.6} style={{ marginLeft: 6, marginRight: -4 }} />
        ) : accessory === 'check' ? (
          <Check size={19} color={C.tint} strokeWidth={2.8} style={{ marginLeft: 6, marginRight: -2 }} />
        ) : null}
      </Touchable>
      {last ? null : <View style={{ height: HAIRLINE, backgroundColor: C.separator, marginLeft: insetLeft }} />}
    </>
  );
}

// Row list that drops the trailing separator — iOS never draws one on the last
// row of a group. Children must be <Row> elements (they take a `last` prop).
export function RowGroup({ children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((child, i) =>
        React.cloneElement(child, { key: child.key ?? i, last: i === items.length - 1 }),
      )}
    </>
  );
}

// Square-ish glass stat tile: icon, big number, caption. `flex: 1` on both the
// Touchable and the Glass makes every tile in a row match the tallest, so a
// two-line label doesn't leave its neighbours short.
export function StatTile({ icon, color, value, label, onPress, wide, accessibilityLabel }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ borderRadius: R.tile, flex: 1 }}
      pressedStyle={{ opacity: 0.55 }}
    >
      <Glass
        radius={R.tile}
        style={{ flex: 1, paddingTop: 12, paddingBottom: 11, paddingHorizontal: 8, alignItems: 'center' }}
        shadow={GLASS.tileShadow}
      >
        <IconSquare icon={icon} color={color} size={wide ? 30 : 27} glyph={wide ? 17 : 15} />
        <Text
          style={{
            fontSize: wide ? T.title1 : T.title2,
            lineHeight: (wide ? T.title1 : T.title2) + 3,
            fontWeight: '700',
            color: C.label,
            letterSpacing: -0.5,
            marginTop: 6,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Text
          style={{
            fontSize: T.caption1,
            lineHeight: T.caption1 + 3,
            color: C.label2,
            textAlign: 'center',
            marginTop: 1,
            letterSpacing: -0.05,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
      </Glass>
    </Touchable>
  );
}
