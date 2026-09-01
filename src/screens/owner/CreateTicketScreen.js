import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { ApiPicker } from '../../components/ApiPicker';
import { useBrands, useModels, useRamOptions, useStorageOptions } from '../../api/hooks/useMasterData';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';

export default function CreateTicketScreen({ navigation }) {
  const [customerId, setCustomerId] = useState('');
  const [brandId, setBrandId] = useState(null);
  const [modelId, setModelId] = useState(null);
  const [ramOptionId, setRamOptionId] = useState(null);
  const [storageOptionId, setStorageOptionId] = useState(null);
  const [color, setColor] = useState('');
  const [imei, setImei] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { brands, loading: brandsLoading, error: brandsError } = useBrands();
  const { models, loading: modelsLoading, error: modelsError } = useModels(brandId);
  const { ramOptions, loading: ramLoading, error: ramError } = useRamOptions();
  const { storageOptions, loading: storageLoading, error: storageError } = useStorageOptions();

  const handleCreate = async () => {
    if (!customerId.trim()) {
      notify('Error', 'Customer ID is required', { preset: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        customerId: customerId.trim(),
        brandId: brandId || undefined,
        modelId: modelId || undefined,
        ramOptionId: ramOptionId || undefined,
        storageOptionId: storageOptionId || undefined,
        color: color.trim() || undefined,
        imei: imei.trim() || undefined,
        issueDescription: issueDescription.trim() || undefined,
        estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : undefined,
      };
      const created = await ticketApi.post('/tickets', { body: payload });
      notify('Success', `Ticket created: ${created?.trackingId || created?.id}`, { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to create ticket', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Customer ID (UUID)</Text>
      <TextInput style={styles.input} placeholder="Customer UUID" placeholderTextColor="#667066" value={customerId} onChangeText={setCustomerId} />

      <ApiPicker label="Brand" items={brands} loading={brandsLoading} error={brandsError} value={brandId} onSelect={setBrandId} placeholder="Select brand" />
      <ApiPicker label="Model" items={models} loading={modelsLoading} error={modelsError} value={modelId} onSelect={setModelId} placeholder="Select model" />
      <ApiPicker label="RAM" items={ramOptions} loading={ramLoading} error={ramError} value={ramOptionId} onSelect={setRamOptionId} placeholder="Select RAM" labelExtractor={(i) => i?.label ?? i?.valueGb + ' GB'} />
      <ApiPicker label="Storage" items={storageOptions} loading={storageLoading} error={storageError} value={storageOptionId} onSelect={setStorageOptionId} placeholder="Select storage" labelExtractor={(i) => i?.label ?? i?.valueGb + ' GB'} />

      <Text style={styles.label}>Color</Text>
      <TextInput style={styles.input} placeholder="Device color" placeholderTextColor="#667066" value={color} onChangeText={setColor} />
      <Text style={styles.label}>IMEI</Text>
      <TextInput style={styles.input} placeholder="IMEI" placeholderTextColor="#667066" value={imei} onChangeText={setImei} keyboardType="number-pad" />
      <Text style={styles.label}>Issue description</Text>
      <TextInput style={styles.input} placeholder="Describe the issue" placeholderTextColor="#667066" value={issueDescription} onChangeText={setIssueDescription} multiline numberOfLines={3} />
      <Text style={styles.label}>Estimated price</Text>
      <TextInput style={styles.input} placeholder="0" placeholderTextColor="#667066" value={estimatedPrice} onChangeText={setEstimatedPrice} keyboardType="decimal-pad" />

      <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Ticket</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#172117' },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, color: '#8FA08F', marginBottom: 4 },
  input: { backgroundColor: '#172117', borderWidth: 1, borderColor: '#172117', borderRadius: 8, padding: 12, fontSize: 16, color: '#F7FAF7', marginBottom: 12 },
  button: { backgroundColor: '#087A0A', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
