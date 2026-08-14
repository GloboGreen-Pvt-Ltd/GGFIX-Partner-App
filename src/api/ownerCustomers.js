import { ticketApi } from './client';

const MIN_SEARCH_LENGTH = 3;

export function normalizeCustomerSearchQuery(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  const letters = raw.replace(/[^A-Za-z]/g, '');

  if (digits.length > 0 && letters.length === 0) {
    if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10);
    return digits;
  }

  return raw.replace(/\s+/g, ' ');
}

export function canSearchCustomers(value) {
  return normalizeCustomerSearchQuery(value).length >= MIN_SEARCH_LENGTH;
}

export async function searchBookingCustomers(value) {
  const query = normalizeCustomerSearchQuery(value);
  if (query.length < MIN_SEARCH_LENGTH) return [];

  try {
    const data = await ticketApi.get('/customers/search', { query: { query } });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error?.status === 404) {
      const data = await ticketApi.get('/customers', { query: { q: query } });
      return Array.isArray(data) ? data : [];
    }
    throw error;
  }
}
