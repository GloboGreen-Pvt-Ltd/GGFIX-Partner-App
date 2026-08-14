import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { login, requestOtp, requestShopLoginOtp } from '../api/auth';
import { clearSession } from '../auth/session';
import { AUTH_BASE } from '../api/config';
import { Button } from '../components/rnr';
import { tokens } from '../theme/colors';
import { rf, rlh, rs } from '../utils/responsive';

/**
 * Shop sign-in: mobile number → OTP. Both steps live in this one screen (rather
 * than two navigator routes) because RootNavigator mounts a single "Login"
 * screen while logged out — keeping the step in local state avoids touching the
 * navigator and keeps the entered number in scope for the resend.
 *
 * Wire-level flow, all endpoints already exist in auth-service:
 *   1. POST /auth/otp/send              { email: <mobile> }  — users-table accounts
 *      (SHOP_OWNER / TECHNICIAN). 400s when the mobile isn't on a users row.
 *   2. POST /auth/shop-login/request-otp { mobile }           — fallback for a number
 *      that only exists as a SHOP mobile (loginType=SHOP_LOGIN). Also HEALS a
 *      NULL shops.mobile_otp_code by writing 123456, which is the long-standing
 *      cause of "Invalid OTP" on shops created before migration 54.
 *   3. POST /auth/login                 { email: <mobile>, otp }
 *
 * AuthService.login resolves the identifier against users (by email, then phone)
 * and falls through to shops.mobile — so one mobile+OTP form covers every
 * identity this app serves. Two OTP issuers, one verifier.
 *
 * OTP is SIX digits, not the four drawn in the design: auth-service compares
 * against users.otp_code / shops.mobile_otp_code, both defaulting to 123456.
 * There's no SMS gateway yet — a mobile identifier always resolves to that
 * static code.
 */

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const DIAL_CODE = '+91';
const MOBILE_DIGITS = 10;

const GREEN = tokens.primary;
const TEXT = tokens.text;
const MUTED = tokens.textMuted;
const SUBTLE = tokens.textSubtle;
const BORDER = tokens.border;
const AMBER = tokens.attention;
const DANGER = tokens.danger;

// Sign-in is the one screen that sits on pure white rather than the app's
// #F7FAF7 page wash: the brand logo PNG has an opaque white background, so any
// tinted wash draws a visible square around it.
const PAGE_BG = '#FFFFFF';
// Fixed 5px — deliberately NOT rs(), so the logo's corner radius is identical
// on every device instead of drifting 4.4–5.6px with the width scale.
const LOGO_RADIUS = 10;

