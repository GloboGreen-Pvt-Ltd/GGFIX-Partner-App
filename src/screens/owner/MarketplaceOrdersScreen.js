import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  ChevronLeft,
  Package,
  ShoppingBag,
  Smartphone,
  Search,
  X,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react-native';
import { marketplaceApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { resolveDeviceImageSource } from '../../utils/images';
import { selectShopId, selectUserId } from '../../store/authSlice';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// Teal rebrand. Both tokens resolve to the one brand teal: #004C40 carries
// white at high contrast AND reads on white, so unlike the old pair it needs no
// separate "fill" and "foreground" green. The names are kept so the ~8 call
// sites below stay untouched.
const BRAND_GREEN      = '#004C40';
const BRAND_GREEN_DARK = '#004C40';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Newest created first. `createdAt` is an ISO string from the API; a missing or
// unparseable one sorts last rather than poisoning the comparison with NaN.
function newestFirst(list) {
  const ts = (p) => {
    const t = p?.createdAt ? Date.parse(p.createdAt) : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...(list || [])].sort((a, b) => ts(b) - ts(a));
}

function statusMeta(rawStatus, type) {
  const s = String(rawStatus || '').toUpperCase();
  const sell = type !== 'BUY';
  if (s === 'SOLD' || s === 'COMPLETED') {
    return { short: sell ? 'Sold' : 'Done', accent: BRAND_GREEN_DARK, tint: '#E6F7E3', Icon: CheckCircle2 };
  }
  if (s === 'CANCELLED' || s === 'CANCELED') {
    return { short: 'Cancelled', accent: '#B91C1C', tint: '#FEE2E2', Icon: XCircle };
  }
  return { short: 'Pending', accent: '#B45309', tint: '#FEF3C7', Icon: Clock };
}

function OrderCard({ item, showPrice, onPress }) {
  const orderId = item.id ? String(item.id).slice(0, 10).toUpperCase().replace(/-/g, '') : '';
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = created
    ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    : '';
  const specs = [item.color, item.storageLabel].filter(Boolean).join(' · ');
  const meta = statusMeta(item.status, item.type);
  const StatusIcon = meta.Icon;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-3xl mb-3.5 active:opacity-90"
      style={[cardShadow, { padding: rs(14) }]}
    >
      <View className="flex-row items-center justify-between" style={{ marginBottom: rs(12) }}>
        <View
          className="flex-row items-center px-2.5 py-1 rounded-full"
          style={{ backgroundColor: meta.tint }}
        >
          <StatusIcon size={rs(12)} color={meta.accent} strokeWidth={2.4} />
          <Text
            className="font-extrabold ml-1"
            style={{ fontSize: rf(10), color: meta.accent, letterSpacing: 0.3 }}
          >
            {meta.short.toUpperCase()}
          </Text>
        </View>
        <Text
          className="font-bold"
          style={{ fontSize: rf(10.5), color: '#8FA08F', letterSpacing: 0.4 }}
          numberOfLines={1}
        >
          #GGFIX{orderId}
        </Text>
      </View>

      <View className="flex-row items-center">
        <View
          style={{
            width: rs(64), height: rs(64), borderRadius: rs(16),
            backgroundColor: '#FAFBFA',
            borderWidth: 1, borderColor: '#EFF2EF',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            marginRight: rs(12),
          }}
        >
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={{ width: rs(64), height: rs(64) }} resizeMode="cover" />
          ) : (
            <Smartphone size={rs(26)} color={BRAND_GREEN_DARK} />
          )}
        </View>

        <View className="flex-1 pr-2">
          <Text className="font-extrabold text-gray-900 leading-5" style={{ fontSize: rf(14) }} numberOfLines={2}>
            {item.title || 'Item'}
          </Text>
          <View className="flex-row items-center justify-between mt-1.5">
            <Text className="text-gray-500 flex-1" style={{ fontSize: rf(11.5) }} numberOfLines={1}>
              {specs || dateLabel || ''}
            </Text>
            {showPrice && item.price != null ? (
              <Text
                className="font-extrabold ml-2"
                style={{ fontSize: rf(13.5), color: BRAND_GREEN_DARK }}
              >
                ₹{Number(item.price).toLocaleString('en-IN')}
              </Text>
            ) : null}
          </View>
        </View>

        <ChevronRight size={rs(18)} color="#CBD5CB" />
      </View>
    </Pressable>
  );
}

