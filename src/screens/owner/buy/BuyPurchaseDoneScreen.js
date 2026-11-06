import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Boxes, Check, Eye, FileText } from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { C, InfoRow, PrimaryButton, money } from '../sell/kit';
import { DeviceRow, PurchasePage, usePurchase, whenLabel } from './purchaseKit';

// Page 7 — Purchase Completed (status COMPLETED): the device, customer,
// employee, quote vs final price, payment, handover and receipt, with
// Purchase Receipt / View Inventory / View Purchase. The inventory reference is
// the stock entry the server adds once per purchase (o.inventory).

const METHOD = { UPI: 'UPI', BANK: 'Bank transfer', CASH: 'Cash' };

const DOTS = [
  { top: 6, left: '18%', c: '#F59E0B' }, { top: 30, left: '10%', c: C.green }, { top: 70, left: '16%', c: '#F59E0B' },
  { top: 4, right: '20%', c: C.green }, { top: 36, right: '11%', c: '#F59E0B' }, { top: 74, right: '17%', c: C.green },
];

function Action({ Icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label.replace('\n', ' ')} className="active:opacity-70" style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
      <Icon size={26} color={C.teal} />
      <Text style={{ fontSize: rf(11.5), color: C.text, marginTop: 6, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function BuyPurchaseDoneScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="" statuses={['COMPLETED']}
      footer={<PrimaryButton title="Done" onPress={() => navigation.popTo('BuyOrders')} />}>
      {o ? (
        <>
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <View style={{ height: 96, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {DOTS.map(({ c, ...pos }, i) => <View key={i} style={{ position: 'absolute', height: 7, width: 7, borderRadius: 2, transform: [{ rotate: `${i * 35}deg` }], backgroundColor: c, ...pos }} />)}
              <View style={{ height: 72, width: 72, borderRadius: 36, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={40} color="#FFFFFF" strokeWidth={3.2} />
              </View>
            </View>
            <Text style={{ fontSize: rf(22), fontWeight: '800', color: C.text, marginTop: 8 }}>Purchase Completed</Text>
            <Text style={{ fontSize: rf(13), color: C.muted, marginTop: 6, textAlign: 'center' }}>The device has been purchased{'\n'}successfully.</Text>
          </View>

          <View style={{ backgroundColor: C.field, borderRadius: 16, padding: 14, marginTop: 20 }}>
            <DeviceRow o={o} size={64}>
              <Text style={{ fontSize: rf(17), fontWeight: '800', color: C.text, marginTop: 6 }}>{money(o.payment?.amount ?? o.amount)}</Text>
            </DeviceRow>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <Action Icon={FileText} label={'Purchase\nReceipt'} onPress={() => navigation.navigate('BuyReceipt', { id: o.id, order: o, leadRef })} />
            <View style={{ width: 1, backgroundColor: C.border, marginVertical: 8 }} />
            <Action Icon={Boxes} label={'View\nInventory'} onPress={() => navigation.navigate('Inventory')} />
            <View style={{ width: 1, backgroundColor: C.border, marginVertical: 8 }} />
            <Action Icon={Eye} label={'View\nPurchase'} onPress={() => navigation.navigate('BuyOrderDetail', { id: o.id, kind: 'LEAD' })} />
          </View>

          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 4, marginTop: 14 }}>
            <InfoRow label="Customer" value={[o.customer?.name, o.customer?.phone].filter(Boolean).join(' · ') || '—'} />
            {o.fulfilment !== 'SHOP_VISIT' ? <InfoRow label="Employee" value={[o.pickup?.personName, o.pickup?.personPhone].filter(Boolean).join(' · ') || '—'} /> : <InfoRow label="Fulfilment" value="Shop visit" />}
            <InfoRow label="Original quote" value={money(o.quotedPrice ?? o.amount)} />
            <InfoRow label="Final price" value={money(o.payment?.amount ?? o.amount)} bold />
            <InfoRow label="Payment" value={[METHOD[o.payment?.method] || o.payment?.method, o.payment?.reference, o.payment?.paidAt ? `confirmed ${whenLabel(o.payment.paidAt)}` : null].filter(Boolean).join(' · ') || '—'} />
            <InfoRow label="Handover" value={o.pickup?.receivedAt ? `Received ${whenLabel(o.pickup.receivedAt)}` : '—'} />
            <InfoRow label="Receipt" value={o.orderNumber || '—'} />
            <InfoRow label="Inventory ref." value={o.inventory?.sku || 'Not created (inventory table unavailable on the server)'} />
          </View>
        </>
      ) : null}
    </PurchasePage>
  );
}
