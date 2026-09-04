import React, { memo, useCallback } from 'react';
import { Pressable, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { DashboardTool } from '../../types/dashboard';
import { C, getSizeClass, HAIRLINE, MIN_TOUCH, PINE, withAlpha } from './theme';

export interface DashboardToolCardProps {
  tool: DashboardTool;
  /** Fixed card width in px, computed by the grid from the row's available width. */
  width: number;
  /** Grid gap — margin-right/bottom for this cell's position in the row. */
  style?: StyleProp<ViewStyle>;
  onPress: (tool: DashboardTool) => void;
}

const PRESS_SCALE = 0.97;

// Icon size and card height both read the same phone/large-phone/tablet
// class, so a tile's proportions stay consistent at every breakpoint instead
// of the icon and its card drifting out of ratio independently.
function iconSize(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 22 : cls === 'large' ? 21 : 20;
}
function iconBoxSize(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 44 : cls === 'large' ? 40 : 38;
}
function cardMinHeight(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 104 : cls === 'large' ? 98 : 92;
}
function labelFontSize(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 14 : cls === 'large' ? 13 : 12;
}

function DashboardToolCardBase({ tool, width, style, onPress }: DashboardToolCardProps) {
  const Icon = tool.icon;
  const { width: winW } = useWindowDimensions();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(PRESS_SCALE, { duration: 90 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 140 });
  }, [scale]);

  const handlePress = useCallback(() => onPress(tool), [onPress, tool]);

  const icon = iconSize(winW);
  const box = iconBoxSize(winW);
  const minHeight = cardMinHeight(winW);
  const fontSize = labelFontSize(winW);
  const tone = tool.color ?? PINE;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={tool.label.replace(/\n/g, ' ')}
      // The visible card can be narrower than MIN_TOUCH on a dense tablet
      // grid; hitSlop pads the real tap target back up to the accessibility
      // minimum without changing what's drawn.
      hitSlop={Math.max(0, Math.round((MIN_TOUCH - Math.min(width, minHeight)) / 2))}
      style={[{ width }, style]}
    >
      <Animated.View
        style={[
          {
            minHeight,
            borderRadius: 18,
            backgroundColor: C.card,
            borderWidth: HAIRLINE,
            borderColor: C.separator,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 10,
            paddingHorizontal: 6,
            shadowColor: '#0B1F14',
            shadowOpacity: 0.04,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          },
          animatedStyle,
        ]}
      >
        {/* Pastel icon box: a soft tint of the tool's own accent colour
            (or PINE, for tabs that don't set one) behind a matching solid
            glyph — distinct from Overview's solid-fill discs, which use a
            white glyph on a solid colour instead. */}
        <View
          style={{
            width: box,
            height: box,
            borderRadius: Math.round(box * 0.3),
            backgroundColor: withAlpha(tone, 0.14),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={icon} color={tone} strokeWidth={2} />
        </View>
        {/* Reserves 2 lines' worth of height even for a short one-line label,
            so a longer translated string never makes one card taller than
            its neighbours — `adjustsFontSizeToFit` then shrinks a long single
            word (e.g. "Permissions") that can't wrap instead of ellipsising it. */}
        <Text
          style={{
            fontSize,
            lineHeight: fontSize + 4,
            minHeight: (fontSize + 4) * 2,
            fontWeight: '600',
            color: C.label,
            marginTop: 8,
            letterSpacing: -0.1,
            textAlign: 'center',
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {tool.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export const DashboardToolCard = memo(DashboardToolCardBase);
