import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { confirm, notify } from '../../components/confirm';
import ImageViewerModal from '../../components/ImageViewerModal';
import { listShopBuyOrders } from '../../api/buyOrders';
import { marketplaceApi } from '../../api/client';
import { resolveDeviceImageSource } from '../../utils/images';
import { getModelsByBrand } from '../../api/masterData';
import { hasCategorySpecs, resolveSpecCategory, specDetailRows } from '../../utils/deviceSpecs';
import { imeiApplies } from '../../utils/imeiPolicy';
import { loadChatBuyOrders, ordersForListing, sendOrderOutcome } from '../../utils/buyOrders';
import { Card, SellScreen } from './sell/kit';

// GGFIX palette — green #035C6C, red #F84141, yellow #F3BF23, ink #111111,
// neutrals #F3F4F6 / #F3F4F6.
const C = {
  green: '#035C6C',
  greenDark: '#035C6C',
  mint: '#E5F3F5',
  red: '#F84141',
  redTint: '#FEECEC',
  yellow: '#F3BF23',
  yellowInk: '#8A6A00',
  yellowTint: '#FFF8E1',
  ink: '#111111',
  muted: '#6B7280',
  line: '#E5E7EB',
  soft: '#F3F4F6',
  page: '#F3F4F6',
  card: '#FFFFFF',
};

const cardStyle = { marginBottom: 10 };

