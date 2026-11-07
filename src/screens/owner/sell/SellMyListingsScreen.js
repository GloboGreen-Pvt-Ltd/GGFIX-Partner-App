import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import {
  Check, ChevronDown, ChevronUp, CircleCheck, EllipsisVertical, Eye, IndianRupee, Package, Pencil, Plus, Power, PowerOff, Rocket, Search, ShoppingBag, SlidersHorizontal, Trash2, X,
} from 'lucide-react-native';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { confirm, notify } from '../../../components/confirm';
import { showToast } from '../../../components/Toast';
import { selectShopId, selectUserId } from '../../../store/authSlice';
import {
  canTransition, deleteListing, listMyListings, setListingStatus, updateListingPrice,
} from '../../../api/sellListings';
import { rf } from '../../../utils/responsive';
import { listShopBuyOrders } from '../../../api/buyOrders';
import { draftFromProduct, draftTitle, hasUnsavedProgress, sellDraftStore } from './draft';
import {
  C, CONTENT_MAX, Card, ChoiceCard, EmptyBox, ErrorBox, PrimaryButton, QtyStepper, SearchInput, Segmented, SellScreen, StatusPill, TabPills,
  TextField, Thumb, cleanAmount, listingImage, listingSub, money,
} from './kit';

// My Listings: every listing of this shop by status, with price / status /
// delete actions. Server-paged (20 per page); type filter and sort apply to
// the rows loaded so far.

const PAGE_SIZE = 20;
const MAX_RELOAD_PAGES = 5; // a focus reload refetches up to 100 rows (server cap)

const TABS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ALL', label: 'All' },
];
const TAB_VALUES = TABS.map((t) => t.value);

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'DEVICE', label: 'Device' },
  { value: 'SPARE_PART', label: 'Spare Part' },
  { value: 'ACCESSORY', label: 'Accessory' },
];
const SORT_OPTIONS = [
  { value: 'NEWEST', label: 'Newest first' },
  { value: 'PRICE_ASC', label: 'Price: low to high' },
  { value: 'PRICE_DESC', label: 'Price: high to low' },
];

const EMPTY = {
  ACTIVE: { title: 'No active listings', sub: 'Listings you publish show up here for buyers.', add: true },
  DRAFT: { title: 'No drafts', sub: 'Listings saved as a draft wait here until you publish them.' },
  SOLD: { title: 'Nothing sold yet', sub: 'Listings you mark as sold move here.' },
  INACTIVE: { title: 'No inactive listings', sub: 'Deactivated listings are hidden from buyers and kept here.' },
  ALL: { title: 'No listings yet', sub: 'Add a device, spare part or accessory to start selling.', add: true },
};

const sameId = (a, b) => String(a) === String(b);

/** Last non-null value, so a sheet keeps its content while it fades out. */
function useLastValue(value) {
  const ref = useRef(value);
  if (value) ref.current = value;
  return ref.current;
}

function mergeRows(prev, next) {
  const seen = new Set(prev.map((p) => String(p.id)));
  return [...prev, ...next.filter((p) => p?.id && !seen.has(String(p.id)))];
}

function sortRows(rows, sort) {
  if (sort === 'NEWEST') return rows; // server order: newest updatedAt first
  const dir = sort === 'PRICE_ASC' ? 1 : -1;
  const val = (p) => {
    const n = Number(p.price);
    return p.price == null || Number.isNaN(n) ? dir * Infinity : n; // unpriced rows last
  };
  return [...rows].sort((a, b) => dir * (val(a) - val(b)));
}

