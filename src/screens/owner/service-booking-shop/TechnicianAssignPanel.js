import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronDown, Clock, RefreshCw, User, UserCheck, Users, X } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { ResponsiveModal } from '../../../components/responsive';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const INK = '#111111';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';
const GREEN = '#609138';
const RED = '#DC2626';

const MODES = [
  { key: 'all', title: 'Assign All', hint: 'One technician for all devices', Icon: Users },
  { key: 'each', title: 'Individually', hint: 'A technician for each device', Icon: UserCheck },
  { key: 'later', title: 'Assign Later', hint: 'Assign from Jobs later', Icon: Clock },
];

const techName = (t) => t?.name || t?.fullName || t?.employeeName || 'Technician';
// Only an explicit `isAvailable: false` blocks a technician — nothing is guessed.
const canAssign = (t) => t?.isAvailable !== false;

/**
 * Thank You → Assign Technician, inline. Every device of a booking is its own
 * ticket (GTS-074-A, -B …), so each assignment is a PATCH of that ticket's
 * `assignedTechnicianId` — the same call the Jobs list and Booking Details use,
 * which also drives the technician's notification and Employee App job list.
 *
 * One ticket: a plain technician picker. Several: Assign All / Individually /
 * Later. Success is shown only for tickets the backend confirmed; a failed one
 * can be retried on its own, and a ticket already assigned to the chosen
 * technician is not re-sent (no duplicate assignment / notification).
 *
 * items: [{ ticket, device }] — the created tickets with their device record.
 */
