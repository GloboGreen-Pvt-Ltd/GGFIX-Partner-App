import React, { useState, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getSession, clearSession, setAuthExpiredHandler } from '../auth/session';
import { hasSeenIntro, markIntroSeen } from '../auth/onboarding';
import { logout } from '../api/auth';
import { setSession, clearSession as clearAuth } from '../store/authSlice';
import IntroScreen from '../screens/IntroScreen';
import LoginScreen from '../screens/LoginScreen';
import CreateAccountScreen from '../screens/CreateAccountScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ForgotPasswordOtpScreen from '../screens/ForgotPasswordOtpScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import OwnerNavigator from './OwnerNavigator';
import { isPartnerAccount, PARTNER_ONLY_MESSAGE } from '../auth/accountAccess';
import { notify } from '../components/confirm';
import AppLockGate from '../components/AppLockGate';
import LegalDocumentScreen from '../legal/LegalDocumentScreen';
import LegalConsentGate from '../legal/LegalConsentGate';
import BootSplash from '../components/BootSplash';
import colors from '../theme/colors';
import { since } from '../utils/bootClock'; // TEMP DEBUG — remove with the other [BOOT] logs

const Stack = createNativeStackNavigator();

// BootSplash stays up at least this long even if the session read finishes
// sooner, so the brand moment actually registers instead of flashing by —
// runs in parallel with session loading, never stacked after it. To show the
// splash for 10 seconds instead, change this single value to 10000.
const MIN_BOOT_SPLASH_MS = 5000;
const BOOT_FADE_MS = 220;

// Decide which app shell a session may enter. The shop app serves ONLY the shop
// owner (owner login) and the shop itself (shop-mobile login) — see
// auth/accountAccess.js. Every employee (technician, staff, pickup person —
// they use the Employee app), every admin (admin web) and any unrecognized
// role is refused, never dropped into the owner UI (payroll, staff data, …).
function getRoleFromSession(session) {
  return isPartnerAccount(session) ? 'SHOP_OWNER' : null;
}

// Shown when a signed-in account isn't allowed in the shop app (e.g. a staff /
// pickup-person employee, or a super-admin). Gives a clear message + a way out
// instead of exposing owner-only screens.
function UnsupportedRoleScreen({ onLogout }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
        Account not supported here
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 21 }}>
        This account can&apos;t be used in the Near G Fix Partner app — it is for shop
        owners and shop logins only. Employees (technicians, staff and pickup
        persons) should sign in from the Near G Fix Employee app, and admin accounts
        from the admin web dashboard.
      </Text>
      <Pressable
        onPress={onLogout}
        style={{ marginTop: 26, backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Log out</Text>
      </Pressable>
    </View>
  );
}

