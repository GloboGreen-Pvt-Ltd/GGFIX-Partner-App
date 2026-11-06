import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BadgeCheck, CalendarClock, CircleCheck, Clock, Hash, MapPin, Navigation, Phone, Store, Truck, Wallet, XCircle } from 'lucide-react-native';
import { listingConditionLabel } from '../../../api/nearbyListings';
import {
  approvePickupRevision, cancelShopPurchase, completeShopPurchase, confirmPurchasePrice, getMyOrder, getShopPurchase, receivePurchaseDevice, recordPurchasePayout,
  rejectPickupRevision, revisePurchasePrice, scheduleShopPurchase,
} from '../../../api/orders';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, Card, ErrorBox, PrimaryButton, Section, SellScreen, Thumb, money } from '../sell/kit';
import { BellButton, dateTime, orderBucket, orderPill, scheduleLabel } from './buyKit';
import { orderItems, orderTitle } from './BuyOrdersScreen';
import PurchaseFormSheet from './PurchaseFormSheet';
import PurchaseWorkflow, { purchaseHero } from './PurchaseWorkflow';
import ScheduleSheet from './ScheduleSheet';

// Page 7 — one purchase order. kind LEAD: a device bought from a customer's
// sell lead (GET /sell-orders/shop-purchases/{id}): Manage Pickup (assign an
// employee, track the pickup), Inspection, Final Price, Payment, Complete
// (PurchaseWorkflow). kind BUY: a marketplace order (GET /customer-orders/{id}),
// read-only here — the seller completes it.

function Row({ icon: Icon, label, children, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}>
      <Icon size={17} color={C.muted} />
      <Text style={{ width: 118, fontSize: rf(12), color: C.muted, marginLeft: 10 }}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}
const Value = ({ children }) => <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, textAlign: 'right' }}>{children}</Text>;
const Pill = ({ label, fg, bg }) => (
  <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
    <Text style={{ fontSize: rf(11), fontWeight: '800', color: fg }}>{label}</Text>
  </View>
);

const PAYMENT = {
  PAID: { label: 'Paid', fg: C.green, bg: C.greenBg },
  PENDING: { label: 'Pending', fg: C.amber, bg: C.amberBg },
  CANCELLED: { label: 'Cancelled', fg: C.red, bg: C.redBg },
};

/** Both order kinds → one view model. */
function viewModel(kind, o) {
  if (kind === 'LEAD') {
    const s = String(o.status || '').toUpperCase();
    const visit = o.fulfilment === 'SHOP_VISIT';
    const when = scheduleLabel(o.pickupDate, o.pickupSlotStart);
    const hero = purchaseHero(o);
    return {
      number: o.orderNumber,
      hero,
      items: [{ title: o.productName, image: o.imageUrl, price: o.amount, condition: o.condition ? listingConditionLabel(o.condition) : null, color: o.color, storage: o.storage }],
      partyTitle: 'Customer Info',
      party: { name: o.address?.contactName || o.customer?.name || 'Customer', phone: o.address?.contactPhone || o.customer?.phone, imageUrl: o.customer?.imageUrl },
      sellNumber: o.orderNumber,
      method: visit ? 'Customer visits shop' : 'Pickup from Customer',
      MethodIcon: visit ? Store : Truck,
      scheduleTitle: visit ? 'Visit Schedule' : 'Pickup Schedule',
      schedule: when || 'Not scheduled yet',
      address: visit ? null : o.address,
      amount: o.amount,
      done: s === 'COMPLETED',
      canComplete: (o.allowedActions || []).includes('COMPLETE'),
      visit,
      lead: true,
    };
  }
  const items = orderItems(o);
  const p = o.payload || {};
  const bucket = orderBucket(o.status);
  const pill = orderPill(o.status);
  const cancelled = pill.label === 'Cancelled' || pill.label === 'Refunded';
  const seller = items.find((i) => i.shopName || i.sellerName) || {};
  const paid = /PAID|SUCCESS|COMPLETED/i.test(String(p.paymentStatus || ''));
  return {
    number: o.orderNumber,
    hero: cancelled ? { Icon: XCircle, title: `Order ${pill.label}`, sub: dateTime(o.updatedAt || o.createdAt), tint: C.redBg, fg: C.red }
      : bucket === 'COMPLETED' ? { Icon: CircleCheck, title: 'Order Completed', sub: 'Device received & payment done', tint: C.greenBg, fg: C.green }
        : { Icon: Clock, title: bucket === 'NEW' ? 'Order Placed' : (o.phaseLabel || 'Order In Progress'), sub: dateTime(o.updatedAt || o.createdAt), tint: C.amberBg, fg: C.amber },
    items: items.length ? items.map((it) => ({
      title: it.title || it.name || 'Item', image: it.imageUrl || it.image || it.productImage, price: it.price,
      condition: it.condition || it.conditionLabel, color: it.color, storage: it.storage || it.storageLabel, qty: it.quantity,
    })) : [{ title: orderTitle(o) }],
    partyTitle: 'Seller Info',
    party: seller.shopName || seller.sellerName ? { name: seller.shopName || seller.sellerName, phone: seller.shopPhone || seller.sellerPhone || p.shopPhone } : null,
    method: p.fulfilment || p.fulfillment || null,
    MethodIcon: Truck,
    scheduleTitle: 'Schedule',
    schedule: p.pickupSchedule || null,
    address: null,
    amount: o.totalAmount,
    payment: cancelled ? PAYMENT.CANCELLED : paid || bucket === 'COMPLETED' ? PAYMENT.PAID
      : p.paymentStatus ? { label: String(p.paymentStatus), fg: C.amber, bg: C.amberBg } : { label: 'Not recorded', fg: C.muted, bg: '#F1F2F4' },
    orderDate: dateTime(o.createdAt),
    done: bucket === 'COMPLETED' && !cancelled,
    canSchedule: false,
    canComplete: false,
    readOnly: !cancelled && bucket !== 'COMPLETED',
  };
}

