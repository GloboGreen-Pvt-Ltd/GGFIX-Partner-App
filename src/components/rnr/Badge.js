import React from 'react';
import { View, Text } from 'react-native';
import { cn } from './cn';

const variantClasses = {
  default: 'bg-primary',
  primary: 'bg-primary',
  secondary: 'bg-attention',
  accent: 'bg-attention',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  error: 'bg-danger',
  muted: 'bg-surface-muted',
  softSuccess: 'bg-primary-soft',
  softDanger: 'bg-danger/10',
  softWarning: 'bg-warning/10',
  softPrimary: 'bg-primary-soft',
  softAccent: 'bg-attention-soft',
  softSecondary: 'bg-attention-soft',
  softInfo: 'bg-info/10',
};

// Label colour is picked per fill, not defaulted to white: the amber and lime
// fills are LIGHT (white on them is 2.1:1 and 1.9:1), so they carry the dark
// text colour instead. Likewise the soft chips take a dark ink — `text-warning`
// on a 10% warning wash was ~2:1, and `text-info` on its own wash 2.6:1.
const textVariantClasses = {
  default: 'text-white',
  primary: 'text-white',
  secondary: 'text-text',
  accent: 'text-text',
  success: 'text-white',
  warning: 'text-text',
  danger: 'text-white',
  error: 'text-white',
  muted: 'text-text',
  softSuccess: 'text-primary-dark',
  softDanger: 'text-danger',
  softWarning: 'text-attention-dark',
  softPrimary: 'text-primary-dark',
  softAccent: 'text-attention-dark',
  softSecondary: 'text-attention-dark',
  softInfo: 'text-primary-dark',
};

export function Badge({ variant = 'default', className, textClassName, leftIcon, children }) {
  return (
    <View className={cn('px-2.5 py-1 rounded-full self-start flex-row items-center', variantClasses[variant], className)}>
      {leftIcon ? <View className="mr-1">{leftIcon}</View> : null}
      <Text className={cn('text-[11px] font-bold tracking-wide', textVariantClasses[variant], textClassName)}>{children}</Text>
    </View>
  );
}
