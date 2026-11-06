import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, TextField, cleanAmount, money } from '../sell/kit';

// Bottom sheet: the price this shop offers for another shop's listing.
// onSubmit({ amount, note }) may throw; its message is shown in the sheet.

export default function OfferSheet({ visible, listPrice, onClose, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { if (visible) setError(null); }, [visible]);

  const send = async () => {
    const v = Number(amount);
    if (!(v > 0)) { setError({ message: 'Enter an offer above ₹0' }); return; }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ amount: v, note: note.trim() });
      setAmount('');
      setNote('');
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
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: bottom + 16 }}>
              <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>Make an Offer</Text>
              {listPrice != null ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>Listed at {money(listPrice)}</Text> : null}
              <TextField label="Your offer" required prefix="₹" value={amount} onChangeText={(t) => setAmount(cleanAmount(t))} placeholder="Enter amount" keyboardType="decimal-pad" maxLength={9} />
              <TextField label="Message" hint="(Optional)" value={note} onChangeText={setNote} placeholder="e.g. Can pick up today" maxLength={200} />
              {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not send the offer.'} /> : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <PrimaryButton title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                <PrimaryButton title="Send Offer" style={{ flex: 1.4 }} loading={busy} onPress={send} />
              </View>
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}
