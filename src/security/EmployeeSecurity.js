// Owner-side employee security: set / reset an employee's Staff App login MPIN
// (never shown back) and approve / deny an employee's new-device request.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../api/client';
import { confirm, notify } from '../components/confirm';
import { C } from './PinPad';
import { NewPinFlow } from './SecurityFlows';
import { pinErrorMessage } from './securityApi';

export const setEmployeeMpin = (userId, pin) => authApi.put(`/auth/security/employees/${userId}/mpin`, { body: { pin } });
export const employeeMpinStatus = (userId) => authApi.get(`/auth/security/employees/${userId}/mpin`);

/** Client-side check mirroring the server rule (6 digits, not all-same / sequential). */
export function employeeMpinProblem(pin) {
  if (!/^\d{6}$/.test(pin || '')) return 'Login MPIN must be exactly 6 digits.';
  if (new Set(pin).size === 1 || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Login MPIN is too simple. Avoid 111111 or 123456.';
  return null;
}

/** Bottom sheet: set or reset the employee's login MPIN (enter + confirm). */
export function EmployeeMpinSheet({ visible, userId, employeeName, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' }}>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 20 + insets.bottom, alignItems: 'center' }}>
          {visible ? (
            <NewPinFlow
              type="MPIN"
              subtitle={`Staff App login MPIN for ${employeeName || 'this employee'}. Signs them out everywhere.`}
              onSubmit={async (pin) => { await setEmployeeMpin(userId, pin); }}
              onDone={() => { notify('Login MPIN updated', 'Share it with the employee privately.', { preset: 'done' }); onClose?.(); }}
            />
          ) : null}
          <Pressable onPress={onClose} style={{ padding: 10 }}><Text style={{ color: C.muted, fontWeight: '700' }}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Pending employee new-device requests with Approve / Deny (hidden when none). */
export function EmployeeDeviceApprovals({ style }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setItems((await authApi.get('/auth/security/device-approvals')) || []); } catch (_) { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (it, approve) => {
    if (approve) {
      const ok = await confirm({
        title: 'Approve new device?',
        message: `${it.employeeName || 'The employee'} will be signed in on ${it.deviceName || 'a new device'} and logged out of the old one.`,
        confirmText: 'Approve',
      });
      if (!ok) return;
    }
    setBusy(it.id);
    try {
      await authApi.post(`/auth/security/device-approvals/${it.id}/${approve ? 'approve' : 'deny'}`);
      notify(approve ? 'Device approved' : 'Request denied', approve ? 'Ask the employee to log in again on the new device.' : '', { preset: 'done' });
    } catch (e) {
      notify('Could not update', pinErrorMessage(e), { preset: 'error' });
    } finally { setBusy(null); load(); }
  };

  if (!items.length) return null;
  return (
    <View style={[{ backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 14, padding: 12 }, style]}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>New device requests</Text>
      {items.map((it) => (
        <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Ionicons name="phone-portrait-outline" size={18} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }} numberOfLines={1}>{it.employeeName || 'Employee'}</Text>
            <Text style={{ fontSize: 11.5, color: C.muted }} numberOfLines={1}>{it.deviceName || 'New device'}</Text>
          </View>
          {busy === it.id ? <ActivityIndicator color={C.primary} /> : (
            <>
              <Pressable onPress={() => decide(it, false)} style={{ paddingHorizontal: 10, height: 30, justifyContent: 'center' }}>
                <Text style={{ color: C.error, fontWeight: '800', fontSize: 12.5 }}>Deny</Text>
              </Pressable>
              <Pressable onPress={() => decide(it, true)} style={{ paddingHorizontal: 12, height: 30, borderRadius: 8, backgroundColor: C.primary, justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>Approve</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  );
}
