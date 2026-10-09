import React from 'react';
import { Text, View } from 'react-native';
import { Search, QrCode, Camera, Mic } from 'lucide-react-native';
import { Touchable } from './theme';
import colors from '../../theme/colors';

export interface DashboardSearchBarProps {
  pad: number;
  onSearchPress: () => void;
  /** 'lens' opens the product camera, 'qr' the QR/barcode scanner — see DashboardScreen.tsx. */
  onScanPress: (mode: 'qr' | 'lens') => void;
  /** Opens OwnerSearch and starts voice capture. */
  onVoicePress?: () => void;
}

const MUTED = '#64748B';

/** Search field in the Customer app's Home style: white rounded bar,
 * magnifier + placeholder (opens search), then plain camera (product search),
 * mic (voice) and QR icons, each its own tap target. */
export function DashboardSearchBar({ pad, onSearchPress, onScanPress, onVoicePress }: DashboardSearchBarProps) {
  return (
    <View
      style={{
        marginHorizontal: pad,
        height: 54,
        borderRadius: 27,
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
        <Search size={20} color={colors.text} />
        <Text style={{ flex: 1, marginLeft: 10, fontSize: 13, color: MUTED }} numberOfLines={1}>
          Search Device, Ticket ID, Customer...
        </Text>
      </Touchable>

      <BarIcon icon={Camera} accessibilityLabel="Search product by camera" onPress={() => onScanPress('lens')} />
      {onVoicePress ? <BarIcon icon={Mic} accessibilityLabel="Voice search" onPress={onVoicePress} /> : null}
      <BarIcon icon={QrCode} accessibilityLabel="Scan QR or barcode" onPress={() => onScanPress('qr')} />
    </View>
  );
}

// Search-bar icon button with a comfortable touch target (Customer Home's BarIcon).
function BarIcon({
  icon: Icon, onPress, accessibilityLabel,
}: { icon: typeof QrCode; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={{ height: 38, width: 38, borderRadius: 19, marginLeft: 2, alignItems: 'center', justifyContent: 'center' }}
      pressedStyle={{ opacity: 0.6 }}
    >
      <Icon size={20} color={colors.text} />
    </Touchable>
  );
}
