import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowRight, Bell, Check, Box, ChevronRight, CirclePlus, MapPin, MessageSquareDot, Package, ShoppingBag, Store, Truck, LayoutList,
} from 'lucide-react-native';
import { listShopBuyOrders } from '../../api/buyOrders';
import { selectSession } from '../../store/authSlice';
import { selectShopId, selectUserId } from '../../store/authSlice';
import { getBanners } from '../../api/masterData';
import { getSellSummary, listMyListings, listEnquiries } from '../../api/sellListings';
import { fetchNearbyListings, getListingOrigin } from '../../api/nearbyListings';
import { getUnreadCount } from '../../api/notifications';
import PageHeader, { HeaderIconButton, HEADER_FONT } from '../../components/PageHeader';
import { rf } from '../../utils/responsive';
import { useTabBarSpace } from '../../navigation/tabBarMetrics';
import { C, ErrorBox, SearchInput, StatusPill, Thumb, listingImage, listingSub, money } from './sell/kit';

// Sell Home (Sell tab) — the shop's selling dashboard: search, start a listing
// (single or bulk, chosen on the next screen), counters for listings /
// enquiries / price requests / sold items, latest listings and admin offers. Counts are server data.

const MAX_W = 760;

// Sell-specific category art, used when the admin's SELL Category Menu has
// no image for a category (the shared category image is also Repair's).
const SELL_IMAGES = {
  MOBILE: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Phone.png',
  SMARTPHONE: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Phone.png',
  LAPTOP: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Laptop.png',
  SMARTWATCH: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-smartWatch.png',
  SMARTWATCHES: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-smartWatch.png',
  TABLET: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Tablet.png',
  AUDIO: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-AudioDevice.png',
  AUDIO_DEVICE: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-AudioDevice.png',
  AUDIO_DEVICES: 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-AudioDevice.png',
};

