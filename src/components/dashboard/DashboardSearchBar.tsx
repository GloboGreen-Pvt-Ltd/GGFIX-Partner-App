import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Search, Mic } from 'lucide-react-native';
import { getSizeClass, Touchable } from './theme';
import colors from '../../theme/colors';

export interface DashboardSearchBarProps {
  pad: number;
  onSearchPress: () => void;
  /** No longer shown in the bar (camera / QR buttons removed); kept so callers needn't change. */
  onScanPress?: (mode: 'qr' | 'lens') => void;
  /** Opens OwnerSearch and starts voice capture. */
  onVoicePress?: () => void;
}

const MUTED = '#6B7280';

/** Search field in the Customer app's Home style: white rounded bar,
 * magnifier + placeholder (opens search), then the mic (voice) button. */
// Recommended search box size: phone 48 / 15, large phone 48 / 16, tablet & iPad 52 / 16
// (dp on Android, pt on iOS — RN units are both).
export function searchBoxSize(width: number) {
  const cls = getSizeClass(width);
  return cls === 'tablet' ? { height: 52, font: 15, icon: 21 } : cls === 'large' ? { height: 48, font: 14.5, icon: 20 } : { height: 48, font: 14, icon: 19 };
}

export function DashboardSearchBar({ pad, onSearchPress, onVoicePress }: DashboardSearchBarProps) {
  const size = searchBoxSize(useWindowDimensions().width);
  return (
    <View
      style={{
        marginHorizontal: pad,
        height: size.height,
        borderRadius: size.height / 2,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 8,
        shadowColor: colors.text,
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
    >
      <Touchable
        onPress={onSearchPress}
        accessibilityRole="search"
        accessibilityLabel="Search"
        style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', paddingLeft: 16 }}
        pressedStyle={{ opacity: 0.6 }}
      >
        <Search size={size.icon} color={colors.text} />
        {/* No Android font padding, so the placeholder sits centred in the 48 box. */}
        <Text style={{ flex: 1, marginLeft: 10, fontSize: size.font, color: MUTED, includeFontPadding: false, textAlignVertical: 'center' }} numberOfLines={1}>
          Search Device, Ticket ID, Customer...
        </Text>
      </Touchable>

      {/* Camera + QR scan buttons removed from the bar; voice stays. */}
      {onVoicePress ? <BarIcon icon={Mic} size={size.icon} accessibilityLabel="Voice search" onPress={onVoicePress} /> : null}
    </View>
  );
}

type BarIconGlyph = React.ComponentType<{ size?: number; color?: string }>;

// Search-bar icon button with a comfortable touch target (Customer Home's BarIcon).
function BarIcon({
  icon: Icon, onPress, accessibilityLabel, size = 20,
}: { icon: BarIconGlyph; onPress: () => void; accessibilityLabel: string; size?: number }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={{ height: 38, width: 38, borderRadius: 19, marginLeft: 2, alignItems: 'center', justifyContent: 'center' }}
      pressedStyle={{ opacity: 0.6 }}
    >
      <Icon size={size} color={colors.text} />
    </Touchable>
  );
}
