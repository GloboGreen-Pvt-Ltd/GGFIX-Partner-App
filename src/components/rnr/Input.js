import React, { forwardRef, memo, useState } from 'react';
import { Platform, Text, TextInput, View, Pressable } from 'react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

// react-native-web renders <TextInput> as a real <input>, which gets the browser's
// default focus outline. Strip it so our own focus state is the only thing visible.
const WEB_NO_OUTLINE = Platform.OS === 'web'
  ? { outlineWidth: 0, outlineStyle: 'none', outlineColor: 'transparent' }
  : null;

/**
 * Input — TextInput with focus border, optional left/right icon adornments.
 * When `leftIcon` or `rightIcon` is provided, the TextInput is wrapped in a
 * row container so the icons sit inside the bordered box.
 */
const InputBase = forwardRef(function Input(
  { className, onFocus, onBlur, onEndEditing, leftIcon, rightIcon, containerClassName, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const callerSuppressesBorder = typeof className === 'string'
    && /\bborder-0\b|\bborder-transparent\b/.test(className);

  // No icons → render the bare TextInput (preserves existing usages).
  if (!leftIcon && !rightIcon) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={tokens.textSubtle}
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        onEndEditing={(e) => { setFocused(false); onEndEditing?.(e); }}
        className={cn(
          'bg-card rounded-2xl px-4 py-3 text-base text-text',
          callerSuppressesBorder ? '' : 'border',
          callerSuppressesBorder ? '' : (focused ? 'border-primary' : 'border-border'),
          className,
        )}
        style={[
          WEB_NO_OUTLINE,
          focused && !callerSuppressesBorder
            ? { shadowColor: tokens.primary, shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }
            : null,
          style,
        ]}
      />
    );
  }

  return (
    <View
      className={cn(
        'flex-row items-center bg-card rounded-2xl px-3 py-2.5 border',
        focused ? 'border-primary' : 'border-border',
        containerClassName,
      )}
      style={focused ? { shadowColor: tokens.primary, shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : null}
    >
      {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={tokens.textSubtle}
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        onEndEditing={(e) => { setFocused(false); onEndEditing?.(e); }}
        className={cn('flex-1 text-base text-text', className)}
        style={[WEB_NO_OUTLINE, { paddingVertical: 6 }, style]}
      />
      {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
    </View>
  );
});

// Memoized: on large forms (e.g. Customer Details) a keystroke re-renders the
// parent, but every field whose props are unchanged now skips re-render. That
// keeps the focused input's controlled-value round-trip cheap, which is what
// prevents the Android caret from jumping / dropping characters. Callers that
// pass unstable props (new inline handlers/icons each render) simply re-render
// as before — memo is a no-op there, never a behavior change.
export const Input = memo(InputBase);

export function Label({ className, children, required }) {
  return (
    <Text className={cn('text-[13px] font-bold text-text mb-2', className)}>
      {children}
      {required ? <Text className="text-danger"> *</Text> : null}
    </Text>
  );
}

export function FormField({ label, required, error, hint, children, className }) {
  return (
    <View className={cn('mb-4', className)}>
      {label ? <Label required={required}>{label}</Label> : null}
      {children}
      {error ? (
        <Text className="text-danger text-xs mt-1">{error}</Text>
      ) : hint ? (
        <Text className="text-text-muted text-xs mt-1">{hint}</Text>
      ) : null}
    </View>
  );
}
