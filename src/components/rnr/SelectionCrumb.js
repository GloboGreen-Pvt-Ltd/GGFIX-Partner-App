import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from './cn';

/**
 * Breadcrumb bar for the device wizard — shows the selections made so far and
 * a "Change" link to step back. Matches the Cashify-style flow:
 *   "Category: Laptop                         Change"
 *   "Brand: Dell   |   Series: Inspiron Series   Change"
 *
 * items: [{ label: 'Category', value: 'Laptop' }, ...]
 */
export function SelectionCrumb({ items = [], onChange, changeLabel = 'Change', className }) {
  const visible = items.filter((it) => it && it.value);
  if (visible.length === 0) return null;
  return (
    <View className={cn('flex-row items-center bg-primary/5 border border-primary/10 rounded-xl px-3 py-2.5', className)}>
      <View className="flex-1 flex-row items-center flex-wrap pr-2">
        {visible.map((it, i) => (
          <View key={it.label || i} className="flex-row items-center">
            {i > 0 ? <Text className="text-text-muted text-[12px] mx-1.5">|</Text> : null}
            <Text className="text-[12px] text-text-muted">{it.label}: </Text>
            <Text className="text-[12px] font-extrabold text-text" numberOfLines={1}>{it.value}</Text>
          </View>
        ))}
      </View>
      {onChange ? (
        <Pressable onPress={onChange} hitSlop={8} className="active:opacity-70">
          <Text className="text-[12px] font-bold text-secondary">{changeLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