export default function TechnicianAssignPanel({ items = [] }) {
  const bulk = items.length > 1;
  const [mode, setMode] = useState(bulk ? 'all' : 'each');
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [allTech, setAllTech] = useState(null);             // Assign All pick
  const [picks, setPicks] = useState({});                   // ticketId → tech (Individually / single)
  const [assigned, setAssigned] = useState({});              // ticketId → tech the backend confirmed
  const [failed, setFailed] = useState({});                  // ticketId → error message
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);          // 'all' | ticketId | null

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await ticketApi.get('/technicians');
      const rows = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      setTechs(rows);
    } catch (e) {
      setTechs([]);
      setLoadError(e?.message || 'Could not load technicians.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A ticket created already assigned (unlikely, but possible) counts as done.
  useEffect(() => {
    const seed = {};
    items.forEach(({ ticket }) => {
      if (ticket?.assignedTechnicianId) {
        const t = techs.find((x) => x.id === ticket.assignedTechnicianId);
        seed[ticket.id] = t || { id: ticket.assignedTechnicianId, name: ticket.assignedTechnicianName || 'Technician' };
      }
    });
    if (Object.keys(seed).length) setAssigned((cur) => ({ ...seed, ...cur }));
  }, [items, techs]);

  const targetFor = (ticketId) => (mode === 'all' ? allTech : picks[ticketId]) || null;
  const pending = items.filter(({ ticket }) => {
    const t = targetFor(ticket.id);
    return t && assigned[ticket.id]?.id !== t.id;
  });
  const doneCount = items.filter(({ ticket }) => assigned[ticket.id]).length;
  const failedCount = Object.keys(failed).length;

  // Assign each ticket that has a (new) technician; one PATCH per ticket.
  const submit = async (only = null) => {
    if (busy) return;
    const list = only ? items.filter(({ ticket }) => only.includes(ticket.id)) : pending;
    if (!list.length) return;
    setBusy(true);
    const ok = {};
    const bad = {};
    for (const { ticket } of list) {
      const t = targetFor(ticket.id);
      if (!t || !canAssign(t)) continue;
      try {
        await ticketApi.patch(`/tickets/${ticket.id}`, { body: { assignedTechnicianId: t.id } });
        ok[ticket.id] = t;
      } catch (e) {
        bad[ticket.id] = e?.message || 'Assignment failed';
      }
    }
    setAssigned((cur) => ({ ...cur, ...ok }));
    setFailed((cur) => {
      const next = { ...cur };
      Object.keys(ok).forEach((id) => { delete next[id]; });
      return { ...next, ...bad };
    });
    setBusy(false);
  };

  const pickTech = (t) => {
    if (!canAssign(t)) return;
    if (pickerFor === 'all') setAllTech(t);
    else if (pickerFor) setPicks((p) => ({ ...p, [pickerFor]: t }));
    setPickerFor(null);
  };

  const summary = useMemo(() => {
    if (!items.length) return '';
    const left = items.length - doneCount;
    return `${items.length} Device${items.length === 1 ? '' : 's'} · ${doneCount} Assigned${left ? ` · ${left} Unassigned` : ''}`;
  }, [items.length, doneCount]);

  if (!items.length) return null;

  return (
    <View style={{ marginHorizontal: 14, marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', padding: 12 }}>
      <View className="flex-row items-center">
        <View className="items-center justify-center" style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: MINT }}>
          <User size={16} color={ACCENT} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: INK }}>Assign Technician</Text>
          <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            {bulk ? 'Choose how to assign these repair jobs.' : 'Choose a technician for this repair job.'}
          </Text>
        </View>
      </View>

      {/* Bulk: three ways to assign. */}
      {bulk ? (
        <View className="flex-row" style={{ gap: 6, marginTop: 10 }}>
          {MODES.map((m) => {
            const on = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                className="flex-1 items-center active:opacity-80"
                style={{ paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : LINE, backgroundColor: on ? MINT : '#FFFFFF' }}
              >
                <m.Icon size={18} color={on ? ACCENT : INK} strokeWidth={1.9} />
                <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '800', color: on ? ACCENT : INK }} numberOfLines={1}>{m.title}</Text>
                <Text style={{ marginTop: 1, fontSize: 9.5, color: MUTED, textAlign: 'center' }} numberOfLines={2}>{m.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={ACCENT} /></View>
      ) : loadError ? (
        <Pressable onPress={load} className="flex-row items-center justify-center active:opacity-80" style={{ marginTop: 10, paddingVertical: 10 }}>
          <RefreshCw size={14} color={RED} />
          <Text style={{ marginLeft: 6, fontSize: 12.5, color: RED, fontWeight: '700' }}>{loadError} Tap to retry.</Text>
        </Pressable>
      ) : techs.length === 0 ? (
        <Text style={{ marginTop: 10, fontSize: 12.5, color: MUTED }}>No technicians found for this shop. Add one in Employees, then assign from Jobs.</Text>
      ) : mode === 'later' ? (
        <View style={{ marginTop: 10, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: LINE, padding: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: INK }}>
            {items.length - doneCount} Job{items.length - doneCount === 1 ? '' : 's'} Awaiting Assignment
          </Text>
          <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>The booking is saved. Assign technicians any time from Jobs → the booking → Assign.</Text>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          {/* Assign All: one picker for every device. */}
          {mode === 'all' ? (
            <TechSelect label="Technician" tech={allTech} onPress={() => setPickerFor('all')} />
          ) : null}

          {/* One row per device ticket (Individually / single booking). */}
          {items.map(({ ticket, device }) => {
            const done = assigned[ticket.id];
            const err = failed[ticket.id];
            const pick = targetFor(ticket.id);
            const issues = (device?.services || []).map((x) => x.serviceName).filter(Boolean).join(', ');
            return (
              <View key={ticket.id} style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: err ? '#FECACA' : done ? MINT_LINE : LINE, backgroundColor: done ? '#F4FAFB' : '#FFFFFF', padding: 10 }}>
                <View className="flex-row items-center">
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: ACCENT }}>{ticket.trackingId ? `#${ticket.trackingId}` : 'Job'}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>{device?.modelName || 'Device'}</Text>
                    {issues ? <Text style={{ fontSize: 11.5, color: MUTED }} numberOfLines={1}>{issues}</Text> : null}
                  </View>
                  {done ? (
                    <View className="flex-row items-center" style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(96,145,56,0.14)' }}>
                      <Check size={11} color={GREEN} strokeWidth={3} />
                      <Text style={{ marginLeft: 3, fontSize: 11, fontWeight: '800', color: GREEN }} numberOfLines={1}>{techName(done)}</Text>
                    </View>
                  ) : null}
                </View>
                {mode === 'each' ? (
                  <View style={{ marginTop: 8 }}>
                    <TechSelect tech={pick} onPress={() => setPickerFor(ticket.id)} compact />
                  </View>
                ) : null}
                {err ? (
                  <View className="flex-row items-center" style={{ marginTop: 6 }}>
                    <Text style={{ flex: 1, fontSize: 11.5, color: RED }} numberOfLines={2}>{err}</Text>
                    <Pressable onPress={() => submit([ticket.id])} disabled={busy} hitSlop={6} className="flex-row items-center active:opacity-70">
                      <RefreshCw size={13} color={ACCENT} />
                      <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '800', color: ACCENT }}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* Confirm — sends only tickets with a new / changed technician. */}
          <Pressable
            onPress={() => submit()}
            disabled={busy || pending.length === 0}
            accessibilityRole="button"
            className="flex-row items-center justify-center active:opacity-85"
            style={{ marginTop: 10, height: 46, borderRadius: 12, backgroundColor: ACCENT, opacity: busy || pending.length === 0 ? 0.45 : 1 }}
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                {mode === 'all' && bulk ? `Assign to All ${items.length} Devices` : bulk ? 'Confirm Assignments' : 'Assign Technician'}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Result — only what the backend confirmed. */}
      {doneCount > 0 || failedCount > 0 ? (
        <View className="flex-row items-center" style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: LINE }}>
          {doneCount === items.length ? <Check size={15} color={GREEN} strokeWidth={3} /> : null}
          <Text style={{ flex: 1, marginLeft: doneCount === items.length ? 6 : 0, fontSize: 12.5, fontWeight: '800', color: doneCount === items.length ? GREEN : INK }}>
            {doneCount === items.length ? `Technicians Assigned · ${doneCount} of ${items.length} Jobs` : summary}
          </Text>
          {failedCount ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: RED }}>{failedCount} failed</Text> : null}
        </View>
      ) : null}

      {/* Technician list (real shop technicians). */}
      <ResponsiveModal visible={!!pickerFor} onClose={() => setPickerFor(null)} maxWidth={480}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: 10 }} />
        <View className="flex-row items-center" style={{ marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: INK }}>Select Technician</Text>
          <Pressable onPress={() => setPickerFor(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={MUTED} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 420 }}>
          {techs.map((t) => {
            const ok = canAssign(t);
            const sel = (pickerFor === 'all' ? allTech : picks[pickerFor])?.id === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => pickTech(t)}
                disabled={!ok}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel, disabled: !ok }}
                className="flex-row items-center active:opacity-80"
                style={{ minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderRadius: 12, borderWidth: sel ? 1.5 : 1, borderColor: sel ? ACCENT : LINE, backgroundColor: sel ? MINT : '#FFFFFF', opacity: ok ? 1 : 0.5 }}
              >
                <View className="items-center justify-center" style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: MINT }}>
                  <User size={15} color={ACCENT} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK }} numberOfLines={1}>{techName(t)}</Text>
                  <Text style={{ fontSize: 11.5, color: MUTED }} numberOfLines={1}>
                    {t.roleLabel || 'Technician'}
                    {t.isAvailable === false ? <Text style={{ color: RED, fontWeight: '700' }}> · Unavailable</Text>
                      : t.isAvailable === true ? <Text style={{ color: GREEN, fontWeight: '700' }}> · Available</Text> : null}
                  </Text>
                </View>
                {sel ? <Check size={16} color={ACCENT} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </ResponsiveModal>
    </View>
  );
}

/** Dropdown-style field showing the chosen technician. */
function TechSelect({ label, tech, onPress, compact = false }) {
  return (
    <View>
      {label ? <Text style={{ fontSize: 12, fontWeight: '700', color: INK, marginBottom: 6 }}>{label}</Text> : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={tech ? `Technician ${techName(tech)}. Change.` : 'Select technician'}
        className="flex-row items-center active:opacity-80"
        style={{ height: compact ? 40 : 46, borderRadius: 12, borderWidth: 1, borderColor: tech ? ACCENT : LINE, backgroundColor: '#FFFFFF', paddingHorizontal: 12 }}
      >
        <User size={16} color={tech ? ACCENT : MUTED} strokeWidth={2} />
        <Text style={{ flex: 1, marginLeft: 8, fontSize: 13.5, fontWeight: tech ? '700' : '500', color: tech ? INK : '#9CA3AF' }} numberOfLines={1}>
          {tech ? techName(tech) : 'Select Technician'}
        </Text>
        <ChevronDown size={17} color={INK} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
