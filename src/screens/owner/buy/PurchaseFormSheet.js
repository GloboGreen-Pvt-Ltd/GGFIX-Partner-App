import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, Segmented, TextField, cleanAmount } from '../sell/kit';

// Bottom sheet with a few fields for one purchase step (revise price, record
// payout, cancel). fields: [{ key, label, type: 'amount' | 'text' | 'multiline' |
// 'choice', options, placeholder, hint, required, maxLength, initial }].
// onSubmit(values) may throw; its message is shown in the sheet.

export default function PurchaseFormSheet({ visible, title, sub, fields, submitLabel, danger, onClose, onSubmit }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setValues(Object.fromEntries((fields || []).map((f) => [f.key, f.initial ?? (f.type === 'choice' ? f.options?.[0]?.value : f.type === 'multi' ? [] : '')])));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setValues((cur) => ({ ...cur, [k]: v })); setError(null); };
  const toggle = (k, v) => set(k, (values[k] || []).includes(v) ? values[k].filter((x) => x !== v) : [...(values[k] || []), v]);
  const submit = async () => {
    const missing = (fields || []).find((f) => f.required && (f.type === 'multi' ? !(values[f.key] || []).length : !String(values[f.key] ?? '').trim()));
    if (missing) { setError({ message: `${missing.label} is required` }); return; }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalInsets>
        {({ bottom }) => (
          <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: bottom + 16, maxHeight: '88%' }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
                {sub ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
                {(fields || []).map((f) => (f.type === 'choice' || f.type === 'multi' ? (
                  <View key={f.key} style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text, marginBottom: 8 }}>{f.label}</Text>
                    <Segmented options={f.options} multi={f.type === 'multi'} columns={f.columns} value={values[f.key]} onChange={(v) => (f.type === 'multi' ? toggle(f.key, v) : set(f.key, v))} />
                  </View>
                ) : (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    hint={f.hint}
                    prefix={f.type === 'amount' ? '₹' : undefined}
                    value={values[f.key]}
                    onChangeText={(t) => set(f.key, f.type === 'amount' ? cleanAmount(t) : f.digits ? t.replace(/\D/g, '') : t)}
                    placeholder={typeof f.placeholder === 'function' ? f.placeholder(values) : f.placeholder}
                    keyboardType={f.type === 'amount' ? 'decimal-pad' : f.digits ? 'number-pad' : 'default'}
                    autoCapitalize={f.autoCapitalize || 'sentences'}
                    multiline={f.type === 'multiline'}
                    maxLength={f.maxLength || (f.type === 'amount' ? 9 : 200)}
                  />
                )))}
                {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not save.'} style={{ marginTop: 12 }} /> : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <PrimaryButton title="Close" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                  <PrimaryButton title={submitLabel} variant={danger ? 'dangerSolid' : 'primary'} style={{ flex: 1.4 }} loading={busy} onPress={submit} />
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}
