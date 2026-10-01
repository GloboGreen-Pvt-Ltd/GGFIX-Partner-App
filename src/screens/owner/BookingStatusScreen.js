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
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';
const PRIMARY = '#006B57';
const BRIGHT = '#00A86B';
const MINT = '#E8F7F2';
const SOFT_MINT = '#F4FBF8';
const PAGE_BG = '#F8FCFA';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#667085';
const WARNING_RED = '#FF3B5C';
const WARNING_ORANGE = '#FF9F1A';
const SUCCESS_GREEN = '#16A34A';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

// Status tile config. `statusList` maps to the canonical backend status values
// used to query /tickets?status= on the report screen; an empty statusList means
// "every status", which the report screen fetches as one unfiltered page.
//
// 'Total Booking' leads as a prominent tinted card — it's the parent number the
// rest break down, and it replaced the old TOTAL/ACTIVE/DELIVERED KPI strip that
// showed the same figures a second time.
// `reportBg` — the tint handed to BookingStatusReportScreen's `bg` param —
// is kept at its exact pre-redesign value (every one of these tiles used the
// iOS theme's C.blue/green/teal/cyan/indigo, which all resolve to the same
// '#16BB05') even though the tile itself no longer shows that colour here;
// this screen's own icon-tile colour is a separate, purely visual change.
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
const WORK_PENDING_TILE = {
  key: 'WORK_PENDING',
  label: 'Working Pending',
  statusList: ['APPROVED', 'QUOTED'],
  icon: AlertTriangle,
  color: WARNING_RED,
  reportBg: '#DC2626', // unchanged from the old C.red this tile used for the drill-down tint
  breakdown: [
    { key: 'SPARE_PARTS_PENDING',       label: 'Spare parts pending',       statusList: ['APPROVED'], countKey: 'APPROVED', icon: Package,   color: WARNING_ORANGE, reportBg: '#F59E0B' },
    { key: 'CUSTOMER_APPROVAL_PENDING', label: 'Customer approval pending', statusList: ['QUOTED'],   countKey: 'QUOTED',   icon: UserCheck, color: SUCCESS_GREEN,  reportBg: REPORT_BG_BRAND },
  ],
};

