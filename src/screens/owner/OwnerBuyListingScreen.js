import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
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
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  MapPin,
  Navigation as NavIcon,
  Phone,
  Eye,
  Sparkles,
  Smartphone,
  Store,
  User,
  Wrench,
  SlidersHorizontal,
  Mic,
  Zap,
  ShieldCheck,
  BadgePercent,
  RotateCcw,
  Tag,
  LayoutGrid,
  ArrowRight,
  Plus,
  TrendingUp,
} from 'lucide-react-native';
import { marketplaceApi } from '../../api/client';
import { listProducts, getCart, addToCart } from '../../api/marketplace';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { fetchMe } from '../../api/auth';
import { getSession } from '../../auth/session';
import { getDeviceCategories, getBrandsForCategory, getModelsByBrand, getBanners } from '../../api/masterData';
import { listShops } from '../../api/shops';
import { OfferBanner } from '../../components/rnr';
import { notify } from '../../components/confirm';

const GREEN       = '#087A0A';
const GREEN_LIGHT = '#16BB05';
const GREEN_DARK  = '#087A0A';

const RADIUS_KM = 20;

const cardShadow = {
  shadowColor: '#172117',
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

// Static trust strip — marketing content, same on every load.
const TRUST = [
  { icon: ShieldCheck,  title: 'Verified Sellers', sub: '100% Trusted',    color: '#087A0A', bg: '#E6F7E3' },
  { icon: BadgePercent, title: 'Best Prices',      sub: 'Great Discounts', color: '#16BB05', bg: '#E6F7E3' },
  { icon: RotateCcw,    title: 'Easy Returns',     sub: '7 Days Policy',   color: '#16BB05', bg: '#F0F8EF' },
  { icon: ShieldCheck,  title: 'Warranty',         sub: 'Brand Warranty',  color: '#D97706', bg: '#FEF3C7' },
];

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
function productToCard(p) {
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

export default function OwnerBuyListingScreen({ navigation, route }) {
  const { categoryId, categoryCode, categoryName } = route?.params || {};
  const { width: winW } = useWindowDimensions();
  const padH = 16;
  // The hero carousel lives inside the FlatList content container, which is
  // inset by (padH - 2) on each side — so its real page/viewport width is the
  // window width minus that gutter, NOT winW. Using winW overflows the viewport
  // and desyncs paging + dots.
  const heroW = winW - 2 * (padH - 2);

  const [cats, setCats] = useState([]);
  const [selected, setSelected] = useState(
    categoryId ? { id: categoryId, code: categoryCode, name: categoryName } : null,
  );
  const [listings, setListings] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [query, setQuery] = useState('');
  const [allowedModelIds, setAllowedModelIds] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const modelCache = useRef(new Map());

  // Hero banner carousel (master banners filtered to the "Buy" title).
  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerRef = useRef(null);

  // Filters (Sort + Seller) — reachable from the header Filters pill.
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('default');
  const [sellerFilter, setSellerFilter] = useState('ALL');
  const activeFilters = (sortBy !== 'default' ? 1 : 0) + (sellerFilter !== 'ALL' ? 1 : 0);

  const browsing = !!selected || !!query.trim();

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
        const list = await getDeviceCategories();
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
    if (shop && shop.latitude != null && shop.longitude != null) {
      return { lat: Number(shop.latitude), lng: Number(shop.longitude), shopName: shop.name, sellerId: session?.userId, shopId };
    }
    return { lat: null, lng: null, shopName: session?.shopName, sellerId: session?.userId, shopId };
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

        const myShopId = o.shopId || null;

        const listingArr = Array.isArray(listingData) ? listingData : listingData?.content ?? listingData?.data ?? [];
        const listingCards = (listingArr || [])
          .filter((l) => !myShopId || l.shopId !== myShopId)
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
          .filter((p) => !myShopId || p.shopId !== myShopId)
          .map((p) => {
            const card = productToCard(p);
            const shop = p.shopId ? shopMap.get(p.shopId) : null;
            return { ...card, shopName: shop?.name || null, city: shop?.city || null, state: shop?.state || null };
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
    if (typeof q === 'string' && q) setQuery(q);
  }, [route?.params?.q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = selected?.id || selected?.code;
      if (!key) { setAllowedModelIds(null); return; }
      if (modelCache.current.has(key)) { setAllowedModelIds(modelCache.current.get(key)); return; }
      try {
        const brands = await getBrandsForCategory(key).catch(() => []);
        const lists = await Promise.all((brands || []).map((b) => getModelsByBrand(b.id).catch(() => [])));
        const ids = new Set();
        lists.flat().forEach((m) => { if (m?.id) ids.add(m.id); });
        modelCache.current.set(key, ids);
        if (!cancelled) setAllowedModelIds(ids);
      } catch {
        if (!cancelled) setAllowedModelIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const visibleItems = useMemo(() => {
    const all = [...listings, ...products];
    const wantId = selected?.id || null;
    const inCat = (it) => {
      if (!selected) return true;
      if (wantId && it.categoryId) return it.categoryId === wantId;
      if (it.modelId && allowedModelIds && allowedModelIds.has(it.modelId)) return true;
      // Items with neither category nor model (e.g. spare-parts listings, which
      // are created with null brandId/modelId) must NOT match a specific
      // category filter — they should only appear under "All".
      return false;
    };
    const inSeller = (it) => {
      if (sellerFilter === 'ALL') return true;
      const isCust = it.sellerType === 'CUSTOMER';
      return sellerFilter === 'CUSTOMER' ? isCust : !isCust;
    };
    const q = query.trim().toLowerCase();
    const arr = all.filter(inCat).filter(inSeller).filter((it) => {
      if (!q) return true;
      return [it.productName, it.condition, it.city, it.state].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
    if (sortBy === 'price_asc') arr.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sortBy === 'price_desc') arr.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sortBy === 'nearest') arr.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return arr;
  }, [listings, products, selected, allowedModelIds, query, sellerFilter, sortBy]);

  // Discovery rails (used when not actively browsing a category / search).
  const flashDeals = useMemo(() => visibleItems.slice(0, 10), [visibleItems]);
  const trending = useMemo(
    () => [...visibleItems].sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 10),
    [visibleItems],
  );

  const openDetail = (item) => navigation.navigate('OwnerBuyListingDetails', { listing: item });

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

  const clearFilters = () => { setSortBy('default'); setSellerFilter('ALL'); };

  // ── Vertical browse card (kept from before) ───────────────────────
  const renderItem = ({ item }) => {
    const productName = item.productName || 'Untitled';
    const isCustomer = item.sellerType === 'CUSTOMER';
    const isSpare = item.productType === 'SPARE_PART';
    const sellerLabel = isCustomer ? 'Customer' : 'Shop';
    const sellerLine = [item.city, item.state].filter(Boolean).join(', ') || item.address || '—';
    const distance = item.distanceKm != null ? `${item.distanceKm} km` : null;
    const priceNum = item.expectedPrice != null ? Number(item.expectedPrice) : null;
    const isAwaitingQuote = priceNum != null && priceNum === 0;
    const price = priceNum != null && priceNum > 0 ? priceNum.toLocaleString('en-IN') : null;

    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => openDetail(item)} className="bg-white rounded-2xl p-4 mb-3" style={cardShadow}>
        <View className="flex-row items-start">
          <View style={{ position: 'relative', marginRight: 12 }}>
            <View className="w-[70px] h-[70px] rounded-2xl overflow-hidden items-center justify-center" style={{ backgroundColor: '#F0F8EF' }}>
              {item.productImage ? (
                <Image source={{ uri: item.productImage }} style={{ width: 70, height: 70 }} resizeMode="cover" />
              ) : isSpare ? <Wrench size={24} color={GREEN_DARK} /> : <Smartphone size={26} color={GREEN_DARK} />}
            </View>
            <View
              style={{
                position: 'absolute', bottom: -6, left: '50%', transform: [{ translateX: -28 }], width: 56,
                paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, borderWidth: 2, borderColor: '#FFFFFF',
                backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isCustomer ? <User size={9} color="#FFFFFF" /> : <Store size={9} color="#FFFFFF" />}
              <Text className="text-white text-[9px] font-extrabold ml-0.5" style={{ letterSpacing: 0.3 }}>{sellerLabel}</Text>
            </View>
          </View>

          <View className="flex-1 pr-2">
            <Text className="text-[14.5px] font-extrabold text-gray-900" numberOfLines={1}>{productName}</Text>
            <View className="flex-row items-center mt-1.5" style={{ flexWrap: 'wrap' }}>
              {isSpare ? (
                <View className="self-start flex-row items-center px-2 py-1 rounded-full mr-1.5 mb-1" style={{ backgroundColor: '#FEF3C7' }}>
                  <Wrench size={10} color="#B45309" />
                  <Text className="ml-1 text-[10px] font-extrabold" style={{ color: '#B45309', letterSpacing: 0.3 }}>SPARE PART</Text>
                </View>
              ) : null}
              {item.condition ? (
                <View className="self-start flex-row items-center px-2 py-1 rounded-full mb-1" style={{ backgroundColor: '#F0F8EF' }}>
                  <Sparkles size={10} color="#16BB05" />
                  <Text className="ml-1 text-[10px] font-extrabold" style={{ color: '#16BB05', letterSpacing: 0.3 }}>{item.condition}</Text>
                </View>
              ) : null}
            </View>
            {item.shopName ? (
              <View className="flex-row items-center mt-0.5">
                <Store size={12} color="#8FA08F" />
                <Text className="text-[11.5px] text-gray-700 font-bold ml-1 flex-1" numberOfLines={1}>{item.shopName}</Text>
              </View>
            ) : null}
            <View className="flex-row items-center mt-0.5">
              <MapPin size={12} color="#8FA08F" />
              <Text className="text-[11px] text-gray-500 ml-1 flex-1" numberOfLines={1}>{sellerLine}</Text>
            </View>
            {distance ? (
              <View className="self-start flex-row items-center px-2 py-1 rounded-full mt-1.5" style={{ backgroundColor: '#F0F8EF' }}>
                <NavIcon size={10} color={GREEN_DARK} />
                <Text className="ml-1 text-[10px] font-extrabold" style={{ color: GREEN_DARK }}>{distance} away</Text>
              </View>
            ) : null}
          </View>

          <View className="items-end" style={{ minWidth: 70 }}>
            {isAwaitingQuote ? (
              <View className="px-2 py-1.5 rounded-lg items-center" style={{ backgroundColor: '#FEF3C7' }}>
                <Text className="text-[10px] font-extrabold text-center" style={{ color: '#B45309', lineHeight: 13 }}>Awaiting{'\n'}Quote</Text>
              </View>
            ) : price ? (
              <>
                <Text className="text-[9.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.5 }}>Price</Text>
                <Text className="text-[17px] font-extrabold mt-0.5" style={{ color: GREEN_DARK }}>₹{price}</Text>
              </>
            ) : <Text className="text-[15px] font-extrabold text-gray-300">—</Text>}
          </View>
        </View>

        <View className="my-3" style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2', borderStyle: 'dashed' }} />

        <View className="flex-row">
          <TouchableOpacity
            activeOpacity={0.85} onPress={() => openDetail(item)}
            className="flex-1 mr-2 rounded-xl py-2.5 flex-row items-center justify-center"
            style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#E6F7E3' }}
          >
            <Eye size={14} color={GREEN_DARK} />
            <Text className="ml-1.5 text-[12.5px] font-extrabold" style={{ color: GREEN_DARK }}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              const phone = item.contactPhone || item.sellerPhone;
              if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
              else notify('No phone yet', isCustomer ? 'This customer has not shared a phone number. Tap View Details to send a quotation instead.' : 'No contact phone available for this seller.');
            }}
            className="flex-1 ml-2" style={cardShadow}
          >
            <LinearGradient colors={[GREEN_LIGHT, GREEN_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Phone size={14} color="#FFFFFF" />
              <Text className="ml-1.5 text-white text-[12.5px] font-extrabold">Contact</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Category chip (image tile + label) ────────────────────────────
  const CategoryChip = ({ active, label, isAll, uri, emoji, onPress }) => (
    <Pressable onPress={onPress} className="items-center mr-3 active:opacity-80" style={{ width: 66 }}>
      <View
        className="h-16 w-16 rounded-2xl items-center justify-center overflow-hidden"
        style={{
          backgroundColor: isAll && active ? GREEN : '#FFFFFF',
          borderWidth: active ? 2 : 1,
          borderColor: active ? GREEN : '#EFF5EE',
          ...cardShadow,
        }}
      >
        {isAll ? (
          <LayoutGrid size={26} color={active ? '#FFFFFF' : '#172117'} />
        ) : uri ? (
          <Image source={{ uri }} style={{ width: 40, height: 40 }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 26 }}>{emoji}</Text>
        )}
      </View>
      <Text className="text-[10.5px] font-bold mt-1 text-center" numberOfLines={1} style={{ color: active ? GREEN_DARK : '#172117' }}>
        {label}
      </Text>
    </Pressable>
  );

  // ── Flash-deal card (vertical, image on top) ──────────────────────
  const DealCard = ({ item }) => {
    const name = item.productName || 'Item';
    const price = item.expectedPrice != null && Number(item.expectedPrice) > 0 ? Number(item.expectedPrice).toLocaleString('en-IN') : null;
    const distance = item.distanceKm != null ? `${item.distanceKm} km` : null;
    return (
      <Pressable onPress={() => openDetail(item)} className="bg-white rounded-2xl active:opacity-90" style={{ width: 152, marginRight: 12, padding: 10, ...cardShadow }}>
        <View className="rounded-xl items-center justify-center overflow-hidden" style={{ height: 108, backgroundColor: '#F0F8EF' }}>
          {item.productImage ? <Image source={{ uri: item.productImage }} style={{ width: '86%', height: '86%' }} resizeMode="contain" /> : <Smartphone size={30} color={GREEN_DARK} />}
        </View>
        <Text className="text-[12.5px] font-extrabold text-gray-900 mt-2" numberOfLines={2} style={{ minHeight: 32 }}>{name}</Text>
        {item.condition ? <Text className="text-[10px] text-text-muted mt-0.5" numberOfLines={1}>{item.condition}</Text> : null}
        <Text className="text-[15px] font-extrabold mt-1" style={{ color: GREEN_DARK }}>{price ? `₹${price}` : '—'}</Text>
        {distance ? (
          <View className="self-start flex-row items-center px-1.5 py-0.5 rounded-full mt-1.5" style={{ backgroundColor: '#F0F8EF' }}>
            <NavIcon size={9} color={GREEN_DARK} />
            <Text className="ml-1 text-[9.5px] font-extrabold" style={{ color: GREEN_DARK }}>{distance}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  // ── Trending card (image left + quick add) ────────────────────────
  const TrendingCard = ({ item }) => {
    const name = item.productName || 'Item';
    const price = item.expectedPrice != null && Number(item.expectedPrice) > 0 ? Number(item.expectedPrice).toLocaleString('en-IN') : null;
    const distance = item.distanceKm != null ? `${item.distanceKm} km` : null;
    return (
      <Pressable onPress={() => openDetail(item)} className="bg-white rounded-2xl flex-row items-center active:opacity-90" style={{ width: 244, marginRight: 12, padding: 10, ...cardShadow }}>
        <View className="rounded-xl items-center justify-center overflow-hidden mr-2.5" style={{ width: 60, height: 60, backgroundColor: '#F0F8EF' }}>
          {item.productImage ? <Image source={{ uri: item.productImage }} style={{ width: 60, height: 60 }} resizeMode="cover" /> : <Smartphone size={24} color={GREEN_DARK} />}
        </View>
        <View className="flex-1 pr-1">
          <Text className="text-[12.5px] font-extrabold text-gray-900" numberOfLines={1}>{name}</Text>
          {item.condition ? <Text className="text-[10px] text-text-muted mt-0.5" numberOfLines={1}>{item.condition}</Text> : null}
          <View className="flex-row items-center mt-0.5">
            <Text className="text-[14px] font-extrabold" style={{ color: GREEN_DARK }}>{price ? `₹${price}` : '—'}</Text>
            {distance ? <Text className="text-[10px] text-text-muted ml-2" numberOfLines={1}>{distance}</Text> : null}
          </View>
        </View>
        <Pressable
          onPress={() => handleAddToCart(item)}
          hitSlop={8}
          className="h-9 w-9 rounded-full items-center justify-center"
          style={{ backgroundColor: '#E6F7E3' }}
        >
          {item.source === 'product' ? <Plus size={17} color={GREEN_DARK} strokeWidth={2.6} /> : <ChevronRight size={17} color={GREEN_DARK} strokeWidth={2.6} />}
        </Pressable>
      </Pressable>
    );
  };

  const SectionHead = ({ icon, title, onViewAll }) => (
    <View className="flex-row items-center justify-between" style={{ paddingHorizontal: padH, marginTop: 18, marginBottom: 10 }}>
      <View className="flex-row items-center">
        {icon}
        <Text className="text-[16px] font-extrabold text-gray-900 ml-1.5">{title}</Text>
      </View>
      {onViewAll ? (
        <Pressable onPress={onViewAll} className="flex-row items-center active:opacity-70">
          <Text className="text-[12.5px] font-extrabold" style={{ color: GREEN_DARK }}>View all</Text>
          <ChevronRight size={15} color={GREEN_DARK} />
        </Pressable>
      ) : null}
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
            return (
              <CategoryChip
                active={selected?.id === c.id}
                label={c.name}
                emoji={catEmoji(code)}
                uri={catImage(c)}
                onPress={() => setSelected({ id: c.id, code, name: c.name })}
              />
            );
          }}
        />
      </View>

      {/* Hero carousel — "Buy" banners, auto-scrolling */}
      {banners.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <ScrollView
            ref={bannerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setBannerIndex(Math.round(e.nativeEvent.contentOffset.x / heroW))}
          >
            {banners.map((b) => {
              const uri = bannerImage(b);
              return (
                <View key={b.id} style={{ width: heroW }}>
                  <Pressable
                    onPress={() => {
                      const t = b.linkTarget || b.link_target;
                      if (t && /^https?:\/\//i.test(t)) Linking.openURL(t).catch(() => {});
                      else setSelected(null);
                    }}
                    className="rounded-3xl overflow-hidden active:opacity-95"
                    style={cardShadow}
                  >
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
                <View
                  key={b.id}
                  style={{
                    height: 6,
                    width: i === bannerIndex ? 18 : 6,
                    borderRadius: 3,
                    marginHorizontal: 3,
                    backgroundColor: i === bannerIndex ? GREEN : '#CBD5CB',
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ paddingHorizontal: padH, marginTop: 12 }}>
          <OfferBanner
            badge="NEARBY DEALS"
            title="Buy refurbished & spares"
            subtitle="From verified shops & customers within your area."
            cta="Browse all"
            palette="emerald"
            onPress={() => setSelected(null)}
          />
        </View>
      )}

      {/* Trust strip */}
      <View style={{ paddingHorizontal: padH, marginTop: 14 }}>
        <View className="bg-white rounded-2xl flex-row" style={{ paddingVertical: 12, paddingHorizontal: 6, ...cardShadow }}>
          {TRUST.map((t) => {
            const Icon = t.icon;
            return (
              <View key={t.title} className="items-center" style={{ flex: 1, paddingHorizontal: 2 }}>
                <View className="h-9 w-9 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: t.bg }}>
                  <Icon size={17} color={t.color} strokeWidth={2.3} />
                </View>
                <Text className="text-[10px] font-extrabold text-gray-900 text-center" numberOfLines={1}>{t.title}</Text>
                <Text className="text-[8.5px] text-text-muted text-center mt-0.5" numberOfLines={1}>{t.sub}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Discovery rails (only when not browsing a category / search) */}
      {!browsing ? (
        <>
          {flashDeals.length > 0 ? (
            <>
              <SectionHead icon={<Zap size={17} color="#F59E0B" fill="#F59E0B" />} title="Flash Deals" onViewAll={() => setSelected(null)} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: padH, paddingBottom: 2 }}>
                {flashDeals.map((it) => <DealCard key={`deal-${it._key}`} item={it} />)}
              </ScrollView>
            </>
          ) : null}

          {trending.length > 0 ? (
            <>
              <SectionHead icon={<TrendingUp size={17} color={GREEN_DARK} />} title="Trending Near You" onViewAll={() => setSelected(null)} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: padH, paddingBottom: 2 }}>
                {trending.map((it) => <TrendingCard key={`trend-${it._key}`} item={it} />)}
              </ScrollView>
            </>
          ) : null}

          {/* Promo strip (static marketing) */}
          <View style={{ paddingHorizontal: padH, marginTop: 18 }}>
            <View className="rounded-2xl flex-row items-center" style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF', padding: 12 }}>
              <View className="h-10 w-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#E6F7E3' }}>
                <Tag size={18} color={GREEN_DARK} />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-[13px] font-extrabold text-gray-900">Extra 5% off on Prepaid Orders</Text>
                <View className="flex-row items-center mt-1">
                  <Text className="text-[11px] text-text-muted mr-1.5">Use code</Text>
                  <View className="px-2 py-0.5 rounded-md" style={{ borderWidth: 1, borderColor: GREEN, borderStyle: 'dashed', backgroundColor: '#FFFFFF' }}>
                    <Text className="text-[11px] font-extrabold" style={{ color: GREEN_DARK }}>GG5OFF</Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={() => setSelected(null)} className="rounded-xl active:opacity-90 overflow-hidden">
                <LinearGradient colors={[GREEN_LIGHT, GREEN_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center' }}>
                  <Text className="text-white text-[12px] font-extrabold mr-1">Shop Now</Text>
                  <ArrowRight size={14} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </>
      ) : (
        <View style={{ paddingHorizontal: padH, marginTop: 16, marginBottom: 4 }} className="flex-row items-center justify-between">
          <Text className="text-[15px] font-extrabold text-gray-900">{selected ? selected.name : 'Search results'}</Text>
          <Text className="text-[11px] text-gray-500 font-semibold">{visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF', paddingTop: 10, paddingBottom: 16,
            borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
            borderBottomWidth: 1, borderBottomColor: '#E2E8E2',
          }}
        >
          <View style={{ paddingHorizontal: padH }}>
            {/* Back · Buy (+subtitle) · Cart */}
            <View className="flex-row items-center">
              <Pressable
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
                hitSlop={10}
                className="h-9 w-9 rounded-full items-center justify-center bg-surface-muted"
              >
                <ChevronLeft size={20} color="#172117" />
              </Pressable>
              <View className="flex-1 items-center">
                <Text className="text-text text-[18px] font-extrabold">Buy</Text>
                <Text className="text-text-muted text-[11px] font-medium mt-0.5">Buy devices, spares & more</Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('OwnerCart')}
                hitSlop={10}
                className="h-9 w-9 rounded-full items-center justify-center bg-surface-muted"
              >
                <ShoppingCart size={18} color="#172117" />
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
                style={{ backgroundColor: '#EFF5EE', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8E2', paddingHorizontal: 14, paddingVertical: 11 }}
              >
                <Search size={18} color={GREEN} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  placeholder="Search mobiles, spares, accessories..."
                  placeholderTextColor="#8FA08F"
                  style={{ flex: 1, marginLeft: 10, color: '#172117', fontSize: 14, padding: 0 }}
                />
                {query ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setQuery('')} className="w-7 h-7 rounded-full items-center justify-center">
                    <X size={14} color="#667066" />
                  </TouchableOpacity>
                ) : (
                  <Mic size={18} color={GREEN} />
                )}
              </View>
              <Pressable
                onPress={() => setShowFilters(true)}
                className="ml-2 flex-row items-center rounded-2xl px-3.5 active:opacity-80"
                style={{ height: 46, backgroundColor: activeFilters > 0 ? GREEN : '#FFFFFF', borderWidth: 1, borderColor: activeFilters > 0 ? GREEN : '#E2E8E2' }}
              >
                <SlidersHorizontal size={16} color={activeFilters > 0 ? '#FFFFFF' : '#172117'} />
                <Text className="text-[13px] font-extrabold ml-1.5" style={{ color: activeFilters > 0 ? '#FFFFFF' : '#172117' }}>Filters</Text>
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
            <Text className="text-[12.5px] font-semibold" style={{ color: '#B91C1C' }}>{error}</Text>
          </View>
        </View>
      ) : null}

      {loading && listings.length === 0 && products.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={GREEN} />
      ) : (
        <FlatList
          data={browsing ? visibleItems : []}
          keyExtractor={(item) => item._key}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />}
          contentContainerStyle={{ paddingHorizontal: padH - 2, paddingBottom: 110 }}
          ListEmptyComponent={
            browsing ? (
              <View className="items-center pt-10 px-8">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#E6F7E3' }}>
                  <Store size={32} color={GREEN_DARK} />
                </View>
                <Text className="text-[15px] font-extrabold text-gray-700">No {selected ? `${String(selected.name).toLowerCase()} ` : ''}items yet</Text>
                <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">Listings from customers & shops and shop catalogue items will show up here.</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Cart FAB */}
      <Pressable
        onPress={() => navigation.navigate('OwnerCart')}
        className="rounded-full items-center justify-center active:opacity-90"
        style={{ position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, backgroundColor: GREEN_DARK, shadowColor: GREEN_DARK, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}
      >
        <ShoppingCart size={24} color="#FFFFFF" />
        {cartCount > 0 ? (
          <View className="absolute -top-1 -right-1 rounded-full min-w-[20px] h-5 px-1 items-center justify-center" style={{ backgroundColor: '#F59E0B', borderWidth: 2, borderColor: '#FFFFFF' }}>
            <Text className="text-text text-[10px] font-extrabold">{cartCount > 9 ? '9+' : cartCount}</Text>
          </View>
        ) : null}
      </Pressable>

      {/* Filters popup */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23, 33, 23, 0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8E2', marginBottom: 12 }} />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[16px] font-extrabold text-gray-900">Filters</Text>
              <Pressable onPress={() => setShowFilters(false)} hitSlop={8} className="h-8 w-8 rounded-full items-center justify-center" style={{ backgroundColor: '#EFF5EE' }}>
                <X size={16} color="#172117" />
              </Pressable>
            </View>

            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2">SORT BY</Text>
            <View className="flex-row flex-wrap">
              {SORTS.map((s) => (
                <Chip key={s.key} label={s.label} active={sortBy === s.key} onPress={() => setSortBy(s.key)} />
              ))}
            </View>

            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mb-2 mt-3">SELLER</Text>
            <View className="flex-row flex-wrap">
              {SELLERS.map((s) => (
                <Chip key={s.key} label={s.label} active={sellerFilter === s.key} onPress={() => setSellerFilter(s.key)} />
              ))}
            </View>

            <View className="flex-row mt-5">
              <Pressable onPress={clearFilters} className="flex-1 mr-1.5 py-3 rounded-xl items-center active:opacity-70" style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8E2' }}>
                <Text className="text-[13px] font-extrabold text-gray-900">Clear</Text>
              </Pressable>
              <Pressable onPress={() => setShowFilters(false)} className="flex-1 ml-1.5 rounded-xl active:opacity-90 overflow-hidden">
                <LinearGradient colors={[GREEN_LIGHT, GREEN_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text className="text-[13px] font-extrabold text-white">Apply</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mr-2 mb-2 px-3.5 py-2 rounded-full active:opacity-80"
      style={{ backgroundColor: active ? '#087A0A' : '#EFF5EE', borderWidth: 1, borderColor: active ? '#087A0A' : '#E2E8E2' }}
    >
      <Text className="text-[12px] font-extrabold" style={{ color: active ? '#FFFFFF' : '#667066' }}>{label}</Text>
    </Pressable>
  );
}
