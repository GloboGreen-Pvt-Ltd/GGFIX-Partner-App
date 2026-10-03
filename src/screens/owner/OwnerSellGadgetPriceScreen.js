import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Image, Modal } from 'react-native';
import { Check, IndianRupee, Smartphone, Tag, Wrench } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ScreenHeader } from '../../components/rnr';
import { notify } from '../../components/confirm';
import { marketplaceApi } from '../../api/client';
import { selectShopId } from '../../store/authSlice';
import { specDisplayParts, specRequestFields } from '../../utils/deviceSpecs';
import { SELL, SellButton, SellFooter, sellShadow } from '../shared/sell/sellTheme';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

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
  const [focused, setFocused] = useState(false);

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

  // Mobile/Tablet: "8 GB / 128 GB" as before. Laptop: "16 GB / 512 GB NVMe SSD";
  // Smartwatch: "44 mm / GPS + Cellular"; Audio: "TWS Earbuds / Bluetooth".
  const specs = specDisplayParts(device).join(' / ');

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
      const titleSpecs = specs;
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
        // deviceCategory + ram / storageCapacity / storageType / caseSize /
        // connectivity / deviceType, each in its own column (null when the
        // category doesn't take it). Mobile/Tablet send only deviceCategory.
        ...specRequestFields(device.deviceCategory, device.specs),
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

  const canSubmit = isSparePartsMode ? pricedPartsCount > 0 : priceNum > 0;
  const total = isSparePartsMode ? totalPartsPrice : priceNum;
  const modalImage = isSparePartsMode ? Object.values(images).filter(Boolean)[0] : device.imageUrl;

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScreenHeader title="Sell your Gadget" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: SELL.greenLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 14 }}>
          <Tag size={13} color={SELL.greenDark} />
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: SELL.greenDark, marginLeft: 6 }}>SELL NOW FOR AMAZING PRICE</Text>
        </View>

        {isSparePartsMode ? (
          <>
            <Text style={{ fontSize: 15, fontWeight: '800', color: SELL.ink, paddingHorizontal: 2 }}>Set part prices</Text>
            <Text style={{ fontSize: 13, color: SELL.muted, marginTop: 3, marginBottom: 12, paddingHorizontal: 2 }}>
              Enter a price for each part you want to list. Parts left at 0 are skipped.
            </Text>
            {spareParts.map((p, idx) => {
              const priceTxt = partPriceTexts[idx] || '';
              const hasPrice = toNum(priceTxt) > 0;
              return (
                <View
                  key={`${p.groupKey}-${p.partName}-${idx}`}
                  style={{ backgroundColor: SELL.card, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1.5, borderColor: hasPrice ? SELL.green : SELL.soft, flexDirection: 'row', alignItems: 'center', ...sellShadow }}
                >
                  <View style={{ height: 52, width: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: SELL.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    {p.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={{ width: 52, height: 52 }} resizeMode="cover" />
                    ) : (
                      <Wrench size={20} color={SELL.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink }} numberOfLines={1}>{p.partName}</Text>
                    <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 1 }} numberOfLines={1}>{p.group}</Text>
                  </View>
                  <View
                    style={{
                      width: 124, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5,
                      borderColor: hasPrice ? SELL.green : SELL.line, backgroundColor: hasPrice ? SELL.greenLight : SELL.card, paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '800', color: SELL.ink, marginRight: 4 }}>₹</Text>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor={SELL.subtle}
                      keyboardType="numeric"
                      value={priceTxt}
                      onChangeText={(v) => setPartPriceTexts((st) => ({ ...st, [idx]: v }))}
                      style={{ flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 13, fontWeight: '800', color: SELL.ink }}
                    />
                  </View>
                </View>
              );
            })}

            <View style={{ backgroundColor: SELL.greenLight, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: SELL.muted }}>TOTAL · {pricedPartsCount}/{spareParts.length} PRICED</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: SELL.greenDark, marginTop: 2 }}>₹{fmt(totalPartsPrice)}</Text>
              </View>
              <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: SELL.card, alignItems: 'center', justifyContent: 'center' }}>
                <IndianRupee size={18} color={SELL.green} />
              </View>
            </View>
          </>
        ) : (
          <View style={{ backgroundColor: SELL.card, borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: SELL.soft, ...sellShadow }}>
            <View style={{ height: 150, width: 150, borderRadius: 75, backgroundColor: SELL.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {device.imageUrl ? (
                <Image source={{ uri: device.imageUrl }} style={{ width: 110, height: 130 }} resizeMode="contain" />
              ) : (
                <Smartphone size={44} color={SELL.green} />
              )}
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: SELL.ink, textAlign: 'center' }} numberOfLines={2}>
              {device.modelName || 'Device'}
            </Text>
            {specs || device.color ? (
              <Text style={{ fontSize: 13, color: SELL.muted, marginTop: 3, textAlign: 'center' }} numberOfLines={1}>
                {[specs, device.color].filter(Boolean).join(' · ')}
              </Text>
            ) : null}

            <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink }}>Your selling price</Text>
              <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 2, marginBottom: 8 }}>Buyers nearby will see this price.</Text>
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14,
                  borderColor: focused || priceNum > 0 ? SELL.green : SELL.line, backgroundColor: SELL.card,
                }}
              >
                <Text style={{ fontSize: 20, fontWeight: '800', color: SELL.ink, marginRight: 8 }}>₹</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor={SELL.subtle}
                  keyboardType="numeric"
                  value={priceText}
                  onChangeText={setPriceText}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={{ flex: 1, paddingVertical: 12, fontSize: 20, fontWeight: '800', color: SELL.ink }}
                />
              </View>
              {priceNum > 0 ? (
                <Text style={{ fontSize: 12, fontWeight: '700', color: SELL.greenDark, marginTop: 6 }}>Listing price: ₹{fmt(priceNum)}</Text>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      <SellFooter caption={canSubmit ? null : (isSparePartsMode ? 'Price at least one part to continue' : 'Enter a price to continue')}>
        <SellButton
          title={isSparePartsMode ? `Submit (${pricedPartsCount})` : 'Submit'}
          onPress={() => setConfirming(true)}
          disabled={!canSubmit}
        />
      </SellFooter>

      {/* Confirm Sale */}
      <Modal visible={confirming} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!submitting) setConfirming(false); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(30,30,30,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }}>
          <View style={{ backgroundColor: SELL.card, borderRadius: 24, padding: 18, width: '100%', maxWidth: 420 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ height: 52, width: 52, borderRadius: 26, backgroundColor: SELL.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SELL.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={20} color="#FFFFFF" strokeWidth={3} />
                </View>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: SELL.ink }}>Confirm your sale</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: SELL.page, borderRadius: 16, padding: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: SELL.ink }} numberOfLines={2}>
                  {isSparePartsMode ? `Spare Parts (${pricedPartsCount})` : (device.modelName || 'Device')}
                </Text>
                {isSparePartsMode ? (
                  <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 3 }} numberOfLines={3}>
                    {partsWithPrice.filter((p) => p._price > 0).map((p) => p.partName).join(', ')}
                  </Text>
                ) : (specs ? <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 3 }}>{specs}</Text> : null)}
                <View style={{ alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: SELL.green, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Tag size={11} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF', marginLeft: 4 }}>BEST DEAL</Text>
                </View>
              </View>
              {modalImage ? (
                <Image source={{ uri: modalImage }} style={{ width: 76, height: 92, marginLeft: 10 }} resizeMode={isSparePartsMode ? 'cover' : 'contain'} />
              ) : null}
            </View>

            <Text style={{ fontSize: 13, color: SELL.ink, marginTop: 14, lineHeight: 19 }}>
              {isSparePartsMode
                ? `We'll list ${pricedPartsCount} spare part${pricedPartsCount === 1 ? '' : 's'} separately. Confirm to proceed.`
                : 'Should we proceed with selling this product? Please confirm.'}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.muted }}>{isSparePartsMode ? 'Total' : 'Price'}</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: SELL.greenDark, marginLeft: 8 }}>₹{fmt(total)}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <SellButton title="Cancel" variant="outline" onPress={() => setConfirming(false)} disabled={submitting} style={{ flex: 1 }} />
              <SellButton title="Sell Now" onPress={submit} loading={submitting} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
