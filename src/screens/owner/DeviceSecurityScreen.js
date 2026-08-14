import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OPTIONS = ['None', 'Pattern', 'PIN', 'Password'];

export default function DeviceSecurityScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [selected, setSelected] = useState('PIN');

  const handleContinue = () => {
    navigation.navigate('DeviceInformation', { ticketId });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Device Security</Text>
          <Text style={styles.subtitle}>Screen lock</Text>

          {OPTIONS.map((opt) => {
            const active = selected === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.optionRow, active && styles.optionRowActive]}
                onPress={() => setSelected(opt)}
              >
                <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                  {active ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.optionLabel}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#172117', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#667066', marginBottom: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8E2',
  },
  optionRowActive: {
    backgroundColor: '#F0F8EF',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#8FA08F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  radioOuterActive: {
    borderColor: '#16BB05',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16BB05',
  },
  optionLabel: { fontSize: 13, color: '#172117' },
  button: {
    backgroundColor: '#087A0A',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});

