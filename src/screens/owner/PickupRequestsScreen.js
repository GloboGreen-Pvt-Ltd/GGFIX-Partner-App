import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pickupApi } from '../../api/client';

export default function PickupRequestsScreen() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await pickupApi.get('/pickups');
      setList(Array.isArray(data) ? data : data?.content ?? data?.data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (loading && list.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color="#035C6C" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Pickup Requests</Text>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#035C6C']} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.type}>{item.type}</Text>
            <Text style={styles.status}>{item.status}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No pickups. Data from API.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111111' },
  loader: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#F3F4F6', padding: 12 },
  list: { padding: 12, paddingBottom: 24 },
  row: { backgroundColor: '#111111', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#111111' },
  type: { fontSize: 13, fontWeight: '600', color: '#F3F4F6' },
  status: { fontSize: 13, color: '#9CA3AF', marginTop: 3 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 20 },
});
