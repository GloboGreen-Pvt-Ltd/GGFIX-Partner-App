import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Briefcase, CircleCheck, ClipboardList, Clock } from 'lucide-react-native';
import { C } from './theme';

// Home "My Repair Jobs" (Owner as Technician) — exact Employee App Home task
// row: white card, solid colour circle + white icon, red count badge, label
// below (MintKit BadgeIconTile, compact). Counts are the owner's own jobs only.
const TILES = [
  { key: 'assigned', label: 'Assigned', Icon: ClipboardList, color: '#0788C9', count: 'assignedCount' },
  { key: 'all', label: 'All Jobs', Icon: Briefcase, color: '#035C6C', count: 'allCount' },
  { key: 'pending', label: 'Pending', Icon: Clock, color: '#FAA700', count: 'pendingCount' },
  { key: 'completed', label: 'Completed', Icon: CircleCheck, color: '#609138', count: 'completedCount' },
];
const SIZE = 32;
const BADGE = 17;
const BADGE_RED = '#F32C26';

export function MyRepairJobsCard({ stats, pad = 16, onOpen }) {
  return (
    <View style={{
      marginHorizontal: pad, flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.separator || '#EEF0F2',
      paddingVertical: 6, paddingHorizontal: 4,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    }}>
      {TILES.map(({ key, label, Icon, color, count }) => {
        const n = Number(stats?.[count] || 0);
        return (
          <TouchableOpacity key={key} onPress={() => onOpen?.(key)} activeOpacity={0.8} style={{ flex: 1 }}
            accessibilityRole="button" accessibilityLabel={`${label}: ${n}`}>
            <View style={{ alignItems: 'center', minWidth: 0 }}>
              <View style={{ padding: 2, borderRadius: 999, borderWidth: 1.5, borderColor: 'transparent' }}>
                <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={SIZE * 0.44} color="#FFFFFF" strokeWidth={2.2} />
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
              <Text style={{ fontSize: 10, lineHeight: 12.5, fontWeight: '700', color: '#111111', marginTop: 3, textAlign: 'center', paddingHorizontal: 2 }} numberOfLines={1}>{label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
