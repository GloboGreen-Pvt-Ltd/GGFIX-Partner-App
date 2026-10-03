// Shop-side booking Service History timeline.
//
// One source of truth for all the statuses the shop / owner / customer /
// technician views render in the same order. Each render row maps to
// exactly one row in `repair_booking_events.status` — no nested phases, no
// duplicates. Backend emit code writes these status keys verbatim.
//
// The final hand-off goes through four steps now (not one): Ready for
// Delivery -> Invoice Generated -> Invoice Ready -> Delivered Processing ->
// Delivered to Customer. A booking must never jump straight from READY to
// DELIVERED — the three intermediate billing/handover rows record the
// invoice lifecycle and the in-progress customer handover.
import React, { useEffect, useRef, useState } from 'react';
import { Text, View, TouchableOpacity, Image, ScrollView } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  Truck, Wrench, Play, Pause, Square,
  ClipboardCheck, Clock, RotateCcw, CheckCircle2, Check,
} from 'lucide-react-native';

// Phase keys group the flat status list into the two visual sections the
// timeline renders: the doorstep-pickup sub-flow and the in-shop service
// sub-flow. Walk-in bookings carry no PICKUP_* events and skip the entire
// "PICKUP" group in the renderer.
const PICKUP = 'PICKUP';
const SERVICE = 'SERVICE';

// Within the SERVICE phase the rows are bucketed again, into the five stages
// the shop actually reads the job in. Two of them are not sequential: a booking
// ends EITHER by going out repaired (WORK_PENDING) OR by coming back unrepaired
// (RETURN_DEVICE). The list renders both, one after the other, each titled with
// which path it is, so the shop can still see the path not taken.
const G_ACCEPTED  = 'SERVICE_ACCEPTED';
const G_PROCESS   = 'IN_PROCESS';
const G_PENDING   = 'WORK_PENDING';
const G_RETURN    = 'RETURN_DEVICE';
const G_COMPLETED = 'COMPLETED';

const SERVICE_GROUP_ORDER = [G_ACCEPTED, G_PROCESS, G_PENDING, G_RETURN, G_COMPLETED];

// Out for Delivery and Invoice Generated are the shared handover tail: both the
// repaired path and the return path go out for delivery and raise an invoice.
// They therefore appear as a row under BOTH branches, and `rowCompletedIn` below
// only lights the copy that belongs to the ending the booking actually took —
// otherwise a plain repaired job would show a green "Out for Delivery" sitting
// under Return Device.
const SHARED_TAIL = new Set(['DELIVERED_PROCESSING', 'INVOICE_GENERATED']);

// Any one of these means the job took the return path.
const RETURN_TRIGGERS = ['CUSTOMER_REJECTED', 'REPAIR_NOT_COMPLETED', 'RETURN_DELIVERY'];

// The two ways a booking closes. Nothing follows either of them, and the
// backend's lifecycle guard refuses to move past them — see
// getCurrentPhaseLabel.
const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'];

// The timeline moves ONE step at a time. A row is Done only when its own event
// exists — a later step never ticks the rows above it — and the shop app can
// only record a step once the step before it is on the timeline. This is that
// "step before" for every step the shop app writes; where a fork allows
// alternatives, any one of the list will do. Steps not listed are written by
// the technician app or the backend, or are a way out (Repair Cancelled) that
// can be taken at any point. See stepBlockedBy.
const MUST_FOLLOW = {
  RE_ESTIMATED_CONFIRMED:  ['TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED'],
  CUSTOMER_APPROVED:       ['RE_ESTIMATED_CONFIRMED'],
  IN_REPAIR:               ['TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED'],
  QUALITY_CHECK_COMPLETED: ['REPAIR_COMPLETED'],
  READY:                   ['QUALITY_CHECK_COMPLETED'],
  // The two ways into Return Device, each the alternative to a repaired-path
  // step: turning down the re-estimate (vs Customer Approved), or a repair that
  // was attempted and failed (vs Repair Completed).
  CUSTOMER_REJECTED:       ['RE_ESTIMATED_CONFIRMED'],
  REPAIR_NOT_COMPLETED:    ['IN_REPAIR'],
  RETURN_DELIVERY:         ['CUSTOMER_REJECTED', 'REPAIR_NOT_COMPLETED'],
  INVOICE_GENERATED:       ['READY', 'RETURN_DELIVERY'],
  INVOICE_READY:           ['INVOICE_GENERATED'],
  DELIVERED_PROCESSING:    ['INVOICE_GENERATED'],
  DELIVERED:               ['DELIVERED_PROCESSING'],
};

