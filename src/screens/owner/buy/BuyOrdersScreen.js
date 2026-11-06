import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { listMyOrders, listShopPurchases } from '../../../api/orders';
import { rf } from '../../../utils/responsive';
import { C, EmptyBox, ErrorBox, SearchInput, SellScreen, TabPills, Thumb, money } from '../sell/kit';
import { BellButton, dateTime, orderBucket, orderPill } from './buyKit';

// Page 6 — this shop's purchase orders: devices bought from customers' sell
// leads (GET /sell-orders/shop-purchases, kind LEAD) and marketplace buys
// (GET /customer-orders?orderType=BUY, kind BUY). New · In Progress ·
// Completed, search by order number or item.

export const orderItems = (o) => (Array.isArray(o?.payload?.items) ? o.payload.items : []);
export const orderTitle = (o) => o?.payload?.title || orderItems(o)[0]?.title || 'Order';
export const orderImage = (o) => orderItems(o).map((i) => i.imageUrl || i.image || i.productImage).find(Boolean) || null;

const fromLead = (p) => ({ key: `L-${p.id}`, kind: 'LEAD', id: p.id, number: p.orderNumber, status: p.status, title: p.productName, image: p.imageUrl, amount: p.amount, createdAt: p.createdAt, raw: p });
const fromBuy = (o) => ({ key: `B-${o.id}`, kind: 'BUY', id: o.id, number: o.orderNumber, status: o.status, title: orderTitle(o), image: orderImage(o), amount: o.totalAmount, createdAt: o.createdAt, raw: o });

const LEAD_PILL = {
  PICKUP_ASSIGNED: 'Pickup assigned', OUT_FOR_PICKUP: 'On the way', PICKED_UP: 'Picked up', DEVICE_RECEIVED: 'Received',
  INSPECTED: 'Inspected', PRICE_REVISION_PENDING: 'Awaiting approval', REVISION_REJECTED: 'Price rejected',
  PRICE_CONFIRMED: 'To pay', PAYMENT_PENDING: 'Payment sent', PAID: 'Paid',
};

/** List pill; a lead purchase says whether it is a pickup or a shop visit. */
export function purchasePill(r) {
  const s = String(r.status || '').toUpperCase();
  if (r.kind === 'LEAD' && s === 'PICKUP_SCHEDULED') return { label: r.raw?.fulfilment === 'SHOP_VISIT' ? 'Visit scheduled' : 'Pickup scheduled', fg: C.teal, bg: C.mint };
  if (r.kind === 'LEAD' && LEAD_PILL[s]) return { label: LEAD_PILL[s], fg: s === 'REVISION_REJECTED' ? C.red : C.teal, bg: s === 'REVISION_REJECTED' ? C.redBg : C.mint };
  return orderPill(r.status);
}

export default function BuyOrdersScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('NEW');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [leads, buys] = await Promise.allSettled([listShopPurchases(), listMyOrders({ orderType: 'BUY' })]);
    const all = [
      ...(leads.status === 'fulfilled' ? (leads.value || []).map(fromLead) : []),
      ...(buys.status === 'fulfilled' ? (buys.value || []).map(fromBuy) : []),
    ];
    setRows(all.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    const failed = [leads, buys].filter((r) => r.status === 'rejected').map((r) => r.reason);
    const hard = failed.find((e) => e?.code !== 'SERVER_UPDATE_REQUIRED');
    setError(hard ? (hard.message || 'Could not load purchase orders.') : null);
    setNotice(failed.find((e) => e?.code === 'SERVER_UPDATE_REQUIRED')?.message || null);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((o) => orderBucket(o.status) === tab)
      .filter((o) => !needle || [o.number, o.title].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [rows, tab, q]);
  const tabs = [['NEW', 'New'], ['IN_PROGRESS', 'In Progress'], ['COMPLETED', 'Completed']].map(([value, label]) => ({ value, label, count: rows.filter((o) => orderBucket(o.status) === value).length }));

  return (
    <SellScreen title="Purchase Orders" subtitle="Your buying orders" onBack={() => navigation.goBack()} right={<BellButton navigation={navigation} />} scroll={false}>
      <FlatList
        data={shown}
        keyExtractor={(o) => o.key}
        ListHeaderComponent={(
          <View>
            <SearchInput value={q} onChangeText={setQ} placeholder="Search order number or item" style={{ marginTop: 4 }} />
            <TabPills tabs={tabs} value={tab} onChange={setTab} style={{ marginVertical: 12 }} />
            {error ? <ErrorBox message={error} onRetry={() => { setLoading(true); load(); }} style={{ marginBottom: 10 }} /> : null}
            {notice ? <ErrorBox tone="warning" message={notice} style={{ marginBottom: 10 }} /> : null}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
        ListEmptyComponent={loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : (
          <EmptyBox title={`No ${tabs.find((t) => t.value === tab)?.label.toLowerCase()} orders`} sub="Devices you buy from customer leads and orders you place for devices and spares appear here." />
        )}
        renderItem={({ item: o }) => {
          const pill = purchasePill(o);
          return (
            <Pressable onPress={() => navigation.navigate('BuyOrderDetail', { id: o.id, kind: o.kind, order: o.raw })} accessibilityRole="button" accessibilityLabel={`${o.number || 'Order'}, ${o.title}`} className="active:opacity-90" style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 }}>
              <Thumb uri={o.image} size={64} radius={10} style={{ backgroundColor: C.field }} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: rf(13), fontWeight: '800', color: C.text }} numberOfLines={1}>{o.number || 'Order'}</Text>
                  <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: pill.bg }}>
                    <Text style={{ fontSize: rf(10), fontWeight: '800', color: pill.fg }}>{pill.label}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={{ fontSize: rf(12), color: C.text, marginTop: 3 }}>{o.title}</Text>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.teal, marginTop: 3 }}>{money(o.amount)}</Text>
                <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 2 }}>Created: {dateTime(o.createdAt)}</Text>
              </View>
              <ChevronRight size={18} color={C.muted} style={{ marginLeft: 6 }} />
            </Pressable>
          );
        }}
      />
    </SellScreen>
  );
}
