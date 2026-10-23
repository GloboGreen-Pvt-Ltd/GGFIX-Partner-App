import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderApi } from './client';
import { getSession } from '../auth/session';

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

// "Clear" — the feed has no delete endpoint, so clearing remembers the newest
// cleared notification's time (server clock, per shop, on this device) and the
// screen hides everything up to it. Nothing is deleted on the server.
async function clearedKey() {
  const s = await getSession().catch(() => null);
  return `notifications.clearedAt:${s?.shopId || s?.shop?.id || 'shop'}`;
}
export async function getNotificationsClearedAt() {
  try { return await AsyncStorage.getItem(await clearedKey()); } catch { return null; }
}
export async function setNotificationsClearedAt(iso) {
  try { await AsyncStorage.setItem(await clearedKey(), iso); } catch {}
}