export default function BuyOrderDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const kind = route?.params?.kind === 'LEAD' ? 'LEAD' : 'BUY';
  const [o, setO] = useState(route?.params?.order || null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState(null); // 'revise' | 'payout' | 'cancel' | 'rejectRevision'
  const [busy, setBusy] = useState(null); // action key in flight
  const lock = useRef(false);

  const load = useCallback(async () => {
    try { setO(await (kind === 'LEAD' ? getShopPurchase(id) : getMyOrder(id))); setError(null); } catch (e) { setError(e); }
  }, [id, kind]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!o) {
    return (
      <SellScreen title="Order Details" onBack={() => navigation.goBack()}>
        {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not load the order.'} onRetry={load} style={{ marginTop: 16 }} /> : <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}
      </SellScreen>
    );
  }

  const v = viewModel(kind, o);
  const HeroIcon = v.hero.Icon;
  const MethodIcon = v.MethodIcon;
  const addr = v.address;
  const hasGeo = addr?.latitude != null && addr?.longitude != null;
  const openMaps = () => {
    const dest = `${addr.latitude},${addr.longitude}`;
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`).catch(() => {});
  };
  const call = (phone) => Linking.openURL(`tel:${phone}`).catch(() => {});

  const schedule = async (slot) => {
    const res = await scheduleShopPurchase(id, slot);
    setO(res);
    setSheet(false);
    showToast({ type: 'success', title: v.visit ? 'Shop visit time updated' : 'Pickup time updated', message: 'The customer has been notified.' });
  };

  // One workflow step: optional confirm, server call, fresh detail back.
  const step = async (key, fn, done, ask) => {
    if (lock.current) return;
    if (ask && !(await confirm(ask))) return;
    lock.current = true;
    setBusy(key);
    try {
      setO(await fn());
      showToast({ type: 'success', ...done });
    } catch (e) {
      showToast({ type: e?.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error', title: 'Could not update', message: e?.message });
      if (e?.status === 409) load();
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  const item = v.items[0]?.title || 'device';
  const onAction = (key) => {
    if (key === 'assign') navigation.navigate('BuyAssignPickup', { id, order: o });
    else if (key === 'schedule') setSheet(true);
    else if (key === 'inspect') navigation.navigate('BuyInspection', { id, order: o });
    else if (key === 'track') navigation.navigate('BuyPickupTracking', { id, order: o });
    else if (key === 'review') navigation.navigate('BuyInspectionReview', { id, order: o });
    else if (key === 'handover') navigation.navigate('BuyHandover', { id, order: o });
    else if (key === 'finalPrice') navigation.navigate('BuyFinalPrice', { id, order: o });
    else if (key === 'revise' || key === 'payout' || key === 'cancel' || key === 'rejectRevision') setForm(key);
    else if (key === 'approveRevision') {
      step('approveRevision', () => approvePickupRevision(id), { title: 'Revised price approved', message: 'The employee will ask the customer now.' },
        { title: `Approve ${money(o.revision?.amount)}?`, message: `Instead of ${money(o.quotedPrice ?? o.amount)}. The employee asks the customer to agree next.`, confirmText: 'Approve' });
    }
    else if (key === 'receive') {
      step('receive', () => receivePurchaseDevice(id), { title: 'Device received', message: 'Inspect it next.' },
        { title: 'Device received?', message: `Confirm the ${item} is now at your shop.`, confirmText: 'Received' });
    } else if (key === 'confirmPrice') {
      step('confirmPrice', () => confirmPurchasePrice(id), { title: 'Price confirmed', message: 'Pay the customer and record it.' },
        { title: `Confirm ${money(o.quotedPrice ?? o.amount)}?`, message: 'The accepted quote becomes the final price.', confirmText: 'Confirm' });
    }
  };
  const complete = () => step('complete', () => completeShopPurchase(id), { title: 'Purchase completed', message: 'Device received & payment confirmed.' },
    { title: 'Complete purchase?', message: `The customer confirmed receiving ${money(v.amount)} and the ${item} is with you.`, confirmText: 'Complete' });
  const submitForm = async (vals) => {
    const res = form === 'revise' ? await revisePurchasePrice(id, { amount: Number(vals.amount), reason: vals.reason.trim() })
      : form === 'payout' ? await recordPurchasePayout(id, { method: vals.method, account: vals.account.trim(), reference: vals.reference.trim() })
        : form === 'rejectRevision' ? await rejectPickupRevision(id, vals.reason.trim())
          : await cancelShopPurchase(id, vals.reason.trim());
    setO(res);
    setForm(null);
    showToast({
      type: 'success',
      title: form === 'revise' ? 'Revised price sent' : form === 'payout' ? 'Payment recorded' : form === 'rejectRevision' ? 'Revised price rejected' : 'Purchase cancelled',
      message: form === 'cancel' ? 'The customer has been notified.' : form === 'rejectRevision' ? 'The employee will see your reason.' : 'Waiting for the customer to confirm.',
    });
  };

  let footer = null;
  if (v.done) {
    footer = <PrimaryButton title={v.lead ? 'Purchase Completed' : 'Received & Completed'} icon={CircleCheck} disabled style={{ backgroundColor: '#C3C8CE', borderColor: '#C3C8CE', opacity: 1 }} />;
  } else if (v.canComplete) {
    footer = <PrimaryButton title="Complete Purchase" icon={CircleCheck} loading={busy === 'complete'} onPress={complete} />;
  } else if (v.readOnly) {
    footer = <PrimaryButton title="Received & Completed" icon={CircleCheck} disabled />;
  }

  return (
    <SellScreen
      title="Order Details"
      subtitle={v.number}
      onBack={() => navigation.goBack()}
      right={<BellButton navigation={navigation} />}
      footer={footer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: v.hero.tint, borderRadius: 14, padding: 14, marginTop: 6 }}>
        <View style={{ height: 40, width: 40, borderRadius: 10, backgroundColor: v.hero.fg, alignItems: 'center', justifyContent: 'center' }}>
          <HeroIcon size={22} color="#FFFFFF" />
        </View>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{v.hero.title}</Text>
          {v.hero.sub ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{v.hero.sub}</Text> : null}
        </View>
      </View>

      <Section title="Order Summary">
        <Card>
          {v.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: v.items.length > 1 ? 6 : 0 }}>
              <Thumb uri={it.image} size={58} radius={10} style={{ backgroundColor: C.field }} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(13), fontWeight: '800', color: C.text }}>{it.title || 'Item'}</Text>
                  {it.price != null ? <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.teal, marginLeft: 8 }}>{money(it.price)}</Text> : null}
                </View>
                {it.condition || it.color ? (
                  <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 3 }}>{[it.condition ? `Condition: ${it.condition}` : null, it.color ? `Color: ${it.color}` : null].filter(Boolean).join('  •  ')}</Text>
                ) : null}
                {it.storage || it.qty ? (
                  <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{[it.storage ? `Storage: ${it.storage}` : null, it.qty ? `Qty ${it.qty}` : null].filter(Boolean).join('  •  ')}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      </Section>

      {v.party ? (
        <Section title={v.partyTitle}>
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            {v.party.imageUrl ? (
              <Image source={{ uri: v.party.imageUrl }} style={{ height: 42, width: 42, borderRadius: 21, backgroundColor: C.field }} />
            ) : (
              <View style={{ height: 42, width: 42, borderRadius: 21, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.teal }}>{String(v.party.name || '?').trim().charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{v.party.name}</Text>
              {v.party.phone ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>{v.party.phone}</Text> : null}
            </View>
            {v.party.phone ? (
              <Pressable onPress={() => call(v.party.phone)} accessibilityRole="button" accessibilityLabel={`Call ${v.party.name}`} style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
                <Phone size={18} color={C.teal} />
              </Pressable>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {v.method || v.schedule ? (
        <Section title="Fulfillment Details">
          <Card style={{ paddingVertical: 4 }}>
            {v.method ? <Row icon={MethodIcon} label="Method" last={!v.schedule && !addr?.line}><Value>{v.method}</Value></Row> : null}
            {v.sellNumber ? <Row icon={Hash} label="Sell Order ID"><Value>{v.sellNumber}</Value></Row> : null}
            {v.schedule ? <Row icon={CalendarClock} label={v.scheduleTitle} last={!addr?.line}><Value>{v.schedule}</Value></Row> : null}
            {addr?.line ? (
              <Row icon={MapPin} label="Address" last>
                <Value>{addr.line}</Value>
                {hasGeo ? (
                  <Pressable onPress={openMaps} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Navigation size={12} color={C.teal} />
                    <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: C.teal, marginLeft: 4 }}>Directions</Text>
                  </Pressable>
                ) : null}
              </Row>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {v.lead ? <PurchaseWorkflow o={o} busy={busy} onAction={onAction} /> : null}

      {!v.lead ? (
      <Section title="Payment Details">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon={Wallet} label="Amount"><Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{money(v.amount)}</Text></Row>
          <Row icon={BadgeCheck} label="Status" last={!v.orderDate}><Pill {...v.payment} /></Row>
          {v.orderDate ? <Row icon={CalendarClock} label="Order date" last><Value>{v.orderDate}</Value></Row> : null}
        </Card>
      </Section>
      ) : null}

      {v.readOnly ? (
        <ErrorBox tone="warning" message="Marking a marketplace purchase as received isn’t available on the server yet. The order updates here when the seller completes it." style={{ marginTop: 14 }} />
      ) : null}

      <ScheduleSheet
        visible={sheet}
        title={v.visit ? 'Schedule Shop Visit' : 'Schedule Pickup'}
        initialDate={o.pickupDate}
        initialStart={o.pickupSlotStart}
        onClose={() => setSheet(false)}
        onSubmit={schedule}
      />
      <PurchaseFormSheet
        visible={!!form}
        onClose={() => setForm(null)}
        onSubmit={submitForm}
        danger={form === 'cancel'}
        {...(form === 'revise' ? {
          title: 'Revise Price',
          sub: `Accepted quote ${money(o.quotedPrice ?? o.amount)}. The customer must approve the new price.`,
          submitLabel: 'Send to Customer',
          fields: [
            { key: 'amount', label: 'Revised price', type: 'amount', required: true, placeholder: 'Enter amount' },
            { key: 'reason', label: 'Reason', type: 'multiline', required: true, maxLength: 500, placeholder: 'e.g. Back glass cracked, battery health 71%' },
          ],
        } : form === 'payout' ? {
          title: 'Record Payment',
          sub: `Pay ${money(v.amount)} to the customer first, then record the transfer. It counts as paid only when the customer confirms.`,
          submitLabel: 'Record Payment',
          fields: [
            { key: 'method', label: 'Paid by', type: 'choice', options: [{ value: 'UPI', label: 'UPI' }, { value: 'BANK', label: 'Bank transfer' }], initial: o.payment?.method || 'UPI' },
            { key: 'account', label: 'Customer UPI ID / account', required: true, autoCapitalize: 'none', maxLength: 60, initial: o.payment?.account || '', placeholder: (vals) => (vals.method === 'BANK' ? 'Account no. / IFSC' : 'name@bank') },
            { key: 'reference', label: 'Transaction reference (UTR)', required: true, autoCapitalize: 'characters', maxLength: 30, placeholder: 'e.g. 431298765012' },
          ],
        } : form === 'rejectRevision' ? {
          title: 'Reject Revised Price',
          sub: `${o.pickup?.personName || 'The employee'} asked for ${money(o.revision?.amount)} instead of ${money(o.quotedPrice ?? o.amount)}.`,
          submitLabel: 'Reject',
          fields: [{ key: 'reason', label: 'Reason', type: 'multiline', required: true, maxLength: 500, placeholder: 'e.g. Offer ₹45,000 — scratches are minor' }],
        } : {
          title: 'Cancel Purchase',
          sub: (o.pickup?.pickedUpAt || o.pickup?.receivedAt) ? 'Return the device to the customer.' : 'The customer and the employee will see the purchase as cancelled.',
          submitLabel: 'Cancel Purchase',
          fields: [{ key: 'reason', label: 'Reason', type: 'multiline', required: true, maxLength: 500, placeholder: 'Why are you cancelling?' }],
        })}
      />
    </SellScreen>
  );
}
