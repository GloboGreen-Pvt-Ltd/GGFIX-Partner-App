import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import {
  TrendingUp, ShieldCheck, Truck, ChevronRight, FileText, LayoutGrid, Smartphone, ArrowRight, Wrench, ShoppingBag, Package,
} from 'lucide-react-native';
import { marketplaceApi } from '../../api/client';
import { selectShopId, selectUserId } from '../../store/authSlice';
import { OfferBanner, EmptyState, Loader } from '../../components/rnr';
import { getDeviceCategories, getBanners, getCategoryMenuImages, categoryMenuKey } from '../../api/masterData';
import { tintFor } from '../shared/categoryTints';
import PageHeader, { HeaderIconButton } from '../../components/PageHeader';
import { rf } from '../../utils/responsive';
import { useCurrentDevice, deviceName, deviceTitle, roughEstimate } from '../../utils/currentDevice';
import { useTabBarSpace } from '../../navigation/tabBarMetrics';
import { useResponsive } from '../../theme/responsive';

// Same page as the Customer app's Sell home (SellHomeScreen); picking a device
// starts the Partner listing flow (SelectBrand, OWNER_LIST).

// Partner app Sell palette — green #035C6C, ink #111111, neutrals #F3F4F6 / #F3F4F6.
const ACCENT = '#035C6C';
const PRIMARY = '#035C6C';      // green text
const MINT = '#E5F3F5';
const PAGE_BG = '#F3F4F6';
const BORDER = '#E5E7EB';
const TEXT = '#111111';
const MUTED = '#6B7280';
const AMBER_FG = '#B45309';
const AMBER_BG = '#FFF3CD';
const MAX_W = 1000;

const cardShadow = {
  shadowColor: TEXT, shadowOpacity: 0.06, shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 }, elevation: 2,
};

// Sell-specific category art, used when the admin's SELL Category Menu has
// no image for a category (the shared category image is also Repair's).
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

// Display order for the strip (backend returns categories alphabetically).
const CATEGORY_ORDER = ['MOBILE', 'SMARTPHONE', 'LAPTOP', 'TABLET', 'SMARTWATCH', 'SMARTWATCHES', 'WATCH', 'AUDIO', 'AUDIO_DEVICE', 'AUDIO_DEVICES'];
function sortCategories(list) {
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf((c.code || '').toUpperCase());
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''));
}

function imgUri(item) {
  if (!item) return null;
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}

