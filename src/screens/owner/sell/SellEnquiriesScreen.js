import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, MessageCircle, MessageSquare } from 'lucide-react-native';
import { listEnquiries, resetSellServerMode } from '../../../api/sellListings';
import { rf } from '../../../utils/responsive';
import {
  C, Card, EmptyBox, ErrorBox, PrimaryButton, SellScreen, StatusPill, TabPills, Thumb, money,
} from './kit';

// Buyer enquiries and price requests on this shop's listings, grouped by
// product like the design. Server-paged; detail + actions live in
// SellEnquiryDetailScreen.

const PAGE_SIZE = 20;
const MAX_RELOAD_PAGES = 5;
const KINDS = [
  { value: 'ALL', label: 'All' },
  { value: 'ENQUIRY', label: 'Enquiries' },
  { value: 'PURCHASE_REQUEST', label: 'Price Requests' },
];
const KIND_VALUES = KINDS.map((k) => k.value);

function relTime(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `${h} hour${h > 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function specOf(product) {
  return [product?.storageLabel, product?.ramLabel, product?.conditionLabel].filter(Boolean).join(' · ');
}

function initials(name) {
  const w = String(name || 'Buyer').trim().split(/\s+/);
  return ((w[0]?.[0] || 'B') + (w[1]?.[0] || '')).toUpperCase();
}

function offerLine(e) {
  const status = String(e.status || '').toUpperCase();
  if (e.agreedAmount != null && (status === 'ACCEPTED' || status === 'CONFIRMED')) return { label: 'Agreed price', amount: e.agreedAmount };
  if (e.lastOfferAmount == null) return null;
  if (e.lastOfferBy === 'SHOP') return { label: 'Your quote', amount: e.lastOfferAmount };
  if (e.lastOfferBy === 'BUYER') return { label: 'Buyer offer', amount: e.lastOfferAmount };
  return { label: 'Offer', amount: e.lastOfferAmount };
}

/** Rows grouped by product, in order of first appearance. */
function groupByProduct(rows) {
  const map = new Map();
  rows.forEach((e) => {
    const key = String(e.productId || e.product?.id || `enquiry-${e.id}`);
    if (!map.has(key)) map.set(key, { key, product: e.product || {}, items: [] });
    map.get(key).items.push(e);
  });
  return [...map.values()];
}

function mergeRows(prev, next) {
  const seen = new Set(prev.map((e) => String(e.id)));
  return [...prev, ...next.filter((e) => e?.id && !seen.has(String(e.id)))];
}

function KindChips({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
      {KINDS.map((k) => {
        const on = k.value === value;
        return (
          <Pressable
            key={k.value}
            onPress={() => onChange(k.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={k.label}
            className="active:opacity-80"
            style={{
              borderRadius: 999, paddingHorizontal: 12, height: 30, justifyContent: 'center',
              backgroundColor: on ? C.mint : '#FFFFFF', borderWidth: 1, borderColor: on ? C.mintLine : C.border,
            }}
          >
            <Text style={{ fontSize: rf(11.5), fontWeight: on ? '800' : '600', color: on ? C.teal : C.muted }}>{k.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EnquiryRow({ e, onPress }) {
  const offer = offerLine(e);
  const name = e.buyer?.name || 'Buyer';
  const meta = [
    relTime(e.updatedAt || e.createdAt),
    e.kind === 'PURCHASE_REQUEST' ? 'Price request' : null,
    Number(e.quantity) > 1 ? `Qty ${e.quantity}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Enquiry from ${name}`}
      className="active:opacity-80"
      style={{ borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 12, paddingVertical: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.teal }}>{initials(name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: rf(13), fontWeight: e.unread ? '800' : '700', color: C.text }}>{name}</Text>
            {e.unread ? <View accessibilityLabel="Unread" style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: C.green, marginLeft: 6 }} /> : null}
          </View>
          {meta ? <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{meta}</Text> : null}
        </View>
        <StatusPill status={e.status} style={{ alignSelf: 'center', marginLeft: 8 }} />
      </View>
      {e.message ? (
        <View style={{ backgroundColor: C.field, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 }}>
          <Text numberOfLines={2} style={{ fontSize: rf(12), color: C.text, lineHeight: rf(16.5) }}>{e.message}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        {offer ? (
          <>
            <Text style={{ fontSize: rf(11.5), color: C.muted }}>{offer.label}</Text>
            <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.teal, marginLeft: 6 }}>{money(offer.amount)}</Text>
          </>
        ) : (
          <Text style={{ fontSize: rf(11.5), color: C.muted }}>No offer yet</Text>
        )}
        <View style={{ flex: 1 }} />
        <ChevronRight size={16} color={C.faint} />
      </View>
    </Pressable>
  );
}

function ProductGroup({ group, collapsed, onToggle, onOpen }) {
  const { product, items } = group;
  const spec = specOf(product);
  const unread = items.filter((e) => e.unread).length;
  const summary = [`${items.length} ${items.length === 1 ? 'enquiry' : 'enquiries'}`, unread ? `${unread} new` : null].filter(Boolean).join(' · ');
  return (
    <Card style={{ marginBottom: 10, padding: 0 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={product.title || 'Listing'}
        className="active:opacity-80"
        style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}
      >
        <Thumb uri={product.imageUrl} size={46} radius={10} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          <Text numberOfLines={1} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{product.title || 'Listing'}</Text>
          <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>
            {collapsed ? summary : [spec, product.price != null ? money(product.price) : null].filter(Boolean).join(' · ') || summary}
          </Text>
        </View>
        {unread && collapsed ? <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 8 }} /> : null}
        {collapsed ? <ChevronRight size={18} color={C.text} /> : <ChevronDown size={18} color={C.text} />}
      </Pressable>
      {collapsed ? null : items.map((e) => <EnquiryRow key={String(e.id)} e={e} onPress={() => onOpen(e)} />)}
    </Card>
  );
}

export default function SellEnquiriesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const paramKind = route?.params?.kind;
  const paramProductId = route?.params?.productId;

  const [tab, setTab] = useState('ACTIVE');
  const [kind, setKind] = useState(KIND_VALUES.includes(paramKind) ? paramKind : 'ALL');
  const [productId, setProductId] = useState(paramProductId || null);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [moreError, setMoreError] = useState(null);
  const [updateRequired, setUpdateRequired] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const gen = useRef(0);
  const loadedKey = useRef(null);
  const pagesRef = useRef(1);
  const moreBusy = useRef(false);
  const key = `${tab}|${kind}|${productId || ''}`;

  useEffect(() => { if (KIND_VALUES.includes(paramKind)) setKind(paramKind); }, [paramKind]);
  useEffect(() => { setProductId(paramProductId || null); }, [paramProductId]);

  const query = useCallback((pageNum, size) => listEnquiries({
    status: tab,
    kind: kind === 'ALL' ? undefined : kind,
    productId: productId || undefined,
    page: pageNum,
    size,
  }), [tab, kind, productId]);

  const fail = useCallback((e, fallback) => {
    if (e?.code === 'SERVER_UPDATE_REQUIRED') {
      setUpdateRequired(e.message);
      return null;
    }
    return e?.message || fallback;
  }, []);

  /** mode: 'reset' (new filter), 'refresh' (pull), 'silent' (focus). */
  const load = useCallback(async (mode) => {
    const g = ++gen.current;
    const pages = mode === 'silent' ? Math.min(pagesRef.current, MAX_RELOAD_PAGES) : 1;
    if (mode === 'reset') {
      setLoading(true);
      setRows([]);
      setError(null);
      pagesRef.current = 1;
    }
    if (mode === 'refresh') setRefreshing(true);
    setMoreError(null);
    try {
      const res = await query(0, pages * PAGE_SIZE);
      if (g !== gen.current) return;
      const total = Number(res?.totalElements);
      setRows(Array.isArray(res?.content) ? res.content : []);
      if (res?.counts) setCounts(res.counts);
      pagesRef.current = pages;
      setPage(pages - 1);
      setTotalPages(Number.isFinite(total) ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : Math.max(1, (res?.totalPages || 1) * pages));
      setError(null);
      setUpdateRequired(null);
      loadedKey.current = key;
    } catch (e) {
      if (g !== gen.current) return;
      setError(fail(e, 'Could not load enquiries.'));
    } finally {
      if (g === gen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [query, key, fail]);

  useFocusEffect(useCallback(() => {
    load(loadedKey.current === key ? 'silent' : 'reset');
  }, [load, key]));

  const loadMore = useCallback(async (force) => {
    if (moreBusy.current || loading || refreshing || error || updateRequired || (moreError && !force) || page + 1 >= totalPages) return;
    const g = gen.current;
    const next = page + 1;
    moreBusy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await query(next, PAGE_SIZE);
      if (g !== gen.current) return;
      const content = Array.isArray(res?.content) ? res.content : [];
      setRows((prev) => mergeRows(prev, content));
      if (res?.counts) setCounts(res.counts);
      pagesRef.current = next + 1;
      setPage(next);
      setTotalPages(content.length ? Math.max(next + 1, res?.totalPages || 1) : next + 1);
    } catch (e) {
      if (g === gen.current) setMoreError(fail(e, 'Could not load more enquiries.'));
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }, [loading, refreshing, error, updateRequired, moreError, page, totalPages, query, fail]);

  const groups = useMemo(() => groupByProduct(rows), [rows]);
  const openChats = () => navigation.navigate('ShopChatInbox');
  const open = useCallback((e) => navigation.navigate('SellEnquiryDetail', { enquiryId: e.id }), [navigation]);
  const toggle = (k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const header = { title: 'Buyer Enquiries', subtitle: 'Enquiries for your listings', onBack: () => navigation.goBack() };

  if (updateRequired) {
    return (
      <SellScreen {...header}>
        <ErrorBox
          tone="warning"
          message={updateRequired}
          onRetry={() => { resetSellServerMode(); setUpdateRequired(null); load('reset'); }}
        />
        <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 12, lineHeight: rf(17) }}>
          Until then, buyers can still reach you in Buyer Chats.
        </Text>
        <PrimaryButton title="Open Buyer Chats" icon={MessageCircle} onPress={openChats} style={{ marginTop: 12 }} />
      </SellScreen>
    );
  }

  const tabs = [
    { value: 'ACTIVE', label: 'Enquiries', count: counts?.ACTIVE },
    { value: 'HISTORY', label: 'History', count: counts?.HISTORY },
  ];

  let empty = null;
  if (!loading) {
    if (error) {
      empty = <ErrorBox message={error} onRetry={() => load('reset')} />;
    } else {
      const history = tab === 'HISTORY';
      const what = kind === 'PURCHASE_REQUEST' ? 'price requests' : kind === 'ENQUIRY' ? 'enquiries' : 'enquiries or price requests';
      empty = (
        <EmptyBox
          icon={MessageSquare}
          title={history ? 'No past enquiries' : 'No open enquiries'}
          sub={history
            ? `Confirmed, rejected and cancelled ${what} show up here.`
            : `When buyers send ${what} on your listings, they show up here.`}
        />
      );
    }
  }

  const footer = loadingMore ? (
    <ActivityIndicator color={C.teal} style={{ marginVertical: 16 }} />
  ) : moreError ? (
    <ErrorBox message={moreError} onRetry={() => loadMore(true)} style={{ marginBottom: 8 }} />
  ) : null;

  return (
    <SellScreen {...header} scroll={false}>
      <TabPills tabs={tabs} value={tab} onChange={setTab} style={{ flexGrow: 0, marginTop: 4 }} />
      <KindChips value={kind} onChange={setKind} />
      {productId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Text style={{ flex: 1, fontSize: rf(11.5), color: C.muted }}>Showing enquiries for one listing</Text>
          <Pressable onPress={() => setProductId(null)} accessibilityRole="button" accessibilityLabel="Show all listings" hitSlop={8}>
            <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: C.teal }}>Show all</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !rows.length ? (
        <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.key}
          extraData={collapsed}
          renderItem={({ item }) => (
            <ProductGroup group={item} collapsed={!!collapsed[item.key]} onToggle={() => toggle(item.key)} onOpen={open} />
          )}
          style={{ flex: 1, marginTop: 10 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 2, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          windowSize={7}
          onEndReached={() => loadMore(false)}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[C.teal]} tintColor={C.teal} />}
          ListHeaderComponent={error && rows.length ? <ErrorBox message={error} onRetry={() => load('silent')} style={{ marginTop: 0, marginBottom: 10 }} /> : null}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
        />
      )}
    </SellScreen>
  );
}
