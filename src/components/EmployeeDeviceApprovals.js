import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../api/client';
import { notify } from './confirm';

/**
 * Owner approval for an employee's NEW phone (auth-service PR #73):
 *   GET  /auth/security/device-approvals
 *   POST /auth/security/device-approvals/{id}/approve|deny
 * An approval is single-use for 15 minutes — the employee then logs in again
 * with mobile + MPIN on the new phone, which replaces the old device session.
 * Renders nothing when there are no pending requests (or the call fails).
 */
export default function EmployeeDeviceApprovals() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null); // request id being decided

  const load = useCallback(async () => {
    try {
      const list = await authApi.get('/auth/security/device-approvals');
      setItems(Array.isArray(list) ? list : []);
    } catch (_) {
      setItems([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decide = async (item, approve) => {
    if (busy) return;
    setBusy(item.id);
    try {
      await authApi.post(`/auth/security/device-approvals/${item.id}/${approve ? 'approve' : 'deny'}`);
      notify(
        approve ? 'Device approved' : 'Device denied',
        approve
          ? `${item.employeeName || 'The employee'} can now log in on the new phone with their MPIN within 15 minutes.`
          : 'The new phone was not allowed. The current device stays signed in.',
        { type: approve ? 'success' : 'info' },
      );
    } catch (e) {
      notify('Error', e?.message || 'Could not update the request', { preset: 'error', haptic: 'error' });
    } finally {
      setBusy(null);
      load();
    }
  };

  if (!items.length) return null;

  return (
    <View style={{ backgroundColor: '#FFFBEB', borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', padding: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Ionicons name="phone-portrait-outline" size={18} color="#B45309" />
        <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: '#111111' }}>New device requests</Text>
      </View>
      {items.map((it) => (
        <View key={it.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E5E7EB' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#111111' }} numberOfLines={1}>{it.employeeName || 'Employee'}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={2}>
            Wants to log in on {it.deviceName || 'a new phone'}{it.platform ? ` (${it.platform})` : ''}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
            <TouchableOpacity
              onPress={() => decide(it, false)}
              disabled={!!busy}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#F32C26', alignItems: 'center' }}
            >
              <Text style={{ color: '#F32C26', fontWeight: '800' }}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => decide(it, true)}
              disabled={!!busy}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#035C6C', alignItems: 'center' }}
            >
              {busy === it.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Approve</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
