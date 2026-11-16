import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { BadgeCheck, X } from 'lucide-react-native';
import { authApi } from '../../../api/client';
import SafeModal from '../../../components/SafeModal';

const ACCENT = '#035C6C';

/**
 * Employee PIN before "Submit Booking". The PIN is the employee's Employee App
 * PIN; the server (POST /auth/booking-pin/verify) finds which active member of
 * this shop owns it (or the signed-in owner) and returns their name + a
 * 5-minute booking token. The PIN itself is never stored on the phone.
 * onConfirm({ token, name, expiresAt }) → the caller submits with that token.
 */
export default function BookingPinSheet({ visible, onClose, onConfirm, deviceCount = 1 }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null); // { token, name, role, expiresAt }
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) { setPin(''); setError(null); setOk(null); setBusy(false); }
  }, [visible]);

  const verify = async () => {
    if (busy || pin.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authApi.post('/auth/booking-pin/verify', { body: { pin } });
      if (!r?.token) throw new Error('Could not verify the PIN.');
      setOk({ token: r.token, name: r.employeeName || 'Employee', role: r.role, expiresAt: r.expiresAt });
    } catch (e) {
      setError(e?.status === 404 ? 'PIN verification is not available on the server yet.' : (e?.message || 'Invalid PIN.'));
    } finally {
      setPin(''); // never keep the PIN once it has been sent
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!ok) return;
    const t = ok;
    setOk(null);
    onConfirm?.(t);
  };

  return (
    <SafeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, width: '100%', maxWidth: 380, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#111111' }}>Employee PIN</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
              style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} color={ACCENT} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Enter your 6-digit Employee App PIN to submit this booking.</Text>

          {ok ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#BFE3D0', backgroundColor: '#EEF8F2', padding: 10 }}>
              <BadgeCheck size={20} color="#0B6B4B" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontSize: 11, color: '#0B6B4B', fontWeight: '700' }}>Verified{ok.role === 'OWNER' ? ' · Owner' : ''}</Text>
                <Text style={{ fontSize: 14, color: '#111111', fontWeight: '800' }} numberOfLines={1}>{ok.name}</Text>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
              <TextInput
                ref={inputRef}
                value={pin}
                onChangeText={(t) => { setPin(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                onSubmitEditing={verify}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                autoFocus
                placeholder="● ● ● ● ● ●"
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="Employee PIN"
                style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: error ? '#B3261E' : '#E5E7EB', paddingHorizontal: 12, fontSize: 18, letterSpacing: 6, color: '#111111' }}
              />
              <Pressable onPress={verify} disabled={busy || pin.length !== 6} accessibilityRole="button"
                style={{ marginLeft: 8, height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: ACCENT, opacity: busy || pin.length !== 6 ? 0.45 : 1, alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Verify</Text>}
              </Pressable>
            </View>
          )}
          {error ? <Text style={{ fontSize: 12, color: '#B3261E', marginTop: 8 }}>{error}</Text> : null}

          <Pressable onPress={confirm} disabled={!ok} accessibilityRole="button"
            style={{ marginTop: 14, height: 46, borderRadius: 12, backgroundColor: ACCENT, opacity: ok ? 1 : 0.4, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
              {`Confirm & Submit Booking${deviceCount > 1 ? ` (${deviceCount})` : ''}`}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </SafeModal>
  );
}
