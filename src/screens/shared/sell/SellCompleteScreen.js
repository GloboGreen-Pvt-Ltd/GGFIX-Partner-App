import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { notify } from '../../../components/confirm';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../../theme/colors';
import { Card, PrimaryButton } from '../../../components/ui';
import { createSellOrder, updateSellOrder } from '../../../api/orders';
import { createListing } from '../../../api/marketplace';
import { getSession } from '../../../auth/session';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  deviceCard: { borderColor: '#16BB05', borderWidth: 1 },
  summaryCard: { borderColor: '#16BB05', borderWidth: 1 },
  customerCard: { borderColor: '#087A0A', borderWidth: 1 },
  body: { flexDirection: 'row' },
  modelName: { fontSize: 16, fontWeight: '700', color: colors.text },
  small: { fontSize: 13, color: colors.text, marginTop: 2 },
  thumb: { width: 80, height: 90, borderRadius: 8, backgroundColor: '#E2E8E2', marginLeft: 12 },
  photoHeading: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 10, marginBottom: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  photoItem: { width: 92, marginHorizontal: 3, marginBottom: 6 },
  photoBox: { width: '100%', height: 86, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C8EEBF', overflow: 'hidden', backgroundColor: '#F7FAF7' },
  photoLabel: { fontSize: 10, color: colors.textSecondary, textAlign: 'center', marginTop: 3, fontWeight: '600' },
  heading: { fontSize: 14, fontWeight: '700', color: '#16BB05', marginBottom: 8 },
  subHeading: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 10, marginBottom: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5 },
  itemText: { marginLeft: 6, fontSize: 12, color: colors.text, flex: 1, lineHeight: 16 },
  custRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 },
  custText: { marginLeft: 8, fontSize: 13, color: colors.text, flex: 1, lineHeight: 18 },
  bottom: { padding: 12, backgroundColor: '#fff', borderTopColor: colors.border, borderTopWidth: 1 },
});

const PHOTO_SLOTS = [
  { key: 'front', label: 'Front Side' },
  { key: 'back', label: 'Backside' },
  { key: 'side', label: 'side and Center' },
  { key: 'camera', label: 'Camera' },
  { key: 'other', label: 'side and Center' },
];

function Check() {
  return <Ionicons name="checkmark-circle-outline" size={15} color="#087A0A" style={{ marginTop: 1 }} />;
}

