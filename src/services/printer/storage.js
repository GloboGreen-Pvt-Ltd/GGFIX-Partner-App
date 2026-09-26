import AsyncStorage from '@react-native-async-storage/async-storage';

// Dotted-key JSON convention — same shape as src/auth/session.js.
const LAST_DEVICE_KEY = 'printer.lastDevice';

/** @returns {Promise<{name: string, address: string}|null>} */
export async function getLastDevice() {
  const raw = await AsyncStorage.getItem(LAST_DEVICE_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveLastDevice(device) {
  if (!device?.address) return;
  await AsyncStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ name: device.name, address: device.address }));
}
