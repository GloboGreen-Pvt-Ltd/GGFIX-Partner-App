import React, { useState, type ReactNode } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { StatusTone } from '../../types/dashboard';
import { cn } from '../rnr/cn';

/* ══════════════════════════════════════════════════════════════════════════
   iOS design language — shared tokens + primitives for the owner Dashboard.
   ──────────────────────────────────────────────────────────────────────────
   This screen follows Apple's CURRENT design language — iOS 26 "Liquid Glass"
   — rather than the Material/Swiggy language the other owner tabs still use.
   Extracted from DashboardScreen so DashboardHeader, DashboardSection and
   DashboardToolCard/DashboardToolsGrid can share one palette instead of each
   redefining it.

   NO REAL BLUR: `expo-blur` is not a dependency of this app, so the glass here
   is layered translucency instead (high-opacity whites + gradient + specular
   edge), which needs no native module and works in the current APK.
   ══════════════════════════════════════════════════════════════════════════ */

export const HAIRLINE = StyleSheet.hairlineWidth;

// GGFix palette (2026-09 refresh) — Accent / Primary / Primary Dark, budgeted
// 60 / 30 / 10. See the original DashboardScreen history for the rationale
// behind the shape of the split; only the hues moved.
export const GREEN = '#00A86B'; // Accent
export const GREEN_DARK = '#00695C'; // Primary
// A paler tint of Accent, used only for the "done" status dot — kept
// derived rather than hand-picked so it can't drift from Accent.
export const GREEN_LIGHT = lighten(GREEN);

// The brand's deep pine — behind both the avatar's verification badge and
// every icon tile, so the two cannot drift apart. #004D40 (Primary Dark),
// luminance 0.055 (dark): ~10:1 as a foreground on white, 10:1 under a white
// glyph as a fill.
export const PINE = '#004D40';
// Text Primary, not the brand pine — the owner's name/shop name reads as
// plain header text, not a branded accent.
export const SHOP_NAME_COLOR = '#1B1F23';

// ONE stroke weight for every icon on this screen.
export const ICON_STROKE = 2;
export const HEADER_ACTION_STROKE = ICON_STROKE;

export const C = {
  // Matches the rest of the app's screen background (and the shared bottom
  // tab bar's white backing) so Home doesn't show a seam against them.
  groupedBg: '#FFFFFF', // Background
  card: '#FFFFFF', // Surface/Card
  fill: 'rgba(27,31,35,0.06)',
  highlight: 'rgba(27,31,35,0.08)',
  label: '#1B1F23', // Text Primary
  label2: '#667085', // Text Secondary
  label3: 'rgba(102,112,133,0.45)',
  separator: '#E4E7EC', // Border
  placeholder: '#667085',
  tint: GREEN_DARK,

  // The only fills an icon tile may take. All three currently point at the
  // same brand pine — kept as three names so a future palette can re-split
  // them without touching every call site.
  tone: PINE,
  toneDeep: PINE,
  toneLime: PINE,
  warn: '#F59E0B',
  error: '#DC2626',
  muted: '#667085',
} as const;

export const VERIFIED_ICON = PINE;
export const UNVERIFIED_ICON = '#004D40';
export const BADGE_ICON_SIZE = 20;
export const BADGE_STROKE = ICON_STROKE;

/** Readable glyph colour for a given tile fill, decided from the fill's own luminance. */
function relLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
export function glyphOn(tone: string): string {
  return relLuminance(tone) > 0.35 ? C.label : '#FFFFFF';
}

// Booking status chip tones — a soft wash of the hue plus its deep text.
export const STATUS_TONES: Record<'done' | 'pending' | 'active', StatusTone> = {
  done: { dot: GREEN_LIGHT, text: GREEN_DARK, bg: withAlpha(GREEN_LIGHT, 0.18) },
  pending: { dot: C.warn, text: '#8A5A00', bg: 'rgba(245,158,11,0.16)' },
  active: { dot: GREEN, text: GREEN_DARK, bg: withAlpha(GREEN, 0.12) },
};

