import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';

const STATUS_OPTIONS = ['CREATED', 'IN_DIAGNOSIS', 'QUOTED', 'APPROVED', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED'];

export default function UpdateStatusScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [submitting, setSubmitting] = useState(null);

  const onSelect = async (status) => {
    if (!ticketId) return;
    setSubmitting(status);
    try {
      await ticketApi.patch(`/tickets/${ticketId}/status`, { query: { status } });
      notify('Done', 'Status updated', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to update status', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Scrolls on short phones; capped + centred on tablets. */}
      <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Select new status</Text>
      {STATUS_OPTIONS.map((status) => (
        <TouchableOpacity
          key={status}
          style={styles.option}
          onPress={() => onSelect(status)}
          disabled={submitting != null}
        >
          <Text style={styles.optionText}>{status}</Text>
          {submitting === status ? <ActivityIndicator size="small" color="#035C6C" /> : null}
        </TouchableOpacity>
      ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111111' },
  content: { padding: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: '#F3F4F6', marginBottom: 12 },
  option: { backgroundColor: '#111111', borderRadius: 8, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#111111', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionText: { fontSize: 15, color: '#F3F4F6' },
});