// Forks and ways out, not stages every job walks through — counted in
// "Step X of Y" only once they have actually happened.
const ONLY_IF_HAPPENED = new Set(['CUSTOMER_REJECTED', 'REPAIR_NOT_COMPLETED', 'CANCELLED']);

// A step that can't happen once its opposite did: a rejected estimate is never
// approved, a cancelled job is never delivered.
const RULED_OUT_BY = { CUSTOMER_APPROVED: 'CUSTOMER_REJECTED', DELIVERED: 'CANCELLED' };

// Canonical 31-row status list. The pickup-phase rows only light up for
// serviceMode=PICKUP bookings; walk-in bookings carry no PICKUP_* events
// and the renderer hides the whole pickup group. The optional `phaseFilter`
// prop on ServiceHistoryTimeline drops one phase entirely — owner Service
// History uses 'SERVICE', owner Pickup History uses 'PICKUP', customer
// keeps both.
//
// `value` keeps the DB-stored codes (rename is a separate change). INVOICE_READY
// is the one code the backend still emits that stays hidden from the
// user-facing timeline — it reads as a duplicate of Invoice Generated.
export const SHOP_BOOKING_STATUS_OPTIONS = [
  // Pickup phase (rows 1–8)
  { value: 'PICKUP_BOOKING_CREATED',                        label: 'Pickup Booking Created',                phase: PICKUP },
  { value: 'PICKUP_PERSON_ASSIGNED',                        label: 'Pickup Person Assigned',                phase: PICKUP },
  { value: 'PICKUP_ON_THE_WAY',                             label: 'Pickup Person On The Way',              phase: PICKUP },
  { value: 'REACHED_CUSTOMER_LOCATION',                     label: 'Reached Customer Location',             phase: PICKUP },
  { value: 'REPAIR_ESTIMATE_PROCESSING',                    label: 'Repair Estimate Processing',            phase: PICKUP },
  { value: 'DEVICE_PICKED_UP',                              label: 'Device Picked Up',                      phase: PICKUP },
  { value: 'REACHED_SHOP',                                  label: 'Pickup Person Reached Shop',            phase: PICKUP },
  { value: 'RECEIVED_AT_SHOP',                              label: 'Device Received at Shop',               phase: PICKUP },
  // ── Service phase, stage 1: Service Accepted ──────────────────────────────
  // The booking is taken on and routed to a technician. There is no row for
  // "Assigned to <name>": the technician's name arrives as the ASSIGNED event's
  // `note`, which every row already renders under its label, so a walk-through
  // reads "Assigned to Technician / Assigned to Afsal" without a status of its own.
  { value: 'BOOKING_CREATED_BY_SHOP',                       label: 'Booking Created by Shop',               phase: SERVICE, group: G_ACCEPTED },
  { value: 'SERVICE_ACCEPTED',                              label: 'Service Accepted',                      phase: SERVICE, group: G_ACCEPTED },
  { value: 'ASSIGNED_TO_TECHNICIAN',                        label: 'Assigned to Technician',                phase: SERVICE, group: G_ACCEPTED },
  { value: 'AWAITING_TECHNICIAN_ACCEPTANCE',                label: 'Awaiting Technician Acceptance',        phase: SERVICE, group: G_ACCEPTED },
  { value: 'REASSIGNED_TO_TECHNICIAN',                      label: 'Re-Assigned to Technician',             phase: SERVICE, group: G_ACCEPTED },
  // ── Stage 2: In Process ───────────────────────────────────────────────────
  // Opens on the technician's acceptance — the handover status that closes
  // stage 1 — and runs to the customer's verdict on the re-estimate.
  { value: 'TECHNICIAN_ACCEPTED_SERVICE',                   label: 'Technician Accepted Service',           phase: SERVICE, group: G_PROCESS },
  { value: 'TECHNICIAN_WORK_STARTED',                       label: 'Technician Work Started',               phase: SERVICE, group: G_PROCESS },
  { value: 'TECHNICIAN_UPLOADED_DEVICE_IMAGES',             label: 'Technician Uploaded Device Images',     phase: SERVICE, group: G_PROCESS },
  { value: 'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED',  label: 'Technician Issue Verified & Updated',   phase: SERVICE, group: G_PROCESS },
  { value: 'RE_ESTIMATED_CONFIRMED',                        label: 'Service Re-estimated',                  phase: SERVICE, group: G_PROCESS },
  { value: 'CUSTOMER_APPROVED',                             label: 'Customer Approved',                     phase: SERVICE, group: G_PROCESS },
  // ── Stage 3 (left branch): Working Pending ────────────────────────────────
  // The repaired ending. QUALITY_CHECK_COMPLETED is kept even though it is not
  // called out in the stage spec — the backend emits it, and dropping the row
  // would make a real event vanish from the rail.
  //
  // Spare parts are ONE row: PARTS_REQUIRED, "Spare Parts Waiting". The old
  // PARTS_REPLACED status was retired by migration 87, which also deleted its
  // history rows, so nothing renders it any more.
  { value: 'IN_REPAIR',                                     label: 'Repair Work In Progress',               phase: SERVICE, group: G_PENDING },
  { value: 'PARTS_REQUIRED',                                label: 'Spare Parts Waiting',                   phase: SERVICE, group: G_PENDING },
  { value: 'REPAIR_COMPLETED',                              label: 'Repair Completed',                      phase: SERVICE, group: G_PENDING },
  // One quality-check row. QUALITY_CHECK_STARTED ("Quality Check Pending") was
  // retired by migration 88, which also deleted its history rows — the
  // completed event's timestamp is the record of when the check was done.
  { value: 'QUALITY_CHECK_COMPLETED',                       label: 'Quality Check Completed',               phase: SERVICE, group: G_PENDING },
  // Handover tail, in the order the backend LIFECYCLE_ORDER advances it:
  // READY → INVOICE_GENERATED → INVOICE_READY → DELIVERED_PROCESSING →
  // DELIVERED. The order matters — the timeline is walked one row at a time,
  // so Out for Delivery sitting above Invoice Generated would have the shop
  // tick a row out of order. INVOICE_READY stays hidden as a duplicate of
  // Invoice Generated.
  { value: 'READY',                                         label: 'Ready for Delivery',                    phase: SERVICE, group: G_PENDING },
  { value: 'INVOICE_GENERATED',                             label: 'Invoice Generated',                     phase: SERVICE, group: G_PENDING },
  { value: 'DELIVERED_PROCESSING',                          label: 'Out for Delivery',                      phase: SERVICE, group: G_PENDING },
  // ── Stage 4 (right branch): Return Device ─────────────────────────────────
  // The unrepaired ending, rendered in red. The last two rows repeat the shared
  // handover tail above — same status codes, own rowId so React keys and the
  // index map stay unique. See SHARED_TAIL.
  { value: 'CUSTOMER_REJECTED',                             label: 'Customer Rejected',                     phase: SERVICE, group: G_RETURN },
  { value: 'REPAIR_NOT_COMPLETED',                          label: 'Repair Not Completed',                  phase: SERVICE, group: G_RETURN },
  { value: 'RETURN_DELIVERY',                               label: 'Return Delivery',                       phase: SERVICE, group: G_RETURN },
  { value: 'INVOICE_GENERATED',     rowId: 'RETURN:INVOICE_GENERATED',    label: 'Invoice Generated',        phase: SERVICE, group: G_RETURN },
  { value: 'DELIVERED_PROCESSING',  rowId: 'RETURN:DELIVERED_PROCESSING', label: 'Out for Delivery',         phase: SERVICE, group: G_RETURN },
  // ── Stage 5: Completed ────────────────────────────────────────────────────
  { value: 'DELIVERED',                                     label: 'Delivered to Customer',                 phase: SERVICE, group: G_COMPLETED },
  { value: 'CANCELLED',                                     label: 'Repair Cancelled',                      phase: SERVICE, group: G_COMPLETED },
];

