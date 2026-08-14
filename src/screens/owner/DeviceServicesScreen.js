import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRepairServices } from '../../api/hooks/useMasterData';
import { getMasterImageSource } from '../../api/masterDataImages';

const DEFAULT_SERVICES = [
  { id: 'dead', name: 'Dead Phone', icon: 'phone-portrait-outline' },
  { id: 'display', name: 'Display Screen Combo', icon: 'phone-portrait-outline' },
  { id: 'motherboard', name: 'Motherboard', icon: 'hardware-chip-outline' },
  { id: 'battery', name: 'Battery', icon: 'battery-charging-outline' },
  { id: 'charging', name: 'Charging Port Sub board', icon: 'flash-outline' },
  { id: 'speaker', name: 'Speaker', icon: 'volume-high-outline' },
  { id: 'camera', name: 'Camera', icon: 'camera-outline' },
  { id: 'button', name: 'Button Change', icon: 'ellipse-outline' },
];

export default function DeviceServicesScreen({ route, navigation }) {
  const {
    customer,
    deviceType,
    brand,
    model,
    color,
    ramOptionId,
    storageOptionId,
    ramLabel,
    storageLabel,
  } = route.params || {};

  const { repairServices, loading } = useRepairServices();
  const serviceOptions = useMemo(() => {
    const fromApi = Array.isArray(repairServices) ? repairServices : [];
    if (fromApi.length > 0) return fromApi.map((s) => ({ id: s.id, name: s.name || s.label, icon: 'construct-outline' }));
    return DEFAULT_SERVICES;
  }, [repairServices]);

  const [selected, setSelected] = useState({});
  const [prices, setPrices] = useState({ display: 10500, battery: 2500 });
  const [warranty, setWarranty] = useState({});
  const [imei, setImei] = useState('');
  const [issueDescription, setIssueDescription] = useState('');

  const deviceDisplayName = model?.name ? `${model.name} (${ramLabel || '16GB'} ${storageLabel || '512GB'})` : 'Galaxy Z Fold7 (16GB 512GB)';
  const priceItems = useMemo(() => {
    const out = [];
    Object.entries(selected).forEach(([id, on]) => {
      if (!on) return;
      const name = serviceOptions.find((s) => s.id === id)?.name || id;
      const amount = prices[id] ?? 0;
      out.push({ id, label: name, amount });
    });
    return out;
  }, [selected, prices, serviceOptions]);
  const total = priceItems.reduce((sum, i) => sum + (i.amount || 0), 0);

  const toggleService = (id) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
    if (!prices[id] && (id === 'display' || id === 'battery')) setPrices((pp) => ({ ...pp, [id]: id === 'display' ? 10500 : 2500 }));
  };

  const handleContinue = () => {
    const devicePayload = {
      customer,
      deviceType,
      brand,
      model,
      color: color || 'Silver Shadow',
      ramOptionId,
      storageOptionId,
      deviceDisplayName,
      deviceImageUrl: (model?.imageBase64 ? `data:image/png;base64,${model.imageBase64}` : null) || model?.imageUrl || 'https://dummyassets.local/models/galaxy-z-fold-7.png',
      priceItems,
      total,
      repairServicesSummary: priceItems.map((i) => i.label).join(', '),
      imei: imei.trim() || undefined,
      issueDescription: issueDescription.trim() || undefined,
    };
    navigation.navigate('ServiceBookingDevicesList', {
      customer,
      devices: [devicePayload],
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#172117" />
        </TouchableOpacity>
        <Text style={styles.title}>Device Services</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.deviceCard}>
          <Image
            source={getMasterImageSource(model, 'https://dummyassets.local/models/galaxy-z-fold-7.png')}
            style={styles.deviceImg}
          />
          <View style={styles.deviceMeta}>
            <Text style={styles.deviceLabel}>Device: {deviceDisplayName}</Text>
            <Text style={styles.deviceLabel}>Color: {color || 'Silver Shadow'}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#087A0A" style={{ marginVertical: 20 }} />
        ) : (
          serviceOptions.map((s) => {
            const isAdded = selected[s.id];
            const amount = prices[s.id] || 0;
            return (
              <View key={s.id} style={styles.serviceRow}>
                <Ionicons name={s.icon || 'construct-outline'} size={20} color="#667066" style={styles.serviceIcon} />
                <Text style={styles.serviceName}>{s.name}</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="₹0.00"
                  placeholderTextColor="#8FA08F"
                  value={amount ? String(amount) : ''}
                  onChangeText={(t) => {
                    const num = parseInt(t.replace(/[^0-9]/g, ''), 10) || 0;
                    setPrices((pp) => ({ ...pp, [s.id]: num }));
                  }}
                  keyboardType="number-pad"
                />
                <Text style={styles.lastPrices}>See Last 5 Prices</Text>
                <TouchableOpacity
                  style={[styles.addRemoveBtn, isAdded && styles.removeBtn]}
                  onPress={() => toggleService(s.id)}
                >
                  <Text style={[styles.addRemoveText, isAdded && styles.removeText]}>{isAdded ? 'Remove' : 'Add +'}</Text>
                </TouchableOpacity>
                <View style={styles.warrantyRow}>
                  {['3', '6', '12'].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.warrantyChip, warranty[s.id] === m && styles.warrantyChipActive]}
                      onPress={() => setWarranty((w) => ({ ...w, [s.id]: w[s.id] === m ? undefined : m }))}
                    >
                      <Text style={styles.warrantyText}>Warranty {m} months</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.optionalLabel}>IMEI (optional)</Text>
        <TextInput
          style={styles.optionalInput}
          placeholder="Enter IMEI or scan"
          placeholderTextColor="#8FA08F"
          value={imei}
          onChangeText={setImei}
        />

        <Text style={styles.optionalLabel}>Complaint / Issue (optional)</Text>
        <TextInput
          style={[styles.optionalInput, { minHeight: 60, textAlignVertical: 'top' }]}
          placeholder="Enter issue description"
          placeholderTextColor="#8FA08F"
          value={issueDescription}
          onChangeText={setIssueDescription}
          multiline
        />

        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
          <Text style={styles.continueText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#172117' },
  content: { padding: 16, paddingBottom: 28 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  deviceImg: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#E2E8E2' },
  deviceMeta: { marginLeft: 12, flex: 1 },
  deviceLabel: { fontSize: 13, color: '#172117', marginTop: 2 },
  serviceRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  serviceIcon: { marginBottom: 6 },
  serviceName: { fontSize: 13, fontWeight: '700', color: '#172117', marginBottom: 6 },
  priceInput: {
    borderWidth: 1,
    borderColor: '#E2E8E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#172117',
    marginBottom: 4,
  },
  lastPrices: { fontSize: 12, color: '#16BB05', marginBottom: 8 },
  addRemoveBtn: { alignSelf: 'flex-start', backgroundColor: '#087A0A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  removeBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#DC2626' },
  addRemoveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  removeText: { color: '#DC2626' },
  warrantyRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  warrantyChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5CB',
  },
  warrantyChipActive: { backgroundColor: '#E6F7E3', borderColor: '#16BB05' },
  warrantyText: { fontSize: 11, color: '#667066' },
  optionalLabel: { fontSize: 12, fontWeight: '600', color: '#172117', marginTop: 14, marginBottom: 6 },
  optionalInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8E2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#172117',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087A0A',
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 24,
    gap: 8,
  },
  continueText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
