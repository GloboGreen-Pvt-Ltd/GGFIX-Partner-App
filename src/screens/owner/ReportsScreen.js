import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  safe: { flex: 1, backgroundColor: '#172117', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#F7FAF7', marginBottom: 12 },
  hint: { fontSize: 14, color: '#8FA08F' },
});
