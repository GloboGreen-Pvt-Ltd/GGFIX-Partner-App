import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowRight, CircleCheck, Clock, Eye, Lock, MessageSquare, XCircle } from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { C, PrimaryButton, Section, money } from '../sell/kit';
import { DeviceRow, PurchasePage, purchaseRoute, up, usePurchase, whenLabel } from './purchaseKit';

// Waiting Customer Decision: the final offer after the inspection and the
// customer's answer — Pending / Accepted / Rejected / Negotiation Requested
// (Customer App, or at the door through the employee). Read-only: the Partner
// App never records the customer's decision. Re-reads every 20 s while pending.

const POLL_MS = 20000;
const STATES = [
  { key: 'PENDING', label: 'Pending', Icon: Clock, fg: C.amber, bg: C.amberBg },
  { key: 'ACCEPTED', label: 'Accepted', Icon: CircleCheck, fg: C.green, bg: C.greenBg },
  { key: 'REJECTED', label: 'Rejected', Icon: XCircle, fg: C.red, bg: C.redBg },
  { key: 'NEGOTIATION', label: 'Negotiation Requested', Icon: MessageSquare, fg: C.amber, bg: C.amberBg },
];

const applies = (x) => purchaseRoute(x?.status, x) === 'BuyCustomerDecision' || up(x?.status) === 'REVISION_REJECTED';

export default function BuyCustomerDecisionScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const status = up(o?.status);
  const rev = o?.revision || {};
  const rv = up(rev.status);
  const decision = rv === 'APPROVED' ? 'ACCEPTED' : rv === 'REJECTED' ? 'REJECTED' : rv === 'NEGOTIATION' ? 'NEGOTIATION' : 'PENDING';
  const door = status === 'OUT_FOR_PICKUP';
  const who = o?.pickup?.personName || 'the employee';
  const { load } = p;
  useFocusEffect(useCallback(() => {
    if (decision !== 'PENDING') return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [decision, load]));

  const quoted = Number(o?.quotedPrice ?? 0) || Number(o?.amount ?? 0);
  const offer = rev.amount != null ? Number(rev.amount) : null;
  const cur = STATES.find((s) => s.key === decision);
  const CurIcon = cur.Icon;
  const open = (name) => navigation.navigate(name, { id: o.id, order: o, leadRef });

  const footer = !o ? null : decision === 'ACCEPTED' ? (
    <PrimaryButton title="Payment Tracking" iconRight={ArrowRight} onPress={() => open('BuyPayment')} />
  ) : status === 'REVISION_REJECTED' || (o.allowedActions || []).includes('REVISE_PICKUP_PRICE') ? (
    <PrimaryButton title="Decide Final Price" iconRight={ArrowRight} onPress={() => open('BuyFinalPrice')} />
  ) : decision === 'REJECTED' ? (
    <PrimaryButton title="View Order Details" icon={Eye} variant="outline" onPress={() => navigation.navigate('BuyOrderDetail', { id: o.id, kind: 'LEAD' })} />
  ) : null;

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Customer Decision" statuses={applies} footer={footer}>
      {o ? (
        <>
          <View style={{ alignItems: 'center', backgroundColor: cur.bg, borderRadius: 16, padding: 16, marginTop: 6 }}>
            <CurIcon size={40} color={cur.fg} strokeWidth={1.8} />
            <Text style={{ fontSize: rf(17), fontWeight: '800', color: C.text, marginTop: 8 }}>
              {decision === 'ACCEPTED' ? 'Customer Accepted' : decision === 'REJECTED' ? 'Customer Rejected' : decision === 'NEGOTIATION' ? 'Customer Wants to Negotiate' : 'Waiting for Customer'}
            </Text>
            <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 4, textAlign: 'center' }}>
              {decision === 'PENDING' ? `Final offer ${money(offer)} is with ${o.customer?.name || 'the customer'}.`
                : decision === 'ACCEPTED' ? `${o.customer?.name || 'The customer'} agreed to sell for ${money(offer)}.`
                  : decision === 'NEGOTIATION' ? `${o.customer?.name || 'The customer'} asked you to reconsider ${money(offer)}.`
                    : `${o.customer?.name || 'The customer'} declined ${money(offer)}.`}
            </Text>
          </View>

          <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 12, marginTop: 14 }}>
            <DeviceRow o={o} size={48} />
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: C.field, borderRadius: 14, paddingVertical: 14, marginTop: 12 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: rf(11.5), color: C.muted }}>Original Quote</Text>
              <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.text, marginTop: 4 }}>{money(quoted)}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: rf(11.5), color: C.muted }}>Final Offer</Text>
              <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.amber, marginTop: 4 }}>{money(offer)}</Text>
            </View>
          </View>
          {rev.reason ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 10 }}>{`Reason: ${rev.reason}`}</Text> : null}
          {rev.customerNote ? <Text style={{ fontSize: rf(12), color: C.red, marginTop: 4 }}>{`Customer: “${rev.customerNote}”`}</Text> : null}

          <Section title="Decision Status">
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              {STATES.map((s, i) => {
                const on = s.key === decision;
                const Icon = s.Icon;
                return (
                  <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: on ? s.bg : '#FFFFFF', borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                    <Icon size={18} color={on ? s.fg : '#C9CED6'} />
                    <Text style={{ flex: 1, fontSize: rf(13), fontWeight: on ? '800' : '600', color: on ? C.text : C.muted, marginLeft: 10 }}>{s.label}</Text>
                    {on ? <Text style={{ fontSize: rf(11), fontWeight: '800', color: s.fg }}>{o.updatedAt ? `Updated ${whenLabel(o.updatedAt)}` : 'Current'}</Text> : null}
                  </View>
                );
              })}
            </View>
          </Section>

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 12, padding: 12, marginTop: 14 }}>
            <Lock size={16} color={C.muted} />
            <Text style={{ flex: 1, fontSize: rf(11.5), color: C.muted, marginLeft: 8 }}>
              {door
                ? `Read-only. The customer answers in the Customer App (or in person through ${who}'s Employee App); it can't be marked from the Partner App.`
                : 'Read-only. The customer answers in the Customer App; it can’t be marked from the Partner App.'}
            </Text>
          </View>
          {(decision === 'REJECTED' || decision === 'NEGOTIATION') && door ? (
            <Text style={{ fontSize: rf(12), color: C.text, marginTop: 10 }}>Keep the accepted quote or offer another price; the purchase can also be cancelled from Order Details.</Text>
          ) : null}
          {decision === 'ACCEPTED' && door && !o.payment?.recordedAt ? (
            <Text style={{ fontSize: rf(12), color: C.text, marginTop: 10 }}>{`Next: ${who} pays ${money(o.amount)} to the customer and uploads the proof.`}</Text>
          ) : null}
        </>
      ) : null}
    </PurchasePage>
  );
}
