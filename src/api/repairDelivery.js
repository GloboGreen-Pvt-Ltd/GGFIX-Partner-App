import { ticketApi } from './client';

// Repair return delivery (ticket-service RepairDeliveryController), shop owner side.
// GET → { eligibility: { ticketStatus, qcPassed, invoice, canSchedule, reasons }, delivery, events }.

const base = (ticketId) => `/tickets/${ticketId}/repair-delivery`;

export const getRepairDelivery = (ticketId) => ticketApi.get(base(ticketId));
/** { date: 'YYYY-MM-DD', slotStart: 'HH:mm', slotEnd: 'HH:mm', technicianId, note } */
export const scheduleRepairDelivery = (ticketId, body) => ticketApi.post(`${base(ticketId)}/schedule`, { body });
export const assignRepairDelivery = (ticketId, technicianId) => ticketApi.post(`${base(ticketId)}/assign`, { body: { technicianId } });
export const rescheduleRepairDelivery = (ticketId, body) => ticketApi.post(`${base(ticketId)}/reschedule`, { body });
/** The shop hands the device to the accepted employee. */
export const releaseRepairDelivery = (ticketId) => ticketApi.post(`${base(ticketId)}/release`);
/** The device is back at the shop after a failed attempt. */
export const receiveRepairReturn = (ticketId) => ticketApi.post(`${base(ticketId)}/receive-return`);
/** Shop employees with an Employee App login (same list as the pickup picker). */
export const listShopEmployees = () => ticketApi.get('/technicians');
