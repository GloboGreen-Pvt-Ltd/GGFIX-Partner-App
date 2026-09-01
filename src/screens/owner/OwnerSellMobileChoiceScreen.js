import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ClipboardList, FileText, Skull, ChevronRight } from 'lucide-react-native';
import { ScreenHeader } from '../../components/rnr';

// After category/brand/model + colour & storage are picked, the owner chooses
// how much detail to capture before listing. Each branch routes through a
// different subset of the existing customer sell flow screens.
const OPTIONS = [
  {
    key: 'DETAILED',
    title: 'Detailed Description',
    sub: 'Full assessment: screening, screen, functional, accessories, warranty, photos, price.',
    icon: ClipboardList,
    color: '#004C40',
    bg: 'bg-primary/10',
    flow: ['SellScreening', 'SellScreenCondition', 'SellFunctional', 'SellAccessoriesWarranty', 'SellImages', 'SellGadgetPrice'],
  },
  {
    key: 'SHORT',
    title: 'Short Description',
    sub: 'Quick listing: just photos and price.',
    icon: FileText,
    color: '#004C40',
    bg: 'bg-success/10',
    flow: ['SellImages', 'SellGadgetPrice'],
  },
  {
    key: 'DEAD_SHORT',
    title: 'Dead Phone Short Description',
    sub: 'Full assessment optimised for dead / non-working phones.',
    icon: Skull,
    color: '#DC2626',
    bg: 'bg-danger/10',
    flow: ['SellScreening', 'SellScreenCondition', 'SellFunctional', 'SellAccessoriesWarranty', 'SellImages', 'SellGadgetPrice'],
  },
];

export default function OwnerSellMobileChoiceScreen({ navigation, route }) {
  const params = route?.params || {};

  const onPick = (opt) => {
    // Tag the params so the downstream sell screens know they're in the
    // owner-list flow and which description type was chosen.
    navigation.navigate(opt.flow[0], {
      ...params,
      flow: 'OWNER_LIST',
      descriptionType: opt.key,
      remainingFlow: opt.flow.slice(1),
      workingCondition: opt.key === 'DEAD_SHORT' ? 'DEAD' : 'WORKING',
    });
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Choose Description" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text className="text-text-muted text-xs px-1 mb-3 uppercase tracking-widest font-extrabold">
          How would you like to describe this device?
        </Text>

        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <Pressable
              key={o.key}
              onPress={() => onPick(o)}
              className="bg-card border border-border rounded-2xl p-4 mb-3 flex-row items-center active:opacity-80"
              style={{ shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}
            >
              <View className={`h-12 w-12 rounded-2xl items-center justify-center mr-3 ${o.bg}`}>
                <Icon size={22} color={o.color} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-extrabold text-text">{o.title}</Text>
                <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={3}>{o.sub}</Text>
              </View>
              <ChevronRight size={18} color="#667066" />
            </Pressable>
          );
        })}

      </ScrollView>
    </View>
  );
}
