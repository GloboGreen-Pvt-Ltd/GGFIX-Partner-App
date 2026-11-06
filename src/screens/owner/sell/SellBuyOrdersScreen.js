import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ShoppingBag, Store, Truck } from 'lucide-react-native';
import { BUY_ORDER_STATUS, BUY_ORDER_TABS, listShopBuyOrders } from '../../../api/buyOrders';
import { C, Card, EmptyBox, ErrorBox, SellScreen, StatusPill, Thumb, money } from './kit';

// Incoming fixed-price customer orders for this shop, grouped New / In progress /
// Completed / Closed with live counts from the server.
export default function SellBuyOrdersScreen({ navigation }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('NEW');

  const load = useCallback(async () => {
    setError('');
    try { setOrders(await listShopBuyOrders()); }
    catch (e) { setError(e?.message || 'Could not load orders'); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const m = {};
    BUY_ORDER_TABS.forEach((t) => { m[t.key] = (orders || []).filter((o) => t.statuses.includes(o.status)).length; });
    return m;
  }, [orders]);
  const shown = (orders || []).filter((o) => BUY_ORDER_TABS.find((t) => t.key === tab).statuses.includes(o.status));

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SellScreen
      title="Customer Orders"
      subtitle="Fixed-price buy orders"
      onBack={() => navigation.goBack()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 12 }}>
        {BUY_ORDER_TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: on ? C.teal : C.field }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#fff' : C.text }}>{t.label} ({counts[t.key] || 0})</Text>
            </Pressable>
          );
        })}
      </View>

      {orders === null && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} /> : null}
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {orders && !error && shown.length === 0 ? (
        <EmptyBox icon={ShoppingBag} title="No orders here" sub="Customer orders for your listings appear here." />
      ) : null}

      {shown.map((o) => {
        const meta = BUY_ORDER_STATUS[o.status] || {};
        const home = o.fulfilmentType === 'HOME_DELIVERY';
        return (
          <Card key={o.id} style={{ marginBottom: 10 }} onPress={() => navigation.navigate('SellBuyOrderDetail', { id: o.id })}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Thumb uri={o.productImage} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: C.muted }}>{o.orderNumber}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }} numberOfLines={1}>{o.productTitle || 'Product'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.teal, marginTop: 2 }}>
                  {money(o.totalAmount)}{o.quantity > 1 ? `  ·  Qty ${o.quantity}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  {home ? <Truck size={14} color={C.muted} /> : <Store size={14} color={C.muted} />}
                  <Text style={{ fontSize: 12, color: C.muted, flex: 1 }}>{home ? 'Home delivery' : 'Visit shop'}</Text>
                  <StatusPill status={o.status} label={meta.label} />
                </View>
              </View>
            </View>
          </Card>
        );
      })}
    </SellScreen>
  );
}
