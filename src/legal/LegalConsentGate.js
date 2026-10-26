import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../components/PageHeader';
import LegalAgreement from './LegalAgreement';
import LegalDocumentView from './LegalDocumentView';
import { LEGAL_DOCS, LEGAL_DOC_TYPES } from './legalContent';
import { acceptCurrentLegal, ensureLegalAcceptance } from './legalConsent';

const GREEN = '#035C6C';

/**
 * Wraps the signed-in app. If the account hasn't accepted the current Terms /
 * Privacy versions (first sign-in without the login checkbox, or a policy
 * update), a full-screen prompt blocks the app until they accept or log out.
 * The app stays mounted underneath, so accepting returns the user in place.
 * It's an in-tree overlay (not a Modal) so App Lock and the boot splash, which
 * render above their children, still cover it.
 */
export default function LegalConsentGate({ accountId, onLogout, children }) {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let alive = true;
    setRequired(false);
    ensureLegalAcceptance(accountId).then((ok) => {
      if (alive && !ok) setRequired(true);
    });
    return () => { alive = false; };
  }, [accountId]);

  return (
    <View style={styles.fill}>
      {children}
      {required ? (
        <View style={styles.overlay}>
          <ConsentPrompt accountId={accountId} onAccepted={() => setRequired(false)} onLogout={onLogout} />
        </View>
      ) : null}
    </View>
  );
}

function ConsentPrompt({ accountId, onAccepted, onLogout }) {
  const insets = useSafeAreaInsets();
  const [viewing, setViewing] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Android back must not reach the navigator underneath.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewing) setViewing(null);
      return true;
    });
    return () => sub.remove();
  }, [viewing]);

  if (viewing) {
    const doc = LEGAL_DOCS[viewing];
    return (
      <View style={styles.fill}>
        <PageHeader title={doc.screenTitle} onBack={() => setViewing(null)} />
        <LegalDocumentView key={viewing} doc={doc} onOpenDoc={setViewing} />
      </View>
    );
  }

  const accept = async () => {
    if (!checked) {
      setError('Please tick the box to continue.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await acceptCurrentLegal(accountId);
      onAccepted();
    } catch (e) {
      setError(e?.status ? (e.message || 'Could not save your acceptance.') : "Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const docLink = (type, icon) => (
    <Pressable
      onPress={() => setViewing(type)}
      accessibilityRole="button"
      style={styles.docRow}
      android_ripple={{ color: '#E3E5E8' }}
    >
      <Ionicons name={icon} size={20} color={GREEN} />
      <Text style={styles.docRowText}>{LEGAL_DOCS[type].screenTitle}</Text>
      <Ionicons name="chevron-forward" size={18} color="#9AA0A6" />
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.center, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.card}>
        <View style={styles.badge}>
          <Ionicons name="document-text-outline" size={30} color={GREEN} />
        </View>
        <Text style={styles.title}>Terms & Privacy Policy</Text>
        <Text style={styles.body}>
          Please review and accept the Near G Fix Terms & Conditions and Privacy Policy (last updated{' '}
          {LEGAL_DOCS[LEGAL_DOC_TYPES.TERMS].lastUpdated}) to continue.
        </Text>

        {docLink(LEGAL_DOC_TYPES.TERMS, 'reader-outline')}
        {docLink(LEGAL_DOC_TYPES.PRIVACY, 'shield-checkmark-outline')}

        <LegalAgreement
          checked={checked}
          onChange={(v) => { setChecked(v); setError(''); }}
          onOpen={setViewing}
          color={GREEN}
          style={styles.agree}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={accept}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.cta, (!checked || busy) && styles.ctaDim]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>Accept & Continue</Text>}
        </Pressable>
        <Pressable onPress={onLogout} hitSlop={8} accessibilityRole="button" style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000, backgroundColor: '#FFFFFF' },
  center: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E5F3F5',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111111', textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: '#4A4F55', textAlign: 'center', marginBottom: 20 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F3F5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  docRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111111', marginLeft: 12 },
  agree: { marginTop: 10 },
  error: { color: '#D93025', fontSize: 13, marginTop: 10 },
  cta: {
    backgroundColor: GREEN,
    borderRadius: 26,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  ctaDim: { opacity: 0.55 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  logout: { alignSelf: 'center', marginTop: 16, padding: 6 },
  logoutText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
});
