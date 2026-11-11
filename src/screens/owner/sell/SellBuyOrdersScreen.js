import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StatusBar, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Archive, CircleCheck, CircleX, LayoutGrid, ShoppingBag, Truck } from 'lucide-react-native';
import { listShopBuyOrders, shopBuyOrderAction } from '../../../api/buyOrders';
import { showToast } from '../../../components/Toast';
import { RC, ReportHeader, ReportHeaderButton, StatusRail, reportStyles, useReportGeometry } from '../../../components/report/ReportRail';
import { C, EmptyBox, ErrorBox, SearchInput } from './kit';
import BuyOrderCard from './BuyOrderCard';

// Fixed-price customer orders for this shop, with the Jobs-style left status rail:
// All · Completed · Delivery · Closed · Cancelled (live counts from the list).
export const ORDER_SECTIONS = [
  { key: 'ALL', label: 'All', tone: RC.teal, Icon: LayoutGrid, statuses: null },
  { key: 'COMPLETED', label: 'Completed', tone: RC.green, Icon: CircleCheck, statuses: ['DELIVERED', 'COMPLETED'] },
  { key: 'DELIVERY', label: 'Delivery', tone: RC.blue, Icon: Truck, statuses: ['CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'] },
  { key: 'CLOSED', label: 'Closed', tone: RC.navy, Icon: Archive, statuses: ['RETURNED', 'REJECTED'] },
  { key: 'CANCELLED', label: 'Cancelled', tone: RC.red, Icon: CircleX, statuses: ['CANCELLED'] },
];

const matches = (o, q) => !q || [o.orderNumber, o.productTitle, o.customerName, o.customerPhone, o.assignedStaffName]
  .some((v) => String(v || '').toLowerCase().includes(q));

export default function SellBuyOrdersScreen({ navigation, route }) {
  const { isSmall, railW, bottomPad } = useReportGeometry();
  const initial = route?.params?.initialSection;
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState(ORDER_SECTIONS.some((t) => t.key === initial) ? initial : 'ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try { setOrders(await listShopBuyOrders()); }
    catch (e) { setError(e?.message || 'Could not load orders'); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Confirm straight from the list; home-delivery orders go on to Assign Pickup.
  const confirmOrder = async (o) => {
    if (lock.current) return;
    lock.current = true;
    setBusyId(o.id);
    try {
      const d = await shopBuyOrderAction(o.id, 'confirm');
      showToast({ type: 'success', title: 'Order confirmed', message: o.orderNumber });
      await load();
      if (d?.fulfilmentType === 'HOME_DELIVERY') navigation.navigate('SellBuyAssign', { order: d });
    } catch (e) {
      showToast({ type: 'error', title: 'Could not confirm', message: e?.message });
    } finally {
      lock.current = false;
      setBusyId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => (orders || []).filter((o) => matches(o, q)), [orders, q]);
  const railItems = useMemo(() => ORDER_SECTIONS.map((t) => ({
    ...t, count: t.statuses ? searched.filter((o) => t.statuses.includes(o.status)).length : searched.length,
  })), [searched]);
  const section = ORDER_SECTIONS.find((t) => t.key === tab) || ORDER_SECTIONS[0];
  const shown = section.statuses ? searched.filter((o) => section.statuses.includes(o.status)) : searched;

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const toggleSearch = () => { if (searchOpen) setQuery(''); setSearchOpen(!searchOpen); };

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ReportHeader
        title="ORDERS"
        subtitle={`${(orders || []).length} Orders`}
        onBack={() => navigation.goBack()}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        right={<ReportHeaderButton Icon={Truck} label="Assign Pickup" onPress={() => navigation.navigate('SellBuyAssignList')} />}
      />
      {searchOpen ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' }}>
          <SearchInput value={query} onChangeText={setQuery} placeholder="Search order, product, customer" />
        </View>
      ) : null}

      <View style={reportStyles.body}>
        <StatusRail items={railItems} active={tab} onSelect={setTab} width={railW} isSmall={isSmall} bottomPad={bottomPad} />
        <View style={{ flex: 1 }}>
          <FlatList
            data={error ? [] : shown}
            keyExtractor={(o) => String(o.id)}
            renderItem={({ item }) => (
              <BuyOrderCard
                o={item}
                busy={busyId === item.id}
                disabled={!!busyId}
                onConfirm={confirmOrder}
                onAssign={(o) => navigation.navigate('SellBuyAssign', { order: o })}
                onView={(o) => navigation.navigate('SellBuyOrderDetail', { id: o.id })}
              />
            )}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={RC.teal} colors={[RC.teal]} />}
            contentContainerStyle={{ ...reportStyles.listPad, paddingBottom: bottomPad }}
            ListEmptyComponent={
              orders === null && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />
                : error ? <ErrorBox message={error} onRetry={load} />
                  : <EmptyBox icon={ShoppingBag} title={q ? 'No matching orders' : `No ${section.label.toLowerCase()} orders`} sub="Customer orders for your listings appear here." />
            }
          />
        </View>
      </View>
    </View>
  );
}
