import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Navigation, RefreshCw, Smartphone, Sparkles, User, X, AlertTriangle } from 'lucide-react-native';
import { getListingOrigin, fetchNearbyListings, NEARBY_RADIUS_KM } from '../../api/nearbyListings';
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

const ACCENT = '#004C40';
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FAF9';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const AMBER = '#B45309';
const AMBER_BG = '#FFF3CD';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const QUOTE_BLOCKED = 'Backend sellOrderId link required.';

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
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: MINT, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {src && !broken ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setBroken(true)} />
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
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', ...cardShadow }}
    >
      <DeviceImage uri={item.productImage} size={60} radius={12} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>
            {item.productName || 'Device'}
          </Text>
          {distance ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
              <Navigation size={11} color={ACCENT} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT, marginLeft: 3 }}>{distance}</Text>
            </View>
          ) : null}
        </View>
        {item.condition ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: SOFT_MINT, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
            <Sparkles size={10} color={ACCENT} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: ACCENT, marginLeft: 3 }} numberOfLines={1}>{item.condition}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <MapPin size={11} color={TEXT_SECONDARY} />
          <Text style={{ flex: 1, fontSize: 12, color: TEXT_SECONDARY, marginLeft: 3 }} numberOfLines={1}>
            {place || 'Location not shared'}
          </Text>
        </View>
        {price.label ? (
          price.open ? (
            <View style={{ alignSelf: 'flex-start', backgroundColor: AMBER_BG, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 5 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: AMBER }}>{price.label}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 13, fontWeight: '800', color: ACCENT, marginTop: 4 }}>
              Expected {price.label}
            </Text>
          )
        ) : null}
      </View>
    </Pressable>
  );
}

function RequestDetailSheet({ item, onClose }) {
  if (!item) return null;
  const price = priceInfo(item);
  const place = placeOf(item);
  const distance = distanceOf(item);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(16,24,20,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: BORDER, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: TEXT_PRIMARY }}>Sell Request</Text>
              <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: SOFT_MINT, alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} color={TEXT_PRIMARY} />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <DeviceImage uri={item.productImage} size={84} radius={14} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={2}>{item.productName || 'Device'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <User size={12} color={TEXT_SECONDARY} />
                  <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginLeft: 4 }}>Customer listing</Text>
                </View>
                {price.label ? (
                  <Text style={{ fontSize: 13, fontWeight: '800', color: price.open ? AMBER : ACCENT, marginTop: 4 }}>
                    {price.open ? price.label : `Expected ${price.label}`}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: BORDER }}>
              {[
                ['Condition', item.condition],
                ['Location', place],
                ['Distance', distance],
                ['Description', item.description],
              ]
                .filter(([, v]) => v)
                .map(([k, v], i, arr) => (
                  <View key={k} style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: BORDER }}>
                    <Text style={{ width: 96, fontSize: 12, color: TEXT_SECONDARY }}>{k}</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY }}>{v}</Text>
                  </View>
                ))}
            </View>

            {/* Quotation: deliberately unimplemented until the listing carries its Sell Order id. */}
            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: AMBER_BG, borderRadius: 12, padding: 10 }}>
              <AlertTriangle size={16} color={AMBER} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12.5, color: '#7C4A03', marginLeft: 8, lineHeight: 18 }}>
                Quotation is not available yet. {QUOTE_BLOCKED}
              </Text>
            </View>
            <View
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              style={{ marginTop: 12, height: 48, borderRadius: 14, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#9CA3AF' }}>Send Quote</Text>
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
        <View style={{ backgroundColor: '#FFFFFF', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
              hitSlop={8}
              style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>Sell Requests</Text>
              <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={1}>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ACCENT]} tintColor={ACCENT} />}
          ListHeaderComponent={
            noLocation ? (
              <View style={{ backgroundColor: AMBER_BG, borderRadius: 12, padding: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, color: '#7C4A03', lineHeight: 17 }}>
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
              <Text style={{ fontSize: 14, fontWeight: '800', color: TEXT_PRIMARY, marginTop: 10, textAlign: 'center' }}>
                {error ? 'Could not load sell requests' : 'No sell requests nearby'}
              </Text>
              <Text style={{ fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                {error ? `${error} Pull down to try again.` : `No customer is selling a device within ${NEARBY_RADIUS_KM} km right now. Pull down to refresh.`}
              </Text>
            </View>
          }
        />
      )}

      <RequestDetailSheet item={selected} onClose={() => setSelected(null)} />
    </View>
  );
}
