import { orderApi, ticketApi } from './client';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

// Unified order list (Buy / Sell / Pickup / Enquiry / Repair tabs)
export async function listMyOrders({ orderType, status } = {}) {
  return unwrap(await orderApi.get('/customer-orders', { query: { orderType, status } }));
}
export async function getMyOrder(id) {
  return await orderApi.get(`/customer-orders/${id}`);
}
// Checkout the cart into a BUY order (shows in My Orders → Buy tab).
export async function createBuyOrder({ items, totalAmount }) {
  return await orderApi.post('/customer-orders/buy', { body: { items, totalAmount } });
}

// Customer-side ticket read. Used by the My Orders → Service tab → View Details
// flow when the row is shop-created (payload.ticketId set). Backend masks the
// device security value before returning. skipAuthExpiry mirrors getRepairBooking
// so a 403 here doesn't bounce the customer to Login.
export async function getServiceTicket(id) {
  return await ticketApi.get(`/tickets/customer/${id}`, { skipAuthExpiry: true });
}

// Repair bookings
export async function createRepairBooking(payload) {
  return await orderApi.post('/repair-bookings', { body: payload });
}
export async function listRepairBookings(status) {
  return unwrap(await orderApi.get('/repair-bookings', { query: status ? { status } : undefined }));
}
export async function getRepairBooking(id) {
  return await orderApi.get(`/repair-bookings/${id}`);
}
export async function updateRepairBookingStatus(id, status) {
  return await orderApi.patch(`/repair-bookings/${id}/status`, { query: { status } });
}
export async function rescheduleRepairBooking(id, payload) {
  return await orderApi.post(`/repair-bookings/${id}/reschedule`, { body: payload });
}

// Shop/owner side: list the shop's customer repair bookings and post a
// service-timeline status the customer's History screen renders.
export async function listShopRepairBookings() {
  return unwrap(await orderApi.get('/repair-bookings/shop'));
}
export async function getShopRepairBooking(id) {
  return await orderApi.get(`/repair-bookings/shop/${id}`);
}
export async function postShopBookingStatus(id, payload) {
  return await orderApi.post(`/repair-bookings/${id}/shop-status`, { body: payload });
}
export async function confirmShopRepairBooking(id) {
  return await orderApi.post(`/repair-bookings/${id}/confirm-order`);
}
export async function assignPickupPerson(id, { pickupPersonId, pickupPersonName, pickupPersonPhone } = {}) {
  return await orderApi.post(`/repair-bookings/${id}/assign-pickup`, {
    body: { pickupPersonId, pickupPersonName, pickupPersonPhone },
  });
}
// Shop staff confirms a Reached-Shop pickup booking — physical hand-off.
// Hits ticket-service (where the pickup state machine lives) and returns
// { id, status, ticketId, receivedByName, ... }. Idempotent: re-tapping
// after the device was already received is a no-op success.
export async function markPickupReceivedAtShop(id, { receivedByName } = {}) {
  return await ticketApi.post(`/shop/pickup-bookings/${id}/receive-at-shop`, {
    body: { receivedByName },
  });
}
export async function cancelRepairBooking(id) {
  return await orderApi.post(`/repair-bookings/${id}/cancel`);
}
export async function approveRepairBooking(id) {
  return await orderApi.post(`/repair-bookings/${id}/customer-approval`);
}

// Sell orders
export async function createSellOrder(payload) {
  return await orderApi.post('/sell-orders', { body: payload });
}
export async function listSellOrders() {
  return unwrap(await orderApi.get('/sell-orders'));
}
export async function getSellOrder(id) {
  return await orderApi.get(`/sell-orders/${id}`);
}
export async function getSellOrderQuotations(id) {
  return unwrap(await orderApi.get(`/sell-orders/${id}/quotations`));
}
export async function chooseSellQuotation(id, quotationId) {
  return await orderApi.post(`/sell-orders/${id}/choose-quotation`, { body: { quotationId } });
}
export async function updateSellOrder(id, payload) {
  return await orderApi.put(`/sell-orders/${id}`, { body: payload });
}
export async function cancelSellOrder(id) {
  return await orderApi.post(`/sell-orders/${id}/cancel`);
}
