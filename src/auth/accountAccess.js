// Who may use the Near G Fix Partner app — strictly the shop owner (owner
// login) and the shop itself (shop-mobile login). auth-service's loginType is
// SHOP_OWNER | SHOP_LOGIN | EMPLOYEE | SUPER_ADMIN | MARKET_PERSON
// (AuthService.loginTypeForRole): every employee role — technician, staff,
// pickup person — arrives as EMPLOYEE and is refused here, like the admins.
// Employees use the Near G Fix Employee app; admins the admin web.

const ALLOWED_LOGIN_TYPES = ['SHOP_OWNER', 'SHOP_LOGIN'];

export const PARTNER_ONLY_MESSAGE =
  'Only shop owners and shop logins can use the Near G Fix Partner app. Employees should sign in from the Near G Fix Employee app.';

/**
 * The loginType /auth/otp/send reports for a number (newer servers), checked on
 * the mobile step so an employee is turned away before any OTP. Unknown
 * (older server, no field) → allowed here; the session check after the OTP
 * still applies.
 */
export function isPartnerLoginType(loginType) {
  const t = String(loginType || '').trim().toUpperCase();
  return !t || ALLOWED_LOGIN_TYPES.includes(t);
}

/** true only for a shop-owner or shop-login session. */
export function isPartnerAccount(session) {
  if (!session?.accessToken) return false;
  const loginType = String(session.loginType || '').trim().toUpperCase();
  if (loginType) return ALLOWED_LOGIN_TYPES.includes(loginType);
  // Sessions saved before the server sent loginType: the owner role alone.
  const roles = (Array.isArray(session.roles) ? session.roles : []).map((r) => String(r).toUpperCase());
  return roles.includes('SHOP_OWNER');
}
