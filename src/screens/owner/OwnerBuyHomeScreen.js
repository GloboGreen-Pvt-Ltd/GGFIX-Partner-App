import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  Search, ShoppingCart, Bell, ChevronRight, X, Plus, SlidersHorizontal,
  LayoutGrid, Tag, BadgeCheck, RotateCcw, TrendingUp, Smartphone, ClipboardList,
} from 'lucide-react-native';
import { EmptyState, Loader } from '../../components/rnr';
import { notify } from '../../components/confirm';
import { getDeviceCategories, getBanners, getCategoryMenuImages, categoryMenuKey } from '../../api/masterData';
import { listProducts, getCart, addToCart } from '../../api/marketplace';
import { getUnreadCount } from '../../api/notifications';
import { resolveDeviceImageSource } from '../../utils/images';
import { rf } from '../../utils/responsive';
import { tintFor } from '../shared/categoryTints';
import PageHeader, { HeaderIconButton } from '../../components/PageHeader';
import { selectShopId } from '../../store/authSlice';

// Same page as the Customer app's Buy home (BuyHomeScreen); listings, product
// details, orders, cart and notifications open the Partner screens.

// Partner app Buy palette — green #09AD2A, ink #1E1E1E, neutrals #F8F8F8 / #F3F3F3.
const GREEN = '#09AD2A';
const GREEN_DARK = '#078F23';   // green text / icons
const GREEN_LIGHT = '#EAF8EC';  // tiles, icon circles
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const HINT = '#8E8E8E';
const FIELD = '#F3F3F3';
const LINE = '#E6E6E6';
const PAGE_BG = '#F8F8F8';
const RED = '#F84141';

const MAX_W = 720;
const PAD = 16;

const cardShadow = {
  shadowColor: INK, shadowOpacity: 0.06, shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

// Display order for the strip (backend returns categories alphabetically).
// Unknown codes follow, alphabetically.
const CATEGORY_ORDER = [
  'MOBILE', 'SMARTPHONE', 'LAPTOP', 'TABLET', 'SMARTWATCH', 'SMARTWATCHES', 'WATCH',
  'AUDIO', 'AUDIO_DEVICE', 'AUDIO_DEVICES', 'ACCESSORY', 'ACCESSORIES',
];
function sortCategories(list) {
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf((c.code || '').toUpperCase());
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''));
}

// Trust strip — the same three claims this page made before, in the
// Partner strip layout.
const TRUST = [
  { icon: Tag, title: 'Best Prices', sub: 'Everyday' },
  { icon: BadgeCheck, title: 'Original', sub: '& Certified' },
  { icon: RotateCcw, title: 'Easy Returns', sub: '& Support' },
];

const SORTS = [
  { key: 'default', label: 'Recommended' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
];
const MAX_PRICES = [null, 10000, 20000, 30000, 50000];

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const imageOf = (x) => resolveDeviceImageSource({ url: x?.imageUrl, base64: x?.imageBase64 });

// Price + optional original price for a product. The discount and the
// struck-through price only render when the listing actually carries a
// higher original price — nothing is invented.
function pricing(p) {
  const price = Number(p?.price);
  const was = [p?.mrp, p?.originalPrice, p?.marketPrice, p?.listPrice]
    .map(Number)
    .find((v) => Number.isFinite(v) && v > 0);
  const hasPrice = Number.isFinite(price) && price > 0;
  const old = hasPrice && was > price ? was : null;
  const off = Number(p?.discountPercent) > 0
    ? Math.round(Number(p.discountPercent))
    : old ? Math.round(((old - price) / old) * 100) : 0;
  return { price: hasPrice ? price : null, old, off };
}

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native. Press feedback
// uses the `active:` className.
function CategoryChip({ label, size, isAll, active, uri, photo, code, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="active:opacity-80" style={{ width: size, marginRight: 10, alignItems: 'center' }}>
      <View
        style={{
          height: size, width: size, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isAll ? GREEN_LIGHT : tintFor(code), borderWidth: active ? 2 : 0, borderColor: GREEN_DARK,
        }}
      >
        {isAll ? (
          <LayoutGrid size={20} color={GREEN_DARK} />
        ) : uri ? (
          <Image resizeMethod="resize" source={{ uri }} style={photo ? { width: '86%', height: '86%' } : { width: size * 0.6, height: size * 0.6 }} resizeMode="contain" />
        ) : (
          <Smartphone size={20} color={GREEN_DARK} />
        )}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 4, fontSize: rf(10), textAlign: 'center', color: active ? GREEN_DARK : INK, fontWeight: active ? '800' : '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHead({ icon, title, onViewAll }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, marginTop: 18, marginBottom: 10 }}>
      {icon}
      <Text style={{ flex: 1, marginLeft: 6, fontSize: rf(13.5), fontWeight: '800', color: INK }}>{title}</Text>
      {onViewAll ? (
        <Pressable onPress={onViewAll} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontSize: rf(12), fontWeight: '800', color: GREEN_DARK }}>View all</Text>
          <ChevronRight size={15} color={GREEN_DARK} />
        </Pressable>
      ) : null}
    </View>
  );
}

