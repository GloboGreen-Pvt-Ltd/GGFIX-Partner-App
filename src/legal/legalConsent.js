import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { authApi } from '../api/client';
import { CURRENT_LEGAL_VERSIONS } from './legalContent';

/**
 * Versioned Terms / Privacy acceptance, stored server-side by auth-service
 * (GET/POST /auth/legal/acceptances). AsyncStorage only caches "this account
 * already accepted these versions" so we don't re-check on every launch, and
 * "this device agreed before" so the login checkbox is only asked the first
 * time. Bumping a version in legalContent.js invalidates both caches.
 */

const APP = 'partner';
const DEVICE_KEY = 'legal.acceptedVersions';
const accountKey = (id) => `legal.acceptedVersions.${id}`;
const SIGNATURE = JSON.stringify(CURRENT_LEGAL_VERSIONS);

// Ticked on the login screen before signing in; recorded once a token exists.
let agreedBeforeLogin = false;

export function setLegalAgreed(agreed) {
  agreedBeforeLogin = !!agreed;
}

export async function hasDeviceAgreed() {
  try {
    return (await AsyncStorage.getItem(DEVICE_KEY)) === SIGNATURE;
  } catch (_) {
    return false;
  }
}

function coversCurrent(acceptances) {
  return Object.entries(CURRENT_LEGAL_VERSIONS).every(
    ([type, version]) => (acceptances?.[type]?.version || '') >= version,
  );
}

async function remember(accountId) {
  const pairs = [[DEVICE_KEY, SIGNATURE]];
  if (accountId) pairs.push([accountKey(accountId), SIGNATURE]);
  try { await AsyncStorage.multiSet(pairs); } catch (_) {}
}

export async function acceptCurrentLegal(accountId) {
  const documents = Object.entries(CURRENT_LEGAL_VERSIONS).map(([type, version]) => ({ type, version }));
  await authApi.post('/auth/legal/acceptances', { body: { documents, app: APP, platform: Platform.OS } });
  agreedBeforeLogin = false;
  await remember(accountId);
}

/**
 * Resolves true when the signed-in account may continue, false when it must
 * accept the current versions first. Network/server errors resolve true so a
 * flaky connection never locks anyone out; the check simply runs again on the
 * next launch.
 */
export async function ensureLegalAcceptance(accountId) {
  try {
    if (accountId && (await AsyncStorage.getItem(accountKey(accountId))) === SIGNATURE) return true;
  } catch (_) {}
  let status;
  try {
    status = await authApi.get('/auth/legal/acceptances');
  } catch (_) {
    return true;
  }
  if (coversCurrent(status?.acceptances)) {
    await remember(accountId);
    return true;
  }
  if (agreedBeforeLogin) {
    try { await acceptCurrentLegal(accountId); } catch (_) {}
    return true;
  }
  return false;
}
