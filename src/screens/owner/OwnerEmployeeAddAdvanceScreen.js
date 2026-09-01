import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';

export default function OwnerEmployeeAddAdvanceScreen({ route, navigation }) {
  const employee = route.params?.employee;
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const num = parseFloat(amount?.replace(/,/g, ''));
    if (!num || num <= 0) {
      notify('Invalid', 'Enter a valid amount');
      return;
    }
    if (!employee?.id) return;
    setSaving(true);
    try {
      await ticketApi.post(`/technicians/${employee.id}/advances`, {
        body: { amount: num, notes: notes.trim() || undefined },
      });
      notify('Done', 'Advance added', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to add advance', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!employee) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.error}>Employee not found</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 500"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />
        <Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, styles.notesInput]} placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={handleSubmit} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Add advance</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#172117', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8E2', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#FFF' },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  btn: { marginTop: 20, backgroundColor: '#087A0A', borderRadius: 12, padding: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  error: { fontSize: 14, color: '#DC2626' },
});
