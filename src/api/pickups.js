import { pickupApi } from './client';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

export async function createPickup(payload) {
  return await pickupApi.post('/pickups', { body: payload });
}
export async function listPickups(status) {
  return unwrap(await pickupApi.get('/pickups', { query: status ? { status } : undefined }));
}
export async function listShopPickups(status) {
  return unwrap(await pickupApi.get('/pickups/shop', { query: status ? { status } : undefined }));
}
export async function getPickup(id) {
  return await pickupApi.get(`/pickups/${id}`);
}
export async function getShopPickup(id) {
  return await pickupApi.get(`/pickups/shop/${id}`);
}
export async function updatePickupStatus(id, status) {
  return await pickupApi.patch(`/pickups/${id}/status`, { query: { status } });
}
export async function reschedulePickup(id, payload) {
  return await pickupApi.post(`/pickups/${id}/reschedule`, { body: payload });
}
export async function cancelPickup(id) {
  return await pickupApi.post(`/pickups/${id}/cancel`);
}
