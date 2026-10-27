import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import {
  Bike,
  CalendarClock,
  ChartColumn,
  CircleCheck,
  Clock,
  MapPin,
  RefreshCw,
  Truck,
  WifiOff,
} from 'lucide-react-native';
import { listShopRepairBookings } from '../../api/orders';
import { getModelsByBrand } from '../../api/masterData';
import { SearchBar } from '../../components/rnr/SearchBar';
import { resolveDeviceImageSource } from '../../utils/images';
import {
  RC,
  useReportGeometry,
  ReportHeader,
  ReportHeaderButton,
  StatusRail,
  MonthBar,
  ReportTile,
  TileDisc,
  tileText,
  ReportEmpty,
  reportStyles,
} from '../../components/report/ReportRail';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Bucket pickup statuses for an at-a-glance summary.
// Buckets:
//   ASSIGNED   — assigned to this pickup person, not yet picked up
//   IN_PROGRESS — picked up, in transit / at shop processing
//   COMPLETED  — pickup delivered + repair flow finished
function bucketize(status) {
  const s = (status || '').toUpperCase();
  if (
    s === 'PICKUP_COMPLETED'
    || s === 'DELIVERED'
    || s === 'COMPLETED'
    || s === 'CLOSED'
    || s.includes('REPAIR_COMPLETED')
  ) return 'COMPLETED';
  if (
    s === 'PICKED_UP'
    || s === 'DEVICE_PICKED_UP'
    || s === 'REPAIR_ESTIMATE_PROCESSING'
    || s === 'REACHED_SHOP'
    || s === 'RECEIVED_AT_SHOP'
    || s === 'IN_TRANSIT'
    || s === 'AT_SHOP'
    || s === 'IN_SERVICE'
    || s === 'PICKUP_IN_PROGRESS'
    || s.includes('STARTED')
    || s.includes('IN_PROCESS')
  ) return 'IN_PROGRESS';
  return 'ASSIGNED';
}

// Left rail — the old filter chips (same keys / buckets), with the old stat
// cards folded in as counts.
const RAIL = [
  { key: 'All', stat: 'total', label: 'All', tone: RC.teal, Icon: ChartColumn },
  { key: 'Assigned', stat: 'assigned', label: 'Assigned', tone: RC.blue, Icon: CalendarClock },
  { key: 'In Progress', stat: 'inProgress', label: 'In Progress', tone: RC.orange, Icon: Truck },
  { key: 'Completed', stat: 'completed', label: 'Completed', tone: RC.green, Icon: CircleCheck },
];

