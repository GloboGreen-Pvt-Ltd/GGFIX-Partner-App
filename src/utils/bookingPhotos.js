// The device photos taken when a booking was made. The booking wizard stores
// them in ticket.devicePhotosJson as { front, back, photo3, photo4, photo5 }
// (ServicePriceEstimateScreen); a pickup mirror can write { front, back, video }
// and older rows a plain array. Values are URLs or { url | uri | imageUrl }.
// Videos are left out — the photo viewer can't show them.

const PHOTO_KEYS = ['front', 'back', 'photo3', 'photo4', 'photo5'];

const urlOf = (x) => (typeof x === 'string' ? x : x?.url || x?.uri || x?.imageUrl || null);

/** Photo URLs in booking order (front, back, then the rest), de-duplicated. */
export function bookingPhotoUrls(ticket) {
  let v = ticket?.devicePhotosJson;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  let list;
  if (Array.isArray(v)) list = v.map(urlOf);
  else if (v && typeof v === 'object') {
    const keys = [...PHOTO_KEYS, ...Object.keys(v).filter((k) => !PHOTO_KEYS.includes(k) && !/video/i.test(k))];
    list = keys.map((k) => urlOf(v[k]));
  } else return [];
  return [...new Set(list.filter((u) => typeof u === 'string' && u.trim()))];
}
