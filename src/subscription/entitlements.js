/**
 * Client-side subscription entitlements — one place the whole app asks "may I
 * do this?".
 *
 * The rules themselves are NOT here. Everything below is a thin reader over the
 * `GET /subscriptions/entitlements/{ownerUserId}?shopId=…` payload, which the
 * backend builds with the very same engine its create APIs enforce with. That
 * is deliberate: a second copy of "trial allows 3 employees" living in the app
 * is a copy that goes stale the day a plan changes, and it is exactly how a
 * screen ends up advertising headroom the server refuses.
 *
 * So these helpers answer only "what did the server say?". If they are ever
 * wrong, the server still refuses the write — the client checks exist to keep
 * the user out of a form they cannot submit, not to be the gate.
 *
 * Shape of the payload (see Entitlements.java):
 *   {
 *     plan, planName, status, startDate, endDate, expired, daysRemaining,
 *     hasSubscription, purchasedShopCount, enforced,
 *     limits: { EMPLOYEES: {limit, used, remaining, unlimited, scope, allowed}, … },
 *     features: { newServiceBooking, pickupService, buyProducts, sellProducts, multipleShops }
 *   }
 */

import { subscriptionApi, ticketApi } from '../api/client';
import { getSession } from '../auth/session';
import { fetchMe } from '../api/auth';

export const FEATURE = {
  EMPLOYEES: 'EMPLOYEES',
  SHOPS: 'SHOPS',
  SELL_ORDERS: 'SELL_ORDERS',
  BUY_PRODUCTS: 'BUY_PRODUCTS',
};

export const CAPABILITY = {
  NEW_SERVICE_BOOKING: 'newServiceBooking',
  PICKUP_SERVICE: 'pickupService',
  BUY_PRODUCTS: 'buyProducts',
  SELL_PRODUCTS: 'sellProducts',
  MULTIPLE_SHOPS: 'multipleShops',
};

/**
 * Fetch the current account's entitlements.
 *
 * Always hits the network. Entitlements are deliberately NOT cached across
 * calls: a trial that lapsed overnight, or a plan upgraded on another device,
 * must take effect on the next check rather than whenever a cache happens to
 * expire. The payload is small and each call site fetches once per screen
 * focus, so the cost is a request, and the alternative is enforcing yesterday's
 * plan.
 *
 * Returns null on any failure — callers treat null as "unknown" and fall open,
 * matching the backend, which also fails open rather than blocking a shop over
 * a subscription lookup it could not complete.
 */
