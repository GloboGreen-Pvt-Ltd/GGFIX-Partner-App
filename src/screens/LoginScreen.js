import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Android needs this flag before LayoutAnimation does anything (iOS supports
// it out of the box). Guarded — the API was removed on Android's New
// Architecture, where it's already enabled unconditionally.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Image as ExpoImage } from 'expo-image';
import { ArrowLeft, ArrowRight, Headset, MessageSquare, ShieldCheck, Smartphone, Users } from 'lucide-react-native';
import { login, requestOtp, requestShopLoginOtp } from '../api/auth';
import { clearSession } from '../auth/session';
import { AUTH_BASE } from '../api/config';
import { Button } from '../components/rnr';
import { tokens } from '../theme/colors';
import { rf, rlh, rs } from '../utils/responsive';
import { resetOnboardingForTesting } from '../auth/onboarding';

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
const MOBILE_DIGITS = 10;

const GREEN = tokens.primary;
const TEXT = tokens.text;
const MUTED = tokens.textMuted;
const SUBTLE = tokens.textSubtle;
const BORDER = tokens.border;
const DANGER = tokens.danger;

// Screen-specific brand palette (matches the BootSplash/Intro premium
// redesign) — kept local rather than added to the shared theme, same as
// those two screens, since it's a look for this pre-auth trio specifically.
const DARK_GREEN = tokens.primary; // '#004C40' — already the app's primary
const EMERALD = '#009B72';
const MINT = '#E8F8F2';
const MINT_2 = '#F4FCF9';

// Hero illustration between the welcome copy and the mobile-number card.
// Same pattern as BootSplash/IntroScreen's remote art: prefetched to disk at
// module load (before this screen ever mounts) and rendered via expo-image
// for its disk cache, so a cold Login mount doesn't pop the image in late.
const LOGIN_IMAGE_URL = 'https://media.ggfix.in/GGFIX-Partner-App/Login-Image.png';
ExpoImage.prefetch(LOGIN_IMAGE_URL, 'disk').catch(() => {});

export default function LoginScreen({ onLogin, navigation }) {
  useEffect(() => console.log('[LOGIN] Login mounted'), []); // TEMP DEBUG — remove once verified
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLargeTablet = width >= 1024;
  const isShortScreen = height < 760;
  const isLandscape = width > height;
  // Hero column and login card now share one width — per an explicit
  // "don't let the card be narrower than the column above it" requirement
  // (was 540/580, floating narrower than the 640/720 hero column it sat
  // under). OTP's own container keeps its own, separately-tuned cap.
  const contentWidth = isLargeTablet ? 760 : isTablet ? 720 : width;
  const cardWidth = contentWidth;
  const illustrationWidth = isLargeTablet ? 460 : isTablet ? 420 : contentWidth;
  const otpWidth = isLargeTablet ? 560 : isTablet ? 520 : contentWidth;

  const [step, setStep] = useState('MOBILE'); // MOBILE | OTP
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Drives both steps' "normal" vs "compact keyboard" layout below —
  // tracked from the keyboard's discrete show/hide events (not every
  // re-render), so typing a digit never itself shifts the layout; only the
  // keyboard actually opening or closing does.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animateNext = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const onShow = Keyboard.addListener(showEvt, () => { animateNext(); setKeyboardVisible(true); });
    const onHide = Keyboard.addListener(hideEvt, () => { animateNext(); setKeyboardVisible(false); });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);
  const otpRef = useRef(null);
  const scrollRef = useRef(null);
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
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Android now relies on the native `softwareKeyboardLayoutMode:
        // 'resize'` window config (app.config.js) to shrink the root view
        // itself — layering KeyboardAvoidingView's own 'height' behavior on
        // top of that double-compensated and was part of what pushed/cropped
        // the login card. `undefined` here means "let Android's own resize
        // handle it."
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
      <StatusBar barStyle="dark-content" backgroundColor={step === 'MOBILE' ? MINT : '#FFFFFF'} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: keyboardVisible ? rs(16) : rs(24) },
          // The OTP step's content is short relative to a tall screen (esp.
          // iPad) — centering it here (only for that step, via the shared
          // ScrollView's own contentContainerStyle rather than a flexed
          // child — see IntroScreen's note on why a flexed ScrollView child
          // is a touch-target footgun) removes the dead space below it when
          // the keyboard is closed. Gated on `keyboardVisible` (a discrete
          // show/hide event), not just `step` — centering unconditionally
          // while typing fought with the keyboard's own resize animation
          // every frame, which read as the OTP boxes "flying"/jumping while
          // entering digits.
          step === 'OTP' && !keyboardVisible && { justifyContent: 'center' },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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
            insets={insets}
            contentWidth={contentWidth}
            cardWidth={cardWidth}
            illustrationWidth={illustrationWidth}
            isTablet={isTablet}
            keyboardVisible={keyboardVisible}
            isShortScreen={isShortScreen}
            isLandscape={isLandscape}
            scrollRef={scrollRef}
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
            insets={insets}
            contentWidth={otpWidth}
            isTablet={isTablet}
            keyboardVisible={keyboardVisible}
            isShortScreen={isShortScreen}
            isLandscape={isLandscape}
          />
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ step 1 */

