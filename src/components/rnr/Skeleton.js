import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { cn } from './cn';

/**
 * Lightweight shimmer skeleton placeholder. Uses Animated opacity instead of
 * a moving gradient to keep dependencies minimal — looks clean on iOS/Android.
 */
export function Skeleton({ className, width, height, rounded = 12, style }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={cn('bg-surface-muted', className)}
      style={[{ width, height, borderRadius: rounded, opacity }, style]}
    />
  );
}

/** Pre-baked skeleton for a list of booking/list rows. */
export function SkeletonList({ rows = 5, rowHeight = 92, gap = 12, padded = true }) {
  return (
    <View className={padded ? 'px-4 pt-3' : ''}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ marginBottom: gap }}>
          <Skeleton height={rowHeight} rounded={18} />
        </View>
      ))}
    </View>
  );
}

/** Pre-baked skeleton for a 2-column device card grid. */
export function SkeletonGrid({ rows = 3, cardHeight = 150, gap = 12 }) {
  return (
    <View className="px-4 pt-3">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row" style={{ marginBottom: gap }}>
          <View style={{ flex: 1, marginRight: gap / 2 }}>
            <Skeleton height={cardHeight} rounded={18} />
          </View>
          <View style={{ flex: 1, marginLeft: gap / 2 }}>
            <Skeleton height={cardHeight} rounded={18} />
          </View>
        </View>
      ))}
    </View>
  );
}
