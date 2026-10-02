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
  return cls === 'tablet' ? 48 : cls === 'large' ? 46 : 44;
}
function cardMinHeight(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 100 : cls === 'large' ? 96 : 92;
}
function labelFontSize(width: number): number {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? 13 : cls === 'large' ? 12.5 : 12;
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
  const glyphColor = tool.iconColor ?? tone;
  const glyphBg = tool.iconBg ?? withAlpha(tone, 0.16);
  // Solid glyphs read a touch smaller than outline ones at the same size.
  const glyphSize = tool.iconColor ? icon + 3 : icon;

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
            // No tile box: just the pastel icon circle and its label.
            minHeight,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            paddingHorizontal: 6,
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
            borderRadius: box / 2,
            backgroundColor: glyphBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={glyphSize} color={glyphColor} strokeWidth={2} />
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
            marginTop: 6,
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
