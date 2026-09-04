import { authApi } from './client';
import { saveSession, clearSession, getSession } from '../auth/session';
import { store } from '../store';
import { setActiveShop } from '../store/authSlice';

/**
 * Unified login. The `identifier` is either email or mobile — the server tries
 * the users table first (SHOP_OWNER / SUPER_ADMIN / EMPLOYEE), then falls back
 * to shop-mobile credentials (SHOP_LOGIN). The response.loginType tells the
 * caller which path matched, so the client routes accordingly.
 *
 * The wire-level field is still called `email` for backward compatibility — the
 * server's identifier resolver accepts either an email address or a mobile
 * number in that field.
 */
export async function login(identifier, { password, otp, shopSlug } = {}) {
  const body = { email: identifier };
  if (otp) body.otp = otp;
  else if (password) body.password = password;
  if (shopSlug) body.shopSlug = shopSlug;
  const data = await authApi.post('/auth/login', { body });
  await saveSession(data);
  return data;
}

export async function register(shopName, shopSlug, email, password, name) {
  const data = await authApi.post('/auth/register', {
    body: { shopName, shopSlug, email, password, name },
  });
  return data;
}

export async function customerRegister({ fullName, email, mobile, password }) {
  const data = await authApi.post('/auth/customer-register', {
    body: { fullName, email, mobile, password },
  });
  const session = {
    accessToken: data.accessToken,
    userId: data.userId,
    fullName: data.fullName,
    email: data.email,
    mobile: data.mobile,
    roles: data.roles || ['CUSTOMER'],
  };
  await saveSession(session);
  return session;
}

export async function customerLogin({ mobile, email, password, otp }) {
  const body = { mobile, email };
  if (otp) body.otp = otp;
  else if (password) body.password = password;
  const data = await authApi.post('/auth/customer-login', { body });
  const session = {
    accessToken: data.accessToken,
    userId: data.userId,
    fullName: data.fullName,
    email: data.email,
    mobile: data.mobile,
    roles: data.roles || ['CUSTOMER'],
  };
  await saveSession(session);
  return session;
}

/**
 * Login by SHOP MOBILE NUMBER. Returns a single-shop session — the JWT is
 * locked to one shopId (loginScope=SHOP) and the shop switcher is hidden.
 * Use this when the user wants access to only one specific shop; owner-wide
 * access still goes through `login(email, ...)`.
 */
export async function shopLogin({ mobile, password, otp }) {
  const body = { mobile };
  if (otp) body.otp = otp;
  else if (password) body.password = password;
  const data = await authApi.post('/auth/shop-login', { body });
  await saveSession(data);
  return data;
}

/** Request the dev OTP for a shop mobile (returns it in `devOtp` until a real SMS gateway is wired up). */
export async function requestShopLoginOtp(mobile) {
  return await authApi.post('/auth/shop-login/request-otp', { body: { mobile } });
}

/**
 * Request a login / password-reset OTP. Email identifiers get a generated
 * 6-digit code emailed via Resend; mobile identifiers use the default 123456.
 * Returns { channel: 'EMAIL'|'MOBILE', sent, target, ttlMinutes?, devOtp?, defaultOtp?, email }.
 * The wire field is `email` but accepts an email OR a mobile number.
 */
export async function requestOtp(identifier) {
  return await authApi.post('/auth/otp/send', { body: { email: identifier } });
}

/**
 * Verify the OTP and set a new password. On success the server returns a fresh
 * login session (LoginResponse) which we persist — the caller routes via onLogin.
 */
export async function resetPassword({ identifier, otp, newPassword }) {
  const data = await authApi.post('/auth/forgot-password/reset', {
    body: { email: identifier, otp, password: newPassword },
  });
  await saveSession(data);
  return data;
}

export async function switchShop(shopId) {
  const data = await authApi.post('/auth/switch-shop', { body: { shopId } });
  await saveSession(data);
  // Keep Redux's active-shop pointer in lockstep with the persisted session so
  // every `selectShopId` consumer (pickup slots, KYC, new booking, payslips…)
  // targets the newly selected shop instead of the boot-time one.
  store.dispatch(setActiveShop({ shopId: data.shopId, shopSlug: data.shopSlug }));
  return data;
}

/**
 * Fetch the current authenticated owner's full profile + locations from
 * /auth/me, then merge non-secret fields into the persisted session so
 * subsequent screen reads see live data (shopName, shops list, phone,
 * avatar, structured address, etc.). Returns the /auth/me payload.
 *
 * Heals old sessions taken before LoginResponse added shopName/shops.
 */
