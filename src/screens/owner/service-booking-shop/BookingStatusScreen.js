import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';

// statusList holds the real /tickets/counts enum keys; the tile keys/labels are
// display only. The old code looked up the display key (e.g. 'SERVICE_ACCEPTED')
// directly in the counts response, which never matches — so every tile read 00.
// (The old 'RE_ASSIGN_TECH' tile is dropped: reassignment is an event, not a
// ticket status, so /tickets/counts can never return a figure for it.)
const TILES = [
  { key: 'SERVICE_ACCEPTED',    label: 'Service Accepted',    statusList: ['CREATED'],                   color: '#7ED957', icon: 'document-text-outline' },
  { key: 'TECHNICIAN_ASSIGNED', label: 'Technician Assigned', statusList: ['ASSIGNED'],                  color: '#16BB05', icon: 'construct-outline' },
  { key: 'IN_SERVICE_PROCESS',  label: 'In Service Process',  statusList: ['IN_DIAGNOSIS', 'IN_REPAIR'], color: '#667066', icon: 'build-outline' },
  { key: 'WORK_COMPLETED',      label: 'Work Completed',      statusList: ['READY'],                     color: '#16BB05', icon: 'checkmark-circle-outline' },
  { key: 'OUT_OF_DELIVERY',     label: 'Out of Delivery',     statusList: ['DELIVERED_PROCESSING'],      color: '#16BB05', icon: 'car-outline' },
  { key: 'WORK_PENDING',        label: 'Work Pending',        statusList: ['QUOTED', 'APPROVED'],        color: '#DC2626', icon: 'warning-outline' },
  { key: 'DELIVERED',           label: 'Delivered',           statusList: ['DELIVERED'],                 color: '#16BB05', icon: 'cube-outline' },
];

export default function BookingStatusScreen({ navigation }) {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(React.useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await ticketApi.get('/tickets/counts');
        if (!cancelled) setCounts(data || {});
      } catch (_) { if (!cancelled) setCounts({}); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []));

  const count = (tile) => {
    const total = (tile.statusList || []).reduce(
      (acc, k) => acc + Number(counts?.[k] ?? counts?.[k.toLowerCase()] ?? 0),
      0,
    );
    return String(total).padStart(2, '0');
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Booking Status" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerClassName="px-4 pt-4 pb-12">
        <View className="flex-row items-center mb-4">
          <Text className="flex-1 font-bold text-text">This Month Booking Status Sumary</Text>
          <Pressable><Text className="text-primary font-semibold underline">Previous Report</Text></Pressable>
        </View>

        <Pressable
          onPress={() => navigation.navigate('ShopServiceStatus')}
          className="bg-primary rounded-2xl py-3 px-4 mb-4 flex-row items-center justify-center active:opacity-80"
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text className="text-white font-bold ml-2">Update Customer Service Status</Text>
        </Pressable>

        {loading ? <ActivityIndicator color="#087A0A" /> : null}

        <View className="flex-row flex-wrap">
          {TILES.map((t) => (
            <View key={t.key} className="w-1/2 p-2">
              <View style={{ backgroundColor: t.color }} className="rounded-2xl py-6 items-center">
                <Ionicons name={t.icon} size={28} color="#fff" />
                <Text className="text-white font-bold mt-2 text-center">{t.label}</Text>
                <Text className="text-white font-extrabold text-2xl mt-1">{count(t)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
