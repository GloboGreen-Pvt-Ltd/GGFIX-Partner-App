import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

export function Loader({ label, className, inline = false, color }) {
  const tint = color || tokens.primary;
  if (inline) {
    return (
      <View className={cn('flex-row items-center py-2', className)}>
        <ActivityIndicator color={tint} size="small" />
        {label ? <Text className="ml-2 text-[12px] text-text-muted">{label}</Text> : null}
      </View>
    );
  }
  return (
    <View className={cn('flex-1 items-center justify-center bg-background', className)}>
      <ActivityIndicator color={tint} size="large" />
      {label ? <Text className="mt-3 text-[13px] text-text-muted">{label}</Text> : null}
    </View>
  );
}
