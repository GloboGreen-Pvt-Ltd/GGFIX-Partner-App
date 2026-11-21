import React, { useCallback, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MapPinCheck } from 'lucide-react-native';
import { getShopPresence } from '../../api/presence';
import { rf } from '../../utils/responsive';
import { PresencePill, StatBox, fmtClock } from '../../screens/owner/presence/presenceKit';

// Home → compact Shop Presence card (server counts for this shop; each
// employee is in exactly one current-presence bucket). Hidden when the
// caller can't read shop presence (not an owner) or the request fails.
const POLL_MS = 60000;

export default function ShopPresenceSummary({ pad = 16, onOpen }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => { getShopPresence().then(setData).catch(() => setData(null)); }, []);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(() => { if (AppState.currentState === 'active') load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]));

  if (!data || data.settings?.monitoringEnabled === false) return null;
  const c = data.counts || {};
  const notable = (data.employees || []).filter((e) => e.presence === 'OUTSIDE_SHOP' || e.presence === 'ON_AUTHORIZED_DUTY').slice(0, 2);
  return (
    <View style={{ marginHorizontal: pad, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6ECEE', padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: '#E6F1F3', alignItems: 'center', justifyContent: 'center' }}>
          <MapPinCheck size={18} color="#035C6C" />
        </View>
        <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(15), fontWeight: '800', color: '#1C3053' }}>Shop Presence</Text>
        <Pressable onPress={onOpen} hitSlop={10} accessibilityRole="button" accessibilityLabel="View all shop presence">
          <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: '#035C6C' }}>View All ›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <StatBox value={c.checkedIn} label="Checked In" />
        <StatBox value={c.inside} label="Inside" tone="green" />
        <StatBox value={c.outside} label="Outside" tone="red" />
        {c.onDuty ? <StatBox value={c.onDuty} label="On Duty" tone="blue" /> : null}
        {c.unverified ? <StatBox value={c.unverified} label="Unverified" tone="amber" /> : null}
      </View>
      {notable.map((e) => (
        <View key={e.employeeId} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEF1F3' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: rf(13), fontWeight: '800', color: '#1C3053' }} numberOfLines={1}>{e.name}</Text>
            <Text style={{ fontSize: rf(11.5), color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
              {e.presence === 'OUTSIDE_SHOP' ? `Left at ${fmtClock(e.lastExitAt)}` : 'Authorized pickup / delivery'}
            </Text>
          </View>
          <PresencePill state={e.presence} />
        </View>
      ))}
    </View>
  );
}
