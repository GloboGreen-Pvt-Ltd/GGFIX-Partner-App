import React from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import {
  BadgeCheck, CalendarClock, Check, CircleCheck, ClipboardCheck, Clock, Handshake, IndianRupee, Lock, PackageCheck, PenLine, Phone,
  ShieldCheck, Store, Truck, UserPlus, Wallet, XCircle,
} from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { C, Card, PrimaryButton, Section, money } from '../sell/kit';
import { dateTime } from './buyKit';
import { INSPECTION_CHECKS } from './BuyInspectionScreen';
import { pickupSteps } from './purchaseKit';

// Purchase workflow (a device bought from a customer's sell lead), shown on
// Order Details: Manage Pickup (employee + tracking), Inspection, Final Price
// and Payment. Buttons appear only for actions the server allows
// (allowedActions); nothing moves forward on its own.

const S = (s) => String(s || '').toUpperCase();

/** Header card for a purchase, by status. */
export function purchaseHero(o) {
  const s = S(o.status);
  const visit = o.fulfilment === 'SHOP_VISIT';
  const who = o.pickup?.personName;
  switch (s) {
    case 'COMPLETED': return { Icon: CircleCheck, title: 'Purchase Completed', sub: 'Device received & payment confirmed', tint: C.greenBg, fg: C.green };
    case 'CANCELLED': return { Icon: XCircle, title: 'Purchase Cancelled', sub: o.cancelledBy === 'SHOP' ? `You cancelled: ${o.cancelReason || ''}` : 'The customer cancelled this sale', tint: C.redBg, fg: C.red };
    case 'PICKUP_ASSIGNED': return { Icon: Truck, title: o.pickup?.acceptedAt ? 'Pickup Accepted' : 'Pickup Assigned', sub: o.pickup?.acceptedAt ? `${who} will start the journey` : `Waiting for ${who || 'the employee'} to accept`, tint: C.mint, fg: C.teal };
    case 'OUT_FOR_PICKUP':
      if (o.revision?.status === 'SHOP_PENDING') return { Icon: IndianRupee, title: 'Approve Revised Price', sub: `${who || 'The employee'} asks ${money(o.revision.amount)} after the inspection`, tint: C.amberBg, fg: C.amber };
      if (o.payment?.recordedAt) return { Icon: Wallet, title: 'Customer Paid', sub: `${who || 'The employee'} paid at the doorstep and is collecting the device`, tint: C.mint, fg: C.teal };
      if (o.revision?.status === 'SHOP_APPROVED') return { Icon: Clock, title: 'Waiting for Customer', sub: `Final offer ${money(o.revision.amount)} is with the customer`, tint: C.amberBg, fg: C.amber };
      if (o.revision?.status === 'APPROVED') return { Icon: BadgeCheck, title: 'Customer Accepted', sub: `${who || 'The employee'} pays ${money(o.amount)} next`, tint: C.greenBg, fg: C.green };
      if (o.revision?.status === 'REJECTED') return { Icon: XCircle, title: 'Customer Rejected Offer', sub: `Declined ${money(o.revision.amount)} — keep the quote or offer another price`, tint: C.redBg, fg: C.red };
      if (o.revision?.status === 'NEGOTIATION') return { Icon: IndianRupee, title: 'Customer Wants to Negotiate', sub: o.revision.customerNote || `On ${money(o.revision.amount)}`, tint: C.amberBg, fg: C.amber };
      if (o.revision?.status === 'SHOP_CONFIRMED') return { Icon: BadgeCheck, title: 'Price Approved', sub: `${who || 'The employee'} pays ${money(o.amount)} next`, tint: C.greenBg, fg: C.green };
      if (o.revision?.status === 'REINSPECT') return { Icon: ShieldCheck, title: 'Re-check Requested', sub: o.revision.shopNote || `${who || 'The employee'} inspects the device again`, tint: C.amberBg, fg: C.amber };
      if (o.pickup?.inspectedAt) return { Icon: ClipboardCheck, title: 'Approve Final Price', sub: 'Review the doorstep inspection and approve the price', tint: C.amberBg, fg: C.amber };
      if (o.pickup?.otpVerifiedAt) return { Icon: ShieldCheck, title: 'Inspecting at Customer', sub: `${who || 'The employee'} verified the OTP`, tint: C.mint, fg: C.teal };
      return { Icon: Truck, title: 'Pickup On the Way', sub: `${who || 'The employee'} is going to the customer`, tint: C.mint, fg: C.teal };
    case 'PICKED_UP': return { Icon: PackageCheck, title: 'Device Picked Up', sub: 'Verify the handover when it reaches the shop', tint: C.mint, fg: C.teal };
    case 'DEVICE_RECEIVED': return { Icon: ShieldCheck, title: 'Device Received', sub: 'Inspect the device next', tint: C.amberBg, fg: C.amber };
    case 'INSPECTED': return { Icon: IndianRupee, title: 'Inspection Done', sub: 'Confirm the quote or revise the price', tint: C.amberBg, fg: C.amber };
    case 'PRICE_REVISION_PENDING': return { Icon: Clock, title: 'Waiting for Customer', sub: `Revised price ${money(o.revision?.amount)} sent for approval`, tint: C.amberBg, fg: C.amber };
    case 'REVISION_REJECTED': return { Icon: XCircle, title: 'Revised Price Rejected', sub: 'Keep the quote, offer another price, or cancel', tint: C.redBg, fg: C.red };
    case 'PRICE_CONFIRMED': return { Icon: Wallet, title: 'Final Price Agreed', sub: o.payment?.disputeNote ? 'Customer reported a payment problem' : 'Pay the customer and record it', tint: C.amberBg, fg: C.amber };
    case 'PAYMENT_PENDING': return { Icon: Clock, title: 'Payment Sent', sub: 'Waiting for the customer to confirm receipt', tint: C.amberBg, fg: C.amber };
    case 'PAID': return { Icon: BadgeCheck, title: 'Payment Confirmed', sub: 'Complete the purchase', tint: C.greenBg, fg: C.green };
    default: return { Icon: Handshake, title: 'Quote Accepted', sub: visit ? 'The customer will bring the device to the shop' : 'Assign an employee to pick up the device', tint: C.amberBg, fg: C.amber };
  }
}

