import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CircleAlert, CircleCheck, Clock, Coins, PenLine, RotateCcw } from 'lucide-react-native';
import { approvePickupRevision, confirmPickupQuote, confirmPurchasePrice, requestPickupReinspection, revisePickupPrice, revisePurchasePrice } from '../../../api/orders';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, PrimaryButton, money } from '../sell/kit';
import PurchaseFormSheet from './PurchaseFormSheet';
import { PurchasePage, goToStep, up, usePurchase, useStep } from './purchaseKit';

// Page 5 — Final Price Approval, after the inspection: confirm the quoted price,
// or revise it with a reason (the customer approves or rejects it in their app;
// this page re-reads every 20 s while waiting).
// Pickup (doorstep, OUT_FOR_PICKUP) after the employee's inspection at the
// customer's place: Approve Price (the quote → the employee may pay; or the
// employee's suggested price → sent to the customer to accept), Revise Price
// (the owner's price → sent to the customer) or Request Reinspection.

const STATUSES = ['INSPECTED', 'PRICE_REVISION_PENDING', 'REVISION_REJECTED'];
const DOOR_ACTIONS = ['CONFIRM_PICKUP_QUOTE', 'APPROVE_PICKUP_REVISION', 'REVISE_PICKUP_PRICE', 'REQUEST_REINSPECTION'];
const applies = (x) => STATUSES.includes(up(x?.status)) || (up(x?.status) === 'OUT_FOR_PICKUP' && (x?.allowedActions || []).some((a) => DOOR_ACTIONS.includes(a)));

/** Why the price changed: listing mismatches and failed checks from the doorstep inspection. */
export function inspectionReasons(o) {
  const pin = o?.pickupInspection || {};
  const out = [];
  (pin.compare || []).filter((r) => r && r.match === false).forEach((r) => out.push(`${r.label}: listed ${r.listing || '—'}, found ${r.actual || '—'}`));
  (pin.checks || []).filter((c) => c && c.ok === false).forEach((c) => out.push(c.note ? `${c.label} failed — ${c.note}` : `${c.label} failed`));
  return out;
}
const POLL_MS = 20000;