/** Stable per-row identity — `value` is no longer unique across the branch. */
const rowIdOf = (opt) => opt.rowId || opt.value;

const LABEL_BY_KEY = Object.fromEntries(
  SHOP_BOOKING_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * The rail's label for one status code, or null when the code has no row.
 *
 * Exported so screens that list events WITHOUT drawing the rail (the Details
 * screen's lifecycle card) word each step exactly as the timeline does, instead
 * of keeping a second, shorter map that quietly hides whatever it is missing.
 */
export function labelForStatus(statusKey) {
  return LABEL_BY_KEY[String(statusKey || '').toUpperCase()] || null;
}

/**
 * The one-by-one gate every shop-side status action checks before it writes.
 * Returns null when `statusKey` can be recorded now, or the label of the step
 * that has to be on the timeline first ("Repair Completed", "Ready for
 * Delivery or Return Delivery"). `recorded` is the booking's events, or just
 * their status keys. A step that is already recorded is never blocked —
 * re-saving it (a re-generated invoice) moves nothing.
 */
export function stepBlockedBy(recorded, statusKey) {
  const key = String(statusKey || '').toUpperCase();
  const before = MUST_FOLLOW[key];
  if (!before) return null;
  const done = new Set(Array.from(recorded || [], (e) =>
    String((typeof e === 'string' ? e : e?.status) || '').toUpperCase()));
  if (done.has(key) || before.some((k) => done.has(k))) return null;
  return before.map((k) => LABEL_BY_KEY[k] || k).join(' or ');
}

// GGFIX palette — same values used across the rest of the booking flow.
const ACCENT = '#078F23';       // deep GGFIX green (text)
const PRIMARY = '#09AD2A';      // GGFIX green
const MINT = '#EAF8EC';
const BORDER = '#E6E6E6';
const DIVIDER = '#F3F3F3';      // hairline between list rows
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const SUCCESS = '#09AD2A';      // dot / tint for completed steps
const BRAND_GREEN_DARK = ACCENT; // kept as an alias — same constant name used throughout this file's JSX below
const DOT_BORDER = '#D6D6D6';   // ring around upcoming steps
const DANGER = '#F84141';       // Return Device path — dots and title
const DANGER_TINT = '#FEECEC';
const PENDING_TINT = '#FFF8E1';
const PENDING_FG = '#8A6A00';
const UPCOMING_BG = '#F3F3F3';  // neutral "Upcoming" badge
const UPCOMING_FG = MUTED;

// Per-stage chrome for the five SERVICE groups. `hint` names which ending a
// branch stage is, since the two now sit one after the other in the list.
const SERVICE_GROUP_META = {
  [G_ACCEPTED]:  { title: 'Service Accepted', icon: ClipboardCheck, accent: ACCENT,     tint: MINT,         done: SUCCESS },
  [G_PROCESS]:   { title: 'In Process',       icon: Wrench,         accent: ACCENT,     tint: MINT,         done: SUCCESS },
  [G_PENDING]:   { title: 'Working Pending',  icon: Clock,          accent: PENDING_FG, tint: PENDING_TINT, done: SUCCESS, hint: 'Repaired path' },
  [G_RETURN]:    { title: 'Return Device',    icon: RotateCcw,      accent: DANGER,     tint: DANGER_TINT,  done: DANGER,  hint: 'Unrepaired return path' },
  [G_COMPLETED]: { title: 'Completed',        icon: CheckCircle2,   accent: ACCENT,     tint: MINT,         done: SUCCESS },
};

const PHASE_META = {
  PICKUP: {
    title: 'Pickup Service',
    subtitle: 'Doorstep pickup by our pickup person',
    icon: Truck,
    tint: MINT,
    accent: PRIMARY,
  },
  SERVICE: {
    title: 'Shop Service',
    subtitle: 'Booking + repair lifecycle at the shop',
    icon: Wrench,
    tint: MINT,
    accent: ACCENT,
  },
};

function PhaseHeader({ phaseKey, anyDone }) {
  const meta = PHASE_META[phaseKey];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <View className="flex-row items-center" style={{ marginBottom: 4 }}>
      <View
        className="items-center justify-center"
        style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: meta.tint, marginRight: 9 }}
      >
        <Icon size={14} color={meta.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: INK }}>{meta.title}</Text>
        <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{meta.subtitle}</Text>
      </View>
      {anyDone ? (
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: meta.tint }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: meta.accent }}>STARTED</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Title line for one of the five SERVICE stages — a plain list heading (icon,
 * title, path hint, done count) underlined, no box around it.
 */
