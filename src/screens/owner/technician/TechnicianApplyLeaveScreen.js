import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function TechnicianApplyLeaveScreen({ navigation }) {
  const today = new Date();
  const [startDate, setStartDate] = useState(toISO(today));
  const [endDate, setEndDate] = useState(toISO(today));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const s = startDate.trim();
    const e2 = endDate.trim();
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!s || !e2) {
      notify('Required', 'Start date and end date are required');
      return;
    }
    if (!isoRe.test(s) || !isoRe.test(e2)) {
      notify('Invalid date', 'Enter dates in YYYY-MM-DD format.');
      return;
    }
    const start = new Date(`${s}T00:00:00`);
    const end = new Date(`${e2}T00:00:00`);
    // new Date('2026-13-45') is Invalid Date, and every comparison with NaN is
    // false — so the old `end < start` guard let malformed dates reach the API.
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      notify('Invalid date', "That's not a real calendar date.");
      return;
    }
    if (end < start) {
      notify('Invalid', 'End date must be on or after start date');
      return;
    }
    setSaving(true);
    try {
      await ticketApi.post('/technicians/me/leaves', {
        body: { startDate: s, endDate: e2, reason: reason.trim() || null },
      });
      notify('Leave request sent to owner', 'Your leave request has been submitted. The owner will review and approve or deny it.', { preset: 'done' });
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('TechnicianDashboard');
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to submit leave request', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Start date</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#8FA08F"
        />
        <Text style={styles.label}>End date</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#8FA08F"
        />
        <Text style={styles.label}>Reason (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={reason}
          onChangeText={setReason}
          placeholder="Reason for leave"
          placeholderTextColor="#8FA08F"
          multiline
        />
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>Submit request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117' },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, color: '#8FA08F', marginBottom: 6 },
  input: { backgroundColor: '#172117', borderWidth: 1, borderColor: '#172117', borderRadius: 8, padding: 12, fontSize: 16, color: '#F7FAF7', marginBottom: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: '#087A0A', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
