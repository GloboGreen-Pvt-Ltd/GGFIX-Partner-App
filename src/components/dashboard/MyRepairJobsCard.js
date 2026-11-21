import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Briefcase, CircleCheck, Clock } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C } from './theme';

// Assigned glyph — technician with cap + check badge (assets/icons/assigned-icon.svg).
export function AssignedIcon({ size = 20, color = '#17191B', strokeWidth = 2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 8.2a4.8 4.8 0 0 1 9.6 0" />
      <Path d="M6 8.2h12.2" />
      <Path d="M7.6 8.6a4.2 4.2 0 0 0 8.4 0" />
      <Path d="M3.5 21c0-3.6 3.7-6.2 8.3-6.2 1.3 0 2.5.2 3.5.6" />
      <Circle cx="18.6" cy="18.6" r="3.9" />
      <Path d="M16.9 18.7l1.2 1.2 2.2-2.4" />
    </Svg>
  );
}

// Home "My Repair Jobs" (Owner as Technician) — exact Employee App Home task
// row: white card, solid colour circle + white icon, red count badge, label
// below (MintKit BadgeIconTile, compact). Counts are the owner's own jobs only.
const TILES = [
  { key: 'assigned', label: 'Assigned', Icon: AssignedIcon, color: '#FFFFFF', glyph: '#17191B', ring: true, shadow: '#035C6C', count: 'assignedCount' },
  { key: 'all', label: 'All Jobs', Icon: Briefcase, color: '#FFFFFF', glyph: '#17191B', ring: true, shadow: '#1C3053', count: 'allCount' },
  { key: 'pending', label: 'Pending', Icon: Clock, color: '#FFFFFF', glyph: '#17191B', ring: true, shadow: '#035C6C', count: 'pendingCount' },
  { key: 'completed', label: 'Completed', Icon: CircleCheck, color: '#FFFFFF', glyph: '#17191B', ring: true, shadow: '#1C3053', count: 'completedCount' },
];
const SIZE = 66;
const BADGE = 17;
const BADGE_RED = '#F32C26';

export function MyRepairJobsCard({ stats, pad = 16, onOpen }) {
  return (
    <View style={{
      marginHorizontal: pad, flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4,
    }}>
      {TILES.map(({ key, label, Icon, color, glyph, ring, shadow, count }) => {
        const n = Number(stats?.[count] || 0);
        return (
          <TouchableOpacity key={key} onPress={() => onOpen?.(key)} activeOpacity={0.8} style={{ flex: 1 }}
            accessibilityRole="button" accessibilityLabel={`${label}: ${n}`}>
            <View style={{ alignItems: 'center', minWidth: 0 }}>
              <View style={{ padding: 2, borderRadius: 999, borderWidth: 1.5, borderColor: 'transparent' }}>
                <View style={{ width: SIZE, height: SIZE, borderRadius: Math.round(SIZE * 0.28), backgroundColor: color, alignItems: 'center', justifyContent: 'center',
                  ...(ring ? { borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#FAFBFD', shadowColor: shadow || '#035C6C', shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 } : null) }}>
                  <Icon size={ring ? 24 : SIZE * 0.44} color={glyph || "#FFFFFF"} strokeWidth={ring ? 1.5 : 2.2} />
                </View>
                <View style={{
                  position: 'absolute', top: -Math.round(BADGE * 0.3), right: -Math.round(BADGE * 0.45), minWidth: BADGE, height: BADGE, borderRadius: BADGE / 2,
                  paddingHorizontal: Math.round(BADGE * 0.22), backgroundColor: BADGE_RED, borderWidth: 1.5, borderColor: '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
                }}>
                  <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: '800', color: '#FFFFFF', includeFontPadding: false, textAlignVertical: 'center' }} numberOfLines={1}>
                    {n > 99 ? '99+' : String(n)}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', color: '#222222', marginTop: 6, textAlign: 'center', paddingHorizontal: 2 }} numberOfLines={1}>{label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
