import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Smartphone,
  Wrench,
} from 'lucide-react-native';
import { getCart, updateCartItem, removeCartItem, clearCart } from '../../api/marketplace';
import { confirm, notify } from '../../components/confirm';
import { normalizeDeviceImageUrl } from '../../utils/images';

const GREEN       = '#004C40';
const GREEN_LIGHT = '#00695C';  // gradient top stop only - keeps the CTA from going flat
const GREEN_DARK  = '#004C40';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

function linePrice(item) {
  const p = item?.product?.price != null ? Number(item.product.price) : 0;
  const q = item?.quantity != null ? Number(item.quantity) : 0;
  return p * q;
}

export default function OwnerCartScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const list = await getCart();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Failed to load cart');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the screen regains focus so quantities stay in sync with
  // anything added from the product detail screen.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeQty = async (item, next) => {
    if (next < 1) return;
    setBusyId(item.id);
    // Optimistic update.
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, quantity: next } : x)));
    try {
      await updateCartItem(item.id, next);
    } catch (e) {
      notify('Could not update', e.message || 'Please try again.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item) => {
    setBusyId(item.id);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      await removeCartItem(item.id);
    } catch (e) {
      notify('Could not remove', e.message || 'Please try again.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const onClear = async () => {
    if (!items.length) return;
    const ok = await confirm({
      title: 'Clear cart?',
      message: 'Remove all items from your cart?',
      confirmText: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    const snapshot = items;
    setItems([]);
    try {
      await clearCart();
    } catch (e) {
      notify('Could not clear', e.message || 'Please try again.');
      setItems(snapshot);
    }
  };

  const subtotal = items.reduce((sum, it) => sum + linePrice(it), 0);
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const renderItem = ({ item }) => {
    const p = item.product || {};
    const isSpare = p.type === 'SPARE_PART';
    const price = p.price != null ? Number(p.price) : null;
    const isBusy = busyId === item.id;

    return (
      <View className="bg-white rounded-2xl p-3 mb-3 flex-row" style={cardShadow}>
        <View
          className="w-[68px] h-[68px] rounded-xl overflow-hidden items-center justify-center mr-3"
          style={{ backgroundColor: '#F0F8EF' }}
        >
          {p.imageUrl ? (
            <Image source={{ uri: normalizeDeviceImageUrl(p.imageUrl) }} style={{ width: 68, height: 68 }} resizeMode="cover" />
          ) : isSpare ? (
            <Wrench size={24} color={GREEN_DARK} />
          ) : (
            <Smartphone size={26} color={GREEN_DARK} />
          )}
        </View>

        <View className="flex-1">
          <Text className="text-[14px] font-extrabold text-gray-900" numberOfLines={1}>
            {p.title || 'Product'}
          </Text>
          <View className="flex-row items-center mt-0.5">
            {isSpare ? (
              <View className="px-2 py-0.5 rounded-full mr-1.5" style={{ backgroundColor: '#FEF3C7' }}>
                <Text className="text-[9px] font-extrabold" style={{ color: '#B45309' }}>SPARE</Text>
              </View>
            ) : null}
            {p.conditionLabel ? (
              <Text className="text-[11px] text-gray-500" numberOfLines={1}>{p.conditionLabel}</Text>
            ) : null}
          </View>
          <Text className="text-[13.5px] font-extrabold mt-1" style={{ color: GREEN_DARK }}>
            {price != null ? `₹${price.toLocaleString('en-IN')}` : '—'}
          </Text>

          {/* Quantity stepper + remove */}
          <View className="flex-row items-center mt-2">
            <View
              className="flex-row items-center rounded-full"
              style={{ borderWidth: 1, borderColor: '#E6F7E3', backgroundColor: '#F0F8EF' }}
            >
              <TouchableOpacity
                onPress={() => changeQty(item, (Number(item.quantity) || 1) - 1)}
                disabled={isBusy || (Number(item.quantity) || 1) <= 1}
                className="h-8 w-8 items-center justify-center"
                activeOpacity={0.7}
              >
                <Minus size={14} color={(Number(item.quantity) || 1) <= 1 ? '#CBD5CB' : GREEN_DARK} />
              </TouchableOpacity>
              <Text className="text-[13px] font-extrabold text-gray-900" style={{ minWidth: 22, textAlign: 'center' }}>
                {item.quantity}
              </Text>
              <TouchableOpacity
                onPress={() => changeQty(item, (Number(item.quantity) || 1) + 1)}
                disabled={isBusy}
                className="h-8 w-8 items-center justify-center"
                activeOpacity={0.7}
              >
                <Plus size={14} color={GREEN_DARK} />
              </TouchableOpacity>
            </View>

            <View className="flex-1" />

            <TouchableOpacity
              onPress={() => remove(item)}
              disabled={isBusy}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: '#FEF2F2' }}
              activeOpacity={0.7}
            >
              <Trash2 size={15} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 10,
            paddingBottom: 16,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center" style={{ paddingHorizontal: 16 }}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={10}
              className="h-9 w-9 rounded-full items-center justify-center bg-surface-muted"
            >
              <ChevronLeft size={20} color="#172117" />
            </Pressable>
            <Text className="flex-1 text-center text-text text-[15px] font-extrabold">My Cart</Text>
            {items.length ? (
              <Pressable onPress={onClear} hitSlop={10} className="px-2 h-9 rounded-full items-center justify-center bg-surface-muted">
                <Text className="text-text text-[11px] font-extrabold">Clear</Text>
              </Pressable>
            ) : (
              <View className="h-9 w-9" />
            )}
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

      {loading && items.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={GREEN} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />
          }
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 }}
          ListEmptyComponent={
            <View className="items-center pt-20 px-8">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#E6F7E3' }}>
                <ShoppingCart size={32} color={GREEN_DARK} />
              </View>
              <Text className="text-[13.5px] font-extrabold text-gray-700">Your cart is empty</Text>
              <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">
                Add products and spare parts from the Buy screen to see them here.
              </Text>
            </View>
          }
        />
      )}

      {/* Checkout bar */}
      {items.length ? (
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF' }}>
          <View
            className="px-4 pt-3 pb-2 flex-row items-center"
            style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
          >
            <View className="flex-1">
              <Text className="text-[11px] text-gray-500 font-semibold">
                {totalQty} item{totalQty === 1 ? '' : 's'} · Subtotal
              </Text>
              <Text className="text-[17px] font-extrabold" style={{ color: GREEN_DARK }}>
                ₹{subtotal.toLocaleString('en-IN')}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => notify('Checkout', 'Order placement from the cart is coming soon.')}
              style={cardShadow}
            >
              <LinearGradient
                colors={[GREEN_LIGHT, GREEN_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28 }}
              >
                <Text className="text-white text-[14px] font-extrabold">Checkout</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}
