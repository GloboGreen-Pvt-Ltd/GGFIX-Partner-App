import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../../theme/colors';
import { Card, PrimaryButton } from '../../../components/ui';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  accTile: { width: '31.33%', marginHorizontal: '1%', marginBottom: 6, paddingVertical: 10, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', minHeight: 88 },
  accTileActive: { borderColor: '#087A0A', borderWidth: 2, backgroundColor: '#F0F8EF' },
  accLabel: { fontSize: 10, lineHeight: 13, color: colors.text, marginTop: 6, textAlign: 'center', fontWeight: '600' },
  warrantyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginTop: 8 },
  warrantyRowActive: { borderColor: '#087A0A', backgroundColor: '#F0F8EF' },
  warrantyLabel: { marginLeft: 10, fontSize: 14, color: colors.text, fontWeight: '600' },
  editBanner: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  editBannerTitle: { fontSize: 10, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
  editBannerText: { fontSize: 12, color: colors.text, fontWeight: '600', marginTop: 2 },
  bottom: { padding: 12, backgroundColor: '#fff', borderTopColor: colors.border, borderTopWidth: 1 },
});

const MOBILE_ACCESSORIES = [
  { id: 'original_charger', label: 'Original Charger', icon: 'flash-outline' },
  { id: 'battery_local', label: 'Battery Replaced From Local Market', icon: 'battery-charging-outline' },
  { id: 'flashlight_not_working', label: 'Flash Light Not Working', icon: 'flashlight-outline' },
];
const LAPTOP_ACCESSORIES = [
  { id: 'original_charger', label: 'Original Charger', icon: 'flash-outline' },
];

const WARRANTY = [
  { id: 'lt_3', label: 'Less then 3 months' },
  { id: '3_6', label: '3 - 6 months' },
  { id: '6_11', label: '6 - 11 months' },
  { id: 'gt_11', label: 'More then 11 months' },
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
      navigation.setOptions?.({ title: 'Accessoires' });
    }
  }, [isLaptopLike, navigation]);

  const toggleAcc = (id) =>
    setAccessories((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {isEditing ? (
          <View style={styles.editBanner}>
            <Ionicons name="create-outline" size={16} color="#92400E" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.editBannerTitle}>EDITING ORDER</Text>
              <Text style={styles.editBannerText}>Your previous accessories and warranty are pre-selected.</Text>
            </View>
          </View>
        ) : null}
        <Card style={{ padding: 10, marginVertical: 4 }}>
          <Text style={styles.sectionTitle}>Accessories</Text>
          <View style={styles.row}>
            {ACCESSORIES.map((a) => {
              const active = accessories.includes(a.id);
              return (
                <TouchableOpacity key={a.id} style={[styles.accTile, active && styles.accTileActive]} onPress={() => toggleAcc(a.id)}>
                  <Ionicons name={a.icon} size={22} color={active ? '#087A0A' : colors.textSecondary} />
                  <Text style={styles.accLabel}>{a.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {!isLaptopLike ? (
          <Card style={{ padding: 10, marginVertical: 4 }}>
            <Text style={styles.sectionTitle}>Warranty</Text>
            {WARRANTY.map((w) => {
              const active = warranty === w.id;
              return (
                <TouchableOpacity key={w.id} style={[styles.warrantyRow, active && styles.warrantyRowActive]} onPress={() => setWarranty(w.id)}>
                  <Ionicons name={active ? 'checkmark-circle' : 'radio-button-off'} size={22} color={active ? '#087A0A' : colors.textSecondary} />
                  <Text style={styles.warrantyLabel}>{w.label}</Text>
                </TouchableOpacity>
              );
            })}
          </Card>
        ) : null}
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton
          title="Continue →"
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
      </View>
    </View>
  );
}
