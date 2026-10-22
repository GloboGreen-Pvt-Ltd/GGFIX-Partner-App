import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from './cn';

/**
 * Soft pink → lavender → blue gradient backdrop, matching the booking-flow
 * screenshots. Wrap a screen body with this and let children sit on top.
 */
export function ScreenBackground({ children, className, variant = 'default' }) {
  const colors = variant === 'cool'
    ? ['#F3F4F6', '#E5F3F5', '#E5F3F5']
    : ['#E5F3F5', '#E5F3F5', '#E5F3F5'];
  return (
    <View className={cn('flex-1', className)}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {children}
    </View>
  );
}
