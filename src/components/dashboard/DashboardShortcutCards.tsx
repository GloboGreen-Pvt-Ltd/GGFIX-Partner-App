import React, { useState } from 'react';
import { Image, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';
import { type LucideIcon } from 'lucide-react-native';
import { Touchable, withAlpha } from './theme';

export interface DashboardShortcut {
  key: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  /** Icon tile fill. */
  tone: string;
  /** Card background and chevron tint. */
  bg: string;
  accent: string;
  /** Optional explicit glyph colour / circle fill for the icon badge. */
  iconColor?: string;
  iconBg?: string;
  /** Device photo for the card's lower-right corner — a bundled asset (require) or a URL. The decoration is used when absent. */
  image?: ImageSourcePropType | string | null;
  decoration?: LucideIcon;
  onPress: () => void;
}

interface Props {
  items: DashboardShortcut[];
  pad: number;
  gap?: number;
  height?: number;
}

/**
 * Repair / Buy / Sell — the three big entry cards above Overview. Three equal
 * columns (flex: 1) so they always share the row evenly at any width.
 */
// Card padding 10 + title ~21 ≈ 31: the photo's top stays below this line so
// it never covers the title.
const TEXT_BOTTOM = 36;

/**
 * A bundled photo's own pixel size. RN's Image.resolveAssetSource doesn't exist
 * on react-native-web — calling it threw there and took the whole Dashboard
 * down in the browser — so web reads the same bundled-asset metadata through
 * expo-asset instead. Null when neither knows the size; photoBox then falls
 * back to the full box.
 */
function assetSize(src: ImageSourcePropType): { width?: number; height?: number } | null {
  if (typeof Image.resolveAssetSource === 'function') return Image.resolveAssetSource(src) ?? null;
  try {
    const asset = Asset.fromModule(src as number);
    return { width: asset.width ?? undefined, height: asset.height ?? undefined };
  } catch {
    return null;
  }
}

/**
 * The photo's box is sized to the image's OWN aspect ratio (read from the
 * bundled asset), so with `contain` the picture fills the box exactly and its
 * bottom edge is the card's bottom edge — a fixed-size box letterboxed the
 * picture and left it floating mid-card.
 */
function photoBox(src: DashboardShortcut['image'], maxW: number, maxH: number) {
  const meta = src && typeof src !== 'string' ? assetSize(src as ImageSourcePropType) : null;
  if (!meta?.width || !meta?.height || maxW <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / meta.width, maxH / meta.height);
  return { width: Math.round(meta.width * scale), height: Math.round(meta.height * scale) };
}

export function DashboardShortcutCards({ items, pad, gap = 10, height = 150 }: Props) {
  // Row width from layout; the window width is the first-frame estimate (they
  // match on phones), so the photos don't resize after the first frame.
  const { width: winW } = useWindowDimensions();
  const [rowW, setRowW] = useState(0);
  const inner = (rowW || winW) - pad * 2;
  const cardW = Math.max(0, (inner - gap * (items.length - 1)) / items.length);
  const maxPhotoW = cardW * 0.8;
  const maxPhotoH = Math.max(40, height - TEXT_BOTTOM);
  return (
    <View
      style={{ flexDirection: 'row', paddingHorizontal: pad, gap }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w && w !== rowW) setRowW(w);
      }}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const Deco = it.decoration;
        return (
          <Touchable
            key={it.key}
            onPress={it.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${it.label}, ${it.sub}`}
            style={{
              flex: 1,
              minWidth: 0,
              height,
              borderRadius: 18,
              backgroundColor: '#FFFFFF',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: withAlpha(it.tone, 0.14),
              // Soft shadow in the card's own colour.
              shadowColor: it.tone,
              shadowOpacity: 0.14,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
            }}
            pressedStyle={{ opacity: 0.85 }}
          >
            {/* White at the top fading into the card's tint at the bottom. */}
            <LinearGradient
              pointerEvents="none"
              colors={['#FFFFFF', it.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />

            {/* Photo / decoration: centred along the card's bottom edge. */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -2, alignItems: 'center' }}>
              {it.image ? (
                <Image
                  source={typeof it.image === 'string' ? { uri: it.image } : it.image}
                  resizeMode="contain"
                  // -2 (on the wrapper) cancels the ~2% transparent strip at the bottom of each PNG.
                  style={photoBox(it.image, maxPhotoW, maxPhotoH)}
                />
              ) : Deco ? (
                <View style={{ marginBottom: 8, opacity: 0.9 }}>
                  <Deco size={44} color={it.tone} strokeWidth={1.6} />
                </View>
              ) : null}
            </View>

            {/* Title only, in the card's colour (subtitle and arrow removed). */}
            <Text style={{ paddingHorizontal: 8, paddingTop: 10, fontSize: 16, lineHeight: 21, fontWeight: '800', color: it.tone, textAlign: 'center' }} numberOfLines={1}>
              {it.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}