export default function SellCompleteScreen({ navigation, route }) {
  const p = route.params || {};
  const device = p.device || {};
  const address = p.address || {};
  const images = p.images || {};
  const [saving, setSaving] = useState(false);

  const storageLine = [device.ramLabel, device.storageLabel].filter(Boolean).join(' / ');
  const photos = PHOTO_SLOTS.filter((s) => images[s.key]);
  const phone = address.mobile ? (String(address.mobile).startsWith('+') ? address.mobile : `+91 ${address.mobile}`) : '';

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        brandId: device.brandId,
        modelId: device.modelId,
        ramOptionId: device.ramOptionId,
        storageOptionId: device.storageOptionId,
        color: device.color,
        imei: device.imei,
        workingCondition: p.workingCondition,
        warrantyCode: p.warranty,
        addressId: p.addressId,
        screeningAnswers: p.screeningAnswers || [],
        conditions: p.conditions || [],
        issues: p.issues || [],
        accessories: p.accessories || [],
        images,
      };

      // When the customer entered this flow via "Edit sell order", PUT the
      // existing order instead of creating a new one — and don't re-mirror to
      // the marketplace listing (the original listing already points at it).
      if (p.editSellOrderId) {
        const updated = await updateSellOrder(p.editSellOrderId, payload);
        // navigate() pops back to the existing SellOrderDetails route if it's
        // still on the stack; otherwise it pushes a fresh one. Either way the
        // customer lands on the details page, which refetches on focus.
        navigation.navigate('SellOrderDetails', { sellOrderId: p.editSellOrderId, sellOrder: updated });
        return;
      }

      const created = await createSellOrder(payload);

      // Mirror this sell-order onto the public Buy/Sell marketplace so nearby
      // shops can spot it from their Buy screen. Best-effort — never block the
      // success flow if the marketplace POST fails (e.g. service is down).
      try {
        const session = (await getSession()) || {};
        const lat = address.latitude != null ? Number(address.latitude) : null;
        const lng = address.longitude != null ? Number(address.longitude) : null;
        const conditionLabel = p.deviceCondition
          || (p.workingCondition === 'DEAD' ? 'Not working' : 'Used');
        const summary = [device.color, storageLine].filter(Boolean).join(' · ');
        if (session.userId && device.modelName) {
          await createListing({
            sellerType: 'CUSTOMER',
            sellerId: session.userId,
            brandId: device.brandId,
            modelId: device.modelId,
            productName: device.modelName,
            productImage: images.front || device.imageUrl,
            condition: conditionLabel,
            description: summary || undefined,
            expectedPrice: 0, // 0 = awaiting shop quotation
            latitude: lat,
            longitude: lng,
            address: address.addressLine,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
          });
        }
      } catch (_) { /* best-effort mirror */ }

      navigation.replace('SellSuccess', { sellOrder: created });
    } catch (e) {
      notify('Error', e.message);
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
        {/* Device */}
        <Card style={styles.deviceCard}>
          <View style={styles.body}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modelName}>{device.modelName || 'Device'}</Text>
              {device.color ? <Text style={styles.small}>Color: {device.color}</Text> : null}
              {storageLine ? <Text style={styles.small}>Storage: {storageLine}</Text> : null}
              <Text style={styles.small}>Device Condition: {p.deviceCondition || (p.workingCondition === 'DEAD' ? 'Unknown Condition' : 'Good')}</Text>
              <Text style={styles.small}>IMEI Number : {device.imei || '-'}</Text>
            </View>
            {device.imageUrl ? (
              <Image source={{ uri: device.imageUrl }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={styles.thumb} />
            )}
          </View>

          {photos.length ? (
            <>
              <Text style={styles.photoHeading}>Device Photo's</Text>
              <View style={styles.photoRow}>
                {photos.map((s) => (
                  <View key={s.key} style={styles.photoItem}>
                    <View style={styles.photoBox}>
                      <Image source={{ uri: images[s.key] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>
                    <Text style={styles.photoLabel} numberOfLines={1}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </Card>

        {/* Device Summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.heading}>Device Summary</Text>

          {(p.screeningAnswers || []).length ? (
            <>
              <Text style={styles.subHeading}>Screening Question</Text>
              {(p.screeningAnswers || []).map((a, i) => (
                <View key={i} style={styles.itemRow}>
                  <Check />
                  <Text style={styles.itemText}>{[a.answer, a.question].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </>
          ) : null}

          {(p.conditions || []).length ? (
            <>
              <Text style={styles.subHeading}>Screen</Text>
              {(p.conditions || []).map((c, i) => (
                <View key={i} style={styles.itemRow}>
                  <Check />
                  <Text style={styles.itemText}>{[c.optionLabel, c.groupName].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </>
          ) : null}

          {(p.accessories || []).length ? (
            <>
              <Text style={styles.subHeading}>Accessories</Text>
              {(p.accessories || []).map((a, i) => (
                <View key={i} style={styles.itemRow}>
                  <Check />
                  <Text style={styles.itemText}>{[a.label || a.accessoryCode, 'Accessories'].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </>
          ) : null}

          {p.warrantyLabel ? (
            <>
              <Text style={styles.subHeading}>Warranty</Text>
              <View style={styles.itemRow}>
                <Check />
                <Text style={styles.itemText}>{p.warrantyLabel}</Text>
              </View>
            </>
          ) : null}
        </Card>

        {/* Customer Details */}
        {(address.fullName || address.addressLine) ? (
          <Card style={styles.customerCard}>
            <Text style={[styles.heading, { color: '#087A0A' }]}>Customer Details</Text>
            <View style={styles.custRow}>
              <Ionicons name="person-outline" size={16} color="#087A0A" style={{ marginTop: 1 }} />
              <Text style={styles.custText}>{[address.fullName, phone].filter(Boolean).join('  |  ')}</Text>
            </View>
            <View style={styles.custRow}>
              <Ionicons name="location-outline" size={16} color="#087A0A" style={{ marginTop: 1 }} />
              <Text style={styles.custText}>{[address.addressLine, address.locality, address.city, address.state, address.pincode].filter(Boolean).join(', ')}</Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton
          title={p.editSellOrderId ? 'Update Order →' : 'Sell Now →'}
          onPress={submit}
          loading={saving}
          style={{ backgroundColor: p.editSellOrderId ? '#16BB05' : '#087A0A' }}
        />
      </View>
    </View>
  );
}
