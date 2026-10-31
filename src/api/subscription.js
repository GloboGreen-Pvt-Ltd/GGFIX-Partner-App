// Subscription v2 (shared contract: plans catalog, quotes, Razorpay UPI
// purchase, receipts). Owner = JWT subject — no owner id is ever sent.
// All money is integer paise; format with subscription/format.js.
import { Platform } from 'react-native';
import { subscriptionApi } from './client';

const enc = encodeURIComponent;

/** WEB | ANDROID | IOS — the purchase channel the server checks against its checkout flags. */
export const purchaseChannel = () => (Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB');

/** { plans:[Plan], checkout:{ webEnabled, androidEnabled, iosEnabled, configured }, taxPercent, taxInclusive } */
export const getCatalog = () => subscriptionApi.get('/subscriptions/catalog');

/** { subscription, shops, entitlements, usage, trialAvailable, pendingOrder } */
export const getMySubscription = () => subscriptionApi.get('/subscriptions/me');

/** [{ shopId, name, shopCode, location, coverage:{ status, planName, endsAt }, selectable, reason }] */
export const getEligibleShops = () => subscriptionApi.get('/subscriptions/eligible-shops');

/** Quote for real shops (validates ownership / duplicates). */
export const getQuote = (planCode, shopIds) =>
  subscriptionApi.post('/subscriptions/quote', { body: { planCode, shopIds } });

/** Calculator quote by shop count only (no shops yet). */
export const getQuotePreview = (planCode, shopCount) =>
  subscriptionApi.post('/subscriptions/quote/preview', { body: { planCode, shopCount } });

/** Creates the immutable order (status CREATED). */
export const createPurchase = (planCode, shopIds) =>
  subscriptionApi.post('/subscriptions/purchase', {
    body: { planCode, shopIds, channel: purchaseChannel(), acceptTerms: true },
  });

/** Razorpay order + checkout options for an order. */
export const createPaymentOrder = (orderId) =>
  subscriptionApi.post('/subscriptions/payment/order', { body: { orderId } });

/** Server-side signature + capture check → { order, subscription }. */
export const verifyPayment = ({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) =>
  subscriptionApi.post('/subscriptions/payment/verify', {
    body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
  });

/** Reconciles with Razorpay (activates if paid) → { order }. */
export const getPaymentStatus = (orderId) =>
  subscriptionApi.get(`/subscriptions/payment/status/${enc(orderId)}`);

export const cancelPayment = (orderId, reason) =>
  subscriptionApi.post('/subscriptions/payment/cancel', { body: { orderId, reason } });

export const getPaymentHistory = () => subscriptionApi.get('/subscriptions/payment/history');

export const getReceipt = (paymentId) => subscriptionApi.get(`/subscriptions/receipts/${enc(paymentId)}`);

/** Free trial for the chosen shops → /me payload. */
export const activateTrial = (shopIds) =>
  subscriptionApi.post('/subscriptions/trial/activate', { body: { shopIds } });

/** Order states after which the subscription is (being) activated. */
export const isPaidOrder = (order) => order?.status === 'PAID' || order?.status === 'ACTIVATED';
