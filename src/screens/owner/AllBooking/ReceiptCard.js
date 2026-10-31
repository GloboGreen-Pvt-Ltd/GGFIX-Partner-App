// Booking receipts.
//
// <ReceiptSlip> is THE receipt image — the GGFix "Booking Receipt" slip. It is
// what every share sends: the Bookings list / Ticket Detail "Share image" sheet
// shows and captures it through <ReceiptCard> (from the saved ticket), and the
// Booking Thank You screen captures it from an off-screen copy (from the
// booking it just created). Two copies of this markup would drift the moment
// either side gained a field.
//
// <BookingReceipt> is the Thank You screen's on-screen layout only — it is
// never sent.
//
// Captured to PNG inside a <ViewShot>. Everything here is plain inline styles
// on purpose: NativeWind classes are not applied reliably inside a
// collapsable={false} view-shot subtree. No transparent fills either — a
// transparent pixel renders as black in most chat apps.
import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Calendar, CircleCheck, Clock, Hash, MapPin, Palette, Phone, ScanLine, Smartphone, User, Wrench,
} from 'lucide-react-native';
import { resolveSpecCategory, specDisplayParts } from '../../../utils/deviceSpecs';
import { imeiApplies, useImeiApplies } from '../../../utils/imeiPolicy';
import { ticketApi } from '../../../api/client';
import { fetchMe } from '../../../api/auth';
import { getSession } from '../../../auth/session';

// GGFIX palette.
const GREEN = '#035C6C';
const GREEN_DEEP = '#035C6C';
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const INK = '#111111';
const MUTED = '#6B7280';
const HAIR = '#F3F4F6';
const BORDER = '#E5E7EB';

// Shop number printed on every receipt. Hardcoded per the owner's explicit
// instruction ("for now display this exact shop number") — it lived on the
// Thank You screen and moved here so both receipts print the same value.
export const RECEIPT_SHOP_NUMBER = '9500824814';

const LOGO = require('../../../../assets/logo.png');

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

// An issue's typed note shown with it: "Display Replacement (cracked glass)".
export const withNote = (name, note) => (name && String(note || '').trim() ? `${name} (${String(note).trim()})` : name);
// Saved tickets keep those notes as "<issue>: <note>" lines of issueDescription.
export function issueNoteFor(ticket, name) {
  const line = name ? String(ticket?.issueDescription || '').split('\n').find((l) => l.startsWith(`${name}: `)) : null;
  return line ? line.slice(name.length + 2).trim() : '';
}
// The rest of the complaint (e.g. IMEI reason). Issue notes already show in
// brackets on the issue, and the plain issue-name fallback is the issues
// themselves, so neither repeats here.
export function receiptComplaint(text, names) {
  const list = (names || []).filter(Boolean);
  const s = String(text || '').split('\n')
    .filter((l) => !list.some((n) => l.startsWith(`${n}: `)))
    .join('\n').trim();
  return s && s !== list.join(', ') ? s : null;
}
// A ticket's deviceDisplayName ("Name · Model No (8GB / 128GB)") in parts.
export function deviceNameParts(raw) {
  const str = String(raw || '').trim();
  const m = /^(.*?)(?: · ([^()]+?))?(?: \(([^)]*)\))?$/.exec(str);
  return { deviceName: (m?.[1] || str).trim() || null, modelNumber: m?.[2]?.trim() || null, ramStorage: m?.[3]?.trim() || null };
}
// "3 Months" for one issue; "Display Replacement: 3 Months, …" for several.
export function warrantySummary(list) {
  const w = (list || []).filter((x) => x.warranty);
  if (!w.length) return null;
  return list.length === 1 ? w[0].warranty : w.map((x) => `${x.name}: ${x.warranty}`).join(', ');
}
// A saved ticket's complaint, for receipts and invoices.
export const ticketComplaint = (ticket) => receiptComplaint(ticket?.issueDescription,
  priceItemsFromTicket(ticket).filter((i) => !isServiceChargeItem(i)).map((i) => i.label || i.serviceName || i.name));

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

