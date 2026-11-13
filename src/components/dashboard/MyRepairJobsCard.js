import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T, Touchable } from './theme';

// Home "My Repair Jobs" (Owner as Technician): one compact white card with four
// icon tiles + count badges. Counts are the owner's own technician jobs only.
const TILES = [
  { key: 'assigned', label: 'Assigned', icon: 'person-add', color: '#2563EB', count: 'assignedCount' },
  { key: 'all', label: 'All Jobs', icon: 'construct', color: '#035C6C', count: 'allCount' },
  { key: 'pending', label: 'Pending', icon: 'time', color: '#D97706', count: 'pendingCount' },
  { key: 'completed', label: 'Completed', icon: 'checkmark-done', color: '#16A34A', count: 'completedCount' },
];

export function MyRepairJobsCard({ stats, pad = 16, onOpen }) {
  return (
    <View style={{ marginHorizontal: pad, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#EEF0F2', paddingVertical: 12, flexDirection: 'row' }}>
      {TILES.map((t) => {
        const n = Number(stats?.[t.count] || 0);
        return (
          <Touchable
            key={t.key}
            onPress={() => onOpen?.(t.key)}
            accessibilityRole="button"
            accessibilityLabel={`${t.label} ${n}`}
            style={{ flex: 1, alignItems: 'center' }}
          >
            <View style={{ height: 44, width: 44, borderRadius: 14, backgroundColor: `${t.color}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={t.icon} size={21} color={t.color} />
              <View style={{ position: 'absolute', top: -6, right: -8, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: t.color, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }} numberOfLines={1}>{n > 99 ? '99+' : n}</Text>
              </View>
            </View>
            <Text style={{ fontSize: T.caption1, marginTop: 6, color: C.label, fontWeight: '700' }} numberOfLines={1}>{t.label}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}
