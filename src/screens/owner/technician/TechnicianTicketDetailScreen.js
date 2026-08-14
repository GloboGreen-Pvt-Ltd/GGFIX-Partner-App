import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
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
        <ActivityIndicator size="large" color="#16BB05" style={styles.loader} />
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
  safe: { flex: 1, backgroundColor: '#172117' },
  loader: { flex: 1, justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  tracking: { fontSize: 20, fontWeight: '700', color: '#F7FAF7', marginBottom: 8 },
  status: { fontSize: 16, color: '#16BB05', marginBottom: 12 },
  field: { fontSize: 14, color: '#8FA08F', marginBottom: 16 },
  button: { backgroundColor: '#087A0A', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  buttonAlt: { backgroundColor: '#172117', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#172117' },
  buttonAltText: { fontSize: 16, fontWeight: '600', color: '#F7FAF7' },
  error: { fontSize: 14, color: '#DC2626', padding: 16 },
});
