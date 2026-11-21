import { ticketApi } from './client';

// Shop presence (ticket-service ShopPresenceController). Owner-only, scoped
// to the caller's shop by the server (JWT shopId) — the app never sends one.
const q = (date) => (date ? `?date=${date}` : '');
export const getShopPresence = (date) => ticketApi.get(`/technicians/presence${q(date)}`);
export const getEmployeePresence = (id, date) => ticketApi.get(`/technicians/${id}/presence${q(date)}`);
export const getPresenceSettings = () => ticketApi.get('/technicians/presence/settings');
export const savePresenceSettings = (body) => ticketApi.put('/technicians/presence/settings', { body });
