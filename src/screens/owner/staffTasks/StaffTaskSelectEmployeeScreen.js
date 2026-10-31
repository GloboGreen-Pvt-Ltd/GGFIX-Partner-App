import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Check, TriangleAlert } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { ticketApi } from '../../../api/client';
import { findClash, listTasks, outsideShift } from './staffTaskStore';
import { Avatar, C, TaskHeader, cardShadow } from './staffTaskUi';

const AVAIL = {
  available: { label: 'Available', fg: '#609138', dot: '#609138' },
  busy: { label: 'Busy', fg: '#FAA700', dot: '#FAA700' },
  leave: { label: 'On Leave', fg: '#F32C26', dot: '#F32C26' },
  off: { label: 'Unavailable', fg: '#6B7280', dot: '#9CA3AF' },
};
const FILTERS = [['all', 'All'], ['available', 'Available'], ['busy', 'Busy'], ['leave', 'On Leave']];
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/**
 * The shop's own team only: GET /technicians is scoped to the logged-in shop.
 * Availability comes from real data only:
 *   On Leave    — an APPROVED leave covering the task date (GET /technicians/leaves)
 *   Busy        — another open staff task overlapping the slot
 *   Unavailable — the employee is switched off on My Team (isAvailable = false)
 * Shift = the employee's saved defaultCheckIn / defaultCheckOut.
 * params: { selectedIds, date, startTime, endTime, taskId, onSelect(employees[]) }
 */
export default function StaffTaskSelectEmployeeScreen({ navigation, route }) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const p = route?.params || {};
  const [team, setTeam] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState(() => new Set(p.selectedIds || []));

  useEffect(() => {
    let alive = true;
    Promise.all([
      ticketApi.get('/technicians'),
      ticketApi.get('/technicians/leaves', { query: { status: 'APPROVED' } }).catch(() => []),
      listTasks().catch(() => []), // clash hints only; the team list still loads
    ])
      .then(([res, lv, list]) => {
        if (!alive) return;
        setTeam(Array.isArray(res) ? res : res?.content || res?.data || []);
        setLeaves(Array.isArray(lv) ? lv : lv?.content || []);
        setTasks(list);
      })
      .catch((e) => { if (alive) { setTeam([]); setError(e?.message || 'Could not load your team.'); } });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => (team || []).map((e) => {
    const onLeave = !!p.date && leaves.some((l) => String(l.technicianId) === String(e.id)
      && String(l.startDate) <= p.date && p.date <= String(l.endDate || l.startDate));
    const clash = findClash(tasks, { id: p.taskId, assigneeId: e.id, date: p.date, startTime: p.startTime, endTime: p.endTime });
    const shiftStart = hhmm(e.defaultCheckIn);
    const shiftEnd = hhmm(e.defaultCheckOut);
    const offShift = outsideShift({ shiftStart, shiftEnd }, p.startTime, p.endTime);
    const avail = e.isAvailable === false ? 'off' : onLeave ? 'leave' : clash ? 'busy' : 'available';
    return { e, avail, clash, shiftStart, shiftEnd, offShift };
  }), [team, leaves, tasks, p.taskId, p.date, p.startTime, p.endTime]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((x) => (filter === 'all' || x.avail === filter)
      && (!needle || `${x.e.name} ${x.e.roleLabel || ''} ${x.e.phone || ''}`.toLowerCase().includes(needle)));
  }, [rows, q, filter]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const done = () => {
    const chosen = rows.filter((x) => picked.has(x.e.id)).map(({ e, shiftStart, shiftEnd }) => ({
      id: e.id, name: e.name, roleLabel: e.roleLabel || null, phone: e.phone || null, photoUrl: e.photoUrl || null, shiftStart, shiftEnd,
    }));
    if (!chosen.length) return;
    p.onSelect?.(chosen);
    navigation.goBack();
  };

  const col = r.isTablet ? { width: '100%', maxWidth: r.maxWidth('list'), alignSelf: 'center' } : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <TaskHeader title="Select Employee" onBack={() => navigation.goBack()} />
      <View style={[{ paddingHorizontal: 12, paddingTop: 10 }, col]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 42, borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
          <Search size={16} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search employee…" placeholderTextColor={C.subtle} autoCorrect={false}
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: C.ink, paddingVertical: 8 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
          {FILTERS.map(([k, l]) => {
            const on = filter === k;
            const count = k === 'all' ? rows.length : rows.filter((x) => x.avail === k).length;
            return (
              <Pressable key={k} onPress={() => setFilter(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: on ? C.primary : C.card, borderWidth: 1, borderColor: on ? C.primary : C.line }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#FFFFFF' : C.ink }}>{l} ({count})</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {team === null ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(x) => String(x.e.id)}
          contentContainerStyle={[{ paddingHorizontal: 12, paddingBottom: insets.bottom + 100 }, col]}
          ListEmptyComponent={(
            <Text style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: C.muted }}>
              {error || (q || filter !== 'all' ? 'No employee matches.' : 'No employees in this shop yet. Add them from My Team.')}
            </Text>
          )}
          renderItem={({ item: { e, avail, clash, shiftStart, shiftEnd, offShift } }) => {
            const a = AVAIL[avail];
            const on = picked.has(e.id);
            const disabled = avail === 'off' || avail === 'leave';
            const warn = clash ? `Busy: ${clash.title} (${clash.startTime}–${clash.endTime})` : offShift ? `Outside shift ${shiftStart}–${shiftEnd}` : null;
            return (
              <Pressable
                onPress={() => !disabled && toggle(e.id)}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled }}
                style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, marginBottom: 6, borderRadius: 14, backgroundColor: on ? C.mint : C.card, borderWidth: on ? 1.5 : 1, borderColor: on ? C.primary : C.line, opacity: disabled ? 0.55 : 1 }, cardShadow]}
              >
                <View style={{ height: 22, width: 22, borderRadius: 6, borderWidth: 1.5, borderColor: on ? C.primary : '#9CA3AF', backgroundColor: on ? C.primary : C.card, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  {on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
                <Avatar person={e} size={38} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }} numberOfLines={1}>{e.name}</Text>
                  <Text style={{ fontSize: 11.5, color: C.muted }} numberOfLines={1}>
                    {e.roleLabel || 'Employee'}{shiftStart && shiftEnd ? ` · Shift ${shiftStart}–${shiftEnd}` : ''}
                  </Text>
                  {warn ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <TriangleAlert size={11} color="#FAA700" />
                      <Text style={{ marginLeft: 4, fontSize: 11, color: '#FAA700' }} numberOfLines={1}>{warn}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
                  <View style={{ height: 7, width: 7, borderRadius: 4, backgroundColor: a.dot, marginRight: 4 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: a.fg }}>{a.label}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
        <Pressable onPress={done} disabled={!picked.size} accessibilityRole="button"
          style={[{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: picked.size ? C.primary : '#9CA3AF' }, col]}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{picked.size ? `Select (${picked.size})` : 'Select'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
