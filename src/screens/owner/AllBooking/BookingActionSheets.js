// Action sheets for the Bookings list, opened from a card's action row — a
// ticket card tap itself goes straight to the ticket and opens nothing.
//
// Four bottom sheets — the first two for tickets, the last two for pickup
// rows, which are repair-bookings and have their own verbs:
//   TechnicianPickerSheet — the technician list on its own
//   ShareReceiptSheet     — image-to-WhatsApp vs details-by-SMS, the same two
//                           options TicketDetailScreen offers.
//   PickupStatusSheet     — where the pickup is, and the one stage move the
//                           shop can make from here
//   PickupPersonPickerSheet — the pickup-eligible staff list
//
// All four follow the fade-in scrim + stopPropagation idiom already used by
// the Share Receipt sheet in TicketDetailScreen, so they look native here.
//
// The receipt PNG is captured from a hidden <ViewShot> owned by the *host*
// screen (see BookingHistoryScreen) rather than by these modals: a view inside
// a closed Modal isn't mounted, so captureRef would fail. The host passes the
// capture down as onShareReceipt.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View,
  useWindowDimensions,
  // Aliased: `Keyboard` below is the lucide GLYPH used on the "Enter IMEI" row.
  Keyboard as RNKeyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Share2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  UserRound,
  UserCog,
  Phone,
  MessageSquare,
  CheckCircle2,
  PackageCheck,
  Truck,
  Keyboard,
  ScanLine,
} from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import {
  assignPickupPerson,
  confirmShopRepairBooking,
  markPickupReceivedAtShop,
} from '../../../api/orders';
import { confirm, notify } from '../../../components/confirm';

const BRAND_GREEN_DARK = '#087A0A';
// The currently-assigned pickup person is marked in red so the owner can see
// at a glance who is already on the job before picking a replacement.
const ASSIGNED_RED = '#DC2626';
const TEXT_DARK = '#172117';

// Employees eligible to carry a pickup. Matches OwnerEmployeeListScreen's
// PICKUP_ROLE — the roleLabel is the only thing separating a pickup person
// from a bench technician in the /technicians feed.
const PICKUP_ROLE = 'Pickup Person';

// ── Shared sheet chrome ──────────────────────────────────────────────
/**
 * Live keyboard height, in the sheet's own coordinates.
 *
 * WHY NOT KeyboardAvoidingView
 * The manifest asks for `adjustResize`, but this app is edge-to-edge (SDK 54,
 * `edgeToEdgeEnabled=true`), and under edge-to-edge Android stops resizing the
 * window — the keyboard is drawn OVER it. A bottom-anchored sheet therefore
 * stays exactly where it was and the keyboard covers it completely, which is
 * the "popup opens, keyboard shows, nothing responds" symptom: the sheet is
 * still there and still live, just entirely behind the keys.
 *
 * WHY NOT react-native-keyboard-controller, which the rest of the app uses
 * Its KeyboardAvoidingView is the right tool on a SCREEN, and that is where the
 * other four call sites use it. A RN `Modal` on Android is a separate window
 * that the root <KeyboardProvider> does not instrument, so it is the one place
 * in the app the library can't be relied on. RN's own Keyboard events come from
 * the InputMethodManager and fire whichever window has focus.
 */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS gets the Will* pair so the sheet travels with the keyboard rather
    // than snapping after it has finished animating; Android only ever emits
    // the Did* pair.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = RNKeyboard.addListener(showEvt, (e) => setHeight(e?.endCoordinates?.height || 0));
    const hide = RNKeyboard.addListener(hideEvt, () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

function SheetShell({ visible, onClose, title, subtitle, children, maxHeightRatio }) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const kb = useKeyboardHeight();

  // With the keyboard up the gesture bar / nav buttons are behind it, so the
  // safe-area inset would be padding on top of padding. It is one or the other.
  const bottomPad = kb > 0 ? 12 : insets.bottom + 16;

  // The sheet must also fit in what's LEFT of the screen once the keyboard has
  // taken its share, or a tall sheet just overflows past the top instead. 88%
  // of the remaining space keeps the scrim visible above it so the sheet still
  // reads as a sheet.
  const available = Math.max(220, winH - kb) * 0.88;
  const ratioCap = maxHeightRatio ? winH * maxHeightRatio : Infinity;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(23, 33, 23, 0.5)',
          justifyContent: 'flex-end',
          // What actually lifts the sheet clear of the keys.
          paddingBottom: kb,
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: bottomPad,
            maxHeight: Math.min(available, ratioCap),
          }}
        >
          <View
            style={{
              alignSelf: 'center', width: 44, height: 5, borderRadius: 999,
              backgroundColor: '#E2E8E2', marginBottom: 14,
            }}
          />
          <Text className="text-[15px] font-extrabold text-gray-900">{title}</Text>
          {subtitle ? (
            <Text className="text-[11.5px] text-gray-500 mt-0.5 mb-3" numberOfLines={1}>{subtitle}</Text>
          ) : (
            <View style={{ height: 12 }} />
          )}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// One tappable option row — icon tile + label, single line. Deliberately no
// description line: the four labels say what they do, and the extra sentence
// each turned a short menu into a wall of text.
function ActionRow({ icon, tint, title, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-row items-center rounded-2xl px-3 py-2.5 mb-2 active:opacity-80"
      style={{ borderWidth: 1, borderColor: '#E2E8E2', opacity: disabled ? 0.5 : 1 }}
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: tint.bg }}>
        {icon}
      </View>
      <Text className="flex-1 text-[14px] font-extrabold text-gray-900" numberOfLines={1}>{title}</Text>
      <ChevronRight size={16} color="#CBD5CB" />
    </Pressable>
  );
}

const TINT = {
  green: { bg: '#E6F7E3', fg: BRAND_GREEN_DARK },
  blue:  { bg: '#E6F7E3', fg: '#16BB05' },
  amber: { bg: '#FEF3C7', fg: '#B45309' },
  slate: { bg: '#EFF5EE', fg: '#667066' },
};

