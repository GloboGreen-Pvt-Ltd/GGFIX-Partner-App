import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
// From `/legacy`, not the package root: SDK 54 turned the root's copies of these
// into deprecated shims that throw when called.
import { EncodingType, cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Share2,
} from 'lucide-react-native';
import { Loader } from '../../components/rnr';
import { notify } from '../../components/confirm';
import { notifyDownloaded, saveToDownloads } from '../../lib/downloads';
import { getSession } from '../../auth/session';
import { formatMoney } from './revenueMath';
import { rs } from '../../theme/metrics';
import { C, S, SIZE, T, bottomInset, headerStyle } from './ledgerUi';
import LedgerDateSheet from './LedgerDateSheet';
import {
  PARTY_SUPPLIER,
  RECEIVED,
  balanceTone,
  formatPhone,
  getStatement,
  toApiDate,
} from '../../api/ledgerParties';

/* ══════════════════════════════════════════════════════════════════════════
   One account's statement, as a report rather than a conversation.
   ──────────────────────────────────────────────────────────────────────────
   The party screen answers "what happened, in order". This answers "what does
   a window add up to" — the thing an owner is asked for when a customer
   disputes a total, or when the shop's books are being closed for a month.

   ENTIRELY CLIENT-SIDE. `getStatement` already returns every entry for the
   account, so filtering a window here costs one request and no backend work.
   The alternative — a range parameter per chip — would mean a round trip on
   every chip tap and a server that has to agree with this screen about where
   "last month" starts.

   PAYMENT vs CREDIT. Payment is money the party handed the shop (RECEIVED);
   Credit is money the shop handed them (GIVEN). Those are the report's words,
   not the ledger's, because that is what the columns of a paper statement say.
   ══════════════════════════════════════════════════════════════════════════ */

const money = (n) => formatMoney(Math.abs(Number(n) || 0));

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

// The API's `YYYY-MM-DD`, read in the LOCAL calendar. `new Date('2026-08-09')`
// parses as UTC midnight, which lands on the previous day west of Greenwich and
// would file an entry outside the very window it belongs to.
function parseApiDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const dayNum = (date) => (date ? String(date.getDate()) : '—');
const monthAbbr = (date) => (date ? date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : '');
const longDate = (date) => (date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/**
 * "09 Aug 2026 at 05:30 PM" — the moment the document was produced.
 *
 * Day-month-year to match every other date on the sheet and the rest of the
 * app, and a 12-hour clock because that is how a counter reads a time back.
 * Stamped when the file is built rather than when the screen opened, so a
 * statement left open for an hour still reports when it was actually shared.
 */
function stamp(date = new Date()) {
  const time = date
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toUpperCase();
  return `${longDate(date)} at ${time}`;
}

/** The shop's address, as one line, skipping the parts that aren't filled in. */
function shopAddressLine(shop) {
  if (!shop) return '';
  const joined = [shop.street, shop.area, shop.taluk, shop.district, shop.state, shop.pincode]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
  // `address` is the free-text field an owner may have typed instead of the
  // structured parts; prefer the structured line when there is one.
  return joined || String(shop.address || '').trim();
}

/* ── the windows ──────────────────────────────────────────────────────────
   Each returns [from, to] as local Dates, or null for "everything". They are
   computed from `today` at call time rather than stored, so a statement left
   open overnight reports the new day once it reloads. ── */

const FILTERS = [
  { key: 'OVERALL', label: 'Overall' },
  { key: 'RANGE', label: 'Date Range' },
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7', label: 'Last 7 days' },
  { key: 'SINCE_ZERO', label: 'Since last ₹0' },
  { key: 'LAST_MONTH', label: 'Last Month' },
];

function windowFor(key, range) {
  const today = startOfDay(new Date());
  switch (key) {
    case 'THIS_MONTH':
      return [new Date(today.getFullYear(), today.getMonth(), 1), endOfDay(today)];
    case 'LAST_MONTH': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      // Day 0 of this month IS the last day of the previous one.
      return [first, endOfDay(new Date(today.getFullYear(), today.getMonth(), 0))];
    }
    case 'LAST_7':
      // Inclusive of today, so the chip covers seven calendar days, not eight.
      return [new Date(today.getTime() - 6 * 86400000), endOfDay(today)];
    case 'RANGE':
      return range?.from && range?.to ? [startOfDay(range.from), endOfDay(range.to)] : null;
    default:
      return null;
  }
}

