import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { OverviewStatItem } from '../../types/dashboard';
import { C, getSizeClass, Touchable, withAlpha } from './theme';

export interface DashboardOverviewCardProps {
  item: OverviewStatItem;
  /** Fixed card width in px — this rail scrolls horizontally, so cards don't divide a row. */
  width: number;
  /** Gap to the next card — the grid's own breakpoint-responsive value. */
  gap: number;
  /** Last card on the rail skips the trailing gap. */
  last?: boolean;
}

/**
 * One Overview stat — a pastel wash of the metric's own colour, a solid icon
 * square, the count (in the same colour), then the label and its one-line
 * caption. Colour is identity here (which of seven near-identical cards this
 * is), unlike the monochrome Our Services tiles below it.
 */
export function DashboardOverviewCard({ item, width, gap, last }: DashboardOverviewCardProps) {
  const Icon = item.icon;
  const { width: winW } = useWindowDimensions();
  const cls = getSizeClass(winW);
  const disc = cls === 'tablet' ? 40 : cls === 'large' ? 37 : 34;
  const icon = cls === 'tablet' ? 20 : cls === 'large' ? 18 : 17;
  const radius = cls === 'tablet' ? 18 : 16;
  const minHeight = cls === 'tablet' ? 98 : cls === 'large' ? 102 : 100;
  const valueSize = cls === 'tablet' ? 20 : cls === 'large' ? 20 : 20;
  const labelSize = cls === 'tablet' ? 12 : cls === 'large' ? 12 : 12;

  return (
    <View style={{ width, marginRight: last ? 0 : gap }}>
      <Touchable
        onPress={item.onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${item.value}`}
        style={{
          backgroundColor: withAlpha(item.color, 0.12),
          borderRadius: radius,
          padding: 10,
          minHeight,
          alignItems: 'center',
        }}
        pressedStyle={{ opacity: 0.7 }}
      >
        <View
          style={{
            width: disc,
            height: disc,
            borderRadius: Math.round(disc * 0.32),
            backgroundColor: item.color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={icon} color="#FFFFFF" strokeWidth={2} />
        </View>
        <Text
          style={{ fontSize: valueSize, lineHeight: valueSize + 2, fontWeight: '700', color: item.color, marginTop: 10, textAlign: 'center' }}
          numberOfLines={1}
        >
          {item.value}
        </Text>
        <Text
          style={{ fontSize: labelSize, lineHeight: labelSize + 1, minHeight: (labelSize + 1) * 2, fontWeight: '600', color: C.label, marginTop: 2, textAlign: 'center' }}
          numberOfLines={2}
        >
          {item.label}
        </Text>
      </Touchable>
    </View>
  );
} 
