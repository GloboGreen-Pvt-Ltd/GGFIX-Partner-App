import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { rf } from '../utils/responsive';

// App-wide page header (Partner app pattern): white bar with a bottom border,
// round back button, centred title + subtitle, optional round action(s) on the
// right. Title/subtitle use Inter (loaded in App.js; system font until then).
export const HEADER = {
  bg: '#FFFFFF',
  border: '#DCE7E2',
  title: '#111827',
  subtitle: '#667085',
  button: '#F4FBF8',
  action: '#09AD2A',
};
export const HEADER_FONT = { title: 'Inter_800ExtraBold', subtitle: 'Inter_400Regular' };
const BTN = 36;

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native.
export function HeaderIconButton({ icon: Icon, onPress, label, color = HEADER.title, fill, size = 19, badge = 0, badgeColor = '#F84141', badgeText = '#FFFFFF' }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-70"
      style={{
        width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: HEADER.button, borderWidth: 1, borderColor: HEADER.border,
      }}
    >
      <Icon size={size} color={color} {...(fill ? { fill } : null)} />
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
            backgroundColor: badgeColor, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: badgeText, fontWeight: '800', fontSize: rf(9) }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * `right`: node(s) for the right slot. `sideWidth`: width reserved on BOTH
 * sides so the title stays centred on the screen (raise it when `right`
 * holds more than one button). `children`: extra rows inside the white bar
 * (e.g. a search field). `safeTop`: pad for the status bar (off when the
 * screen already sits below it).
 */
export default function PageHeader({ title, subtitle, onBack, right, sideWidth = BTN, children, safeTop = true }) {
  const bar = (
    <View style={{ backgroundColor: HEADER.bg, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: HEADER.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: BTN }}>
        <View style={{ width: sideWidth, alignItems: 'flex-start' }}>
          {onBack ? <HeaderIconButton icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', marginHorizontal: 8 }}>
          <Text numberOfLines={1} style={{ fontFamily: HEADER_FONT.title, fontSize: rf(17), color: HEADER.title }}>{title}</Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ fontFamily: HEADER_FONT.subtitle, fontSize: rf(11), color: HEADER.subtitle, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={{ width: sideWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          {right}
        </View>
      </View>
      {children}
    </View>
  );
  return safeTop ? <SafeAreaView edges={['top']} style={{ backgroundColor: HEADER.bg }}>{bar}</SafeAreaView> : bar;
}
