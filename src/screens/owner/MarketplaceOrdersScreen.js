import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  ChevronLeft,
  Package,
  ShoppingBag,
  Smartphone,
  Search,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react-native';
import { marketplaceApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { resolveDeviceImageSource } from '../../utils/images';
import { selectShopId, selectUserId } from '../../store/authSlice';

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

function statusMeta(rawStatus, type) {
  const s = String(rawStatus || '').toUpperCase();
  const sell = type !== 'BUY';
  if (s === 'SOLD' || s === 'COMPLETED') {
    return { short: sell ? 'Sold' : 'Done', accent: BRAND_GREEN_DARK, tint: '#E6F7E3', dot: BRAND_GREEN };
  }
  if (s === 'CANCELLED' || s === 'CANCELED') {
    return { short: 'Cancelled', accent: '#B91C1C', tint: '#FEE2E2', dot: '#DC2626' };
  }
  return { short: 'Pending', accent: '#B45309', tint: '#FEF3C7', dot: '#F59E0B' };
}

function OrderCard({ item, showPrice, onPress }) {
  const orderId = item.id ? String(item.id).slice(0, 10).toUpperCase().replace(/-/g, '') : '';
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = created
    ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    : '';
  const specs = [item.color, item.storageLabel].filter(Boolean).join(' · ');
  const meta = statusMeta(item.status, item.type);

  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-2xl p-3.5 mb-3 flex-row items-center"
      style={cardShadow}
    >
      <View
        style={{
          width: 76, height: 76, borderRadius: 16,
          backgroundColor: '#F0F8EF',
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          marginRight: 12,
        }}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={{ width: 76, height: 76 }} resizeMode="cover" />
        ) : (
          <Smartphone size={30} color={BRAND_GREEN_DARK} />
        )}
      </View>

      <View className="flex-1 pr-2">
        <View className="flex-row items-center justify-between mb-1">
          <Text
            className="text-[12px] font-bold flex-1 mr-2"
            style={{ color: '#8FA08F', letterSpacing: 0.4 }}
            numberOfLines={1}
          >
            #GGFIX{orderId}
          </Text>
          <View
            className="flex-row items-center px-2.5 py-1 rounded-full"
            style={{ backgroundColor: meta.tint }}
          >
            <View className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: meta.dot }} />
            <Text
              className="text-[10px] font-extrabold"
              style={{ color: meta.accent, letterSpacing: 0.3 }}
            >
              {meta.short.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text className="text-[15.5px] font-extrabold text-gray-900 leading-5" numberOfLines={2}>
          {item.title || 'Item'}
        </Text>

        <View className="flex-row items-center justify-between mt-1.5">
          <Text className="text-[12px] text-gray-500 flex-1" numberOfLines={1}>
            {specs || dateLabel || ''}
          </Text>
          {showPrice && item.price != null ? (
            <Text
              className="text-[15px] font-extrabold ml-2"
              style={{ color: BRAND_GREEN_DARK }}
            >
              ₹{Number(item.price).toLocaleString('en-IN')}
            </Text>
          ) : null}
        </View>
      </View>

      <ChevronRight size={18} color="#CBD5CB" />
    </Pressable>
  );
}

export default function MarketplaceOrdersScreen({ navigation }) {
  const [tab, setTab] = useState('Sell');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);

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
        setItems(enriched);
      } else {
        setItems(filtered);
      }
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, shopId, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 6,
            paddingBottom: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <ChevronLeft size={22} color="#172117" />
            </TouchableOpacity>
            <Text className="flex-1 text-text text-[24px] font-extrabold" numberOfLines={1}>
              My Orders
            </Text>
            <Pressable
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <Search size={16} color="#172117" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Tabs */}
      <View className="px-4 mt-3">
        <View
          className="flex-row rounded-full p-1 bg-white"
          style={{ borderWidth: 1, borderColor: '#E2E8E2' }}
        >
          {['Buy', 'Sell'].map((t) => {
            const active = tab === t;
            const Icon = t === 'Buy' ? ShoppingBag : Package;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                className="flex-1 items-center justify-center py-2.5 rounded-full flex-row"
                style={{ backgroundColor: active ? BRAND_GREEN : 'transparent' }}
              >
                <Icon size={15} color={active ? '#FFFFFF' : '#667066'} />
                <Text
                  className="ml-2 text-[13.5px] font-extrabold"
                  style={{ color: active ? '#FFFFFF' : '#667066' }}
                >
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8" style={{ paddingBottom: 100 }}>
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: '#E6F7E3' }}
          >
            <ShoppingBag size={32} color={BRAND_GREEN_DARK} />
          </View>
          <Text className="text-[15px] font-extrabold text-gray-700">
            No {tab.toLowerCase()} orders yet
          </Text>
          <Text className="text-[12px] text-gray-500 mt-2 text-center leading-5">
            {tab === 'Sell'
              ? 'Your published listings will show up here.'
              : 'Your marketplace purchases will appear here.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => (
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

      {/* Track-your-orders footer — pinned at the bottom. */}
      {!loading ? (
        <View
          className="absolute left-0 right-0 bottom-0 px-4"
          style={{ paddingTop: 8, paddingBottom: 18, backgroundColor: 'rgba(240, 248, 239, 0.96)' }}
        >
          <View
            className="rounded-2xl p-3.5 flex-row items-center"
            style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#E6F7E3' }}
          >
            <View
              className="w-11 h-11 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#E6F7E3' }}
            >
              <ShoppingBag size={20} color={BRAND_GREEN_DARK} />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-extrabold text-gray-900">Track your orders</Text>
              <Text className="text-[12px] text-gray-500 mt-0.5 leading-4">
                Stay updated on all your buy and sell orders in one place.
              </Text>
            </View>
            <View className="ml-2">
              <ClipboardCheck size={28} color="#7ED957" />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
