import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CircleCheck,
  ClipboardList,
  History,
  Package,
  PackageCheck,
  TriangleAlert,
  Truck,
  UserCheck,
  Wrench,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { SearchBar } from '../../components/rnr/SearchBar';
import {
  RC,
  ReportHeader,
  ReportHeaderButton,
  StatusRail,
  reportStyles,
  useReportGeometry,
} from '../../components/report/ReportRail';
import {
  BookingListState,
  BookingTile,
  TILE_META,
  byNewest,
  fetchStatusTickets,
  openTicketInvoice,
  ticketMatches,
  withGhost,
} from './BookingStatusReportScreen';

// Status tile config. `statusList` maps to the canonical backend status values
// queried via /tickets?status=; an empty statusList means "every status",
// fetched as one unfiltered page (same requests as BookingStatusReportScreen).
// The tiles are the left rail here; the list on the right is the selected
// tile's bookings. `tone` / `railLabel` are this screen's look only; `reportBg`
// is the unchanged `bg` param handed to BookingStatusReport.
const REPORT_BG_BRAND = '#035C6C';

const TOTAL_TILE = {
  key: 'TOTAL_BOOKING',
  label: 'Total Booking',
  statusList: [],                 // no status filter — the whole book
  countKey: 'total',
  icon: ClipboardList,
  tone: TILE_META.TOTAL_BOOKING.tone,
  reportBg: REPORT_BG_BRAND,
};

const TILES = [
  { key: 'TOTAL_PROCESSED',  label: 'Total Processed',  statusList: ['READY'],                    countKey: 'READY',                icon: CircleCheck,  tone: TILE_META.TOTAL_PROCESSED.tone,  reportBg: REPORT_BG_BRAND },
  { key: 'TOTAL_DELIVERED',  label: 'Total Delivered',  statusList: ['DELIVERED'],                countKey: 'DELIVERED',            icon: PackageCheck, tone: TILE_META.TOTAL_DELIVERED.tone,  reportBg: REPORT_BG_BRAND },
  { key: 'OUT_FOR_DELIVERY', label: 'Dispatched', statusList: ['DELIVERED_PROCESSING'],     countKey: 'DELIVERED_PROCESSING', icon: Truck,        tone: TILE_META.OUT_FOR_DELIVERY.tone, reportBg: REPORT_BG_BRAND },
  { key: 'TOTAL_INPROCESS',  label: 'Total In Process', statusList: ['IN_DIAGNOSIS', 'IN_REPAIR'],                                   icon: Wrench,       tone: TILE_META.TOTAL_INPROCESS.tone,  reportBg: REPORT_BG_BRAND },
];

// Working Pending is the one bucket that isn't a single status: a booking stalls
// either because the shop is waiting on a part (APPROVED — customer said go,
// repair hasn't started) or because the customer hasn't answered the quote yet
// (QUOTED). The rail shows the stalled total, then each half.
const WORK_PENDING_TILE = {
  key: 'WORK_PENDING',
  label: 'Working Pending',
  statusList: ['APPROVED', 'QUOTED'],
  icon: TriangleAlert,
  tone: TILE_META.WORK_PENDING.tone,
  reportBg: '#DC2626', // unchanged from the old C.red this tile used for the drill-down tint
  breakdown: [
    { key: 'SPARE_PARTS_PENDING',       label: 'Spare parts pending',       railLabel: 'Parts Pending',    statusList: ['APPROVED'], countKey: 'APPROVED', icon: Package,   tone: TILE_META.SPARE_PARTS_PENDING.tone,       reportBg: '#F59E0B' },
    { key: 'CUSTOMER_APPROVAL_PENDING', label: 'Customer approval pending', railLabel: 'Approval Pending', statusList: ['QUOTED'],   countKey: 'QUOTED',   icon: UserCheck, tone: TILE_META.CUSTOMER_APPROVAL_PENDING.tone, reportBg: REPORT_BG_BRAND },
  ],
};

// Every bucket the screen can show, in rail order.
const ALL_TILES = [TOTAL_TILE, ...TILES, WORK_PENDING_TILE, ...WORK_PENDING_TILE.breakdown];

function sumKeys(counts, keys) {
  return (keys || []).reduce((acc, k) => acc + Number(counts?.[k] || 0), 0);
}

