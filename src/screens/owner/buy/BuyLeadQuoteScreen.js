import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowRight, CalendarDays, Check, ChevronRight, CircleCheck, Clock, Handshake, MapPin, MessageCircle, PenLine, Phone, Store, Truck, X, XCircle,
} from 'lucide-react-native';
import { listingConditionLabel } from '../../../api/nearbyListings';
import { getMyLeadQuote } from '../../../api/orders';
import { openShopChatForListing } from '../../../api/chat';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, Card, ErrorBox, PrimaryButton, Section, SellScreen, Thumb, money } from '../sell/kit';
import { BellButton, dateTime, readPrevQuote } from './buyKit';
import { leadDistance } from './BuyLeadsScreen';
import PurchaseManagement from './PurchaseManagement';

// Page 5 — after Lead Details: this shop's quote on a customer's sell request
// (GET /sell-orders/listing-quotations/{listingId}). Where it stands, the
// negotiation steps, and revise / call / chat. Once the customer accepts, the
// deal is a purchase order and the customer's number is shared.

const OPEN = ['PENDING', 'AWAITING_QUOTATION', 'DRAFT'];
const REVISED_MS = 60 * 1000;
const RESPONSE_MS = 24 * 3600 * 1000;

function stateOf(mine) {
  const q = mine?.quotation;
  if (!q) return 'NONE';
  const qs = String(q.status || '').toUpperCase();
  const os = String(mine.orderStatus || '').toUpperCase();
  if (qs === 'ACCEPTED') return 'ACCEPTED';
  if (qs === 'REJECTED') return 'LOST';
  if (os === 'CANCELLED') return 'CANCELLED';
  if (os && !OPEN.includes(os)) return 'LOST';
  return 'WAITING';
}

const HERO = {
  WAITING: { Icon: Handshake, title: 'Quote Submitted', sub: 'Waiting for customer response', tint: C.greenBg, fg: C.teal },
  ACCEPTED: { Icon: CircleCheck, title: 'Quote Accepted', sub: 'The customer accepted your quote', tint: C.greenBg, fg: C.green },
  LOST: { Icon: XCircle, title: 'Quote Not Selected', sub: 'The customer chose another shop', tint: '#F1F2F4', fg: C.muted },
  CANCELLED: { Icon: XCircle, title: 'Request Closed', sub: 'The customer cancelled this sell request', tint: '#F1F2F4', fg: C.muted },
};

