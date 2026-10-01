import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

const shadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  className,
  transparent = false,
  sticky = true,
  align = 'center',
}) {
  // Push the header body below the status bar and let the header background
  // fill the status-bar area so titles no longer collide with the clock/icons.
  // For transparent headers the screen typically owns its own SafeAreaView,
  // so we skip the inset to avoid double-padding.
  const insets = useSafeAreaInsets();
  const topInset = transparent ? 0 : insets.top;

  return (
    <View
      className={cn(
        transparent ? 'bg-transparent' : 'bg-card',
        sticky && !transparent ? 'border-b border-border' : '',
        'flex-row items-center px-3 pb-2',
        className,
      )}
      style={[
        transparent ? null : shadow,
        { paddingTop: topInset + 8 },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
        >
          <ChevronLeft size={20} color={tokens.text} />
        </Pressable>
      ) : (
        <View className="h-9 w-9" />
      )}
      <View className={cn('flex-1 px-2', align === 'left' ? 'items-start' : 'items-center')}>
        <Text numberOfLines={1} className="text-[15px] font-extrabold text-text">{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-[11px] text-text-muted mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
      <View className="h-9 min-w-9 items-end justify-center">{right}</View>
    </View>
  );
}

// Alias for the name in the user's spec.
export const AppHeader = ScreenHeader;
