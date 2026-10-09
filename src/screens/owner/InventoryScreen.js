import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inventoryApi } from '../../api/client';

export default function InventoryScreen() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await inventoryApi.get('/inventory/items');
      setList(Array.isArray(data) ? data : data?.content ?? data?.data ?? []);
    } catch (e) {
      setError(e.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (loading && list.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color="#16BB05" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Inventory</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#16BB05']} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.qty}>Qty: {item.quantity}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No items. Data from API.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117' },
  loader: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#F7FAF7', padding: 12 },
  list: { padding: 12, paddingBottom: 24 },
  row: { backgroundColor: '#172117', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#172117' },
  name: { fontSize: 15, fontWeight: '600', color: '#F7FAF7' },
  qty: { fontSize: 13, color: '#8FA08F', marginTop: 4 },
  error: { fontSize: 13, color: '#DC2626', padding: 16 },
  empty: { fontSize: 13, color: '#8FA08F', textAlign: 'center', marginTop: 24 },
});
