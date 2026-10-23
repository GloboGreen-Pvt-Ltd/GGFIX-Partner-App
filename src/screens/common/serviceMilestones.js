// Order-tracking style Service History — the Amazon / Flipkart tracker adapted
// for a repair. The 30-odd status rows of the full timeline
// (serviceHistoryPhases.js) fold into milestones; the internal steps inside
// each one stay in the backend history and only surface as the milestone's
// latest update, notes, photos and voice note. The technician's own Service
// Progress steps (Employee app checklist) are NOT folded: Repair Work In
// Progress → Spare Parts Waiting (only when recorded) → Repair Completed →
// Quality Check Completed each get a row, so they tick one by one.
//
// A milestone is Done only when ITS OWN closing event exists — nothing is ever
// ticked because a later step happened. A milestone skipped over (a later one
// is done, this one never recorded) reads "Not recorded" rather than a fake
// tick.
import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Check, Minus, X } from 'lucide-react-native';
import ImageViewerModal from '../../components/ImageViewerModal';
import { EventMedia, labelForStatus, withoutSupersededVerdicts } from './serviceHistoryPhases';

const TEAL = '#035C6C';
const TEAL_TINT = '#E5F3F5';
const GREEN = '#609138';
const RED = '#F84141';
const RED_TINT = '#FEECEC';
const INK = '#111111';
const MUTED = '#6B7280';
const FAINT = '#9CA3AF';
const RAIL = '#E5E7EB';

// PICKUP_REQUESTED is what the backend actually writes when a pickup is booked;
// PICKUP_BOOKING_CREATED is the rail's older name for it.
const PICKUP_STARTS = ['PICKUP_BOOKING_CREATED', 'PICKUP_REQUESTED'];
const PICKUP_KEYS = [
  ...PICKUP_STARTS, 'PICKUP_ACCEPTED', 'PICKUP_REASSIGNED', 'PICKUP_PERSON_ASSIGNED', 'PICKUP_ON_THE_WAY',
  'REACHED_CUSTOMER_LOCATION', 'REPAIR_ESTIMATE_PROCESSING', 'DEVICE_PICKED_UP', 'REACHED_SHOP', 'RECEIVED_AT_SHOP',
];
const RETURN_TRIGGERS = ['CUSTOMER_REJECTED', 'REPAIR_NOT_COMPLETED', 'RETURN_DELIVERY'];

// Codes the backend emits that have no row on the full timeline.
const EXTRA_LABELS = {
  ISSUE_IDENTIFIED: 'Issue Identified',
  WAITING_FOR_CUSTOMER_APPROVAL: 'Awaiting Customer Approval',
  PICKUP_REQUESTED: 'Pickup Requested',
  PICKUP_ACCEPTED: 'Pickup Accepted',
  PICKUP_REASSIGNED: 'Pickup Re-assigned',
};

const up = (s) => String(s || '').toUpperCase();
const at = (e) => { const t = Date.parse(e?.createdAt || ''); return Number.isNaN(t) ? 0 : t; };
export const labelOf = (status) => labelForStatus(status) || EXTRA_LABELS[up(status)] || null;

/**
 * The booking's milestones with their state. `keys` are the status codes
 * folded into a milestone (its updates, notes and media); `doneKeys` are the
 * ones that close it, and `requires` any events that must ALSO exist. States:
 * done · current · upcoming · missed (a later milestone is done, this one never
 * recorded) · stopped (cancelled mid-way).
 *
 * `extras` is technician material that lives outside the event log — device
 * photos, earlier issue notes, solution-pack files: [{ note, audioUrl,
 * imageUrls, createdAt, milestone? }]. Display only: an extra never completes
 * a milestone. One with a `milestone` key goes there; the rest go to the
 * milestone that was in progress when it was created.
 */
