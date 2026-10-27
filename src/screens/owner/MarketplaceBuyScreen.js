import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { marketplaceApi } from '../../api/client';
import { CONTENT_MAX } from '../../theme/responsive';

export default function MarketplaceBuyScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await marketplaceApi.get('/marketplace/products', { query: { type: 'SELL', status: 'ACTIVE' } });
      setList(Array.isArray(data) ? data : data?.content ?? data?.data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>Marketplace (Buy)</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MarketplaceSell')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.link}>Sell</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#035C6C']} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.title}</Text>
            <Text style={styles.price}>{item.price != null ? `₹${item.price}` : '—'}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No products. Data from API.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 },
  title: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: '#F3F4F6' },
  link: { fontSize: 13, color: '#035C6C' },
  list: { padding: 12, paddingBottom: 24, width: '100%', maxWidth: CONTENT_MAX.list, alignSelf: 'center' },
  row: { backgroundColor: '#111111', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#111111' },
  name: { fontSize: 13, fontWeight: '600', color: '#F3F4F6' },
  price: { fontSize: 13, color: '#035C6C', marginTop: 4 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 24 },
});
