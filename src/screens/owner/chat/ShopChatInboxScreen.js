import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, MessageCircle, Search, ShieldCheck } from 'lucide-react-native';
import { Avatar, EmptyState, Loader } from '../../../components/rnr';
import { listShopChats, pingShopPresence } from '../../../api/chat';

// WhatsApp-style inbox of customer<->shop conversations for the shop owner.
// Polls every ~7s while focused so new customer messages surface without a
// manual refresh — matches the existing 10s polling pattern used elsewhere.

const GREEN_DARK = '#087A0A';
const GREEN      = '#087A0A';

function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diffDays = (now - d) / 86400000;
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function initial(name) {
  const w = (name || 'C').trim().split(/\s+/);
  return ((w[0]?.[0] || 'C') + (w[1]?.[0] || '')).toUpperCase();
}

export default function ShopChatInboxScreen({ navigation }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      pingShopPresence().catch(() => {});
      const data = await listShopChats().catch(() => []);
      setThreads(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    pollRef.current = setInterval(load, 7000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <Loader label="Loading messages..." />;

  const filtered = q
    ? threads.filter((t) =>
        (t.counterpartName || '').toLowerCase().includes(q.toLowerCase()) ||
        (t.counterpartPhone || '').includes(q) ||
        (t.lastMessagePreview || '').toLowerCase().includes(q.toLowerCase())
      )
    : threads;

  const totalUnread = threads.reduce((n, t) => n + (t.unreadCount || 0), 0);

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View className="px-3 pt-1.5 pb-3 border-b border-border" style={{ backgroundColor: '#FFFFFF' }}>
          <View className="flex-row items-center">
            <Pressable
              onPress={() => navigation.goBack()}
              className="h-10 w-10 rounded-full items-center justify-center active:opacity-80"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <ChevronLeft size={20} color="#172117" />
            </Pressable>
            <View className="flex-1 ml-2">
              <Text className="text-text text-[16px] font-extrabold">Messages</Text>
              <View className="flex-row items-center mt-0.5">
                <MessageCircle size={11} color="#667066" />
                <Text className="text-text-muted text-[11px] ml-1">
                  {threads.length} chats {totalUnread > 0 ? `· ${totalUnread} unread` : ''}
                </Text>
              </View>
            </View>
            <View className="bg-primary/10 rounded-full px-2 py-1 flex-row items-center">
              <ShieldCheck size={11} color="#087A0A" />
              <Text className="text-primary text-[10px] font-extrabold ml-1 tracking-wider">ENCRYPTED</Text>
            </View>
          </View>

          <View className="mt-3 bg-surface-muted border border-border rounded-2xl px-3 py-2 flex-row items-center">
            <Search size={16} color={GREEN_DARK} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search by name, mobile or message"
              placeholderTextColor="#8FA08F"
              className="flex-1 text-text text-[13px] ml-2"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN_DARK} colors={[GREEN_DARK]} />}
      >
        {filtered.length === 0 ? (
          <View className="mt-10">
            <EmptyState
              icon={<MessageCircle size={28} color={GREEN_DARK} />}
              title={q ? 'No matches' : 'No customer messages yet'}
              description={q
                ? 'Try a different name, number or keyword.'
                : 'When a customer messages your shop, the conversation will appear here — just like WhatsApp.'}
            />
          </View>
        ) : (
          filtered.map((t, idx) => {
            const unread = t.unreadCount || 0;
            const typing = !!t.counterpartTyping;
            const online = !!t.counterpartOnline;
            const preview = typing
              ? 'typing…'
              : (t.lastMessagePreview || 'Tap to start the conversation');
            return (
              <Pressable
                key={t.id}
                onPress={() => navigation.navigate('ShopChatThread', { threadId: t.id })}
                className="flex-row items-center px-4 py-3 bg-card active:opacity-80"
                style={{ borderBottomWidth: idx === filtered.length - 1 ? 0 : 1, borderColor: '#E2E8E2' }}
              >
                <View>
                  <Avatar source={t.counterpartAvatarUrl} fallback={initial(t.counterpartName)} size={50} />
                  {online ? (
                    <View
                      style={{
                        position: 'absolute', right: -1, bottom: -1, height: 12, width: 12,
                        borderRadius: 6, backgroundColor: '#16BB05', borderWidth: 2, borderColor: '#FFFFFF',
                      }}
                    />
                  ) : null}
                </View>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center">
                    <Text className="text-[14px] font-extrabold text-text flex-1" numberOfLines={1}>
                      {t.counterpartName || 'Customer'}
                    </Text>
                    <Text className={`text-[10px] font-semibold ${unread > 0 ? 'text-emerald-700' : 'text-text-muted'}`}>
                      {shortTime(t.lastMessageAt)}
                    </Text>
                  </View>
                  <View className="flex-row items-center mt-0.5">
                    <Text
                      className={`flex-1 text-[12px] ${typing ? 'italic font-semibold text-emerald-700' : (unread > 0 ? 'font-bold text-text' : 'text-text-muted')}`}
                      numberOfLines={1}
                    >
                      {preview}
                    </Text>
                    {unread > 0 ? (
                      <View className="ml-2 rounded-full px-2 min-w-[20px] h-5 items-center justify-center" style={{ backgroundColor: GREEN }}>
                        <Text className="text-white text-[10px] font-extrabold">{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  {t.counterpartPhone ? (
                    <Text className="text-[10px] text-text-muted mt-0.5" numberOfLines={1}>+{String(t.counterpartPhone).replace(/^\+/, '')}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
