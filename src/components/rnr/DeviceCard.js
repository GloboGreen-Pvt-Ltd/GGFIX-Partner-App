import React from 'react';
import { View, Text, Pressable, Image, Dimensions } from 'react-native';
import { cn } from './cn';
import { tokens, shadows } from '../../theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Compute the per-card width for a 2-column responsive grid so cards never
 * overflow on small phones. Uses the gutter + outer padding passed in.
 */
export function gridCardWidth({ columns = 2, gutter = 12, outer = 16 } = {}) {
  const available = SCREEN_W - outer * 2 - gutter * (columns - 1);
  return Math.floor(available / columns);
}

/**
 * DeviceCard — image-led tile for choosing a device/brand/model/category.
 * Designed for a 2-column FlatList grid. Falls back to an icon when imageUrl
 * is missing.
 */
export function DeviceCard({
  title,
  subtitle,
  imageUrl,
  iconName: Icon,
  selected = false,
  onPress,
  badge,
  className,
  width,
  imageHeight = 88,
  disabled = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'bg-card border',
        selected ? 'border-primary' : 'border-border',
        disabled && 'opacity-50',
        className,
      )}
      style={[
        { width, borderRadius: 18 },
        selected ? { ...shadows.card, shadowColor: tokens.primary, shadowOpacity: 0.18 } : shadows.card,
      ]}
    >
      <View
        className="bg-surface-muted items-center justify-center"
        style={{
          height: imageHeight,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} resizeMode="contain" style={{ width: '70%', height: '85%' }} />
        ) : Icon ? (
          <Icon size={36} color={tokens.primary} />
        ) : (
          <Text className="text-[28px] font-extrabold text-primary">
            {(title || '?').toString().trim().charAt(0).toUpperCase()}
          </Text>
        )}
        {badge ? (
          <View className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-attention">
            {/* Dark ink: amber is a light fill (white on it is 2.1:1). */}
            <Text className="text-[10px] font-extrabold text-text">{badge}</Text>
          </View>
        ) : null}
        {selected ? (
          <View className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary items-center justify-center">
            <Text className="text-white text-[12px] font-extrabold">✓</Text>
          </View>
        ) : null}
      </View>
      <View className="px-3 py-3">
        <Text numberOfLines={1} className="text-[13.5px] font-extrabold text-text">{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-[11px] text-text-muted mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
