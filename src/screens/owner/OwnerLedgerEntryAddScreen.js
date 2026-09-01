import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Delete,
  FileText,
  Images,
  ImagePlus,
  Mic,
  Plus,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react-native';
import { notify } from '../../components/confirm';
import VoiceNotePlayer from '../../components/VoiceNotePlayer';
import { uploadMedia } from '../../api/masterData';
import { formatMoney } from './revenueMath';
import { rs } from '../../theme/metrics';
import LedgerDateSheet from './LedgerDateSheet';
import {
  C,
  S,
  SIZE,
  T,
  avatarFor,
  avatarInitialSize,
  bottomInset,
  headerStyle,
} from './ledgerUi';
import {
  RECEIVED,
  balanceTone,
  createEntry,
  updateEntry,
  formatPhone,
  normalizePhone,
  searchShopBookings,
} from '../../api/ledgerParties';

/* ══════════════════════════════════════════════════════════════════════════
   Record money on an account — Received (they paid the shop) or Given (the
   shop paid them). Which one is fixed by the button that opened this screen;
   it is not switchable here, because "how much" and "which direction" being one
   decision is exactly how a receipt gets booked as a payment.

   WHY AN IN-APP KEYPAD RATHER THAN THE OS KEYBOARD
   The counter amount is rarely one number — it is "1000 + 1000", or a total
   minus a part already paid. On the system keypad that arithmetic happens in the
   owner's head while a customer waits, and the whole lower half of the screen is
   covered, so the note, the date and the bills all sat below the fold. The keys
   here carry + − × and =, the running expression is shown under the total, and
   the fields stay visible the entire time. The system keyboard is still used for
   the note — that one really is free text.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY_BG = '#FFFFFF';

const MAX_BILLS = 10;        // matches ShopLedgerEntryService.MAX_BILLS
const MAX_INT_DIGITS = 9;    // amount is NUMERIC(14,2) server-side

// What attaching a booking means nine times out of ten: a deposit on a job that
// is still on the bench. Prefilled, never forced — the note stays editable.
const ADVANCE_NOTE = 'Advance payment';

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const shortDate = (date) =>
  date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

function dayLabel(date) {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return shortDate(date);
}

const mmss = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/* ── the amount expression ────────────────────────────────────────────────
   Held as a plain string ("1000+1000") in ASCII operators, and evaluated
   strictly left to right. NOT operator precedence: a shop counter reads
   "500+200×2" as the running tape of a calculator, and silently applying
   school-book precedence would book a different number than the one the owner
   watched themselves type. ── */

const isOp = (ch) => ch === '+' || ch === '-' || ch === '*';

/**
 * Is there arithmetic still open, i.e. is the tape worth showing?
 *
 * Position 0 is skipped because a leading "−" is a negative first operand, not
 * an operation: `=` on "5−8" collapses to "-3", and that result is a number the
 * owner is still editing, not a sum in progress.
 */
const hasOperator = (expr) => /[+\-*]/.test(String(expr).slice(1));

function evaluateExpr(expr) {
  let body = String(expr);
  // A leading minus belongs to the first operand. Left in the token stream it
  // would be read as an operator with nothing on its left and dropped, which
  // silently turned an over-subtraction into the same amount POSITIVE — a
  // Given of 3 booked where the owner had just proved they owed nothing.
  const negative = body.startsWith('-');
  if (negative) body = body.slice(1);

  const tokens = body.match(/\d+\.?\d*|[+\-*]/g) || [];
  let acc = null;
  let op = null;
  for (const t of tokens) {
    if (isOp(t)) { op = t; continue; }
    const n = parseFloat(t);
    if (!Number.isFinite(n)) continue;
    if (acc === null) acc = negative ? -n : n;
    else if (op === '+') acc += n;
    else if (op === '-') acc -= n;
    else if (op === '*') acc *= n;
    op = null;
  }
  // Two decimals, the same scale the column stores — otherwise 0.1+0.2 books
  // as 0.30000000000000004 and the statement never adds up.
  return acc === null ? 0 : Math.round(acc * 100) / 100;
}

