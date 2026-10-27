import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Pressable } from 'react-native';
import { ClipboardList, FileText, ChevronRight, Smartphone, ListChecks } from 'lucide-react-native';
import { ScreenHeader } from '../../components/rnr';
import { ResponsiveModal, useResponsive } from '../../components/responsive';
import { SELL, sellShadow } from '../shared/sell/sellTheme';

// Working device: after Device Details the owner picks how much detail to
// capture before listing. Each branch routes through a different subset of the
// existing customer sell-flow screens. (Dead / unverified devices go to
// Screening → Spare Parts from Device Details instead.)
const OPTIONS = [
  {
    key: 'DETAILED',
    title: 'Detailed Description',
    sub: 'Full check: screening, screen, functional, accessories, warranty, photos and price.',
    icon: ClipboardList,
    disc: '#357D89', // Home teal
    flow: ['SellScreening', 'SellScreenCondition', 'SellFunctional', 'SellAccessoriesWarranty', 'SellImages', 'SellGadgetPrice'],
  },
  {
    key: 'SHORT',
    title: 'Short Description',
    sub: 'Quick listing: just photos and price.',
    icon: FileText,
    disc: '#5E9440', // Home green
    flow: ['SellImages', 'SellGadgetPrice'],
  },
];

export default function OwnerSellMobileChoiceScreen({ navigation, route }) {
  const params = route?.params || {};
  const device = params.device || {};
  const [sheetOpen, setSheetOpen] = useState(false);
  const r = useResponsive();

  // The choice opens as a popup on arrival (after the push settles — a Modal
  // presented mid-transition is unreliable on iOS).
  useEffect(() => {
    const t = setTimeout(() => setSheetOpen(true), 450);
    return () => clearTimeout(t);
  }, []);

  const onPick = (opt) => {
    setSheetOpen(false);
    // Tag the params so the downstream sell screens know they're in the
    // owner-list flow and which description type was chosen.
    setTimeout(() => navigation.navigate(opt.flow[0], {
      ...params,
      flow: 'OWNER_LIST',
      descriptionType: opt.key,
      remainingFlow: opt.flow.slice(1),
      workingCondition: 'WORKING',
    }), 320);
  };

  const specs = [device.storageLabel, device.ramLabel, device.color].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScreenHeader title="Choose Description" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 + r.insets.bottom, width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center' }}>
        {/* The device being listed */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SELL.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: SELL.soft, ...sellShadow }}>
          <View style={{ height: 52, width: 52, borderRadius: 12, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12 }}>
            {device.imageUrl ? (
              <Image source={{ uri: device.imageUrl }} style={{ width: 52, height: 52 }} resizeMode="contain" />
            ) : (
              <Smartphone size={24} color="#035C6C" />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: SELL.ink }} numberOfLines={1}>{device.modelName || 'Your device'}</Text>
            {specs ? <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 2 }} numberOfLines={1}>{specs}</Text> : null}
            <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#E5F3F5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#035C6C' }}>Working Device</Text>
            </View>
          </View>
        </View>

        <Text style={{ fontSize: 15, fontWeight: '800', color: SELL.ink, marginTop: 18, paddingHorizontal: 2 }}>
          How would you like to describe this device?
        </Text>
        <Text style={{ fontSize: 13, color: SELL.muted, marginTop: 3, marginBottom: 14, paddingHorizontal: 2 }}>
          More detail helps buyers trust the listing.
        </Text>
        <TouchableOpacity
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: 14, backgroundColor: '#035C6C' }}
        >
          <ListChecks size={18} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginLeft: 8 }}>Choose Description Type</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Choose Description Type ── */}
      <ResponsiveModal visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: SELL.ink }}>Choose Description Type</Text>
        <Text style={{ fontSize: 12.5, color: SELL.muted, marginTop: 3, marginBottom: 14 }}>Pick how much detail to add to this listing.</Text>
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <Pressable
              key={o.key}
              onPress={() => onPick(o)}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${o.sub}`}
              style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 12, marginBottom: 10 }}
            >
              <View style={{ height: 46, width: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: o.disc }}>
                <Icon size={21} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: SELL.ink }}>{o.title}</Text>
                <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 2, lineHeight: 17 }} numberOfLines={2}>{o.sub}</Text>
                <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: SELL.ink }}>{o.flow.length} steps</Text>
                </View>
              </View>
              <ChevronRight size={18} color={SELL.muted} style={{ marginLeft: 8 }} />
            </Pressable>
          );
        })}
      </ResponsiveModal>
    </View>
  );
}
