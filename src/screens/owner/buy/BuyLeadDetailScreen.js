import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowRight, Check, ChevronRight, CircleCheck, Clock, Lock, Navigation, Send, Store, Truck, XCircle } from 'lucide-react-native';
import { getListingOrigin, listingConditionLabel } from '../../../api/nearbyListings';
import { getMyLeadQuote, getShopPurchase, submitLeadQuote } from '../../../api/orders';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import {
  C, CONTENT_MAX, Card, ChoiceCard, ErrorBox, InfoRow, PrimaryButton, Section, SellScreen, TextField, Thumb, cleanAmount, money,
} from '../sell/kit';
import { BellButton, savePrevQuote, scheduleLabel, timeAgo } from './buyKit';
import { leadDistance, leadPrice } from './BuyLeadsScreen';
import { purchaseRoute, stepParams, up } from './purchaseKit';
import { purchaseHero } from './PurchaseWorkflow';

// Page 4 — a customer's sell request: device, condition, location; the shop's
// quote and fulfilment choice (POST /sell-orders/listing-quotations). The
// customer sees the quote on their sell order and can accept it. Submitting
// again revises this shop's quote. What was typed is kept per lead while the
// app runs (Back and return keeps it). A sent quote opens page 5
// (BuyLeadQuote: status, negotiation, call / chat).

const drafts = new Map(); // lead id → { amount, fulfil }

// Every image the lead carries (cover first, no duplicates).
const leadImages = (l) => {
  const extra = [l.images, l.imageUrls, l.extraImageUrls, l.photos].flatMap((v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim().startsWith('[')) { try { return JSON.parse(v); } catch { return []; } }
    return [];
  });
  return [...new Set([l.productImage, ...extra].map((u) => (typeof u === 'string' ? u : u?.url)).filter((u) => typeof u === 'string' && /^https?:/.test(u)))];
};

// Auto-advancing image strip: swipe any time; a touch pauses it for a few
// seconds; the timer stops when the screen loses focus or unmounts.
function ImageCarousel({ images, size }) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const pausedUntil = useRef(0);
  const idx = useRef(0);
  useFocusEffect(useCallback(() => {
    if (images.length < 2) return undefined;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      idx.current = (idx.current + 1) % images.length;
      ref.current?.scrollTo({ x: idx.current * size, animated: true });
      setIndex(idx.current);
    }, 3000);
    return () => clearInterval(t);
  }, [images.length, size]));
  const pause = () => { pausedUntil.current = Date.now() + 5000; };
  if (!images.length) {
    return <Thumb uri={null} size={Math.min(size, 240)} radius={16} style={{ alignSelf: 'center', marginTop: 6 }} />;
  }
  return (
    <View style={{ marginTop: 6, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F6F7F9' }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={pause}
        onTouchStart={pause}
        onMomentumScrollEnd={(e) => { idx.current = Math.round(e.nativeEvent.contentOffset.x / size); setIndex(idx.current); pause(); }}
      >
        {images.map((u) => <Image key={u} source={{ uri: u }} style={{ width: size, height: Math.min(size, 240) }} resizeMode="contain" accessibilityIgnoresInvertColors />)}
      </ScrollView>
      {images.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 6 }}>
          {images.map((u, i) => <View key={u} style={{ height: 6, width: i === index ? 14 : 6, borderRadius: 3, backgroundColor: i === index ? C.green : '#D1D5DB' }} />)}
        </View>
      ) : null}
    </View>
  );
}

