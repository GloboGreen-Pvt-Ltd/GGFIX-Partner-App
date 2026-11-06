import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { listMyOffers } from '../../../api/buyEnquiries';
import { rf } from '../../../utils/responsive';
import { C, EmptyBox, ErrorBox, PrimaryButton, SellScreen, TabPills, Thumb, money } from '../sell/kit';
import { BellButton, offerMeta, timeAgo } from './buyKit';

// Page 5 (list) — offers this shop sent on other shops' listings and the
// replies (GET /customer/marketplace/enquiries). Pending · Accepted · Rejected.

export default function BuyQuotationsScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('PENDING');

  const load = useCallback(async () => {
    try {
      setRows(await listMyOffers());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const shown = useMemo(() => rows.filter((r) => offerMeta(r.status).bucket === tab), [rows, tab]);
  const tabs = ['PENDING', 'ACCEPTED', 'REJECTED'].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase(), count: rows.filter((r) => offerMeta(r.status).bucket === v).length }));
  const blocked = error?.code === 'SERVER_UPDATE_REQUIRED';

  return (
    <SellScreen title="Quotations" subtitle="Your offers & shop replies" onBack={() => navigation.goBack()} right={<BellButton navigation={navigation} />} scroll={false}>
      <FlatList
        data={blocked ? [] : shown}
        keyExtractor={(r) => String(r.id)}
        ListHeaderComponent={(
          <View>
            {!blocked ? <TabPills tabs={tabs} value={tab} onChange={setTab} style={{ marginVertical: 10 }} /> : null}
            {error ? <ErrorBox tone={blocked ? 'warning' : 'error'} message={error.message || 'Could not load quotations.'} onRetry={() => { setLoading(true); load(); }} style={{ marginBottom: 10 }} /> : null}
            {blocked ? <PrimaryButton title="Browse Devices" variant="outline" onPress={() => navigation.navigate('BuyBrowse')} style={{ marginTop: 6 }} /> : null}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
        ListEmptyComponent={loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : (blocked || error ? null : (
          <EmptyBox title={tab === 'PENDING' ? 'No open offers' : tab === 'ACCEPTED' ? 'No accepted offers' : 'No rejected offers'} sub="Open a listing in Buy Devices and tap Make an Offer to negotiate with the shop." />
        ))}
        renderItem={({ item }) => {
          const m = offerMeta(item.status);
          const mine = item.lastOfferBy === 'BUYER';
          return (
            <Pressable onPress={() => navigation.navigate('BuyQuotationDetail', { id: item.id })} accessibilityRole="button" className="active:opacity-90" style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 }}>
              <Thumb uri={item.product?.imageUrl} size={56} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{item.product?.title || 'Listing'}</Text>
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>
                  {item.lastOfferAmount != null ? `${mine ? 'Your offer' : 'Shop quote'} ${money(item.lastOfferAmount)}` : 'Price request'} · {timeAgo(item.updatedAt || item.createdAt)}
                </Text>
                <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: m.bg, marginTop: 5 }}>
                  <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: m.fg }}>{m.label}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={C.muted} />
            </Pressable>
          );
        }}
      />
    </SellScreen>
  );
}
