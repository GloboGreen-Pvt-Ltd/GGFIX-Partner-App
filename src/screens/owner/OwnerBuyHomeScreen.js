import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  Search, ShoppingCart, Bell, ChevronRight, X, Plus, SlidersHorizontal,
  LayoutGrid, BadgeCheck, TrendingUp, Smartphone, ClipboardList, ArrowRight, Cpu, UserRound, Wrench,
} from 'lucide-react-native';
import { EmptyState, Loader } from '../../components/rnr';
import { notify } from '../../components/confirm';
import SafeModal from '../../components/SafeModal';
import { getDeviceCategories, getBanners, getCategoryMenuImages, categoryMenuKey, getAllModels } from '../../api/masterData';
import { listProducts, getCart, addToCart } from '../../api/marketplace';
import { isOwnListing, ownShopIdsOf } from '../../api/nearbyListings';
import { getSession } from '../../auth/session';
import { getUnreadCount } from '../../api/notifications';
import { resolveDeviceImageSource } from '../../utils/images';
import { rf } from '../../utils/responsive';
import { fetchNearbyListings, getListingOrigin, toListingCard } from '../../api/nearbyListings';
import { LeadCard } from './buy/BuyLeadsScreen';
import { purchaseHero } from './buy/PurchaseWorkflow';
import { listMyLeadQuotes, listShopPurchases } from '../../api/orders';
import { tintFor } from '../shared/categoryTints';
import PageHeader, { HeaderIconButton } from '../../components/PageHeader';
import { selectShopId } from '../../store/authSlice';
import { useTabBarSpace } from '../../navigation/tabBarMetrics';
import { productToCard } from './OwnerBuyListingScreen';

// Same page as the Customer app's Buy home (BuyHomeScreen); listings, product
// details, orders, cart and notifications open the Partner screens.

// Partner app Buy palette — green #035C6C, ink #111111, neutrals #F3F4F6 / #F3F4F6.
const GREEN = '#035C6C';
const GREEN_DARK = '#035C6C';   // green text / icons
const GREEN_LIGHT = '#E5F3F5';  // tiles, icon circles
const INK = '#111111';
const MUTED = '#6B7280';
const HINT = '#9CA3AF';
const FIELD = '#F3F4F6';
const LINE = '#E5E7EB';
const CARD_LINE = '#CBD5E1';    // card borders (darker than LINE so cards read as cards)
const PAGE_BG = '#F3F4F6';
const RED = '#F84141';

const MAX_W = 720;
const PAD = 12; // tighter gutter beside the category rail

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
export function sortCategories(list) {
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf((c.code || '').toUpperCase());
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''));
}

