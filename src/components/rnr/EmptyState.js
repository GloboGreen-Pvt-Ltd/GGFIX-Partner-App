import React from 'react';
import { Text, View } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { cn } from './cn';
import { Button } from './Button';
import { tokens } from '../../theme/colors';

export function EmptyState({
  icon,
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  className,
}) {
  return (
    <View className={cn('items-center justify-center px-8 py-14', className)}>
      <View className="h-24 w-24 rounded-full bg-primary-soft items-center justify-center mb-5">
        {icon || <Inbox size={40} color={tokens.primary} />}
      </View>
      <Text className="text-[17px] font-extrabold text-text text-center">{title}</Text>
      {description ? (
        <Text className="text-[13px] text-text-muted text-center mt-1.5 leading-5">{description}</Text>
      ) : null}
      {actionLabel ? (
        <Button onPress={onAction} className="mt-6 px-7">{actionLabel}</Button>
      ) : null}
    </View>
  );
}
