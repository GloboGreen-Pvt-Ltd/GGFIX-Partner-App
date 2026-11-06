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

// Shop quote on a customer's marketplace sell request ("Customer Sell Leads").
// The server links (or creates) the customer's sell order; the customer sees
// the quote in their sell order. A second submit revises this shop's quote.
// Servers without the endpoint answer 404 "No handler…" → SERVER_UPDATE_REQUIRED.
function leadQuoteError(e) {
  if (e?.status === 404 && /no handler/i.test(`${e?.devMessage || ''}`)) {
    const err = new Error('Sending quotes needs the latest NearGFix server update. Ask your admin to deploy the order service.');
    err.code = 'SERVER_UPDATE_REQUIRED';
    return err;
  }
  return e;
}
export async function getMyLeadQuote(listingId) {
  try { return await orderApi.get(`/sell-orders/listing-quotations/${listingId}`); } catch (e) { throw leadQuoteError(e); }
}
export async function submitLeadQuote({ listingId, quotationPrice, note, fulfilment }) {
  try {
    return await orderApi.post('/sell-orders/listing-quotations', { body: { listingId, quotationPrice, note: note || null, fulfilment } });
  } catch (e) { throw leadQuoteError(e); }
}
// Purchase Orders from customer sell leads: sell orders whose quote the
// customer accepted (sell_orders.shop_id = this shop). SELL_CONFIRMED →
// PICKUP_SCHEDULED → COMPLETED. Older servers answer 404 "No handler…", or 500
// "Failed to convert" where the path hits GET /sell-orders/{id}.
function purchaseError(e) {
  const dev = `${e?.devMessage || ''}`;
  if ((e?.status === 404 && /no handler|no static resource/i.test(dev)) || (e?.status === 500 && /MethodArgumentTypeMismatch|failed to convert|no static resource|no handler/i.test(dev))) {
    const err = new Error('Purchase orders from customer leads need the latest NearGFix server update. Ask your admin to deploy the order service.');
    err.code = 'SERVER_UPDATE_REQUIRED';
    return err;
  }
  return e;
}
export async function listShopPurchases() {
  try { return unwrap(await orderApi.get('/sell-orders/shop-purchases')); } catch (e) { throw purchaseError(e); }
}
export async function getShopPurchase(id) {
  try { return await orderApi.get(`/sell-orders/shop-purchases/${id}`); } catch (e) { throw purchaseError(e); }
}
/** pickupDate 'YYYY-MM-DD', slotStart / slotEnd 'HH:mm'. */
export async function scheduleShopPurchase(id, { pickupDate, slotStart, slotEnd }) {
  try { return await orderApi.post(`/sell-orders/shop-purchases/${id}/schedule`, { body: { pickupDate, slotStart, slotEnd } }); } catch (e) { throw purchaseError(e); }
}
export async function completeShopPurchase(id) {
  try { return await orderApi.post(`/sell-orders/shop-purchases/${id}/complete`); } catch (e) { throw purchaseError(e); }
}
// Purchase workflow steps (each returns the updated purchase detail).
const purchaseStep = (id, step, body) => orderApi.post(`/sell-orders/shop-purchases/${id}/${step}`, body ? { body } : undefined).catch((e) => { throw purchaseError(e); });
/** Pickup person = a technicians.id of this shop (Employee App). */
export const assignPurchasePickup = (id, technicianId) => purchaseStep(id, 'assign', { technicianId });
/** Pickup handover: { imei, orderVerified, conditionVerified } — the server checks the IMEI against the doorstep inspection. */
export const receivePurchaseDevice = (id, handover) => purchaseStep(id, 'receive', handover);
export const setPurchaseFulfilment = (id, fulfilment) => purchaseStep(id, 'fulfilment', { fulfilment });
/** { imei | serial, modelVerified, condition, checks: {key: bool}, photos: [url], notes } */
export const savePurchaseInspection = (id, inspection) => purchaseStep(id, 'inspection', inspection);
export const confirmPurchasePrice = (id) => purchaseStep(id, 'price/confirm');
export const revisePurchasePrice = (id, { amount, reason }) => purchaseStep(id, 'price/revise', { amount, reason });
/** method UPI | BANK; the customer confirms receipt before it counts as paid. */
export const recordPurchasePayout = (id, { method, account, reference }) => purchaseStep(id, 'payout', { method, account, reference });
export const cancelShopPurchase = (id, reason) => purchaseStep(id, 'cancel', { reason });
/** The pickup person's revised price from the doorstep inspection (Employee App): the owner decides first, then the customer. */
export const approvePickupRevision = (id) => purchaseStep(id, 'pickup-revision/approve');
export const rejectPickupRevision = (id, reason) => purchaseStep(id, 'pickup-revision/reject', { reason });
/** Doorstep price after the inspection: keep the quote (the employee may pay), set the owner's price (the customer accepts it), or ask for a re-check. */
export const confirmPickupQuote = (id) => purchaseStep(id, 'pickup-price/confirm');
export const revisePickupPrice = (id, { amount, reason }) => purchaseStep(id, 'pickup-price/revise', { amount, reason });
export const requestPickupReinspection = (id, reason) => purchaseStep(id, 'pickup-reinspect', { reason });
/** The shop's stock (inventory_items) via order-service, read-only — used while inventory-service has no endpoints. */
export async function listShopInventory() {
  try { return unwrap(await orderApi.get('/sell-orders/shop-purchases/inventory')); } catch (e) { throw purchaseError(e); }
}
/** Every quote this shop sent on customer sell leads: [{ listingId, quotationStatus, quotationPrice, orderStatus }]. */
export async function listMyLeadQuotes() {
  try { return unwrap(await orderApi.get('/sell-orders/listing-quotations/mine')); } catch (e) { throw leadQuoteError(e); }
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