// Vertical deal card (reference "Deals Of The Day" layout): condition badge,
// photo, ₹ OFF chip, 2-line title, spec chips, then -% · price · MRP.
// Only real listing fields are shown; discount bits need a real higher MRP.
function DealCard({ product, width, onPress, onAdd, adding }) {
  const { price, old, off } = pricing(product);
  const uri = imageOf(product);
  const badge = product.conditionLabel || product.condition;
  const chips = [product.storageLabel, product.color].filter(Boolean);
  const imgH = Math.round(width * 0.62);
  // The card body and the add-to-cart button are SIBLING tap targets — a button
  // nested inside another button is invalid on web (and ambiguous for screen readers).
  return (
    <View style={{ width, marginRight: 12, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, ...cardShadow }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={product.title || 'Product'}
        className="active:opacity-90"
        style={{ padding: 10 }}
      >
        <View style={{ height: 20, flexDirection: 'row', alignItems: 'center', paddingRight: 30 }}>
          {badge ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingLeft: 3, paddingRight: 7, paddingVertical: 2, backgroundColor: INK, maxWidth: '100%' }}>
              <BadgeCheck size={12} color={GREEN} />
              <Text numberOfLines={1} style={{ marginLeft: 3, fontSize: rf(8.5), fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3, flexShrink: 1 }}>
                {String(badge).toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ height: imgH, marginTop: 6, alignItems: 'center', justifyContent: 'center' }}>
          {uri ? (
            <Image resizeMethod="resize" source={{ uri }} style={{ width: '82%', height: '100%' }} resizeMode="contain" />
          ) : (
            <View style={{ width: imgH * 0.7, height: imgH * 0.7, borderRadius: 16, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={30} color={GREEN_DARK} />
            </View>
          )}
        </View>
        <View style={{ height: 22, marginTop: 8, justifyContent: 'center' }}>
          {old ? (
            <View style={{ alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: GREEN_LIGHT }}>
              <Text numberOfLines={1} style={{ fontSize: rf(10.5), fontWeight: '700', color: GREEN_DARK }}>{inr(old - price)} OFF</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={{ marginTop: 5, fontSize: rf(12), lineHeight: rf(16), minHeight: rf(32), fontWeight: '800', color: INK }}>
          {product.title || 'Device'}
        </Text>
        <View style={{ height: 22, marginTop: 5, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
          {chips.map((c, i) => (
            <View key={c} style={{ marginLeft: i ? 5 : 0, borderRadius: 4, borderWidth: 1, borderColor: LINE, paddingHorizontal: 5, paddingVertical: 1, flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: rf(10), fontWeight: '600', color: MUTED }}>{c}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: 8 }}>
          {off > 0 ? <Text style={{ fontSize: rf(13), fontWeight: '500', color: RED, marginRight: 6 }}>-{off}%</Text> : null}
          <Text numberOfLines={1} style={{ fontSize: rf(14), fontWeight: '800', color: INK, marginRight: 6 }}>{price != null ? inr(price) : 'Price on request'}</Text>
          {old ? <Text numberOfLines={1} style={{ fontSize: rf(10.5), color: HINT, textDecorationLine: 'line-through' }}>{inr(old)}</Text> : null}
        </View>
      </Pressable>
      <Pressable
        onPress={onAdd}
        disabled={adding}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Add to cart"
        className="active:opacity-80"
        style={{ position: 'absolute', top: 8, right: 8, height: 30, width: 30, borderRadius: 15, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center', opacity: adding ? 0.5 : 1 }}
      >
        <Plus size={16} color={GREEN_DARK} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

function OptionChip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-80"
      style={{
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8,
        backgroundColor: active ? GREEN : '#FFFFFF', borderWidth: 1, borderColor: active ? GREEN : LINE,
      }}
    >
      <Text style={{ fontSize: rf(12), fontWeight: '700', color: active ? '#FFFFFF' : INK }}>{label}</Text>
    </Pressable>
  );
}

export default function OwnerBuyHomeScreen({ navigation }) {
  const shopId = useSelector(selectShopId);
  const [cats, setCats] = useState([]);
  const [menuImages, setMenuImages] = useState({});
  const [buyBanners, setBuyBanners] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [adding, setAdding] = useState(null);
  const [slide, setSlide] = useState(0);
  // Banner width/height, read from the first banner image (2:1 until known).
  const [bannerRatio, setBannerRatio] = useState(2);
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('default');
  const [maxPrice, setMaxPrice] = useState(null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      try {
        const [list, banners, prods, imgs] = await Promise.all([
          getDeviceCategories(),
          getBanners().catch(() => []),
          listProducts({ status: 'ACTIVE' }).catch(() => []),
          getCategoryMenuImages('BUY', { includeInactive: true }),
        ]);
        setCats(sortCategories((list || []).filter((c) => c.isActive !== false)));
        setMenuImages(imgs || {});
        // Hero shows ONLY the admin banner(s) titled "Buy" (image only).
        setBuyBanners(
          (banners || [])
            .filter((b) => b.isActive !== false && String(b.title || '').trim().toLowerCase() === 'buy')
            .map((b) => ({ key: String(b.id), uri: imageOf(b) }))
            .filter((b) => b.uri),
        );
        // Not this shop's own listings — same rule as the Buy listing.
        setProducts((prods || []).filter((p) => !shopId || p.shopId !== shopId));
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const first = buyBanners[0]?.uri;
    if (!first) return;
    Image.getSize(first, (w, h) => { if (w > 0 && h > 0) setBannerRatio(w / h); }, () => {});
  }, [buyBanners]);

  // Header counters refresh whenever the tab regains focus.
  const refreshHeader = useCallback(async () => {
    const [cart, count] = await Promise.all([
      getCart().catch(() => null),
      getUnreadCount().catch(() => null),
    ]);
    if (cart) setCartCount(cart.reduce((n, it) => n + (it.quantity || 1), 0));
    if (count != null) setUnread(Number(count) || 0);
  }, []);
  useFocusEffect(useCallback(() => { refreshHeader(); }, [refreshHeader]));

  const openCategory = (c) => {
    navigation.navigate('OwnerBuyListing', {
      categoryId: c.id,
      categoryCode: (c.code || '').toUpperCase(),
      categoryName: c.name,
      title: c.name,
    });
  };
  const openAll = () => navigation.navigate('OwnerBuyListing', {});

  const activeFilters = (sortBy !== 'default' ? 1 : 0) + (maxPrice ? 1 : 0);
  // Search text + Filters go to the listing (q / sort / maxPrice params).
  const runSearch = () => {
    const q = searchText.trim();
    if (!q && !activeFilters) { openAll(); return; }
    navigation.navigate('OwnerBuyListing', {
      q: q || undefined,
      sort: sortBy !== 'default' ? sortBy : undefined,
      maxPrice: maxPrice || undefined,
      title: q || (maxPrice ? `Under ${inr(maxPrice)}` : 'All products'),
    });
  };

  const add = async (p) => {
    setAdding(p.id);
    try {
      await addToCart(p.id, 1);
      notify('Added', 'Added to cart');
      refreshHeader();
    } catch (e) { notify('Error', e.message); }
    finally { setAdding(null); }
  };

  const contentW = Math.min(width, MAX_W);
  const bannerW = contentW - PAD * 2;
  const bannerH = Math.round(bannerW / bannerRatio);
  const chipSize = width < 360 ? 50 : 56;
  // Two deal cards per screen with the next one peeking in (reference layout).
  const dealW = Math.max(150, Math.round((contentW - PAD - 12) / 2.15));
  const centered = { width: '100%', maxWidth: MAX_W, alignSelf: 'center' };

  // Deals: listings with a real discount first (largest first), then the rest.
  const deals = [...products]
    .sort((a, b) => pricing(b).off - pricing(a).off)
    .slice(0, 3);

  const onBannerScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (bannerW || 1));
    if (i !== slide) setSlide(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      {/* ---------- Header: back · Buy · bell + cart, then search + Filters ---------- */}
      <PageHeader
        title="Buy"
        subtitle="Devices & spares"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
        sideWidth={120}
        right={(
          <>
            <HeaderIconButton icon={ClipboardList} label="My buy orders" onPress={() => navigation.navigate('MarketplaceOrders', { initialTab: 'Buy' })} />
            <View style={{ width: 6 }} />
            <HeaderIconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('OwnerNotifications')} badge={unread} badgeColor="#EF4444" />
            <View style={{ width: 6 }} />
            <HeaderIconButton icon={ShoppingCart} label="Cart" onPress={() => navigation.navigate('OwnerCart')} badge={cartCount} badgeColor="#F59E0B" badgeText={INK} />
          </>
        )}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: FIELD, borderRadius: 16, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14, height: 46 }}>
            <Pressable onPress={() => runSearch()} hitSlop={6} accessibilityLabel="Search">
              <Search size={18} color={GREEN} />
            </Pressable>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={() => runSearch()}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Search mobiles, spares, accessories..."
              placeholderTextColor={HINT}
              style={{ flex: 1, marginLeft: 10, color: INK, fontSize: rf(13), padding: 0, outlineStyle: 'none' }}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText('')} hitSlop={6} accessibilityLabel="Clear search" style={{ height: 28, width: 28, alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} color={MUTED} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setShowFilters(true)}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            className="active:opacity-80"
            style={{
              marginLeft: 8, height: 46, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center',
              backgroundColor: activeFilters > 0 ? GREEN : '#FFFFFF', borderWidth: 1, borderColor: activeFilters > 0 ? GREEN : LINE,
            }}
          >
            <SlidersHorizontal size={16} color={activeFilters > 0 ? '#FFFFFF' : INK} />
            <Text style={{ marginLeft: 6, fontSize: rf(13), fontWeight: '800', color: activeFilters > 0 ? '#FFFFFF' : INK }}>Filters</Text>
            {activeFilters > 0 ? (
              <View style={{ marginLeft: 6, paddingHorizontal: 6, borderRadius: 999, backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontSize: rf(10), fontWeight: '800', color: GREEN_DARK }}>{activeFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </PageHeader>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={centered}>
          {/* Hero — admin "Buy" banner artwork only (its text is baked in). */}
          {buyBanners.length ? (
            <View style={{ marginTop: 14 }}>
              <View style={{ marginHorizontal: PAD, height: bannerH, borderRadius: 24, overflow: 'hidden', backgroundColor: '#FFFFFF', ...cardShadow }}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={onBannerScroll}
                  scrollEventThrottle={16}
                  style={{ width: bannerW, height: bannerH, flexGrow: 0 }}
                >
                  {buyBanners.map((b) => (
                    <Pressable
                      key={b.key}
                      onPress={openAll}
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Buy offer banner"
                      style={{ width: bannerW, height: bannerH }}
                    >
                      <Image resizeMethod="resize" source={{ uri: b.uri }} style={{ width: bannerW, height: bannerH }} resizeMode="contain" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              {buyBanners.length > 1 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                  {buyBanners.map((b, i) => (
                    <View
                      key={b.key}
                      style={{ height: 6, width: i === slide ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === slide ? GREEN : '#D6D6D6' }}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Category strip — "All" plus each category; tapping opens its listing. */}
          {loading ? (
            <View style={{ paddingVertical: 24 }}><Loader label="Loading categories..." /></View>
          ) : cats.length === 0 ? (
            <View style={{ paddingHorizontal: PAD, paddingTop: 14 }}>
              <EmptyState title="No categories yet" description="The admin hasn't published any device categories." />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 16, paddingBottom: 2 }}>
              <CategoryChip label="All" isAll active size={chipSize} onPress={openAll} />
              {cats.map((c) => {
                const menuUri = menuImages[categoryMenuKey(c.name)] || menuImages[categoryMenuKey(c.code)] || null;
                return (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    code={c.code}
                    size={chipSize}
                    uri={menuUri || imageOf(c)}
                    photo={!!menuUri}
                    onPress={() => openCategory(c)}
                  />
                );
              })}
            </ScrollView>
          )}

          {deals.length ? (
            <>
              <SectionHead icon={<TrendingUp size={17} color={GREEN_DARK} />} title="Deals for You" onViewAll={openAll} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: 4 }}>
                {deals.map((p) => (
                  <DealCard
                    key={p.id}
                    product={p}
                    width={dealW}
                    adding={adding === p.id}
                    onPress={() => navigation.navigate('OwnerBuyListingDetails', { listing: p })}
                    onAdd={() => add(p)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Trust strip */}
          <View style={{ paddingHorizontal: PAD, marginTop: 14 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 6, ...cardShadow }}>
              {TRUST.map((t) => {
                const Icon = t.icon;
                return (
                  <View key={t.title} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 2 }}>
                    <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                      <Icon size={17} color={GREEN} strokeWidth={2.3} />
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: rf(10.5), fontWeight: '800', color: INK, textAlign: 'center' }}>{t.title}</Text>
                    <Text numberOfLines={1} style={{ fontSize: rf(9), color: MUTED, textAlign: 'center', marginTop: 1 }}>{t.sub}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Filters sheet — Sort + Max price, applied to the listing (with any search text). */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(16,24,20,0.45)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} accessibilityLabel="Close filters" />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ flex: 1, fontSize: rf(14), fontWeight: '800', color: INK }}>Filters</Text>
              <Pressable onPress={() => setShowFilters(false)} hitSlop={8} accessibilityLabel="Close" style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: FIELD, alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} color={INK} />
              </Pressable>
            </View>
            <Text style={{ fontSize: rf(12), fontWeight: '800', color: MUTED, marginBottom: 8 }}>Sort by</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {SORTS.map((s) => <OptionChip key={s.key} label={s.label} active={sortBy === s.key} onPress={() => setSortBy(s.key)} />)}
            </View>
            <Text style={{ fontSize: rf(12), fontWeight: '800', color: MUTED, marginTop: 8, marginBottom: 8 }}>Max price</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {MAX_PRICES.map((v) => <OptionChip key={String(v)} label={v ? `Under ${inr(v)}` : 'Any'} active={maxPrice === v} onPress={() => setMaxPrice(v)} />)}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Pressable
                onPress={() => { setSortBy('default'); setMaxPrice(null); }}
                className="active:opacity-70"
                style={{ flex: 1, marginRight: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE }}
              >
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: INK }}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowFilters(false); runSearch(); }}
                className="active:opacity-90"
                style={{ flex: 1, marginLeft: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: GREEN }}
              >
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: '#FFFFFF' }}>Show results</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
