// In-app "this ticket changed" signal. A screen that edits a ticket elsewhere
// (e.g. Technician Assign) tells any open Booking Details to update at once,
// without waiting for a focus reload.
const listeners = new Set();

export function onTicketUpdated(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitTicketUpdated(ticketId, patch = {}) {
  listeners.forEach((fn) => { try { fn(ticketId, patch); } catch (_) {} });
}
