import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  ClipboardList,
  Wrench,
  CheckCircle2,
  Truck,
  AlertTriangle,
  PackageCheck,
  Package,
  UserCheck,
  ChevronRight,
  History,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { Loader } from '../../components/rnr';
import {
  C, GLASS, GREEN, GREEN_DARK, GREEN_LIGHT, Glass, Group, GroupHeader,
  HAIRLINE, IconSquare, R, Row, RowGroup, StatTile, T, Touchable,
} from '../../components/ios';

/* ══════════════════════════════════════════════════════════════════════════
   Booking Status — iOS 26 "Liquid Glass", matching the owner Home screen.
   Built from src/components/ios: floating glass nav bar, inset grouped cards,
   squircle icon tiles, SF type scale, system colours.

   Sizing is derived from the live window rather than hard-coded, so the same
   layout holds from a 320pt phone to a tablet in landscape, on both platforms:

     · PAD      — 16 at compact width, 20 at regular (iOS inset-grouped rule).
     · statCols — 2 up on a phone, 4 across once there's room for it.
     · insets   — top clears the notch / Android status bar; bottom clears the
                  home indicator or Android's 3-button nav.
     · Type     — authored at iOS point sizes; theme/fontScaling.js rescales
                  every fontSize against the device's short side app-wide, so
                  small phones and tablets both land in a readable band.
   ══════════════════════════════════════════════════════════════════════════ */

// Status tile config. `statusList` maps to the canonical backend status values
// used to query /tickets?status= on the report screen; an empty statusList means
// "every status", which the report screen fetches as one unfiltered page.
//
// 'Total Booking' leads as a prominent tinted card — it's the parent number the
// rest break down, and it replaced the old TOTAL/ACTIVE/DELIVERED KPI strip that
// showed the same figures a second time.
const TOTAL_TILE = {
  key: 'TOTAL_BOOKING',
  label: 'Total Booking',
  statusList: [],                 // no status filter — the whole book
  countKey: 'total',
  icon: ClipboardList,
  color: C.blue,
};

