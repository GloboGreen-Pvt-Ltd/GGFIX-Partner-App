import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BadgeCheck, CircleCheck, Clock, Handshake, PenLine, XCircle } from 'lucide-react-native';
import { acceptShopQuote, cancelMyOffer, getMyOffer, reviseMyOffer } from '../../../api/buyEnquiries';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, Card, ErrorBox, PrimaryButton, Section, SellScreen, TextField, Thumb, cleanAmount, money } from '../sell/kit';
import { BellButton, dateTime, offerMeta } from './buyKit';

// Page 5 (detail) — one negotiation: where it stands, your offer vs the
// listing price, the history, and only the actions the server allows
// (allowedActions): revise / counter, accept the shop's quote, cancel.

const STEP_LABEL = {
  ENQUIRY: 'Offer sent', OFFER: 'Shop quoted', COUNTER: 'You countered', ACCEPT: 'Accepted',
  REJECT: 'Rejected', CONFIRM: 'Deal confirmed', CANCEL: 'Cancelled',
};

export default function BuyQuotationDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const [e, setE] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);

  const load = useCallback(async () => {
    try { setE(await getMyOffer(id)); setError(null); } catch (err) { setError(err); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (key, fn, done) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    try {
      const res = await fn();
      if (res?.id) setE((prev) => ({ ...res, offers: res.offers || prev?.offers }));
      showToast({ type: 'success', title: done });
      load();
      setForm(false);
    } catch (err) {
      showToast({ type: 'error', title: 'Could not update', message: err?.message });
      if (err?.status === 409) load();
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  if (!e) {
    return (
      <SellScreen title="Quotation" subtitle="" onBack={() => navigation.goBack()}>
        {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message} onRetry={load} /> : <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}
      </SellScreen>
    );
  }

  const m = offerMeta(e.status);
  const allowed = e.allowedActions || [];
  const yourOffer = e.lastOfferBy === 'BUYER' ? e.lastOfferAmount : (e.offers || []).filter((o) => o.author === 'BUYER' && o.amount != null).slice(-1)[0]?.amount;
  const shopQuote = e.lastOfferBy === 'SHOP' ? e.lastOfferAmount : null;
  const head = {
    PENDING: { Icon: Clock, title: e.lastOfferBy === 'SHOP' ? 'Shop Sent a Quote' : 'Offer Submitted', sub: e.lastOfferBy === 'SHOP' ? 'Accept it or send a counter offer' : 'Waiting for the shop’s response', tint: C.amberBg, fg: C.amber },
    ACCEPTED: { Icon: Handshake, title: e.status === 'CONFIRMED' ? 'Deal Confirmed' : 'Price Accepted', sub: e.status === 'CONFIRMED' ? 'The shop confirmed the deal' : 'Waiting for the shop to confirm the deal', tint: C.greenBg, fg: C.green },
    REJECTED: { Icon: XCircle, title: e.status === 'CANCELLED' ? 'Offer Cancelled' : 'Offer Rejected', sub: 'This negotiation is closed', tint: C.redBg, fg: C.red },
  }[m.bucket];
  const HeadIcon = head.Icon;
  const submitRevision = () => {
    const v = Number(amount);
    if (!(v > 0)) { showToast({ type: 'error', title: 'Enter an amount above ₹0' }); return; }
    run('offer', () => reviseMyOffer(e.id, { amount: v, note }), 'Offer sent');
  };

  return (
    <SellScreen
      title="Quotation"
      subtitle={`Ref #${String(e.id).slice(0, 8).toUpperCase()}`}
      onBack={() => navigation.goBack()}
      right={<BellButton navigation={navigation} />}
    >
      <View style={{ alignItems: 'center', backgroundColor: head.tint, borderRadius: 16, padding: 16, marginTop: 6 }}>
        <View style={{ height: 46, width: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><HeadIcon size={24} color={head.fg} /></View>
        <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text, marginTop: 8 }}>{head.title}</Text>
        <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{head.sub}</Text>
      </View>

      <Card style={{ marginTop: 12, flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: rf(11.5), color: C.muted }}>Your Offer</Text>
          <Text style={{ fontSize: rf(20), fontWeight: '800', color: C.text, marginTop: 2 }}>{yourOffer != null ? money(yourOffer) : '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: rf(11.5), color: C.muted }}>{shopQuote != null ? 'Shop Quote' : 'Listing Price'}</Text>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.teal, marginTop: 4 }}>{money(shopQuote ?? e.product?.price)}</Text>
        </View>
      </Card>
      {e.agreedAmount != null ? <Text style={{ fontSize: rf(12), color: C.green, fontWeight: '800', marginTop: 6 }}>Agreed price: {money(e.agreedAmount)}</Text> : null}

      <Section title="Listing">
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Thumb uri={e.product?.imageUrl} size={48} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{e.product?.title || 'Listing'}</Text>
            <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{[e.product?.storageLabel, e.product?.conditionLabel].filter(Boolean).join(' · ')}</Text>
          </View>
        </Card>
      </Section>

      <Section title="Negotiation Status">
        <Card>
          {(e.offers || []).map((o, i) => {
            const last = i === (e.offers || []).length - 1;
            return (
              <View key={o.id || i} style={{ flexDirection: 'row', paddingBottom: last ? 0 : 12 }}>
                <View style={{ alignItems: 'center', width: 20 }}>
                  {last ? <CircleCheck size={18} color={C.teal} /> : <BadgeCheck size={18} color={C.green} />}
                  {!last ? <View style={{ flex: 1, width: 2, backgroundColor: C.border, marginTop: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>
                    {STEP_LABEL[o.action] || o.action}{o.amount != null ? ` · ${money(o.amount)}` : ''}
                  </Text>
                  {o.note ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 1 }}>{o.note}</Text> : null}
                  <Text style={{ fontSize: rf(10.5), color: C.faint, marginTop: 1 }}>{dateTime(o.createdAt)}</Text>
                </View>
              </View>
            );
          })}
          {!(e.offers || []).length ? <Text style={{ fontSize: rf(12), color: C.muted }}>No history yet.</Text> : null}
        </Card>
      </Section>

      {form ? (
        <Card style={{ marginTop: 14 }}>
          <TextField label={e.lastOfferBy === 'SHOP' ? 'Counter Offer' : 'Revised Offer'} required prefix="₹" value={amount} onChangeText={(t) => setAmount(cleanAmount(t))} placeholder="Enter amount" keyboardType="decimal-pad" maxLength={9} style={{ marginTop: 0 }} />
          <TextField label="Note" hint="(Optional)" value={note} onChangeText={setNote} placeholder="e.g. Can collect today" maxLength={200} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <PrimaryButton title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setForm(false)} />
            <PrimaryButton title="Send" style={{ flex: 1.4 }} loading={busy === 'offer'} onPress={submitRevision} />
          </View>
        </Card>
      ) : (
        <View style={{ gap: 10, marginTop: 16 }}>
          {allowed.includes('ACCEPT') ? (
            <PrimaryButton title={`Accept ${money(shopQuote)}`} variant="green" loading={busy === 'accept'} onPress={async () => {
              if (await confirm({ title: 'Accept this quote?', message: `You agree to buy at ${money(shopQuote)}.`, confirmText: 'Accept' })) run('accept', () => acceptShopQuote(e.id), 'Quote accepted');
            }} />
          ) : null}
          {allowed.includes('SEND_OFFER') ? (
            <PrimaryButton title={e.lastOfferBy === 'SHOP' ? 'Counter Offer' : 'Revise Offer'} icon={PenLine} variant="outline" onPress={() => { setAmount(''); setNote(''); setForm(true); }} />
          ) : null}
          {allowed.includes('CANCEL') ? (
            <PrimaryButton title="Cancel Offer" variant="danger" loading={busy === 'cancel'} onPress={async () => {
              if (await confirm({ title: 'Cancel this offer?', message: 'The shop will see it as cancelled.', confirmText: 'Cancel Offer', destructive: true })) run('cancel', () => cancelMyOffer(e.id), 'Offer cancelled');
            }} />
          ) : null}
        </View>
      )}
    </SellScreen>
  );
}
