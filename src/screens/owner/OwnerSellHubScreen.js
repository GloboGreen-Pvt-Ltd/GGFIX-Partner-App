import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowRight, Bell, Box, ChevronRight, CirclePlus, MapPin, MessageSquareDot, Package, ShoppingCart,
} from 'lucide-react-native';
import { selectShopId, selectUserId } from '../../store/authSlice';
import { getBanners } from '../../api/masterData';
import { getSellSummary, listMyListings, listEnquiries } from '../../api/sellListings';
import { fetchNearbyListings, getListingOrigin } from '../../api/nearbyListings';
import { getCart } from '../../api/marketplace';
import { getUnreadCount } from '../../api/notifications';
import { HeaderIconButton, HEADER_FONT } from '../../components/PageHeader';
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
      style={{ width, minHeight: 112, borderRadius: 16, padding: 14, backgroundColor: tint, justifyContent: 'space-between' }}
    >
      <Icon size={24} color={iconColor} strokeWidth={1.9} />
      <Text numberOfLines={2} style={{ marginTop: 10, fontSize: rf(13.5), fontWeight: '800', color: C.text, lineHeight: rf(17) }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text style={{ flex: 1, fontSize: rf(20), fontWeight: '800', color: countColor }}>{count ?? '–'}</Text>
        <ChevronRight size={18} color={C.text} />
      </View>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
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
  const [cartCount, setCartCount] = useState(0);
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
    // Bell / cart badges: best effort, never block the page.
    Promise.all([getUnreadCount().catch(() => null), getCart().catch(() => null)]).then(([n, cart]) => {
      if (n != null) setUnread(Number(n) || 0);
      if (Array.isArray(cart)) setCartCount(cart.reduce((sum, it) => sum + (it.quantity || 1), 0));
    });
    // Customer sell requests (GET /marketplace/buy/nearby, sellerType CUSTOMER) —
    // the same feed as Customer Sell Leads, so new sales from the customer app show here.
    getListingOrigin()
      .then((origin) => fetchNearbyListings(origin))
      .then((rows) => setLeadCount(rows.filter((l) => l?.sellerType === 'CUSTOMER').length))
      .catch(() => setLeadCount(null));
    try {
      const [s, list] = await Promise.all([
        getSellSummary(ctx),
        listMyListings({ status: 'ALL', page: 0, size: 5 }, ctx),
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
          [...active.filter((b) => title(b) === 'sell').sort(bySort), ...active.filter((b) => title(b).startsWith('slider')).sort(bySort)]
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
  const cardGap = 12;
  const cardW = Math.floor((innerW - cardGap) / 2);
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

  const openListing = (p) => navigation.navigate('MarketplaceListingDetails', { productId: p.id, listing: p });

  const count = (v) => (loading && !summary ? null : v ?? null);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ---------- Header: title · notifications · cart ---------- */}
      <View style={[centered, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: padH, paddingTop: 10, paddingBottom: 4 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: HEADER_FONT.title, fontSize: rf(19), color: C.text }}>Sell on NearGFix</Text>
          <Text numberOfLines={1} style={{ fontFamily: HEADER_FONT.subtitle, fontSize: rf(12), color: C.muted, marginTop: 2 }}>Sell your device & spare parts</Text>
        </View>
        <HeaderIconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('OwnerNotifications')} badge={unread} badgeColor="#EF4444" />
        <View style={{ width: 6 }} />
        <HeaderIconButton icon={ShoppingCart} label="Cart" onPress={() => navigation.navigate('OwnerCart')} badge={cartCount} badgeColor="#F59E0B" badgeText={C.text} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: tabSpace + 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
      >
        <View style={[centered, { paddingHorizontal: padH }]}>
          {/* ---------- Search listings & enquiries ---------- */}
          <SearchInput value={query} onChangeText={setQuery} placeholder="Search your listings, enquiries..." style={{ marginTop: 10, height: 46, borderRadius: 14 }} />

          {!query.trim() ? (
            <>
              {/* ---------- Banner ---------- */}
              <View style={{ marginTop: 16, backgroundColor: C.teal, borderRadius: 18, overflow: 'hidden', flexDirection: 'row', minHeight: 152 }}>
                <View style={{ position: 'absolute', right: -40, top: -50, height: 170, width: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.07)' }} />
                <View style={{ position: 'absolute', right: 40, bottom: -70, height: 150, width: 150, borderRadius: 75, backgroundColor: 'rgba(1,172,119,0.22)' }} />
                <View style={{ flex: 1, paddingVertical: 16, paddingLeft: 16, paddingRight: 4, justifyContent: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: rf(19), fontWeight: '800', lineHeight: rf(24) }}>Sell Devices,{'\n'}Parts & More</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: rf(12), marginTop: 6, lineHeight: rf(17) }}>Reach verified buyers{'\n'}and get the best price.</Text>
                  <Pressable
                    onPress={() => navigation.navigate('SellListingType')}
                    accessibilityRole="button"
                    accessibilityLabel="Start selling"
                    className="active:opacity-90"
                    style={{ alignSelf: 'flex-start', marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <Text style={{ color: C.teal, fontSize: rf(12.5), fontWeight: '800', marginRight: 6 }}>Start Selling</Text>
                    <ArrowRight size={14} color={C.teal} />
                  </Pressable>
                </View>
                <View style={{ width: Math.min(150, innerW * 0.38), justifyContent: 'center', alignItems: 'center', paddingRight: 6 }}>
                  <Image resizeMethod="resize" source={{ uri: SELL_IMAGES.MOBILE }} style={{ width: '100%', height: 140 }} resizeMode="contain" accessibilityIgnoresInvertColors />
                </View>
              </View>

              {/* ---------- Add New Listing (single or bulk, chosen next) ---------- */}
              <Pressable
                onPress={() => navigation.navigate('SellListingType')}
                accessibilityRole="button"
                accessibilityLabel="Add new listing"
                className="active:opacity-90"
                style={{ marginTop: 16, height: 56, borderRadius: 16, backgroundColor: C.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <CirclePlus size={24} color={C.teal} fill="#FFFFFF" strokeWidth={2.2} />
                <Text style={{ color: '#FFFFFF', fontSize: rf(15.5), fontWeight: '800', marginLeft: 10 }}>Add New Listing</Text>
              </Pressable>

              {/* ---------- Dashboard ---------- */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: cardGap, rowGap: cardGap, marginTop: 16 }}>
                <StatCard width={cardW} Icon={Box} iconColor={C.teal} tint="#EDF6F7" title="My Listings" count={count(summary?.active)} onPress={() => navigation.navigate('SellMyListings', { initialStatus: 'ACTIVE' })} />
                {/* Buyer Enquiries: buyers' enquiries + price requests on this shop's listings. */}
                <StatCard width={cardW} Icon={MessageSquareDot} iconColor="#7C5CD6" tint="#F4F0FB" title={'Buyer\nEnquiries'} count={count(summary?.enquiriesOpen == null && summary?.purchaseRequestsOpen == null ? null : (summary?.enquiriesOpen || 0) + (summary?.purchaseRequestsOpen || 0))} onPress={() => navigation.navigate('SellEnquiries', {})} />
                {/* Quotation Requests: customers (customer app) asking shops to quote on their device. */}
                <StatCard width={cardW} Icon={MapPin} iconColor="#E08A1E" tint="#FFF5EA" title={'Quotation\nRequests'} count={leadCount} onPress={() => navigation.navigate('OwnerSellRequests')} />
                <StatCard width={cardW} Icon={Package} iconColor={C.green} tint="#EDF7F0" countColor={C.green} title={'Sold\nItems'} count={count(summary?.sold)} onPress={() => navigation.navigate('SellMyListings', { initialStatus: 'SOLD' })} />
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
                recent.map((p) => <ListingRow key={p.id} p={p} onPress={() => openListing(p)} />)
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

        {/* ---------- Offers (admin Sell / Slider banners) ---------- */}
        {!query.trim() && banners.length ? (
          <View style={centered}>
            <View style={{ paddingHorizontal: padH }}>
              <SectionTitle title="Offers" />
            </View>
            <ScrollView
              ref={bannerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onLayout={(e) => setBannerPageW(Math.round(e.nativeEvent.layout.width))}
              onMomentumScrollEnd={(e) => setBannerIndex(Math.round(e.nativeEvent.contentOffset.x / (pageW || 1)))}
            >
              {banners.map((b) => (
                <View key={b.key} style={{ width: pageW, paddingHorizontal: padH }}>
                  <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF' }}>
                    <Image resizeMethod="resize" source={{ uri: b.uri }} style={{ width: bannerW, height: bannerH }} resizeMode="contain" accessibilityLabel="Sell offer" />
                  </View>
                </View>
              ))}
            </ScrollView>
            {banners.length > 1 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                {banners.map((b, i) => (
                  <View key={b.key} style={{ height: 6, width: i === bannerIndex ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === bannerIndex ? C.teal : C.border }} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
