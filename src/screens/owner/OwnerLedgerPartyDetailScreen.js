import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  NativeModules,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TurboModuleRegistry,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  ChevronRight,
  FileText,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Percent,
  Phone,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Loader } from '../../components/rnr';
import WhatsAppIcon from '../../components/WhatsAppIcon';
import VoiceNotePlayer from '../../components/VoiceNotePlayer';
import { confirm, notify } from '../../components/confirm';
import LedgerDateSheet from './LedgerDateSheet';
import ReminderCard, { REMINDER_CARD_WIDTH } from './ReminderCard';
import { formatMoney } from './revenueMath';
import { getSession } from '../../auth/session';
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
import {
  GIVEN,
  RECEIVED,
  balanceTone,
  deleteEntry,
  deleteParty,
  formatPhone,
  getStatement,
  normalizePhone,
  toApiDate,
  updateParty,
} from '../../api/ledgerParties';

/* ══════════════════════════════════════════════════════════════════════════
   One account's statement.
   ──────────────────────────────────────────────────────────────────────────
   RECEIVED is money the party handed the shop, GIVEN is money the shop handed
   them. The balance under each row is the account AFTER that entry, computed
   server-side — the client never replays the ledger, so the row total and the
   header can't disagree.

   Back from here goes to the Cash Book, never to the Add screen: this screen is
   where adding an account lands, and re-showing a form that has already been
   submitted is a trap.
   ══════════════════════════════════════════════════════════════════════════ */

const money = (n) => formatMoney(Math.abs(Number(n) || 0));

// Parse the API's `YYYY-MM-DD` as a LOCAL date. `new Date('2026-08-09')` is
// parsed as UTC midnight, which renders as the previous day anywhere west of
// Greenwich and breaks the Today/Yesterday comparison.
function parseApiDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** "20 Aug 2026" — a due date, which is a plain day and never Today/Yesterday. */
const niceDay = (d) =>
  d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/** Whole days from today; negative once the promise has passed. */
const daysUntil = (d) =>
  d ? Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000) : null;

function dayHeading(date) {
  if (!date) return 'Unknown date';
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
};

