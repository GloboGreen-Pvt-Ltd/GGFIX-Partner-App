import React from 'react';
import { Text, View } from 'react-native';
import { Search, QrCode, ScanSearch } from 'lucide-react-native';
import { C, ICON_STROKE, R, T, Touchable } from './theme';

export interface DashboardSearchBarProps {
  pad: number;
  onSearchPress: () => void;
  /** Opens ScanSearchScreen in 'qr' or 'lens' mode — see DashboardScreen.tsx. */
  onScanPress: (mode: 'qr' | 'lens') => void;
}

// Light mint wash — the same tone family as the Sell rail's tiles — instead
// of a plain gray fill, so the field reads as a soft branded surface.
const SEARCH_BG = '#F1F4F3';
const ACCENT = '#004C40';
const SCAN_BTN_BG = '#FFFFFF';

/** Search field — a tap target into plain search, plus two scanner buttons
 * (QR/barcode, visual device scanner) attached to its right edge. The field
 * itself keeps its original height; the buttons live inside it. */
export function DashboardSearchBar({ pad, onSearchPress, onScanPress }: DashboardSearchBarProps) {
  return (
    <View
      style={{
        marginHorizontal: pad,
        borderRadius: 24,
        backgroundColor: SEARCH_BG,
        borderWidth: 1,
        borderColor: '#E8ECEF',
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 6,
        shadowColor: '#0B1F14',
        shadowOpacity: 0.03,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
    >
      <Touchable
        onPress={onSearchPress}
        accessibilityRole="search"
        accessibilityLabel="Search"
        style={{ flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}
        pressedStyle={{ opacity: 0.6 }}
      >
        <Search size={18} color="#111827" strokeWidth={ICON_STROKE} />
        <Text style={{ flex: 1, marginLeft: 8, fontSize: 14, color: C.placeholder, letterSpacing: -0.2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          Search Device, Ticket ID, Customer…
        </Text>
      </Touchable>

      <ScanButton
        icon={QrCode}
        accessibilityLabel="Scan QR or barcode"
        onPress={() => onScanPress('qr')}
      />
      <ScanButton
        icon={ScanSearch}
        accessibilityLabel="Visual device scanner"
        onPress={() => onScanPress('lens')}
        last
      />
    </View>
  );
}

function ScanButton({
  icon: Icon, onPress, accessibilityLabel, last,
}: { icon: typeof QrCode; onPress: () => void; accessibilityLabel: string; last?: boolean }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{
        height: 36, width: 36, borderRadius: 18,
        backgroundColor: SCAN_BTN_BG,
        alignItems: 'center', justifyContent: 'center',
        marginLeft: 6, marginRight: last ? 0 : 0,
        shadowColor: '#0B1F14',
        shadowOpacity: 0.08,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
      pressedStyle={{ opacity: 0.6 }}
    >
      <Icon size={18} color={ACCENT} strokeWidth={ICON_STROKE} />
    </Touchable>
  );
}
