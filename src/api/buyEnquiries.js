import { marketplaceApi } from './client';
import { requireV2 } from './sellListings';

// Buy side of the marketplace negotiation (contract: docs/SELL-MODULE-API.md,
// /customer/marketplace/*): this shop, as a buyer, sends an offer on another
// shop's listing and negotiates it. Servers without the Sell-module update
// throw SERVER_UPDATE_REQUIRED (same probe as the Sell screens).

export async function sendPurchaseOffer(productId, { offerAmount, message, quantity = 1 }) {
  await requireV2('Purchase offers');
  return marketplaceApi.post(`/customer/marketplace/products/${productId}/enquiries`, {
    body: { kind: 'PURCHASE_REQUEST', offerAmount, message: message || null, quantity },
  });
}

export async function listMyOffers() {
  await requireV2('Quotations');
  const data = await marketplaceApi.get('/customer/marketplace/enquiries');
  return Array.isArray(data) ? data : (data?.content || []);
}

export async function getMyOffer(id) {
  await requireV2('Quotations');
  return marketplaceApi.get(`/customer/marketplace/enquiries/${id}`);
}

export async function reviseMyOffer(id, { amount, note }) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/customer/marketplace/enquiries/${id}/offers`, { body: { amount, note: note || null } });
}

export async function acceptShopQuote(id) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/customer/marketplace/enquiries/${id}/accept`);
}

export async function cancelMyOffer(id) {
  await requireV2('Quotations');
  return marketplaceApi.post(`/customer/marketplace/enquiries/${id}/cancel`);
}
