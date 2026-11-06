import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronDown, Heart, SlidersHorizontal, ShoppingCart } from 'lucide-react-native';
import { listProducts } from '../../../api/marketplace';
import { sortCategories } from '../OwnerBuyHomeScreen';
import { getAllModels, getDeviceCategories } from '../../../api/masterData';
import { getListingOrigin, isOwnListing } from '../../../api/nearbyListings';
import { HeaderIconButton } from '../../../components/PageHeader';
import { productToCard } from '../OwnerBuyListingScreen';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { rf } from '../../../utils/responsive';
import {
  C, CONTENT_MAX, ChoiceCard, EmptyBox, ErrorBox, PickerModal, PrimaryButton, SearchInput, SellScreen, TextField, Thumb,
  cleanAmount, listingImage, money,
} from '../sell/kit';
import { BellButton } from './buyKit';

// Page 2 — browse devices & spares listed by other shops (GET /marketplace/products,
// type SELL, ACTIVE), with category chips, search, filters, sort and a grid.

const FAV_KEY = 'ggfix.buy.favourites';
const SPARES = '__spares';
const PAGE = 20;
const SORTS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'newest', label: 'Newest first' },
  { id: 'priceAsc', label: 'Price: low to high' },
  { id: 'priceDesc', label: 'Price: high to low' },
];
const CONDITIONS = ['Any', 'New', 'Used', 'Refurbished'];

function parse(json) { try { return json ? JSON.parse(json) : {}; } catch (_) { return {}; } }
function FilterSheet({ visible, cond, maxPrice, onApply, onClose }) {
  const [c, setC] = useState(cond);
  const [mp, setMp] = useState(maxPrice);
  useEffect(() => { if (visible) { setC(cond); setMp(maxPrice); } }, [visible, cond, maxPrice]);
  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalInsets>
        {({ bottom }) => (
          <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: bottom + 16 }}>
              <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>Filters</Text>
              <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, marginTop: 12 }}>Condition</Text>
              {CONDITIONS.map((x) => <ChoiceCard key={x} radio title={x === 'Any' ? 'Any condition' : x} selected={c === x} onPress={() => setC(x)} style={{ marginTop: 6, padding: 10 }} />)}
              <TextField label="Max price" prefix="₹" value={mp} onChangeText={(t) => setMp(cleanAmount(t))} placeholder="No limit" keyboardType="decimal-pad" maxLength={9} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <PrimaryButton title="Reset" variant="outline" style={{ flex: 1 }} onPress={() => onApply('Any', '')} />
                <PrimaryButton title="Show Results" style={{ flex: 1.4 }} onPress={() => onApply(c, mp)} />
              </View>
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}

const isSpare = (p) => p.descriptionType === 'SPARE_PARTS' || parse(p.assessmentJson)?.sellMeta?.listingType === 'SPARE_PART';
const conditionOf = (p) => String(p.conditionLabel || '').split('·')[0].trim() || null;

