import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth.token';
const USER_KEY = 'auth.user';

export async function saveSession(session) {
  await AsyncStorage.setItem(TOKEN_KEY, session?.accessToken || '');
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(session || {}));
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function getToken() {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

export async function getSession() {
  const raw = await AsyncStorage.getItem(USER_KEY);
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
