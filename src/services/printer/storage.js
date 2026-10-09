import AsyncStorage from '@react-native-async-storage/async-storage';

// Dotted-key JSON convention — same shape as src/auth/session.js.
const LAST_DEVICE_KEY = 'printer.lastDevice';

/**
 * One record covers all three transports — `transport` says which fields are
 * meaningful: `address` (Bluetooth MAC / USB deviceName) or `host`+`port`
 * (network). Kept as one generic shape/key (rather than one per transport)
 * so switching transports doesn't leave stale, confusing leftovers from a
 * previous choice.
 * @returns {Promise<{transport: string, name?: string, address?: string, host?: string, port?: number}|null>}
 */
export async function getLastDevice() {
  const raw = await AsyncStorage.getItem(LAST_DEVICE_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveLastDevice(device) {
  if (!device?.transport) return;
  if (device.transport === 'network' ? !device.host : !device.address) return;
  await AsyncStorage.setItem(
    LAST_DEVICE_KEY,
    JSON.stringify({
      transport: device.transport,
      name: device.name,
      address: device.address,
      host: device.host,
      port: device.port,
    }),
  );
}

// Page Setup preset id (labelPresets.js) the shop last picked on the Print
// QR Label sheet — just the id, validated against LABEL_PRESETS on read.
const LABEL_PRESET_KEY = 'printer.labelPreset';

export async function getLabelPresetId() {
  return AsyncStorage.getItem(LABEL_PRESET_KEY);
}

export async function saveLabelPresetId(id) {
  if (!id) return;
  await AsyncStorage.setItem(LABEL_PRESET_KEY, String(id));
}
