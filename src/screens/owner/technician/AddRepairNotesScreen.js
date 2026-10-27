import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, View } from 'react-native';
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
      {/* Capped + centred on tablets. */}
      <View style={styles.content}>
      <Text style={styles.label}>Repair note</Text>
      <TextInput style={styles.input} placeholder="Enter note" placeholderTextColor="#6B7280" value={note} onChangeText={setNote} multiline numberOfLines={4} />
      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111111', padding: 12 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  label: { fontSize: 13, color: '#9CA3AF', marginBottom: 6 },
  input: { backgroundColor: '#111111', borderWidth: 1, borderColor: '#111111', borderRadius: 8, padding: 11, fontSize: 13, color: '#F3F4F6', minHeight: 90, textAlignVertical: 'top' },
  button: { backgroundColor: '#035C6C', padding: 13, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
