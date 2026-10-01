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

export function listingSellerLabel(item) {
  return item?.sellerType === 'CUSTOMER' ? 'Customer' : (item?.shopName || 'Shop');
}

export function listingPriceLabel(item) {
  const n = item?.expectedPrice != null ? Number(item.expectedPrice) : null;
  if (n != null && n > 0) return `₹${n.toLocaleString('en-IN')}`;
  if (n === 0) return 'Open for quotation';
  return null;
}