function StageHeader({ groupKey, doneCount, total }) {
  const meta = SERVICE_GROUP_META[groupKey];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <View
      className="flex-row items-center"
      style={{ marginTop: 14, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: BORDER }}
    >
      <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: meta.accent, marginRight: 8 }} />
      <Icon size={13} color={meta.accent} />
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '800', color: meta.accent }}>{meta.title}</Text>
      {meta.hint ? (
        <Text style={{ marginLeft: 6, fontSize: 10, color: MUTED, flexShrink: 1 }} numberOfLines={1}>· {meta.hint}</Text>
      ) : null}
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: meta.tint }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: meta.accent }}>{doneCount}/{total}</Text>
      </View>
    </View>
  );
}

/**
 * One step as a list row: status dot, label, badge, then — once it happened —
 * its timestamp, note and media. Rows are split by hairlines; the current step
 * gets a soft tint so it stands out without a card.
 *
 * `doneColor` is what makes the Return Device path read red: its dots and its
 * Current badge take the stage's colour rather than the global green.
 */
function StepRow({ opt, ev, completed, isCurrent, isLast, doneColor }) {
  const danger = doneColor === DANGER;
  const reached = completed || isCurrent;
  return (
    <View
      className="flex-row"
      style={{
        paddingVertical: 9,
        paddingHorizontal: isCurrent ? 8 : 0,
        marginHorizontal: isCurrent ? -8 : 0,
        borderRadius: isCurrent ? 10 : 0,
        backgroundColor: isCurrent ? (danger ? DANGER_TINT : MINT) : 'transparent',
        borderBottomWidth: isLast || isCurrent ? 0 : 1,
        borderBottomColor: DIVIDER,
      }}
    >
      <View
        className="items-center justify-center"
        style={{
          width: 20, height: 20, borderRadius: 10, marginTop: 1, marginRight: 10,
          backgroundColor: completed ? doneColor : '#FFFFFF',
          borderWidth: completed ? 0 : (isCurrent ? 2 : 1.5),
          borderColor: completed ? 'transparent' : (isCurrent ? doneColor : DOT_BORDER),
        }}
      >
        {completed ? (
          <Check size={11} color="#FFFFFF" strokeWidth={3} />
        ) : isCurrent ? (
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: doneColor }} />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View className="flex-row items-start">
          <Text style={{ flex: 1, paddingRight: 6, fontSize: 12, fontWeight: reached ? '800' : '600', color: reached ? INK : MUTED }}>
            {opt.label}
          </Text>
          {isCurrent ? (
            <View style={{ backgroundColor: doneColor, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>Current</Text>
            </View>
          ) : completed ? (
            <View style={{ backgroundColor: danger ? DANGER_TINT : MINT, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ color: danger ? DANGER : ACCENT, fontSize: 9, fontWeight: '800' }}>Done</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: UPCOMING_BG, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ color: UPCOMING_FG, fontSize: 9, fontWeight: '800' }}>Upcoming</Text>
            </View>
          )}
        </View>
        {ev?.createdAt ? (
          <Text style={{ color: MUTED, marginTop: 2, fontSize: 11 }}>{fmt(ev.createdAt)}</Text>
        ) : null}
        {ev?.note && ev.note !== opt.label ? (
          <Text style={{ color: INK, marginTop: 2, fontSize: 11 }}>{ev.note}</Text>
        ) : null}
        <EventMedia audioUrl={ev?.audioUrl} imageUrls={ev?.imageUrls} />
      </View>
    </View>
  );
}

