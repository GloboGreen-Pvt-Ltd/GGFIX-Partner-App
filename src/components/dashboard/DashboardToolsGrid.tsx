import React from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { DashboardTool } from '../../types/dashboard';
import { getSizeClass } from './theme';
import { DashboardToolCard } from './DashboardToolCard';

export interface DashboardToolsGridProps {
  items: DashboardTool[];
  /** This section's own inner horizontal inset — applied as padding, not part of the width math (the caller already folded it in). */
  pad: number;
  /** Full breakpoint column count (4/5/6) — the SAME value for every section, never reduced by item count. */
  columns: number;
  /** One shared card width, computed once by the caller from the actual screen/panel padding — identical across every section at a given breakpoint. */
  cardWidth: number;
  gap: number;
  onPress: (tool: DashboardTool) => void;
}

/**
 * Max column count from the device's own width, not `Platform.OS` — a phone
 * and a tablet both run Android or iOS, and only width tells them apart:
 *   < 430   → 4 columns  (phone)
 *   430-767 → 5 columns  (large phone)
 *   >= 768  → 6 columns  (tablet / iPad)
 */
export function getDashboardToolColumns(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 6 : cls === 'large' ? 5 : 4;
}

/**
 * Shared grid for Our Services, Employee Management and Report Management —
 * a static wrap, nothing hidden behind a scroll gesture.
 *
 * `columns`/`cardWidth`/`gap` come from DashboardScreen, computed ONCE from
 * the screen width and this panel's own known padding — not measured, and
 * not reduced by this section's own item count. That's deliberate: a short
 * section (Report Management's 3 items) renders its cards at the exact same
 * width as a full 6-item section, leaving the unused column positions empty
 * rather than stretching 3 cards to fill the row — every section stays
 * visually consistent instead of computing its own, possibly-diverging size.
 * Incomplete rows stay LEFT-aligned, starting at column 1.
 */
export function DashboardToolsGrid({ items, pad, columns, cardWidth, gap, onPress }: DashboardToolsGridProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', paddingHorizontal: pad }}
    >
      {items.map((tool, i) => {
        const col = i % columns;
        return (
          <DashboardToolCard
            key={tool.label}
            tool={tool}
            width={cardWidth}
            style={{ marginRight: col === columns - 1 ? 0 : gap, marginBottom: gap }}
            onPress={onPress}
          />
        );
      })}
    </Animated.View>
  );
}
