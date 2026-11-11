import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';
import {
  ArrowLeft, Bell, Cable, ChevronRight, Eye, FileText, Headphones, Laptop, LayoutGrid, MapPin, Package,
  Search, Settings, ShieldCheck, SlidersHorizontal, Smartphone, Store, Tablet, Truck, UserRound, Watch, X,
} from 'lucide-react-native';
import { EmptyState, Loader } from '../../components/rnr';
import SafeModal from '../../components/SafeModal';
import { getDeviceCategories, getBanners, getCategoryMenuImages, categoryMenuKey, getAllModels } from '../../api/masterData';
import { listProducts } from '../../api/marketplace';
import { isOwnListing, ownShopIdsOf } from '../../api/nearbyListings';
import { getSession } from '../../auth/session';
import { getUnreadCount } from '../../api/notifications';
import { resolveDeviceImageSource } from '../../utils/images';
import { rf } from '../../utils/responsive';
import { fetchNearbyListings, getListingOrigin, toListingCard } from '../../api/nearbyListings';
import { leadPrice, openPickupTracking } from './buy/BuyLeadsScreen';
import { purchaseHero } from './buy/PurchaseWorkflow';
import { listMyLeadQuotes, listShopPurchases } from '../../api/orders';
import { selectShopId } from '../../store/authSlice';
import { useTabBarSpace } from '../../navigation/tabBarMetrics';
import { productToCard } from './OwnerBuyListingScreen';

// Partner Buy home: header, search + Filters, left category rail, promo banner,
// status chips (All · For Quote · In Progress · Completed) and lead cards with
// View · Quote · Pickup · Track. Listings, details and orders open the Partner screens.

const TEAL = '#035C6C';
const TEAL_LIGHT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const HINT = '#9CA3AF';
const FIELD = '#F3F4F6';
const LINE = '#E5E7EB';
const PAGE_BG = '#F7F9FA';
const ORANGE = '#E8590C';
const RED = '#EF4444';

const MAX_W = 720;
const PAD = 10;

const cardShadow = {
  shadowColor: INK, shadowOpacity: 0.06, shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 }, elevation: 2,
};

// Display order for the rail (backend returns categories alphabetically).
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

// Line icon per category (rail), matched on code / name.
const CAT_ICONS = [
  [/MOBILE|SMARTPHONE|PHONE/, Smartphone], [/LAPTOP|NOTEBOOK/, Laptop], [/TABLET|IPAD/, Tablet],
  [/WATCH/, Watch], [/AUDIO|HEADPHONE|EARBUD|SPEAKER/, Headphones], [/ACCESSOR|CHARGER|CABLE/, Cable],
];
const catIcon = (c) => {
  const k = `${c?.code || ''} ${c?.name || ''}`.toUpperCase();
  return (CAT_ICONS.find(([re]) => re.test(k)) || [null, Package])[1];
};

const SORTS = [
  { key: 'default', label: 'Recommended' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
];
const MAX_PRICES = [null, 10000, 20000, 30000, 50000];

// Status chips over the lead list.
const STAGES = [
  { key: 'ALL', label: 'All' },
  { key: 'QUOTE', label: 'For Quote' },
  { key: 'PROGRESS', label: 'In Progress' },
  { key: 'DONE', label: 'Completed' },
];

// Rail selection: 'ALL', a category id, or Spares — filtered in place.
const SPARES = '__spares';
const QUOTE_TAG = { PROPOSED: 'Quote Sent', REJECTED: 'Quote Declined', EXPIRED: 'Quote Expired', ACCEPTED: 'Quote Accepted', WITHDRAWN: 'Quote Withdrawn' };
const parseJson = (s) => { try { return s ? JSON.parse(s) : {}; } catch (_) { return {}; } };

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const imageOf = (x) => resolveDeviceImageSource({ url: x?.imageUrl, base64: x?.imageBase64 });
// "8 GB | 128 GB | Green" from the listing's colour / RAM / storage description.
const specLine = (it) => String(it?.description || '').split(/\s*[·|/,]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4).join('  |  ');

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native. Press feedback
// uses the `active:` className.
function RailItem({ label, Icon, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      className="active:opacity-80"
      style={{
        alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 3, borderRadius: 16,
        backgroundColor: active ? TEAL : 'transparent', ...(active ? cardShadow : null),
      }}
    >
      <Icon size={26} color={active ? '#FFFFFF' : TEAL} strokeWidth={1.8} />
      <Text numberOfLines={2} style={{ marginTop: 6, fontSize: rf(10.5), lineHeight: rf(13), textAlign: 'center', fontWeight: active ? '800' : '600', color: active ? '#FFFFFF' : INK }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StageChip({ label, count, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!active }}
      className="active:opacity-80"
      style={{
        height: 38, paddingHorizontal: 16, marginRight: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? TEAL : '#FFFFFF', borderWidth: 1, borderColor: active ? TEAL : LINE,
      }}
    >
      <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: active ? '#FFFFFF' : INK }} numberOfLines={1}>{`${label} (${count})`}</Text>
    </Pressable>
  );
}

