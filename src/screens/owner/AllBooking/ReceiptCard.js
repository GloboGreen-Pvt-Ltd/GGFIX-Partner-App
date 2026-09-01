// Printable booking receipt, shared by the screens that can share one.
//
// Lifted out of TicketDetailScreen so the Bookings list can share the exact
// same receipt from its action sheet — two copies of this markup would drift
// the moment either side gained a field.
//
// Rendered off-screen inside a <ViewShot> and captured to PNG; it is never
// laid out as a visible part of any screen. Everything here is plain inline
// styles on purpose: NativeWind classes are not applied reliably inside a
// collapsable={false} view-shot subtree.
import React from 'react';
import { Text, View } from 'react-native';

const BRAND_GREEN_DARK = '#087A0A';

const STATUS_LABEL = {
  CREATED: 'Service Accepted',
  ASSIGNED: 'Technician Assigned',
  IN_DIAGNOSIS: 'In Diagnosis',
  IN_REPAIR: 'In Service',
  QUOTED: 'Re-Estimated',
  APPROVED: 'Approved',
  READY: 'Ready for Delivery',
  RETURN_DELIVERY: 'Return Delivery',
  INVOICE_GENERATED: 'Billing & Delivery Invoice Generated',
  INVOICE_READY: 'Invoice Sent',
  DELIVERED_PROCESSING: 'Delivery Processing',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

// Services + prices come back three different ways depending on how the ticket
// was created (wizard, pickup conversion, legacy import) — normalise them.
export function priceItemsFromTicket(ticket) {
  if (!ticket) return [];
  if (Array.isArray(ticket.priceItems)) return ticket.priceItems;
  if (ticket.priceItemsJson) {
    try {
      const parsed = JSON.parse(ticket.priceItemsJson);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return ticket.services?.map?.((s) => ({ id: s.id, label: s.serviceName, amount: s.price })) || [];
}

// An explicit estimatedPrice always wins; otherwise sum the line items.
export function estimatedTotalOf(ticket, lineItems) {
  if (!ticket) return 0;
  if (ticket.estimatedPrice != null) return ticket.estimatedPrice;
  const items = lineItems || priceItemsFromTicket(ticket);
  return items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
}

// Payment as the Price Summary sections need it, read from the API response —
// tickets.payment_type / payment_amount / balance_amount, never from local
// screen state, so it survives a refresh, a re-login, and reopening the booking.
//
// Returns null when nothing was collected. That null is what keeps the payment
// rows off a pay-on-delivery booking entirely: "Advance Payment ₹0" would read
// as a failed payment rather than as no payment.
//
// Lives here, next to the other two, because Device Details and Booking Details
// both render it and a second copy would drift the moment either side changed.
export function paymentFromTicket(ticket, applicableTotal) {
  const amount = Number(ticket?.paymentAmount);
  if (!ticket?.paymentType || !Number.isFinite(amount) || amount <= 0) return null;

  // balanceAmount is stored server-side; the subtraction is only a fallback for
  // a ticket whose last write predates migration 85. Not the primary, because
  // the backend measures against final_price once a repair is invoiced and
  // recomputing off the estimate alone would disagree with it.
  const storedBalance = Number(ticket.balanceAmount);
  const balance = Number.isFinite(storedBalance)
    ? Math.max(0, storedBalance)
    : Math.max(0, (Number(applicableTotal) || 0) - amount);

  return {
    label: ticket.paymentType === 'FULL' ? 'Full Payment' : 'Advance Payment',
    amount,
    balance,
    statusLabel: ticket.paymentStatus === 'PENDING' ? 'Pending' : 'Paid',
    paidAt: ticket.paymentPaidAt || null,
  };
}

// Same thing across a whole booking. One booking can mint several tickets (one
// per device) and the counter payment is split across them, so a receipt for
// the booking has to add the parts back up rather than quote whichever ticket
// happened to be first.
//
// The tickets are the ones the API returned from the submit — so if the backend
// dropped the payment, this reports nothing rather than printing a receipt that
// claims money was taken when no record of it exists.
export function paymentAcrossTickets(tickets, applicableTotal) {
  const list = Array.isArray(tickets) ? tickets.filter(Boolean) : [];
  const paid = list.reduce((sum, t) => sum + (Number(t?.paymentAmount) || 0), 0);
  const type = list.find((t) => t?.paymentType)?.paymentType || null;
  if (!type || paid <= 0) return null;

  // Prefer the server's balances, summed; fall back to the subtraction only
  // when no ticket carries one (a build that predates migration 85).
  const stored = list.reduce(
    (sum, t) => (Number.isFinite(Number(t?.balanceAmount)) ? sum + Number(t.balanceAmount) : sum),
    0,
  );
  const anyStored = list.some((t) => Number.isFinite(Number(t?.balanceAmount)));
  const balance = anyStored
    ? Math.max(0, stored)
    : Math.max(0, (Number(applicableTotal) || 0) - paid);

  return {
    label: type === 'FULL' ? 'Full Payment' : 'Advance Payment',
    amount: paid,
    balance,
  };
}

// Plain-text fallback used when image capture or the share sheet is unavailable.
export function buildReceiptMessage(ticket) {
  if (!ticket) return '';
  const lineItems = priceItemsFromTicket(ticket);
  const total = estimatedTotalOf(ticket, lineItems);
  return (
    `🧾 GGFix Booking Receipt\n\n` +
    `Tracking ID: ${ticket.trackingId || ticket.id}\n` +
    `Customer: ${ticket.customerName || '-'}\n` +
    `Mobile: ${ticket.customerPhone || '-'}\n` +
    `Device: ${ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || '-'}\n` +
    `Status: ${ticket.status || '-'}\n\n` +
    `Services:\n` +
    lineItems.map((i) => `  • ${i.label} — ₹${i.amount}`).join('\n') +
    `\n\nEstimated Total: ₹${total}\n` +
    paymentLines(paymentFromTicket(ticket, total)) +
    `\nTrack your repair in the GGFix app.`
  );
}

// Shared by every plain-text receipt so the wording can't drift between them.
// Empty string when nothing was collected — the receipt then reads exactly as
// it did before payments existed.
function paymentLines(payment) {
  if (!payment) return '';
  return `${payment.label}: ₹${payment.amount}\nBalance Amount: ₹${payment.balance}\n`;
}

export function ReceiptCard({ ticket, lineItems, estimatedTotal, technicianName }) {
  if (!ticket) return null;
  const items = lineItems || priceItemsFromTicket(ticket);
  const total = estimatedTotal != null ? estimatedTotal : estimatedTotalOf(ticket, items);
  const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const trackingId = ticket.trackingId || ticket.id;
  const deviceName = ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || '—';
  const variant = [ticket.ramLabel, ticket.storageLabel, ticket.color].filter(Boolean).join(' · ');
  const generated = new Date().toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const status = STATUS_LABEL[String(ticket.status || '').toUpperCase()] || ticket.status || 'Pending';
  const payment = paymentFromTicket(ticket, total);

  return (
    <View style={{ backgroundColor: '#FFFFFF', padding: 20 }}>
      {/* Brand header */}
      <View
        style={{
          backgroundColor: BRAND_GREEN_DARK,
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>GGFix</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>
          Booking Receipt
        </Text>
      </View>

      {/* Tracking */}
      <View
        style={{
          backgroundColor: '#F0F8EF',
          borderWidth: 1,
          borderColor: '#C8EEBF',
          borderRadius: 10,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#087A0A', letterSpacing: 1 }}>
          TRACKING ID
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#172117', marginTop: 2 }}>
          #{trackingId}
        </Text>
        <Text style={{ fontSize: 11, color: '#667066', marginTop: 4 }}>
          Status: <Text style={{ fontWeight: '700', color: '#087A0A' }}>{status}</Text>
        </Text>
      </View>

      {/* Customer */}
      <ReceiptSection title="Customer">
        <ReceiptRow label="Name" value={ticket.customerName || '—'} />
        <ReceiptRow label="Mobile" value={ticket.customerPhone || '—'} />
        {ticket.customerAddress ? (
          <ReceiptRow label="Address" value={ticket.customerAddress} />
        ) : null}
      </ReceiptSection>

      {/* Device */}
      <ReceiptSection title="Device">
        <ReceiptRow label="Model" value={deviceName} />
        {variant ? <ReceiptRow label="Variant" value={variant} /> : null}
        {ticket.imei ? <ReceiptRow label="IMEI" value={String(ticket.imei)} /> : null}
      </ReceiptSection>

      {/* Technician */}
      {technicianName ? (
        <ReceiptSection title="Technician">
          <ReceiptRow label="Assigned" value={technicianName} />
        </ReceiptSection>
      ) : null}

      {/* Services */}
      <ReceiptSection title="Services">
        {items.length === 0 ? (
          <Text style={{ fontSize: 12, color: '#667066' }}>No services recorded.</Text>
        ) : (
          items.map((it, idx) => (
            <View
              key={it.id || idx}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: '#172117', flex: 1, paddingRight: 8 }} numberOfLines={2}>
                {idx + 1}. {it.label}
              </Text>
              <Text style={{ fontSize: 12, color: '#172117', fontWeight: '700' }}>
                ₹{fmt(it.amount)}
              </Text>
            </View>
          ))
        )}
      </ReceiptSection>

      {/* Total */}
      <View
        style={{
          marginTop: 4,
          padding: 12,
          backgroundColor: '#087A0A',
          borderRadius: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
          Estimated Total
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>
          ₹{fmt(total)}
        </Text>
      </View>

      {/* Payment — printed under the total, in the same order the Device
          Details Price Summary uses. Omitted entirely when nothing was
          collected, so a pay-on-delivery receipt is unchanged. */}
      {payment ? (
        <View
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: '#C8EEBF',
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#172117', fontSize: 12, fontWeight: '700' }}>{payment.label}</Text>
            <Text style={{ color: BRAND_GREEN_DARK, fontSize: 13, fontWeight: '800' }}>
              − ₹{fmt(payment.amount)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 6, borderTopWidth: 1, borderTopColor: '#EFF5EE', paddingTop: 6,
            }}
          >
            <Text style={{ color: '#172117', fontSize: 12, fontWeight: '700' }}>Balance Amount</Text>
            <Text
              style={{ fontSize: 14, fontWeight: '800', color: payment.balance > 0 ? '#B45309' : BRAND_GREEN_DARK }}
            >
              ₹{fmt(payment.balance)}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Footer */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 10, color: '#8FA08F' }}>
          Generated {generated}
        </Text>
        <Text style={{ fontSize: 10, color: '#8FA08F', marginTop: 2 }}>
          Track your repair in the GGFix app.
        </Text>
      </View>
    </View>
  );
}

function ReceiptSection({ title, children }) {
  return (
    <View
      style={{
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8E2',
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '800',
          color: '#087A0A',
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function ReceiptRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
      <Text style={{ fontSize: 11, color: '#667066', width: 70 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: '#172117', flex: 1, fontWeight: '600' }}>
        {value}
      </Text>
    </View>
  );
}

export default ReceiptCard;
