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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';

function formatTime(val) {
  if (val == null) return '—';
  if (typeof val === 'string') return val.length >= 5 ? val.substring(0, 5) : val;
  return String(val);
}

function time12(val) {
  if (val == null || val === '') return '—';
  const [hh, mm] = String(val).split(':');
  const h = Number(hh);
  if (Number.isNaN(h)) return String(val);
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm || '00').slice(0, 2)} ${h < 12 ? 'AM' : 'PM'}`;
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
        <ActivityIndicator size="large" color="#035C6C" style={styles.loader} />
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
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* keyboard-controller KAV: edge-to-edge Android no longer resizes the window. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarRow}>
            <View style={styles.avatarLarge}>
              {profile.photoUrl ? (
                <Image
                  source={{ uri: profile.photoUrl }}
                  style={{ width: 72, height: 72, borderRadius: 36 }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={40} color="#9CA3AF" />
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
                  {time12(profile.defaultCheckIn ?? '09:30')} / {time12(profile.defaultCheckOut ?? '18:30')}
                </Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Ionicons name="pencil" size={20} color="#035C6C" />
                <Text style={styles.editBtnText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Today&apos;s attendance</Text>
            {attendanceLoading ? (
              <ActivityIndicator size="small" color="#035C6C" style={{ marginVertical: 8 }} />
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={styles.metaLabel}>Check-in</Text>
                  <Text style={styles.metaValue}>{time12(todayAttendance?.checkInTime)}</Text>
                </View>
                <View style={[styles.row, styles.rowLast]}>
                  <Text style={styles.metaLabel}>Check-out</Text>
                  <Text style={styles.metaValue}>{time12(todayAttendance?.checkOutTime)}</Text>
                </View>
                <View style={styles.checkInOutRow}>
                  <TouchableOpacity
                    style={[styles.checkInBtn, (checkInOutLoading || todayAttendance?.checkInTime != null) && styles.checkInBtnDisabled]}
                    onPress={handleCheckIn}
                    disabled={checkInOutLoading || todayAttendance?.checkInTime != null}
                  >
                    <Text style={styles.checkInBtnText}>Check in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.checkOutBtn, (checkInOutLoading || !todayAttendance?.checkInTime || todayAttendance?.checkOutTime != null) && styles.checkInBtnDisabled]}
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
            <Ionicons name="grid-outline" size={24} color="#035C6C" />
            <Text style={styles.navCardText}>Dashboard</Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('AssignedTickets')}>
            <Ionicons name="document-text-outline" size={24} color="#035C6C" />
            <Text style={styles.navCardText}>My Assigned Tickets</Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('TechnicianApplyLeave')}>
            <Ionicons name="calendar-outline" size={24} color="#035C6C" />
            <Text style={styles.navCardText}>Apply for leave</Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('Terms')}>
            <Ionicons name="reader-outline" size={24} color="#035C6C" />
            <Text style={styles.navCardText}>Terms & Conditions</Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navCard} onPress={() => navigation.navigate('PrivacyPolicy')}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#035C6C" />
            <Text style={styles.navCardText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  loader: { flex: 1, justifyContent: 'center' },
  content: { padding: 12, paddingBottom: 32, width: '100%', maxWidth: 640, alignSelf: 'center' },
  error: { fontSize: 13, color: '#DC2626', textAlign: 'center', marginTop: 24 },
  avatarRow: { alignItems: 'center', marginBottom: 14, marginTop: 6 },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E5F3F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#C7E6EA',
    overflow: 'hidden',
  },
  avatarPlaceholder: { fontSize: 12, color: '#6B7280' },
  name: { fontSize: 17, fontWeight: '800', color: '#111111', marginTop: 10 },
  email: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  role: { fontSize: 12, color: '#035C6C', fontWeight: '700', marginTop: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  label: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  input: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, fontSize: 15, color: '#111111', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F1F1', gap: 12 },
  rowLast: { borderBottomWidth: 0 },
  metaLabel: { fontSize: 13, color: '#6B7280', flexShrink: 1 },
  metaValue: { fontSize: 13, color: '#111111', fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  editBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8, alignSelf: 'flex-start', paddingVertical: 4 },
  editBtnText: { fontSize: 14, color: '#035C6C', fontWeight: '700' },
  editRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#111111', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#035C6C', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  navCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
  navCardText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111111' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#111111', marginBottom: 4 },
  checkInOutRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  checkInBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#035C6C', alignItems: 'center' },
  checkOutBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F84141', alignItems: 'center' },
  checkInBtnDisabled: { opacity: 0.45 },
  checkInBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  checkOutBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
