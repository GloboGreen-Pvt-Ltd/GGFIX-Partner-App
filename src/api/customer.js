import { userApi } from './client';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

// Profile
export async function getProfile() {
  return await userApi.get('/customer/profile');
}
export async function updateProfile(payload) {
  return await userApi.put('/customer/profile', { body: payload });
}

// Addresses
export async function listAddresses() {
  return unwrap(await userApi.get('/customer/addresses'));
}
export async function createAddress(payload) {
  return await userApi.post('/customer/addresses', { body: payload });
}
export async function updateAddress(id, payload) {
  return await userApi.put(`/customer/addresses/${id}`, { body: payload });
}
export async function deleteAddress(id) {
  return await userApi.del(`/customer/addresses/${id}`);
}
export async function setDefaultAddress(id) {
  return await userApi.post(`/customer/addresses/${id}/default`);
}

// Devices
export async function listSavedDevices({ categoryCode } = {}) {
  return unwrap(await userApi.get('/customer/devices', {
    query: categoryCode ? { categoryCode } : undefined,
  }));
}
export async function createSavedDevice(payload) {
  return await userApi.post('/customer/devices', { body: payload });
}
export async function updateSavedDevice(id, payload) {
  return await userApi.put(`/customer/devices/${id}`, { body: payload });
}
export async function deleteSavedDevice(id) {
  return await userApi.del(`/customer/devices/${id}`);
}
export async function setDefaultSavedDevice(id) {
  return await userApi.post(`/customer/devices/${id}/default`);
}
