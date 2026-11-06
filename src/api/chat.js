import { marketplaceApi } from './client';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

// Shop-side chat API. Mirrors the customer app's /customer/chats surface so
// both sides see the same WhatsApp-style thread shape.
//
// Backed by marketplace-service (port 8087):
//   GET   /shop/chats
//   GET   /shop/chats/{threadId}
//   GET   /shop/chats/{threadId}/messages
//   POST  /shop/chats/{threadId}/messages   { body, attachmentUrl?, attachmentType? }
//   POST  /shop/chats/{threadId}/read       (zero my unread, mark counterpart's msgs read)
//   POST  /shop/chats/{threadId}/typing     { typing: true|false }
//   POST  /shop/chats/presence              (ping last_seen_at)

export async function listShopChats() {
  return unwrap(await marketplaceApi.get('/shop/chats'));
}

// Chat with the customer behind a sell lead (POST /shop/chats/listing/{id});
// allowed once this shop has quoted on it. Older servers answer 404 / 500
// "No static resource".
export async function openShopChatForListing(listingId) {
  try {
    return await marketplaceApi.post(`/shop/chats/listing/${listingId}`);
  } catch (e) {
    if ((e?.status === 404 || e?.status === 500) && /no handler|no static resource/i.test(`${e?.devMessage || ''}`)) {
      const err = new Error('Chat from leads needs the latest NearGFix server update. Ask your admin to deploy the marketplace service.');
      err.code = 'SERVER_UPDATE_REQUIRED';
      throw err;
    }
    throw e;
  }
}

export async function getShopChat(threadId) {
  return await marketplaceApi.get(`/shop/chats/${threadId}`);
}

export async function getShopChatMessages(threadId) {
  return unwrap(await marketplaceApi.get(`/shop/chats/${threadId}/messages`));
}

export async function sendShopChatMessage(threadId, { body, attachmentUrl, attachmentType } = {}) {
  return await marketplaceApi.post(`/shop/chats/${threadId}/messages`, {
    body: { body, attachmentUrl, attachmentType },
  });
}

export async function markShopChatRead(threadId) {
  return await marketplaceApi.post(`/shop/chats/${threadId}/read`, { body: {} });
}

export async function pingShopTyping(threadId, typing) {
  return await marketplaceApi.post(`/shop/chats/${threadId}/typing`, { body: { typing: !!typing } });
}

export async function pingShopPresence() {
  return await marketplaceApi.post('/shop/chats/presence', { body: {} });
}
