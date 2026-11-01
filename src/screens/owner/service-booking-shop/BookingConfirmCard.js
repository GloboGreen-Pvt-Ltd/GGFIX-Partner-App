// The image Share to WhatsApp sends (Booking Thank You screen and the Bookings
// share sheet): a "Service Booking Confirmed" card. Rendered at 360pt wide and
// captured by ViewShot (≈1080px on a 3x phone); its height grows with the
// booking. Everything is filled from the booking, so it works for any shop.
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import {
  AlertTriangle, CalendarClock, Check, Handshake, Headphones, Laptop, MessageSquareText, Palette,
  Phone, ScanLine, Smartphone, Tablet, Ticket, Wallet, Watch, Wrench,
} from 'lucide-react-native';
import {
  latestReadyIso, paymentAcrossTickets, readyWhen, receiptPropsFromTicket, receiptShopPhone,
} from '../AllBooking/ReceiptCard';
import { getBrands, getDeviceCategories, getModel } from '../../../api/masterData';
import { ticketApi } from '../../../api/client';

const LOGO = require('../../../../assets/logo.png');

const GREEN = '#01AC77';
const GREEN_DARK = '#03714F';
const NAVY = '#05366E';
const MINT = '#E6F7F1';
const MUTED = '#6B7280';
const HAIR = '#EEF1F0';
const AMBER = '#B45309';

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Placeholder when the device has no catalogue image.
const categoryIcon = (name) => {
  const s = String(name || '').toLowerCase();
  if (/laptop|notebook|macbook/.test(s)) return Laptop;
  if (/tablet|ipad|tab\b/.test(s)) return Tablet;
  if (/watch/.test(s)) return Watch;
  if (/audio|headphone|earbud|speaker/.test(s)) return Headphones;
  return Smartphone;
};

// Flagged parts (list or missingPartsJson) → "Display (Damaged – cracked), SIM Card Tray (Missing)".
const partsText = (v) => {
  let list = v;
  if (typeof v === 'string') { try { list = JSON.parse(v); } catch { list = []; } }
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && (p.missing || p.damage))
    .map((p) => `${p.partName || p.name || p.partId} (${p.damage ? 'Damaged' : 'Missing'}${p.detail ? ` – ${p.detail}` : ''})`)
    .join(', ');
};

/**
 * Props: shop { name, imageUrl, phone } · customer { name, phone, alternatePhone }
 * · devices [{ modelName, brandName, categoryName, modelNumber, ramStorage,
 * color, imei, serialNumber, imageUrl, serviceLines [{ name, amount, warranty }],
 * serviceCharge, complaint, accessories, missingParts, estimatedDeliveryIso }] · trackingId ·
 * createdAt · statusLabel · total · payment { amount, balance } (null = unpaid).
 */
