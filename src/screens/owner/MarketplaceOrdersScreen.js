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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  EllipsisVertical,
  ShieldCheck,
  Truck,
  Send,
  ArrowRight,
  FileText,
  User,
  CreditCard,
  Home,
  ClipboardList,
  Tag,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { marketplaceApi } from '../../api/client';
import { getModelsByBrand } from '../../api/masterData';
import { resolveDeviceImageSource, normalizeDeviceImageUrl } from '../../utils/images';
import { selectShopId, selectUserId } from '../../store/authSlice';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #09AD2A, red #F84141, yellow #F3BF23, ink #1E1E1E,
// neutrals #F8F8F8 / #F3F3F3.
const ACCENT = '#09AD2A';
const PRIMARY = '#078F23';
const BRIGHT = '#09AD2A';
const MINT = '#EAF8EC';
const SOFT_MINT = '#F3F3F3';
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E6E6E6';
const TEXT_PRIMARY = '#1E1E1E';
const TEXT_SECONDARY = '#6B6B6B';
const PENDING_FG = '#B7860B'; // yellow #F3BF23 family, dark enough to read as text
const PENDING_BG = '#FFF8E1';
const CANCELLED_FG = '#F84141';
const CANCELLED_BG = '#FEECEC';

const cardShadow = {
  shadowColor: '#1E1E1E',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
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

// The real, distinguishable statuses this data actually carries — Pending,
// Sold/Completed, or Cancelled. There is no Processing/Shipped/Delivered
// split in the marketplace product model, so the filter chips below only
// offer buckets this function can actually tell apart.
function statusMeta(rawStatus, type) {
  const s = String(rawStatus || '').toUpperCase();
  const sell = type !== 'BUY';
  if (s === 'SOLD' || s === 'COMPLETED') {
    return { key: 'DONE', short: sell ? 'Sold' : 'Done', accent: PRIMARY, tint: MINT, Icon: CheckCircle2 };
  }
  if (s === 'CANCELLED' || s === 'CANCELED') {
    return { key: 'CANCELLED', short: 'Cancelled', accent: CANCELLED_FG, tint: CANCELLED_BG, Icon: XCircle };
  }
  return { key: 'PENDING', short: 'Pending', accent: PENDING_FG, tint: PENDING_BG, Icon: Clock };
}

// The 4 sell-journey milestones. The product model only ever distinguishes
// Pending / Sold / Cancelled (see statusMeta above) — there's no separate
// "under review" or "buyer found" flag to read, so those two middle steps
// are only ever shown complete once the order actually reaches Sold (they
// necessarily happened en route to a sale), never fabricated independently.
const SELL_STEPS = [
  { key: 'listed', label: 'Listed', Icon: FileText },
  { key: 'review', label: 'Under Review', Icon: Search },
  { key: 'buyer', label: 'Buyer Found', Icon: User },
  { key: 'payment', label: 'Payment', Icon: CreditCard },
];

function sellStepIndex(statusKey) {
  // Number of completed steps (0–4). Sold ⇒ all 4. Pending/Cancelled ⇒ only
  // "Listed", the one fact this screen actually knows for certain.
  return statusKey === 'DONE' ? 4 : 1;
}

function SellProgressTracker({ statusKey, dateLabel }) {
  const completed = sellStepIndex(statusKey);
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: SOFT_MINT }}
    >
      {SELL_STEPS.map((step, i) => {
        const done = i < completed;
        const isLast = i === SELL_STEPS.length - 1;
        const StepIcon = step.Icon;
        return (
          <React.Fragment key={step.key}>
            <View style={{ alignItems: 'center', width: 54 }}>
              <View
                style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: done ? ACCENT : BORDER,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <StepIcon size={11} color={done ? '#FFFFFF' : '#9E9E9E'} strokeWidth={2.4} />
              </View>
              <Text
                numberOfLines={2}
                style={{ fontSize: 9, lineHeight: 11, fontWeight: '700', color: done ? PRIMARY : TEXT_SECONDARY, marginTop: 4, textAlign: 'center' }}
              >
                {step.label}
              </Text>
              {i === 0 && dateLabel ? (
                <Text style={{ fontSize: 7.5, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
                  {dateLabel}
                </Text>
              ) : null}
            </View>
            {!isLast ? (
              <View style={{ flex: 1, height: 2, marginTop: 10, borderRadius: 1, backgroundColor: i < completed - 1 ? ACCENT : BORDER }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function OrderCard({ item, showPrice, isSell, onPress }) {
  const orderId = item.id ? String(item.id).slice(0, 10).toUpperCase().replace(/-/g, '') : '';
  const created = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = created
    ? created.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    : '';
  const specs = [item.color, item.storageLabel].filter(Boolean).join(' · ');
  const meta = statusMeta(item.status, item.type);
  const StatusIcon = meta.Icon;
  // Cloudinary stores device photos as .avif, which Android's <Image> can't
  // decode (renders blank) — same fix already used for the enriched
  // model-catalog image, now applied to the listing's own photo too, since
  // that path never went through the normalizer before.
  const imageSrc = normalizeDeviceImageUrl(item.imageUrl);

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      style={{
        backgroundColor: CARD_BG, borderRadius: 16, padding: 11, marginBottom: 9,
        borderWidth: 1, borderColor: SOFT_MINT, ...cardShadow,
      }}
    >
      <View className="flex-row items-center justify-between" style={{ marginBottom: 8 }}>
        <View
          className="flex-row items-center rounded-full"
          style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: meta.tint }}
        >
          <StatusIcon size={11} color={meta.accent} strokeWidth={2.4} />
          <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 9.5, color: meta.accent, letterSpacing: 0.3 }}>
            {meta.short.toUpperCase()}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Text className="font-bold" style={{ fontSize: 10, color: TEXT_SECONDARY, letterSpacing: 0.3 }} numberOfLines={1}>
            #GGFIX{orderId}
          </Text>
          {/* Same real destination as the whole card — a decorative
              affordance, not a second, fabricated actions menu (there is no
              per-order edit/delete action beyond opening its detail page). */}
          <Pressable onPress={onPress} hitSlop={8} style={{ marginLeft: 6 }}>
            <EllipsisVertical size={14} color={TEXT_SECONDARY} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center">
        <View
          className="items-center justify-center overflow-hidden"
          style={{ width: 52, height: 52, borderRadius: 13, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SOFT_MINT, marginRight: 10 }}
        >
          {imageSrc ? (
            <Image source={{ uri: imageSrc }} style={{ width: 48, height: 48 }} resizeMode="contain" />
          ) : (
            <Smartphone size={20} color={ACCENT} />
          )}
        </View>

        <View className="flex-1" style={{ paddingRight: 6, minWidth: 0 }}>
          <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY, lineHeight: 17 }} numberOfLines={2}>
            {item.title || 'Item'}
          </Text>
          <View className="flex-row items-center justify-between" style={{ marginTop: 4 }}>
            <Text className="flex-1" style={{ fontSize: 11, color: TEXT_SECONDARY }} numberOfLines={1}>
              {specs || dateLabel || ''}
            </Text>
            {showPrice && item.price != null ? (
              <Text className="font-extrabold" style={{ marginLeft: 8, fontSize: 13, color: PRIMARY }}>
                ₹{Number(item.price).toLocaleString('en-IN')}
              </Text>
            ) : null}
          </View>
        </View>

        <ChevronRight size={16} color="#BDBDBD" />
      </View>

      {isSell ? <SellProgressTracker statusKey={meta.key} dateLabel={dateLabel} /> : null}
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
        style={[StyleSheet.absoluteFill, { backgroundColor: ACCENT, borderRadius: 999 }, fillStyle]}
      />
      <View className="items-center justify-center flex-row" style={{ paddingVertical: 8 }}>
        <Icon size={13} color={active ? '#FFFFFF' : TEXT_SECONDARY} strokeWidth={2.2} />
        <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 12, color: active ? '#FFFFFF' : TEXT_SECONDARY }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

// Filter chip — count is always real, derived from the already-loaded list.
function FilterChip({ label, Icon, count, active, tint, fg, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full"
      style={{
        paddingHorizontal: 10, paddingVertical: 6, marginRight: 7,
        backgroundColor: active ? tint : '#FFFFFF',
        borderWidth: 1, borderColor: active ? fg : BORDER,
      }}
    >
      {Icon ? <Icon size={11} color={active ? fg : TEXT_SECONDARY} style={{ marginRight: 4 }} /> : null}
      <Text className="font-bold" style={{ fontSize: 11, color: active ? fg : TEXT_PRIMARY }}>{label}</Text>
      {typeof count === 'number' ? (
        <View style={{ marginLeft: 5, minWidth: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: active ? CARD_BG : SOFT_MINT, alignItems: 'center' }}>
          <Text className="font-extrabold" style={{ fontSize: 10, color: active ? fg : TEXT_SECONDARY }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// This screen is a root-stack push above OwnerTabs, so the real tab bar is
// covered while it's on screen. Recreated here (visual + `navigate` only,
// same "jump into a tab" call the Explore Products CTA below already uses)
// so it doesn't feel like a dead end — no navigator/config changes.
const NAV_ITEMS = [
  { key: 'Home', label: 'Home', Icon: Home },
  { key: 'Bookings', label: 'Bookings', Icon: ClipboardList },
  { key: 'Buy', label: 'Buy', Icon: ShoppingBag },
  { key: 'Sell', label: 'Sell', Icon: Tag },
  { key: 'MyAccount', label: 'Settings', Icon: SettingsIcon },
];

function BottomNavMimic({ navigation, activeKey }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 8,
        paddingBottom: insets.bottom + 6,
        borderTopWidth: 1,
        borderTopColor: BORDER,
        ...cardShadow,
        shadowOffset: { width: 0, height: -4 },
      }}
    >
      {NAV_ITEMS.map((it) => {
        const active = it.key === activeKey;
        const ItemIcon = it.Icon;
        return (
          <Pressable
            key={it.key}
            onPress={() => navigation.navigate('OwnerTabs', { screen: it.key })}
            className="flex-1 items-center"
          >
            <View
              style={{
                width: 34, height: 34, borderRadius: 17,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? MINT : 'transparent',
              }}
            >
              <ItemIcon size={18} color={active ? ACCENT : TEXT_PRIMARY} strokeWidth={2} />
            </View>
            <Text className="font-bold" style={{ fontSize: 10, color: active ? PRIMARY : TEXT_PRIMARY, marginTop: 2 }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);

  // Real counts per status bucket, from the already-loaded list — the same
  // 3 buckets statusMeta() can actually tell apart.
  const counts = { ALL: items.length, PENDING: 0, DONE: 0, CANCELLED: 0 };
  items.forEach((p) => { counts[statusMeta(p.status, p.type).key] += 1; });

  const byStatus = statusFilter === 'ALL'
    ? items
    : items.filter((p) => statusMeta(p.status, p.type).key === statusFilter);

  // Filtered client-side: the list is already fully loaded, so this stays
  // instant and works offline. Matches the fields actually visible on a card
  // plus the order id, which is what people read off a receipt.
  const q = query.trim().toLowerCase();
  const visible = q
    ? byStatus.filter((p) => [
        p.title,
        p.color,
        p.storageLabel,
        p.ramLabel,
        p.conditionLabel,
        p.status,
        p.id ? String(p.id).replace(/-/g, '') : '',
      ].some((v) => String(v || '').toLowerCase().includes(q)))
    : byStatus;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchProducts = async (extra) => {
        const data = await marketplaceApi.get('/marketplace/products', {
          query: { type: tab.toUpperCase(), ...extra },
        });
        return Array.isArray(data) ? data : (data?.content || data?.data || []);
      };
      // The list endpoint takes a `status` filter, and without one it can hand
      // back only live (ACTIVE) listings — which hid a listing the moment it
      // was marked Selling Completed (SOLD) or Cancelled, leaving the
      // Completed chip at 0. Ask for the finished statuses explicitly too and
      // merge them in, de-duplicated by id. A failed extra request just
      // contributes nothing; only the main request failing is an error.
      const [base, ...finished] = await Promise.all([
        fetchProducts({}),
        ...['SOLD', 'COMPLETED', 'CANCELLED'].map((status) => fetchProducts({ status }).catch(() => [])),
      ]);
      const seen = new Set();
      const list = [...base, ...finished.flat()].filter((p) => {
        const key = p?.id != null ? String(p.id) : null;
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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

  // Switching tabs resets the status filter — a "Cancelled" filter picked on
  // Sell shouldn't silently hide every Buy order too.
  const switchTab = (t) => { setTab(t); setStatusFilter('ALL'); };

  const FILTERS = [
    { key: 'ALL', label: 'All', Icon: null, tint: MINT, fg: ACCENT },
    { key: 'PENDING', label: 'Pending', Icon: Clock, tint: PENDING_BG, fg: PENDING_FG },
    { key: 'DONE', label: tab === 'Sell' ? 'Completed' : 'Delivered', Icon: CheckCircle2, tint: MINT, fg: ACCENT },
    { key: 'CANCELLED', label: 'Cancelled', Icon: XCircle, tint: CANCELLED_BG, fg: CANCELLED_FG },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 8,
            paddingBottom: 11,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
          }}
        >
          <View className="flex-row items-center" style={capStyle}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="items-center justify-center"
              style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: SOFT_MINT, marginRight: 10 }}
            >
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY }} numberOfLines={1}>
                My Orders
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>
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
              className="items-center justify-center"
              style={{
                height: 38, width: 38, borderRadius: 19,
                backgroundColor: searchOpen ? ACCENT : MINT,
              }}
            >
              {searchOpen
                ? <X size={16} color="#FFFFFF" />
                : <Search size={16} color={PRIMARY} />}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {searchOpen ? (
        <View className="px-4" style={{ marginTop: rs(10) }}>
          <View
            className="flex-row items-center"
            style={[{
              backgroundColor: CARD_BG, borderRadius: 999, borderWidth: 1, borderColor: BORDER,
              paddingHorizontal: rs(13), paddingVertical: rs(2),
            }, capStyle]}
          >
            <Search size={15} color={TEXT_SECONDARY} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search by device, colour or order id"
              placeholderTextColor="#8E8E8E"
              returnKeyType="search"
              className="flex-1"
              style={{ fontSize: 12, paddingVertical: rs(9), marginLeft: rs(8), color: TEXT_PRIMARY }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <X size={15} color={TEXT_SECONDARY} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Buy / Sell segmented control */}
      <View className="px-4" style={{ marginTop: 10 }}>
        <View
          className="flex-row rounded-full"
          style={[{ backgroundColor: '#FFFFFF', padding: 3, borderWidth: 1, borderColor: BORDER }, capStyle]}
        >
          {['Buy', 'Sell'].map((t) => (
            <OrderTab
              key={t}
              label={t}
              Icon={t === 'Buy' ? ShoppingBag : Package}
              active={tab === t}
              onPress={() => switchTab(t)}
            />
          ))}
        </View>
      </View>

      {/* Status filter chips — only the 3 real, distinguishable buckets this
          data actually carries (no fabricated Processing/Shipped split). */}
      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <View style={[{ flexDirection: 'row' }, capStyle]}>
            {FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                Icon={f.Icon}
                count={counts[f.key]}
                active={statusFilter === f.key}
                tint={f.tint}
                fg={f.fg}
                onPress={() => setStatusFilter(f.key)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : visible.length === 0 ? (
        tab === 'Buy' && !q && statusFilter === 'ALL' ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: rs(32) }}>
            <View style={capStyle}>
              {/* Buy empty state */}
              <View className="items-center" style={{ paddingHorizontal: 32, paddingTop: 24 }}>
                <View
                  className="items-center justify-center"
                  style={{ height: 112, width: 112, borderRadius: 56, backgroundColor: MINT, marginBottom: -112 }}
                />
                <View className="items-center justify-center" style={{ height: 112, width: 112 }}>
                  <View className="items-center justify-center" style={{ height: 68, width: 68, borderRadius: 20, backgroundColor: ACCENT }}>
                    <ShoppingBag size={30} color="#FFFFFF" />
                  </View>
                  <Send size={17} color={PRIMARY} style={{ position: 'absolute', top: 4, right: 6 }} />
                </View>
                <Text className="font-extrabold text-center" style={{ fontSize: 15, color: TEXT_PRIMARY, marginTop: 14 }}>
                  No buy orders yet
                </Text>
                <Text className="text-center" style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 4 }}>
                  Your marketplace purchases will appear here.
                </Text>
              </View>

              {/* Benefits panel — static, generic reassurance copy (no
                  fabricated business data), same precedent as the trust
                  banners elsewhere in this app. */}
              <View className="px-4" style={{ marginTop: 18 }}>
                <View
                  className="flex-row"
                  style={{ backgroundColor: CARD_BG, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, borderColor: SOFT_MINT }}
                >
                  {[
                    { Icon: ShieldCheck, title: 'Secure Payments', sub: '100% safe transactions' },
                    { Icon: Truck, title: 'Track Orders', sub: 'Real-time order updates' },
                    { Icon: Package, title: 'Genuine Products', sub: 'Buy with confidence' },
                  ].map((b, i) => (
                    <React.Fragment key={b.title}>
                      {i > 0 ? <View style={{ width: 1, backgroundColor: SOFT_MINT, marginHorizontal: 4 }} /> : null}
                      <View className="flex-1 items-center" style={{ paddingHorizontal: 4 }}>
                        <View className="items-center justify-center" style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: MINT, marginBottom: 5 }}>
                          <b.Icon size={14} color={ACCENT} />
                        </View>
                        <Text className="font-extrabold text-center" style={{ fontSize: 10.5, color: TEXT_PRIMARY }} numberOfLines={1}>{b.title}</Text>
                        <Text className="text-center" style={{ fontSize: 9.5, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={2}>{b.sub}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </View>

              {/* Explore Products — same real Buy tab, no new route. */}
              <View className="px-4" style={{ marginTop: 14 }}>
                <Pressable
                  onPress={() => navigation.navigate('OwnerTabs', { screen: 'Buy' })}
                  className="flex-row items-center justify-center active:opacity-90"
                  style={{ borderRadius: 999, backgroundColor: ACCENT, minHeight: 46, ...cardShadow, shadowColor: ACCENT, shadowOpacity: 0.25 }}
                >
                  <ShoppingBag size={15} color="#FFFFFF" />
                  <Text className="text-white font-extrabold" style={{ marginLeft: 8, fontSize: 13 }}>Explore Products</Text>
                  <ArrowRight size={15} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </Pressable>
                <Text className="text-center" style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 8 }}>
                  Start shopping and find great deals!
                </Text>
              </View>
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: rs(32) }}>
            <View
              className="items-center justify-center"
              style={{ height: 84, width: 84, borderRadius: 42, backgroundColor: MINT, marginBottom: 14 }}
            >
              <View className="items-center justify-center" style={{ height: 56, width: 56, borderRadius: 28, backgroundColor: '#FFFFFF' }}>
                <ShoppingBag size={24} color={ACCENT} />
              </View>
            </View>
            <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }}>
              {q ? 'No matches' : `No ${tab.toLowerCase()} orders yet`}
            </Text>
            <Text className="text-center" style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 6, lineHeight: 17 }}>
              {q
                ? `Nothing in ${tab} matches "${query.trim()}".`
                : tab === 'Sell'
                  ? 'Your published listings will show up here.'
                  : 'Your marketplace purchases will appear here.'}
            </Text>
          </View>
        )
      ) : (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 20 }, capStyle]}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((item) => (
            <OrderCard
              key={item.id}
              item={item}
              showPrice={tab === 'Sell'}
              isSell={tab === 'Sell'}
              onPress={() =>
                navigation.navigate('MarketplaceListingDetails', { productId: item.id, listing: item })
              }
            />
          ))}
        </ScrollView>
      )}
      </View>

      <BottomNavMimic navigation={navigation} activeKey={tab} />
    </View>
  );
}
