import { marketplaceApi } from './client';
import { fetchMe } from './auth';
import { getSession } from '../auth/session';

/**
 * Nearby marketplace listings — GET /marketplace/buy/nearby — with the same
 * origin/radius rules OwnerBuyListingScreen applies (that screen keeps its own
 * copy; it is deliberately left untouched):
 *   - origin = the active shop's latitude/longitude (live /auth/me, falling
 *     back to the persisted session); without coordinates the request is sent
 *     without lat/lng, exactly as the Buy screen does;
 *   - radiusKm = 20;
 *   - excludeSellerId = the signed-in user, and the shop's own listings are
 *     dropped client-side.
 */
export const NEARBY_RADIUS_KM = 20;

export async function getListingOrigin() {
  let session = await fetchMe().catch(() => null);
  if (!session) session = await getSession();
  const shop = session?.activeShop;
  const shopId = shop?.id || session?.shopId || null;
  if (shop && shop.latitude != null && shop.longitude != null) {
    return { lat: Number(shop.latitude), lng: Number(shop.longitude), shopName: shop.name, sellerId: session?.userId, shopId };
  }
  return { lat: null, lng: null, shopName: session?.shopName, sellerId: session?.userId, shopId };
}

export async function fetchNearbyListings(origin) {
  const params = { radiusKm: NEARBY_RADIUS_KM };
  if (origin?.lat != null && origin?.lng != null) { params.lat = origin.lat; params.lng = origin.lng; }
  if (origin?.sellerId) params.excludeSellerId = origin.sellerId;
  const data = await marketplaceApi.get('/marketplace/buy/nearby', { query: params });
  const list = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
  const myShopId = origin?.shopId || null;
  return (list || []).filter((l) => !myShopId || l.shopId !== myShopId);
}

// ── Shared display helpers (same rules as OwnerBuyListingScreen) ────────────

/** Same card shape the Buy screen gives a listing (listingToCard) — what the
 *  OwnerBuyListingDetails screen expects on route.params.listing. */
export function toListingCard(l) {
  return { ...l, _key: `listing:${l.id}`, source: 'listing' };
}

/** Buy's "Trending Near You" order: nearest first, unknown distance last. */
export function sortNearestFirst(items) {
  return [...items].sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
}

/** "Good · Black · 8 GB / 256 GB" — listings have no separate storage field;
 *  the sell flow writes colour / RAM / storage into `description`. */
export function listingSpecLine(item) {
  return [item?.condition, item?.description].filter(Boolean).join(' · ');
}

/**
 * The customer's own name for a customer listing. GET /marketplace/buy/nearby
 * carries no name field today (only sellerType + sellerId), so this reads the
 * name fields the API may add and otherwise says "Unknown Customer" — a name is
 * never guessed from other data.
 */
export function listingCustomerName(item) {
  const n = item?.customerName || item?.sellerName || item?.userName || item?.ownerName
    || item?.sellerDisplayName || item?.customer?.name || item?.seller?.name;
  return n && String(n).trim() ? String(n).trim() : 'Unknown Customer';
}

// Standard condition labels used across the sell flows.
const CONDITION_LABELS = [
  'Good', 'Very Good', 'Excellent', 'Superb', 'Like New', 'New', 'Brand New',
  'Fair', 'Average', 'Poor', 'Dead / Unknown', 'Spare Part',
];

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Display label for a listing's condition. The customer sell flow stores it as
 * free text, so it can arrive as "good ", "Food " (typo) etc.: trimmed, matched
 * to a standard label ignoring case, and a one-letter slip of a standard label
 * (4+ letters) shown as that label. Anything else is shown as typed.
 */
export function listingConditionLabel(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const low = raw.toLowerCase();
  const exact = CONDITION_LABELS.find((c) => c.toLowerCase() === low);
  if (exact) return exact;
  if (low.length >= 4) {
    const near = CONDITION_LABELS.find((c) => c.length >= 4 && Math.abs(c.length - low.length) <= 1 && editDistance(c.toLowerCase(), low) <= 1);
    if (near) return near;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function listingSellerLabel(item) {
  return item?.sellerType === 'CUSTOMER' ? 'Customer' : (item?.shopName || 'Shop');
}

export function listingPriceLabel(item) {
  const n = item?.expectedPrice != null ? Number(item.expectedPrice) : null;
  if (n != null && n > 0) return `₹${n.toLocaleString('en-IN')}`;
  if (n === 0) return 'Open for quotation';
  return null;
}
