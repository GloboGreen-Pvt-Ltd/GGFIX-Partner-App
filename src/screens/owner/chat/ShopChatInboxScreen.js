import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, MessageCircle, Phone, Search, ShieldCheck } from 'lucide-react-native';
import { Avatar, EmptyState, Loader } from '../../../components/rnr';
import { listShopChats, pingShopPresence } from '../../../api/chat';

// WhatsApp-style inbox of customer<->shop conversations for the shop owner.
// Polls every ~7s while focused so new customer messages surface without a
// manual refresh — matches the existing 10s polling pattern used elsewhere.

// GGFIX palette.
const GREEN = '#09AD2A';        // fills, icons, unread badge
const GREEN_DEEP = '#078F23';   // green TEXT
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const PLACEHOLDER = '#8A8A8A';
const LINE = '#E6E6E6';
const HAIR = '#F3F3F3';
const PAGE_BG = '#F8F8F8';

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

  const { width: winW } = useWindowDimensions();
  const col = winW >= 600 ? { width: Math.min(winW - 32, 720), alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: LINE }}>
          <View style={col}>
            <View className="flex-row items-center">
              <Pressable
                onPress={() => navigation.goBack()}
                className="items-center justify-center active:opacity-80"
                style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: LINE }}
              >
                <ChevronLeft size={19} color={INK} />
              </Pressable>
              <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>Messages</Text>
                <View className="flex-row items-center" style={{ marginTop: 2 }}>
                  <MessageCircle size={11} color={MUTED} />
                  <Text style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>
                    {threads.length} chat{threads.length === 1 ? '' : 's'}{totalUnread > 0 ? ` · ${totalUnread} unread` : ''}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center" style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE }}>
                <ShieldCheck size={11} color={GREEN} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: GREEN_DEEP, marginLeft: 4, letterSpacing: 0.6 }}>ENCRYPTED</Text>
              </View>
            </View>

            <View
              className="flex-row items-center"
              style={{ marginTop: 10, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingHorizontal: 11 }}
            >
              <Search size={15} color={GREEN} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search by name, mobile or message"
                placeholderTextColor={PLACEHOLDER}
                style={{ flex: 1, marginLeft: 8, paddingVertical: 9, fontSize: 13, color: INK }}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} colors={[GREEN]} />}
      >
        <View style={col}>
          {filtered.length === 0 ? (
            <View style={{ marginTop: 40 }}>
              <EmptyState
                icon={<MessageCircle size={28} color={GREEN} />}
                title={q ? 'No matches' : 'No customer messages yet'}
                description={q
                  ? 'Try a different name, number or keyword.'
                  : 'When a customer messages your shop, the conversation will appear here — just like WhatsApp.'}
              />
            </View>
          ) : (
            filtered.map((t) => {
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
                  className="flex-row items-center active:opacity-80"
                  style={{
                    marginBottom: 8, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 14,
                    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: unread > 0 ? MINT_LINE : HAIR,
                    shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
                  }}
                >
                  <View>
                    {t.counterpartAvatarUrl ? (
                      <Avatar source={t.counterpartAvatarUrl} fallback={initial(t.counterpartName)} size={44} />
                    ) : (
                      // Own initials circle in GGFIX green — the shared Avatar's
                      // fallback paints the old theme token.
                      <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: GREEN_DEEP }}>{initial(t.counterpartName)}</Text>
                      </View>
                    )}
                    {online ? (
                      <View
                        style={{
                          position: 'absolute', right: -1, bottom: -1, height: 12, width: 12,
                          borderRadius: 6, backgroundColor: GREEN, borderWidth: 2, borderColor: '#FFFFFF',
                        }}
                      />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, marginLeft: 11, minWidth: 0 }}>
                    <View className="flex-row items-center">
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>
                        {t.counterpartName || 'Customer'}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: unread > 0 ? GREEN_DEEP : MUTED, marginLeft: 6 }}>
                        {shortTime(t.lastMessageAt)}
                      </Text>
                    </View>
                    <View className="flex-row items-center" style={{ marginTop: 2 }}>
                      <Text
                        style={{
                          flex: 1, fontSize: 12,
                          fontStyle: typing ? 'italic' : 'normal',
                          fontWeight: typing ? '600' : (unread > 0 ? '700' : '400'),
                          color: typing ? GREEN_DEEP : (unread > 0 ? INK : MUTED),
                        }}
                        numberOfLines={1}
                      >
                        {preview}
                      </Text>
                      {unread > 0 ? (
                        <View className="items-center justify-center" style={{ marginLeft: 8, minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: GREEN }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{unread > 99 ? '99+' : unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    {t.counterpartPhone ? (
                      <View className="flex-row items-center" style={{ marginTop: 3 }}>
                        <Phone size={10} color={PLACEHOLDER} />
                        <Text style={{ fontSize: 10, color: MUTED, marginLeft: 4 }} numberOfLines={1}>
                          +{String(t.counterpartPhone).replace(/^\+/, '')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