/** `1234567.5` → `12,34,567.5`, keeping the decimals exactly as typed. */
function groupIndian(raw) {
  const [int, dec] = String(raw).split('.');
  const head = (Number(int) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return dec === undefined ? head : `${head}.${dec}`;
}

const prettyExpr = (expr) => expr.replace(/\*/g, ' × ').replace(/-/g, ' − ').replace(/\+/g, ' + ');

/**
 * One key press against the current expression.
 *
 * Written as a pure function of the previous string so the keypad can stay a
 * dumb grid, and so every guard (one dot per operand, no leading operator, no
 * runaway digit count) lives in exactly one place.
 */
function applyKey(prev, k) {
  if (k === 'back') return prev.slice(0, -1);
  if (k === '=') {
    const v = evaluateExpr(prev);
    return v ? String(v) : '';
  }
  if (isOp(k)) {
    if (!prev) return prev;                                    // never start with an operator
    if (isOp(prev.slice(-1))) return prev.slice(0, -1) + k;     // "1000+" then × → "1000×"
    if (prev.endsWith('.')) return `${prev.slice(0, -1)}${k}`;  // "10." then + → "10+"
    return prev + k;
  }

  const lastOpAt = Math.max(prev.lastIndexOf('+'), prev.lastIndexOf('-'), prev.lastIndexOf('*'));
  const operand = prev.slice(lastOpAt + 1);

  if (k === '.') {
    if (operand.includes('.')) return prev;
    return operand ? `${prev}.` : `${prev}0.`;
  }

  const [int, dec] = operand.split('.');
  if (dec !== undefined) {
    if (dec.length >= 2) return prev;          // paise, and no further
  } else if (int.length >= MAX_INT_DIGITS) {
    return prev;
  }
  if (operand === '0') return prev.slice(0, -1) + k;   // "0" then 5 → "5", not "05"
  return prev + k;
}

/* ── voice note ───────────────────────────────────────────────────────────
   Same shape as the chat thread's recorder. A note typed one-handed at a
   counter, mid-conversation with the customer whose money is being booked,
   mostly does not get typed at all — and an entry with no reason on it is the
   one nobody can settle an argument with a month later. ── */

function useVoiceRecorder() {
  const [recording, setRecording] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  // Mirrors `recording` for the unmount cleanup below, which must not re-run
  // (and re-unload an already-stopped recording) every time state changes.
  const liveRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        notify('Microphone needed', 'Allow microphone access to record a voice note.');
        return false;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const r = new Audio.Recording();
      await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await r.startAsync();
      liveRef.current = r;
      setRecording(r);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return true;
    } catch {
      notify('Could not record', 'The microphone is busy — try again.', { preset: 'error' });
      return false;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!recording) return null;
    clearTimer();
    liveRef.current = null;
    setRecording(null);
    const seconds = elapsed;
    setElapsed(0);
    try {
      await recording.stopAndUnloadAsync();
      return { uri: recording.getURI(), seconds };
    } catch {
      return null;
    }
  }, [recording, elapsed]);

  const cancel = useCallback(async () => {
    if (!recording) return;
    clearTimer();
    liveRef.current = null;
    setRecording(null);
    setElapsed(0);
    try { await recording.stopAndUnloadAsync(); } catch { /* already gone */ }
  }, [recording]);

  // Leaving the screen mid-recording must release the mic, or the next screen
  // that wants it gets a hardware-busy failure with nothing on screen to explain
  // it. Unmount only — hence the ref rather than `recording` in the deps.
  useEffect(() => () => {
    clearTimer();
    const live = liveRef.current;
    liveRef.current = null;
    if (live) live.stopAndUnloadAsync().catch(() => {});
  }, []);

  return { recording, elapsed, start, stop, cancel };
}

/* ── screen ───────────────────────────────────────────────────────────── */

export default function OwnerLedgerEntryAddScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const partyId = route.params?.partyId;
  const party = route.params?.party || null;
  // Editing an existing row rather than adding one. The whole screen is reused
  // — same keypad, same date, same bills — because an edit that offered fewer
  // fields than the original entry would be a second, weaker form.
  const editing = route.params?.entry || null;
  const direction = editing?.direction || route.params?.direction || RECEIVED;

  const isIn = direction === RECEIVED;
  const tint = isIn ? C.green : C.red;

  // Seeded from the row being edited so the keypad opens on the current amount
  // — an edit almost always adjusts a figure rather than replacing it.
  const [expr, setExpr] = useState(() =>
    editing?.amount != null ? String(Number(editing.amount)) : '');
  // Seeded, not forced: "Give Discount" arrives with the word already typed so
  // the row is labelled even if the owner only enters an amount, but it stays
  // an ordinary editable note they can replace.
  const [note, setNote] = useState(editing?.note || route.params?.presetNote || '');
  const [noteFocused, setNoteFocused] = useState(false);
  const [date, setDate] = useState(() => {
    // `YYYY-MM-DD` parsed as LOCAL, never through new Date(str): that reads as
    // UTC midnight and an edit would silently move the row a day earlier.
    const iso = editing?.entryDate;
    if (iso) {
      const [y, m, d] = String(iso).split('-').map(Number);
      if (y && m && d) return new Date(y, m - 1, d);
    }
    return startOfDay(new Date());
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  // The repair this money is against, when it is one — the advance case. Only
  // the id is sent; the label here is for this screen and is re-derived
  // server-side so the saved row can't disagree with the repair record.
  const [ticket, setTicket] = useState(() =>
    editing?.ticketId
      ? {
        id: editing.ticketId,
        trackingId: editing.ticketTrackingId,
        label: editing.ticketLabel,
      }
      : null);

  // Bills, each optimistic: the local photo shows immediately with a spinner,
  // and `url` fills in once storage has it. Only rows with a url are submitted.
  // Already-uploaded URLs come back as finished rows: no local uri, no spinner.
  const [bills, setBills] = useState(() =>
    (editing?.billUrls || []).map((url, i) => ({ id: `saved-${i}`, url, uri: url })));
  const billSeq = useRef(0);

  // Seconds are unknown for a saved note — the player reads the real duration
  // off the file, so 0 only affects the label until it loads.
  const [voice, setVoice] = useState(
    editing?.noteAudioUrl ? { url: editing.noteAudioUrl, seconds: 0 } : null,
  );
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorder = useVoiceRecorder();

  // Anything that hands input back to the keypad has to actually blur the note
  // — flipping the flag alone leaves the system keyboard up with our keypad
  // stacked under it, and the keys the owner can see stop being the ones typing.
  const noteRef = useRef(null);
  const dismissNote = useCallback(() => {
    noteRef.current?.blur?.();
    Keyboard.dismiss();
    setNoteFocused(false);
  }, []);

  const amount = useMemo(() => evaluateExpr(expr), [expr]);
  const showsExpr = hasOperator(expr);
  const display = showsExpr ? groupIndian(String(amount)) : groupIndian(expr || '0');

  const uploading = voiceBusy || bills.some((b) => !b.url);
  const canSubmit = amount > 0 && !saving && !uploading && !recorder.recording;

  // The one row has to speak for everything the menu can attach, or attaching a
  // booking and no photo leaves it still reading "Add Bills".
  const attachedSummary = useMemo(() => {
    const parts = [];
    if (bills.length) parts.push(`${bills.length} bill${bills.length > 1 ? 's' : ''}`);
    if (ticket) parts.push(ticket.trackingId);
    return parts.join(' · ');
  }, [bills.length, ticket]);

  const tone = balanceTone(party?.balance);
  const { color, ink, initial } = avatarFor(party?.name);

  /* ── amount caret ─────────────────────────────────────────────────── */
  const caret = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Blink only while the keypad owns input. With the note focused a caret
    // sitting on the amount points at a field the keys no longer reach.
    if (noteFocused) { caret.setValue(0); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 480, delay: 380, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [caret, noteFocused]);

  /* ── voice note ───────────────────────────────────────────────────── */

  const finishRecording = async () => {
    const result = await recorder.stop();
    if (!result?.uri) return;
    if (result.seconds < 1) {
      notify('Too short', 'Hold the mic a little longer to record a note.');
      return;
    }
    setVoiceBusy(true);
    try {
      const url = await uploadMedia(
        { uri: result.uri, name: 'voice-note.m4a', type: 'audio/m4a' },
        'cashbook',
        { slot: 'voice' },
      );
      if (!url) throw new Error('Upload returned no URL');
      setVoice({ url, seconds: result.seconds });
    } catch (e) {
      notify('Voice note failed', e?.message || 'Please record it again', { preset: 'error' });
    } finally {
      setVoiceBusy(false);
    }
  };

  const toggleMic = () => {
    if (recorder.recording) { finishRecording(); return; }
    if (voice) {
      notify('One voice note per entry', 'Delete the current note to record another.');
      return;
    }
    dismissNote();
    recorder.start();
  };

  /* ── attachments: a photo, or the job the money is against ────────── */

  // One menu, three ways to back an amount up. Which one is opened is decided
  // here rather than in the sheet, so the sheet stays a dumb list of choices.
  const pickSource = (choice) => {
    setSourceOpen(false);
    if (choice === 'booking') {
      // A frame after the first sheet is told to close. Opening the second in
      // the same commit asks the platform to present a modal while one is still
      // dismissing, which on iOS drops the new one silently — the owner taps
      // Booking and simply nothing happens.
      requestAnimationFrame(() => setBookingOpen(true));
      return;
    }
    addBill(choice);
  };

  const attachBooking = (row) => {
    setBookingOpen(false);
    setTicket(row);
    // Prefill only when the owner has not written their own reason. An advance
    // against a job is what this attachment almost always means, but a note
    // they already typed is a deliberate one and must not be overwritten.
    setNote((current) => (current.trim() ? current : ADVANCE_NOTE));
  };

  const addBill = async (from) => {
    if (bills.length >= MAX_BILLS) {
      notify('Enough bills', `Up to ${MAX_BILLS} photos can be attached to one entry.`);
      return;
    }
    const perm = from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify(
        'Permission needed',
        from === 'camera' ? 'Allow camera access to photograph a bill.' : 'Allow photo access to attach a bill.',
      );
      return;
    }

    const opts = { quality: 0.7, mediaTypes: ['images'] };
    const result = from === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = result?.assets?.[0];
    if (result?.canceled || !asset) return;

    billSeq.current += 1;
    const id = billSeq.current;
    setBills((list) => [...list, { id, uri: asset.uri, url: null }]);
    try {
      const url = await uploadMedia(asset, 'cashbook', { slot: 'bill' });
      if (!url) throw new Error('Upload returned no URL');
      setBills((list) => list.map((b) => (b.id === id ? { ...b, url } : b)));
    } catch (e) {
      // Drop the tile rather than leave it spinning — a stuck tile blocks
      // Confirm with nothing on screen saying why.
      setBills((list) => list.filter((b) => b.id !== id));
      notify('Bill upload failed', e?.message || 'Please try again', { preset: 'error' });
    }
  };

  const removeBill = (id) => setBills((list) => list.filter((b) => b.id !== id));

  /* ── submit ───────────────────────────────────────────────────────── */

  const submit = async () => {
    if (recorder.recording) {
      notify('Still recording', 'Stop the voice note first.');
      return;
    }
    if (amount <= 0) {
      notify('Enter an amount', 'The amount must be greater than zero', { preset: 'error' });
      return;
    }
    if (uploading) {
      notify('Almost there', 'Wait for the attachments to finish uploading.');
      return;
    }
    setSaving(true);
    try {
      // Every field goes on an edit too, not just the changed ones: the form
      // holds the row's complete state, so sending all of it is what lets a
      // bill be REMOVED. A partial patch could only ever add.
      const payload = {
        direction,
        amount,
        entryDate: date,
        note,
        noteAudioUrl: voice?.url || '',
        billUrls: bills.map((b) => b.url).filter(Boolean),
        ticketId: ticket?.id,
      };
      if (editing) await updateEntry(editing.id, payload);
      else await createEntry(partyId, payload);
      notify(
        editing ? 'Updated' : 'Saved',
        `${isIn ? 'Received' : 'Given'} ${editing ? 'entry updated' : 'recorded'}`,
        { preset: 'done' },
      );
      // Back to the statement, which refetches on focus and will show this row.
      // popTo on the fallback, so a saved entry can never leave its own form
      // sitting behind the back button (React Navigation 7's navigate pushes).
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.popTo('OwnerLedgerPartyDetail', { partyId, party });
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
          onPress={() => navigation.goBack()}
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
            {party?.name || (isIn ? 'Received' : 'Given')}
          </Text>
          {/* The balance only when the caller actually passed one — a party
              opened without it would otherwise read "₹ 0 Due", which is a
              statement about the account, not a missing value. */}
          {Number.isFinite(Number(party?.balance)) ? (
            <Text className="font-semibold" style={{ fontSize: T.rowSub, color: tone.danger ? C.red : C.muted }}>
              {formatMoney(Math.abs(Number(party.balance)))} {tone.label}
            </Text>
          ) : party?.phone ? (
            <Text style={{ fontSize: T.rowSub, color: C.muted }} numberOfLines={1}>{formatPhone(party.phone)}</Text>
          ) : null}
        </View>
        {/* The direction is decided before this screen opens, so it is stated,
            not offered — a switch here is how a receipt becomes a payment.
            On an edit it also says EDIT, because every other pixel of this
            screen is identical to the add form and nothing else would tell the
            owner they are changing a row rather than writing a new one. */}
        <View
          className="flex-row items-center rounded-full"
          style={{ backgroundColor: `${tint}18`, paddingHorizontal: S.sm, paddingVertical: S.tight }}
        >
          {isIn ? <ArrowDown size={rs(13)} color={tint} /> : <ArrowUp size={rs(13)} color={tint} />}
          <Text className="font-extrabold" style={{ fontSize: T.chip, color: tint, marginLeft: rs(3) }}>
            {editing ? `Edit ${isIn ? 'Received' : 'Given'}` : (isIn ? 'Received' : 'Given')}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: S.lg,
            paddingTop: S.md,
            paddingBottom: S.md,
          }}
        >
          {/* ── amount ───────────────────────────────────────────────── */}
          <Pressable onPress={dismissNote} className="items-center">
            <View className="flex-row items-center justify-center">
              <Text className="font-extrabold" style={{ fontSize: T.hero * 0.72, color: tint }}>₹</Text>
              <Text
                className="font-extrabold"
                style={{ fontSize: T.hero, color: expr ? tint : C.chipBg, marginLeft: rs(2) }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {display}
              </Text>
              <Animated.View
                style={{
                  opacity: caret,
                  width: rs(2),
                  height: rs(32),
                  marginLeft: rs(3),
                  borderRadius: rs(1),
                  backgroundColor: tint,
                }}
              />
            </View>
            <View
              style={{
                height: rs(2),
                width: '76%',
                marginTop: S.sm,
                borderRadius: rs(1),
                backgroundColor: tint,
                opacity: 0.45,
              }}
            />
            {/* The tape. Shown only while a calculation is open, so the owner can
                check the working that produced the total above it. */}
            {showsExpr ? (
              <Text className="font-semibold" style={{ fontSize: T.rowSub, color: C.muted, marginTop: S.xs }}>
                {prettyExpr(expr)}
              </Text>
            ) : null}
          </Pressable>

          {/* ── note: typed, spoken, or both ─────────────────────────── */}
          <View
            style={{
              backgroundColor: C.field,
              borderWidth: 1,
              borderColor: recorder.recording ? `${tint}55` : C.hairline,
              borderRadius: SIZE.radius,
              marginTop: S.xl,
            }}
          >
            {recorder.recording ? (
              <View className="flex-row items-center" style={{ paddingHorizontal: S.md, paddingVertical: S.xs }}>
                <View style={{ height: rs(8), width: rs(8), borderRadius: rs(4), backgroundColor: C.red }} />
                <Text
                  className="font-bold flex-1"
                  style={{ fontSize: T.rowTitle, color: C.ink, marginLeft: S.sm }}
                >
                  Recording… {mmss(recorder.elapsed)}
                </Text>
                <Pressable
                  onPress={() => recorder.cancel()}
                  hitSlop={rs(10)}
                  className="rounded-full items-center justify-center active:opacity-70"
                  style={{ height: SIZE.tile, width: SIZE.tile }}
                >
                  <Trash2 size={rs(16)} color={C.red} />
                </Pressable>
                <Pressable
                  onPress={finishRecording}
                  hitSlop={rs(10)}
                  className="rounded-full items-center justify-center active:opacity-70"
                  style={{ height: SIZE.tile, width: SIZE.tile, marginLeft: S.tight, backgroundColor: tint }}
                >
                  <Check size={rs(16)} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <View className="flex-row items-center" style={{ paddingHorizontal: S.md }}>
                <FileText size={rs(17)} color={tint} />
                <TextInput
                  ref={noteRef}
                  value={note}
                  onChangeText={setNote}
                  onFocus={() => setNoteFocused(true)}
                  onBlur={() => setNoteFocused(false)}
                  placeholder="Add Notes"
                  placeholderTextColor={C.placeholder}
                  maxLength={500}
                  className="flex-1"
                  style={{ paddingVertical: S.md, marginLeft: S.sm, fontSize: T.input, color: C.ink }}
                />
                <Pressable
                  onPress={toggleMic}
                  hitSlop={rs(10)}
                  disabled={voiceBusy}
                  className="rounded-full items-center justify-center active:opacity-70"
                  style={{ height: SIZE.tile, width: SIZE.tile }}
                >
                  {voiceBusy ? <ActivityIndicator size="small" color={tint} /> : <Mic size={rs(17)} color={tint} />}
                </Pressable>
              </View>
            )}

            {voice ? (
              <View
                className="flex-row items-center"
                style={{
                  paddingHorizontal: S.md,
                  paddingVertical: S.xs,
                  borderTopWidth: 1,
                  borderTopColor: C.hairline,
                }}
              >
                <VoiceNotePlayer url={voice.url} seconds={voice.seconds} tint={tint} compact />
                <Pressable
                  onPress={() => setVoice(null)}
                  hitSlop={rs(10)}
                  className="rounded-full items-center justify-center active:opacity-70"
                  style={{ height: SIZE.tile, width: SIZE.tile }}
                >
                  <Trash2 size={rs(15)} color={C.red} />
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* ── entry date ───────────────────────────────────────────── */}
          <Pressable
            onPress={() => { dismissNote(); setDateOpen(true); }}
            className="flex-row items-center active:opacity-70"
            style={{
              backgroundColor: C.field,
              borderWidth: 1,
              borderColor: C.hairline,
              borderRadius: SIZE.radius,
              paddingHorizontal: S.md,
              paddingVertical: S.xs,
              marginTop: S.sm,
            }}
          >
            <CalendarDays size={rs(17)} color={tint} />
            <View className="flex-1" style={{ marginLeft: S.sm }}>
              <Text style={{ fontSize: T.caption, color: C.muted }}>Entry Date</Text>
              <Text className="font-bold" style={{ fontSize: T.rowTitle, color: C.ink }}>
                {shortDate(date)}
              </Text>
            </View>
            <Text
              className="font-semibold"
              style={{ fontSize: T.rowSub, color: tint, marginRight: S.tight }}
            >
              {dayLabel(date)}
            </Text>
            <ChevronRight size={rs(16)} color={C.muted} />
          </Pressable>

          {/* ── bills ────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => { dismissNote(); setSourceOpen(true); }}
            className="flex-row items-center active:opacity-70"
            style={{
              backgroundColor: C.field,
              borderWidth: 1,
              borderColor: C.hairline,
              borderRadius: SIZE.radius,
              paddingHorizontal: S.md,
              paddingVertical: S.md,
              marginTop: S.sm,
            }}
          >
            <ImagePlus size={rs(17)} color={tint} />
            <Text
              className="flex-1"
              style={{ fontSize: T.input, marginLeft: S.sm, color: attachedSummary ? C.ink : C.placeholder }}
            >
              {attachedSummary || 'Add Bills'}
            </Text>
            <Plus size={rs(17)} color={tint} />
          </Pressable>

          {/* The job this money is against. Sits with the bills because it came
              out of the same menu, and because it is the same kind of thing:
              proof of what the amount was for. */}
          {ticket ? (
            <View
              className="flex-row items-center"
              style={{
                backgroundColor: `${tint}0F`,
                borderWidth: 1,
                borderColor: `${tint}33`,
                borderRadius: SIZE.radius,
                paddingHorizontal: S.md,
                paddingVertical: S.sm,
                marginTop: S.sm,
              }}
            >
              <Ticket size={rs(17)} color={tint} />
              <View className="flex-1" style={{ marginLeft: S.sm }}>
                <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }} numberOfLines={1}>
                  {ticket.trackingId} · {ticket.label}
                </Text>
                <Text style={{ fontSize: T.caption, color: C.muted }} numberOfLines={1}>
                  {[ticket.status, ticket.amount ? formatMoney(ticket.amount) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Pressable
                onPress={() => setTicket(null)}
                hitSlop={rs(10)}
                className="rounded-full items-center justify-center active:opacity-70"
                style={{ height: SIZE.tile, width: SIZE.tile }}
              >
                <X size={rs(15)} color={C.muted} />
              </Pressable>
            </View>
          ) : null}

          {bills.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: S.sm, paddingRight: S.tight }}
            >
              {bills.map((b) => (
                <View key={b.id} style={{ marginRight: S.sm }}>
                  <Pressable
                    onPress={() => b.url && setPreview(b.url)}
                    className="overflow-hidden active:opacity-80"
                    style={{
                      height: rs(62),
                      width: rs(62),
                      borderRadius: SIZE.radiusSm,
                      backgroundColor: C.chipBg,
                    }}
                  >
                    <Image
                      source={{ uri: b.url || b.uri }}
                      style={{ height: rs(62), width: rs(62) }}
                      resizeMode="cover"
                    />
                    {!b.url ? (
                      <View
                        className="items-center justify-center"
                        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(23, 33, 23, 0.45)' }]}
                      >
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => removeBill(b.id)}
                    // The badge itself stays small so it doesn't cover the bill;
                    // the slop is what carries it past the 44pt touch minimum.
                    hitSlop={rs(14)}
                    className="absolute items-center justify-center active:opacity-70"
                    style={{
                      top: -rs(5),
                      right: -rs(5),
                      height: rs(20),
                      width: rs(20),
                      borderRadius: rs(10),
                      backgroundColor: C.ink,
                    }}
                  >
                    <X size={rs(11)} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </ScrollView>

        {/* ── confirm + keypad ─────────────────────────────────────────── */}
        <View
          className="bg-card"
          style={{
            paddingHorizontal: S.md,
            paddingTop: S.sm,
            borderTopWidth: 1,
            borderTopColor: C.hairline,
            // While the note is being typed the system keyboard, not the gesture
            // bar, is what sits under this — padding for both stacks up as a gap.
            paddingBottom: noteFocused ? S.md : bottomInset(insets.bottom, S.sm),
          }}
        >
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            className="flex-row items-center justify-center active:opacity-85"
            style={{
              backgroundColor: tint,
              paddingVertical: S.md,
              minHeight: SIZE.buttonMin,
              borderRadius: SIZE.radius,
              opacity: canSubmit ? 1 : 0.55,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Check size={rs(17)} color="#FFFFFF" />
                <Text className="text-white font-extrabold" style={{ fontSize: T.button, marginLeft: S.xs }}>
                  {uploading ? 'Uploading…' : 'Confirm'}
                </Text>
              </>
            )}
          </Pressable>

          {/* The system keyboard owns the screen while the note is being typed;
              stacking our keypad under it would only push the note out of view. */}
          {noteFocused ? null : <Keypad tint={tint} onKey={(k) => setExpr((p) => applyKey(p, k))} />}
        </View>
      </KeyboardAvoidingView>

      <LedgerDateSheet
        visible={dateOpen}
        value={date}
        tint={tint}
        onClose={() => setDateOpen(false)}
        onPick={(d) => { setDate(d); setDateOpen(false); }}
      />

      <SourceSheet
        visible={sourceOpen}
        tint={tint}
        onClose={() => setSourceOpen(false)}
        onPick={pickSource}
      />

      <BookingSheet
        visible={bookingOpen}
        tint={tint}
        phone={party?.phone}
        onClose={() => setBookingOpen(false)}
        onPick={attachBooking}
      />

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
    </View>
  );
}

/* ── keypad ───────────────────────────────────────────────────────────── */

const KEY_ROWS = [
  ['1', '2', '3', 'back'],
  ['4', '5', '6', '*'],
  ['7', '8', '9', '-'],
  ['.', '0', '=', '+'],
];

const KEY_LABEL = { '*': '×', '-': '−', '+': '+', '=': '=' };

function Keypad({ tint, onKey }) {
  return (
    <View style={{ marginTop: S.sm }}>
      {KEY_ROWS.map((row) => (
        <View key={row.join('')} className="flex-row" style={{ marginBottom: S.xs }}>
          {row.map((k) => {
            const isAction = k === 'back' || isOp(k) || k === '=';
            return (
              <Pressable
                key={k}
                onPress={() => onKey(k)}
                className="flex-1 items-center justify-center active:opacity-60"
                style={{
                  marginHorizontal: S.tight / 2,
                  // A key has to stay thumb-sized: this is the one control the
                  // owner hits over and over, standing at a counter.
                  paddingVertical: S.md,
                  borderRadius: SIZE.radiusSm,
                  backgroundColor: isAction ? `${tint}12` : KEY_BG,
                  borderWidth: 1,
                  borderColor: isAction ? `${tint}22` : C.hairline,
                }}
              >
                {k === 'back' ? (
                  <Delete size={rs(19)} color={tint} />
                ) : (
                  <Text
                    className="font-bold"
                    // Operators a hair smaller than digits: "×" and "−" carry
                    // more ink at the same point size and read heavier otherwise.
                    style={{ fontSize: isAction ? T.keypad - 1 : T.keypad, color: isAction ? tint : C.ink }}
                  >
                    {KEY_LABEL[k] || k}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* ── camera / gallery / booking sheet ─────────────────────────────────── */

function SourceSheet({ visible, tint, onClose, onPick }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)' }}
      >
        <Pressable
          onPress={() => {}}
          className="bg-card"
          style={{ borderTopLeftRadius: SIZE.radius * 1.5, borderTopRightRadius: SIZE.radius * 1.5 }}
        >
          <View className="items-center" style={{ paddingTop: S.sm }}>
            <View style={{ height: rs(4), width: rs(34), borderRadius: rs(2), backgroundColor: C.chipBg }} />
          </View>
          <Text className="font-extrabold text-center" style={{ fontSize: T.rowTitle, color: C.ink, marginTop: S.sm }}>
            Attach to this entry
          </Text>
          <View className="flex-row justify-center" style={{ paddingVertical: S.lg, gap: rs(28) }}>
            <SourceButton icon={Camera} label="Camera" tint={tint} onPress={() => onPick('camera')} />
            <SourceButton icon={Images} label="Gallery" tint={tint} onPress={() => onPick('gallery')} />
            <SourceButton icon={Ticket} label="Booking" tint={tint} onPress={() => onPick('booking')} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SourceButton({ icon: Icon, label, tint, onPress }) {
  return (
    <Pressable onPress={onPress} className="items-center active:opacity-70">
      <View
        className="items-center justify-center"
        style={{ height: rs(52), width: rs(52), borderRadius: rs(26), backgroundColor: `${tint}18` }}
      >
        <Icon size={rs(22)} color={tint} />
      </View>
      <Text className="font-bold" style={{ fontSize: T.rowSub, color: C.ink, marginTop: S.xs }}>{label}</Text>
    </Pressable>
  );
}

/* ── booking picker ───────────────────────────────────────────────────────
   The shop's own jobs, found by phone number.

   Opens on the account's number because that is who is standing at the counter,
   but stays a search box: repairs are routinely booked under a husband's,
   a son's or a shop's number, and a deposit that cannot be attached to the job
   it was paid on is the whole reason this picker exists. Only this shop's
   tickets are reachable — `/tickets` scopes to the token's shop, so the field
   cannot be used to look into anyone else's book. ── */

function BookingSheet({ visible, tint, phone, onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Every search stamps this; a response whose stamp is stale is dropped, so a
  // slow early request can't overwrite the results of a later, narrower one.
  const runRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setQuery(formatPhone(phone || ''));
  }, [visible, phone]);

  // Debounced, and re-run when the sheet opens so the account's own jobs are
  // already listed before the owner types anything.
  useEffect(() => {
    if (!visible) return undefined;
    const term = query.trim();
    if (!term) { setRows([]); setSearched(false); return undefined; }
    const run = runRef.current + 1;
    runRef.current = run;
    setLoading(true);
    const timer = setTimeout(async () => {
      // Digits only for anything phone-shaped: the field shows "98765 43210"
      // but the ticket stores the number unspaced, so the space would match
      // nothing. A tracking id or a name is passed through untouched.
      const looksLikePhone = /^[\d\s+()-]+$/.test(term);
      const search = looksLikePhone ? normalizePhone(term) : term;
      try {
        const found = await searchShopBookings(search);
        if (runRef.current !== run) return;
        setRows(found);
      } catch {
        if (runRef.current !== run) return;
        setRows([]);
      } finally {
        if (runRef.current === run) { setLoading(false); setSearched(true); }
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [visible, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)' }}
      >
        <Pressable
          onPress={() => {}}
          className="bg-card"
          style={{
            borderTopLeftRadius: SIZE.radius * 1.5,
            borderTopRightRadius: SIZE.radius * 1.5,
            paddingBottom: S.md,
            maxHeight: '78%',
          }}
        >
          <View className="items-center" style={{ paddingTop: S.sm }}>
            <View style={{ height: rs(4), width: rs(34), borderRadius: rs(2), backgroundColor: C.chipBg }} />
          </View>
          <Text
            className="font-extrabold text-center"
            style={{ fontSize: T.rowTitle, color: C.ink, marginTop: S.sm }}
          >
            Select a booking
          </Text>

          <View
            className="flex-row items-center"
            style={{
              backgroundColor: C.field,
              borderWidth: 1,
              borderColor: C.hairline,
              borderRadius: SIZE.radius,
              paddingHorizontal: S.md,
              marginHorizontal: S.lg,
              marginTop: S.sm,
            }}
          >
            <Search size={rs(16)} color={C.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Mobile number or ticket id"
              placeholderTextColor={C.placeholder}
              keyboardType="default"
              autoCorrect={false}
              className="flex-1"
              style={{ paddingVertical: S.sm, marginLeft: S.sm, fontSize: T.input, color: C.ink }}
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={rs(10)}
                className="rounded-full items-center justify-center active:opacity-70"
                style={{ height: SIZE.tile, width: SIZE.tile }}
              >
                <X size={rs(14)} color={C.muted} />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View className="items-center" style={{ paddingVertical: S.xl }}>
              <ActivityIndicator color={tint} />
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.sm }}
            >
              {rows.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => onPick(row)}
                  className="flex-row items-center active:opacity-70"
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: C.hairline,
                    paddingVertical: S.md,
                  }}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      height: SIZE.avatarMd,
                      width: SIZE.avatarMd,
                      borderRadius: SIZE.radiusSm,
                      backgroundColor: `${tint}14`,
                    }}
                  >
                    <Ticket size={rs(17)} color={tint} />
                  </View>
                  <View className="flex-1" style={{ marginLeft: S.sm }}>
                    <Text
                      className="font-extrabold"
                      style={{ fontSize: T.rowTitle, color: C.ink }}
                      numberOfLines={1}
                    >
                      {row.trackingId}
                    </Text>
                    <Text style={{ fontSize: T.rowSub, color: C.muted }} numberOfLines={1}>
                      {[row.label, row.customerName].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View className="items-end" style={{ marginLeft: S.xs }}>
                    {row.amount ? (
                      <Text className="font-bold" style={{ fontSize: T.rowAmount, color: C.ink }}>
                        {formatMoney(row.amount)}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: T.caption, color: C.muted }} numberOfLines={1}>
                      {row.status}
                    </Text>
                  </View>
                </Pressable>
              ))}

              {!rows.length ? (
                <Text
                  className="text-center"
                  style={{ fontSize: T.rowSub, color: C.muted, paddingVertical: S.xl }}
                >
                  {searched
                    ? 'No bookings found for that number.'
                    : 'Enter a mobile number or ticket id to find a booking.'}
                </Text>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