export default function BuyFinalPriceScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const [busy, run] = useStep();
  const [revising, setRevising] = useState(false);
  const [sendBack, setSendBack] = useState(null); // 'revise' | 'reinspect' (doorstep)
  const status = up(o?.status);
  const door = status === 'OUT_FOR_PICKUP';
  const pending = status === 'PRICE_REVISION_PENDING';
  const { load } = p;
  useFocusEffect(useCallback(() => {
    if (!pending && !door) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [pending, door, load]));

  const quoted = Number(o?.quotedPrice ?? o?.amount ?? 0);
  const rev = o?.revision;
  const suggested = door && up(rev?.status) === 'SHOP_PENDING';
  const after = (door ? suggested : pending || status === 'REVISION_REJECTED') ? Number(rev?.amount ?? quoted) : quoted;
  const who = o?.pickup?.personName || 'the employee';
  const reasons = door ? inspectionReasons(o) : [];
  const acts = o?.allowedActions || [];

  const rvs = up(rev?.status);
  const banner = door
    ? suggested
      ? { Icon: Clock, bg: C.amberBg, fg: C.amber, text: `${who} suggests ${money(rev?.amount)} after inspecting the device at the customer's place. Approve it to send the offer to the customer.` }
      : rvs === 'REJECTED' || rvs === 'NEGOTIATION'
        ? { Icon: CircleAlert, bg: C.redBg, fg: C.red, text: `The customer ${rvs === 'NEGOTIATION' ? 'asked to negotiate' : 'declined'} ${money(rev?.amount)}${rev?.customerNote ? `: “${rev.customerNote}”` : ''}. Keep the quote or offer another price.` }
        : { Icon: CircleCheck, bg: '#EEF8F4', fg: C.green, text: `Inspection submitted by ${who}. Approve the quote of ${money(quoted)}, set a different price, or ask for a re-check.` }
    : pending
    ? { Icon: Clock, bg: C.amberBg, fg: C.amber, text: `Revised to ${money(rev?.amount)} — waiting for the customer to approve.${rev?.reason ? `\nReason: ${rev.reason}` : ''}` }
    : status === 'REVISION_REJECTED'
      ? { Icon: CircleAlert, bg: C.redBg, fg: C.red, text: `The customer rejected ${money(rev?.amount)}${rev?.customerNote ? `: “${rev.customerNote}”` : ''}. Confirm ${money(quoted)} or offer another price.` }
      : { Icon: CircleCheck, bg: '#EEF8F4', fg: C.green, text: 'No change in price.\nProceed with payment.' };
  const BannerIcon = banner.Icon;

  const confirmPrice = () => run('confirm', async () => {
    const ok = await confirm({ title: `Confirm ${money(quoted)}?`, message: 'This is the amount you pay the customer.', confirmText: 'Confirm' });
    if (!ok) return;
    const d = await confirmPurchasePrice(o.id);
    showToast({ type: 'success', title: 'Price confirmed', message: 'Pay the customer next.' });
    goToStep(navigation, d, leadRef);
  });

  // Approve: the employee's suggested price goes to the customer; otherwise the quote stands and the employee may pay.
  const approve = () => run('approve', async () => {
    const ok = await confirm(suggested
      ? { title: `Approve ${money(rev?.amount)}?`, message: `Instead of ${money(quoted)}. The customer must accept this final offer before payment.`, confirmText: 'Approve Price' }
      : { title: `Approve ${money(quoted)}?`, message: `The accepted quote stays the final price. ${who} can pay the customer now.`, confirmText: 'Approve Price' });
    if (!ok) return;
    const d = suggested ? await approvePickupRevision(o.id) : await confirmPickupQuote(o.id);
    showToast({ type: 'success', title: 'Final price approved', message: suggested ? 'Waiting for the customer’s decision.' : `${who} can pay the customer now.` });
    goToStep(navigation, d, leadRef);
  });
  const canApprove = acts.includes(suggested ? 'APPROVE_PICKUP_REVISION' : 'CONFIRM_PICKUP_QUOTE');

  const footer = !o || pending ? null : door ? (
    acts.some((a) => DOOR_ACTIONS.includes(a)) ? (
      <View style={{ gap: 10 }}>
        <PrimaryButton title={`Approve ${money(suggested ? rev?.amount : quoted)}`} icon={CircleCheck} loading={busy === 'approve'} disabled={!canApprove} onPress={approve} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton title="Revise Price" icon={PenLine} variant="outline" style={{ flex: 1 }} disabled={!acts.includes('REVISE_PICKUP_PRICE')} onPress={() => setSendBack('revise')} />
          <PrimaryButton title="Reinspect" icon={RotateCcw} variant="outline" style={{ flex: 1 }} disabled={!acts.includes('REQUEST_REINSPECTION')} onPress={() => setSendBack('reinspect')} />
        </View>
      </View>
    ) : null
  ) : (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <PrimaryButton title="Revise Price" icon={PenLine} variant="outline" style={{ flex: 1 }} disabled={!acts.includes('REVISE_PRICE')} onPress={() => setRevising(true)} />
      <PrimaryButton title="Confirm Price" style={{ flex: 1 }} loading={busy === 'confirm'} disabled={!acts.includes('CONFIRM_PRICE')} onPress={confirmPrice} />
    </View>
  );

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Final Price Approval" statuses={applies} footer={footer}>
      {o ? (
        <>
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <Coins size={52} color={C.green} strokeWidth={1.6} />
            <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text, marginTop: 10 }}>Final Offer Price</Text>
            <Text style={{ fontSize: rf(32), fontWeight: '800', color: C.text, marginTop: 4 }}>{money(after)}</Text>
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: C.field, borderRadius: 14, paddingVertical: 14, marginTop: 18 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: rf(11.5), color: C.muted }}>{door ? 'Original Quote' : 'Quoted Price'}</Text>
              <Text style={{ fontSize: rf(17), fontWeight: '800', color: C.text, marginTop: 4 }}>{money(quoted)}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: rf(11.5), color: C.muted }}>{suggested ? 'Employee Suggested' : 'After Inspection'}</Text>
              <Text style={{ fontSize: rf(17), fontWeight: '800', color: after !== quoted ? C.amber : C.text, marginTop: 4 }}>{money(after)}</Text>
            </View>
          </View>

          {door && after !== quoted ? (
            <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: after < quoted ? C.red : C.green, textAlign: 'center', marginTop: 10 }}>
              {`Difference: ${after < quoted ? '−' : '+'} ${money(Math.abs(after - quoted))}`}
            </Text>
          ) : null}

          {door ? (
            <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 14, marginTop: 14 }}>
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>Inspection Reasons</Text>
              {rev?.reason ? <Text style={{ fontSize: rf(12.5), color: C.text, marginTop: 6 }}>{`Reason: ${rev.reason}`}</Text> : null}
              {rev?.pickupNote ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 4 }}>{`Employee note: ${rev.pickupNote}`}</Text> : null}
              {reasons.map((r) => <Text key={r} style={{ fontSize: rf(12), color: C.red, marginTop: 4 }}>{`• ${r}`}</Text>)}
              {!rev?.reason && !reasons.length ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 6 }}>No reason recorded.</Text> : null}
              <Text onPress={() => navigation.navigate('BuyInspectionReview', { id: o.id, order: o, leadRef })} accessibilityRole="link"
                style={{ fontSize: rf(12), fontWeight: '800', color: C.teal, marginTop: 10 }}>
                View full inspection
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: banner.bg, borderRadius: 14, padding: 14, marginTop: 14 }}>
            <BannerIcon size={30} color={banner.fg} />
            <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 12, lineHeight: rf(18) }}>{banner.text}</Text>
          </View>

          {status === 'INSPECTED' && acts.includes('INSPECT') ? (
            <Text onPress={() => navigation.navigate('BuyInspection', { id: o.id, order: o, leadRef })} accessibilityRole="link"
              style={{ fontSize: rf(12), fontWeight: '800', color: C.teal, textAlign: 'center', marginTop: 14 }}>
              Edit inspection
            </Text>
          ) : null}

          <PurchaseFormSheet
            visible={!!sendBack}
            title={sendBack === 'revise' ? 'Revise the price' : 'Request reinspection'}
            sub={sendBack === 'revise' ? 'Your final offer goes to the customer to accept before the payment.' : `${who} re-checks the device and submits the inspection again.`}
            fields={sendBack === 'revise' ? [
              { key: 'amount', label: 'Your price', type: 'amount', required: true, placeholder: String(rev?.amount || quoted || '') },
              { key: 'reason', label: 'Reason', type: 'multiline', required: true, maxLength: 300, placeholder: 'e.g. Battery 85% is fine, offer 45,000' },
            ] : [
              { key: 'reason', label: 'What to re-check', type: 'multiline', required: true, maxLength: 300, placeholder: 'e.g. Re-check the camera and add a clear photo of the screen' },
            ]}
            submitLabel={sendBack === 'revise' ? 'Send to Customer' : 'Request Reinspection'}
            onClose={() => setSendBack(null)}
            onSubmit={async (x) => {
              const reason = String(x.reason || '').trim();
              let d;
              if (sendBack === 'revise') {
                const amount = Number(x.amount);
                if (!(amount > 0)) throw new Error('Enter your price');
                if (amount === quoted) throw new Error('That is the accepted quote — approve it instead');
                if (reason.length < 5) throw new Error('Explain the price (at least 5 characters)');
                d = await revisePickupPrice(o.id, { amount, reason });
              } else {
                if (reason.length < 3) throw new Error('Tell the employee what to re-check');
                d = await requestPickupReinspection(o.id, reason);
              }
              setSendBack(null);
              showToast({ type: 'success', title: sendBack === 'revise' ? 'Sent to the customer' : 'Re-check requested', message: sendBack === 'revise' ? 'Waiting for the customer’s decision.' : `${who} sees it in the Employee App.` });
              goToStep(navigation, d, leadRef);
            }}
          />

          <PurchaseFormSheet
            visible={revising}
            title="Revise the price"
            sub="The customer must approve the new price."
            fields={[
              { key: 'amount', label: 'New price', type: 'amount', required: true, placeholder: String(quoted || '') },
              { key: 'reason', label: 'Reason', type: 'multiline', required: true, maxLength: 300, placeholder: 'e.g. Face ID not working, battery 74%' },
            ]}
            submitLabel="Send to Customer"
            onClose={() => setRevising(false)}
            onSubmit={async (x) => {
              const amount = Number(x.amount);
              if (!(amount > 0)) throw new Error('Enter the new price');
              if (amount === quoted) throw new Error('The new price is the same as the quote');
              if (String(x.reason).trim().length < 10) throw new Error('Explain the reason (at least 10 characters)');
              p.setO(await revisePurchasePrice(o.id, { amount, reason: String(x.reason).trim() }));
              setRevising(false);
              showToast({ type: 'success', title: 'Sent to the customer', message: 'You’ll see their answer here.' });
            }}
          />
        </>
      ) : null}
    </PurchasePage>
  );
}
