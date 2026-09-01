import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookText,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  UserPlus,
  UserRound,
} from 'lucide-react-native';
import { EmptyState, Loader } from '../../components/rnr';
import { confirm, notify } from '../../components/confirm';
import LedgerFilterSheet, {
  DEFAULT_LEDGER_FILTER,
  isDefaultFilter,
} from './LedgerFilterSheet';
import { formatMoney } from './revenueMath';
import { rs } from '../../theme/metrics';
import {
  C,
  S,
  SIZE,
  T,
  avatarFor,
  bottomInset,
  headerStyle,
  avatarInitialSize,
} from './ledgerUi';
import {
  PARTY_CUSTOMER,
  PARTY_SUPPLIER,
  RECEIVED,
  balanceTone,
  deleteParty,
  getLedgerPeriod,
  listParties,
  partyCopy,
  toApiDate,
} from '../../api/ledgerParties';

/* ══════════════════════════════════════════════════════════════════════════
   Cash Book — the shop's accounts and what has moved on them.
   ──────────────────────────────────────────────────────────────────────────
   The CUSTOMER and SUPPLIER chips list the shop's accounts, each with the
   balance it stands at. The TODAY / THIS WEEK / MONTH chips are the same ledger
   read the other way round: every movement in a window, whoever it was with.

   The five chips are one exclusive selector rather than two rows because they
   answer one question — "what am I looking at" — and a second row of tabs on a
   screen with no summary above it reads as chrome.

   No balance is stored anywhere: every figure here is summed server-side from
   shop_ledger_entries, so an edited or deleted entry can never leave a stale
   total behind. This is money a shop argues with a customer about.
   ══════════════════════════════════════════════════════════════════════════ */

const MENU = [
  { key: PARTY_CUSTOMER, label: 'Customer', kind: 'party' },
  { key: PARTY_SUPPLIER, label: 'Supplier', kind: 'party' },
  { key: 'today', label: 'Today', kind: 'period' },
  { key: 'week', label: 'This Week', kind: 'period' },
  { key: 'month', label: 'Month', kind: 'period' },
];

const isPartyView = (key) => key === PARTY_CUSTOMER || key === PARTY_SUPPLIER;

/* ── date helpers ───────────────────────────────────────────────────────── */

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Parse the API's `YYYY-MM-DD` as a LOCAL date. `new Date('2026-08-09')` is
// parsed as UTC midnight, which renders as the previous day anywhere west of
// Greenwich and, more importantly, breaks the Today/Yesterday comparison.
function parseApiDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dayHeading(date) {
  if (!date) return 'Unknown date';
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

const monthLabel = (date) => date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** "10 Aug, 2026" — how the account rows date themselves. */
function niceDate(value) {
  const d = typeof value === 'string' && value.length === 10 ? parseApiDate(value) : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ (\d{4})$/, ', $1');
}

/**
 * The window sent to the server. `monthAnchor` only matters for the Month
 * period, where the owner can step back through earlier months; Today and This
 * Week always mean the current one.
 */
function periodRange(key, monthAnchor) {
  const now = new Date();
  if (key === 'today') return { from: now, to: now };
  if (key === 'week') {
    const from = startOfDay(now);
    from.setDate(from.getDate() - from.getDay());
    return { from, to: now };
  }
  const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const last = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
  // Never ask for future days — the backend rejects future-dated entries, so a
  // window past today would only ever return the same rows.
  return { from: first, to: last > now ? now : last };
}

const money = (n) => formatMoney(Math.abs(Number(n) || 0));

const EMPTY_PERIOD = { totalReceived: 0, totalGiven: 0, entries: [] };

const dateValue = (s) => {
  const d = parseApiDate(s);
  return d ? d.getTime() : -Infinity;   // never paid / never touched sorts last
};

/**
 * Apply the sheet's choices to the loaded accounts.
 *
 * Filter first, then sort, and always on a copy: `parties` is the server's
 * response and its own order IS the Default option, so sorting in place would
 * make Default unrecoverable without a refetch.
 */
