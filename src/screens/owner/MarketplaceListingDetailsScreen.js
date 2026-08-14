import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { notify } from '../../components/confirm';
import { marketplaceApi } from '../../api/client';
import { resolveDeviceImageSource } from '../../utils/images';
import { getModelsByBrand } from '../../api/masterData';

const GREEN      = '#087A0A';
const GREEN_DARK = '#087A0A';

// Custom header — left-aligned large title + rounded-square back button.
function SellHeader({ onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        paddingTop: insets.top + 6,
        paddingBottom: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8E2',
      }}
    >
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.7}
          className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
          style={{ backgroundColor: '#EFF5EE' }}
        >
          <Ionicons name="chevron-back" size={22} color="#172117" />
        </TouchableOpacity>
        <Text className="flex-1 text-[24px] font-extrabold" style={{ color: '#172117' }} numberOfLines={1}>
          Sell Device Details
        </Text>
      </View>
    </View>
  );
}

function statusMeta(rawStatus) {
  const s = String(rawStatus || '').toUpperCase();
  if (s === 'SOLD' || s === 'COMPLETED') return { label: 'Selling Completed', icon: 'checkmark', bg: '#087A0A', tint: '#E6F7E3', border: '#C8EEBF' };
  if (s === 'CANCELLED' || s === 'CANCELED') return { label: 'Cancelled', icon: 'close', bg: '#DC2626', tint: '#FEE2E2', border: '#FECACA' };
  return { label: 'Selling – Pending', icon: 'time-outline', bg: '#F59E0B', tint: '#FFFBEB', border: '#FDE68A' };
}

const PHOTO_LABELS = ['Front Side', 'Back Side', 'Side and Center', 'Camera', 'Side and Center'];

// Icon + "Label: value" line in the device card.
function IconRow({ icon, label, value }) {
  return (
    <View className="flex-row items-center mt-1.5">
      <Ionicons name={icon} size={15} color={GREEN} style={{ marginRight: 8 }} />
      <Text className="text-[13px] flex-1" style={{ color: '#172117' }} numberOfLines={2}>
        <Text className="font-extrabold">{label}: </Text>
        <Text className="font-bold">{value || '-'}</Text>
      </Text>
    </View>
  );
}

// Green-check row with a chevron + divider in the Device Summary.
function SummaryRow({ text }) {
  return (
    <View className="flex-row items-center py-2.5" style={{ borderBottomWidth: 1, borderBottomColor: '#EFF5EE' }}>
      <Ionicons name="checkmark-circle-outline" size={17} color={GREEN} />
      <Text className="ml-2 flex-1 text-[13px]" style={{ color: '#172117' }} numberOfLines={2}>{text}</Text>
      <Ionicons name="chevron-forward" size={16} color="#CBD5CB" />
    </View>
  );
}

