import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useResponsive, SPACING, TOUCH_MIN } from '../../theme/responsive';
import useKeyboardHeight from '../../hooks/useKeyboardHeight';

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
 * Two things worth knowing:
 *
 * · The bottom inset is applied ONLY in sheet mode. In dialog mode the panel
 *   floats clear of the home indicator already, and adding the inset there just
 *   pads dead space inside the card.
 *
 * · Every Pressable here takes a plain object style. NativeWind's JSX interop
 *   silently DROPS a function style (`style={({pressed}) => …}`) in its
 *   entirety, which collapses the layout — use `components/ios`'s `Touchable`
 *   if you need pressed feedback.
 *
 * · It lifts itself clear of the keyboard. Under edge-to-edge Android does NOT
 *   resize the window, so a bottom-anchored sheet with a TextInput in it just
 *   sits behind the keys — the sheet is live but invisible, which reads as "the
 *   keyboard doesn't respond". See `hooks/useKeyboardHeight` for why neither
 *   KeyboardAvoidingView nor react-native-keyboard-controller solves it here.
 */
export function ResponsiveModal({
  visible,
  onClose,
  maxWidth = 560,
  scrollable = false,
  contentStyle,
  children,
}) {
  const r = useResponsive();
  const kb = useKeyboardHeight();
  const asDialog = r.isTablet;

  const panel = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: asDialog ? Math.min(maxWidth, r.width - SPACING.xl * 2) : undefined,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderBottomLeftRadius: asDialog ? 24 : 0,
          borderBottomRightRadius: asDialog ? 24 : 0,
          paddingTop: SPACING.md,
          // With the keyboard up the gesture bar is behind it, so the safe-area
          // inset would be padding on top of padding. It is one or the other.
          paddingBottom: asDialog
            ? SPACING.lg
            : (kb > 0 ? SPACING.md : r.insets.bottom + SPACING.lg),
          paddingHorizontal: SPACING.lg,
          // Never taller than the window minus its insets, or a long sheet in
          // landscape runs off both ends with no way to reach the buttons. The
          // keyboard's share comes off too, or a tall sheet just overflows past
          // the TOP instead of fitting in what's left.
          maxHeight: Math.max(220, r.height - kb) - r.insets.top - (asDialog ? SPACING.xl * 2 : 0),
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <Modal visible={!!visible} transparent animationType={asDialog ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(23,33,23,0.45)',
          justifyContent: asDialog ? 'center' : 'flex-end',
          alignItems: 'center',
          paddingHorizontal: asDialog ? SPACING.xl : 0,
          // What actually lifts the panel clear of the keys.
          paddingBottom: kb,
        }}
      >
        {/* Swallows the press so a tap inside never falls through to the scrim. */}
        <Pressable onPress={() => {}} style={{ width: '100%', alignItems: 'center' }}>
          {scrollable
            ? <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center' }}>{panel}</ScrollView>
            : panel}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Minimum comfortable touch area — Android 48dp / iOS 44pt. */
export const touchTarget = { minHeight: TOUCH_MIN, minWidth: TOUCH_MIN };

export { useResponsive, SPACING, TOUCH_MIN };
