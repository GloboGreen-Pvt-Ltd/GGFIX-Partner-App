// Device-session / MPIN / TPIN calls (auth-service /auth/security/*, migration 116).
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/client';
import { getSession, getToken, saveSession } from '../auth/session';
import { sha256Hex } from './sha256';

export const APP_TYPE = 'PARTNER';
const DEVICE_KEY = 'security.deviceId';

let SecureStore = null;
try { if (Platform.OS !== 'web') SecureStore = require('expo-secure-store'); } catch (_) { SecureStore = null; }

function randomId() {
  const b = new Uint8Array(32);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i += 1) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Per-install random device id kept in Keystore/Keychain (reinstall → new device). */
export async function getDeviceId() {
  let id = null;
  try { id = SecureStore ? await SecureStore.getItemAsync(DEVICE_KEY) : await AsyncStorage.getItem(DEVICE_KEY); } catch (_) {}
  if (!id) {
    id = randomId();
    try { if (SecureStore) await SecureStore.setItemAsync(DEVICE_KEY, id); else await AsyncStorage.setItem(DEVICE_KEY, id); } catch (_) {}
  }
  return id;
}

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

/** Starts the single-device session with a fresh OTP-login token. Throws err.status 409 + payload on DEVICE_LIMIT. */
export async function startDeviceSession({ replaceExisting = false } = {}) {
  const token = await getToken();
  const res = await authApi.post('/auth/security/session/start', {
    headers: bearer(token),
    skipAuthExpiry: true,
    body: {
      deviceId: await getDeviceId(),
      deviceName: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || Platform.OS,
      platform: Platform.OS,
      replaceExisting,
    },
  });
  const profile = (await getSession()) || {};
  await saveSession({
    ...profile,
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    deviceSessionId: res.sessionId,
    otpExpiresAt: res.otpExpiresAt,
    lockTimeoutSeconds: res.lockTimeoutSeconds,
  });
  return res;
}

export const sessionStatus = () => authApi.get('/auth/security/session');
export const logoutDeviceSession = () => authApi.post('/auth/security/session/logout', { skipAuthExpiry: true });
export const setBiometricPreference = (enabled) => authApi.post('/auth/security/biometric', { body: { enabled } });
export const createPin = (type, pin) => authApi.post(`/auth/security/pin/${type}`, { body: { pin } });
export const verifyMpin = (pin) => authApi.post('/auth/security/mpin/verify', { body: { pin } });
export const resetPin = (type, { otpToken, newPin, verificationMethod }) =>
  authApi.post(`/auth/security/pin/${type}/reset`, { body: { otpToken, newPin, verificationMethod } });

// Owner / Shop sessions: the server identifies whose TPIN was typed (Owner, Shop
// or an active same-shop Employee) — no manual selection, e.g. pickup → shop handover.
export function authorizeTpin({ pin, action, method, path }) {
  return authApi.post('/auth/security/tpin/authorize', {
    body: {
      pin,
      actionType: action,
      contextHash: sha256Hex(`${method} ${path}`),
      idempotencyKey: randomId().slice(0, 32),
    },
  });
}

/**
 * Fresh OTP proof for PIN reset without replacing the stored session:
 * re-runs the existing OTP login and returns only its token.
 */
export async function otpProofToken({ identifier, otp, shopLogin }) {
  const data = shopLogin
    ? await authApi.post('/auth/shop-login', { body: { mobile: identifier, otp }, skipAuthExpiry: true })
    : await authApi.post('/auth/login', { body: { email: identifier, otp }, skipAuthExpiry: true });
  return data?.accessToken;
}

export function sendResetOtp({ identifier, shopLogin }) {
  return shopLogin
    ? authApi.post('/auth/shop-login/request-otp', { body: { mobile: identifier } })
    : authApi.post('/auth/otp/send', { body: { email: identifier } });
}

/** Human message for server PIN errors. */
export function pinErrorMessage(e) {
  const m = String(e?.devMessage || e?.message || '');
  const left = m.match(/WRONG_PIN:(\d+)/);
  if (left) return `Incorrect PIN. ${left[1]} attempt(s) left.`;
  if (/PIN_LOCKED/.test(m)) return 'Too many wrong attempts. Try again in 15 minutes.';
  if (/check in first/i.test(m)) return 'Please check in first to use your TPIN.';
  if (/TPIN_AMBIGUOUS/.test(m)) return 'This TPIN is used by more than one person. Ask the shop owner to reset one of them.';
  if (/TPIN_IN_USE/.test(m)) return 'This TPIN is not available. Choose a different TPIN.';
  if (/Employee app/i.test(m)) return 'Check-in / check-out must be done in the Employee app.';
  if (/too simple/i.test(m)) return 'PIN is too simple. Avoid repeated or sequential digits.';
  if (/SESSION_EXPIRED|SESSION_REVOKED/.test(m)) return 'Session expired. Please log in again.';
  return e?.message || 'Something went wrong. Please try again.';
}
