import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { cn } from './cn';

const palettes = {
  primary: ['#087A0A', '#16BB05'],
  emerald: ['#087A0A', '#16BB05'],
  amber: ['#F59E0B', '#FCD34D'],
  rose: ['#16BB05', '#DC2626'],
  violet: ['#16BB05', '#7ED957'],
};

export function OfferBanner({
  title,
  subtitle,
  cta,
  onPress,
  palette = 'primary',
  badge,
  className,
}) {
  const colors = palettes[palette] || palettes.primary;
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-2xl overflow-hidden', className)}
      style={{
        shadowColor: colors[0],
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
        {badge ? (
          <View className="self-start bg-white/20 rounded-full px-2.5 py-1 mb-2">
            <Text className="text-[10px] font-bold text-white tracking-widest">{badge}</Text>
          </View>
        ) : null}
        <Text className="text-white text-[20px] font-extrabold leading-7">{title}</Text>
        {subtitle ? (
          <Text className="text-white/85 text-[13px] mt-1 leading-5">{subtitle}</Text>
        ) : null}
        {cta ? (
          <View className="flex-row items-center mt-3 bg-white/15 self-start rounded-full px-3 py-1.5">
            <Text className="text-white text-[12px] font-bold mr-1">{cta}</Text>
            <ArrowRight size={14} color="#fff" />
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}
