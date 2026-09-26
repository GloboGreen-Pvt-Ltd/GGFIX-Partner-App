import React from 'react';
import { Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { OverviewStatItem } from '../../types/dashboard';
import { C, Touchable, withAlpha } from './theme';

// Flat pixel values per an exact reference (wide + short) — every card on
// the rail now uses this design, approved for all 7 metrics. Icon tile/
// count/watermark sized down a step from the 3-per-row pass now that the
// grid is back to 4 cards per row (narrower cards). Height trimmed to fit
// the icon+count row / label+arrow row content exactly (was 138, leaving a
// dead gap under the label since the icon and count merged onto one row).
const RC_HEIGHT = 108;
const RC_TILE = 36;
const RC_TILE_ICON = 18;
const RC_WATERMARK = 48;
const RC_ARROW = 28;
const RC_ARROW_ICON = 16;

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
 * One Overview stat — a pastel wash of the metric's own colour, a rounded
 * icon tile top-left with a large faint watermark of the same icon, the
 * count, then the label sharing a row with the bottom-right arrow badge so
 * it can never be covered by it.
 */
export function DashboardOverviewCard({ item, width, gap, last }: DashboardOverviewCardProps) {
  const Icon = item.icon;

  return (
    <View style={{ width, marginRight: last ? 0 : gap }}>
      <Touchable
        onPress={item.onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${item.value}`}
        style={{
          backgroundColor: withAlpha(item.color, 0.1),
          borderRadius: 18,
          padding: 10,
          height: RC_HEIGHT,
          overflow: 'hidden',
        }}
        pressedStyle={{ opacity: 0.7 }}
      >
        {/* Faint decorative watermark — same icon as the tile, sitting
            behind it (drawn first) so it can be bigger without competing
            with the count/label. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 8, opacity: 0.16 }}>
          <Icon size={RC_WATERMARK} color={item.color} strokeWidth={1.6} />
        </View>

        {/* Icon tile and count share one row instead of stacking — the
            count reads as "this many, of that icon" rather than a separate
            block underneath it. */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: RC_TILE,
              height: RC_TILE,
              borderRadius: 11,
              backgroundColor: item.color,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: item.color,
              shadowOpacity: 0.35,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }}
          >
            <Icon size={RC_TILE_ICON} color="#FFFFFF" strokeWidth={2} />
          </View>
          <Text
            style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', color: item.color, marginLeft: 8 }}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </View>

        {/* Label and arrow share one flex row instead of the arrow being
            absolutely stacked on top of the text — a row layout can never
            let the arrow badge cover the last letters of a 2-line label,
            whatever the label's length or the card's actual width ends up
            being on a given device. */}
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
          <Text
            style={{ flex: 1, fontSize: 11, lineHeight: 13, fontWeight: '600', color: C.label, marginRight: 6 }}
            numberOfLines={2}
          >
            {item.label}
          </Text>
          <View
            pointerEvents="none"
            style={{
              width: RC_ARROW,
              height: RC_ARROW,
              borderRadius: RC_ARROW / 2,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#0B1F14',
              shadowOpacity: 0.1,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            }}
          >
            <ChevronRight size={RC_ARROW_ICON} color={item.color} strokeWidth={2.4} />
          </View>
        </View>
      </Touchable>
    </View>
  );
}
