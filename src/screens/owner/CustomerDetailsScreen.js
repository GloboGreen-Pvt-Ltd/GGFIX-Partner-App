import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';

export default function CustomerDetailsScreen({ route, navigation }) {
  const { mode = 'new', customer } = route.params || {};

  const initial = useMemo(() => {
    if (mode === 'existing' && customer) {
      const phone = (customer.phone || '').replace(/\D/g, '').replace(/^91/, '').trim();
      return {
        name: customer.name || '',
        phone,
        email: customer.email || '',
        state: 'Tamil Nadu',
        district: '',
        taluk: '',
        area: '',
        doorStreet: '',
        pincode: '',
      };
    }
    return {
      name: '',
      phone: '',
      email: '',
      state: 'Tamil Nadu',
      district: '',
      taluk: '',
      area: '',
      doorStreet: '',
      pincode: '',
    };
  }, [customer, mode]);

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupHint, setLookupHint] = useState('');
  const [matchedCustomer, setMatchedCustomer] = useState(
    mode === 'existing' && customer ? customer : null,
  );
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleMobileLookup = async () => {
    const digits = (form.phone || '').replace(/\D/g, '').replace(/^91/, '');
    if (!digits) {
      notify('Mobile required', 'Enter a mobile number to search');
      return;
    }
    setLookingUp(true);
    setLookupHint('');
    try {
      const found = await ticketApi.get('/customers/lookup', { query: { mobile: digits } });
      if (!found || !found.id) {
        setMatchedCustomer(null);
        setLookupHint('No existing customer — fill the form to create new.');
        return;
      }
      const cleanPhone = (found.phone || '').replace(/\D/g, '').replace(/^91/, '');
      const addressParts = (found.address || '').split(',').map((s) => s.trim());
      setForm((prev) => ({
        ...prev,
        name: found.name || prev.name,
        phone: cleanPhone || prev.phone,
        email: found.email || prev.email,
        state: addressParts[0] || prev.state,
        district: addressParts[1] || prev.district,
        taluk: addressParts[2] || prev.taluk,
        area: addressParts[3] || prev.area,
        doorStreet: addressParts[4] || prev.doorStreet,
        pincode: addressParts[5] || prev.pincode,
      }));
      setMatchedCustomer(found);
      setLookupHint(
        found.source === 'platform'
          ? 'Found platform customer — will be linked to your shop on booking.'
          : 'Existing shop customer loaded.',
      );
    } catch (e) {
      setMatchedCustomer(null);
      setLookupHint(e?.message || 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const buildAddress = () => {
    const parts = [form.state, form.district, form.taluk, form.area, form.doorStreet, form.pincode].filter(Boolean);
    return parts.join(', ');
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      notify('Required', 'Customer name is required');
      return;
    }
    if (!form.phone?.trim()) {
      notify('Required', 'Mobile number is required');
      return;
    }
    const phone = form.phone.replace(/\D/g, '').trim();
    const displayPhone = phone.startsWith('91') ? `+${phone}` : `+91 ${phone}`;

    // If lookup matched a platform customer, link it to this shop instead of
    // creating a fresh customers row — keeps shop & platform customers in sync.
    if (matchedCustomer && matchedCustomer.source === 'platform' && matchedCustomer.platformUserId) {
      setSaving(true);
      try {
        const linked = await ticketApi.post('/customers/link', {
          body: { platformUserId: matchedCustomer.platformUserId },
        });
        navigation.navigate('ChooseDevice', {
          customer: {
            id: linked.id,
            name: linked.name,
            phone: linked.phone,
            email: linked.email,
            address: linked.address,
          },
        });
      } catch (e) {
        notify('Error', e.message || 'Failed to link customer', { preset: 'error', haptic: 'error' });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Existing shop customer (already has shop-scoped id) — just go forward.
    if (matchedCustomer && matchedCustomer.id && matchedCustomer.source !== 'platform') {
      navigation.navigate('ChooseDevice', {
        customer: {
          id: matchedCustomer.id,
          name: form.name.trim(),
          phone: displayPhone,
          email: form.email?.trim(),
          address: buildAddress(),
        },
      });
      return;
    }

    if (mode === 'new') {
      setSaving(true);
      try {
        // Backend writes customer_users + customer_addresses; structured
        // fields land in their own columns. Still send the legacy `address`
        // concat for backward-compat with older deployments.
        const created = await ticketApi.post('/customers', {
          body: {
            name: form.name.trim(),
            phone: displayPhone,
            email: form.email?.trim() || undefined,
            addressLine: form.doorStreet?.trim() || undefined,
            locality:    form.taluk?.trim() || form.area?.trim() || undefined,
            city:        form.district?.trim() || undefined,
            state:       form.state?.trim() || undefined,
            pincode:     form.pincode?.trim() || undefined,
            address:     buildAddress() || undefined,
          },
        });
        navigation.navigate('ChooseDevice', {
          customer: {
            id: created.id,
            name: created.name,
            phone: created.phone,
            email: created.email,
            address: created.address,
          },
        });
      } catch (e) {
        notify('Error', e.message || 'Failed to save customer', { preset: 'error', haptic: 'error' });
      } finally {
        setSaving(false);
      }
    } else {
      navigation.navigate('ChooseDevice', {
        customer: {
          id: customer.id,
          name: form.name.trim(),
          phone: displayPhone,
          email: form.email?.trim(),
          address: buildAddress(),
        },
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#172117" />
        </TouchableOpacity>
        <Text style={styles.title}>Customer Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="person" size={16} color="#087A0A" />
          <Text style={styles.sectionTitle}>Customer Details</Text>
        </View>

        <Label label="Customer Name *" />
        <TextInput
          style={styles.input}
          placeholder="Enter Customer Name"
          placeholderTextColor="#8FA08F"
          value={form.name}
          onChangeText={(v) => set('name', v)}
        />

        <Label label="Your Mobile Number *" />
        <View style={styles.phoneRow}>
          <View style={styles.countryCode}>
            <Text style={styles.countryText}>+91</Text>
            <Ionicons name="chevron-down" size={14} color="#667066" />
          </View>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Enter your mobile number"
            placeholderTextColor="#8FA08F"
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={(v) => {
              set('phone', v);
              if (lookupHint) setLookupHint('');
              if (matchedCustomer) setMatchedCustomer(null);
            }}
            onSubmitEditing={handleMobileLookup}
            returnKeyType="search"
          />
          <TouchableOpacity
            onPress={handleMobileLookup}
            disabled={lookingUp}
            style={[styles.lookupBtn, lookingUp && { opacity: 0.6 }]}
          >
            {lookingUp ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="search" size={16} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
        {lookupHint ? <Text style={styles.lookupHint}>{lookupHint}</Text> : null}

        <Label label="Address" />
        <View style={styles.grid2}>
          <View style={{ flex: 1 }}>
            <Label2 label="State" />
            <TextInput
              style={styles.input}
              placeholder="State"
              placeholderTextColor="#8FA08F"
              value={form.state}
              onChangeText={(v) => set('state', v)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label2 label="District" />
            <TextInput
              style={styles.input}
              placeholder="Select district"
              placeholderTextColor="#8FA08F"
              value={form.district}
              onChangeText={(v) => set('district', v)}
            />
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={{ flex: 1 }}>
            <Label2 label="Taluk" />
            <TextInput
              style={styles.input}
              placeholder="Select Taluk"
              placeholderTextColor="#8FA08F"
              value={form.taluk}
              onChangeText={(v) => set('taluk', v)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label2 label="Area" />
            <TextInput
              style={styles.input}
              placeholder="Area"
              placeholderTextColor="#8FA08F"
              value={form.area}
              onChangeText={(v) => set('area', v)}
            />
          </View>
        </View>

        <View style={styles.grid2}>
          <View style={{ flex: 1 }}>
            <Label2 label="Door no. / Street" />
            <TextInput
              style={styles.input}
              placeholder="Door no. / Street"
              placeholderTextColor="#8FA08F"
              value={form.doorStreet}
              onChangeText={(v) => set('doorStreet', v)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label2 label="Pin Code" />
            <TextInput
              style={styles.input}
              placeholder="pincode"
              placeholderTextColor="#8FA08F"
              keyboardType="number-pad"
              value={form.pincode}
              onChangeText={(v) => set('pincode', v)}
            />
          </View>
        </View>

        <Label label="Your Email Address" />
        <TextInput
          style={styles.input}
          placeholder="email address"
          placeholderTextColor="#8FA08F"
          keyboardType="email-address"
          value={form.email}
          onChangeText={(v) => set('email', v)}
        />

        <Label label="ID Proof (Optional)" />
        <View style={styles.uploadBox}>
          <Ionicons name="cloud-upload-outline" size={20} color="#16BB05" />
          <Text style={styles.uploadText}>upload</Text>
          <Text style={styles.uploadHint}>Max size: 1MB</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>Save Details</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ label }) {
  return <Text style={styles.label}>{label}</Text>;
}

function Label2({ label }) {
  return <Text style={styles.label2}>{label}</Text>;
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
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { marginLeft: 6, fontSize: 14, fontWeight: '700', color: '#172117' },
  label: { fontSize: 12, fontWeight: '600', color: '#172117', marginBottom: 6, marginTop: 10 },
  label2: { fontSize: 11, color: '#667066', marginBottom: 4 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8E2',
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 42,
    fontSize: 13,
    color: '#172117',
    marginBottom: 10,
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8E2',
    paddingHorizontal: 10,
    height: 42,
  },
  countryText: { fontSize: 13, color: '#172117', marginRight: 6 },
  lookupBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#087A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupHint: { fontSize: 11, color: '#16BB05', marginTop: -4, marginBottom: 10 },
  grid2: { flexDirection: 'row', gap: 10 },
  uploadBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8EEBF',
    borderStyle: 'dashed',
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  uploadText: { marginTop: 4, fontSize: 13, color: '#16BB05', fontWeight: '700' },
  uploadHint: { marginTop: 4, fontSize: 11, color: '#667066' },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#087A0A',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

