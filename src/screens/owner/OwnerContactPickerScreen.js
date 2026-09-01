import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ContactRound, Search, UserPlus } from 'lucide-react-native';
import { notify } from '../../components/confirm';
import {
  PERMISSION_GRANTED,
  contactsAvailable,
  getContactsPermission,
  loadContacts,
  requestContactsPermission,
} from '../../lib/contacts';
import { PARTY_CUSTOMER, createParty, formatPhone, partyCopy } from '../../api/ledgerParties';
import { rs } from '../../theme/metrics';
import {
  C,
  S,
  SIZE,
  T,
  avatarFor,
  bottomInset,
  headerStyle,
  avatarInitialSize,
} from './ledgerUi';

/* ══════════════════════════════════════════════════════════════════════════
   Contact picker — the front door of "+ Add Customer" / "+ Add Supplier".
   ──────────────────────────────────────────────────────────────────────────
   Tapping a contact SAVES the account there and then and opens its statement.
   There is no confirm step in between: the name and number came out of the
   owner's own phone book, so a form that re-showed the two facts they just
   picked would only be asking them to agree with themselves. The account is
   editable and deletable afterwards, which is the safety net that makes the
   missing step affordable.

   "Add Manually" is the other door, for a party who isn't in the phone book at
   all — that one goes to the Name / Phone form.

   The OS permission dialog can only be raised ONCE on Android — a "Don't allow"
   makes every later request resolve straight to `denied` with no prompt shown.
   That is why the denied state offers app settings rather than a button that
   would silently do nothing.
   ══════════════════════════════════════════════════════════════════════════ */

// Fixed so getItemLayout can be exact. Both text lines are numberOfLines={1}
// and the avatar is a fixed size, so nothing in a row can change its height.
// Device-scaled, which is why getItemLayout must read THIS and never a literal.
const ROW_HEIGHT = SIZE.contactRow;