export async function fetchMe() {
  const me = await authApi.get('/auth/me');
  if (!me || !me.id) return me;
  const prev = (await getSession()) || {};
  // SHOP-scoped sessions (shop-mobile login) must stay locked to the original
  // shopId — never replace the shops list with the owner's full location set,
  // even if /auth/me returns them. Keeping the lock here so screens like the
  // dashboard see only the one shop and the switcher stays hidden.
  const shopScoped = prev.loginScope === 'SHOP';
  const locations = me.locations || [];
  const activeShop = shopScoped
    ? locations.find((s) => s.id === prev.shopId) || null
    : locations.find((s) => s.id === prev.shopId) || locations[0] || null;
  const merged = {
    ...prev,
    userId: me.id,
    name: me.name ?? prev.name,
    email: me.email ?? prev.email,
    phone: me.phone ?? prev.phone,
    secondaryMobile: me.secondaryMobile ?? prev.secondaryMobile,
    avatarUrl: me.avatarUrl ?? prev.avatarUrl,
    idProofUrl: me.idProofUrl ?? prev.idProofUrl,
    personalAddress: me.personalAddress ?? prev.personalAddress,
    addrState: me.addrState ?? prev.addrState,
    addrDistrict: me.addrDistrict ?? prev.addrDistrict,
    addrTaluk: me.addrTaluk ?? prev.addrTaluk,
    addrArea: me.addrArea ?? prev.addrArea,
    addrStreet: me.addrStreet ?? prev.addrStreet,
    addrPincode: me.addrPincode ?? prev.addrPincode,
    emailVerified: me.emailVerified,
    isActive: me.isActive,
    roles: me.role ? [me.role] : (prev.roles || []),
    // `frontImageUrl` is carried through here (was previously dropped) so a
    // consumer that falls back to `shops.find(...)` instead of the richer
    // `activeShop` object below still gets the shop photo — ShopSummary
    // already declares this field, this mapping just wasn't filling it in.
    shops: shopScoped
      ? (activeShop
          ? [{ id: activeShop.id, name: activeShop.name, slug: activeShop.slug, isActive: true, frontImageUrl: activeShop.frontImageUrl }]
          : (prev.shops || []))
      : locations.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          isActive: activeShop ? s.id === activeShop.id : false,
          frontImageUrl: s.frontImageUrl,
        })),
    shopId: activeShop ? activeShop.id : prev.shopId,
    shopName: activeShop ? activeShop.name : prev.shopName,
    // Keep the slug in lock-step with shopId. Omitting it here let a recomputed
    // active shop push a new shopId while Redux kept the stale boot-time slug,
    // desyncing every slug-based consumer from selectShopId on multi-shop owners.
    shopSlug: activeShop ? activeShop.slug : prev.shopSlug,
    activeShop, // full active shop object: mobile, address, etc.
  };
  await saveSession(merged);
  // /auth/me recomputes the active shop (e.g. after a switch); mirror it into
  // Redux so screens driven by `selectShopId` stay shop-accurate.
  store.dispatch(setActiveShop({ shopId: merged.shopId, shopSlug: merged.shopSlug }));
  return merged;
}

export async function logout() {
  await clearSession();
}

/**
 * Add another business location under the current owner ("Add Shop").
 *
 * Only `name` is mandatory server-side — the slug is derived from it (and
 * de-duplicated), and the new shop is created active with the default
 * 123456 mobile OTP so it can be reached by shop-mobile login straight away.
 *
 * The server also enforces the subscription's shop allowance here, so a plan
 * that is out of shops rejects with a human-readable message the caller should
 * surface as-is rather than swallow.
 *
 * Returns the refreshed ShopOwnerView — `locations` contains every shop the
 * owner has, the new one included, which is how the caller learns its id.
 */
export async function createOwnerShop(ownerId, location) {
  return await authApi.post(`/auth/shop-owners/${ownerId}/locations`, { body: location });
}

/**
 * Update one of the current owner's shops. PATCH semantics — only the fields
 * you include are written; everything else is preserved server-side.
 * Returns the refreshed ShopOwnerView (same shape as GET /auth/shop-owners/{id}).
 */
export async function updateOwnerShop(ownerId, shopId, patch) {
  return await authApi.patch(`/auth/shop-owners/${ownerId}/locations/${shopId}`, { body: patch });
}

/**
 * Update the current owner's own profile (name, email, phone, secondary mobile,
 * avatar, personal address…). PATCH semantics — only the non-null fields you
 * include are applied. Returns the refreshed ShopOwnerView.
 */
export async function updateOwnerProfile(ownerId, patch) {
  return await authApi.patch(`/auth/shop-owners/${ownerId}`, { body: patch });
}