// "INVOICE_GENERATED" → "Invoice Generated".
export function statusLabel(s: string | null | undefined): string {
  return String(s || '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function statusTone(raw: string | null | undefined): StatusTone {
  const s = String(raw || 'NEW').toUpperCase();
  if (/DELIVERED|COMPLETED|READY|CLOSED/.test(s)) return STATUS_TONES.done;
  if (/PICKUP|PENDING|WAITING|APPROVAL/.test(s)) return STATUS_TONES.pending;
  return STATUS_TONES.active;
}

export interface GlassShadow {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export const GLASS = {
  fill: 'rgba(255,255,255,0.86)',
  card: 'rgba(255,255,255,0.92)',
  edge: 'rgba(255,255,255,0.85)',
  hairline: 'rgba(255,255,255,0.55)',
  shadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  } as GlassShadow,
  chromeShadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } as GlassShadow,
};

// SF text styles (point sizes; `theme/fontScaling.js` scales them app-wide).
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
} as const;

// iOS 26 corner scale.
export const R = {
  card: 26,
  control: 999,
  tile: 20,
  sheet: 32,
} as const;

/** Concentric inner radius: never tighter than 6. */
export function concentric(outer: number, pad: number): number {
  return Math.max(6, outer - pad);
}

// Service Orders/Active Jobs/Pickup Queue/Pickup Requests/Pickup Confirmed/
// Delivery Ready/Delivered → green/blue/purple/red/teal/orange/violet.
// `request` moved off the old orange-red (too close to `ready`'s amber) to a
// plain red, and `delivered` off a purple close to `pickups`'s to a warmer
// violet, so the seven read as seven distinct colours, not five.
export const OV_TONE = {
  total: '#17A34A',
  active: '#2E90FA',
  pickups: '#6D3BF5',
  request: '#DC2626',
  accepted: '#0E9384',
  ready: '#D97706',
  delivered: '#C026D3',
} as const;

// The one 7-colour accent set every per-item tint on this screen draws
// from — Overview cards (via OV_TONE above), the Services/Employee/Reports
// tool tiles, and the Marketplace/Sell category tiles all cycle through
// this SAME array rather than each picking its own hues.
export const ACCENT_TONES: readonly string[] = [
  OV_TONE.total,
  OV_TONE.active,
  OV_TONE.pickups,
  OV_TONE.request,
  OV_TONE.accepted,
  OV_TONE.ready,
  OV_TONE.delivered,
];

export function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const NAV_H = 46;
export const SHEET_RADIUS = R.sheet;

/**
 * International phone/large-phone/tablet breakpoints (2026-09 responsive
 * pass) — the one width table every Dashboard component reads padding,
 * section spacing, type scale, and icon/card sizing from:
 *   < 430   phone        (standard Android/iPhone)
 *   430-767 large phone  (Android "large", iPhone Plus/Pro Max)
 *   >= 768  tablet       (Android tablet, iPad/iPad Pro)
 */
export type SizeClass = 'phone' | 'large' | 'tablet';
export function getSizeClass(width: number): SizeClass {
  if (width >= 768) return 'tablet';
  if (width >= 430) return 'large';
  return 'phone';
}

/** Minimum comfortable tap target — the larger of iOS's 44pt and Android's 48dp. */
export const MIN_TOUCH = 48;

/** Cheap top-stop for the icon gradient: lift the colour toward white ~22%. */
export function lighten(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.22);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export function shopInitial(name: string | null | undefined): string {
  if (!name) return 'G';
  const letters = String(name)
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('');
  return letters.slice(0, 2).toUpperCase() || 'G';
}

/* ── iOS primitives ─────────────────────────────────────────────────────── */

export interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  /** Static layout/spacing classes. Colors and computed values stay on `style`. */
  className?: string;
  /** Merged in on top of `className` while pressed — e.g. `"opacity-60"`. */
  pressedClassName?: string;
  children?: ReactNode;
}

/**
 * Pressable with press feedback, WITHOUT using React Native's
 * `style={({pressed}) => …}` callback form.
 *
 * This app compiles with `jsxImportSource: 'nativewind'`, so NativeWind's jsx
 * wrapper swaps every <Pressable> for its cssInterop wrapper, which drops the
 * ENTIRE returned style object for the callback form (not just the pressed
 * branch). Plain style OBJECTS always survive the swap, so press state is
 * tracked here and merged into a single object/className instead — this is
 * NOT the same bug as NativeWind's `active:` variant, which resolves fine
 * (see rnr/Button.js), but this component predates that pattern and every
 * existing caller relies on JS-tracked press state, so it stays.
 */
