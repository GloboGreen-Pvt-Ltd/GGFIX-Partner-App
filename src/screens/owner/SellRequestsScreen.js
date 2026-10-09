import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, MapPin, Navigation, Phone, RefreshCw, Smartphone, Sparkles, User, X, Info, Send } from 'lucide-react-native';
import {
  getListingOrigin, fetchNearbyListings, NEARBY_RADIUS_KM,
  listingConditionLabel, listingCustomerName, toListingCard,
} from '../../api/nearbyListings';
import { normalizeDeviceImageUrl } from '../../utils/images';

/**
 * Sell Requests — customers near the shop who want to sell a device.
 *
 * Source: GET /marketplace/buy/nearby (same origin/radius rules as the Buy
 * screen, see api/nearbyListings), keeping only sellerType === 'CUSTOMER'.
 *
 * Quotation is intentionally NOT implemented: quotes belong to a Sell Order
 * (/sell-orders/{id}/quotations), and a marketplace listing carries no
 * sellOrderId. Nothing here guesses that link from sellerId / brandId /
 * modelId / product name / timestamps — the action stays disabled until the
 * backend returns the id on each listing.
 */

// GGFIX palette.
const ACCENT = '#09AD2A';       // fills, icons
const ACCENT_TEXT = '#078F23';  // green TEXT
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const SOFT_MINT = '#F8F8F8';
const PAGE_BG = '#F8F8F8';
const BORDER = '#E6E6E6';
const HAIR = '#F3F3F3';
const TEXT_PRIMARY = '#1E1E1E';
const TEXT_SECONDARY = '#6B6B6B';
const AMBER = '#8A6A00';        // yellow-palette TEXT
const AMBER_BG = '#FFF8E1';
const AMBER_LINE = '#F6DE8C';

const cardShadow = {
  shadowColor: '#1E1E1E',
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

/** A phone number only when the listing actually carries one — never guessed. */
function phoneOf(item) {
  const p = item?.contactPhone || item?.customerPhone || item?.sellerPhone || item?.phone || item?.mobile;
  return p && String(p).trim() ? String(p).trim() : null;
}

function priceInfo(item) {
  const n = item?.expectedPrice != null ? Number(item.expectedPrice) : null;
  if (n === 0) return { open: true, label: 'Open for quotation' };
  if (n != null && n > 0) return { open: false, label: `₹${n.toLocaleString('en-IN')}` };
  return { open: false, label: null };
}

function placeOf(item) {
  return [item?.city, item?.state].filter(Boolean).join(', ') || item?.address || null;
}

function distanceOf(item) {
  const d = item?.distanceKm != null ? Number(item.distanceKm) : null;
  if (d == null || !Number.isFinite(d)) return null;
  return `${d < 10 ? d.toFixed(1) : Math.round(d)} km`;
}

function DeviceImage({ uri, size, radius }) {
  const [broken, setBroken] = useState(false);
  const src = uri ? normalizeDeviceImageUrl(uri) : null;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HAIR, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {src && !broken ? (
        <Image source={{ uri: src }} style={{ width: Math.round(size * 0.86), height: Math.round(size * 0.86) }} resizeMode="contain" onError={() => setBroken(true)} />
      ) : (
        <Smartphone size={Math.round(size * 0.4)} color={ACCENT} />
      )}
    </View>
  );
}

function RequestCard({ item, onPress }) {
  const price = priceInfo(item);
  const place = placeOf(item);
  const distance = distanceOf(item);
  const condition = item.condition ? listingConditionLabel(item.condition) : null;
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: HAIR, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, flexDirection: 'row', alignItems: 'center', ...cardShadow }}
    >
      <DeviceImage uri={item.productImage} size={54} radius={12} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>
            {item.productName || 'Device'}
          </Text>
          {distance ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
              <Navigation size={10} color={ACCENT} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT_TEXT, marginLeft: 3 }}>{distance}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          <MapPin size={10} color={TEXT_SECONDARY} />
          <Text style={{ flex: 1, fontSize: 11, color: TEXT_SECONDARY, marginLeft: 3 }} numberOfLines={1}>
            {place || 'Location not shared'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 5, gap: 5 }}>
          {condition ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Sparkles size={9} color={ACCENT} />
              <Text style={{ fontSize: 10, fontWeight: '800', color: ACCENT_TEXT, marginLeft: 3 }} numberOfLines={1}>{condition}</Text>
            </View>
          ) : null}
          {price.label ? (
            price.open ? (
              <View style={{ backgroundColor: AMBER_BG, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: AMBER }}>{price.label}</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, fontWeight: '800', color: ACCENT_TEXT }}>Expected {price.label}</Text>
            )
          ) : null}
        </View>
      </View>
      <View style={{ height: 24, width: 24, borderRadius: 12, marginLeft: 6, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
        <ChevronRight size={14} color={ACCENT} />
      </View>
    </Pressable>
  );
}

/**
 * One sell request.
 *
 * Send Quote stays disabled: a quote belongs to a Sell Order
 * (/sell-orders/{id}/quotations) and a marketplace listing carries no
 * sellOrderId — nothing here guesses that link. What the sheet CAN do today is
 * open the full listing (photos and every detail) and call the customer when
 * the listing includes their number.
 */
