import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
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
  LayoutGrid,
  Package,
  EllipsisVertical,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { EmptyState, Loader } from '../../components/rnr';
import { getDeviceCategories, getBanners } from '../../api/masterData';
import { marketplaceApi } from '../../api/client';
import { resolveDeviceImageSource } from '../../utils/images';
import { tintFor } from '../shared/categoryTints';
import { selectShopId, selectUserId } from '../../store/authSlice';

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';
const PRIMARY = '#006B57';
const BRIGHT = '#00A86B';
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const ACTIVE_FG = '#B45309';
const ACTIVE_BG = '#FFF3CD';
// Kept for the parts of this file untouched by the redesign (device-category
// meta/emoji lookups) — no behavioural meaning, just a legacy name.
const GREEN       = ACCENT;
const GREEN_DARK  = ACCENT;

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

// Sell-specific category art, overriding whatever image the admin has set on
// the shared master_device_categories row (that image is also used elsewhere,
// so it isn't always right for the Sell context).
const SELL_IMAGES = {
  MOBILE: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Phone.png',
  SMARTPHONE: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Phone.png',
  LAPTOP: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Laptop.png',
  SMARTWATCH: 'https://media.ggfix.in/buy&sell-categories-image/Sell-smartWatch.png',
  SMARTWATCHES: 'https://media.ggfix.in/buy&sell-categories-image/Sell-smartWatch.png',
  TABLET: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Tablet.png',
  AUDIO: 'https://media.ggfix.in/buy&sell-categories-image/Sell-AudioDevice.png',
  AUDIO_DEVICE: 'https://media.ggfix.in/buy&sell-categories-image/Sell-AudioDevice.png',
  AUDIO_DEVICES: 'https://media.ggfix.in/buy&sell-categories-image/Sell-AudioDevice.png',
};

function imgUri(item) {
  if (!item) return null;
  const sellImg = SELL_IMAGES[String(item.code || '').toUpperCase()];
  if (sellImg) return sellImg;
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
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 2,
};

// Benefit strip below the hero.
const TOP_TRUST = [
  { icon: Gauge,       title: 'Quick Listing',  sub: 'List in less than 1 minute',    color: ACCENT, bg: MINT },
  { icon: ShieldCheck, title: 'Trusted Buyers', sub: '100% verified buyers',          color: ACTIVE_FG, bg: ACTIVE_BG },
  { icon: ScanSearch,  title: 'Best Price',     sub: 'Get the best value for device', color: ACCENT, bg: MINT },
];

// Purely decorative, static promotional copy for the fallback hero — the
// user supplied this exact wording; nothing here is business data, so
// there's nothing to fabricate.
const HERO_BENEFITS = [
  { title: 'Best Price', sub: 'Get top value' },
  { title: 'Quick & Easy', sub: 'List in minutes' },
  { title: 'Safe & Secure', sub: 'Trusted buyers' },
  { title: 'Trusted Platform', sub: 'Thousands of happy customers' },
];

