import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { cn } from './cn';

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  className,
  showChevron = true,
  destructive = false,
  iconBg = 'bg-primary/10',
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      className={cn('flex-row items-center bg-card px-3.5 py-2 active:opacity-80', className)}
    >
      {icon ? (
        <View className={cn('h-9 w-9 rounded-full items-center justify-center mr-2.5', iconBg)}>
          {icon}
        </View>
      ) : null}
      <View className="flex-1 pr-2">
        <Text className={cn('text-[13px] font-bold', destructive ? 'text-danger' : 'text-text')} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[12px] text-text-muted mt-0.5" numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
      {showChevron && onPress ? <ChevronRight size={16} color="#8FA08F" /> : null}
    </Wrapper>
  );
}
