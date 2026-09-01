import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Clock,
  Hand,
  CalendarX,
  Users,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';

const GREEN       = '#087A0A';
const GREEN_LIGHT = '#16BB05';
const GREEN_DARK  = '#087A0A';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad2(n) { return String(n).padStart(2, '0'); }

// Each mode focuses one metric pulled from the per-employee attendance summary.
const MODE_META = {
  attendance: { title: 'Attendance',  icon: CalendarCheck, key: 'presentDays',     unit: 'days', accent: GREEN_DARK },
  late:       { title: 'Late',        icon: Clock,         key: 'lateHours',       unit: 'hrs',  accent: '#B45309' },
  permission: { title: 'Permission',  icon: Hand,          key: 'permissionCount', unit: '',     accent: '#B45309' },
  leave:      { title: 'Leave',       icon: CalendarX,     key: 'leaveDays',       unit: 'days', accent: '#16BB05' },
};

const num = (v) => (v == null ? 0 : Number(v) || 0);

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

/**
 * All-staff report — one screen, four modes (attendance / late / permission /
 * leave). Aggregates the existing per-employee attendance endpoint
 * (/technicians/{id}/attendance) across the whole team for the selected month,
 * so no new backend endpoint is needed. Tapping a row drills into that
 * employee's full attendance calendar.
 */
export default function OwnerStaffReportScreen({ navigation, route }) {
  const mode = route?.params?.mode || 'attendance';
  const meta = MODE_META[mode] || MODE_META.attendance;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const emps = await ticketApi.get('/technicians');
      const list = Array.isArray(emps) ? emps : [];
      const results = await Promise.all(
        list.map((e) =>
          ticketApi.get(`/technicians/${e.id}/attendance`, { query: { month, year } })
            .then((data) => ({ emp: e, data }))
            .catch(() => ({ emp: e, data: null })),
        ),
      );
      setRows(results);
    } catch (e) {
      setError(e?.message || 'Failed to load report');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  // Sort so the rows most relevant to the active mode bubble to the top.
  const sorted = useMemo(() => {
    const focal = (r) => num(r.data?.[meta.key]);
    return [...rows].sort((a, b) => focal(b) - focal(a));
  }, [rows, meta.key]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + num(r.data?.[meta.key]), 0),
    [rows, meta.key],
  );

  const Stat = ({ label, value, focal }) => (
    <View className="items-center px-2">
      <Text className="text-[15px] font-extrabold" style={{ color: focal ? meta.accent : '#172117' }}>
        {value}
      </Text>
      <Text className="text-[9px] font-bold mt-0.5" style={{ color: focal ? meta.accent : '#8FA08F' }}>
        {label}
      </Text>
    </View>
  );

  const renderItem = ({ item }) => {
    const e = item.emp || {};
    const d = item.data || {};
    const initials = String(e.name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return (
      <Pressable
        onPress={() => navigation.navigate('OwnerEmployeeAttendance', { employee: e })}
        className="bg-white rounded-2xl p-3 mb-2.5 flex-row items-center active:opacity-80"
        style={cardShadow}
      >
        <View
          className="h-11 w-11 rounded-2xl items-center justify-center mr-3"
          style={{ backgroundColor: '#F0F8EF' }}
        >
          <Text className="text-[13px] font-extrabold" style={{ color: GREEN_DARK }}>{initials}</Text>
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-[14px] font-extrabold text-gray-900" numberOfLines={1}>{e.name || 'Staff'}</Text>
          {e.roleLabel ? (
            <Text className="text-[11px] text-gray-500" numberOfLines={1}>{e.roleLabel}</Text>
          ) : null}
        </View>
        <View className="flex-row items-center">
          <Stat label="Present" value={num(d.presentDays)} focal={mode === 'attendance'} />
          <Stat label="Late" value={num(d.lateHours)} focal={mode === 'late'} />
          <Stat label="Perm" value={num(d.permissionCount)} focal={mode === 'permission'} />
          <Stat label="Leave" value={num(d.leaveDays)} focal={mode === 'leave'} />
          <ChevronRight size={16} color="#CBD5CB" style={{ marginLeft: 2 }} />
        </View>
      </Pressable>
    );
  };

  const HeaderIcon = meta.icon;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{ backgroundColor: '#FFFFFF', paddingTop: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
        >
          <View className="flex-row items-center" style={{ paddingHorizontal: 16 }}>
            <Pressable
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
              hitSlop={10}
              className="h-9 w-9 rounded-full items-center justify-center"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <ChevronLeft size={20} color="#172117" />
            </Pressable>
            <View className="flex-1 flex-row items-center justify-center">
              <HeaderIcon size={16} color="#172117" />
              <Text className="text-center text-text text-[18px] font-extrabold ml-1.5">{meta.title}</Text>
            </View>
            <View className="h-9 w-9" />
          </View>

          {/* Month switcher + total */}
          <View className="flex-row items-center justify-between mt-3" style={{ paddingHorizontal: 16 }}>
            <View className="flex-row items-center bg-surface-muted rounded-full px-1 py-1">
              <Pressable onPress={() => stepMonth(-1)} hitSlop={8} className="h-7 w-7 items-center justify-center">
                <ChevronLeft size={16} color="#172117" />
              </Pressable>
              <Text className="text-text text-[12.5px] font-extrabold px-1.5">{MONTHS[month - 1]} {year}</Text>
              <Pressable onPress={() => stepMonth(1)} hitSlop={8} className="h-7 w-7 items-center justify-center">
                <ChevronRight size={16} color="#172117" />
              </Pressable>
            </View>
            <View className="bg-surface-muted rounded-full px-3 py-1.5">
              <Text className="text-[11px] font-extrabold" style={{ color: GREEN_DARK }}>
                Total {meta.title}: {total}{meta.unit ? ` ${meta.unit}` : ''}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {error ? (
        <View className="px-4 mt-3">
          <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}>
            <Text className="text-[12.5px] font-semibold" style={{ color: '#B91C1C' }}>{error}</Text>
          </View>
        </View>
      ) : null}

      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={GREEN} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.emp?.id || String(Math.random())}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[GREEN]} tintColor={GREEN} />
          }
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 }}
          ListEmptyComponent={
            <View className="items-center pt-20 px-8">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#E6F7E3' }}>
                <Users size={32} color={GREEN_DARK} />
              </View>
              <Text className="text-[15px] font-extrabold text-gray-700">No staff yet</Text>
              <Text className="text-[12px] text-gray-400 mt-2 text-center leading-5">
                Add employees to see their {meta.title.toLowerCase()} here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
