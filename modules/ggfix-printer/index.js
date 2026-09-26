import { requireOptionalNativeModule } from 'expo';

/**
 * Native bridge to three printer transports: Bluetooth Classic (RFCOMM/SPP),
 * Wi-Fi (a raw TCP socket to the printer's standard "JetDirect" port, 9100
 * unless the caller overrides it), and USB (Android's USB Host API, bulk
 * transfer). Only one link is ever open at a time — connecting via any
 * transport implicitly closes whatever was open before. Optional on
 * purpose: an APK built before this module existed simply does not contain
 * it, and the caller needs to say so plainly rather than crash on import.
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

/** True if this device has USB host mode at all — not tied to any specific device being attached. */
export function isUsbAvailable() {
  return GgfixPrinter ? !!GgfixPrinter.isUsbAvailable() : false;
}

/** True while a printer link (Bluetooth, network, or USB) is currently open. */
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

/**
 * Currently-attached USB devices (any USB device, not filtered to printers —
 * the native side doesn't assume a device class since several budget label
 * printers report a vendor-specific one).
 * @returns {Promise<{deviceName: string, productName: string, vendorId: number, productId: number}[]>}
 */
export async function getUsbDevices() {
  assertAvailable();
  return await GgfixPrinter.getUsbDevices();
}

/** Opens an RFCOMM/SPP socket to the given paired device address. */
export async function connect(address) {
  assertAvailable();
  await GgfixPrinter.connect(address);
}

/**
 * Opens a raw TCP socket to a Wi-Fi printer. `port` defaults to 9100 (the
 * standard raw/JetDirect print port almost every Wi-Fi label/receipt
 * printer listens on) when omitted — the native side takes a plain (never
 * null/undefined) Int with 0 meaning "use the default".
 */
export async function connectNetwork(host, port) {
  assertAvailable();
  await GgfixPrinter.connectNetwork(host, Number.isFinite(port) && port > 0 ? Math.round(port) : 0);
}

/**
 * Requests permission (if not already granted) and opens a USB Host API
 * connection to the given attached device — `deviceName` is the OS device
 * path from getUsbDevices(), e.g. "/dev/bus/usb/001/002", not a display name.
 */
export async function connectUsb(deviceName) {
  assertAvailable();
  await GgfixPrinter.connectUsb(deviceName);
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
