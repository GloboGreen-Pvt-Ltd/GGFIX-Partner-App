import React, { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { ArrowRight, ClipboardCheck, Clock } from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { C, PrimaryButton, Section, money } from '../sell/kit';
import { inspectionReasons } from './BuyFinalPriceScreen';
import { DeviceRow, PurchasePage, goToStep, purchaseRoute, up, usePurchase, whenLabel } from './purchaseKit';

// Inspection Review (pickup): what the customer listed beside what the
// employee found at the customer's place after the OTP (GET shop-purchases
// pickupInspection — saved from the Employee App with at least 3 photos).
// Read-only here; the price decision is on Final Price Approval.

const COMPARE = ['brand', 'model', 'storage', 'color', 'condition', 'issue'];
const CHECKS = ['display', 'touch', 'battery', 'camera', 'speaker', 'network', 'body'];
const RESULT = { PASS: 'Pass', FAIL: 'Fail', NOT_TESTED: 'Not tested' };

function Pill({ kind, tag }) {
  const m = kind === 'match' ? { t: tag || 'Matched', fg: C.green, bg: C.greenBg }
    : kind === 'mismatch' ? { t: tag || 'Mismatched', fg: C.red, bg: C.redBg }
      : { t: kind === 'untested' ? 'Not tested' : 'No data', fg: C.muted, bg: '#F1F2F4' };
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: m.fg }}>{m.t}</Text>
    </View>
  );
}

function Row({ label, customer, employee, kind, tag, note, last }) {
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Text style={{ width: 78, fontSize: rf(12), fontWeight: '800', color: C.text }}>{label}</Text>
        <Text style={{ flex: 1, fontSize: rf(12), color: C.text, paddingRight: 6 }}>{customer || '—'}</Text>
        <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '700', color: kind === 'mismatch' ? C.red : C.text, paddingRight: 6 }}>{employee || '—'}</Text>
        <Pill kind={kind} tag={tag} />
      </View>
      {note ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4, marginLeft: 78 }}>{note}</Text> : null}
    </View>
  );
}