const TILES = [
  { key: 'TOTAL_PROCESSED',  label: 'Total Processed',  statusList: ['READY'],                    countKey: 'READY',                 icon: CheckCircle2, color: C.green },
  { key: 'TOTAL_DELIVERED',  label: 'Total Delivered',  statusList: ['DELIVERED'],                countKey: 'DELIVERED',             icon: PackageCheck, color: C.teal },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', statusList: ['DELIVERED_PROCESSING'],     countKey: 'DELIVERED_PROCESSING',  icon: Truck,        color: C.cyan },
  { key: 'TOTAL_INPROCESS',  label: 'Total Inprocess',  statusList: ['IN_DIAGNOSIS', 'IN_REPAIR'],                                   icon: Wrench,       color: C.indigo },
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
  color: C.red,
  breakdown: [
    { key: 'SPARE_PARTS_PENDING',       label: 'Spare parts pending',       statusList: ['APPROVED'], countKey: 'APPROVED', icon: Package,   color: C.orange },
    // Purple rather than systemYellow: the icon glyph is white and the accent is
    // reused as a label colour on white in the drill-down, and yellow fails both.
    { key: 'CUSTOMER_APPROVAL_PENDING', label: 'Customer approval pending', statusList: ['QUOTED'],   countKey: 'QUOTED',   icon: UserCheck, color: C.purple },
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
  const { width: winW } = useWindowDimensions();
  const isTablet = winW >= 680;
  // iOS inset-grouped side margin: 16 at compact width, 20 at regular.
  const PAD = isTablet ? 20 : 16;
  const GAP = 10;
  // Two up on a phone, four across on a tablet. Tiles flex, so the row fills
  // whatever width is left after the gutters — no fixed pixel widths to break
  // on an unusual screen.
  const statCols = isTablet ? 4 : 2;

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
      bg: tile.color,
      icon: tile.key,
    }),
    [navigation],
  );

  if (loading) return <Loader label="Loading status..." />;

  const navH = 46;
  const headerH = insets.top + navH + 10;

  // Chunk the stat tiles into rows of `statCols`, padding the last row with
  // spacers so a 3-across tablet row doesn't stretch its last tile.
  const statRows = [];
  for (let i = 0; i < TILES.length; i += statCols) statRows.push(TILES.slice(i, i + statCols));

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: headerH + 8, paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={GREEN_DARK}
            colors={[GREEN_DARK]}
            progressViewOffset={headerH}
          />
        }
      >
        {/* Previous Reports — a standard inset grouped row rather than a banner.
            iOS puts navigation like this in a list, not a marketing card. */}
        <Group pad={PAD} style={{ marginBottom: 22 }}>
          <RowGroup>
            <Row
              leading={<IconSquare icon={History} color={C.grey} />}
              title="Previous Reports"
              subtitle="Month-by-month status snapshots"
              onPress={() => navigation.navigate('BookingPreviousReport')}
            />
          </RowGroup>
        </Group>

        {error ? (
          <Group pad={PAD} style={{ marginBottom: 22 }}>
            <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
              <Text style={{ fontSize: T.subhead, color: C.red, letterSpacing: -0.2 }}>{error}</Text>
            </View>
          </Group>
        ) : null}

        {/* The counts come from /tickets/counts, which takes no period filter —
            hence "All time". The report screen defaults to its All Time chip for
            the same reason, so a tile's number always matches its drill-down. */}
        <GroupHeader
          title="Booking status"
          subtitle={`All time · ${ALL_TILES.length} statuses`}
          pad={PAD}
        />

        {/* Total Booking — "glass prominent": the tinted, elevated variant iOS
            reserves for the one figure a screen is really about. */}
        <Touchable
          onPress={() => openReport(TOTAL_TILE)}
          accessibilityRole="button"
          accessibilityLabel={`Total booking, ${countFor(TOTAL_TILE)}`}
          style={{ marginHorizontal: PAD, borderRadius: R.card }}
          pressedStyle={{ opacity: 0.6 }}
        >
          <Glass radius={R.card} fill="transparent" tinted style={{ overflow: 'hidden' }}>
            <LinearGradient
              colors={[GREEN_LIGHT, GREEN]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: R.card }}
            >
              {/* A tinted-glass box rather than an IconSquare: a green icon tile
                  on a green card would vanish. Radius follows the same squircle
                  rule IconSquare uses (28% of the side) so it reads as a sibling. */}
              <View
                style={{
                  width: 44, height: 44, borderRadius: Math.round(44 * 0.28),
                  backgroundColor: 'rgba(255,255,255,0.24)',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: HAIRLINE, borderColor: 'rgba(255,255,255,0.45)',
                  marginRight: 14,
                }}
              >
                <ClipboardList size={22} color="#FFFFFF" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: T.headline, color: '#FFFFFF', fontWeight: '700', letterSpacing: -0.4 }}>
                  {TOTAL_TILE.label}
                </Text>
                <Text style={{ fontSize: T.footnote, color: 'rgba(255,255,255,0.85)', letterSpacing: -0.1, marginTop: 1 }}>
                  Every booking in the shop
                </Text>
              </View>
              <Text
                style={{ fontSize: T.title1, color: '#FFFFFF', fontWeight: '700', letterSpacing: -0.8 }}
                numberOfLines={1}
              >
                {pad2(countFor(TOTAL_TILE))}
              </Text>
              <ChevronRight size={20} color="rgba(255,255,255,0.75)" strokeWidth={2.6} style={{ marginLeft: 4, marginRight: -4 }} />
            </LinearGradient>
          </Glass>
        </Touchable>

        {/* Stat grid */}
        <View style={{ marginTop: GAP + 2 }}>
          {statRows.map((row, ri) => (
            <View
              key={`row-${ri}`}
              style={{ flexDirection: 'row', paddingHorizontal: PAD, marginTop: ri === 0 ? 0 : GAP, gap: GAP }}
            >
              {row.map((t) => (
                <StatTile
                  key={t.key}
                  icon={t.icon}
                  color={t.color}
                  value={pad2(countFor(t))}
                  label={t.label}
                  onPress={() => openReport(t)}
                  accessibilityLabel={`${t.label}, ${countFor(t)}`}
                />
              ))}
              {/* Spacers keep a short final row aligned to the grid. */}
              {row.length < statCols
                ? Array.from({ length: statCols - row.length }).map((_, i) => (
                    <View key={`spacer-${i}`} style={{ flex: 1 }} />
                  ))
                : null}
            </View>
          ))}
        </View>

        {/* Working Pending — a grouped list whose header carries the combined
            count and whose rows are the two reasons a booking is stalled. */}
        <GroupHeader
          title={WORK_PENDING_TILE.label}
          subtitle="Waiting on a part or on the customer"
          pad={PAD}
          style={{ marginTop: 26 }}
        />
        <Group pad={PAD}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
            }}
          >
            <IconSquare icon={AlertTriangle} color={C.red} size={30} />
            <Text style={{ flex: 1, fontSize: T.subhead, color: C.label2, letterSpacing: -0.2, marginLeft: 12 }}>
              Stalled bookings
            </Text>
            <Text style={{ fontSize: T.title2, color: C.label, fontWeight: '700', letterSpacing: -0.5 }}>
              {pad2(countFor(WORK_PENDING_TILE))}
            </Text>
          </View>
          <View style={{ height: HAIRLINE, backgroundColor: C.separator, marginLeft: 18 }} />
          <RowGroup>
            {WORK_PENDING_TILE.breakdown.map((b, i) => (
              <Row
                key={b.key}
                leading={<IconSquare icon={b.icon} color={b.color} />}
                title={`${i + 1}. ${b.label}`}
                value={pad2(countFor(b))}
                valueColor={C.label}
                onPress={() => openReport(b)}
              />
            ))}
          </RowGroup>
        </Group>
      </ScrollView>

      {/* Floating glass nav bar — content scrolls underneath it. Absolute so the
          translucency has something to sit over; laid out last so it paints on
          top without needing zIndex juggling on Android. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top }} pointerEvents="box-none">
        <Glass
          radius={0}
          fill={GLASS.fill}
          shadow={GLASS.chromeShadow}
          style={{ height: navH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD - 4 }}
        >
          <Touchable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={{
              width: 32, height: 32, borderRadius: R.control,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.fill, marginRight: 8,
            }}
            pressedStyle={{ opacity: 0.5 }}
          >
            <ChevronLeft size={20} color={C.label} strokeWidth={2.6} />
          </Touchable>
          <Text
            style={{ flex: 1, fontSize: T.headline, fontWeight: '700', color: C.label, letterSpacing: -0.4 }}
            numberOfLines={1}
          >
            Booking Status
          </Text>
          <Touchable
            onPress={() => navigation.navigate('BookingPreviousReport')}
            accessibilityRole="button"
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 12, height: 32, borderRadius: R.control,
              backgroundColor: C.fill,
            }}
            pressedStyle={{ opacity: 0.5 }}
          >
            <History size={13} color={C.tint} strokeWidth={2.4} />
            <Text style={{ fontSize: T.footnote, color: C.tint, fontWeight: '600', letterSpacing: -0.2, marginLeft: 5 }}>
              Previous
            </Text>
          </Touchable>
        </Glass>
      </View>
    </View>
  );
}

export const STATUS_TILE_META = ALL_TILES.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});
