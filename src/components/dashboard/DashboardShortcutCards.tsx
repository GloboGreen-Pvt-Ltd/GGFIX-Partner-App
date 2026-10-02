import React, { useState } from 'react';
import { Image, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
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
// Card padding 10 + icon row 36 + gap 10 + title ~21 + subtitle ~16 ≈ 93: the
// photo's top stays below this line so it never covers the title/subtitle.
const TEXT_BOTTOM = 96;

/**
 * The photo's box is sized to the image's OWN aspect ratio (read from the
 * bundled asset), so with `contain` the picture fills the box exactly and its
 * bottom edge is the card's bottom edge — a fixed-size box letterboxed the
 * picture and left it floating mid-card.
 */
function photoBox(src: DashboardShortcut['image'], maxW: number, maxH: number) {
  const meta = src && typeof src !== 'string' ? Image.resolveAssetSource(src as ImageSourcePropType) : null;
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
  const maxPhotoW = cardW * 0.76;
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
              backgroundColor: it.bg,
              overflow: 'hidden',
              padding: 10,
              borderWidth: 1,
              borderColor: 'rgba(16,24,40,0.05)',
            }}
            pressedStyle={{ opacity: 0.85 }}
          >
            {/* Photo / decoration: pinned to the card's bottom-right corner. */}
            {it.image ? (
              <Image
                source={typeof it.image === 'string' ? { uri: it.image } : it.image}
                resizeMode="contain"
                // -2 cancels the ~2% transparent strip at the bottom of each PNG.
                style={{ position: 'absolute', right: 0, bottom: -2, ...photoBox(it.image, maxPhotoW, maxPhotoH) }}
              />
            ) : Deco ? (
              <View pointerEvents="none" style={{ position: 'absolute', right: 4, bottom: 4, opacity: 0.9 }}>
                <Deco size={48} color={it.tone} strokeWidth={1.6} />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: it.iconBg ?? withAlpha(it.tone, 0.16),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={it.iconColor ? 22 : 20} color={it.iconColor ?? it.accent} strokeWidth={2.3} />
              </View>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#101828',
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <ChevronRight size={15} color={it.accent} strokeWidth={2.4} />
              </View>
            </View>

            <Text style={{ marginTop: 8, fontSize: 17, fontWeight: '800', color: '#111827' }} numberOfLines={1}>
              {it.label}
            </Text>
            <Text style={{ marginTop: 1, fontSize: 11.5, color: '#64748B', fontWeight: '500' }} numberOfLines={1}>
              {it.sub}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}