function CardAction({ Icon, text, label, onPress, disabled, first }) {
  return (
    <>
      {first ? null : <View style={{ width: 1, height: 22, backgroundColor: LINE }} />}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={disabled ? 'Available after the customer accepts your quote' : undefined}
        accessibilityState={{ disabled: !!disabled }}
        className={disabled ? '' : 'active:opacity-70'}
        style={{
          flex: 1, height: 36, marginHorizontal: 3, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: disabled ? FIELD : 'transparent',
        }}
      >
        <Icon size={16} color={disabled ? HINT : TEAL} strokeWidth={2} />
        <Text numberOfLines={1} style={{ marginLeft: 5, fontSize: rf(12), fontWeight: '800', color: disabled ? HINT : TEAL }}>{text}</Text>
      </Pressable>
    </>
  );
}

// Lead / listing card: photo, status tag, title, specs, expected price, chevron;
// customer leads add View · Quote · Pickup · Track (Pickup / Track after the quote is accepted).
function HomeLeadCard({ it, tag, accepted, purchase, navigation, onOpen }) {
  const customer = it.sellerType === 'CUSTOMER';
  const price = leadPrice(it);
  const specs = specLine(it);
  const TagIcon = tag.Icon;
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: LINE, marginBottom: 10, ...cardShadow }}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={it.productName || 'Device'} className="active:opacity-90" style={{ flexDirection: 'row', alignItems: 'center', padding: 10 }}>
        <View style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: '#F3F5F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {it.productImage ? (
            <Image resizeMethod="resize" source={{ uri: it.productImage }} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
          ) : (
            <Smartphone size={28} color={TEAL} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: tag.tint, maxWidth: '100%' }}>
            <TagIcon size={13} color={tag.fg} strokeWidth={2.2} />
            <Text numberOfLines={1} style={{ marginLeft: 5, fontSize: rf(11), fontWeight: '800', color: tag.fg, flexShrink: 1 }}>{tag.text}</Text>
          </View>
          <Text numberOfLines={1} style={{ marginTop: 5, fontSize: rf(14.5), fontWeight: '800', color: INK }}>{it.productName || 'Device'}</Text>
          {specs ? <Text numberOfLines={1} style={{ marginTop: 2, fontSize: rf(12), color: MUTED }}>{specs}</Text> : null}
          <Text numberOfLines={1} style={{ marginTop: 3, fontSize: rf(12.5), color: INK }}>
            Exp: <Text style={{ fontWeight: '800', color: price ? TEAL : ORANGE }}>{price || 'Open for quote'}</Text>
          </Text>
        </View>
        <ChevronRight size={20} color={INK} style={{ marginLeft: 6 }} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginBottom: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: LINE }}>
        <CardAction first Icon={Eye} text="View" label="View product detail" onPress={customer ? () => navigation.navigate('BuyLeadDetail', { lead: it, mode: 'detail' }) : onOpen} />
        {customer ? (
          <>
            <CardAction Icon={FileText} text="Quote" label="Product quotation" onPress={() => navigation.navigate('BuyLeadDetail', { lead: it, mode: 'quote' })} />
            <CardAction Icon={Truck} text="Pickup" label="Pickup" disabled={!accepted} onPress={() => navigation.navigate('BuyLeadQuote', { lead: it })} />
            <CardAction Icon={MapPin} text="Track" label="Track pickup" disabled={!accepted} onPress={() => openPickupTracking(navigation, it, purchase)} />
          </>
        ) : null}
      </View>
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
        backgroundColor: active ? TEAL : '#FFFFFF', borderWidth: 1, borderColor: active ? TEAL : LINE,
      }}
    >
      <Text style={{ fontSize: rf(12), fontWeight: '700', color: active ? '#FFFFFF' : INK }}>{label}</Text>
    </Pressable>
  );
}

