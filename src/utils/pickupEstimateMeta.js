// The employee pickup-estimate flow (PickupServiceBookingDevicesListScreen)
// appends a JSON appendix to repair_bookings.issueSummary as
// `<complaint>\n---PICKUP_ESTIMATE_META---{json}` to smuggle structured data
// (per-service prices, IMEI, ETAs, customer approval) that the bookings
// table has no columns for yet. Every customer-side screen that renders
// issueSummary or relies on those derived fields goes through here so the
// raw JSON never leaks into the UI.
export const PICKUP_META_MARKER = '---PICKUP_ESTIMATE_META---';

export function parsePickupMeta(issueSummary) {
  if (!issueSummary) return { clean: '', meta: null };
  const s = String(issueSummary);
  const idx = s.indexOf(PICKUP_META_MARKER);
  if (idx === -1) return { clean: s.trim(), meta: null };
  const clean = s.slice(0, idx).replace(/\s+$/, '');
  const rest = s.slice(idx + PICKUP_META_MARKER.length).trim();
  try { return { clean, meta: JSON.parse(rest) }; } catch (_) { return { clean, meta: null }; }
}

export function cleanIssueSummary(issueSummary) {
  return parsePickupMeta(issueSummary).clean;
}
