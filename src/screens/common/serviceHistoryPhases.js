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
  ClipboardCheck, Clock, RotateCcw, CheckCircle2,
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
// (RETURN_DEVICE), so the renderer lays those two out as a branch — Working
// Pending on the left, Return Device on the right — and both stay on screen so
// the shop can see the path not taken.
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
  // Handover tail. This is presentation only — the backend LIFECYCLE_ORDER
  // still advances READY → INVOICE_GENERATED → INVOICE_READY →
  // DELIVERED_PROCESSING → DELIVERED, and its forward-only guard is what
  // actually gates transitions. INVOICE_READY stays hidden as a duplicate of
  // the Invoice Generated step.
  { value: 'READY',                                         label: 'Ready for Delivery',                    phase: SERVICE, group: G_PENDING },
  { value: 'DELIVERED_PROCESSING',                          label: 'Out for Delivery',                      phase: SERVICE, group: G_PENDING },
  { value: 'INVOICE_GENERATED',                             label: 'Invoice Generated',                     phase: SERVICE, group: G_PENDING },
  // ── Stage 4 (right branch): Return Device ─────────────────────────────────
  // The unrepaired ending, rendered in red. The last two rows repeat the shared
  // handover tail above — same status codes, own rowId so React keys and the
  // index map stay unique. See SHARED_TAIL.
  { value: 'CUSTOMER_REJECTED',                             label: 'Customer Rejected',                     phase: SERVICE, group: G_RETURN },
  { value: 'REPAIR_NOT_COMPLETED',                          label: 'Repair Not Completed',                  phase: SERVICE, group: G_RETURN },
  { value: 'RETURN_DELIVERY',                               label: 'Return Delivery',                       phase: SERVICE, group: G_RETURN },
  { value: 'DELIVERED_PROCESSING',  rowId: 'RETURN:DELIVERED_PROCESSING', label: 'Out for Delivery',         phase: SERVICE, group: G_RETURN },
  { value: 'INVOICE_GENERATED',     rowId: 'RETURN:INVOICE_GENERATED',    label: 'Invoice Generated',        phase: SERVICE, group: G_RETURN },
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

const SUCCESS = '#16BB05';      // green dot / line for completed steps
const BRAND_GREEN_DARK = '#087A0A';
const DOT_BORDER = '#CBD5CB';   // gray ring around upcoming steps
const LINE_PENDING = '#E2E8E2'; // connector between unreached steps
const DANGER = '#DC2626';       // Return Device branch — dots, rail and header
const DANGER_TINT = '#FEE2E2';

// Per-stage chrome for the five SERVICE groups. `layout` drives the renderer:
// 'full' stacks down the page at full width; the two 'branch' stages are laid
// out side by side in one row, left then right.
const SERVICE_GROUP_META = {
  [G_ACCEPTED]:  { title: 'Service Accepted', icon: ClipboardCheck, accent: BRAND_GREEN_DARK, tint: '#E6F7E3', done: SUCCESS, layout: 'full' },
  [G_PROCESS]:   { title: 'In Process',       icon: Wrench,         accent: '#16BB05',        tint: '#E6F7E3', done: SUCCESS, layout: 'full' },
  [G_PENDING]:   { title: 'Working Pending',  icon: Clock,          accent: '#B45309',        tint: '#FEF3C7', done: SUCCESS, layout: 'branch' },
  [G_RETURN]:    { title: 'Return Device',    icon: RotateCcw,      accent: DANGER,           tint: DANGER_TINT, done: DANGER, layout: 'branch' },
  [G_COMPLETED]: { title: 'Completed',        icon: CheckCircle2,   accent: BRAND_GREEN_DARK, tint: '#E6F7E3', done: SUCCESS, layout: 'full' },
};

const PHASE_META = {
  PICKUP: {
    title: 'Pickup Service',
    subtitle: 'Doorstep pickup by our pickup person',
    icon: Truck,
    tint: '#E6F7E3',
    accent: '#16BB05',
  },
  SERVICE: {
    title: 'Shop Service',
    subtitle: 'Booking + repair lifecycle at the shop',
    icon: Wrench,
    tint: '#E6F7E3',
    accent: BRAND_GREEN_DARK,
  },
};

