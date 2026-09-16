import {
  AUTH_BASE,
  MASTER_BASE,
  TICKET_BASE,
  TECHNICIAN_BASE,
  SHOP_BASE,
  INVENTORY_BASE,
  MARKETPLACE_BASE,
  PICKUP_BASE,
  ORDER_BASE,
  USER_BASE,
  SUBSCRIPTION_BASE,
} from './config';
import { getToken, clearSession, notifyAuthExpired } from '../auth/session';
import { File, UploadType } from 'expo-file-system';

// RN's fetch has NO default timeout. Against this 12-service backend a single
// down/hung service would otherwise leave every awaiting screen stuck on a
// spinner forever. Abort after a bounded wait so callers get a real error to
// surface. Uploads get a longer budget than plain JSON calls.
const REQUEST_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 60000;

// Bases may carry a routing prefix (https://api.ggfix.in/ticket) as well as a
// bare origin (http://10.0.0.5:8082), so base and path are CONCATENATED. Using
// `new URL(path, base)` here would resolve an absolute path like `/tickets/1`
// against the origin and silently drop the `/ticket` prefix nginx routes on.
function resolveBase(baseUrlOrNull) {
  const base = baseUrlOrNull && typeof baseUrlOrNull === 'string' ? baseUrlOrNull.trim() : '';
  if (!base || !base.startsWith('http')) return AUTH_BASE.replace(/\/+$/, '');
  return base.replace(/\/+$/, '');
}

function joinUrl(base, path) {
  const p = typeof path === 'string' ? path : '';
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

async function request(baseUrlOrNull, method, path, { query, body, headers, skipAuthExpiry } = {}) {
  const base = resolveBase(baseUrlOrNull);
  const url = new URL(joinUrl(base, path));
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const token = await getToken();
  const urlString = url.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(urlString, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e?.name === 'AbortError';
    const baseHint =
      baseUrlOrNull && typeof baseUrlOrNull === 'string' && baseUrlOrNull.includes('localhost')
        ? ' (note: localhost on a phone means the phone itself)'
        : '';
    const msg = timedOut
      ? `Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s — the server may be down or unreachable.`
      : (e?.message || 'Network request failed');
    const err = new Error(`Network request failed${baseHint}. URL: ${urlString}. ${msg}`);
    err.status = 0;
    err.timeout = timedOut;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    // A 401 only means "session is dead, log in again" when it comes from the
    // AUTH service — that service is the authority on token validity. A 401 from
    // any OTHER microservice means THAT service can't validate the token (its
    // JWT_SECRET has drifted from auth-service, or it's running an older build);
    // that must NOT clear the session and bounce the whole app to Login. A 403
    // is a real per-resource authorization failure and never clears the session.
    const isAuthService = base === AUTH_BASE;
    if (res.status === 401 && token && !skipAuthExpiry && isAuthService) {
      await clearSession();
      notifyAuthExpired();
    }
    const message = res.status === 401 && token && isAuthService
      ? 'Your session has expired. Please log in again.'
      : (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}

// Multipart file upload. `file` is an expo-image-picker asset { uri, name,
// type } (or an equivalent object built elsewhere, e.g. an expo-av
// recording).
//
// History of what NOT to do here, because both attempts already shipped and
// both broke KYC/media uploads in a different way:
//   1. `form.append('file', { uri, name, type })` — the bridge-era RN
//      shorthand FormData part. The New Architecture's rewritten Networking
//      module (this app runs newArchEnabled=true, RN 0.86) doesn't recognise
//      it and throws "Unsupported FormDataPart implementation" before a
//      request is even made.
//   2. `fetch(uri).blob()`, optionally re-wrapped as `new Blob([blob],
//      {type})`, appended to FormData. Expo SDK 56+ installs `expo/fetch` as
//      the global native fetch, and its Response.blob() falls back to
//      round-tripping the bytes through React Native's OWN Blob module via
//      base64 (the "may be slow... add expo-blob" warning) — and that module
//      is itself still bridge-era (its own source has a "TODO: use
//      turbomodules" comment, never done) and unreliable through that path:
//      the server received bytes that failed magic-byte format detection
//      every time, regardless of what Content-Type was attached.
//
// expo-file-system's `File` is Expo's own New-Architecture-native
// implementation, with a purpose-built multipart upload task — no JS
// FormData/Blob bridging at all. `mimeType` is set explicitly rather than
// left to whatever a blob happened to infer, and `parameters` covers the
// extra form fields (`folder`/`slot`) the old FormData `fields` did.
// `name` is accepted but not sent: File.upload() has no filename override,
// only the name its own uri already carries, and every caller ends up
// server-renamed anyway (S3 keys are generated from the owner/shop, not the
// upload's filename) — so there's nothing for a caller-supplied name to fix.
async function uploadRequest(baseUrlOrNull, path, { uri, name: _name, type, fields } = {}) {
  const base = resolveBase(baseUrlOrNull);
  const urlString = new URL(joinUrl(base, path)).toString();

  const parameters = {};
  if (fields) Object.entries(fields).forEach(([k, v]) => { if (v != null) parameters[k] = String(v); });

  const token = await getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let result;
  try {
    const file = new File(uri);
    result = await file.upload(urlString, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      // The server validates the file's own magic bytes, not this header —
      // but an absent/wrong Content-Type still trips its declared-vs-actual
      // cross-check, so this needs to be the real type, not a guess.
      mimeType: type || 'image/jpeg',
      parameters,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e?.name === 'AbortError';
    const msg = timedOut
      ? `Upload timed out after ${Math.round(UPLOAD_TIMEOUT_MS / 1000)}s.`
      : (e?.message || 'Network request failed');
    const err = new Error(`Upload failed. URL: ${urlString}. ${msg}`);
    err.status = 0;
    err.timeout = timedOut;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const { status, body: text } = result;
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (status < 200 || status >= 300) {
    // Same rule as request(): only an auth-service 401 ends the session.
    if (status === 401 && token && base === AUTH_BASE) { await clearSession(); notifyAuthExpired(); }
    const message = (json && (json.message || json.error)) || text || `HTTP ${status}`;
    const err = new Error(message);
    err.status = status;
    throw err;
  }
  return json;
}

function createClient(baseUrl) {
  return {
    get: (path, opts) => request(baseUrl, 'GET', path, opts),
    post: (path, opts) => request(baseUrl, 'POST', path, opts),
    put: (path, opts) => request(baseUrl, 'PUT', path, opts),
    patch: (path, opts) => request(baseUrl, 'PATCH', path, opts),
    del: (path, opts) => request(baseUrl, 'DELETE', path, opts),
    upload: (path, opts) => uploadRequest(baseUrl, path, opts),
  };
}

export const authApi = createClient(AUTH_BASE);
export const masterApi = createClient(MASTER_BASE);
export const ticketApi = createClient(TICKET_BASE);
export const technicianApi = createClient(TECHNICIAN_BASE);
export const shopApi = createClient(SHOP_BASE);
export const inventoryApi = createClient(INVENTORY_BASE);
export const marketplaceApi = createClient(MARKETPLACE_BASE);
export const pickupApi = createClient(PICKUP_BASE);
export const orderApi = createClient(ORDER_BASE);
export const userApi = createClient(USER_BASE);
export const subscriptionApi = createClient(SUBSCRIPTION_BASE);
