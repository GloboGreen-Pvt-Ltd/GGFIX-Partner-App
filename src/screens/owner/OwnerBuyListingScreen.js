import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  X,
  ArrowLeft,
  ChevronRight,
  ShoppingCart,
  MapPin,
  Phone,
  Smartphone,
  Store,
  User,
  Wrench,
  SlidersHorizontal,
  ChevronDown,
  Check,
  Tag,
  LayoutGrid,
  Plus,
} from 'lucide-react-native';
import { marketplaceApi } from '../../api/client';
import { listProducts, getCart, addToCart } from '../../api/marketplace';
import { normalizeDeviceImageUrl, resolveDeviceImageSource } from '../../utils/images';
import { isOwnListing, listingConditionLabel, listingCustomerName, ownShopIdsOf } from '../../api/nearbyListings';
import { fetchMe } from '../../api/auth';
import { getSession } from '../../auth/session';
import { getDeviceCategories, getBrands, getBrandsForCategory, getModelsByBrand, getBanners, getCategoryMenuImages, categoryMenuKey } from '../../api/masterData';
import { listShops } from '../../api/shops';
import { notify } from '../../components/confirm';
import SafeModal, { ModalInsets } from '../../components/SafeModal';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #035C6C, ink #111111, white, neutrals #F3F4F6/#F3F4F6.
const GREEN       = '#035C6C';
const GREEN_LIGHT = '#035C6C';  // gradient top stop only - keeps the CTA from going flat
const GREEN_DARK  = '#035C6C';  // deeper green for green text/icons and gradient ends

const RADIUS_KM = 20;

