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
        <ActivityIndicator size="large" color="#16BB05" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Pickup Requests</Text>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#16BB05']} />}
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
  safe: { flex: 1, backgroundColor: '#172117' },
  loader: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#F7FAF7', padding: 16 },
  list: { padding: 16, paddingBottom: 32 },
  row: { backgroundColor: '#172117', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#172117' },
  type: { fontSize: 16, fontWeight: '600', color: '#F7FAF7' },
  status: { fontSize: 14, color: '#8FA08F', marginTop: 4 },
  empty: { fontSize: 14, color: '#8FA08F', textAlign: 'center', marginTop: 24 },
});