function applyLedgerFilter(parties, filter) {
  const { sort = 'default', balance = 'all' } = filter || {};

  const rows = parties.filter((p) => {
    const n = Number(p.balance) || 0;
    if (balance === 'due') return n > 0;
    if (balance === 'advance') return n < 0;
    if (balance === 'settled') return n === 0;
    return true;
  });

  if (sort === 'default') return rows;

  const sorted = rows.slice();
  if (sort === 'dueAmount') {
    // Highest owed first, so the chase list starts at the top; accounts in
    // advance fall to the bottom, which is where they belong.
    sorted.sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
  } else if (sort === 'name') {
    sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  } else if (sort === 'latestActivity') {
    sorted.sort((a, b) => dateValue(b.lastEntryDate) - dateValue(a.lastEntryDate));
  } else if (sort === 'lastPayment') {
    // lastPaymentDate is the last RECEIVED entry, not the last movement — an
    // account that paid on Monday and took credit on Tuesday sorts by Monday.
    sorted.sort((a, b) => dateValue(b.lastPaymentDate) - dateValue(a.lastPaymentDate));
  }
  return sorted;
}

/**
 * One line over the account list: how many accounts, and where they stand once
 * netted off against each other.
 *
 * Summing is only meaningful because this list is one party type at a time —
 * netting a customer's due against a supplier's would produce a number that
 * means nothing. Positive is money owed TO the shop, matching balanceTone's
 * "Due", so the card and every row under it lean the same way.
 */
function summarise(parties) {
  const net = parties.reduce((sum, p) => sum + (Number(p.balance) || 0), 0);
  return {
    count: parties.length,
    net,
    danger: net > 0,
    label: net > 0 ? 'You Get' : net < 0 ? 'You Give' : 'Settled',
  };
}

// avatarFor now lives in ./ledgerUi, shared by all four screens that draw an
// account monogram — four private copies of the same hash would drift, and the
// colour is only a recognition cue if it is the same one everywhere.

/* ── screen ─────────────────────────────────────────────────────────────── */

