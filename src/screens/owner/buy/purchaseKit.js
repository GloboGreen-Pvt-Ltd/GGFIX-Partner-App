import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowRight } from 'lucide-react-native';
import { getShopPurchase } from '../../../api/orders';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, SellScreen, Thumb } from '../sell/kit';

// Shared by the purchase step pages (Assign Pickup → Pickup Tracking →
// Device Inspection → Final Price → Payment → Completed → Receipt). Each page
// loads GET /sell-orders/shop-purchases/{id}; after an action it moves to the
// page the server status now belongs on.

export const up = (s) => String(s || '').toUpperCase();

// Doorstep stage of a pickup purchase (OUT_FOR_PICKUP): OTP → inspection →
// owner's price decision → customer decision (revised price) → employee payment.
export function doorstepRoute(o) {
  const rv = up(o?.revision?.status);
  if (o?.payment?.recordedAt || rv === 'APPROVED' || rv === 'SHOP_CONFIRMED') return 'BuyPayment';
  if (rv === 'SHOP_APPROVED' || rv === 'REJECTED' || rv === 'NEGOTIATION') return 'BuyCustomerDecision';
  if (!o?.pickup?.inspectedAt) return 'BuyPickupTracking'; // not inspected yet, or re-check requested
  if (rv === 'SHOP_PENDING') return 'BuyFinalPrice';
  return 'BuyInspectionReview';
}

/** Page for a status; pass the order to resolve the doorstep stages and the shop handover. */
export function purchaseRoute(status, o) {
  const s = up(status);
  if (o && o.fulfilment !== 'SHOP_VISIT') {
    if (s === 'OUT_FOR_PICKUP') return doorstepRoute(o);
    if (s === 'PICKED_UP') return 'BuyHandover';
  }
  if (s === 'PRICE_REVISION_PENDING') return 'BuyCustomerDecision';
  switch (s) {
    case 'CANCELLED': return 'BuyOrderDetail';
    case 'COMPLETED': return 'BuyPurchaseDone';
    case 'PRICE_CONFIRMED': case 'PAYMENT_PENDING': case 'PAID': return 'BuyPayment';
    case 'INSPECTED': case 'REVISION_REJECTED': return 'BuyFinalPrice';
    case 'DEVICE_RECEIVED': return 'BuyInspection';
    case 'PICKUP_ASSIGNED': case 'OUT_FOR_PICKUP': case 'PICKED_UP': return 'BuyPickupTracking';
    default: return 'BuyAssignPickup';
  }
}

export function stepParams(name, id, leadRef, order) {
  return name === 'BuyOrderDetail' ? { id, kind: 'LEAD' } : { id, leadRef, order };
}

/** Replace the current page with the one the purchase's status belongs on. */
export function goToStep(navigation, o, leadRef) {
  const name = purchaseRoute(o?.status, o);
  navigation.replace(name, stepParams(name, o.id, leadRef, o));
}

/**
 * Employee pickup progress from the server's real timestamps. "Arrived" is
 * recorded when the customer's PIN is verified at the door; "Inspection Started"
 * when the employee opens the inspection (older Employee App builds don't send it:
 * then it shows done without a time once the inspection is saved).
 */
export function pickupSteps(o) {
  const pk = o?.pickup || {};
  const inspected = !!pk.inspectedAt; // cleared while a re-check is requested
  return [
    { key: 'assigned', title: 'Assigned', at: pk.assignedAt, wait: 'Assign an employee' },
    { key: 'accepted', title: 'Accepted', at: pk.acceptedAt, wait: 'Waiting for the employee to accept' },
    { key: 'journey', title: 'Journey Started', at: pk.startedAt, wait: 'Opens 1 hour before the pickup time' },
    { key: 'arrived', title: 'Arrived', at: pk.arrivedAt || null, done: !!(pk.arrivedAt || pk.otpVerifiedAt), wait: 'Employee reaches the customer' },
    { key: 'otp', title: 'OTP Verified', at: pk.otpVerifiedAt, wait: 'Customer shares the pickup PIN' },
    { key: 'inspecting', title: 'Inspection Started', at: pk.inspectionStartedAt || null, done: !!(pk.inspectionStartedAt || pk.inspectedAt), wait: 'Starts after the OTP is verified' },
    { key: 'inspected', title: 'Inspection Submitted', at: pk.inspectedAt || null, done: inspected,
      wait: up(o?.revision?.status) === 'REINSPECT' ? `Re-check requested: ${o.revision.shopNote || ''}`.trim() : 'Employee submits checks and photos' },
  ].map((st) => ({ ...st, done: st.done ?? !!st.at }));
}

