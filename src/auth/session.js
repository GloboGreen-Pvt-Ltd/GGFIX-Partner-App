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

export async function saveSession(session) {
  await AsyncStorage.setItem(TOKEN_KEY, session?.accessToken || '');
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(session || {}));
  await AsyncStorage.setItem(SERVER_KEY, AUTH_BASE);
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, SERVER_KEY]);
}

export async function getToken() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
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
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Lets the API client notify the app when a token is rejected (expired/invalid)
// so it can clear state and route back to Login.
let authExpiredHandler = null;
export function setAuthExpiredHandler(fn) { authExpiredHandler = fn; }
export function notifyAuthExpired() {
  try { if (authExpiredHandler) authExpiredHandler(); } catch (_) {}
}
