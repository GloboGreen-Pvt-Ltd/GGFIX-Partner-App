// ════════════════════════════════════════════════════════════════════════════
// Revenue helpers — shared by the Home snapshot's Revenue card and the Revenue
// report screen so the headline figure and the report can't drift apart.
//
// Revenue is booked on DELIVERY, not on invoice generation: a device that has
// been handed back is money earned, whereas an invoice on a ticket still in the
// shop is not. The amount per booking mirrors what BillingScreen shows —
// finalPrice when the invoice has settled it, else the estimate.
// ════════════════════════════════════════════════════════════════════════════

export function ticketAmount(t) {
  const v = t?.finalPrice != null ? Number(t.finalPrice) : Number(t?.estimatedPrice);
  return Number.isFinite(v) ? v : 0;
}

// When the money landed. NOTE: TicketResponse carries no delivery timestamp
// today — only createdAt / updatedAt — so in practice this resolves to
// updatedAt, i.e. the last time the ticket changed. For a DELIVERED ticket that
// is the delivery itself unless the row is edited afterwards, which is close
// enough to bucket by day/week/month but is not an exact delivery time. The
// deliveredAt/deliveredOn probes are here so the report sharpens automatically
// if the backend ever exposes one; createdAt is the last resort so a booking is
// never silently dropped from the report.
export function revenueDate(t) {
  return t?.deliveredAt || t?.deliveredOn || t?.updatedAt || t?.createdAt || null;
}

export const isDelivered = (t) => String(t?.status || '').toUpperCase() === 'DELIVERED';

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Week starts Sunday, matching the date-filter chips on the bookings list.
function startOfWeek(now) {
  const s = startOfDay(now);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function sumAmount(tickets) {
  return (tickets || []).reduce((sum, t) => sum + ticketAmount(t), 0);
}

// Today / this week / this month / all-time totals over delivered bookings.
export function revenueBuckets(tickets, now = new Date()) {
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const out = { today: 0, week: 0, month: 0, all: 0 };
  for (const t of tickets || []) {
    const amount = ticketAmount(t);
    out.all += amount;
    const d = revenueDate(t);
    if (!d) continue;
    const date = new Date(d);
    if (isNaN(date.getTime())) continue;
    if (date >= today) out.today += amount;
    if (date >= week) out.week += amount;
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) out.month += amount;
  }
  return out;
}

// Just the headline the Home card shows.
export function monthRevenue(tickets, now = new Date()) {
  return revenueBuckets(tickets, now).month;
}

// Day-by-day breakdown, newest day first, each with its own total.
export function groupRevenueByDay(tickets) {
  const groups = new Map();
  for (const t of tickets || []) {
    const d = revenueDate(t);
    const date = d ? new Date(d) : null;
    const valid = date && !isNaN(date.getTime());
    const key = valid ? startOfDay(date).toISOString() : 'unknown';
    if (!groups.has(key)) groups.set(key, { key, date: valid ? startOfDay(date) : null, items: [], total: 0 });
    const g = groups.get(key);
    g.items.push(t);
    g.total += ticketAmount(t);
  }
  const arr = Array.from(groups.values());
  arr.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
  arr.forEach((g) => g.items.sort((a, b) => new Date(revenueDate(b) || 0) - new Date(revenueDate(a) || 0)));
  return arr;
}

export function formatMoney(n) {
  const v = Number(n) || 0;
  return `₹ ${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function dayLabel(date) {
  if (!date) return 'Unknown date';
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