function imgUri(item) {
  if (!item) return null;
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native. Press feedback
// uses the `active:` className.

// Dashboard counter: tinted card · icon · title · count + chevron.
function StatCard({ Icon, iconColor, tint, title, count, countColor = C.text, onPress, width }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${title}, ${count}` : title}
      className="active:opacity-90"
      style={{ width, minHeight: 84, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, backgroundColor: tint, alignItems: 'center' }}
    >
      <Icon size={18} color={iconColor} strokeWidth={2} />
      <Text style={{ marginTop: 4, fontSize: rf(16), fontWeight: '800', color: countColor }}>{count ?? '–'}</Text>
      <Text numberOfLines={2} style={{ marginTop: 2, fontSize: rf(10), fontWeight: '700', color: C.text, lineHeight: rf(12.5), textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}

function ListingRow({ p, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={p.title || 'Listing'}
      className="active:opacity-90"
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 }}
    >
      <Thumb uri={listingImage(p)} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{p.title || 'Listing'}</Text>
        <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{listingSub(p)}</Text>
        {p.price != null ? <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.teal, marginTop: 3 }}>{money(p.price)}</Text> : null}
      </View>
      <StatusPill status={p._status} style={{ marginLeft: 8, alignSelf: 'center' }} />
    </Pressable>
  );
}

// Recent Listings grid tile: image · title · price · condition · status.
function ListingTile({ p, onPress, width }) {
  const img = listingImage(p);
  const st = String(p._status || p.status || '').toUpperCase();
  const label = st ? st.charAt(0) + st.slice(1).toLowerCase() : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={p.title || 'Listing'}
      className="active:opacity-90"
      style={{ width, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', padding: 8 }}
    >
      <View style={{ height: 104, borderRadius: 12, backgroundColor: C.field, alignItems: 'center', justifyContent: 'center' }}>
        {img ? <Image resizeMethod="resize" source={{ uri: img }} style={{ width: '80%', height: 96 }} resizeMode="contain" /> : <Package size={26} color={C.muted} />}
        {label ? (
          <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#01AC77', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Check size={11} color="#FFFFFF" strokeWidth={3} />
            <Text style={{ marginLeft: 3, fontSize: rf(10), fontWeight: '800', color: '#FFFFFF' }}>{label}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: 8 }}>{p.title || 'Listing'}</Text>
      {p.price != null ? <Text style={{ fontSize: rf(15), fontWeight: '800', color: '#01AC77', marginTop: 2 }}>{money(p.price)}</Text> : null}
      <Text numberOfLines={1} style={{ fontSize: rf(10.5), color: C.muted, marginTop: 2 }}>{p.conditionLabel || listingSub(p)}</Text>
      {label ? (
        <View style={{ marginTop: 8, height: 28, borderRadius: 999, backgroundColor: '#E6F7F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={13} color="#01AC77" strokeWidth={3} />
          <Text style={{ marginLeft: 4, fontSize: rf(11.5), fontWeight: '800', color: '#01AC77' }}>{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function EnquiryRow({ e, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="active:opacity-90"
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 }}
    >
      <Thumb uri={e.product?.imageUrl} size={44} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{e.buyer?.name || 'Buyer'}</Text>
        <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{e.product?.title || ''}{e.message ? ` · ${e.message}` : ''}</Text>
      </View>
      <StatusPill status={e.status} style={{ marginLeft: 8, alignSelf: 'center' }} />
    </Pressable>
  );
}

function SectionTitle({ title, sub, action, onAction }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingLeft: 8 }}>
          <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.teal }}>{action}</Text>
          <ChevronRight size={14} color={C.teal} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function OwnerSellHubScreen({ navigation }) {
  // The tab bar floats over the page; keep the last items clear of it.
  const tabSpace = useTabBarSpace();
  const { width } = useWindowDimensions();
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const ctx = useMemo(() => ({ shopId, userId }), [shopId, userId]);

  const [summary, setSummary] = useState(null);
  const [leadCount, setLeadCount] = useState(null);
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // { listings, enquiries, enquiriesNote }
  const [searching, setSearching] = useState(false);

  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerRatio, setBannerRatio] = useState(2.4);
  const [bannerPageW, setBannerPageW] = useState(0);
  const bannerRef = useRef(null);

  const load = useCallback(async () => {
    // Bell badge: best effort, never block the page.
    getUnreadCount().then((n) => { if (n != null) setUnread(Number(n) || 0); }).catch(() => {});
    // Customer sell requests (GET /marketplace/buy/nearby, sellerType CUSTOMER) —
    // the same feed as Customer Sell Leads, so new sales from the customer app show here.
    getListingOrigin()
      .then((origin) => fetchNearbyListings(origin))
      .then((rows) => setLeadCount(rows.filter((l) => l?.sellerType === 'CUSTOMER').length))
      .catch(() => setLeadCount(null));
    try {
      const [s, list] = await Promise.all([
        getSellSummary(ctx),
        listMyListings({ status: 'ALL', page: 0, size: 6 }, ctx),
      ]);
      setSummary(s);
      setRecent(list.content || []);
      setError(null);
    } catch (e) {
      // Keep what was loaded before; say why it may be stale.
      setError(e?.message || 'Could not load your selling data.');
    } finally {
      setLoading(false);
    }
  }, [ctx]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Customer buy orders: Orders = new ones to confirm; Assign Pickup = confirmed home deliveries without an employee.
  const [orderCounts, setOrderCounts] = useState(null);
  const [buyOrders, setBuyOrders] = useState([]);
  useFocusEffect(useCallback(() => {
    listShopBuyOrders()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setBuyOrders(list);
        setOrderCounts({
          fresh: list.filter((o) => o.status === 'PLACED').length,
          assign: list.filter((o) => o.fulfilmentType === 'HOME_DELIVERY' && ['CONFIRMED', 'DELIVERY_FAILED'].includes(o.status)).length,
        });
      })
      .catch(() => setOrderCounts(null));
  }, []));
  const session = useSelector(selectSession);
  const shopName = session?.shopName || session?.shops?.find?.((x) => x.isActive)?.name || 'My Shop';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Search: listings server-side (q), enquiries by buyer / product / message.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setSearching(false); return undefined; }
    setSearching(true);
    let alive = true;
    const t = setTimeout(async () => {
      const needle = q.toLowerCase();
      const [listRes, enqRes] = await Promise.allSettled([
        listMyListings({ status: 'ALL', q, page: 0, size: 20 }, ctx),
        listEnquiries({ status: 'ALL', page: 0, size: 50 }),
      ]);
      if (!alive) return;
      const enquiries = enqRes.status === 'fulfilled'
        ? (enqRes.value?.content || []).filter((e) => [e.buyer?.name, e.product?.title, e.message].some((v) => String(v || '').toLowerCase().includes(needle)))
        : null;
      setResults({
        listings: listRes.status === 'fulfilled' ? listRes.value.content || [] : null,
        listingsError: listRes.status === 'rejected' ? (listRes.reason?.message || 'Search failed.') : null,
        enquiries,
        enquiriesNote: enqRes.status === 'rejected' ? (enqRes.reason?.message || 'Enquiries could not be searched.') : null,
      });
      setSearching(false);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [query, ctx]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getBanners().catch(() => []);
        // Offers: the admin "Sell" banner(s) first, then the general "Slider" banners.
        const active = (rows || []).filter((b) => b.isActive !== false);
        const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        const title = (b) => String(b.title || '').trim().toLowerCase();
        setBanners(
          // Sell banners only (admin banners titled Sell / Selling…).
          active.filter((b) => title(b).startsWith('sell')).sort(bySort)
            .map((b) => ({ key: String(b.id), uri: imgUri(b) }))
            .filter((b) => b.uri),
        );
      } catch (_) {}
    })();
  }, []);

  // Frame the carousel at the first banner's real ratio so no edge is cut.
  useEffect(() => {
    const first = banners[0]?.uri;
    if (!first) return;
    Image.getSize(first, (w, h) => { if (w > 0 && h > 0) setBannerRatio(Math.min(3.2, Math.max(1.5, w / h))); }, () => {});
  }, [banners]);

  const contentW = Math.min(width, MAX_W);
  const padH = width >= 768 ? 24 : 16;
  const innerW = contentW - padH * 2;
  const cardGap = 8;
  const cardW = Math.floor((innerW - cardGap * 3) / 4); // four stat cards in one row
  const tileW = Math.floor((innerW - 10) / 2); // two-column Recent Listings
  const pageW = bannerPageW || contentW;
  const bannerW = pageW - padH * 2;
  const bannerH = Math.round(bannerW / bannerRatio);
  const centered = { width: '100%', maxWidth: MAX_W, alignSelf: 'center' };

  // Auto-advance the carousel every 3.5s when there's more than one banner.
  useEffect(() => {
    if (banners.length <= 1) return undefined;
    const id = setInterval(() => {
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        bannerRef.current?.scrollTo({ x: next * pageW, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(id);
  }, [banners.length, pageW]);

  // A listing a customer has ordered opens that order; any other listing opens
  // its listing details screen (same as My Listings → View).
  const OPEN = ['PLACED', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'];
  const openListing = (p) => {
    const order = buyOrders.find((o) => o.productId === p.id && OPEN.includes(o.status));
    if (order) { navigation.navigate('SellBuyOrderDetail', { id: order.id }); return; }
    navigation.navigate('MarketplaceListingDetails', { productId: p.id, listing: p });
  };

  const count = (v) => (loading && !summary ? null : v ?? null);

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ---------- Header: same as Buy home (title · subtitle · bell) ---------- */}
      <PageHeader
        title="Sell"
        subtitle={shopName}
        sideWidth={90}
        right={<HeaderIconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('OwnerNotifications')} badge={unread} badgeColor="#EF4444" />}
      />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: tabSpace + 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
      >
        <View style={[centered, { paddingHorizontal: padH }]}>
          {!query.trim() ? (
            <>
              {/* ---------- Banner: admin Sell / Slider banners from the database ---------- */}
              {banners.length ? (
                <View style={{ marginTop: 8 }}>
                  <ScrollView
                    ref={bannerRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onLayout={(e) => setBannerPageW(Math.round(e.nativeEvent.layout.width))}
                    onMomentumScrollEnd={(e) => setBannerIndex(Math.round(e.nativeEvent.contentOffset.x / (pageW || 1)))}
                  >
                    {banners.map((b) => (
                      <View key={b.key} style={{ width: pageW }}>
                        <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF' }}>
                          <Image resizeMethod="resize" source={{ uri: b.uri }} style={{ width: pageW - 2, height: Math.round((pageW - 2) / bannerRatio) }} resizeMode="contain" accessibilityLabel="Sell banner" />
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                  {banners.length > 1 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}>
                      {banners.map((b, i) => <View key={b.key} style={{ height: 6, width: i === bannerIndex ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === bannerIndex ? C.green : C.border }} />)}
                    </View>
                  ) : null}
                </View>
              ) : (
              // Built-in Sell banner (until an admin "Sell" banner exists).
              <Pressable onPress={() => navigation.navigate('SellListingType')} accessibilityRole="button" accessibilityLabel="Start selling"
                style={{ marginTop: 8, borderRadius: 22, overflow: 'hidden', backgroundColor: '#035C6C', padding: 18, flexDirection: 'row', alignItems: 'center', minHeight: 168 }}>
                <View style={{ position: 'absolute', right: -50, top: -30, height: 220, width: 220, borderRadius: 110, backgroundColor: 'rgba(1,172,119,0.35)' }} />
                <View style={{ position: 'absolute', right: 20, bottom: -60, height: 140, width: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: rf(22), lineHeight: rf(27), fontWeight: '800' }}>Buy & Sell</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: rf(22), lineHeight: rf(27), fontWeight: '800' }}>with <Text style={{ color: '#5BE3A8' }}>NearGFix</Text></Text>
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: rf(11.5), marginTop: 6, lineHeight: rf(16) }}>List Devices, Manage Orders & Deliver to Customers</Text>
                  <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: 12, height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#FFFFFF' }}>
                    <Text style={{ color: C.text, fontSize: rf(12.5), fontWeight: '800' }}>Start Selling</Text>
                    <ArrowRight size={15} color={C.text} style={{ marginLeft: 6 }} />
                  </View>
                </View>
                <Image resizeMethod="resize" source={{ uri: SELL_IMAGES.MOBILE }} style={{ width: '34%', height: 130 }} resizeMode="contain" accessibilityIgnoresInvertColors />
              </Pressable>
              )}

              {/* ---------- 2 x 2 actions ---------- */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10, marginTop: 12 }}>
                {[
                  { key: 'add', title: 'Add Listing', sub: 'List your device for sale', Icon: CirclePlus, bg: '#ECF8F3', ring: '#D3F0E3', fg: '#01AC77', onPress: () => navigation.navigate('SellListingType') },
                  { key: 'mine', title: 'My Listings', sub: 'View & manage your listings', Icon: LayoutList, bg: '#EEF3FD', ring: '#DCE6FB', fg: '#2F6FE0', count: count(summary?.active), badge: '#2F6FE0', onPress: () => navigation.navigate('SellMyListings', { initialStatus: 'ALL' }) },
                  { key: 'orders', title: 'Orders', sub: 'View your orders', Icon: ShoppingBag, bg: '#FFF2EC', ring: '#FFE1D3', fg: '#F2622E', count: orderCounts?.fresh ?? null, badge: '#EF4444', onPress: () => navigation.navigate('SellBuyOrders') },
                  { key: 'assign', title: 'Assign Pickup', sub: 'Schedule pickup for orders', Icon: Truck, bg: '#F2F0FD', ring: '#E2DDFA', fg: '#5B47D6', count: orderCounts?.assign ?? null, badge: '#01AC77', onPress: () => navigation.navigate('SellBuyAssignList') },
                ].map((t) => (
                  <Pressable key={t.key} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.count != null ? `${t.title}, ${t.count}` : t.title} className="active:opacity-85"
                    style={{ width: tileW, minHeight: 124, borderRadius: 18, borderWidth: 1, borderColor: t.ring, backgroundColor: t.bg, padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <View style={{ height: 46, width: 46, borderRadius: 23, backgroundColor: t.ring, alignItems: 'center', justifyContent: 'center' }}>
                        <t.Icon size={22} color={t.fg} strokeWidth={2.4} />
                      </View>
                      {t.count != null ? (
                        <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: t.badge, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: '#FFFFFF' }}>{t.count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: rf(14.5), fontWeight: '800', color: C.text, marginTop: 8 }}>{t.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(11), color: C.muted, marginTop: 2 }}>{t.sub}</Text>
                      <View style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                        <ChevronRight size={15} color={C.text} />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {error ? <ErrorBox message={error} onRetry={() => { setLoading(true); load(); }} /> : null}

          {query.trim() ? (
            <View>
              {searching && !results ? <ActivityIndicator color={C.teal} style={{ marginVertical: 16 }} /> : null}
              {results ? (
                <>
                  <SectionTitle title="Listings" sub={results.listings ? `${results.listings.length} found` : null} />
                  {results.listingsError ? <ErrorBox message={results.listingsError} /> : null}
                  {results.listings?.length
                    ? results.listings.map((p) => <ListingRow key={p.id} p={p} onPress={() => openListing(p)} />)
                    : results.listings ? <Text style={{ fontSize: rf(12), color: C.muted }}>No listings match your search.</Text> : null}
                  <SectionTitle title="Enquiries" sub={results.enquiries ? `${results.enquiries.length} found` : null} />
                  {results.enquiriesNote ? <ErrorBox tone="warning" message={results.enquiriesNote} /> : null}
                  {results.enquiries?.length
                    ? results.enquiries.map((e) => <EnquiryRow key={e.id} e={e} onPress={() => navigation.navigate('SellEnquiryDetail', { enquiryId: e.id })} />)
                    : results.enquiries ? <Text style={{ fontSize: rf(12), color: C.muted }}>No enquiries match your search.</Text> : null}
                </>
              ) : null}
            </View>
          ) : (
            <>
              {/* ---------- Recent listings ---------- */}
              <SectionTitle title="Recent Listings" sub="Devices and parts you've listed" action={recent.length ? 'See All' : null} onAction={() => navigation.navigate('SellMyListings', { initialStatus: 'ALL' })} />
              {loading && !recent.length ? (
                <ActivityIndicator color={C.teal} style={{ marginVertical: 16 }} />
              ) : recent.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10 }}>
                  {recent.map((p) => <ListingTile key={p.id} p={p} width={tileW} onPress={() => openListing(p)} />)}
                </View>
              ) : !error ? (
                <View style={{ alignItems: 'center', backgroundColor: C.field, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 16 }}>
                  <Package size={22} color={C.teal} />
                  <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: 8 }}>No listings yet</Text>
                  <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2, textAlign: 'center' }}>Tap Add New Listing to list your first device or part.</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
