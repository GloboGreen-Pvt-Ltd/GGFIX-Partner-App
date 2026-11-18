// Security Settings: biometric toggle, Reset MPIN, Reset TPIN (no "Change PIN").
import React, { useState } from 'react';
import { Modal, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from './PinPad';
import { NewPinFlow, ResetPinFlow } from './SecurityFlows';
import { useSecurity } from './SecurityGate';
import { authenticate, isDeviceSecure, setAppLockEnabled } from '../auth/appLock';
import { setBiometricPreference } from './securityApi';
import { notify } from '../components/confirm';

function Row({ icon, label, sub, right, onPress, last }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        <Ionicons name={icon} size={18} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>{label}</Text>
        <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
      {right || <Ionicons name="chevron-forward" size={16} color={C.muted} />}
    </Pressable>
  );
}

export default function SecuritySettings({ style }) {
  const { secure, session, status, refreshStatus, bioOn, setBioOn } = useSecurity();
  const insets = useSafeAreaInsets();
  const [reset, setReset] = useState(null);
  if (!secure || !status) return null;

  const toggleBio = async (next) => {
    if (next) {
      if (!(await isDeviceSecure())) { notify('Set a screen lock first', 'Add a fingerprint or face unlock in phone settings.', { type: 'warning' }); return; }
      if (!(await authenticate())) return;
    }
    await setAppLockEnabled(next);
    setBioOn(next);
    setBiometricPreference(next).catch(() => {});
  };

  return (
    <View style={[{ backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }, style]}>
      <Row icon="finger-print" label="Biometric Unlock" sub="Fingerprint / face instead of MPIN"
        right={<Switch value={!!bioOn} onValueChange={toggleBio} trackColor={{ true: C.primary, false: C.border }} thumbColor="#FFFFFF" />} />
      <Row icon="keypad-outline" label="Reset MPIN" sub="Verify OTP and set a new app PIN" onPress={() => setReset('MPIN')} last={!status.tpinRequired} />
      {status.tpinRequired ? (
        <Row icon="shield-checkmark-outline" label={status.tpinSet ? 'Reset TPIN' : 'Create TPIN'} sub={status.tpinSet ? 'Verify OTP and set a new Transaction PIN' : 'Set your 6-digit Transaction PIN'} onPress={() => setReset(status.tpinSet ? 'TPIN' : 'CREATE_TPIN')} last />
      ) : null}
      <Modal visible={!!reset} transparent animationType="slide" onRequestClose={() => setReset(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 20 + insets.bottom, alignItems: 'center' }}>
            {reset === 'CREATE_TPIN' ? (
              <>
                <NewPinFlow type="TPIN" subtitle="Used to approve transactions" onDone={() => { notify('TPIN created', '', { preset: 'done' }); setReset(null); refreshStatus().catch(() => {}); }} />
                <Pressable onPress={() => setReset(null)} style={{ padding: 10 }}><Text style={{ color: C.muted, fontWeight: '700' }}>Cancel</Text></Pressable>
              </>
            ) : reset ? (
              <ResetPinFlow
                type={reset}
                session={session}
                onCancel={() => setReset(null)}
                onDone={() => { notify(`${reset} reset successfully`, '', { preset: 'done' }); setReset(null); refreshStatus().catch(() => {}); }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
