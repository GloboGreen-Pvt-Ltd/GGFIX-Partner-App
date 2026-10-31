// The one money/date formatter for subscription screens. Server amounts are
// integer paise; clients only format, never compute an authoritative amount.

/** 12345 → "₹123.45" (en-IN grouping, always 2 decimals). null/invalid → "—". */
export function formatPaise(paise) {
  const n = Number(paise);
  if (paise === null || paise === undefined || paise === '' || !Number.isFinite(n)) return '—';
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(value)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

/** "6 Months" → "6 months" for "₹1.00 / 6 months". */
export const perTerm = (plan) => {
  const label = plan?.durationLabel
    || (plan?.durationValue ? `${plan.durationValue} ${String(plan.durationUnit || '').toLowerCase()}` : '');
  return label ? label.toLowerCase() : '';
};

/** Human label for server enums (ACTIVE → Active, AWAITING_PAYMENT → Awaiting Payment). */
export const titleCase = (v) => String(v || '')
  .toLowerCase()
  .split('_')
  .filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(' ');

/** Payment method label: "upi" → "UPI". */
export const methodLabel = (m) => {
  const s = String(m || '').trim();
  if (!s) return '—';
  return /^(upi|emi)$/i.test(s) ? s.toUpperCase() : titleCase(s);
};
