import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ArrowLeft, Phone, UserRound } from 'lucide-react-native';
import { notify } from '../../components/confirm';
import { rs } from '../../theme/metrics';
import { C, S, SIZE, T, bottomInset, headerStyle } from './ledgerUi';
import {
  PARTY_CUSTOMER,
  createParty,
  isValidPhone,
  normalizePhone,
  partyCopy,
} from '../../api/ledgerParties';

/* ══════════════════════════════════════════════════════════════════════════
   Add Customer / Add Supplier — manually.
   ──────────────────────────────────────────────────────────────────────────
   Reached ONLY from "Add Manually" at the bottom of the contact picker, for a
   party who isn't in the phone book. Picking a contact saves itself and opens
   its statement; it never lands here, so this screen never arrives pre-filled.

   Saving returns to the account LIST rather than opening the new statement. A
   number typed by hand is the one that gets typed wrong, and the list is where
   the owner can see it sitting among the others and check it.
   ══════════════════════════════════════════════════════════════════════════ */

function Field({ icon, value, onChangeText, placeholder, keyboardType, maxLength, autoFocus }) {
  return (
    <View
      className="flex-row items-center"
      style={{
        backgroundColor: C.field,
        borderWidth: 1,
        borderColor: C.hairline,
        borderRadius: SIZE.radius,
        paddingHorizontal: S.md,
        marginBottom: S.xs,
      }}
    >
      {icon}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className="flex-1"
        style={{
          paddingVertical: S.md,
          fontSize: T.input,
          color: C.ink,
          fontWeight: '600',
          marginLeft: S.sm,
        }}
      />
    </View>
  );
}

export default function OwnerLedgerPartyAddScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const partyType = route.params?.partyType || PARTY_CUSTOMER;
  const copy = partyCopy(partyType);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Closes this screen, and only this screen.
   *
   * The save is async, so the owner can hardware-back out while it is still in
   * flight. A bare goBack() on the resolve would then dispatch against a screen
   * that has already been popped — which is the "GO_BACK was not handled by any
   * navigator" warning, and on a deeper stack would pop somebody else's screen.
   * isFocused() is the test for "am I still the screen on top".
   */
  const closeSelf = useCallback(() => {
    if (!navigation.isFocused()) return;
    if (navigation.canGoBack()) navigation.goBack();
    // popTo, not navigate — see the note on the save path below.
    else navigation.popTo('OwnerCashBook');
  }, [navigation]);

  const submit = async () => {
    if (!isValidPhone(phone)) {
      notify('Check the number', 'Enter a valid 10-digit phone number', { preset: 'error' });
      return;
    }
    setSaving(true);
    try {
      const saved = await createParty({ partyType, name, phone });
      // The server names a nameless account after its number, so echo back what
      // it actually stored rather than the (possibly blank) field.
      notify(
        'Saved',
        `${saved?.name || normalizePhone(phone)} added to ${copy.one.toLowerCase()}s`,
        { preset: 'done' },
      );

      // Back to the account list, popping the contact picker underneath us too —
      // both screens have served their purpose and neither should be behind the
      // back button. The Cash Book refetches on focus, so the new row is there.
      //
      // popTo is what actually pops them. React Navigation 7's `navigate` no
      // longer returns to a screen already in the stack — it pushes another
      // one, which left the form and the picker still sitting under a second
      // Cash Book and turned one back press into four.
      if (!navigation.isFocused()) return;
      navigation.popTo('OwnerCashBook');
    } catch (e) {
      notify('Could not save', e?.message || 'Please try again', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── header ───────────────────────────────────────────────────── */}
      <View className="flex-row items-center bg-card" style={headerStyle(insets.top)}>
        <Pressable
          onPress={closeSelf}
          hitSlop={rs(10)}
          className="rounded-full items-center justify-center active:opacity-70"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon, marginRight: S.tight }}
        >
          <ArrowLeft size={rs(19)} color={C.ink} />
        </Pressable>
        <Text className="flex-1 font-extrabold" style={{ fontSize: T.screenTitle, color: C.ink }}>
          {copy.addCta}
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: S.lg,
            paddingTop: S.md,
            paddingBottom: S.xl,
          }}
        >
          {/* No "Add from Contacts" shortcut here. The contact list is the
              screen directly behind this one — offering a way back into it would
              be a loop, and the back arrow already goes there. */}
          <Text
            className="font-extrabold"
            style={{ fontSize: T.sectionLabel, color: C.muted, letterSpacing: 0.6, marginBottom: S.sm }}
          >
            {copy.one.toUpperCase()} DETAILS
          </Text>

          <Field
            icon={<UserRound size={rs(17)} color={C.green} />}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            maxLength={120}
            autoFocus
          />

          <Field
            icon={<Phone size={rs(17)} color={C.green} />}
            value={phone}
            // Digits only as they are typed: the field feeds a number the server
            // stores in one canonical form, so there is nothing for spaces or a
            // "+91" prefix to do except make two spellings of one account.
            onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
            placeholder="Phone Number"
            keyboardType="phone-pad"
            maxLength={10}
          />

          <Text style={{ fontSize: T.rowSub, color: C.muted, marginTop: S.tight, lineHeight: T.rowSub * 1.5 }}>
            The number identifies the account. Leave the name blank and the number
            is used as the name.
          </Text>
        </ScrollView>

        {/* ── save ─────────────────────────────────────────────────────── */}
        <View
          className="bg-card"
          style={{
            paddingHorizontal: S.gutter,
            paddingTop: S.sm,
            paddingBottom: bottomInset(insets.bottom, S.sm),
            borderTopWidth: 1,
            borderTopColor: C.hairline,
          }}
        >
          <Pressable
            onPress={submit}
            disabled={saving}
            className="items-center justify-center active:opacity-85"
            style={{
              backgroundColor: C.green,
              paddingVertical: S.md,
              minHeight: SIZE.buttonMin,
              borderRadius: SIZE.radius,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-extrabold" style={{ fontSize: T.button }}>{copy.addCta}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
