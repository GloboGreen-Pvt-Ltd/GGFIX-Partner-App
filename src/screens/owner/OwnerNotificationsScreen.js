import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Bell, ChevronRight, CheckCheck, Trash2, Wrench, Truck, Tag, ShoppingCart } from 'lucide-react-native';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationsClearedAt,
  setNotificationsClearedAt,
} from '../../api/notifications';
import { confirm } from '../../components/confirm';

const timeOf = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

const GREEN       = '#035C6C';
const GREEN_DARK  = '#035C6C';

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// The feed may expose read-state as read, readAt, or isRead depending on the
// backend. Treat any of them as "read" so the badge, count, and mark-read stay
// correct instead of showing every item as unread.
const isUnread = (n) => !(n?.read || n?.readAt || n?.isRead);

// Filter tabs. The feed's `type` is only bookings | pickups | system, so the
// category comes from type + statusKey + title. Nothing on the backend raises
// sell / buy notifications yet — those tabs fill once it does.
const TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'SERVICE', label: 'Service', icon: Wrench },
  { key: 'PICKUP', label: 'Pickup', icon: Truck },
  { key: 'SELL', label: 'Sell', icon: Tag },
  { key: 'BUY', label: 'Buy', icon: ShoppingCart },
];
const categoryOf = (n) => {
  const t = `${n?.type || ''} ${n?.statusKey || ''} ${n?.title || ''}`.toUpperCase();
  if (/SELL/.test(t)) return 'SELL';
  if (/\bBUY|MARKETPLACE|PURCHASE/.test(t)) return 'BUY';
  if (/PICKUP|PICK[ _-]UP|PICKED/.test(t)) return 'PICKUP';
  return 'SERVICE';
};

export default function OwnerNotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ALL');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [list, clearedAt] = await Promise.all([listNotifications(), getNotificationsClearedAt()]);
      const cut = timeOf(clearedAt);
      setItems((Array.isArray(list) ? list : []).filter((n) => !cut || timeOf(n.createdAt) > cut));
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
  const counts = useMemo(() => {
    const c = { ALL: items.length, SERVICE: 0, PICKUP: 0, SELL: 0, BUY: 0 };
    items.forEach((n) => { c[categoryOf(n)] += 1; });
    return c;
  }, [items]);
  const shown = tab === 'ALL' ? items : items.filter((n) => categoryOf(n) === tab);
  const tabLabel = TABS.find((t) => t.key === tab)?.label || '';

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

  // Clear the whole list. Marked read first so the Home bell badge (the
  // server's unread count) drops to 0 too; anything newer still arrives.
  const onClear = async () => {
    if (!items.length) return;
    const ok = await confirm({
      title: 'Clear all notifications?',
      message: 'They will be removed from this list. New notifications will still appear.',
      confirmText: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    const newest = items.reduce((m, n) => Math.max(m, timeOf(n.createdAt)), 0);
    await setNotificationsClearedAt(new Date(newest || Date.now()).toISOString());
    if (unread) { try { await markAllNotificationsRead(); } catch {} }
    setItems([]);
  };

  const renderItem = ({ item: n }) => {
    const isNew = isUnread(n);
    const Icon = TABS.find((t) => t.key === categoryOf(n))?.icon || Bell;
    return (
    <Pressable
      onPress={() => onTap(n)}
      className="bg-white rounded-2xl p-3.5 mb-2.5 flex-row items-start active:opacity-80"
      style={cardShadow}
    >
      <View
        className="h-10 w-10 rounded-full items-center justify-center mr-3 mt-0.5"
        style={{ backgroundColor: isNew ? '#E5F3F5' : '#E5F3F5' }}
      >
        <Icon size={17} color={isNew ? GREEN_DARK : '#9CA3AF'} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text
            className={`flex-1 text-[13px] ${isNew ? 'font-extrabold text-gray-900' : 'font-bold text-gray-500'}`}
            numberOfLines={1}
          >
            {n.title}
          </Text>
          {isNew ? <View className="h-2 w-2 rounded-full ml-1" style={{ backgroundColor: '#F59E0B' }} /> : null}
        </View>
        {n.body ? (
          <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={2}>{n.body}</Text>
        ) : null}
        <Text className="text-[10px] text-gray-400 mt-1">
          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
        </Text>
      </View>
      <ChevronRight size={15} color="#D1D5DB" style={{ marginTop: 8 }} />
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
            paddingTop: 8,
            paddingBottom: 12,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            borderBottomWidth: 1,
            borderBottomColor: '#E5E7EB',
          }}
        >
          <View className="flex-row items-center" style={{ paddingHorizontal: 16 }}>
            <Pressable
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.popTo('OwnerTabs', { screen: 'Home' }))}
              hitSlop={10}
              className="h-9 w-9 rounded-full items-center justify-center bg-surface-muted"
            >
              <ChevronLeft size={20} color="#111111" />
            </Pressable>
            <View className="flex-1 flex-row items-center justify-center">
              <Text className="text-center text-text text-[17px] font-extrabold">Notifications</Text>
              {unread > 0 ? (
                <View className="ml-2 rounded-full px-2 py-0.5 bg-surface-muted">
                  <Text className="text-text text-[11px] font-extrabold">{unread} new</Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row items-center">
              {unread > 0 ? (
                <Pressable
                  onPress={onMarkAll}
                  hitSlop={10}
                  accessibilityLabel="Mark all as read"
                  className="h-9 px-2.5 rounded-full flex-row items-center justify-center bg-surface-muted"
                >
                  <CheckCheck size={14} color="#111111" />
                </Pressable>
              ) : null}
              {items.length > 0 ? (
                <Pressable
                  onPress={onClear}
                  hitSlop={10}
                  accessibilityLabel="Clear all notifications"
                  className="h-9 px-3 ml-2 rounded-full flex-row items-center justify-center active:opacity-80"
                  style={{ backgroundColor: '#FEECEC' }}
                >
                  <Trash2 size={13} color="#F84141" />
                  <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '800', color: '#F84141' }}>Clear</Text>
                </Pressable>
              ) : null}
              {!unread && !items.length ? <View className="h-9 w-9" /> : null}
            </View>
          </View>

          {/* All · Service · Pickup · Sell · Buy */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  className="flex-row items-center rounded-full active:opacity-80"
                  style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: on ? GREEN : '#F3F4F6' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#FFFFFF' : '#111111' }}>{t.label}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', marginLeft: 5, color: on ? '#FFFFFF' : '#6B7280' }}>{counts[t.key]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={GREEN} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />
          }
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 }}
          ListEmptyComponent={
            error ? (
              <View className="items-center pt-14 px-8">
                <View className="w-16 h-16 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#FEE2E2' }}>
                  <Bell size={28} color="#DC2626" />
                </View>
                <Text className="text-[13px] font-extrabold text-gray-700">Couldn't load notifications</Text>
                <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">{error}</Text>
                <Pressable onPress={() => load()} className="mt-4 rounded-full px-6 py-2.5 active:opacity-80" style={{ backgroundColor: GREEN }}>
                  <Text className="text-white font-extrabold text-[13px]">Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View className="items-center pt-14 px-8">
                <View className="w-16 h-16 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#E5F3F5' }}>
                  <Bell size={28} color={GREEN_DARK} />
                </View>
                <Text className="text-[13px] font-extrabold text-gray-700">
                  {tab === 'ALL' ? "You're all caught up" : `No ${tabLabel} notifications`}
                </Text>
                <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">
                  {tab === 'ALL'
                    ? 'Booking updates, payouts and team alerts will appear here.'
                    : `${tabLabel} updates will appear here.`}
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}
