import React from 'react';
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { C, ICON_STROKE, R, T, Touchable, withAlpha } from './theme';

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
  const titleSize = width >= 768 ? 18 : 16;

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
      <Text style={{ fontSize: titleSize, lineHeight: titleSize + 4, color: C.label, letterSpacing: -0.45, fontWeight: '700', flex: 1 }} numberOfLines={1}>
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
            backgroundColor: withAlpha(C.tint, 0.1),
            borderRadius: R.control,
            paddingVertical: 5,
            paddingHorizontal: 10,
          }}
        >
          <Text style={{ fontSize: T.caption1, color: C.tint, fontWeight: '600', letterSpacing: -0.1 }}>{action}</Text>
          <ChevronRight size={13} color={C.tint} strokeWidth={ICON_STROKE} style={{ marginLeft: 1 }} />
        </Touchable>
      ) : null}
    </View>
  );
}