function CardButton({ icon: Icon, label, onPress, disabled, tone }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="active:opacity-70"
      style={{
        flex: 1, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon size={14} color={tone === 'green' ? C.green : C.teal} />
      <Text numberOfLines={1} style={{ marginLeft: 6, fontSize: rf(12), fontWeight: '700', color: C.text }}>{label}</Text>
    </Pressable>
  );
}

// Bulk batches: listings sharing a batchId show as one "Bulk · N Variants"
// card; tapping it shows each variant's own card (all actions stay there).
const BATCH_TITLE = { SPARE_PARTS: 'Spare Parts', ACCESSORIES: 'Mobile Accessories' };

function groupBatches(list) {
  const counts = {};
  list.forEach((p) => { if (p.batchId) counts[p.batchId] = (counts[p.batchId] || 0) + 1; });
  const out = [];
  const groups = {};
  list.forEach((p) => {
    if (p.batchId && counts[p.batchId] > 1) {
      if (!groups[p.batchId]) {
        groups[p.batchId] = { kind: 'group', key: `batch-${p.batchId}`, batchId: p.batchId, items: [] };
        out.push(groups[p.batchId]);
      }
      groups[p.batchId].items.push(p);
    } else {
      out.push({ kind: 'item', key: String(p.id), p });
    }
  });
  return out;
}

function batchTitle(items) {
  const listing = (p) => p._assessment?.listing || {};
  const models = [...new Set(items.map((p) => listing(p).modelName).filter(Boolean))];
  const storages = [...new Set(items.map((p) => p.storageLabel).filter(Boolean))];
  if (models.length === 1) return { title: `${models[0]}${storages.length === 1 ? ` (${storages[0].replace(/\s+/g, '')})` : ''}`, variants: true };
  const type = items[0]?._assessment?.bulk?.batchType;
  return { title: BATCH_TITLE[type] || listing(items[0]).brandName || 'Bulk listing', variants: false };
}

const BulkGroupCard = memo(function BulkGroupCard({ group, open, onToggle }) {
  const { items } = group;
  const { title, variants } = batchTitle(items);
  const qty = items.reduce((n, p) => n + (Number(p.quantity) || 0), 0);
  const prices = items.map((p) => Number(p.price)).filter((v) => v > 0);
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  const range = lo == null ? '—' : lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
  const statuses = [...new Set(items.map((p) => p._status))];
  return (
    <Card style={{ marginBottom: 10 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}, bulk, ${items.length} ${variants ? 'variants' : 'items'}`}
        className="active:opacity-90" style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Thumb uri={listingImage(items[0])} size={64} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{title}</Text>
          <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{`Bulk · ${items.length} ${variants ? 'Variants' : 'Items'}`}</Text>
          <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.text, marginTop: 4 }}>{`Qty: ${qty}  |  ${lo === hi ? '' : 'From '}${range}`}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
          <StatusPill status={statuses.length === 1 ? statuses[0] : 'ACTIVE'} label={statuses.length === 1 ? undefined : 'Mixed'} />
          {open ? <ChevronUp size={18} color={C.muted} style={{ marginTop: 10 }} /> : <ChevronDown size={18} color={C.muted} style={{ marginTop: 10 }} />}
        </View>
      </Pressable>
    </Card>
  );
});

const ListingCard = memo(function ListingCard({ p, busy, onOpen, onMenu, onEdit, onMarkSold, onPublish, order, onOrder }) {
  const status = p._status;
  const canSell = canTransition(status, 'SOLD');
  const canPublish = status === 'DRAFT' && canTransition(status, 'ACTIVE');
  const stock = Math.max(0, Number(p.quantity ?? 0) - Number(p.soldQuantity ?? 0));
  const qtyLine = [`Stock: ${stock}`, p.soldQuantity > 0 ? `Sold ${p.soldQuantity}` : null].filter(Boolean).join(' · ');
  return (
    // The card body, the ⋮ menu and the action buttons are sibling pressables:
    // a button inside a button is invalid on web and confuses screen readers.
    <Card style={{ marginBottom: 10 }}>
      <Pressable
        onPress={() => (order ? onOrder(order) : onOpen(p))}
        accessibilityRole="button"
        accessibilityLabel={p.title || 'Listing'}
        className="active:opacity-90"
        style={{ flexDirection: 'row' }}
      >
        <Thumb uri={listingImage(p)} size={64} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text, paddingRight: 26 }}>{p.title || 'Untitled listing'}</Text>
          <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{listingSub(p)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.teal }}>{money(p.price)}</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(11), color: C.muted, marginLeft: 8 }}>{qtyLine}</Text>
            <StatusPill status={status} style={{ alignSelf: 'center', marginLeft: 6 }} />
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={busy ? undefined : () => onMenu(p)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${p.title || 'listing'}`}
        accessibilityState={{ busy: !!busy }}
        className="active:opacity-60"
        style={{ position: 'absolute', top: 10, right: 8, height: 24, width: 24, alignItems: 'center', justifyContent: 'center' }}
      >
        {busy ? <ActivityIndicator size="small" color={C.teal} /> : <EllipsisVertical size={18} color={C.muted} />}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
        <CardButton icon={Pencil} label="Edit" onPress={() => onEdit(p)} disabled={status === 'SOLD' || busy} />
        {/* A customer order sells it through Orders; Mark Sold only for sales made outside the app. */}
        {order ? <CardButton icon={ShoppingBag} tone="green" label="View Order" onPress={() => onOrder(order)} disabled={busy} />
          : canSell ? <CardButton icon={Check} tone="green" label="Mark Sold" onPress={() => onMarkSold(p)} disabled={busy} /> : null}
        {!canSell && canPublish ? <CardButton icon={Rocket} tone="green" label="Publish" onPress={() => onPublish(p)} disabled={busy} /> : null}
      </View>
    </Card>
  );
});

/** Bottom sheet in its own modal window; pads the nav bar / keyboard itself. */
function Sheet({ visible, title, onClose, onDismiss, children }) {
  return (
    <SafeModal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss}>
      <ModalInsets>
        {({ bottom }) => (
          <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
            <View
              style={{
                width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', maxHeight: '88%', backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: bottom + 12,
              }}
            >
              <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 10 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6 }}>
                <Text style={{ flex: 1, fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
                  <X size={20} color={C.text} />
                </Pressable>
              </View>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16 }}>
                {children}
              </ScrollView>
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}

function SheetProduct({ p }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
      <Thumb uri={listingImage(p)} size={44} radius={10} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{p.title || 'Untitled listing'}</Text>
        <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{`${money(p.price)} · Qty: ${p.quantity ?? 0}`}</Text>
      </View>
      <StatusPill status={p._status} style={{ alignSelf: 'center' }} />
    </View>
  );
}

