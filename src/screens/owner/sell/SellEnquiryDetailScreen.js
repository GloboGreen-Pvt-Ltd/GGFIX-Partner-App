import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CircleCheck, CircleX, Handshake, MessageCircle, Phone, Send, X } from 'lucide-react-native';
import { confirm, notify } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import {
  acceptEnquiry, confirmEnquiry, getEnquiry, normalizeProduct, rejectEnquiry, resetSellServerMode, sendEnquiryOffer,
} from '../../../api/sellListings';
import { rf } from '../../../utils/responsive';
import {
  C, Card, ChoiceCard, ErrorBox, InfoRow, PrimaryButton, Section, SellScreen, StatusPill, TextField, Thumb, cleanAmount, money, statusMeta,
} from './kit';

// One buyer enquiry / price request: product, buyer, negotiation history and
// the actions the server allows (allowedActions) — nothing else is offered.

const FULFIL = {
  PICKUP: { title: 'Pickup from shop', sub: 'The buyer collects it from your shop' },
  SHIPPING: { title: 'Shipping', sub: "You ship it to the buyer's address" },
};
const TERMINAL = ['CONFIRMED', 'REJECTED', 'CANCELLED'];

function relTime(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `${h} hour${h > 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function stamp(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function initials(name) {
  const w = String(name || 'Buyer').trim().split(/\s+/);
  return ((w[0]?.[0] || 'B') + (w[1]?.[0] || '')).toUpperCase();
}

function fulfilmentList(product) {
  const raw = product?.fulfilmentOptions;
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const clean = list.map((x) => String(x).trim().toUpperCase()).filter((x) => FULFIL[x]);
  return clean.length ? clean : ['PICKUP'];
}

/** Amount the shop agrees to on ACCEPT: the buyer's offer, else the listing price. */
function buyerAmount(e) {
  if (e.lastOfferBy === 'BUYER' && e.lastOfferAmount != null) return e.lastOfferAmount;
  return e.product?.price;
}

function historyLine(o, buyerName) {
  const who = o.author === 'SHOP' ? 'You' : o.author === 'BUYER' ? buyerName : 'System';
  const what = {
    ENQUIRY: 'sent an enquiry',
    OFFER: o.author === 'SHOP' ? 'sent a quote' : 'made an offer',
    COUNTER: 'sent a counter offer',
    ACCEPT: 'accepted the price',
    REJECT: 'rejected the enquiry',
    CONFIRM: 'confirmed the deal',
    CANCEL: 'cancelled the enquiry',
  }[String(o.action || '').toUpperCase()] || String(o.action || 'updated').toLowerCase();
  return `${who} ${what}`;
}

function Timeline({ offers, buyerName }) {
  const list = [...offers].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return (
    <Card>
      {list.map((o, i) => {
        const last = i === list.length - 1;
        const dot = o.author === 'SHOP' ? C.teal : o.author === 'BUYER' ? C.amber : C.faint;
        return (
          <View key={String(o.id || i)} style={{ flexDirection: 'row' }}>
            <View style={{ width: 16, alignItems: 'center' }}>
              <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: dot, marginTop: 4 }} />
              {last ? null : <View style={{ flex: 1, width: 2, backgroundColor: C.border, marginTop: 3 }} />}
            </View>
            <View style={{ flex: 1, marginLeft: 10, paddingBottom: last ? 0 : 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={{ flex: 1, fontSize: rf(12.5), fontWeight: '700', color: C.text }}>{historyLine(o, buyerName)}</Text>
                <Text style={{ fontSize: rf(10.5), color: C.faint, marginLeft: 8 }}>{stamp(o.createdAt)}</Text>
              </View>
              {o.amount != null ? <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.teal, marginTop: 2 }}>{money(o.amount)}</Text> : null}
              {o.note ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2, lineHeight: rf(16) }}>{o.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function FormHeader({ title, sub, onClose, disabled }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Pressable onPress={disabled ? undefined : onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
        <X size={20} color={C.text} />
      </Pressable>
    </View>
  );
}

export default function SellEnquiryDetailScreen({ navigation, route }) {
  const enquiryId = route?.params?.enquiryId;
  const [enq, setEnq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [updateRequired, setUpdateRequired] = useState(null);

  const [form, setForm] = useState(null); // 'offer' | 'reject' | 'confirm'
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [fulfilment, setFulfilment] = useState(null);
  const [busy, setBusy] = useState(null);
  const busyRef = useRef(false);
  const gen = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async (mode) => {
    if (!enquiryId) {
      setError('This enquiry could not be found.');
      setLoading(false);
      return;
    }
    const g = ++gen.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await getEnquiry(enquiryId);
      if (g !== gen.current) return;
      hasData.current = true;
      setEnq(res);
      setError(null);
      setUpdateRequired(null);
    } catch (e) {
      if (g !== gen.current) return;
      if (e?.code === 'SERVER_UPDATE_REQUIRED') setUpdateRequired(e.message);
      else setError(e?.message || 'Could not load this enquiry.');
    } finally {
      if (g === gen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enquiryId]);

  useFocusEffect(useCallback(() => {
    load(hasData.current ? 'silent' : 'initial');
  }, [load]));

  const product = useMemo(() => normalizeProduct(enq?.product || null), [enq]);
  const actions = useMemo(() => new Set(Array.isArray(enq?.allowedActions) ? enq.allowedActions : []), [enq]);

  /** Runs one action; the server's EnquiryResponse replaces local state. */
  const act = async (key, call, toast, failTitle) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(key);
    try {
      const res = await call();
      gen.current += 1; // drop any reload that started before this action
      if (res?.id) {
        setEnq((prev) => (Array.isArray(res.offers) ? res : { ...res, offers: prev?.offers || [] }));
        if (!Array.isArray(res.offers)) load('silent'); // pick up the new history entry
      } else {
        load('silent');
      }
      setForm(null);
      showToast({ type: 'success', ...toast(res || {}) });
      return true;
    } catch (e) {
      if (e?.code === 'SERVER_UPDATE_REQUIRED') {
        setUpdateRequired(e.message);
      } else {
        notify(failTitle, e?.message || 'Please try again.', { type: 'error' });
        if (e?.status === 409) load('silent'); // someone else moved it on
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const openForm = (name) => {
    if (busyRef.current) return;
    if (name === 'offer') {
      setAmount('');
      setNote('');
      setAmountError(null);
    }
    if (name === 'reject') setReason('');
    if (name === 'confirm') {
      const opts = fulfilmentList(product);
      setFulfilment(opts.includes(enq?.fulfilment) ? enq.fulfilment : opts.length === 1 ? opts[0] : null);
    }
    setForm(name);
  };
  const closeForm = () => { if (!busyRef.current) setForm(null); };

  const isCounter = enq?.lastOfferBy === 'BUYER';
  const offerLabel = isCounter ? 'Counter Offer' : enq?.lastOfferBy === 'SHOP' ? 'Update Quote' : 'Send Quote';

  const submitOffer = () => {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) {
      setAmountError('Enter an amount greater than ₹0.');
      return;
    }
    act(
      'offer',
      () => sendEnquiryOffer(enq.id, { amount: n, note: note.trim() }),
      () => ({ title: isCounter ? 'Counter offer sent' : 'Quote sent', message: money(n) }),
      'Could not send quote',
    );
  };

  const approve = async () => {
    if (busyRef.current) return;
    const amt = buyerAmount(enq);
    const qty = Number(enq.quantity) > 1 ? ` (${enq.quantity} units)` : '';
    const ok = await confirm({
      title: 'Approve this price?',
      message: `Sell ${enq.product?.title || 'this item'}${qty} to ${enq.buyer?.name || 'the buyer'} for ${money(amt)}. You confirm the deal and fulfilment next.`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    act(
      'accept',
      () => acceptEnquiry(enq.id),
      (res) => ({ title: 'Price approved', message: `Agreed at ${money(res.agreedAmount != null ? res.agreedAmount : amt)}` }),
      'Could not approve',
    );
  };

  const submitReject = async () => {
    if (busyRef.current) return;
    const ok = await confirm({
      title: 'Reject this enquiry?',
      message: "The enquiry will be closed. This can't be undone.",
      confirmText: 'Reject',
      destructive: true,
    });
    if (!ok) return;
    act('reject', () => rejectEnquiry(enq.id, reason.trim()), () => ({ title: 'Enquiry rejected' }), 'Could not reject');
  };

  const submitConfirm = () => {
    if (!fulfilment) return;
    act(
      'confirm',
      () => confirmEnquiry(enq.id, fulfilment),
      () => ({ title: 'Deal confirmed', message: `${FULFIL[fulfilment].title} · stock updated` }),
      'Could not confirm deal',
    );
  };

  const header = {
    title: 'Buyer Enquiry',
    subtitle: enq?.kind === 'PURCHASE_REQUEST' ? 'Price request for your listing' : 'Enquiry for your listing',
    onBack: () => navigation.goBack(),
  };

  if (updateRequired) {
    return (
      <SellScreen {...header}>
        <ErrorBox tone="warning" message={updateRequired} onRetry={() => { resetSellServerMode(); setUpdateRequired(null); load('initial'); }} />
        <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 12, lineHeight: rf(17) }}>
          Until then, buyers can still reach you in Buyer Chats.
        </Text>
        <PrimaryButton title="Open Buyer Chats" icon={MessageCircle} onPress={() => navigation.navigate('ShopChatInbox')} style={{ marginTop: 12 }} />
      </SellScreen>
    );
  }

  if (loading && !enq) {
    return (
      <SellScreen {...header}>
        <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />
      </SellScreen>
    );
  }

  if (!enq) {
    return (
      <SellScreen {...header}>
        <ErrorBox message={error || 'Could not load this enquiry.'} onRetry={enquiryId ? () => load('initial') : undefined} />
      </SellScreen>
    );
  }

  const status = String(enq.status || '').toUpperCase();
  const buyerName = enq.buyer?.name || 'Buyer';
  const phone = enq.buyer?.phone ? String(enq.buyer.phone).trim() : '';
  const spec = [product?.storageLabel, product?.ramLabel, product?.conditionLabel].filter(Boolean).join(' · ');
  const offers = Array.isArray(enq.offers) ? enq.offers : [];
  const canOffer = actions.has('SEND_OFFER');
  const canAccept = actions.has('ACCEPT');
  const canReject = actions.has('REJECT');
  const canConfirm = actions.has('CONFIRM');
  const anyAction = canOffer || canAccept || canReject || canConfirm;
  const lastOffer = enq.lastOfferAmount != null
    ? `${enq.lastOfferBy === 'SHOP' ? 'Your quote' : enq.lastOfferBy === 'BUYER' ? 'Buyer offer' : 'Offer'} ${money(enq.lastOfferAmount)}`
    : null;

  let footer = null;
  if (form === 'offer' && canOffer) {
    footer = (
      <View>
        <FormHeader
          title={offerLabel}
          sub={isCounter && enq.lastOfferAmount != null ? `Buyer offered ${money(enq.lastOfferAmount)} · listed at ${money(product?.price)}` : `Listed at ${money(product?.price)}`}
          onClose={closeForm}
          disabled={!!busy}
        />
        <TextField
          label="Your price"
          required
          prefix="₹"
          value={amount}
          onChangeText={(t) => { setAmount(cleanAmount(t)); setAmountError(null); }}
          placeholder="Enter amount"
          keyboardType="decimal-pad"
          autoFocus
          maxLength={10}
          error={amountError}
          style={{ marginTop: 8 }}
        />
        <TextField
          label="Note"
          hint="(optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Price includes original charger"
          maxLength={200}
          style={{ marginTop: 8 }}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PrimaryButton title="Cancel" variant="outline" onPress={closeForm} disabled={!!busy} style={{ flex: 1 }} />
          <PrimaryButton title={isCounter ? 'Send Counter' : 'Send Quote'} icon={Send} onPress={submitOffer} loading={busy === 'offer'} style={{ flex: 1.4 }} />
        </View>
      </View>
    );
  } else if (form === 'reject' && canReject) {
    footer = (
      <View>
        <FormHeader title="Reject enquiry" sub="The buyer sees that you declined." onClose={closeForm} disabled={!!busy} />
        <TextField
          label="Reason"
          hint="(optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Item already sold offline"
          maxLength={200}
          style={{ marginTop: 8 }}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PrimaryButton title="Cancel" variant="outline" onPress={closeForm} disabled={!!busy} style={{ flex: 1 }} />
          <PrimaryButton title="Reject Enquiry" variant="dangerSolid" icon={CircleX} onPress={submitReject} loading={busy === 'reject'} style={{ flex: 1.4 }} />
        </View>
      </View>
    );
  } else if (form === 'confirm' && canConfirm) {
    footer = (
      <View>
        <FormHeader
          title="Confirm deal"
          sub={`${money(enq.agreedAmount != null ? enq.agreedAmount : buyerAmount(enq))} · How will the buyer get it?`}
          onClose={closeForm}
          disabled={!!busy}
        />
        {fulfilmentList(product).map((f) => (
          <ChoiceCard key={f} radio title={FULFIL[f].title} sub={FULFIL[f].sub} selected={fulfilment === f} onPress={() => setFulfilment(f)} />
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PrimaryButton title="Cancel" variant="outline" onPress={closeForm} disabled={!!busy} style={{ flex: 1 }} />
          <PrimaryButton title="Confirm Deal" variant="green" icon={Handshake} onPress={submitConfirm} disabled={!fulfilment} loading={busy === 'confirm'} style={{ flex: 1.4 }} />
        </View>
      </View>
    );
  } else if (anyAction) {
    footer = (
      <View style={{ gap: 8 }}>
        {canConfirm ? <PrimaryButton title="Confirm Deal" variant="green" icon={Handshake} onPress={() => openForm('confirm')} disabled={!!busy} /> : null}
        {canAccept || canReject ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canAccept ? <PrimaryButton title="Approve" variant="green" icon={CircleCheck} onPress={approve} loading={busy === 'accept'} disabled={!!busy} style={{ flex: 1 }} /> : null}
            {canReject ? <PrimaryButton title="Reject" variant="danger" icon={CircleX} onPress={() => openForm('reject')} disabled={!!busy} style={{ flex: 1 }} /> : null}
          </View>
        ) : null}
        {canOffer ? (
          <PrimaryButton title={offerLabel} variant={canAccept || canConfirm ? 'outline' : 'primary'} icon={Send} onPress={() => openForm('offer')} disabled={!!busy} />
        ) : null}
      </View>
    );
  }

  return (
    <SellScreen
      {...header}
      footer={footer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[C.teal]} tintColor={C.teal} />}
    >
      {error ? <ErrorBox message={error} onRetry={() => load('silent')} style={{ marginTop: 0, marginBottom: 10 }} /> : null}

      {/* Product */}
      <Card
        onPress={product?.id ? () => navigation.navigate('MarketplaceListingDetails', { productId: product.id }) : undefined}
        accessibilityLabel={product?.title || 'Listing'}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <Thumb uri={product?.imageUrl} size={60} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{product?.title || 'Listing'}</Text>
          {spec ? <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{spec}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontSize: rf(14.5), fontWeight: '800', color: C.teal }}>{money(product?.price)}</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(11), color: C.muted, marginLeft: 8 }}>
              {enq.product?.quantity != null ? `Stock: ${product.quantity}` : ''}
            </Text>
            {enq.product?.status ? <StatusPill status={product._status} style={{ alignSelf: 'center' }} /> : null}
          </View>
        </View>
      </Card>

      {/* Buyer + message */}
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.teal }}>{initials(buyerName)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <Text numberOfLines={1} style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{buyerName}</Text>
            <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>
              {[relTime(enq.createdAt), enq.kind === 'PURCHASE_REQUEST' ? 'Price request' : 'Enquiry'].filter(Boolean).join(' · ')}
            </Text>
            {phone ? <Text style={{ fontSize: rf(12), color: C.text, fontWeight: '600', marginTop: 2 }}>{phone}</Text> : null}
          </View>
          <StatusPill status={status} style={{ alignSelf: 'center', marginLeft: 8 }} />
        </View>
        {enq.message ? (
          <View style={{ backgroundColor: C.field, borderRadius: 12, padding: 10, marginTop: 10 }}>
            <Text style={{ fontSize: rf(12.5), color: C.text, lineHeight: rf(18) }}>{enq.message}</Text>
          </View>
        ) : null}
        {enq.chatThreadId || phone ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {enq.chatThreadId ? (
              <PrimaryButton title="Chat" variant="soft" icon={MessageCircle} small onPress={() => navigation.navigate('ShopChatThread', { threadId: enq.chatThreadId })} style={{ flex: 1 }} />
            ) : null}
            {phone ? (
              <PrimaryButton
                title="Call"
                variant="soft"
                icon={Phone}
                small
                onPress={() => Linking.openURL(`tel:${phone}`).catch(() => notify('Could not start a call', phone, { type: 'error' }))}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* Deal */}
      <Section title="Deal">
        <Card style={{ paddingVertical: 6 }}>
          <InfoRow label="Status" value={statusMeta(status).label} bold />
          <InfoRow label="Request type" value={enq.kind === 'PURCHASE_REQUEST' ? 'Price request' : 'Enquiry'} />
          {Number(enq.quantity) > 0 ? <InfoRow label="Quantity" value={String(enq.quantity)} /> : null}
          {lastOffer ? <InfoRow label="Latest offer" value={lastOffer} /> : null}
          {enq.agreedAmount != null ? <InfoRow label="Agreed price" value={money(enq.agreedAmount)} bold /> : null}
          {enq.fulfilment ? <InfoRow label="Fulfilment" value={FULFIL[enq.fulfilment]?.title || enq.fulfilment} /> : null}
        </Card>
        {!anyAction ? (
          <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 8 }}>
            {TERMINAL.includes(status) ? 'This enquiry is closed.' : 'Nothing to do right now. Waiting for the buyer.'}
          </Text>
        ) : null}
      </Section>

      {/* Negotiation history */}
      <Section title="Negotiation history">
        {offers.length ? (
          <Timeline offers={offers} buyerName={buyerName} />
        ) : (
          <Text style={{ fontSize: rf(11.5), color: C.muted }}>No offers yet.</Text>
        )}
      </Section>
    </SellScreen>
  );
}
