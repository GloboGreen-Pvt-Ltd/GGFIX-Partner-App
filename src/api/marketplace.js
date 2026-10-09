import { marketplaceApi } from './client';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

// Products (public browse)
export async function listProducts({ type, status = 'ACTIVE', modelId, q } = {}) {
  return unwrap(await marketplaceApi.get('/marketplace/products', { query: { type, status, modelId, q } }));
}
export async function getProduct(id) {
  return await marketplaceApi.get(`/marketplace/products/${id}`);
}

// Buy/Sell board (peer marketplace listings)
export async function createListing(payload) {
  return await marketplaceApi.post('/marketplace/listings', { body: payload });
}

// Cart
export async function getCart() {
  return unwrap(await marketplaceApi.get('/customer/cart'));
}
export async function addToCart(productId, quantity = 1) {
  return await marketplaceApi.post('/customer/cart', { body: { productId, quantity } });
}
export async function updateCartItem(itemId, quantity) {
  return await marketplaceApi.put(`/customer/cart/${itemId}`, { body: { quantity } });
}
export async function removeCartItem(itemId) {
  return await marketplaceApi.del(`/customer/cart/${itemId}`);
}
export async function clearCart() {
  return await marketplaceApi.del('/customer/cart');
}

// Chats
export async function listChats() {
  return unwrap(await marketplaceApi.get('/customer/chats'));
}
export async function openChat(shopId) {
  return await marketplaceApi.post('/customer/chats', { query: { shopId } });
}
export async function getChatMessages(threadId) {
  return unwrap(await marketplaceApi.get(`/customer/chats/${threadId}/messages`));
}
export async function sendChatMessage(threadId, body, attachmentUrl) {
  return await marketplaceApi.post(`/customer/chats/${threadId}/messages`, { body: { body, attachmentUrl } });
}
