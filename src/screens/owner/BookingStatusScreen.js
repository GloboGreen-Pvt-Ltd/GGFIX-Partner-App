import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Wrench,
  CheckCircle2,
  Truck,
  AlertTriangle,
  PackageCheck,
  Package,
  UserCheck,
  History,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { Loader } from '../../components/rnr';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette.
const GREEN = '#09AD2A';
const GREEN_DEEP = '#078F23';
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const HAIR = '#F3F3F3';
const BORDER = '#E6E6E6';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const SUBTLE = '#8A8A8A';
const RED = '#F84141';
const RED_TINT = '#FEECEC';
const RED_TEXT = '#D63232';
const YELLOW_TINT = '#FFF8E1';
const YELLOW_TEXT = '#8A6A00';

const cardShadow = {
  shadowColor: INK,
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

// Status tile config. `statusList` maps to the canonical backend status values
// used to query /tickets?status= on the report screen; an empty statusList means
// "every status", which the report screen fetches as one unfiltered page.
//
// 'Total Booking' leads as a prominent green card — it's the parent number the
// rest break down, and it replaced the old TOTAL/ACTIVE/DELIVERED KPI strip that
// showed the same figures a second time.
// `reportBg` — the tint handed to BookingStatusReportScreen's `bg` param —
// is kept at its exact pre-redesign value (every one of these tiles used the
// iOS theme's C.blue/green/teal/cyan/indigo, which all resolve to the same
// '#16BB05') even though the tile itself no longer shows that colour here;
// this screen's own colours are a separate, purely visual change.
const REPORT_BG_BRAND = '#16BB05';

const TOTAL_TILE = {
  key: 'TOTAL_BOOKING',
  label: 'Total Booking',
  statusList: [],                 // no status filter — the whole book
  countKey: 'total',
  icon: ClipboardList,
  reportBg: REPORT_BG_BRAND,
};

const TILES = [
  { key: 'TOTAL_PROCESSED',  label: 'Total Processed',  statusList: ['READY'],                    countKey: 'READY',                icon: CheckCircle2, reportBg: REPORT_BG_BRAND },
  { key: 'TOTAL_DELIVERED',  label: 'Total Delivered',  statusList: ['DELIVERED'],                countKey: 'DELIVERED',            icon: PackageCheck, reportBg: REPORT_BG_BRAND },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', statusList: ['DELIVERED_PROCESSING'],     countKey: 'DELIVERED_PROCESSING', icon: Truck,        reportBg: REPORT_BG_BRAND },
  { key: 'TOTAL_INPROCESS',  label: 'Total In Process', statusList: ['IN_DIAGNOSIS', 'IN_REPAIR'],                                   icon: Wrench,       reportBg: REPORT_BG_BRAND },
];

// Working Pending is the one bucket that isn't a single status: a booking stalls
// either because the shop is waiting on a part (APPROVED — customer said go,
// repair hasn't started) or because the customer hasn't answered the quote yet
// (QUOTED). Both live in one grouped card so the owner sees the stalled total
// first and can then open whichever half is blocking them.
// `tint` / `ink` are this screen's icon-well colours (GGFIX red / yellow /
// green); `reportBg` is the unchanged drill-down tint.
const WORK_PENDING_TILE = {
  key: 'WORK_PENDING',
  label: 'Working Pending',
  statusList: ['APPROVED', 'QUOTED'],
  icon: AlertTriangle,
  color: RED,
  tint: RED_TINT,
  ink: RED_TEXT,
  reportBg: '#DC2626', // unchanged from the old C.red this tile used for the drill-down tint
  breakdown: [
    { key: 'SPARE_PARTS_PENDING',       label: 'Spare parts pending',       statusList: ['APPROVED'], countKey: 'APPROVED', icon: Package,   tint: YELLOW_TINT, ink: YELLOW_TEXT, reportBg: '#F59E0B' },
    { key: 'CUSTOMER_APPROVAL_PENDING', label: 'Customer approval pending', statusList: ['QUOTED'],   countKey: 'QUOTED',   icon: UserCheck, tint: MINT,        ink: GREEN_DEEP,  reportBg: REPORT_BG_BRAND },
  ],
};

// Every bucket the screen can drill into — feeds the header's count.
const ALL_TILES = [TOTAL_TILE, ...TILES, WORK_PENDING_TILE, ...WORK_PENDING_TILE.breakdown];

function sumKeys(counts, keys) {
  return (keys || []).reduce((acc, k) => acc + Number(counts?.[k] || 0), 0);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function BookingStatusScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), 900), alignSelf: 'center' } : null;

  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get('/tickets/counts');
      setCounts(data || {});
    } catch (e) {
      setError(e.message || 'Failed to load counts');
      setCounts({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // One place that turns a tile config into its number, so a tile with an
  // explicit countKey (a single backend status) and one that spans several
  // statuses read the same way at the call site.
  const countFor = useCallback(
    (tile) => (tile.countKey ? Number(counts?.[tile.countKey] || 0) : sumKeys(counts, tile.statusList)),
    [counts],
  );

  const openReport = useCallback(
    (tile) => navigation.navigate('BookingStatusReport', {
      statusKey: tile.key,
      label: tile.label,
      statusList: tile.statusList,
      bg: tile.reportBg || tile.color || GREEN,
      icon: tile.key,
    }),
    [navigation],
  );

  if (loading) return <Loader label="Loading status..." />;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header — white bar, title 17/800 + subtitle 11. */}
      <View
        style={{
          backgroundColor: CARD_BG, paddingHorizontal: 14, paddingTop: insets.top + 8, paddingBottom: 10,
          borderBottomWidth: 1, borderBottomColor: BORDER,
        }}
      >
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{
              height: 36, width: 36, borderRadius: 18, marginRight: 10,
              alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG,
              borderWidth: 1, borderColor: BORDER,
            }}
          >
            <ChevronLeft size={19} color={INK} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-extrabold" style={{ fontSize: 17, color: INK }} numberOfLines={1}>
              Booking Status
            </Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              All time · {ALL_TILES.length} statuses
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('BookingPreviousReport')}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 999,
              paddingHorizontal: 11, paddingVertical: 7, backgroundColor: MINT, borderWidth: 1, borderColor: MINT_LINE,
            }}
          >
            <History size={13} color={GREEN_DEEP} />
            <Text className="font-extrabold" style={{ marginLeft: 5, fontSize: 11, color: GREEN_DEEP }}>
              Previous
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} colors={[GREEN]} />
        }
      >
        <View style={capStyle}>
          {/* Previous Reports */}
          <TouchableOpacity
            onPress={() => navigation.navigate('BookingPreviousReport')}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={{
              flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14,
              paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: HAIR, ...cardShadow,
            }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <History size={16} color={GREEN} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-extrabold" style={{ fontSize: 13, color: INK }} numberOfLines={1}>
                Previous Reports
              </Text>
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
                Month-by-month status snapshots
              </Text>
            </View>
            <ChevronRight size={16} color={SUBTLE} />
          </TouchableOpacity>

          {error ? (
            <View style={{ marginTop: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: RED_TINT }}>
              <Text style={{ fontSize: 12, color: RED_TEXT }}>{error}</Text>
            </View>
          ) : null}

          {/* Section header */}
          <SectionHeader title="Booking status" subtitle="Tap a card to see its bookings" />

          {/* Total Booking card */}
          <TouchableOpacity
            onPress={() => openReport(TOTAL_TILE)}
            activeOpacity={0.9}
            accessibilityRole="button"
            style={{ borderRadius: 14, overflow: 'hidden', shadowColor: GREEN, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}
          >
            <LinearGradient
              colors={[GREEN, GREEN_DEEP]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <View
                style={{
                  width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center', justifyContent: 'center', marginRight: 10,
                }}
              >
                <ClipboardList size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-extrabold" style={{ fontSize: 13, color: '#FFFFFF' }} numberOfLines={1}>
                  {TOTAL_TILE.label}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={1}>
                  Every booking in the shop
                </Text>
              </View>
              <Text className="font-extrabold" style={{ fontSize: 20, color: '#FFFFFF', marginLeft: 8 }} numberOfLines={1}>
                {pad2(countFor(TOTAL_TILE))}
              </Text>
              <ChevronRight size={16} color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }} />
            </LinearGradient>
          </TouchableOpacity>

          {/* 2x2 metric grid — compact horizontal cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {TILES.map((t) => (
              <MetricCard
                key={t.key}
                icon={t.icon}
                label={t.label}
                value={pad2(countFor(t))}
                onPress={() => openReport(t)}
              />
            ))}
          </View>

          {/* Working Pending */}
          <SectionHeader title={WORK_PENDING_TILE.label} subtitle="Waiting on a part or on the customer" />

          <View style={{ backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: HAIR, overflow: 'hidden', ...cardShadow }}>
            <PendingRow
              icon={AlertTriangle}
              tint={WORK_PENDING_TILE.tint}
              ink={WORK_PENDING_TILE.ink}
              label="Stalled bookings"
              value={pad2(countFor(WORK_PENDING_TILE))}
              onPress={() => openReport(WORK_PENDING_TILE)}
            />
            {WORK_PENDING_TILE.breakdown.map((b, i) => (
              <PendingRow
                key={b.key}
                icon={b.icon}
                tint={b.tint}
                ink={b.ink}
                label={`${i + 1}. ${b.label}`}
                value={pad2(countFor(b))}
                onPress={() => openReport(b)}
                last={i === WORK_PENDING_TILE.breakdown.length - 1}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={{ marginTop: 16, marginBottom: 8 }}>
      <Text className="font-extrabold" style={{ fontSize: 15, color: INK }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
    </View>
  );
}

// One of the 2x2 metric cards — small mint icon well beside the count and
// label (colour-coding lives on the Working Pending rows below, not here).
function MetricCard({ icon: Icon, label, value, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexGrow: 1, flexBasis: '45%',
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: CARD_BG, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9,
        borderWidth: 1, borderColor: HAIR, ...cardShadow,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 9 }}>
        <Icon size={16} color={GREEN} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-extrabold" style={{ fontSize: 17, color: INK }} numberOfLines={1}>{value}</Text>
        <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

// One row of the Working Pending card — tinted icon well, label, bold count,
// chevron, with a divider under every row except the last.
function PendingRow({ icon: Icon, tint, ink, label, value, onPress, last }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: HAIR,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        <Icon size={16} color={ink} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, color: INK }} numberOfLines={1}>
        {label}
      </Text>
      <Text className="font-extrabold" style={{ fontSize: 15, color: INK, marginRight: 4 }}>
        {value}
      </Text>
      <ChevronRight size={15} color={SUBTLE} />
    </TouchableOpacity>
  );
}

export const STATUS_TILE_META = ALL_TILES.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});
