// Jobs → Receipt: send the booking's WhatsApp confirmation to the customer.
//
// The same message the server sends automatically after a booking is saved
// (approved template "neargfix_booking_confirmed" with the receipt image,
// through BotBee) — the app only asks ticket-service to (re)send it:
// POST /tickets/{id}/whatsapp/resend. Nothing is sent from the phone itself.
import { ticketApi } from '../api/client';
import { notify } from '../components/confirm';

const inFlight = new Set(); // ticket ids — a double tap sends once

export async function sendBookingConfirmation(booking) {
  const id = booking?.id;
  if (!id || inFlight.has(id)) return;
  inFlight.add(id);
  const who = booking.customerName || 'The customer';
  try {
    await ticketApi.post(`/tickets/${id}/whatsapp/resend`);
    notify('Sent to WhatsApp', `${who} will receive the booking confirmation and receipt on WhatsApp in a moment.`, { preset: 'done' });
  } catch (e) {
    notify('Could not send', e?.message || 'Please try again.', { preset: 'error' });
  } finally {
    inFlight.delete(id);
  }
}
