import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.hint}>Reports from billing/sales APIs. Data from backend.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111111', padding: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#F3F4F6', marginBottom: 12 },
  hint: { fontSize: 13, color: '#9CA3AF' },
});
