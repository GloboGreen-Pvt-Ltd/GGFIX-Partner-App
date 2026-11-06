import { marketplaceApi, ticketApi } from './client';

// Fixed-price customer Buy orders for this shop (marketplace-service
// FixedPriceOrderService). One order id shared with the Customer and Staff apps.

export const BUY_ORDER_STATUS = {
  PLACED: { label: 'New order', tone: 'amber' },
  CONFIRMED: { label: 'Confirmed', tone: 'teal' },
  ASSIGNED: { label: 'Employee assigned', tone: 'teal' },
  ACCEPTED: { label: 'Employee accepted', tone: 'teal' },
  PICKED_UP: { label: 'Picked up from shop', tone: 'teal' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'teal' },
  DELIVERED: { label: 'Delivered', tone: 'green' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  DELIVERY_FAILED: { label: 'Delivery failed', tone: 'red' },
  RETURNED: { label: 'Returned to shop', tone: 'grey' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  CANCELLED: { label: 'Cancelled', tone: 'grey' },
};

export const BUY_ORDER_TABS = [
  { key: 'NEW', label: 'New', statuses: ['PLACED'] },
  { key: 'ACTIVE', label: 'Confirmed', statuses: ['CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'] },
  { key: 'DONE', label: 'Completed', statuses: ['DELIVERED', 'COMPLETED'] },
  { key: 'CLOSED', label: 'Closed', statuses: ['REJECTED', 'CANCELLED', 'RETURNED'] },
];

export const listShopBuyOrders = () => marketplaceApi.get('/shop/buy-orders');
export const getShopBuyOrder = (id) => marketplaceApi.get(`/shop/buy-orders/${id}`);

// action: confirm | reject | assign | handover | return-received
export const shopBuyOrderAction = (id, action, body = {}) =>
  marketplaceApi.post(`/shop/buy-orders/${id}/${action}`, { body });

// Shop employees that can be assigned (server re-checks they belong to the shop).
export async function listAssignableStaff() {
  const list = await ticketApi.get('/technicians');
  return (Array.isArray(list) ? list : [])
    .filter((t) => t?.userId && t?.isActive !== false && t?.active !== false)
    .map((t) => ({ userId: t.userId, name: t.name || t.fullName || 'Employee', phone: t.phone || t.mobile || '' }));
}