const PLAYER_GREEN = '#09AD2A';
const fmtClock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Inline media block under a step event row when the event carries optional
// attachments (the technician's compliance-note emit populates audioUrl /
// imageUrls). Hooks are declared UNCONDITIONALLY before any early return so the
// hook order stays stable when an event gains media on a later poll — the old
// code returned null before the hooks, which crashed ("Rendered more hooks than
// during the previous render") right when the media arrived, hiding it.
function EventMedia({ audioUrl, imageUrls }) {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => () => {
    try { soundRef.current?.remove?.(); } catch (_) {}
  }, []);

  const onStatus = (s) => {
    if (!s) return;
    setPos(s.currentTime || 0);
    if (s.duration) setDur(s.duration);
    setPlaying(!!s.playing);
    if (s.didJustFinish) { setPlaying(false); setPos(0); }
  };

  const ensureSound = () => {
    if (soundRef.current) return soundRef.current;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    const player = createAudioPlayer(audioUrl, { updateInterval: 200 });
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(rate);
    player.addListener('playbackStatusUpdate', onStatus);
    soundRef.current = player;
    return player;
  };

  // Preload the clip so its total duration shows before the first play — the
  // status listener above picks up the duration once the native side loads it.
  useEffect(() => {
    if (!audioUrl) return;
    ensureSound();
  }, [audioUrl]);

  const togglePlay = () => {
    try {
      const player = ensureSound();
      if (player.playing) {
        player.pause();
        setPlaying(false);
      } else {
        if (player.duration > 0 && player.currentTime >= player.duration) {
          player.seekTo(0);
        }
        player.play();
        setPlaying(true);
      }
    } catch (_) { /* best-effort playback */ }
  };

  const stop = () => {
    try {
      if (!soundRef.current) return;
      soundRef.current.pause();
      soundRef.current.seekTo(0);
      setPlaying(false);
      setPos(0);
    } catch (_) {}
  };

  const cycleRate = () => {
    const next = rate >= 2 ? 1 : 2;
    setRate(next);
    try { soundRef.current?.setPlaybackRate(next, 'high'); } catch (_) {}
  };

  const hasAudio = !!audioUrl;
  const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
  if (!hasAudio && !hasImages) return null;

  const pct = dur > 0 ? Math.min(1, pos / dur) : 0;

  return (
    <View className="mt-2">
      {hasAudio ? (
        <View
          className="rounded-xl px-3 py-2.5 flex-row items-center"
          style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: '#F8F8F8' }}
        >
          <TouchableOpacity
            onPress={togglePlay}
            className="w-9 h-9 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: PLAYER_GREEN }}
          >
            {playing ? <Pause size={15} color="#fff" /> : <Play size={15} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={stop}
            className="w-8 h-8 rounded-full items-center justify-center mr-2"
            style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF' }}
          >
            <Square size={11} color={MUTED} fill={MUTED} />
          </TouchableOpacity>
          <View className="flex-1">
            <View style={{ height: 4, borderRadius: 2, backgroundColor: BORDER }}>
              <View style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: PLAYER_GREEN }} />
            </View>
            <Text style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{fmtClock(pos)} / {fmtClock(dur)}</Text>
          </View>
          <TouchableOpacity
            onPress={cycleRate}
            className="ml-2 px-2.5 py-1.5 rounded-full"
            style={{ backgroundColor: MINT, borderWidth: 1, borderColor: BORDER }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND_GREEN_DARK }}>{rate}x</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {hasImages ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
          <View className="flex-row">
            {imageUrls.map((u, j) => (
              <Image
                key={j}
                source={{ uri: u }}
                style={{ width: 64, height: 64, borderRadius: 8, marginRight: 6 }}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function fmt(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Shared by ServiceHistoryTimeline and getServiceProgress below — one place
// that decides which rows apply and which of them are completed, so the rail
// and the "Step X / Y" summary can never disagree.
function computeRowCompletion(events, phaseFilter) {
  // Index events by status key. Keep the FIRST occurrence so the displayed
  // timestamp is when that state was entered, not when it was re-emitted.
  const eventByStatus = {};
  (events || []).forEach((e) => {
    const k = (e.status || '').toUpperCase();
    if (!eventByStatus[k]) eventByStatus[k] = e;
  });

  // Visible row set respects the optional phaseFilter prop: 'PICKUP' shows
  // only the doorstep-pickup rows (owner Pickup History / pickup-person
  // views), 'SERVICE' hides them (owner Service History / technician views).
  // No filter = both phases, with the walk-in-bookings hide rule kept below.
  const visibleOptions = phaseFilter
    ? SHOP_BOOKING_STATUS_OPTIONS.filter((o) => o.phase === phaseFilter)
    : SHOP_BOOKING_STATUS_OPTIONS;

  // Which of the two endings the booking actually took. The shared handover
  // tail (Out for Delivery, Invoice Generated) has a row under BOTH branches,
  // so it must only light up on the side that applies — otherwise a plain
  // repaired job shows a green "Out for Delivery" sitting under Return Device.
  const returnPathActive = RETURN_TRIGGERS.some((k) => !!eventByStatus[k]);
  // Done = this row's own event exists. Nothing else ticks a row: a later step
  // never marks the ones above it (see MUST_FOLLOW for how order is kept).
  const rowCompleted = (opt) => {
    if (!eventByStatus[opt.value]) return false;
    if (opt.phase === SERVICE && SHARED_TAIL.has(opt.value)) {
      return opt.group === G_RETURN ? returnPathActive : !returnPathActive;
    }
    return true;
  };

  // Steps that belong to this booking's journey, for the "Step X of Y" count:
  // the branch it took (Working Pending until a return trigger shows up),
  // minus forks it didn't take and steps their opposite has ruled out.
  const applies = (opt) => {
    if (opt.group === G_RETURN && !returnPathActive) return false;
    if (opt.group === G_PENDING && returnPathActive) return false;
    if (ONLY_IF_HAPPENED.has(opt.value)) return rowCompleted(opt);
    const rival = RULED_OUT_BY[opt.value];
    return !(rival && eventByStatus[rival]);
  };

  return { eventByStatus, visibleOptions, returnPathActive, applies, rowCompleted };
}

/**
 * A dynamic "Step X / Y" summary for the current-status hero card — X and Y
 * are always computed from the SAME rowCompleted logic the rail itself uses,
 * never a fixed number. Y only counts steps that apply to this booking: the
 * branch it actually took (or Working Pending, the default/common ending,
 * before either branch is reached), and a fork or way out only once it has
 * happened — so Y isn't padded with a "Repair Cancelled" the job never needed.
 */
export function getServiceProgress(events, phaseFilter) {
  const { visibleOptions, applies, rowCompleted } = computeRowCompletion(events, phaseFilter);
  const applicable = visibleOptions.filter(applies);
  const completed = applicable.filter(rowCompleted).length;
  return { completed, total: applicable.length };
}

/**
 * Render the shop-side booking timeline.
 *
 * Caller passes the events list ({ status, note, createdAt, actor }) and the
 * booking's current macro-status. A row lights up only when its own matching
 * event exists; the most-recent one gets the "Current" badge.
 *
 * The SERVICE phase renders as five stages rather than one flat rail. Working
 * Pending and Return Device are the two possible endings, so they sit side by
 * side — left and right of a fork — and both are always drawn, greyed out until
 * reached, so the shop can see which way the job went and which way it didn't.
 */
export function ServiceHistoryTimeline({ events, status, phaseFilter, visibleStageLimit }) {
  const { eventByStatus, visibleOptions, returnPathActive, rowCompleted } = computeRowCompletion(events, phaseFilter);

  // The "current" step (Current badge) is the event with the most recent createdAt
  // — not the highest fixed-list index — so the latest action the technician
  // took gets the indicator, even when an auto-emitted macro-status event like
  // IN_REPAIR sits further down the list. When that status has a copy under
  // each branch, only the copy that lit up can carry the badge.
  // Two rows can share one instant — the backend emits "Repair Work In Progress"
  // with the exact timestamp of "Technician Issue Verified & Updated". Break that
  // tie on the canonical row order so the badge lands on the later step, and
  // lands there identically on every device, instead of following whatever order
  // the tied rows happened to come back in.
  const stepRank = (e) =>
    SHOP_BOOKING_STATUS_OPTIONS.findIndex((o) => o.value === (e.status || '').toUpperCase());
  const sortedByTime = (events || []).slice().sort((a, b) => {
    const byTime = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    return byTime !== 0 ? byTime : stepRank(b) - stepRank(a);
  });
  const latestKey = (sortedByTime[0]?.status || '').toUpperCase();
  const latestMatches = visibleOptions.filter((o) => o.value === latestKey && rowCompleted(o));
  let currentRowId = latestMatches.length ? rowIdOf(latestMatches[latestMatches.length - 1]) : null;
  if (!currentRowId) {
    visibleOptions.forEach((o) => { if (rowCompleted(o)) currentRowId = rowIdOf(o); });
  }

  // Walk-in bookings never emit pickup-phase events. Hide the whole Pickup
  // group in that case so the timeline starts at "Booking Created by Shop"
  // instead of showing pickup rows that will never light up. When phaseFilter
  // is set the caller already constrained which phases render.
  const pickupRows  = visibleOptions.filter((o) => o.phase === PICKUP);
  const serviceRows = visibleOptions.filter((o) => o.phase === SERVICE);
  const anyPickupDone  = pickupRows.some(rowCompleted);
  const anyServiceDone = serviceRows.some(rowCompleted);
  const showPickup = pickupRows.length > 0 && (phaseFilter === PICKUP || anyPickupDone);

  // Bucket the service rows into the five stages, in display order. A stage
  // with no rows (only possible if the option list is edited) drops out; an
  // unreached stage does NOT — the whole map of the lifecycle stays on screen.
  const stages = SERVICE_GROUP_ORDER
    .map((key) => ({
      key,
      meta: SERVICE_GROUP_META[key],
      rows: serviceRows.filter((o) => o.group === key),
    }))
    .filter((s) => s.meta && s.rows.length > 0);

  const renderRows = (rows, doneColor) => rows.map((opt, idx) => {
    const completed = rowCompleted(opt);
    return (
      <StepRow
        key={rowIdOf(opt)}
        opt={opt}
        // Suppress the timestamp/note/media on the branch copy that did not
        // apply, so an inactive shared-tail row stays visibly empty.
        ev={completed ? eventByStatus[opt.value] : null}
        completed={completed}
        isCurrent={rowIdOf(opt) === currentRowId}
        isLast={idx === rows.length - 1}
        doneColor={doneColor}
      />
    );
  });

  // Every stage is one titled block of list rows, in lifecycle order —
  // Working Pending and Return Device included, one after the other.
  const blocks = stages.map((stage) => (
    <View key={stage.key}>
      <StageHeader
        groupKey={stage.key}
        doneCount={stage.rows.filter(rowCompleted).length}
        total={stage.rows.length}
      />
      {renderRows(stage.rows, stage.meta.done)}
    </View>
  ));

  // Optional collapse — Service History's "View All" toggle. Undefined (the
  // default) renders every stage; a number caps how many stage blocks render.
  const visibleBlocks = typeof visibleStageLimit === 'number'
    ? blocks.slice(0, Math.max(1, visibleStageLimit))
    : blocks;

  return (
    <View>
      {showPickup ? (
        <View style={{ marginBottom: 8 }}>
          <PhaseHeader phaseKey={PICKUP} anyDone={anyPickupDone} />
          <View style={{ borderTopWidth: 1, borderTopColor: BORDER, marginTop: 6 }}>
            {renderRows(pickupRows, SUCCESS)}
          </View>
        </View>
      ) : null}
      {serviceRows.length ? (
        <View
          style={
            showPickup
              ? { paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: BORDER }
              : null
          }
        >
          <PhaseHeader phaseKey={SERVICE} anyDone={anyServiceDone} />
          {visibleBlocks}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Plain-text label of the booking's current step — used by the order
 * summary cards that need a one-line status without rendering the rail.
 */
export function getCurrentPhaseLabel(events, status) {
  const rows = events || [];
  const statusUpper = (status || '').toUpperCase();

  // A delivered or cancelled booking is closed, and stays reading that way.
  // Things can still be RECORDED against it — a technician re-assigned so the
  // job has an owner in the books, an invoice corrected — and taking the latest
  // event as the current step let one of those rename the booking's state: a
  // booking handed to its customer on Wednesday read "Re-assigned to Ravi"
  // because that row was written last. Where the booking IS was decided when it
  // was delivered.
  const terminal = TERMINAL_STATUSES.find(
    (k) => statusUpper === k || rows.some((e) => (e.status || '').toUpperCase() === k),
  );
  if (terminal) return LABEL_BY_KEY[terminal];

  const sorted = rows.slice().sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );
  const latest = sorted[0];
  const key = (latest?.status || '').toUpperCase();
  if (LABEL_BY_KEY[key]) return LABEL_BY_KEY[key];
  if (LABEL_BY_KEY[statusUpper]) return LABEL_BY_KEY[statusUpper];
  return latest?.note || (status || '').replace(/_/g, ' ');
}
