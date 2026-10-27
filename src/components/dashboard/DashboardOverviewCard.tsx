import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { OverviewStatItem } from '../../types/dashboard';
import { Touchable, withAlpha } from './theme';

import { LinearGradient } from 'expo-linear-gradient';

// Overview stat card — same look as the Repair / Buy / Sell cards:
//
//   Service Orders   (icon)
//   69
//   All services
const RC_HEIGHT = 70;

export interface DashboardOverviewCardProps {
  item: OverviewStatItem;
  /** Fixed card width in px — this rail scrolls horizontally, so cards don't divide a row. */
  width: number;
  /** Gap to the next card — the grid's own breakpoint-responsive value. */
  gap: number;
  /** Last card on the rail skips the trailing gap. */
  last?: boolean;
}

/** One Overview stat. Value, label, colour and onPress all come from the caller unchanged. */
export function DashboardOverviewCard({ item, width, gap, last }: DashboardOverviewCardProps) {
  const Icon = item.icon;
  const { width: winW } = useWindowDimensions();
  const small = winW < 380;
  const circle = small ? 22 : 24;
  const iconSize = small ? 12 : 13;
  const labelSize = small ? 10 : 11;

  return (
    <View style={{ width, marginRight: last ? 0 : gap }}>
      <Touchable
        onPress={item.onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${item.value}`}
        style={{
          height: RC_HEIGHT,
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: withAlpha(item.color, 0.16),
          overflow: 'hidden',
          shadowColor: item.color,
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
        pressedStyle={{ opacity: 0.7 }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['#FFFFFF', withAlpha(item.color, 0.12)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 6, justifyContent: 'space-between' }}>
          {/* Label left, small icon right. */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={{ flex: 1, minWidth: 0, marginRight: 4, fontSize: labelSize, fontWeight: '700', color: '#111111' }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.label}
            </Text>
            <View style={{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: item.color, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={iconSize} color="#FFFFFF" strokeWidth={2.2} />
            </View>
          </View>
          {/* Big count, caption under it. */}
          <View>
            <Text
              style={{ fontSize: small ? 16 : 18, lineHeight: small ? 20 : 22, fontWeight: '800', color: item.color }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {item.value}
            </Text>
            {item.caption ? (
              <Text style={{ fontSize: small ? 9 : 9.5, color: '#6B7280', fontWeight: '500' }} numberOfLines={1}>{item.caption}</Text>
            ) : null}
          </View>
        </View>
      </Touchable>
    </View>
  );
}
