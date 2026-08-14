import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Smartphone, Calendar, MapPin, ChevronRight, IndianRupee } from 'lucide-react-native';
import { cn } from './cn';
import { tokens, shadows } from '../../theme/colors';
import { StatusChip } from './StatusChip';

/**
 * BookingCard — a single booking/order row. Used in My Orders, Booking
 * History, Shop Booking List, Pickup tasks, Technician work list. Renders
 * device name + ID, status chip, schedule, address, amount, and an optional
 * right CTA.
 */
export function BookingCard({
  device,
  brand,
  bookingId,
  status,
  statusTone,
  statusLabel,
  scheduledAt,
  address,
  amount,
  amountCaption = 'Estimate',
  rightLabel,
  onPress,
  onRightPress,
  className,
  footer,
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn('bg-card border border-border', className)}
      style={[{ borderRadius: 18 }, shadows.card]}
    >
      <View className="p-4">
        <View className="flex-row items-start">
          <View className="h-11 w-11 rounded-2xl bg-primary-soft items-center justify-center mr-3">
            <Smartphone size={20} color={tokens.primary} />
          </View>
          <View className="flex-1 pr-2">
            <Text numberOfLines={1} className="text-[15px] font-extrabold text-text">
              {device || 'Device'}
            </Text>
            <Text numberOfLines={1} className="text-[11.5px] text-text-muted mt-0.5">
              {brand ? `${brand} · ` : ''}{bookingId ? `#${bookingId}` : ''}
            </Text>
          </View>
          <StatusChip status={status} tone={statusTone} label={statusLabel} size="sm" />
        </View>

        {(scheduledAt || address || amount != null) ? (
          <View className="mt-3 pt-3 border-t border-border">
            {scheduledAt ? (
              <View className="flex-row items-center mb-1.5">
                <Calendar size={13} color={tokens.textMuted} />
                <Text className="ml-2 text-[12px] text-text-muted" numberOfLines={1}>{scheduledAt}</Text>
              </View>
            ) : null}
            {address ? (
              <View className="flex-row items-center mb-1.5">
                <MapPin size={13} color={tokens.textMuted} />
                <Text className="ml-2 flex-1 text-[12px] text-text-muted" numberOfLines={1}>{address}</Text>
              </View>
            ) : null}
            {amount != null ? (
              <View className="flex-row items-center justify-between mt-1">
                <View className="flex-row items-center">
                  <IndianRupee size={13} color={tokens.text} />
                  <Text className="ml-0.5 text-[14px] font-extrabold text-text">{amount}</Text>
                  <Text className="ml-2 text-[11px] text-text-muted">{amountCaption}</Text>
                </View>
                {rightLabel ? (
                  <Pressable onPress={onRightPress || onPress} className="flex-row items-center active:opacity-70">
                    <Text className="text-[12px] font-bold text-primary mr-0.5">{rightLabel}</Text>
                    <ChevronRight size={14} color={tokens.primary} />
                  </Pressable>
                ) : null}
              </View>
            ) : rightLabel ? (
              <Pressable onPress={onRightPress || onPress} className="flex-row items-center self-end active:opacity-70">
                <Text className="text-[12px] font-bold text-primary mr-0.5">{rightLabel}</Text>
                <ChevronRight size={14} color={tokens.primary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {footer ? <View className="mt-3">{footer}</View> : null}
      </View>
    </Pressable>
  );
}
