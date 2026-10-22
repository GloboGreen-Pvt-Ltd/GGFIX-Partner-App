import React from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useResponsive, SPACING, TOUCH_MIN } from '../../theme/responsive';
import SafeModal, { useSheetBottomInset } from '../SafeModal';

/**
 * Responsive layout primitives. All of them read `useResponsive()`, so they
 * react to rotation, fold and split-screen rather than to a size captured at
 * import time.
 *
 * These are LAYOUT only. None of them touch data, navigation or business
 * logic — a screen adopting one should change how it looks and nothing else.
 */

/**
 * Centred, width-capped content column.
 *
 * On a phone this is just horizontal padding. On a tablet it also caps the
 * width and centres — a form or a text column stretched across a 1024pt iPad
 * is measurably harder to read, because the eye has to track the full line.
 *
 * @param kind 'form' (560) | 'list' (720) | 'wide' (960)
 */
export function ResponsiveContainer({ kind = 'list', pad = true, style, children, ...rest }) {
  const r = useResponsive();
  return (
    <View
      {...rest}
      style={[
        {
          width: '100%',
          maxWidth: r.maxWidth(kind),
          alignSelf: 'center',
          paddingHorizontal: pad ? r.select({ small: SPACING.md, phone: SPACING.lg, tablet: SPACING.xl }) : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Wrapping grid whose column count follows the breakpoint.
 *
 * Uses percentage widths on a wrapping row rather than FlatList's `numColumns`
 * so it can be nested inside an existing ScrollView — most screens here already
 * have one, and nesting a VirtualizedList inside a ScrollView is the warning
 * this avoids.
 *
 * @param cols e.g. { small: 1, phone: 2, tablet: 4 } — falls down to the
 *             nearest smaller breakpoint that was supplied.
 */
export function ResponsiveGrid({ cols, gap = SPACING.md, style, children, ...rest }) {
  const r = useResponsive();
  const n = Math.max(1, r.columns(cols));
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View
      {...rest}
      style={[{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }, style]}
    >
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / n}%`, paddingHorizontal: gap / 2, marginBottom: gap }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * One field per row on narrow screens, two per row once there is room — the
 * form rule from the spec. Children are the fields.
 */
export function ResponsiveForm({ gap = SPACING.md, style, children, ...rest }) {
  const r = useResponsive();
  // Two columns needs BOTH axes, not just width.
  //
  // A phone in landscape is wide enough to look like a tablet by breakpoint —
  // an iPhone 14 on its side is 844x390, which lands in `large` — but it is
  // only 390pt TALL, and two columns of labelled inputs there leaves almost
  // nothing visible once the keyboard takes half the screen. Gate on height as
  // well so a rotated phone stays single-column while a real tablet does not.
  const n = r.isTablet && r.height >= 600 ? 2 : 1;
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View {...rest} style={[{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }, style]}>
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / n}%`, paddingHorizontal: gap / 2, marginBottom: gap }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * Bottom sheet on a phone, centred dialog on a tablet — §14.
 *
 * Insets (Android gesture bar, 3-button bar, iOS home indicator):
 * · The modal window is edge-to-edge (RN forces it with edge-to-edge on), so
 *   the sheet pads the bottom inset of ITS OWN window — measured by the
 *   SafeAreaProvider inside SafeModal — exactly once. No fixed heights, no
 *   double padding, nothing hidden behind the nav buttons.
 * · With the keyboard up the sheet lifts by the keyboard (plus the bar under
 *   it on Android — see useSheetBottomInset) instead of the inset.
 * · Dialog mode (tablet) centres inside the safe area; no bottom inset needed.
 *
 * Every Pressable here takes a plain object style. NativeWind's JSX interop
 * silently DROPS a function style (`style={({pressed}) => …}`) in its
 * entirety, which collapses the layout.
 *
 * `edgeToEdge` is accepted for backward compatibility and has no effect —
 * every ResponsiveModal is edge-to-edge and inset-correct now.
 */
// eslint-disable-next-line no-unused-vars
export function ResponsiveModal({ visible, onClose, maxWidth = 560, scrollable = false, contentStyle, edgeToEdge, children }) {
  const r = useResponsive();
  const asDialog = r.isTablet;
  return (
    <SafeModal visible={!!visible} transparent animationType={asDialog ? 'fade' : 'slide'} onRequestClose={onClose}>
      <ModalPanel asDialog={asDialog} onClose={onClose} maxWidth={maxWidth} scrollable={scrollable} contentStyle={contentStyle}>
        {children}
      </ModalPanel>
    </SafeModal>
  );
}

// Rendered inside SafeModal, so the insets and window size are this window's own.
function ModalPanel({ asDialog, onClose, maxWidth, scrollable, contentStyle, children }) {
  const { width, height } = useWindowDimensions();
  const { bottom, keyboard, insets } = useSheetBottomInset();

  const panel = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: asDialog ? Math.min(maxWidth, width - SPACING.xl * 2) : undefined,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderBottomLeftRadius: asDialog ? 24 : 0,
          borderBottomRightRadius: asDialog ? 24 : 0,
          paddingTop: SPACING.md,
          // Sheet: the window's bottom inset (or nothing while the keyboard,
          // which already covers it, is up). Dialog: plain padding.
          paddingBottom: asDialog ? SPACING.lg : SPACING.lg + (keyboard > 0 ? 0 : insets.bottom),
          paddingHorizontal: SPACING.lg,
          // Never taller than what's left between the status bar and the
          // keyboard / nav bar, so the buttons at the bottom stay reachable.
          maxHeight: Math.max(220, height - insets.top - (keyboard > 0 ? keyboard : 0) - (asDialog ? SPACING.xl * 2 + insets.bottom : 0)),
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <Pressable
      onPress={onClose}
      style={{
        flex: 1,
        backgroundColor: 'rgba(17, 17, 17,0.45)',
        justifyContent: asDialog ? 'center' : 'flex-end',
        alignItems: 'center',
        paddingHorizontal: asDialog ? SPACING.xl : 0,
        // Dialog: stay inside the safe area. Sheet: lift above the keyboard.
        paddingTop: asDialog ? insets.top : 0,
        paddingBottom: asDialog ? Math.max(insets.bottom, keyboard) : keyboard,
      }}
    >
      {/* Swallows the press so a tap inside never falls through to the scrim. */}
      <Pressable onPress={() => {}} style={{ width: '100%', alignItems: 'center' }}>
        {scrollable
          ? <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center' }}>{panel}</ScrollView>
          : panel}
      </Pressable>
    </Pressable>
  );
}

/** Minimum comfortable touch area — Android 48dp / iOS 44pt. */
export const touchTarget = { minHeight: TOUCH_MIN, minWidth: TOUCH_MIN };

export { useResponsive, SPACING, TOUCH_MIN };