export default function BuyLeadDetailScreen({ navigation, route }) {
  const l = route?.params?.lead || {};
  // 'detail' = Product Detail (read only); otherwise Product Quotation (quote form).
  const mode = route?.params?.mode === 'detail' ? 'detail' : 'quote';
  const { width } = useWindowDimensions();
  const saved = drafts.get(l.id) || { amount: '', fulfil: 'PICKUP' };
  const [amount, setAmountState] = useState(saved.amount);
  const [fulfil, setFulfilState] = useState(saved.fulfil);
  // Once a fulfilment option is chosen, only its text shows (Change reopens the options while editable).
  const [picked, setPicked] = useState(!!saved.picked);
  const setAmount = (v) => { setAmountState(v); drafts.set(l.id, { amount: v, fulfil, picked }); };
  const setFulfil = (v) => { setFulfilState(v); setPicked(true); drafts.set(l.id, { amount, fulfil: v, picked: true }); };
  const changeFulfil = () => { setPicked(false); drafts.set(l.id, { amount, fulfil, picked: false }); };

  const [mine, setMine] = useState(null); // { sellOrderId, orderStatus, quotation }
  const [purchase, setPurchase] = useState(null); // shop purchase once the quote is accepted
  const [origin, setOrigin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await getMyLeadQuote(l.id);
      setMine(res);
      setLoadError(null);
      // First visit with a quote already sent: show it in the form.
      const q = res?.quotation;
      const accepted = up(q?.status) === 'ACCEPTED';
      // Accepted: the sent quote is final — drop any local draft.
      if (q && (accepted || !drafts.has(l.id))) {
        if (accepted) drafts.delete(l.id);
        setAmountState(String(Number(q.quotationPrice)));
        setFulfilState(/visit the shop/i.test(q.note || '') ? 'SHOP_VISIT' : 'PICKUP');
        setPicked(true);
      }
      if (accepted && res?.sellOrderId) {
        const p = await getShopPurchase(res.sellOrderId).catch(() => null);
        setPurchase(p);
        if (p?.fulfilment) setFulfilState(p.fulfilment === 'SHOP_VISIT' ? 'SHOP_VISIT' : 'PICKUP');
      }
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [l.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { getListingOrigin().then(setOrigin).catch(() => {}); }, []);

  const q = mine?.quotation || null;
  const qStatus = String(q?.status || '').toUpperCase();
  const orderOpen = !mine?.orderStatus || ['PENDING', 'AWAITING_QUOTATION', 'DRAFT'].includes(String(mine.orderStatus).toUpperCase());
  const blocked = loadError?.code === 'SERVER_UPDATE_REQUIRED';
  const closed = qStatus === 'ACCEPTED' || qStatus === 'REJECTED' || !orderOpen;
  const canSubmit = !loading && !blocked && !closed;
  // Quote already sent and still open: "Continue" opens its status page, or
  // re-sends first when the price / fulfilment was changed here.
  const sentOpen = !!q && qStatus === 'PROPOSED';
  const edited = sentOpen && (Number(amount) !== Number(q.quotationPrice)
    || fulfil !== (/visit the shop/i.test(q.note || '') ? 'SHOP_VISIT' : 'PICKUP'));

  // which: 'quote' (price button) | 'fulfil' (fulfilment button) — same API, own spinner.
  const submit = async (which = 'quote') => {
    const v = Number(amount);
    if (!(v > 0)) {
      setError({ message: 'Enter your buying price' });
      showToast({ type: 'error', title: 'Enter your buying price' });
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(which);
    setError(null);
    try {
      const res = await submitLeadQuote({ listingId: l.id, quotationPrice: v, fulfilment: fulfil });
      // Revised price: remember the one it replaced for the Quotation page.
      if (res?.revised && q && Number(q.quotationPrice) !== v) {
        savePrevQuote(l.id, { price: Number(q.quotationPrice), at: q.updatedAt || q.createdAt });
      }
      setMine(res);
      drafts.delete(l.id);
      showToast({ type: 'success', title: res?.revised ? 'Quote updated' : 'Quote sent', message: 'The customer can now see and accept it.' });
      openQuote(res);
    } catch (e) {
      setError(e);
      showToast({ type: 'error', title: 'Quote not sent', message: e?.message });
      if (e?.status === 409) load();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const openQuote = (quote) => navigation.push('BuyLeadQuote', { lead: l, quote, fromDetail: true });

  // Accepted quote: price + fulfilment are locked; the purchase is managed from Order Details.
  const accepted = qStatus === 'ACCEPTED';
  const visit = fulfil === 'SHOP_VISIT';
  const orderId = mine?.sellOrderId || purchase?.id || null;
  const leadRef = purchase?.orderNumber || '';
  const ps = up(purchase?.status);
  // Shop visit not under way yet → Schedule Shop Visit page; otherwise Order Details.
  const manage = () => (visit && (!ps || ['SELL_CONFIRMED', 'PICKUP_SCHEDULED', 'PICKUP_ASSIGNED'].includes(ps))
    ? navigation.navigate('BuyScheduleVisit', { id: orderId, order: purchase || undefined })
    : navigation.navigate('BuyOrderDetail', { id: orderId, kind: 'LEAD', order: purchase || undefined }));
  const pk = purchase?.pickup || {};
  const pay = purchase?.payment || {};
  const rv = up(purchase?.revision?.status);
  const priceDone = ['PRICE_CONFIRMED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED'].includes(ps) || !!pay.recordedAt || rv === 'APPROVED' || rv === 'SHOP_CONFIRMED';
  // Real server state: pickup = doorstep inspection after the OTP, employee payment, then the shop handover.
  const steps = !accepted ? [] : [
    { key: 'schedule', label: visit ? 'Schedule Shop Visit' : 'Schedule Pickup', done: !!purchase?.pickupDate, sub: scheduleLabel(purchase?.pickupDate, purchase?.pickupSlotStart) },
    !visit && { key: 'assign', label: 'Assign Employee', done: !!(pk.personName || pk.assignedAt), sub: pk.personName ? `${pk.personName}${pk.acceptedAt ? ' · Accepted' : ''}` : null },
    visit
      ? { key: 'inspect', label: 'Inspection', done: !!purchase?.inspection }
      : { key: 'inspect', label: 'Doorstep Inspection', done: !!pk.inspectedAt, sub: pk.otpVerifiedAt ? 'OTP verified' : pk.startedAt ? 'Employee on the way' : null },
    { key: 'price', label: 'Final Price', done: priceDone, sub: rv === 'SHOP_PENDING' || (ps === 'OUT_FOR_PICKUP' && pk.inspectedAt && !rv) ? 'Needs your approval'
      : rv === 'REINSPECT' ? 'Re-check requested'
        : rv === 'NEGOTIATION' || rv === 'REJECTED' ? 'Customer wants another price'
          : rv === 'SHOP_APPROVED' || ps === 'PRICE_REVISION_PENDING' ? 'Waiting for customer' : null },
    { key: 'payment', label: 'Payment', done: visit ? up(pay.status) === 'PAID' || ['PAID', 'COMPLETED'].includes(ps) : !!pay.recordedAt, sub: pay.recordedAt && up(pay.status) !== 'PAID' ? 'Awaiting customer confirmation' : null },
    !visit && { key: 'handover', label: 'Shop Handover', done: !!pk.receivedAt },
    { key: 'complete', label: 'Completed', done: ps === 'COMPLETED' },
  ].filter(Boolean);
  const lastDone = steps.reduce((n, st, i) => (st.done ? i : n), -1);
  const current = ps === 'CANCELLED' ? -1 : steps.findIndex((st, i) => i > lastDone && !st.done);
  // The current step opens the page the server status belongs on.
  const openStep = (st) => {
    if (!orderId) return;
    if (st.key === 'schedule') { manage(); return; }
    if (st.key === 'assign') { navigation.navigate('BuyAssignPickup', { id: orderId, leadRef, order: purchase || undefined }); return; }
    const name = purchaseRoute(purchase?.status, purchase || undefined);
    navigation.navigate(name, stepParams(name, orderId, leadRef, purchase || undefined));
  };

  const price = leadPrice(l);
  const dist = leadDistance(l, origin);
  const place = [l.city, l.state].filter(Boolean).join(', ') || l.address || null;
  const imgSize = Math.min(width, CONTENT_MAX) - 32;
  const hasGeo = l.latitude != null && l.longitude != null;
  const openMaps = () => {
    const dest = `${l.latitude},${l.longitude}`;
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    Linking.openURL(url).catch(() => {});
  };

  const status = !q ? null
    : qStatus === 'ACCEPTED' ? { Icon: CircleCheck, title: 'Customer accepted your quote', fg: C.green, bg: C.greenBg }
      : qStatus === 'REJECTED' ? { Icon: XCircle, title: 'Customer chose another shop', fg: C.red, bg: C.redBg }
        : !orderOpen ? { Icon: XCircle, title: 'Customer has already chosen a quote', fg: C.muted, bg: '#F1F2F4' }
          : { Icon: Clock, title: 'Quote sent · waiting for the customer', fg: C.amber, bg: C.amberBg };

  return (
    <SellScreen
      title={mode === 'detail' ? 'Product Detail' : 'Product Quotation'}
      subtitle={mode === 'detail' ? 'Lead information' : accepted ? 'Quote accepted' : 'Send or revise your quote'}
      onBack={() => navigation.goBack()}
      right={<BellButton navigation={navigation} />}
    >
      {mode === 'detail' ? <ImageCarousel images={leadImages(l)} size={imgSize} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Thumb uri={l.productImage} size={56} radius={10} />
          <Text numberOfLines={2} style={{ flex: 1, marginLeft: 10, fontSize: rf(12), color: C.muted }}>Quote a fixed buying price and how you will collect the device.</Text>
        </View>
      )}
      <Text style={{ fontSize: rf(17), fontWeight: '800', color: C.text, marginTop: 12 }}>{l.productName || 'Device'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text style={{ flex: 1, fontSize: rf(13), color: C.text }}>
          Expected Price: <Text style={{ fontWeight: '800', color: price ? C.teal : C.amber }}>{price || 'Open for quotation'}</Text>
        </Text>
        {l.condition ? (
          <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.greenBg }}>
            <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: '#0B6B4B' }}>{listingConditionLabel(l.condition)}</Text>
          </View>
        ) : null}
      </View>

      {status ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: status.bg, borderRadius: 12, padding: 12, marginTop: 12 }}>
          <status.Icon size={20} color={status.fg} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{status.title}</Text>
            <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>Your quote {money(q.quotationPrice)} · {timeAgo(q.updatedAt || q.createdAt)}</Text>
          </View>
        </View>
      ) : null}

      {mode === 'detail' ? (
      <Section title="Device Details">
        <Card>
          <InfoRow label="Condition" value={l.condition ? listingConditionLabel(l.condition) : null} />
          {l.description ? <InfoRow label="Description" value={l.description} /> : null}
          <InfoRow label="Location" value={[place, dist].filter(Boolean).join(' · ')} />
          <InfoRow label="Posted" value={timeAgo(l.createdAt)} />
        </Card>
        {hasGeo ? <PrimaryButton title="Directions" icon={Navigation} variant="soft" small onPress={openMaps} style={{ marginTop: 10, alignSelf: 'flex-start' }} /> : null}
      </Section>
      ) : null}

      {accepted ? (
        <Section title="Accepted Quote">
          <Card>
            <InfoRow label="Status" value={purchase ? purchaseHero(purchase).title : 'Quote Accepted'} />
            <InfoRow label="Accepted Price" value={money(q.quotationPrice)} />
            <InfoRow label="Fulfilment" value={visit ? 'Customer will visit my shop' : 'Pickup from Customer'} />
            {purchase?.orderNumber ? <InfoRow label="Order No." value={purchase.orderNumber} /> : null}
            <InfoRow label={visit ? 'Visit Schedule' : 'Pickup Schedule'} value={scheduleLabel(purchase?.pickupDate, purchase?.pickupSlotStart) || 'Not scheduled yet'} />
            {!visit ? <InfoRow label="Pickup Employee" value={pk.personName ? [pk.personName, pk.personPhone, pk.acceptedAt ? 'Accepted' : 'Not accepted yet'].filter(Boolean).join(' · ') : 'Not assigned yet'} /> : null}
            <InfoRow label="Accepted" value={timeAgo(q.updatedAt || q.createdAt)} />
          </Card>
        </Section>
      ) : null}

      {accepted ? (
        <Section title="Next Actions">
          <Card>
            {steps.map((st, i) => {
              const now = i === current;
              return (
                <Pressable
                  key={st.key}
                  onPress={() => now && openStep(st)}
                  disabled={!now || !orderId}
                  accessibilityRole="button"
                  accessibilityLabel={st.label}
                  className="active:opacity-80"
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i === steps.length - 1 ? 0 : 1, borderBottomColor: '#F1F3F5' }}
                >
                  <View style={{ height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: st.done ? C.teal : '#FFFFFF', borderWidth: 2, borderColor: st.done || now ? C.teal : C.border }}>
                    {st.done ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: rf(13), fontWeight: '800', color: st.done || now ? C.text : C.muted }}>{st.label}</Text>
                    {st.sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{st.sub}</Text> : null}
                  </View>
                  {st.done ? <Text style={{ fontSize: rf(11), fontWeight: '700', color: C.green }}>Done</Text> : null}
                </Pressable>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} /> : null}

      {mode === 'quote' ? (<>
      {accepted ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18 }}>
          <Lock size={14} color={C.muted} />
          <Text style={{ flex: 1, marginLeft: 6, fontSize: rf(11.5), color: C.muted }}>Quote price and fulfilment are locked after the customer accepted.</Text>
        </View>
      ) : null}

      <TextField
        label="Your Quote"
        required
        prefix="₹"
        value={amount}
        onChangeText={(t) => { setAmount(cleanAmount(t)); setError(null); }}
        placeholder="Enter your buying price"
        keyboardType="decimal-pad"
        maxLength={9}
        editable={canSubmit}
        style={{ marginTop: accepted ? 8 : 18 }}
      />
      {!accepted ? (
        <PrimaryButton
          title={sentOpen ? 'Update Quotation' : 'Submit Quotation'}
          icon={Send}
          small
          onPress={() => submit('quote')}
          loading={busy === 'quote'}
          disabled={!canSubmit || !!busy || (sentOpen && !edited)}
          style={{ marginTop: 10 }}
        />
      ) : null}

      <Section title="Order Fulfillment">
        {picked || (q && !canSubmit) ? (
          // Chosen: just the selected method as text.
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: rf(13), fontWeight: '700', color: C.text }}>
              {visit ? 'Customer will visit my shop' : `Pickup from Customer${dist ? ` (${dist})` : ''}`}
            </Text>
            {canSubmit ? (
              <Pressable onPress={changeFulfil} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change fulfilment">
                <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.teal }}>Change</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <ChoiceCard radio title="Pickup from Customer" sub={dist ? `(${dist})` : 'You collect the device'} selected={fulfil === 'PICKUP'} onPress={() => canSubmit && setFulfil('PICKUP')} style={{ marginTop: 0 }} />
            <ChoiceCard radio title="Customer will visit my shop" selected={fulfil === 'SHOP_VISIT'} onPress={() => canSubmit && setFulfil('SHOP_VISIT')} />
          </>
        )}
      </Section>

      {accepted ? (
        <PrimaryButton title={visit ? 'Open Shop Visit' : 'Open Pickup'} icon={visit ? Store : Truck} onPress={manage} disabled={!orderId} style={{ marginTop: 16 }} />
      ) : (
        <>
          <PrimaryButton
            title="Submit Fulfillment"
            icon={Send}
            onPress={() => submit('fulfil')}
            loading={busy === 'fulfil'}
            disabled={!canSubmit || !!busy || (sentOpen && !edited) || !picked}
            style={{ marginTop: 16 }}
          />
          {sentOpen ? (
            <PrimaryButton title="View Quotation Status" icon={ArrowRight} variant="outline" small onPress={() => openQuote(mine)} style={{ marginTop: 8 }} />
          ) : null}
        </>
      )}
      </>) : null}

      {blocked ? <ErrorBox tone="warning" message={loadError.message} style={{ marginTop: 16 }} /> : null}
      {loadError && !blocked ? <ErrorBox message={loadError.message || 'Could not load your quote.'} onRetry={() => { setLoading(true); load(); }} style={{ marginTop: 16 }} /> : null}
      {error ? <ErrorBox message={error.message || 'Could not send the quote.'} style={{ marginTop: 16 }} /> : null}
    </SellScreen>
  );
}
