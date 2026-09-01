import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  ShieldCheck,
  ScanSearch,
  IndianRupee,
  Package,
  Tag,
  Users,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { EmptyState, Loader } from '../../components/rnr';
import { getDeviceCategories, getBanners } from '../../api/masterData';
import { marketplaceApi } from '../../api/client';
import { resolveDeviceImageSource } from '../../utils/images';
import { selectShopId, selectUserId } from '../../store/authSlice';

// Mirrors the customer SellHomeScreen palette + layout so both apps speak the
// same visual language for the "Sell" flow. Routes into the OWNER_LIST flow
// (SelectBrand) and swaps the customer's notification chip for "My Listings".
const GREEN       = '#004C40';
const GREEN_DARK  = '#004C40';

const CODE_META = {
  MOBILE:        { emoji: '📱', sub: 'Smartphones' },
  SMARTPHONE:    { emoji: '📱', sub: 'Smartphones' },
  LAPTOP:        { emoji: '💻', sub: 'Laptops & Notebooks' },
  SMARTWATCH:    { emoji: '⌚', sub: 'Smart Watches' },
  SMARTWATCHES:  { emoji: '⌚', sub: 'Smart Watches' },
  TABLET:        { emoji: '📲', sub: 'Tablets & iPads' },
  AUDIO:         { emoji: '🎧', sub: 'Audio, Wearables & more' },
  AUDIO_DEVICES: { emoji: '🎧', sub: 'Audio, Wearables & more' },
  ACCESSORY:     { emoji: '🎧', sub: 'Audio, Wearables & more' },
  ACCESSORIES:   { emoji: '🎧', sub: 'Audio, Wearables & more' },
  SPARE:         { emoji: '🔧', sub: 'Parts & Components' },
  SPARES:        { emoji: '🔧', sub: 'Parts & Components' },
  SPEAKER:       { emoji: '🔈', sub: 'Speakers' },
};
const DEFAULT_META = { emoji: '📦', sub: 'Devices' };
function metaFor(code) { return CODE_META[String(code || '').toUpperCase()] || DEFAULT_META; }

