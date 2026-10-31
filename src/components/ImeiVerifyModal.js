import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { AlertCircle, ScanLine, Smartphone, X } from 'lucide-react-native';
import SafeModal, { ModalInsets } from './SafeModal';
import { notify } from './confirm';
import { ticketApi } from '../api/client';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';
const RED = '#DC2626';

export const IMEI_LENGTH = 15;

/** Digits only — what a typed or scanned IMEI is reduced to. */
export const imeiDigits = (raw) => String(raw ?? '').replace(/\D/g, '');

/** Luhn checksum over a 15-digit IMEI (the 15th digit is the check digit). */
export function imeiLuhnValid(digits) {
  const d = imeiDigits(digits);
  if (d.length !== IMEI_LENGTH) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i += 1) {
    let n = Number(d[i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Why `raw` is not a usable IMEI, or null when it is (exactly 15 digits + Luhn). */
export function imeiError(raw) {
  const d = imeiDigits(raw);
  if (!d) return 'Enter the 15-digit IMEI number.';
  if (d.length !== IMEI_LENGTH) return `IMEI must be exactly 15 digits — ${d.length} entered.`;
  if (!imeiLuhnValid(d)) return 'This IMEI number is not valid. Check the digits (dial *#06# on the device).';
  return null;
}

const isImeiUsed = (e) => e?.payload?.code === 'IMEI_ALREADY_USED' || (e?.status === 409 && !e?.payload?.code);
const usedMessage = (trackingId) => `This IMEI number is already linked to another service booking${
  trackingId ? ` (#${String(trackingId).replace(/^#+/, '')})` : ''}. Please verify it.`;

/**
 * Device IMEI Verification — the one IMEI popup shared by Booking Details and
 * the Invoice Generator. Type the number or scan it (the scanner opens on the
 * existing ScanImei screen; this popup hides while it is open and comes back
 * with the value — or empty-handed for manual entry when the camera is denied
 * or the scan is cancelled). Verify checks 15 digits + Luhn, then asks the
 * server whether another open booking holds it, then hands the number to
 * `onSave` (which PATCHes it). A 409 IMEI_ALREADY_USED from either call is
 * shown inline; anything else is a toast. Nothing is saved on Cancel.
 *
 * Props: visible, navigation, ticketId, initialValue, subtitle, onSave(imei),
 * onCancel, onScanned(imei) (lets a screen that reloads on focus keep the
 * scanned value), and an optional secondary choice: secondaryLabel,
 * secondarySub, onSecondary().
 */
export default function ImeiVerifyModal({
  visible, navigation, ticketId, initialValue, subtitle, onSave, onCancel, onScanned,
  secondaryLabel, secondarySub, onSecondary,
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // 'verify' | 'secondary' | null
  const [scanning, setScanning] = useState(false);
  const unsubRef = useRef(null);
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  // Fresh form every time it opens.
  useEffect(() => {
    if (!visible) return;
    setValue(imeiDigits(initialRef.current));
    setError('');
    setBusy(null);
  }, [visible]);

  useEffect(() => () => { unsubRef.current?.(); }, []);

  const startScan = () => {
    if (!navigation || busy) return;
    unsubRef.current?.();
    setScanning(true);
    // Back on this screen (scanned, cancelled or camera denied) → reopen.
    const unsub = navigation.addListener('focus', () => {
      unsub();
      unsubRef.current = null;
      setScanning(false);
    });
    unsubRef.current = unsub;
    navigation.navigate('ScanImei', {
      onScan: (v) => {
        const d = imeiDigits(v);
        setValue(d);
        setError('');
        onScanned?.(d);
      },
    });
  };

  const verify = async () => {
    if (busy) return;
    const err = imeiError(value);
    if (err) { setError(err); return; }
    const imei = imeiDigits(value);
    setError('');
    setBusy('verify');
    try {
      if (ticketId) {
        try {
          const res = await ticketApi.get(`/tickets/${ticketId}/imei-availability`, { query: { imei } });
          if (res && res.available === false) {
            setError(res.valid === false ? (res.message || 'This IMEI number is not valid.') : usedMessage(res.conflictTrackingId));
            return;
          }
        } catch (e) {
          if (isImeiUsed(e)) { setError(usedMessage(e?.payload?.conflictTrackingId)); return; }
          // Check unavailable — the save below is still the server's uniqueness gate.
        }
      }
      await onSave?.(imei);
    } catch (e) {
      if (isImeiUsed(e)) { setError(usedMessage(e?.payload?.conflictTrackingId)); return; }
      notify('Save failed', e?.message || 'Could not save the IMEI. Try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const secondary = async () => {
    if (busy || !onSecondary) return;
    setBusy('secondary');
    try {
      await onSecondary();
    } catch (e) {
      notify('Save failed', e?.message || 'Could not save. Try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const cancel = () => { if (!busy) onCancel?.(); };
  const digits = imeiDigits(value);

  return (
    <SafeModal visible={!!visible && !scanning} transparent animationType="fade" onRequestClose={cancel}>
      <ModalInsets>
        {({ insets, keyboard }) => (
          <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.5)', justifyContent: 'center', paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, keyboard) + 16 }}>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, width: '100%', maxWidth: 440, alignSelf: 'center', padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={18} color={ACCENT} />
                </View>
                <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: INK }} numberOfLines={1}>Device IMEI Verification</Text>
                <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                  <X size={20} color={MUTED} />
                </Pressable>
              </View>
              {subtitle ? <Text style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>{subtitle}</Text> : null}

              <Text style={{ fontSize: 12.5, fontWeight: '800', color: INK, marginTop: 12, marginBottom: 6 }}>Enter IMEI Number</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, borderWidth: 1, borderColor: error ? '#FECACA' : LINE, paddingLeft: 12, paddingRight: 4 }}>
                <TextInput
                  value={value}
                  onChangeText={(v) => { setValue(imeiDigits(v)); if (error) setError(''); }}
                  placeholder="15-digit IMEI"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={17}
                  autoFocus
                  editable={!busy}
                  cursorColor={ACCENT}
                  accessibilityLabel="IMEI number"
                  style={{ flex: 1, minWidth: 0, paddingVertical: 0, fontSize: 15, fontWeight: '800', letterSpacing: 1, color: INK, includeFontPadding: false }}
                />
                {value ? (
                  <Pressable onPress={() => { setValue(''); setError(''); }} disabled={!!busy} hitSlop={6} accessibilityRole="button" accessibilityLabel="Clear IMEI" style={{ height: 36, width: 32, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ height: 18, width: 18, borderRadius: 9, backgroundColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  </Pressable>
                ) : null}
                {navigation ? (
                  <Pressable onPress={startScan} disabled={!!busy} hitSlop={6} accessibilityRole="button" accessibilityLabel="Scan IMEI" style={{ height: 36, width: 36, borderRadius: 10, marginLeft: 2, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                    <ScanLine size={18} color={ACCENT} />
                  </Pressable>
                ) : null}
              </View>
              {error ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 }}>
                  <AlertCircle size={13} color={RED} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, marginLeft: 5, fontSize: 11.5, color: RED }}>{error}</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Text style={{ flex: 1, fontSize: 11, color: MUTED }}>Dial *#06# on the device to see its IMEI.</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: digits.length === IMEI_LENGTH ? ACCENT : MUTED }}>{digits.length}/{IMEI_LENGTH}</Text>
                </View>
              )}

              {secondaryLabel && onSecondary ? (
                <Pressable
                  onPress={secondary}
                  disabled={!!busy}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: LINE, opacity: busy && busy !== 'secondary' ? 0.6 : 1 }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>{secondaryLabel}</Text>
                    {secondarySub ? <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }} numberOfLines={2}>{secondarySub}</Text> : null}
                  </View>
                  {busy === 'secondary' ? <ActivityIndicator size="small" color={ACCENT} style={{ marginLeft: 8 }} /> : null}
                </Pressable>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable onPress={cancel} disabled={!!busy} accessibilityRole="button" style={{ flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={verify} disabled={!!busy} accessibilityRole="button" accessibilityState={{ disabled: !!busy }} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', opacity: busy && busy !== 'verify' ? 0.6 : 1 }}>
                  {busy === 'verify' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Verify</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}