export function usePurchase(route) {
  const id = route?.params?.id || route?.params?.order?.id;
  const [o, setO] = useState(route?.params?.order || null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await getShopPurchase(id);
      setO(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e);
      return null;
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  return { id, o, setO, error, load, refreshing, onRefresh };
}

/** One action at a time; errors become a toast (never a fake success). Returns fn's result, or undefined on failure. */
export function useStep() {
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);
  const run = useCallback(async (key, fn) => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      showToast({ type: e?.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error', title: 'Could not update', message: e?.message });
      return undefined;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }, []);
  return [busy, run];
}

/** Page shell: title, "Lead #…", loading / error, pull to refresh, and a "next step" link when the status moved on. */
export function PurchasePage({ navigation, route, p, title, right, rightWidth, footer, children, statuses }) {
  const leadRef = route?.params?.leadRef || p.o?.orderNumber || '';
  const header = { title, subtitle: leadRef ? `Lead ${leadRef}` : undefined, onBack: () => navigation.goBack(), right, rightWidth };
  if (!p.o) {
    return (
      <SellScreen {...header}>
        {p.error ? (
          <ErrorBox tone={p.error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={p.error.message || 'Could not load the purchase.'} onRetry={p.load} style={{ marginTop: 16 }} />
        ) : <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}
      </SellScreen>
    );
  }
  const next = purchaseRoute(p.o.status, p.o);
  // statuses: where this page still applies (e.g. reassigning while on the way) — a list, or (o) => boolean; default = its own step.
  const moved = typeof statuses === 'function' ? !statuses(p.o) : statuses ? !statuses.includes(up(p.o.status)) : next !== route?.name;
  return (
    <SellScreen {...header} footer={moved ? null : footer} refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} colors={[C.teal]} tintColor={C.teal} />}>
      {moved ? (
        <Pressable onPress={() => goToStep(navigation, p.o, leadRef)} accessibilityRole="button" accessibilityLabel="Go to the current step" className="active:opacity-80"
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.mint, borderRadius: 12, padding: 12, marginTop: 6 }}>
          <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '700', color: C.teal }}>This purchase has moved to the next step.</Text>
          <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.teal, marginRight: 4 }}>Continue</Text>
          <ArrowRight size={15} color={C.teal} />
        </Pressable>
      ) : null}
      {children}
      {p.error ? <ErrorBox tone={p.error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={p.error.message || 'Could not refresh.'} onRetry={p.load} style={{ marginTop: 14 }} /> : null}
    </SellScreen>
  );
}

// "Purple · 8 GB / 256 GB" → { ram: '8 GB', storage: '256 GB' }; a single size is storage.
export function specsOf(description) {
  const sizes = (String(description || '').match(/\d+(?:\.\d+)?\s*(?:GB|TB)/gi) || [])
    .map((s) => ({ label: s.replace(/\s*(gb|tb)$/i, (_, u) => ` ${u.toUpperCase()}`), v: parseFloat(s) * (/tb/i.test(s) ? 1024 : 1) }))
    .sort((a, b) => a.v - b.v);
  if (!sizes.length) return {};
  if (sizes.length === 1) return { storage: sizes[0].label };
  return { ram: sizes[0].label, storage: sizes[sizes.length - 1].label };
}

export function deviceSpecs(o) {
  const s = specsOf(o?.description);
  return { storage: s.storage || o?.storage || null, ram: s.ram || null };
}

/** Thumb + name + "256 GB | 8 GB RAM". */
export function DeviceRow({ o, size = 56, children }) {
  const { storage, ram } = deviceSpecs(o);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Thumb uri={o?.imageUrl} size={size} radius={10} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        <Text numberOfLines={2} style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{o?.productName || 'Device'}</Text>
        {storage || ram ? <Text style={{ fontSize: rf(11.5), color: C.text, marginTop: 4 }}>{[storage, ram && `${ram} RAM`].filter(Boolean).join('   |   ')}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function Initials({ name, size = 44 }) {
  const t = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <View style={{ height: size, width: size, borderRadius: size / 2, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: rf(size / 2.8), fontWeight: '800', color: C.teal }}>{t || '?'}</Text>
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const valid = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
export const dayLabel = (iso) => { const d = valid(iso); return d ? `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—'; };
export function timeLabel(iso) {
  const d = valid(iso);
  if (!d) return '';
  const h = d.getHours() % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
export function whenLabel(iso) {
  const d = valid(iso);
  if (!d) return '';
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return `${same ? 'Today' : dayLabel(iso)}, ${timeLabel(iso)}`;
}
