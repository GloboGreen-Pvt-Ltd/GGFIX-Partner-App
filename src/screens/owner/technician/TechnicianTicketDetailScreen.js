import React, { useState, useCallback } from 'react';
import { Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketApi } from '../../../api/client';

export default function TechnicianTicketDetailScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const data = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(data);
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  React.useEffect(() => { load(); }, [load]);

  if (loading && !ticket) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color="#035C6C" style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!ticket) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.error}>Ticket not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.tracking}>{ticket.trackingId}</Text>
        <Text style={styles.status}>{ticket.status}</Text>
        <Text style={styles.field}>{ticket.issueDescription || '—'}</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('UpdateStatus', { ticketId: ticket.id })}>
          <Text style={styles.buttonText}>Update Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonAlt} onPress={() => navigation.navigate('AddRepairNotes', { ticketId: ticket.id })}>
          <Text style={styles.buttonAltText}>Add Repair Notes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonAlt} onPress={() => navigation.navigate('UploadRepairImages', { ticketId: ticket.id })}>
          <Text style={styles.buttonAltText}>Upload Repair Images</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111111' },
  loader: { flex: 1, justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 24, width: '100%', maxWidth: 720, alignSelf: 'center' },
  tracking: { fontSize: 17, fontWeight: '700', color: '#F3F4F6', marginBottom: 6 },
  status: { fontSize: 15, color: '#035C6C', marginBottom: 10 },
  field: { fontSize: 13, color: '#9CA3AF', marginBottom: 12 },
  button: { backgroundColor: '#035C6C', padding: 13, borderRadius: 8, alignItems: 'center', marginBottom: 9 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  buttonAlt: { backgroundColor: '#111111', padding: 13, borderRadius: 8, alignItems: 'center', marginBottom: 9, borderWidth: 1, borderColor: '#111111' },
  buttonAltText: { fontSize: 15, fontWeight: '600', color: '#F3F4F6' },
  error: { fontSize: 13, color: '#DC2626', padding: 16 },
});