// ── Service status: type first, then the statuses that type allows ───
//
// A booking ends one of two ways, and the statuses are not interchangeable:
// it either goes out repaired (Regular Service) or comes back unrepaired
// (Return Device). Showing all eleven in one list invited picking "Return
// Delivery" on a job that was repaired fine. So the sheet asks for the flow
// first and then offers only that flow's statuses — the two lists are never
// on screen together.
//
// The three shared endings (Invoice Generated, Delivered to Customer, Repair
// Cancelled) appear under BOTH types on purpose: both paths raise an invoice,
// hand the device over, and can be cancelled.
//
// Each option is a repair_booking_events row written through the same
// POST /tickets/{id}/progress-events the technician's checklist uses, so the
// Service History rail lights the matching step — and, because the return
// statuses are what that rail treats as return triggers, picking one moves the
// booking's timeline onto the Return Device branch by itself.
// Each type is an ordered list of STAGES, not a flat menu. The Status dropdown
// offers one stage at a time — whichever is next — so the owner walks the flow
// in order instead of picking the eleventh step on a booking sitting at the
// first. A stage counts as done when any of its options has a timeline event.
//
// A stage holds more than one option only where the options are genuine
// alternatives: a returning job either had its estimate turned down
// (Customer Rejected) or could not be fixed (Repair Not Completed). Recording
// either one opens the rest of the return chain.
//
// `action: 'INVOICE'` marks a status that is NOT written from this sheet.
// Invoice Generated is earned by actually producing the invoice, so choosing it
// hands off to the Invoice Generator screen; that screen emits the status when
// the invoice saves. See ServiceStatusSheet#submit.
const SERVICE_STATUS_TYPES = [
  {
    key: 'REGULAR',
    label: 'Regular Service',
    hint: 'Repaired — going out to the customer',
    stages: [
      [{ key: 'READY',             label: 'Ready for Delivery' }],
      [{ key: 'INVOICE_GENERATED', label: 'Invoice Generated', action: 'INVOICE' }],
      [{ key: 'DELIVERED',         label: 'Delivered to Customer' }],
    ],
  },
  {
    key: 'RETURN',
    label: 'Return Device',
    hint: 'Not repaired — going back as it came',
    stages: [
      [
        { key: 'CUSTOMER_REJECTED',    label: 'Customer Rejected' },
        { key: 'REPAIR_NOT_COMPLETED', label: 'Repair Not Completed' },
      ],
      [{ key: 'RETURN_DELIVERY',   label: 'Return Delivery' }],
      [{ key: 'INVOICE_GENERATED', label: 'Invoice Generated', action: 'INVOICE' }],
      [{ key: 'DELIVERED',         label: 'Delivered to Customer' }],
    ],
  },
];

// Offered alongside the next stage at every point before the booking closes,
// because calling off a repair is not a step in the flow — it is a way out of
// it. Dropped once the booking is delivered or already cancelled.
const CANCEL_OPTION = { key: 'CANCELLED', label: 'Repair Cancelled' };

// Nothing follows these two.
const TERMINAL_KEYS = ['DELIVERED', 'CANCELLED'];

// The next stage's options plus the cancel escape hatch, given what the
// booking's timeline already carries. Returns [] when the booking is finished.
function nextOptionsFor(type, completed) {
  if (TERMINAL_KEYS.some((k) => completed.has(k))) return [];
  const stage = type.stages.find((opts) => !opts.some((o) => completed.has(o.key)));
  return stage ? [...stage, CANCEL_OPTION] : [CANCEL_OPTION];
}

// Label of the furthest stage already recorded — what the sheet shows as
// "Current status". Read off the timeline rather than ticket.status so it says
// "Invoice Generated" rather than the coarser lifecycle value behind it.
function completedLabelFor(type, completed) {
  let label = null;
  type.stages.forEach((opts) => {
    const hit = opts.find((o) => completed.has(o.key));
    if (hit) label = hit.label;
  });
  if (completed.has('CANCELLED')) label = CANCEL_OPTION.label;
  return label;
}

// Statuses that end the booking one way or the other. Confirmed before they
// are written: Repair Cancelled is terminal server-side (the lifecycle guard
// refuses to move a CANCELLED ticket again), and the two delivery endings are
// what the customer sees as "your device is with you".
const CONFIRM_BEFORE = {
  CANCELLED: {
    title: 'Cancel this repair?',
    message: 'This moves the booking to Repair Cancelled. Cancelled bookings can\'t be moved to another status afterwards.',
    confirmText: 'Cancel repair',
    destructive: true,
  },
  DELIVERED: {
    title: 'Mark delivered?',
    message: 'This records Delivered to Customer on the customer\'s Service History and closes the booking.',
    confirmText: 'Mark delivered',
  },
};

