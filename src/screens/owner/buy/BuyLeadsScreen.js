import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Eye, FileText, MapPin, Search, Truck } from 'lucide-react-native';
import { fetchNearbyListings, getListingOrigin, listingConditionLabel } from '../../../api/nearbyListings';
import { getMyLeadQuote, listMyLeadQuotes, listShopPurchases } from '../../../api/orders';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, EmptyBox, ErrorBox, SearchInput, SellScreen, Thumb, money } from '../sell/kit';
import { BellButton } from './buyKit';

// Requests — customers nearby who want to sell a device (GET /marketplace/buy/nearby,
// sellerType CUSTOMER). Tabs: New · Quoted · Accepted · Closed (see requestBucket).

export const leadPrice = (l) => {
  const n = l?.expectedPrice != null ? Number(l.expectedPrice) : null;
  return n > 0 ? money(n) : null;
};
// Distance from the shop: computed from both coordinates when the shop origin
// is known; otherwise the server's distanceKm, but only when the listing has a
// location and the value is > 0 (a 0 from missing coordinates showed "0.0 km").
const toRad = (v) => (Number(v) * Math.PI) / 180;
export const leadDistance = (l, origin) => {
  const hasGeo = l?.latitude != null && l?.longitude != null;
  if (!hasGeo) return null;
  let d = l?.distanceKm != null ? Number(l.distanceKm) : null;
  if (origin?.lat != null && origin?.lng != null) {
    const dLat = toRad(l.latitude - origin.lat);
    const dLng = toRad(l.longitude - origin.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(origin.lat)) * Math.cos(toRad(l.latitude)) * Math.sin(dLng / 2) ** 2;
    d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  if (!(d > 0) || !Number.isFinite(d)) return null;
  if (d < 1) return `${Math.max(50, Math.round(d * 1000 / 10) * 10)} m away`;
  return `${d < 10 ? d.toFixed(1) : Math.round(d)} km away`;
};

function ActionIcon({ Icon, label, text, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? 'Available after the customer accepts your quote' : undefined}
      accessibilityState={{ disabled: !!disabled }}
      className="active:opacity-70"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 10, backgroundColor: disabled ? '#F3F4F6' : C.greenBg, opacity: disabled ? 0.55 : 1 }}
    >
      <Icon size={14} color={disabled ? C.faint : C.green} />
      <Text numberOfLines={1} style={{ marginLeft: 4, fontSize: rf(11), fontWeight: '800', color: disabled ? C.faint : C.green }}>{text}</Text>
    </Pressable>
  );
}

// Track: the purchase for this lead (or the one the accepted quote created).
export async function openPickupTracking(navigation, l, purchase) {
  try {
    const id = purchase?.id || (await getMyLeadQuote(l.id))?.purchaseOrderId;
    if (!id) { showToast({ type: 'info', title: 'No pickup yet', message: 'Tracking starts once the purchase is created.' }); return; }
    navigation.navigate('BuyPickupTracking', { id, order: purchase || undefined, leadRef: purchase?.orderNumber || '' });
  } catch (e) {
    showToast({ type: 'error', title: 'Could not open tracking', message: e?.message });
  }
}

