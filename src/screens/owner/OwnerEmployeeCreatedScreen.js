import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function OwnerEmployeeCreatedScreen({ route, navigation }) {
  const { employee, message } = route.params || {};

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={72} color="#16BB05" />
        </View>
        <Text style={styles.title}>Employee created</Text>
        <Text style={styles.subtitle}>
          {message || (employee?.name ? `${employee.name} has been added.` : 'New staff has been added.')}
        </Text>
        {employee?.name ? (
          <View style={styles.card}>
            <Text style={styles.name}>{employee.name}</Text>
            <Text style={styles.meta}>{employee.roleLabel || 'Technician'}</Text>
            {(employee.phone || employee.email) && (
              <Text style={styles.meta}>{employee.phone || employee.email}</Text>
            )}
          </View>
        ) : null}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() =>
              navigation.reset({
                index: 1,
                routes: [{ name: 'OwnerTabs' }, { name: 'OwnerEmployeeList' }],
              })
            }
          >
            <Text style={styles.primaryBtnText}>Back to list</Text>
          </TouchableOpacity>
          {employee?.id && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() =>
                navigation.navigate('OwnerEmployeeDetail', { employee })
              }
            >
              <Text style={styles.secondaryBtnText}>View profile</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  iconWrap: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#172117', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#667066', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 320,
    marginBottom: 32,
  },
  name: { fontSize: 16, fontWeight: '700', color: '#172117' },
  meta: { fontSize: 13, color: '#667066', marginTop: 4 },
  buttons: { width: '100%', maxWidth: 320, gap: 12 },
  primaryBtn: {
    backgroundColor: '#087A0A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5CB',
  },
  secondaryBtnText: { color: '#172117', fontSize: 16, fontWeight: '600' },
});