export const PAYMENT_PILL = {
  PAID: { label: 'Paid', fg: C.green, bg: C.greenBg },
  AWAITING_CONFIRMATION: { label: 'Awaiting customer', fg: C.amber, bg: C.amberBg },
  PENDING: { label: 'Pending', fg: C.amber, bg: C.amberBg },
  CANCELLED: { label: 'Cancelled', fg: C.red, bg: C.redBg },
};

function Line({ icon: Icon, label, value, last, children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}>
      <Icon size={17} color={C.muted} />
      <Text style={{ width: 118, fontSize: rf(12), color: C.muted, marginLeft: 10 }}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {value != null ? <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, textAlign: 'right' }}>{value}</Text> : null}
        {children}
      </View>
    </View>
  );
}

function Track({ steps }) {
  return steps.map((st, i) => {
    const last = i === steps.length - 1;
    const done = st.done ?? !!st.at;
    const nextDone = !last && (steps[i + 1].done ?? !!steps[i + 1].at);
    return (
      <View key={st.label} style={{ flexDirection: 'row' }}>
        <View style={{ alignItems: 'center', width: 22 }}>
          <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: done ? C.teal : C.border, backgroundColor: done ? C.teal : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            {done ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
          </View>
          {!last ? <View style={{ flex: 1, width: 2, minHeight: 12, backgroundColor: done && nextDone ? C.teal : C.border }} /> : null}
        </View>
        <View style={{ flex: 1, marginLeft: 10, marginBottom: last ? 0 : 8 }}>
          <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: done ? C.text : C.muted }}>{st.label}</Text>
          {st.at ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{dateTime(st.at)}</Text> : null}
        </View>
      </View>
    );
  });
}

