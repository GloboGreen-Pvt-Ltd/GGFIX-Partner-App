import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getEmployeePresence } from '../../../api/presence';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, InfoRow, Section, SellScreen } from '../sell/kit';
import { EVENT_LABEL, PRESENCE, PresencePill, StatBox, fmtClock, fmtDuration, fmtTime } from './presenceKit';

// One employee's shop presence: today's (or the chosen day's) manual punches,
// current presence, exit / return / duty timeline and 7 / 30-day totals.
// Read only — the event history is the server's immutable record.
export default function OwnerShopPresenceDetailScreen({ navigation, route }) {
  const { id, name, date } = route?.params || {};
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setD(await getEmployeePresence(id, date)); setError(null); } catch (e) { setError(e); }
  }, [id, date]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const recent = d?.recentDays || [];
  const sum = (days, k) => days.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const week = recent.filter((x) => (Date.now() - new Date(x.date).getTime()) < 7 * 86400000);

  return (
    <SellScreen
      title={d?.name || name || 'Employee'}
      subtitle={[d?.role, d?.shopName].filter(Boolean).join(' · ') || 'Shop Presence'}
      onBack={() => navigation.goBack()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[C.teal]} tintColor={C.teal} />}
    >
      {error && !d ? <ErrorBox message={error.message || 'Could not load presence.'} onRetry={load} style={{ marginTop: 12 }} />
        : !d ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: rf(13), color: C.muted }}>{d.date}</Text>
              <PresencePill state={d.presence} stale={d.stale} />
            </View>
            <Section title="Attendance">
              <InfoRow label="Status" value={d.attendanceStatus || (d.checkInTime ? 'Present' : 'Not checked in')} />
              <InfoRow label="Manual Check In" value={fmtTime(d.checkInTime)} />
              <InfoRow label="Manual Check Out" value={fmtTime(d.checkOutTime)} />
              <InfoRow label="Current Presence" value={(PRESENCE[d.presence] || {}).label || '—'} />
              <InfoRow label="GPS Last Verified" value={d.lastVerifiedAt ? `${fmtClock(d.lastVerifiedAt)}${d.stale ? ' (not live)' : ''}` : '—'} />
            </Section>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <StatBox value={d.outsideVisits} label="Exits" tone="amber" />
              <View style={{ flex: 1, backgroundColor: '#FDECE2', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: '#C2410C' }}>{fmtDuration(d.outsideSeconds)}{d.outsideOpen ? '+' : ''}</Text>
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>Outside</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#E1F0FA', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: '#0788C9' }}>{fmtDuration(d.dutySeconds)}</Text>
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>Authorized Duty</Text>
              </View>
            </View>
            <Section title="Movements">
              {(d.timeline || []).length === 0 ? <Text style={{ color: C.muted, fontSize: rf(12.5) }}>No movements recorded.</Text>
                : d.timeline.map((e, i) => (
                  <View key={`${e.type}-${e.at}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: rf(13), fontWeight: '700', color: C.text }}>{EVENT_LABEL[e.type] || e.type}</Text>
                      {e.durationSeconds != null ? <Text style={{ fontSize: rf(11.5), color: C.muted }}>{`Duration ${fmtDuration(e.durationSeconds)}`}</Text> : null}
                      {e.dutyRef ? <Text style={{ fontSize: rf(11.5), color: C.muted }}>{String(e.dutyRef).replace(/_/g, ' ')}</Text> : null}
                    </View>
                    <Text style={{ fontSize: rf(12.5), color: C.muted }}>{fmtClock(e.at)}</Text>
                  </View>
                ))}
            </Section>
            <Section title="Summary">
              <InfoRow label="Last 7 days · outside" value={`${fmtDuration(sum(week, 'outsideSeconds'))} · ${sum(week, 'outsideVisits')} exits`} />
              <InfoRow label="Last 30 days · outside" value={`${fmtDuration(sum(recent, 'outsideSeconds'))} · ${sum(recent, 'outsideVisits')} exits`} />
              <InfoRow label="Last 30 days · authorized duty" value={fmtDuration(sum(recent, 'dutySeconds'))} />
            </Section>
            <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 14, marginBottom: 8 }}>
              Outside time is not automatically misconduct and is never deducted from pay. Unverified time means the phone sent no reliable location (app closed, GPS off or no signal).
            </Text>
          </>
        )}
    </SellScreen>
  );
}
