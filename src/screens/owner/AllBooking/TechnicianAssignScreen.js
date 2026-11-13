import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ActivityIndicator, Pressable, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, RefreshCw, Search, Smartphone, UserX, X } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { confirm, notify } from '../../../components/confirm';
import { getOwnerTech } from '../../../api/ownerTechnician';
import { emitTicketUpdated } from '../../../lib/ticketEvents';
import { useResponsive } from '../../../theme/responsive';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';
const LINE = '#E5E7EB';
const PAGE = '#F3F4F6';
const GREEN = '#609138';
const AMBER = '#B45309';
const RED = '#DC2626';
const AVATAR_TONES = ['#035C6C', '#0788C9', '#609138', '#E08E00', '#1C3053', '#F32C26'];

const techName = (t) => t?.name || t?.fullName || t?.employeeName || 'Technician';
const techPhone = (t) => t?.phone || t?.mobile || t?.phoneNumber || '';
// Only an explicit `isAvailable: false` blocks a technician — nothing is guessed.
const canAssign = (t) => t?.isAvailable !== false;
// Technician role only (Staff / Pickup Person left out). No role saved = Technician,
// the same default the Employees list shows.
const isTechnicianRole = (t) => !String(t?.roleLabel || '').trim() || /technician/i.test(t.roleLabel);
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/**
 * Booking Details → Assign / Change Technician. One ticket; only the
 * technician changes (PATCH assignedTechnicianId), then back to the details,
 * which reloads on focus.
 */
