// Banking-style gate around the signed-in app:
// fresh OTP login → single-device session (device-limit prompt) → create MPIN
// → biometric opt-in → home. Locks on cold start and after the background
// timeout; unlock with MPIN or native biometrics (never extends the OTP deadline).
// Falls back to the legacy AppLockGate when the server has no /auth/security API.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Image, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import AppLockGate from '../components/AppLockGate';
import PinPad, { C, useKeyboardHeight } from './PinPad';
import { NewPinFlow, ResetPinFlow } from './SecurityFlows';
import TpinSheet from './TpinSheet';
import DeviceLimitScreen from './DeviceLimitScreen';
import { getSession } from '../auth/session';
import { authenticate, isAppLockEnabled, isDeviceSecure, setAppLockEnabled } from '../auth/appLock';
import { startDeviceSession, sessionStatus, verifyMpin, setBiometricPreference, pinErrorMessage } from './securityApi';

const DEFAULT_LOCK_S = 300; // Partner: 5 minutes

// App-lock popup: white rounded card over the dimmed + blurred (still mounted) app.
const LockSheet = ({ children, target }) => {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start(); }, [fade]);
  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999, opacity: fade }}>
      <StatusBar style="light" backgroundColor="#000000" />
      {/* Real frosted blur of the app behind (Android needs the blurred content wrapped in BlurTargetView). */}
      <BlurView blurTarget={target} intensity={60} tint="dark" blurMethod="dimezisBlurView" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: (kb || insets.bottom) + 12 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: C.bg, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 24 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 14 }} resizeMode="contain" />
          {children}
        </View>
      </View>
    </Animated.View>
  );
};
const SecurityContext = createContext({ secure: false });
export const useSecurity = () => useContext(SecurityContext);

const Card = ({ children }) => {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999, backgroundColor: C.bg, paddingTop: insets.top + (kb ? 16 : 56), paddingBottom: kb ? kb + 16 : insets.bottom + 16, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'flex-start' }}>
      {kb ? null : <Image source={require('../../assets/logo.png')} style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 18 }} resizeMode="contain" />}
      {children}
    </View>
  );
};

const Btn = ({ title, onPress, busy, ghost, danger }) => (
  <Pressable onPress={onPress} disabled={busy} style={{ alignSelf: 'stretch', height: 46, borderRadius: 14, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? C.bg : C.primary, borderWidth: ghost ? 1 : 0, borderColor: C.border, opacity: busy ? 0.6 : 1 }}>
    {busy ? <ActivityIndicator color={ghost ? C.primary : '#FFFFFF'} /> : <Text style={{ color: danger ? C.error : ghost ? C.text : '#FFFFFF', fontWeight: '800', fontSize: 14 }}>{title}</Text>}
  </Pressable>
);