export function buildMilestones(rawEvents, extras = []) {
  const events = withoutSupersededVerdicts(rawEvents).filter((e) => e?.status);
  const byKey = {};
  events.forEach((e) => { (byKey[up(e.status)] = byKey[up(e.status)] || []).push(e); });
  Object.values(byKey).forEach((list) => list.sort((a, b) => at(a) - at(b)));
  const has = (k) => !!byKey[k];

  const pickup = PICKUP_KEYS.some(has);
  const returnPath = RETURN_TRIGGERS.some(has);
  // The technician's verified-issue note closes its own row (with its photos,
  // description and voice note). A re-estimate then puts the price back to the
  // customer as a separate row, closed by their verdict.
  const reEstimated = has('RE_ESTIMATED_CONFIRMED');

  const defs = [
    { key: 'BOOKED', label: 'Booking Confirmed', activeLabel: 'Booking received',
      keys: ['BOOKING_CREATED_BY_SHOP', 'SERVICE_ACCEPTED', ...PICKUP_STARTS],
      doneKeys: ['BOOKING_CREATED_BY_SHOP', 'SERVICE_ACCEPTED', ...PICKUP_STARTS] },
    pickup ? { key: 'COLLECTED', label: 'Device Received at Shop', activeLabel: 'Pickup in progress',
      keys: PICKUP_KEYS.filter((k) => !PICKUP_STARTS.includes(k)), doneKeys: ['RECEIVED_AT_SHOP'] } : null,
    { key: 'ASSIGNED', label: 'Technician Assigned', activeLabel: 'Assigning a technician',
      keys: ['ASSIGNED_TO_TECHNICIAN', 'AWAITING_TECHNICIAN_ACCEPTANCE', 'REASSIGNED_TO_TECHNICIAN', 'TECHNICIAN_ACCEPTED_SERVICE'],
      doneKeys: ['TECHNICIAN_ACCEPTED_SERVICE'] },
    { key: 'DIAGNOSED', label: 'Technician Issue Verified & Updated', activeLabel: 'Technician verifying the issue',
      keys: ['TECHNICIAN_WORK_STARTED', 'TECHNICIAN_UPLOADED_DEVICE_IMAGES', 'ISSUE_IDENTIFIED',
        'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED',
        ...(reEstimated ? [] : ['WAITING_FOR_CUSTOMER_APPROVAL', 'CUSTOMER_APPROVED', 'CUSTOMER_REJECTED'])],
      doneKeys: ['TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED'] },
    // Only the customer's verdict is written under it ("Customer approved the
    // re-estimated service") — not the submitted / waiting steps before it.
    reEstimated ? { key: 'APPROVAL', label: 'Re-Estimate Approval', activeLabel: 'Awaiting customer approval',
      keys: ['RE_ESTIMATED_CONFIRMED', 'WAITING_FOR_CUSTOMER_APPROVAL', 'CUSTOMER_APPROVED', 'CUSTOMER_REJECTED'],
      doneKeys: ['CUSTOMER_APPROVED', 'CUSTOMER_REJECTED'], verdictOnly: true } : null,
    ...(returnPath ? [
      { key: 'RETURN', label: 'Return Unrepaired', activeLabel: 'Returning unrepaired', danger: true,
        keys: ['CUSTOMER_REJECTED', 'IN_REPAIR', 'PARTS_REQUIRED', 'REPAIR_NOT_COMPLETED', 'RETURN_DELIVERY'],
        doneKeys: ['RETURN_DELIVERY'] },
    ] : [
      // The Employee app's Service Progress checklist, one row per step.
      { key: 'IN_REPAIR', label: 'Repair Work In Progress', activeLabel: 'Waiting for repair to start',
        keys: ['IN_REPAIR'], doneKeys: ['IN_REPAIR'] },
      // Optional — only jobs that actually waited on a part show this row.
      has('PARTS_REQUIRED') ? { key: 'PARTS_REQUIRED', label: 'Spare Parts Waiting', activeLabel: 'Waiting for spare parts',
        keys: ['PARTS_REQUIRED'], doneKeys: ['PARTS_REQUIRED'] } : null,
      { key: 'REPAIR_COMPLETED', label: 'Repair Completed', activeLabel: 'Repair in progress',
        keys: ['REPAIR_COMPLETED'], doneKeys: ['REPAIR_COMPLETED'] },
      { key: 'QUALITY_CHECK', label: 'Quality Check Completed', activeLabel: 'Repaired — quality check pending',
        keys: ['QUALITY_CHECK_COMPLETED'], doneKeys: ['QUALITY_CHECK_COMPLETED'] },
      // The backend writes a READY row by itself the moment Repair Completed
      // moves the ticket status, before anyone has checked the device — so
      // Ready only counts once the quality check is on the booking as well.
      { key: 'READY', label: 'Ready for Delivery', activeLabel: 'Getting ready for delivery',
        keys: ['READY'], doneKeys: ['READY'], requires: ['QUALITY_CHECK_COMPLETED'] },
    ]),
    { key: 'DELIVERED', label: returnPath ? 'Returned to Customer' : 'Delivered',
      activeLabel: has('DELIVERED_PROCESSING') ? 'Out for delivery' : 'Ready for handover',
      keys: ['INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED'], doneKeys: ['DELIVERED'] },
  ].filter(Boolean);

  let milestones = defs.map((d) => {
    const own = d.keys.flatMap((k) => byKey[k] || []).sort((a, b) => at(a) - at(b));
    let doneEvent = d.doneKeys.map((k) => byKey[k]?.[0]).filter(Boolean).sort((a, b) => at(a) - at(b))[0] || null;
    if (doneEvent && d.requires) {
      const needed = d.requires.map((k) => byKey[k]?.[0]);
      // Complete only with every required event; done at whichever came last.
      doneEvent = needed.every(Boolean)
        ? [doneEvent, ...needed].reduce((a, b) => (at(b) > at(a) ? b : a))
        : null;
    }
    return { ...d, events: own, latest: own[own.length - 1] || null, doneEvent, extras: [] };
  });

  const cancelEvent = byKey.CANCELLED?.[0] || null;
  const lastDone = milestones.reduce((idx, m, i) => (m.doneEvent ? i : idx), -1);
  if (cancelEvent) {
    // A cancelled job stops where it was: what already happened stays, the
    // milestone it was part-way through reads "stopped", the rest drop off.
    milestones = milestones
      .filter((m, i) => i <= lastDone || m.events.length > 0)
      .concat({ key: 'CANCELLED', label: 'Repair Cancelled', activeLabel: 'Repair cancelled', danger: true,
        keys: ['CANCELLED'], events: byKey.CANCELLED, latest: cancelEvent, doneEvent: cancelEvent, extras: [] });
  }
  const closed = !!cancelEvent || !!milestones[milestones.length - 1]?.doneEvent;
  const lastDoneNow = milestones.reduce((idx, m, i) => (m.doneEvent ? i : idx), -1);

  milestones = milestones.map((m, i) => {
    let state = 'upcoming';
    if (m.doneEvent) state = 'done';
    else if (i < lastDoneNow) state = cancelEvent && m.events.length ? 'stopped' : 'missed';
    else if (!closed && i === lastDoneNow + 1) state = 'current';
    return { ...m, state };
  });

  // Hang each extra on its milestone: the named one if it's on this booking,
  // else the first reached milestone still open at the moment it was created.
  const reached = milestones.filter((m) => m.state === 'done' || m.state === 'current');
  (Array.isArray(extras) ? extras : []).forEach((x) => {
    if (!x) return;
    const home = (x.milestone && reached.find((m) => m.key === x.milestone))
      || reached.find((m) => m.state === 'current' || at(m.doneEvent) >= at(x))
      || reached[reached.length - 1];
    if (home) home.extras.push(x);
  });
  return milestones;
}

