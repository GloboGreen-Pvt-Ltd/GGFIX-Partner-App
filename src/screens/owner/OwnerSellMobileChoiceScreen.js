import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { ClipboardList, FileText, Skull, ChevronRight } from 'lucide-react-native';
import { ScreenHeader } from '../../components/rnr';
import { SELL, sellShadow } from '../shared/sell/sellTheme';

// After category/brand/model + colour & storage are picked, the owner chooses
// how much detail to capture before listing. Each branch routes through a
// different subset of the existing customer sell flow screens.
const OPTIONS = [
  {
    key: 'DETAILED',
    title: 'Detailed Description',
    sub: 'Full assessment: screening, screen, functional, accessories, warranty, photos, price.',
    icon: ClipboardList,
    color: SELL.green,
    bg: SELL.greenLight,
    flow: ['SellScreening', 'SellScreenCondition', 'SellFunctional', 'SellAccessoriesWarranty', 'SellImages', 'SellGadgetPrice'],
  },
  {
    key: 'SHORT',
    title: 'Short Description',
    sub: 'Quick listing: just photos and price.',
    icon: FileText,
    color: SELL.green,
    bg: SELL.greenLight,
    flow: ['SellImages', 'SellGadgetPrice'],
  },
  {
    key: 'DEAD_SHORT',
    title: 'Dead Phone Short Description',
    sub: 'Full assessment optimised for dead / non-working phones.',
    icon: Skull,
    color: SELL.danger,
    bg: SELL.dangerLight,
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
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScreenHeader title="Choose Description" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: SELL.ink, paddingHorizontal: 2 }}>
          How would you like to describe this device?
        </Text>
        <Text style={{ fontSize: 13, color: SELL.muted, marginTop: 3, marginBottom: 14, paddingHorizontal: 2 }}>
          More detail helps buyers trust the listing.
        </Text>

        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <TouchableOpacity
              key={o.key}
              onPress={() => onPick(o)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${o.sub}`}
              style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: SELL.card, borderRadius: 18,
                padding: 14, marginBottom: 12, borderWidth: 1, borderColor: SELL.soft, ...sellShadow,
              }}
            >
              <View style={{ height: 48, width: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: o.bg }}>
                <Icon size={22} color={o.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: SELL.ink }}>{o.title}</Text>
                <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 3, lineHeight: 17 }} numberOfLines={3}>{o.sub}</Text>
                <View style={{ alignSelf: 'flex-start', marginTop: 7, backgroundColor: o.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: o.key === 'DEAD_SHORT' ? SELL.danger : SELL.greenDark }}>{o.flow.length} steps</Text>
                </View>
              </View>
              <View style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: SELL.soft, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                <ChevronRight size={16} color={SELL.ink} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