// Lead row. With `navigation`, the right side carries View · Quotation · Pickup ·
// Track. Pickup and Track unlock only once the server reports the quote
// ACCEPTED (or a purchase exists for the lead).
export function LeadCard({ l, onPress, tag, navigation, quoteStatus, purchase }) {
  const price = leadPrice(l);
  const dist = leadDistance(l);
  const customer = l?.sellerType === 'CUSTOMER' || !l?.sellerType;
  const accepted = !!purchase || String(quoteStatus || '').toUpperCase() === 'ACCEPTED';
  const view = () => (navigation ? navigation.navigate('BuyLeadDetail', { lead: l, mode: 'detail' }) : onPress?.());
  const track = () => openPickupTracking(navigation, l, purchase);
  return (
    <Pressable onPress={onPress || view} accessibilityRole="button" accessibilityLabel={l.productName || 'Device'} className="active:opacity-90" style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Thumb uri={l.productImage} size={60} radius={10} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        {tag ? (
          <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: C.mint, marginBottom: 3 }}>
            <Text style={{ fontSize: rf(9.5), fontWeight: '800', color: C.teal }} numberOfLines={1}>{tag}</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{l.productName || 'Device'}</Text>
        <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.text, marginTop: 2 }}>
          Exp: <Text style={{ fontWeight: '800', color: price ? C.teal : C.amber }}>{price || 'Open for quote'}</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          {l.condition ? (
            <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: C.greenBg, marginRight: 6 }}>
              <Text style={{ fontSize: rf(9.5), fontWeight: '800', color: '#0B6B4B' }}>{listingConditionLabel(l.condition)}</Text>
            </View>
          ) : null}
          {dist ? (
            <>
              <MapPin size={11} color={C.muted} />
              <Text numberOfLines={1} style={{ fontSize: rf(10.5), color: C.muted, marginLeft: 2, flexShrink: 1 }}>{dist}</Text>
            </>
          ) : null}
        </View>
      </View>
      </View>
      {navigation ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <ActionIcon Icon={Eye} text="View" label="View product detail" onPress={view} />
          {customer ? (
            <>
              <ActionIcon Icon={FileText} text="Quote" label="Product quotation" onPress={() => navigation.navigate('BuyLeadDetail', { lead: l, mode: 'quote' })} />
              <ActionIcon Icon={Truck} text="Pickup" label="Pickup" disabled={!accepted} onPress={() => navigation.navigate('BuyLeadQuote', { lead: l })} />
              <ActionIcon Icon={MapPin} text="Track" label="Track pickup" disabled={!accepted} onPress={track} />
            </>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Requests list (this screen only) ─────────────────────────────────
// Tabs from the existing quote / purchase states (no new statuses):
//   New = no quote sent · Quoted = quote sent (PROPOSED) · Accepted = quote
//   accepted or purchase running · Closed = declined / expired / withdrawn,
//   or purchase completed / cancelled.
const REQ_TABS = [
  { key: 'NEW', label: 'New' },
  { key: 'QUOTED', label: 'Quoted' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'CLOSED', label: 'Closed' },
];
const REQ_BADGE = {
  NEW: { text: 'New', bg: '#E0F2FE', fg: '#0369A1' },
  QUOTED: { text: 'Quoted', bg: '#FEF3C7', fg: '#B45309' },
  ACCEPTED: { text: 'Accepted', bg: '#DCFCE7', fg: '#15803D' },
  CLOSED: { text: 'Closed', bg: '#F3F4F6', fg: '#4B5563' },
};
const TEAL = '#035C6C';

function requestBucket(quoteStatus, purchase) {
  if (purchase) {
    const s = String(purchase.status || '').toUpperCase();
    return s === 'COMPLETED' || s === 'CANCELLED' ? 'CLOSED' : 'ACCEPTED';
  }
  const q = String(quoteStatus || '').toUpperCase();
  if (q === 'ACCEPTED') return 'ACCEPTED';
  if (q === 'PROPOSED') return 'QUOTED';
  if (q === 'REJECTED' || q === 'EXPIRED' || q === 'WITHDRAWN') return 'CLOSED';
  return 'NEW';
}

const timeAgo = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
// "256 GB" from the listing's "colour · RAM / storage" description, if present.
const storageOf = (l) => {
  const parts = String(l?.description || '').split(/\s*[·|/,]\s*/).filter((s) => /\d+\s*(GB|TB)\b/i.test(s));
  return parts.length ? parts[parts.length - 1].trim() : null;
};

function MiniAction({ text, label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? 'Available after the customer accepts your quote' : undefined}
      accessibilityState={{ disabled: !!disabled }}
      className="active:opacity-70"
      style={{ paddingHorizontal: 10, height: 28, borderRadius: 999, justifyContent: 'center', marginRight: 6, backgroundColor: disabled ? '#F3F4F6' : '#E5F3F5', opacity: disabled ? 0.6 : 1 }}
    >
      <Text numberOfLines={1} style={{ fontSize: rf(11), fontWeight: '800', color: disabled ? C.faint : TEAL }}>{text}</Text>
    </Pressable>
  );
}

// Compact request card: image · name · storage • Customer Request · Expected price ·
// status badge · time. Tap = View; Quote · Pickup · Track kept as small actions.
function RequestCard({ l, bucket, navigation, quoteStatus, purchase }) {
  const price = leadPrice(l);
  const storage = storageOf(l);
  const badge = REQ_BADGE[bucket];
  const accepted = !!purchase || String(quoteStatus || '').toUpperCase() === 'ACCEPTED';
  const view = () => navigation.navigate('BuyLeadDetail', { lead: l, mode: 'detail' });
  return (
    <Pressable onPress={view} accessibilityRole="button" accessibilityLabel={l.productName || 'Device'} className="active:opacity-90"
      style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#EEF0F2', padding: 12, marginBottom: 12, shadowColor: '#111111', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Thumb uri={l.productImage} size={76} radius={14} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(15.5), fontWeight: '800', color: C.text }}>{l.productName || 'Device'}</Text>
            <View style={{ marginLeft: 6, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: badge.bg }}>
              <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: badge.fg }}>{badge.text}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={{ marginTop: 3, fontSize: rf(12), color: C.muted }}>
            {[storage, 'Customer Request'].filter(Boolean).join('  •  ')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(12.5), color: C.text }}>
              Expected: <Text style={{ fontWeight: '800', color: price ? C.text : C.amber }}>{price || 'Open for quote'}</Text>
            </Text>
            <ChevronRight size={18} color={C.text} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <MiniAction text="Quote" label="Product quotation" onPress={() => navigation.navigate('BuyLeadDetail', { lead: l, mode: 'quote' })} />
        <MiniAction text="Pickup" label="Pickup" disabled={!accepted} onPress={() => navigation.navigate('BuyLeadQuote', { lead: l })} />
        <MiniAction text="Track" label="Track pickup" disabled={!accepted} onPress={() => openPickupTracking(navigation, l, purchase)} />
        <View style={{ flex: 1 }} />
        <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted }}>{timeAgo(l.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function BuyLeadsScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('NEW');
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quotes, setQuotes] = useState({}); // listingId → my quote row (quotationStatus)
  const [buys, setBuys] = useState({}); // listingId → purchase (exists once accepted)

  const load = useCallback(async () => {
    try {
      const origin = await getListingOrigin();
      const list = await fetchNearbyListings(origin);
      setRows(list.filter((l) => l?.sellerType === 'CUSTOMER'));
      const byListing = (rows) => Object.fromEntries((rows || []).filter((r) => r?.listingId).map((r) => [String(r.listingId), r]));
      listMyLeadQuotes().then((r) => setQuotes(byListing(r))).catch(() => {});
      listShopPurchases().then((r) => setBuys(byListing(r))).catch(() => {});
      setError(null);
    } catch (e) {
      setError(e?.message || 'Could not load customer sell leads.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const bucketOf = useCallback((l) => requestBucket(quotes[String(l.id)]?.quotationStatus, buys[String(l.id)]), [quotes, buys]);
  const needle = q.trim().toLowerCase();
  const searched = useMemo(() => rows.filter((l) => !needle || [l.productName, l.city, l.description, l.condition].some((v) => String(v || '').toLowerCase().includes(needle))), [rows, needle]);
  const shown = useMemo(
    () => searched.filter((l) => bucketOf(l) === tab).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [searched, bucketOf, tab],
  );
  const countOf = (k) => searched.filter((l) => bucketOf(l) === k).length;

  const right = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable onPress={() => setSearchOpen((v) => { if (v) setQ(''); return !v; })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Search" className="active:opacity-70" style={{ height: 36, width: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Search size={21} color={C.text} />
      </Pressable>
      <BellButton navigation={navigation} />
    </View>
  );

  return (
    <SellScreen title="Requests" subtitle="Customer device requests" onBack={() => navigation.goBack()} right={right} rightWidth={80} scroll={false}>
      <FlatList
        data={shown}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={(
          <View>
            {searchOpen ? <SearchInput value={q} onChangeText={setQ} placeholder="Search requests (device, area...)" style={{ marginTop: 4 }} /> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12 }}>
              {REQ_TABS.map((t) => {
                const on = tab === t.key;
                return (
                  <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} className="active:opacity-80"
                    style={{ height: 40, paddingHorizontal: 16, marginRight: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? TEAL : '#FFFFFF', borderWidth: 1, borderColor: on ? TEAL : C.border }}>
                    <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>{`${t.label} (${countOf(t.key)})`}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {error ? <ErrorBox message={error} onRetry={() => { setLoading(true); load(); }} style={{ marginBottom: 10 }} /> : null}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
        ListEmptyComponent={loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : (
          <EmptyBox title={needle ? 'No matching requests' : `No ${REQ_BADGE[tab].text.toLowerCase()} requests`} sub="Customers near your shop who want to sell a device appear here." />
        )}
        renderItem={({ item }) => (
          <RequestCard l={item} bucket={bucketOf(item)} navigation={navigation} quoteStatus={quotes[String(item.id)]?.quotationStatus} purchase={buys[String(item.id)]} />
        )}
      />
    </SellScreen>
  );
}