export default function OwnerCashBookScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState(PARTY_CUSTOMER);

  const [parties, setParties] = useState([]);
  const [period, setPeriod] = useState(EMPTY_PERIOD);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date()));
  const [filter, setFilter] = useState(DEFAULT_LEDGER_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const showingParties = isPartyView(view);
  const copy = partyCopy(view);

  const visibleParties = useMemo(() => applyLedgerFilter(parties, filter), [parties, filter]);

  // Summed over what is ON SCREEN, not the whole book: with "Due Only" applied,
  // a net that quietly included the advances the owner just filtered out would
  // not add up to the rows beneath it.
  const summary = useMemo(() => summarise(visibleParties), [visibleParties]);

  const filtered = !isDefaultFilter(filter);

  const range = useMemo(
    () => periodRange(showingParties ? 'today' : view, monthAnchor),
    [showingParties, view, monthAnchor],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      if (showingParties) setParties(await listParties(view));
      else setPeriod(await getLedgerPeriod({ from: toApiDate(range.from), to: toApiDate(range.to) }));
    } catch (e) {
      // Both books are owner-only on the server; a technician token gets 403.
      setError(e?.status === 403
        ? 'The cash book is available to the shop owner only.'
        : (e?.message || 'Failed to load the cash book'));
      if (showingParties) setParties([]);
      else setPeriod(EMPTY_PERIOD);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showingParties, view, range.from, range.to]);

  // Refetches on focus, which is also how an account added on the Add screen —
  // or an entry recorded on the statement — shows up here without threading a
  // result back through navigation.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Day-grouped feed. Entries already arrive newest-day-first from the server,
  // so grouping preserves order instead of re-sorting.
  const feed = useMemo(() => {
    const out = [];
    let currentKey = null;
    for (const e of period.entries) {
      if (e.entryDate !== currentKey) {
        currentKey = e.entryDate;
        out.push({ _type: 'day', key: `day:${currentKey}`, label: dayHeading(parseApiDate(currentKey)) });
      }
      out.push({ _type: 'entry', key: `e:${e.id}`, entry: e });
    }
    return out;
  }, [period.entries]);

  const periodTitle = view === 'today' ? 'today'
    : view === 'week' ? 'this week'
    : monthLabel(monthAnchor).toLowerCase();

  /* ── actions ──────────────────────────────────────────────────────── */

  // Straight to the phone book. Almost every account a shop adds is already a
  // contact, so the contact list is the fast path and the Name/Phone form is the
  // exception — reachable from "Add Manually" at the bottom of that screen.
  const openAdd = () => navigation.navigate('OwnerContactPicker', { partyType: view });

  const openParty = (party) =>
    navigation.navigate('OwnerLedgerPartyDetail', { partyId: party.id, party });

  // Long-press rather than a per-row trash icon: deleting is the rare action on
  // this list, and a delete affordance sitting next to every name is the kind
  // of thing that gets hit by accident on a phone held one-handed.
  const removeParty = async (party) => {
    const ok = await confirm({
      title: `Delete ${copy.one.toLowerCase()}`,
      message: `${party.name} and every entry on their account will be removed. This cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteParty(party.id);
      notify('Deleted', `${party.name} removed`, { preset: 'done' });
      await load(true);
    } catch (e) {
      notify('Could not delete', e?.message || 'Please try again', { preset: 'error', haptic: 'error' });
    }
  };

  /* ── rows ─────────────────────────────────────────────────────────── */

  const renderPartyRow = ({ item }) => {
    const { color, ink, initial } = avatarFor(item.name);
    const tone = balanceTone(item.balance);
    const hasEntries = !!item.lastEntryDate;

    return (
      <Pressable
        onPress={() => openParty(item)}
        onLongPress={() => removeParty(item)}
        delayLongPress={400}
        className="flex-row items-center active:opacity-70"
        // Row height lands ~56pt: under the 44pt touch minimum it would be
        // cramped, far over it and a phone shows five accounts instead of eight.
        style={{ paddingVertical: S.sm, paddingHorizontal: S.tight }}
      >
        <View
          className="items-center justify-center"
          style={{
            height: SIZE.avatarLg,
            width: SIZE.avatarLg,
            borderRadius: SIZE.avatarLg / 2,
            marginRight: S.md,
            backgroundColor: color,
          }}
        >
          <Text
            className="font-extrabold"
            style={{ fontSize: avatarInitialSize(SIZE.avatarLg), color: ink }}
          >
            {initial}
          </Text>
        </View>

        <View className="flex-1" style={{ paddingRight: S.sm }}>
          <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }} numberOfLines={1}>
            {item.name}
          </Text>
          <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
            {hasEntries ? (
              item.lastEntryDirection === RECEIVED
                ? <ArrowDown size={rs(11)} color={C.green} />
                : <ArrowUp size={rs(11)} color={C.red} />
            ) : (
              <UserRound size={rs(11)} color={C.muted} />
            )}
            <Text
              style={{ fontSize: T.rowSub, color: C.muted, marginLeft: S.tight, flex: 1 }}
              numberOfLines={1}
            >
              {hasEntries
                ? `${money(item.lastEntryAmount)} ${item.lastEntryDirection === RECEIVED ? 'Received' : 'Given'} on ${niceDate(item.lastEntryDate)}`
                : `Added On ${niceDate(item.createdAt)}`}
            </Text>
          </View>
        </View>

        <View className="items-end">
          <Text className="font-extrabold" style={{ fontSize: T.rowAmount, color: tone.danger ? C.red : C.green }}>
            {money(item.balance)}
          </Text>
          <Text style={{ fontSize: T.caption, color: C.muted }}>{tone.label}</Text>
        </View>
      </Pressable>
    );
  };

  const renderEntryRow = ({ item }) => {
    if (item._type === 'day') {
      return (
        <View style={{ marginTop: S.md, marginBottom: S.tight, paddingHorizontal: S.tight }}>
          <Text className="font-extrabold" style={{ fontSize: T.chip, color: C.muted }}>{item.label}</Text>
        </View>
      );
    }

    const e = item.entry;
    const isIn = e.direction === RECEIVED;
    const tint = isIn ? C.green : C.red;

    return (
      <Pressable
        onPress={() => navigation.navigate('OwnerLedgerPartyDetail', { partyId: e.partyId })}
        className="flex-row items-center bg-card active:opacity-80"
        style={{
          padding: S.sm,
          marginBottom: S.xs,
          borderRadius: SIZE.radius,
          borderWidth: 1,
          borderColor: C.hairline,
        }}
      >
        <View
          className="items-center justify-center"
          style={{
            height: SIZE.tile,
            width: SIZE.tile,
            borderRadius: SIZE.radiusSm,
            marginRight: S.sm,
            backgroundColor: `${tint}18`,
          }}
        >
          {isIn ? <ArrowDown size={rs(16)} color={tint} /> : <ArrowUp size={rs(16)} color={tint} />}
        </View>
        <View className="flex-1" style={{ paddingRight: S.sm }}>
          <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }} numberOfLines={1}>
            {e.partyName || 'Account'}
          </Text>
          <Text style={{ fontSize: T.rowSub, color: C.muted }} numberOfLines={1}>
            {e.note || (isIn ? 'Received' : 'Given')}
          </Text>
        </View>
        <Text className="font-extrabold" style={{ fontSize: T.rowAmount, color: tint }}>
          {isIn ? '+ ' : '− '}{money(e.amount)}
        </Text>
      </Pressable>
    );
  };

  /* ── render ───────────────────────────────────────────────────────── */

  const listIsEmpty = showingParties ? parties.length === 0 : period.entries.length === 0;

  return (
    <View className="flex-1 bg-background">
      {/* ── header ───────────────────────────────────────────────────── */}
      <View className="flex-row items-center bg-card" style={headerStyle(insets.top)}>
        <Pressable
          // popTo, not navigate, on the fallback: with nothing below us a
          // navigate would PUSH the tabs on top of this screen (React
          // Navigation 7 no longer returns to an existing route), leaving Home
          // with a back button that comes straight back here.
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.popTo('OwnerTabs'))}
          // The button shrinks with the header, but hitSlop grows to match, so
          // the tap target stays comfortably past 44pt on every device.
          hitSlop={rs(10)}
          className="rounded-full items-center justify-center active:opacity-70"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon, marginRight: S.tight }}
        >
          <ArrowLeft size={rs(19)} color={C.ink} />
        </Pressable>
        <Text className="flex-1 font-extrabold" style={{ fontSize: T.screenTitle, color: C.ink }}>
          Cash Book
        </Text>
        <View
          className="rounded-full items-center justify-center"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon, backgroundColor: C.greenSoft }}
        >
          <BookText size={rs(16)} color={C.green} />
        </View>
      </View>

      {/* ── menu list ────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The five chips overflow a phone's width; without this the last one is
        // unreachable rather than merely off-screen.
        //
        // flexGrow: 0 is load-bearing: ScrollView's base style grows, so in this
        // column it would swallow the whole screen and stretch the chips to fill
        // it. alignItems keeps each chip at its own text height.
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          paddingHorizontal: S.gutter,
          paddingTop: S.sm,
          paddingBottom: rs(2),
          alignItems: 'center',
        }}
      >
        {MENU.map((m) => {
          const active = view === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => {
                setView(m.key);
                if (m.key === 'month') setMonthAnchor(startOfDay(new Date()));
              }}
              // Compact does not mean small to hit. Padding alone would leave
              // these ~27pt tall, so the chip carries an explicit minHeight and
              // vertical hitSlop that together clear the 44pt touch minimum
              // without adding any visible height.
              hitSlop={{ top: S.xs, bottom: S.xs }}
              className="rounded-full items-center justify-center active:opacity-80"
              style={{
                paddingHorizontal: S.md,
                paddingVertical: S.tight,
                minHeight: rs(34),
                marginRight: S.xs,
                backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
                borderWidth: 1.5,
                borderColor: active ? C.green : C.border,
              }}
            >
              <Text className="font-bold" style={{ fontSize: T.chip, color: active ? C.green : C.muted }}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Month stepper — a ledger is looked back through, so Month is the one
          period that needs to reach past the current one. */}
      {view === 'month' ? (
        <View
          className="flex-row items-center justify-between"
          style={{
            marginHorizontal: S.gutter,
            marginTop: S.xs,
            paddingHorizontal: S.xs,
            borderRadius: SIZE.radius,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Pressable
            onPress={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            hitSlop={rs(10)}
            className="items-center justify-center active:opacity-60"
            style={{ height: rs(32), width: rs(32) }}
          >
            <ChevronLeft size={rs(16)} color={C.ink} />
          </Pressable>
          <Text className="font-extrabold" style={{ fontSize: T.chip, color: C.ink }}>
            {monthLabel(monthAnchor)}
          </Text>
          <Pressable
            onPress={() => setMonthAnchor((d) => {
              const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
              const now = new Date();
              return next > now ? d : next;
            })}
            hitSlop={rs(10)}
            className="items-center justify-center active:opacity-60"
            style={{ height: rs(32), width: rs(32) }}
          >
            <ChevronRight size={rs(16)} color={C.ink} />
          </Pressable>
        </View>
      ) : null}

      {/* ── Net Balance ──────────────────────────────────────────────────
          The account list's own summary: what the whole book of ONE party type
          comes to, and how many accounts make it up. Safe to sum here — and
          only here — because the list is never mixed; the period views get the
          Received/Given pair below instead.

          Hidden on an empty book: "₹ 0 · 0 Accounts" above an empty state is a
          row of zeroes explaining nothing. */}
      {showingParties && parties.length ? (
        <View
          className="flex-row items-center"
          style={{
            marginHorizontal: S.gutter,
            marginTop: S.xs,
            paddingVertical: S.sm,
            paddingLeft: S.md,
            paddingRight: S.tight,
            borderRadius: SIZE.radius,
            backgroundColor: C.field,
            borderWidth: 1,
            borderColor: C.hairline,
          }}
        >
          <View className="flex-1" style={{ paddingRight: S.sm }}>
            <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }}>
              Net Balance
            </Text>
            <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
              <UserRound size={rs(11)} color={C.muted} />
              <Text style={{ fontSize: T.rowSub, color: C.muted, marginLeft: S.tight }}>
                {summary.count} {summary.count === 1 ? 'Account' : 'Accounts'}
              </Text>
            </View>
          </View>

          <View className="items-end" style={{ paddingRight: S.md }}>
            <Text
              className="font-extrabold"
              style={{ fontSize: T.rowAmount, color: summary.danger ? C.red : C.green }}
            >
              {money(summary.net)}
            </Text>
            <Text style={{ fontSize: T.caption, color: C.muted }}>{summary.label}</Text>
          </View>

          {/* alignSelf stretch, not a fixed height: the rule then matches the
              card whatever the type scale does to the two stacked lines. */}
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />

          {/* Opens the sort/filter sheet. The dot is the only sign a list is
              narrowed — without it, "where did that account go" has no answer
              on screen. */}
          <Pressable
            onPress={() => setFilterOpen(true)}
            hitSlop={rs(10)}
            accessibilityRole="button"
            accessibilityLabel={filtered ? 'Sort and filter accounts, filters applied' : 'Sort and filter accounts'}
            className="items-center justify-center active:opacity-60"
            style={{ height: SIZE.headerIcon, width: SIZE.headerIcon }}
          >
            <ListFilter size={rs(16)} color={filtered ? C.green : C.muted} />
            {filtered ? (
              <View
                className="absolute"
                style={{
                  top: rs(6),
                  right: rs(6),
                  height: rs(7),
                  width: rs(7),
                  borderRadius: rs(3.5),
                  backgroundColor: C.green,
                }}
              />
            ) : null}
          </Pressable>
        </View>
      ) : null}

      {/* Period totals. Only on the period views — the account list has the Net
          Balance card above instead. */}
      {!showingParties && period.entries.length ? (
        <View
          className="flex-row"
          style={{
            marginHorizontal: S.gutter,
            marginTop: S.xs,
            borderRadius: SIZE.radius,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: C.hairline,
          }}
        >
          <View className="flex-1 items-center" style={{ paddingVertical: S.xs }}>
            <Text style={{ fontSize: T.caption, color: C.muted, fontWeight: '700' }}>RECEIVED</Text>
            <Text className="font-extrabold" style={{ fontSize: T.rowAmount, color: C.green }}>
              {money(period.totalReceived)}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.hairline }} />
          <View className="flex-1 items-center" style={{ paddingVertical: S.xs }}>
            <Text style={{ fontSize: T.caption, color: C.muted, fontWeight: '700' }}>GIVEN</Text>
            <Text className="font-extrabold" style={{ fontSize: T.rowAmount, color: C.red }}>
              {money(period.totalGiven)}
            </Text>
          </View>
        </View>
      ) : null}

      {error ? (
        <View
          style={{
            marginHorizontal: S.gutter,
            marginTop: S.xs,
            paddingHorizontal: S.sm,
            paddingVertical: S.xs,
            borderRadius: SIZE.radiusSm,
            backgroundColor: 'rgba(220, 38, 38, 0.10)',
            borderWidth: 1,
            borderColor: 'rgba(220, 38, 38, 0.35)',
          }}
        >
          <Text className="text-danger font-bold" style={{ fontSize: T.rowSub }}>{error}</Text>
        </View>
      ) : null}

      {loading && listIsEmpty ? (
        <Loader label="Loading cash book..." />
      ) : showingParties ? (
        <FlatList
          data={visibleParties}
          keyExtractor={(p) => p.id}
          renderItem={renderPartyRow}
          ItemSeparatorComponent={() => (
            // Inset past the avatar so the rule reads as a list divider rather
            // than a box around each row. Derived, not a magic 70, so it stays
            // aligned when the avatar scales on a different device.
            <View
              style={{
                height: 1,
                backgroundColor: C.hairline,
                marginLeft: S.tight + SIZE.avatarLg + S.md,
              }}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />
          }
          contentContainerStyle={{
            paddingHorizontal: S.gutter,
            paddingTop: S.tight,
            // Clears the floating Add pill plus the system nav inset.
            paddingBottom: rs(84) + bottomInset(insets.bottom, S.sm),
          }}
          ListEmptyComponent={
            // An empty list means two different things. "Add your first
            // customer" in front of a book with 27 accounts in it, all hidden
            // by Due Only, would send the owner to create a duplicate.
            filtered && parties.length ? (
              <EmptyState
                icon={<ListFilter size={rs(22)} color={C.green} />}
                title="No accounts match this filter"
                description={`This book has ${parties.length} ${parties.length === 1 ? 'account' : 'accounts'}, none of them in the selected balance. Clear the filter to see them.`}
              />
            ) : (
              <EmptyState
                icon={<UserPlus size={rs(22)} color={C.green} />}
                title={copy.emptyTitle}
                description={copy.emptyBody}
              />
            )
          }
        />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.key}
          renderItem={renderEntryRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />
          }
          contentContainerStyle={{
            paddingHorizontal: S.gutter,
            paddingTop: S.tight,
            paddingBottom: S.xl + bottomInset(insets.bottom, S.sm),
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<BookText size={rs(22)} color={C.green} />}
              title="Nothing recorded yet"
              description={`No money moved ${periodTitle}. Open a customer or supplier to record one.`}
            />
          }
        />
      )}

      {/* ── add account ──────────────────────────────────────────────── */}
      {showingParties ? (
        <View
          className="absolute"
          style={{ right: S.gutter, bottom: bottomInset(insets.bottom, S.sm) + S.sm }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={openAdd}
            className="flex-row items-center justify-center rounded-full active:opacity-85"
            style={{
              backgroundColor: C.greenSoft,
              paddingHorizontal: S.xl,
              paddingVertical: S.md,
              minHeight: SIZE.buttonMin,
              shadowColor: C.ink,
              shadowOpacity: 0.16,
              shadowRadius: rs(12),
              shadowOffset: { width: 0, height: rs(4) },
              elevation: 8,
            }}
          >
            <UserPlus size={rs(17)} color={C.green} />
            <Text className="font-extrabold" style={{ fontSize: T.button, color: C.green, marginLeft: S.xs }}>
              {copy.addCta}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <LedgerFilterSheet
        visible={filterOpen}
        value={filter}
        onClose={() => setFilterOpen(false)}
        onApply={setFilter}
      />
    </View>
  );
}
