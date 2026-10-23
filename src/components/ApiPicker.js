import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SafeModal from './SafeModal';

export function ApiPicker({ label, items, loading, error, value, onSelect, placeholder = 'Select...', keyExtractor = (item) => item?.id, labelExtractor = (item) => item?.name ?? item?.label ?? String(item?.id) }) {
  const [open, setOpen] = useState(false);
  const selected = value != null ? items.find((i) => keyExtractor(i) === value) : null;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text style={[styles.triggerText, !selected && styles.placeholder]}>
            {selected ? labelExtractor(selected) : placeholder}
          </Text>
        )}
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <SafeModal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          {/* Edge-to-edge modal: keep the last option clear of the gesture /
              3-button bar — this window's own inset, measured inside it. */}
          <SafeAreaView edges={['bottom']} style={styles.modal}>
            <FlatList
              data={items}
              keyExtractor={(item) => String(keyExtractor(item))}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onSelect(keyExtractor(item));
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{labelExtractor(item)}</Text>
                </TouchableOpacity>
              )}
            />
          </SafeAreaView>
        </TouchableOpacity>
      </SafeModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 4, color: '#9CA3AF' },
  trigger: { borderWidth: 1, borderColor: '#111111', borderRadius: 8, padding: 12, minHeight: 48, justifyContent: 'center' },
  triggerText: { fontSize: 15, color: '#F3F4F6' },
  placeholder: { color: '#6B7280' },
  error: { fontSize: 12, color: '#DC2626', marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111111', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: 400 },
  option: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#111111' },
  optionText: { fontSize: 15, color: '#F3F4F6' },
});