function PhaseHeader({ phaseKey, anyDone }) {
  const meta = PHASE_META[phaseKey];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <View
      className="flex-row items-center mb-3 mt-1 rounded-2xl px-3 py-2.5"
      style={{ backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#EFF5EE' }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-2.5"
        style={{ backgroundColor: meta.tint }}
      >
        <Icon size={16} color={meta.accent} />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-extrabold" style={{ color: meta.accent }}>
          {meta.title}
        </Text>
        <Text className="text-[10.5px] text-gray-500 mt-0.5">{meta.subtitle}</Text>
      </View>
      {anyDone ? (
        <View
          className="px-2.5 py-1 rounded-full"
          style={{ backgroundColor: meta.tint }}
        >
          <Text className="text-[9.5px] font-extrabold" style={{ color: meta.accent }}>
            STARTED
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Header for one of the five SERVICE stages. `compact` is the branch-column
 * variant — same shape, smaller, because two of these sit side by side in
 * roughly half the width on a phone.
 */
function StageHeader({ groupKey, compact }) {
  const meta = SERVICE_GROUP_META[groupKey];
  if (!meta) return null;
  const Icon = meta.icon;
  const box = compact ? 24 : 30;
  return (
    <View
      className="flex-row items-center rounded-xl"
      style={{
        backgroundColor: meta.tint,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 6 : 8,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          width: box, height: box, borderRadius: box / 2,
          backgroundColor: '#FFFFFF',
          alignItems: 'center', justifyContent: 'center',
          marginRight: compact ? 6 : 9,
        }}
      >
        <Icon size={compact ? 12 : 15} color={meta.accent} />
      </View>
      <Text
        className="flex-1 font-extrabold"
        style={{ color: meta.accent, fontSize: compact ? 11 : 12.5 }}
        numberOfLines={2}
      >
        {meta.title}
      </Text>
    </View>
  );
}

/**
 * One step on the rail. Extracted so the full-width stages and the two narrow
 * branch columns render identical rows at two sizes, instead of diverging.
 *
 * `doneColor` is what makes the Return Device branch read red: its dots, its
 * connectors and its NOW badge all take the stage's colour rather than the
 * global green.
 */
function StepRow({ opt, ev, completed, isCurrent, isLast, lineCompleted, doneColor, compact }) {
  const dot = compact ? 12 : 16;
  const danger = doneColor === DANGER;
  return (
    <View className="flex-row">
      <View className="items-center" style={{ width: compact ? 14 : 20, marginRight: compact ? 7 : 12 }}>
        <View
          style={{
            width: dot, height: dot, borderRadius: dot / 2,
            backgroundColor: completed ? doneColor : '#FFFFFF',
            borderWidth: completed ? 0 : 2, borderColor: DOT_BORDER,
            marginTop: 2,
          }}
        />
        {!isLast ? (
          lineCompleted ? (
            <View className="flex-1 my-1" style={{ width: 2, backgroundColor: doneColor }} />
          ) : (
            <View
              className="flex-1 my-1"
              style={{ width: 0, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: LINE_PENDING }}
            />
          )
        ) : null}
      </View>
      <View className="flex-1" style={{ paddingBottom: compact ? 12 : 16 }}>
        <View className="flex-row items-start justify-between">
          <Text
            className={`flex-1 pr-1 ${completed ? 'font-extrabold text-text' : 'font-bold text-text-muted'}`}
            style={{ fontSize: compact ? 11.5 : 13 }}
          >
            {opt.label}
          </Text>
          {isCurrent ? (
            <View
              className="rounded-full ml-1"
              style={{
                backgroundColor: danger ? DANGER_TINT : '#E6F7E3',
                paddingHorizontal: 7, paddingVertical: 1.5,
              }}
            >
              <Text
                className="font-extrabold"
                style={{ color: danger ? DANGER : BRAND_GREEN_DARK, fontSize: 9 }}
              >
                NEW
              </Text>
            </View>
          ) : null}
        </View>
        {ev?.createdAt ? (
          <Text className="text-text-muted mt-1" style={{ fontSize: compact ? 9.5 : 10 }}>
            {fmt(ev.createdAt)}
          </Text>
        ) : null}
        {ev?.note && ev.note !== opt.label ? (
          <Text className="text-text mt-0.5" style={{ fontSize: compact ? 10 : 11 }}>
            {ev.note}
          </Text>
        ) : null}
        <EventMedia audioUrl={ev?.audioUrl} imageUrls={ev?.imageUrls} />
      </View>
    </View>
  );
}

/**
 * The split above the two branch columns, and the join below them. Drawn from
 * plain views rather than SVG: the crossbar runs from the centre of the left
 * column (25% of the row) to the centre of the right one (75%), so the legs
 * land on each column's rail whatever the screen width.
 */
function BranchFork({ merge }) {
  const stem = <View style={{ width: 2, height: 9, backgroundColor: LINE_PENDING }} />;
  const legs = (
    <View className="flex-row">
      <View className="flex-1 items-center">{stem}</View>
      <View className="flex-1 items-center">{stem}</View>
    </View>
  );
  const bar = <View style={{ height: 2, backgroundColor: LINE_PENDING, marginHorizontal: '25%' }} />;
  return (
    <View style={merge ? { marginTop: 2, marginBottom: 10 } : { marginBottom: 10 }}>
      {merge ? legs : <View className="items-center">{stem}</View>}
      {bar}
      {merge ? <View className="items-center">{stem}</View> : legs}
    </View>
  );
}

const PLAYER_GREEN = '#087A0A';
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
          style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#F7FAF7' }}
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
            style={{ borderWidth: 1, borderColor: '#CBD5CB', backgroundColor: '#FFFFFF' }}
          >
            <Square size={11} color="#667066" fill="#667066" />
          </TouchableOpacity>
          <View className="flex-1">
            <View style={{ height: 4, borderRadius: 2, backgroundColor: '#E2E8E2' }}>
              <View style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: PLAYER_GREEN }} />
            </View>
            <Text className="text-[10px] text-gray-500 mt-1">{fmtClock(pos)} / {fmtClock(dur)}</Text>
          </View>
          <TouchableOpacity
            onPress={cycleRate}
            className="ml-2 px-2.5 py-1.5 rounded-full"
            style={{ backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#E2E8E2' }}
          >
            <Text className="text-[11px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>{rate}x</Text>
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

/**
 * Render the shop-side booking timeline.
 *
 * Caller passes the events list ({ status, note, createdAt, actor }) and the
 * booking's current macro-status. A row lights up when a matching event exists;
 * the most-recent one gets the "NEW" badge.
 *
 * The SERVICE phase renders as five stages rather than one flat rail. Working
 * Pending and Return Device are the two possible endings, so they sit side by
 * side — left and right of a fork — and both are always drawn, greyed out until
 * reached, so the shop can see which way the job went and which way it didn't.
 */
export function ServiceHistoryTimeline({ events, status, phaseFilter }) {
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
  const rowCompleted = (opt) => {
    if (!eventByStatus[opt.value]) return false;
    if (opt.phase === SERVICE && SHARED_TAIL.has(opt.value)) {
      return opt.group === G_RETURN ? returnPathActive : !returnPathActive;
    }
    return true;
  };

  // The "current" step (NEW badge) is the event with the most recent createdAt
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

  const renderRows = (rows, doneColor, compact) => {
    const done = rows.map(rowCompleted);
    // How far down this rail the booking has actually got. Every connector
    // above it is drawn solid, so the completed steps read as one continuous
    // green spine.
    //
    // The connector used to be green ONLY when the step on each end of it was
    // completed, which meant any step the booking legitimately skipped — no
    // spare parts needed, no re-estimate — broke the spine into fragments and
    // made finished work look unfinished: a delivered booking showed grey line,
    // green dot, grey line, green dot all the way down. A skipped step still
    // gets a hollow dot (it did not happen); what it no longer does is cut the
    // rail. Below the last completed step the connector stays dashed grey —
    // those steps have not happened yet, and that is the one thing this rail
    // must not overstate.
    let lastDone = -1;
    done.forEach((isDone, i) => { if (isDone) lastDone = i; });
    return rows.map((opt, idx) => {
      const completed = done[idx];
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
          lineCompleted={idx < lastDone}
          doneColor={doneColor}
          compact={compact}
        />
      );
    });
  };

  const renderStage = (stage, compact) => (
    <>
      <StageHeader groupKey={stage.key} compact={compact} />
      {renderRows(stage.rows, stage.meta.done, compact)}
    </>
  );

  // Walk the stages, collapsing the consecutive 'branch' ones into a single
  // two-column row wrapped in a fork/merge connector.
  const blocks = [];
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i].meta.layout !== 'branch') {
      blocks.push(
        <View key={stages[i].key} style={{ marginBottom: 6 }}>
          {renderStage(stages[i], false)}
        </View>,
      );
      continue;
    }
    const branch = [];
    while (i < stages.length && stages[i].meta.layout === 'branch') {
      branch.push(stages[i]);
      i += 1;
    }
    i -= 1; // the for-loop's own increment steps past the last branch stage
    blocks.push(
      <View key={`branch-${branch[0].key}`}>
        <BranchFork />
        <View className="flex-row" style={{ gap: 10 }}>
          {branch.map((b) => (
            // minWidth 0 lets a long label wrap instead of forcing the column
            // wider than its half of the row.
            <View key={b.key} className="flex-1" style={{ minWidth: 0 }}>
              {renderStage(b, true)}
            </View>
          ))}
        </View>
        <BranchFork merge />
      </View>,
    );
  }

  return (
    <View>
      {showPickup ? (
        <View className="mb-2">
          <PhaseHeader phaseKey={PICKUP} anyDone={anyPickupDone} />
          {renderRows(pickupRows, SUCCESS, false)}
        </View>
      ) : null}
      {serviceRows.length ? (
        <View
          className="mb-2"
          style={
            showPickup
              ? { paddingTop: 14, marginTop: 6, borderTopWidth: 1, borderTopColor: '#EFF5EE' }
              : null
          }
        >
          <PhaseHeader phaseKey={SERVICE} anyDone={anyServiceDone} />
          {blocks}
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
