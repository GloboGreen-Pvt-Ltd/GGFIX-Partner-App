import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { ScreenHeader } from '../../components/rnr';
import { notify } from '../../components/confirm';
import { marketplaceApi } from '../../api/client';
import { selectShopId } from '../../store/authSlice';

export default function OwnerSellGadgetPriceScreen({ navigation, route }) {
  const params = route?.params || {};
  const device = params.device || {};
  const images = params.images || {};
  const shopId = useSelector(selectShopId);
  const spareParts = Array.isArray(params.spareParts) ? params.spareParts : null;
  const isSparePartsMode = !!spareParts;
  const [priceText, setPriceText] = useState('');
  const [partPriceTexts, setPartPriceTexts] = useState({}); // { [idx]: string } for spare parts mode
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toNum = (s) => {
    const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const priceNum = useMemo(() => toNum(priceText), [priceText]);

  // Per-part prices + total for spare parts mode.
  const partsWithPrice = useMemo(() => (
    isSparePartsMode
      ? spareParts.map((p, i) => ({ ...p, _idx: i, _price: toNum(partPriceTexts[i]) }))
      : []
  ), [spareParts, partPriceTexts, isSparePartsMode]);
  const totalPartsPrice = useMemo(() => (
    partsWithPrice.reduce((s, p) => s + (p._price || 0), 0)
  ), [partsWithPrice]);
  const pricedPartsCount = useMemo(() => (
    partsWithPrice.filter((p) => p._price > 0).length
  ), [partsWithPrice]);

  const specs = [device.ramLabel, device.storageLabel].filter(Boolean).join(' / ');

  const submit = async () => {
    if (submitting) return; // re-entry guard: a fast double-tap must not fire two POST batches
    setSubmitting(true);
    try {
      // Spare-parts mode: post one listing per priced part.
      if (isSparePartsMode) {
        const priced = partsWithPrice.filter((p) => p._price > 0);
        if (priced.length === 0) {
          notify('Add a price', 'Enter a price on at least one spare part to list it.');
          return;
        }
        const results = [];
        for (const p of priced) {
          const payload = {
            shopId: shopId || null,
            type: 'SELL',
            status: 'ACTIVE',
            title: p.partName,
            description: `${p.group} · ${p.partName}`,
            price: p._price,
            conditionLabel: 'Spare Part',
            descriptionType: 'SPARE_PARTS',
            imageUrl: p.imageUrl || Object.values(images).filter(Boolean)[0] || null,
            // Persist every extra photo the shop attached to this part (all but the primary).
            extraImageUrls: (p.imageUrls || []).filter((u) => u && u !== p.imageUrl),
            assessmentJson: JSON.stringify({ spareParts: [p] }),
          };
          const res = await marketplaceApi.post('/marketplace/products', { body: payload });
          results.push(res);
        }
        navigation.replace('OwnerSellListed', {
          listing: { id: results[0]?.id, count: results.length, total: totalPartsPrice },
          device: { modelName: `Spare Parts (${results.length})` },
          images,
          price: totalPartsPrice,
        });
        return;
      }

      const imageList = Object.values(images).filter(Boolean);
      const conditionLabel = params.workingCondition === 'DEAD'
        ? 'Dead / Unknown'
        : (params.deviceCondition || 'Good');
      const titleSpecs = [device.ramLabel, device.storageLabel].filter(Boolean).join(' / ');
      const title = `${device.modelName || 'Device'}${titleSpecs ? ` (${titleSpecs})` : ''}`;

      // Roll up the assessment data into one JSON blob the backend stores.
      const assessment = {
        screeningAnswers: params.screeningAnswers || [],
        conditions: params.conditions || [],
        issues: params.issues || [],
        accessories: params.accessories || [],
        warranty: params.warranty || null,
        warrantyLabel: params.warrantyLabel || null,
        deviceConfig: params.deviceConfig || null,
        spareParts: spareParts || null,
      };

      const payload = {
        shopId: shopId || null,
        type: 'SELL',
        status: 'ACTIVE',
        title,
        description: `${device.modelName || ''}${device.color ? ' · ' + device.color : ''}${titleSpecs ? ' · ' + titleSpecs : ''}`.trim(),
        price: priceNum,
        brandId: device.brandId || null,
        modelId: device.modelId || null,
        ramOptionId: device.ramOptionId || null,
        storageOptionId: device.storageOptionId || null,
        conditionLabel,
        color: device.color || null,
        ramLabel: device.ramLabel || null,
        storageLabel: device.storageLabel || null,
        imei: device.imei || null,
        workingCondition: params.workingCondition || null,
        descriptionType: params.descriptionType || null,
        // Use the device's catalog image as the primary listing image (so the
        // My Orders / marketplace card shows the actual phone/laptop/watch
        // instead of a user-uploaded condition photo). Uploaded photos still
        // ship as extras so the details screen can render the full gallery.
        imageUrl: device.imageUrl || imageList[0] || null,
        extraImageUrls: imageList.filter((u) => u && u !== device.imageUrl),
        assessmentJson: JSON.stringify(assessment),
      };
      const res = await marketplaceApi.post('/marketplace/products', { body: payload });
      navigation.replace('OwnerSellListed', { listing: res, device, images, price: priceNum });
    } catch (e) {
      const detail = e?.message || 'Could not create the marketplace listing';
      notify('Listing failed', e?.status ? `${detail} (HTTP ${e.status})` : detail);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Sell your Gadget" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <View className="bg-success/10 px-4 py-2 rounded-full self-center mb-3">
          <Text className="text-success text-[12px] font-extrabold tracking-widest">SELL NOW FOR AMAZING PRICE</Text>
        </View>

        {isSparePartsMode ? (
          <>
            <Text className="text-danger text-[12px] font-bold text-center mb-3">
              Enter price for each spare part you want to list
            </Text>
            {spareParts.map((p, idx) => {
              const priceTxt = partPriceTexts[idx] || '';
              const hasPrice = toNum(priceTxt) > 0;
              return (
                <View key={`${p.groupKey}-${p.partName}-${idx}`} className={`bg-card border rounded-2xl p-3 mb-2.5 ${hasPrice ? 'border-primary/40' : 'border-border'}`}>
                  <View className="flex-row items-center">
                    <View className="w-14 h-14 rounded-md overflow-hidden bg-background items-center justify-center mr-3">
                      {p.imageUrl ? (
                        <Image source={{ uri: p.imageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                      ) : (
                        <Ionicons name="construct-outline" size={22} color="#8FA08F" />
                      )}
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-text font-extrabold text-[13px]" numberOfLines={1}>{p.partName}</Text>
                      <Text className="text-text-muted text-[10px] mt-0.5" numberOfLines={1}>{p.group}</Text>
                    </View>
                    <View
                      style={{ width: 130 }}
                      className={`flex-row items-center rounded-lg border px-2.5 py-1.5 ${hasPrice ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                    >
                      <Text className="text-text text-[14px] font-extrabold mr-1">₹</Text>
                      <TextInput
                        className="text-text text-[14px] font-extrabold"
                        placeholder="0.00"
                        placeholderTextColor="#8FA08F"
                        keyboardType="numeric"
                        value={priceTxt}
                        onChangeText={(v) => setPartPriceTexts((s) => ({ ...s, [idx]: v }))}
                        style={{ flex: 1, paddingVertical: 2, minWidth: 0, width: '100%' }}
                      />
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Total */}
            <View className="bg-card border border-success/40 rounded-2xl p-3 flex-row items-center mt-1">
              <View className="flex-1">
                <Text className="text-text-muted text-[10px] uppercase tracking-widest">Total ({pricedPartsCount}/{spareParts.length} priced)</Text>
                <Text className="text-success text-[18px] font-extrabold mt-0.5">
                  ₹ {totalPartsPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <Ionicons name="pricetags-outline" size={22} color="#16BB05" />
            </View>
          </>
        ) : (
          <View className="bg-card border border-border rounded-2xl p-4 items-center" style={{ shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
            {device.imageUrl ? (
              <Image source={{ uri: device.imageUrl }} style={{ width: 110, height: 130, marginBottom: 8 }} resizeMode="contain" />
            ) : (
              <View className="w-[110px] h-[130px] mb-2 bg-background rounded-xl items-center justify-center">
                <Ionicons name="phone-portrait-outline" size={36} color="#8FA08F" />
              </View>
            )}
            <Text className="text-text font-extrabold text-[14px] text-center" numberOfLines={2}>
              {device.modelName || 'Device'}{specs ? `, ${specs}` : ''}{device.color ? ` · ${device.color}` : ''}
            </Text>

            <Text className="text-danger text-[12px] font-bold mt-3 mb-2">Kindly enter the device price amount</Text>

            <View className="flex-row items-center bg-background border border-border rounded-xl px-3 py-2 self-stretch">
              <Text className="text-text text-[16px] font-extrabold mr-2">₹</Text>
              <TextInput
                className="flex-1 text-text text-[16px] font-extrabold"
                placeholder="0.00"
                placeholderTextColor="#8FA08F"
                keyboardType="numeric"
                value={priceText}
                onChangeText={setPriceText}
              />
            </View>
          </View>
        )}
      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 p-4 bg-card border-t border-border" style={{ shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Pressable
          onPress={() => setConfirming(true)}
          disabled={isSparePartsMode ? pricedPartsCount === 0 : priceNum <= 0}
          className={`rounded-2xl py-3.5 items-center ${(isSparePartsMode ? pricedPartsCount > 0 : priceNum > 0) ? 'bg-success active:opacity-80' : 'bg-success/40'}`}
        >
          <Text className="text-white text-[15px] font-extrabold">
            {isSparePartsMode ? `Submit (${pricedPartsCount})` : 'Submit'}
          </Text>
        </Pressable>
      </View>

      {/* Confirm Sale modal */}
      {confirming ? (
        <View className="absolute inset-0 bg-black/50 items-center justify-center px-6">
          <View className="bg-card rounded-3xl p-5 w-full" style={{ maxWidth: 420 }}>
            <View className="items-center mb-2">
              <View className="bg-success rounded-full p-1.5 mb-1">
                <Ionicons name="checkmark" size={22} color="#fff" />
              </View>
              <Text className="text-text text-[18px] font-extrabold">Confirm Your Sale</Text>
            </View>

            <View className="flex-row items-center mt-3">
              <View className="flex-1">
                <Text className="text-text text-[20px] font-extrabold" numberOfLines={1}>
                  {isSparePartsMode ? `Spare Parts (${pricedPartsCount})` : (device.modelName || 'Device')}
                </Text>
                {isSparePartsMode ? (
                  <Text className="text-text-muted text-[12px] mt-1" numberOfLines={3}>
                    {partsWithPrice.filter((p) => p._price > 0).map((p) => p.partName).join(', ')}
                  </Text>
                ) : (specs ? <Text className="text-text-muted text-[12px] mt-1">{specs}</Text> : null)}
                <View className="bg-success rounded-full px-3 py-1 self-start mt-2 flex-row items-center">
                  <Ionicons name="pricetag" size={11} color="#fff" />
                  <Text className="text-white text-[11px] font-extrabold ml-1">BEST DEAL</Text>
                </View>
              </View>
              {isSparePartsMode ? (
                Object.values(images).filter(Boolean)[0] ? (
                  <Image source={{ uri: Object.values(images).filter(Boolean)[0] }} style={{ width: 90, height: 110, marginLeft: 8 }} resizeMode="cover" />
                ) : null
              ) : (device.imageUrl ? (
                <Image source={{ uri: device.imageUrl }} style={{ width: 90, height: 110, marginLeft: 8 }} resizeMode="contain" />
              ) : null)}
            </View>

            <Text className="text-text mt-3 text-[13px]">
              {isSparePartsMode
                ? `We'll list ${pricedPartsCount} spare part${pricedPartsCount === 1 ? '' : 's'} separately. Confirm to proceed.`
                : 'Should we proceed with selling this product? Please confirm.'}
            </Text>

            <Text className="text-primary mt-3 text-[14px] font-extrabold">
              {isSparePartsMode ? 'Total: ' : 'Price: '}₹ {(isSparePartsMode ? totalPartsPrice : priceNum).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>

            <View className="flex-row mt-4">
              <Pressable
                onPress={() => setConfirming(false)}
                disabled={submitting}
                className="flex-1 mr-2 rounded-2xl bg-background border border-border py-3 items-center active:opacity-80"
              >
                <Text className="text-text-muted text-[14px] font-extrabold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={submitting}
                className="flex-1 rounded-2xl bg-success py-3 items-center active:opacity-80"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-[14px] font-extrabold">Sell Now</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