export async function fetchEntitlements() {
  try {
    const session = await getSession();
    let ownerUserId = session?.userId || session?.id || null;
    const shopId = session?.shopId || null;

    // Old sessions can be missing the user id; fetchMe heals them.
    if (!ownerUserId) {
      try {
        const me = await fetchMe();
        ownerUserId = me?.id || me?.userId || null;
      } catch {
        return null;
      }
    }
    if (!ownerUserId) return null;

    return await subscriptionApi.get(`/subscriptions/entitlements/${ownerUserId}`, {
      query: shopId ? { shopId } : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * The employee allowance for the shop the caller is actually signed in to.
 *
 * Goes to ticket-service rather than reading EMPLOYEES out of the entitlements
 * payload, for one reason: this endpoint takes its shop from the JWT, while
 * fetchEntitlements() has to pass a shopId from the stored session. Those are
 * normally the same shop, but the session copy has drifted before, and a
 * drifted shopId here would count someone else's staff — showing headroom that
 * POST /technicians then refuses. The JWT is the same thing the create API
 * scopes by, so this cannot disagree with what gets enforced.
 *
 * The policy behind both is identical (one engine, one plan catalogue); only
 * the "which shop" input differs. Normalised into the same shape the
 * entitlements payload uses so callers need not care which endpoint answered.
 */
export async function fetchEmployeeLimit() {
  try {
    const check = await ticketApi.get('/technicians/limit');
    if (!check) return null;
    return {
      limit: check.limit ?? null,
      used: check.currentUsage ?? 0,
      remaining: check.remaining ?? null,
      unlimited: check.unlimited === true,
      scope: 'PER_SHOP',
      allowed: check.allowed !== false,
      // Carried through so a pre-emptive block can quote the server's own
      // wording instead of composing a second version of the same sentence.
      expired: check.expired === true,
      planName: check.planName || null,
      message: check.message || null,
    };
  } catch {
    return null;
  }
}

/**
 * Wrap a single limit reading as an entitlements-shaped object, so screens that
 * only need one feature can still use can()/limitMessage()/showLimitPopup().
 */
export function asEntitlements(feature, usage) {
  if (!usage) return null;
  return {
    plan: null,
    planName: usage.planName || 'current',
    expired: usage.expired === true,
    limits: { [feature]: usage },
    features: {},
  };
}

/** One metered allowance, or null when the payload is missing/unknown. */
export function limitOf(entitlements, feature) {
  return entitlements?.limits?.[feature] || null;
}

/**
 * May one more of this feature be added?
 *
 * Reads the server's own `allowed` flag rather than re-deriving
 * `used < limit` — `allowed` already folds in expiry, unlimited plans and the
 * fail-open cases, and a second implementation of that rule in the client is
 * how the two drift apart.
 *
 * Unknown entitlements return true: the server is the gate, and blocking the UI
 * on a failed lookup would strand a working shop.
 */
export function can(entitlements, feature) {
  const usage = limitOf(entitlements, feature);
  return usage ? usage.allowed !== false : true;
}

/** Is an on/off capability granted? Unknown → true, same reasoning as can(). */
export function hasFeature(entitlements, capabilityKey) {
  const features = entitlements?.features;
  if (!features || features[capabilityKey] === undefined) return true;
  return features[capabilityKey] === true;
}

export const canAddEmployee = (e) => can(e, FEATURE.EMPLOYEES);
export const canAddShop = (e) => can(e, FEATURE.SHOPS);
export const canCreateSellOrder = (e) => can(e, FEATURE.SELL_ORDERS);
export const canUsePickupService = (e) => hasFeature(e, CAPABILITY.PICKUP_SERVICE);
export const canCreateServiceBooking = (e) => hasFeature(e, CAPABILITY.NEW_SERVICE_BOOKING);

/** True once the plan has lapsed. */
export const isExpired = (e) => e?.expired === true;

/**
 * "3 / 3" for a capped plan, "3" for an unlimited one.
 *
 * Unlimited deliberately renders as the bare count: "3 / Unlimited" is a
 * fraction with no denominator, and a sentinel like 999999 would surface as
 * literal noise in the UI.
 */
export function usageLabel(entitlements, feature) {
  const usage = limitOf(entitlements, feature);
  if (!usage) return null;
  return usage.unlimited ? `${usage.used}` : `${usage.used} / ${usage.limit}`;
}

/** "1 of 2" — the phrasing the Subscription screen uses for shops covered. */
export function coverageLabel(entitlements, feature) {
  const usage = limitOf(entitlements, feature);
  if (!usage) return null;
  return usage.unlimited ? `${usage.used}` : `${usage.used} of ${usage.limit}`;
}

/**
 * The sentence to show when an action is refused.
 *
 * Prefers the wording carried by a 409 body, so the message the user reads is
 * the one the server actually decided on. Falls back to composing from the
 * entitlements payload when blocking pre-emptively, before any request was made.
 */
export function limitMessage(entitlements, feature, rejection) {
  if (rejection?.message) return rejection.message;
  // A reading fetched from a limit endpoint carries the server's own sentence;
  // prefer it over recomposing one that could word the same rule differently.
  const carried = limitOf(entitlements, feature)?.message;
  if (carried) return carried;
  if (isExpired(entitlements)) {
    return `Your ${entitlements?.planName || 'current'} plan has expired. `
      + 'Please upgrade your subscription to continue.';
  }
  const usage = limitOf(entitlements, feature);
  const plan = entitlements?.planName || 'current';
  if (feature === FEATURE.EMPLOYEES) {
    return `You have reached the maximum of ${usage?.limit} employees allowed for the ${plan} plan.`;
  }
  if (feature === FEATURE.SHOPS) {
    return `You have reached the maximum of ${usage?.limit} shops allowed for the ${plan} plan.`;
  }
  if (feature === FEATURE.SELL_ORDERS) {
    return `You have reached the maximum of ${usage?.limit} sell orders allowed for the ${plan} plan.`;
  }
  return `Your ${plan} plan does not allow this action.`;
}
