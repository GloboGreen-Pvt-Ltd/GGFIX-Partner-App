import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { ArrowLeft, ArrowRight, MapPin, Phone, Store, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { partnerSignup, requestPartnerSignupOtp } from '../api/auth';
import { notify } from '../components/confirm';
import { setLegalAgreed } from '../legal/legalConsent';
import { GREEN, MUTED, INK, SCREEN_BG, FIELD_BORDER } from './authUi';

// Partner App "Create Account": owner + shop details → Send OTP → verify →
// the server creates the owner and first shop and signs in (onLogin → Home).
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const DANGER = '#DC2626';
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const digits10 = (v) => v.replace(/[^0-9]/g, '').slice(0, 10);

export default function CreateAccountScreen({ navigation, onLogin }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 600;
  const [step, setStep] = useState('FORM'); // FORM | OTP
  const [form, setForm] = useState({ ownerName: '', ownerMobile: '', shopName: '', shopMobile: '', shopAddress: '' });
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);
  const otpRef = useRef(null);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const set = (key) => (v) => { setForm((f) => ({ ...f, [key]: v })); setError(null); };

  const goBack = () => {
    if (step === 'OTP') { setStep('FORM'); setOtp(''); setError(null); return; }
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate('Login');
  };

  const validate = () => {
    if (!form.ownerName.trim()) return "Enter the owner's full name";
    if (form.ownerMobile.length !== 10) return "Enter the owner's 10-digit mobile number";
    if (!form.shopName.trim()) return 'Enter the shop name';
    if (form.shopMobile && form.shopMobile.length !== 10) return 'Enter a 10-digit shop contact number';
    if (!form.shopAddress.trim()) return 'Enter the shop address';
    return null;
  };

  const sendOtp = async ({ resend = false } = {}) => {
    if (busyRef.current) return;
    const v = validate();
    if (v) { setError(v); return; }
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await requestPartnerSignupOtp(form.ownerMobile);
      setSeconds(RESEND_SECONDS);
      if (!resend) setStep('OTP');
      notify(resend ? 'New verification code sent' : 'Verification code sent', '', { preset: 'done' });
    } catch (e) {
      const msg = e?.status === 409
        ? 'This mobile number is already registered. Please log in.'
        : e?.message || 'Could not send the code.';
      setError(msg);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const verify = async (code) => {
    const entered = (code ?? otp).trim();
    if (entered.length !== OTP_LENGTH) { setError(`Enter the ${OTP_LENGTH}-digit code`); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // "By registering you agree…" — registering is the acceptance.
      setLegalAgreed(true);
      const data = await partnerSignup({
        ownerName: form.ownerName.trim(),
        ownerMobile: form.ownerMobile,
        shopName: form.shopName.trim(),
        shopMobile: form.shopMobile || null,
        shopAddress: form.shopAddress.trim(),
        otp: entered,
      });
      notify('Account created', 'Welcome to NearGFix Partner', { preset: 'done' });
      onLogin?.(data);
    } catch (e) {
      if (e?.status === 401) { setOtp(''); otpRef.current?.focus(); setError('Invalid OTP. Please try again.'); }
      else if (e?.status === 409) setError(e?.message || 'This mobile number is already registered. Please log in.');
      else setError(e?.message || 'Could not create the account.');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const onOtpChange = (v) => {
    const d = v.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(d);
    setError(null);
    if (d.length === OTP_LENGTH) verify(d);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: SCREEN_BG }} behavior="padding">
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />
      <LinearGradient colors={[MINT, '#F3F4F6', SCREEN_BG]} locations={[0, 0.45, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }} />

      <Pressable onPress={goBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back"
        style={{
          position: 'absolute', top: Math.max(Platform.OS === 'ios' ? 56 : 20, insets.top + 8), left: 18, zIndex: 10,
          height: 40, width: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: MINT_LINE,
        }}>
        <ArrowLeft size={20} color={GREEN} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 72, paddingBottom: insets.bottom + 28, paddingHorizontal: isWide ? 32 : 22 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: isWide ? 480 : undefined, alignSelf: 'center' }}>
          {step === 'FORM' ? (
            <>
              <Text style={{ fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.4 }}>
                Start Your Business with <Text style={{ color: GREEN }}>NearGFix</Text>
              </Text>
              <Text style={{ fontSize: 13.5, color: MUTED, marginTop: 6, lineHeight: 20 }}>
                Register your shop and manage your business in one place.
              </Text>

              <Section title="Owner Information">
                <Field icon={User} label="Owner's Full Name" value={form.ownerName} onChangeText={set('ownerName')} placeholder="Full name" autoCapitalize="words" />
                <Field icon={Phone} label="Owner's Mobile Number" value={form.ownerMobile} onChangeText={(v) => set('ownerMobile')(digits10(v))} placeholder="9876543210" keyboardType="number-pad" prefix="+91" />
              </Section>

              <Section title="Shop Information">
                <Field icon={Store} label="Shop Name" value={form.shopName} onChangeText={set('shopName')} placeholder="Shop name" autoCapitalize="words" />
                <Field icon={Phone} label="Shop Contact Number" value={form.shopMobile} onChangeText={(v) => set('shopMobile')(digits10(v))} placeholder="9876543210" keyboardType="number-pad" prefix="+91" />
                <Field icon={MapPin} label="Shop Address" value={form.shopAddress} onChangeText={set('shopAddress')} placeholder="Door no, street, area, city" multiline />
              </Section>

              <ErrorText msg={error} />
              <PrimaryButton label="Send OTP" loading={loading} onPress={() => sendOtp()} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.4 }}>
                Verify with <Text style={{ color: GREEN }}>OTP code</Text>
              </Text>
              <Text style={{ fontSize: 13.5, color: MUTED, marginTop: 6 }}>
                Code sent to <Text style={{ color: INK, fontWeight: '700' }}>+91 {form.ownerMobile}</Text>
              </Text>

              <View style={{ marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>Enter {OTP_LENGTH}-digit OTP</Text>
                <Pressable onPress={goBack} hitSlop={8} accessibilityRole="button">
                  <Text style={{ fontSize: 13, fontWeight: '700', color: GREEN }}>Change details</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => otpRef.current?.focus()} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} pointerEvents="none">
                  {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                    const ch = otp[i] || '';
                    const active = otp.length === i;
                    return (
                      <View key={i} style={{
                        width: 46, height: 52, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                        borderWidth: active || ch ? 1.5 : 1, borderColor: active || ch ? GREEN : FIELD_BORDER,
                      }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: ch ? INK : '#C4C4C4' }}>{ch || '•'}</Text>
                      </View>
                    );
                  })}
                </View>
                <TextInput
                  ref={otpRef}
                  value={otp}
                  onChangeText={onOtpChange}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  autoFocus
                  caretHidden
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  accessibilityLabel="OTP code"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' }}
                />
              </Pressable>

              <ErrorText msg={error} />
              <PrimaryButton label="Verify & Create Account" loading={loading} onPress={() => verify()} />

              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16 }}>
                <Text style={{ fontSize: 13, color: MUTED }}>Didn't get the code? </Text>
                <Pressable onPress={() => sendOtp({ resend: true })} disabled={seconds > 0 || loading} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: seconds > 0 ? '#9CA3AF' : GREEN }}>
                    {seconds > 0 ? `Resend in ${seconds}s` : 'Resend Now'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          <Text style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 18, lineHeight: 18 }}>
            By registering you agree to our{' '}
            <Text style={{ color: GREEN, fontWeight: '700' }} onPress={() => navigation?.navigate('Terms')}>Terms</Text>
            {' '}and{' '}
            <Text style={{ color: GREEN, fontWeight: '700' }} onPress={() => navigation?.navigate('PrivacyPolicy')}>Privacy policy</Text>
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 14 }}>
            <Text style={{ fontSize: 13.5, color: MUTED }}>Already have an account? </Text>
            <Pressable onPress={() => navigation?.navigate('Login')} hitSlop={8} accessibilityRole="button">
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: GREEN }}>Log In</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: FIELD_BORDER, padding: 14 }}>
      <Text style={{ fontSize: 14.5, fontWeight: '800', color: INK, marginBottom: 4 }}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ icon: Icon, label, prefix, multiline, ...input }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: MUTED, marginBottom: 6 }}>{label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', minHeight: 48, borderRadius: 12,
        borderWidth: 1, borderColor: FIELD_BORDER, backgroundColor: '#F9FAFB', paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0,
      }}>
        <Icon size={18} color="#7A7A7A" strokeWidth={2} style={multiline ? { marginTop: 2 } : null} />
        {prefix ? <Text style={{ marginLeft: 10, fontSize: 15, fontWeight: '700', color: INK }}>{prefix}</Text> : null}
        <TextInput
          {...input}
          multiline={multiline}
          accessibilityLabel={label}
          placeholderTextColor="#BDBDBD"
          maxLength={input.keyboardType === 'number-pad' ? 10 : 300}
          style={[
            { flex: 1, marginLeft: 10, fontSize: 15, color: INK, paddingVertical: multiline ? 0 : 10, minHeight: multiline ? 60 : undefined, textAlignVertical: multiline ? 'top' : 'center' },
            Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
          ]}
        />
      </View>
    </View>
  );
}

function ErrorText({ msg }) {
  if (!msg) return null;
  return <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '600', color: DANGER }}>{msg}</Text>;
}

function PrimaryButton({ label, loading, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label}
      style={{ marginTop: 18, height: 52, borderRadius: 999, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: loading ? 0.8 : 1 }}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : (
        <>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 }}>{label}</Text>
          <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.4} style={{ marginLeft: 10 }} />
        </>
      )}
    </Pressable>
  );
}
