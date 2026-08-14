import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import { requestOtp } from '../api/auth';
import { Button, Input } from '../components/rnr';
import { AuthShell, ErrorBox, authStyles as s, MUTED, GREEN } from './authUi';

const RESEND_SECONDS = 30;

export default function ForgotPasswordOtpScreen({ navigation, route }) {
  const { identifier, channel, target } = route?.params || {};
  const isMobile = channel === 'MOBILE';

  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Countdown for the resend link.
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const goBack = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate('ForgotPassword');
  };

  const resend = async () => {
    if (seconds > 0) return;
    setError(null); setNote(null);
    try {
      await requestOtp(identifier);
      setSeconds(RESEND_SECONDS);
      setNote('A new code has been sent.');
    } catch (e) {
      setError(e?.message || 'Could not resend the code.');
    }
  };

  const onSubmit = () => {
    setError(null);
    if (otp.trim().length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    navigation.navigate('ResetPassword', { identifier, otp: otp.trim() });
    setLoading(false);
  };

  return (
    <AuthShell onBack={goBack}>
      <Text style={s.h1}>Verify code</Text>
      <Text style={s.sub}>
        {isMobile
          ? `Enter the OTP for ${target || 'your mobile number'}. The default code is 123456.`
          : `Enter the 6-digit code we sent to ${target || 'your email'}.`}
      </Text>

      <Text style={s.fieldLabel}>Enter code</Text>
      <View style={s.fieldRow}>
        <KeyRound size={18} color={MUTED} />
        <Input
          placeholder="6-digit code"
          value={otp}
          onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          className="flex-1 bg-transparent border-0 ml-2"
          style={[s.fieldInput, { letterSpacing: 6 }]}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <Pressable onPress={resend} disabled={seconds > 0} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: seconds > 0 ? MUTED : GREEN }}>Resend code</Text>
        </Pressable>
        {seconds > 0 ? (
          <Text style={{ fontSize: 12.5, color: MUTED, marginLeft: 8 }}>· wait {seconds}s</Text>
        ) : null}
      </View>

      {note ? <Text style={{ fontSize: 12.5, color: GREEN, marginTop: 8 }}>{note}</Text> : null}
      <ErrorBox msg={error} />

      <Button
        onPress={onSubmit}
        loading={loading}
        fullWidth
        size="lg"
        style={{ marginTop: 16, height: 54, borderRadius: 16 }}
        textClassName="text-[15px] font-extrabold tracking-wide"
      >
        Submit code
      </Button>
    </AuthShell>
  );
}