export default function MarketplaceListingDetailsScreen({ navigation, route }) {
  const productId = route?.params?.productId || route?.params?.id;
  const [item, setItem] = useState(route?.params?.listing || null);
  const [loading, setLoading] = useState(!route?.params?.listing);
  const [acting, setActing] = useState(false);

  const updateStatus = async (newStatus, prettyLabel) => {
    if (!productId) return;
    setActing(true);
    try {
      const res = await marketplaceApi.put(`/marketplace/products/${productId}`, { body: { status: newStatus } });
      setItem(res);
      notify('Updated', `Listing marked as ${prettyLabel}.`);
    } catch (e) {
      notify('Action failed', e?.message || 'Could not update the listing');
    } finally {
      setActing(false);
    }
  };

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await marketplaceApi.get(`/marketplace/products/${productId}`);
        if (cancelled) return;
        // For non-spare-parts listings, prefer the model's catalog image as the
        // primary thumbnail (rescues older listings that stored a condition
        // photo as imageUrl).
        if (data && data.descriptionType !== 'SPARE_PARTS' && data.brandId && data.modelId) {
          try {
            const models = await getModelsByBrand(data.brandId);
            const model = (models || []).find((m) => m.id === data.modelId);
            const modelUrl = resolveDeviceImageSource({ url: model?.imageUrl, base64: model?.imageBase64 });
            if (modelUrl) data.imageUrl = modelUrl;
          } catch (_) {}
        }
        setItem(data);
      } catch (_) {
        // keep whatever route param we received
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <SellHeader onBack={() => navigation.goBack()} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#087A0A" /></View>
      </View>
    );
  }
  if (!item) {
    return (
      <View className="flex-1 bg-background">
        <SellHeader onBack={() => navigation.goBack()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text-muted">Could not load this listing.</Text>
        </View>
      </View>
    );
  }

  let assessment = {};
  try { assessment = item.assessmentJson ? JSON.parse(item.assessmentJson) : {}; } catch (_) {}
  // Device Photo's = the user's uploaded condition photos (Front, Back, …).
  // imageUrl is the model's catalog image used for the card thumbnail, so we
  // exclude it from the gallery. Older listings without extraImageUrls fall
  // back to imageUrl as a single-entry gallery.
  const extras = (item.extraImageUrls || []).filter(Boolean);
  const allPhotos = extras.length > 0 ? extras : (item.imageUrl ? [item.imageUrl] : []);
  const orderId = item.id ? `GGFIX${String(item.id).slice(0, 12).toUpperCase().replace(/-/g, '')}` : '';
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = created ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const conditionText = item.workingCondition === 'DEAD' ? 'Dead / Unknown' : (item.conditionLabel || 'Good');

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SellHeader onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
        {/* Status banner */}
        {(() => {
          const meta = statusMeta(item.status);
          return (
            <View
              className="rounded-2xl p-4 mb-3 flex-row items-center"
              style={{ backgroundColor: meta.tint, borderWidth: 1, borderColor: meta.border }}
            >
              <View className="w-12 h-12 rounded-full items-center justify-center mr-3" style={{ backgroundColor: meta.bg }}>
                <Ionicons name={meta.icon} size={24} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-[19px] font-extrabold" style={{ color: '#172117' }}>{meta.label}</Text>
                <Text className="text-[12px] mt-0.5" style={{ color: '#8FA08F' }}>#{orderId}</Text>
              </View>
              {item.price != null ? (
                <Text className="text-[20px] font-extrabold" style={{ color: GREEN_DARK }}>
                  ₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              ) : null}
            </View>
          );
        })()}

        {/* Device card */}
        <View className="bg-card rounded-2xl p-4 mb-3" style={{ borderWidth: 1, borderColor: '#E2E8E2' }}>
          <View className="flex-row items-center">
            <View
              className="w-[96px] h-[108px] rounded-2xl overflow-hidden items-center justify-center"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={{ width: 96, height: 108 }} resizeMode="cover" />
              ) : (
                <Ionicons name="phone-portrait-outline" size={30} color="#8FA08F" />
              )}
            </View>
            <View className="ml-3.5 flex-1">
              <Text className="text-[18px] font-extrabold leading-6" style={{ color: '#172117' }} numberOfLines={2}>
                {item.title || 'Device'}
              </Text>
              <View style={{ height: 6 }} />
              {item.color ? <IconRow icon="brush-outline" label="Color" value={item.color} /> : null}
              {(item.ramLabel || item.storageLabel) ? (
                <IconRow icon="hardware-chip-outline" label="Storage" value={[item.ramLabel, item.storageLabel].filter(Boolean).join(' / ')} />
              ) : null}
              <IconRow icon="phone-portrait-outline" label="Device Condition" value={conditionText} />
              {item.imei ? <IconRow icon="barcode-outline" label="IMEI Number" value={item.imei} /> : null}
            </View>
          </View>

          {allPhotos.length > 0 ? (
            <>
              <View className="flex-row items-center mt-4 mb-2.5">
                <Ionicons name="image-outline" size={17} color={GREEN} />
                <Text className="ml-2 text-[14px] font-extrabold" style={{ color: '#172117' }}>Device Photos</Text>
              </View>
              <View className="flex-row flex-wrap -mx-1">
                {allPhotos.map((url, i) => (
                  <View key={i} className="px-1 mb-3" style={{ width: '33.333%' }}>
                    <View
                      className="rounded-xl overflow-hidden"
                      style={{ height: 96, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#7ED957' }}
                    >
                      <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>
                    <Text className="text-[11px] mt-1 text-center" style={{ color: '#172117' }} numberOfLines={1}>
                      {PHOTO_LABELS[i] || `Photo ${i + 1}`}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>

        {/* Device Summary */}
        {(assessment.screeningAnswers?.length || assessment.conditions?.length || assessment.accessories?.length || assessment.warrantyLabel) ? (
          <View className="bg-card rounded-2xl p-4 mb-3" style={{ borderWidth: 1, borderColor: '#E2E8E2' }}>
            <View className="flex-row items-center mb-1">
              <Ionicons name="reader-outline" size={18} color={GREEN} />
              <Text className="ml-2 text-[16px] font-extrabold" style={{ color: '#172117' }}>Device Summary</Text>
            </View>

            {assessment.screeningAnswers?.length ? (
              <>
                <Text className="text-[13px] font-extrabold mt-3 mb-0.5" style={{ color: GREEN }}>Screening Questions</Text>
                {assessment.screeningAnswers.map((a, i) => (
                  <SummaryRow key={i} text={[a.answer, a.question].filter(Boolean).join(', ')} />
                ))}
              </>
            ) : null}

            {assessment.conditions?.length ? (
              <>
                <Text className="text-[13px] font-extrabold mt-3 mb-0.5" style={{ color: GREEN }}>Screen</Text>
                {assessment.conditions.map((c, i) => (
                  <SummaryRow key={i} text={[c.optionLabel, c.groupName].filter(Boolean).join(', ')} />
                ))}
              </>
            ) : null}

            {assessment.accessories?.length ? (
              <>
                <Text className="text-[13px] font-extrabold mt-3 mb-0.5" style={{ color: GREEN }}>Accessories</Text>
                {assessment.accessories.map((a, i) => (
                  <SummaryRow key={i} text={a.label || a.accessoryCode} />
                ))}
              </>
            ) : null}

            {assessment.warrantyLabel ? (
              <>
                <Text className="text-[13px] font-extrabold mt-3 mb-0.5" style={{ color: GREEN }}>Warranty</Text>
                <SummaryRow text={assessment.warrantyLabel} />
              </>
            ) : null}
          </View>
        ) : null}

        {/* Description type pill */}
        {item.descriptionType ? (
          <View className="bg-card border border-border rounded-2xl p-3">
            <Text className="text-text-muted text-[10px] uppercase tracking-widest font-extrabold">Description Type</Text>
            <Text className="text-text text-[13px] font-bold mt-1">
              {item.descriptionType === 'DETAILED' ? 'Detailed Description'
                : item.descriptionType === 'SHORT' ? 'Short Description'
                : item.descriptionType === 'DEAD_SHORT' ? 'Dead Phone Short Description'
                : item.descriptionType === 'SPARE_PARTS' ? 'Spare Parts Listing'
                : item.descriptionType}
            </Text>
          </View>
        ) : null}

        {/* Sale outcome banner once it's a terminal state. */}
        {(() => {
          const s = String(item.status || '').toUpperCase();
          if (s === 'SOLD' || s === 'COMPLETED') {
            return (
              <View className="bg-success/10 border border-success/30 rounded-2xl p-3 mt-3 items-center">
                <Ionicons name="checkmark-circle" size={28} color="#16BB05" />
                <Text className="text-success text-[14px] font-extrabold mt-1">Selling Completed</Text>
              </View>
            );
          }
          if (s === 'CANCELLED' || s === 'CANCELED') {
            return (
              <View className="bg-danger/10 border border-danger/30 rounded-2xl p-3 mt-3 items-center">
                <Ionicons name="close-circle" size={28} color="#DC2626" />
                <Text className="text-danger text-[14px] font-extrabold mt-1">Listing Cancelled</Text>
              </View>
            );
          }
          return null;
        })()}
      </ScrollView>

      {/* Action buttons — only while the listing is still live. */}
      {(() => {
        const s = String(item.status || '').toUpperCase();
        const isLive = s !== 'SOLD' && s !== 'COMPLETED' && s !== 'CANCELLED' && s !== 'CANCELED';
        if (!isLive) return null;
        return (
          <View
            className="absolute left-0 right-0 bottom-0 px-4 pt-3 flex-row"
            style={{
              paddingBottom: 16,
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: '#E2E8E2',
              shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12,
            }}
          >
            <Pressable
              onPress={() => updateStatus('CANCELLED', 'Cancelled')}
              disabled={acting}
              className="flex-1 mr-2 rounded-full py-3.5 items-center justify-center active:opacity-80"
              style={{ backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5' }}
            >
              {acting ? <ActivityIndicator color="#DC2626" /> : (
                <View className="flex-row items-center">
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text className="font-extrabold text-[14px] ml-2" style={{ color: '#DC2626' }}>Selling Cancel</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => updateStatus('SOLD', 'Completed')}
              disabled={acting}
              className="flex-1 rounded-full py-3.5 items-center justify-center active:opacity-90"
              style={{ backgroundColor: GREEN_DARK }}
            >
              {acting ? <ActivityIndicator color="#fff" /> : (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text className="text-white font-extrabold text-[14px] ml-2">Selling Completed</Text>
                </View>
              )}
            </Pressable>
          </View>
        );
      })()}
    </View>
  );
}
