import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Button } from './Button';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

/**
 * Sticky bottom action bar. Supports a price/info column on the left side and
 * a primary CTA button on the right — Swiggy/Zomato style — or a single full
 * width button with a companion chevron.
 */
export function BottomActionBar({
  title = 'Continue',
  onPress,
  loading = false,
  disabled = false,
  variant = 'default',
  className,
  buttonClassName,
  companion = false,
  onCompanionPress,
  priceLabel,
  priceValue,
  priceCaption,
  children,
  insetBottom = 20,
  safeArea = true,
}) {
  const hasPrice = priceLabel != null || priceValue != null;
  return (
    <View
      className={cn('absolute left-0 right-0 bottom-0 bg-card border-t border-border px-4 pt-3', className)}
      style={{
        paddingBottom: safeArea ? insetBottom : 12,
        shadowColor: '#172117',
        shadowOpacity: 0.10,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -6 },
        elevation: 14,
      }}
    >
      <View className="flex-row items-center">
        {hasPrice ? (
          <View className="mr-3" style={{ maxWidth: '46%' }}>
            {priceCaption ? <Text className="text-[11px] text-text-muted" numberOfLines={1}>{priceCaption}</Text> : null}
            <Text className="text-[17px] font-extrabold text-text leading-5" numberOfLines={1}>{priceValue}</Text>
            {priceLabel ? <Text className="text-[11px] text-text-muted" numberOfLines={1}>{priceLabel}</Text> : null}
          </View>
        ) : null}
        <View className={cn(hasPrice ? '' : 'flex-1')} style={hasPrice ? { flex: 1 } : null}>
          {children ?? (
            <Button
              variant={variant}
              onPress={onPress}
              loading={loading}
              disabled={disabled}
              className={cn('w-full', buttonClassName)}
              rightIcon={<ChevronRight size={18} color="#fff" />}
            >
              {title}
            </Button>
          )}
        </View>
        {companion ? (
          <Pressable
            onPress={onCompanionPress || onPress}
            disabled={disabled || loading}
            className="ml-3 h-12 w-12 rounded-full bg-card border border-border items-center justify-center active:opacity-80"
            style={{ shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ChevronRight size={18} color={tokens.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
