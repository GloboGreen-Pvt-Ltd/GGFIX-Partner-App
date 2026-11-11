import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, ChevronLeft, ChevronUp, Phone, Users } from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { SearchBar } from '../../components/rnr';

// Customer list for this shop: built from the shop's own bookings (GET
// /tickets is shop-scoped), one row per customer mobile, newest first.
// Tap a customer to see their bookings; tap a booking to open it.
const TEAL = '#035C6C';

const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const fmtDate = (d) => {
  const t = new Date(d || 0);
  return isNaN(t.getTime()) || !d ? '' : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function groupCustomers(tickets) {
  const byKey = new Map();
  tickets.forEach((t) => {
    const phone = t.customerPhone || t.customer?.phone || '';
    const name = t.customerName || t.customer?.name || '';
    const key = digits(phone) || name.trim().toLowerCase();
    if (!key) return;
    const c = byKey.get(key) || { key, name, phone, bookings: [], last: null };
    c.bookings.push(t);
    const at = t.createdAt || t.updatedAt;
    if (at && (!c.last || new Date(at) > new Date(c.last))) { c.last = at; if (name) c.name = name; }
    if (!c.name && name) c.name = name;
    byKey.set(key, c);
  });
  return [...byKey.values()]
    .map((c) => ({ ...c, bookings: c.bookings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) }))
    .sort((a, b) => new Date(b.last || 0) - new Date(a.last || 0));
}

export default function OwnerCustomersScreen({ navigation }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await ticketApi.get('/tickets', { query: { page: 0, size: 500 } });
      setTickets(Array.isArray(data) ? data : data?.content ?? data?.data ?? []);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const customers = useMemo(() => groupCustomers(tickets), [tickets]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const qd = q.replace(/\D/g, '');
    return customers.filter((c) => String(c.name).toLowerCase().includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)));
  }, [customers, query]);

  const renderItem = ({ item: c }) => {
    const open = openKey === c.key;
    return (
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10, overflow: 'hidden' }}>
        <Pressable onPress={() => setOpenKey(open ? null : c.key)} className="flex-row items-center active:opacity-80" style={{ padding: 12 }} accessibilityRole="button" accessibilityLabel={`${c.name || 'Customer'}, ${c.bookings.length} bookings`}>
          <View className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: TEAL }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
              {String(c.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{c.name || 'Customer'}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
              {c.phone || '—'} · {c.bookings.length} booking{c.bookings.length > 1 ? 's' : ''}{c.last ? ` · ${fmtDate(c.last)}` : ''}
            </Text>
          </View>
          {c.phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${String(c.phone).replace(/[^\d+]/g, '')}`)} hitSlop={6} className="items-center justify-center active:opacity-70" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E5F3F5', marginRight: 6 }} accessibilityLabel={`Call ${c.phone}`}>
              <Phone size={15} color={TEAL} />
            </Pressable>
          ) : null}
          {open ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
        </Pressable>
        {open ? c.bookings.map((t) => (
          <Pressable key={t.id} onPress={() => navigation.navigate('TicketDetail', { ticketId: t.id })} className="flex-row items-center active:opacity-80" style={{ paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: TEAL }} numberOfLines={1}>#{t.trackingId || t.id}</Text>
              <Text style={{ fontSize: 12, color: '#111111', marginTop: 1 }} numberOfLines={1}>{t.deviceDisplayName || t.modelName || 'Device'}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#6B7280', marginLeft: 8 }}>{fmtDate(t.createdAt)}</Text>
          </Pressable>
        )) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F3F4F6' }} edges={['top']}>
      <View className="flex-row items-center" style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" className="active:opacity-70">
          <ChevronLeft size={24} color="#111111" />
        </Pressable>
        <Text style={{ flex: 1, marginLeft: 8, fontSize: 16, fontWeight: '800', color: '#111111' }}>Customers</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280' }}>{customers.length}</Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <SearchBar value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Search by name or mobile…" />
      </View>
      {loading ? (
        <View className="items-center" style={{ paddingTop: 40 }}><ActivityIndicator color={TEAL} /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.key}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={TEAL} colors={[TEAL]} />}
          ListEmptyComponent={(
            <View className="items-center" style={{ paddingTop: 40 }}>
              <Users size={28} color="#9CA3AF" />
              <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>
                {error || (query.trim() ? `No customers match "${query.trim()}".` : 'No customers yet.')}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
