import React from 'react';
import { Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { C, ICON_STROKE, R, T, Touchable } from './theme';

export interface DashboardSearchBarProps {
  pad: number;
  onSearchPress: () => void;
}

// Light mint wash — the same tone family as the Sell rail's tiles — instead
// of a plain gray fill, so the field reads as a soft branded surface.
const SEARCH_BG = '#EAF7F2';

/** Search field — a single tap target into plain search (no voice/image/QR search). */
export function DashboardSearchBar({ pad, onSearchPress }: DashboardSearchBarProps) {
  return (
    <View
      style={{
        marginHorizontal: pad,
        borderRadius: R.control,
        backgroundColor: SEARCH_BG,
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
        style={{ height: 48, borderRadius: R.control, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}
        pressedStyle={{ opacity: 0.6 }}
      >
        <Search size={18} color={C.placeholder} strokeWidth={ICON_STROKE} />
        <Text style={{ flex: 1, marginLeft: 8, fontSize: T.callout, color: C.placeholder, letterSpacing: -0.3 }} numberOfLines={1}>
          Search Device, Ticket ID, Customer…
        </Text>
      </Touchable>
    </View>
  );
}
