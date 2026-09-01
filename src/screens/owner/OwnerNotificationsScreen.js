import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Bell, ChevronRight, CheckCheck } from 'lucide-react-native';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../api/notifications';

const GREEN       = '#087A0A';
const GREEN_LIGHT = '#16BB05';
const GREEN_DARK  = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// The feed may expose read-state as read, readAt, or isRead depending on the
// backend. Treat any of them as "read" so the badge, count, and mark-read stay
// correct instead of showing every item as unread.
const isUnread = (n) => !(n?.read || n?.readAt || n?.isRead);

export default function OwnerNotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const list = await listNotifications();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      // Distinguish a load failure from a genuinely empty feed so we don't show
      // "You're all caught up" when the request actually errored.
      setError(e?.message || 'Could not load notifications');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch fresh every time the screen is focused.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unread = items.filter(isUnread).length;

  const onTap = async (n) => {
    if (isUnread(n)) {
      try { await markNotificationRead(n.id); } catch {}
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true, readAt: x.readAt || new Date().toISOString() } : x)));
    }
    // Service-history notifications carry the ticket id, so tapping one opens
    // that booking's timeline directly. Rows raised before a ticket exists
    // (a fresh pickup request) have no ticketId — fall back to the Bookings
    // tab so the tap still goes somewhere useful.
    if (n.ticketId) {
      navigation.navigate('BookingTimeline', { ticketId: n.ticketId });
      return;
    }
    navigation.navigate('OwnerTabs', { screen: 'Bookings' });
  };

  const onMarkAll = async () => {
    if (!unread) return;
    try { await markAllNotificationsRead(); } catch {}
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
  };

  const renderItem = ({ item: n }) => {
    const isNew = isUnread(n);
    return (
    <Pressable
      onPress={() => onTap(n)}
      className="bg-white rounded-2xl p-3.5 mb-2.5 flex-row items-start active:opacity-80"
      style={cardShadow}
    >
      <View
        className="h-10 w-10 rounded-full items-center justify-center mr-3 mt-0.5"
        style={{ backgroundColor: isNew ? '#E6F7E3' : '#EFF5EE' }}
      >
        <Bell size={17} color={isNew ? GREEN_DARK : '#8FA08F'} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text
            className={`flex-1 text-[13.5px] ${isNew ? 'font-extrabold text-gray-900' : 'font-bold text-gray-500'}`}
            numberOfLines={1}
          >
            {n.title}
          </Text>
          {isNew ? <View className="h-2 w-2 rounded-full ml-1" style={{ backgroundColor: '#F59E0B' }} /> : null}
        </View>
        {n.body ? (
          <Text className="text-[11.5px] text-gray-500 mt-0.5" numberOfLines={2}>{n.body}</Text>
        ) : null}
        <Text className="text-[10px] text-gray-400 mt-1">
          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
        </Text>
      </View>
      <ChevronRight size={15} color="#CBD5CB" style={{ marginTop: 8 }} />
    </Pressable>
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
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
              hitSlop={10}
              className="h-9 w-9 rounded-full items-center justify-center bg-surface-muted"
            >
              <ChevronLeft size={20} color="#172117" />
            </Pressable>
            <View className="flex-1 flex-row items-center justify-center">
              <Text className="text-center text-text text-[18px] font-extrabold">Notifications</Text>
              {unread > 0 ? (
                <View className="ml-2 rounded-full px-2 py-0.5 bg-surface-muted">
                  <Text className="text-text text-[10px] font-extrabold">{unread} new</Text>
                </View>
              ) : null}
            </View>
            {unread > 0 ? (
              <Pressable
                onPress={onMarkAll}
                hitSlop={10}
                className="h-9 px-2.5 rounded-full flex-row items-center justify-center bg-surface-muted"
              >
                <CheckCheck size={14} color="#172117" />
              </Pressable>
            ) : (
              <View className="h-9 w-9" />
            )}
          </View>
        </View>
      </SafeAreaView>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={GREEN} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />
          }
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 }}
          ListEmptyComponent={
            error ? (
              <View className="items-center pt-24 px-8">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#FEE2E2' }}>
                  <Bell size={32} color="#DC2626" />
                </View>
                <Text className="text-[15px] font-extrabold text-gray-700">Couldn't load notifications</Text>
                <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">{error}</Text>
                <Pressable onPress={() => load()} className="mt-4 rounded-full px-6 py-2.5 active:opacity-80" style={{ backgroundColor: GREEN }}>
                  <Text className="text-white font-extrabold text-[13px]">Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View className="items-center pt-24 px-8">
                <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#E6F7E3' }}>
                  <Bell size={32} color={GREEN_DARK} />
                </View>
                <Text className="text-[15px] font-extrabold text-gray-700">You're all caught up</Text>
                <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">
                  Booking updates, payouts and team alerts will appear here.
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}