export default function OwnerContactPickerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const partyType = route.params?.partyType || PARTY_CUSTOMER;
  const copy = partyCopy(partyType);

  // 'checking' | 'granted' | 'denied' | 'unavailable'
  const [state, setState] = useState('checking');
  const [contacts, setContacts] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  // Distinct from loadingList: the first page is already on screen, but more
  // pages are still arriving. Drives the footer, not the full-screen spinner.
  const [streaming, setStreaming] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  // Which contact is mid-save. Doubles as the "one at a time" lock.
  const [savingId, setSavingId] = useState(null);

  const pullContacts = useCallback(async () => {
    setLoadingList(true);
    setStreaming(true);
    setLoadError(null);
    try {
      // Each page lands on screen as it arrives, so the spinner is gone after
      // the first few hundred rows instead of after the whole phone book.
      setContacts(await loadContacts((partial) => {
        setContacts(partial);
        setLoadingList(false);
      }));
    } catch (e) {
      // Surfaced, not swallowed. A phone book that failed to read looks exactly
      // like an empty one, and "no contacts with a phone number" is the wrong
      // thing to tell someone whose contacts are plainly right there.
      setContacts([]);
      setLoadError(e?.message || 'Could not read your contacts.');
    } finally {
      setLoadingList(false);
      setStreaming(false);
    }
  }, []);

  /**
   * Show the list screen FIRST, then fill it. Reading a few thousand contacts
   * is not instant, and holding the whole screen on a spinner until it finishes
   * makes a slow read indistinguishable from a broken one.
   */
  const grant = useCallback(async () => {
    setState('granted');
    await pullContacts();
  }, [pullContacts]);

  /**
   * Ask on arrival. Tapping "Add from Contacts" IS the consent gesture, so
   * making the owner tap a second in-app button before the OS dialog would be
   * one tap of pure ceremony.
   */
  const ask = useCallback(async () => {
    if (!contactsAvailable()) {
      setState('unavailable');
      return;
    }
    setState('checking');
    const existing = await getContactsPermission();
    if (existing === PERMISSION_GRANTED) {
      await grant();
      return;
    }
    const status = await requestContactsPermission();
    if (status === PERMISSION_GRANTED) await grant();
    else setState('denied');
  }, [grant]);

  useEffect(() => { ask(); }, [ask]);

  /**
   * Returning from the OS settings page does not re-focus this screen in any
   * navigation sense — the whole app was backgrounded and came back. Re-checking
   * on foreground is what turns "I just switched it on in Settings" into a list,
   * instead of leaving the owner staring at the same refusal.
   */
  useEffect(() => {
    if (state !== 'denied') return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      getContactsPermission().then((s) => { if (s === PERMISSION_GRANTED) grant(); });
    });
    return () => sub.remove();
  }, [state, grant]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/\D/g, '');
    // `c.search` is the name pre-folded at load time — lowercasing every name
    // again on each keystroke is the one avoidable cost in a live filter.
    return contacts.filter((c) => c.search.includes(q) || (digits && c.phone.includes(digits)));
  }, [contacts, query]);

  /** The manual door: a party who isn't in the phone book at all. */
  const addManually = () => navigation.navigate('OwnerLedgerPartyAdd', { partyType });

  /**
   * Save the tapped contact as an account and open its statement.
   *
   * `replace` rather than navigate: this screen has done its job, so the
   * statement takes its slot and back from there lands on the Cash Book — not on
   * a contact list the owner has already chosen from.
   *
   * The server upserts on (shop, type, phone), so tapping someone already in the
   * book is not an error — it resolves to their existing account and opens it,
   * which is the only sane reading of "add this person" when they are in there.
   */
  const pickContact = async (contact) => {
    if (savingId) return; // a second tap mid-save would create a second screen
    setSavingId(contact.id);
    try {
      const saved = await createParty({
        partyType,
        name: contact.name,
        phone: contact.phone,
      });
      if (!navigation.isFocused()) return;
      navigation.replace('OwnerLedgerPartyDetail', { partyId: saved.id, party: saved });
    } catch (e) {
      notify('Could not add', e?.message || 'Please try again', { preset: 'error', haptic: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const renderContact = ({ item }) => {
    const { color, ink, initial } = avatarFor(item.name);
    const busy = savingId === item.id;
    return (
      <Pressable
        onPress={() => pickContact(item)}
        // Every row goes quiet while one is saving, so a rushed double-tap on
        // two different names can't open two accounts.
        disabled={!!savingId}
        className="flex-row items-center active:opacity-70"
        style={{ height: ROW_HEIGHT, paddingHorizontal: S.tight, opacity: savingId && !busy ? 0.45 : 1 }}
      >
        <View
          className="items-center justify-center"
          style={{
            height: SIZE.avatarMd,
            width: SIZE.avatarMd,
            borderRadius: SIZE.avatarMd / 2,
            marginRight: S.md,
            backgroundColor: color,
          }}
        >
          <Text
            className="font-extrabold"
            style={{ fontSize: avatarInitialSize(SIZE.avatarMd), color: ink }}
          >
            {initial}
          </Text>
        </View>
        <View className="flex-1 pr-2">
          <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ fontSize: T.rowSub, color: C.muted }}>{formatPhone(item.phone)}</Text>
        </View>
        {busy ? <ActivityIndicator size="small" color={C.green} /> : null}
      </Pressable>
    );
  };

  /* ── permission states ────────────────────────────────────────────── */

  const Blocked = ({ title, body, actionLabel, onAction }) => (
    <View className="flex-1 items-center justify-center px-8">
      <View
        className="items-center justify-center mb-5"
        style={{ height: rs(58), width: rs(58), borderRadius: rs(29), backgroundColor: C.greenSoft }}
      >
        <ContactRound size={rs(26)} color={C.green} />
      </View>
      <Text className="font-extrabold text-center" style={{ fontSize: T.screenTitle, color: C.ink }}>{title}</Text>
      <Text
        className="text-center"
        style={{ fontSize: T.rowSub, color: C.muted, lineHeight: T.rowSub * 1.5, marginTop: S.xs }}
      >
        {body}
      </Text>
      {onAction ? (
        <Pressable
          onPress={onAction}
          className="rounded-2xl items-center justify-center mt-6 active:opacity-85"
          style={{ backgroundColor: C.green, paddingVertical: S.sm, paddingHorizontal: S.xl }}
        >
          <Text className="text-white font-extrabold" style={{ fontSize: T.button }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {/* ── header ───────────────────────────────────────────────────── */}
      <View className="bg-card" style={headerStyle(insets.top)}>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => (navigation.canGoBack()
              ? navigation.goBack()
              // popTo, not navigate: in React Navigation 7 `navigate` pushes a
              // second Cash Book rather than returning to the one below.
              : navigation.popTo('OwnerCashBook'))}
            hitSlop={rs(10)}
            className="rounded-full items-center justify-center active:opacity-70"
            style={{ height: SIZE.headerIcon, width: SIZE.headerIcon, marginRight: S.tight }}
          >
            <ArrowLeft size={rs(19)} color={C.ink} />
          </Pressable>
          {/* Titled by the action, not the source. This screen is now what
              "+ Add Customer" opens, so "Contacts" alone would read as a detour
              rather than as the thing the owner asked for. */}
          <View className="flex-1">
            <Text className="font-extrabold" style={{ fontSize: T.screenTitle, color: C.ink }}>{copy.addCta}</Text>
            <Text style={{ fontSize: T.screenSub, color: C.muted }}>Pick from your contacts</Text>
          </View>
        </View>

        {state === 'granted' ? (
          <View
            className="flex-row items-center"
            style={{
              backgroundColor: C.field,
              borderWidth: 1,
              borderColor: C.hairline,
              borderRadius: SIZE.radius,
              paddingHorizontal: S.sm,
              marginTop: S.xs,
            }}
          >
            <Search size={rs(15)} color={C.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name or number"
              placeholderTextColor={C.placeholder}
              className="flex-1"
              style={{ paddingVertical: S.xs, fontSize: T.input, color: C.ink, marginLeft: S.xs }}
            />
          </View>
        ) : null}
      </View>

      {/* ── body ─────────────────────────────────────────────────────── */}
      {state === 'checking' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={C.green} />
          <Text style={{ fontSize: T.rowSub, color: C.muted, marginTop: S.sm }}>Reading your contacts…</Text>
        </View>
      ) : state === 'unavailable' ? (
        <Blocked
          title="Contacts need an app update"
          body="This build of the app can't open your phone book yet. Add the number by hand for now — it works exactly the same."
          actionLabel={`Add ${copy.one.toLowerCase()} manually`}
          onAction={() => addManually()}
        />
      ) : state === 'denied' ? (
        <Blocked
          title="Contacts access is off"
          body={`Allow contacts to pick a ${copy.one.toLowerCase()} from your phone book. If the permission dialog no longer appears, turn it on for GGFIX Partner in Settings.`}
          actionLabel="Allow contacts"
          onAction={async () => {
            // Trust the CURRENT grant before asking again: the request watchdog
            // may have given up on a dialog the owner then allowed, in which
            // case there is nothing left to ask for.
            if (await getContactsPermission() === PERMISSION_GRANTED) {
              await grant();
              return;
            }
            const status = await requestContactsPermission();
            if (status === PERMISSION_GRANTED) {
              await grant();
              return;
            }
            // Android will not show the dialog a second time, so the only real
            // way back from here is the OS settings page.
            Linking.openSettings().catch(() => {});
          }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderContact}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                backgroundColor: C.hairline,
                marginLeft: S.tight + SIZE.avatarMd + S.md,
              }}
            />
          )}
          keyboardShouldPersistTaps="handled"
          // Rows are a fixed height (numberOfLines={1} on both lines), so the
          // list can be told its geometry instead of measuring several thousand
          // rows — this is what keeps scrolling smooth on a big phone book.
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: (ROW_HEIGHT + 1) * index,
            index,
          })}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          ListFooterComponent={
            streaming && contacts.length ? (
              <View className="flex-row items-center justify-center" style={{ paddingVertical: S.md }}>
                <ActivityIndicator size="small" color={C.green} />
                <Text style={{ fontSize: T.caption, color: C.muted, marginLeft: S.xs }}>
                  Loading more contacts…
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={{
            paddingHorizontal: S.gutter,
            paddingTop: S.tight,
            // Clears the pinned "Add Manually" bar plus the system nav inset.
            paddingBottom: rs(72) + bottomInset(insets.bottom, S.sm),
          }}
          ListEmptyComponent={
            loadingList ? (
              <View className="items-center" style={{ paddingTop: 60 }}>
                <ActivityIndicator color={C.green} />
                <Text style={{ fontSize: T.rowSub, color: C.muted, marginTop: S.sm }}>Reading your contacts…</Text>
              </View>
            ) : (
              <View className="items-center px-8" style={{ paddingTop: 60 }}>
                <Text className="font-extrabold text-center" style={{ fontSize: T.rowTitle, color: C.ink }}>
                  {loadError ? "Couldn't read your contacts" : query ? 'No matching contact' : 'No contacts with a phone number'}
                </Text>
                <Text
                  className="text-center"
                  style={{ fontSize: T.rowSub, color: C.muted, lineHeight: T.rowSub * 1.5, marginTop: S.xs }}
                >
                  {loadError
                    || (query
                      ? 'Try a different name or number, or add this one manually.'
                      : 'Your phone book has no saved numbers to import. Add the number by hand instead.')}
                </Text>
                {loadError ? (
                  <Pressable
                    onPress={pullContacts}
                    className="rounded-2xl items-center justify-center mt-5 active:opacity-85"
                    style={{ backgroundColor: C.green, paddingVertical: S.sm, paddingHorizontal: S.xl }}
                  >
                    <Text className="text-white font-extrabold" style={{ fontSize: T.button }}>Try again</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
        />
      )}

      {/* ── add manually ─────────────────────────────────────────────── */}
      {/* Pinned rather than a last list row: the escape hatch has to be reachable
          without scrolling a phone book of several hundred names. Hidden on the
          blocked states, which already offer it as their primary action. */}
      {state === 'granted' ? (
        <View
          className="absolute left-0 right-0 bottom-0 bg-card"
          style={{
            paddingHorizontal: S.gutter,
            paddingTop: S.sm,
            paddingBottom: bottomInset(insets.bottom, S.sm),
            borderTopWidth: 1,
            borderTopColor: C.hairline,
          }}
        >
          <Pressable
            onPress={() => addManually()}
            className="flex-row items-center justify-center rounded-2xl active:opacity-85"
            style={{
              backgroundColor: C.greenSoft,
              paddingVertical: S.md,
              minHeight: SIZE.buttonMin,
              borderRadius: SIZE.radius,
            }}
          >
            <UserPlus size={rs(17)} color={C.green} />
            <Text className="font-extrabold" style={{ fontSize: T.button, color: C.green, marginLeft: S.xs }}>
              Add Manually
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
