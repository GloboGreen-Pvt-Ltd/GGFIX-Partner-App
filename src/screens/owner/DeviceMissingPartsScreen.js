import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_PARTS = ['Display', 'Back Door', 'SIM Card Tray', "Button's"];

export default function DeviceMissingPartsScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [rows, setRows] = useState(
    DEFAULT_PARTS.map((name) => ({ name, details: '', missing: false, damage: false })),
  );

  const updateRow = (index, patch) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const handleContinue = () => {
    navigation.navigate('DeviceSecurity', { ticketId });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Device Missing / Damage Parts</Text>
          {rows.map((row, index) => (
            <View key={row.name} style={styles.row}>
              <Text style={styles.partName}>{row.name}</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Details"
                placeholderTextColor="#8FA08F"
                value={row.details}
                onChangeText={(v) => updateRow(index, { details: v })}
              />
              <View style={styles.toggleRow}>
                <Toggle
                  label="Missing"
                  active={row.missing}
                  onPress={() => updateRow(index, { missing: !row.missing })}
                />
                <Toggle
                  label="Damage"
                  active={row.damage}
                  onPress={() => updateRow(index, { damage: !row.damage })}
                />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Toggle({ label, active, onPress }) {
  return (
    <TouchableOpacity style={styles.toggle} onPress={onPress}>
      <View style={[styles.checkbox, active && styles.checkboxActive]} />
      <Text style={styles.toggleLabel}>{label}</Text>
    </TouchableOpacity>
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
  title: { fontSize: 14, fontWeight: '700', color: '#172117', marginBottom: 8 },
  row: {
    borderWidth: 1,
    borderColor: '#E2E8E2',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  partName: { fontSize: 13, fontWeight: '600', color: '#172117', marginBottom: 4 },
  input: {
    backgroundColor: '#F7FAF7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8E2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#172117',
    marginBottom: 8,
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  toggle: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#8FA08F',
    marginRight: 6,
  },
  checkboxActive: {
    backgroundColor: '#087A0A',
    borderColor: '#16BB05',
  },
  toggleLabel: { fontSize: 12, color: '#172117' },
  button: {
    backgroundColor: '#087A0A',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});

