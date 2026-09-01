import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { isAppLockEnabled, isDeviceSecure, authenticate } from '../auth/appLock';

// Wraps the authenticated app. When App Lock is on, requires the OS unlock
// (fingerprint / pattern / PIN) on cold start and every time the app returns
// to the foreground. Fails OPEN if lock is disabled / the device isn't secure.
export default function AppLockGate({ children, onLogout }) {
  const [enabled, setEnabled] = useState(null); // null = still checking
  const [locked, setLocked] = useState(true);
  const [checking, setChecking] = useState(false);
  const appState = useRef(AppState.currentState);

  const runUnlock = useCallback(async () => {
    setChecking(true);
    const ok = await authenticate();
    setChecking(false);
    if (ok) setLocked(false);
  }, []);

  // Initial: if lock is off (or device not secure) → unlock immediately.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = await isAppLockEnabled();
      // Fail OPEN when the device is no longer secure. If the user enabled App
      // Lock while secure and later removed their PIN/biometric, authenticate()
      // can never succeed — without this they'd be trapped behind a lock they
      // can't satisfy (only escape = log out).
      const secure = on ? await isDeviceSecure() : false;
      if (cancelled) return;
      const effective = on && secure;
      setEnabled(effective);
      if (!effective) { setLocked(false); return; }
      setLocked(true);
      runUnlock();
    })();
    return () => { cancelled = true; };
  }, [runUnlock]);

  // Re-lock when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (enabled && /inactive|background/.test(prev) && next === 'active') {
        setLocked(true);
        runUnlock();
      }
    });
    return () => sub.remove();
  }, [enabled, runUnlock]);

  if (enabled === null) return null;         // brief boot check

  // Overlay the lock on top of a STILL-MOUNTED app instead of returning a
  // different tree. The old `return children` vs `return <Lock/>` swap unmounted
  // the entire navigator on every foreground, wiping navigation state and any
  // in-progress booking/KYC form. Keeping `children` mounted preserves them; the
  // opaque, full-screen, high-elevation overlay hides content and absorbs taps.
  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && locked ? (
        <View
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#087A0A', alignItems: 'center', justifyContent: 'center',
            padding: 24, zIndex: 9999, elevation: 9999,
          }}
        >
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 88, height: 88, borderRadius: 20, marginBottom: 18 }}
            resizeMode="contain"
          />
          <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Lock size={20} color="#FFFFFF" />
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>App Locked</Text>
          <Text style={{ color: '#E6F7E3', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
            Unlock with your fingerprint, pattern or PIN to continue.
          </Text>
          <Pressable
            onPress={runUnlock}
            disabled={checking}
            style={{ marginTop: 22, backgroundColor: '#087A0A', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 14, opacity: checking ? 0.6 : 1, minWidth: 150, alignItems: 'center' }}
          >
            {checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Unlock</Text>}
          </Pressable>
          <Pressable onPress={onLogout} style={{ marginTop: 16 }}>
            <Text style={{ color: '#C8EEBF', fontSize: 13, fontWeight: '700' }}>Log out instead</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
