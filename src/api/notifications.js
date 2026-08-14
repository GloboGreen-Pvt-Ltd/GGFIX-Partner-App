import { orderApi } from './client';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

// Shop-owner notification feed — order-service /shop/notifications, scoped by
// the shopId claim on the JWT (NOT /notifications, which is the customer feed
// and rejects shop tokens because it looks up customer_user_id).
export async function listNotifications() {
  return unwrap(await orderApi.get('/shop/notifications'));
}
export async function getUnreadCount() {
  const r = await orderApi.get('/shop/notifications/unread-count');
  return r?.count ?? 0;
}
export async function markNotificationRead(id) {
  return await orderApi.post(`/shop/notifications/${id}/read`);
}
export async function markAllNotificationsRead() {
  return await orderApi.post('/shop/notifications/read-all');
}