/** One-line status for the header card, from the same milestones the tracker draws. */
export function getTrackingSummary(events, milestones = buildMilestones(events)) {
  const current = milestones.find((m) => m.state === 'current');
  const last = milestones[milestones.length - 1];
  // The milestone in progress speaks first, so a row the backend derived ahead
  // of time (the automatic READY) can't headline over a pending quality check.
  const latest = current?.latest || (Array.isArray(events) ? events : [])
    .filter((e) => e?.status)
    .reduce((a, b) => (at(b) >= at(a || {}) ? b : a), null);
  const headline = current
    ? current.activeLabel
    : last?.state === 'done' ? (last.key === 'CANCELLED' ? 'Repair cancelled' : last.label) : 'Booking received';
  const done = milestones.filter((m) => m.state === 'done').length;
  return {
    headline,
    danger: !!(current?.danger || (last?.danger && last.state === 'done')),
    closed: !current && last?.state === 'done',
    latestLabel: latest ? (labelOf(latest.status) || latest.note || up(latest.status).replace(/_/g, ' ')) : null,
    latestAt: latest?.createdAt || null,
    done,
    total: milestones.length,
  };
}

export function fmtTrackTime(v) {
  const t = Date.parse(v || '');
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${date} · ${time}`;
}

function Marker({ state, danger }) {
  const tone = danger ? RED : GREEN;
  if (state === 'done') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
        {danger ? <X size={12} color="#FFFFFF" strokeWidth={3} /> : <Check size={12} color="#FFFFFF" strokeWidth={3} />}
      </View>
    );
  }
  if (state === 'current') {
    const ring = danger ? RED : TEAL;
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: danger ? RED_TINT : TEAL_TINT, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: ring, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ring }} />
        </View>
      </View>
    );
  }
  if (state === 'missed' || state === 'stopped') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderStyle: 'dashed', borderColor: FAINT, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <Minus size={11} color={FAINT} strokeWidth={3} />
      </View>
    );
  }
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: RAIL, backgroundColor: '#FFFFFF' }} />
    </View>
  );
}

// Photos from every update inside the milestone, as one strip. Tapping opens
// the shared full-screen viewer.
function PhotoStrip({ urls, onOpen }) {
  if (!urls.length) return null;
  const shown = urls.slice(0, 4);
  return (
    <View className="flex-row" style={{ marginTop: 6 }}>
      {shown.map((u, i) => (
        <TouchableOpacity key={u} activeOpacity={0.85} onPress={() => onOpen(i)} style={{ marginRight: 6 }}>
          <Image source={{ uri: u }} style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: '#F3F4F6' }} />
          {i === shown.length - 1 && urls.length > shown.length ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: 'rgba(17,17,17,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>+{urls.length - shown.length}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MilestoneRow({ m, isLast, nextReached, extra }) {
  const [viewer, setViewer] = useState(null);
  const reached = m.state === 'done' || m.state === 'current';
  const tone = m.danger ? RED : m.state === 'current' ? TEAL : INK;
  // Everything written inside this milestone — its events plus the technician
  // material kept outside the event log — newest first.
  const items = reached ? [...m.events, ...m.extras].sort((a, b) => at(b) - at(a)) : [];
  // Notes the technician / shop wrote; the label-only default notes are
  // dropped, at most three so the tracker stays compact. A finished row leads
  // with its closing step's note right under its date · time — e.g.
  // "Customer approved the re-estimated service".
  const doneNote = m.state === 'done' && m.doneEvent?.note && m.doneEvent.note !== labelOf(m.doneEvent.status)
    ? String(m.doneEvent.note).trim() : null;
  const notes = m.verdictOnly ? (doneNote ? [doneNote] : []) : [...new Set([doneNote, ...items
    .filter((e) => e.note && e.note !== labelOf(e.status))
    .map((e) => String(e.note).trim())].filter(Boolean))].slice(0, 3);
  const photos = [...new Set(items.flatMap((e) => (Array.isArray(e.imageUrls) ? e.imageUrls : [])))];
  const audioEvent = items.find((e) => e.audioUrl) || null;
  const when = m.state === 'done' ? m.doneEvent?.createdAt : m.latest?.createdAt;
  const sub = m.state === 'current'
    ? (m.verdictOnly ? null : m.latest ? labelOf(m.latest.status) || 'In progress' : 'Next up')
    : m.state === 'missed' ? 'Not recorded'
      : m.state === 'stopped' ? 'Stopped — booking cancelled' : null;

  return (
    <View className="flex-row">
      <View style={{ width: 30, alignItems: 'center' }}>
        <Marker state={m.state} danger={m.danger} />
        {!isLast ? (
          <View style={{ flex: 1, width: 2, marginVertical: 2, backgroundColor: m.state === 'done' && nextReached ? GREEN : RAIL }} />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingBottom: isLast ? 0 : 16 }}>
        <View style={{ minHeight: 22, justifyContent: 'center' }}>
          <Text
            style={{ fontSize: 13.5, fontWeight: reached ? '800' : '600', color: reached ? tone : FAINT }}
            numberOfLines={2}
          >
            {m.label}
          </Text>
        </View>
        {/* Date · time under the name, so a long name never pushes it aside. */}
        {when && reached ? (
          <Text style={{ fontSize: 10.5, color: MUTED, marginTop: 1 }}>{fmtTrackTime(when)}</Text>
        ) : null}
        {sub ? (
          <Text style={{ fontSize: 11.5, marginTop: 2, fontWeight: m.state === 'current' ? '700' : '500', color: m.state === 'current' ? (m.danger ? RED : TEAL) : FAINT }}>
            {sub}
          </Text>
        ) : null}
        {notes.map((n) => (
          <Text key={n} style={{ fontSize: 11.5, color: INK, marginTop: 3, lineHeight: 16 }} numberOfLines={3}>{n}</Text>
        ))}
        <PhotoStrip urls={photos} onOpen={setViewer} />
        {audioEvent ? <EventMedia audioUrl={audioEvent.audioUrl} imageUrls={null} /> : null}
        {extra}
      </View>
      <ImageViewerModal
        visible={viewer != null}
        images={photos.map((uri) => ({ uri, label: m.label }))}
        index={viewer || 0}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

/**
 * The tracker. `renderExtra(milestone)` lets the screen hang an action under a
 * milestone (the shop's Quality Check button, the invoice link) without the
 * tracker knowing about either.
 */
export function ServiceMilestoneTracker({ events, extras, milestones: given, renderExtra }) {
  const milestones = given || buildMilestones(events, extras);
  return (
    <View>
      {milestones.map((m, i) => {
        const next = milestones[i + 1];
        return (
          <MilestoneRow
            key={m.key}
            m={m}
            isLast={i === milestones.length - 1}
            nextReached={!!next && (next.state === 'done' || next.state === 'current')}
            extra={renderExtra ? renderExtra(m) : null}
          />
        );
      })}
    </View>
  );
}
