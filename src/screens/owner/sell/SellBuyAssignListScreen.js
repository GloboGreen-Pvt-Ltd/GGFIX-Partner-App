import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StatusBar, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CircleCheck, ClipboardCheck, LayoutGrid, PackageCheck, ShoppingBag, Truck, UserCheck } from 'lucide-react-native';
import { listAssignableStaff, listShopBuyOrders } from '../../../api/buyOrders';
import { RC, ReportHeader, ReportHeaderButton, StatusRail, reportStyles, useReportGeometry } from '../../../components/report/ReportRail';
import { C, EmptyBox, ErrorBox, SearchInput } from './kit';
import BuyOrderCard from './BuyOrderCard';

// Assign Pickup — home-delivery customer orders by pickup stage, Jobs-style rail:
// All · Assigned · Accepted · Ready (confirmed / failed, needs an employee) · Delivered.
// Assign / Reassign opens SellBuyAssign and comes back here; View opens the order.
const SECTIONS = [
  { key: 'ALL', label: 'All', tone: RC.teal, Icon: LayoutGrid },
  { key: 'ASSIGNED', label: 'Assigned', tone: RC.blue, Icon: UserCheck, statuses: ['ASSIGNED'] },
  { key: 'ACCEPTED', label: 'Accepted', tone: RC.orange, Icon: ClipboardCheck, statuses: ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
  { key: 'READY', label: 'Ready', tone: RC.navy, Icon: PackageCheck, statuses: ['CONFIRMED', 'DELIVERY_FAILED'] },
  { key: 'DELIVERED', label: 'Delivered', tone: RC.green, Icon: CircleCheck, statuses: ['DELIVERED', 'COMPLETED'] },
];
const PIPELINE = SECTIONS.flatMap((s) => s.statuses || []);

const matches = (o, q, staffName) => !q || [o.orderNumber, o.productTitle, o.customerName, o.customerPhone, staffName]
  .some((v) => String(v || '').toLowerCase().includes(q));

export default function SellBuyAssignListScreen({ navigation, route }) {
  const { isSmall, railW, bottomPad } = useReportGeometry();
  const initial = route?.params?.initialSection;
  const [orders, setOrders] = useState(null);
  const [staffBy, setStaffBy] = useState({});
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState(SECTIONS.some((t) => t.key === initial) ? initial : 'ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setOrders(await listShopBuyOrders()); }
    catch (e) { setError(e?.message || 'Could not load pickups'); }
    try {
      const m = {};
      ((await listAssignableStaff()) || []).forEach((e) => { if (e?.userId) m[e.userId] = e.name; });
      setStaffBy(m);
    } catch { /* names are best-effort */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const q = query.trim().toLowerCase();
  const pickups = useMemo(() => (Array.isArray(orders) ? orders : [])
    .filter((o) => o.fulfilmentType === 'HOME_DELIVERY' && PIPELINE.includes(o.status))
    .filter((o) => matches(o, q, staffBy[o.assignedStaffUserId])), [orders, q, staffBy]);
  const railItems = useMemo(() => SECTIONS.map((t) => ({
    ...t, count: t.statuses ? pickups.filter((o) => t.statuses.includes(o.status)).length : pickups.length,
  })), [pickups]);
  const section = SECTIONS.find((t) => t.key === tab) || SECTIONS[0];
  const shown = section.statuses ? pickups.filter((o) => section.statuses.includes(o.status)) : pickups;

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const toggleSearch = () => { if (searchOpen) setQuery(''); setSearchOpen(!searchOpen); };

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ReportHeader
        title="ASSIGN PICKUP"
        subtitle={`${pickups.length} Pickups`}
        onBack={() => navigation.goBack()}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        right={<ReportHeaderButton Icon={ShoppingBag} label="Orders" onPress={() => navigation.navigate('SellBuyOrders')} />}
      />
      {searchOpen ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' }}>
          <SearchInput value={query} onChangeText={setQuery} placeholder="Search order, product, employee" />
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
                staffName={staffBy[item.assignedStaffUserId]}
                onAssign={(o) => navigation.navigate('SellBuyAssign', { order: o, returnToList: true })}
                onView={(o) => navigation.navigate('SellBuyOrderDetail', { id: o.id })}
              />
            )}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={RC.teal} colors={[RC.teal]} />}
            contentContainerStyle={{ ...reportStyles.listPad, paddingBottom: bottomPad }}
            ListEmptyComponent={
              orders === null && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />
                : error ? <ErrorBox message={error} onRetry={load} />
                  : <EmptyBox icon={Truck} title={q ? 'No matching pickups' : `No ${section.label.toLowerCase()} pickups`} sub="Confirmed home-delivery orders appear here to assign an employee." />
            }
          />
        </View>
      </View>
    </View>
  );
}
