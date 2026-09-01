import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useDispatch } from 'react-redux';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getSession, clearSession, setAuthExpiredHandler } from '../auth/session';
import { logout } from '../api/auth';
import { setSession, clearSession as clearAuth } from '../store/authSlice';
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

const Stack = createNativeStackNavigator();

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
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
        Account not supported here
      </Text>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 21 }}>
        This account can&apos;t be used in the GGFIX Shop app. Staff and pickup
        accounts should sign in from the GGFix Employee app, and admin accounts
        from the admin web dashboard.
      </Text>
      <Pressable
        onPress={onLogout}
        style={{ marginTop: 26, backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Log out</Text>
      </Pressable>
    </View>
  );
}

export default function RootNavigator() {
  const dispatch = useDispatch();
  const [session, setSessionState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((s) => {
      setSessionState(s);
      dispatch(setSession(s));
      setLoading(false);
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

  if (loading) {
    return <BootSplash />;
  }

  if (!session?.accessToken) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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
  }

  const role = getRoleFromSession(session);

  let content;
  if (role === 'TECHNICIAN') {
    content = <TechnicianNavigator session={session} onLogout={handleLogout} />;
  } else if (role === 'SHOP_OWNER') {
    content = <OwnerNavigator session={session} onLogout={handleLogout} />;
  } else {
    content = <UnsupportedRoleScreen onLogout={handleLogout} />;
  }

  return <AppLockGate onLogout={handleLogout}>{content}</AppLockGate>;
}
