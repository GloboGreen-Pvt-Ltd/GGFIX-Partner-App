import { Alert, Platform } from 'react-native';
import { showToast } from './Toast';
import { isSafeMessage, SAFE } from '../lib/safeError';

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
 * App toast (components/Toast). Signature stays (title, message, options) for
 * every existing call site:
 *   notify('Saved', 'Booking created', { preset: 'done' })
 *   notify('Network error', '', { preset: 'error' })
 *
 *   preset:   'done' → success, 'error' → error, 'none' → from the wording
 *   type:     'success' | 'error' | 'warning' | 'info' (overrides preset)
 *   duration: seconds (default 3)
 */
export function notify(title, message = '', options = {}) {
  const { preset = 'none', duration = 3, type } = options;
  const kind = type || toastType(preset, title);
  // Raw error text (URLs, status codes, stack traces) never reaches the user.
  const safeTitle = isSafeMessage(title) ? String(title).trim() : (kind === 'success' ? 'Done' : SAFE.server);
  const safeMsg = !message ? '' : isSafeMessage(message) ? String(message).trim() : (kind === 'error' ? 'Please try again.' : '');
  if (__DEV__ && (safeTitle !== String(title || '').trim() || (message && !safeMsg))) {
    console.log('[notify] hidden technical text');
  }
  showToast({ type: kind, title: safeTitle, message: safeMsg === safeTitle ? '' : safeMsg, duration: Math.max(2, duration) * 1000 });
}

// Toast colour from the old Burnt preset, or from the wording when none given.
function toastType(preset, title) {
  if (preset === 'done') return 'success';
  if (preset === 'error') return 'error';
  const t = String(title || '');
  if (/fail|error|could not|couldn't|unable|invalid|not found|denied|wrong|not allowed/i.test(t)) return 'error';
  if (/required|please|permission|check|missing|too large|not available|wait|enter|select|no .*(saved|found)|first|duplicate|limit/i.test(t)) return 'warning';
  if (/saved|success|copied|done|created|updated|assigned|sent|added|deleted|removed|changed|shared|downloaded|recorded/i.test(t)) return 'success';
  return 'info';
}