export default function RootNavigator() {
  const dispatch = useDispatch();
  const [session, setSessionState] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Whether the pre-login Intro screen has already been shown once — read
  // once, alongside the session, so the unauthenticated stack's
  // initialRouteName is already known correctly the first time it mounts.
  // Starts `null` ("not checked yet"), never `true`/`false` — this value is
  // only ever read below once `sessionLoading` is false, and both flip
  // together in the same state update (Promise.all + one .then()), so the
  // real fetched value is always what initialRouteName sees; `null` here is
  // just so an uninitialized read can never be silently treated as "seen".
  const [introSeen, setIntroSeen] = useState(null);
  const hasLoadedSession = useRef(false);

  useEffect(() => {
    // StrictMode/Fast-Refresh-safe: effects can re-run, this must not
    // re-request the stored session or reset state a second time.
    if (hasLoadedSession.current) return;
    hasLoadedSession.current = true;
    console.log('[BOOT] Session check started @', since()); // TEMP DEBUG — remove once verified
    Promise.all([getSession(), hasSeenIntro()]).then(([s, seenIntro]) => {
      console.log('[BOOT] Session check finished @', since()); // TEMP DEBUG
      console.log('[BOOT] Onboarding state (hasSeenIntro):', seenIntro); // TEMP DEBUG — remove once verified
      setSessionState(s);
      setIntroSeen(seenIntro);
      dispatch(setSession(s));
      setSessionLoading(false);
    });
  }, [dispatch]);

  // When the API client detects an expired/invalid token, drop to Login.
  useEffect(() => {
    setAuthExpiredHandler(() => {
      setSessionState(null);
      dispatch(clearAuth());
    });
    return () => setAuthExpiredHandler(null);
  }, [dispatch]);

  const handleLogout = async () => {
    try { await logout(); } catch (_) {}
    await clearSession();
    setSessionState(null);
    dispatch(clearAuth());
  };
  // Every way in (OTP login, password-reset login) lands here, so the owner /
  // shop-only rule is enforced once for all of them: anything else is signed
  // straight back out with the reason.
  const handleLogin = (newSession) => {
    if (!isPartnerAccount(newSession)) {
      handleLogout();
      notify('Not allowed', PARTNER_ONLY_MESSAGE, { preset: 'error', haptic: 'error', duration: 4 });
      return;
    }
    setSessionState(newSession);
    dispatch(setSession(newSession));
  };

  // A session saved on this device by an account that may not use the app any
  // more (an employee signed in before this rule) is signed out on launch.
  useEffect(() => {
    if (sessionLoading || !session?.accessToken || isPartnerAccount(session)) return;
    handleLogout();
    notify('Signed out', PARTNER_ONLY_MESSAGE, { preset: 'error', haptic: 'error', duration: 4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, session]);

  // Runs once, independently of the session read, so both are genuinely in
  // parallel: BootSplash clears only once BOTH are true, whichever finishes
  // last. Deliberately not reset on logout — only the very first boot should
  // ever show BootSplash; signing out later goes straight to Login.
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[BOOT] Min splash time elapsed @', since()); // TEMP DEBUG — remove once verified
      setMinTimeElapsed(true);
    }, MIN_BOOT_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const [showBootOverlay, setShowBootOverlay] = useState(true);
  const bootFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!sessionLoading && minTimeElapsed && showBootOverlay) {
      console.log('[BOOT] Fade start @', since()); // TEMP DEBUG
      Animated.timing(bootFade, {
        toValue: 0,
        duration: BOOT_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        console.log('[BOOT] Fade done, overlay unmounted @', since()); // TEMP DEBUG
        setShowBootOverlay(false);
      });
    }
  }, [sessionLoading, minTimeElapsed, showBootOverlay, bootFade]);

  const hasLoggedDestination = useRef(false);
  useEffect(() => {
    if (sessionLoading || hasLoggedDestination.current) return;
    hasLoggedDestination.current = true;
    console.log('[BOOT] Destination determined @', since(), '->', session?.accessToken ? 'App' : 'Login'); // TEMP DEBUG — remove once verified
  }, [sessionLoading, session]);

  // `mainContent` stays null until the session read resolves — BootSplash
  // below is the ONLY thing on screen until then. It's declared once, in a
  // single JSX position, and rendered through the same overlay branch below
  // for the whole boot sequence (loading AND post-load) so it is one
  // continuous component instance — never unmounted and remounted into a
  // second element, which would restart its entrance animation mid-hold.
  let mainContent = null;
  if (sessionLoading) {
    // no-op — mainContent stays null; the overlay below is the only thing visible
  } else if (!session?.accessToken) {
    mainContent = (
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={introSeen ? 'Login' : 'Intro'}>
        {/* Intro is always registered so it stays reachable, but only shown
            first when the device hasn't seen it — initialRouteName is read
            once at mount, which is safe here since this Navigator only ever
            mounts after introSeen has already resolved (see above). */}
        <Stack.Screen name="Intro" options={{ contentStyle: { backgroundColor: '#F3F4F6' } }}>
          {(props) => <IntroScreen {...props} onDone={markIntroSeen} />}
        </Stack.Screen>
        {/* Intro and Login paint the brand page colour (#F3F4F6) themselves —
            the navigator card matches it so nothing else can flash behind them
            mid-transition or on an overscroll bounce. */}
        <Stack.Screen name="Login" options={{ contentStyle: { backgroundColor: '#F3F4F6' } }}>
          {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
        </Stack.Screen>
        <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ForgotPasswordOtp" component={ForgotPasswordOtpScreen} />
        <Stack.Screen name="ResetPassword">
          {(props) => <ResetPasswordScreen {...props} onLogin={handleLogin} />}
        </Stack.Screen>
        <Stack.Screen name="Terms" component={LegalDocumentScreen} initialParams={{ type: 'TERMS' }} />
        <Stack.Screen name="PrivacyPolicy" component={LegalDocumentScreen} initialParams={{ type: 'PRIVACY' }} />
      </Stack.Navigator>
    );
  } else {
    const role = getRoleFromSession(session);
    // Not an owner / shop session: the effect above is already signing it out;
    // this screen covers the frame in between (and any failure to clear).
    const roleContent = role === 'SHOP_OWNER'
      ? <OwnerNavigator session={session} onLogout={handleLogout} />
      : <UnsupportedRoleScreen onLogout={handleLogout} />;
    mainContent = (
      <AppLockGate onLogout={handleLogout}>
        <LegalConsentGate accountId={session.userId} onLogout={handleLogout}>{roleContent}</LegalConsentGate>
      </AppLockGate>
    );
  }

  if (!showBootOverlay) {
    return mainContent;
  }

  // While sessionLoading is true, mainContent is still null, so this is the
  // exact same BootSplash element (same JSX position, same component
  // instance) that was already on screen before the session resolved — it
  // is never unmounted/remounted, so its animation never restarts. Once the
  // session resolves, mainContent mounts underneath (and is free to do its
  // own first-load fetching) while BootSplash keeps sitting on top at full
  // opacity until the minimum display time is up, then fades exactly once,
  // revealing a destination that's already ready — one timer, one fade, one
  // navigation.
  return (
    <View style={{ flex: 1 }}>
      {mainContent}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: bootFade }]}
        pointerEvents={minTimeElapsed ? 'none' : 'auto'}
      >
        <BootSplash />
      </Animated.View>
    </View>
  );
}