// One dropdown field: the closed control shows the current choice, tapping it
// expands the options inline. Kept inside the sheet rather than as a floating
// popover so it can't be clipped by the sheet's rounded top edge.
function StatusDropdown({ label, value, options, onSelect, open, onToggle, disabled }) {
  return (
    <View className="mb-3">
      <Text className="text-[10.5px] font-extrabold uppercase text-gray-400 mb-1.5" style={{ letterSpacing: 0.7 }}>
        {label}
      </Text>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        className="flex-row items-center rounded-2xl px-3 py-3"
        style={{
          borderWidth: 1,
          borderColor: open ? BRAND_GREEN_DARK : '#E2E8E2',
          backgroundColor: '#FFFFFF',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text className="flex-1 text-[14px] font-extrabold text-gray-900" numberOfLines={1}>
          {value?.label || 'Select'}
        </Text>
        <ChevronDown
          size={18}
          color={open ? BRAND_GREEN_DARK : '#8FA08F'}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {open ? (
        <View
          className="rounded-2xl mt-1.5 overflow-hidden"
          style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#F7FAF7' }}
        >
          {options.map((opt, i) => {
            const selected = opt.key === value?.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => onSelect(opt)}
                className="flex-row items-center px-3 py-3 active:opacity-70"
                style={{
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: '#E2E8E2',
                  backgroundColor: selected ? '#E6F7E3' : 'transparent',
                }}
              >
                <View className="flex-1">
                  <Text
                    className="text-[13.5px] text-gray-900"
                    style={{ fontWeight: selected ? '800' : '600' }}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {opt.hint ? (
                    <Text className="text-[10.5px] text-gray-500 mt-0.5" numberOfLines={1}>{opt.hint}</Text>
                  ) : null}
                </View>
                {selected ? <Check size={16} color={BRAND_GREEN_DARK} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function ServiceStatusSheet({
  visible, booking, statusLabel, onClose, onUpdated, onGenerateInvoice,
}) {
  const [typeKey, setTypeKey] = useState('REGULAR');
  const [statusKey, setStatusKey] = useState(null);
  const [openField, setOpenField] = useState(null); // 'type' | 'status' | null
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(new Set());
  const [loadingSteps, setLoadingSteps] = useState(false);

  const type = SERVICE_STATUS_TYPES.find((t) => t.key === typeKey) || SERVICE_STATUS_TYPES[0];
  const options = nextOptionsFor(type, completed);
  const status = options.find((o) => o.key === statusKey) || options[0] || null;
  const ref = String(booking?.trackingId || booking?.bookingNumber || '').replace(/^#+/, '');
  const doneLabel = completedLabelFor(type, completed) || statusLabel;
  const finished = options.length === 0;

  // What the booking has already been through decides what it can do next, so
  // the sheet reads the timeline on every open. Re-reading each time is what
  // makes the round trip work: generate an invoice, come back, tap the card,
  // and the dropdown has moved on to Delivered to Customer by itself.
  useEffect(() => {
    if (!visible || !booking?.id) return undefined;
    let active = true;
    setOpenField(null);
    setSaving(false);
    setStatusKey(null);
    setLoadingSteps(true);
    (async () => {
      try {
        const rows = await ticketApi.get(`/tickets/${booking.id}/events`);
        const keys = new Set(
          (Array.isArray(rows) ? rows : []).map((e) => String(e.status || '').toUpperCase()),
        );
        // The booking's own lifecycle status counts as a recorded step too.
        // Both terminals are also what the server refuses to move past, so a
        // booking that reached one must show as closed here even if its event
        // row is missing — otherwise the sheet offers a status the save will
        // reject with a 409.
        const lifecycle = String(booking.status || '').toUpperCase();
        if (TERMINAL_KEYS.includes(lifecycle)) keys.add(lifecycle);
        if (!active) return;
        setCompleted(keys);
        // A booking already on the return branch opens on Return Device — the
        // owner should not have to re-pick the flow it is visibly in.
        const onReturn = ['CUSTOMER_REJECTED', 'REPAIR_NOT_COMPLETED', 'RETURN_DELIVERY']
          .some((k) => keys.has(k));
        setTypeKey(onReturn ? 'RETURN' : 'REGULAR');
      } catch {
        if (active) setCompleted(new Set()); // fall back to the start of the flow
      } finally {
        if (active) setLoadingSteps(false);
      }
    })();
    return () => { active = false; };
  }, [visible, booking?.id]);

  // Changing the type re-points Status at that flow's next stage — the old pick
  // may not exist in the new flow at all (Return Delivery has no Regular
  // Service equivalent), and keeping a stale key would submit the wrong one.
  const onTypeSelect = (opt) => {
    setTypeKey(opt.key);
    setStatusKey(null);
    setOpenField(null);
  };

  const submit = async () => {
    if (!booking?.id || saving || !status) return;
    // Invoice Generated is produced, not declared: hand off to the generator
    // and let it emit the status when the invoice actually saves. Writing the
    // event here would mark the booking invoiced with no invoice behind it.
    if (status.action === 'INVOICE') {
      onClose?.();
      onGenerateInvoice?.(booking);
      return;
    }
    const ask = CONFIRM_BEFORE[status.key];
    if (ask && !(await confirm(ask))) return;
    setSaving(true);
    try {
      await ticketApi.post(`/tickets/${booking.id}/progress-events`, {
        // actor=OWNER marks this as a deliberate shop-side action, which is
        // what separates it from the actor=SHOP rows the backend auto-emits.
        body: { statusKey: status.key, actor: 'OWNER' },
      });
      notify('Status updated', `"${status.label}" recorded.`, { preset: 'done' });
      onUpdated?.();
      onClose?.();
    } catch (e) {
      notify(
        'Could not update',
        e?.body?.error || e?.body?.message || e?.message || 'Please try again.',
        { preset: 'error', haptic: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title="Update Service Status"
      subtitle={ref ? `Booking #${ref}` : null}
      maxHeightRatio={0.9}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {doneLabel ? (
          <View
            className="rounded-2xl px-3 py-2.5 mb-4"
            style={{ backgroundColor: '#F7FAF7', borderWidth: 1, borderColor: '#E2E8E2' }}
          >
            <Text className="text-[10px] text-gray-500">Current status</Text>
            <Text className="text-[14px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
              {doneLabel}
            </Text>
          </View>
        ) : null}

        {loadingSteps ? (
          <View className="items-center py-8">
            <ActivityIndicator color={BRAND_GREEN_DARK} />
            <Text className="text-[11.5px] text-gray-500 mt-2">Checking what&apos;s next…</Text>
          </View>
        ) : finished ? (
          <View className="items-center py-6 px-2">
            <Text className="text-[13.5px] font-extrabold text-gray-900 text-center">
              This booking is closed
            </Text>
            <Text className="text-[11.5px] text-gray-500 text-center mt-1">
              {completed.has('CANCELLED')
                ? 'The repair was cancelled — there is no further status to record.'
                : 'The device is with the customer — there is no further status to record.'}
            </Text>
          </View>
        ) : (
          <>
            <StatusDropdown
              label="Status Type"
              value={type}
              options={SERVICE_STATUS_TYPES}
              onSelect={onTypeSelect}
              open={openField === 'type'}
              onToggle={() => setOpenField(openField === 'type' ? null : 'type')}
              disabled={saving}
            />

            {/* Only the next stage, never the whole flow — see nextOptionsFor. */}
            <StatusDropdown
              label="Status"
              value={status}
              options={options}
              onSelect={(opt) => { setStatusKey(opt.key); setOpenField(null); }}
              open={openField === 'status'}
              onToggle={() => setOpenField(openField === 'status' ? null : 'status')}
              disabled={saving}
            />

            <Pressable
              onPress={submit}
              disabled={saving || !status}
              className="rounded-2xl items-center justify-center py-3.5 mt-1 active:opacity-90"
              style={{ backgroundColor: BRAND_GREEN_DARK, opacity: saving || !status ? 0.6 : 1 }}
            >
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : (
                  <Text className="text-white text-[14px] font-extrabold">
                    {status?.action === 'INVOICE' ? 'Generate Invoice' : 'Update Status'}
                  </Text>
                )}
            </Pressable>

            <Text className="text-[10.5px] text-gray-500 text-center mt-2.5">
              {status?.action === 'INVOICE'
                ? 'Opens the invoice generator. The status is recorded once the invoice is saved.'
                : `Recorded on the customer's Service History under ${
                  type.key === 'RETURN' ? 'Return Device' : 'Working Pending'}.`}
            </Text>
          </>
        )}
      </ScrollView>
    </SheetShell>
  );
}

// ── IMEI gate in front of invoice generation ─────────────────────────
//
// An invoice is the document that ties a repair to a physical handset, so it
// must not be raised against a missing IMEI. The gate is only opened for a
// booking that HAS no number (BookingHistoryScreen sends one that already has
// an IMEI straight to the generator), so it has two faces:
//
//   choose  — enter the IMEI, or scan the barcode.
//   entry   — the keypad, pre-filled by the scanner when one was used.
//
// There is no "confirm the number already on file" face any more: the number
// was checked when it was entered, and re-confirming it on every invoice was a
// tap that showed the owner what the card in front of them already said.
//
// The uniqueness answer always comes from the server. The frontend asks first
// only so it can show a precise alert instead of a generic failure; the
// authoritative refusal is the 409 from PATCH /tickets/{id}.
const IMEI_MIN = 14;
const IMEI_MAX = 17;

function normaliseImei(raw) {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  return digits.length >= IMEI_MIN && digits.length <= IMEI_MAX ? digits : null;
}

function imeiAlreadyUsedAlert(conflictTrackingId) {
  Alert.alert(
    'IMEI Already Used',
    'This IMEI number is already associated with another service booking'
      + (conflictTrackingId ? ` (#${String(conflictTrackingId).replace(/^#+/, '')})` : '')
      + '. Please verify the IMEI number before continuing.',
    [{ text: 'OK' }],
  );
}

export function ImeiGateSheet({
  visible, booking, onClose, onVerified, onScanRequest, scannedImei,
}) {
  const [mode, setMode] = useState('choose');    // 'choose' | 'entry'
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const ref = String(booking?.trackingId || booking?.bookingNumber || '').replace(/^#+/, '');

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    // A value handed back by the scanner drops straight into the keypad so the
    // owner can eyeball it before it is saved — scanners do misread.
    if (scannedImei) {
      setInput(String(scannedImei));
      setMode('entry');
      return;
    }
    setInput('');
    setMode('choose');
  }, [visible, booking?.id, scannedImei]);

  // Save the entered/scanned number, then continue. The PATCH is the
  // uniqueness gate — a 409 comes back with code IMEI_ALREADY_USED.
  const saveAndContinue = async () => {
    if (!booking?.id || busy) return;
    const imei = normaliseImei(input);
    if (!imei) {
      Alert.alert(
        'Check the IMEI',
        `An IMEI is ${IMEI_MIN}–${IMEI_MAX} digits. Dial *#06# on the device to display it.`,
        [{ text: 'OK' }],
      );
      return;
    }
    setBusy(true);
    try {
      await ticketApi.patch(`/tickets/${booking.id}`, { body: { imei } });
      onClose?.();
      onVerified?.({ ...booking, imei });
    } catch (e) {
      // client.js hangs the parsed error body on err.payload, so the 409's
      // code + conflictTrackingId arrive intact.
      if (e?.status === 409 || e?.payload?.code === 'IMEI_ALREADY_USED') {
        imeiAlreadyUsedAlert(e?.payload?.conflictTrackingId);
        return;
      }
      notify('Could not save IMEI', e?.message || 'Please try again.', {
        preset: 'error', haptic: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title="IMEI Number Required"
      subtitle={ref ? `Booking #${ref}` : null}
    >
      {mode === 'choose' ? (
        <>
          <Text className="text-[12.5px] text-gray-500 mb-4">
            IMEI number is not available for this device. Please enter or scan the IMEI number.
          </Text>
          <ActionRow
            icon={<Keyboard size={18} color={TINT.green.fg} />}
            tint={TINT.green}
            title="Enter IMEI"
            onPress={() => { setInput(''); setMode('entry'); }}
          />
          <ActionRow
            icon={<ScanLine size={18} color={TINT.green.fg} />}
            tint={TINT.green}
            title="Scan IMEI"
            onPress={() => { onClose?.(); onScanRequest?.(booking); }}
          />
        </>
      ) : (
        <>
          <Text className="text-[10.5px] font-extrabold uppercase text-gray-400 mb-1.5" style={{ letterSpacing: 0.7 }}>
            IMEI
          </Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            keyboardType="number-pad"
            maxLength={20}
            autoFocus
            placeholder="356xxxxxxxxxxxx"
            placeholderTextColor="#9CA79C"
            editable={!busy}
            className="text-gray-900"
            style={{
              fontSize: 17, fontWeight: '800', letterSpacing: 1.5,
              borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#FFFFFF',
              borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
            }}
          />
          <View className="flex-row items-center mt-2 mb-4">
            <Text className="text-[10.5px] text-gray-500 flex-1">
              {IMEI_MIN}–{IMEI_MAX} digits. Dial *#06# on the device to display it.
            </Text>
            <Pressable onPress={() => { onClose?.(); onScanRequest?.(booking); }} disabled={busy} hitSlop={8}>
              <Text className="text-[11.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                Scan instead
              </Text>
            </Pressable>
          </View>
          <View className="flex-row">
            <Pressable
              onPress={onClose}
              disabled={busy}
              className="rounded-2xl items-center justify-center px-5 py-3 mr-2"
              style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#FFFFFF' }}
            >
              <Text className="text-[13px] font-extrabold text-gray-600">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={saveAndContinue}
              disabled={busy}
              className="flex-1 rounded-2xl items-center justify-center py-3 active:opacity-90"
              style={{ backgroundColor: BRAND_GREEN_DARK, opacity: busy ? 0.6 : 1 }}
            >
              {busy
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text className="text-white text-[13.5px] font-extrabold">Verify &amp; Continue</Text>}
            </Pressable>
          </View>
        </>
      )}
    </SheetShell>
  );
}

// ── Sheet 1: who is on this booking ──────────────────────────────────
// Share Receipt / Barcode deliberately do NOT appear here — this sheet does
// one job. Both are a tap away on the card's action row.
//
// The sheet has two faces, and which one opens is decided by the booking, not
// by which button was tapped:
//
//   view — somebody is already on it. Shows that technician (name, role,
//          mobile, whether they have accepted yet) and nothing else. Opening
//          Assign on a booking that HAS a technician used to drop the owner
//          straight into the full staff list, which reads as "nobody is
//          assigned, pick one" — the assignment was there, just never shown.
//   list — the full staff list. Reached only when nobody is assigned, or when
//          the owner explicitly taps Re-Assign.
//
// The assignment is re-read from the ticket on every open rather than trusted
// from the list row that opened the sheet: the row is a snapshot from the last
// list fetch, and a booking whose status moved in between (accepted, repaired,
// invoiced) must still show its technician. One booking id, one source.
export function TechnicianPickerSheet({
  visible,
  booking,
  onClose,
  onAssigned,
}) {
  const { height: winH } = useWindowDimensions();
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  // Seeded from the ticket on open, then moved locally on each successful
  // assign — same approach as PickupPersonPickerSheet, so the sheet can stay
  // open and visibly settle on the new technician.
  const [assignedId, setAssignedId] = useState(null);
  const [assignedName, setAssignedName] = useState(null);
  const [acceptedAt, setAcceptedAt] = useState(null);
  const [mode, setMode] = useState('list');      // 'view' | 'list'

  const trackingId = booking?.trackingId
    || (booking?.id ? String(booking.id).slice(0, 8).toUpperCase() : '');

  // Keyed on the id, not the object: the host hands back a NEW booking object
  // after each assign (it patches its copy of the row), and depending on the
  // object would re-run the fetch below every time — the sheet would blink back
  // to its spinner in the same breath as showing the technician it just set.
  const bookingId = booking?.id || null;
  const bookingRef = useRef(booking);
  bookingRef.current = booking;

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      // ticket-service /technicians, NOT auth's /auth/shops/{id}/technicians.
      // Both are shop-scoped, but they return different ids, and only this one
      // is right: ticket.assignedTechnicianId is matched against the
      // technicians-table id (TicketService.listByAssignedUser resolves a
      // user id to tech.getId() before querying). The auth endpoint returns
      // the *users* row id, so assigning from it writes an id no lookup
      // resolves — the booking never appears in the technician's own list and
      // TicketDetail can't show their name. This one also carries the real
      // roleLabel, phone and isAvailable; auth hardcodes roleLabel to
      // "TECHNICIAN" for every row.
      //
      // Fetched together with the ticket so the list and the assignment it is
      // matched against come from the same moment.
      const [data, fresh] = await Promise.all([
        ticketApi.get('/technicians'),
        ticketApi.get(`/tickets/${bookingId}`).catch(() => null),
      ]);
      const rows = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      setTechs(rows);
      // The refetched ticket wins; the row that opened the sheet is the
      // fallback for when that call fails.
      const src = fresh || bookingRef.current;
      const id = src?.assignedTechnicianId || null;
      // Legacy rows can carry a name with no id — the same gap the pickup
      // sheet works around.
      const name = src?.assignedTechnicianName || src?.technicianName || null;
      setAssignedId(id);
      setAssignedName(name);
      setAcceptedAt(src?.technicianAcceptedAt || null);
      setMode(id || name ? 'view' : 'list');
    } catch (e) {
      setTechs([]);
      notify('Could not load technicians', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  // Fetch each time the sheet opens so a newly added employee shows up without
  // needing an app restart.
  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const hasAssignee = !!(assignedId || assignedName);
  const isAssignedRow = (t) => (
    assignedId
      ? t?.id === assignedId
      : !!assignedName && String(t?.name || '').trim().toLowerCase() === String(assignedName).trim().toLowerCase()
  );
  // The full record for whoever holds the booking. Falls back to a name-only
  // stand-in so the view face still renders if the staff list can't be matched.
  const assignedTech = hasAssignee
    ? (techs.find(isAssignedRow) || { id: assignedId, name: assignedName })
    : null;

  const assign = async (tech) => {
    const technicianId = tech?.id;
    if (!bookingId || !technicianId) {
      notify('Cannot assign', 'This booking is missing an id.', { preset: 'error' });
      return;
    }
    const wasAssigned = hasAssignee;
    setAssigningId(technicianId);
    try {
      await ticketApi.patch(`/tickets/${bookingId}`, { body: { assignedTechnicianId: technicianId } });
      // Move the marker and go back to the assigned view before anything else:
      // the sheet stays open, so the owner sees the replacement land rather
      // than the sheet vanishing and leaving them to reopen it to check.
      setAssignedId(technicianId);
      setAssignedName(tech.name || null);
      // A (re)assignment clears the technician's prior acceptance server-side.
      setAcceptedAt(null);
      setMode('view');
      notify(
        wasAssigned ? 'Technician re-assigned' : 'Technician assigned',
        `${tech.name || 'Technician'} is on booking #${trackingId}.`,
        { preset: 'done' },
      );
      onAssigned?.(tech);
    } catch (e) {
      notify('Assign failed', e?.message || 'Could not assign this technician.', { preset: 'error', haptic: 'error' });
    } finally {
      setAssigningId(null);
    }
  };

  const showList = mode === 'list' || !hasAssignee;

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title={hasAssignee && !showList ? 'Assigned Technician' : 'Assign Technician'}
      subtitle={trackingId ? `Booking #${trackingId}` : null}
      maxHeightRatio={0.85}
    >
      <View>
        {loading ? (
          <View style={{ paddingVertical: 28 }}>
            <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
          </View>
        ) : !showList ? (
          <AssignedTechnicianCard
            tech={assignedTech}
            acceptedAt={acceptedAt}
            onReassign={() => setMode('list')}
          />
        ) : techs.length === 0 ? (
          <View style={{ paddingVertical: 20, paddingHorizontal: 4 }}>
            <Text className="text-[12.5px] text-gray-500">
              No technicians yet. Add one from Employee Management.
            </Text>
          </View>
        ) : (
          <>
            {/* Reached by tapping Re-Assign, so there is somewhere to go back
                to. Without it the only way out of the list is dismissing the
                sheet, which reads as cancelling the whole thing. */}
            {hasAssignee ? (
              <Pressable
                onPress={() => setMode('view')}
                disabled={assigningId != null}
                hitSlop={6}
                className="flex-row items-center mb-2.5 active:opacity-70"
              >
                <ChevronLeft size={15} color={BRAND_GREEN_DARK} />
                <Text className="text-[11.5px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>
                  Back to assigned technician
                </Text>
              </Pressable>
            ) : null}
          {/* Capped in pixels rather than left to flexShrink: a ScrollView in a
              shrinking parent with no resolved height collapses to nothing, which
              is what made the list look empty. Same approach as the Filters sheet.
              0.6 rather than 0.42 now that no action rows sit below it — the
              sheet's own 85% maxHeight still keeps it off the status bar. */}
          <ScrollView
            style={{ maxHeight: winH * 0.6 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {techs.map((t) => {
              const isAssigned = isAssignedRow(t);
              const busy = assigningId === t.id;
              const unavailable = t.isAvailable === false;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => assign(t)}
                  disabled={assigningId != null || isAssigned}
                  className="flex-row items-center rounded-2xl p-3 mb-2.5 active:opacity-80"
                  style={{
                    borderWidth: 1,
                    borderColor: isAssigned ? '#C8EEBF' : '#E2E8E2',
                    backgroundColor: isAssigned ? '#F0F8EF' : '#FFFFFF',
                    opacity: assigningId != null && !busy ? 0.5 : 1,
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: '#EFF5EE' }}
                  >
                    <UserRound size={18} color="#667066" />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-[13.5px] font-extrabold text-gray-900" numberOfLines={1}>
                      {t.name || 'Technician'}
                    </Text>
                    <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                      {[t.roleLabel, t.phone || t.email, unavailable ? 'Unavailable' : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
                  ) : isAssigned ? (
                    <View className="flex-row items-center">
                      <Check size={14} color={BRAND_GREEN_DARK} />
                      <Text className="text-[11px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>
                        Assigned
                      </Text>
                    </View>
                  ) : (
                    // "Re-Assign" once somebody holds the booking — tapping
                    // this row takes it off them, which "Assign" hid.
                    <Text className="text-[11.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                      {hasAssignee ? 'Re-Assign' : 'Assign'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          </>
        )}
      </View>
    </SheetShell>
  );
}

/**
 * The sheet's "somebody is already on this" face: who holds the booking, how
 * to reach them, and the one action that changes it.
 *
 * Deliberately the same row shape as a list entry (avatar tile, name, meta
 * line, trailing state) so opening Assign on an assigned booking looks like
 * the list narrowed to one person rather than a different screen.
 */
function AssignedTechnicianCard({ tech, acceptedAt, onReassign }) {
  const phone = tech?.phone || null;
  const accepted = !!acceptedAt;
  return (
    <View>
      <View
        className="flex-row items-center rounded-2xl p-3 mb-2.5"
        style={{ borderWidth: 1, borderColor: '#C8EEBF', backgroundColor: '#F0F8EF' }}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: '#E6F7E3' }}
        >
          <UserRound size={18} color={BRAND_GREEN_DARK} />
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-[13.5px] font-extrabold text-gray-900" numberOfLines={1}>
            {tech?.name || 'Technician'}
          </Text>
          <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
            {[tech?.roleLabel, phone || tech?.email].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Check size={14} color={BRAND_GREEN_DARK} />
          <Text className="text-[11px] font-extrabold ml-1" style={{ color: BRAND_GREEN_DARK }}>
            Assigned
          </Text>
        </View>
      </View>

      {/* Whether the technician has picked the job up yet — the assignment is
          only half the answer to "who is on this booking". */}
      <Text className="text-[11px] text-gray-500 mb-3 px-1">
        {accepted
          ? 'This technician has accepted the service.'
          : 'Awaiting this technician’s acceptance.'}
      </Text>

      {phone ? (
        <ActionRow
          icon={<Phone size={18} color={TINT.green.fg} />}
          tint={TINT.green}
          title={`Call ${phone}`}
          onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
        />
      ) : null}

      <ActionRow
        icon={<UserCog size={18} color={TINT.amber.fg} />}
        tint={TINT.amber}
        title="Re-Assign Technician"
        onPress={onReassign}
      />
    </View>
  );
}

// ── Sheet 2: how to send the receipt ─────────────────────────────────
// Same two options, wording and icons as the Share Receipt sheet in
// TicketDetailScreen, so the choice looks identical wherever it is reached.
export function ShareReceiptSheet({ visible, onClose, onShareImage, onShareSms, preparing }) {
  return (
    <SheetShell visible={visible} onClose={onClose} title="Share Receipt">
      <ActionRow
        icon={
          preparing
            ? <ActivityIndicator size="small" color={TINT.green.fg} />
            : <Share2 size={18} color={TINT.green.fg} />
        }
        tint={TINT.green}
        title="Send image to WhatsApp"
        onPress={onShareImage}
        disabled={preparing}
      />
      <ActionRow
        icon={
          preparing
            ? <ActivityIndicator size="small" color={TINT.blue.fg} />
            : <MessageSquare size={18} color={TINT.blue.fg} />
        }
        tint={TINT.blue}
        title="Send details by SMS"
        onPress={onShareSms}
        disabled={preparing}
      />
    </SheetShell>
  );
}

// ── Sheet 3: where this pickup is, and the one move the shop can make ─
//
// Deliberately not a free status picker. A pickup's middle stages (On The Way,
// At Customer, Device Picked Up, Reached Shop) are driven by the pickup person
// in the employee app — Reached Shop is even GPS-gated to 50m of the shop — so
// offering them here would let the owner fake a state nobody is standing in.
// The shop owns exactly two transitions, at the two ends: confirming the
// request, and taking physical delivery once the device is back. This sheet
// shows the current stage and whichever of those two is live.
//
// `statusLabel` comes from the host rather than a map of its own: the card
// badge behind the sheet already resolved it, and a second copy here would be
// one more place for the wording to drift.
export function PickupStatusSheet({ visible, booking, statusLabel, onClose, onUpdated }) {
  const [busy, setBusy] = useState(null);

  const status = String(booking?.status || '').toUpperCase();
  const ref = String(booking?.bookingNumber || '').replace(/^#+/, '');
  // The two ends of the pickup the shop actually controls.
  const isUnconfirmed = status === 'ORDER_PLACED' || status === 'PICKUP_REQUESTED';
  const atShop = status === 'REACHED_SHOP';

  const run = async (key, fn, doneTitle, doneMsg) => {
    if (!booking?.id || busy) return;
    setBusy(key);
    try {
      const updated = await fn(booking.id);
      notify(doneTitle, doneMsg, { preset: 'done' });
      // Hand back whatever the server returned so the host can patch the row
      // in place; it falls back to a refetch when the response is thin.
      onUpdated?.(updated);
      onClose?.();
    } catch (e) {
      notify('Could not update', e?.body?.error || e?.body?.message || e?.message || 'Please try again.', {
        preset: 'error',
        haptic: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title="Service Status"
      subtitle={ref ? `Pickup #${ref}` : null}
    >
      <View
        className="rounded-2xl px-3 py-2.5 mb-3"
        style={{ backgroundColor: '#F7FAF7', borderWidth: 1, borderColor: '#E2E8E2' }}
      >
        <Text className="text-[10px] text-gray-500">Current status</Text>
        <Text className="text-[14px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
          {statusLabel || booking?.status || 'Pending'}
        </Text>
      </View>

      {isUnconfirmed ? (
        <ActionRow
          icon={
            busy === 'confirm'
              ? <ActivityIndicator size="small" color={TINT.green.fg} />
              : <CheckCircle2 size={18} color={TINT.green.fg} />
          }
          tint={TINT.green}
          title="Confirm pickup request"
          disabled={busy != null}
          onPress={() => run('confirm', confirmShopRepairBooking, 'Pickup confirmed', 'You can assign a pickup person now.')}
        />
      ) : null}

      {atShop ? (
        <ActionRow
          icon={
            busy === 'receive'
              ? <ActivityIndicator size="small" color={TINT.green.fg} />
              : <PackageCheck size={18} color={TINT.green.fg} />
          }
          tint={TINT.green}
          title="Received at shop"
          disabled={busy != null}
          onPress={() => run('receive', markPickupReceivedAtShop, 'Received', 'Device received — the booking is now a ticket.')}
        />
      ) : null}

      {!isUnconfirmed && !atShop ? (
        <View style={{ paddingVertical: 4, paddingHorizontal: 2 }}>
          <Text className="text-[12.5px] text-gray-500">
            Nothing for the shop to do at this stage — the pickup person moves it
            from here in the employee app. Open Details for the full timeline.
          </Text>
        </View>
      ) : null}
    </SheetShell>
  );
}

// ── Sheet 4: who collects this pickup ────────────────────────────────
//
// The same list and the same assign call as OwnerEmployeeList's pickup-picker
// mode, as a sheet so the owner never leaves the list to do it. Assigning
// before the request is confirmed is rejected server-side, so the sheet says
// so up front rather than letting the tap fail.
//
// This sheet is also where *reassignment* happens — the Pickup Details screen
// no longer carries a "Reassign" button. Whoever is currently carrying the
// pickup is shown in red and marked "Assigned"; every other row offers
// "Reassign" (or plain "Assign" while nobody holds it). The marker is tracked
// in local state and the sheet stays open after a successful call, so the red
// visibly moves to the new person and the previous one drops back to black.
export function PickupPersonPickerSheet({ visible, booking, onClose, onAssigned }) {
  const { height: winH } = useWindowDimensions();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  // Seeded from the booking, then moved locally on each successful assign.
  const [assignedId, setAssignedId] = useState(null);
  const [assignedName, setAssignedName] = useState(null);

  const status = String(booking?.status || '').toUpperCase();
  const isUnconfirmed = status === 'ORDER_PLACED' || status === 'PICKUP_REQUESTED';
  const ref = String(booking?.bookingNumber || '').replace(/^#+/, '');

  // `assignedPickupPersonId` is what the order-service DTO actually returns —
  // reading `pickupPersonId` (the *request* field name) left this null on every
  // booking, which is why no row ever showed as assigned. pickupPersonId is
  // kept as a fallback in case a caller hands us a request-shaped object.
  useEffect(() => {
    if (!visible) return;
    setAssignedId(booking?.assignedPickupPersonId || booking?.pickupPersonId || null);
    setAssignedName(booking?.pickupPersonName || null);
  }, [visible, booking]);

  const hasAssignee = !!(assignedId || assignedName);
  // Name match is the fallback for legacy rows that carry pickupPersonName but
  // no id — the same gap the employee app works around.
  const isAssignedRow = (p) => (
    assignedId
      ? p?.id === assignedId
      : !!assignedName && String(p?.name || '').trim().toLowerCase() === String(assignedName).trim().toLowerCase()
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Same endpoint as TechnicianPickerSheet, and for the same reason: only
      // ticket-service /technicians returns the technicians-table id and the
      // real roleLabel, which is what the pickup filter below keys off.
      const data = await ticketApi.get('/technicians');
      const rows = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      setPeople(rows.filter((e) => String(e?.roleLabel || '').toLowerCase() === PICKUP_ROLE.toLowerCase()));
    } catch (e) {
      setPeople([]);
      notify('Could not load pickup persons', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const assign = async (person) => {
    if (!booking?.id || !person?.id) {
      notify('Cannot assign', 'This pickup is missing an id.', { preset: 'error' });
      return;
    }
    const wasAssigned = hasAssignee;
    setAssigningId(person.id);
    try {
      const updated = await assignPickupPerson(booking.id, {
        pickupPersonId: person.id,
        pickupPersonName: person.name || null,
        pickupPersonPhone: person.phone || null,
      });
      // Move the marker before anything else: the sheet deliberately stays
      // open so the owner sees the red land on the new person and leave the
      // old one. The host still refetches in the background via onAssigned.
      setAssignedId(person.id);
      setAssignedName(person.name || null);
      notify(
        wasAssigned ? 'Pickup reassigned' : 'Pickup assigned',
        `${person.name || 'Pickup person'} is on pickup #${ref}.`,
        { preset: 'done' },
      );
      onAssigned?.(person, updated);
    } catch (e) {
      notify('Assign failed', e?.body?.error || e?.body?.message || e?.message || 'Could not assign this pickup person.', {
        preset: 'error',
        haptic: 'error',
      });
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title="Assign Pickup Person"
      subtitle={ref ? `Pickup #${ref}` : null}
      maxHeightRatio={0.85}
    >
      <View>
        {isUnconfirmed ? (
          <View style={{ paddingVertical: 20, paddingHorizontal: 4 }}>
            <Text className="text-[12.5px] text-gray-500">
              Confirm the pickup request first — Service Status → Confirm pickup
              request — then come back to assign someone.
            </Text>
          </View>
        ) : loading ? (
          <View style={{ paddingVertical: 28 }}>
            <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
          </View>
        ) : people.length === 0 ? (
          <View style={{ paddingVertical: 20, paddingHorizontal: 4 }}>
            <Text className="text-[12.5px] text-gray-500">
              No pickup persons yet. Add staff with the "Pickup Person" role from
              Employee Management.
            </Text>
          </View>
        ) : (
          // Pixel-capped for the same reason as the technician list: a ScrollView
          // in a shrinking parent with no resolved height collapses to nothing.
          <ScrollView
            style={{ maxHeight: winH * 0.6 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {people.map((p) => {
              const isAssigned = isAssignedRow(p);
              const busy = assigningId === p.id;
              const inactive = p.isActive === false || p.isAvailable === false;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => assign(p)}
                  disabled={assigningId != null || isAssigned}
                  className="flex-row items-center rounded-2xl p-3 mb-2.5 active:opacity-80"
                  style={{
                    borderWidth: 1,
                    borderColor: isAssigned ? '#FECACA' : '#E2E8E2',
                    backgroundColor: isAssigned ? '#FEF2F2' : '#FFFFFF',
                    opacity: assigningId != null && !busy ? 0.5 : 1,
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: isAssigned ? '#FEE2E2' : '#FEF3C7' }}
                  >
                    <Truck size={18} color={isAssigned ? ASSIGNED_RED : '#B45309'} />
                  </View>
                  <View className="flex-1 pr-2">
                    {/* Colour set inline rather than by a text-* class so the
                        assigned/unassigned swap can't be lost to className
                        merging. */}
                    <Text
                      className="text-[13.5px] font-extrabold"
                      style={{ color: isAssigned ? ASSIGNED_RED : TEXT_DARK }}
                      numberOfLines={1}
                    >
                      {p.name || 'Pickup person'}
                    </Text>
                    <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                      {[p.phone || p.email, inactive ? 'Inactive' : null].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
                  ) : isAssigned ? (
                    <View className="flex-row items-center">
                      <Check size={14} color={ASSIGNED_RED} />
                      <Text className="text-[11px] font-extrabold ml-1" style={{ color: ASSIGNED_RED }}>
                        Assigned
                      </Text>
                    </View>
                  ) : (
                    // "Reassign" once somebody holds the pickup — tapping this
                    // row takes it off them, which "Assign" hid.
                    <Text className="text-[11.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                      {hasAssignee ? 'Reassign' : 'Assign'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SheetShell>
  );
}
