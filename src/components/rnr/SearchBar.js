import React from 'react';
import { Pressable, TextInput, View, Text } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

const shadow = {
  shadowColor: '#172117',
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
  return (
    <Wrapper
      onPress={onPress}
      className={cn(
        'flex-row items-center bg-card border border-border px-4 py-3',
        className,
      )}
      style={[{ borderRadius: 18 }, shadow]}
    >
      <Search size={18} color={tokens.textMuted} />
      {onPress ? (
        <Text className="flex-1 ml-2.5 text-sm text-text-muted">{placeholder}</Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tokens.textSubtle}
          editable={editable}
          autoFocus={autoFocus}
          {...inputProps}
          className="flex-1 ml-2.5 text-sm text-text"
          style={{ paddingVertical: 0 }}
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
