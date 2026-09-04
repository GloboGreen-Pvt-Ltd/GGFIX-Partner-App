import React from 'react';
import { Image, Text, View } from 'react-native';
import { Calendar, ChevronRight, Smartphone, User } from 'lucide-react-native';
import type { StatusTone } from '../../types/dashboard';
import { C, ICON_STROKE, Touchable } from './theme';

export interface DashboardBookingCardProps {
  image?: string | null;
  device: string;
  ticketNo: string;
  customer: string;
  date: string;
  status: string;
  tone: StatusTone;
  onPress: () => void;
  /** Full card width, computed by the caller from the horizontal scroll rail's own width formula. */
  width: number;
}
export function DashboardBookingCard({ image, device, ticketNo, customer, date, status, tone, onPress, width }: DashboardBookingCardProps) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${device}, ticket ${ticketNo}, ${customer}, ${status}`}
      style={{
        width,
        minHeight: 132,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E7ECEA',
        shadowColor: '#0B1F14',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
      pressedStyle={{ opacity: 0.6 }}
    >
      <View
        style={{
          width: 72,
          height: 88,
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        {image ? (
          <Image source={{ uri: image }} style={{ width: 50, height: 68 }} resizeMode="contain" />
        ) : (
          <Smartphone size={26} color={C.placeholder} strokeWidth={ICON_STROKE} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            minHeight: 22,
            backgroundColor: tone.bg,
            borderRadius: 11,
            paddingHorizontal: 8,
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.dot, marginRight: 5 }} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: tone.text, letterSpacing: -0.05 }} numberOfLines={1}>
            {status}
          </Text>
        </View>

        <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: C.label, letterSpacing: -0.2, marginTop: 5 }} numberOfLines={1} ellipsizeMode="tail">
          {device}
        </Text>
        <Text style={{ fontSize: 11, lineHeight: 15, color: C.label2, fontWeight: '500', marginTop: 2, letterSpacing: 0.1 }} numberOfLines={1}>
          #{ticketNo}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <User size={11} color={C.label2} strokeWidth={ICON_STROKE} />
          <Text style={{ fontSize: 11, lineHeight: 15, color: C.label, marginLeft: 5, letterSpacing: -0.1, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            {customer}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          <Calendar size={11} color={C.label2} strokeWidth={ICON_STROKE} />
          <Text style={{ fontSize: 11, lineHeight: 15, color: C.label2, marginLeft: 5, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            {date || '—'}
          </Text>
        </View>
      </View>

      <ChevronRight size={18} color={C.tint} strokeWidth={ICON_STROKE} style={{ marginLeft: 4 }} />
    </Touchable>
  );
}