const SORTS = [
  { key: 'default', label: 'Recommended' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
];
const MAX_PRICES = [null, 10000, 20000, 30000, 50000];

// Rail selection: 'ALL', a category id, or Spares — filtered in place (like Job Report).
const SPARES = '__spares';
const QUOTE_TAG = { PROPOSED: 'Quote Sent', REJECTED: 'Quote Declined', EXPIRED: 'Quote Expired', ACCEPTED: 'Quote Accepted', WITHDRAWN: 'Quote Withdrawn' };
const parseJson = (s) => { try { return s ? JSON.parse(s) : {}; } catch (_) { return {}; } };

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
function CategoryChip({ label, size, cellW, isAll, active, uri, photo, code, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="active:opacity-80" style={{ width: cellW, alignItems: 'center' }}>
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
    <View style={{ width, marginRight: 12, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: CARD_LINE, ...cardShadow }}>
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
  // The tab bar floats over the page; keep the last items clear of it.
  const tabSpace = useTabBarSpace();
  const shopId = useSelector(selectShopId);
  const [cats, setCats] = useState([]);
  const [menuImages, setMenuImages] = useState({});
  const [buyBanners, setBuyBanners] = useState([]);
  const [products, setProducts] = useState([]);
  // Every nearby sell listing — customer and shop (GET /marketplace/buy/nearby).
  const [leads, setLeads] = useState([]);
  const [buys, setBuys] = useState({}); // listingId → my purchase (accepted quote)
  const [quotes, setQuotes] = useState({}); // listingId → my quote status
  const [selCat, setSelCat] = useState('ALL');
  // Products carry a modelId, not a category: mapped through the catalogue.
  const [modelCat, setModelCat] = useState({});
  const listRef = useRef(null);
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
        const [list, banners, prods, imgs, session] = await Promise.all([
          getDeviceCategories(),
          getBanners().catch(() => []),
          listProducts({ status: 'ACTIVE' }).catch(() => []),
          getCategoryMenuImages('BUY', { includeInactive: true }),
          getSession().catch(() => null),
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
        // None of the owner's own shops' listings — same rule as the Buy listing.
        const own = { shopId, sellerId: session?.userId, ownShopIds: ownShopIdsOf(session, shopId) };
        setProducts((prods || []).filter((p) => !isOwnListing(own, p)));
      } catch (_) {}
      setLoading(false);
    })();
    getAllModels().then((rows) => {
      const m = {};
      (rows || []).forEach((r) => { if (r.id && r.categoryId) m[r.id] = r.categoryId; });
      setModelCat(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const first = buyBanners[0]?.uri;
    if (!first) return;
    Image.getSize(first, (w, h) => { if (w > 0 && h > 0) setBannerRatio(w / h); }, () => {});
  }, [buyBanners]);

  useFocusEffect(useCallback(() => {
    getListingOrigin()
      .then((o) => fetchNearbyListings(o))
      .then((list) => setLeads((list || []).filter(Boolean)))
      .catch(() => {});
    listShopPurchases()
      .then((rows) => setBuys(Object.fromEntries((rows || []).filter((r) => r?.listingId).map((r) => [String(r.listingId), r]))))
      .catch(() => {});
    listMyLeadQuotes()
      .then((rows) => setQuotes(Object.fromEntries((rows || []).filter((r) => r?.listingId).map((r) => [String(r.listingId), r]))))
      .catch(() => {});
  }, []));

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

  // Rail taps filter this page in place — no navigation.
  const pickCat = (id) => {
    setSelCat(id);
    listRef.current?.scrollTo({ y: 0, animated: false });
  };
  const openAll = () => pickCat('ALL');

  const activeFilters = (sortBy !== 'default' ? 1 : 0) + (maxPrice ? 1 : 0);
  // Search text + Filters also apply in place (see `feed` below).
  const runSearch = () => Keyboard.dismiss();

  // Category match: the row's category id, else its category name/code.
  const sel = cats.find((c) => c.id === selCat);
  const selKeys = [sel?.name, sel?.code].filter(Boolean).map((v) => String(v).toLowerCase());
  const inCat = (spare, catId, names) => {
    if (selCat === 'ALL') return true;
    if (selCat === SPARES) return spare;
    if (spare) return false;
    return catId ? String(catId) === String(selCat) : names.some((v) => v && selKeys.includes(String(v).toLowerCase()));
  };
  const productCat = (p) => {
    const meta = parseJson(p.assessmentJson);
    const lc = meta?.listing?.category || {};
    const spare = p.descriptionType === 'SPARE_PARTS' || meta?.sellMeta?.listingType === 'SPARE_PART';
    return { spare, id: lc.id || modelCat[p.modelId] || null, names: [lc.name, lc.code] };
  };
  const catProducts = products.filter((p) => { const c = productCat(p); return inCat(c.spare, c.id, c.names); });

  // One list: shop catalogue products + nearby customer / shop sell listings.
  const needle = searchText.trim().toLowerCase();
  const feed = [
    ...catProducts.filter((p) => (p.type || 'SELL') === 'SELL')
      .map((p) => ({ ...productToCard(p), categoryId: productCat(p).id, createdAt: p.createdAt })),
    ...leads.filter((l) => inCat(l.productType === 'SPARE_PART', l.categoryId ?? l.category?.id, [l.categoryName, l.categoryCode, l.category?.name])),
  ].filter((it) => {
    if (needle && !`${it.productName || ''} ${it.description || ''}`.toLowerCase().includes(needle)) return false;
    if (maxPrice && !(Number(it.expectedPrice) > 0 && Number(it.expectedPrice) <= maxPrice)) return false;
    return true;
  });
  const priceOf = (it) => Number(it.expectedPrice) || 0;
  if (sortBy === 'price_asc') feed.sort((a, b) => priceOf(a) - priceOf(b));
  else if (sortBy === 'price_desc') feed.sort((a, b) => priceOf(b) - priceOf(a));
  else feed.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const openItem = (it) => {
    if (it.sellerType === 'CUSTOMER') { navigation.navigate('BuyLeadDetail', { lead: it }); return; }
    const card = it.source === 'product' ? it : toListingCard(it);
    navigation.navigate('OwnerBuyListingDetails', {
      listing: { ...card, categoryName: it.categoryName || cats.find((c) => c.id === it.categoryId)?.name || undefined },
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

  // Left category rail — same widths as the Job Report rail.
  const railW = width >= 680 ? 104 : (width < 360 ? 70 : 78);
  const railChip = railW - 22;
  const contentW = Math.min(width - railW, MAX_W);
  const bannerW = contentW - PAD * 2;
  // Scales with the space beside the category rail: follows the admin banner's
  // shape, kept between 40% and 60% of the width (min 120px, max 240px).
  const bannerH = Math.round(Math.max(120, Math.min(240, bannerW * 0.6, Math.max(bannerW * 0.4, bannerW / bannerRatio))));
  const heroTitle = Math.max(15, Math.min(rf(24), bannerW * 0.07));
  const heroSmall = bannerW < 340;
  const heroImage = menuImages[categoryMenuKey('Mobile')] || 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Phone.png';
  // Two deal cards per screen with the next one peeking in (reference layout).
  const dealW = Math.max(150, Math.round((contentW - PAD - 12) / 2.15));
  const centered = { width: '100%', maxWidth: MAX_W, alignSelf: 'center' };

  // Deals: listings with a real discount first (largest first), then the rest.
  const deals = [...catProducts]
    .sort((a, b) => pricing(b).off - pricing(a).off)
    .slice(0, 3);

  const onBannerScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (bannerW - 2 || 1));
    if (i !== slide) setSlide(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      {/* ---------- Header: back · Buy · bell + cart, then search + Filters ---------- */}
      <PageHeader
        title="Buy"
        subtitle="Devices & spares"
        sideWidth={90}
        right={(
          <>
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
            <Text style={{ marginLeft: 6, fontSize: rf(13), fontWeight: '800', color: activeFilters > 0 ? '#FFFFFF' : INK }} numberOfLines={1}>Filters</Text>
            {activeFilters > 0 ? (
              <View style={{ marginLeft: 6, paddingHorizontal: 6, borderRadius: 999, backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontSize: rf(10), fontWeight: '800', color: GREEN_DARK }}>{activeFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </PageHeader>

      <View style={{ flex: 1, flexDirection: 'row' }}>
            {/* Category strip — "All" plus each category; tapping filters this page. */}
            {loading ? (
              <View style={{ width: railW, paddingVertical: 24 }}><Loader /></View>
            ) : cats.length === 0 ? (
              <View style={{ width: railW }}>
                <EmptyState title="No categories yet" description="The admin hasn't published any device categories." />
              </View>
            ) : (
              // Vertical left rail, like Job Report.
              <ScrollView style={{ width: railW, flexGrow: 0, borderRightWidth: 1, borderRightColor: LINE, backgroundColor: '#FFFFFF' }} contentContainerStyle={{ alignItems: 'center', rowGap: 12, paddingVertical: 10, paddingBottom: tabSpace }} showsVerticalScrollIndicator={false}>
                <CategoryChip label="All" isAll active={selCat === 'ALL'} size={railChip} cellW={railW - 8} onPress={openAll} />
                {cats.map((c) => {
                  const menuUri = menuImages[categoryMenuKey(c.name)] || menuImages[categoryMenuKey(c.code)] || null;
                  return (
                    <CategoryChip
                      key={c.id}
                      label={c.name}
                      code={c.code}
                      size={railChip}
                      cellW={railW - 8}
                      uri={menuUri || imageOf(c)}
                      photo={!!menuUri}
                      active={selCat === c.id}
                      onPress={() => pickCat(c.id)}
                    />
                  );
                })}
                <CategoryChip label="Spares" code="SPARES" size={railChip} cellW={railW - 8} uri={null} active={selCat === SPARES} onPress={() => pickCat(SPARES)} />
              </ScrollView>
            )}

      <ScrollView ref={listRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: tabSpace }}>
        <View style={centered}>
          {/* Hero: the Buy promo first, then any admin "Buy" banners. */}
          {true ? (
            <View style={{ marginTop: 14 }}>
              <View style={{ marginHorizontal: PAD, height: bannerH, borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: CARD_LINE, ...cardShadow }}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={onBannerScroll}
                  scrollEventThrottle={16}
                  style={{ width: bannerW - 2, height: bannerH - 2, flexGrow: 0 }}
                >
                  <View style={{ width: bannerW - 2, height: bannerH - 2, flexDirection: 'row', backgroundColor: '#EEF6FB' }}>
                    <View style={{ position: 'absolute', right: -30, top: -40, height: bannerH * 1.1, width: bannerH * 1.1, borderRadius: bannerH, backgroundColor: '#DCEFF6' }} />
                    <View style={{ flex: 1, paddingLeft: bannerW > 500 ? 28 : (heroSmall ? 12 : 16), paddingVertical: 10, justifyContent: 'center' }}>
                      <Text style={{ fontSize: rf(11), fontWeight: '800', color: GREEN }}>GGFIX</Text>
                      <Text numberOfLines={2} adjustsFontSizeToFit style={{ fontSize: heroTitle, fontWeight: '800', color: '#0B2A4A', lineHeight: Math.round(heroTitle * 1.2), marginTop: 4 }}>Buy Devices{'\n'}<Text style={{ color: GREEN }}>& Spares</Text></Text>
                      {heroSmall ? null : <Text numberOfLines={1} style={{ fontSize: rf(11), color: MUTED, marginTop: 4 }}>Phones • Parts • Leads</Text>}
                      <Pressable onPress={openAll} accessibilityRole="button" accessibilityLabel="Shop now" className="active:opacity-90" style={{ alignSelf: 'flex-start', marginTop: heroSmall ? 8 : 10, flexDirection: 'row', alignItems: 'center', backgroundColor: GREEN, borderRadius: 999, paddingHorizontal: heroSmall ? 10 : 14, paddingVertical: heroSmall ? 5 : 7 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: heroSmall ? rf(11) : rf(12), fontWeight: '800', marginRight: 6 }}>Shop Now</Text>
                        <ArrowRight size={13} color="#FFFFFF" />
                      </Pressable>
                    </View>
                    <View style={{ width: Math.min(bannerW * 0.38, bannerH * 1.2), alignItems: 'center', justifyContent: 'center', marginRight: bannerW > 500 ? 16 : 4 }}>
                      <Image resizeMethod="resize" source={{ uri: heroImage }} style={{ width: '100%', height: bannerH * 0.86 }} resizeMode="contain" />
                    </View>
                  </View>
                  {buyBanners.map((b) => (
                    <Pressable
                      key={b.key}
                      onPress={openAll}
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Buy offer banner"
                      style={{ width: bannerW - 2, height: bannerH - 2 }}
                    >
                      {/* cover: fills the frame (no white bars); the height above follows the artwork's shape. */}
                      <Image resizeMethod="resize" source={{ uri: b.uri }} style={{ width: bannerW - 2, height: bannerH - 2 }} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              {buyBanners.length ? (
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                  {[{ key: 'promo' }, ...buyBanners].map((b, i) => (
                    <View
                      key={b.key}
                      style={{ height: 6, width: i === slide ? 18 : 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === slide ? GREEN : '#D1D5DB' }}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

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
                    onPress={() => navigation.navigate('OwnerBuyListingDetails', { listing: productToCard(p) })}
                    onAdd={() => add(p)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Customer + shop sell listings for the selected category. */}
          <View style={{ paddingHorizontal: PAD, paddingTop: 14 }}>
            {feed.map((it) => (
              <LeadCard
                key={it._key || `listing:${it.id}`}
                l={it}
                tag={it.sellerType !== 'CUSTOMER' ? 'From Shop'
                  : buys[String(it.id)] ? purchaseHero(buys[String(it.id)]).title
                    : QUOTE_TAG[String(quotes[String(it.id)]?.quotationStatus || '').toUpperCase()] || 'For Customer'}
                onPress={() => openItem(it)}
                navigation={it.sellerType === 'CUSTOMER' ? navigation : undefined}
                quoteStatus={quotes[String(it.id)]?.quotationStatus}
                purchase={buys[String(it.id)]}
              />
            ))}
            {!loading && !feed.length ? (
              <EmptyState
                title="No devices found"
                description={needle || activeFilters || selCat !== 'ALL' ? 'Try another category, search or filter.' : 'No customer or shop listings yet.'}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
      </View>

      {/* Filters sheet — Sort + Max price, applied to the listing (with any search text). */}
      <SafeModal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(17, 17, 17,0.45)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} accessibilityLabel="Close filters" />
          {/* Pads this modal window's own nav-bar / home-indicator inset. */}
          {/* Tablets: capped and centred rather than spanning the screen. */}
          <SafeAreaView edges={['bottom']} style={{ width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}>
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
                onPress={() => setShowFilters(false)}
                className="active:opacity-90"
                style={{ flex: 1, marginLeft: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: GREEN }}
              >
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: '#FFFFFF' }}>Show results</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeModal>
    </View>
  );
}
