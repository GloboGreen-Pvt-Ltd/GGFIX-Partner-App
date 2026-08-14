import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { Avatar, Button, Card, MintBackdrop, BrandHeader } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import { selectShopId } from '../../../store/authSlice';

const GREEN = '#087A0A';
const GREEN_DARK = '#087A0A';

// Shared height for the search field and the New Customer button, so the two
// sit as one control row rather than two mismatched pills.
const ROW_H = 52;

// Gap between the header and the search row. Sits in the 20–40px band; change
// this one number to move the row up or down.
const TOP_OFFSET = 28;

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};

export default function NewBookingScreen({ navigation }) {
  const shopId = useSelector(selectShopId);

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  // Backend can return the same person more than once (multiple legacy rows for
  // the same phone). Collapse them by name+phone so the search list shows one
  // row per real customer. Prefer the shop-scoped row over the platform row
  // when both exist for the same phone — booking needs a shop customers.id.
  const dedupedResults = useMemo(() => {
    const byKey = new Map();
    for (const c of results) {
      const phone = String(c.phone || c.mobile || '').replace(/\s|\+|-/g, '');
      const key = `${String(c.name || '').toLowerCase().trim()}|${phone}`;
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, c); continue; }
      if (existing.source === 'platform' && c.source === 'shop') byKey.set(key, c);
    }
    return Array.from(byKey.values());
  }, [results]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      setLoading(true);
      try {
        const data = await ticketApi.get('/customers', { query: { q: q.trim() } });
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      } catch (_) { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, shopId]);

  // The search field can still own focus when the owner starts a booking.
  // Blur it before navigation so its keyboard/caret never carries into the
  // Customer Details form.
  const openCustomerDetails = (params) => {
    Keyboard.dismiss();
    navigation.navigate('CustomerDetails', params);
  };

  return (
    <View className="flex-1">
      <MintBackdrop dots circles />
      <BrandHeader title="New Booking" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: TOP_OFFSET, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Action row — search existing customer on the LEFT, New Customer on
            the RIGHT. Sits near the top (TOP_OFFSET) so results start high on
            the screen rather than halfway down. */}
        <View className="flex-row items-center">
          {/* Search — takes all the space the button doesn't need */}
          <View
            className="flex-row items-center"
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 999,
              paddingHorizontal: 16,
              height: ROW_H,
              marginRight: 10,
              ...softShadow,
            }}
          >
            <Ionicons name="search" size={18} color={GREEN} />
            <TextInput
              placeholder="Search name or mobile"
              placeholderTextColor="#8FA08F"
              value={q}
              onChangeText={setQ}
              returnKeyType="search"
              className="flex-1 ml-2 text-text"
              style={{ paddingVertical: 0, fontSize: 13 }}
            />
            {loading ? <ActivityIndicator size="small" color={GREEN} /> : null}
          </View>

          {/* New Customer — fixed width, never squeezed by the search field */}
          <Pressable
            onPress={() => openCustomerDetails()}
            accessibilityRole="button"
            accessibilityLabel="New customer"
            className="flex-row items-center justify-center active:opacity-85"
            style={{
              height: ROW_H,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: GREEN,
              shadowColor: GREEN_DARK,
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text
              style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', marginLeft: 6 }}
              numberOfLines={1}
            >
              New Customer
            </Text>
          </Pressable>
        </View>

        {/* Search results */}
        <View className="mt-4">
          {dedupedResults.map((c) => {
            const isPlatform = c.source === 'platform';
            const rowKey = `${c.source || 'shop'}:${c.id}`;
            const onPick = () => {
              openCustomerDetails({
                initial: {
                  name: c.name || '',
                  phone: c.phone || c.mobile || '',
                  email: c.email || '',
                },
                existing: c,
              });
            };
            return (
              <Card
                key={rowKey}
                className="mb-3 flex-row items-center"
                style={{ borderWidth: 0, borderRadius: 20 }}
              >
                <Avatar fallback={(c.name || '?').slice(0, 2)} size={56} />
                <View className="flex-1 ml-4">
                  <View className="flex-row items-center flex-wrap">
                    <Text className="font-extrabold text-text text-[15px] mr-2">{c.name}</Text>
                    {isPlatform ? (
                      <View className="px-2.5 py-1 rounded-full bg-primary/10">
                        <Text className="text-[11px] text-primary font-bold">App user</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-[13px] text-text-muted mt-1">{c.phone || ''}</Text>
                  {c.address ? (
                    <Text className="text-[13px] text-text-muted mt-0.5 leading-5">{c.address}</Text>
                  ) : null}
                </View>
                <Button size="sm" onPress={onPick} className="ml-3">Booking</Button>
              </Card>
            );
          })}
          {!loading && q.trim() && dedupedResults.length === 0 ? (
            <Text className="text-center text-text-muted py-6">No matching customers</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