// Every bucket the screen can drill into — feeds the section header's count.
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
      bg: tile.reportBg || tile.color || ACCENT,
      icon: tile.key,
    }),
    [navigation],
  );

  if (loading) return <Loader label="Loading status..." />;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      {/* Header — decorative mint leaf shapes behind the title block, same
          low-risk plain-View approximation used elsewhere in this app. */}
      <View style={{ paddingHorizontal: rs(16), paddingTop: insets.top + rs(8), paddingBottom: rs(14), overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: -rs(30), right: -rs(20), height: rs(140), width: rs(140), borderRadius: rs(70), backgroundColor: MINT, opacity: 0.6 }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: rs(30), right: rs(40), height: rs(70), width: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT, opacity: 0.8 }} />

        <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={6}
            style={{
              height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(10),
              alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
              borderWidth: 1, borderColor: BORDER,
            }}
          >
            <ChevronLeft size={rf(19)} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <Text className="font-extrabold flex-1" style={{ fontSize: 20, color: TEXT_PRIMARY }} numberOfLines={1}>
            Booking Status
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('BookingPreviousReport')}
            activeOpacity={0.8}
            className="flex-row items-center rounded-full"
            style={{ paddingHorizontal: rs(13), paddingVertical: rs(9), backgroundColor: MINT, borderWidth: 1, borderColor: BRIGHT }}
          >
            <History size={rf(13)} color={ACCENT} />
            <Text className="font-extrabold" style={{ marginLeft: rs(6), fontSize: 11.5, color: ACCENT }}>
              Previous
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingBottom: insets.bottom + rs(28) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={ACCENT} colors={[ACCENT]} />
        }
      >
        <View style={capStyle}>
          {/* Previous Reports */}
          <View
            className="flex-row items-center"
            style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(13), borderWidth: 1, borderColor: BORDER, overflow: 'hidden', ...cardShadow }}
          >
            <View pointerEvents="none" style={{ position: 'absolute', right: -rs(16), bottom: -rs(20), width: rs(90), height: rs(90), borderRadius: rs(45), backgroundColor: SOFT_MINT }} />
            <View className="items-center justify-center" style={{ width: rs(44), height: rs(44), borderRadius: rs(15), backgroundColor: MINT, marginRight: rs(12) }}>
              <History size={rf(19)} color={ACCENT} />
            </View>
            <View className="flex-1">
              <Text className="font-extrabold" style={{ fontSize: 13.5, color: TEXT_PRIMARY }} numberOfLines={1}>
                Previous Reports
              </Text>
              <Text style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
                Month-by-month status snapshots
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('BookingPreviousReport')}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <ChevronRight size={rf(19)} color={TEXT_SECONDARY} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={{ marginTop: rs(12) }}>
              <Text style={{ fontSize: 12, color: WARNING_RED }}>{error}</Text>
            </View>
          ) : null}

          {/* Section header */}
          <View style={{ marginTop: rs(20), marginBottom: rs(12) }}>
            <Text className="font-extrabold" style={{ fontSize: 19, color: TEXT_PRIMARY }}>Booking status</Text>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: rs(2) }}>
              All time · {ALL_TILES.length} statuses
            </Text>
          </View>

          {/* Total Booking hero card */}
          <TouchableOpacity
            onPress={() => openReport(TOTAL_TILE)}
            activeOpacity={0.9}
            style={{ borderRadius: rs(22), overflow: 'hidden', ...cardShadow, shadowColor: ACCENT, shadowOpacity: 0.28 }}
          >
            <LinearGradient
              colors={[BRIGHT, ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', padding: rs(16) }}
            >
              <View
                style={{
                  width: rs(48), height: rs(48), borderRadius: rs(15),
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
                  marginRight: rs(13),
                }}
              >
                <ClipboardList size={rf(22)} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold" style={{ fontSize: 15.5, color: '#FFFFFF' }} numberOfLines={1}>
                  {TOTAL_TILE.label}
                </Text>
                <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: rs(1) }} numberOfLines={1}>
                  Every booking in the shop
                </Text>
              </View>
              <View style={{ width: 1, height: rs(30), backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: rs(12) }} />
              <Text className="font-extrabold" style={{ fontSize: 25, color: '#FFFFFF' }} numberOfLines={1}>
                {pad2(countFor(TOTAL_TILE))}
              </Text>
              <ChevronRight size={rf(20)} color="rgba(255,255,255,0.85)" style={{ marginLeft: rs(4) }} />
            </LinearGradient>
          </TouchableOpacity>

          {/* 2x2 metric grid */}
          <View className="flex-row flex-wrap" style={{ marginTop: rs(11), marginHorizontal: -rs(5) }}>
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
          <View style={{ marginTop: rs(22), marginBottom: rs(12) }}>
            <Text className="font-extrabold" style={{ fontSize: 17.5, color: TEXT_PRIMARY }}>{WORK_PENDING_TILE.label}</Text>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: rs(2) }}>
              Waiting on a part or on the customer
            </Text>
          </View>

          <View style={{ backgroundColor: CARD_BG, borderRadius: rs(20), borderWidth: 1, borderColor: BORDER, ...cardShadow }}>
            <PendingRow
              icon={AlertTriangle}
              color={WARNING_RED}
              label="Stalled bookings"
              value={pad2(countFor(WORK_PENDING_TILE))}
              onPress={() => openReport(WORK_PENDING_TILE)}
            />
            {WORK_PENDING_TILE.breakdown.map((b, i) => (
              <PendingRow
                key={b.key}
                icon={b.icon}
                color={b.color}
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

// One of the 2x2 metric grid cards — uniform mint icon tile + title + count,
// matching the reference's flat card style (colour-coding lives on the
// Working Pending rows below, not here).
function MetricCard({ icon: Icon, label, value, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        width: '50%', paddingHorizontal: rs(5), marginBottom: rs(10),
      }}
    >
      <View
        style={{
          backgroundColor: CARD_BG, borderRadius: rs(18), padding: rs(13),
          borderWidth: 1, borderColor: BORDER, overflow: 'hidden', ...cardShadow,
        }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', right: -rs(14), bottom: -rs(16), width: rs(70), height: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT }} />
        <View className="items-center justify-center" style={{ width: rs(42), height: rs(42), borderRadius: rs(21), backgroundColor: MINT, marginBottom: rs(10) }}>
          <Icon size={rf(19)} color={ACCENT} />
        </View>
        <Text style={{ fontSize: 12, color: TEXT_SECONDARY }} numberOfLines={1}>{label}</Text>
        <Text className="font-extrabold" style={{ fontSize: 20, color: TEXT_PRIMARY, marginTop: rs(2) }}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

// One row of the Working Pending card — coloured icon tile, label, bold
// count, chevron, with a divider under every row except the last.
function PendingRow({ icon: Icon, color, label, value, onPress, last }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center"
      style={{
        paddingHorizontal: rs(13), paddingVertical: rs(12),
        borderBottomWidth: last ? 0 : 1, borderBottomColor: SOFT_MINT,
      }}
    >
      <View className="items-center justify-center" style={{ width: rs(42), height: rs(42), borderRadius: rs(14), backgroundColor: color, marginRight: rs(12) }}>
        <Icon size={rf(18)} color="#FFFFFF" />
      </View>
      <Text className="flex-1" style={{ fontSize: 13, color: TEXT_PRIMARY }} numberOfLines={1}>
        {label}
      </Text>
      <Text className="font-extrabold" style={{ fontSize: 17.5, color: TEXT_PRIMARY, marginRight: rs(6) }}>
        {value}
      </Text>
      <ChevronRight size={rf(16)} color={TEXT_SECONDARY} />
    </TouchableOpacity>
  );
}

export const STATUS_TILE_META = ALL_TILES.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});
