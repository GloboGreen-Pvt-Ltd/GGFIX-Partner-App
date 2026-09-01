import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';

export default function AddRepairNotesScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!note.trim()) return;
    if (!ticketId) {
      notify('Missing ticket', 'No ticket to attach this note to.', { preset: 'error', haptic: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await ticketApi.post(`/tickets/${ticketId}/notes`, { body: { note: note.trim() } });
      notify('Note added', 'Your repair note was saved.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e?.message || 'Failed to save note', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.label}>Repair note</Text>
      <TextInput style={styles.input} placeholder="Enter note" placeholderTextColor="#667066" value={note} onChangeText={setNote} multiline numberOfLines={4} />
      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117', padding: 16 },
  label: { fontSize: 14, color: '#8FA08F', marginBottom: 8 },
  input: { backgroundColor: '#172117', borderWidth: 1, borderColor: '#172117', borderRadius: 8, padding: 12, fontSize: 16, color: '#F7FAF7', minHeight: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#087A0A', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
