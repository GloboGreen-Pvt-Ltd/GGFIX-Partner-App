import React from 'react';
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { C, ICON_STROKE, R, SERIF, T, Touchable, withAlpha } from './theme';

export interface DashboardSectionProps {
  title: string;
  action?: string;
  onAction?: () => void;
  pad: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Section header — a bold inline title with an optional tinted trailing
 * action, e.g. "Our Services" / "See All". Used above every Dashboard
 * section (Overview, Our Services, Recent Bookings, Marketplace, Sell).
 */
export function DashboardSection({ title, action, onAction, pad, style }: DashboardSectionProps) {
  const { width } = useWindowDimensions();
  // Flat isTablet check (768), not the 3-tier size class — matches the
  // column grid's own tablet cutoff.
  const titleSize = width >= 768 ? 24 : 21;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: pad + 4,
          marginBottom: 8,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: titleSize, lineHeight: titleSize + 6, color: '#111827', letterSpacing: -0.3, fontWeight: '700', fontFamily: SERIF, flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <Touchable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          hitSlop={8}
          pressedStyle={{ opacity: 0.6 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#EAFBF3',
            borderRadius: R.control,
            paddingVertical: 6,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ fontSize: 13, color: '#006B43', fontWeight: '700', letterSpacing: -0.1 }}>{action}</Text>
          <ChevronRight size={14} color="#006B43" strokeWidth={ICON_STROKE} style={{ marginLeft: 2 }} />
        </Touchable>
      ) : null}
    </View>
  );
}
