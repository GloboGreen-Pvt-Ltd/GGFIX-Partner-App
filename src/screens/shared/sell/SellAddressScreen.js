import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, Home, Briefcase, MapPin } from 'lucide-react-native';
import { Loader, BottomActionBar, EmptyState, Badge } from '../../../components/rnr';
import { listAddresses } from '../../../api/customer';

function iconFor(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('home')) return Home;
  if (l.includes('work') || l.includes('office')) return Briefcase;
  return MapPin;
}

export default function SellAddressScreen({ navigation, route }) {
  const params = route.params || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await listAddresses();
      setItems(list);
      if (list[0]) setSelectedId(list.find((a) => a.isDefault)?.id || list[0].id);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loader label="Loading addresses..." />;

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
        <View className="mb-2">
          <Text className="text-[15px] font-extrabold text-text">Where should we pick up?</Text>
          <Text className="text-[11px] text-text-muted mt-0.5">Free doorstep pickup across serviceable areas.</Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate('AddressForm', {})}
          className="bg-primary/5 border border-dashed border-primary/40 rounded-xl p-2.5 flex-row items-center justify-center mb-3 active:opacity-80"
        >
          <Plus size={14} color="#087A0A" />
          <Text className="text-[12px] font-extrabold text-primary ml-1.5">Add new address</Text>
        </Pressable>

        {items.length === 0 ? (
          <EmptyState
            icon={<MapPin size={26} color="#087A0A" />}
            title="No saved addresses"
            description="Add one to schedule pickup."
            actionLabel="Add address"
            onAction={() => navigation.navigate('AddressForm', {})}
          />
        ) : (
          items.map((a) => {
            const Icon = iconFor(a.label);
            const active = selectedId === a.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => setSelectedId(a.id)}
                className={`bg-card rounded-xl border p-2.5 mb-2 active:opacity-80 ${active ? 'border-primary' : 'border-border'}`}
              >
                <View className="flex-row items-start">
                  <View className={`h-9 w-9 rounded-full items-center justify-center mr-2.5 ${active ? 'bg-primary' : 'bg-primary/10'}`}>
                    <Icon size={15} color={active ? '#fff' : '#087A0A'} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className="text-[13px] font-extrabold text-text mr-1.5">{a.label || 'Address'}</Text>
                      {a.isDefault ? <Badge variant="softSuccess">DEFAULT</Badge> : null}
                    </View>
                    {(a.fullName || a.mobile) ? (
                      <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={1}>{a.fullName}{a.mobile ? ` · ${a.mobile}` : ''}</Text>
                    ) : null}
                    <Text className="text-[11px] text-text mt-0.5 leading-4" numberOfLines={2}>
                      {[a.addressLine, a.locality, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <View className={`h-4 w-4 rounded-full border-2 ${active ? 'border-primary' : 'border-border'} items-center justify-center`}>
                    {active ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <BottomActionBar
        title="Continue"
        onPress={() => navigation.navigate('SellComplete', { ...params, addressId: selectedId, address: items.find((a) => a.id === selectedId) })}
        disabled={!selectedId}
      />
    </View>
  );
}
