import React from 'react';
import { ScrollView, View } from 'react-native';
import { Chip } from './Chip';
import { cn } from './cn';

/**
 * Horizontally scrolling row of filter chips. `options` is `[{value,label}]`
 * (or plain strings); `value` is the currently active option's value. Pass
 * `multi` and an array `value` for multi-select behavior.
 */
export function FilterChipRow({
  options = [],
  value,
  onChange,
  multi = false,
  variant = 'default',
  className,
  contentClassName,
}) {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const isActive = (opt) => {
    if (multi) return Array.isArray(value) && value.includes(opt.value);
    return value === opt.value;
  };
  const toggle = (opt) => {
    if (!onChange) return;
    if (multi) {
      const set = new Set(Array.isArray(value) ? value : []);
      if (set.has(opt.value)) set.delete(opt.value);
      else set.add(opt.value);
      onChange(Array.from(set));
    } else {
      onChange(opt.value);
    }
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn('', className)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <View className={cn('flex-row flex-wrap', contentClassName)}>
        {items.map((opt) => (
          <Chip
            key={String(opt.value)}
            label={opt.label}
            variant={variant}
            active={isActive(opt)}
            onPress={() => toggle(opt)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
