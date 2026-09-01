import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';

export default function AssignTechnicianScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ticketApi.get('/technicians');
      setTechnicians(Array.isArray(data) ? data : data?.content ?? data?.data ?? []);
    } catch (e) {
      setTechnicians([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onAssign = async (tech) => {
    const technicianId = tech?.id ?? tech;
    if (!ticketId || !technicianId) {
      notify('Error', `Missing data: ticketId=${ticketId}, technicianId=${technicianId}`, { preset: 'error' });
      return;
    }
    setAssigning(technicianId);
    try {
      await ticketApi.patch(`/tickets/${ticketId}`, { body: { assignedTechnicianId: technicianId } });
      notify('Technician assigned', 'Returning to the previous screen.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to assign', { preset: 'error', haptic: 'error' });
    } finally {
      setAssigning(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color="#16BB05" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={technicians}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          ticketId ? (
            <Text style={styles.hint}>Tap a technician to assign this booking to them.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onAssign(item)}
            disabled={assigning != null}
          >
            <View style={styles.rowContent}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.roleLabel || item.email}</Text>
            </View>
            {assigning === item.id ? (
              <ActivityIndicator size="small" color="#16BB05" />
            ) : (
              <Text style={styles.assignLabel}>Assign</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No technicians. Add from Employee Management.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117' },
  loader: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  hint: { fontSize: 13, color: '#8FA08F', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#172117',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#172117',
  },
  rowContent: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#F7FAF7' },
  role: { fontSize: 14, color: '#8FA08F', marginTop: 4 },
  assignLabel: { fontSize: 14, fontWeight: '600', color: '#16BB05' },
  empty: { fontSize: 14, color: '#8FA08F', textAlign: 'center', marginTop: 24 },
});
