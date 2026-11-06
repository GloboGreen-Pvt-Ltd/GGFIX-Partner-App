import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { CircleCheck, Info, PackageCheck, Phone } from 'lucide-react-native';
import { receivePurchaseDevice } from '../../../api/orders';
import { confirm } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, CheckRow, InfoRow, PrimaryButton, Section, TextField, money } from '../sell/kit';
import { DeviceRow, Initials, PurchasePage, goToStep, up, usePurchase, useStep, whenLabel } from './purchaseKit';

// Shop Handover (pickup, status PICKED_UP): the employee brings the collected
// device back (Employee App "handed over"). The owner checks the order ID, the
// IMEI and the condition against the doorstep inspection, then confirms receipt
// (POST …/receive { imei, orderVerified, conditionVerified } — the server
// re-checks the IMEI, accepts it once, adds one stock entry and the customer
// then confirms the payment).

const METHOD = { UPI: 'UPI', BANK: 'Bank transfer', CASH: 'Cash' };
const digits = (v) => String(v || '').replace(/\D/g, '');
const applies = (x) => up(x?.status) === 'PICKED_UP' || !!x?.pickup?.receivedAt;

export default function BuyHandoverScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const [busy, run] = useStep();
  const [okOrder, setOkOrder] = useState(false);
  const [okCondition, setOkCondition] = useState(false);
  const [okImei, setOkImei] = useState(false);
  const [imei, setImei] = useState('');

  const pk = o?.pickup || {};
  const pin = o?.pickupInspection || {};
  const pay = o?.payment || {};
  const received = !!pk.receivedAt;
  const expectedImei = digits(pin.imei || o?.imei);
  const imeiMatch = expectedImei ? digits(imei) === expectedImei : okImei;
  const condition = (pin.compare || []).find((r) => r?.key === 'condition')?.actual || pin.condition || o?.condition || null;
  const ready = okOrder && okCondition && imeiMatch;
  const canReceive = (o?.allowedActions || []).includes('RECEIVE');

  const confirmReceipt = () => run('receive', async () => {
    if (!ready) throw new Error('Verify the order ID, IMEI and condition first.');
    const ok = await confirm({ title: 'Confirm receipt?', message: `The ${o.productName || 'device'} for ${o.orderNumber || 'this order'} is now at your shop.`, confirmText: 'Confirm Receipt' });
    if (!ok) return;
    const d = await receivePurchaseDevice(o.id, { imei: imei || null, orderVerified: okOrder, conditionVerified: okCondition });
    showToast({ type: 'success', title: 'Handover confirmed', message: up(d?.status) === 'PAYMENT_PENDING' ? 'Waiting for the customer to confirm the payment.' : 'Device received at the shop.' });
    goToStep(navigation, d, leadRef);
  });

  const footer = !o || received ? null : (
    <PrimaryButton title="Confirm Receipt" icon={PackageCheck} loading={busy === 'receive'} disabled={!ready || !canReceive} onPress={confirmReceipt} />
  );

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Shop Handover" statuses={applies} footer={footer}>
      {o ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 14, padding: 12, marginTop: 6 }}>
            <Initials name={pk.personName} size={44} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <Text numberOfLines={1} style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{pk.personName || 'Pickup person'}</Text>
              <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{pk.handedOverAt ? `Handed over ${whenLabel(pk.handedOverAt)}` : pk.pickedUpAt ? `Collected ${whenLabel(pk.pickedUpAt)} · on the way to the shop` : 'Bringing the device to your shop'}</Text>
            </View>
            {pk.personPhone ? <PrimaryButton title="Call" icon={Phone} variant="outline" small onPress={() => Linking.openURL(`tel:${pk.personPhone}`).catch(() => {})} /> : null}
          </View>

          <View style={{ backgroundColor: C.field, borderRadius: 14, padding: 12, marginTop: 12 }}>
            <DeviceRow o={o} size={52} />
          </View>

          <Section title="Order">
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 4 }}>
              <InfoRow label="Order ID" value={o.orderNumber || '—'} bold />
              <InfoRow label="Expected IMEI" value={pin.imei || o.imei || 'Not recorded'} />
              <InfoRow label="Inspected condition" value={condition || '—'} />
              <InfoRow label="Final price" value={money(pay.amount ?? o.amount)} />
              <InfoRow label="Payment" value={pay.recordedAt ? `${METHOD[pay.method] || pay.method || '—'} · ${pay.status === 'PAID' ? 'Verified by customer' : 'Awaiting customer confirmation'}` : 'Not recorded'} />
            </View>
          </Section>

          {received ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenBg, borderRadius: 14, padding: 14, marginTop: 16 }}>
              <CircleCheck size={22} color={C.green} />
              <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, marginLeft: 10 }}>{`Device received at the shop ${whenLabel(pk.receivedAt)}.`}</Text>
            </View>
          ) : (
            <Section title="Verify Handover">
              <CheckRow label={`Order ID matches ${o.orderNumber || ''}`.trim()} sub="Check the order on the device / pickup slip" checked={okOrder} onToggle={() => setOkOrder((v) => !v)} />
              {expectedImei ? (
                <TextField
                  label="IMEI on the device"
                  required
                  value={imei}
                  onChangeText={(t) => setImei(digits(t).slice(0, 17))}
                  placeholder="Dial *#06# and enter the IMEI"
                  keyboardType="number-pad"
                  maxLength={17}
                  error={imei && !imeiMatch ? 'Does not match the inspected IMEI' : null}
                  style={{ marginTop: 10 }}
                />
              ) : (
                <CheckRow label="IMEI checked on the device" sub="No IMEI was recorded at the doorstep" checked={okImei} onToggle={() => setOkImei((v) => !v)} style={{ marginTop: 10 }} />
              )}
              <CheckRow label="Condition matches the inspection" sub={condition ? `Inspected: ${condition}` : 'Compare with the inspection photos'} checked={okCondition} onToggle={() => setOkCondition((v) => !v)} style={{ marginTop: 10 }} />
              {!canReceive ? <Text style={{ fontSize: rf(11.5), color: C.amber, marginTop: 10 }}>Receipt can be confirmed once the employee has collected the device.</Text> : null}
            </Section>
          )}

          <Section title="Inventory">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.field, borderRadius: 12, padding: 12 }}>
              <Info size={16} color={C.muted} />
              <Text style={{ flex: 1, fontSize: rf(11.5), color: C.muted, marginLeft: 8 }}>
                {o.inventory?.sku
                  ? `Added to stock as ${o.inventory.sku} (1 unit).`
                  : 'One stock entry is added when you confirm receipt of a paid device (never twice for the same order).'}
              </Text>
            </View>
          </Section>
        </>
      ) : null}
    </PurchasePage>
  );
}
