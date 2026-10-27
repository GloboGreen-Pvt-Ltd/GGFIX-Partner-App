import React from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { DashboardTool } from '../../types/dashboard';
import { DashboardToolsGrid } from './DashboardToolsGrid';

export interface DashboardToolGroup {
  label: string;
  items: DashboardTool[];
  icon: LucideIcon;
  /** Group colour (brand sheet) for the header disc. */
  color: string;
}

export interface DashboardToolGroupsProps {
  groups: DashboardToolGroup[];
  pad: number;
  /** Shared white panel style (border / radius / padding) for each group's grid. */
  panelStyle: StyleProp<ViewStyle>;
  /** Fired by the first panel only — its width drives the tile size math. */
  onPanelLayout?: (e: LayoutChangeEvent) => void;
  gridPad: number;
  columns: number;
  cardWidth: number;
  gap: number;
  onPress: (tool: DashboardTool) => void;
}

/**
 * Services / Employee / Reports, all on screen at once — no tabs to switch, so
 * every tool is one tap away. Each group: a small header (colour disc + name),
 * then all its tiles in the shared wrapping grid.
 */
export function DashboardToolGroups({ groups, pad, panelStyle, onPanelLayout, gridPad, columns, cardWidth, gap, onPress }: DashboardToolGroupsProps) {
  return (
    <View style={{ gap: 10 }}>
      {groups.map((g, gi) => {
        const Icon = g.icon;
        return (
          <View key={g.label}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: pad + 4 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: g.color, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color="#FFFFFF" strokeWidth={2.3} />
              </View>
              <Text style={{ flex: 1, marginLeft: 8, fontSize: 15, fontWeight: '800', color: '#1C3053' }} numberOfLines={1}>{g.label}</Text>
            </View>
            <View style={panelStyle} onLayout={gi === 0 ? onPanelLayout : undefined}>
              <DashboardToolsGrid items={g.items} pad={gridPad} columns={columns} cardWidth={cardWidth} gap={gap} onPress={onPress} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
