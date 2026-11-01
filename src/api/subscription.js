// Subscription v2 (shared contract: plans catalog, quotes, Razorpay UPI
// purchase, receipts). Owner = JWT subject — no owner id is ever sent.
// All money is integer paise; format with subscription/format.js.
import { Platform } from 'react-native';
import { cacheDirectory, deleteAsync, downloadAsync } from 'expo-file-system/legacy';
import { subscriptionApi } from './client';
import { getToken } from '../auth/session';

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

/* ── Invoices (one per captured payment). Optional: an older server answers
   404/405 here, and every caller then hides the invoice UI. ── */

/** InvoiceView[] for this owner, newest first. */
export const getInvoices = () => subscriptionApi.get('/subscriptions/invoices');

export const getInvoice = (invoiceId) => subscriptionApi.get(`/subscriptions/invoices/${enc(invoiceId)}`);

/** InvoiceView for an order — 404 until the invoice is issued. */
export const getInvoiceByOrder = (orderId) =>
  subscriptionApi.get(`/subscriptions/invoices/by-order/${enc(orderId)}`);

/** Re-send the invoice on WhatsApp → InvoiceView (409 unless whatsapp.canRetry). */
export const retryInvoiceWhatsapp = (invoiceId) =>
  subscriptionApi.post(`/subscriptions/invoices/${enc(invoiceId)}/whatsapp/retry`);

/** "NGF/26-27/00001" → "NGF-26-27-00001" (the server's own PDF filename). */
export const invoiceFileStem = (inv) =>
  String(inv?.invoiceNo || inv?.id || 'NearGFix-Invoice').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'NearGFix-Invoice';

/** Download the server PDF (same Bearer token as the API client) into the cache → local file uri. */
export async function downloadInvoicePdf(invoiceId, stem) {
  const token = await getToken();
  const fileUri = `${cacheDirectory}${stem}.pdf`;
  await deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  const res = await downloadAsync(subscriptionApi.url(`/subscriptions/invoices/${enc(invoiceId)}/pdf`), fileUri, {
    headers: { Accept: 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res || res.status < 200 || res.status >= 300) {
    await deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    const err = new Error(res?.status === 404 ? 'The invoice PDF is not available yet.' : 'Could not download the invoice. Please try again.');
    err.status = res?.status ?? 0;
    throw err;
  }
  return res.uri;
}

/** Order states after which the subscription is (being) activated. */
export const isPaidOrder = (order) => order?.status === 'PAID' || order?.status === 'ACTIVATED';