export default function OwnerBuyHomeScreen({ navigation }) {
  // The tab bar floats over the page; keep the last items clear of it.
  const tabSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
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
  const [stage, setStage] = useState('ALL');
  // Products carry a modelId, not a category: mapped through the catalogue.
  const [modelCat, setModelCat] = useState({});
  const listRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [slide, setSlide] = useState(0);
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
        // Extra slides: ONLY the admin banner(s) titled "Buy" (image only).
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
    getUnreadCount().then((n) => { if (n != null) setUnread(Number(n) || 0); }).catch(() => {});
  }, []));

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

  // Stage of a customer lead: For Quote (no accepted quote yet), In Progress
  // (accepted / purchase running), Completed (purchase completed). Shop listings
  // and cancelled purchases show under All only.
  const quoteOf = (it) => String(quotes[String(it.id)]?.quotationStatus || '').toUpperCase();
  const stageOf = (it) => {
    if (it.sellerType !== 'CUSTOMER') return null;
    const b = buys[String(it.id)];
    const s = String(b?.status || '').toUpperCase();
    if (b) return s === 'COMPLETED' ? 'DONE' : s === 'CANCELLED' ? null : 'PROGRESS';
    return quoteOf(it) === 'ACCEPTED' ? 'PROGRESS' : 'QUOTE';
  };
  const stageCount = (k) => (k === 'ALL' ? feed.length : feed.filter((it) => stageOf(it) === k).length);
  const shown = stage === 'ALL' ? feed : feed.filter((it) => stageOf(it) === stage);

  const tagFor = (it) => {
    if (it.sellerType !== 'CUSTOMER') return { Icon: Store, text: 'From Shop', tint: TEAL_LIGHT, fg: TEAL };
    const b = buys[String(it.id)];
    if (b) { const h = purchaseHero(b); return { Icon: h.Icon, text: h.title, tint: h.tint, fg: h.fg }; }
    const q = QUOTE_TAG[quoteOf(it)];
    if (q) return { Icon: FileText, text: q, tint: '#E8F4FB', fg: '#0788C9' };
    return { Icon: UserRound, text: 'For Customer', tint: '#FFF1E0', fg: '#B45309' };
  };

  const openItem = (it) => {
    if (it.sellerType === 'CUSTOMER') { navigation.navigate('BuyLeadDetail', { lead: it }); return; }
    const card = it.source === 'product' ? it : toListingCard(it);
    navigation.navigate('OwnerBuyListingDetails', {
      listing: { ...card, categoryName: it.categoryName || cats.find((c) => c.id === it.categoryId)?.name || undefined },
    });
  };

  // Left category rail.
  const railW = width >= 680 ? 104 : (width < 360 ? 72 : 82);
  const contentW = Math.min(width - railW, MAX_W);
  const bannerW = contentW - PAD * 2;
  const bannerH = Math.round(Math.max(130, Math.min(220, bannerW * 0.5)));
  const heroTitle = Math.max(15, Math.min(rf(22), bannerW * 0.068));
  const heroSmall = bannerW < 300;
  const heroImage = menuImages[categoryMenuKey('Mobile')] || 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Phone.png';
  const centered = { width: '100%', maxWidth: MAX_W, alignSelf: 'center' };
  const slides = 1 + buyBanners.length;

  const onBannerScroll = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (bannerW - 2 || 1));
    if (i !== slide) setSlide(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      {/* ---------- Header: back · Buy / Devices & Spares · bell ---------- */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingHorizontal: 14, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" className="active:opacity-70" style={{ height: 40, width: 36, justifyContent: 'center' }}>
            <ArrowLeft size={24} color={INK} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
            <Text numberOfLines={1} style={{ fontSize: rf(22), fontWeight: '800', color: INK }}>Buy</Text>
            <Text numberOfLines={1} style={{ fontSize: rf(13), color: MUTED, marginTop: 1 }}>Devices & Spares</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('OwnerNotifications')} hitSlop={8} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="active:opacity-70" style={{ height: 40, width: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={24} color={INK} />
            {unread > 0 ? <View style={{ position: 'absolute', top: 6, right: 7, height: 9, width: 9, borderRadius: 5, backgroundColor: RED, borderWidth: 1.5, borderColor: '#FFFFFF' }} /> : null}
          </Pressable>
        </View>

        {/* Search + Filters */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14, height: 46, ...cardShadow }}>
            <Pressable onPress={() => runSearch()} hitSlop={6} accessibilityLabel="Search">
              <Search size={19} color={TEAL} />
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
              backgroundColor: activeFilters > 0 ? TEAL : '#F4FAFB', borderWidth: 1.5, borderColor: TEAL,
            }}
          >
            <SlidersHorizontal size={17} color={activeFilters > 0 ? '#FFFFFF' : TEAL} />
            <Text style={{ marginLeft: 6, fontSize: rf(13.5), fontWeight: '800', color: activeFilters > 0 ? '#FFFFFF' : TEAL }} numberOfLines={1}>Filters</Text>
            {activeFilters > 0 ? (
              <View style={{ marginLeft: 6, paddingHorizontal: 6, borderRadius: 999, backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontSize: rf(10), fontWeight: '800', color: TEAL }}>{activeFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Category rail — All, each category, Spares; tapping filters this page. */}
        {loading ? (
          <View style={{ width: railW, paddingVertical: 24 }}><Loader /></View>
        ) : (
          <ScrollView style={{ width: railW, flexGrow: 0 }} contentContainerStyle={{ paddingLeft: 8, paddingRight: 2, paddingTop: 12, paddingBottom: tabSpace }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 4, rowGap: 4, borderWidth: 1, borderColor: LINE, ...cardShadow }}>
              <RailItem label="All" Icon={LayoutGrid} active={selCat === 'ALL'} onPress={openAll} />
              {cats.map((c) => (
                <RailItem key={c.id} label={c.name} Icon={catIcon(c)} active={selCat === c.id} onPress={() => pickCat(c.id)} />
              ))}
              <RailItem label="Spares" Icon={Settings} active={selCat === SPARES} onPress={() => pickCat(SPARES)} />
            </View>
          </ScrollView>
        )}

        <ScrollView ref={listRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: tabSpace }}>
          <View style={centered}>
            {/* Banner: the Buy promo, then any admin "Buy" banners. */}
            <View style={{ marginTop: 12 }}>
              <View style={{ marginHorizontal: PAD, height: bannerH, borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, ...cardShadow }}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={onBannerScroll}
                  scrollEventThrottle={16}
                  style={{ width: bannerW - 2, height: bannerH - 2, flexGrow: 0 }}
                >
                  <LinearGradient colors={['#F6FBFB', '#E6F4F4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: bannerW - 2, height: bannerH - 2, flexDirection: 'row' }}>
                    <View pointerEvents="none" style={{ position: 'absolute', right: -bannerH * 0.35, top: -bannerH * 0.25, height: bannerH * 1.5, width: bannerH * 1.5, borderRadius: bannerH, backgroundColor: '#CBEBE7' }} />
                    <View pointerEvents="none" style={{ position: 'absolute', right: -bannerH * 0.55, top: bannerH * 0.05, height: bannerH * 1.3, width: bannerH * 1.3, borderRadius: bannerH, backgroundColor: '#9ED8D1' }} />
                    <View style={{ flex: 1, paddingLeft: heroSmall ? 12 : 16, paddingRight: 4, justifyContent: 'center' }}>
                      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: heroTitle, fontWeight: '800', color: INK, lineHeight: Math.round(heroTitle * 1.22) }}>
                        Buy Devices & Spares{'\n'}for <Text style={{ color: TEAL }}>Your Shop</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10, marginTop: 2 }}>
                          <ShieldCheck size={14} color={TEAL} />
                          <Text style={{ marginLeft: 4, fontSize: rf(10.5), fontWeight: '600', color: INK }} numberOfLines={1}>Verified Sellers</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Truck size={14} color={TEAL} />
                          <Text style={{ marginLeft: 4, fontSize: rf(10.5), fontWeight: '600', color: INK }} numberOfLines={1}>Pickup / Delivery</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ width: Math.min(bannerW * 0.36, bannerH * 1.1), alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                      <Image resizeMethod="resize" source={{ uri: heroImage }} style={{ width: '100%', height: bannerH * 0.82 }} resizeMode="contain" />
                    </View>
                  </LinearGradient>
                  {buyBanners.map((b) => (
                    <Pressable
                      key={b.key}
                      onPress={openAll}
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Buy offer banner"
                      style={{ width: bannerW - 2, height: bannerH - 2 }}
                    >
                      <Image resizeMethod="resize" source={{ uri: b.uri }} style={{ width: bannerW - 2, height: bannerH - 2 }} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
                {Array.from({ length: slides }, (_, i) => (
                  <View key={i} style={{ height: 6, width: i === slide ? 22 : 7, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === slide ? TEAL : '#D1D5DB' }} />
                ))}
              </View>
            </View>

            {/* Status chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 14, paddingBottom: 4 }}>
              {STAGES.map((s) => (
                <StageChip key={s.key} label={s.label} count={stageCount(s.key)} active={stage === s.key} onPress={() => setStage(s.key)} />
              ))}
            </ScrollView>

            {/* Customer + shop sell listings for the selected category and stage. */}
            <View style={{ paddingHorizontal: PAD, paddingTop: 10 }}>
              {shown.map((it) => (
                <HomeLeadCard
                  key={it._key || `listing:${it.id}`}
                  it={it}
                  tag={tagFor(it)}
                  accepted={!!buys[String(it.id)] || quoteOf(it) === 'ACCEPTED'}
                  purchase={buys[String(it.id)]}
                  navigation={navigation}
                  onOpen={() => openItem(it)}
                />
              ))}
              {!loading && !shown.length ? (
                <EmptyState
                  title="No devices found"
                  description={needle || activeFilters || selCat !== 'ALL' || stage !== 'ALL' ? 'Try another category, status, search or filter.' : 'No customer or shop listings yet.'}
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
                style={{ flex: 1, marginLeft: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: TEAL }}
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
