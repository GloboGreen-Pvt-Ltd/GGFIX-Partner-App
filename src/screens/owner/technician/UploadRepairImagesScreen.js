import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function UploadRepairImagesScreen({ route, navigation }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Upload Repair Images</Text>
      <Text style={styles.hint}>Use expo-image-picker and upload to backend (e.g. S3). Ticket ID: {route.params?.ticketId || '—'}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#F7FAF7', marginBottom: 12 },
  hint: { fontSize: 14, color: '#8FA08F' },
});