function imgUri(item) {
  if (!item) return null;
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}
function bannerImage(b) {
  if (!b) return null;
  const b64 = (b.imageBase64 || b.image_base64) && String(b.imageBase64 || b.image_base64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = (b.imageUrl || b.image_url) && String(b.imageUrl || b.image_url).trim();
  return url || null;
}

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

// Top trust strip (icon-left cards).
const TOP_TRUST = [
  { icon: Gauge,       title: 'Quick Listing',  sub: 'List in less than 1 minute',    color: GREEN_DARK, bg: '#E6F7E3' },
  { icon: ShieldCheck, title: 'Trusted Buyers', sub: '100% verified buyers',          color: '#B45309',  bg: '#FEF3C7' },
  { icon: ScanSearch,  title: 'Best Price',     sub: 'Get the best value for device', color: GREEN_DARK, bg: '#E6F7E3' },
];

// Hero fallback steps (shown when no "Sell" banner is published yet).
const HERO_STEPS = [
  { icon: Tag,         label: 'List Device' },
  { icon: Users,       label: 'Get Offers' },
  { icon: IndianRupee, label: 'Get Paid' },
];

export default function OwnerSellHomeScreen({ navigation, route }) {
  const flow = route?.params?.flow || 'OWNER_LIST';
  const { width: winW } = useWindowDimensions();
  const padH = 16;
  const contentW = winW - padH * 2;
  const isSmall = winW < 360;
  const heroTitleF = isSmall ? 19 : 22;

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerRef = useRef(null);

  // Devices this shop has already listed, shown under the category grid so the
  // Sell screen answers "what am I selling?" as well as "what do I want to sell?".
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const [listings, setListings] = useState([]);

  // useFocusEffect, not useEffect: coming back from the listing flow has to show
  // the device that was just published.
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const data = await marketplaceApi.get('/marketplace/products', { query: { type: 'SELL' } });
          const rows = Array.isArray(data) ? data : (data?.content || data?.data || []);
          // Same ownership test the My Listings screen uses: a row with neither
          // seller nor shop is legacy data and is treated as ours.
          const mine = rows.filter((p) =>
            (userId && p.sellerUserId === userId) ||
            (shopId && p.shopId === shopId) ||
            (!p.sellerUserId && !p.shopId));
          const ts = (p) => {
            const t = p?.createdAt ? Date.parse(p.createdAt) : NaN;
            return Number.isNaN(t) ? -Infinity : t;
          };
          mine.sort((a, b) => ts(b) - ts(a));
          if (!cancelled) setListings(mine.slice(0, 3));
        } catch (_) {
          if (!cancelled) setListings([]);
        }
      })();
      return () => { cancelled = true; };
    }, [shopId, userId]),
  );

  useEffect(() => {
    (async () => {
      try {
        const list = await getDeviceCategories();
        const ORDER = ['mobile', 'laptop', 'tablet', 'smartwatches', 'audio device'];
        const rank = (c) => {
          const i = ORDER.indexOf((c.name || '').trim().toLowerCase());
          return i === -1 ? ORDER.length : i;
        };
        setCats((list || []).filter((c) => c.isActive !== false).sort((a, b) => rank(a) - rank(b)));
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // Hero banners — get + display only the "Sell" banner(s), active, in sort order.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getBanners();
        const sell = (Array.isArray(rows) ? rows : [])
          .filter((b) => String(b.title || '').trim().toLowerCase() === 'sell' && (b.isActive ?? b.is_active) !== false)
          .sort((a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));
        if (!cancelled) setBanners(sell);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        bannerRef.current?.scrollTo({ x: next * winW, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(id);
  }, [banners.length, winW]);

  // Was a search filter over `cats`. The search box is gone, so this is the
  // full list — kept as `filtered` because the grid, the banner tap and the
  // empty state all read it.
  const filtered = cats;

  const goPickCategory = (c) =>
    navigation.navigate('SelectBrand', {
      flow,
      categoryId: c.id,
      categoryCode: (c.code || '').toUpperCase(),
      categoryName: c.name,
      editSellOrderId: route?.params?.editSellOrderId,
    });


  const gridGap = 12;
  const topCardW = Math.floor((contentW - gridGap * 2) / 3);
  const restCardW = Math.floor((contentW - gridGap) / 2);
  const topGrid = filtered.slice(0, 3);
  const restGrid = filtered.slice(3);

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Header: back + title + My Listings ─────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={{ backgroundColor: '#FFFFFF', paddingTop: 8, paddingBottom: 14, paddingHorizontal: padH }}>
          <View className="flex-row items-center">
            <Pressable
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
              hitSlop={8}
              className="items-center justify-center mr-3"
              style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: '#E6F7E3' }}
            >
              <ChevronLeft size={22} color={GREEN_DARK} />
            </Pressable>
            <View className="flex-1 pr-2">
              <Text className="text-text font-extrabold" style={{ fontSize: 22, letterSpacing: -0.3 }} numberOfLines={1}>
                Sell on GGFIX
              </Text>
              <Text className="text-text-muted" style={{ fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
                List your device. Reach verified buyers nearby.
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('MarketplaceOrders')}
              className="flex-row items-center rounded-full px-3 py-2 active:opacity-80"
              style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8E2', ...cardShadow }}
            >
              <FileText size={15} color={GREEN_DARK} />
              <Text className="font-extrabold ml-1.5" style={{ fontSize: 12.5, color: GREEN_DARK }}>My Listings</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <Loader label="Loading categories..." />
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* ── Top trust cards ──────────────────────────────── */}
          <View className="flex-row" style={{ paddingHorizontal: padH, marginTop: 14 }}>
            {TOP_TRUST.map((t, i) => {
              const Icon = t.icon;
              return (
                <View
                  key={t.title}
                  className="bg-white"
                  style={{ flex: 1, marginLeft: i === 0 ? 0 : 8, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#EFF5EE' }}
                >
                  <View className="h-8 w-8 rounded-full items-center justify-center mb-2" style={{ backgroundColor: t.bg }}>
                    <Icon size={16} color={t.color} strokeWidth={2.2} />
                  </View>
                  <Text className="font-extrabold text-text" style={{ fontSize: 11.5 }} numberOfLines={1}>{t.title}</Text>
                  <Text className="text-text-muted" style={{ fontSize: 9.5, marginTop: 2, lineHeight: 13 }} numberOfLines={2}>{t.sub}</Text>
                </View>
              );
            })}
          </View>

          {/* ── Hero: "Sell" banner carousel (or designed fallback) ── */}
          {banners.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              <ScrollView
                ref={bannerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setBannerIndex(Math.round(e.nativeEvent.contentOffset.x / winW))}
              >
                {banners.map((b) => {
                  const uri = bannerImage(b);
                  return (
                    <View key={b.id} style={{ width: winW, paddingHorizontal: padH }}>
                      <Pressable onPress={() => { if (filtered.length) goPickCategory(filtered[0]); }} className="rounded-3xl overflow-hidden active:opacity-95" style={cardShadow}>
                        {uri ? (
                          <Image source={{ uri }} style={{ width: '100%', aspectRatio: 40 / 21, backgroundColor: '#E6F7E3' }} resizeMode="cover" />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 40 / 21, backgroundColor: '#E6F7E3' }} />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
              {banners.length > 1 ? (
                <View className="flex-row items-center justify-center" style={{ marginTop: 10 }}>
                  {banners.map((b, i) => (
                    <View key={b.id} style={{ height: 6, width: i === bannerIndex ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === bannerIndex ? GREEN : '#CBD5CB' }} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ paddingHorizontal: padH, marginTop: 16 }}>
              <View className="rounded-3xl overflow-hidden" style={cardShadow}>
                <LinearGradient colors={['#E6F7E3', '#E6F7E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16 }}>
                  {/* Headline + box */}
                  <View className="flex-row items-center">
                    <View className="flex-1 pr-2">
                      <Text className="text-text font-extrabold" style={{ fontSize: heroTitleF, lineHeight: heroTitleF + 4 }}>Get the best value</Text>
                      <Text className="font-extrabold" style={{ fontSize: heroTitleF, lineHeight: heroTitleF + 4, color: GREEN_DARK }}>for your device</Text>
                      <Text className="text-text-muted" style={{ fontSize: 12.5, marginTop: 6 }}>Sell in 3 simple steps</Text>
                    </View>
                    <Text style={{ fontSize: isSmall ? 50 : 60 }}>📦</Text>
                  </View>
                  {/* Steps — full width so they always fit */}
                  <View className="flex-row items-start" style={{ marginTop: 16 }}>
                    {HERO_STEPS.map((s, i) => {
                      const Icon = s.icon;
                      return (
                        <React.Fragment key={s.label}>
                          <View className="items-center" style={{ flex: 1 }}>
                            <View className="h-11 w-11 rounded-full items-center justify-center" style={{ backgroundColor: GREEN }}>
                              <Icon size={20} color="#FFFFFF" strokeWidth={2.2} />
                            </View>
                            <Text className="text-text font-bold text-center" style={{ fontSize: 10.5, marginTop: 5 }} numberOfLines={1}>{s.label}</Text>
                          </View>
                          {i < HERO_STEPS.length - 1 ? <ChevronRight size={16} color={GREEN_DARK} style={{ marginTop: 12 }} /> : null}
                        </React.Fragment>
                      );
                    })}
                  </View>
                </LinearGradient>
              </View>
            </View>
          )}

          {/* ── Choose sales category ────────────────────────── */}
          <View style={{ paddingHorizontal: padH, marginTop: 20, marginBottom: 12 }}>
            <Text className="text-text font-extrabold" style={{ fontSize: 18, letterSpacing: -0.2 }}>Choose sales category</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={{ paddingHorizontal: padH }}>
              <EmptyState
                title="No categories"
                description="The admin hasn't published any device categories."
              />
            </View>
          ) : (
            <View style={{ paddingHorizontal: padH }}>
              {/* Top row: first 3 as image-top cards */}
              <View className="flex-row">
                {topGrid.map((c, i) => {
                  const meta = metaFor(c.code);
                  const uri = imgUri(c);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => goPickCategory(c)}
                      className="bg-white active:opacity-90"
                      style={{ width: topCardW, marginLeft: i === 0 ? 0 : gridGap, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#EFF5EE', ...cardShadow }}
                    >
                      <View className="items-center justify-center overflow-hidden" style={{ width: '100%', height: Math.round(topCardW * 0.78), borderRadius: 12, backgroundColor: '#F7FAF7', marginBottom: 8 }}>
                        {uri ? <Image source={{ uri }} style={{ width: '90%', height: '90%' }} resizeMode="contain" /> : <Text style={{ fontSize: 40 }}>{meta.emoji}</Text>}
                      </View>
                      <Text className="text-text font-extrabold" style={{ fontSize: 13.5 }} numberOfLines={1}>{c.name}</Text>
                      <Text className="text-text-muted" style={{ fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>{meta.sub}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Remaining: wide image-left cards, 2 per row */}
              {restGrid.length > 0 ? (
                <View className="flex-row flex-wrap" style={{ marginTop: gridGap }}>
                  {restGrid.map((c, i) => {
                    const meta = metaFor(c.code);
                    const uri = imgUri(c);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => goPickCategory(c)}
                        className="bg-white flex-row items-center active:opacity-90"
                        style={{ width: restCardW, marginLeft: i % 2 === 0 ? 0 : gridGap, marginBottom: gridGap, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#EFF5EE', ...cardShadow }}
                      >
                        <View className="items-center justify-center overflow-hidden mr-2.5" style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: '#F7FAF7' }}>
                          {uri ? <Image source={{ uri }} style={{ width: '90%', height: '90%' }} resizeMode="contain" /> : <Text style={{ fontSize: 28 }}>{meta.emoji}</Text>}
                        </View>
                        <View className="flex-1 pr-1">
                          <Text className="text-text font-extrabold" style={{ fontSize: 13.5 }} numberOfLines={1}>{c.name}</Text>
                          <Text className="text-text-muted" style={{ fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>{meta.sub}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}

          {/* ── Your listed products ─────────────────────────────
              Sits where the trust strip used to. Hidden entirely when there is
              nothing listed: an empty card here would push the categories up
              the screen for a shop that has never sold anything. */}
          {listings.length > 0 ? (
            <View style={{ paddingHorizontal: padH, marginTop: 18 }}>
              <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
                <Text className="text-text font-extrabold" style={{ fontSize: 15 }}>
                  Your listed products
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('MarketplaceOrders')}
                  className="flex-row items-center active:opacity-70"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="font-extrabold" style={{ fontSize: 12, color: GREEN_DARK }}>View all</Text>
                  <ChevronRight size={14} color={GREEN_DARK} />
                </Pressable>
              </View>

              {listings.map((p) => {
                const img = resolveDeviceImageSource({ url: p.imageUrl });
                const price = p.price != null ? `₹${Number(p.price).toLocaleString('en-IN')}` : '—';
                const created = p.createdAt ? new Date(p.createdAt) : null;
                const when = created
                  ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
                  : '';
                const status = String(p.status || '').toUpperCase();
                const sold = status === 'SOLD' || status === 'COMPLETED';
                const cancelled = status === 'CANCELLED' || status === 'CANCELED';
                const pill = sold
                  ? { label: 'Sold', ink: GREEN_DARK, bg: '#E6F7E3' }
                  : cancelled
                    ? { label: 'Cancelled', ink: '#B91C1C', bg: '#FEE2E2' }
                    : { label: 'Active', ink: '#B45309', bg: '#FEF3C7' };
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => navigation.navigate('MarketplaceOrders')}
                    className="bg-white flex-row items-center active:opacity-90"
                    style={{
                      borderRadius: 14,
                      padding: 10,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: '#EFF5EE',
                      ...cardShadow,
                    }}
                  >
                    <View
                      className="items-center justify-center"
                      style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#F0F8EF', overflow: 'hidden' }}
                    >
                      {img ? (
                        <Image source={img} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                      ) : (
                        <Package size={20} color={GREEN_DARK} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                      <Text className="text-text font-extrabold" style={{ fontSize: 13 }} numberOfLines={1}>
                        {p.title || 'Listing'}
                      </Text>
                      <View className="flex-row items-center" style={{ marginTop: 3 }}>
                        <View style={{ backgroundColor: pill.bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text className="font-extrabold" style={{ fontSize: 9.5, color: pill.ink }}>{pill.label}</Text>
                        </View>
                        {when ? (
                          <Text className="text-text-muted" style={{ fontSize: 10.5, marginLeft: 6 }}>{when}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text className="font-extrabold" style={{ fontSize: 13, color: GREEN_DARK, marginLeft: 8 }}>
                      {price}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

        </ScrollView>
      )}
    </View>
  );
}
