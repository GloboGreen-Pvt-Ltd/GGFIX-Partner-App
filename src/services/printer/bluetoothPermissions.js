import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Bluetooth-connect permission for the label-printer flow. Mirrors
 * src/lib/contacts.js's shape (status constants, get/request split, a
 * watchdog around the native call) — this is the app's first use of
 * `PermissionsAndroid` since every other permission so far has gone through
 * an Expo module's own JS-level request API.
 */

export const PERMISSION_GRANTED = 'granted';
export const PERMISSION_DENIED = 'denied';
export const PERMISSION_UNDETERMINED = 'undetermined';

const BLUETOOTH_CONNECT = 'android.permission.BLUETOOTH_CONNECT';

/**
 * Resolves to `fallback` if the wrapped promise has not settled in `ms` —
 * see contacts.js's withWatchdog for why this matters: a permission missing
 * from the manifest can leave the native call hanging forever instead of
 * rejecting, which would otherwise strand the sheet on a spinner with no
 * way out.
 */
function withWatchdog(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]);
}

const CHECK_TIMEOUT_MS = 6000;
const REQUEST_TIMEOUT_MS = 60000;

// BLUETOOTH_CONNECT is a runtime permission only from Android 12 (API 31).
// Below that, BLUETOOTH/BLUETOOTH_ADMIN are install-time (manifest-only) —
// there is nothing to check or request at runtime.
function needsRuntimePermission() {
  return Platform.OS === 'android' && Platform.Version >= 31;
}

/** Reads the current grant WITHOUT prompting. */
export async function getBluetoothPermission() {
  if (!needsRuntimePermission()) return PERMISSION_GRANTED;
  try {
    const granted = await withWatchdog(PermissionsAndroid.check(BLUETOOTH_CONNECT), CHECK_TIMEOUT_MS, null);
    if (granted === null) return PERMISSION_UNDETERMINED;
    return granted ? PERMISSION_GRANTED : PERMISSION_DENIED;
  } catch (_) {
    return PERMISSION_DENIED;
  }
}

/** Shows the OS "Allow … to connect to nearby devices" dialog. */
export async function requestBluetoothPermission() {
  if (!needsRuntimePermission()) return PERMISSION_GRANTED;
  try {
    const result = await withWatchdog(PermissionsAndroid.request(BLUETOOTH_CONNECT), REQUEST_TIMEOUT_MS, null);
    return result === PermissionsAndroid.RESULTS.GRANTED ? PERMISSION_GRANTED : PERMISSION_DENIED;
  } catch (_) {
    return PERMISSION_DENIED;
  }
}
