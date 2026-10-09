import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SELL, SellButton, SellCard, SellFooter, SellIntro, EditingBanner, CheckDot, RadioRing } from './sellTheme';

const MOBILE_ACCESSORIES = [
  { id: 'original_charger', label: 'Original Charger', icon: 'flash-outline' },
  { id: 'battery_local', label: 'Battery Replaced From Local Market', icon: 'battery-charging-outline' },
  { id: 'flashlight_not_working', label: 'Flash Light Not Working', icon: 'flashlight-outline' },
];
const LAPTOP_ACCESSORIES = [
  { id: 'original_charger', label: 'Original Charger', icon: 'flash-outline' },
];

// `label` is what the listing stores (warrantyLabel) and stays as-is;
// `title` is the on-screen wording with the spelling fixed.
const WARRANTY = [
  { id: 'lt_3', label: 'Less then 3 months', title: 'Less than 3 months' },
  { id: '3_6', label: '3 - 6 months', title: '3 - 6 months' },
  { id: '6_11', label: '6 - 11 months', title: '6 - 11 months' },
  { id: 'gt_11', label: 'More then 11 months', title: 'More than 11 months' },
];

// Laptop/audio/watch sell flows don't carry a warranty option.
const NO_WARRANTY_KEYWORDS = ['LAPTOP', 'AUDIO', 'WATCH', 'HEADPHONE', 'EARBUD', 'TABLET'];

export default function SellAccessoriesWarrantyScreen({ navigation, route }) {
  const params = route.params || {};
  const { editSellOrderId, editHints } = params;
  const isEditing = !!editSellOrderId;
  const categoryCode = String(params.device?.categoryCode || '').toUpperCase();
  const isLaptopLike = NO_WARRANTY_KEYWORDS.some((k) => categoryCode.includes(k));
  const ACCESSORIES = isLaptopLike ? LAPTOP_ACCESSORIES : MOBILE_ACCESSORIES;

  // Pre-seed the multi-select accessories from the order's prior accessories.
  // Match on accessoryCode (canonical) or label (fallback when codes drift).
  const initialAccessories = useMemo(() => {
    if (!isEditing) return [];
    const priorCodes = new Set();
    const priorLabels = new Set();
    (editHints?.accessories || []).forEach((a) => {
      if (a?.accessoryCode) priorCodes.add(String(a.accessoryCode).toLowerCase());
      if (a?.label) priorLabels.add(String(a.label).trim().toLowerCase());
    });
    return ACCESSORIES.filter((a) =>
      priorCodes.has(a.id.toLowerCase())
      || priorLabels.has(a.label.trim().toLowerCase()),
    ).map((a) => a.id);
  }, [isEditing, editHints, ACCESSORIES]);

  const initialWarranty = isEditing ? (editHints?.warrantyCode || null) : null;

  const [accessories, setAccessories] = useState(initialAccessories);
  const [warranty, setWarranty] = useState(initialWarranty);

  useEffect(() => {
    if (isLaptopLike) {
      navigation.setOptions?.({ title: 'Accessories' });
    }
  }, [isLaptopLike, navigation]);

  const toggleAcc = (id) =>
    setAccessories((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {isEditing ? <EditingBanner text="Your previous accessories and warranty are pre-selected." /> : null}
        <SellIntro
          title={isLaptopLike ? 'Accessories' : 'Accessories & warranty'}
          caption={isLaptopLike ? 'Tap everything that applies to the device.' : 'Tap everything that applies, then pick the remaining warranty.'}
        />
        <SellCard>
          <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink, marginBottom: 10 }}>Accessories</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {ACCESSORIES.map((a) => {
              const active = accessories.includes(a.id);
              return (
                <View key={a.id} style={{ width: '33.333%', padding: 4 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => toggleAcc(a.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    style={{
                      minHeight: 92, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5,
                      alignItems: 'center', justifyContent: 'center',
                      borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.greenLight : SELL.card,
                    }}
                  >
                    <View style={{ height: 34, width: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? SELL.card : SELL.soft }}>
                      <Ionicons name={a.icon} size={18} color={active ? SELL.green : SELL.muted} />
                    </View>
                    <Text style={{ fontSize: 11, lineHeight: 15, marginTop: 6, textAlign: 'center', fontWeight: active ? '700' : '600', color: active ? SELL.greenDark : SELL.ink }} numberOfLines={3}>
                      {a.label}
                    </Text>
                    {active ? <View style={{ position: 'absolute', top: 6, right: 6 }}><CheckDot size={16} /></View> : null}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </SellCard>

        {!isLaptopLike ? (
          <SellCard>
            <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink, marginBottom: 4 }}>Warranty left</Text>
            {WARRANTY.map((w) => {
              const active = warranty === w.id;
              return (
                <TouchableOpacity
                  key={w.id}
                  activeOpacity={0.85}
                  onPress={() => setWarranty(w.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 12, marginTop: 8,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.greenLight : SELL.card,
                  }}
                >
                  {active ? <CheckDot size={20} /> : <RadioRing size={20} />}
                  <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: active ? '700' : '600', color: active ? SELL.greenDark : SELL.ink }}>{w.title}</Text>
                </TouchableOpacity>
              );
            })}
          </SellCard>
        ) : null}
      </ScrollView>
      <SellFooter caption={!isLaptopLike && !warranty ? 'Pick the warranty to continue' : null}>
        <SellButton
          title="Continue"
          arrow
          disabled={!isLaptopLike && !warranty}
          onPress={() =>
            navigation.navigate('SellImages', {
              ...params,
              accessories: accessories.map((id) => ({ accessoryCode: id, label: ACCESSORIES.find((a) => a.id === id)?.label })),
              warranty: isLaptopLike ? null : warranty,
              warrantyLabel: isLaptopLike ? null : WARRANTY.find((w) => w.id === warranty)?.label,
            })
          }
        />
      </SellFooter>
    </View>
  );
}
