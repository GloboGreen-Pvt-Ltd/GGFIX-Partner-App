import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { confirm, notify } from '../../components/confirm';
import ImageViewerModal from '../../components/ImageViewerModal';
import { marketplaceApi } from '../../api/client';
import { resolveDeviceImageSource } from '../../utils/images';
import { getModelsByBrand } from '../../api/masterData';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #09AD2A, red #F84141, yellow #F3BF23, ink #1E1E1E,
// neutrals #F8F8F8 / #F3F3F3.
const C = {
  green: '#09AD2A',
  greenDark: '#078F23',
  mint: '#EAF8EC',
  red: '#F84141',
  redTint: '#FEECEC',
  yellow: '#F3BF23',
  yellowInk: '#8A6A00',
  yellowTint: '#FFF8E1',
  ink: '#1E1E1E',
  muted: '#6B6B6B',
  line: '#E6E6E6',
  soft: '#F3F3F3',
  page: '#F8F8F8',
  card: '#FFFFFF',
};

const cardStyle = {
  backgroundColor: C.card,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: C.soft,
  padding: 14,
  marginBottom: 10,
};

// Custom header — back button + title.
function SellHeader({ onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.card, paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityLabel="Go back"
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: C.soft }}
        >
          <Ionicons name="chevron-back" size={19} color={C.ink} />
        </TouchableOpacity>
        <Text className="font-extrabold" style={{ flex: 1, fontSize: 17, color: C.ink }} numberOfLines={1}>
          Sell Device Details
        </Text>
      </View>
    </View>
  );
}

function statusMeta(rawStatus) {
  const s = String(rawStatus || '').toUpperCase();
  if (s === 'SOLD' || s === 'COMPLETED') return { label: 'Selling Completed', icon: 'checkmark', bg: C.green, ink: C.greenDark, tint: C.mint };
  if (s === 'CANCELLED' || s === 'CANCELED') return { label: 'Cancelled', icon: 'close', bg: C.red, ink: C.red, tint: C.redTint };
  return { label: 'Selling – Pending', icon: 'time-outline', bg: C.yellow, ink: C.yellowInk, tint: C.yellowTint };
}

// Upload slots in the sell flow, in order (front / back / side / camera / other).
const PHOTO_LABELS = ['Front Side', 'Back Side', 'Side & Center', 'Camera', 'Other Angle'];

// On-screen spelling only — the stored warranty label is left as saved.
const tidyWarranty = (label) => String(label || '').replace(/\bthen\b/gi, 'than');

// Icon + "Label: value" line in the device card.
function IconRow({ icon, label, value }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: 6 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Ionicons name={icon} size={12} color={C.green} />
      </View>
      <Text style={{ flex: 1, fontSize: 12, color: C.ink }} numberOfLines={2}>
        <Text style={{ color: C.muted }}>{label}: </Text>
        <Text className="font-bold">{value || '-'}</Text>
      </Text>
    </View>
  );
}

// Green-check line in the Device Summary (informational — not tappable).
function SummaryRow({ text, last }) {
  return (
    <View className="flex-row items-center" style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.soft }}>
      <Ionicons name="checkmark-circle" size={16} color={C.green} />
      <Text style={{ marginLeft: 8, flex: 1, fontSize: 12, color: C.ink, lineHeight: 17 }} numberOfLines={2}>{text}</Text>
    </View>
  );
}

function SummaryGroup({ title, rows }) {
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <Text className="font-extrabold" style={{ fontSize: 11, letterSpacing: 0.8, color: C.greenDark, marginBottom: 2 }}>{title.toUpperCase()}</Text>
      {rows.map((t, i) => <SummaryRow key={i} text={t} last={i === rows.length - 1} />)}
    </View>
  );
}

