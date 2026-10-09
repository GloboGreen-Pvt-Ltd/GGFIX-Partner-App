import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import type { DeviceCategory } from '../../types/dashboard';
import { T, Touchable } from './theme';

const CATEGORY_EMOJI: Record<string, string> = {
  MOBILE: '📱',
  SMARTPHONE: '📱',
  LAPTOP: '💻',
  SMARTWATCH: '⌚',
  SMARTWATCHES: '⌚',
  TABLET: '📲',
  AUDIO: '🎧',
  AUDIO_DEVICES: '🎧',
};
const CATEGORY_EMOJI_DEFAULT = '📦';
// Falls back for any category code neither rail's palette names explicitly.
const TILE_BG_DEFAULT = '#F3F5F4';

function categoryImage(item: DeviceCategory): string | null {
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}

export interface DashboardCategoryRailProps {
  categories: DeviceCategory[];
  pad: number;
  tile: number;
  keyPrefix: string;
  onPick: (category: DeviceCategory, code: string) => void;
  // Per-code image override, keyed by uppercased category code — takes
  // priority over the admin-set image on the shared category row. Used by
  // the "Sell a Device" rail so it doesn't inherit the Buy rail's art.
  imageOverrides?: Record<string, string>;
  /** Per-code tile background, keyed by uppercased category code — lets Marketplace and Sell each carry their own light pastel identity. */
  tileColors?: Record<string, string>;
}

/** Horizontal category rail (Marketplace, Sell a Device) — App-Store-style rounded tiles, each tinted from the caller's own light pastel palette. */
export function DashboardCategoryRail({ categories, pad, tile, keyPrefix, onPick, imageOverrides, tileColors }: DashboardCategoryRailProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: 2 }}>
      {categories.map((c, idx) => {
        const code = (c.code || '').toUpperCase();
        const emoji = CATEGORY_EMOJI[code] || CATEGORY_EMOJI_DEFAULT;
        const uri = imageOverrides?.[code] || categoryImage(c);
        const bg = tileColors?.[code] ?? TILE_BG_DEFAULT;
        return (
          <Touchable
            key={`${keyPrefix}-${c.id}`}
            onPress={() => onPick(c, code)}
            accessibilityRole="button"
            accessibilityLabel={c.name}
            style={{ width: tile, marginRight: idx === categories.length - 1 ? 0 : 12, alignItems: 'center' }}
            pressedStyle={{ opacity: 0.5 }}
          >
            <View
              style={{
                width: tile,
                height: tile,
                borderRadius: 18,
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: '#EEF1F0',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#0B1F14',
                shadowOpacity: 0.04,
                shadowRadius: 5,
                shadowOffset: { width: 0, height: 2 },
                elevation: 1,
              }}
            >
              {uri ? (
                <Image source={{ uri }} style={{ width: tile * 0.58, height: tile * 0.58 }} resizeMode="contain" />
              ) : (
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              )}
            </View>
            <Text style={{ fontSize: T.caption1, color: '#1C2423', marginTop: 8, textAlign: 'center', letterSpacing: -0.1 }} numberOfLines={1}>
              {c.name}
            </Text>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}
