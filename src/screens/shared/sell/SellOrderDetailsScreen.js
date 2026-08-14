import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../../theme/colors';
import { Card, Loader, PrimaryButton, OutlineButton } from '../../../components/ui';
import { getSellOrder, cancelSellOrder } from '../../../api/orders';
import { getBrands, getModelsByBrand, getRamOptions, getStorageOptions, getDeviceCategories } from '../../../api/masterData';
import { listAddresses } from '../../../api/customer';
import { confirm, notify } from '../../../components/confirm';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  deviceCard: { borderColor: '#087A0A', borderWidth: 1 },
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
  actionBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
  cancelBtn: { backgroundColor: '#DC2626' },
  statusBanner: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FEF3C7', borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  statusBannerText: { color: '#92400E', fontWeight: '700', marginLeft: 6, fontSize: 12 },
});

const PHOTO_SLOTS = [
  { key: 'front', label: 'Front Side' },
  { key: 'back', label: 'Backside' },
  { key: 'side', label: 'side and Center' },
  { key: 'camera', label: 'Camera' },
  { key: 'other', label: 'side and Center' },
];

const WARRANTY_LABELS = {
  lt_3: 'Less then 3 months',
  '3_6': '3 - 6 months',
  '6_11': '6 - 11 months',
  gt_11: 'More then 11 months',
};

// Cancel/Edit are only meaningful before the shop processes the request.
const EDITABLE_STATUSES = new Set(['PENDING', 'PENDING_QUOTATION', 'AWAITING_QUOTATION', 'DRAFT']);

function Check() {
  return <Ionicons name="checkmark-circle-outline" size={15} color="#087A0A" style={{ marginTop: 1 }} />;
}

async function confirmDestructive(title, message, onConfirm, confirmLabel = 'Confirm') {
  const ok = await confirm({ title, message, confirmText: confirmLabel, destructive: true });
  if (ok) onConfirm();
}