export default function MarketplaceListingDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - 32, 760), alignSelf: 'center' } : null;
  const productId = route?.params?.productId || route?.params?.id;
  const [item, setItem] = useState(route?.params?.listing || null);
  const [loading, setLoading] = useState(!route?.params?.listing);
  const [acting, setActing] = useState(false);
  const [viewer, setViewer] = useState(null); // photo index open full screen

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

  // Both outcomes are final for the listing, so ask before changing it.
  const askCancel = async () => {
    const ok = await confirm({
      title: 'Cancel this listing?',
      message: 'The device will be taken off the marketplace and marked as cancelled.',
      confirmText: 'Cancel listing',
      cancelText: 'Keep',
      destructive: true,
    });
    if (ok) updateStatus('CANCELLED', 'Cancelled');
  };
  const askComplete = async () => {
    const ok = await confirm({
      title: 'Mark as sold?',
      message: 'The listing will be marked as Selling Completed.',
      confirmText: 'Mark sold',
      cancelText: 'Not yet',
    });
    if (ok) updateStatus('SOLD', 'Completed');
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
      <View style={{ flex: 1, backgroundColor: C.page }}>
        <SellHeader onBack={() => navigation.goBack()} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={C.green} /></View>
      </View>
    );
  }
  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: C.page }}>
        <SellHeader onBack={() => navigation.goBack()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ fontSize: 13, color: C.muted }}>Could not load this listing.</Text>
        </View>
      </View>
    );
  }

  let assessment = {};
  try { assessment = item.assessmentJson ? JSON.parse(item.assessmentJson) : {}; } catch (_) {}
  // Device Photos = the seller's uploaded condition photos (Front, Back, …).
  // imageUrl is the model's catalog image used for the card thumbnail, so it's
  // excluded from the gallery. Older listings without extraImageUrls fall back
  // to imageUrl as a single-entry gallery.
  const extras = (item.extraImageUrls || []).filter(Boolean);
  const allPhotos = extras.length > 0 ? extras : (item.imageUrl ? [item.imageUrl] : []);
  const orderId = item.id ? `GGFIX${String(item.id).slice(0, 12).toUpperCase().replace(/-/g, '')}` : '';
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = created ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const conditionText = item.workingCondition === 'DEAD' ? 'Dead / Unknown' : (item.conditionLabel || 'Good');
  const meta = statusMeta(item.status);
  const s = String(item.status || '').toUpperCase();
  const isLive = s !== 'SOLD' && s !== 'COMPLETED' && s !== 'CANCELLED' && s !== 'CANCELED';

  const screening = (assessment.screeningAnswers || []).map((a) => [a.answer, a.question].filter(Boolean).join(', '));
  const conditions = (assessment.conditions || []).map((c) => [c.optionLabel, c.groupName].filter(Boolean).join(', '));
  const accessories = (assessment.accessories || []).map((a) => a.label || a.accessoryCode).filter(Boolean);
  const warranty = assessment.warrantyLabel ? [tidyWarranty(assessment.warrantyLabel)] : [];
  const hasSummary = screening.length || conditions.length || accessories.length || warranty.length;
  const descriptionText = item.descriptionType === 'DETAILED' ? 'Detailed Description'
    : item.descriptionType === 'SHORT' ? 'Short Description'
      : item.descriptionType === 'DEAD_SHORT' ? 'Dead Phone Short Description'
        : item.descriptionType === 'SPARE_PARTS' ? 'Spare Parts Listing'
          : item.descriptionType;

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SellHeader onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: isLive ? 96 + insets.bottom : 24 + insets.bottom }}>
        <View style={capStyle}>
          {/* Status banner */}
          <View className="flex-row items-center" style={{ borderRadius: 16, padding: 12, marginBottom: 10, backgroundColor: meta.tint }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: meta.bg }}>
              <Ionicons name={meta.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-extrabold" style={{ fontSize: 15, color: meta.ink }} numberOfLines={1}>{meta.label}</Text>
              <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }} numberOfLines={1}>
                #{orderId}{dateLabel ? ` · ${dateLabel}` : ''}
              </Text>
            </View>
            {item.price != null ? (
              <Text className="font-extrabold" style={{ marginLeft: 8, fontSize: 15, color: C.greenDark }}>
                ₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            ) : null}
          </View>

          {/* Device card */}
          <View style={cardStyle}>
            <View className="flex-row items-center">
              <View style={{ width: 84, height: 96, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.soft }}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={{ width: 78, height: 90 }} resizeMode="contain" />
                ) : (
                  <Ionicons name="phone-portrait-outline" size={28} color="#9E9E9E" />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <Text className="font-extrabold" style={{ fontSize: 15, color: C.ink, lineHeight: 19 }} numberOfLines={2}>
                  {item.title || 'Device'}
                </Text>
                {item.color ? <IconRow icon="color-palette-outline" label="Color" value={item.color} /> : null}
                {(item.ramLabel || item.storageLabel) ? (
                  <IconRow icon="hardware-chip-outline" label="Storage" value={[item.ramLabel, item.storageLabel].filter(Boolean).join(' / ')} />
                ) : null}
                <IconRow icon="phone-portrait-outline" label="Condition" value={conditionText} />
                {item.imei ? <IconRow icon="barcode-outline" label="IMEI" value={item.imei} /> : null}
              </View>
            </View>

            {allPhotos.length > 0 ? (
              <>
                <View className="flex-row items-center" style={{ marginTop: 14, marginBottom: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.soft }}>
                  <Ionicons name="images-outline" size={15} color={C.green} />
                  <Text className="font-extrabold" style={{ marginLeft: 6, flex: 1, fontSize: 13, color: C.ink }}>Device Photos</Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>Tap to view</Text>
                </View>
                <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                  {allPhotos.map((url, i) => (
                    <View key={i} style={{ width: '33.333%', padding: 4 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setViewer(i)}
                        accessibilityLabel={`View ${PHOTO_LABELS[i] || `photo ${i + 1}`}`}
                        style={{ height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: C.page, borderWidth: 1, borderColor: C.soft }}
                      >
                        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'center', color: C.ink }} numberOfLines={1}>
                        {PHOTO_LABELS[i] || `Photo ${i + 1}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>

          {/* Device Summary */}
          {hasSummary ? (
            <View style={cardStyle}>
              <View className="flex-row items-center">
                <Ionicons name="reader-outline" size={16} color={C.green} />
                <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 13, color: C.ink }}>Device Summary</Text>
              </View>
              <SummaryGroup title="Screening Questions" rows={screening} />
              <SummaryGroup title="Screen" rows={conditions} />
              <SummaryGroup title="Accessories" rows={accessories} />
              <SummaryGroup title="Warranty" rows={warranty} />
            </View>
          ) : null}

          {/* Description type */}
          {item.descriptionType ? (
            <View className="flex-row items-center" style={cardStyle}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Ionicons name="document-text-outline" size={15} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="font-extrabold" style={{ fontSize: 10.5, letterSpacing: 0.8, color: C.muted }}>DESCRIPTION TYPE</Text>
                <Text className="font-bold" style={{ fontSize: 13, color: C.ink, marginTop: 1 }}>{descriptionText}</Text>
              </View>
            </View>
          ) : null}

          {/* Sale outcome once it's a terminal state. */}
          {(s === 'SOLD' || s === 'COMPLETED') ? (
            <View className="flex-row items-center justify-center" style={{ borderRadius: 14, padding: 12, backgroundColor: C.mint }}>
              <Ionicons name="checkmark-circle" size={20} color={C.green} />
              <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 13, color: C.greenDark }}>Selling Completed</Text>
            </View>
          ) : (s === 'CANCELLED' || s === 'CANCELED') ? (
            <View className="flex-row items-center justify-center" style={{ borderRadius: 14, padding: 12, backgroundColor: C.redTint }}>
              <Ionicons name="close-circle" size={20} color={C.red} />
              <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 13, color: C.red }}>Listing Cancelled</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Action buttons — only while the listing is still live. */}
      {isLive ? (
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 6,
            backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line,
          }}
        >
          <View className="flex-row" style={[{ gap: 10 }, capStyle]}>
            <TouchableOpacity
              onPress={askCancel}
              disabled={acting}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={{ flex: 1, minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.redTint, borderWidth: 1.5, borderColor: C.red, opacity: acting ? 0.6 : 1 }}
            >
              <View className="flex-row items-center">
                <Ionicons name="close-circle-outline" size={17} color={C.red} />
                <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 13, color: C.red }}>Selling Cancel</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={askComplete}
              disabled={acting}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={{ flex: 1, minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, opacity: acting ? 0.6 : 1 }}
            >
              {acting ? <ActivityIndicator color="#FFFFFF" /> : (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
                  <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 13, color: '#FFFFFF' }}>Selling Completed</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <ImageViewerModal
        visible={viewer != null}
        images={allPhotos.map((uri, i) => ({ uri, label: PHOTO_LABELS[i] || `Photo ${i + 1}` }))}
        index={viewer || 0}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}