function OrderTab({ label, Icon, active, onPress }) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 200 });
  }, [active]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Pressable onPress={onPress} className="flex-1" style={{ borderRadius: 999, overflow: 'hidden' }}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: BRAND_GREEN, borderRadius: 999 }, fillStyle]}
      />
      <View className="items-center justify-center py-2.5 flex-row">
        <Icon size={rs(15)} color={active ? '#FFFFFF' : '#667066'} />
        <Text
          className="ml-2 font-extrabold"
          style={{ fontSize: rf(12.5), color: active ? '#FFFFFF' : '#667066' }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function MarketplaceOrdersScreen({ navigation }) {
  // Tablet: cap the column and centre it, matching the employee reports. Order
  // cards stretched to 1024pt put the thumbnail and the price at opposite
  // edges. Phones keep contentW undefined and are unaffected.
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const [tab, setTab] = useState('Sell');
  const [items, setItems] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);

  // Filtered client-side: the list is already fully loaded, so this stays
  // instant and works offline. Matches the fields actually visible on a card
  // plus the order id, which is what people read off a receipt.
  const q = query.trim().toLowerCase();
  const visible = q
    ? items.filter((p) => [
        p.title,
        p.color,
        p.storageLabel,
        p.ramLabel,
        p.conditionLabel,
        p.status,
        p.id ? String(p.id).replace(/-/g, '') : '',
      ].some((v) => String(v || '').toLowerCase().includes(q)))
    : items;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await marketplaceApi.get('/marketplace/products', {
        query: { type: tab.toUpperCase() },
      });
      const list = Array.isArray(data) ? data : (data?.content || data?.data || []);
      const filtered = tab === 'Sell'
        ? list.filter((p) =>
            (userId && p.sellerUserId === userId) ||
            (shopId && p.shopId === shopId) ||
            (!p.sellerUserId && !p.shopId))
        : list;

      const brandIds = Array.from(new Set(
        filtered
          .filter((p) => p.descriptionType !== 'SPARE_PARTS' && p.brandId && p.modelId)
          .map((p) => p.brandId),
      ));
      if (brandIds.length) {
        const modelMap = {};
        await Promise.all(brandIds.map(async (brandId) => {
          try {
            const models = await getModelsByBrand(brandId);
            (models || []).forEach((m) => {
              const url = resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 });
              if (url) modelMap[m.id] = url;
            });
          } catch (_) {}
        }));
        const enriched = filtered.map((p) => {
          if (p.descriptionType === 'SPARE_PARTS') return p;
          const url = p.modelId ? modelMap[p.modelId] : null;
          return url ? { ...p, imageUrl: url } : p;
        });
        setItems(newestFirst(enriched));
      } else {
        setItems(newestFirst(filtered));
      }
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, shopId, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: rs(10),
            paddingBottom: rs(16),
            paddingHorizontal: rs(16),
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center" style={capStyle}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="h-9 w-9 rounded-full items-center justify-center bg-surface-muted mr-3"
            >
              <ChevronLeft size={rs(20)} color="#172117" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-text font-extrabold" style={{ fontSize: rf(17) }} numberOfLines={1}>
                My Orders
              </Text>
              <Text className="text-text-muted font-medium" style={{ fontSize: rf(11.5), marginTop: 2 }} numberOfLines={1}>
                {loading ? 'Loading…' : `${visible.length} ${tab.toLowerCase()} order${visible.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => {
                // Closing also clears, so a stale filter can't hide the list
                // behind a search box the user can no longer see.
                setSearchOpen((v) => {
                  if (v) setQuery('');
                  return !v;
                });
              }}
              className="h-9 w-9 rounded-full items-center justify-center"
              style={{ backgroundColor: searchOpen ? BRAND_GREEN_DARK : '#F8F8F8' }}
            >
              {searchOpen
                ? <X size={rs(16)} color="#FFFFFF" />
                : <Search size={rs(16)} color="#172117" />}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {searchOpen ? (
        <View className="px-4" style={{ marginTop: rs(10) }}>
          <View
            className="flex-row items-center bg-white"
            style={[{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#E2E8E2',
              paddingHorizontal: rs(12),
              paddingVertical: rs(2),
            }, capStyle]}
          >
            <Search size={rs(15)} color="#8FA08F" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search by device, colour or order id"
              placeholderTextColor="#8FA08F"
              returnKeyType="search"
              className="flex-1 text-text"
              style={{ fontSize: rf(12.5), paddingVertical: rs(8), marginLeft: rs(8) }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <X size={rs(15)} color="#8FA08F" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Tabs */}
      <View className="px-4 mt-3">
        <View
          className="flex-row rounded-full p-1 bg-white"
          style={[{ borderWidth: 1, borderColor: '#E2E8E2' }, cardShadow, capStyle]}
        >
          {['Buy', 'Sell'].map((t) => (
            <OrderTab
              key={t}
              label={t}
              Icon={t === 'Buy' ? ShoppingBag : Package}
              active={tab === t}
              onPress={() => setTab(t)}
            />
          ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
        </View>
      ) : visible.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: '#F0F8EF' }}
          >
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: '#E6F7E3' }}
            >
              <ShoppingBag size={rs(26)} color={BRAND_GREEN_DARK} />
            </View>
          </View>
          <Text className="font-extrabold text-gray-900" style={{ fontSize: rf(14.5) }}>
            {q ? 'No matches' : `No ${tab.toLowerCase()} orders yet`}
          </Text>
          <Text className="text-gray-500 mt-2 text-center leading-5" style={{ fontSize: rf(11.5) }}>
            {q
              ? `Nothing in ${tab} matches "${query.trim()}".`
              : tab === 'Sell'
                ? 'Your published listings will show up here.'
                : 'Your marketplace purchases will appear here.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: rs(14), paddingTop: rs(12), paddingBottom: rs(24) }, capStyle]}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((item) => (
            <OrderCard
              key={item.id}
              item={item}
              showPrice={tab === 'Sell'}
              onPress={() =>
                navigation.navigate('MarketplaceListingDetails', { productId: item.id, listing: item })
              }
            />
          ))}
        </ScrollView>
      )}

    </View>
  );
}
