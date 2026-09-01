import React from 'react';
import { View, StatusBar, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from './cn';

/**
 * SafeAreaView wrapper that normalises top/bottom inset handling and gives
 * every screen the same light-grey background. Children can opt out of the
 * default content padding by passing `padded={false}`.
 */
export function ScreenContainer({
  children,
  className,
  contentClassName,
  edges = ['top'],
  padded = false,
  scroll = false,
  withBottomBar = false,
  background = 'bg-background',
}) {
  return (
    <SafeAreaView edges={edges} className={cn('flex-1', background, className)}>
      {Platform.OS === 'android' ? <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" /> : null}
      <View
        className={cn('flex-1', padded && 'px-4', contentClassName)}
        style={withBottomBar ? { paddingBottom: 96 } : null}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

export function useBottomBarInset(extra = 24) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + extra;
}
