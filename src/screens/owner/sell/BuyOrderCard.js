import React from 'react';
import { Text, View } from 'react-native';
import { Store, Truck, UserRound } from 'lucide-react-native';
import { BUY_ORDER_STATUS } from '../../../api/buyOrders';
import { C, Card, PrimaryButton, StatusPill, Thumb, money } from './kit';

// One fixed-price customer order (Orders / Assign Pickup lists): product, amount,
// fulfilment, status, assigned employee and the next action the server allows
// for that status (Confirm a new order, Assign / Reassign a home delivery).

export const CAN_ASSIGN = ['CONFIRMED', 'DELIVERY_FAILED'];
export const CAN_REASSIGN = ['ASSIGNED'];

export default function BuyOrderCard({ o, staffName, busy, disabled, onConfirm, onAssign, onView }) {
  const staff = staffName || o.assignedStaffName;
  const meta = BUY_ORDER_STATUS[o.status] || {};
  const home = o.fulfilmentType === 'HOME_DELIVERY';
  const assignable = home && CAN_ASSIGN.includes(o.status);
  const reassignable = home && CAN_REASSIGN.includes(o.status);
  return (
    <Card style={{ marginBottom: 10 }} onPress={() => onView(o)}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Thumb uri={o.productImage} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: C.teal }} numberOfLines={1}>{o.orderNumber}</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>{money(o.totalAmount)}</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 }} numberOfLines={1}>{o.productTitle || 'Product'}</Text>
          {o.customerName ? <Text style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{o.customerName}{o.quantity > 1 ? `  ·  Qty ${o.quantity}` : ''}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {home ? <Truck size={14} color={C.muted} /> : <Store size={14} color={C.muted} />}
            <Text style={{ fontSize: 12, color: C.muted, flex: 1 }} numberOfLines={1}>{home ? 'Home Delivery' : 'Visit Shop'}</Text>
            <StatusPill status={o.status} label={assignable && o.status === 'CONFIRMED' ? 'Ready to assign' : meta.label} />
          </View>
          {staff ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <UserRound size={13} color={C.muted} />
              <Text style={{ fontSize: 12, color: C.text }} numberOfLines={1}>{staff}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
            {o.status === 'PLACED' && onConfirm ? (
              <PrimaryButton small variant="green" title="Confirm" loading={busy} disabled={disabled} onPress={() => onConfirm(o)} />
            ) : assignable && onAssign ? (
              <PrimaryButton small variant="green" title="Assign" onPress={() => onAssign(o)} />
            ) : reassignable && onAssign ? (
              <PrimaryButton small variant="outline" title="Reassign" onPress={() => onAssign(o)} />
            ) : null}
            <PrimaryButton small variant="outline" title="View" onPress={() => onView(o)} />
          </View>
        </View>
      </View>
    </Card>
  );
}