// Ticket status → the label the receipt prints. CREATED reads "Order Placed",
// the same words the Thank You receipt uses for a booking it just made.
const RECEIPT_STATUS_LABEL = {
  CREATED: 'Order Placed',
  ASSIGNED: 'Technician Assigned',
  IN_DIAGNOSIS: 'In Diagnosis',
  IN_REPAIR: 'In Service Process',
  QUOTED: 'Re-Estimated',
  APPROVED: 'Customer Approved',
  READY: 'Ready for Delivery',
  INVOICE_GENERATED: 'Invoice Generated',
  INVOICE_READY: 'Invoice Ready',
  DELIVERED_PROCESSING: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export function receiptStatusLabel(status) {
  const key = String(status || '').toUpperCase();
  if (!key) return 'Order Placed';
  return RECEIPT_STATUS_LABEL[key]
    || key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Shop name + picture off the logged-in session — the same image the Home
// header shows (shop front photo, else the owner's avatar).
export function receiptShopFromSession(session) {
  const active = session?.activeShop || session?.shops?.find?.((x) => x.isActive) || null;
  return {
    name: session?.shopName || active?.name || '',
    imageUrl: active?.frontImageUrl || session?.avatarUrl || null,
    // Shop contact number (same fallbacks as the Shop QR screen).
    phone: active?.mobile || active?.mobilePrimary || active?.phone || active?.contactPhone || session?.mobile || session?.phone || null,
  };
}

// Receipt shop details from the /auth/me response (carries the active shop's
// own mobile); the saved session when that call fails.
export async function loadReceiptShop() {
  const fresh = await fetchMe().catch(() => null);
  return receiptShopFromSession(fresh?.userId ? fresh : await getSession());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "02 Oct 2026" / "06:58 PM". Formatted by hand rather than toLocaleString so
// the receipt reads the same on every device and JS engine.
export function receiptDateParts(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const h = d.getHours();
  return {
    date: `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    time: `${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`,
  };
}

// The auto "Service charge" row is a charge, not a repair issue.
const isServiceChargeItem = (x) => String(x?.code || x?.serviceCode || '').toUpperCase() === 'SERVICE_CHARGE';
const receiptWhen = (iso) => {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null
    : t.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
};

const inr2 = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

/**
 * The plain-text twin of <BookingReceipt>, used when the image can't be
 * captured or shared. Same sections, same order.
 *
 * `devices` = [{ modelName, serviceNames: string[], price }].
 */
export function buildBookingReceiptText({
  shop = {}, createdAt, customer = {}, devices = [], trackingId, statusLabel, total = 0, payment = null,
}) {
  const when = receiptDateParts(createdAt);
  const tid = String(trackingId || '').replace(/^#+/, '');
  const deviceLines = devices.map((d, i) => {
    const svcs = (d.serviceNames || []).join(', ') || '-';
    const price = d.price != null ? `\n   Price: ₹${(Number(d.price) || 0).toLocaleString('en-IN')}` : '';
    const eta = receiptWhen(d.estimatedDeliveryIso);
    return `${i + 1}. ${d.modelName || 'Device'}${d.variant ? ` (${d.variant})` : ''}${d.imei ? `\n   IMEI: ${d.imei}` : ''}\n   Issues: ${svcs}${d.serviceCharge ? `\n   Service charge: ₹${(Number(d.serviceCharge) || 0).toLocaleString('en-IN')}` : ''}${price}${eta ? `\n   Estimated Time: ${eta}` : ''}`;
  }).join('\n');
  return (
    `🧾 NearGFix Booking Receipt\n` +
    (when ? `${when.date} · ${when.time}\n` : '') +
    `\n— SHOP INFORMATION —\n` +
    `Shop: ${shop.name || 'Your Shop'}\n` +
    `Mobile: ${RECEIPT_SHOP_NUMBER}\n` +
    `\n— CUSTOMER DETAILS —\n` +
    `Name: ${customer.name || '-'}\n` +
    `Mobile: ${customer.phone || '-'}\n` +
    (customer.alternatePhone ? `Alternate Mobile: ${customer.alternatePhone}\n` : '') +
    (customer.address ? `Address: ${customer.address}\n` : '') +
    `\n— DEVICE & REPAIR DETAILS —\n${deviceLines || '-'}\n\n` +
    `— SERVICE INFORMATION —\n` +
    `Tracking ID: #${tid}\n` +
    `Service Status: ${statusLabel || 'Order Placed'}\n` +
    `Estimated Repair Price: ${inr2(total)}\n` +
    (payment
      ? `${payment.label}: ${inr2(payment.amount)}\nBalance Amount: ${inr2(payment.balance)}\n`
      : '') +
    `\nTrack your repair in the NearGFix app.`
  );
}

// "30 Oct 2026, 2:57 AM" (withYear) / "30 Oct, 2:57 AM" — hand-formatted so
// WhatsApp and SMS read the same on every device.
export const readyWhen = (iso, withYear) => {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const h = t.getHours();
  const day = `${String(t.getDate()).padStart(2, '0')} ${MONTHS[t.getMonth()]}${withYear ? ` ${t.getFullYear()}` : ''}`;
  return `${day}, ${h % 12 || 12}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
// Latest ready time across the booked devices.
export const latestReadyIso = (devices) => devices
  .map((d) => d.estimatedDeliveryIso).filter((x) => x && !Number.isNaN(new Date(x).getTime()))
  .sort((a, b) => new Date(b) - new Date(a))[0] || null;
const inr0 = (n) => (Number(n) || 0).toLocaleString('en-IN');

/** Thank You screen WhatsApp message — booking confirmation. */
export function buildBookingConfirmWhatsApp({
  shop = {}, customer = {}, devices = [], trackingId, statusLabel, total = 0,
}) {
  const shopName = shop.name || 'Your Shop';
  const tid = String(trackingId || '').replace(/^#+/, '');
  const ready = readyWhen(latestReadyIso(devices), true);
  const deviceLines = devices.map((d) => (
    `📱 *Device:* ${d.modelName || 'Device'}${d.spec ? ` (${d.spec})` : ''}\n` +
    `🔧 *Service:* ${(d.serviceNames || []).join(', ') || '-'}\n`
  )).join('');
  return (
    `✅ *${shopName} | Service Booking Confirmed*\n\n` +
    `Dear *${customer.name || 'Customer'}*,\n\n` +
    `Your device repair booking has been successfully registered with *${shopName}*.\n\n` +
    `🎫 *Booking ID:* ${tid}\n` +
    deviceLines +
    `💰 *Estimated Cost:* ₹${inr0(total)}\n` +
    (ready ? `🕒 *Expected Ready:* ${ready}\n` : '') +
    `📋 *Status:* ${statusLabel || 'Order Placed'}\n\n` +
    `📞 *Shop Number:* ${shop.phone || RECEIPT_SHOP_NUMBER}\n\n` +
    `Thank you for trusting *${shopName}* with your device. We appreciate your business! 💚\n\n` +
    `Powered by NearGFix`
  );
}

/** Thank You screen SMS — one short booking confirmation line. */
export function buildBookingConfirmSms({
  shop = {}, customer = {}, devices = [], trackingId, total = 0,
}) {
  const shopName = shop.name || 'our shop';
  const tid = String(trackingId || '').replace(/^#+/, '');
  const models = devices.map((d) => d.modelName || 'Device').join(', ') || 'device';
  const ready = readyWhen(latestReadyIso(devices), false);
  return (
    `Dear ${customer.name || 'Customer'}, your ${models} repair booking (${tid}) at ${shopName} is confirmed. ` +
    `Est. Price: Rs.${inr0(total)}. ` +
    (ready ? `Ready by: ${ready}. ` : '') +
    `Thank you for choosing ${shopName}! - Powered By NearGFix`
  );
}

// A saved ticket → the props <BookingReceipt> takes. One ticket is one device.
// IMEI is printed for mobile phones only (unknown category keeps it).
export function receiptPropsFromTicket(
  ticket,
  shop,
  showImei = imeiApplies(resolveSpecCategory(ticket?.deviceCategory, ticket?.categoryCode, ticket?.categoryName)),
  alternatePhone = null,
) {
  const items = priceItemsFromTicket(ticket);
  const total = estimatedTotalOf(ticket, items);
  return {
    shop: shop || {},
    createdAt: ticket.createdAt,
    customer: {
      name: ticket.customerName,
      phone: ticket.customerPhone,
      alternatePhone: alternatePhone || ticket.customerAlternatePhone || null,
      address: ticket.customerAddress,
    },
    devices: [{
      modelName: ticket.deviceDisplayName || ticket.deviceModelName || ticket.modelName || 'Device',
      imageUrl: ticket.deviceImageUrl || null,
      variant: specDisplayParts(ticket, { withColor: true }).join(' · '),
      imei: showImei ? ticket.imei || null : null,
      serviceNames: items.filter((i) => !isServiceChargeItem(i)).map((i) => i.label || i.serviceName || i.name).filter(Boolean)
        .map((n) => withNote(n, issueNoteFor(ticket, n))),
      serviceCharge: items.filter(isServiceChargeItem).reduce((n, i) => n + (Number(i.amount ?? i.price) || 0), 0) || null,
      priceLines: [...items.filter((i) => !isServiceChargeItem(i)), ...items.filter(isServiceChargeItem)]
        .map((i) => ({ label: i.label || i.serviceName || i.name || 'Service charge', amount: Number(i.amount ?? i.price) || 0 })),
      warranty: warrantySummary(items.filter((i) => !isServiceChargeItem(i)).map((i) => ({ name: i.label || i.serviceName || i.name, warranty: i.warranty }))),
      // For the Booking Confirmed card: "Moto g54 5G · XT2343 (8GB / 128GB)" split up.
      ...deviceNameParts(ticket.deviceDisplayName),
      color: ticket.color || null,
      serialNumber: showImei ? null : ticket.serialNumber || null,
      serviceLines: items.filter((i) => !isServiceChargeItem(i)).map((i) => {
        const n = i.label || i.serviceName || i.name || 'Service';
        return { name: withNote(n, issueNoteFor(ticket, n)), amount: Number(i.amount ?? i.price) || 0, warranty: i.warranty || null };
      }),
      complaint: ticketComplaint(ticket),
      accessories: ticket.accessories || null,
      missingParts: ticket.missingPartsJson || null,
      estimatedReadyIso: ticket.estimatedReadyAt || null,
      estimatedDeliveryIso: ticket.estimatedDeliveryAt || null,
    }],
    trackingId: ticket.trackingId || ticket.id,
    statusLabel: receiptStatusLabel(ticket.status),
    total,
    payment: paymentFromTicket(ticket, total),
  };
}

// Plain-text fallback for the Share image sheet — same details as the image.
export function buildReceiptMessage(ticket, shop) {
  if (!ticket) return '';
  return buildBookingReceiptText(receiptPropsFromTicket(ticket, shop));
}

// The receipt slip for a saved ticket (Bookings list / Ticket Detail share sheet).
export function ReceiptCard({ ticket, shop }) {
  const showImei = useImeiApplies(ticket);
  // The alternate number lives on the customer record, not the ticket.
  const [altPhone, setAltPhone] = useState(null);
  const phone = String(ticket?.customerPhone || '').replace(/\D/g, '').slice(-10);
  useEffect(() => {
    if (phone.length !== 10) return undefined;
    let alive = true;
    ticketApi.get('/customers/lookup', { query: { mobile: phone } })
      .then((c) => { if (alive && c?.alternatePhone) setAltPhone(c.alternatePhone); })
      .catch(() => {});
    return () => { alive = false; };
  }, [phone]);
  if (!ticket) return null;
  return <ReceiptSlip {...receiptPropsFromTicket(ticket, shop, showImei, altPhone)} />;
}

// Splits "CSPEN8324788" so the digits can print in brand green.
function splitTrackingId(id) {
  const str = String(id ?? '').replace(/^#+/, '');
  const m = str.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: str, digits: '' };
}

/**
 * The GGFix "Booking Receipt" slip — the image every share sends.
 *
 *   shop      { name, imageUrl }
 *   customer  { name, phone, address }
 *   devices   [{ modelName, variant, imei, serviceNames }]
 */
export function ReceiptSlip({
  shop = {}, createdAt, customer = {}, devices = [], trackingId, statusLabel, total = 0, payment = null,
}) {
  const tid = splitTrackingId(trackingId);
  const when = receiptDateParts(createdAt);
  const fmt0 = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const multi = devices.length > 1;

  return (
    <View style={{ backgroundColor: '#FFFFFF' }}>
      {/* Brand header — GGFix avatar + name */}
      <LinearGradient
        colors={[GREEN, GREEN_DEEP]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, overflow: 'hidden' }}
      >
        <View style={{ position: 'absolute', top: -46, right: -34, width: 130, height: 130, borderRadius: 65, borderWidth: 18, borderColor: 'rgba(255,255,255,0.09)' }} />
        <View style={{ position: 'absolute', bottom: -26, right: 72, width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.07)' }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 54, height: 54, borderRadius: 27, padding: 3, backgroundColor: 'rgba(255,255,255,0.3)' }}>
            <View style={{ flex: 1, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Image source={LOGO} style={{ width: 46, height: 46 }} resizeMode="contain" />
            </View>
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>NearGFix</Text>
            <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 1 }}>Booking Receipt</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Tracking ID + booking date/time — overlaps the header */}
      <View
        style={{
          marginHorizontal: 14, marginTop: -20, paddingVertical: 11, paddingHorizontal: 12,
          borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, alignItems: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Hash size={11} color={MUTED} />
          <Text style={{ marginLeft: 4, fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1.2 }}>TRACKING ID</Text>
        </View>
        <Text style={{ marginTop: 3, fontSize: 17, fontWeight: '800', letterSpacing: 0.4 }}>
          <Text style={{ color: INK }}>#{tid.prefix}</Text>
          <Text style={{ color: GREEN }}>{tid.digits}</Text>
        </Text>
        {when ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            <Calendar size={11} color={GREEN} />
            <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: '700', color: INK }}>{when.date}</Text>
            <View style={{ width: 1, height: 10, backgroundColor: BORDER, marginHorizontal: 8 }} />
            <Clock size={11} color={GREEN} />
            <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: '700', color: INK }}>{when.time}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <SlipSection title="Shop Information">
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
            <ShopAvatar uri={shop.imageUrl} size={36} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>{shop.name || 'Your Shop'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Phone size={10} color={GREEN_DEEP} />
                <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: '700', color: MUTED }}>{RECEIPT_SHOP_NUMBER}</Text>
              </View>
            </View>
          </View>
        </SlipSection>

        <SlipSection title="Customer Details">
          <SlipRow icon={User} label="Name" value={customer.name || '—'} />
          <SlipRow icon={Phone} label="Mobile" value={customer.phone || '—'} isLast={!customer.alternatePhone && !customer.address} />
          {customer.alternatePhone ? <SlipRow icon={Phone} label="Alt. Mobile" value={customer.alternatePhone} isLast={!customer.address} /> : null}
          {customer.address ? <SlipRow icon={MapPin} label="Address" value={customer.address} isLast /> : null}
        </SlipSection>

        <SlipSection title="Device Details">
          {devices.map((d, i) => (
            <View key={i}>
              <SlipRow icon={Smartphone} label="Model" value={`${multi ? `${i + 1}. ` : ''}${d.modelName || '—'}`} />
              {d.variant ? <SlipRow icon={Palette} label="Variant" value={d.variant} /> : null}
              {d.imei ? <SlipRow icon={ScanLine} label="IMEI" value={String(d.imei)} /> : null}
              <SlipRow icon={Wrench} label="Issues" value={(d.serviceNames || []).join(', ') || '—'} />
              {d.serviceCharge ? <SlipRow icon={Wrench} label="Charge" value={`₹${fmt0(d.serviceCharge)}`} /> : null}
              {receiptWhen(d.estimatedDeliveryIso) ? <SlipRow icon={Clock} label="Est. Time" value={receiptWhen(d.estimatedDeliveryIso)} /> : null}
            </View>
          ))}
          <SlipRow icon={CircleCheck} label="Status" value={statusLabel || 'Order Placed'} valueColor={GREEN_DEEP} isLast />
        </SlipSection>
      </View>

      {/* Tear line */}
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12 }}>
        {Array.from({ length: 26 }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 1.5, marginHorizontal: 2, borderRadius: 1, backgroundColor: '#D1D5DB' }} />
        ))}
      </View>

      {/* Estimated total (+ what was paid, only when a payment was recorded) */}
      <View
        style={{
          marginHorizontal: 14, marginTop: 12, marginBottom: 16, paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 14, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1 }}>ESTIMATED TOTAL</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: INK, marginTop: 1 }}>Repair Estimate</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: GREEN_DEEP }}>₹{fmt0(total)}</Text>
        </View>
        {payment ? (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: MINT_LINE }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: MUTED }}>{payment.label}</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: INK }}>₹{fmt0(payment.amount)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
              <Text style={{ fontSize: 11, color: MUTED }}>Balance Amount</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: INK }}>₹{fmt0(payment.balance)}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <LinearGradient colors={[GREEN, GREEN_DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 5 }} />
    </View>
  );
}

function SlipSection({ title, children }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: GREEN_DEEP, letterSpacing: 1, marginBottom: 2 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function SlipRow({ icon: Icon, label, value, isLast, valueColor }) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: HAIR,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Icon size={11} color={GREEN_DEEP} />
      </View>
      <Text style={{ fontSize: 11, color: MUTED, width: 58 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: valueColor || INK, flex: 1, fontWeight: '700', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/**
 * The booking receipt itself — what the Thank You screen shows and what both
 * share flows capture.
 *
 *   shop      { name, imageUrl }        printed in the header with date & time
 *   customer  { name, phone, address }
 *   devices   [{ modelName, imageUrl, serviceNames }]
 *   onCopyTrackingId  optional; makes the tracking pill a copy button
 *   contentStyle      optional width cap (tablet column)
 */
export function BookingReceipt({
  shop = {}, createdAt, customer = {}, devices = [], trackingId, statusLabel = 'Order Placed',
  total = 0, payment = null, onCopyTrackingId, padding = 14, contentStyle,
}) {
  const when = receiptDateParts(createdAt);
  const tid = String(trackingId || '').replace(/^#+/, '');
  const Pill = onCopyTrackingId ? Pressable : View;

  return (
    <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: padding, paddingTop: 12, paddingBottom: padding }}>
      <View style={contentStyle}>
        {/* Shop header — avatar, shop name, booking date & time (plain row, no card). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <ShopAvatar uri={shop.imageUrl} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>
              {shop.name || 'Your Shop'}
            </Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>Booking Receipt</Text>
          </View>
          {when ? (
            <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={11} color={GREEN} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: INK, marginLeft: 4 }}>{when.date}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <Ionicons name="time-outline" size={11} color={GREEN} />
                <Text style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>{when.time}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Thank You block */}
        <View style={{ alignItems: 'center', marginBottom: 14 }}>
          <View style={{ width: 72, height: 72 }}>
            <Ionicons name="sparkles" size={12} color="#F3BF23" style={{ position: 'absolute', left: -4, top: 4 }} />
            <Ionicons name="sparkles" size={9} color={GREEN} style={{ position: 'absolute', right: -2, top: 2 }} />
            <Ionicons name="sparkles-outline" size={10} color={GREEN} style={{ position: 'absolute', right: 2, bottom: 2 }} />
            <View
              style={{
                position: 'absolute', left: 6, top: 6, height: 60, width: 60, borderRadius: 30,
                backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT_LINE, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <View
                style={{
                  height: 46, width: 46, borderRadius: 23, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
                  shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
                }}
              >
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
              </View>
            </View>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: GREEN_DEEP, marginTop: 8 }}>Thank You!</Text>
          <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Your booking has been placed.</Text>
          <Pill
            {...(onCopyTrackingId ? { onPress: onCopyTrackingId, accessibilityRole: 'button', accessibilityLabel: 'Copy tracking ID' } : {})}
            style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10,
              backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT_LINE,
            }}
          >
            <Ionicons name="pricetag-outline" size={12} color={GREEN} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: GREEN_DEEP, marginLeft: 5 }}>#{tid}</Text>
            {onCopyTrackingId ? (
              <>
                <View style={{ width: 1, height: 12, backgroundColor: BORDER, marginHorizontal: 8 }} />
                <Ionicons name="copy-outline" size={12} color={MUTED} />
              </>
            ) : null}
          </Pill>
        </View>

        <ReceiptSection label="Customer Details">
          <ReceiptRow icon="person-outline" label="Customer Name" value={customer.name} />
          <ReceiptRow icon="call-outline" label="Mobile Number" value={customer.phone} />
          {customer.alternatePhone ? <ReceiptRow icon="call-outline" label="Alternate Number" value={customer.alternatePhone} /> : null}
          <ReceiptRow icon="location-outline" label="Address" value={customer.address} last />
        </ReceiptSection>

        <ReceiptSection label="Device & Repair Details">
          {devices.map((d, i) => {
            const last = i === devices.length - 1;
            return (
              <View key={i}>
                <ReceiptRow icon="phone-portrait-outline" label={devices.length > 1 ? `Device ${i + 1}` : 'Device'} value={[d.brandName, d.modelName || 'Device'].filter(Boolean).join(' · ')} />
                {d.modelNumber ? <ReceiptRow icon="barcode-outline" label="Model No." value={d.modelNumber} /> : null}
                {d.variant ? <ReceiptRow icon="color-palette-outline" label="Variant" value={d.variant} /> : null}
                {d.imei ? <ReceiptRow icon="scan-outline" label="IMEI" value={String(d.imei)} /> : null}
                <ReceiptRow icon="build-outline" label="Repair Issues" value={(d.serviceNames || []).join(', ')} />
                {d.warranty ? <ReceiptRow icon="shield-checkmark-outline" label="Warranty" value={d.warranty} /> : null}
                {d.complaint ? <ReceiptRow icon="chatbox-ellipses-outline" label="Complaint" value={d.complaint} /> : null}
                <ReceiptRow icon="headset-outline" label="Accessories" value={d.accessories || 'None'} />
                {receiptWhen(d.estimatedReadyIso) ? <ReceiptRow icon="calendar-outline" label="Booking Time" value={receiptWhen(d.estimatedReadyIso)} /> : null}
                <ReceiptRow icon="time-outline" label="Estimated Time" value={receiptWhen(d.estimatedDeliveryIso) || '—'} last={last} />
                {!last ? <View style={{ height: 1, backgroundColor: HAIR, marginVertical: 7 }} /> : null}
              </View>
            );
          })}
        </ReceiptSection>

        <ReceiptSection label="Service Information" noMargin>
          <ReceiptRow icon="pricetag-outline" label="Tracking ID" value={`#${tid}`} bold />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: 108 }}>
              <Ionicons name="time-outline" size={12} color={GREEN} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED }}>Status</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: GREEN_DEEP }}>{statusLabel || 'Order Placed'}</Text>
              </View>
            </View>
          </View>
          {/* Price breakdown (e.g. Display Replacement ₹2,500 + Service charge
              ₹500), then the Estimated Repair Price total (₹3,000). */}
          {devices.map((d, i) => (d.priceLines || []).map((p, j) => (
            <ReceiptRow
              key={`${i}-${j}`}
              icon="pricetag-outline"
              label={devices.length > 1 ? `Device ${i + 1} · ${p.label}` : p.label}
              value={inr2(p.amount)}
            />
          )))}
          <ReceiptRow icon="cash-outline" label="Estimated Repair Price" value={inr2(total)} bold last={!payment} />
          {/* Only when a payment was actually recorded — the same rule the
              Device Details Price Summary follows, so the receipt and the
              screen can never tell the customer two different stories. */}
          {payment ? (
            <>
              <ReceiptRow icon="checkmark-done-outline" label={payment.label} value={inr2(payment.amount)} />
              <ReceiptRow icon="wallet-outline" label="Balance Amount" value={inr2(payment.balance)} last />
            </>
          ) : null}
        </ReceiptSection>
      </View>
    </View>
  );
}