export default function BookingStatusScreen({ navigation }) {
  const { isSmall, railW, numCols, capW, bottomPad } = useReportGeometry();

  const [counts, setCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState(null);
  const [activeKey, setActiveKey] = useState(TOTAL_TILE.key);
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const activeTile = STATUS_TILE_META[activeKey] || TOTAL_TILE;

  const loadCounts = useCallback(async () => {
    setCountsError(null);
    try {
      const data = await ticketApi.get('/tickets/counts');
      setCounts(data || {});
    } catch (e) {
      setCountsError(e.message || 'Failed to load counts');
      setCounts({});
    } finally {
      setCountsLoading(false);
    }
  }, []);

  // Only the latest request may write, so a quick rail switch can't be
  // overwritten by the previous tile's slower response.
  const reqId = useRef(0);
  const loadList = useCallback(async (tile, silent = false) => {
    const id = ++reqId.current;
    if (!silent) setListLoading(true);
    setListError(null);
    try {
      const list = await fetchStatusTickets(tile.statusList);
      if (id === reqId.current) setRows([...list].sort(byNewest));
    } catch (e) {
      if (id === reqId.current) { setListError(e.message || 'Failed to load bookings'); setRows([]); }
    } finally {
      if (id === reqId.current) setListLoading(false);
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => { loadList(activeTile); }, [activeTile, loadList]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCounts(), loadList(activeTile, true)]);
    setRefreshing(false);
  }, [loadCounts, loadList, activeTile]);

  // A tile with an explicit countKey (one backend status) and one spanning
  // several statuses read the same way.
  const countFor = useCallback(
    (tile) => (tile.countKey ? Number(counts?.[tile.countKey] || 0) : sumKeys(counts, tile.statusList)),
    [counts],
  );

  const railItems = useMemo(() => ALL_TILES.map((t) => ({
    key: t.key,
    label: t.railLabel || t.label,
    tone: t.tone,
    Icon: t.icon,
    count: countsLoading ? null : countFor(t),
  })), [countFor, countsLoading]);

  // Full report for the selected tile (adds the period filter).
  const openReport = useCallback(
    (tile) => navigation.navigate('BookingStatusReport', {
      statusKey: tile.key,
      label: tile.label,
      statusList: tile.statusList,
      bg: tile.reportBg || RC.teal,
      icon: tile.key,
    }),
    [navigation],
  );

  const toggleSearch = () => {
    if (searchOpen) setQuery('');
    setSearchOpen((v) => !v);
  };

  const shown = useMemo(() => rows.filter((t) => ticketMatches(t, query)), [rows, query]);
  const n = shown.length;
  const data = listLoading || listError ? [] : withGhost(shown, numCols);

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return (
      <BookingTile
        ticket={item}
        row={numCols === 1}
        onPress={() => navigation.navigate('TicketDetail', { ticketId: item.id })}
        onHistory={() => navigation.navigate('BookingTimeline', { ticketId: item.id })}
        onInvoice={() => openTicketInvoice(navigation, item)}
      />
    );
  };

  return (
    <View style={reportStyles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ReportHeader
        title="Service Status"
        subtitle={activeTile.key === TOTAL_TILE.key ? 'All bookings' : activeTile.label}
        onBack={() => navigation.goBack()}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        right={(
          <ReportHeaderButton
            Icon={History}
            label="Previous reports"
            onPress={() => navigation.navigate('BookingPreviousReport')}
          />
        )}
      />

      {searchOpen || query ? (
        <View style={s.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search ticket, customer, phone, model"
            onClear={() => setQuery('')}
            autoFocus
          />
        </View>
      ) : null}

      <View style={reportStyles.body}>
        <StatusRail items={railItems} active={activeKey} onSelect={setActiveKey} width={railW} isSmall={isSmall} bottomPad={bottomPad} />
        <View style={{ flex: 1 }}>
          <FlatList
            data={data}
            key={numCols}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? { gap: 12 } : undefined}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RC.teal} colors={[RC.teal]} />}
            contentContainerStyle={{ ...reportStyles.listPad, paddingBottom: bottomPad, ...capW }}
            ListHeaderComponent={(
              <View>
                {countsError ? (
                  <View style={s.errorBanner}>
                    <Text style={s.errorText} numberOfLines={2}>{countsError}</Text>
                  </View>
                ) : null}
                <View style={s.summaryRow}>
                  <Text style={s.summary} numberOfLines={1}>
                    {activeTile.label}
                    {listLoading || listError ? null : (
                      <Text style={s.summaryMuted}>  ·  {n} {n === 1 ? 'booking' : 'bookings'}</Text>
                    )}
                  </Text>
                  <TouchableOpacity
                    onPress={() => openReport(activeTile)}
                    hitSlop={6}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${activeTile.label} report by period`}
                    style={s.periodPill}
                  >
                    <Calendar size={12} color={RC.teal} />
                    <Text style={s.periodText} numberOfLines={1}>By period</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={(
              <BookingListState
                loading={listLoading}
                error={listError}
                onRetry={() => loadList(activeTile)}
                emptyText={query.trim() ? `No bookings match "${query.trim()}".` : `No "${activeTile.label}" bookings.`}
                Icon={activeTile.icon}
                tone={activeTile.tone}
              />
            )}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },
  errorBanner: { marginBottom: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FEECEC' },
  errorText: { fontSize: 12, color: '#D63232' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  summary: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '800', color: RC.ink },
  summaryMuted: { fontSize: 12, fontWeight: '600', color: RC.muted },
  periodPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: RC.tint },
  periodText: { fontSize: 11, fontWeight: '800', color: RC.teal },
});

export const STATUS_TILE_META = ALL_TILES.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});