export default function BookingConfirmCard({
  shop = {}, customer = {}, devices = [], trackingId, createdAt, statusLabel, total = 0, payment = null,
}) {
  const shopName = shop.name || 'Your Shop';
  const shopPhone = receiptShopPhone(shop);
  const tid = String(trackingId || '').replace(/^#+/, '') || '—';
  const bookedOn = readyWhen(createdAt, true);
  const delivery = readyWhen(latestReadyIso(devices), true);
  const paid = Number(payment?.amount) || 0;
  const balance = payment && Number.isFinite(Number(payment.balance))
    ? Math.max(0, Number(payment.balance))
    : Math.max(0, (Number(total) || 0) - paid);
  const many = devices.length > 1;

  return (
    <View style={{ width: 360, backgroundColor: '#FFFFFF', padding: 14 }}>
      {/* Header — shop logo + name · Service Booking Confirmed */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          <ShopLogo shop={shop} size={30} />
          <Text style={{ flex: 1, marginLeft: 7, fontSize: 15, fontWeight: '800', color: NAVY }} numberOfLines={2}>
            {shopName}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={13} color="#FFFFFF" strokeWidth={3} />
          </View>
          <View style={{ marginLeft: 6 }}>
            <Text style={{ fontSize: 8, fontWeight: '600', color: NAVY }}>Service Booking</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: NAVY, marginTop: -1 }}>Confirmed</Text>
          </View>
        </View>
      </View>

      {/* Booking ID + status · booked on */}
      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#F6FBF9', borderWidth: 1, borderColor: HAIR, paddingHorizontal: 10, paddingVertical: 7 }}>
        <Ticket size={15} color={GREEN} strokeWidth={2.2} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ fontSize: 8, color: MUTED }}>Booking ID</Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: NAVY }}>{tid}</Text>
          {bookedOn ? <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>Booked on {bookedOn}</Text> : null}
        </View>
        <View style={{ backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: GREEN_DARK }}>{statusLabel || 'Order Placed'}</Text>
        </View>
      </View>

      {/* Greeting + customer contact */}
      <Text style={{ marginTop: 10, fontSize: 12, color: NAVY }}>
        Dear <Text style={{ fontWeight: '800' }}>{customer.name || 'Customer'}</Text>,
      </Text>
      <Text style={{ marginTop: 2, fontSize: 9.5, lineHeight: 13, color: '#374151' }}>
        Your device repair booking has been successfully registered with{' '}
        <Text style={{ fontWeight: '800', color: GREEN }}>{shopName}</Text>.
      </Text>
      {customer.phone || customer.alternatePhone ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 }}>
          {customer.phone ? <ContactChip label="Mobile" value={customer.phone} /> : null}
          {customer.alternatePhone ? <ContactChip label="Alt. Mobile" value={customer.alternatePhone} /> : null}
        </View>
      ) : null}

      {/* One card per device: details + photo, repair services, delivery. */}
      {devices.map((d, i) => {
        const Placeholder = categoryIcon(d.categoryName || d.modelName);
        const lines = Array.isArray(d.serviceLines) ? d.serviceLines
          : (d.serviceNames || []).map((name) => ({ name }));
        const variant = [d.ramStorage, d.color].filter(Boolean).join(' · ');
        return (
          <View key={i} style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: HAIR, overflow: 'hidden' }}>
            {many ? (
              <Text style={{ paddingHorizontal: 10, paddingTop: 7, fontSize: 8.5, fontWeight: '800', color: GREEN_DARK, letterSpacing: 0.4 }}>
                DEVICE {i + 1} OF {devices.length}
              </Text>
            ) : null}
            {/* Device: photo + name, variant / colour, IMEI — one compact row. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: many ? 4 : 10, paddingBottom: 10 }}>
              <View style={{ width: 58, height: 70, borderRadius: 10, borderWidth: 1, borderColor: HAIR, backgroundColor: d.imageUrl ? '#FFFFFF' : MINT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {d.imageUrl ? (
                  <Image source={{ uri: d.imageUrl }} style={{ width: 54, height: 66 }} resizeMode="contain" />
                ) : (
                  <Placeholder size={28} color={GREEN} strokeWidth={1.5} />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>DEVICE</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: NAVY, marginTop: 1 }}>{d.deviceName || d.modelName || 'Device'}</Text>
                {variant ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Palette size={11} color={GREEN} strokeWidth={2.2} />
                    <Text style={{ flex: 1, marginLeft: 5, fontSize: 10, fontWeight: '600', color: '#374151' }}>{variant}</Text>
                  </View>
                ) : null}
                {d.imei || d.serialNumber ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <ScanLine size={11} color={GREEN} strokeWidth={2.2} />
                    <Text style={{ flex: 1, marginLeft: 5, fontSize: 10, fontWeight: '600', color: '#374151' }}>
                      {d.imei ? `IMEI ${d.imei}` : `S/N ${d.serialNumber}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Repair services — every line, names wrap instead of truncating. */}
            <View style={{ borderTopWidth: 1, borderColor: HAIR, paddingHorizontal: 10, paddingVertical: 8 }}>
              <SectionTitle Icon={Wrench} title="REPAIR SERVICES" />
              {lines.map((s, j) => (
                <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: j ? 6 : 0 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: GREEN_DARK }}>{j + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 7 }}>
                    <Text style={valueStyle}>{s.name}</Text>
                    {s.warranty ? <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>Warranty: {s.warranty}</Text> : null}
                  </View>
                  {s.amount != null ? <Text style={[valueStyle, { marginLeft: 8 }]}>{inr(s.amount)}</Text> : null}
                </View>
              ))}
              {Number(d.serviceCharge) > 0 ? (
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Text style={{ flex: 1, marginLeft: 23, fontSize: 10.5, color: MUTED, fontWeight: '600' }}>Service Charge</Text>
                  <Text style={valueStyle}>{inr(d.serviceCharge)}</Text>
                </View>
              ) : null}
              {d.complaint ? <Detail Icon={MessageSquareText} label="Issue Description" value={d.complaint} /> : null}
              <Detail Icon={Headphones} label="Accessories" value={d.accessories || 'None'} />
              <Detail Icon={AlertTriangle} label="Missing / Damaged Parts" value={partsText(d.missingParts) || 'None'} />
            </View>

            {/* Estimated delivery — the booking's own estimate, never "now". */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, paddingHorizontal: 10, paddingVertical: 7 }}>
              <CalendarClock size={16} color={GREEN_DARK} strokeWidth={2.2} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: GREEN_DARK, letterSpacing: 0.4 }}>ESTIMATED DELIVERY DATE & TIME</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: NAVY }}>
                  {readyWhen(d.estimatedDeliveryIso, true) || (!many && delivery) || 'To Be Confirmed'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* Payment summary — from the booking's recorded payment. */}
      <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: HAIR, paddingHorizontal: 10, paddingVertical: 8 }}>
        <SectionTitle Icon={Wallet} title="PAYMENT SUMMARY" />
        <MoneyRow label="Estimated Repair Total" value={inr(total)} />
        <MoneyRow label="Amount Paid" value={inr(paid)} />
        <View style={{ height: 1, backgroundColor: HAIR, marginVertical: 5 }} />
        <MoneyRow label="Balance Amount" value={inr(balance)} bold color={balance > 0 ? AMBER : GREEN_DARK} />
      </View>

      {/* Shop contact — full number, wraps rather than clipping. */}
      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: HAIR, paddingHorizontal: 10, paddingVertical: 8 }}>
        <ShopLogo shop={shop} size={28} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ fontSize: 8, color: MUTED }}>Shop Contact</Text>
          <Text style={valueStyle}>{shopName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
            <Phone size={11} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <Text style={[valueStyle, { marginLeft: 6, fontSize: 12 }]}>{shopPhone}</Text>
        </View>
      </View>

      {/* Footer — thank you (dark green) · Powered by NearGFix (white) */}
      <View style={{ marginTop: 10, height: 46, borderRadius: 12, overflow: 'hidden', backgroundColor: GREEN_DARK, flexDirection: 'row', alignItems: 'center' }}>
        <Handshake size={20} color="#FFFFFF" strokeWidth={1.8} style={{ marginLeft: 11 }} />
        <View style={{ flex: 1, marginLeft: 8, marginRight: 112 }}>
          <Text style={{ fontSize: 9.5, color: '#FFFFFF' }} numberOfLines={1}>
            Thank you for choosing <Text style={{ fontWeight: '800' }}>{shopName}</Text>!
          </Text>
          <Text style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.9)', marginTop: 1 }}>Your trust means a lot to us. 💚</Text>
        </View>
        {/* Curved split: a light-green sliver, then the white panel. */}
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 112, backgroundColor: GREEN, borderTopLeftRadius: 40 }} />
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 106, backgroundColor: '#FFFFFF', borderTopLeftRadius: 40, alignItems: 'center', justifyContent: 'center', paddingLeft: 6 }}>
          <Text style={{ fontSize: 7.5, color: MUTED }}>Powered by</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
            <Image source={LOGO} style={{ width: 16, height: 16 }} resizeMode="contain" />
            <Text style={{ marginLeft: 3, fontSize: 12, fontWeight: '800', color: NAVY }}>NearGFix</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const valueStyle = { fontSize: 11, fontWeight: '800', color: NAVY };