// Benefit cards — the same three promises this page made before.
const PROMISES = [
  { icon: TrendingUp, title: 'Best Price', sub: 'Highest value guaranteed', color: ACCENT, bg: MINT },
  { icon: ShieldCheck, title: 'Verified Shops', sub: 'Trusted & verified partners', color: AMBER_FG, bg: AMBER_BG },
  { icon: Truck, title: 'Free Pickup', sub: 'Hassle-free at your doorstep', color: ACCENT, bg: MINT },
];

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native. Press feedback
// uses the `active:` className.
// Action card under the banner: art · kicker / title / sub · CTA pill.
function ActionCard({ width, image, Icon, kicker, title, sub, cta, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      accessibilityRole="button"
      accessibilityLabel={`${kicker}: ${title}`}
      accessibilityHint={cta}
      style={{
        width, minHeight: 78, marginRight: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18,
        borderWidth: 1, borderColor: BORDER, paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden', ...cardShadow,
      }}
    >
      {image ? (
        <Image resizeMethod="resize" source={{ uri: image }} style={{ height: 56, width: 56, marginRight: 10 }} resizeMode="contain" />
      ) : (
        <View style={{ height: 52, width: 52, borderRadius: 14, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Icon size={24} color={ACCENT} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <Text numberOfLines={1} style={{ color: PRIMARY, fontWeight: '800', fontSize: rf(11.5) }}>{kicker}</Text>
        <Text numberOfLines={2} style={{ color: TEXT, fontWeight: '800', fontSize: rf(13), lineHeight: rf(17), marginTop: 1 }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: MUTED, fontSize: rf(11.5), marginTop: 1 }}>{sub}</Text>
      </View>
      <View style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
        <ArrowRight size={16} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

function CategoryChip({ label, size, isAll, uri, photo, code, onPress, gap = 10 }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="active:opacity-80" style={{ width: size, marginRight: gap, alignItems: 'center' }}>
      <View
        style={{
          width: size, height: size, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isAll ? MINT : tintFor(code), borderWidth: isAll ? 1.5 : 1, borderColor: isAll ? ACCENT : BORDER, ...cardShadow,
        }}
      >
        {isAll ? (
          <LayoutGrid size={20} color={ACCENT} />
        ) : uri ? (
          <Image resizeMethod="resize" source={{ uri }} style={photo ? { width: '86%', height: '86%' } : { width: size * 0.6, height: size * 0.6 }} resizeMode="contain" />
        ) : (
          <Smartphone size={20} color={PRIMARY} />
        )}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ marginTop: 6, fontSize: rf(10), textAlign: 'center', alignSelf: 'stretch', color: isAll ? PRIMARY : TEXT, fontWeight: isAll ? '700' : '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function OwnerSellHubScreen({ navigation, route }) {
  // The tab bar floats over the page; keep the last items clear of it.
  const tabSpace = useTabBarSpace();
  const [cats, setCats] = useState([]);
  const [menuImages, setMenuImages] = useState({});
  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerRatio, setBannerRatio] = useState(2.4);
  // Carousel page width = the carousel's own measured width.
  const [bannerPageW, setBannerPageW] = useState(0);
  const [loading, setLoading] = useState(true);
  const bannerRef = useRef(null);
  const { width } = useWindowDimensions();
  const r = useResponsive();
  const currentDevice = useCurrentDevice();

  // This shop's own sell listings (same source and ownership rule as My
  // Orders → Sell), newest first — the latest few show at the bottom.
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const loadListings = useCallback(async () => {
    try {
      const data = await marketplaceApi.get('/marketplace/products', { query: { type: 'SELL' } });
      const list = Array.isArray(data) ? data : (data?.content || data?.data || []);
      // By shop first: one owner runs several shops, so the user id alone would
      // pull every shop's listings into whichever shop is active.
      const mine = list.filter((p) => (shopId ? p.shopId === shopId : (userId && p.sellerUserId === userId)));
      mine.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setListings(mine);
    } catch (_) {
      setListings([]);
    } finally {
      setListingsLoading(false);
    }
  }, [shopId, userId]);
  useFocusEffect(useCallback(() => { loadListings(); }, [loadListings]));

  useEffect(() => {
    (async () => {
      try {
        const [list, rows, imgs] = await Promise.all([
          getDeviceCategories(),
          getBanners().catch(() => []),
          getCategoryMenuImages('SELL'),
        ]);
        setCats(sortCategories((list || []).filter((c) => c.isActive !== false)));
        setMenuImages(imgs || {});
        // Hero: the admin "Sell" banner(s) first, then the general "Slider"
        // banners (same set the Partner app's Sell carousel shows).
        const active = (rows || []).filter((b) => b.isActive !== false);
        const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        const title = (b) => String(b.title || '').trim().toLowerCase();
        setBanners(
          [...active.filter((b) => title(b) === 'sell').sort(bySort), ...active.filter((b) => title(b).startsWith('slider')).sort(bySort)]
            .map((b) => ({ key: String(b.id), uri: imgUri(b) }))
            .filter((b) => b.uri),
        );
      } catch (_) {}
      setLoading(false);
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
  const pageW = bannerPageW || contentW;
  const bannerW = pageW - padH * 2;
  const bannerH = Math.round(bannerW / bannerRatio);
  // Sell for Cash: five category tiles across one row on phones, six on tablets.
  const catCols = r.tileColumns({ phone: 5 });
  const catGap = 8;
  const catSize = Math.min(72, Math.floor((contentW - padH * 2 - catGap * (catCols - 1)) / catCols));
  // Action cards: one per screen with the next peeking in.
  const actionW = Math.min(360, Math.round((contentW - padH * 2) * 0.88));
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

  // Sell This Device: detected phone → its name + rough estimate; otherwise a generic card.
  const detected = currentDevice.ready && (deviceName(currentDevice) || currentDevice.storageGb || currentDevice.image);

  // Category → brand → model (SelectBrand). No category picked (banner /
  // Sell This Device) starts with the first one (Mobile).
  const goPickDevice = (extra = {}) => {
    const first = cats[0];
    const cat = extra.categoryId ? extra
      : first ? { categoryId: first.id, categoryCode: (first.code || '').toUpperCase(), categoryName: first.name } : null;
    if (!cat) return;
    navigation.navigate('SellDeviceDetails', {
      flow: route?.params?.flow || 'OWNER_LIST',
      ...cat,
      editSellOrderId: route?.params?.editSellOrderId,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      {/* ---------- Header: back · Sell on GGFIX · my sell orders ---------- */}
      <PageHeader
        title="Sell on NearGFix"
        subtitle="Sell your device. Get quotes from verified shops."
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
        right={<HeaderIconButton icon={FileText} color={ACCENT} size={17} label="My sell orders" onPress={() => navigation.navigate('MarketplaceOrders', { initialTab: 'Sell' })} />}
      />

      {loading ? (
        <Loader label="Loading categories..." />
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabSpace }}>
          <View style={centered}>
            {/* Hero carousel (admin banners, image only). Falls back to the
                built-in offer banner when none are published. */}
            {banners.length ? (
              <View style={{ marginTop: 14 }}>
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
                      <Pressable
                        onPress={() => goPickDevice()}
                        accessibilityRole="imagebutton"
                        accessibilityLabel="Sell offer banner"
                        className="active:opacity-95"
                        style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF', ...cardShadow }}
                      >
                        <Image resizeMethod="resize" source={{ uri: b.uri }} style={{ width: bannerW, height: bannerH }} resizeMode="contain" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                {banners.length > 1 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                    {banners.map((b, i) => (
                      <View key={b.key} style={{ height: 6, width: i === bannerIndex ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === bannerIndex ? ACCENT : BORDER }} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ paddingHorizontal: padH, marginTop: 12 }}>
                <OfferBanner
                  badge="GUARANTEED"
                  title="Top price or free pickup"
                  subtitle="Not happy with the offer? Free pickup, no questions."
                  cta="Learn more"
                  palette="emerald"
                  onPress={() => goPickDevice()}
                />
              </View>
            )}

            {/* Action cards — sell this phone, repair it, or buy a new one. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: padH, paddingTop: 12, paddingBottom: 6 }}>
              <ActionCard
                width={actionW}
                image={detected ? currentDevice.image : null}
                Icon={Smartphone}
                kicker="Sell This Device"
                title={detected ? deviceTitle(currentDevice) : 'Old device? Get cash'}
                sub={detected ? `Get up to ₹${roughEstimate(currentDevice).toLocaleString('en-IN')}` : 'Instant quote · Free pickup'}
                cta="Sell Now"
                onPress={() => goPickDevice()}
              />
              <ActionCard
                width={actionW}
                Icon={Wrench}
                kicker="Repair Your Device"
                title={detected ? deviceTitle(currentDevice) : 'Screen, battery & more'}
                sub="Expert repair at your doorstep"
                cta="Repair"
                onPress={() => navigation.navigate('RepairServiceBookingShop')}
              />
              <ActionCard
                width={actionW}
                Icon={ShoppingBag}
                kicker="Buy a Device"
                title="Let's find a new device for you"
                sub="Phones, laptops, tablets & more"
                cta="Shop"
                onPress={() => navigation.navigate('Buy')}
              />
            </ScrollView>

            {/* Sell for Cash — one tile per category (starts a sale for it). */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: padH, marginTop: 16 }}>
              <Text style={{ fontSize: rf(15), fontWeight: '800', color: TEXT }}>Sell for <Text style={{ color: PRIMARY }}>Cash</Text></Text>
              <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: rf(11), color: MUTED }}>Pick your device</Text>
            </View>
            {cats.length === 0 ? (
              <View style={{ paddingHorizontal: padH, marginTop: 10 }}>
                <EmptyState title="No categories yet" description="The admin hasn't published any device categories." />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: padH, paddingTop: 10, columnGap: catGap, rowGap: 12 }}>
                {cats.map((c) => {
                  const code = (c.code || '').toUpperCase();
                  const menuUri = menuImages[categoryMenuKey(c.name)] || menuImages[categoryMenuKey(c.code)] || null;
                  return (
                    <CategoryChip
                      key={c.id}
                      gap={0}
                      label={c.name}
                      code={code}
                      size={catSize}
                      uri={menuUri || SELL_IMAGES[code] || imgUri(c)}
                      photo={!!(menuUri || SELL_IMAGES[code])}
                      onPress={() => goPickDevice({ categoryId: c.id, categoryCode: code, categoryName: c.name })}
                    />
                  );
                })}
              </View>
            )}

            {/* Benefit cards */}
            <View style={{ flexDirection: 'row', paddingHorizontal: padH, marginTop: 14 }}>
              {PROMISES.map((t, i) => {
                const Icon = t.icon;
                return (
                  <View key={t.title} style={{ flex: 1, marginLeft: i === 0 ? 0 : 8, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
                    <View style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                      <Icon size={15} color={t.color} strokeWidth={2.2} />
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: rf(12), fontWeight: '800', color: TEXT }}>{t.title}</Text>
                    <Text numberOfLines={2} style={{ fontSize: rf(9.5), color: MUTED, marginTop: 3, lineHeight: rf(13) }}>{t.sub}</Text>
                  </View>
                );
              })}
            </View>

            {/* My sell listings — the latest five; See All opens My Orders → Sell. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: padH, marginTop: 18, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: TEXT }}>My Sell Listings</Text>
                <Text style={{ fontSize: rf(11), color: MUTED, marginTop: 2 }}>Devices and parts you've listed</Text>
              </View>
              {listings.length ? (
                <Pressable
                  onPress={() => navigation.navigate('MarketplaceOrders', { initialTab: 'Sell' })}
                  accessibilityRole="button"
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: rf(12), fontWeight: '800', color: PRIMARY }}>See All</Text>
                  <ChevronRight size={14} color={PRIMARY} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ paddingHorizontal: padH }}>
              {listingsLoading ? null : listings.length === 0 ? (
                <View style={{ alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingVertical: 20, paddingHorizontal: 16 }}>
                  <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={20} color={ACCENT} />
                  </View>
                  <Text style={{ fontSize: rf(13), fontWeight: '800', color: TEXT, marginTop: 8 }}>No listings yet</Text>
                  <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: 2, textAlign: 'center' }}>Pick a category above to list your first device.</Text>
                </View>
              ) : (
                listings.slice(0, 5).map((p) => {
                  const status = String(p.status || 'ACTIVE').toUpperCase();
                  const live = status === 'ACTIVE';
                  const sold = status === 'SOLD' || status === 'COMPLETED';
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => navigation.navigate('MarketplaceListingDetails', { productId: p.id, listing: p })}
                      accessibilityRole="button"
                      className="active:opacity-90"
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 8, ...cardShadow }}
                    >
                      <View style={{ height: 52, width: 52, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 10 }}>
                        {p.imageUrl ? (
                          <Image resizeMethod="resize" source={{ uri: p.imageUrl }} style={{ width: 52, height: 52 }} resizeMode="contain" />
                        ) : (
                          <Smartphone size={20} color={MUTED} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: TEXT }}>{p.title || 'Listing'}</Text>
                        <Text numberOfLines={1} style={{ fontSize: rf(11), color: MUTED, marginTop: 2 }}>
                          {p.descriptionType === 'SPARE_PARTS' ? 'Spare part' : (p.conditionLabel || 'Device')}
                          {p.createdAt ? ` · ${new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                        {p.price != null ? (
                          <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: PRIMARY }}>₹{Number(p.price).toLocaleString('en-IN')}</Text>
                        ) : null}
                        <View style={{ marginTop: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: live ? MINT : sold ? '#EFF4EB' : '#F3F4F6' }}>
                          <Text style={{ fontSize: rf(10), fontWeight: '800', color: live ? PRIMARY : sold ? '#4A7029' : MUTED }}>
                            {live ? 'Live' : sold ? 'Sold' : status.charAt(0) + status.slice(1).toLowerCase()}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
