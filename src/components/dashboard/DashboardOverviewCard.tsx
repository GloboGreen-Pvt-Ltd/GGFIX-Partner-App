import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { OverviewStatItem } from '../../types/dashboard';
import { Touchable, withAlpha } from './theme';

// Overview stat card: icon top-left, count top-right, label along the bottom.
//
//   [icon]            2
//      Service Orders
const RC_HEIGHT = 78;

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
  // Smaller phones: slightly smaller icon and label, count stays centred.
  const small = winW < 380;
  const circle = small ? 32 : 36;
  const iconSize = small ? 16 : 18;
  const labelSize = small ? 9.5 : 10.5;

  return (
    <View style={{ width, marginRight: last ? 0 : gap }}>
      <Touchable
        onPress={item.onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${item.value}`}
        style={{
          height: RC_HEIGHT,
          backgroundColor: withAlpha(item.color, 0.07),
          borderRadius: 18,
          borderWidth: 1,
          borderColor: withAlpha(item.color, 0.14),
          padding: 8,
          overflow: 'hidden',
        }}
        pressedStyle={{ opacity: 0.7 }}
      >
        {/* Top row: icon left, count right. */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: circle,
              height: circle,
              borderRadius: circle / 2,
              backgroundColor: withAlpha(item.color, 0.16),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={iconSize} color={item.color} strokeWidth={2.2} />
          </View>
          <Text
            style={{
              flex: 1,
              minWidth: 0,
              marginLeft: 6,
              textAlign: 'right',
              fontSize: small ? 20 : 22,
              lineHeight: small ? 24 : 26,
              fontWeight: '800',
              color: item.color,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {item.value}
          </Text>
        </View>

        {/* Label along the bottom, centred, max 2 lines. */}
        <View style={{ flex: 1, justifyContent: 'center', marginTop: 2 }}>
          <Text
            style={{ fontSize: labelSize, lineHeight: labelSize + 3, fontWeight: '600', color: '#1E1E1E', textAlign: 'center' }}
            numberOfLines={2}
            // Shrinks a long word slightly rather than breaking it mid-word.
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {item.label}
          </Text>
        </View>
      </Touchable>
    </View>
  );
}