export default function TechnicianAssignScreen({ navigation, route }) {
  const { ticketId, trackingId, deviceName, currentTechnicianId = null } = route?.params || {};
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const col = r.isTablet ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : null;

  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);
  const sendingRef = useRef(false);
  // Owner as Technician ON → "Assign to Myself" (the owner's own technician row).
  const [selfTech, setSelfTech] = useState(null);
  const [reason, setReason] = useState('');

  // Pull to refresh: re-runs the screen's load.

  const [pullRefreshing, setPullRefreshing] = useState(false);

  const onPullRefresh = async () => { setPullRefreshing(true); try { await load(); } catch {} finally { setPullRefreshing(false); } };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, ot] = await Promise.all([
        ticketApi.get('/technicians'),
        getOwnerTech().catch(() => null),
      ]);
      setTechs(Array.isArray(data) ? data : data?.content ?? data?.data ?? []);
      setSelfTech(ot?.enabled && ot.technicianId ? { id: ot.technicianId, name: 'Myself', roleLabel: 'Owner', _self: true } : null);
    } catch (e) {
      setTechs([]);
      setLoadError(e?.message || 'Could not load technicians.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const current = techs.find((t) => t.id === currentTechnicianId)
    || (selfTech && selfTech.id === currentTechnicianId ? selfTech : null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const techOnly = techs.filter(isTechnicianRole);
    const rows = q
      ? techOnly.filter((t) => `${techName(t)} ${t.code || ''} ${techPhone(t)}`.toLowerCase().includes(q))
      : techOnly;
    // Available first, then by name; the current technician stays in place.
    return [...rows].sort((a, b) => (canAssign(b) - canAssign(a)) || techName(a).localeCompare(techName(b)));
  }, [techs, query]);

  const techCount = techs.filter(isTechnicianRole).length;
  const changed = !!picked && picked.id !== currentTechnicianId;

  const assign = async () => {
    if (!changed || sendingRef.current) return;
    // Re-assign: confirm old → new first; the repair progress stays, the new
    // technician has to accept before continuing.
    if (currentTechnicianId) {
      const ok = await confirm({
        title: 'Re-assign technician?',
        message: `${current ? techName(current) : 'Current technician'} → ${techName(picked)}

Repair progress, photos and history are kept. ${techName(picked)} must accept the job to continue.`,
        confirmText: 'Re-assign',
      });
      if (!ok) return;
    }
    sendingRef.current = true;
    setSaving(true);
    try {
      const body = { assignedTechnicianId: picked.id, expectedTechnicianId: currentTechnicianId || null };
      if (currentTechnicianId && reason.trim()) body.reassignReason = reason.trim();
      const res = await ticketApi.patch(`/tickets/${ticketId}`, { body });
      if (res?.assignedTechnicianId && res.assignedTechnicianId !== picked.id) throw new Error('The server did not save the technician.');
      emitTicketUpdated(ticketId, { assignedTechnicianId: picked.id, technician: picked });
      notify(currentTechnicianId ? 'Technician changed' : 'Technician assigned', `${techName(picked)} is now on #${trackingId || 'this job'}.`, { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Could not assign', e?.message || 'Try again.', { preset: 'error' });
    } finally {
      sendingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, col]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back" className="items-center justify-center active:opacity-70" style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE, borderWidth: 1, borderColor: LINE }}>
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>{currentTechnicianId ? 'Change Technician' : 'Assign Technician'}</Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              {[trackingId ? `#${trackingId}` : null, deviceName].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} colors={['#035C6C']} tintColor="#035C6C" />} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}>
        <View style={col}>
          {/* Job + who has it now */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: LINE, padding: 12 }}>
            <View className="items-center justify-center" style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: MINT }}>
              <Smartphone size={19} color={ACCENT} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: INK }} numberOfLines={1}>{deviceName || 'Device'}</Text>
              <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }} numberOfLines={1}>
                {currentTechnicianId ? `Now: ${current ? techName(current) : 'Assigned technician'}` : 'No technician assigned yet'}
              </Text>
            </View>
          </View>

          {/* Search */}
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, marginTop: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' }}>
            <Search size={17} color={SUBTLE} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search technician by name or number"
              placeholderTextColor={SUBTLE}
              cursorColor={ACCENT}
              style={{ flex: 1, marginLeft: 8, fontSize: 14, color: INK, includeFontPadding: false, paddingVertical: 0 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={16} color={MUTED} />
              </Pressable>
            ) : null}
          </View>

          {selfTech ? (
            <Pressable
              onPress={() => setPicked(selfTech)}
              disabled={selfTech.id === currentTechnicianId}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked?.id === selfTech.id }}
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 56, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: picked?.id === selfTech.id ? 1.5 : 1, borderColor: picked?.id === selfTech.id ? ACCENT : LINE, backgroundColor: picked?.id === selfTech.id ? MINT : '#FFFFFF', opacity: selfTech.id === currentTechnicianId ? 0.55 : 1 }}
            >
              <View className="items-center justify-center" style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: ACCENT }}>
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>Assign to Myself</Text>
                <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                  {selfTech.id === currentTechnicianId ? 'You are on this job' : 'Work on this repair yourself'}
                </Text>
              </View>
            </Pressable>
          ) : null}

          <Text style={{ fontSize: 13, fontWeight: '800', color: INK, marginTop: 14, marginBottom: 8 }}>
            Technicians{techCount ? <Text style={{ color: MUTED, fontWeight: '600' }}> ({techCount})</Text> : null}
          </Text>

          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
          ) : loadError ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 12.5, color: RED, textAlign: 'center' }}>{loadError}</Text>
              <Pressable onPress={load} className="flex-row items-center active:opacity-70" style={{ marginTop: 10 }}>
                <RefreshCw size={14} color={ACCENT} />
                <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '800', color: ACCENT }}>Try again</Text>
              </Pressable>
            </View>
          ) : !list.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 28 }}>
              <UserX size={28} color={SUBTLE} />
              <Text style={{ marginTop: 8, fontSize: 12.5, color: MUTED, textAlign: 'center' }}>
                {query ? 'No technician matches this search.' : 'No technicians yet. Add one in Employees.'}
              </Text>
            </View>
          ) : list.map((t, i) => {
            const ok = canAssign(t);
            const isCurrent = t.id === currentTechnicianId;
            const sel = picked?.id === t.id;
            const tone = AVATAR_TONES[techs.indexOf(t) % AVATAR_TONES.length];
            const phone = techPhone(t);
            return (
              <Pressable
                key={t.id || i}
                onPress={() => setPicked(t)}
                disabled={!ok || isCurrent}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel, disabled: !ok || isCurrent }}
                className="flex-row items-center active:opacity-80"
                style={{ minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderRadius: 14, borderWidth: sel ? 1.5 : 1, borderColor: sel ? ACCENT : LINE, backgroundColor: sel ? MINT : '#FFFFFF', opacity: ok ? 1 : 0.55 }}
              >
                <View className="items-center justify-center" style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: tone }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }}>{initials(techName(t))}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: INK }} numberOfLines={1}>
                    {techName(t)}{t.code ? <Text style={{ color: MUTED, fontWeight: '600' }}> · {t.code}</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                    {[t.roleLabel || 'Technician', phone].filter(Boolean).join(' · ')}
                    {isCurrent ? <Text style={{ color: AMBER, fontWeight: '700' }}> · Current</Text>
                      : !ok ? <Text style={{ color: RED, fontWeight: '700' }}> · Unavailable</Text>
                      : t.isAvailable === true ? <Text style={{ color: GREEN, fontWeight: '700' }}> · Available</Text> : null}
                  </Text>
                </View>
                <View className="items-center justify-center" style={{ height: 22, width: 22, borderRadius: 11, borderWidth: 2, borderColor: sel ? ACCENT : '#D1D5DB', backgroundColor: sel ? ACCENT : '#FFFFFF' }}>
                  {sel ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
        <View style={col}>
          {currentTechnicianId && changed ? (
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason for re-assigning (optional)"
              placeholderTextColor={SUBTLE}
              cursorColor={ACCENT}
              maxLength={200}
              style={{ height: 42, marginBottom: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: LINE, fontSize: 13.5, color: INK }}
            />
          ) : null}
          <Pressable
            onPress={assign}
            disabled={!changed || saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: !changed || saving }}
            className="items-center justify-center active:opacity-85"
            style={{ height: 50, borderRadius: 12, backgroundColor: ACCENT, opacity: changed ? 1 : 0.45 }}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : (
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>
                {picked ? `${currentTechnicianId ? 'Change to' : 'Assign'} ${techName(picked)}` : 'Select a technician'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
