import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Smartphone, Skull, Cpu, HardDrive, Palette, ChevronRight } from 'lucide-react-native';
import { BottomActionBar, Input, Label, Badge } from '../../../components/rnr';

const OPTIONS = [
  { key: 'WORKING', label: 'Working Phone', sub: 'Turns on · Calls · No major issues', icon: Smartphone, color: '#16BB05', bg: 'bg-success/10', activeBg: 'bg-success/15', border: 'border-success' },
  { key: 'DEAD',    label: 'Phone Dead / Unknown', sub: "Won't turn on · Not sure",       icon: Skull,      color: '#DC2626', bg: 'bg-danger/10',  activeBg: 'bg-danger/15',  border: 'border-danger' },
];

export default function SellConditionScreen({ navigation, route }) {
  const device = route?.params?.device || {};
  const [condition, setCondition] = useState('WORKING');
  const [imei, setImei] = useState(device.imei || '');

  const onContinue = () => {
    navigation.navigate('SellScreening', { device: { ...device, imei }, workingCondition: condition });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
        {/* Device summary */}
        <View className="bg-card border border-border rounded-xl p-2.5 mb-2.5 flex-row items-center">
          <View className="h-11 w-11 rounded-xl bg-primary/10 items-center justify-center mr-2.5 overflow-hidden">
            {device.imageUrl ? (
              <Image source={{ uri: device.imageUrl }} style={{ width: 44, height: 44 }} resizeMode="cover" />
            ) : (
              <Smartphone size={20} color="#087A0A" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-[10px] text-text-muted uppercase tracking-widest">Your Device</Text>
            <Text className="text-[13px] font-extrabold text-text mt-0.5" numberOfLines={1}>
              {device.modelName || 'Device'}
            </Text>
            {device.color ? (
              <View className="flex-row items-center mt-1 flex-wrap">
                {device.ramLabel ? (
                  <View className="flex-row items-center mr-1.5">
                    <Cpu size={9} color="#667066" />
                    <Text className="text-[10px] text-text-muted ml-0.5">{device.ramLabel}</Text>
                  </View>
                ) : null}
                {device.storageLabel ? (
                  <View className="flex-row items-center mr-1.5">
                    <HardDrive size={9} color="#667066" />
                    <Text className="text-[10px] text-text-muted ml-0.5">{device.storageLabel}</Text>
                  </View>
                ) : null}
                {device.color ? (
                  <View className="flex-row items-center">
                    <Palette size={9} color="#667066" />
                    <Text className="text-[10px] text-text-muted ml-0.5">{device.color}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* IMEI */}
        <View className="bg-card border border-border rounded-xl p-2.5 mb-2.5">
          <Label className="text-[11px] mb-1">IMEI Number</Label>
          <Input
            placeholder="15-digit IMEI (dial *#06# on phone)"
            value={imei}
            onChangeText={setImei}
            keyboardType="number-pad"
            className="py-2 text-[13px]"
          />
        </View>

        {/* Condition picker */}
        <Text className="text-[11px] font-extrabold text-text-muted tracking-widest mb-2 px-1">PHONE CONDITION</Text>
        <View className="flex-row -mx-1">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = condition === o.key;
            return (
              <View key={o.key} className="px-1 flex-1">
                <Pressable
                  onPress={() => setCondition(o.key)}
                  className={`rounded-xl border-2 p-3 items-center ${active ? `${o.activeBg} ${o.border}` : 'bg-card border-border'}`}
                >
                  <View className={`h-10 w-10 rounded-full items-center justify-center mb-1.5 ${o.bg}`}>
                    <Icon size={20} color={o.color} />
                  </View>
                  <Text className={`text-[12px] font-extrabold text-center ${active ? 'text-text' : 'text-text'}`} numberOfLines={1}>{o.label}</Text>
                  <Text className="text-[10px] text-text-muted mt-0.5 text-center" numberOfLines={2}>{o.sub}</Text>
                  {active ? <Badge variant={o.key === 'WORKING' ? 'softSuccess' : 'softDanger'} className="mt-1.5">SELECTED</Badge> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <BottomActionBar title="Continue" onPress={onContinue} />
    </View>
  );
}