export default function OwnerLedgerPartyDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const partyId = route.params?.partyId;
  // Passed through from the list so the header has a name to show on the very
  // first frame, before the statement lands.
  const seed = route.params?.party || null;

  const [statement, setStatement] = useState({
    party: seed, balance: 0, totalReceived: 0, totalGiven: 0, entries: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);   // a bill photo, full-screen
  const [query, setQuery] = useState(null);       // null = the search bar is closed
  const [more, setMore] = useState(false);
  const [entryAction, setEntryAction] = useState(null);  // the row whose sheet is open
  const [cardBusy, setCardBusy] = useState(false);
  // The off-screen card only mounts once asked for: it pulls the shop's front
  // image over the network, and every open account would otherwise fetch one.
  const [cardReady, setCardReady] = useState(false);
  const cardRef = useRef(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [savingDue, setSavingDue] = useState(false);
  // The shop's own identity, for the reminder's signature. Read once on mount:
  // it does not change while a statement is open, and the reminder must not
  // wait on a network call at the moment the owner taps Remind.
  const [shop, setShop] = useState(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getSession()
      .then((s) => { if (!cancelled) setShop(s || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []));

  // Newest at the bottom means the interesting end is off-screen on a long
  // account, so each load lands there once. A ref, not state: it must not
  // re-render, and it must be spent exactly once per load or a refresh would
  // yank the owner back down while they were reading last month.
  const listRef = useRef(null);
  const pinToLatest = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      pinToLatest.current = true;
      setStatement(await getStatement(partyId));
    } catch (e) {
      setError(e?.message || 'Could not load this account');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const party = statement.party || seed;
  const tone = balanceTone(statement.balance);
  const { color, ink, initial } = avatarFor(party?.name);

  /**
   * Back always means the Cash Book.
   *
   * This screen is what adding an account navigates to, and the Add form is
   * still below it in the stack — a plain goBack() would drop the owner back
   * onto a form they have already submitted.
   *
   * popTo, NOT navigate. React Navigation 7 changed `navigate` so it no longer
   * returns to an existing screen: unless the target is already focused it
   * PUSHES a second copy. That left the stack as
   * [Tabs, CashBook, PartyDetail, CashBook] — the Cash Book looked right, but
   * the next back went to the account detail instead of Home, and it took three
   * more presses to get out. popTo pops to the Cash Book already down there, and
   * falls back to replacing this screen if there isn't one.
   */
  const goToCashBook = () => navigation.popTo('OwnerCashBook');

  /**
   * Search matches the note, the booking it was against, and the amount.
   *
   * The amount is compared on its DIGITS, so typing 2000 finds "₹2,000" without
   * the owner having to guess where the grouping commas fall. A day heading is
   * only emitted once a row under it survives the filter, so filtering never
   * leaves a date pill standing over nothing.
   */
  const feed = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const rows = !q ? statement.entries : statement.entries.filter((e) => {
      const text = [e.note, e.ticketTrackingId, e.ticketLabel].filter(Boolean).join(' ').toLowerCase();
      if (text.includes(q)) return true;
      return digits !== '' && String(Math.abs(Number(e.amount) || 0)).includes(digits);
    });

    // OLDEST FIRST — the server sends newest-first, and rendering it that way
    // made the account read backwards: the ₹5,000 credit sat at the top over
    // "₹3,000 Due", with the two older rows and their EARLIER running balances
    // beneath it, so the column appeared to count down. Each figure was right;
    // the sequence was upside down.
    //
    // A statement is a story told forwards. Reversed here, every row's balance
    // follows from the one above it and the last row IS the Balance Due in the
    // bar below — the account proves itself on screen.
    const out = [];
    let currentKey = null;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const e = rows[i];
      if (e.entryDate !== currentKey) {
        currentKey = e.entryDate;
        out.push({ _type: 'day', key: `day:${currentKey}`, label: dayHeading(parseApiDate(currentKey)) });
      }
      out.push({ _type: 'entry', key: `e:${e.id}`, entry: e });
    }
    return out;
  }, [statement.entries, query]);

  /* ── acting on the account ─────────────────────────────────────────── */

  const goStatement = () => navigation.navigate('OwnerLedgerStatement', { partyId, party });

  const dial = (scheme) => {
    const digits = normalizePhone(party?.phone);
    if (!digits) {
      notify('No number saved', 'Add a phone number to this account first.', { preset: 'error' });
      return;
    }
    // wa.me wants the country code; tel: and sms: are happy with the national
    // form the ledger stores.
    const url = scheme === 'whatsapp' ? `https://wa.me/91${digits}` : `${scheme}:${digits}`;
    Linking.openURL(url).catch(() =>
      notify('Could not open', 'No app on this device handles that.', { preset: 'error' }));
  };

  /* ── due date + reminder ──────────────────────────────────────────── */

  // Server-held (see migration 90), not local: the promise has to survive the
  // screen closing, and the Cash Book's overdue sort reads the same column.
  const dueDate = party?.dueDate || null;
  const dueDays = daysUntil(parseApiDate(dueDate));
  const overdue = dueDays !== null && dueDays < 0;

  const saveDueDate = async (next) => {
    setDueOpen(false);
    setSavingDue(true);
    try {
      await updateParty(partyId, { dueDate: next ? toApiDate(next) : null });
      notify(
        next ? 'Due date set' : 'Due date cleared',
        next ? `${party?.name || 'This account'} is expected to settle by ${niceDay(next)}.` : '',
        { preset: 'done' },
      );
      await load(true);
    } catch (e) {
      notify('Could not save', e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setSavingDue(false);
    }
  };

  /**
   * The reminder, as WhatsApp text.
   *
   * A deep link carries text and nothing else — the branded card in OkCredit's
   * version is an image sent through WhatsApp's Business API, which needs an
   * approved template and a paid number. So the shop's identity goes in the
   * message body instead: name first, number last, the way a shop signs an SMS.
   *
   * Nothing is sent automatically. The link opens the chat with the message
   * composed, and the owner presses send — a bill chased without the owner
   * knowing is how a shop loses a customer.
   */
  const shopName = shop?.shopName || shop?.activeShop?.name || 'Our shop';
  const shopPhone = shop?.activeShop?.mobile
    || shop?.activeShop?.mobilePrimary
    || shop?.activeShop?.phone
    || shop?.phone
    || '';
  const shopLogoUrl = shop?.activeShop?.frontImageUrl || shop?.activeShop?.logoUrl || '';

  const reminderText = () => [
    `*Payment Due Reminder*`,
    '',
    `Hello ${party?.name || 'there'},`,
    `Your balance of *${money(statement.balance)}* is due at ${shopName}.`,
    dueDate ? `Kindly settle it on or before ${niceDay(parseApiDate(dueDate))}.` : 'Kindly pay at the earliest.',
    '',
    shopPhone ? `— ${shopName} (${formatPhone(shopPhone)})` : `— ${shopName}`,
  ].join('\n');

  /** Guard both routes: no number, or nothing owed, and there is no reminder. */
  const canRemind = () => {
    if (!normalizePhone(party?.phone)) {
      notify('No number saved', 'Add a phone number to this account first.', { preset: 'error' });
      return false;
    }
    if (!(statement.balance > 0)) {
      notify('Nothing to remind about', 'This account has no outstanding balance.', { preset: 'error' });
      return false;
    }
    return true;
  };

  /**
   * Text straight into THIS customer's chat.
   *
   * wa.me addresses the number, so nothing has to be picked — but it carries
   * text only, which is why the card below is a separate route rather than an
   * attachment on this one.
   */
  const remindByText = () => {
    if (!canRemind()) return;
    const url = `https://wa.me/91${normalizePhone(party.phone)}?text=${encodeURIComponent(reminderText())}`;
    Linking.openURL(url).catch(() =>
      notify('Could not open WhatsApp', 'No app on this device handles that.', { preset: 'error' }));
  };

  /**
   * The card and the message as ONE WhatsApp post — image with the text as its
   * caption, addressed to this customer, the way the reference does it.
   *
   * Android hands a share target a single payload, and the two Expo routes each
   * drop half of it: expo-sharing attaches the image and discards any caption,
   * `Share.share({message, url})` sends the text and discards the image.
   * react-native-share's shareSingle fires the ACTION_SEND intent with BOTH
   * extras at com.whatsapp, which is the only way to get one message with both.
   *
   * It is a native module, so the binary has to be REBUILT before it exists.
   * Until then this falls back to the two-part route — image through the system
   * sheet, text on the clipboard to paste — so an un-rebuilt app still sends a
   * reminder.
   *
   * The probe below is why that fallback works. Wrapping `require` in a
   * try/catch is NOT enough and was the bug: react-native-share's spec calls
   * TurboModuleRegistry.getEnforcing('RNShare') at module scope, and Metro's
   * guardedLoadModule hands a module-init throw to ErrorUtils.reportFatalError
   * — a dev red screen, a production crash — instead of propagating it to the
   * caller's catch. So the module must never be evaluated on a binary that
   * cannot support it. `TurboModuleRegistry.get` is the non-throwing sibling of
   * getEnforcing; NativeModules covers the old architecture.
   */
  const shareSingleModule = () => {
    let native = null;
    try { native = TurboModuleRegistry?.get?.('RNShare') || null; } catch (_) { native = null; }
    if (!native && !NativeModules?.RNShare) return null;
    try {
      // eslint-disable-next-line global-require
      const mod = require('react-native-share');
      return mod?.default || mod || null;
    } catch (_) {
      return null;
    }
  };

  const remindByCard = async () => {
    if (!canRemind()) return;

    // No native module in this binary → send the TEXT straight to the chat.
    //
    // Deliberately not the system share sheet. That route could attach the
    // picture but not the caption, so the customer received a card with no
    // words unless the owner remembered to paste from the clipboard — and it
    // put a Quick Share / Telegram / Facebook chooser in front of a button
    // whose whole promise is "opens WhatsApp". A complete message in the right
    // chat beats a prettier one that arrives half-written.
    const RNShare = shareSingleModule();
    if (!RNShare?.shareSingle || !RNShare?.Social?.WHATSAPP) {
      notify('Sent as text', 'Rebuild the app to attach the reminder card.', { preset: 'done' });
      remindByText();
      return;
    }

    setCardBusy(true);
    try {
      // The card only mounts once cardReady flips, so the first capture can
      // land before layout. Retry rather than fail — see the receipt share.
      // base64, not a file: shareSingle wants the bytes, and taking them
      // straight from view-shot keeps expo-file-system out of this path.
      setCardReady(true);
      let base64 = null;
      for (const wait of [120, 350]) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          base64 = await captureRef(cardRef, { format: 'png', quality: 1, result: 'base64' });
          break;
        } catch (_) { /* not laid out yet */ }
      }
      if (!base64) {
        notify('Could not build the card', 'Sending the reminder as text instead.', { preset: 'error' });
        remindByText();
        return;
      }

      // NO whatsAppNumber here, deliberately.
      //
      // Passing it makes react-native-share target com.whatsapp.Conversation
      // with a `jid` extra (ShareIntent.java:138-144). That activity opens the
      // right chat and honours EXTRA_TEXT — but it ignores EXTRA_STREAM, so the
      // picture is dropped and only the words arrive. That was the bug: correct
      // chat, no card.
      //
      // Without it the intent is a plain ACTION_SEND at package com.whatsapp
      // carrying EXTRA_STREAM + EXTRA_TEXT, so WhatsApp opens its own "Send
      // to…" picker with the card attached and the message already in the
      // caption box — one tap to choose the contact, which is exactly the flow
      // in the reference. An image and a pre-addressed chat cannot both be had
      // from one intent; the image is the half worth keeping.
      const payload = {
        message: reminderText(),
        url: `data:image/png;base64,${base64}`,
        filename: `reminder-${party?.name || 'account'}`.replace(/\s+/g, '-'),
        type: 'image/png',
        // Load-bearing, not a preference. ShareFile decodes the base64 to
        // getExternalCacheDir()/Download when this is false (the default), but
        // the library's own FileProvider only declares <external-path> (which
        // is external STORAGE, not the app's external cache) and <cache-path>
        // (internal). So the external-cache file matches no configured root and
        // getUriForFile throws "Failed to find configured root" — the exact
        // "Card could not be attached" toast. true writes to the internal cache,
        // which <cache-path path="/"> does cover.
        useInternalStorage: true,
      };
      // Plain WhatsApp first, then Business: plenty of shops run only the
      // Business app, and "not installed" on the consumer one should reach for
      // the other rather than dump the owner on a chooser.
      const targets = [RNShare.Social.WHATSAPP, RNShare.Social.WHATSAPPBUSINESS].filter(Boolean);
      let missing = 0;
      let lastError = null;
      for (const social of targets) {
        try {
          await RNShare.shareSingle({ ...payload, social });
          return;
        } catch (e) {
          const msg = String(e?.message || '').toLowerCase();
          // A cancelled share is a decision, not a failure — stop here.
          if (msg.includes('cancel')) return;
          if (msg.includes('not installed') || msg.includes('no app')) { missing += 1; continue; }
          lastError = e?.message || String(e);
          break;
        }
      }
      if (missing === targets.length) {
        notify('WhatsApp not found', 'Neither WhatsApp nor WhatsApp Business is installed.', { preset: 'error' });
        return;
      }
      // Something unexpected on every target — still send the words, but SAY
      // what went wrong. Falling back silently is how "the image is missing"
      // stayed a mystery through several builds.
      if (lastError) notify('Card could not be attached', lastError, { preset: 'error' });
      remindByText();
    } catch (e) {
      notify('Could not share', e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setCardBusy(false);
    }
  };

  // A discount is not money that changed hands, but it moves the account the
  // same way a payment does — it reduces what the party owes. So it is booked
  // as RECEIVED through the normal entry screen, which already has the
  // calculator, the date and the note field, rather than a second silent path
  // that writes a row nobody can see being written.
  const giveDiscount = () => {
    setMore(false);
    navigation.navigate('OwnerLedgerEntryAdd', {
      partyId, party, direction: RECEIVED, presetNote: 'Discount',
    });
  };

  const removeParty = async () => {
    setMore(false);
    const ok = await confirm({
      title: `Delete ${party?.name || 'account'}?`,
      message: statement.entries.length
        ? `This account and all ${statement.entries.length} of its entries will be removed. This cannot be undone.`
        : 'This account will be removed. This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteParty(partyId);
      notify('Deleted', 'Account removed', { preset: 'done' });
      goToCashBook();
    } catch (e) {
      notify('Could not delete', e?.message || 'Please try again', { preset: 'error', haptic: 'error' });
    }
  };

  const removeEntry = async (entry) => {
    const isIn = entry.direction === RECEIVED;
    const ok = await confirm({
      title: 'Delete entry',
      message: `${isIn ? 'Received' : 'Given'} ${money(entry.amount)} will be removed and the balance re-calculated.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteEntry(entry.id);
      notify('Deleted', 'Entry removed', { preset: 'done' });
      await load(true);
    } catch (e) {
      notify('Could not delete', e?.message || 'Please try again', { preset: 'error', haptic: 'error' });
    }
  };

  const openEntry = (direction) =>
    navigation.navigate('OwnerLedgerEntryAdd', { partyId, party, direction });

  const renderRow = ({ item }) => {
    if (item._type === 'day') {
      return (
        <View className="items-center" style={{ marginVertical: S.sm }}>
          <View
            className="rounded-full"
            style={{ backgroundColor: C.chipBg, paddingHorizontal: S.md, paddingVertical: rs(3) }}
          >
            <Text className="font-bold" style={{ fontSize: T.caption, color: C.chipInk }}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const e = item.entry;
    const isIn = e.direction === RECEIVED;
    const tint = isIn ? C.green : C.red;
    // Received sits left, Given sits right — the two sides of the account read
    // as two columns, the way a paper ledger is kept.
    const rowTone = balanceTone(e.runningBalance);

    return (
      <View className={isIn ? 'items-start' : 'items-end'} style={{ marginBottom: S.sm }}>
        <Pressable
          // Tap opens the row's actions, long-press still goes straight to
          // delete for anyone who learned that gesture. Editing had no way in
          // at all before this — a mistyped amount meant deleting the row and
          // re-entering it, losing its date, its bills and its voice note.
          onPress={() => setEntryAction(e)}
          onLongPress={() => removeEntry(e)}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`${isIn ? 'Received' : 'Given'} ${money(e.amount)}, open actions`}
          className="active:opacity-70"
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: isIn ? C.greenLine : C.redLine,
            borderRadius: SIZE.radius,
            paddingHorizontal: S.md,
            paddingVertical: S.sm,
            minWidth: '50%',
            maxWidth: '88%',
          }}
        >
          <View className="flex-row items-center">
            {isIn ? <ArrowDown size={rs(15)} color={tint} /> : <ArrowUp size={rs(15)} color={tint} />}
            <Text className="font-extrabold" style={{ fontSize: T.screenTitle, color: tint, marginLeft: rs(2) }}>
              {money(e.amount)}
            </Text>
            <Text style={{ fontSize: T.caption, color: C.muted, marginLeft: S.sm }}>{timeOf(e.createdAt)}</Text>
          </View>
          {e.note ? (
            <Text style={{ fontSize: T.rowSub, color: C.body, marginTop: S.tight }} numberOfLines={2}>
              {e.note}
            </Text>
          ) : null}

          {/* The job the money was against, when it was one. "Advance payment"
              on its own says nothing a month later; the ticket id is what makes
              the row answerable. */}
          {e.ticketTrackingId ? (
            <View
              className="flex-row items-center self-start"
              style={{
                backgroundColor: `${tint}12`,
                borderRadius: SIZE.radiusSm,
                paddingHorizontal: S.xs,
                paddingVertical: rs(3),
                marginTop: S.tight,
              }}
            >
              <Ticket size={rs(12)} color={tint} />
              <Text
                className="font-bold"
                style={{ fontSize: T.caption, color: tint, marginLeft: rs(3) }}
                numberOfLines={1}
              >
                {[e.ticketTrackingId, e.ticketLabel].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}

          {/* The evidence behind the amount. A note spoken at the counter and
              the photographed bill are the whole reason this row can settle an
              argument a month from now, so they play and open from here. */}
          {e.noteAudioUrl ? (
            <View className="flex-row items-center" style={{ minWidth: rs(150), marginTop: S.xs }}>
              <VoiceNotePlayer url={e.noteAudioUrl} tint={tint} compact />
            </View>
          ) : null}

          {e.billUrls?.length ? (
            <View className="flex-row flex-wrap" style={{ gap: S.tight, marginTop: S.xs }}>
              {e.billUrls.map((url) => (
                <Pressable
                  key={url}
                  onPress={() => setPreview(url)}
                  className="overflow-hidden active:opacity-80"
                  style={{
                    height: SIZE.tile,
                    width: SIZE.tile,
                    borderRadius: SIZE.radiusSm,
                    backgroundColor: C.chipBg,
                  }}
                >
                  <Image
                    source={{ uri: url }}
                    style={{ height: SIZE.tile, width: SIZE.tile }}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
        <Text
          className="font-semibold"
          style={{
            fontSize: T.caption,
            color: rowTone.danger ? C.red : C.green,
            marginTop: rs(2),
            paddingHorizontal: S.tight,
          }}
        >
          {money(e.runningBalance)} {rowTone.label}
        </Text>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── header ───────────────────────────────────────────────────── */}
      <View className="flex-row items-center bg-card" style={headerStyle(insets.top)}>
        <Pressable
          onPress={goToCashBook}
          hitSlop={rs(10)}
          className="rounded-full items-center justify-center active:opacity-70"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon }}
        >
          <ArrowLeft size={rs(19)} color={C.ink} />
        </Pressable>
        <View
          className="items-center justify-center"
          style={{
            height: SIZE.avatarSm,
            width: SIZE.avatarSm,
            borderRadius: SIZE.avatarSm / 2,
            marginHorizontal: S.xs,
            backgroundColor: color,
          }}
        >
          <Text
            className="font-extrabold"
            style={{ fontSize: avatarInitialSize(SIZE.avatarSm), color: ink }}
          >
            {initial}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }} numberOfLines={1}>
            {party?.name || 'Account'}
          </Text>
          <Text style={{ fontSize: T.rowSub, color: C.muted }} numberOfLines={1}>
            {party?.phone ? formatPhone(party.phone) : ''}
          </Text>
        </View>

        {/* Statement and search sit in the header because both are about the
            WHOLE account, unlike the buttons below which act on one entry. */}
        <Pressable
          onPress={goStatement}
          hitSlop={rs(8)}
          accessibilityLabel="Statement"
          className="rounded-full items-center justify-center active:opacity-70"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon }}
        >
          <FileText size={rs(18)} color={C.ink} />
        </Pressable>
        <Pressable
          onPress={() => setQuery((q) => (q === null ? '' : null))}
          hitSlop={rs(8)}
          accessibilityLabel={query === null ? 'Search entries' : 'Close search'}
          className="rounded-full items-center justify-center active:opacity-70"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon }}
        >
          {query === null
            ? <Search size={rs(18)} color={C.ink} />
            : <X size={rs(18)} color={C.ink} />}
        </Pressable>
      </View>

      {query !== null ? (
        <View
          className="flex-row items-center bg-card"
          style={{
            paddingHorizontal: S.gutter,
            paddingBottom: S.sm,
            borderBottomWidth: 1,
            borderBottomColor: C.hairline,
          }}
        >
          <View
            className="flex-1 flex-row items-center"
            style={{
              backgroundColor: C.field,
              borderRadius: SIZE.radiusSm,
              paddingHorizontal: S.sm,
            }}
          >
            <Search size={rs(15)} color={C.placeholder} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search a note, booking or amount"
              placeholderTextColor={C.placeholder}
              style={{ flex: 1, fontSize: T.input, color: C.ink, paddingVertical: S.sm, marginLeft: S.xs }}
            />
          </View>
        </View>
      ) : null}

      {error ? (
        <View
          style={{
            marginHorizontal: S.gutter,
            marginTop: S.xs,
            paddingHorizontal: S.sm,
            paddingVertical: S.xs,
            borderRadius: SIZE.radiusSm,
            backgroundColor: 'rgba(220, 38, 38, 0.10)',
            borderWidth: 1,
            borderColor: 'rgba(220, 38, 38, 0.35)',
          }}
        >
          <Text className="text-danger font-bold" style={{ fontSize: T.rowSub }}>{error}</Text>
        </View>
      ) : null}

      {/* ── statement ────────────────────────────────────────────────── */}
      {loading && statement.entries.length === 0 ? (
        <Loader label="Loading account..." />
      ) : (
        <FlatList
          ref={listRef}
          data={feed}
          keyExtractor={(item) => item.key}
          renderItem={renderRow}
          // Open on the latest entry, the way a chat does. Not while searching:
          // the matches are the point then, and jumping to the newest one would
          // scroll the owner away from what they were looking for.
          onContentSizeChange={() => {
            if (!pinToLatest.current || query !== null || !feed.length) return;
            pinToLatest.current = false;
            listRef.current?.scrollToEnd({ animated: false });
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />
          }
          contentContainerStyle={{
            paddingHorizontal: S.gutter,
            paddingTop: S.xs,
            paddingBottom: S.xl,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-10">
              <View
                className="items-center justify-center"
                style={{
                  height: rs(62),
                  width: rs(62),
                  borderRadius: rs(31),
                  marginBottom: S.md,
                  backgroundColor: C.greenSoft,
                }}
              >
                <Lock size={rs(27)} color={C.green} />
              </View>
              <Text
                className="text-center font-bold"
                style={{ fontSize: T.rowTitle, color: C.ink, lineHeight: T.rowTitle * 1.45 }}
              >
                All transactions between you and this account are totally private &amp; secure.
              </Text>
              <Text
                className="text-center"
                style={{ fontSize: T.rowSub, color: C.muted, lineHeight: T.rowSub * 1.5, marginTop: S.xs }}
              >
                Record what you received or gave using the buttons below.
              </Text>
            </View>
          }
        />
      )}

      {/* ── balance + actions ────────────────────────────────────────── */}
      <View
        className="bg-card"
        style={{
          borderTopWidth: 1,
          borderTopColor: C.hairline,
          paddingBottom: bottomInset(insets.bottom, S.sm),
        }}
      >
        {/* Contact + statement strip. These act on the ACCOUNT, so they sit
            above the balance rather than beside Received/Given, which record a
            single movement. */}
        {statement.entries.length ? (
          <View
            className="flex-row items-center"
            style={{
              paddingHorizontal: S.gutter,
              paddingVertical: S.xs,
              borderBottomWidth: 1,
              borderBottomColor: C.hairline,
              gap: S.sm,
            }}
          >
            <QuickAction icon={FileText} label="Statement" onPress={goStatement} />
            <QuickAction icon={MessageSquare} label="SMS" onPress={() => dial('sms')} />
            <QuickAction icon={Phone} label="Call" onPress={() => dial('tel')} />
            {/* The brand mark here too — the strip's other three glyphs each
                name their app, and a speech bubble labelled WhatsApp was the
                odd one out. */}
            <QuickAction icon={WhatsAppIcon} label="WhatsApp" onPress={() => dial('whatsapp')} />
            <View className="flex-1" />
            <Pressable
              onPress={() => setMore(true)}
              hitSlop={rs(8)}
              accessibilityLabel="More actions"
              className="flex-row items-center active:opacity-70"
              style={{ paddingHorizontal: S.xs, paddingVertical: S.xs }}
            >
              <Text className="font-bold" style={{ fontSize: T.caption, color: C.body, marginRight: rs(3) }}>
                More
              </Text>
              <MoreHorizontal size={rs(17)} color={C.body} />
            </Pressable>
          </View>
        ) : null}

        {/* Chase row. Only on an account that actually owes something — Due
            Date and Remind are meaningless against a settled or advance
            balance, and three buttons that scold a customer who paid on time
            are worse than no buttons. */}
        {statement.balance > 0 ? (
          <View
            className="flex-row items-center"
            style={{
              paddingHorizontal: S.gutter,
              paddingVertical: S.xs,
              borderBottomWidth: 1,
              borderBottomColor: C.hairline,
              gap: S.sm,
            }}
          >
            <Pressable
              onPress={() => setDueOpen(true)}
              onLongPress={() => dueDate && saveDueDate(null)}
              delayLongPress={400}
              disabled={savingDue}
              accessibilityRole="button"
              accessibilityLabel={dueDate ? `Due date ${niceDay(parseApiDate(dueDate))}, long press to clear` : 'Set a due date'}
              className="flex-row items-center justify-center rounded-full active:opacity-70"
              style={{
                paddingHorizontal: S.md,
                minHeight: rs(38),
                borderWidth: 1.5,
                // An overdue promise turns the pill red — the shop reads this
                // row to decide whether to call, and "the 12th" means nothing
                // without knowing the 12th has passed.
                borderColor: overdue ? C.red : C.green,
                backgroundColor: '#FFFFFF',
                opacity: savingDue ? 0.6 : 1,
              }}
            >
              <CalendarClock size={rs(15)} color={overdue ? C.red : C.green} />
              <Text
                className="font-extrabold"
                style={{ fontSize: T.caption, color: overdue ? C.red : C.green, marginLeft: S.tight }}
                numberOfLines={1}
              >
                {dueDate ? niceDay(parseApiDate(dueDate)) : 'Due Date'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => dial('tel')}
              accessibilityRole="button"
              accessibilityLabel="Call this account"
              className="flex-1 flex-row items-center justify-center rounded-full active:opacity-85"
              style={{ minHeight: rs(38), backgroundColor: C.green }}
            >
              <Phone size={rs(15)} color="#FFFFFF" />
              <Text className="font-extrabold" style={{ fontSize: T.caption, color: '#FFFFFF', marginLeft: S.tight }}>
                Call
              </Text>
            </Pressable>

            {/* Straight to WhatsApp — no chooser in between. There is one right
                answer (the card, with the message as its caption), and a sheet
                asking which of two ways to send it was a tap that only ever had
                one sensible reply. Text-only survives as the automatic fallback
                inside remindByCard when the picture cannot be built. */}
            <Pressable
              onPress={remindByCard}
              disabled={cardBusy}
              accessibilityRole="button"
              accessibilityLabel="Send a payment reminder on WhatsApp"
              className="flex-1 flex-row items-center justify-center rounded-full active:opacity-85"
              style={{ minHeight: rs(38), backgroundColor: C.green, opacity: cardBusy ? 0.6 : 1 }}
            >
              <WhatsAppIcon size={rs(15)} color="#FFFFFF" />
              <Text className="font-extrabold" style={{ fontSize: T.caption, color: '#FFFFFF', marginLeft: S.tight }}>
                {cardBusy ? 'Preparing…' : 'Remind'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {statement.entries.length ? (
          <Pressable
            onPress={goStatement}
            accessibilityRole="button"
            accessibilityLabel={`Balance ${tone.label} ${money(statement.balance)}, open statement`}
            className="flex-row items-center justify-between active:opacity-70"
            style={{
              paddingHorizontal: S.lg,
              paddingVertical: S.sm,
              borderBottomWidth: 1,
              borderBottomColor: C.hairline,
            }}
          >
            <Text className="font-bold" style={{ fontSize: T.rowTitle, color: C.ink }}>
              Balance {tone.label}
            </Text>
            <View className="flex-row items-center">
              <Text className="font-extrabold" style={{ fontSize: T.screenTitle, color: tone.danger ? C.red : C.green }}>
                {money(statement.balance)}
              </Text>
              <ChevronRight size={rs(16)} color={C.muted} style={{ marginLeft: rs(2) }} />
            </View>
          </Pressable>
        ) : null}

        <View
          className="flex-row"
          style={{ paddingHorizontal: S.gutter, paddingTop: S.sm, gap: S.sm }}
        >
          <Pressable
            onPress={() => openEntry(RECEIVED)}
            className="flex-1 flex-row items-center justify-center active:opacity-85"
            style={{
              backgroundColor: C.greenSoft,
              paddingVertical: S.md,
              minHeight: SIZE.buttonMin,
              borderRadius: SIZE.radius,
            }}
          >
            <ArrowDown size={rs(16)} color={C.green} />
            <Text className="font-extrabold" style={{ fontSize: T.button, color: C.green, marginLeft: S.xs }}>
              Received
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openEntry(GIVEN)}
            className="flex-1 flex-row items-center justify-center active:opacity-85"
            style={{
              backgroundColor: C.redSoft,
              paddingVertical: S.md,
              minHeight: SIZE.buttonMin,
              borderRadius: SIZE.radius,
            }}
          >
            <ArrowUp size={rs(16)} color={C.red} />
            <Text className="font-extrabold" style={{ fontSize: T.button, color: C.red, marginLeft: S.xs }}>
              Given
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── More ─────────────────────────────────────────────────────────
          Deliberately NOT carrying the reference's "Auto Reminder": scheduling
          a recurring dunning message needs a server-side job and a consent
          record, neither of which exists yet, and a button that quietly does
          nothing is worse than an absent one. ── */}
      <Modal visible={more} transparent animationType="slide" onRequestClose={() => setMore(false)}>
        <Pressable
          onPress={() => setMore(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)' }}
        >
          <Pressable
            onPress={() => {}}
            className="bg-card"
            style={{
              borderTopLeftRadius: SIZE.radius,
              borderTopRightRadius: SIZE.radius,
              paddingTop: S.lg,
              paddingBottom: bottomInset(insets.bottom, S.lg),
              paddingHorizontal: S.lg,
            }}
          >
            <View className="flex-row flex-wrap" style={{ rowGap: S.lg }}>
              <MoreAction
                icon={Trash2}
                label="Delete"
                tint={C.red}
                bg={C.redSoft}
                onPress={removeParty}
              />
              <MoreAction
                icon={FileText}
                label="Statement"
                tint={C.green}
                bg={C.greenSoft}
                onPress={() => { setMore(false); goStatement(); }}
              />
              <MoreAction
                icon={Percent}
                label={'Give\nDiscount'}
                tint={C.green}
                bg={C.greenSoft}
                onPress={giveDiscount}
              />
              <MoreAction
                icon={Phone}
                label="Call"
                tint={C.green}
                bg={C.greenSoft}
                onPress={() => { setMore(false); dial('tel'); }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Off-screen, never visible: view-shot needs a laid-out, non-collapsed
          view to photograph, and a card inside a Modal would not be mounted
          when the capture runs. */}
      {cardReady ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: -9999, top: 0, width: REMINDER_CARD_WIDTH }}
        >
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} collapsable={false}>
            <ReminderCard
              shopName={shopName}
              shopPhone={shopPhone}
              shopLogoUrl={shopLogoUrl}
              customerName={party?.name}
              amount={statement.balance}
              dueLabel={dueDate ? niceDay(parseApiDate(dueDate)) : ''}
            />
          </ViewShot>
        </View>
      ) : null}

      {/* ── one entry's actions ──────────────────────────────────────── */}
      <Modal
        visible={!!entryAction}
        transparent
        animationType="slide"
        onRequestClose={() => setEntryAction(null)}
      >
        <Pressable
          onPress={() => setEntryAction(null)}
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)' }}
        >
          <Pressable
            onPress={() => {}}
            className="bg-card"
            style={{
              borderTopLeftRadius: SIZE.radius,
              borderTopRightRadius: SIZE.radius,
              paddingTop: S.lg,
              paddingBottom: bottomInset(insets.bottom, S.lg),
              paddingHorizontal: S.lg,
            }}
          >
            {entryAction ? (
              <>
                {/* Names the row being acted on. Two entries of the same amount
                    on one day are common, and a bare "Edit / Delete" pair gives
                    no way to tell which one the sheet belongs to. */}
                <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }}>
                  {entryAction.direction === RECEIVED ? 'Received' : 'Given'} {money(entryAction.amount)}
                </Text>
                <Text style={{ fontSize: T.rowSub, color: C.muted, marginTop: rs(2), marginBottom: S.lg }}>
                  {niceDay(parseApiDate(entryAction.entryDate))}
                  {entryAction.note ? ` · ${entryAction.note}` : ''}
                </Text>
                {/* Centred: MoreAction is a fixed quarter-width grid cell, so
                    two of them left-aligned would hang off one side. */}
                <View className="flex-row flex-wrap justify-center" style={{ rowGap: S.lg }}>
                  <MoreAction
                    icon={Pencil}
                    label="Edit"
                    tint={C.green}
                    bg={C.greenSoft}
                    onPress={() => {
                      const entry = entryAction;
                      setEntryAction(null);
                      navigation.navigate('OwnerLedgerEntryAdd', {
                        partyId, party, direction: entry.direction, entry,
                      });
                    }}
                  />
                  <MoreAction
                    icon={Trash2}
                    label="Delete"
                    tint={C.red}
                    bg={C.redSoft}
                    onPress={() => {
                      const entry = entryAction;
                      setEntryAction(null);
                      removeEntry(entry);
                    }}
                  />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable
          onPress={() => setPreview(null)}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(23, 33, 23, 0.92)' }}
        >
          {preview ? (
            <Image source={{ uri: preview }} style={{ width: '92%', height: '76%' }} resizeMode="contain" />
          ) : null}
          <Text className="text-white/70" style={{ fontSize: T.rowSub, marginTop: S.md }}>
            Tap anywhere to close
          </Text>
        </Pressable>
      </Modal>

      {/* allowFuture + minDate=today: a promise to pay is always ahead, which is
          the opposite of every other date this sheet picks. */}
      <LedgerDateSheet
        visible={dueOpen}
        value={parseApiDate(dueDate) || new Date()}
        minDate={new Date()}
        allowFuture
        quickDays={[5, 10, 15, 30]}
        tint={C.green}
        title="Due Date"
        onClose={() => setDueOpen(false)}
        onPick={saveDueDate}
      />
    </View>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

// One icon in the contact strip. Label under the glyph rather than beside it,
// so four fit across the narrowest phone without any of them truncating.
function QuickAction({ icon: Icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center active:opacity-60"
      style={{ paddingVertical: S.tight }}
    >
      <View
        className="items-center justify-center"
        style={{
          height: SIZE.tile,
          width: SIZE.tile,
          borderRadius: SIZE.tile / 2,
          backgroundColor: C.greenSoft,
        }}
      >
        <Icon size={rs(16)} color={C.green} />
      </View>
      <Text style={{ fontSize: T.caption, color: C.muted, marginTop: rs(2) }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// A tile in the More sheet. Fixed at a quarter width so the grid stays square
// whether there are four actions or eight.
function MoreAction({ icon: Icon, label, tint, bg, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label.replace('\n', ' ')}
      className="items-center active:opacity-70"
      style={{ width: '25%' }}
    >
      <View
        className="items-center justify-center"
        style={{ height: rs(50), width: rs(50), borderRadius: rs(25), backgroundColor: bg }}
      >
        <Icon size={rs(22)} color={tint} />
      </View>
      <Text
        className="text-center font-semibold"
        style={{ fontSize: T.rowSub, color: C.ink, marginTop: S.xs, lineHeight: T.rowSub * 1.3 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
