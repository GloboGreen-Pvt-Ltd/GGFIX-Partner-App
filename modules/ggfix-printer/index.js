import { requireOptionalNativeModule } from 'expo';

/**
 * Native bridge to Bluetooth Classic (RFCOMM/SPP). Optional on purpose: an
 * APK built before this module existed simply does not contain it, and the
 * caller needs to say so plainly rather than crash on import.
 */
const GgfixPrinter = requireOptionalNativeModule('GgfixPrinter');

export const isAvailable = () => GgfixPrinter != null;

function assertAvailable() {
  if (!GgfixPrinter) throw new Error('GgfixPrinter native module is not available in this build.');
}

/** True once the phone's Bluetooth radio is on — no permission required to ask. */
export function isBluetoothEnabled() {
  return GgfixPrinter ? !!GgfixPrinter.isBluetoothEnabled() : false;
}

/** True while a printer socket is currently open. */
export function isConnected() {
  return GgfixPrinter ? !!GgfixPrinter.isConnected() : false;
}

/**
 * Already-paired Bluetooth devices (pairing itself happens once, outside
 * the app, in Android's own Bluetooth settings).
 * @returns {Promise<{name: string, address: string}[]>}
 */
export async function getBondedDevices() {
  assertAvailable();
  return await GgfixPrinter.getBondedDevices();
}

/** Opens an RFCOMM/SPP socket to the given paired device address. */
export async function connect(address) {
  assertAvailable();
  await GgfixPrinter.connect(address);
}

export async function disconnect() {
  if (!GgfixPrinter) return;
  await GgfixPrinter.disconnect();
}

/** Writes a raw command string (e.g. a TSPL2 label) to the open socket. */
export async function write(data) {
  assertAvailable();
  await GgfixPrinter.write(data);
}

/**
 * Fires with `{ connected: false }` when the link drops on its own (out of
 * range, printer powered off) — not fired for a caller-initiated
 * disconnect(). Returns an unsubscribe function.
 *
 * `GgfixPrinter` (a NativeModule) already extends EventEmitter itself —
 * modules with `Events(...)` in their Kotlin definition emit directly, no
 * wrapper needed.
 */
export function addConnectionListener(callback) {
  if (!GgfixPrinter) return () => {};
  const sub = GgfixPrinter.addListener('onConnectionStateChanged', callback);
  return () => sub.remove();
}
