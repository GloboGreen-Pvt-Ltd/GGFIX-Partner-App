import React from 'react';
import { Image, Text, View } from 'react-native';
import { Smartphone } from 'lucide-react-native';
import type { StatusTone } from '../../types/dashboard';
import { C, ICON_STROKE, Touchable } from './theme';

const TEAL = '#035C6C';

export interface DashboardBookingCardProps {
  image?: string | null;
  device: string;
  ticketNo: string;
  customer: string;
  date: string;
  /** Booking time (right of the date). */
  time?: string;
  /** Estimate / bill, already formatted (e.g. "₹2,800"). */
  amount?: string;
  status: string;
  tone: StatusTone;
  onPress: () => void;
  /** Full card width, computed by the caller from the horizontal scroll rail's own width formula. */
  width: number;
}

/**
 * Home "Recent Jobs" card — the Jobs list tile: image panel (status tag ·
 * VIEW), then ticket number · amount, device name, customer, date / time.
 */
export function DashboardBookingCard({ image, device, ticketNo, customer, date, time, amount, status, tone, onPress, width }: DashboardBookingCardProps) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${device}, ticket ${ticketNo}, ${customer}, ${status}`}
      style={{
        width,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        overflow: 'hidden',
      }}
      pressedStyle={{ opacity: 0.85 }}
    >
      <View style={{ aspectRatio: 1.25, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width: '72%', height: '72%' }} resizeMode="contain" />
        ) : (
          <Smartphone size={34} color={C.placeholder} strokeWidth={ICON_STROKE} />
        )}
        {/* Status tag, top-left corner. */}
        <View style={{ position: 'absolute', top: 0, left: 0, maxWidth: '86%', backgroundColor: tone.text, paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }} numberOfLines={1}>{status}</Text>
        </View>
        {/* VIEW, bottom-right — the whole card opens the job too. */}
        <View pointerEvents="none" style={{ position: 'absolute', right: 6, bottom: 6, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: TEAL, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: TEAL, fontSize: 11, fontWeight: '800' }}>VIEW</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: TEAL }} numberOfLines={1}>#{ticketNo}</Text>
          {amount ? (
            <View style={{ marginLeft: 6, backgroundColor: TEAL, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' }} numberOfLines={1}>{amount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '800', color: C.label }} numberOfLines={2}>{device}</Text>
        <Text style={{ marginTop: 2, fontSize: 12, color: C.label2 }} numberOfLines={1}>{customer}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
          <Text style={{ fontSize: 11, color: C.label2 }} numberOfLines={1}>{date || '—'}</Text>
          {time ? <Text style={{ fontSize: 11, color: C.label2, marginLeft: 6 }} numberOfLines={1}>{time}</Text> : null}
        </View>
      </View>
    </Touchable>
  );
}
