import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { resetPassword } from '../api/auth';
import { clearSession } from '../auth/session';
import { notify } from '../components/confirm';
import { Button, Input } from '../components/rnr';
import { AuthShell, ErrorBox, authStyles as s, MUTED, INK } from './authUi';

const TIPS = [
  'Use at least 8 characters — a mix of letters and numbers is best.',
  'Do not reuse a password you have used before.',
  'Avoid dictionary words, your name, email, or mobile number.',
  'Do not use the same password across multiple accounts.',
];

export default function ResetPasswordScreen({ navigation, route, onLogin }) {
  const { identifier, otp } = route?.params || {};
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const goBack = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate('Login');
  };

  const onSave = async () => {
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    try {
      setLoading(true);
      const data = await resetPassword({ identifier, otp, newPassword: password });
      // resetPassword() already persisted the session; clear it before blocking
      // so a super-admin token can't survive to the next cold start.
      if (data?.loginType === 'SUPER_ADMIN') {
        await clearSession();
        setError('Super-admin accounts must sign in from the admin web app.');
        return;
      }
      notify('Password changed', 'Signed in successfully.', { preset: 'done', haptic: 'success' });
      onLogin?.(data);
    } catch (e) {
      const msg = e?.message || 'Could not reset your password.';
      setError(/otp/i.test(msg) ? `${msg} Go back and re-enter the code.` : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell onBack={goBack}>
      <Text style={s.h1}>Create new password</Text>
      <Text style={s.sub}>We&apos;ll ask for this password whenever you sign in.</Text>

      <Text style={s.fieldLabel}>New password</Text>
      <View style={s.fieldRow}>
        <Lock size={18} color={MUTED} />
        <Input
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          className="flex-1 bg-transparent border-0 ml-2"
          style={s.fieldInput}
        />
      </View>

      <Text style={s.fieldLabel}>Password again</Text>
      <View style={s.fieldRow}>
        <Lock size={18} color={MUTED} />
        <Input
          placeholder="••••••••"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          className="flex-1 bg-transparent border-0 ml-2"
          style={s.fieldInput}
        />
      </View>

      <ErrorBox msg={error} />

      <Button
        onPress={onSave}
        loading={loading}
        fullWidth
        size="lg"
        style={{ marginTop: 16, height: 54, borderRadius: 16 }}
        textClassName="text-[15px] font-extrabold tracking-wide"
      >
        Save changes and sign in
      </Button>

      <View style={{ marginTop: 26 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: INK, marginBottom: 8 }}>Secure password tips</Text>
        {TIPS.map((tip, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: MUTED, marginRight: 6 }}>•</Text>
            <Text style={{ flex: 1, fontSize: 12.5, color: MUTED, lineHeight: 18 }}>{tip}</Text>
          </View>
        ))}
      </View>
    </AuthShell>
  );
}