export default function SellOrderDetailsScreen({ navigation, route }) {
  const id = route.params?.sellOrderId || route.params?.id;
  const [order, setOrder] = useState(null);
  const [meta, setMeta] = useState({});
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const so = await getSellOrder(id);
        if (cancelled) return;
        setOrder(so);

        const [models, rams, storages, brands, addresses, categories] = await Promise.all([
          so.brandId ? getModelsByBrand(so.brandId).catch(() => []) : Promise.resolve([]),
          getRamOptions().catch(() => []),
          getStorageOptions().catch(() => []),
          getBrands().catch(() => []),
          listAddresses().catch(() => []),
          getDeviceCategories().catch(() => []),
        ]);
        if (cancelled) return;
        const model = (models || []).find((m) => m.id === so.modelId);
        const brand = (brands || []).find((b) => b.id === so.brandId);
        const ram = (rams || []).find((r) => r.id === so.ramOptionId);
        const storage = (storages || []).find((s) => s.id === so.storageOptionId);
        // Resolve the device category so Edit can re-enter the wizard at the
        // brand step scoped to the right category (Mobile / Laptop / etc).
        const category = model?.categoryId
          ? (categories || []).find((c) => c.id === model.categoryId)
          : null;
        setMeta({
          modelName: model?.name || (brand?.name ? `${brand.name} device` : 'Device'),
          image: model?.imageUrl || (model?.imageBase64 ? `data:image/png;base64,${model.imageBase64}` : null),
          ramLabel: ram?.label,
          storageLabel: storage?.label,
          categoryId: category?.id || null,
          categoryName: category?.name || null,
          categoryCode: (category?.code || '').toUpperCase() || null,
          // Existing selections threaded through the wizard as "hints" so each
          // selection screen highlights the customer's current choice.
          editHints: {
            brandId: so.brandId,
            brandName: brand?.name || null,
            seriesId: model?.seriesId || null,
            modelId: so.modelId,
            modelName: model?.name || null,
            ramOptionId: so.ramOptionId,
            storageOptionId: so.storageOptionId,
            color: so.color || null,
            imei: so.imei || null,
            workingCondition: so.workingCondition || null,
            // Assessment data so the screening / condition / functional /
            // accessories / images screens can pre-fill the customer's prior
            // answers when re-walking the wizard in edit mode.
            screeningAnswers: so.screeningAnswers || [],
            conditions: so.conditions || [],
            issues: so.issues || [],
            accessories: so.accessories || [],
            warrantyCode: so.warrantyCode || null,
            deviceConditionSummary: so.deviceConditionSummary || null,
            images: so.images || {},
          },
        });
        if (so.addressId) setAddress((addresses || []).find((a) => a.id === so.addressId) || null);
      } catch (_) {
        // leave order null -> show empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]));

  const onEdit = () => {
    // Re-walk the full sell wizard, starting at the brand step. Every
    // downstream screen forwards `editSellOrderId`; SellCompleteScreen reads
    // it and calls PUT /sell-orders/:id instead of POST.
    if (meta.categoryId) {
      navigation.navigate('SelectBrand', {
        flow: 'SELL',
        categoryId: meta.categoryId,
        categoryName: meta.categoryName,
        categoryCode: meta.categoryCode,
        editSellOrderId: id,
        editHints: meta.editHints,
      });
    } else {
      // The model has no categoryId yet — let the customer pick the category
      // manually as a fallback.
      navigation.navigate('SelectCategory', { flow: 'SELL', editSellOrderId: id, editHints: meta.editHints });
    }
  };

  const onCancel = () => {
    confirmDestructive(
      'Cancel sell order?',
      'This will withdraw your sell request. You can submit a new one anytime.',
      async () => {
        setCancelling(true);
        try {
          await cancelSellOrder(id);
          notify('Cancelled', 'Your sell order has been cancelled.', { preset: 'done' });
          navigation.goBack();
        } catch (e) {
          const msg = e?.message || 'Could not cancel this sell order.';
          notify('Error', msg, { preset: 'error', haptic: 'error' });
        } finally {
          setCancelling(false);
        }
      },
      'Yes, cancel',
    );
  };

  if (loading) return <Loader />;
  if (!order) return (
    <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.textSecondary }}>Could not load this sell order.</Text>
    </View>
  );

  const images = order.images || {};
  const photos = PHOTO_SLOTS.filter((s) => images[s.key]);
  const storageLine = [meta.ramLabel, meta.storageLabel].filter(Boolean).join(' / ');
  const conditionText = order.deviceConditionSummary || (order.workingCondition === 'DEAD' ? 'Unknown Condition' : 'Good');
  const warrantyLabel = WARRANTY_LABELS[order.warrantyCode] || order.warrantyCode;
  const phone = address?.mobile ? (String(address.mobile).startsWith('+') ? address.mobile : `+91 ${address.mobile}`) : '';
  const statusUpper = String(order.status || '').toUpperCase();
  const isEditable = EDITABLE_STATUSES.has(statusUpper);
  const isCancelled = statusUpper === 'CANCELLED';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
        {!isEditable && !isCancelled ? (
          <View style={styles.statusBanner}>
            <Ionicons name="information-circle-outline" size={16} color="#92400E" />
            <Text style={styles.statusBannerText}>This order is {statusUpper.replace(/_/g, ' ')} — edit / cancel not available.</Text>
          </View>
        ) : null}
        {isCancelled ? (
          <View style={[styles.statusBanner, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close-circle-outline" size={16} color="#B91C1C" />
            <Text style={[styles.statusBannerText, { color: '#B91C1C' }]}>This order has been cancelled.</Text>
          </View>
        ) : null}

        {/* Device */}
        <Card style={styles.deviceCard}>
          <View style={styles.body}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modelName}>{meta.modelName}</Text>
              {order.color ? <Text style={styles.small}>Color: {order.color}</Text> : null}
              {storageLine ? <Text style={styles.small}>Storage: {storageLine}</Text> : null}
              <Text style={styles.small}>Device Condition: {conditionText}</Text>
              <Text style={styles.small}>IMEI Number : {order.imei || '-'}</Text>
            </View>
            {meta.image ? (
              <Image source={{ uri: meta.image }} style={styles.thumb} resizeMode="cover" />
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

          {(order.screeningAnswers || []).length ? (
            <>
              <Text style={styles.subHeading}>Screening Question</Text>
              {order.screeningAnswers.map((a, i) => (
                <View key={i} style={styles.itemRow}>
                  <Check />
                  <Text style={styles.itemText}>{[a.answer, a.question].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </>
          ) : null}

          {(order.conditions || []).length ? (
            <>
              <Text style={styles.subHeading}>Screen</Text>
              {order.conditions.map((c, i) => (
                <View key={i} style={styles.itemRow}>
                  <Check />
                  <Text style={styles.itemText}>{[c.optionLabel, c.groupName].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </>
          ) : null}

          {(order.accessories || []).length ? (
            <>
              <Text style={styles.subHeading}>Accessories</Text>
              {order.accessories.map((a, i) => (
                <View key={i} style={styles.itemRow}>
                  <Check />
                  <Text style={styles.itemText}>{[a.label || a.accessoryCode, 'Accessories'].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </>
          ) : null}

          {warrantyLabel ? (
            <>
              <Text style={styles.subHeading}>Warranty</Text>
              <View style={styles.itemRow}>
                <Check />
                <Text style={styles.itemText}>{warrantyLabel}</Text>
              </View>
            </>
          ) : null}
        </Card>

        {/* Customer Details */}
        {address ? (
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

      {isEditable ? (
        <View style={styles.actionBar}>
          <OutlineButton title="Edit" onPress={onEdit} style={{ flex: 1, marginRight: 6 }} />
          <PrimaryButton
            title={cancelling ? 'Cancelling...' : 'Cancel Order'}
            onPress={onCancel}
            loading={cancelling}
            disabled={cancelling}
            style={[{ flex: 1, marginLeft: 6 }, styles.cancelBtn]}
          />
        </View>
      ) : null}
    </View>
  );
}