export default function BuyInspectionReviewScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const [photo, setPhoto] = useState(null);
  const pin = o?.pickupInspection;
  const pk = o?.pickup || {};
  const rev = o?.revision;

  const byKey = Object.fromEntries((pin?.compare || []).filter(Boolean).map((r) => [r.key, r]));
  const checks = Object.fromEntries((pin?.checks || []).filter(Boolean).map((c) => [c.key, c]));
  const rows = [];
  COMPARE.forEach((k) => {
    const r = byKey[k];
    if (r) rows.push({ label: r.label, customer: r.listing, employee: r.actual, kind: r.match === false ? 'mismatch' : 'match' });
  });
  // IMEI: the customer's (sell order) vs the one the employee read off the device.
  const custImei = o?.imei || null;
  const empImei = pin?.imei || checks.imei?.value || null;
  rows.push({
    label: 'IMEI', customer: custImei || 'Not provided', employee: empImei,
    kind: custImei && empImei ? (String(custImei).trim() === String(empImei).trim() ? 'match' : 'mismatch') : checks.imei?.ok === false ? 'mismatch' : empImei ? 'match' : 'none',
    note: checks.imei?.note || null,
  });
  CHECKS.forEach((k) => {
    const c = checks[k];
    if (!c) return;
    const value = k === 'battery' && (c.value ?? pin?.batteryHealth) != null ? `${RESULT[c.result] || '—'} · ${c.value ?? pin.batteryHealth}%` : RESULT[c.result] || '—';
    rows.push({ label: c.label, customer: '—', employee: value, kind: c.ok === true ? 'match' : c.ok === false ? 'mismatch' : 'untested', tag: c.ok === true ? 'Pass' : c.ok === false ? 'Fail' : null, note: c.note || null });
  });
  const mismatches = rows.filter((r) => r.kind === 'mismatch').length;
  const reasons = inspectionReasons(o);
  const next = o ? purchaseRoute(o.status, o) : null;
  const status = up(o?.status);

  const decide = ['CONFIRM_PICKUP_QUOTE', 'APPROVE_PICKUP_REVISION', 'REVISE_PICKUP_PRICE', 'REQUEST_REINSPECTION'].some((a) => (o?.allowedActions || []).includes(a));
  const recheck = up(rev?.status) === 'REINSPECT';
  const ans = o?.customerAnswers || {};
  const custBits = [
    ans.workingCondition ? `Working: ${String(ans.workingCondition).replace(/_/g, ' ').toLowerCase()}` : null,
    ...(ans.conditions || []).map((c) => (c?.group ? `${c.group}: ${c.option || '—'}` : c?.option)).filter(Boolean),
    (ans.issues || []).length ? `Problems: ${ans.issues.map((i) => String(i).replace(/_/g, ' ').toLowerCase()).join(', ')}` : null,
    ...(ans.screening || []).map((q) => (q?.question ? `${q.question} ${q.answer || '—'}` : null)).filter(Boolean),
    (ans.accessories || []).length ? `Accessories: ${ans.accessories.join(', ')}` : null,
  ].filter(Boolean);

  const footer = !o || !pin ? null : decide ? (
    <PrimaryButton title={up(rev?.status) === 'SHOP_PENDING' ? `Decide Final Price · ${money(rev?.amount)}` : 'Decide Final Price'} iconRight={ArrowRight}
      onPress={() => navigation.navigate('BuyFinalPrice', { id: o.id, order: o, leadRef })} />
  ) : next !== 'BuyInspectionReview' && status !== 'CANCELLED' ? (
    <PrimaryButton title="Continue" iconRight={ArrowRight} onPress={() => goToStep(navigation, o, leadRef)} />
  ) : null;

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Inspection Review" statuses={() => true} footer={footer}>
      {o ? (
        <>
          <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 12, marginTop: 6 }}>
            <DeviceRow o={o} size={52}>
              <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4 }}>{`Accepted quote ${money(o.quotedPrice ?? o.amount)}`}</Text>
            </DeviceRow>
          </View>

          {recheck ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 14, padding: 14, marginTop: 14 }}>
              <Clock size={22} color={C.amber} />
              <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 10 }}>
                {`Re-check requested${rev?.shopNote ? `: “${rev.shopNote}”` : ''}. ${pk.personName || 'The employee'} submits the inspection again; the last one is shown below.`}
              </Text>
            </View>
          ) : null}

          {custBits.length ? (
            <Section title="Customer's Answers">
              <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 12 }}>
                {custBits.map((t, i) => <Text key={`${i}-${t}`} style={{ fontSize: rf(12), color: C.text, marginTop: i ? 4 : 0 }}>{`• ${t}`}</Text>)}
              </View>
            </Section>
          ) : null}

          {!pin ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 14, padding: 14, marginTop: 14 }}>
              <Clock size={22} color={C.amber} />
              <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 10 }}>
                {pk.otpVerifiedAt
                  ? `${pk.personName || 'The employee'} verified the OTP ${whenLabel(pk.otpVerifiedAt)} and is inspecting the device.`
                  : `The inspection happens at the customer's location after ${pk.personName || 'the employee'} verifies the customer's OTP.`}
              </Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: mismatches ? C.redBg : C.greenBg, borderRadius: 14, padding: 12, marginTop: 14 }}>
                <ClipboardCheck size={20} color={mismatches ? C.red : C.green} />
                <Text style={{ flex: 1, fontSize: rf(12.5), fontWeight: '700', color: C.text, marginLeft: 10 }}>
                  {`${mismatches ? `${mismatches} mismatch${mismatches > 1 ? 'es' : ''} / failed check${mismatches > 1 ? 's' : ''}` : 'Everything matches the listing'} · by ${pk.personName || 'employee'}${pk.inspectedAt ? `, ${whenLabel(pk.inspectedAt)}` : ''}`}
                </Text>
              </View>

              <Section title="Customer vs Employee">
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
                  <View style={{ flexDirection: 'row', paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    <Text style={{ width: 78, fontSize: rf(11), color: C.muted }}>Item</Text>
                    <Text style={{ flex: 1, fontSize: rf(11), color: C.muted }}>Customer</Text>
                    <Text style={{ flex: 1, fontSize: rf(11), color: C.muted }}>Employee</Text>
                    <Text style={{ width: 72, fontSize: rf(11), color: C.muted }}>Result</Text>
                  </View>
                  {rows.map((r, i) => <Row key={r.label} {...r} last={i === rows.length - 1} />)}
                </View>
                <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 6 }}>Functional checks are the employee's results; the customer's own answers are listed under Customer's Answers.</Text>
              </Section>

              <Section title={`Inspection Photos (${(pin.photos || []).length})`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(pin.photos || []).map((u) => (
                    <Pressable key={u} onPress={() => setPhoto(u)} accessibilityRole="imagebutton" accessibilityLabel="Inspection photo">
                      <Image source={{ uri: u }} style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: C.field }} />
                    </Pressable>
                  ))}
                </View>
                {(pin.photos || []).length < 3 ? <Text style={{ fontSize: rf(11.5), color: C.red, marginTop: 6 }}>Fewer than 3 photos on record.</Text> : null}
              </Section>

              {reasons.length || rev?.reason || rev?.pickupNote || rev?.shopNote ? (
                <Section title="Notes & Mismatch Reasons">
                  <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 12 }}>
                    {reasons.map((r) => <Text key={r} style={{ fontSize: rf(12), color: C.red, marginBottom: 4 }}>{`• ${r}`}</Text>)}
                    {rev?.reason ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 2 }}>{`Price reason: ${rev.reason}${rev.amount != null ? ` (${money(rev.amount)})` : ''}`}</Text> : null}
                    {rev?.pickupNote ? <Text style={{ fontSize: rf(12), color: C.text, marginTop: 2 }}>{`Employee note: ${rev.pickupNote}`}</Text> : null}
                    {rev?.shopNote ? <Text style={{ fontSize: rf(12), color: C.amber, marginTop: 2 }}>{`Your note: ${rev.shopNote}`}</Text> : null}
                  </View>
                </Section>
              ) : null}

              {!rev && decide ? (
                <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 14 }}>
                  {`No price change suggested. Approve the quote of ${money(o.quotedPrice ?? o.amount)} (or set another price) — payment stays locked until you do.`}
                </Text>
              ) : null}
            </>
          )}

          <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
            <Pressable onPress={() => setPhoto(null)} accessibilityRole="button" accessibilityLabel="Close photo"
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}>
              {photo ? <Image source={{ uri: photo }} resizeMode="contain" style={{ width: '100%', height: '80%' }} /> : null}
            </Pressable>
          </Modal>
        </>
      ) : null}
    </PurchasePage>
  );
}