function RequestDetailSheet({ item, onClose, onOpenDetails }) {
  if (!item) return null;
  const price = priceInfo(item);
  const place = placeOf(item);
  const distance = distanceOf(item);
  const phone = phoneOf(item);
  const customer = listingCustomerName(item);
  const condition = item.condition ? listingConditionLabel(item.condition) : null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(30,30,30,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: BORDER, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY }}>Sell Request</Text>
              <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} color={TEXT_PRIMARY} />
              </Pressable>
            </View>

            {/* Device + customer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 10, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE }}>
              <DeviceImage uri={item.productImage} size={64} radius={12} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={2}>{item.productName || 'Device'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <User size={11} color={TEXT_SECONDARY} />
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 4 }} numberOfLines={1}>{customer} · Customer listing</Text>
                </View>
                {price.label ? (
                  price.open ? (
                    <View style={{ alignSelf: 'flex-start', marginTop: 5, backgroundColor: AMBER_BG, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: AMBER }}>{price.label}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: '800', color: ACCENT_TEXT, marginTop: 4 }}>Expected {price.label}</Text>
                  )
                ) : null}
              </View>
            </View>

            {/* Details */}
            <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: HAIR, backgroundColor: '#FFFFFF' }}>
              {[
                ['Condition', condition],
                ['Location', place],
                ['Distance', distance],
                ['Phone', phone],
                ['Description', item.description],
              ]
                .filter(([, v]) => v)
                .map(([k, v], i, arr) => (
                  <View key={k} style={{ flexDirection: 'row', paddingHorizontal: 11, paddingVertical: 8, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: HAIR }}>
                    <Text style={{ width: 88, fontSize: 11, color: TEXT_SECONDARY, fontWeight: '600' }}>{k}</Text>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: TEXT_PRIMARY }}>{v}</Text>
                  </View>
                ))}
            </View>

            {/* Actions that work today */}
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <Pressable
                onPress={onOpenDetails}
                className="active:opacity-85"
                style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>View Full Details</Text>
                <ChevronRight size={15} color="#FFFFFF" style={{ marginLeft: 3 }} />
              </Pressable>
              {phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
                  className="active:opacity-85"
                  style={{ height: 42, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: ACCENT, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Phone size={14} color={ACCENT} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: ACCENT_TEXT, marginLeft: 5 }}>Call</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Quotation — disabled until the listing is linked to its Sell Order. */}
            <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: AMBER_BG, borderWidth: 1, borderColor: AMBER_LINE, borderRadius: 12, padding: 9 }}>
              <Info size={14} color={AMBER} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 11, color: AMBER, marginLeft: 7, lineHeight: 16 }}>
                Sending a quote for customer sell requests isn't switched on yet — it needs this request to be linked to its sell order on the GGFIX server.
              </Text>
            </View>
            <View
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              style={{ marginTop: 8, height: 42, borderRadius: 12, backgroundColor: '#F3F3F3', borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={14} color="#9A9A9A" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#9A9A9A', marginLeft: 6 }}>Send Quote</Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SellRequestsScreen({ navigation }) {
  const [origin, setOrigin] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const o = origin || (await getListingOrigin());
      if (!origin) setOrigin(o);
      const list = await fetchNearbyListings(o);
      setItems(list.filter((l) => l?.sellerType === 'CUSTOMER'));
    } catch (e) {
      setError(e?.message || 'Could not load sell requests.');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [origin]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nearest first; listings without a distance keep their API order at the end.
  const sorted = useMemo(() => {
    const withIdx = items.map((it, i) => ({ it, i }));
    withIdx.sort((a, b) => {
      const da = a.it.distanceKm != null ? Number(a.it.distanceKm) : Infinity;
      const db = b.it.distanceKm != null ? Number(b.it.distanceKm) : Infinity;
      return da - db || a.i - b.i;
    });
    return withIdx.map(({ it }) => it);
  }, [items]);

  const noLocation = origin && (origin.lat == null || origin.lng == null);

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={{ backgroundColor: '#FFFFFF', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.popTo('OwnerTabs', { screen: 'Home' }))}
              hitSlop={8}
              style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>Sell Requests</Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={1}>
                Customers selling devices within {NEARBY_RADIUS_KM} km
              </Text>
            </View>
            <Pressable
              onPress={() => load(true)}
              hitSlop={8}
              accessibilityLabel="Refresh"
              style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
            >
              <RefreshCw size={16} color={ACCENT} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it, i) => String(it.id ?? `req-${i}`)}
          renderItem={({ item }) => <RequestCard item={item} onPress={() => setSelected(item)} />}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ACCENT]} tintColor={ACCENT} />}
          ListHeaderComponent={
            noLocation ? (
              <View style={{ backgroundColor: AMBER_BG, borderWidth: 1, borderColor: AMBER_LINE, borderRadius: 12, padding: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, color: AMBER, lineHeight: 17 }}>
                  Your shop has no saved location, so these aren't filtered by distance. Add it in Shop Information to see requests near you.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                <Smartphone size={26} color={ACCENT} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: TEXT_PRIMARY, marginTop: 10, textAlign: 'center' }}>
                {error ? 'Could not load sell requests' : 'No sell requests nearby'}
              </Text>
              <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                {error ? `${error} Pull down to try again.` : `No customer is selling a device within ${NEARBY_RADIUS_KM} km right now. Pull down to refresh.`}
              </Text>
            </View>
          }
        />
      )}

      <RequestDetailSheet
        item={selected}
        onClose={() => setSelected(null)}
        onOpenDetails={() => {
          const listing = toListingCard(selected);
          setSelected(null);
          navigation.navigate('OwnerBuyListingDetails', { listing });
        }}
      />
    </View>
  );
}
