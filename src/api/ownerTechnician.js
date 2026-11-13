import { ticketApi } from './client';

/**
 * Owner as Technician (ticket-service /tickets/owner-technician).
 * Shape: { enabled, technicianId, assignedCount, pendingCount, completedCount, allCount, activeCount }.
 * Counts are the owner's OWN technician jobs only.
 */
export const OWNER_TECH_OFF = {
  enabled: false, technicianId: null, assignedCount: 0, pendingCount: 0, completedCount: 0, allCount: 0, activeCount: 0,
};

let cache = null;
const listeners = new Set();

export function cachedOwnerTech() { return cache; }

export function onOwnerTechChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function publish(v) {
  cache = { ...OWNER_TECH_OFF, ...(v || {}) };
  listeners.forEach((fn) => { try { fn(cache); } catch { /* ignore */ } });
  return cache;
}

export async function getOwnerTech() {
  return publish(await ticketApi.get('/tickets/owner-technician'));
}

/** Throws the backend 409 (active jobs remain) when turning OFF. */
export async function setOwnerTech(enabled, name) {
  return publish(await ticketApi.put('/tickets/owner-technician', { body: { enabled, name } }));
}

export const OWNER_TECH_DONE = new Set([
  'READY', 'DELIVERED', 'DELIVERED_PROCESSING', 'DELIVERED_TO_CUSTOMER', 'RETURNED',
  'RETURN_DELIVERY', 'CANCELLED', 'CLOSED', 'COMPLETED',
]);

/** Same buckets as the server counts: assigned (not accepted) · pending (accepted, open) · completed. */
export function ownerJobBucket(t) {
  const st = String(t?.status || '').toUpperCase();
  if (OWNER_TECH_DONE.has(st)) return 'completed';
  return t?.technicianAcceptedAt ? 'pending' : 'assigned';
}

/** The owner's own technician jobs (assignedToMe resolves the owner's technician row). */
export async function listOwnerJobs() {
  const page = await ticketApi.get('/tickets', { query: { assignedToMe: true, page: 0, size: 200, sort: 'createdAt,desc' } });
  return Array.isArray(page?.content) ? page.content : Array.isArray(page) ? page : [];
}

export async function acceptOwnerJob(ticketId) {
  return ticketApi.post(`/tickets/${ticketId}/accept`, {});
}