export default function LoginScreen({ onLogin, navigation }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('MOBILE'); // MOBILE | OTP
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const otpRef = useRef(null);
  // Guards the auto-submit that fires when the 6th digit lands, so a slow
  // request can't be double-sent by another keystroke (or by paste + tap).
  const verifyingRef = useRef(false);

  // Resend countdown.
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  /**
   * Only surface internal host/URL topology (AUTH_BASE, tried URL) in dev
   * builds — leaking the backend IP/port map to end users aids attackers and
   * adds nothing for them. Production shows a generic, non-revealing message.
   */
  const describeError = (e, fallback) => {
    const msg = e?.message || fallback;
    if (__DEV__) {
      const isLocalhost = /localhost|127\.0\.0\.1/.test(String(msg));
      if (!isLocalhost) return msg;
      const urlMatch = String(msg).match(/URL:\s*(\S+)/i);
      const triedUrl = urlMatch ? urlMatch[1] : '(unknown)';
      return (
        `Can't reach server (trying localhost). Tried: ${triedUrl}. ` +
        `Current AUTH_BASE: ${AUTH_BASE}. Restart Expo with EXPO_PUBLIC_API_HOST=YOUR_PC_IP.`
      );
    }
    // Network/unreachable → generic connectivity message; auth failures → the
    // server's own (non-topology) message so the user still gets useful
    // feedback like "Invalid OTP".
    const status = e?.status;
    if (!status || status === 0) return "Can't reach the server. Check your connection and try again.";
    return msg;
  };

  const sendOtp = async ({ resend = false } = {}) => {
    setError(null);
    setNote(null);
    if (mobile.length !== MOBILE_DIGITS) {
      setError(`Enter your ${MOBILE_DIGITS}-digit mobile number`);
      return;
    }
    try {
      setLoading(true);
      try {
        await requestOtp(mobile);
      } catch (e) {
        // A 400 here means "not a users row" — it may still be a shop's own
        // login mobile, which has a separate issuer. Anything else (network,
        // 5xx) is a real failure and must not be masked by the fallback.
        if (e?.status !== 400) throw e;
        try {
          await requestShopLoginOtp(mobile);
        } catch (e2) {
          // Unknown to BOTH issuers → the number simply isn't registered. Say
          // that, rather than leaking the second issuer's shop-flavoured 400
          // ("No shop registered…"), which reads as a bug to an owner who
          // just mistyped a digit.
          if (e2?.status !== 400) throw e2;
          const notFound = new Error('No account found for that mobile number.');
          notFound.status = 400;
          throw notFound;
        }
      }
      setSeconds(RESEND_SECONDS);
      if (resend) setNote('A new code has been sent.');
      else setStep('OTP');
    } catch (e) {
      setError(describeError(e, 'Could not send the code.'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code) => {
    const entered = (code ?? otp).trim();
    setError(null);
    setNote(null);
    if (entered.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    try {
      setLoading(true);
      const data = await login(mobile, { otp: entered });

      // Block SUPER_ADMIN in the mobile shop app — they belong in the admin web.
      // login() already persisted the session, so clear it here; otherwise the
      // blocked token survives to the next cold start and routes into the app.
      if (data?.loginType === 'SUPER_ADMIN') {
        await clearSession();
        setOtp('');
        setError('Super-admin accounts must sign in from the admin web app.');
        return;
      }
      onLogin(data);
    } catch (e) {
      setError(describeError(e, 'Authentication failed'));
      // Wrong code → wipe the boxes and re-focus so the retry is one action.
      // A network/server failure keeps the digits: they were probably right and
      // re-typing six of them to retry a dropped request is pure friction.
      if (e?.status === 401) {
        setOtp('');
        otpRef.current?.focus();
      }
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  };

  const onOtpChange = (v) => {
    const digits = v.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
    if (digits.length === OTP_LENGTH) verify(digits);
  };

  const backToMobile = () => {
    setStep('MOBILE');
    setOtp('');
    setError(null);
    setNote(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + rs(24), paddingBottom: insets.bottom + rs(28) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 'MOBILE' ? (
          <MobileStep
            mobile={mobile}
            setMobile={setMobile}
            loading={loading}
            error={error}
            onSubmit={sendOtp}
            onCreateAccount={() => navigation?.navigate('CreateAccount')}
          />
        ) : (
          <OtpStep
            mobile={mobile}
            otp={otp}
            otpRef={otpRef}
            onOtpChange={onOtpChange}
            onSubmit={() => verify()}
            onBack={backToMobile}
            onResend={() => sendOtp({ resend: true })}
            seconds={seconds}
            loading={loading}
            error={error}
            note={note}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ step 1 */

function MobileStep({ mobile, setMobile, loading, error, onSubmit, onCreateAccount }) {
  return (
    <View>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="cover" />

      <Text style={styles.h1}>Login with{'\n'}mobile number</Text>
      <Text style={styles.sub}>Welcome to your shop dashboard !</Text>

      <View style={styles.inputRow}>
        <View style={styles.dialCard}>
          <IndiaFlag />
          <Text style={styles.dialText}>{DIAL_CODE}</Text>
        </View>
        <View style={styles.numberCard}>
          <TextInput
            value={mobile}
            onChangeText={(v) => setMobile(v.replace(/[^0-9]/g, '').slice(0, MOBILE_DIGITS))}
            placeholder="9876543210"
            placeholderTextColor={SUBTLE}
            keyboardType="number-pad"
            maxLength={MOBILE_DIGITS}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            style={styles.numberInput}
          />
        </View>
      </View>

      <ErrorBox msg={error} />

      <PrimaryButton label="LOGIN" loading={loading} onPress={onSubmit} />

      <View style={styles.signupRow}>
        <Text style={styles.signupMuted}>New to GGFix? </Text>
        <Pressable onPress={onCreateAccount} hitSlop={8}>
          <Text style={styles.signupLink}>Create account</Text>
        </Pressable>
      </View>

      <Text style={styles.footnote}>
        GGFix Shop — for shop owners and in-shop technicians.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ step 2 */

function OtpStep({
  mobile, otp, otpRef, onOtpChange, onSubmit, onBack, onResend, seconds, loading, error, note,
}) {
  const boxes = Array.from({ length: OTP_LENGTH });
  const canResend = seconds <= 0 && !loading;

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
        <ArrowLeft size={rs(20)} color={TEXT} />
      </Pressable>

      <Text style={styles.h1Center}>Verify Phone</Text>
      <Text style={styles.subCenter}>Code is sent to {DIAL_CODE} {mobile}</Text>

      {/* The visible boxes are display-only; one transparent input sits on top
          of the whole row so backspace, paste and SMS autofill all behave like
          a normal single field instead of six that fight over focus. */}
      <Pressable onPress={() => otpRef.current?.focus()} style={styles.otpRow}>
        {boxes.map((_, i) => {
          const char = otp[i] || '';
          const active = otp.length === i;
          return (
            <View key={i} style={[styles.otpBox, active && styles.otpBoxActive]}>
              <Text style={char ? styles.otpChar : styles.otpCharEmpty}>{char || '0'}</Text>
            </View>
          );
        })}
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
          style={styles.otpHiddenInput}
        />
      </Pressable>

      {__DEV__ ? (
        // Dev-only hint. Advertising the default OTP in production hands
        // attackers the second half of a credential (mobile + a guessable
        // static OTP = account takeover).
        <Text style={styles.devHint}>Default dev OTP: 123456.</Text>
      ) : null}

      {note ? <Text style={styles.note}>{note}</Text> : null}
      <ErrorBox msg={error} />

      <PrimaryButton label="VERIFY" loading={loading} onPress={onSubmit} />

      <View style={styles.resendRow}>
        <Text style={styles.resendMuted}>Not yet code? </Text>
        <Pressable onPress={onResend} disabled={!canResend} hitSlop={8}>
          <Text style={[styles.resendLink, !canResend && styles.resendLinkOff]}>
            {seconds > 0 ? `Resend in ${seconds}s` : 'Resend Now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- parts */

function PrimaryButton({ label, loading, onPress }) {
  return (
    <Button
      onPress={onPress}
      loading={loading}
      fullWidth
      elevated={false}
      // twMerge drops Button's own `rounded-2xl`/`py-3.5`/`bg-primary` in favour
      // of these, so the CTA keeps the design's squarer 10px corners at a fixed
      // 56px height and the sage fill instead of the app's #087A0A green.
      // The hex must stay literal here — Tailwind's JIT only compiles arbitrary
      // values it can see as source text, so a constant would emit no class.
      className="rounded-[10px] py-0 bg-[#004C40]"
      style={styles.cta}
    >
      <View style={styles.ctaInner}>
        <Text style={styles.ctaText}>{label}</Text>
        <ArrowRight size={rs(18)} color="#FFFFFF" strokeWidth={2.5} />
      </View>
    </Button>
  );
}

/**
 * Drawn rather than the 🇮🇳 emoji: regional-indicator flags fall back to two
 * boxed letters on some Android builds, which reads as a rendering bug.
 */
function IndiaFlag() {
  return (
    <View style={styles.flag}>
      <View style={[styles.flagStripe, { backgroundColor: '#FF9933' }]} />
      <View style={[styles.flagStripe, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.chakra} />
      </View>
      <View style={[styles.flagStripe, { backgroundColor: '#138808' }]} />
    </View>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  );
}

const cardSurface = {
  borderRadius: rs(12),
  borderWidth: 1,
  borderColor: BORDER,
  backgroundColor: tokens.card,
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: rs(24) },

  logo: {
    height: rs(100),
    width: rs(100),
    borderRadius: LOGO_RADIUS,
    marginBottom: rs(22),
    alignSelf: 'center',
  },

  h1: { fontSize: rf(28), lineHeight: rlh(36), fontWeight: '800', color: TEXT, letterSpacing: -0.4 },
  h1Center: { fontSize: rf(26), lineHeight: rlh(32), fontWeight: '800', color: TEXT, textAlign: 'center' },
  sub: { fontSize: rf(13.5), lineHeight: rlh(20), color: MUTED, marginTop: rs(8) },
  subCenter: { fontSize: rf(13.5), lineHeight: rlh(20), color: MUTED, textAlign: 'center', marginTop: rs(8) },

  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(28) },
  dialCard: {
    ...cardSurface,
    flexDirection: 'row',
    alignItems: 'center',
    height: rs(54),
    paddingHorizontal: rs(12),
    marginRight: rs(10),
  },
  dialText: { fontSize: rf(15), fontWeight: '700', color: TEXT, marginLeft: rs(7) },
  numberCard: {
    ...cardSurface,
    flex: 1,
    height: rs(54),
    justifyContent: 'center',
    paddingHorizontal: rs(14),
  },
  numberInput: { fontSize: rf(15.5), fontWeight: '600', color: TEXT, padding: 0 },

  flag: { height: rs(16), width: rs(22), borderRadius: rs(3), overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  flagStripe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chakra: { height: rs(4), width: rs(4), borderRadius: rs(2), backgroundColor: '#000080' },

  backBtn: { alignSelf: 'flex-start', height: rs(36), width: rs(36), alignItems: 'center', justifyContent: 'center', marginBottom: rs(8), marginLeft: -rs(8) },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: rs(26) },
  otpBox: {
    ...cardSurface,
    flex: 1,
    height: rs(56),
    marginHorizontal: rs(4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: GREEN, borderWidth: 1.5 },
  otpChar: { fontSize: rf(20), fontWeight: '700', color: TEXT },
  otpCharEmpty: { fontSize: rf(20), fontWeight: '700', color: tokens.borderStrong },
  otpHiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },

  devHint: { fontSize: rf(11), color: MUTED, marginTop: rs(10), textAlign: 'center' },
  note: { fontSize: rf(12.5), color: GREEN, marginTop: rs(10), textAlign: 'center' },

  cta: { height: rs(56), borderRadius: rs(10), marginTop: rs(26), paddingVertical: 0 },
  ctaInner: { flexDirection: 'row', alignItems: 'center' },
  // White, because the CTA fill is dark again (#004C40, luminance 0.055):
  // white on it is 10:1, the dark text token only 1.7:1. This flips with the
  // fill — it was briefly dark while the fill was the light #64FF43.
  ctaText: { color: '#FFFFFF', fontSize: rf(14.5), fontWeight: '500', letterSpacing: 1.6, marginRight: rs(10) },

  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: rs(30) },
  resendMuted: { fontSize: rf(12.5), color: MUTED },
  // Amber on the page wash is 2.4:1 — fine as a 12.5px bold link beside its
  // muted label, but the DARK amber is what keeps it legible, so use that.
  resendLink: { fontSize: rf(12.5), fontWeight: '700', color: tokens.attentionDark },
  resendLinkOff: { color: MUTED, fontWeight: '600' },

  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: rs(24) },
  signupMuted: { fontSize: rf(13), color: MUTED },
  signupLink: { fontSize: rf(13), fontWeight: '800', color: GREEN },

  footnote: { fontSize: rf(11), lineHeight: rlh(16), color: MUTED, textAlign: 'center', marginTop: rs(18) },

  errorBox: {
    marginTop: rs(14),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
    backgroundColor: 'rgba(220,38,38,0.08)',
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
  },
  errorText: { fontSize: rf(12), lineHeight: rlh(17), color: DANGER },
});
