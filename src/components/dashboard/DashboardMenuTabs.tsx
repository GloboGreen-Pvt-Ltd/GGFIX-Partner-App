import React, { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { DashboardTool } from '../../types/dashboard';
import { C, PINE, R } from './theme';
import { DashboardToolsGrid } from './DashboardToolsGrid';

export interface DashboardMenuTab {
  label: string;
  items: DashboardTool[];
}

export interface DashboardMenuTabsProps {
  tabs: DashboardMenuTab[];
  /** Outer horizontal inset for the tab row — matches DashboardSection's own `pad`. */
  pad: number;
  /** Shared card style every tools-grid panel already used (border/shadow/radius). */
  panelStyle: StyleProp<ViewStyle>;
  onPanelLayout?: (e: LayoutChangeEvent) => void;
  /** Grid's own inner padding — DashboardScreen's `toolGridPad`. */
  gridPad: number;
  columns: number;
  cardWidth: number;
  gap: number;
  onPress: (tool: DashboardTool) => void;
}

const TAB_ACTIVE_TEXT = '#FFFFFF';
const TAB_INACTIVE = C.label2;
const TAB_PILL_BG = PINE;
const SEGMENT_PAD = 4;

/**
 * Services / Employee / Reports as one premium segmented control over a
 * single shared grid, replacing three permanently-stacked sections — only
 * the active tab's items render, so the page is one grid tall instead of
 * three. The whole strip sits on a light neutral track (`C.fill`); a soft
 * green pill slides behind whichever tab is active. The pill's
 * position/width are Reanimated shared values (`withTiming`, 220ms) driven
 * off each tab's own measured layout, so it doesn't assume equal-width tabs.
 */
export function DashboardMenuTabs({ tabs, pad, panelStyle, onPanelLayout, gridPad, columns, cardWidth, gap, onPress }: DashboardMenuTabsProps) {
  const [active, setActive] = useState(0);
  const [layouts, setLayouts] = useState<{ x: number; width: number; height: number }[]>(() => tabs.map(() => ({ x: 0, width: 0, height: 0 })));

  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const pillH = useSharedValue(0);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
    height: pillH.value,
  }));

  const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width, height } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const next = [...prev];
      next[index] = { x, width, height };
      return next;
    });
    if (index === active && pillW.value === 0) {
      pillX.value = x;
      pillW.value = width;
      pillH.value = height;
    }
  };

  const selectTab = (index: number) => {
    setActive(index);
    const l = layouts[index];
    if (l) {
      pillX.value = withTiming(l.x, { duration: 220 });
      pillW.value = withTiming(l.width, { duration: 220 });
      pillH.value = withTiming(l.height, { duration: 220 });
    }
  };

  const activeTab = tabs[active] ?? tabs[0];

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: pad,
          backgroundColor: C.fill,
          borderRadius: R.control,
          padding: SEGMENT_PAD,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: SEGMENT_PAD, left: 0, borderRadius: R.control - 4, backgroundColor: TAB_PILL_BG }, pillStyle]}
        />
        {tabs.map((tab, index) => {
          const isActive = index === active;
          return (
            <Pressable
              key={tab.label}
              onLayout={handleTabLayout(index)}
              onPress={() => selectTab(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9 }}
            >
              <Text style={{ fontSize: 14, fontWeight: isActive ? '700' : '600', color: isActive ? TAB_ACTIVE_TEXT : TAB_INACTIVE }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={panelStyle} onLayout={onPanelLayout}>
        <DashboardToolsGrid key={activeTab.label} items={activeTab.items} pad={gridPad} columns={columns} cardWidth={cardWidth} gap={gap} onPress={onPress} />
      </View>
    </View>
  );
}
