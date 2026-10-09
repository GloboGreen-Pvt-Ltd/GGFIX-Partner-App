import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from './cn';

const palettes = {
  blue: ['#F0F8EF', '#E6F7E3'],
  emerald: ['#F0F8EF', '#E6F7E3'],
  amber: ['#FFFBEB', '#FEF3C7'],
  rose: ['#FEF2F2', '#FEE2E2'],
  violet: ['#F0F8EF', '#F0F8EF'],
  sky: ['#F0F8EF', '#F0F8EF'],
};

export function ServiceCategoryCard({
  label,
  caption,
  icon,
  palette = 'blue',
  onPress,
  className,
  badge,
  size = 'md',
}) {
  const colors = palettes[palette] || palettes.blue;
  const padding = size === 'sm' ? 'p-3' : 'p-4';
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      style={{ shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View className={padding}>
          {badge ? (
            <View className="self-start bg-danger rounded-full px-2 py-0.5 mb-1">
              <Text className="text-[9px] font-bold text-white tracking-wide">{badge}</Text>
            </View>
          ) : null}
          {icon ? <View className="mb-2">{icon}</View> : null}
          <Text className="text-[13px] font-extrabold text-text" numberOfLines={2}>{label}</Text>
          {caption ? (
            <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={1}>{caption}</Text>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}
