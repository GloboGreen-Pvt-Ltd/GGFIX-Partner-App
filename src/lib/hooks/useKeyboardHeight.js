import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Live keyboard height, for lifting content inside a React Native `Modal`.
 *
 * WHY NOT KeyboardAvoidingView
 * The Android manifest asks for `adjustResize`, but this app is edge-to-edge
 * (SDK 54, `edgeToEdgeEnabled=true`), and under edge-to-edge Android stops
 * resizing the window — the keyboard is drawn OVER it. A bottom-anchored sheet
 * therefore stays exactly where it was and the keyboard covers it completely.
 * That is the "popup opens, keyboard shows, nothing responds" symptom: the sheet
 * is still there and still live, just entirely behind the keys.
 *
 * WHY NOT react-native-keyboard-controller, which the rest of the app uses
 * Its KeyboardAvoidingView is the right tool on a SCREEN, and that is where the
 * other call sites use it. A RN `Modal` on Android is a separate window that the
 * root <KeyboardProvider> does not instrument, so a modal is the one place in
 * this app the library cannot be relied on. RN's own Keyboard events come from
 * the InputMethodManager and fire for whichever window has focus, so they work.
 *
 * NOTE: `AllBooking/BookingActionSheets.js` still carries its own copy of this
 * hook — it is where the behaviour was first worked out. Worth collapsing onto
 * this one, but that file is working and untouched here on purpose.
 */
export default function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS gets the Will* pair so content travels with the keyboard rather than
    // snapping after it has finished animating; Android only emits the Did* pair.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e?.endCoordinates?.height || 0));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return height;
}