/**
 * Entries since the account last stood at zero.
 *
 * The point of the chip is "what has built up since we were square", so the
 * settling entry itself is excluded — it belongs to the balance that was
 * cleared, not to the one being chased. Scans from the END so a long-running
 * account finds its most recent settlement first, and falls back to the whole
 * history when the account has never been square.
 */
function sinceLastZero(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (Number(entries[i].runningBalance) === 0) return entries.slice(i + 1);
  }
  return entries;
}

export default function OwnerLedgerStatementScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const partyId = route.params?.partyId;
  const seed = route.params?.party || null;

  const [statement, setStatement] = useState({
    party: seed, balance: 0, totalReceived: 0, totalGiven: 0, entries: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('OVERALL');
  const [range, setRange] = useState({ from: null, to: null });
  const [picking, setPicking] = useState(null);   // 'from' | 'to'
  const [exporting, setExporting] = useState(null);   // null | 'save' | 'share'
  const [sheet, setSheet] = useState(false);      // the Excel / PDF chooser
  // The letterhead. Read from the PERSISTED session rather than /auth/me: the
  // export must not fail or stall because the network is down, and the shop's
  // own name and address do not change between refreshes.
  const [shop, setShop] = useState(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getSession()
      .then((s) => { if (!cancelled) setShop(s?.activeShop || { name: s?.shopName, mobile: s?.phone }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatement(await getStatement(partyId));
    } catch (e) {
      setError(e?.message || 'Could not load this statement');
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const party = statement.party || seed;
  const isSupplier = party?.partyType === PARTY_SUPPLIER;
  const tone = balanceTone(statement.balance);

  /* ── the filtered window ───────────────────────────────────────────── */
  const view = useMemo(() => {
    const all = statement.entries || [];
    let rows = all;
    let from = null;
    let to = null;

    if (filter === 'SINCE_ZERO') {
      rows = sinceLastZero(all);
    } else {
      const w = windowFor(filter, range);
      if (w) {
        [from, to] = w;
        rows = all.filter((e) => {
          const d = parseApiDate(e.entryDate);
          return d && d >= startOfDay(from) && d <= to;
        });
      }
    }

    // The window actually covered, for the "Balance | 1 - 10 Aug, 2026" line.
    // For Overall / Since-₹0 it is the span of the rows themselves, so the
    // label never claims a range with no entries in it.
    if (!from && rows.length) {
      from = parseApiDate(rows[0].entryDate);
      to = parseApiDate(rows[rows.length - 1].entryDate);
    }

    const payments = rows.filter((e) => e.direction === RECEIVED);
    const credits = rows.filter((e) => e.direction !== RECEIVED);
    const sum = (list) => list.reduce((n, e) => n + (Number(e.amount) || 0), 0);

    return {
      rows,
      from,
      to,
      paymentCount: payments.length,
      paymentTotal: sum(payments),
      creditCount: credits.length,
      creditTotal: sum(credits),
      // What the window itself moved. The header keeps showing the account's
      // live balance, because that is what the owner is asked for at the
      // counter — a windowed net would silently contradict the party screen.
      net: sum(payments) - sum(credits),
    };
  }, [statement.entries, filter, range]);

  const rangeLabel = view.from && view.to
    ? `${view.from.getDate()} - ${view.to.getDate()} ${view.to.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    : 'No entries';

  /* ── export ────────────────────────────────────────────────────────── */

  const fileStem = useMemo(() => {
    const who = String(party?.name || 'account').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return `${who}-statement-${toApiDate(new Date())}`;
  }, [party?.name]);

  const rowsForExport = () => view.rows.map((e) => {
    const d = parseApiDate(e.entryDate);
    return {
      date: longDate(d),
      note: e.note || (e.ticketTrackingId ? `Booking ${e.ticketTrackingId}` : ''),
      payment: e.direction === RECEIVED ? Number(e.amount) || 0 : null,
      credit: e.direction !== RECEIVED ? Number(e.amount) || 0 : null,
      balance: Number(e.runningBalance) || 0,
    };
  });

  /**
   * The shareable statement.
   *
   * Laid out as a letterhead rather than a screenshot of the screen: the shop
   * identifies itself top-left, the account it is about top-right, and the
   * period is stated in words before any figure appears. That is the shape a
   * customer expects of a document they are asked to settle against, and it is
   * the one thing the on-screen view cannot be — the screen already knows whose
   * shop it is, a forwarded PDF does not.
   */
  const buildHtml = () => {
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const inr = (n) => `&#8377;${Math.abs(Number(n) || 0).toLocaleString('en-IN')}`;
    const generatedAt = stamp();
    const address = shopAddressLine(shop);
    const body = rowsForExport().map((r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.note)}</td>
        <td class="n green">${r.payment != null ? inr(r.payment) : ''}</td>
        <td class="n red">${r.credit != null ? inr(r.credit) : ''}</td>
      </tr>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8"/>
      <style>
        *{box-sizing:border-box}
        body{font-family:-apple-system,Roboto,Helvetica,sans-serif;color:#172117;padding:26px;font-size:13px}
        .head{display:flex;justify-content:space-between;background:#EFF5EE;padding:18px 20px;gap:24px}
        .head .l{max-width:58%}
        .head .r{text-align:right;max-width:42%}
        .shop{font-size:22px;font-weight:800;letter-spacing:-0.3px;margin-bottom:4px}
        .head div.line{color:#172117;line-height:1.55}
        .soa{text-align:center;font-weight:700;margin:18px 0 0;font-size:13.5px}
        .bal{text-align:center;font-size:24px;font-weight:800;color:${tone.danger ? '#DC2626' : '#087A0A'};margin:14px 0 2px}
        .balsub{text-align:center;color:#172117;margin:0 0 18px}
        table{width:100%;border-collapse:collapse;font-size:12.5px}
        th{background:#EFF5EE;text-align:left;padding:10px;font-weight:700;vertical-align:top}
        th small{display:block;font-weight:600;font-size:12px}
        td{padding:11px 10px;border-bottom:1px solid #E2E8E2}
        .n{text-align:right;white-space:nowrap}
        .green{color:#087A0A}.red{color:#DC2626}
        .rule{border-top:2px solid #172117;margin-top:0}
        .foot{text-align:right;margin-top:12px;line-height:1.8}
        .foot .big{font-size:16px;font-weight:800;color:${tone.danger ? '#DC2626' : '#087A0A'}}
        .muted{color:#667066}
      </style></head><body>

      <div class="head">
        <div class="l">
          <div class="shop">${esc(shop?.name || 'GGFix')}</div>
          ${shop?.mobile ? `<div class="line">Mobile: ${esc(formatPhone(shop.mobile))}</div>` : ''}
          ${address ? `<div class="line">${esc(address)}</div>` : ''}
        </div>
        <div class="r">
          <div class="line">${esc(isSupplier ? 'Supplier' : 'Customer')}: ${esc(party?.name || 'Account')}</div>
          ${party?.phone ? `<div class="line">Mobile: ${esc(formatPhone(party.phone))}</div>` : ''}
          <div class="line">Statement Date: ${esc(generatedAt)}</div>
        </div>
      </div>

      <p class="soa">Statement of Account from ${esc(longDate(view.from))} to ${esc(longDate(view.to))}</p>

      <div class="bal">${inr(statement.balance)}</div>
      <p class="balsub">Balance | ${esc(longDate(view.from))} - ${esc(longDate(view.to))}</p>

      <table>
        <thead><tr>
          <th style="width:20%">Date</th>
          <th>Notes</th>
          <th class="n green" style="width:18%">Payment(${view.paymentCount})<small>${inr(view.paymentTotal)}</small></th>
          <th class="n red" style="width:18%">Credit(${view.creditCount})<small>${inr(view.creditTotal)}</small></th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="4" class="muted">No entries in this period.</td></tr>'}</tbody>
      </table>
      <div class="rule"></div>

      <div class="foot">
        <div>Current Balance: <span class="big">${inr(statement.balance)}</span> (Total Balance ${esc(tone.label)})</div>
        <div class="muted">( As of ${esc(generatedAt)} )</div>
        <div class="muted">Generated by GGFix App &middot; ${esc(generatedAt)}</div>
      </div>
      </body></html>`;
  };

  const shareFile = async (uri, mime, dialogTitle) => {
    if (!(await Sharing.isAvailableAsync())) {
      notify('Sharing unavailable', 'This device has no app to share the file with.', { preset: 'error' });
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle, UTI: mime === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text' });
  };

  /**
   * CSV, not a real .xlsx — Excel opens it natively and it needs no workbook
   * library in the bundle. Fields are quoted and inner quotes doubled, so a
   * note containing a comma cannot shift every column after it.
   */
  const buildCsv = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const row = (...cells) => cells.map(q).join(',');
    return [
      // Same letterhead as the PDF: a spreadsheet forwarded on its own has to
      // say whose shop it is and whose account, or it is a column of numbers.
      row(shop?.name || 'GGFix'),
      shop?.mobile ? row(`Mobile: ${formatPhone(shop.mobile)}`) : null,
      shopAddressLine(shop) ? row(shopAddressLine(shop)) : null,
      row(`${isSupplier ? 'Supplier' : 'Customer'}: ${party?.name || 'Account'}`),
      party?.phone ? row(`Mobile: ${formatPhone(party.phone)}`) : null,
      row(`Statement of Account from ${longDate(view.from)} to ${longDate(view.to)}`),
      row(`Statement Date: ${stamp()}`),
      '',
      // Balance is kept here though the PDF drops it: a spreadsheet is opened
      // to reconcile, and the running figure is the column that gets checked.
      row('Date', 'Notes', 'Payment', 'Credit', 'Balance'),
      ...rowsForExport().map((r) => row(
        r.date, r.note, r.payment ?? '', r.credit ?? '', Math.abs(r.balance),
      )),
      row('Total', '', view.paymentTotal, view.creditTotal, ''),
      row(`Current Balance: ${Math.abs(statement.balance)} (Total Balance ${tone.label})`),
      row('Generated by GGFix App'),
    ].filter((l) => l !== null).join('\n');
  };

  /** The PDF, rendered to a throwaway file in the cache. */
  const buildPdfFile = async () => (await Print.printToFileAsync({ html: buildHtml() })).uri;

  const KINDS = {
    pdf: { extension: 'pdf', mimeType: 'application/pdf' },
    csv: { extension: 'csv', mimeType: 'text/csv' },
  };

  /**
   * One path for both buttons.
   *
   * `share` hands the file to the system sheet, where WhatsApp is one of the
   * targets — deliberately not a wa.me deep link, which can only carry text, so
   * the statement itself would not travel with it.
   *
   * `save` puts a copy in the phone's Downloads folder and leaves a receipt in
   * the notification shade, because a button labelled Download has to leave the
   * file on the phone rather than in another app.
   */
  const runExport = async (kind, mode) => {
    setSheet(false);
    setExporting(mode);
    try {
      const { extension, mimeType } = KINDS[kind];

      if (mode === 'share') {
        let uri;
        if (kind === 'csv') {
          uri = `${cacheDirectory}${fileStem}.csv`;
          await writeAsStringAsync(uri, buildCsv(), { encoding: EncodingType.UTF8 });
        } else {
          uri = await buildPdfFile();
        }
        await shareFile(uri, mimeType, 'Share statement');
        return;
      }

      const saved = await saveToDownloads({
        stem: fileStem,
        extension,
        mimeType,
        ...(kind === 'csv' ? { text: buildCsv() } : { sourceUri: await buildPdfFile() }),
      });
      // There is no folder picker to dismiss now — saveToDownloads either
      // writes into Download/ or throws, and the catch below reports it.
      notify(`Saved to ${saved.location}`, saved.name, { preset: 'done', haptic: 'success' });
      await notifyDownloaded(saved);
    } catch (e) {
      notify(
        mode === 'share' ? 'Could not share the file' : 'Could not save the file',
        e?.message || 'Please try again',
        { preset: 'error', haptic: 'error' },
      );
    } finally {
      setExporting(null);
    }
  };

  const shareStatement = () => runExport('pdf', 'share');

  /* ── render ────────────────────────────────────────────────────────── */

  const renderRow = ({ item: e }) => {
    const d = parseApiDate(e.entryDate);
    const isIn = e.direction === RECEIVED;
    return (
      <View
        className="flex-row items-center"
        style={{
          paddingHorizontal: S.gutter,
          paddingVertical: S.md,
          borderBottomWidth: 1,
          borderBottomColor: C.hairline,
        }}
      >
        <View style={{ width: rs(52) }}>
          <Text className="font-extrabold" style={{ fontSize: T.rowTitle, color: C.ink }}>{dayNum(d)}</Text>
          <Text style={{ fontSize: T.caption, color: C.muted }}>{monthAbbr(d)}</Text>
        </View>
        {/* The note earns its place here: a column of bare amounts cannot
            settle the argument the statement is being shown to settle. */}
        <View className="flex-1" style={{ paddingRight: S.sm }}>
          {e.note ? (
            <Text style={{ fontSize: T.rowSub, color: C.body }} numberOfLines={1}>{e.note}</Text>
          ) : e.ticketTrackingId ? (
            <Text style={{ fontSize: T.rowSub, color: C.muted }} numberOfLines={1}>{e.ticketTrackingId}</Text>
          ) : null}
        </View>
        <Text
          className="font-extrabold text-right"
          style={{ width: rs(78), fontSize: T.rowAmount, color: isIn ? C.green : 'transparent' }}
        >
          {isIn ? money(e.amount) : ''}
        </Text>
        <Text
          className="font-extrabold text-right"
          style={{ width: rs(78), fontSize: T.rowAmount, color: !isIn ? C.red : 'transparent' }}
        >
          {!isIn ? money(e.amount) : ''}
        </Text>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── header ───────────────────────────────────────────────────── */}
      <View className="flex-row items-center bg-card" style={headerStyle(insets.top)}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={rs(10)}
          className="rounded-full items-center justify-center active:opacity-70"
          style={{ height: SIZE.headerIcon, width: SIZE.headerIcon }}
        >
          <ArrowLeft size={rs(19)} color={C.ink} />
        </Pressable>
        <View className="flex-1" style={{ marginLeft: S.xs }}>
          <Text className="font-extrabold" style={{ fontSize: T.screenTitle, color: C.ink }} numberOfLines={1}>
            {isSupplier ? 'Supplier' : 'Customer'} Statement
          </Text>
          <Text style={{ fontSize: T.screenSub, color: C.muted }} numberOfLines={1}>
            Current Balance{' '}
            <Text className="font-bold" style={{ color: tone.danger ? C.red : C.green }}>
              {money(statement.balance)}
            </Text>
          </Text>
        </View>
      </View>

      {/* ── period chips ─────────────────────────────────────────────── */}
      <View className="bg-card" style={{ borderBottomWidth: 1, borderBottomColor: C.hairline }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.gutter, paddingVertical: S.sm, gap: S.xs }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  if (f.key === 'RANGE') { setPicking('from'); return; }
                  setFilter(f.key);
                }}
                className="flex-row items-center rounded-full active:opacity-80"
                style={{
                  paddingHorizontal: S.md,
                  paddingVertical: S.xs,
                  backgroundColor: active ? C.greenSoft : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: active ? C.green : C.border,
                }}
              >
                <Text
                  className="font-bold"
                  style={{ fontSize: T.chip, color: active ? C.green : C.body }}
                >
                  {f.key === 'RANGE' && range.from && range.to
                    ? `${range.from.getDate()}/${range.from.getMonth() + 1} - ${range.to.getDate()}/${range.to.getMonth() + 1}`
                    : f.label}
                </Text>
                {f.key === 'RANGE' ? (
                  <ChevronDown size={rs(13)} color={active ? C.green : C.body} style={{ marginLeft: rs(3) }} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: S.gutter, paddingTop: S.sm }}>
          <Text className="text-danger font-bold" style={{ fontSize: T.rowSub }}>{error}</Text>
        </View>
      ) : null}

      {loading && !statement.entries.length ? (
        <Loader label="Loading statement..." />
      ) : (
        <FlatList
          data={view.rows}
          keyExtractor={(e) => e.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: S.xl, flexGrow: 1 }}
          ListHeaderComponent={
            <>
              {/* The figure the whole screen is about. */}
              <View className="items-center" style={{ paddingVertical: S.lg }}>
                <Text
                  className="font-extrabold"
                  style={{ fontSize: T.hero, color: tone.danger ? C.red : C.green }}
                >
                  {money(statement.balance)}
                </Text>
                <Text style={{ fontSize: T.rowSub, color: C.muted, marginTop: S.tight }}>
                  Balance | {rangeLabel}
                </Text>
              </View>

              {/* Column heads double as the window's totals — the two numbers
                  an owner reads first, above the rows that justify them. */}
              <View
                className="flex-row items-center"
                style={{
                  backgroundColor: C.hairline,
                  paddingHorizontal: S.gutter,
                  paddingVertical: S.sm,
                }}
              >
                <Text className="font-bold" style={{ width: rs(52), fontSize: T.rowSub, color: C.body }}>Date</Text>
                <View className="flex-1" />
                <View style={{ width: rs(78) }}>
                  <Text className="font-bold text-right" style={{ fontSize: T.rowSub, color: C.body }}>
                    Payment ({view.paymentCount})
                  </Text>
                  <Text className="font-extrabold text-right" style={{ fontSize: T.rowSub, color: C.green }}>
                    {money(view.paymentTotal)}
                  </Text>
                </View>
                <View style={{ width: rs(78) }}>
                  <Text className="font-bold text-right" style={{ fontSize: T.rowSub, color: C.body }}>
                    Credit ({view.creditCount})
                  </Text>
                  <Text className="font-extrabold text-right" style={{ fontSize: T.rowSub, color: C.red }}>
                    {money(view.creditTotal)}
                  </Text>
                </View>
              </View>
            </>
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: S.xl, paddingTop: S.xl }}>
              <Text className="text-center font-bold" style={{ fontSize: T.rowTitle, color: C.ink }}>
                Nothing in this period
              </Text>
              <Text
                className="text-center"
                style={{ fontSize: T.rowSub, color: C.muted, marginTop: S.xs, lineHeight: T.rowSub * 1.5 }}
              >
                Pick a wider period above, or record an entry on the account.
              </Text>
            </View>
          }
        />
      )}

      {/* ── download / share ─────────────────────────────────────────── */}
      <View
        className="flex-row bg-card"
        style={{
          borderTopWidth: 1,
          borderTopColor: C.hairline,
          paddingHorizontal: S.gutter,
          paddingTop: S.sm,
          paddingBottom: bottomInset(insets.bottom, S.sm),
          gap: S.sm,
        }}
      >
        <Pressable
          onPress={() => setSheet(true)}
          disabled={!!exporting || !view.rows.length}
          className="flex-1 flex-row items-center justify-center active:opacity-85"
          style={{
            borderWidth: 1,
            borderColor: C.green,
            borderRadius: SIZE.radius,
            paddingVertical: S.md,
            minHeight: SIZE.buttonMin,
            opacity: view.rows.length ? 1 : 0.45,
          }}
        >
          {exporting === 'save' ? (
            <ActivityIndicator size="small" color={C.green} />
          ) : (
            <>
              <Download size={rs(16)} color={C.green} />
              <Text className="font-extrabold" style={{ fontSize: T.button, color: C.green, marginLeft: S.xs }}>
                Download
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={shareStatement}
          disabled={!!exporting || !view.rows.length}
          className="flex-1 flex-row items-center justify-center active:opacity-85"
          style={{
            backgroundColor: C.green,
            borderRadius: SIZE.radius,
            paddingVertical: S.md,
            minHeight: SIZE.buttonMin,
            opacity: view.rows.length ? 1 : 0.45,
          }}
        >
          {exporting === 'share' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Share2 size={rs(16)} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ fontSize: T.button, marginLeft: S.xs }}>
                Share
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Excel / PDF chooser ──────────────────────────────────────── */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable
          onPress={() => setSheet(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)' }}
        >
          <Pressable
            onPress={() => {}}
            className="bg-card"
            style={{
              borderTopLeftRadius: SIZE.radius,
              borderTopRightRadius: SIZE.radius,
              paddingTop: S.lg,
              paddingBottom: bottomInset(insets.bottom, S.lg),
              paddingHorizontal: S.xl,
            }}
          >
            <Text
              className="text-center font-bold"
              style={{ fontSize: T.rowSub, color: C.muted, marginBottom: S.lg }}
            >
              Save this statement to your phone
            </Text>
            <View className="flex-row justify-center" style={{ gap: S.xl }}>
              <ExportButton icon={FileSpreadsheet} label="Excel" onPress={() => runExport('csv', 'save')} />
              <ExportButton icon={FileText} label="PDF" onPress={() => runExport('pdf', 'save')} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── custom range: From, then To ──────────────────────────────── */}
      <LedgerDateSheet
        visible={picking === 'from'}
        value={range.from || new Date()}
        tint={C.green}
        title="From"
        onClose={() => setPicking(null)}
        onPick={(d) => { setRange({ from: d, to: null }); setPicking('to'); }}
      />
      <LedgerDateSheet
        visible={picking === 'to'}
        value={range.to || range.from || new Date()}
        tint={C.green}
        title="To"
        minDate={range.from || undefined}
        onClose={() => setPicking(null)}
        onPick={(d) => { setRange((r) => ({ ...r, to: d })); setFilter('RANGE'); setPicking(null); }}
      />
    </View>
  );
}

function ExportButton({ icon: Icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} className="items-center active:opacity-70">
      <View
        className="items-center justify-center"
        style={{
          height: rs(54), width: rs(54), borderRadius: rs(27), backgroundColor: C.greenSoft,
        }}
      >
        <Icon size={rs(24)} color={C.green} />
      </View>
      <Text className="font-bold" style={{ fontSize: T.rowSub, color: C.ink, marginTop: S.xs }}>{label}</Text>
    </Pressable>
  );
}
