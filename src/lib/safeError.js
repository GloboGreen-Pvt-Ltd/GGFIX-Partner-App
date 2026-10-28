// User-facing error text. Server / network errors never reach the screen raw:
// no API domains, URLs, status codes, stack traces or internal details. Only
// short, plain validation messages from the server (e.g. "Invalid OTP") pass.

export const SAFE = {
  notFound: 'This feature is currently unavailable.',
  server: 'Something went wrong. Please try again.',
  offline: 'No internet connection.',
  timeout: 'Connection timed out. Please try again.',
  session: 'Session expired. Please log in again.',
  forbidden: "You don't have permission.",
  save: 'Unable to save. Please try again.',
  sync: 'Unable to sync. Please retry.',
  tooLarge: 'The file is too large.',
};

// Anything that reads like a URL, domain, stack trace, exception, SQL, JSON,
// HTML, token or a bare HTTP status is technical — not for users.
const TECHNICAL = [
  /https?:\/\//i, /\bURL:/i, /\b[\w-]+\.(com|in|net|org|io|app|dev|cloud|local)\b/i, /localhost|127\.0\.0\.1|\b\d{1,3}(\.\d{1,3}){3}\b/,
  /\bHTTP\s*\d{3}\b/i, /\bstatus(\s*code)?\s*:?\s*[1-5]\d\d\b/i, /\b(4\d\d|5\d\d)\b.*\b(error|status)\b/i,
  /exception|stack ?trace|\bat [\w.$]+\(|traceback|java\.|org\.|springframework|hibernate|jdbc|\bsql\b|constraint|syntax error|null ?pointer|undefined is not|cannot read propert|is not a function|typeerror|referenceerror/i,
  /bearer\s|jwt|token[:=]/i, /^\s*[[{<]/, /<\/?\w+>/, /internal server/i, /network request failed/i, /\bECONN|ETIMEDOUT|ENOTFOUND/,
];

export function isSafeMessage(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 160) return false;
  return !TECHNICAL.some((re) => re.test(s));
}

/** Safe text for an HTTP failure. `raw` is the server's own message, if any. */
export function safeHttpMessage(status, raw) {
  if (status === 401) return SAFE.session;
  if (status === 403) return SAFE.forbidden;
  if (status === 404) return SAFE.notFound;
  if (status === 408 || status === 504) return SAFE.timeout;
  if (status === 413) return SAFE.tooLarge;
  if (status >= 500) return SAFE.server;
  // 400 / 409 / 422…: the server's validation text when it is plain language.
  return isSafeMessage(raw) ? String(raw).trim() : SAFE.save;
}

/** Safe text for a request that never got a response. */
export const safeNetworkMessage = (timedOut) => (timedOut ? SAFE.timeout : SAFE.offline);

/** Safe text for any caught error (API or device), with a fallback. */
export function safeErrorText(e, fallback = SAFE.server) {
  const msg = typeof e === 'string' ? e : e?.message;
  return isSafeMessage(msg) ? String(msg).trim() : fallback;
}
