import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_BASE } from '../api/config';

const TOKEN_KEY = 'auth.token';
const USER_KEY = 'auth.user';

// A session belongs to the server that issued it. When the app moves to another
// API server (e.g. api.ggfix.in → api.neargfix.com) the old token is rejected by
// every service, so it is dropped once and the user signs in again.
const SERVER_KEY = 'auth.server';
async function fromThisServer() {
  return (await AsyncStorage.getItem(SERVER_KEY)) === AUTH_BASE;
}
async function dropForeignSession() {
  await clearSession();
  notifyAuthExpired();
}

// The token lives in Android Keystore / iOS Keychain (expo-secure-store), not
// plaintext AsyncStorage. Loaded lazily: without the native module (Expo Go /
// an older build) it falls back to AsyncStorage. Tokens saved by older app
// versions are moved into secure storage on first read (no forced re-login).
let SecureStore = null;
try {
  // eslint-disable-next-line global-require
  if (Platform.OS !== 'web') SecureStore = require('expo-secure-store');
} catch (_) { SecureStore = null; }
const secureOk = () => !!(SecureStore && typeof SecureStore.setItemAsync === 'function');

async function writeToken(token) {
  if (secureOk()) {
    try {
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
      await AsyncStorage.removeItem(TOKEN_KEY);
      return;
    } catch (_) { /* fall back so login never hard-fails */ }
  }
  await AsyncStorage.setItem(TOKEN_KEY, token || '');
}

async function readToken() {
  if (secureOk()) {
    try {
      const t = await SecureStore.getItemAsync(TOKEN_KEY);
      if (t) return t;
    } catch (_) { /* fall through */ }
  }
  const legacy = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacy && secureOk()) await writeToken(legacy).catch(() => {});
  return legacy;
}

export async function saveSession(session) {
  const { accessToken, ...profile } = session || {};
  await writeToken(accessToken || '');
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));
  await AsyncStorage.setItem(SERVER_KEY, AUTH_BASE);
}

export async function clearSession() {
  if (secureOk()) { try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch (_) {} }
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, SERVER_KEY]);
}

export async function getToken() {
  const token = await readToken();
  if (token && !(await fromThisServer())) {
    await dropForeignSession();
    return null;
  }
  return token;
}

export async function getSession() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (raw && !(await fromThisServer())) {
    await dropForeignSession();
    return null;
  }
  let profile = null;
  try { profile = raw ? JSON.parse(raw) : null; } catch { return null; }
  if (!profile) return null;
  // Older versions kept the token inside the profile blob: move it out.
  if (profile.accessToken) {
    const { accessToken, ...rest } = profile;
    await writeToken(accessToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(rest));
    return { ...rest, accessToken };
  }
  const token = await readToken();
  return token ? { ...profile, accessToken: token } : profile;
}

// Lets the API client notify the app when a token is rejected (expired/invalid)
// so it can clear state and route back to Login.
let authExpiredHandler = null;
export function setAuthExpiredHandler(fn) { authExpiredHandler = fn; }
export function notifyAuthExpired() {
  try { if (authExpiredHandler) authExpiredHandler(); } catch (_) {}
}
