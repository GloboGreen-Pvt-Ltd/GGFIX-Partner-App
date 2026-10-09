/**
 * An employee's mobile in the one shape the GGFIX Staff App logs in with:
 * exactly 10 bare digits. Staff login sends the number as typed and
 * auth-service matches it against users.phone as-is, so the auth account, the
 * technician record and the edit form must all hold this same string or the
 * employee cannot sign in.
 *
 * Accepts the ways a number gets written — "+91 98765 43210", "+91-98765-43210",
 * "(98765) 43210", "91 9876543210", "098765 43210". A leading 91 is only dropped
 * when it leaves exactly 10 digits (i.e. it can only be the country code).
 *
 * @returns {string|null} '' when blank, the 10 digits when valid, null when invalid
 *                        (too short/long, or contains letters or other symbols).
 */
export function normalizeIndianMobile(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/[^\d\s()+\-.]/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}
