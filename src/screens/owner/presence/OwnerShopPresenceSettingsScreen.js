import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { getPresenceSettings, savePresenceSettings } from '../../../api/presence';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, Section, SellScreen, TextField } from '../sell/kit';

// Owner Shop Presence settings, saved per shop on the server (which validates
// the ranges and the owner role; the shop comes from the login, not the app).
const TOGGLES = [
  { key: 'monitoringEnabled', title: 'Shop Presence Monitoring', sub: 'Track exits and returns while employees are checked in. Off: attendance and the shop radius rule work as before.' },
  { key: 'autoFreeze', title: 'Auto App Freeze', sub: 'Pause the Employee App after a confirmed exit. Login and attendance stay active.' },
  { key: 'autoUnlock', title: 'Auto Unlock', sub: 'Unlock by itself when the employee is back inside. Off: they tap Retry Location once inside.' },
  { key: 'recordEvents', title: 'Record Exit / Return', sub: 'Keep the exit, return and duty timeline.' },
  { key: 'dutyExemption', title: 'Authorized Field Duty Exemption', sub: 'No freeze during an active pickup or delivery (checked on the server).' },
];

function Toggle({ title, sub, value, onChange, disabled }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{sub}</Text>
      </View>
      <Switch value={!!value} onValueChange={onChange} disabled={disabled} trackColor={{ true: C.teal }} thumbColor="#FFFFFF" accessibilityLabel={title} />
    </View>
  );
}

export default function OwnerShopPresenceSettingsScreen({ navigation }) {
  const [s, setS] = useState(null);
  const [radius, setRadius] = useState('');
  const [grace, setGrace] = useState('');
  const [alert, setAlert] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const apply = (v) => { setS(v); setRadius(String(v.radiusMeters)); setGrace(String(Math.round(v.graceSeconds / 60 * 10) / 10)); setAlert(String(v.prolongedAlertMinutes || 0)); };
  useEffect(() => { getPresenceSettings().then(apply).catch(setError); }, []);

  const save = async () => {
    const r = Number(radius); const g = Math.round(Number(grace) * 60); const a = Number(alert || 0);
    if (!(r >= 20 && r <= 500)) { setError({ message: 'Shop radius must be between 20 and 500 metres.' }); return; }
    if (!(g >= 30 && g <= 1800)) { setError({ message: 'Exit grace period must be between 0.5 and 30 minutes.' }); return; }
    if (!(a >= 0 && a <= 480)) { setError({ message: 'Prolonged outside alert must be between 0 and 480 minutes.' }); return; }
    setBusy(true);
    try {
      apply(await savePresenceSettings({ ...s, radiusMeters: r, graceSeconds: g, prolongedAlertMinutes: a }));
      setError(null);
      showToast({ type: 'success', title: 'Settings saved', message: 'Employee apps use them on their next location check.' });
      navigation.goBack();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const off = s && !s.monitoringEnabled;
  return (
    <SellScreen title="Presence Settings" subtitle="Shop Presence" onBack={() => navigation.goBack()}
      footer={s ? <PrimaryButton title="Save Settings" onPress={save} loading={busy} disabled={busy} /> : null}>
      {!s && !error ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : null}
      {error ? <ErrorBox message={error.message || 'Could not load settings.'} style={{ marginTop: 12 }} /> : null}
      {s ? (
        <>
          <Section title="Monitoring">
            {TOGGLES.map((t) => (
              <Toggle key={t.key} title={t.title} sub={t.sub} value={s[t.key]} disabled={t.key !== 'monitoringEnabled' && off}
                onChange={(v) => setS((x) => ({ ...x, [t.key]: v }))} />
            ))}
          </Section>
          <Section title="Limits">
            <TextField label="Shop Radius (metres)" value={radius} onChangeText={setRadius} keyboardType="number-pad" hint="20 – 500 m · default 50 m" />
            <TextField label="Exit Grace Period (minutes)" value={grace} onChangeText={setGrace} keyboardType="decimal-pad" hint="0.5 – 30 min · default 2 min" />
            <TextField label="Prolonged Outside Alert (minutes)" value={alert} onChangeText={setAlert} keyboardType="number-pad" hint="0 = off · shown as a setting only, no alerts are sent yet" />
          </Section>
        </>
      ) : null}
    </SellScreen>
  );
}
