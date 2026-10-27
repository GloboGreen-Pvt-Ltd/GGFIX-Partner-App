import React from 'react';
import { Pressable, TextInput, View, Text, useWindowDimensions } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

// Recommended search box size: phone 48 / 15, large phone (≥430) 48 / 16,
// tablet & iPad (≥768) 52 / 16 — dp on Android, pt on iOS.
function searchBoxSize(width) {
  if (width >= 768) return { height: 52, font: 16, icon: 20 };
  if (width >= 430) return { height: 48, font: 16, icon: 19 };
  return { height: 48, font: 15, icon: 18 };
}

const shadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  onPress,
  onClear,
  editable = true,
  className,
  rightAccessory,
  autoFocus = false,
  // Extra TextInput props (autoCapitalize, autoCorrect, keyboardType, …).
  // Grouped rather than spread from the top level so a stray layout prop can't
  // land on the input and quietly fight the styling below.
  inputProps,
}) {
  const Wrapper = onPress ? Pressable : View;
  const size = searchBoxSize(useWindowDimensions().width);
  return (
    <Wrapper
      onPress={onPress}
      className={cn(
        'flex-row items-center bg-card border border-border px-4',
        className,
      )}
      style={[{ height: size.height, borderRadius: 18 }, shadow]}
    >
      <Search size={size.icon} color={tokens.textMuted} />
      {onPress ? (
        <Text className="flex-1 ml-2.5 text-text-muted" style={{ fontSize: size.font }} numberOfLines={1}>{placeholder}</Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tokens.textSubtle}
          editable={editable}
          autoFocus={autoFocus}
          {...inputProps}
          className="flex-1 ml-2.5 text-text"
          style={{ paddingVertical: 0, fontSize: size.font }}
        />
      )}
      {value ? (
        <Pressable onPress={onClear} className="h-6 w-6 items-center justify-center rounded-full bg-surface-muted ml-2">
          <X size={14} color={tokens.textMuted} />
        </Pressable>
      ) : null}
      {rightAccessory}
    </Wrapper>
  );
}
