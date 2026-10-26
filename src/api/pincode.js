// Indian pincode → district / state / areas, via India Post's public directory
// (api.postalpincode.in — keyless, one row per post office under the pincode).
// The Google Geocoding keys can't be used from the app: the backend key is
// IP-restricted to the server and the website key is referrer-restricted,
// which the Geocoding API rejects.

const cache = new Map();

/**
 * @returns {Promise<{ district: string, state: string, areas: string[] } | null>}
 *   null when the pincode is unknown or the lookup fails (form stays manual).
 */
export async function lookupPincode(pincode) {
  const pin = String(pincode || '').trim();
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  if (cache.has(pin)) return cache.get(pin);

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) return null;
    const json = await res.json();
    const offices = (Array.isArray(json) && json[0]?.Status === 'Success' && json[0].PostOffice) || [];
    if (!offices.length) return null;
    const result = {
      district: offices[0].District || '',
      state: offices[0].State || '',
      // Delivery offices first — those are the areas customers actually live in.
      areas: [...new Set(
        [...offices]
          .sort((a, b) => (a.DeliveryStatus === 'Delivery' ? 0 : 1) - (b.DeliveryStatus === 'Delivery' ? 0 : 1))
          .map((o) => String(o.Name || '').trim())
          .filter(Boolean),
      )],
    };
    cache.set(pin, result);
    return result;
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