// Bucket → tile tag + the old card's step line.
const BUCKET_META = {
  ASSIGNED: { label: 'Assigned', tone: RC.blue, step: 'Pickup Scheduled — awaiting collection' },
  IN_PROGRESS: { label: 'In Progress', tone: RC.orange, step: 'In Transit — heading to shop' },
  COMPLETED: { label: 'Completed', tone: RC.green, step: 'Pickup Completed — delivered to shop' },
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function trackingId(b) {
  return b.bookingNumber || b.trackingId || b.ticketCode || `CSPEN${String(b.id || '').replace(/[^0-9]/g, '').slice(0, 8) || '--'}`;
}

// Build a short address line: 1st 30 chars of the pickup address or fallback.
function addressLine(b) {
  return b.pickupAddressText || b.pickupAddressLabel || b.address || '—';
}

function customerLine(b) {
  const name = b.customerName || '—';
  const mobile = b.customerMobile ? ` • ${b.customerMobile}` : '';
  return `${name}${mobile}`;
}

function personName(b) {
  return String(b.pickupPersonName || '').trim() || 'Unassigned';
}

const pickupTime = (b) => new Date(b.pickupDate || b.updatedAt || b.createdAt || 0).getTime();
const byPickupRecent = (a, b) => pickupTime(b) - pickupTime(a);

// Model name only — no model number / RAM / storage / colour.
function deviceLabel(b, model) {
  const raw = model?.name || b.deviceDisplayName || b.deviceModelName || b.modelName || '';
  return String(raw).split(/[·•|]/)[0].trim();
}

// brandId → Promise<models[]>, shared so each brand's catalogue is fetched once.
const modelsByBrand = new Map();
function modelsFor(brandId) {
  if (!modelsByBrand.has(brandId)) {
    modelsByBrand.set(brandId, getModelsByBrand(brandId).catch(() => {
      modelsByBrand.delete(brandId);
      return [];
    }));
  }
  return modelsByBrand.get(brandId);
}

export default function OwnerEmployeePickupReportScreen({ route, navigation }) {
  const { isSmall, railW, numCols, capW, bottomPad } = useReportGeometry();
  const employee = route.params?.employee;
  // No `employee` param = ALL-PICKUP-PERSON mode, for the dashboard's "Pickup
  // Report" tile. With a param it stays one person's report, as before.
  const allMode = !employee?.id;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  // Search bar is hidden until the header's Search icon opens it.
  const [searchOpen, setSearchOpen] = useState(false);
  // modelId → { name, image } from the brand catalogue (the shop endpoint
  // returns brand/model ids only).
  const [modelById, setModelById] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const all = await listShopRepairBookings();
      setList(Array.isArray(all) ? all : []);
      setError(false);
    } catch {
      setList([]);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Filter to bookings where THIS employee is the assigned pickup person.
  // Uses the proper UUID column on repair_bookings (no name fallback needed,
  // unlike the technician-side filter — assignedPickupPersonId is reliable).
  const mineAll = useMemo(() => {
    // Every booking with a pickup person on it. Unlike the technician side
    // this one is exact — `assignedPickupPersonId` is a real column.
    if (allMode) return list.filter((b) => !!b.assignedPickupPersonId);
    if (!employee?.id) return [];
    return list.filter((b) => b.assignedPickupPersonId === employee.id);
  }, [list, employee?.id]);

  // Scope to the picked month so the counts reflect "this month's pickups".
  const mine = useMemo(() => {
    return mineAll.filter((b) => {
      const t = b.pickupDate || b.updatedAt || b.createdAt;
      if (!t) return true;
      const d = new Date(t);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [mineAll, year, month]);

  const counts = useMemo(() => {
    let assigned = 0, inProgress = 0, completed = 0;
    mine.forEach((b) => {
      const bk = bucketize(b.status);
      if (bk === 'ASSIGNED') assigned += 1;
      else if (bk === 'COMPLETED') completed += 1;
      else inProgress += 1;
    });
    return { assigned, inProgress, completed, total: mine.length };
  }, [mine]);

  // Device names + catalogue images for the loaded bookings, one fetch per brand.
  const modelKey = useMemo(() => [...new Set(
    mineAll.filter((b) => b.brandId && b.modelId).map((b) => `${b.brandId}::${b.modelId}`),
  )].sort().join('|'), [mineAll]);
  useEffect(() => {
    const pairs = modelKey ? modelKey.split('|').map((p) => p.split('::')) : [];
    if (pairs.length === 0) return undefined;
    let alive = true;
    const brands = [...new Set(pairs.map(([brand]) => brand))];
    const wanted = new Set(pairs.map(([, model]) => model));
    Promise.all(brands.map((id) => modelsFor(id))).then((lists) => {
      if (!alive) return;
      const next = {};
      lists.forEach((models) => (Array.isArray(models) ? models : []).forEach((m) => {
        const id = String(m?.id ?? '');
        if (!wanted.has(id)) return;
        next[id] = { name: m.name, image: resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 }) };
      }));
      setModelById(next);
    });
    return () => { alive = false; };
  }, [modelKey]);

  const modelOf = (b) => (b.modelId != null ? modelById[String(b.modelId)] : null);

  const filterByBucket = (arr) => arr.filter((b) => {
    const bk = bucketize(b.status);
    if (filter === 'All') return true;
    if (filter === 'Completed') return bk === 'COMPLETED';
    if (filter === 'In Progress') return bk === 'IN_PROGRESS';
    if (filter === 'Assigned') return bk === 'ASSIGNED';
    return false;
  });

  // Search looks across every month of the loaded pickups by pickup id,
  // customer, device or pickup person; the rail filter still applies.
  const q = query.trim().toLowerCase();
  const shown = q
    ? filterByBucket([...mineAll].sort(byPickupRecent)).filter((b) => [
      trackingId(b), b.customerName, b.customerMobile, deviceLabel(b, modelOf(b)), b.pickupPersonName,
    ].some((v) => v && String(v).toLowerCase().includes(q)))
    : filterByBucket([...mine].sort(byPickupRecent));

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const openBooking = (b) => {
    navigation.navigate('OwnerPickupServiceDetail', { id: b.id, booking: b });
  };

  const railItems = RAIL.map((it) => ({ ...it, count: counts[it.stat] }));
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && shown.length % 2 === 1 ? [...shown, { id: '__ghost__', _ghost: true }] : shown;

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return (
      <PickupTile
        booking={item}
        model={modelOf(item)}
        row={numCols === 1}
        showAssignee={allMode}
        onPress={() => openBooking(item)}
      />
    );
  };

  const emptyNode = showInitialSpinner ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={RC.teal} />
      <Text style={styles.stateText}>Loading pickups…</Text>
    </View>
  ) : showError ? (
    <View style={[styles.stateCard, styles.stateBox]}>
      <View style={[styles.stateIcon, { backgroundColor: RC.red }]}>
        <WifiOff size={20} color={RC.white} />
      </View>
      <Text style={styles.stateTitle}>Couldn't load pickups</Text>
      <Text style={styles.stateText}>Check your connection and try again.</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <ReportEmpty
      Icon={Truck}
      text={q ? `No pickups match "${query.trim()}".` : filter === 'All' ? 'No pickups this month.' : `No ${filter.toLowerCase()} pickups this month.`}
    />
  );

  return (
    <View style={reportStyles.screen}>
      <ReportHeader
        title={allMode ? 'Pickup Report' : 'Pickup Record'}
        subtitle={allMode ? 'All pickup persons' : (employee?.name || 'Pickup person')}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        searchOpen={searchOpen}
        onToggleSearch={() => { if (searchOpen) setQuery(''); setSearchOpen((v) => !v); }}
        right={(
          <ReportHeaderButton
            Icon={RefreshCw}
            label="Refresh pickups"
            onPress={() => { if (!refreshing) load(true); }}
          />
        )}
      />

      {searchOpen || query ? (
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={allMode ? 'Search pickup, customer, device, person' : 'Search pickup, customer, device'}
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      <View style={reportStyles.body}>
        <StatusRail
          items={railItems}
          active={filter}
          onSelect={setFilter}
          width={railW}
          isSmall={isSmall}
          bottomPad={bottomPad}
        />

        <View style={{ flex: 1 }}>
          <MonthBar
            label={`${MONTHS[month - 1]} ${year}`}
            sub={q ? `${shown.length} found · all months` : `${shown.length} ${shown.length === 1 ? 'pickup' : 'pickups'}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            capW={capW}
          />

          <FlatList
            data={listData}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[RC.teal]} tintColor={RC.teal} />}
            contentContainerStyle={[reportStyles.listPad, { paddingBottom: bottomPad }, capW]}
            ListEmptyComponent={emptyNode}
          />
        </View>
      </View>
    </View>
  );
}

// Catalogue / booking device image; else a white truck on a teal disc.
function PickupPanel({ uri, row }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (uri && !failed) {
    return <Image source={{ uri }} style={{ width: '76%', height: '76%' }} resizeMode="contain" onError={() => setFailed(true)} />;
  }
  return <TileDisc Icon={Truck} tone={RC.teal} row={row} />;
}

// Jobs-style tile: ref, device (or customer), customer, address, pickup
// person (all-persons view), date · time and the pickup step.
function PickupTile({ booking, model, row, showAssignee, onPress }) {
  const bk = bucketize(booking.status);
  const meta = BUCKET_META[bk] || BUCKET_META.ASSIGNED;
  const device = deviceLabel(booking, model);
  const uri = resolveDeviceImageSource({
    url: booking.deviceImageUrl || booking.modelImageUrl,
    base64: booking.deviceImageBase64 || booking.modelImageBase64,
  }) || model?.image || null;
  const slot = booking.pickupSlotStart && booking.pickupSlotEnd
    ? `${String(booking.pickupSlotStart).slice(0, 5)} – ${String(booking.pickupSlotEnd).slice(0, 5)}`
    : null;
  const when = bk === 'ASSIGNED' ? (booking.pickupDate || booking.createdAt) : (booking.updatedAt || booking.createdAt);
  const time = bk === 'ASSIGNED' ? (slot || '') : timeOf(when);
  const ref = `#${trackingId(booking)}`;
  const title = device || booking.customerName || 'Pickup';
  const sub = device ? customerLine(booking) : (booking.customerMobile || null);
  return (
    <ReportTile
      row={row}
      panel={<PickupPanel uri={uri} row={row} />}
      tag={meta.label}
      tagColor={meta.tone}
      onPress={onPress}
      accessibilityLabel={`${title}, ${ref}, ${meta.label}`}
    >
      <Text style={tileText.ref} numberOfLines={1}>{ref}</Text>
      <Text style={tileText.title} numberOfLines={2}>{title}</Text>
      {sub ? <Text style={tileText.sub} numberOfLines={1}>{sub}</Text> : null}
      <View style={tileText.infoRow}>
        <MapPin size={11} color={RC.muted} />
        <Text style={tileText.info} numberOfLines={1}>{addressLine(booking)}</Text>
      </View>
      {showAssignee ? (
        <View style={tileText.infoRow}>
          <Bike size={11} color={RC.teal} />
          <Text style={[tileText.info, styles.assignee]} numberOfLines={1}>{personName(booking)}</Text>
        </View>
      ) : null}
      <View style={tileText.dateRow}>
        <Text style={[tileText.date, styles.shrink]} numberOfLines={1}>{formatDate(when)}</Text>
        {time ? <Text style={[tileText.date, styles.time]} numberOfLines={1}>{time}</Text> : null}
      </View>
      <View style={tileText.chip}>
        <Clock size={11} color={RC.teal} />
        <Text style={tileText.chipText} numberOfLines={1}>{meta.step}</Text>
      </View>
    </ReportTile>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },

  assignee: { color: RC.teal, fontWeight: '700' },
  shrink: { flexShrink: 1 },
  time: { marginLeft: 6, flexShrink: 1 },

  stateCard: { backgroundColor: RC.white, borderRadius: 16, borderWidth: 1, borderColor: RC.line },
  stateBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 12, gap: 6 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 14, fontWeight: '800', color: RC.ink },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },
  retryBtn: { marginTop: 6, backgroundColor: RC.teal, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { color: RC.white, fontWeight: '700', fontSize: 12 },
});