function statusMeta(rawStatus) {
  const s = String(rawStatus || '').toUpperCase();
  if (s === 'RESERVED') return { label: 'Order in progress', icon: 'time-outline', bg: C.yellow, ink: C.yellowInk, tint: C.yellowTint };
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
  const productId = route?.params?.productId || route?.params?.id;
  // Fixed-price flow: a customer's order on this listing is handled in Order Details,
  // not by manually cancelling / completing the listing here.
  const [openOrder, setOpenOrder] = useState(null);
  useEffect(() => {
    if (!productId) return;
    listShopBuyOrders()
      .then((rows) => setOpenOrder((Array.isArray(rows) ? rows : []).find((o) => o.productId === productId
        && ['PLACED', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'].includes(o.status)) || null))
      .catch(() => {});
  }, [productId]);
  const [item, setItem] = useState(route?.params?.listing || null);
  const [loading, setLoading] = useState(!route?.params?.listing);
  const [acting, setActing] = useState(false);
  const [viewer, setViewer] = useState(null); // photo index open full screen
  const [showDetails, setShowDetails] = useState(false); // device details collapsed under image + name
  // Customer buy orders for this listing (from the shop's chat) — Buyer Details.
  const [buyers, setBuyers] = useState([]);
  useEffect(() => {
    if (!item?.title) return undefined;
    let alive = true;
    loadChatBuyOrders().then((orders) => { if (alive) setBuyers(ordersForListing(orders, item)); });
    return () => { alive = false; };
  }, [item?.title]);

  const updateStatus = async (newStatus, prettyLabel) => {
    if (!productId) return;
    setActing(true);
    try {
      const res = await marketplaceApi.put(`/marketplace/products/${productId}`, { body: { status: newStatus } });
      setItem(res);
      // Sold / not sold → order confirmation in the buyer's Customer-app chat.
      const sent = await sendOrderOutcome(res || item, newStatus === 'SOLD');
      notify('Updated', `Listing marked as ${prettyLabel}.${sent ? ` Order ${newStatus === 'SOLD' ? 'confirmation' : 'update'} sent to ${sent} buyer${sent === 1 ? '' : 's'}.` : ''}`);
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
      <SellScreen divider title="Sell Device Details" onBack={() => navigation.goBack()} scroll={false}>
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={C.green} /></View>
      </SellScreen>
    );
  }
  if (!item) {
    return (
      <SellScreen divider title="Sell Device Details" onBack={() => navigation.goBack()} scroll={false}>
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ fontSize: 13, color: C.muted }}>Could not load this listing.</Text>
        </View>
      </SellScreen>
    );
  }

  let assessment = {};
  try { assessment = item.assessmentJson ? JSON.parse(item.assessmentJson) : {}; } catch (_) {}
  // Device Photos = the seller's uploaded condition photos (Front, Back, …).
  // imageUrl is the model's catalog image used for the card thumbnail, so it's
  // excluded from the gallery. Older listings without extraImageUrls fall back
  // to imageUrl as a single-entry gallery.
  const extras = (item.extraImageUrls || []).filter(Boolean);
  // Spare parts: imageUrl is the part's own first photo, so it leads the gallery.
  const isParts = item.descriptionType === 'SPARE_PARTS';
  const allPhotos = isParts ? [item.imageUrl, ...extras].filter(Boolean)
    : extras.length > 0 ? extras : (item.imageUrl ? [item.imageUrl] : []);
  const photoLabel = (i) => (isParts ? `Photo ${i + 1}` : PHOTO_LABELS[i] || `Photo ${i + 1}`);
  // Spare part saved with its group, source device and the seller's note
  // (older listings only carry the note in "group · part — note").
  const part = (assessment.spareParts || [])[0] || {};
  const partNote = String(part.note || (isParts ? String(item.description || '').split(' — ').slice(1).join(' — ') : '')).trim();
  const fromDevice = [assessment.device?.brandName, assessment.device?.modelName].filter(Boolean).join(' ');
  const orderId = item.id ? `GGFIX${String(item.id).slice(0, 12).toUpperCase().replace(/-/g, '')}` : '';
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = created ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const conditionText = isParts
    ? (assessment.workingCondition === 'DEAD' ? 'Spare Part · Dead / Unverified device' : 'Spare Part')
    : item.workingCondition === 'DEAD' ? 'Dead / Unknown' : (item.conditionLabel || 'Good');
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

  // Only action here: open the customer's order (confirm / assign / hand over happen there).
  const footer = openOrder ? (
    <TouchableOpacity
      onPress={() => navigation.navigate('SellBuyOrderDetail', { id: openOrder.id })}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={{ minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green }}
    >
      <Text className="font-extrabold" style={{ fontSize: 14, color: '#FFFFFF' }}>View Customer Order · {openOrder.orderNumber}</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <>
      <SellScreen divider title="Sell Device Details" subtitle={item.title || undefined} onBack={() => navigation.goBack()} footer={footer}>
        <View>
          {/* Status banner */}
          <View className="flex-row items-center" style={{ borderRadius: 16, padding: 12, marginBottom: 10, backgroundColor: meta.tint }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: meta.bg }}>
              <Ionicons name={meta.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-extrabold" style={{ fontSize: 15, color: meta.ink }} numberOfLines={2}>{meta.label}</Text>
              <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }} numberOfLines={1}>
                #{orderId}{dateLabel ? ` · ${dateLabel}` : ''}
              </Text>
            </View>
            {item.price != null ? (
              <Text className="font-extrabold" style={{ marginLeft: 8, flexShrink: 0, fontSize: 15, color: C.greenDark }} numberOfLines={1}>
                ₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            ) : null}
          </View>

          {/* Device card */}
          <Card style={cardStyle}>
            <View className="flex-row items-center">
              <View style={{ width: 84, height: 96, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.soft }}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={{ width: 78, height: 90 }} resizeMode="contain" />
                ) : (
                  <Ionicons name={isParts ? 'construct-outline' : 'phone-portrait-outline'} size={28} color="#9CA3AF" />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <Text className="font-extrabold" style={{ fontSize: 15, color: C.ink, lineHeight: 19 }} numberOfLines={2}>
                  {item.title || 'Device'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowDetails((v) => !v)}
                  accessibilityRole="button"
                  className="flex-row items-center"
                  style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.mint }}
                >
                  <Text className="font-bold" style={{ fontSize: 12, color: C.greenDark }}>{showDetails ? 'Hide details' : 'Show details'}</Text>
                  <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={14} color={C.greenDark} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>
            </View>

            {showDetails ? (
            <>
              <View style={{ marginTop: 10 }}>
                {isParts && part.group ? <IconRow icon="construct-outline" label="Part" value={part.group} /> : null}
                {isParts && fromDevice ? <IconRow icon="phone-portrait-outline" label="From" value={fromDevice} /> : null}
                {item.color ? <IconRow icon="color-palette-outline" label="Color" value={item.color} /> : null}
                {hasCategorySpecs(item) ? (
                  specDetailRows(item).map((r) => (
                    <IconRow key={r.key} icon="hardware-chip-outline" label={r.label} value={r.value} />
                  ))
                ) : (item.ramLabel || item.storageLabel) ? (
                  <IconRow icon="hardware-chip-outline" label="Storage" value={[item.ramLabel, item.storageLabel].filter(Boolean).join(' / ')} />
                ) : null}
                {!isParts ? <IconRow icon="shield-checkmark-outline" label="Condition" value={conditionText} /> : null}
                {descriptionText && !isParts ? <IconRow icon="document-text-outline" label="Listing" value={descriptionText} /> : null}
                {item.imei && imeiApplies(resolveSpecCategory(item.deviceCategory, item.categoryCode, item.categoryName)) ? <IconRow icon="barcode-outline" label="IMEI" value={item.imei} /> : null}
              </View>

            {/* Seller's condition note, full width under the details. */}
            {partNote ? (
              <View className="flex-row" style={{ marginTop: 12, borderRadius: 12, padding: 12, backgroundColor: C.mint, borderLeftWidth: 3, borderLeftColor: C.green }}>
                <Ionicons name="document-text-outline" size={16} color={C.green} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text className="font-extrabold" style={{ fontSize: 10.5, letterSpacing: 0.8, color: C.greenDark }}>CONDITION NOTE</Text>
                  <Text style={{ fontSize: 13, color: C.ink, lineHeight: 19, marginTop: 3 }}>{partNote}</Text>
                </View>
              </View>
            ) : null}

            {allPhotos.length > 0 ? (
              <>
                <View className="flex-row items-center" style={{ marginTop: 14, marginBottom: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.soft }}>
                  <Ionicons name="images-outline" size={15} color={C.green} />
                  <Text className="font-extrabold" style={{ marginLeft: 6, flex: 1, fontSize: 13, color: C.ink }}>{isParts ? 'Part Photos' : 'Device Photos'}</Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>Tap to view</Text>
                </View>
                <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                  {allPhotos.map((url, i) => (
                    <View key={i} style={{ width: '33.333%', padding: 4 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setViewer(i)}
                        accessibilityLabel={`View ${photoLabel(i)}`}
                        style={{ height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: C.page, borderWidth: 1, borderColor: C.soft }}
                      >
                        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'center', color: C.ink }} numberOfLines={1}>
                        {photoLabel(i)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            </>
            ) : null}
          </Card>

          {/* Device Summary */}
          {hasSummary && !isParts ? (
            <Card style={cardStyle}>
              <View className="flex-row items-center">
                <Ionicons name="reader-outline" size={16} color={C.green} />
                <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 13, color: C.ink }}>Device Summary</Text>
              </View>
              <SummaryGroup title="Screening Questions" rows={screening} />
              <SummaryGroup title="Screen" rows={conditions} />
              <SummaryGroup title="Accessories" rows={accessories} />
              <SummaryGroup title="Warranty" rows={warranty} />
            </Card>
          ) : null}

          {/* Buyer details — customer buy orders placed on this listing. */}
          {buyers.length ? (
            <Card style={cardStyle}>
              <Text className="font-extrabold" style={{ fontSize: 10.5, letterSpacing: 0.8, color: C.muted, marginBottom: 6 }}>BUYER DETAILS</Text>
              {buyers.map((b, i) => (
                <View key={b.key} className="flex-row" style={{ paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.soft }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Ionicons name="person-outline" size={15} color={C.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="font-bold" style={{ fontSize: 13, color: C.ink }}>{b.buyer || 'Customer'}{b.orderNo ? `  ·  ${b.orderNo}` : ''}</Text>
                    {b.phone ? <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{b.phone}</Text> : null}
                    {b.address ? <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{b.address}</Text> : null}
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {/* Sale outcome once it's a terminal state. */}
          {!isLive ? (() => {
            const sold = s === 'SOLD' || s === 'COMPLETED';
            const tone = sold ? C.green : C.red;
            const when = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            const amount = item.price != null ? `₹${Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '';
            return (
              <Card style={[cardStyle, { backgroundColor: sold ? C.mint : C.redTint, borderColor: sold ? C.mint : C.redTint }]}>
                <View className="flex-row items-center">
                  <Ionicons name={sold ? 'checkmark-circle' : 'close-circle'} size={26} color={tone} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                    <Text className="font-extrabold" style={{ fontSize: 14, color: tone }}>{sold ? 'Selling Completed' : 'Listing Cancelled'}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {[sold && amount ? `Sold for ${amount}` : null, when ? `${sold ? 'on' : 'Cancelled on'} ${when}` : null].filter(Boolean).join(' ')}
                    </Text>
                    {sold && buyers[0]?.buyer ? <Text style={{ fontSize: 12, color: C.ink, marginTop: 2 }} numberOfLines={1}>Buyer: {buyers[0].buyer}</Text> : null}
                  </View>
                </View>
              </Card>
            );
          })() : null}
        </View>
      </SellScreen>

      <ImageViewerModal
        visible={viewer != null}
        images={allPhotos.map((uri, i) => ({ uri, label: photoLabel(i) }))}
        index={viewer || 0}
        onClose={() => setViewer(null)}
      />
    </>
  );
}
