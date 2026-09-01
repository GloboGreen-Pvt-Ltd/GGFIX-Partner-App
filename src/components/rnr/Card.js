import React from 'react';
import { View, Text } from 'react-native';
import { cn } from './cn';
import { shadows } from '../../theme/colors';

export function Card({ className, children, padded = true, elevated = true, style, ...rest }) {
  return (
    <View
      {...rest}
      className={cn(
        'bg-card border border-border',
        padded && 'p-4',
        className,
      )}
      style={[{ borderRadius: 18 }, elevated && shadows.card, style]}
    >
      {children}
    </View>
  );
}

export function CardHeader({ className, children }) {
  return <View className={cn('mb-2', className)}>{children}</View>;
}

export function CardTitle({ className, children }) {
  return <Text className={cn('text-[15px] font-extrabold text-text', className)}>{children}</Text>;
}

export function CardDescription({ className, children }) {
  return <Text className={cn('text-[12px] text-text-muted mt-0.5', className)}>{children}</Text>;
}

export function CardDivider({ className }) {
  return <View className={cn('h-px bg-border my-3', className)} />;
}
