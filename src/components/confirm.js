import { Alert, Platform, ToastAndroid } from 'react-native';

// `burnt` is a native module and is NOT bundled into Expo Go — a static `import`
// of it throws "Cannot find native module 'Burnt'" at load and crashes the whole
// app (seen on iOS Expo Go). Load it defensively so notify() degrades to an
// Alert when the native module isn't present (a custom dev/EAS build has it).
let Burnt = null;
try { Burnt = require('burnt'); } catch (_) { Burnt = null; }

/**
 * Cross-platform confirm dialog. Works on iOS, Android AND web (Expo Web).
 *
 * Usage:
 *   confirm({ title: 'Delete', message: 'Are you sure?', confirmText: 'Yes', destructive: true })
 *     .then((ok) => { if (ok) doDelete(); });
 */
export function confirm({ title = 'Confirm', message = '', confirmText = 'OK', cancelText = 'Cancel', destructive = false } = {}) {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return resolve(false);
      const composed = message ? `${title}\n\n${message}` : title;
      resolve(window.confirm(composed));
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      // Android alerts are cancelable by default; a back-press or tap-outside
      // fires neither button. Without onDismiss the Promise never settles and
      // `await confirm(...)` hangs forever (stuck spinner / disabled action).
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Cross-platform notification. Renders as a native iOS/Android toast on device
 * via Burnt, falls back to window.alert on web (Burnt has no web target).
 *
 * Signature stays (title, message) for backward compatibility with all existing
 * call sites. Optional third arg lets callers opt into richer styling:
 *   notify('Saved', 'Booking created', { preset: 'done' })
 *   notify('Network error', '', { preset: 'error', haptic: 'error' })
 *
 *   preset:   'done' | 'error' | 'none'   (default: 'none')
 *   duration: seconds (default 2)
 *   haptic:   'success' | 'warning' | 'error' | 'none'
 *   from:     'top' | 'bottom'            (default: 'bottom')
 */
export function notify(title, message = '', options = {}) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    const composed = message ? `${title}\n\n${message}` : title;
    window.alert(composed);
    return;
  }
  const {
    preset = 'none',
    duration = 2,
    haptic = 'none',
    from = 'bottom',
  } = options;
  if (Burnt?.toast) {
    Burnt.toast({
      title: String(title || ''),
      message: message ? String(message) : undefined,
      preset,
      duration,
      haptic,
      from,
    });
    return;
  }
  // Fallback when the native Burnt module is unavailable (e.g. Expo Go).
  if (Platform.OS === 'android') {
    const composed = message ? `${title}: ${message}` : String(title || '');
    ToastAndroid.show(composed, ToastAndroid.SHORT);
  }
  // iOS in Expo Go has no lightweight native toast — skip silently (non-critical).
}