export default function OwnerSellHomeScreen({ navigation, route }) {
  const flow = route?.params?.flow || 'OWNER_LIST';
  const { width: winW } = useWindowDimensions();
  const isSmall = winW < 360;
  const isTablet = winW >= 768;
  const padH = isTablet ? 24 : 16;
  // Tablet/iPad content centers under a width cap instead of every section
  // stretching edge-to-edge across a much wider screen.
  const maxContentWidth = isTablet ? 1000 : undefined;

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
          if (!cancelled) setListings(mine.slice(0, 4));
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

  // Same real destination the whole hero (and every listing row) already
  // opens with — "Sell Now" just gives that same action a dedicated button.
  const startSelling = () => { if (filtered.length) goPickCategory(filtered[0]); };

  const CHIP_SIZE = isSmall ? 78 : isTablet ? 118 : 92;
  const CHIP_IMG_SIZE = isSmall ? 52 : isTablet ? 80 : 62;
  const CHIP_ICON_SIZE = isSmall ? 26 : isTablet ? 40 : 32;
  const CHIP_LABEL_F = isSmall ? 10.5 : isTablet ? 13.5 : 11.5;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF', paddingTop: 8, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: BORDER,
          }}
        >
          <View style={{ paddingHorizontal: padH }}>
            <View style={{ width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
                  hitSlop={8}
                  className="items-center justify-center"
                  style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER }}
                >
                  <ChevronLeft size={19} color={TEXT_PRIMARY} />
                </Pressable>
                <View className="flex-1 items-center">
                  <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY }} numberOfLines={1}>Sell on GGFIX</Text>
                  <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={1}>List your device. Reach verified buyers nearby.</Text>
                </View>
                <Pressable
                  onPress={() => navigation.navigate('MarketplaceOrders')}
                  hitSlop={8}
                  className="items-center justify-center"
                  style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: BORDER }}
                >
                  <FileText size={17} color={ACCENT} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <Loader label="Loading categories..." />
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
          {/* ── Category selector — "All" first, then every real, active
              category (however many the admin has published — not forced to
              exactly 3). Tapping a real category still opens SelectBrand to
              start a new listing for it; "All" still opens My Listings. Same
              behaviour as before, bigger premium tiles. ── */}
          {filtered.length === 0 ? (
            <View style={{ paddingHorizontal: padH, marginTop: 16 }}>
              <EmptyState
                title="No categories"
                description="The admin hasn't published any device categories."
              />
            </View>
          ) : (
            <View style={{ marginTop: 16 }}>
              <FlatList
                horizontal
                data={[{ all: true }, ...filtered]}
                keyExtractor={(c, i) => (c.all ? 'all' : c.id || String(i))}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                contentContainerStyle={{ paddingHorizontal: padH }}
                renderItem={({ item: c }) => {
                  if (c.all) {
                    return (
                      <Pressable onPress={() => navigation.navigate('MarketplaceOrders')} className="items-center active:opacity-80" style={{ width: CHIP_SIZE }}>
                        {/* "All" is always the default/opening view of this
                            screen (there's no real stateful filter to track),
                            so it's shown with a permanent active outline
                            rather than fabricating selectable-filter state. */}
                        <View
                          className="items-center justify-center"
                          style={{ width: CHIP_SIZE, height: CHIP_SIZE, borderRadius: 20, backgroundColor: MINT, borderWidth: 1.5, borderColor: BRIGHT, ...cardShadow }}
                        >
                          <LayoutGrid size={CHIP_ICON_SIZE} color={ACCENT} />
                        </View>
                        <Text className="text-center mt-1.5 font-bold" numberOfLines={1} style={{ fontSize: CHIP_LABEL_F, color: ACCENT }}>All</Text>
                      </Pressable>
                    );
                  }
                  const meta = metaFor(c.code);
                  const uri = imgUri(c);
                  return (
                    <Pressable onPress={() => goPickCategory(c)} className="items-center active:opacity-80" style={{ width: CHIP_SIZE }}>
                      <View
                        className="items-center justify-center overflow-hidden"
                        style={{ width: CHIP_SIZE, height: CHIP_SIZE, borderRadius: 20, backgroundColor: tintFor(c.code), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
                      >
                        {uri ? <Image source={{ uri }} style={{ width: CHIP_IMG_SIZE, height: CHIP_IMG_SIZE }} resizeMode="contain" /> : <Text style={{ fontSize: CHIP_ICON_SIZE }}>{meta.emoji}</Text>}
                      </View>
                      <Text className="text-center mt-1.5 font-semibold" numberOfLines={1} style={{ fontSize: CHIP_LABEL_F, color: TEXT_PRIMARY }}>{c.name}</Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          )}

          {/* ── Hero: "Sell" banner carousel (admin-controlled image — its
              content is out of this redesign's reach, only the surrounding
              chrome/pagination is restyled) or the designed fallback below,
              shown only when no banner is published. ── */}
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
                      <Pressable onPress={startSelling} className="rounded-3xl overflow-hidden active:opacity-95" style={{ borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
                        {uri ? (
                          <Image source={{ uri }} style={{ width: '100%', aspectRatio: 40 / 21, backgroundColor: MINT }} resizeMode="cover" />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 40 / 21, backgroundColor: MINT }} />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
              {banners.length > 1 ? (
                <View className="flex-row items-center justify-center" style={{ marginTop: 10 }}>
                  {banners.map((b, i) => (
                    <View key={b.id} style={{ height: 6, width: i === bannerIndex ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === bannerIndex ? ACCENT : BORDER }} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ paddingHorizontal: padH, marginTop: 16 }}>
              <View className="rounded-3xl overflow-hidden flex-row" style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF', ...cardShadow }}>
                {/* Left — brand, headline, trust items, Sell Now */}
                <View style={{ flex: isSmall ? 1.3 : 1, padding: isSmall ? 14 : 18 }}>
                  <View className="flex-row items-center">
                    <View className="items-center justify-center" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: ACCENT, marginRight: 9 }}>
                      <Text className="text-white font-extrabold" style={{ fontSize: 15 }}>G</Text>
                    </View>
                    <View>
                      <Text className="font-extrabold" style={{ fontSize: 14, color: ACCENT, letterSpacing: 1 }}>GGFIX</Text>
                      <Text style={{ fontSize: 7, color: TEXT_SECONDARY, letterSpacing: 0.5 }}>SMART DEVICES. SMARTER CHOICE.</Text>
                    </View>
                  </View>

                  <Text className="font-extrabold" style={{ fontSize: isSmall ? 18 : 21, color: TEXT_PRIMARY, marginTop: 12 }}>
                    Sell Your Devices
                  </Text>
                  <Text className="font-extrabold" style={{ fontSize: isSmall ? 18 : 21, color: ACCENT }}>
                    Get the Best Value
                  </Text>
                  <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: 3 }} numberOfLines={1}>
                    Quick Evaluation · Instant Offers · Secure Payments
                  </Text>

                  {/* 4 trust items, each with its own sub-copy */}
                  <View className="flex-row flex-wrap" style={{ marginTop: 12 }}>
                    {HERO_BENEFITS.map((b) => (
                      <View key={b.title} className="flex-row items-start" style={{ width: '50%', paddingRight: 6, marginBottom: 8 }}>
                        <ShieldCheck size={12} color={ACCENT} style={{ marginTop: 1 }} />
                        <View style={{ marginLeft: 5, flex: 1 }}>
                          <Text className="font-extrabold" style={{ fontSize: 10, color: TEXT_PRIMARY }} numberOfLines={1}>{b.title}</Text>
                          <Text style={{ fontSize: 8.5, color: TEXT_SECONDARY }} numberOfLines={1}>{b.sub}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Sell Now — same real destination the banner tap / first
                      listing row already use. */}
                  <Pressable
                    onPress={startSelling}
                    className="flex-row items-center active:opacity-90"
                    style={{ marginTop: 6, borderRadius: 999, backgroundColor: ACCENT, paddingVertical: 6, paddingLeft: 18, paddingRight: 6, alignSelf: 'flex-start', ...cardShadow, shadowColor: ACCENT, shadowOpacity: 0.3 }}
                  >
                    <Text className="text-white font-extrabold" style={{ fontSize: 13.5 }}>Sell Now</Text>
                    <View className="items-center justify-center" style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: '#FFFFFF', marginLeft: 10 }}>
                      <ChevronRight size={15} color={ACCENT} />
                    </View>
                  </Pressable>
                </View>

                {/* Right — device collage (icon-based stand-in for a full
                    illustration graphic; no image asset was supplied), the
                    instant-payment badge, and the decorative handwritten
                    closing line. */}
                <LinearGradient
                  colors={[BRIGHT, ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: isSmall ? 96 : 118, padding: 10, justifyContent: 'space-between' }}
                >
                  <View className="items-center justify-center rounded-full" style={{ alignSelf: 'flex-end', width: 46, height: 46, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                    <IndianRupee size={14} color="#FFFFFF" />
                    <Text className="text-white font-extrabold" style={{ fontSize: 6, marginTop: 1, textAlign: 'center' }}>INSTANT{'\n'}PAYMENT</Text>
                  </View>
                  <View className="items-center" style={{ marginVertical: 8 }}>
                    <Package size={isSmall ? 40 : 48} color="rgba(255,255,255,0.9)" strokeWidth={1.4} />
                  </View>
                  <Text className="italic text-white text-right" style={{ fontSize: 8.5, lineHeight: 11, opacity: 0.9 }}>
                    Turn Your Device{'\n'}into Value
                  </Text>
                </LinearGradient>
              </View>
            </View>
          )}

          {/* ── Benefit cards ──────────────────────────────── */}
          <View className="flex-row" style={{ paddingHorizontal: padH, marginTop: 14 }}>
            {TOP_TRUST.map((t, i) => {
              const Icon = t.icon;
              return (
                <View
                  key={t.title}
                  style={{ flex: 1, marginLeft: i === 0 ? 0 : 8, backgroundColor: CARD_BG, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: BORDER, ...cardShadow }}
                >
                  <View className="items-center justify-center" style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: t.bg, marginBottom: 6 }}>
                    <Icon size={15} color={t.color} strokeWidth={2.2} />
                  </View>
                  <Text className="font-extrabold" style={{ fontSize: 12, color: TEXT_PRIMARY }} numberOfLines={1}>{t.title}</Text>
                  <Text style={{ fontSize: 9.5, color: TEXT_SECONDARY, marginTop: 3, lineHeight: 13 }} numberOfLines={2}>{t.sub}</Text>
                </View>
              );
            })}
          </View>

          {/* ── Your listed products ─────────────────────────────
              Hidden entirely when there is nothing listed: an empty card
              here would push the categories up the screen for a shop that
              has never sold anything. */}
          {listings.length > 0 ? (
            <View style={{ paddingHorizontal: padH, marginTop: 16 }}>
              <View className="flex-row items-center justify-between" style={{ marginBottom: 8 }}>
                <Text className="font-extrabold" style={{ fontSize: 16, color: TEXT_PRIMARY }}>
                  Your listed products
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('MarketplaceOrders')}
                  className="flex-row items-center active:opacity-70"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="font-extrabold" style={{ fontSize: 12.5, color: ACCENT }}>View all</Text>
                  <ChevronRight size={15} color={ACCENT} />
                </Pressable>
              </View>

              {/* 2-column grid, wrapping flex rather than FlatList's
                  numColumns — this list is capped at 4 items and already
                  lives inside the page's own ScrollView, so a second
                  scrollable list isn't needed here. */}
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
                {listings.map((p) => {
                  const img = resolveDeviceImageSource({ url: p.imageUrl });
                  const price = p.price != null ? `₹${Number(p.price).toLocaleString('en-IN')}` : '—';
                  const status = String(p.status || '').toUpperCase();
                  const sold = status === 'SOLD' || status === 'COMPLETED';
                  const cancelled = status === 'CANCELLED' || status === 'CANCELED';
                  const pill = sold
                    ? { label: 'Sold', ink: ACCENT, bg: MINT }
                    : cancelled
                      ? { label: 'Cancelled', ink: '#B91C1C', bg: '#FEE2E2' }
                      : { label: status ? (status.charAt(0) + status.slice(1).toLowerCase()) : 'Active', ink: ACTIVE_FG, bg: ACTIVE_BG };
                  // Real fields (same ones the My Listings screen already
                  // reads) — not the fabricated view/like counts the
                  // reference showed, which nothing in this app tracks.
                  const spec = [p.storageLabel, p.ramLabel].filter(Boolean).join(' / ');
                  return (
                    <View key={p.id} style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
                      <Pressable
                        onPress={() => navigation.navigate('MarketplaceOrders')}
                        className="active:opacity-90"
                        style={{
                          backgroundColor: CARD_BG, borderRadius: 18, padding: 10,
                          borderWidth: 1, borderColor: BORDER, ...cardShadow,
                        }}
                      >
                        <View style={{ position: 'relative' }}>
                          <View
                            className="items-center justify-center"
                            style={{ width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: MINT, overflow: 'hidden' }}
                          >
                            {img ? (
                              <Image source={img} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                            ) : (
                              <Package size={28} color={ACCENT} />
                            )}
                          </View>
                          {/* Same real destination as the whole card — a
                              decorative affordance, not a second, fabricated
                              actions menu. */}
                          <Pressable
                            onPress={() => navigation.navigate('MarketplaceOrders')}
                            hitSlop={8}
                            className="items-center justify-center"
                            style={{ position: 'absolute', top: 4, right: 4, height: 24, width: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.9)' }}
                          >
                            <EllipsisVertical size={14} color={TEXT_SECONDARY} />
                          </Pressable>
                        </View>
                        <View style={{ backgroundColor: pill.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 8 }}>
                          <Text className="font-extrabold" style={{ fontSize: 9, color: pill.ink }}>{pill.label}</Text>
                        </View>
                        <Text className="font-bold" style={{ fontSize: 12.5, color: TEXT_PRIMARY, marginTop: 5 }} numberOfLines={2}>
                          {p.title || 'Listing'}
                        </Text>
                        {spec ? (
                          <Text style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>
                            ({spec})
                          </Text>
                        ) : null}
                        <Text className="font-extrabold" style={{ fontSize: 15, color: ACCENT, marginTop: 5 }}>
                          {price}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
        </ScrollView>
      )}
    </View>
  );
}