function ShopLogo({ shop, size }) {
  const name = String(shop.name || 'S').trim();
  return shop.imageUrl ? (
    <Image source={{ uri: shop.imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.46, fontWeight: '800' }}>{name[0]?.toUpperCase() || 'S'}</Text>
    </View>
  );
}

function ContactChip({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, marginTop: 3, borderRadius: 999, backgroundColor: '#F6FBF9', borderWidth: 1, borderColor: HAIR, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Phone size={9} color={GREEN} strokeWidth={2.4} />
      <Text style={{ marginLeft: 4, fontSize: 8.5, color: MUTED }}>{label}</Text>
      <Text style={{ marginLeft: 4, fontSize: 9.5, fontWeight: '800', color: NAVY }}>{value}</Text>
    </View>
  );
}

function SectionTitle({ Icon, title }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Icon size={13} color={GREEN} strokeWidth={2.2} />
      <Text style={{ marginLeft: 6, fontSize: 8.5, fontWeight: '800', color: NAVY, letterSpacing: 0.5 }}>{title}</Text>
    </View>
  );
}

function Detail({ Icon, label, value }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 7 }}>
      <Icon size={12} color={GREEN} strokeWidth={2.2} style={{ marginTop: 1 }} />
      <Text style={{ marginLeft: 6, width: 92, fontSize: 9.5, color: MUTED }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: NAVY }}>{value}</Text>
    </View>
  );
}

