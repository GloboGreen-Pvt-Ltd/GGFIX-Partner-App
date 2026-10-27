import React, { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import type { DashboardTool } from '../../types/dashboard';
import { C, R, SERIF } from './theme';
import { DashboardToolsGrid } from './DashboardToolsGrid';

export interface DashboardMenuTab {
  label: string;
  items: DashboardTool[];
  /** Optional icon rendered before the label. */
  icon?: LucideIcon;
  /** Heading shown inside the tools panel for this tab, e.g. "Service Tools". */
  panelTitle?: string;
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
const TAB_INACTIVE = '#1C3053';      // brand Navy
const TAB_ICON_INACTIVE = '#1C3053';
const TAB_PILL_BG = '#035C6C';
const CHIP_RADIUS = 12;
const TAB_ICON_SIZE = 17;

/**
 * Services / Employee / Reports as one premium segmented control over a
 * single shared grid, replacing three permanently-stacked sections — only
 * the active tab's items render, so the page is one grid tall instead of
 * three. The whole strip sits on a light neutral track (`C.fill`); a soft
 * green pill slides behind whichever tab is active. The pill's
 * position/width are Reanimated shared values driven off each tab's own
 * measured layout. Same method as the bottom tab bar: light glass track, a
 * teal pill that glides (clamped spring) with a quick pulse; the active tab
 * shows icon + label, the others icon only.
 */
export function DashboardMenuTabs({ tabs, pad, panelStyle, onPanelLayout, gridPad, columns, cardWidth, gap, onPress }: DashboardMenuTabsProps) {
  const [active, setActive] = useState(0);
  const [layouts, setLayouts] = useState<{ x: number; width: number; height: number }[]>(() => tabs.map(() => ({ x: 0, width: 0, height: 0 })));

  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const pillH = useSharedValue(0);
  const pillScale = useSharedValue(1);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }, { scale: pillScale.value }],
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
      pillX.value = withSpring(l.x, { damping: 17, stiffness: 170, overshootClamping: true });
      pillScale.value = withSequence(withTiming(1.06, { duration: 70 }), withTiming(1, { duration: 110 }));
      pillW.value = withTiming(l.width, { duration: 220 });
      pillH.value = withTiming(l.height, { duration: 220 });
    }
  };

  const activeTab = tabs[active] ?? tabs[0];

  return (
    <View>
      {/* Light glass track (white wash, white rim, top sheen) — the bottom
          tab bar's look. Shadow on the wrapper; the track clips. */}
      {/* Three separate chips; the teal pill slides behind the active one. */}
      <View style={{ marginHorizontal: pad }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0, borderRadius: CHIP_RADIUS, backgroundColor: TAB_PILL_BG }, pillStyle]}
        />
        {tabs.map((tab, index) => {
          const isActive = index === active;
          const TabIcon = tab.icon;
          return (
            <Pressable
              key={tab.label}
              onLayout={handleTabLayout(index)}
              onPress={() => selectTab(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 5,
                borderRadius: CHIP_RADIUS, borderWidth: 1,
                borderColor: isActive ? TAB_PILL_BG : '#E5E7EB',
                backgroundColor: isActive ? 'transparent' : '#FFFFFF',
              }}
            >
              {TabIcon ? (
                <TabIcon size={TAB_ICON_SIZE} color={isActive ? TAB_ACTIVE_TEXT : TAB_ICON_INACTIVE} strokeWidth={isActive ? 2.3 : 2} />
              ) : null}
              {/* Every tab shows icon + label (white on the teal pill, navy otherwise). */}
              <Text style={{ fontSize: 13, fontWeight: isActive ? '800' : '600', color: isActive ? TAB_ACTIVE_TEXT : TAB_INACTIVE }} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      </View>

      <View style={panelStyle} onLayout={onPanelLayout}>
        {activeTab.panelTitle ? (
          <Text
            style={{ fontSize: 19, lineHeight: 24, fontWeight: '700', fontFamily: SERIF, color: '#111111', paddingHorizontal: gridPad + 2, paddingTop: 4, paddingBottom: 8 }}
            numberOfLines={1}
          >
            {activeTab.panelTitle}
          </Text>
        ) : null}
        <DashboardToolsGrid key={activeTab.label} items={activeTab.items} pad={gridPad} columns={columns} cardWidth={cardWidth} gap={gap} onPress={onPress} />
      </View>
    </View>
  );
}