// Shared frozen empty list — `brands` below is derived on every render, and a
// fresh [] literal each time would re-fire the effects that depend on it.
const NO_BRANDS = [];

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const CAT_EMOJI = {
  MOBILE: '📱', SMARTPHONE: '📱',
  LAPTOP: '💻',
  TABLET: '📲',
  SMARTWATCH: '⌚', SMARTWATCHES: '⌚',
  AUDIO: '🎧', AUDIO_DEVICES: '🎧',
};
function catEmoji(code) { return CAT_EMOJI[String(code || '').toUpperCase()] || '📦'; }
function catImage(item) {
  if (!item) return null;
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}
// Banner image — API is camelCase, but tolerate snake_case + base64 too.
function bannerImage(b) {
  if (!b) return null;
  const b64 = (b.imageBase64 || b.image_base64) && String(b.imageBase64 || b.image_base64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = (b.imageUrl || b.image_url) && String(b.imageUrl || b.image_url).trim();
  return url || null;
}


const SORTS = [
  { key: 'default',    label: 'Recommended' },
  { key: 'nearest',    label: 'Nearest first' },
  { key: 'price_asc',  label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
];
const SELLERS = [
  { key: 'ALL',      label: 'All Sellers' },
  { key: 'SHOP',     label: 'Shops' },
  { key: 'CUSTOMER', label: 'Customers' },
];

// Normalize the two data sources into one card shape.
function listingToCard(l) {
  return { ...l, _key: `listing:${l.id}`, source: 'listing' };
}
export function productToCard(p) {
  return {
    _key: `product:${p.id}`,
    source: 'product',
    id: p.id,
    sellerType: 'SHOP',
    productName: p.title,
    productImage: normalizeDeviceImageUrl(p.imageUrl),
    expectedPrice: p.price,
    condition: p.conditionLabel,
    description: p.description,
    productType: p.type,
    modelId: p.modelId,
    brandId: p.brandId,
    shopId: p.shopId,
    categoryId: null,
  };
}

function priceOf(it) { return it.expectedPrice != null ? Number(it.expectedPrice) : 0; }

// Category tab match: strictly the listing's own categoryId (what
// GET /marketplace/buy/nearby returns) against the tab's master
// device-category id (GET /master/device-categories). There is deliberately no
// brand/model fallback — a brand like Apple spans phones, laptops and tablets,
// so matching on brand (or on every model of the category's brands) leaked
// phones into the Laptop/Tablet tabs. A listing without a categoryId (older
// listings, shop catalogue products) shows under "All" only.
const normalizeId = (v) => (v == null ? '' : String(v).trim().toLowerCase());
export function matchesCategory(item, selected) {
  if (!selected) return true;
  const have = normalizeId(item?.categoryId ?? item?.category?.id);
  const want = normalizeId(selected.id ?? selected.categoryId);
  return !!have && !!want && have === want;
}

export default function OwnerBuyListingScreen({ navigation, route }) {
  const { categoryId, categoryCode, categoryName } = route?.params || {};
  const { width: winW } = useWindowDimensions();
  const isSmall = winW < 360;
  const isTablet = winW >= 768;
  const padH = 16;
  // Tablets: the list column is capped and centred (r.maxWidth), so the hero
  // pages are sized off that column, not the full window.
  const r = useResponsive();
  const listW = r.maxWidth('list');
  const capStyle = { width: '100%', maxWidth: listW, alignSelf: 'center' };
  // The hero carousel lives inside the FlatList content container, which is
  // inset by (padH - 2) on each side — so its real page/viewport width is the
  // window width minus that gutter, NOT winW. Using winW overflows the viewport
  // and desyncs paging + dots.
  const heroW = listW - 2 * (padH - 2);

  const [cats, setCats] = useState([]);
  // categoryMenuKey -> imageUrl from the active BUY Category Menu rows.
  const [menuImages, setMenuImages] = useState({});
  const [selected, setSelected] = useState(
    categoryId ? { id: categoryId, code: categoryCode, name: categoryName } : null,
  );
  const [listings, setListings] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [origin, setOrigin] = useState(null);
  // `searchText` is what the box shows (updates on every keystroke); `query` is
  // what actually filters, debounced — otherwise every letter re-filtered the
  // whole catalogue and re-rendered the FlatList, which is what made typing in
  // the box lag and drop characters on Android.
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const modelCache = useRef(new Map());

  // Brand filter. The list is category-scoped — brands mapped to the selected
  // category — and falls back to the whole catalogue under "All".
  const catKey = selected?.id || selected?.code || '__all__';
  const [allBrands, setAllBrands] = useState([]);
  const [brandData, setBrandData] = useState({ key: null, list: NO_BRANDS });
  const [brandFilter, setBrandFilter] = useState(null); // { id, name }
  const [brandModelIds, setBrandModelIds] = useState(null);
  const [showBrands, setShowBrands] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const brandCache = useRef(new Map());

  // Hero banner carousel (master banners filtered to the "Buy" title).
  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  // Width / height of the banner artwork (first banner that reports a size).
  const [heroRatio, setHeroRatio] = useState(2.4);
  const bannerRef = useRef(null);

  // Filters (Sort + Seller) — reachable from the header Filters pill.
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('default');
  const [sellerFilter, setSellerFilter] = useState('ALL');
  const activeFilters = (sortBy !== 'default' ? 1 : 0) + (sellerFilter !== 'ALL' ? 1 : 0) + (brandFilter ? 1 : 0);

  // Keyed on the category, so a late response for the previous category can
  // never be read as the current one's brand list.
  const brands = brandData.key === catKey ? brandData.list : NO_BRANDS;
  const brandsLoading = brandData.key !== catKey;

  const browsing = !!selected || !!brandFilter || !!query.trim();
  // List tabs: Top Listings (current sort) · Nearby (nearest first) · Recently Added.
  const [listTab, setListTab] = useState('TOP');

  // Keep the cart badge fresh on focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const c = await getCart();
          if (!cancelled) setCartCount((Array.isArray(c) ? c : []).reduce((s, it) => s + (Number(it.quantity) || 0), 0));
        } catch {}
      })();
      return () => { cancelled = true; };
    }, []),
  );

  // Categories.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Tile images come from the admin's Category Menu (type BUY).
        const [list, imgs] = await Promise.all([getDeviceCategories(), getCategoryMenuImages('BUY', { includeInactive: true })]);
        if (!cancelled) setMenuImages(imgs);
        const ORDER = ['mobile', 'laptop', 'tablet', 'smartwatches', 'audio device'];
        const rank = (c) => {
          const i = ORDER.indexOf((c.name || '').trim().toLowerCase());
          return i === -1 ? ORDER.length : i;
        };
        if (!cancelled) setCats((list || []).filter((c) => c.isActive !== false).sort((a, b) => rank(a) - rank(b)));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounce the search box: type freely, filter 200 ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText), 200);
    return () => clearTimeout(t);
  }, [searchText]);

  // Whole brand catalogue. Backs the "All" brand list, and lets search match a
  // brand name that never appears in the product title.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getBrands();
        if (!cancelled) setAllBrands(Array.isArray(rows) ? rows : NO_BRANDS);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Brands for the selected category (the category-brand mappings in master
  // data). Keyed by category on the way into state, so a late response for the
  // previous category can never be read as this one's list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (brandCache.current.has(catKey)) {
        setBrandData({ key: catKey, list: brandCache.current.get(catKey) });
        return;
      }
      let rows = NO_BRANDS;
      try {
        rows = selected ? await getBrandsForCategory(selected.id || selected.code) : allBrands;
      } catch { rows = NO_BRANDS; }
      const list = (Array.isArray(rows) ? rows : NO_BRANDS)
        .filter((b) => b?.id && b.isActive !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      // Don't cache "All" before the catalogue has landed — that would pin an
      // empty list for the rest of the session.
      if (selected || list.length) brandCache.current.set(catKey, list);
      if (!cancelled) setBrandData({ key: catKey, list });
    })();
    return () => { cancelled = true; };
  }, [catKey, selected, allBrands]);

  // A brand only means something inside its category — drop the pick when the
  // category changes.
  useEffect(() => { setBrandFilter(null); setBrandQuery(''); }, [catKey]);

  // Models under the picked brand, for cards that carry a modelId but no brandId.
  useEffect(() => {
    let cancelled = false;
    const brandId = brandFilter?.id;
    if (!brandId) { setBrandModelIds(null); return; }
    const key = `brand:${brandId}`;
    (async () => {
      if (modelCache.current.has(key)) { setBrandModelIds(modelCache.current.get(key)); return; }
      const models = await getModelsByBrand(brandId).catch(() => []);
      const ids = new Set();
      (models || []).forEach((m) => { if (m?.id) ids.add(m.id); });
      modelCache.current.set(key, ids);
      if (!cancelled) setBrandModelIds(ids);
    })();
    return () => { cancelled = true; };
  }, [brandFilter?.id]);

  // Category Menu art again on focus (the tab stays mounted, so the mount-time
  // read alone would keep a stale image until the app restarts).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCategoryMenuImages('BUY', { includeInactive: true }).then((imgs) => {
        if (!cancelled && Object.keys(imgs).length) setMenuImages(imgs);
      });
      return () => { cancelled = true; };
    }, []),
  );

  // Hero banners — get + display only the "Buy" banner(s), active, in sort order.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getBanners();
        const buy = (Array.isArray(rows) ? rows : [])
          .filter((b) => String(b.title || '').trim().toLowerCase() === 'buy' && (b.isActive ?? b.is_active) !== false)
          .sort((a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));
        if (!cancelled) setBanners(buy);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Measure the banner artwork so the carousel matches its real shape.
  useEffect(() => {
    let cancelled = false;
    const uri = banners.map(bannerImage).find(Boolean);
    if (!uri) return undefined;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled || !w || !h) return;
        setHeroRatio(Math.min(3.2, Math.max(1.5, w / h)));
      },
      () => {},
    );
    return () => { cancelled = true; };
  }, [banners]);

  // Auto-scroll the hero carousel while there is more than one banner.
  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        bannerRef.current?.scrollTo({ x: next * heroW, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(id);
  }, [banners.length, heroW]);

  const ensureOrigin = useCallback(async () => {
    let session = await fetchMe().catch(() => null);
    if (!session) session = await getSession();
    const shop = session?.activeShop;
    const shopId = shop?.id || session?.shopId || null;
    const ownShopIds = ownShopIdsOf(session, shopId);
    if (shop && shop.latitude != null && shop.longitude != null) {
      return { lat: Number(shop.latitude), lng: Number(shop.longitude), shopName: shop.name, sellerId: session?.userId, shopId, ownShopIds };
    }
    return { lat: null, lng: null, shopName: session?.shopName, sellerId: session?.userId, shopId, ownShopIds };
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const o = origin || (await ensureOrigin());
        if (!origin) setOrigin(o);

        const params = { radiusKm: RADIUS_KM };
        if (o.lat != null && o.lng != null) { params.lat = o.lat; params.lng = o.lng; }
        if (o.sellerId) params.excludeSellerId = o.sellerId;

        const [listingData, productData, shopData] = await Promise.all([
          marketplaceApi.get('/marketplace/buy/nearby', { query: params }).catch(() => []),
          listProducts({ status: 'ACTIVE' }).catch(() => []),
          listShops().catch(() => []),
        ]);

        const shopMap = new Map();
        (Array.isArray(shopData) ? shopData : []).forEach((s) => { if (s?.id) shopMap.set(s.id, s); });

        const listingArr = Array.isArray(listingData) ? listingData : listingData?.content ?? listingData?.data ?? [];
        const listingCards = (listingArr || [])
          // None of the owner's own shops — active or not — are buyable here.
          .filter((l) => !isOwnListing(o, l))
          .map((l) => {
            const shop = l.shopId ? shopMap.get(l.shopId) : null;
            const card = listingToCard(l);
            return {
              ...card,
              shopName: l.sellerType === 'SHOP' ? (shop?.name || null) : null,
              city: card.city || shop?.city || null,
              state: card.state || shop?.state || null,
            };
          });
        setListings(listingCards);

        const productCards = (productData || [])
          .filter((p) => !isOwnListing(o, p))
          .map((p) => {
            const card = productToCard(p);
            const shop = p.shopId ? shopMap.get(p.shopId) : null;
            return { ...card, createdAt: p.createdAt, shopName: shop?.name || null, city: shop?.city || null, state: shop?.state || null };
          });
        setProducts(productCards);
      } catch (e) {
        setError(e.message || 'Failed to load listings');
        setListings([]);
        setProducts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [origin, ensureOrigin],
  );

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const p = route?.params;
    if (!p || !('categoryId' in p)) return;
    setSelected(p.categoryId ? { id: p.categoryId, code: p.categoryCode, name: p.categoryName } : null);
  }, [route?.params?.categoryId, route?.params?.categoryCode, route?.params?.categoryName]);

  useEffect(() => {
    const q = route?.params?.q;
    if (typeof q === 'string' && q) { setSearchText(q); setQuery(q); }
  }, [route?.params?.q]);

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => String(b.name || '').toLowerCase().includes(q));
  }, [brands, brandQuery]);

  // brandId to name, for search. Union of the whole catalogue and the current
  // category's list so a name resolves either way.
  const brandNameById = useMemo(() => {
    const m = new Map();
    allBrands.forEach((b) => { if (b?.id) m.set(b.id, b.name); });
    brands.forEach((b) => { if (b?.id) m.set(b.id, b.name); });
    return m;
  }, [allBrands, brands]);

  const visibleItems = useMemo(() => {
    const all = [...listings, ...products];
    const inCat = (it) => matchesCategory(it, selected);
    const inBrand = (it) => {
      if (!brandFilter) return true;
      if (it.brandId) return it.brandId === brandFilter.id;
      if (it.modelId && brandModelIds) return brandModelIds.has(it.modelId);
      return false;
    };
    const inSeller = (it) => {
      if (sellerFilter === 'ALL') return true;
      const isCust = it.sellerType === 'CUSTOMER';
      return sellerFilter === 'CUSTOMER' ? isCust : !isCust;
    };
    // Every word has to land somewhere, in any order — "13 apple" finds an
    // "Apple iPhone 13". Brand, seller and location are folded in because a
    // title like "Screen replacement" spells out none of them.
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matchesQuery = (it) => {
      if (!terms.length) return true;
      const hay = [
        it.productName,
        it.condition,
        it.description,
        it.shopName,
        it.city,
        it.state,
        it.address,
        brandNameById.get(it.brandId),
        it.productType === 'SPARE_PART' ? 'spare part spares' : null,
        it.sellerType === 'CUSTOMER' ? 'customer' : 'shop',
      ].filter(Boolean).join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    };
    const arr = all.filter(inCat).filter(inBrand).filter(inSeller).filter(matchesQuery);
    if (sortBy === 'price_asc') arr.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sortBy === 'price_desc') arr.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sortBy === 'nearest') arr.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return arr;
  }, [listings, products, selected, brandFilter,
      brandModelIds, query, brandNameById, sellerFilter, sortBy]);

  const tabItems = useMemo(() => {
    const arr = [...visibleItems];
    if (listTab === 'NEARBY') return arr.filter((it) => it.distanceKm != null).sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm));
    if (listTab === 'RECENT') return arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return arr;
  }, [visibleItems, listTab]);

  // The details page shows the category + brand names too; pass the ones this
  // screen already loaded so it doesn't have to fetch them again.
  const openDetail = (item) => navigation.navigate('OwnerBuyListingDetails', {
    listing: {
      ...item,
      brandName: item.brandName || brandNameById.get(item.brandId) || undefined,
      categoryName: item.categoryName || cats.find((c) => c.id === item.categoryId)?.name || undefined,
    },
  });

  const handleAddToCart = async (item) => {
    if (item.source !== 'product') { openDetail(item); return; } // peer listings → contact via detail
    try {
      await addToCart(item.id, 1);
      setCartCount((c) => c + 1);
      notify('Added to cart', item.productName || 'Item added.');
    } catch (e) {
      notify('Could not add', e.message || 'Try adding it from the details screen.');
    }
  };

  const clearFilters = () => { setSortBy('default'); setSellerFilter('ALL'); setBrandFilter(null); };

  // Hand off from the Filters sheet to the brand sheet. Two <Modal>s swapped in
  // the same tick flicker on Android, so let the first one finish sliding out.
  const openBrandPicker = () => {
    setBrandQuery('');
    setShowFilters(false);
    setTimeout(() => setShowBrands(true), 260);
  };

  // ── Compact product card (Discover) ──────────────────────────────
  // Tap = View Details. Phone = Contact seller; + = add a shop catalogue item to the cart.
  const thumbSize = isSmall ? 76 : isTablet ? 104 : 88;
  const renderItem = ({ item }) => {
    const productName = item.productName || 'Untitled';
    const isCustomer = item.sellerType === 'CUSTOMER';
    const isSpare = item.productType === 'SPARE_PART';
    const n = item.expectedPrice != null ? Number(item.expectedPrice) : null;
    const price = n != null && n > 0 ? `₹${n.toLocaleString('en-IN')}` : null;
    const specs = [
      String(item.description || '').split(/\s*[·|,]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' • '),
      item.condition ? listingConditionLabel(item.condition) : null,
    ].filter(Boolean).join('  •  ');
    const km = item.distanceKm != null ? Number(item.distanceKm) : null;
    const dist = km != null && Number.isFinite(km) ? `${km < 10 ? String(Math.round(km * 10) / 10) : Math.round(km)} km` : null;
    const place = [item.city || item.state || null, dist].filter(Boolean).join(' • ');
    const contact = () => {
      const phone = item.contactPhone || item.sellerPhone;
      if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
      else notify('No phone yet', isCustomer ? 'This customer has not shared a phone number. Tap the card to send a quotation instead.' : 'No contact phone available for this seller.');
    };
    return (
      <Pressable
        onPress={() => openDetail(item)}
        accessibilityRole="button"
        accessibilityLabel={productName}
        className="active:opacity-90"
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#EEF0F2', ...cardShadow }}
      >
        <View style={{ width: thumbSize, height: thumbSize, borderRadius: 14, backgroundColor: '#F3F5F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {item.productImage ? (
            <Image source={{ uri: item.productImage }} style={{ width: '88%', height: '88%' }} resizeMode="contain" resizeMethod="resize" />
          ) : isSpare ? <Wrench size={26} color={GREEN_DARK} /> : <Smartphone size={28} color={GREEN_DARK} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: isSmall ? 14 : 15.5, fontWeight: '800', color: '#111111' }}>{productName}</Text>
            {item.source === 'product' ? (
              <Pressable onPress={() => handleAddToCart(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add to cart" className="active:opacity-70" style={{ height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                <Plus size={19} color={GREEN_DARK} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <Pressable onPress={contact} hitSlop={8} accessibilityRole="button" accessibilityLabel="Contact seller" className="active:opacity-70" style={{ height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
              <Phone size={17} color="#111111" />
            </Pressable>
          </View>
          {specs ? <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: '#4B5563' }}>{specs}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E7F6EE', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8, maxWidth: '55%' }}>
              {isCustomer ? <User size={11} color="#0B6B4B" /> : <Store size={11} color="#0B6B4B" />}
              <Text numberOfLines={1} style={{ marginLeft: 3, fontSize: 10.5, fontWeight: '700', color: '#0B6B4B', flexShrink: 1 }}>{sellerOf(item)}</Text>
            </View>
            {place ? (
              <>
                <MapPin size={11} color="#6B7280" />
                <Text numberOfLines={1} style={{ flexShrink: 1, marginLeft: 2, fontSize: 11, color: '#6B7280' }}>{place}</Text>
              </>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            {price ? <Text numberOfLines={1} style={{ fontSize: isSmall ? 16 : 18, fontWeight: '800', color: GREEN_DARK, marginRight: 8 }}>{price}</Text> : null}
            {!price ? <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: '#E8590C' }}>(Open for Quote)</Text> : null}
            {isSpare ? <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '800', color: '#B45309', marginLeft: price ? 0 : 8 }}>SPARE PART</Text> : null}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Category chip: round tile + label; active = teal ring (All = teal fill) ──
  const CAT_CHIP_SIZE = isSmall ? 52 : isTablet ? 72 : 58;
  const CAT_CHIP_IMG_SIZE = isSmall ? 30 : isTablet ? 44 : 34;
  const CAT_CHIP_ICON_SIZE = isSmall ? 20 : isTablet ? 28 : 22;
  const CAT_CHIP_LABEL_F = isSmall ? 10.5 : isTablet ? 12.5 : 11.5;

  const CategoryChip = ({ active, label, isAll, uri, photo, emoji, onPress }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      className="items-center active:opacity-80"
      style={{ width: CAT_CHIP_SIZE + 14, marginRight: 4 }}
    >
      <View
        style={{
          height: CAT_CHIP_SIZE, width: CAT_CHIP_SIZE, borderRadius: CAT_CHIP_SIZE / 2, overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: isAll && active ? GREEN : '#FFFFFF',
          borderWidth: active ? 2 : 1, borderColor: active ? GREEN_DARK : '#E5E7EB',
          ...(active ? {} : cardShadow),
        }}
      >
        {isAll ? (
          <LayoutGrid size={CAT_CHIP_ICON_SIZE} color={active ? '#FFFFFF' : GREEN_DARK} />
        ) : uri && photo ? (
          <Image source={{ uri }} style={{ width: '78%', height: '78%' }} resizeMode="contain" resizeMethod="resize" />
        ) : uri ? (
          <Image source={{ uri }} style={{ width: CAT_CHIP_IMG_SIZE, height: CAT_CHIP_IMG_SIZE }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: CAT_CHIP_ICON_SIZE - 4 }}>{emoji}</Text>
        )}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 5, textAlign: 'center', fontSize: CAT_CHIP_LABEL_F, color: active ? GREEN_DARK : '#111111', fontWeight: active ? '800' : '600' }}>
        {label}
      </Text>
    </Pressable>
  );

  // Selling details for the Nearby Deals cards. Listings have no separate
  // storage field — the sell flow writes "colour · RAM / storage" into
  // `description` — so that line is shown as-is. Seller: the customer's own
  // name for a customer listing, otherwise the shop's name (looked up in load()).
  // GET /marketplace/buy/nearby returns no customer-name field today (only
  // sellerType + sellerId), hence the "Unknown Customer" fallback; the first
  // name field the API starts sending is picked up with no app change.
  const sellerOf = (item) => (item.sellerType === 'CUSTOMER' ? listingCustomerName(item) : (item.shopName || 'Shop'));
  const priceLabelOf = (item) => {
    const n = item.expectedPrice != null ? Number(item.expectedPrice) : null;
    if (n != null && n > 0) return `₹${n.toLocaleString('en-IN')}`;
    if (n === 0) return 'Open for quotation';
    return '—';
  };
  const SellerLine = ({ item }) => (
    <View className="flex-row items-center mt-0.5">
      {item.sellerType === 'CUSTOMER' ? <User size={10} color="#9CA3AF" /> : <Store size={10} color="#9CA3AF" />}
      <Text className="text-[10px] text-gray-700 font-bold ml-1 flex-1" numberOfLines={1}>{sellerOf(item)}</Text>
    </View>
  );


  const ListHeader = (
    <View>
      {/* Category strip */}
      <View style={{ paddingTop: 14, paddingBottom: 2 }}>
        <FlatList
          data={[{ all: true }, ...cats]}
          keyExtractor={(c, i) => (c.all ? 'all' : c.id || String(i))}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: padH }}
          renderItem={({ item: c }) => {
            if (c.all) return <CategoryChip active={!selected} label="All" isAll onPress={() => setSelected(null)} />;
            const code = (c.code || '').toUpperCase();
            const menuUri = menuImages[categoryMenuKey(c.name)] || menuImages[categoryMenuKey(c.code)] || null;
            return (
              <CategoryChip
                active={selected?.id === c.id}
                label={c.name}
                emoji={catEmoji(code)}
                uri={menuUri || catImage(c)}
                photo={!!menuUri}
                code={code}
                onPress={() => setSelected({ id: c.id, code, name: c.name })}
              />
            );
          }}
        />
      </View>

      {/* Top Listings · Nearby · Recently Added */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 12, padding: 4, borderRadius: 999, backgroundColor: '#EEF1F3' }}>
        {[
          { key: 'TOP', label: 'Top Listings' },
          { key: 'NEARBY', label: 'Nearby' },
          { key: 'RECENT', label: 'Recently Added' },
        ].map((t) => {
          const on = listTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setListTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              className="active:opacity-80"
              style={{ flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#FFFFFF' : 'transparent', ...(on ? cardShadow : {}) }}
            >
              <Text numberOfLines={1} style={{ fontSize: isSmall ? 11.5 : 13, fontWeight: on ? '800' : '600', color: on ? GREEN_DARK : '#374151' }}>{t.label}</Text>
              {on ? <View style={{ position: 'absolute', bottom: 3, height: 2.5, width: 28, borderRadius: 2, backgroundColor: GREEN_DARK }} /> : null}
            </Pressable>
          );
        })}
      </View>

      {browsing && (
        <View style={{ paddingHorizontal: padH, marginTop: 16, marginBottom: 4 }} className="flex-row items-center">
          <Text className="text-[13px] font-extrabold text-gray-900 flex-1" numberOfLines={1}>
            {selected ? selected.name : (brandFilter ? brandFilter.name : 'Search results')}
          </Text>
          <Text className="text-[11px] text-gray-500 font-semibold ml-2">{visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}</Text>
          {/* Brand filter — the list it opens is scoped to the selected category. */}
          <Pressable
            onPress={() => { setBrandQuery(''); setShowBrands(true); }}
            className="flex-row items-center rounded-full ml-2 active:opacity-80"
            style={{
              paddingHorizontal: 10, paddingVertical: 6,
              backgroundColor: brandFilter ? GREEN : '#FFFFFF',
              borderWidth: 1, borderColor: brandFilter ? GREEN : '#E5E7EB',
            }}
          >
            <Tag size={12} color={brandFilter ? '#FFFFFF' : '#6B7280'} />
            <View style={{ maxWidth: 92, marginLeft: 4, marginRight: 2 }}>
              <Text className="text-[11px] font-extrabold" numberOfLines={1} style={{ color: brandFilter ? '#FFFFFF' : '#111111' }}>
                {brandFilter ? brandFilter.name : 'Brand'}
              </Text>
            </View>
            <ChevronDown size={13} color={brandFilter ? '#FFFFFF' : '#6B7280'} />
          </Pressable>
          {brandFilter ? (
            <Pressable
              onPress={() => setBrandFilter(null)}
              hitSlop={8}
              className="h-6 w-6 rounded-full items-center justify-center ml-1.5"
              style={{ backgroundColor: '#F3F4F6' }}
            >
              <X size={12} color="#6B7280" />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F7F9FA' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FA" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#F7F9FA' }}>
        <View style={{ paddingTop: 8, paddingBottom: 4 }}>
          <View style={[{ paddingHorizontal: padH }, capStyle]}>
            {/* Back · Discover (+subtitle) · Cart */}
            <View className="flex-row items-center">
              <Pressable
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="h-9 w-9 items-center justify-center active:opacity-70"
              >
                <ArrowLeft size={22} color="#111111" />
              </Pressable>
              <View className="flex-1 items-center">
                <Text style={{ fontSize: isSmall ? 18 : 20, fontWeight: '800', color: '#111111' }} numberOfLines={1}>Discover</Text>
                <Text style={{ fontSize: 11.5, color: '#4B5563', marginTop: 1 }} numberOfLines={1}>Devices, spares and shop listings</Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('OwnerCart')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cart"
                className="h-9 w-9 items-center justify-center active:opacity-70"
              >
                <ShoppingCart size={20} color="#111111" />
                {cartCount > 0 ? (
                  <View className="absolute -top-1 -right-1 rounded-full min-w-[16px] h-4 px-1 items-center justify-center" style={{ backgroundColor: '#F59E0B', borderWidth: 1.5, borderColor: '#FFFFFF' }}>
                    <Text className="text-text text-[9px] font-extrabold">{cartCount > 9 ? '9+' : cartCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            {/* Search + Filters */}
            <View className="flex-row items-center" style={{ marginTop: 14 }}>
              <View
                className="flex-1 flex-row items-center"
                style={{ backgroundColor: '#EEF1F4', borderRadius: 999, paddingHorizontal: 16, height: 46 }}
              >
                <Search size={18} color={GREEN} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  returnKeyType="search"
                  onSubmitEditing={() => setQuery(searchText)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  placeholder="Search mobiles, spares, accessories..."
                  placeholderTextColor="#9CA3AF"
                  style={{ flex: 1, marginLeft: 10, color: '#111111', fontSize: 13, padding: 0 }}
                />
                {searchText ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { setSearchText(''); setQuery(''); }}
                    hitSlop={6}
                    className="w-7 h-7 rounded-full items-center justify-center"
                  >
                    <X size={14} color="#6B7280" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Pressable
                onPress={() => setShowFilters(true)}
                accessibilityRole="button"
                accessibilityLabel="Filter"
                className="ml-2 flex-row items-center px-4 active:opacity-80"
                style={{ height: 46, borderRadius: 999, backgroundColor: activeFilters > 0 ? GREEN : '#FFFFFF', borderWidth: 1, borderColor: activeFilters > 0 ? GREEN : '#E5E7EB' }}
              >
                <SlidersHorizontal size={17} color={activeFilters > 0 ? '#FFFFFF' : '#111111'} />
                <Text className="text-[13.5px] font-extrabold ml-1.5" style={{ color: activeFilters > 0 ? '#FFFFFF' : '#111111' }}>Filter</Text>
                {activeFilters > 0 ? (
                  <View className="ml-1.5 px-1.5 rounded-full" style={{ backgroundColor: '#FFFFFF' }}>
                    <Text className="text-[10px] font-extrabold" style={{ color: GREEN_DARK }}>{activeFilters}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {error ? (
        <View className="px-4 mt-3">
          <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}>
            <Text className="text-[12px] font-semibold" style={{ color: '#B91C1C' }}>{error}</Text>
          </View>
        </View>
      ) : null}

      {loading && listings.length === 0 && products.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={GREEN} />
      ) : (
        <FlatList
          data={tabItems}
          keyExtractor={(item) => item._key}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />}
          contentContainerStyle={[{ paddingHorizontal: padH - 2, paddingBottom: 110 }, capStyle]}
          ListEmptyComponent={
            (
              <View className="items-center pt-10 px-8">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#E5F3F5' }}>
                  <Store size={32} color={GREEN_DARK} />
                </View>
                <Text className="text-[13px] font-extrabold text-gray-700 text-center">{listTab === 'NEARBY' && visibleItems.length ? 'No listings with a location nearby' : selected ?`No ${brandFilter ? `${brandFilter.name} ` : ''}${selected.name} products available` : `No ${brandFilter ? `${brandFilter.name} ` : ''}items yet`}</Text>
                <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">Listings from customers & shops and shop catalogue items will show up here.</Text>
              </View>
            )
          }
        />
      )}

      {/* Filters popup */}
      <SafeModal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 17, 17, 0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} />
          {/* Pads this modal window's own nav-bar / home-indicator inset. */}
          {/* Tablets: capped and centred rather than spanning the screen. */}
          <SafeAreaView edges={['bottom']} style={{ width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[13px] font-extrabold text-gray-900">Filters</Text>
              <Pressable onPress={() => setShowFilters(false)} hitSlop={8} className="h-8 w-8 rounded-full items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                <X size={16} color="#111111" />
              </Pressable>
            </View>

            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2">SORT BY</Text>
            <View className="flex-row flex-wrap">
              {SORTS.map((s) => (
                <Chip key={s.key} label={s.label} active={sortBy === s.key} onPress={() => setSortBy(s.key)} />
              ))}
            </View>

            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2 mt-3">BRAND</Text>
            <Pressable
              onPress={openBrandPicker}
              className="flex-row items-center rounded-xl active:opacity-80"
              style={{ paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brandFilter ? GREEN : '#E5E7EB' }}
            >
              <Tag size={14} color={brandFilter ? GREEN_DARK : '#6B7280'} />
              <Text className="flex-1 text-[12px] font-extrabold ml-2" numberOfLines={1} style={{ color: brandFilter ? '#111111' : '#6B7280' }}>
                {brandFilter ? brandFilter.name : 'All brands'}
              </Text>
              <Text className="text-[10.5px] text-text-muted mr-1" numberOfLines={1}>{selected ? selected.name : 'All categories'}</Text>
              <ChevronRight size={15} color="#6B7280" />
            </Pressable>

            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2 mt-3">SELLER</Text>
            <View className="flex-row flex-wrap">
              {SELLERS.map((s) => (
                <Chip key={s.key} label={s.label} active={sellerFilter === s.key} onPress={() => setSellerFilter(s.key)} />
              ))}
            </View>

            <View className="flex-row mt-5">
              <Pressable onPress={clearFilters} className="flex-1 mr-1.5 py-3 rounded-xl items-center active:opacity-70" style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text className="text-[13px] font-extrabold text-gray-900">Clear</Text>
              </Pressable>
              <Pressable onPress={() => setShowFilters(false)} className="flex-1 ml-1.5 rounded-xl active:opacity-90 overflow-hidden">
                <LinearGradient colors={[GREEN_LIGHT, GREEN_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text className="text-[13px] font-extrabold text-white">Apply</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeModal>

      {/* Brand picker — the list is scoped to the selected category */}
      <SafeModal visible={showBrands} transparent animationType="slide" onRequestClose={() => setShowBrands(false)}>
        {/* This window's own nav-bar inset; lifted above the keyboard while searching. */}
        <ModalInsets>
          {({ insets, keyboard }) => (
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 17, 17, 0.45)', paddingBottom: keyboard }}>
              <Pressable style={{ flex: 1 }} onPress={() => setShowBrands(false)} />
              <View style={{ width: '100%', maxWidth: r.maxWidth('form'), alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22 + (keyboard > 0 ? 0 : insets.bottom), maxHeight: '78%' }}>
                <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-[13px] font-extrabold text-gray-900">Brand</Text>
                    <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={1}>
                      {selected ? `Brands in ${selected.name}` : 'All categories'}
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowBrands(false)} hitSlop={8} className="h-8 w-8 rounded-full items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                    <X size={16} color="#111111" />
                  </Pressable>
                </View>

                <View
                  className="flex-row items-center"
                  style={{ backgroundColor: '#F3F4F6', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 9, marginTop: 12, marginBottom: 10 }}
                >
                  <Search size={16} color={GREEN} />
                  <TextInput
                    value={brandQuery}
                    onChangeText={setBrandQuery}
                    placeholder="Search brands"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ flex: 1, marginLeft: 8, color: '#111111', fontSize: 13, padding: 0 }}
                  />
                  {brandQuery ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setBrandQuery('')} hitSlop={6} className="w-6 h-6 rounded-full items-center justify-center">
                      <X size={13} color="#6B7280" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <BrandRow label="All brands" active={!brandFilter} onPress={() => { setBrandFilter(null); setShowBrands(false); }} />
                  {brandsLoading ? (
                    <ActivityIndicator style={{ marginTop: 18 }} color={GREEN} />
                  ) : filteredBrands.length === 0 ? (
                    <Text className="text-[12px] text-text-muted text-center" style={{ paddingVertical: 22 }}>
                      {brands.length === 0
                        ? 'No brands mapped to this category yet.'
                        : 'No brand matches that search.'}
                    </Text>
                  ) : filteredBrands.map((b) => (
                    <BrandRow
                      key={b.id}
                      label={b.name}
                      logo={resolveDeviceImageSource({ url: b.imageUrl, base64: b.imageBase64 })}
                      active={brandFilter?.id === b.id}
                      onPress={() => { setBrandFilter({ id: b.id, name: b.name }); setShowBrands(false); }}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </ModalInsets>
      </SafeModal>
    </View>
  );
}

function BrandRow({ label, logo, active, onPress }) {
  const initial = String(label || '?').trim().charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-2xl mb-1.5 active:opacity-80"
      style={{
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: active ? '#E5F3F5' : '#FFFFFF',
        borderWidth: 1, borderColor: active ? GREEN : '#E5E7EB',
      }}
    >
      <View className="items-center justify-center rounded-xl overflow-hidden mr-3" style={{ width: 34, height: 34, backgroundColor: '#E5F3F5' }}>
        {logo ? (
          <Image source={{ uri: logo }} style={{ width: 26, height: 26 }} resizeMode="contain" />
        ) : (
          <Text className="text-[12px] font-extrabold" style={{ color: GREEN }}>{initial}</Text>
        )}
      </View>
      <Text className="flex-1 text-[13px] font-extrabold text-gray-900" numberOfLines={1}>{label}</Text>
      {active ? <Check size={16} color={GREEN} /> : null}
    </Pressable>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mr-2 mb-2 px-3.5 py-2 rounded-full active:opacity-80"
      style={{ backgroundColor: active ? GREEN : '#F3F4F6', borderWidth: 1, borderColor: active ? GREEN : '#E5E7EB' }}
    >
      <Text className="text-[12px] font-extrabold" style={{ color: active ? '#FFFFFF' : '#6B7280' }}>{label}</Text>
    </Pressable>
  );
}