function MoneyRow({ label, value, bold, color = NAVY }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
      <Text style={{ flex: 1, fontSize: bold ? 11 : 10.5, fontWeight: bold ? '800' : '600', color: bold ? NAVY : MUTED }}>{label}</Text>
      <Text style={{ fontSize: bold ? 13 : 11, fontWeight: '800', color }}>{value}</Text>
    </View>
  );
}

/**
 * The selected booking → card props, once everything the card needs is loaded.
 * The ticket is re-read by id (GET /tickets/{id}) so the share never uses a
 * stale list row, and a multi-device booking (GTS-001-A, -B …) pulls in its
 * sibling devices, so one receipt covers the whole booking: every device,
 * total = sum of the devices, payment added up. Brand / category / model no.
 * / alternate number come from master data and the customer record. `ready`
 * stays false until then, so a share never captures a half-filled card. The
 * WhatsApp text is built from these same props.
 */
export function useTicketConfirmProps(ticket, shop) {
  const [loaded, setLoaded] = useState(null); // { tickets, extra }
  useEffect(() => {
    setLoaded(null);
    if (!ticket) return undefined;
    let alive = true;
    (async () => {
      const fresh = (ticket.id ? await ticketApi.get(`/tickets/${ticket.id}`).catch(() => null) : null) || ticket;
      let tickets = [fresh];
      const bn = fresh.bookingNumber;
      if (bn && fresh.trackingId && fresh.trackingId !== bn) {
        const res = await ticketApi.get('/tickets', { query: { page: 0, size: 50, q: bn } }).catch(() => null);
        const rows = (Array.isArray(res) ? res : res?.content || [])
          .filter((t) => t?.bookingNumber === bn && String(t.status || '').toUpperCase() !== 'CANCELLED');
        if (rows.length) {
          tickets = rows.map((t) => (t.id === fresh.id ? fresh : t))
            .sort((x, y) => String(x.trackingId || '').localeCompare(String(y.trackingId || '')));
          if (!tickets.some((t) => t.id === fresh.id)) tickets.unshift(fresh);
        }
      }
      const phone = String(fresh.customerPhone || '').replace(/\D/g, '').slice(-10);
      const models = await Promise.all(tickets.map((t) => (t.modelId ? getModel(t.modelId).catch(() => null) : null)));
      const needBrands = tickets.some((t, i) => t.brandId || models[i]?.brandId);
      const needCats = models.some((m) => m?.categoryId);
      const [brands, cats, cust] = await Promise.all([
        needBrands ? getBrands().catch(() => []) : [],
        needCats ? getDeviceCategories().catch(() => []) : [],
        phone.length === 10 ? ticketApi.get('/customers/lookup', { query: { mobile: phone } }).catch(() => null) : null,
      ]);
      if (!alive) return;
      const brandList = Array.isArray(brands) ? brands : [];
      const catList = Array.isArray(cats) ? cats : [];
      setLoaded({
        tickets,
        alternatePhone: cust?.alternatePhone || null,
        perDevice: tickets.map((t, i) => {
          const model = models[i];
          const brandId = t.brandId || model?.brandId;
          return {
            brandName: brandList.find((b) => b.id === brandId)?.name || null,
            categoryName: catList.find((c) => c.id === model?.categoryId)?.name || model?.category || null,
            modelNumber: (Array.isArray(model?.modelNumber) ? model.modelNumber[0] : model?.modelNumber) || null,
          };
        }),
      });
    })();
    return () => { alive = false; };
  }, [ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket || !loaded || !shop) return { ready: false, props: null };
  const parts = loaded.tickets.map((t) => receiptPropsFromTicket(t, shop, undefined, loaded.alternatePhone));
  const selected = parts[Math.max(0, loaded.tickets.findIndex((t) => t.id === ticket.id))];
  const many = loaded.tickets.length > 1;
  const total = parts.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  return {
    ready: true,
    props: {
      ...selected,
      createdAt: parts[0].createdAt,
      trackingId: many ? loaded.tickets[0].bookingNumber : selected.trackingId,
      total,
      payment: many ? paymentAcrossTickets(loaded.tickets, total) : selected.payment,
      devices: parts.flatMap((p, i) => p.devices.map((d) => ({
        ...d,
        brandName: d.brandName || loaded.perDevice[i].brandName,
        categoryName: d.categoryName || loaded.perDevice[i].categoryName,
        modelNumber: d.modelNumber || loaded.perDevice[i].modelNumber,
      }))),
    },
  };
}