// Shop picture in a ring; the GGFix logo when the shop has none (or it fails).
function ShopAvatar({ uri, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!uri && !broken;
  const logo = Math.round(size * 0.75);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT_LINE, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Image
        source={showPhoto ? { uri } : LOGO}
        onError={() => setBroken(true)}
        style={showPhoto ? { width: '100%', height: '100%' } : { width: logo, height: logo }}
        resizeMode={showPhoto ? 'cover' : 'contain'}
      />
    </View>
  );
}

// Heading, a line under it, then the details — no card around them.
function ReceiptSection({ label, children, noMargin }) {
  return (
    <View style={{ marginBottom: noMargin ? 0 : 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: GREEN, marginRight: 7 }} />
        <Text style={{ flexShrink: 1, fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>{label}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: BORDER, marginTop: 7, marginBottom: 9 }} />
      {children}
    </View>
  );
}

// Fixed-width LEFT column (icon + label) and a `flex: 1` RIGHT column for the
// value, both top-aligned — a long value (an address) gets the full remaining
// width to wrap into instead of being squeezed by the label.
function ReceiptRow({ icon, label, value, bold, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: last ? 0 : 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: 108 }}>
        {icon ? <Ionicons name={icon} size={12} color={GREEN} style={{ marginRight: 6 }} /> : null}
        <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: MUTED, lineHeight: 14 }} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={{ flex: 1, fontSize: 12, color: INK, fontWeight: bold ? '800' : '700', lineHeight: 16, textAlign: 'right', marginLeft: 8 }}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default ReceiptCard;
