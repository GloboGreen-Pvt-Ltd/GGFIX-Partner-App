import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowRight, MapPin } from 'lucide-react-native';
import { fetchNearbyListings, getListingOrigin, listingConditionLabel } from '../../../api/nearbyListings';
import { rf } from '../../../utils/responsive';
import { C, EmptyBox, ErrorBox, SearchInput, SellScreen, TabPills, Thumb, money } from '../sell/kit';
import { BellButton } from './buyKit';

// Page 3 — customers nearby who want to sell a device (GET /marketplace/buy/nearby,
// sellerType CUSTOMER). Tabs: All · Nearby (≤ 10 km) · New (last 48 hours).

const NEARBY_KM = 10;
const NEW_MS = 48 * 3600 * 1000;

export const leadPrice = (l) => {
  const n = l?.expectedPrice != null ? Number(l.expectedPrice) : null;
  return n > 0 ? money(n) : null;
};
// Distance from the shop: computed from both coordinates when the shop origin
// is known; otherwise the server's distanceKm, but only when the listing has a
// location and the value is > 0 (a 0 from missing coordinates showed "0.0 km").
const toRad = (v) => (Number(v) * Math.PI) / 180;
export const leadDistance = (l, origin) => {
  const hasGeo = l?.latitude != null && l?.longitude != null;
  if (!hasGeo) return null;
  let d = l?.distanceKm != null ? Number(l.distanceKm) : null;
  if (origin?.lat != null && origin?.lng != null) {
    const dLat = toRad(l.latitude - origin.lat);
    const dLng = toRad(l.longitude - origin.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(origin.lat)) * Math.cos(toRad(l.latitude)) * Math.sin(dLng / 2) ** 2;
    d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  if (!(d > 0) || !Number.isFinite(d)) return null;
  if (d < 1) return `${Math.max(50, Math.round(d * 1000 / 10) * 10)} m away`;
  return `${d < 10 ? d.toFixed(1) : Math.round(d)} km away`;
};

export function LeadCard({ l, onPress, tag }) {
  const price = leadPrice(l);
  const dist = leadDistance(l);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={l.productName || 'Device'} className="active:opacity-90" style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 }}>
      <Thumb uri={l.productImage} size={72} radius={10} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        {tag ? (
          <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: C.mint, marginBottom: 4 }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', color: C.teal }}>{tag}</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{l.productName || 'Device'}</Text>
        <Text style={{ fontSize: rf(12), color: C.text, marginTop: 4 }}>
          Exp. Price: <Text style={{ fontWeight: '800', color: price ? C.teal : C.amber }}>{price || 'Open for quotation'}</Text>
        </Text>
        {l.condition ? (
          <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: C.greenBg, marginTop: 6 }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', color: '#0B6B4B' }}>{listingConditionLabel(l.condition)}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          {dist ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <MapPin size={12} color={C.muted} />
              <Text style={{ fontSize: rf(11), color: C.muted, marginLeft: 3 }}>{dist}</Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.mint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: rf(11), fontWeight: '800', color: C.teal, marginRight: 4 }}>View Details</Text>
            <ArrowRight size={12} color={C.teal} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function BuyLeadsScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const origin = await getListingOrigin();
      const list = await fetchNearbyListings(origin);
      setRows(list.filter((l) => l?.sellerType === 'CUSTOMER'));
      setError(null);
    } catch (e) {
      setError(e?.message || 'Could not load customer sell leads.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const isNearby = (l) => l.distanceKm != null && Number(l.distanceKm) <= NEARBY_KM;
  const isNew = (l) => l.createdAt && Date.now() - new Date(l.createdAt).getTime() <= NEW_MS;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((l) => (tab === 'NEARBY' ? isNearby(l) : tab === 'NEW' ? isNew(l) : true))
      .filter((l) => !needle || [l.productName, l.city, l.description, l.condition].some((v) => String(v || '').toLowerCase().includes(needle)))
      .sort((a, b) => (tab === 'NEARBY' ? Number(a.distanceKm ?? 1e9) - Number(b.distanceKm ?? 1e9) : new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
  }, [rows, tab, q]);

  const tabs = [
    { value: 'ALL', label: 'All', count: rows.length },
    { value: 'NEARBY', label: 'Nearby', count: rows.filter(isNearby).length },
    { value: 'NEW', label: 'New', count: rows.filter(isNew).length },
  ];

  return (
    <SellScreen title="Customer Sell Leads" subtitle="Incoming device sell requests" onBack={() => navigation.goBack()} right={<BellButton navigation={navigation} />} scroll={false}>
      <FlatList
        data={shown}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={(
          <View>
            <SearchInput value={q} onChangeText={setQ} placeholder="Search leads (device, customer...)" style={{ marginTop: 4 }} />
            <TabPills tabs={tabs} value={tab} onChange={setTab} style={{ marginVertical: 12 }} />
            {error ? <ErrorBox message={error} onRetry={() => { setLoading(true); load(); }} style={{ marginBottom: 10 }} /> : null}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
        ListEmptyComponent={loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : (
          <EmptyBox title={tab === 'NEARBY' ? `No leads within ${NEARBY_KM} km` : tab === 'NEW' ? 'No new leads in the last 48 hours' : 'No customer sell leads yet'} sub="Customers near your shop who want to sell a device appear here." />
        )}
        renderItem={({ item }) => <LeadCard l={item} onPress={() => navigation.navigate('BuyLeadDetail', { lead: item })} />}
      />
    </SellScreen>
  );
}
