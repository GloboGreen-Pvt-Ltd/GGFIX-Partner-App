import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

function isTextChildren(children) {
  if (children == null) return false;
  if (typeof children === 'string' || typeof children === 'number') return true;
  if (Array.isArray(children)) {
    return children.every(
      (c) => c == null || typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean',
    );
  }
  return false;
}

const variantClasses = {
  default: 'bg-primary',
  primary: 'bg-primary',
  secondary: 'bg-attention',
  accent: 'bg-attention',
  success: 'bg-success',
  outline: 'bg-card border border-primary',
  ghost: 'bg-transparent',
  destructive: 'bg-danger',
  muted: 'bg-surface-muted',
  soft: 'bg-primary-soft',
  softAccent: 'bg-attention-soft',
};

// `secondary` / `accent` fill with attention amber, which is a LIGHT fill —
// white on it is 2.1:1, so those two labels take the dark text colour (7.8:1).
// The green, danger and success fills are dark enough to keep white.
const textVariantClasses = {
  default: 'text-white',
  primary: 'text-white',
  secondary: 'text-text',
  accent: 'text-text',
  success: 'text-white',
  outline: 'text-primary',
  ghost: 'text-primary',
  destructive: 'text-white',
  muted: 'text-text',
  soft: 'text-primary-dark',
  softAccent: 'text-attention-dark',
};

const sizeClasses = {
  default: 'py-3.5 px-6',
  sm: 'py-2.5 px-4',
  lg: 'py-4 px-8',
  pill: 'py-3.5 px-6',
  icon: 'h-11 w-11',
};

const sizeRadii = {
  default: 18,
  sm: 14,
  lg: 18,
  pill: 999,
  icon: 999,
};

const shadowVariants = {
  default: { shadowColor: tokens.primary, shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  sm: { shadowColor: tokens.primary, shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  none: {},
};

export function Button({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  className,
  textClassName,
  rightIcon,
  leftIcon,
  elevated = true,
  fullWidth = false,
  children,
  style,
  ...rest
}) {
  const isDisabled = disabled || loading;
  const noShadowVariant =
    variant === 'ghost' || variant === 'outline' || variant === 'muted' || variant === 'soft' || variant === 'softAccent';
  const shadow = elevated && !isDisabled && !noShadowVariant
    ? shadowVariants[size === 'sm' ? 'sm' : 'default']
    : shadowVariants.none;
  const spinColor =
    variant === 'outline' || variant === 'ghost' || variant === 'soft' || variant === 'muted' || variant === 'softAccent'
      ? tokens.primary
      : '#fff';
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={[{ borderRadius: sizeRadii[size] }, shadow, style]}
      className={cn(
        'flex-row items-center justify-center active:opacity-80',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator color={spinColor} />
      ) : (
        <>
          {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
          {isTextChildren(children) ? (
            <Text numberOfLines={1} className={cn('text-base font-bold tracking-wide', textVariantClasses[variant], textClassName)}>{children}</Text>
          ) : (
            children
          )}
          {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}

// Convenience alias matching the user's requested component name.
export function PrimaryButton(props) {
  return <Button variant="primary" fullWidth {...props} />;
}