function MenuRow({ item }) {
  const Icon = item.icon;
  const fg = item.danger ? C.red : C.text;
  return (
    <Pressable
      onPress={item.disabled ? undefined : item.run}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled: !!item.disabled }}
      className="active:opacity-70"
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', opacity: item.disabled ? 0.45 : 1 }}
    >
      <View style={{ height: 34, width: 34, borderRadius: 10, backgroundColor: item.danger ? C.redBg : C.mint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={item.danger ? C.red : C.teal} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: fg }}>{item.label}</Text>
        {item.sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{item.sub}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function SellMyListingsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const ctx = useMemo(() => ({ shopId, userId }), [shopId, userId]);
  const initialStatus = route?.params?.initialStatus;
  const initialQ = route?.params?.q;

  const [tab, setTab] = useState(TAB_VALUES.includes(initialStatus) ? initialStatus : 'ACTIVE');
  const [qInput, setQInput] = useState(typeof initialQ === 'string' ? initialQ : '');
  const [q, setQ] = useState(typeof initialQ === 'string' ? initialQ.trim() : '');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sort, setSort] = useState('NEWEST');
  const [filterOpen, setFilterOpen] = useState(false);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [moreError, setMoreError] = useState(null);

  const [busy, setBusy] = useState({});
  const busyRef = useRef(new Set());
  const [menuFor, setMenuFor] = useState(null);
  const [priceFor, setPriceFor] = useState(null);
  const [priceText, setPriceText] = useState('');
  const [priceError, setPriceError] = useState(null);
  const [soldFor, setSoldFor] = useState(null);
  const [soldQty, setSoldQty] = useState(1);

  const gen = useRef(0);          // bumps on every full load; stale responses are dropped
  const loadedKey = useRef(null); // tab|q of the rows on screen
  const pagesRef = useRef(1);     // pages currently loaded
  const moreBusy = useRef(false);
  const pendingRef = useRef(null);

  // Params can change when the screen is navigated to again.
  useEffect(() => { if (TAB_VALUES.includes(initialStatus)) setTab(initialStatus); }, [initialStatus]);
  useEffect(() => { if (typeof initialQ === 'string') setQInput(initialQ); }, [initialQ]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  /** mode: 'reset' (new tab / search), 'refresh' (pull), 'silent' (focus, after an action). */
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
      const res = await listMyListings({ status: tab, q, page: 0, size: pages * PAGE_SIZE }, ctx);
      if (g !== gen.current) return;
      const total = Number(res?.totalElements);
      setRows(res?.content || []);
      if (res?.counts) setCounts(res.counts);
      pagesRef.current = pages;
      setPage(pages - 1);
      setTotalPages(Number.isFinite(total) ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : Math.max(1, (res?.totalPages || 1) * pages));
      setError(null);
      loadedKey.current = `${tab}|${q}`;
    } catch (e) {
      if (g !== gen.current) return;
      setError(e?.message || 'Could not load your listings.');
    } finally {
      if (g === gen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tab, q, ctx]);

  // Open customer buy orders by listing id.
  const [openOrders, setOpenOrders] = useState({});
  const openOrder = useCallback((o) => navigation.navigate('SellBuyOrderDetail', { id: o.id }), [navigation]);
  useFocusEffect(useCallback(() => {
    listShopBuyOrders()
      .then((rows) => setOpenOrders(Object.fromEntries((Array.isArray(rows) ? rows : [])
        .filter((o) => ['PLACED', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'].includes(o.status))
        .map((o) => [String(o.productId), o]))))
      .catch(() => {});
  }, []));

  useFocusEffect(useCallback(() => {
    load(loadedKey.current === `${tab}|${q}` ? 'silent' : 'reset');
  }, [load, tab, q]));

  const loadMore = useCallback(async (force) => {
    if (moreBusy.current || loading || refreshing || error || (moreError && !force) || page + 1 >= totalPages) return;
    const g = gen.current;
    const next = page + 1;
    moreBusy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await listMyListings({ status: tab, q, page: next, size: PAGE_SIZE }, ctx);
      if (g !== gen.current) return;
      const content = res?.content || [];
      setRows((prev) => mergeRows(prev, content));
      if (res?.counts) setCounts(res.counts);
      pagesRef.current = next + 1;
      setPage(next);
      setTotalPages(content.length ? Math.max(next + 1, res?.totalPages || 1) : next + 1);
    } catch (e) {
      if (g === gen.current) setMoreError(e?.message || 'Could not load more listings.');
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }, [loading, refreshing, error, moreError, page, totalPages, tab, q, ctx]);

  const visible = useMemo(
    () => sortRows(typeFilter === 'ALL' ? rows : rows.filter((p) => p.listingType === typeFilter), sort),
    [rows, typeFilter, sort],
  );
  const display = useMemo(() => groupBatches(visible), [visible]);
  const [openGroups, setOpenGroups] = useState({});

  // ── Row updates & busy state ─────────────────────────────────────────────

  /** Replace a row with the server's copy (null removes it); rows that left this tab drop out. */
  const replaceRow = useCallback((id, next) => {
    setRows((list) => {
      if (!next || (tab !== 'ALL' && next._status !== tab)) return list.filter((r) => !sameId(r.id, id));
      return list.map((r) => (sameId(r.id, id) ? next : r));
    });
  }, [tab]);

  const withBusy = useCallback(async (p, task) => {
    const id = String(p.id);
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await task();
    } finally {
      busyRef.current.delete(id);
      setBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }, []);

  const runStatus = useCallback((p, status, opts, toast) => withBusy(p, async () => {
    try {
      const updated = await setListingStatus(p, status, opts);
      replaceRow(p.id, updated?.id ? updated : { ...p, _status: status });
      showToast({ type: 'success', ...toast(updated) });
      load('silent');
    } catch (e) {
      notify('Could not update listing', e?.message || 'Please try again.', { type: 'error' });
    }
  }), [withBusy, replaceRow, load]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const view = useCallback((p) => {
    navigation.navigate('MarketplaceListingDetails', { productId: p.id, listing: p });
  }, [navigation]);

  const edit = useCallback(async (p) => {
    if (p._status === 'SOLD') return;
    // Let the stored draft finish loading first, so it can't overwrite this one.
    const current = await sellDraftStore.load();
    if (hasUnsavedProgress(current)) {
      const ok = await confirm({
        title: 'Discard unfinished listing?',
        message: `Editing this listing replaces your unfinished draft "${draftTitle(current)}".`,
        confirmText: 'Edit Anyway',
        destructive: true,
      });
      if (!ok) return;
    }
    sellDraftStore.set(draftFromProduct(p));
    navigation.navigate('SellStepDetails');
  }, [navigation]);

  const askSold = useCallback((p) => {
    if (!canTransition(p._status, 'SOLD') || busyRef.current.has(String(p.id))) return;
    const qty = Number(p.quantity) || 0;
    if (qty > 1) {
      setSoldQty(qty);
      setSoldFor(p);
      return;
    }
    confirm({ title: 'Mark as sold?', message: `"${p.title || 'This listing'}" moves to Sold and is hidden from buyers.`, confirmText: 'Mark Sold' })
      .then((ok) => {
        if (ok) runStatus(p, 'SOLD', {}, () => ({ title: 'Marked as sold', message: p.title || '' }));
      });
  }, [runStatus]);

  const submitSold = () => {
    const p = soldFor;
    if (!p) return;
    const n = soldQty;
    const qty = Number(p.quantity) || 0;
    setSoldFor(null);
    runStatus(p, 'SOLD', { quantitySold: n }, (u) => {
      if (n >= qty) return { title: 'Marked as sold', message: p.title || '' };
      const left = u?.quantity != null ? u.quantity : qty - n;
      return { title: `${n} sold`, message: `${left} left in stock` };
    });
  };

  const changeStatus = useCallback((p, to) => {
    if (!canTransition(p._status, to)) return;
    const title = to === 'INACTIVE' ? 'Listing deactivated' : p._status === 'DRAFT' ? 'Listing published' : 'Listing activated';
    runStatus(p, to, {}, () => ({ title, message: p.title || '' }));
  }, [runStatus]);

  const openPrice = (p) => {
    setPriceText(p.price != null ? cleanAmount(String(p.price)) : '');
    setPriceError(null);
    setPriceFor(p);
  };

  const submitPrice = () => {
    const p = priceFor;
    if (!p) return;
    const amount = Number(priceText);
    if (!priceText || !Number.isFinite(amount) || amount <= 0) {
      setPriceError('Enter a price greater than ₹0.');
      return;
    }
    setPriceFor(null);
    if (Number(p.price) === amount || busyRef.current.has(String(p.id))) return;
    replaceRow(p.id, { ...p, price: amount }); // optimistic
    withBusy(p, async () => {
      try {
        const updated = await updateListingPrice(p, amount);
        replaceRow(p.id, updated?.id ? updated : { ...p, price: amount });
        showToast({ type: 'success', title: 'Price updated', message: `${p.title || 'Listing'} · ${money(amount)}` });
        load('silent');
      } catch (e) {
        replaceRow(p.id, p);
        notify('Could not update price', e?.message || 'Please try again.', { type: 'error' });
      }
    });
  };

  const remove = useCallback((p) => {
    confirm({
      title: 'Delete listing?',
      message: `"${p.title || 'This listing'}" will be removed from your listings and from buyers. This can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      withBusy(p, async () => {
        try {
          await deleteListing(p.id);
          replaceRow(p.id, null);
          showToast({ type: 'success', title: 'Listing deleted', message: p.title || '' });
          load('silent');
        } catch (e) {
          notify('Could not delete listing', e?.message || 'Please try again.', { type: 'error' });
        }
      });
    });
  }, [withBusy, replaceRow, load]);

  // A menu choice runs once the sheet is gone: iOS can't show an alert or a
  // second modal while one is still animating out (onDismiss, timer fallback).
  const runPending = useCallback(() => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    if (fn) fn();
  }, []);
  const pick = (fn) => {
    if (!menuFor || pendingRef.current) return;
    pendingRef.current = fn;
    setMenuFor(null);
    setTimeout(runPending, Platform.OS === 'ios' ? 650 : 0);
  };

  const menuItems = (p) => {
    const s = p._status;
    const items = [
      { key: 'view', label: 'View listing', icon: Eye, run: () => pick(() => view(p)) },
      {
        key: 'edit', label: 'Edit listing', icon: Pencil, disabled: s === 'SOLD',
        sub: s === 'SOLD' ? "Sold listings can't be edited" : null, run: () => pick(() => edit(p)),
      },
    ];
    if (s !== 'SOLD') items.push({ key: 'price', label: 'Update price', icon: IndianRupee, run: () => pick(() => openPrice(p)) });
    if (canTransition(s, 'SOLD')) items.push({ key: 'sold', label: 'Mark as sold', icon: CircleCheck, run: () => pick(() => askSold(p)) });
    if (canTransition(s, 'ACTIVE')) {
      items.push(s === 'DRAFT'
        ? { key: 'active', label: 'Publish', sub: 'Make it visible to buyers', icon: Rocket, run: () => pick(() => changeStatus(p, 'ACTIVE')) }
        : { key: 'active', label: 'Activate', sub: 'Show it to buyers again', icon: Power, run: () => pick(() => changeStatus(p, 'ACTIVE')) });
    }
    if (canTransition(s, 'INACTIVE')) {
      items.push({ key: 'inactive', label: 'Deactivate', sub: 'Hide from buyers without deleting', icon: PowerOff, run: () => pick(() => changeStatus(p, 'INACTIVE')) });
    }
    items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true, run: () => pick(() => remove(p)) });
    return items;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const filtersOn = typeFilter !== 'ALL' || sort !== 'NEWEST';
  const clearFilters = () => {
    setTypeFilter('ALL');
    setSort('NEWEST');
    setQInput('');
  };
  const addNew = () => navigation.navigate('SellListingType');

  const publish = useCallback((p) => changeStatus(p, 'ACTIVE'), [changeStatus]);
  const menuShown = useLastValue(menuFor);
  const priceShown = useLastValue(priceFor);
  const soldShown = useLastValue(soldFor);

  const tabs = TABS.map((t) => ({ ...t, count: counts ? counts[t.value] : undefined }));

  const card = (p) => (
    <ListingCard
      key={String(p.id)}
      p={p}
      busy={!!busy[String(p.id)]}
      onOpen={view}
      onMenu={setMenuFor}
      onEdit={edit}
      onMarkSold={askSold}
      onPublish={publish}
      order={openOrders[String(p.id)]}
      onOrder={openOrder}
    />
  );
  const renderItem = ({ item }) => (item.kind === 'group' ? (
    <View>
      <BulkGroupCard group={item} open={!!openGroups[item.batchId]} onToggle={() => setOpenGroups((o) => ({ ...o, [item.batchId]: !o[item.batchId] }))} />
      {openGroups[item.batchId] ? <View style={{ marginLeft: 12, marginTop: -4 }}>{item.items.map(card)}</View> : null}
    </View>
  ) : card(item.p));

  let empty = null;
  if (!loading) {
    if (error) {
      empty = <ErrorBox message={error} onRetry={() => load('reset')} />;
    } else if (q || typeFilter !== 'ALL') {
      empty = loadingMore ? null : (
        <EmptyBox icon={Search} title="No matching listings" sub="Try another search or clear the filters." action="Clear filters" onAction={clearFilters} />
      );
    } else {
      const e = EMPTY[tab];
      empty = <EmptyBox icon={Package} title={e.title} sub={e.sub} action={e.add ? 'Add New Listing' : undefined} onAction={addNew} />;
    }
  }

  const footer = loadingMore ? (
    <ActivityIndicator color={C.teal} style={{ marginVertical: 16 }} />
  ) : moreError ? (
    <ErrorBox message={moreError} onRetry={() => loadMore(true)} style={{ marginBottom: 8 }} />
  ) : null;

  const typeLabel = TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label;
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label;

  return (
    <SellScreen
      title="My Listings"
      subtitle="Manage your device & part listings"
      onBack={() => navigation.goBack()}
      scroll={false}
      rightWidth={76}
      right={(
        <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => navigation.navigate('SellBuyOrders')}
          accessibilityRole="button"
          accessibilityLabel="Customer orders"
          hitSlop={6}
          className="active:opacity-70"
          style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}
        >
          <ShoppingBag size={17} color={C.teal} />
        </Pressable>
        <Pressable
          onPress={addNew}
          accessibilityRole="button"
          accessibilityLabel="Add new listing"
          hitSlop={6}
          className="active:opacity-70"
          style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}
        >
          <Plus size={18} color="#FFFFFF" />
        </Pressable>
        </View>
      )}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <SearchInput value={qInput} onChangeText={setQInput} placeholder="Search in my listings" style={{ flex: 1 }} />
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter and sort"
          className="active:opacity-70"
          style={{
            height: 44, width: 44, borderRadius: 12, borderWidth: 1, borderColor: filtersOn ? C.teal : C.border,
            backgroundColor: filtersOn ? C.mint : '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SlidersHorizontal size={18} color={C.teal} />
          {filtersOn ? <View style={{ position: 'absolute', top: 7, right: 7, height: 8, width: 8, borderRadius: 4, backgroundColor: C.green }} /> : null}
        </Pressable>
      </View>

      <TabPills tabs={tabs} value={tab} onChange={setTab} style={{ flexGrow: 0, marginTop: 12 }} />

      {filtersOn ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(11.5), color: C.muted }}>
            {[typeFilter !== 'ALL' ? typeLabel : null, sort !== 'NEWEST' ? sortLabel : null].filter(Boolean).join(' · ')}
          </Text>
          <Pressable onPress={() => { setTypeFilter('ALL'); setSort('NEWEST'); }} accessibilityRole="button" accessibilityLabel="Clear filters" hitSlop={8}>
            <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: C.teal }}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !rows.length ? (
        <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={display}
          keyExtractor={(x) => x.key}
          renderItem={renderItem}
          extraData={[busy, openGroups]}
          style={{ flex: 1, marginTop: 10 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 2, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          onEndReached={() => loadMore(false)}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[C.teal]} tintColor={C.teal} />}
          ListHeaderComponent={error && rows.length ? <ErrorBox message={error} onRetry={() => load('silent')} style={{ marginTop: 0, marginBottom: 10 }} /> : null}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
        />
      )}

      {/* ⋮ actions */}
      <Sheet visible={!!menuFor} title="Listing actions" onClose={() => setMenuFor(null)} onDismiss={runPending}>
        {menuShown ? (
          <>
            <SheetProduct p={menuShown} />
            {menuItems(menuShown).map((item) => <MenuRow key={item.key} item={item} />)}
          </>
        ) : null}
      </Sheet>

      {/* Update price */}
      <Sheet visible={!!priceFor} title="Update Price" onClose={() => setPriceFor(null)}>
        {priceShown ? (
          <>
            <SheetProduct p={priceShown} />
            <TextField
              label="Selling price"
              required
              prefix="₹"
              value={priceText}
              onChangeText={(t) => { setPriceText(cleanAmount(t)); setPriceError(null); }}
              placeholder="Enter price"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={submitPrice}
              autoFocus
              error={priceError}
              maxLength={10}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <PrimaryButton title="Cancel" variant="outline" onPress={() => setPriceFor(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Save Price" icon={Check} onPress={submitPrice} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </Sheet>

      {/* Mark sold (quantity > 1) */}
      <Sheet visible={!!soldFor} title="Mark as Sold" onClose={() => setSoldFor(null)}>
        {soldShown ? (
          <>
            <SheetProduct p={soldShown} />
            <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 }}>How many units did you sell?</Text>
            <QtyStepper value={soldQty} onChange={setSoldQty} min={1} max={Number(soldShown.quantity) || 1} />
            <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 6, lineHeight: rf(15) }}>
              {soldQty >= (Number(soldShown.quantity) || 1)
                ? 'All units sold: the listing moves to Sold.'
                : `${(Number(soldShown.quantity) || 1) - soldQty} unit(s) stay listed for buyers.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <PrimaryButton title="Cancel" variant="outline" onPress={() => setSoldFor(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Mark Sold" variant="green" icon={CircleCheck} onPress={submitSold} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </Sheet>

      {/* Filter & sort */}
      <Sheet visible={filterOpen} title="Filter & Sort" onClose={() => setFilterOpen(false)}>
        <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text, marginTop: 8, marginBottom: 8 }}>Listing type</Text>
        <Segmented options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
        <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text, marginTop: 18 }}>Sort by</Text>
        {SORT_OPTIONS.map((o) => (
          <ChoiceCard key={o.value} radio title={o.label} selected={sort === o.value} onPress={() => setSort(o.value)} />
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <PrimaryButton title="Reset" variant="outline" onPress={() => { setTypeFilter('ALL'); setSort('NEWEST'); }} disabled={!filtersOn} style={{ flex: 1 }} />
          <PrimaryButton title="Show Results" onPress={() => setFilterOpen(false)} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </SellScreen>
  );
}