const Locked = ({ text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 12, padding: 12 }}>
    <Lock size={16} color={C.muted} />
    <Text style={{ flex: 1, fontSize: rf(12), color: C.muted, marginLeft: 8 }}>{text}</Text>
  </View>
);

/** Manage Pickup · Inspection · Final Price · Payment. onAction(key) runs one step. */
export default function PurchaseWorkflow({ o, busy, onAction, onOpenPhoto }) {
  const can = (k) => (o.allowedActions || []).includes(k);
  const s = S(o.status);
  const visit = o.fulfilment === 'SHOP_VISIT';
  const pk = o.pickup || {};
  const received = !!pk.receivedAt;
  const ins = o.inspection;
  const rev = o.revision;
  const pay = o.payment || {};
  const cancelled = s === 'CANCELLED';
  // Employee App doorstep inspection, and a revised price it asked for (SHOP_* until the customer answers).
  const pin = o.pickupInspection;
  const doorRev = rev && rev.amount != null && (String(rev.status).startsWith('SHOP_') || !!pin) ? rev : null;
  const decidePrice = ['CONFIRM_PICKUP_QUOTE', 'APPROVE_PICKUP_REVISION', 'REVISE_PICKUP_PRICE', 'REQUEST_REINSPECTION'].some(can);
  const issues = (pin?.checks || []).filter((c) => c && c.ok === false);
  const untested = (pin?.checks || []).filter((c) => c && c.result === 'NOT_TESTED');
  const who = pk.personName || 'the employee';
  // Payment opens once the final price is settled: owner-approved and customer-accepted (doorstep), or confirmed (shop).
  const priceSettled = ['PRICE_CONFIRMED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED'].includes(s) || !!pay.recordedAt
    || (!visit && s === 'OUT_FOR_PICKUP' && ['SHOP_CONFIRMED', 'APPROVED'].includes(S(rev?.status)));
  const tracking = !visit && !!pk.assignedAt && !cancelled && s !== 'COMPLETED';

  return (
    <>
      <Section title={visit ? 'Shop Visit' : 'Manage Pickup'}>
        <Card>
          {visit ? (
            <Text style={{ fontSize: rf(12.5), color: C.text }}>The customer brings the device to your shop. Confirm receipt when they arrive.</Text>
          ) : pk.personName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={18} color={C.teal} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{pk.personName}</Text>
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{[pk.personPhone, pk.acceptedAt ? 'Accepted' : 'Not accepted yet'].filter(Boolean).join(' · ')}</Text>
              </View>
              {pk.personPhone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${pk.personPhone}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={`Call ${pk.personName}`} style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={17} color={C.teal} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text style={{ fontSize: rf(12.5), color: C.muted, marginBottom: 10 }}>{cancelled ? 'No pickup.' : 'No employee assigned yet.'}</Text>
          )}
          {pk.issue && !pk.personName && !cancelled ? (
            <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Text style={{ fontSize: rf(12), color: C.red, fontWeight: '700' }}>{pk.issue}</Text>
            </View>
          ) : null}
          {!visit && (pk.assignedAt || received) ? (
            <Track steps={[
              ...pickupSteps(o).map((st) => ({ label: st.title, at: st.at, done: st.done })),
              { label: 'Picked up', at: pk.pickedUpAt },
              { label: 'Handed over at shop', at: pk.handedOverAt || pk.receivedAt },
              { label: 'Receipt confirmed', at: pk.receivedAt },
            ]} />
          ) : null}
          {visit && received ? <Text style={{ fontSize: rf(12), color: C.green, fontWeight: '700', marginTop: 8 }}>Received {dateTime(pk.receivedAt)}</Text> : null}
          {can('ASSIGN') || can('SCHEDULE') || can('RECEIVE') || tracking ? (
            <View style={{ gap: 8, marginTop: 12 }}>
              {tracking ? <PrimaryButton title="Track Pickup" icon={Truck} variant="outline" onPress={() => onAction('track')} /> : null}
              {can('ASSIGN') ? <PrimaryButton title={pk.personName ? 'Reassign Employee' : 'Assign Employee'} icon={UserPlus} variant={pk.personName ? 'outline' : 'primary'} onPress={() => onAction('assign')} /> : null}
              {can('SCHEDULE') ? <PrimaryButton title="Reschedule" icon={CalendarClock} variant="outline" onPress={() => onAction('schedule')} /> : null}
              {can('RECEIVE') ? (visit
                ? <PrimaryButton title="Mark Device Received" icon={PackageCheck} loading={busy === 'receive'} onPress={() => onAction('receive')} />
                : <PrimaryButton title="Verify Shop Handover" icon={PackageCheck} onPress={() => onAction('handover')} />) : null}
            </View>
          ) : null}
        </Card>
      </Section>

      {!pin && !doorRev && !visit && !cancelled ? (
        <Section title="Doorstep Inspection">
          <Locked text={pk.otpVerifiedAt
            ? `OTP verified ${dateTime(pk.otpVerifiedAt)}. ${who} is inspecting the device at the customer's location.`
            : `Done at the customer's location after ${who} verifies the customer's OTP.`} />
        </Section>
      ) : null}

      {pin || doorRev ? (
        <Section title="Doorstep Inspection">
          <Card>
            {(pin?.compare || []).map((r, i) => (
              <Line key={r.key || i} icon={r.match ? Check : XCircle} label={r.label} value={r.match ? (r.actual || '—') : `${r.listing || '—'} → ${r.actual || '—'}`} />
            ))}
            {pin?.imei ? <Line icon={ShieldCheck} label="IMEI" value={pin.imei} /> : null}
            {pin?.batteryHealth ? <Line icon={Check} label="Battery health" value={`${pin.batteryHealth}%`} /> : null}
            {issues.length ? (
              <Text style={{ fontSize: rf(11.5), color: C.red, marginTop: 8 }}>Failed: {issues.map((c) => (c.note ? `${c.label} (${c.note})` : c.label)).join(', ')}</Text>
            ) : null}
            {untested.length ? (
              <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4 }}>Not tested: {untested.map((c) => (c.note ? `${c.label} (${c.note})` : c.label)).join(', ')}</Text>
            ) : null}
            {pin?.checks?.length && !issues.length && !untested.length ? <Text style={{ fontSize: rf(11.5), color: C.green, fontWeight: '700', marginTop: 8 }}>All checks passed</Text> : null}
            {pin?.photos?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {pin.photos.map((u) => (
                  <Pressable key={u} onPress={() => onOpenPhoto?.(u)} accessibilityRole="imagebutton" accessibilityLabel="Doorstep photo">
                    <Image source={{ uri: u }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: C.field }} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {doorRev ? (
              <View style={{ backgroundColor: doorRev.status === 'SHOP_PENDING' ? C.amberBg : C.field, borderRadius: 12, padding: 12, marginTop: 12 }}>
                <Text style={{ fontSize: rf(12), color: C.muted }}>Revised final price</Text>
                <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.text, marginTop: 2 }}>{money(doorRev.amount)} <Text style={{ fontSize: rf(12), fontWeight: '600', color: C.muted }}>instead of {money(o.quotedPrice ?? o.amount)}</Text></Text>
                <Text style={{ fontSize: rf(12), color: C.text, marginTop: 6 }}>Reason: {doorRev.reason}</Text>
                {doorRev.pickupNote ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 2 }}>Note: {doorRev.pickupNote}</Text> : null}
                {doorRev.shopNote ? <Text style={{ fontSize: rf(12), color: C.red, marginTop: 2 }}>You: {doorRev.shopNote}</Text> : null}
                <Text style={{ fontSize: rf(12), fontWeight: '800', marginTop: 6, color: doorRev.status === 'APPROVED' ? C.green : /REJECTED/.test(doorRev.status) ? C.red : C.amber }}>
                  {{ SHOP_PENDING: 'Waiting for your approval', SHOP_APPROVED: 'Sent to the customer to accept', SHOP_REJECTED: 'You sent it back', APPROVED: 'Customer accepted', REJECTED: 'Customer declined', NEGOTIATION: 'Customer wants to negotiate' }[doorRev.status] || doorRev.status}
                </Text>
              </View>
            ) : null}
            {S(rev?.status) === 'REINSPECT' ? <Text style={{ fontSize: rf(12), color: C.amber, fontWeight: '700', marginTop: 8 }}>Re-check requested: {rev.shopNote || '—'}</Text> : null}
            {pin ? <PrimaryButton title="Review Inspection" icon={ClipboardCheck} variant="outline" style={{ marginTop: 12 }} onPress={() => onAction('review')} /> : null}
            {decidePrice ? <PrimaryButton title="Decide Final Price" icon={IndianRupee} style={{ marginTop: 8 }} onPress={() => onAction('finalPrice')} /> : null}
          </Card>
        </Section>
      ) : null}

      {visit || ins ? (
      <Section title={visit ? 'Inspection' : 'Shop Inspection'}>
        {!received && !cancelled ? <Locked text="Unlocks when the customer brings the device to your shop." /> : (
          <Card>
            {ins ? (
              <>
                <Line icon={ShieldCheck} label={ins.imei ? 'IMEI' : 'Serial'} value={ins.imei || ins.serial} />
                <Line icon={BadgeCheck} label="Model" value={ins.modelVerified ? 'Matches' : 'Doesn’t match'} />
                <Line icon={ClipboardCheck} label="Condition" value={ins.condition} />
                {INSPECTION_CHECKS.filter(([k]) => typeof ins.checks?.[k] === 'boolean').length > 1 ? (
                  <Line icon={Check} label="Functional checks" value={`${INSPECTION_CHECKS.filter(([k]) => ins.checks?.[k]).length}/${INSPECTION_CHECKS.filter(([k]) => typeof ins.checks?.[k] === 'boolean').length} passed`} />
                ) : <Line icon={Check} label="Display" value={ins.checks?.display === false ? 'Damaged' : 'No damage'} />}
                {ins.batteryHealth ? <Line icon={Check} label="Battery health" value={`${ins.batteryHealth}%`} /> : null}
                <Line icon={Check} label="Accessories" value={(ins.accessories || []).join(', ') || 'None'} last={!ins.notes} />
                {ins.notes ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 8 }}>{ins.notes}</Text> : null}
                {INSPECTION_CHECKS.some(([k]) => ins.checks?.[k] === false) ? (
                  <Text style={{ fontSize: rf(11.5), color: C.red, marginTop: 6 }}>Failed: {INSPECTION_CHECKS.filter(([k]) => ins.checks?.[k] === false).map(([, l]) => l).join(', ')}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {(ins.photos || []).map((u) => (
                    <Pressable key={u} onPress={() => onOpenPhoto?.(u)} accessibilityRole="imagebutton" accessibilityLabel="Inspection photo">
                      <Image source={{ uri: u }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: C.field }} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : <Text style={{ fontSize: rf(12.5), color: C.muted }}>{cancelled ? 'Not inspected.' : 'Check IMEI, model, condition and functions, and add photos.'}</Text>}
            {can('INSPECT') ? <PrimaryButton title={ins ? 'Edit Inspection' : 'Start Inspection'} icon={ShieldCheck} variant={ins ? 'outline' : 'primary'} style={{ marginTop: 12 }} onPress={() => onAction('inspect')} /> : null}
          </Card>
        )}
      </Section>
      ) : null}

      <Section title="Final Price">
        {!ins && !pin && !cancelled ? <Locked text="Decide the final price after the inspection." /> : (
          <Card>
            <Line icon={Handshake} label="Accepted quote" value={money(o.quotedPrice ?? o.amount)} last={!rev} />
            {rev ? (
              <>
                <Line icon={PenLine} label="Revised price" value={money(rev.amount)} />
                <Line icon={Clock} label="Customer" last>
                  <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: rev.status === 'APPROVED' ? C.green : rev.status === 'REJECTED' ? C.red : C.amber }}>
                    {rev.status === 'APPROVED' ? 'Approved' : rev.status === 'REJECTED' ? 'Rejected' : String(rev.status).startsWith('SHOP_') ? 'Not asked yet' : 'Waiting for approval'}
                  </Text>
                </Line>
                <Text style={{ fontSize: rf(12), color: C.text, marginTop: 8 }}>Reason: {rev.reason}</Text>
                {rev.customerNote ? <Text style={{ fontSize: rf(12), color: C.red, marginTop: 4 }}>Customer: {rev.customerNote}</Text> : null}
              </>
            ) : null}
            {['PRICE_CONFIRMED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED'].includes(s) ? (
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.green, marginTop: 10 }}>Final price {money(o.amount)}</Text>
            ) : null}
            {can('CONFIRM_PRICE') || can('REVISE_PRICE') ? (
              <View style={{ gap: 8, marginTop: 12 }}>
                {can('CONFIRM_PRICE') ? <PrimaryButton title={`Confirm ${money(o.quotedPrice ?? o.amount)}`} icon={BadgeCheck} loading={busy === 'confirmPrice'} onPress={() => onAction('confirmPrice')} /> : null}
                {can('REVISE_PRICE') ? <PrimaryButton title={rev?.status === 'REJECTED' ? 'Offer Another Price' : 'Revise Price'} icon={PenLine} variant="outline" onPress={() => onAction('revise')} /> : null}
              </View>
            ) : null}
          </Card>
        )}
      </Section>

      <Section title="Payment Details">
        {!priceSettled && !cancelled ? <Locked text="Payment unlocks after you approve the final price and the customer accepts it." /> : (
        <Card style={{ paddingVertical: 4 }}>
          <Line icon={Wallet} label="Amount" value={money(pay.amount ?? o.amount)} />
          <Line icon={BadgeCheck} label="Status" last={!pay.method}>
            {(() => { const p = PAYMENT_PILL[pay.status] || PAYMENT_PILL.PENDING; return (
              <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: p.bg }}>
                <Text style={{ fontSize: rf(11), fontWeight: '800', color: p.fg }}>{p.label}</Text>
              </View>
            ); })()}
          </Line>
          {pay.method ? (
            <>
              <Line icon={Store} label="Method" value={pay.method === 'CASH' ? 'Cash' : [pay.method === 'UPI' ? 'UPI' : 'Bank', pay.account].filter(Boolean).join(' · ')} />
              <Line icon={ClipboardCheck} label="Reference" value={pay.reference || '—'} last={!pay.paidAt && !pay.proofUrl} />
              {pay.proofUrl ? (
                <Line icon={ClipboardCheck} label="Payment proof" last={!pay.paidAt}>
                  <Pressable onPress={() => onOpenPhoto?.(pay.proofUrl)} accessibilityRole="imagebutton" accessibilityLabel="Payment proof">
                    <Image source={{ uri: pay.proofUrl }} style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: C.field }} />
                  </Pressable>
                </Line>
              ) : null}
              {pay.paidAt ? <Line icon={CircleCheck} label="Confirmed" value={dateTime(pay.paidAt)} last /> : null}
            </>
          ) : null}
        </Card>
        )}
        {pay.disputeNote && s === 'PRICE_CONFIRMED' ? (
          <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 10, marginTop: 8 }}>
            <Text style={{ fontSize: rf(12), color: C.red, fontWeight: '700' }}>Customer: {pay.disputeNote}</Text>
          </View>
        ) : null}
        {can('RECORD_PAYOUT') ? <PrimaryButton title="Record Payment" icon={Wallet} style={{ marginTop: 10 }} onPress={() => onAction('payout')} /> : null}
        {s === 'PAYMENT_PENDING' ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 8 }}>The purchase can be completed after the customer confirms they received the money.</Text> : null}
      </Section>

      {can('CANCEL') ? (
        <PrimaryButton title="Cancel Purchase" icon={XCircle} variant="danger" style={{ marginTop: 18 }} onPress={() => onAction('cancel')} />
      ) : null}
    </>
  );
}
