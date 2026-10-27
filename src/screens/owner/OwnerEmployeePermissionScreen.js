import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StatusBar, StyleSheet, Text, View } from 'react-native';
import { FileText, Hourglass, LogIn, LogOut, StickyNote, UserX, WifiOff } from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import {
  RC,
  useReportGeometry,
  ReportHeader,
  StatusRail,
  MonthBar,
  ReportTile,
  TileDisc,
  tileText,
  ReportEmpty,
  reportStyles,
} from '../../components/report/ReportRail';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// In / Out chip tints (brand green / red families).
const GREEN_TINT = '#EDF4E7';
const GREEN_TEXT = '#476B26';
const RED_TINT = '#FDEBEA';
const RED_TEXT = '#C81E1A';

function time12(t) {
  if (!t) return null;
  const [hh, mm] = String(t).split(':');
  const h = Number(hh);
  if (Number.isNaN(h)) return null;
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm || '00').padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dateLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// Permission days are attendance records with no approval status, so the rail
// splits them by what each record actually holds: whether a note was left.
const hasNotes = (d) => !!String(d?.notes || '').trim();
const BUCKETS = [
  { key: 'All',     label: 'All',        tone: RC.teal, Icon: Hourglass,  match: () => true,          empty: 'No permissions recorded this month.\nUse the arrows above to view another month.' },
  { key: 'Notes',   label: 'With Notes', tone: RC.blue, Icon: StickyNote, match: (d) => hasNotes(d),  empty: 'No permissions with notes this month.' },
  { key: 'NoNotes', label: 'No Notes',   tone: RC.orange, Icon: FileText,   match: (d) => !hasNotes(d), empty: 'No permissions without notes this month.' },
];

/** Employee-wise Permission report: the month's PERMISSION days from attendance. */
export default function OwnerEmployeePermissionScreen({ route, navigation }) {
  const { isSmall, railW, numCols, capW, bottomPad } = useReportGeometry();
  const employee = route.params?.employee;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bucket, setBucket] = useState('All');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!employee?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setData(await ticketApi.get(`/technicians/${employee.id}/attendance`, { query: { month, year } }));
    } catch (e) {
      setData(null);
      setError(e?.message || 'Could not load permissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(
    () => (data?.dailyRecords || [])
      .filter((d) => String(d.status || '').toUpperCase() === 'PERMISSION')
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [data],
  );

  const counts = useMemo(() => {
    const c = {};
    BUCKETS.forEach((b) => { c[b.key] = rows.filter((d) => b.match(d)).length; });
    return c;
  }, [rows]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const header = (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ReportHeader
        title="Permission Report"
        subtitle={employee ? (employee.name || employee.fullName || 'Employee') : null}
        onBack={() => navigation.goBack()}
      />
    </>
  );

  if (!employee) {
    return (
      <View style={reportStyles.screen}>
        {header}
        <View style={styles.center}>
          <ReportEmpty text="Employee not found" Icon={UserX} tone={RC.red} />
        </View>
      </View>
    );
  }

  const count = data?.permissionCount ?? rows.length;
  const active = BUCKETS.find((b) => b.key === bucket) || BUCKETS[0];
  const visible = rows.filter((d) => active.match(d));
  const shown = loading || error ? [] : visible;
  const row = numCols === 1;
  const railItems = BUCKETS.map((b) => ({ key: b.key, label: b.label, tone: b.tone, Icon: b.Icon, count: counts[b.key] }));
  // Pad to an even count in 2-col mode so the last lone tile stays half-width.
  const listData = numCols > 1 && shown.length % 2 === 1 ? [...shown, { date: '__ghost__', _ghost: true }] : shown;

  const renderItem = ({ item }) => {
    if (item._ghost) return <View style={{ flex: 1 }} />;
    return <PermissionTile d={item} row={row} />;
  };

  const emptyNode = loading ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={RC.teal} />
      <Text style={styles.stateText}>Loading permissions…</Text>
    </View>
  ) : error ? (
    <ReportEmpty text={`${error}\nPull down to try again.`} Icon={WifiOff} tone={RC.red} />
  ) : (
    <ReportEmpty text={active.empty} Icon={active.Icon} tone={active.tone} />
  );

  return (
    <View style={reportStyles.screen}>
      {header}

      {/* Left: notes rail · Right: month + permission tiles */}
      <View style={reportStyles.body}>
        <StatusRail
          items={railItems}
          active={bucket}
          onSelect={setBucket}
          width={railW}
          isSmall={isSmall}
          bottomPad={bottomPad}
        />

        <View style={styles.main}>
          <MonthBar
            label={`${MONTHS[month - 1]} ${year}`}
            sub={`${count} ${count === 1 ? 'permission' : 'permissions'}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            nextDisabled={isCurrentMonth}
            capW={capW}
          />

          <FlatList
            data={listData}
            key={String(numCols)}
            numColumns={numCols}
            columnWrapperStyle={numCols > 1 ? styles.colGap : undefined}
            keyExtractor={(item, index) => String(item.date ?? index)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            refreshControl={(
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={RC.teal}
                colors={[RC.teal]}
              />
            )}
            contentContainerStyle={[reportStyles.listPad, { paddingBottom: bottomPad }, capW]}
            ListEmptyComponent={emptyNode}
          />
        </View>
      </View>
    </View>
  );
}

// Jobs-style permission tile: hourglass disc + "Permission" tag, then the day,
// the note (if any) and the In / Out punch times.
function PermissionTile({ d, row }) {
  const inT = time12(d.checkInTime);
  const outT = time12(d.checkOutTime);
  const notes = hasNotes(d) ? String(d.notes) : null;
  return (
    <ReportTile
      row={row}
      panel={<TileDisc Icon={Hourglass} tone={notes ? RC.blue : RC.orange} row={row} />}
      tag="Permission"
      tagColor={notes ? RC.blue : RC.orange}
    >
      <Text style={tileText.ref} numberOfLines={2}>{dateLabel(d.date)}</Text>
      {notes ? (
        <Text style={tileText.title}>{notes}</Text>
      ) : (
        <Text style={[tileText.sub, styles.noNotes]} numberOfLines={1}>No notes added</Text>
      )}
      {inT || outT ? (
        <View style={styles.times}>
          <View style={[styles.timeChip, { backgroundColor: GREEN_TINT }]}>
            <LogIn size={12} color={GREEN_TEXT} strokeWidth={2.2} />
            <Text style={styles.timeText} numberOfLines={1}>
              In: <Text style={[styles.timeVal, { color: GREEN_TEXT }]}>{inT || '-'}</Text>
            </Text>
          </View>
          <View style={[styles.timeChip, { backgroundColor: RED_TINT }]}>
            <LogOut size={12} color={RED_TEXT} strokeWidth={2.2} />
            <Text style={styles.timeText} numberOfLines={1}>
              Out: <Text style={[styles.timeVal, { color: RED_TEXT }]}>{outT || '-'}</Text>
            </Text>
          </View>
        </View>
      ) : null}
    </ReportTile>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, minWidth: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  colGap: { gap: 12 },

  stateBox: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  stateText: { fontSize: 12, color: RC.muted, textAlign: 'center' },

  noNotes: { marginTop: 4 },

  // In / Out chips — wrap to one per line when the column is narrow.
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    maxWidth: '100%',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  timeText: { flexShrink: 1, fontSize: 11, color: RC.muted, fontWeight: '600' },
  timeVal: { fontWeight: '800' },
});
