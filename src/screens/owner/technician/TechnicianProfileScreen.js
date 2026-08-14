import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';

function formatTime(val) {
  if (val == null) return '—';
  if (typeof val === 'string') return val.length >= 5 ? val.substring(0, 5) : val;
  return String(val);
}

export default function TechnicianProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', photoUrl: '', defaultCheckIn: '09:30', defaultCheckOut: '18:30' });
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [checkInOutLoading, setCheckInOutLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ticketApi.get('/technicians/me');
      setProfile(data);
      setForm({
        name: data?.name ?? '',
        phone: data?.phone ?? '',
        photoUrl: data?.photoUrl ?? '',
        defaultCheckIn: data?.defaultCheckIn != null ? formatTime(data.defaultCheckIn) : '09:30',
        defaultCheckOut: data?.defaultCheckOut != null ? formatTime(data.defaultCheckOut) : '18:30',
      });
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to load profile', { preset: 'error', haptic: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTodayAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const res = await ticketApi.get('/technicians/me/attendance/today');
      setTodayAttendance(res ?? null);
    } catch {
      setTodayAttendance(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    if (profile) loadTodayAttendance();
  }, [profile, loadTodayAttendance]);

  const handleCheckIn = async () => {
    setCheckInOutLoading(true);
    try {
      const data = await ticketApi.post('/technicians/me/attendance/check-in', { body: {} });
      setTodayAttendance(data);
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to check in', { preset: 'error', haptic: 'error' });
    } finally {
      setCheckInOutLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckInOutLoading(true);
    try {
      const data = await ticketApi.post('/technicians/me/attendance/check-out', { body: {} });
      setTodayAttendance(data);
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to check out', { preset: 'error', haptic: 'error' });
    } finally {
      setCheckInOutLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name?.trim() || null,
        phone: form.phone?.trim() || null,
        photoUrl: form.photoUrl?.trim() || null,
        defaultCheckIn: form.defaultCheckIn?.trim() || null,
        defaultCheckOut: form.defaultCheckOut?.trim() || null,
      };
      const updated = await ticketApi.patch('/technicians/me', { body: payload });
      setProfile(updated);
      setEditing(false);
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to save', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color="#16BB05" style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.error}>Profile not found. Please log in again.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarLarge}>
              {profile.photoUrl ? (
                <Image
                  source={{ uri: profile.photoUrl }}
                  style={{ width: 88, height: 88, borderRadius: 44 }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={48} color="#8FA08F" />
              )}
            </View>
            <Text style={styles.name}>{profile.name || 'Technician'}</Text>
            {profile.email ? <Text style={styles.email}>{profile.email}</Text> : null}
            {profile.roleLabel ? <Text style={styles.role}>{profile.roleLabel}</Text> : null}
          </View>

          {editing ? (
            <View style={styles.card}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder="Your name"
              />
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
                placeholder="Phone number"
                keyboardType="phone-pad"
              />
              <Text style={styles.label}>Photo URL (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.photoUrl}
                onChangeText={(v) => setForm((p) => ({ ...p, photoUrl: v }))}
                placeholder="https://..."
                autoCapitalize="none"
              />
              <Text style={styles.label}>Default check-in</Text>
              <TextInput
                style={styles.input}
                value={form.defaultCheckIn}
                onChangeText={(v) => setForm((p) => ({ ...p, defaultCheckIn: v }))}
                placeholder="09:30"
              />
              <Text style={styles.label}>Default check-out</Text>
              <TextInput
                style={styles.input}
                value={form.defaultCheckOut}
                onChangeText={(v) => setForm((p) => ({ ...p, defaultCheckOut: v }))}
                placeholder="18:30"
              />
              <View style={styles.editRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.metaLabel}>Name</Text>
                <Text style={styles.metaValue}>{profile.name || '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.metaLabel}>Phone</Text>
                <Text style={styles.metaValue}>{profile.phone || '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.metaLabel}>Check-in / Check-out</Text>
                <Text style={styles.metaValue}>
                  {profile.defaultCheckIn ?? '09:30'} / {profile.defaultCheckOut ?? '18:30'}
                </Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Ionicons name="pencil" size={20} color="#16BB05" />
                <Text style={styles.editBtnText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Today&apos;s attendance</Text>
            {attendanceLoading ? (
              <ActivityIndicator size="small" color="#16BB05" style={{ marginVertical: 8 }} />
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={styles.metaLabel}>Check-in</Text>
                  <Text style={styles.metaValue}>{todayAttendance?.checkInTime != null ? formatTime(todayAttendance.checkInTime) : '—'}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.metaLabel}>Check-out</Text>
                  <Text style={styles.metaValue}>{todayAttendance?.checkOutTime != null ? formatTime(todayAttendance.checkOutTime) : '—'}</Text>
                </View>
                <View style={styles.checkInOutRow}>
                  <TouchableOpacity
                    style={[styles.checkInBtn, checkInOutLoading && styles.checkInBtnDisabled]}
                    onPress={handleCheckIn}
                    disabled={checkInOutLoading || todayAttendance?.checkInTime != null}
                  >
                    <Text style={styles.checkInBtnText}>Check in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.checkOutBtn, checkInOutLoading && styles.checkInBtnDisabled]}
                    onPress={handleCheckOut}
                    disabled={checkInOutLoading || !todayAttendance?.checkInTime || todayAttendance?.checkOutTime != null}
                  >
                    <Text style={styles.checkOutBtnText}>Check out</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('TechnicianDashboard')}>
            <Ionicons name="grid-outline" size={24} color="#16BB05" />
            <Text style={styles.navCardText}>Dashboard</Text>
            <Ionicons name="chevron-forward" size={20} color="#8FA08F" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('AssignedTickets')}>
            <Ionicons name="document-text-outline" size={24} color="#16BB05" />
            <Text style={styles.navCardText}>My Assigned Tickets</Text>
            <Ionicons name="chevron-forward" size={20} color="#8FA08F" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('TechnicianApplyLeave')}>
            <Ionicons name="calendar-outline" size={24} color="#16BB05" />
            <Text style={styles.navCardText}>Apply for leave</Text>
            <Ionicons name="chevron-forward" size={20} color="#8FA08F" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#172117' },
  loader: { flex: 1, justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  error: { fontSize: 14, color: '#DC2626', textAlign: 'center', marginTop: 24 },
  avatarRow: { alignItems: 'center', marginBottom: 20 },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#172117',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#172117',
  },
  avatarPlaceholder: { fontSize: 12, color: '#8FA08F' },
  name: { fontSize: 20, fontWeight: '700', color: '#F7FAF7', marginTop: 12 },
  email: { fontSize: 14, color: '#8FA08F', marginTop: 4 },
  role: { fontSize: 12, color: '#16BB05', marginTop: 4 },
  card: { backgroundColor: '#172117', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#172117' },
  label: { fontSize: 12, color: '#8FA08F', marginBottom: 4 },
  input: { backgroundColor: '#172117', borderWidth: 1, borderColor: '#172117', borderRadius: 8, padding: 12, fontSize: 16, color: '#F7FAF7', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#172117' },
  metaLabel: { fontSize: 14, color: '#8FA08F' },
  metaValue: { fontSize: 14, color: '#F7FAF7', fontWeight: '500' },
  editBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  editBtnText: { fontSize: 16, color: '#16BB05', fontWeight: '600' },
  editRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#172117', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, color: '#F7FAF7' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#087A0A', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  navCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#172117', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#172117', gap: 12 },
  navCardText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#F7FAF7' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#8FA08F', marginBottom: 8 },
  checkInOutRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  checkInBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#087A0A', alignItems: 'center' },
  checkOutBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#087A0A', alignItems: 'center' },
  checkInBtnDisabled: { opacity: 0.6 },
  checkInBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  checkOutBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