export function Touchable({ style, pressedStyle, className, pressedClassName, onPressIn, onPressOut, children, ...rest }: TouchableProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      style={pressed && pressedStyle ? [style, pressedStyle] : style}
      className={pressed && pressedClassName ? cn(className, pressedClassName) : className}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
    >
      {children}
    </Pressable>
  );
}

export interface GlassProps {
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Static layout/spacing classes for the outer surface. */
  className?: string;
  fill?: string;
  shadow?: GlassShadow;
  children?: ReactNode;
  tinted?: boolean;
}

/**
 * A Liquid Glass surface: translucent body, a bright specular line along the
 * top edge, a light inner border and a soft float shadow. The single
 * component every card / capsule / bar on this screen is built from.
 */
export function Glass({ radius = R.card, style, className, fill = GLASS.card, shadow = GLASS.shadow, children, tinted }: GlassProps) {
  const edgeInset = Math.min(radius * 0.5, 26);
  return (
    <View className={className} style={[{ borderRadius: radius, backgroundColor: fill }, shadow, style]}>
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
          position: 'absolute',
          top: 0,
          left: edgeInset,
          right: edgeInset,
          height: 1,
          backgroundColor: tinted ? 'rgba(255,255,255,0.45)' : GLASS.edge,
          borderRadius: 1,
        }}
      />
      {children}
    </View>
  );
}

export interface IconSquareProps {
  icon: LucideIcon;
  color: string;
  size?: number;
  glyph?: number;
}

/** Icon tile: squircle-ish (radius ≈ 28% of the side), top-down gradient, specular edge. */
export function IconSquare({ icon: Icon, color, size = 30, glyph = 17 }: IconSquareProps) {
  const radius = Math.round(size * 0.28);
  return (
    <LinearGradient
      colors={[lighten(color), color]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: color,
        shadowOpacity: 0.3,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: radius * 0.5,
          right: radius * 0.5,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      />
      <Icon size={glyph} color={glyphOn(color)} strokeWidth={ICON_STROKE} />
    </LinearGradient>
  );
}

/** Inset wrapper every section list (the account sheet's groups) sits inside. */
export interface GroupProps {
  children?: ReactNode;
  pad: number;
  style?: StyleProp<ViewStyle>;
}
export function Group({ children, pad, style }: GroupProps) {
  return (
    <View style={[{ marginHorizontal: pad }, style]}>
      <View style={{ borderRadius: R.card, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

export interface RowProps {
  leading?: ReactNode;
  leadingWidth?: number;
  title: string;
  subtitle?: string;
  value?: string | number | null;
  onPress?: () => void;
  accessory?: 'chevron' | 'check' | 'none';
  titleColor?: string;
  disabled?: boolean;
  /** Set by `RowGroup`, which drops the trailing separator on the last row. */
  last?: boolean;
}

/** Standard iOS table row: leading accessory, title (+ subtitle), value, trailing accessory. */
export function Row({
  leading,
  leadingWidth = 30,
  title,
  subtitle,
  value,
  onPress,
  accessory = 'chevron',
  titleColor,
  disabled,
  last,
}: RowProps) {
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
          <Text style={{ fontSize: T.body, color: C.label2, letterSpacing: -0.4 }} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {accessory === 'chevron' ? (
          <ChevronRight size={18} color={C.label3} strokeWidth={ICON_STROKE} style={{ marginLeft: 6, marginRight: -4 }} />
        ) : accessory === 'check' ? (
          <Check size={19} color={C.tint} strokeWidth={ICON_STROKE} style={{ marginLeft: 6, marginRight: -2 }} />
        ) : null}
      </Touchable>
      {last ? null : <View style={{ height: HAIRLINE, backgroundColor: C.separator, marginLeft: insetLeft }} />}
    </>
  );
}

/** Wraps `<Row>` children and tags the real last one so it drops its separator. */
export function RowGroup({ children }: { children?: ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean) as React.ReactElement<RowProps>[];
  return (
    <>
      {items.map((child, i) => React.cloneElement(child, { key: child.key ?? i, last: i === items.length - 1 }))}
    </>
  );
}
