import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Store, Truck, UserRound } from 'lucide-react-native';
import { BUY_ORDER_STATUS } from '../../../api/buyOrders';
import { C, PrimaryButton, Thumb, money } from './kit';

// One fixed-price customer order (Orders / Assign Pickup lists), in the My
// Listings card look: image panel with status tag left, details right, a full
// width status row and the actions below. Assign / Reassign only appear when
// the list passes onAssign (Assign Pickup); Orders shows Confirm + View only.

export const CAN_ASSIGN = ['CONFIRMED', 'DELIVERY_FAILED'];
export const CAN_REASSIGN = ['ASSIGNED'];

const TONE = { amber: C.amber, teal: C.teal, green: C.green, red: C.red, grey: C.muted };

export default function BuyOrderCard({ o, staffName, busy, disabled, onConfirm, onAssign, onView }) {
  const staff = staffName || o.assignedStaffName;
  const meta = BUY_ORDER_STATUS[o.status] || {};
  const home = o.fulfilmentType === 'HOME_DELIVERY';
  const assignable = home && CAN_ASSIGN.includes(o.status);
  const reassignable = home && CAN_REASSIGN.includes(o.status);
  const label = assignable && o.status === 'CONFIRMED' && onAssign ? 'Ready to assign' : meta.label || o.status;
  const tone = TONE[meta.tone] || C.teal;
  const action = o.status === 'PLACED' && onConfirm ? 'confirm' : assignable && onAssign ? 'assign' : reassignable && onAssign ? 'reassign' : null;
  return (
    <View style={{ marginBottom: 12, borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
      <Pressable onPress={onView ? () => onView(o) : undefined} disabled={!onView} accessibilityRole={onView ? "button" : undefined} accessibilityLabel={o.productTitle || 'Order'} className="active:opacity-90" style={{ flexDirection: 'row' }}>
        <View style={{ width: 111, minHeight: 116, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#E5E7EB' }}>
          <Thumb uri={o.productImage} size={84} radius={0} style={{ backgroundColor: '#FFFFFF' }} />
          <View style={{ position: 'absolute', top: 0, left: 0, maxWidth: '86%', backgroundColor: tone, paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }} numberOfLines={1}>{label}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 9 }}>
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '800', color: C.teal }}>#{o.orderNumber}</Text>
          <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, fontWeight: '700', lineHeight: 17, color: C.text }}>{o.productTitle || 'Product'}</Text>
          <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 11.5, color: C.muted }}>
            {[o.customerName, o.quantity > 1 ? `Qty ${o.quantity}` : null].filter(Boolean).join(' · ') || 'Customer'}
          </Text>
          <View style={{ flex: 1, minHeight: 6 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            {home ? <Truck size={13} color={C.muted} /> : <Store size={13} color={C.muted} />}
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 5, fontSize: 11, fontWeight: '600', color: C.muted }}>{home ? 'Home Delivery' : 'Visit Shop'}</Text>
          </View>
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 15, fontWeight: '800', color: C.teal }}>{money(o.totalAmount)}</Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F1F1', paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
        <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: tone }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '700', color: tone }}>{label}</Text>
          {staff ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
              <UserRound size={11} color={C.muted} />
              <Text numberOfLines={1} style={{ marginLeft: 4, fontSize: 10.5, color: C.text }}>{staff}</Text>
            </View>
          ) : null}
        </View>
        {action === 'confirm' ? <PrimaryButton small variant="green" title="Confirm" loading={busy} disabled={disabled} onPress={() => onConfirm(o)} /> : null}
        {action === 'assign' ? <PrimaryButton small variant="green" title="Assign" onPress={() => onAssign(o)} /> : null}
        {action === 'reassign' ? <PrimaryButton small variant="outline" title="Reassign" onPress={() => onAssign(o)} /> : null}
      </View>
    </View>
  );
}
