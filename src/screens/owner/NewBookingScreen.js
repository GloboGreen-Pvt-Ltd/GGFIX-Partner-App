import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';

const PLACEHOLDER_AVATAR = 'https://dummyassets.local/avatars/customer-1.png';

export default function NewBookingScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchCustomers() {
      setLoading(true);
      setError(null);
      try {
        const data = await ticketApi.get('/customers', { query: { q: q.trim() } });
        if (!cancelled) setList(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load customers');
          setList([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCustomers();
    return () => { cancelled = true; };
  }, [q]);

  const goNewCustomer = () => navigation.navigate('CustomerDetails', { mode: 'new' });
  const goExistingCustomer = (c) =>
    navigation.navigate('CustomerDetails', {
      mode: 'existing',
      customer: {
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        email: c.email,
        address: c.address,
        city: c.address ? c.address.split(',')[0]?.trim() : '',
      },
    });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#172117" />
        </TouchableOpacity>
        <Text style={styles.title}>New Booking</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.newCustomerCard} onPress={goNewCustomer} activeOpacity={0.9}>
          <View style={styles.newCustomerIcon}>
            <Ionicons name="people" size={34} color="#FFFFFF" />
            <Ionicons name="add-circle" size={18} color="#16BB05" style={styles.newCustomerPlus} />
          </View>
          <Text style={styles.newCustomerText}>New Customer</Text>
        </TouchableOpacity>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#8FA08F" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Existing Customer Name  or Mobile Number..."
            placeholderTextColor="#8FA08F"
            value={q}
            onChangeText={setQ}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#16BB05" style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => (
              <View style={styles.customerRow}>
                <Image source={{ uri: PLACEHOLDER_AVATAR }} style={styles.avatar} />
                <View style={styles.customerMeta}>
                  <Text style={styles.customerName}>{item.name}</Text>
                  <Text style={styles.customerSub}>{item.phone}</Text>
                  <Text style={styles.customerSub}>{item.address ? item.address.split(',')[0]?.trim() : ''}</Text>
                </View>
                <TouchableOpacity style={styles.bookingBtn} onPress={() => goExistingCustomer(item)}>
                  <Text style={styles.bookingBtnText}>Booking</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No customers</Text>}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#172117' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  newCustomerCard: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    backgroundColor: '#087A0A',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 18,
  },
  newCustomerIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  newCustomerPlus: { position: 'absolute', right: -6, bottom: -6 },
  newCustomerText: { color: '#FFFFFF', fontWeight: '700', marginTop: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAF7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#172117' },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E2E8E2' },
  customerMeta: { flex: 1, marginLeft: 10 },
  customerName: { fontSize: 13, fontWeight: '700', color: '#172117' },
  customerSub: { fontSize: 11, color: '#667066', marginTop: 1 },
  bookingBtn: {
    backgroundColor: '#087A0A',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bookingBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#667066', marginTop: 30 },
  error: { textAlign: 'center', color: '#DC2626', marginTop: 16, paddingHorizontal: 16 },
});

