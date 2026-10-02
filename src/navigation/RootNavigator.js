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
import TechnicianNavigator from './TechnicianNavigator';
import AppLockGate from '../components/AppLockGate';
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

// Decide which app shell a session may enter. The shop app only serves shop
// OWNERS (multi-shop or single-shop login) and in-shop TECHNICIANS. Every other
// role — STAFF, PICKUP_PERSON (they use the Employee app), SUPER_ADMIN (admin
// web), or an unrecognized/empty role — must be blocked, NOT silently dropped
// into the full owner UI (which would expose payroll, staff data, etc.).
// Note: the backend collapses TECHNICIAN/STAFF/PICKUP_PERSON into
// loginType=EMPLOYEE, so technicians are routed on the raw `roles` value.
function getRoleFromSession(session) {
  const roles = session?.roles || [];
  const loginType = session?.loginType;
  if (roles.includes('SHOP_OWNER') || loginType === 'SHOP_OWNER' || loginType === 'SHOP_LOGIN') return 'SHOP_OWNER';
  if (roles.includes('TECHNICIAN')) return 'TECHNICIAN';
  return null;
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
        This account can&apos;t be used in the GGFIX Partner app. Staff and pickup
        accounts should sign in from the GGFix Employee app, and admin accounts
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

  const handleLogin = (newSession) => {
    setSessionState(newSession);
    dispatch(setSession(newSession));
  };
  const handleLogout = async () => {
    try { await logout(); } catch (_) {}
    await clearSession();
    setSessionState(null);
    dispatch(clearAuth());
  };

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
        <Stack.Screen name="Intro" options={{ contentStyle: { backgroundColor: '#FFFFFF' } }}>
          {(props) => <IntroScreen {...props} onDone={markIntroSeen} />}
        </Stack.Screen>
        {/* Login sits on pure white, not the app's #F7FAF7 wash — override the
            navigator card too so the wash can't flash behind it mid-transition
            or on an overscroll bounce. */}
        <Stack.Screen name="Login" options={{ contentStyle: { backgroundColor: '#FFFFFF' } }}>
          {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
        </Stack.Screen>
        <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ForgotPasswordOtp" component={ForgotPasswordOtpScreen} />
        <Stack.Screen name="ResetPassword">
          {(props) => <ResetPasswordScreen {...props} onLogin={handleLogin} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  } else {
    const role = getRoleFromSession(session);
    let roleContent;
    if (role === 'TECHNICIAN') {
      roleContent = <TechnicianNavigator session={session} onLogout={handleLogout} />;
    } else if (role === 'SHOP_OWNER') {
      roleContent = <OwnerNavigator session={session} onLogout={handleLogout} />;
    } else {
      roleContent = <UnsupportedRoleScreen onLogout={handleLogout} />;
    }
    mainContent = <AppLockGate onLogout={handleLogout}>{roleContent}</AppLockGate>;
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
