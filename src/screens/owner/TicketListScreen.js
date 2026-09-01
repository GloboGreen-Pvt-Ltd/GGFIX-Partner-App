import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';

export default function TicketListScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get('/tickets', { query: { page: 0, size: 50, q: query || undefined } });
      const content = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      setList(content);
    } catch (e) {
      setError(e.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  React.useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }) => {
    const trackingId = item.trackingId || item.id;
    const deviceName = item.deviceModelName || item.modelName || 'Galaxy Z Fold7 (16GB 512GB)';
    const color = item.color || 'Silver Shadow';
    const status = item.status || 'Service Accepted';
    const customerName = item.customerName || 'S.Jaya Kumar';
    const phone = item.customerPhone || '+91 896951 5914';
    const services = item.repairServicesSummary || 'Display Screen Combo';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('TicketDetail', { ticketId: item.id })}
      >
        <View style={styles.rowTop}>
          <Image
            source={{ uri: item.deviceImageUrl || 'https://dummyassets.local/models/galaxy-z-fold-7.png' }}
            style={styles.thumb}
          />
          <View style={styles.topTextWrap}>
            <Text style={styles.tracking}>Tracking ID : {trackingId}</Text>
            <Text style={styles.device}>Device : {deviceName}</Text>
            <Text style={styles.device}>Color : {color}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#667066" />
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status :</Text>
          <Text style={styles.statusValue}>{status}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Customer Name</Text>
          <Text style={styles.fieldValue}>{customerName}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Mobile Number</Text>
          <Text style={styles.fieldValue}>{phone}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Repair Services</Text>
          <Text style={styles.fieldValue}>{services}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && list.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color="#16BB05" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Bookings History</Text>
      </View>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#8FA08F" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Tracking ID, Customer Name, or Mobile Number"
            placeholderTextColor="#8FA08F"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => load(true)}
          />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#16BB05']} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No tickets</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  loader: { flex: 1, justifyContent: 'center' },
  headerBar: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#172117' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAF7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { marginLeft: 6, flex: 1, fontSize: 13, color: '#172117' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  thumb: { width: 48, height: 48, borderRadius: 8, marginRight: 10, backgroundColor: '#E2E8E2' },
  topTextWrap: { flex: 1 },
  tracking: { fontSize: 13, fontWeight: '600', color: '#172117' },
  device: { fontSize: 12, color: '#667066', marginTop: 2 },
  statusRow: { flexDirection: 'row', marginTop: 4 },
  statusLabel: { fontSize: 12, color: '#667066' },
  statusValue: { fontSize: 12, color: '#DC2626', marginLeft: 4, fontWeight: '600' },
  fieldRow: { flexDirection: 'row', marginTop: 4 },
  fieldLabel: { flex: 0.7, fontSize: 12, color: '#667066' },
  fieldValue: { flex: 1, fontSize: 12, color: '#172117' },
  error: { fontSize: 13, color: '#DC2626', paddingHorizontal: 16, paddingBottom: 4 },
  empty: { fontSize: 13, color: '#667066', textAlign: 'center', marginTop: 24 },
});