function Step({ title, sub, mode, last }) {
  // mode: done | active | todo | failed
  const ring = mode === 'todo' ? C.border : mode === 'failed' ? C.red : C.teal;
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ alignItems: 'center', width: 22 }}>
        <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: ring, backgroundColor: mode === 'done' ? C.teal : mode === 'failed' ? C.red : '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: mode === 'active' ? 8 : 0 }}>
          {mode === 'done' ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
          {mode === 'failed' ? <X size={12} color="#FFFFFF" strokeWidth={3} /> : null}
          {mode === 'active' ? <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: C.teal }} /> : null}
        </View>
        {!last ? <View style={{ flex: 1, width: 2, minHeight: 14, backgroundColor: mode === 'done' ? C.teal : C.border }} /> : null}
      </View>
      <View style={{ flex: 1, marginLeft: 10, marginBottom: last ? 0 : 10, borderRadius: 10, paddingHorizontal: mode === 'active' ? 10 : 0, paddingVertical: mode === 'active' ? 8 : 0, backgroundColor: mode === 'active' ? C.mint : 'transparent' }}>
        <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: mode === 'todo' ? C.muted : C.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11), color: mode === 'failed' ? C.red : C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function BuyLeadQuoteScreen({ navigation, route }) {
  const l = route?.params?.lead || {};
  const [mine, setMine] = useState(route?.params?.quote || null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const chatLock = useRef(false);

  const load = useCallback(async () => {
    try { setMine(await getMyLeadQuote(l.id)); setError(null); } catch (e) { setError(e); }
  }, [l.id]);
  const [prev, setPrev] = useState(null);
  useFocusEffect(useCallback(() => {
    load();
    readPrevQuote(l.id).then(setPrev);
  }, [load, l.id]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  // Response countdown ticks once a minute.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Back to Lead Details (form keeps the quote) — pop when we came from it.
  const openLead = () => (route?.params?.fromDetail ? navigation.goBack() : navigation.push('BuyLeadDetail', { lead: l }));

  const openChat = async () => {
    if (chatLock.current) return;
    chatLock.current = true;
    setChatBusy(true);
    try {
      const t = await openShopChatForListing(l.id);
      navigation.navigate('ShopChatThread', { threadId: t.id });
    } catch (e) {
      showToast({ type: e?.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error', title: 'Chat unavailable', message: e?.message });
    } finally {
      chatLock.current = false;
      setChatBusy(false);
    }
  };

  const state = stateOf(mine);
  const q = mine?.quotation;
  const phone = mine?.customer?.phone || null;
  const call = () => {
    if (!phone) {
      showToast({ type: 'info', title: 'Number shared after acceptance', message: 'The customer’s number is shared once they accept your quote. Use Chat meanwhile.' });
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const ref = mine?.sellNumber || `#${String(l.id || '').slice(0, 8).toUpperCase()}`;
  const header = { title: 'Quotation', subtitle: `Lead ${ref}`, onBack: () => navigation.goBack(), right: <BellButton navigation={navigation} /> };

  // Accepted → Purchase Management (collection method, progress, Manage Pickup).
  if (state === 'ACCEPTED') {
    return (
      <PurchaseManagement navigation={navigation} lead={l} mine={mine} leadRef={ref} error={error} onReload={load}
        refreshing={refreshing} onRefresh={onRefresh} onCall={call} onChat={openChat} chatBusy={chatBusy} />
    );
  }

  if (!mine || state === 'NONE') {
    return (
      <SellScreen {...header}>
        {error ? (
          <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not load your quote.'} onRetry={load} style={{ marginTop: 16 }} />
        ) : !mine ? <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} /> : (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>No quote sent yet</Text>
            <PrimaryButton title="Send a Quote" onPress={openLead} style={{ marginTop: 14, alignSelf: 'stretch' }} />
          </View>
        )}
      </SellScreen>
    );
  }

  const hero = HERO[state];
  const HeroIcon = hero.Icon;
  const expected = Number(l.expectedPrice) > 0 ? money(l.expectedPrice) : 'Open';
  const revised = q.updatedAt && q.createdAt && new Date(q.updatedAt) - new Date(q.createdAt) > REVISED_MS;
  const waiting = state === 'WAITING';
  // Previous price only when this device recorded the revision (server keeps the latest only).
  const previous = revised && prev && Number(prev.price) > 0 && Number(prev.price) !== Number(q.quotationPrice) ? prev : null;
  const visit = /visit the shop/i.test(q.note || '');
  const place = [l.city, l.state].filter(Boolean).join(', ') || l.address || null;
  const specs = [l.condition ? listingConditionLabel(l.condition) : null, ...String(l.description || '').split('·').map((s) => s.trim())]
    .filter(Boolean).join(' · ');
  // Same 24-hour response window the page has always stated, counted from the latest quote.
  const leftMs = new Date(q.updatedAt || q.createdAt).getTime() + RESPONSE_MS - now;
  const leftLabel = Number.isFinite(leftMs) && leftMs > 0 ? `${Math.floor(leftMs / 3600000)}h ${Math.floor((leftMs % 3600000) / 60000)}m` : null;

  const steps = [
    { title: 'Quote Submitted', sub: [previous ? money(previous.price) : !revised ? money(q.quotationPrice) : null, dateTime(q.createdAt)].filter(Boolean).join(' · '), mode: 'done' },
    revised ? { title: 'Quote Revised', sub: `${money(q.quotationPrice)} · ${dateTime(q.updatedAt)}`, mode: 'done' } : null,
    waiting ? { title: 'Awaiting Customer Response', sub: 'Waiting for acceptance or negotiation...', mode: 'active' }
      : { title: 'Customer Responded', sub: null, mode: 'done' },
    state === 'ACCEPTED' ? { title: 'Final Decision', sub: `Accepted at ${money(q.quotationPrice)}`, mode: 'done' }
      : state === 'LOST' ? { title: 'Final Decision', sub: 'Customer chose another shop', mode: 'failed' }
        : state === 'CANCELLED' ? { title: 'Final Decision', sub: 'Request cancelled by the customer', mode: 'failed' }
          : { title: 'Final Decision', sub: 'Accept / Reject', mode: 'todo' },
  ].filter(Boolean);

  const divider = <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 8 }} />;

  return (
    <SellScreen
      {...header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
      footer={<PrimaryButton title="Continue" icon={CalendarDays} iconRight={ArrowRight} onPress={() => navigation.popTo('OwnerSellRequests')} />}
    >
      {/* Status + response window */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: hero.tint, borderRadius: 16, padding: 14, marginTop: 6 }}>
        <View style={{ height: 46, width: 46, borderRadius: 23, backgroundColor: waiting ? C.teal : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          {waiting ? <Clock size={24} color="#FFFFFF" /> : <HeroIcon size={24} color={hero.fg} />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{waiting ? (revised ? 'Revised Quote Sent' : 'Quote Sent') : hero.title}</Text>
          <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>{waiting ? 'Awaiting customer response' : hero.sub}</Text>
        </View>
        {waiting && leftLabel ? (
          <View style={{ alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 }}>
            <Text style={{ fontSize: rf(10.5), color: C.text }}>Respond within</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Clock size={13} color={C.amber} />
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.amber, marginLeft: 4 }}>{leftLabel}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Your quote · previous quote · expected price */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 12, marginTop: 12 }}>
        <View style={{ flex: 1.3 }}>
          <Text style={{ fontSize: rf(11.5), color: C.muted }}>Your Quote{revised ? <Text style={{ color: C.green, fontWeight: '800' }}> (Revised)</Text> : null}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: rf(22), fontWeight: '800', color: C.teal, marginTop: 2 }}>{money(q.quotationPrice)}</Text>
        </View>
        {previous ? (
          <>
            {divider}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: rf(11.5), color: C.muted }}>Previous Quote</Text>
              <Text numberOfLines={1} style={{ fontSize: rf(15), fontWeight: '700', color: C.muted, marginTop: 4, textDecorationLine: 'line-through' }}>{money(previous.price)}</Text>
            </View>
          </>
        ) : null}
        {divider}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: rf(11.5), color: C.muted }}>Expected Price</Text>
          <Text numberOfLines={1} style={{ fontSize: rf(15), fontWeight: '800', color: C.text, marginTop: 4 }}>{expected}</Text>
        </View>
      </View>

      <Section title="Lead Details">
        <Card>
          <Pressable onPress={openLead} accessibilityRole="button" accessibilityLabel="Open lead details" className="active:opacity-80">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Thumb uri={l.productImage} size={60} radius={10} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <Text numberOfLines={1} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{l.productName || 'Device'}</Text>
                {specs ? <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 3 }}>{specs}</Text> : null}
              </View>
              <ChevronRight size={18} color={C.muted} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F3F5', marginTop: 10, paddingTop: 10 }}>
              <MapPin size={14} color={C.muted} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(12), color: C.text, marginLeft: 5 }}>{place || leadDistance(l) || 'Location not shared'}</Text>
              <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: C.greenBg }}>
                <Text style={{ fontSize: rf(11), fontWeight: '800', color: C.green }}>Buy Lead</Text>
              </View>
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.mint, borderRadius: 12, padding: 12, marginTop: 12 }}>
            {visit ? <Store size={22} color={C.teal} /> : <Truck size={22} color={C.teal} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: rf(11.5), color: C.text }}>Fulfilment Method</Text>
              <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text, marginTop: 1 }}>{visit ? 'Customer will visit my shop' : 'Pickup from Customer'}</Text>
            </View>
            {waiting ? <PrimaryButton title="Change" icon={PenLine} variant="outline" small onPress={openLead} style={{ backgroundColor: '#FFFFFF' }} /> : null}
          </View>
        </Card>
      </Section>

      <Section title="Quotation Timeline">
        <Card>
          {steps.map((s, i) => <Step key={s.title} {...s} last={i === steps.length - 1} />)}
        </Card>
      </Section>

      {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not refresh.'} onRetry={load} style={{ marginTop: 14 }} /> : null}

      {waiting ? (
        <View style={{ gap: 10, marginTop: 18 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton title="Revise Quote" icon={PenLine} variant="outline" style={{ flex: 1 }} onPress={openLead} />
            <PrimaryButton title="Call" icon={Phone} variant="outline" style={{ flex: 1 }} onPress={call} />
          </View>
          <PrimaryButton title="Chat with Customer" icon={MessageCircle} variant="outline" loading={chatBusy} onPress={openChat} />
        </View>
      ) : null}
    </SellScreen>
  );
}
