import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Settings, User } from 'lucide-react-native';
import { getShopPresence } from '../../../api/presence';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, SellScreen } from '../sell/kit';
import { PresencePill, StatBox, fmtClock, fmtDuration, fmtTime, ymd } from './presenceKit';
import PresenceLine from './PresenceLine';

// Shop Presence — every employee of this shop for a day: current presence
// (server state; a reading older than 5 min is shown as unverified, never as
// live), check-in, last exit / return and confirmed outside time. Re-read on
// focus and every 60 s while visible.
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'INSIDE_SHOP', label: 'Inside' },
  { key: 'OUTSIDE_SHOP', label: 'Outside' },
  { key: 'ON_AUTHORIZED_DUTY', label: 'On Duty' },
  { key: 'LOCATION_UNVERIFIED', label: 'Unverified' },
];
const POLL_MS = 60000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function OwnerShopPresenceScreen({ navigation, route }) {
  const [day, setDay] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(route?.params?.filter || 'ALL');
  const [refreshing, setRefreshing] = useState(false);
  const key = ymd(day);
  const today = ymd(new Date());
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    try {
      const d = await getShopPresence(keyRef.current);
      if (d?.date === keyRef.current) setData(d);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    setData(null);
    load();
    const t = setInterval(() => { if (AppState.currentState === 'active' && keyRef.current === today) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load, key, today]));

  const shift = (n) => { const d = new Date(day); d.setDate(d.getDate() + n); setDay(d); };
  const counts = data?.counts || {};
  const rows = (data?.employees || []).filter((e) => e.presence !== 'NOT_CHECKED_IN' || filter === 'ALL');
  const shown = filter === 'ALL' ? rows : rows.filter((e) => e.presence === filter);
  const monitoringOff = data?.settings && data.settings.monitoringEnabled === false;

  return (
    <SellScreen
      title="Shop Presence"
      subtitle={data?.shopName || 'Today'}
      onBack={() => navigation.goBack()}
      right={(
        <Pressable onPress={() => navigation.navigate('OwnerShopPresenceSettings')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Shop presence settings">
          <Settings size={22} color={C.text} />
        </Pressable>
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[C.teal]} tintColor={C.teal} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous day"><ChevronLeft size={22} color={C.teal} /></Pressable>
        <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{key === today ? 'Today' : `${DAYS[day.getDay()]}, ${day.getDate()} ${MONTHS[day.getMonth()]}`}</Text>
        <Pressable onPress={() => shift(1)} disabled={key >= today} hitSlop={10} accessibilityLabel="Next day" style={{ opacity: key >= today ? 0.3 : 1 }}><ChevronRight size={22} color={C.teal} /></Pressable>
      </View>

      {monitoringOff ? <ErrorBox tone="warning" message="Shop presence monitoring is off. Attendance and the shop radius rule work as before." style={{ marginTop: 12 }} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <StatBox value={counts.checkedIn} label="Checked In" />
        <StatBox value={counts.inside} label="Inside Shop" tone="green" />
        <StatBox value={counts.outside} label="Outside Shop" tone="red" />
        <StatBox value={counts.onDuty} label="On Duty Outside" tone="blue" />
        {counts.unverified ? <StatBox value={counts.unverified} label="Unverified" tone="amber" /> : null}
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: '#F1F3F5', borderRadius: 12, padding: 3, marginTop: 14 }}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="tab" accessibilityState={{ selected: filter === f.key }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: filter === f.key ? '#FFFFFF' : 'transparent' }}>
            <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: filter === f.key ? C.teal : C.muted }} numberOfLines={1}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {error && !data ? <ErrorBox message={error.message || 'Could not load shop presence.'} onRetry={load} style={{ marginTop: 14 }} />
        : !data ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} />
          : !shown.length ? <Text style={{ textAlign: 'center', color: C.muted, marginTop: 24, fontSize: rf(12.5) }}>No employees here.</Text>
            : shown.map((e) => {
              const last = e.presence === 'OUTSIDE_SHOP' && e.lastExitAt ? `Left at ${fmtClock(e.lastExitAt)}`
                : e.lastReturnAt ? `Returned at ${fmtClock(e.lastReturnAt)}`
                  : e.presence === 'ON_AUTHORIZED_DUTY' ? 'On authorized field work'
                    : e.checkInTime ? `Checked in ${fmtTime(e.checkInTime)}` : 'Not checked in';
              return (
                <Pressable key={e.employeeId} onPress={() => navigation.navigate('OwnerShopPresenceDetail', { id: e.employeeId, name: e.name, date: key })}
                  accessibilityRole="button" accessibilityLabel={`${e.name} presence details`}
                  style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><User size={18} color={C.teal} /></View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text }} numberOfLines={1}>{e.name}</Text>
                      <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }} numberOfLines={1}>{[e.role, last].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <PresencePill state={e.presence} stale={e.stale} />
                  </View>
                  {e.checkInTime ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <Text style={{ fontSize: rf(12), color: C.muted }}>{`In ${fmtTime(e.checkInTime)}${e.checkOutTime ? ` · Out ${fmtTime(e.checkOutTime)}` : ''}${e.lastVerifiedAt ? ` · Verified ${fmtClock(e.lastVerifiedAt)}` : ''}`}</Text>
                      <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.text }}>{`Outside ${fmtDuration(e.outsideSeconds)}`}</Text>
                    </View>
                  ) : null}
                  {e.checkInTime && e.presence !== 'NOT_CHECKED_IN' ? (
                    <PresenceLine employeeId={e.employeeId} date={key} today={key === today} checkInTime={e.checkInTime}
                      checkOutTime={e.checkOutTime} lastVerifiedAt={e.lastVerifiedAt} version={data} />
                  ) : null}
                </Pressable>
              );
            })}
      <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 14, marginBottom: 8 }}>
        Presence comes from each employee's phone GPS while the Employee App is open. A missing reading shows as Unverified — it is not treated as misconduct.
      </Text>
    </SellScreen>
  );
}
