// Guarded loader for react-native-razorpay. The package builds a
// NativeEventEmitter the moment it is required, which throws on Expo Go or on
// a dev/store build compiled before the package was added. So it is only
// required once its native module is confirmed present.
import { Linking, NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { SHOP_WEB_SUBSCRIPTION_URL } from '../api/config';

let cached;

function nativePresent(name) {
  try {
    if (TurboModuleRegistry?.get?.(name)) return true;
  } catch (_) { /* not a TurboModule here */ }
  return !!NativeModules?.[name];
}

/** The RazorpayCheckout class, or null when the native SDK is not in this build. */
export function getRazorpay() {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return cached;
  // Android registers only RNRazorpayCheckout (events arrive via
  // DeviceEventEmitter); RazorpayEventEmitter is an iOS-only module.
  if (!nativePresent('RNRazorpayCheckout')) return cached;
  if (Platform.OS === 'ios' && !nativePresent('RazorpayEventEmitter')) return cached;
  try {
    const mod = require('react-native-razorpay');
    const Checkout = mod?.default || mod;
    cached = typeof Checkout?.open === 'function' ? Checkout : null;
  } catch (_) {
    cached = null;
  }
  return cached;
}

/**
 * In-app payment is allowed only when the server enables this platform's
 * channel AND Razorpay is configured AND the native SDK is in this build.
 */
export function inAppCheckoutStatus(checkout) {
  const platformEnabled = Platform.OS === 'ios'
    ? !!checkout?.iosEnabled
    : Platform.OS === 'android' ? !!checkout?.androidEnabled : false;
  const configured = !!checkout?.configured;
  const native = !!getRazorpay();
  return { available: platformEnabled && configured && native, platformEnabled, configured, native };
}

/** Android only — iOS must never link out to an external purchase. */
export const canLinkToShopWeb = () => Platform.OS === 'android';

export function openShopWebSubscription() {
  if (!canLinkToShopWeb()) return Promise.resolve(false);
  return Linking.openURL(SHOP_WEB_SUBSCRIPTION_URL).then(() => true, () => false);
}

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

/**
 * Open checkout with the server's payload from POST /payment/order.
 * Resolves { ok:true, data:{ razorpay_payment_id, razorpay_order_id, razorpay_signature } }
 * or { ok:false, error:{ code, description, cancelled } }. Never rejects.
 * A success here is NOT a paid order — the caller must verify with the server.
 */
export async function openRazorpayCheckout(p) {
  const Checkout = getRazorpay();
  if (!Checkout) return { ok: false, error: { code: 'UNAVAILABLE', description: 'In-app payment is not available.' } };
  const options = clean({
    key: p?.keyId,
    order_id: p?.razorpayOrderId,
    amount: p?.amount,
    currency: p?.currency || 'INR',
    name: p?.name || 'NearGFix',
    description: p?.description,
    prefill: p?.prefill ? clean(p.prefill) : undefined,
    notes: p?.notes,
    // Server-owned UPI-only method set and display config.
    method: p?.checkout?.method,
    config: p?.checkout?.config,
    theme: { color: '#035C6C' },
  });
  try {
    const data = await Checkout.open(options);
    return { ok: true, data: data || {} };
  } catch (e) {
    const description = String(e?.description || e?.error?.description || e?.message || '');
    let reason = '';
    try { reason = String(JSON.parse(description)?.error?.reason || ''); } catch (_) { /* plain text */ }
    // Android PAYMENT_CANCELED = 0, iOS cancelled = 2; also match the text.
    const code = e?.code;
    const cancelled = /cancel|dismiss/i.test(`${description} ${reason}`)
      || (Platform.OS === 'android' ? code === 0 : code === 2);
    return { ok: false, error: { code, description, cancelled } };
  }
}
