import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketApi } from '../../../api/client';

export default function AssignedTicketsScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await ticketApi.get('/tickets', { query: { assignedToMe: true, page: 0, size: 50 } });
      const content = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      setList(content);
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
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#16BB05']} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('TechnicianTicketDetail', { ticketId: item.id })}>
            <Text style={styles.tracking}>{item.trackingId}</Text>
            <Text style={styles.status}>{item.status}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No assigned tickets</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117' },
  loader: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  row: { backgroundColor: '#172117', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#172117' },
  tracking: { fontSize: 16, fontWeight: '600', color: '#F7FAF7' },
  status: { fontSize: 14, color: '#8FA08F', marginTop: 4 },
  empty: { fontSize: 14, color: '#8FA08F', textAlign: 'center', marginTop: 24 },
});