function MobileStep({
  mobile, setMobile, loading, error, onSubmit, onCreateAccount, insets, contentWidth, cardWidth, illustrationWidth, isTablet,
  keyboardVisible, isShortScreen, isLandscape, scrollRef,
}) {
  // Two independent knobs, not one: `compact` (keyboard actually open) HIDES
  // the decorative sections outright. `tight` (short device or landscape,
  // keyboard or not) only SHRINKS spacing/illustration size — a short phone
  // at rest still shows the full design, just denser; conflating the two
  // used to permanently strip a short phone's screen down to the compact
  // layout even with the keyboard closed.
  const compact = keyboardVisible;
  const tight = isShortScreen || isLandscape;
  // DEV-ONLY — long-press the wordmark to clear the "onboarding completed"
  // flag and see IntroScreen again on the next app reload. Mirrors the same
  // affordance on IntroScreen's wordmark, so it's reachable from wherever you
  // land — inert in a release build (resetOnboardingForTesting() no-ops when
  // `__DEV__` is false), no visible hint that it exists.
  const handleDevResetLongPress = __DEV__
    ? async () => {
        await resetOnboardingForTesting();
        console.log('[LOGIN][DEV] Onboarding flag cleared — reload the app to see Intro again');
      }
    : undefined;

  // Login-Image.png's real aspect ratio isn't known ahead of time — read it
  // off the actual rendering image (expo-image's onLoad) so the reserved
  // space already matches before the image finishes loading, and it never
  // stretches or crops once it does. Fallback (~2.1:1) only holds the layout
  // for the first frame, on a cold cache, before onLoad fires.
  const [loginImageRatio, setLoginImageRatio] = useState(1 / 2.1);

  // Hero illustration height — spec'd ranges: phone normal 150–190, phone +
  // keyboard 80–110; tight (short/landscape, keyboard closed) sits between
  // the two instead of jumping straight to the compact size.
  const heroImgMaxHeight = compact
    ? (isTablet ? 140 : 95)
    : tight
      ? (isTablet ? 200 : 160)
      : (isTablet ? 280 : 180);
  const hideHeroImage = compact && isShortScreen;

  return (
    <View>
      <View style={[styles.hero, { paddingTop: rs(compact ? 10 : tight ? 14 : 18) }]}>
        <View style={{ width: '100%', maxWidth: contentWidth, alignItems: 'center' }}>
          <Pressable onLongPress={handleDevResetLongPress} disabled={!__DEV__} style={{ alignItems: 'center' }}>
            <Text style={[styles.wordmark, isTablet && { fontSize: rf(22) }]}>
              GG<Text style={{ color: EMERALD }}>FIX</Text>
            </Text>
            {!compact ? (
              <>
                <Text style={styles.wordmarkSub}>PARTNER APP</Text>
                <Text style={styles.tagline}>Repair &nbsp;|&nbsp; Pickup &nbsp;|&nbsp; Buy &nbsp;|&nbsp; Sell</Text>
              </>
            ) : null}
          </Pressable>

          {!compact ? (
            <Image source={require('../../assets/logo.png')} style={[styles.heroLogo, isTablet && { width: rs(76), height: rs(76) }, tight && { width: rs(48), height: rs(48), marginTop: rs(10) }]} resizeMode="contain" />
          ) : null}

          <Text style={[styles.welcome, isTablet && { fontSize: rf(32) }, compact && { fontSize: rf(19), marginTop: rs(8) }]}>Welcome Back</Text>
          <Text style={[styles.welcomeSub, isTablet && { fontSize: rf(15) }]}>Let&apos;s keep your business moving!</Text>
          {!compact ? (
            <Text style={[styles.welcomeDesc, isTablet && { fontSize: rf(15), lineHeight: rlh(21) }, tight && { marginTop: rs(3) }]}>
              All your device service, pickup, buy and sell operations in one place.
            </Text>
          ) : null}

          {!hideHeroImage ? (
            <View style={[styles.loginImageWrap, { maxWidth: illustrationWidth, maxHeight: rs(heroImgMaxHeight), aspectRatio: 1 / loginImageRatio }]}>
              <ExpoImage
                source={LOGIN_IMAGE_URL}
                style={styles.loginImage}
                contentFit="contain"
                cachePolicy="disk"
                onLoad={(e) => {
                  const { width: w, height: h } = e?.source || {};
                  if (w > 0 && h > 0) setLoginImageRatio(h / w);
                }}
              />
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { maxWidth: cardWidth, borderRadius: rs(30) },
          isTablet
            ? { paddingHorizontal: rs(30), paddingTop: rs(26), paddingBottom: rs(26) }
            : { paddingHorizontal: rs(22), paddingTop: rs(compact ? 16 : tight ? 18 : 22), paddingBottom: rs(compact ? 14 : tight ? 18 : 22) },
        ]}
      >
        <Text style={[styles.cardTitle, isTablet && { fontSize: rf(19) }]}>Enter Mobile Number</Text>
        <Text style={[styles.cardDesc, isTablet && { fontSize: rf(14) }]}>
          We&apos;ll send you a secure OTP to sign in or create your partner account.
        </Text>

        <View style={[styles.numberCard, { height: rs(isTablet ? 62 : 58) }]}>
          <Text style={styles.countryCode}>+91</Text>
          <View style={styles.inputDivider} />
          <TextInput
            value={mobile}
            onChangeText={(v) => setMobile(v.replace(/[^0-9]/g, '').slice(0, MOBILE_DIGITS))}
            placeholder="Enter your mobile number"
            placeholderTextColor={SUBTLE}
            // Kept platform-conditional (not the spec's flat "phone-pad") —
            // "phone-pad" and the bare "number-pad" both surfaced a
            // comma/dot row on Android in real-device testing; this is the
            // already-verified fix for that, not a regression.
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            maxLength={MOBILE_DIGITS}
            returnKeyType="done"
            onFocus={() => scrollRef?.current?.scrollTo({ y: 0, animated: true })}
            onSubmitEditing={onSubmit}
            style={styles.numberInput}
          />
        </View>

        <ErrorBox msg={error} />

        <PrimaryButton label="Send OTP" loading={loading} onPress={onSubmit} isTablet={isTablet} style={{ height: rs(isTablet ? 60 : 56) }} />

        <View style={styles.signupRow}>
          <Text style={styles.signupMuted}>New to GGFix? </Text>
          <Pressable onPress={onCreateAccount} hitSlop={8}>
            <Text style={styles.signupLink}>Create account</Text>
          </Pressable>
        </View>
      </View>

      {!compact ? (
        <>
          <View style={[styles.trustRow, { maxWidth: contentWidth, alignSelf: 'center' }, tight && { marginTop: rs(10) }]}>
            <TrustItem icon={<ShieldCheck size={rs(18)} color={EMERALD} strokeWidth={2} />} label={'Trusted\nPlatform'} />
            <TrustItem icon={<Users size={rs(18)} color={EMERALD} strokeWidth={2} />} label={'10K+\nPartners'} />
            <TrustItem icon={<Headset size={rs(18)} color={EMERALD} strokeWidth={2} />} label={'Dedicated\nSupport'} />
          </View>

          <Text style={[styles.footnote, tight && { marginTop: rs(8) }]}>GGFIX Partner — for shop owners and in-shop technicians.</Text>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ step 2 */

function OtpStep({
  mobile, otp, otpRef, onOtpChange, onSubmit, onBack, onResend, seconds, loading, error, note, insets, contentWidth, isTablet,
  keyboardVisible, isShortScreen,
}) {
  const boxes = Array.from({ length: OTP_LENGTH });
  const canResend = seconds <= 0 && !loading;
  // Fixed, bounded box size instead of `flex:1` — on the widened tablet
  // container those used to stretch edge-to-edge into 6 oversized boxes.
  const boxW = isTablet ? rs(59) : rs(49);
  const boxH = isTablet ? rs(63) : rs(54);
  const boxGap = isTablet ? rs(11) : rs(9);
  // Compact mode shrinks/hides only the decorative illustration and footer —
  // "Verify OTP", the phone number, all 6 boxes, the timer, the resend card
  // and the Verify button stay visible no matter what.
  const compact = keyboardVisible;

  return (
    <View style={[styles.otpPage, { maxWidth: contentWidth, alignSelf: 'center', paddingTop: rs(compact ? 6 : 8) }]}>
      <View style={styles.otpHeader}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={rs(20)} color={TEXT} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.otpWordmark}>
            GG<Text style={{ color: EMERALD }}>FIX</Text>
          </Text>
          {!compact ? <Text style={styles.otpWordmarkSub}>For Our Partner</Text> : null}
        </View>
        <View style={{ width: rs(36) }} />
      </View>

      {!(compact && isShortScreen) ? (
        <View style={[styles.otpHeroWrap, compact && { marginTop: rs(10), width: rs(56), height: rs(56) }]}>
          <View style={[styles.otpHeroHalo, compact && { width: rs(56), height: rs(56), borderRadius: rs(28) }]} />
          <Smartphone size={rs(compact ? 20 : 30)} color={DARK_GREEN} strokeWidth={1.6} />
          <View style={[styles.otpHeroBadge, compact && { width: rs(20), height: rs(20), borderRadius: rs(10) }]}>
            <ShieldCheck size={rs(compact ? 11 : 17)} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </View>
      ) : null}

      <Text style={[styles.h1Center, isTablet && { fontSize: rf(26), lineHeight: rlh(32) }, compact && { marginTop: rs(10) }]}>Verify OTP</Text>
      <Text style={[styles.subCenter, isTablet && { fontSize: rf(14.5) }]}>We&apos;ve sent a 6-digit code to</Text>
      <Text style={[styles.mobileBold, isTablet && { fontSize: rf(16.5) }]}>{mobile}</Text>

      {/* The visible boxes are display-only; one transparent input sits on top
          of the whole row so backspace, paste and SMS autofill all behave like
          a normal single field instead of six that fight over focus. */}
      {/* Sized to its own content and centered via `alignSelf`, not stretched
          to the full row width with `justifyContent: 'center'` — the latter
          left an unexplained lopsided gap (more empty space on the right
          than the left) on some devices. Centering a content-sized block is
          unambiguous regardless of screen width. */}
      <Pressable onPress={() => otpRef.current?.focus()} style={[styles.otpRow, { alignSelf: 'center' }]}>
        {boxes.map((_, i) => {
          const char = otp[i] || '';
          const active = otp.length === i;
          return (
            <View
              key={i}
              style={[styles.otpBox, { flex: 0, width: boxW, height: boxH, marginHorizontal: boxGap / 2 }, active && styles.otpBoxActive]}
            >
              <Text style={char ? styles.otpChar : styles.otpCharEmpty}>{char || ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={otpRef}
          value={otp}
          onChangeText={onOtpChange}
          keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
          maxLength={OTP_LENGTH}
          autoFocus
          caretHidden
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={styles.otpHiddenInput}
        />
      </Pressable>

      <Text style={styles.resendTimer}>
        {seconds > 0 ? (
          <>Resend OTP in <Text style={{ color: EMERALD, fontWeight: '700' }}>{`00:${String(seconds).padStart(2, '0')}`}</Text></>
        ) : ' '}
      </Text>

      {note ? <Text style={styles.note}>{note}</Text> : null}
      <ErrorBox msg={error} />

      <View style={styles.resendCard}>
        <View style={styles.resendCardIcon}>
          <MessageSquare size={rs(17)} color={DARK_GREEN} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.resendCardTitle}>Didn&apos;t receive the code?</Text>
          <Text style={styles.resendCardDesc}>Check your SMS or spam folder.</Text>
        </View>
        <Pressable onPress={onResend} disabled={!canResend} hitSlop={8} style={styles.resendPill}>
          <Text style={[styles.resendPillText, !canResend && styles.resendPillTextOff]}>Resend OTP</Text>
        </Pressable>
      </View>

      <PrimaryButton label="Verify" loading={loading} onPress={onSubmit} isTablet={isTablet} style={{ marginTop: rs(22) }} />

      {/* Lowest-priority element — dropped first (only when the keyboard is
          open on an already-short screen) so the Verify button never gets
          pushed below the fold ahead of it. */}
      {!(compact && isShortScreen) ? (
        <View style={styles.secureRow}>
          <ShieldCheck size={rs(13)} color={MUTED} strokeWidth={2} />
          <Text style={styles.secureText}>Your information is secure with GGFIX</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------- parts */

function TrustItem({ icon, label }) {
  return (
    <View style={styles.trustItem}>
      {icon}
      <Text style={styles.trustLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({ label, loading, onPress, isTablet, style }) {
  return (
    <Button
      onPress={onPress}
      loading={loading}
      fullWidth
      elevated={false}
      // twMerge drops Button's own `rounded-2xl`/`py-3.5`/`bg-primary` in favour
      // of these, so the CTA keeps this design's pill shape and the exact
      // brand fill instead of the app's default green.
      // The hex must stay literal here — Tailwind's JIT only compiles arbitrary
      // values it can see as source text, so a constant would emit no class.
      className="rounded-[28px] py-0 bg-[#004C40]"
      style={[styles.cta, isTablet && { height: rs(54) }, style]}
    >
      <View style={styles.ctaInner}>
        <Text style={[styles.ctaText, isTablet && { fontSize: rf(16.5) }]}>{label}</Text>
        <ArrowRight size={rs(isTablet ? 19 : 18)} color="#FFFFFF" strokeWidth={2.5} />
      </View>
    </Button>
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1 },

  /* ---- mobile step ---- */
  hero: {
    backgroundColor: MINT,
    paddingBottom: rs(20),
    paddingHorizontal: rs(24),
    alignItems: 'center',
  },
  wordmark: { fontSize: rf(19), fontWeight: '800', color: DARK_GREEN, letterSpacing: -0.3 },
  wordmarkSub: { marginTop: rs(2), fontSize: rf(9), fontWeight: '700', letterSpacing: 1.8, color: MUTED },
  tagline: { marginTop: rs(6), fontSize: rf(11.5), color: MUTED, fontWeight: '500' },
  heroLogo: { width: rs(64), height: rs(64), marginTop: rs(16) },
  welcome: { marginTop: rs(14), fontSize: rf(24), fontWeight: '800', color: TEXT, textAlign: 'center' },
  welcomeSub: { marginTop: rs(4), fontSize: rf(13), fontWeight: '600', color: EMERALD, textAlign: 'center' },
  welcomeDesc: {
    marginTop: rs(6),
    fontSize: rf(12),
    lineHeight: rlh(17),
    color: MUTED,
    textAlign: 'center',
    paddingHorizontal: rs(12),
  },
  loginImageWrap: {
    width: '100%',
    alignSelf: 'center',
    marginTop: rs(18),
  },
  loginImage: { width: '100%', height: '100%' },

  card: {
    alignSelf: 'center',
    width: '100%',
    marginTop: -rs(24),
    marginHorizontal: rs(20),
    backgroundColor: '#FFFFFF',
    borderRadius: rs(22),
    padding: rs(16),
    shadowColor: '#0B1F14',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardTitle: { fontSize: rf(17), fontWeight: '800', color: TEXT },
  cardDesc: { marginTop: rs(6), fontSize: rf(12), lineHeight: rlh(17), color: MUTED },

  numberCard: {
    marginTop: rs(13),
    height: rs(46),
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(14),
  },
  countryCode: { fontSize: rf(14.5), fontWeight: '700', color: TEXT },
  inputDivider: { width: 1, height: rs(22), backgroundColor: BORDER, marginHorizontal: rs(10) },
  numberInput: { flex: 1, fontSize: rf(14.5), fontWeight: '600', color: TEXT, padding: 0 },

  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: rs(16) },
  signupMuted: { fontSize: rf(12.5), color: MUTED },
  signupLink: { fontSize: rf(12.5), fontWeight: '800', color: EMERALD },

  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: rs(16),
    paddingHorizontal: rs(24),
  },
  trustItem: { alignItems: 'center', gap: rs(5) },
  trustLabel: { fontSize: rf(9.5), fontWeight: '600', color: MUTED, textAlign: 'center', lineHeight: rf(12) },

  footnote: { fontSize: rf(10.5), lineHeight: rlh(15), color: MUTED, textAlign: 'center', marginTop: rs(14), paddingHorizontal: rs(30) },

  /* ---- otp step ---- */
  otpPage: { width: '100%', paddingHorizontal: rs(24) },
  otpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { height: rs(36), width: rs(36), borderRadius: rs(12), backgroundColor: MINT_2, alignItems: 'center', justifyContent: 'center' },
  otpWordmark: { fontSize: rf(17), fontWeight: '800', color: DARK_GREEN },
  otpWordmarkSub: { marginTop: rs(1), fontSize: rf(10.5), color: MUTED, fontWeight: '500' },

  otpHeroWrap: { alignSelf: 'center', marginTop: rs(20), width: rs(88), height: rs(88), alignItems: 'center', justifyContent: 'center' },
  otpHeroHalo: { position: 'absolute', width: rs(88), height: rs(88), borderRadius: rs(44), backgroundColor: MINT },
  otpHeroBadge: {
    position: 'absolute',
    right: rs(2),
    bottom: rs(2),
    width: rs(30),
    height: rs(30),
    borderRadius: rs(15),
    backgroundColor: DARK_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  h1Center: { marginTop: rs(16), fontSize: rf(22), lineHeight: rlh(28), fontWeight: '800', color: TEXT, textAlign: 'center' },
  subCenter: { fontSize: rf(12.5), lineHeight: rlh(18), color: MUTED, textAlign: 'center', marginTop: rs(8) },
  mobileBold: { fontSize: rf(14.5), fontWeight: '700', color: TEXT, textAlign: 'center', marginTop: rs(2) },

  otpRow: { flexDirection: 'row', justifyContent: 'center', marginTop: rs(22) },
  otpBox: {
    borderRadius: rs(13),
    borderWidth: 1.4,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: EMERALD, borderWidth: 2 },
  otpChar: { fontSize: rf(19), fontWeight: '700', color: TEXT },
  otpCharEmpty: { fontSize: rf(19), fontWeight: '700', color: tokens.borderStrong },
  otpHiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },

  resendTimer: { fontSize: rf(12), color: MUTED, textAlign: 'center', marginTop: rs(14) },
  note: { fontSize: rf(12.5), color: GREEN, marginTop: rs(10), textAlign: 'center' },

  resendCard: {
    marginTop: rs(14),
    backgroundColor: MINT_2,
    borderRadius: rs(16),
    padding: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
  },
  resendCardIcon: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(10),
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendCardTitle: { fontSize: rf(12), fontWeight: '700', color: TEXT },
  resendCardDesc: { fontSize: rf(10.5), color: MUTED, marginTop: rs(1) },
  resendPill: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: rs(16), paddingHorizontal: rs(12), paddingVertical: rs(7) },
  resendPillText: { fontSize: rf(10.5), fontWeight: '700', color: TEXT },
  resendPillTextOff: { color: SUBTLE },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), marginTop: rs(16) },
  secureText: { fontSize: rf(10.5), color: MUTED },

  /* ---- shared ---- */
  cta: { height: rs(48), borderRadius: rs(24), marginTop: rs(14), paddingVertical: 0 },
  ctaInner: { flexDirection: 'row', alignItems: 'center' },
  // White, because the CTA fill is dark (#004C40, luminance 0.055): white on
  // it is 10:1, the dark text token only 1.7:1.
  ctaText: { color: '#FFFFFF', fontSize: rf(14.5), fontWeight: '700', letterSpacing: 0.4, marginRight: rs(10) },

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
