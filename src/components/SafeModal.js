import React from 'react';
import { Modal, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboardHeight from '../lib/hooks/useKeyboardHeight';

/**
 * Drop-in replacement for react-native's <Modal> that is correct under
 * Android edge-to-edge (Expo SDK 54+ / RN 0.86 — always on here).
 *
 * Why this exists:
 * · With edge-to-edge on, RN forces every Android Modal window to draw under
 *   the status AND navigation bars (ReactModalHostView: statusBarTranslucent /
 *   navigationBarTranslucent are `field || isEdgeToEdgeFeatureFlagOn`). A sheet
 *   pinned to the bottom therefore sits BEHIND the 3-button bar or gesture
 *   handle unless it pads the bottom inset itself — which is how Cancel / OK
 *   ended up under the nav buttons.
 * · A Modal is a separate native window, so the insets are measured for THAT
 *   window: children get their own SafeAreaProvider (react-native-safe-area-
 *   context's recommended setup for modals). useSafeAreaInsets() / SafeAreaView
 *   inside then report this window's real top / bottom — the gesture handle,
 *   the 3-button bar or 0 — never a guess and never a fixed height.
 *
 * Props are passed straight to <Modal>; the translucent flags are set so iOS /
 * older code paths behave the same as the forced Android behaviour.
 */
export default function SafeModal({ children, ...props }) {
  return (
    <Modal statusBarTranslucent navigationBarTranslucent {...props}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}

/**
 * Bottom space a sheet inside a SafeModal must keep clear:
 * · keyboard closed → the navigation-bar / gesture inset (once);
 * · keyboard open → the keyboard. RN on Android reports keyboard height as
 *   `ime − systemBars` (ReactRootView.checkForKeyboardEvents), but the modal
 *   window is edge-to-edge, so the bar under the keyboard is added back. iOS
 *   already reports the full keyboard height.
 *
 * Must be called inside a SafeModal (or any SafeAreaProvider).
 * Returns { bottom, keyboard, insets }.
 */
export function useSheetBottomInset() {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const keyboard = kb > 0 ? kb + (Platform.OS === 'android' ? insets.bottom : 0) : 0;
  return { bottom: keyboard > 0 ? keyboard : insets.bottom, keyboard, insets };
}

/**
 * Render-prop form of useSheetBottomInset(), for modal JSX written inline in a
 * screen — there the hook would run in the SCREEN (wrong window), so read it
 * here instead:
 *   <SafeModal …><ModalInsets>{({ insets, bottom, keyboard }) => …}</ModalInsets></SafeModal>
 *
 * Must be rendered inside the SafeModal.
 */
export function ModalInsets({ children }) {
  return children(useSheetBottomInset());
}
