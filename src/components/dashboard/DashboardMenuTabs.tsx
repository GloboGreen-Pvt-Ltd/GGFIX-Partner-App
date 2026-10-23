import React, { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
const TAB_INACTIVE = C.label2;
const TAB_ICON_INACTIVE = '#6B7280';
const TAB_PILL_BG = '#035C6C';
const SEGMENT_PAD = 4;
const TAB_ICON_SIZE = 20;

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
      <View
        style={{
          marginHorizontal: pad,
          borderRadius: R.control,
          backgroundColor: '#FFFFFF',
          shadowColor: '#111111',
          shadowOpacity: 0.07,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
      >
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: 'rgba(255,255,255,0.94)',
          borderWidth: 1,
          borderColor: 'rgba(17,17,17,0.08)',
          borderRadius: R.control,
          padding: SEGMENT_PAD,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.75)', 'rgba(243,244,246,0.6)']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: SEGMENT_PAD, left: 0, borderRadius: R.control - 4, backgroundColor: TAB_PILL_BG }, pillStyle]}
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
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 6 }}
            >
              {TabIcon ? (
                <TabIcon size={TAB_ICON_SIZE} color={isActive ? TAB_ACTIVE_TEXT : TAB_ICON_INACTIVE} strokeWidth={isActive ? 2.3 : 2} />
              ) : null}
              {/* Label only on the active tab; the others are icon-only. */}
              {isActive || !TabIcon ? (
                <Text style={{ fontSize: 14, fontWeight: isActive ? '800' : '600', color: isActive ? TAB_ACTIVE_TEXT : TAB_INACTIVE }} numberOfLines={1}>
                  {tab.label}
                </Text>
              ) : null}
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