function ProductCard({ p, width, fav, onFav, onPress }) {
  const cond = conditionOf(p);
  return (
    <View style={{ width }}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={p.title} className="active:opacity-90" style={{ width, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 10 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center', height: width * 0.78 }}>
        <Thumb uri={listingImage(p)} size={Math.round(width * 0.7)} radius={10} style={{ backgroundColor: '#FFFFFF' }} />
      </View>
      <Text numberOfLines={2} style={{ fontSize: rf(12), fontWeight: '700', color: C.text, marginTop: 6, minHeight: rf(30) }}>{p.title || 'Listing'}</Text>
      <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text, marginTop: 4 }}>{money(p.price)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        {cond ? (
          <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: C.greenBg }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', color: '#0B6B4B' }}>{cond}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
      <Pressable onPress={onFav} accessibilityRole="button" accessibilityLabel={fav ? 'Remove from saved' : 'Save'} hitSlop={8} style={{ position: 'absolute', top: 8, right: 8, padding: 2 }}>
        <Heart size={18} color={fav ? C.red : C.text} fill={fav ? C.red : 'transparent'} />
      </Pressable>
    </View>
  );
}

export default function BuyBrowseScreen({ navigation, route }) {
  const params = route?.params || {};
  const { width } = useWindowDimensions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [cats, setCats] = useState([]);
  const [modelCat, setModelCat] = useState({});
  const [cat, setCat] = useState(params.spares ? SPARES : params.categoryId || 'ALL');
  const [q, setQ] = useState(params.q || '');
  const [sort, setSort] = useState('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [cond, setCond] = useState('Any');
  const [maxPrice, setMaxPrice] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [favs, setFavs] = useState([]);

  useEffect(() => {
    AsyncStorage.getItem(FAV_KEY).then((v) => { try { setFavs(JSON.parse(v) || []); } catch (_) {} }).catch(() => {});
    // Same order as the Buy page strip: Mobile, Laptop, Tablet, …
    getDeviceCategories().then((l) => setCats(sortCategories((l || []).filter((c) => c.isActive !== false)))).catch(() => {});
    // Product rows carry a modelId, not a category: map it through the catalogue.
    getAllModels().then((rows) => {
      const m = {};
      (rows || []).forEach((r) => { if (r.id && r.categoryId) m[r.id] = r.categoryId; });
      setModelCat(m);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const [rows, origin] = await Promise.all([listProducts({ type: 'SELL', status: 'ACTIVE' }), getListingOrigin().catch(() => null)]);
      setItems((rows || []).filter((p) => !isOwnListing(origin, p)));
      setError(null);
    } catch (e) {
      setError(e?.message || 'Could not load listings.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cap = Number(maxPrice) || null;
    // Selected category's name/code — matches listings saved without a category id.
    const sel = cats.find((x) => x.id === cat);
    const selKeys = [sel?.name, sel?.code].filter(Boolean).map((v) => String(v).toLowerCase());
    let list = items.filter((p) => {
      if (cat === SPARES && !isSpare(p)) return false;
      if (cat !== 'ALL' && cat !== SPARES) {
        const lc = parse(p.assessmentJson)?.listing?.category || {};
        const c = lc.id || modelCat[p.modelId];
        const byName = [lc.name, lc.code].some((v) => v && selKeys.includes(String(v).toLowerCase()));
        if ((c ? c !== cat : !byName) || isSpare(p)) return false;
      }
      if (needle && !`${p.title} ${p.description || ''}`.toLowerCase().includes(needle)) return false;
      if (cond !== 'Any' && !String(p.conditionLabel || '').toLowerCase().includes(cond.toLowerCase())) return false;
      if (cap && !(Number(p.price) <= cap)) return false;
      return true;
    });
    if (sort === 'newest') list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (sort === 'priceAsc') list = [...list].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sort === 'priceDesc') list = [...list].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    return list;
  }, [items, cat, q, cond, maxPrice, sort, modelCat, cats]);
  useEffect(() => { setShown(PAGE); }, [cat, q, cond, maxPrice, sort]);

  const chips = [{ id: 'ALL', label: 'All' }, ...cats.map((c) => ({ id: c.id, label: c.name })), { id: SPARES, label: 'Spares' }];
  // Opened from a category (e.g. Mobile on the Buy page): bring its chip into view once the chips load.
  const chipsRef = useRef(null);
  const chipIdx = chips.findIndex((c) => c.id === cat);
  useEffect(() => {
    // Chips stay left-aligned from "All"; only a chip that starts off-screen is scrolled to the left edge.
    if (!cats.length || chipIdx < 3) return undefined;
    const t = setTimeout(() => chipsRef.current?.scrollToIndex({ index: chipIdx, viewPosition: 0, animated: false }), 250);
    return () => clearTimeout(t);
  }, [cats.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gap = 10;
  const cardW = Math.floor((Math.min(width, CONTENT_MAX) - 32 - gap * (cols - 1)) / cols);
  const filterCount = (cond !== 'Any' ? 1 : 0) + (maxPrice ? 1 : 0);

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <SearchInput value={q} onChangeText={setQ} placeholder="Search devices, spares..." style={{ flex: 1 }} />
        <Pressable onPress={() => setFilterOpen(true)} accessibilityRole="button" accessibilityLabel="Filters" className="active:opacity-80" style={{ height: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, backgroundColor: '#FFFFFF' }}>
          <SlidersHorizontal size={16} color={C.text} />
          <Text style={{ marginLeft: 6, fontSize: rf(12.5), fontWeight: '800', color: C.text }}>Filters{filterCount ? ` (${filterCount})` : ''}</Text>
        </Pressable>
      </View>
      <FlatList
        ref={chipsRef}
        horizontal
        data={chips}
        onScrollToIndexFailed={(i) => chipsRef.current?.scrollToOffset({ offset: i.averageItemLength * i.index, animated: false })}
        keyExtractor={(c) => String(c.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
        renderItem={({ item }) => {
          const on = item.id === cat;
          return (
            <Pressable onPress={() => setCat(item.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} className="active:opacity-80" style={{ height: 34, borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: on ? C.teal : '#FFFFFF', borderWidth: 1, borderColor: on ? C.teal : C.border }}>
              <Text style={{ fontSize: rf(12), fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: rf(12.5), color: C.muted }}>{loading ? 'Loading…' : `${filtered.length} Result${filtered.length === 1 ? '' : 's'}`}</Text>
        <Pressable onPress={() => setSortOpen(true)} accessibilityRole="button" accessibilityLabel="Sort" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: rf(12.5), color: C.text, fontWeight: '700' }}>Sort: {SORTS.find((s) => s.id === sort)?.label}</Text>
          <ChevronDown size={15} color={C.text} />
        </Pressable>
      </View>
      {error ? <ErrorBox message={error} onRetry={() => { setLoading(true); load(); }} style={{ marginBottom: 10 }} /> : null}
    </View>
  );

  return (
    <SellScreen
      title="Buy"
      subtitle="Devices & spares"
      onBack={() => navigation.goBack()}
      scroll={false}
      right={(
        <View style={{ flexDirection: 'row', gap: 4, marginRight: -8 }}>
          <BellButton navigation={navigation} />
          <HeaderIconButton icon={ShoppingCart} label="Cart" onPress={() => navigation.navigate('OwnerCart')} />
        </View>
      )}
    >
      <FlatList
        data={filtered.slice(0, shown)}
        key={cols}
        numColumns={cols}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingBottom: 30, rowGap: gap }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (shown < filtered.length) setShown((n) => n + PAGE); }}
        ListEmptyComponent={loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 30 }} /> : (
          <EmptyBox title="No listings found" sub={q || filterCount || cat !== 'ALL' ? 'Try another category, search or filter.' : 'Shops haven’t listed anything yet.'} />
        )}
        renderItem={({ item }) => (
          <ProductCard
            p={item}
            width={cardW}
            fav={favs.includes(item.id)}
            onFav={() => toggleFav(item.id)}
            onPress={() => navigation.navigate('OwnerBuyListingDetails', { listing: { ...productToCard(item), categoryId: modelCat[item.modelId] || null } })}
          />
        )}
      />
      <PickerModal visible={sortOpen} title="Sort by" options={SORTS} searchable={false} selectedId={sort} onSelect={(o) => { setSort(o.id); setSortOpen(false); }} onClose={() => setSortOpen(false)} />
      <FilterSheet visible={filterOpen} cond={cond} maxPrice={maxPrice} onClose={() => setFilterOpen(false)} onApply={(c, mp) => { setCond(c); setMaxPrice(mp); setFilterOpen(false); }} />
    </SellScreen>
  );
}