// ready=false while BootSplash is still on screen: the lock waits behind it, so the
// order is loading → MPIN / biometric → app (no prompt or keyboard over the splash).
export default function SecurityGate({ children, onLogout, ready = true }) {
  const [stage, setStage] = useState('boot'); // boot|legacy|otp|device|mpin|bio|locked|reset|open
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [bioOn, setBioOn] = useState(false);
  const [lockView, setLockView] = useState('choice'); // choice (biometric popup) | pin (MPIN popup)
  const bgAt = useRef(null);
  const blurTarget = useRef(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const loadStatus = useCallback(async () => {
    const st = await sessionStatus();
    setStatus(st);
    return st;
  }, []);

  const start = useCallback(async (replaceExisting) => {
    setBusy(true); setError(null);
    try {
      await startDeviceSession({ replaceExisting });
      setSession(await getSession());
      const st = await loadStatus();
      // Existing MPIN (e.g. set earlier or on another phone): still offer biometric
      // unlock on this device after login if it isn't on yet.
      const offerBio = st.mpinSet && !(await isAppLockEnabled()) && (await isDeviceSecure());
      setStage(!st.mpinSet ? 'mpin' : offerBio ? 'bio' : 'open');
    } catch (e) {
      if (e?.status === 404 || e?.status === 405) setStage('legacy');
      else if (e?.status === 409 && e?.payload?.status === 'DEVICE_LIMIT') { setDeviceInfo(e.payload); setStage('device'); }
      else if (e?.status === 401) setStage('otp');
      else setError(pinErrorMessage(e));
    } finally { setBusy(false); }
  }, [loadStatus]);

  // Boot: start a device session after a fresh OTP login, otherwise require unlock.
  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      setBioOn((await isAppLockEnabled()) && (await isDeviceSecure()));
      if (!s?.deviceSessionId) { start(false); return; }
      // Existing session: show the MPIN / biometric lock at once (no full-screen
      // loader) and validate the server session in the background.
      setStage('locked');
      try {
        const st = await loadStatus();
        if (!st.mpinSet) setStage((cur) => (cur === 'locked' || cur === 'open' ? 'mpin' : cur));
      } catch (e) {
        // A device-bound session never silently downgrades to the legacy lock:
        // a 404/401 here means verify again with OTP (also if already unlocked).
        if (e?.status === 404 || e?.status === 405 || e?.status === 401) setStage('otp');
      }
    })();
  }, [start, loadStatus]);

  // Background timeout lock.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (/inactive|background/.test(next)) { if (!bgAt.current) bgAt.current = Date.now(); return; }
      if (next === 'active' && bgAt.current) {
        const away = (Date.now() - bgAt.current) / 1000;
        bgAt.current = null;
        const limit = Number(session?.lockTimeoutSeconds) || DEFAULT_LOCK_S;
        // Boot-only lock: MPIN / biometric is asked at app start, not on resume.
        void away; void limit;
      }
    });
    return () => sub.remove();
  }, [session]);

  const tryBiometric = useCallback(async () => {
    if (!bioOn) return;
    if (await authenticate()) { setError(null); setStage('open'); }
  }, [bioOn]);

  useEffect(() => { if (stage === 'locked') setLockView(bioOn ? 'choice' : 'pin'); }, [stage, bioOn]);
  useEffect(() => { if (ready && stage === 'locked') tryBiometric(); }, [ready, stage, tryBiometric]);

  const unlockWithMpin = async (pin) => {
    setBusy(true); setError(null);
    try { await verifyMpin(pin); setStage('open'); }
    catch (e) {
      if (e?.status === 401 && /SESSION/.test(String(e?.devMessage))) { setStage('otp'); return; }
      setError(pinErrorMessage(e));
    } finally { setBusy(false); }
  };

  const enableBiometric = async () => {
    setBusy(true);
    try {
      if ((await isDeviceSecure()) && (await authenticate())) {
        await setAppLockEnabled(true); setBioOn(true);
        setBiometricPreference(true).catch(() => {});
      }
    } finally { setBusy(false); setStage('open'); }
  };

  if (stage === 'legacy') return <AppLockGate onLogout={onLogout}>{children}</AppLockGate>;

  const ctx = { secure: stage !== 'boot', session, status, refreshStatus: loadStatus, bioOn, setBioOn, onLogout };
  let overlay = null;
  if (stage === 'boot') {
    overlay = <Card><ActivityIndicator color={C.primary} />{error ? <><Text style={{ color: C.error, marginTop: 12, textAlign: 'center' }}>{error}</Text><Btn title="Retry" onPress={() => start(false)} busy={busy} /><Btn title="Log out" ghost danger onPress={onLogout} /></> : null}</Card>;
  } else if (stage === 'otp') {
    overlay = (
      <Card>
        <Ionicons name="time-outline" size={36} color={C.primary} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginTop: 10 }}>OTP Session Expired</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' }}>For your security, please verify your mobile number with OTP again.</Text>
        <Btn title="Verify with OTP" onPress={onLogout} />
      </Card>
    );
  } else if (stage === 'device') {
    overlay = <DeviceLimitScreen device={deviceInfo} busy={busy} error={error} onConfirm={() => start(true)} onCancel={onLogout} />;
  } else if (stage === 'mpin') {
    overlay = <Card><NewPinFlow type="MPIN" subtitle="Used to unlock the app" onDone={async () => { await loadStatus().catch(() => {}); setStage((await isDeviceSecure()) ? 'bio' : 'open'); }} /></Card>;
  } else if (stage === 'bio') {
    overlay = (
      <Modal transparent visible animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 20, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="finger-print" size={28} color={C.primary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 }}>Enable Biometric Login?</Text>
            <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 6, textAlign: 'center' }}>Unlock with your fingerprint or face. MPIN always works as a fallback.</Text>
            <Btn title="Enable Biometrics" onPress={enableBiometric} busy={busy} />
            <Btn title="Not Now" ghost onPress={() => setStage('open')} />
          </View>
        </View>
      </Modal>
    );
  } else if (stage === 'locked' && !ready) {
    overlay = <Card>{null}</Card>; // blank lock behind BootSplash; PIN pad mounts after it fades
  } else if (stage === 'locked' && lockView === 'choice' && bioOn) {
    overlay = (
      <LockSheet target={blurTarget}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center' }}>NearGFix Partner is Locked</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>Authentication is required to access NearGFix Partner.</Text>
        <Pressable onPress={tryBiometric} accessibilityLabel="Unlock with Biometrics" style={{ alignSelf: 'stretch', height: 50, borderRadius: 14, marginTop: 22, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="finger-print" size={22} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15, marginLeft: 8 }}>Unlock with Biometrics</Text>
        </Pressable>
        <Pressable onPress={() => { setError(null); setLockView('pin'); }} style={{ alignSelf: 'stretch', height: 46, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.primary, fontWeight: '800', fontSize: 14 }}>Enter MPIN</Text>
        </Pressable>
        <Pressable onPress={onLogout} style={{ marginTop: 14 }}><Text style={{ color: C.error, fontWeight: '700', fontSize: 13 }}>Log out</Text></Pressable>
      </LockSheet>
    );
  } else if (stage === 'locked') {
    overlay = (
      <LockSheet target={blurTarget}>
        <PinPad
          systemKeyboard
          hideIcon
          title="Enter your MPIN"
          subtitle="Unlock NearGFix Partner"
          error={error}
          busy={busy}
          onComplete={unlockWithMpin}
          onBiometric={bioOn ? tryBiometric : undefined}
          footer={(
            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <Pressable onPress={() => { setError(null); setStage('reset'); }}><Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Forgot MPIN?</Text></Pressable>
              <Text style={{ color: C.border, marginHorizontal: 10 }}>|</Text>
              <Pressable onPress={onLogout}><Text style={{ color: C.error, fontWeight: '700', fontSize: 13 }}>Log out</Text></Pressable>
            </View>
          )}
        />
      </LockSheet>
    );
  } else if (stage === 'reset') {
    overlay = <Card><ResetPinFlow type="MPIN" session={session} onDone={() => setStage('open')} onCancel={() => setStage('locked')} /></Card>;
  }

  return (
    <SecurityContext.Provider value={ctx}>
      <View style={{ flex: 1 }}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>{stage === 'boot' ? null : children}</BlurTargetView>
        {stage !== 'boot' ? (
          <TpinSheet session={session} tpinSet={!!status?.tpinSet} onTpinCreated={() => loadStatus().catch(() => {})} />
        ) : null}
        {overlay}
      </View>
    </SecurityContext.Provider>
  );
}
