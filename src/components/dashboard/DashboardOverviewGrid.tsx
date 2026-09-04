import React, { useMemo } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import type { OverviewStatItem } from '../../types/dashboard';
import { getSizeClass } from './theme';
import { DashboardOverviewCard } from './DashboardOverviewCard';

export interface DashboardOverviewGridProps {
  items: OverviewStatItem[];
  pad: number;
}

// 72 matches the category rail's phone tile size — narrow enough that 4 full
// cards (plus a peek of a 5th, hinting the rail scrolls) fit a normal phone
// screen instead of the ~2.7 a wider minimum used to allow.
const CARD_MIN_W = 72;
const CARD_MAX_W = 158;

function itemGap(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 15 : cls === 'large' ? 12 : 10;
}

/**
 * Horizontally-scrolling rail of Overview stat cards. Card width is a fixed
 * pixel value clamped between CARD_MIN_W/CARD_MAX_W (via the app's own
 * breakpoints) rather than a percentage of the row — a scrolling rail has no
 * row to divide into columns, so a handful of cards stay a comfortable size
 * on a phone while more of them stay reachable by swiping instead of
 * shrinking indefinitely.
 *
 * On a viewport wide enough that all of them already fit at the capped
 * width (a large tablet landscape, or this app's web target), that cap would
 * otherwise leave dead space after the last card instead of using it — so in
 * that one case only, cards stretch evenly to fill the row exactly, same as
 * a single-row grid would.
 */
export function DashboardOverviewGrid({ items, pad }: DashboardOverviewGridProps) {
  const { width } = useWindowDimensions();
  const gap = itemGap(width);
  const cardWidth = useMemo(() => {
    const inner = width - pad * 2;
    // Phone: 4 full cards visible, plus a peek of the 5th to hint the rail
    // scrolls — width-only, so it applies identically on Android and iOS.
    const visibleTarget = width >= 768 ? 5.5 : width >= 430 ? 3.4 : 4.0;
    const raw = (inner - gap * (visibleTarget - 1)) / visibleTarget;
    const capped = Math.round(Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, raw)));

    const count = Math.max(items.length, 1);
    const neededAtCap = capped * count + gap * (count - 1);
    if (neededAtCap <= inner) {
      // Everything already fits — grow to fill the row instead of leaving
      // the leftover width empty.
      return Math.floor((inner - gap * (count - 1)) / count);
    }
    return capped;
  }, [width, pad, gap, items.length]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + gap}
      snapToAlignment="start"
      contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: 4 }}
    >
      {items.map((item, i) => (
        <DashboardOverviewCard key={item.label} item={item} width={cardWidth} gap={gap} last={i === items.length - 1} />
      ))}
    </ScrollView>
  );
}
