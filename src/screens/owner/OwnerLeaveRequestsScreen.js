import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle2,
  XCircle,
  User,
  CalendarDays,
  ChevronLeft,
  Clock,
  ClipboardList,
  Check,
  Sparkles,
  Search,
  UserPlus,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// Teal rebrand: one deep brand teal, plus a lighter stop so the Approve
// gradient keeps its depth (two identical stops would render flat) and a
// light teal for the empty-state illustration.
const BRAND_GREEN      = '#00695C';
const BRAND_GREEN_DARK = '#004C40';
const BRAND_TEAL_LIGHT = '#7FB8AE';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
};

const STATUS_OPTIONS = [
  { value: 'PENDING',  label: 'Pending',  accent: '#D97706',        tint: '#FEF3C7', Icon: Clock },
  { value: 'APPROVED', label: 'Approved', accent: BRAND_GREEN_DARK, tint: '#E6F7E3', Icon: CheckCircle2 },
  { value: 'REJECTED', label: 'Rejected', accent: '#B91C1C',        tint: '#FEE2E2', Icon: XCircle },
];

function formatDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OwnerLeaveRequestsScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [status, setStatus] = useState('PENDING');
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const endpoint = status === 'PENDING'
        ? '/technicians/leaves/pending'
        : `/technicians/leaves?status=${status}`;
      const res = await ticketApi.get(endpoint);
      setList(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e?.message || 'Failed to load leave requests');
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const respond = async (item, decision) => {
    setActionId(item.id);
    try {
      await ticketApi.patch(`/technicians/${item.technicianId}/leaves/${item.id}`, {
        body: { status: decision },
      });
      load(true);
    } catch (e) {
      notify('Error', e?.message ?? `Failed to ${decision.toLowerCase()}`, { preset: 'error', haptic: 'error' });
    } finally {
      setActionId(null);
    }
  };

  const activeMeta = STATUS_OPTIONS.find((o) => o.value === status);

  // Tablet: cap the column and centre it, matching the employee report
  // screens. Request cards stretched to 1024pt put the employee name and
  // its status pill at opposite edges. Phones keep contentW undefined.
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={[{
            backgroundColor: '#FFFFFF',
            paddingTop: rs(6),
            paddingBottom: rs(12),
            paddingHorizontal: rs(16),
          }, capStyle]}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
            >
              <ChevronLeft size={rs(22)} color="#172117" />
            </TouchableOpacity>
            <Text className="flex-1 text-text font-extrabold" style={{ fontSize: rf(19) }} numberOfLines={1}>
              Leave Requests
            </Text>
            <View
              className="flex-row items-center px-3 py-1.5 rounded-full"
              style={{ backgroundColor: '#F0F8EF' }}
            >
              <Clock size={rs(13)} color="#172117" />
              <Text className="ml-1.5 text-text font-extrabold" style={{ fontSize: rf(11.5) }}>
                {list.length} {activeMeta?.label || 'Total'}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Filter chip row — sits in the white header band */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingHorizontal: rs(16),
          paddingTop: rs(4),
          paddingBottom: rs(14),
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
      <View className="flex-row" style={capStyle}>
        {STATUS_OPTIONS.map((opt) => {
          const active = opt.value === status;
          const ChipIcon = opt.Icon;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setStatus(opt.value)}
              className="flex-row items-center px-3.5 py-2 rounded-full mr-2.5"
              style={{
                backgroundColor: active ? opt.accent : '#FFFFFF',
                borderWidth: 1.5,
                borderColor: opt.accent,
              }}
            >
              <ChipIcon size={rs(15)} color={active ? '#FFFFFF' : opt.accent} />
              <Text
                className="ml-1.5 font-extrabold"
                style={{ fontSize: rf(12.5), color: active ? '#FFFFFF' : opt.accent }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      </View>

      {loading && list.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
        </View>
      ) : error ? (
        <View className="px-4 mt-4">
          <View
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
          >
            <Text className="font-semibold" style={{ fontSize: rf(12), color: '#B91C1C' }}>
              {error}
            </Text>
            <Pressable
              onPress={() => load()}
              className="mt-2 self-start px-3 py-1.5 rounded-full"
              style={{ backgroundColor: '#B91C1C' }}
            >
              <Text className="text-white font-extrabold" style={{ fontSize: rf(10.5) }}>Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : list.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5">
          <View className="bg-white rounded-3xl px-6 py-8 items-center w-full" style={[cardShadow, contentW ? { maxWidth: rs(420) } : null]}>
            {/* Illustration — faint clipboard with a checkmark badge */}
            <View style={{ width: rs(170), height: rs(130), alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <View style={{ position: 'absolute', top: rs(4), left: rs(26) }}><Sparkles size={rs(16)} color={BRAND_TEAL_LIGHT} /></View>
              <View style={{ position: 'absolute', top: rs(28), right: rs(28) }}><Sparkles size={rs(13)} color="#C8EEBF" /></View>
              <View style={{ position: 'absolute', bottom: rs(20), right: rs(22) }}><Search size={rs(24)} color="#E6F7E3" /></View>
              <View
                className="rounded-3xl items-center justify-center"
                style={{ width: rs(104), height: rs(104), backgroundColor: '#F0F8EF' }}
              >
                <ClipboardList size={rs(54)} color={BRAND_TEAL_LIGHT} strokeWidth={1.8} />
              </View>
              {/* Amber checkmark badge overlapping the clipboard */}
              <View style={{ position: 'absolute', bottom: rs(8), alignSelf: 'center' }}>
                <View className="rounded-full items-center justify-center" style={{ width: rs(58), height: rs(58), backgroundColor: '#FEF3C7' }}>
                  <View
                    className="rounded-full items-center justify-center"
                    style={{ width: rs(40), height: rs(40), borderWidth: 2.5, borderColor: '#B45309' }}
                  >
                    <Check size={rs(20)} color="#B45309" strokeWidth={3} />
                  </View>
                </View>
              </View>
            </View>

            <Text className="font-extrabold text-gray-900 mt-3" style={{ fontSize: rf(16) }}>
              No {activeMeta?.label.toLowerCase() || 'matching'} leaves
            </Text>
            <Text className="text-gray-500 mt-2 text-center leading-5" style={{ fontSize: rf(12.5) }}>
              {status === 'PENDING'
                ? 'New leave requests from your team will appear here.'
                : `No ${activeMeta?.label.toLowerCase()} leaves to show.`}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('OwnerEmployeeAdd')}
              className="flex-row items-center justify-center rounded-2xl mt-5 px-6 py-3"
              style={{ borderWidth: 1.5, borderColor: BRAND_GREEN_DARK }}
            >
              <UserPlus size={rs(16)} color={BRAND_GREEN_DARK} />
              <Text className="ml-2 font-extrabold" style={{ fontSize: rf(13), color: BRAND_GREEN_DARK }}>
                Add Employee
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: rs(14), paddingTop: rs(12), paddingBottom: rs(24) }, capStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={BRAND_GREEN_DARK}
              colors={[BRAND_GREEN_DARK]}
            />
          }
        >
          {list.map((item) => {
            const meta = STATUS_OPTIONS.find((o) => o.value === (item.status || 'PENDING'));
            const acting = actionId === item.id;
            return (
              <View
                key={item.id}
                className="bg-white rounded-2xl p-4 mb-3"
                style={cardShadow}
              >
                <View className="flex-row items-start">
                  <View
                    style={{
                      width: rs(44), height: rs(44), borderRadius: rs(14),
                      backgroundColor: '#E6F7E3',
                      alignItems: 'center', justifyContent: 'center',
                      marginRight: rs(12),
                    }}
                  >
                    <User size={rs(20)} color={BRAND_GREEN_DARK} strokeWidth={2.2} />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="font-extrabold text-gray-900" style={{ fontSize: rf(13) }} numberOfLines={1}>
                      {item.technicianName ?? 'Employee'}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <CalendarDays size={rs(12)} color="#8FA08F" />
                      <Text className="ml-1.5 text-gray-500" style={{ fontSize: rf(11) }}>
                        {formatDate(item.startDate)} – {formatDate(item.endDate)}
                      </Text>
                    </View>
                    {item.appliedDaysLabel ? (
                      <View className="flex-row items-center mt-1">
                        <Clock size={rs(11)} color="#8FA08F" />
                        <Text className="ml-1.5 text-gray-500" style={{ fontSize: rf(10.5) }}>
                          {item.appliedDaysLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View
                    className="px-2 py-1 rounded-full"
                    style={{ backgroundColor: meta?.tint || '#FEF3C7' }}
                  >
                    <Text
                      className="font-extrabold"
                      style={{ fontSize: rf(10), color: meta?.accent || '#B45309', letterSpacing: 0.3 }}
                    >
                      {(item.status || 'PENDING').toUpperCase()}
                    </Text>
                  </View>
                </View>

                {item.reason ? (
                  <View
                    className="mt-3 p-3 rounded-xl"
                    style={{ backgroundColor: '#F7FAF7' }}
                  >
                    <Text
                      className="uppercase font-extrabold text-gray-500"
                      style={{ fontSize: rf(9.5), letterSpacing: 0.8 }}
                    >
                      Reason
                    </Text>
                    <Text className="text-gray-700 mt-1 leading-5" style={{ fontSize: rf(12) }}>
                      {item.reason}
                    </Text>
                  </View>
                ) : null}

                {status === 'PENDING' ? (
                  <View className="flex-row mt-3">
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => respond(item, 'APPROVED')}
                      disabled={actionId != null}
                      className="flex-1 mr-2"
                      style={cardShadow}
                    >
                      <LinearGradient
                        colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderRadius: rs(14),
                          paddingVertical: rs(11),
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: actionId != null && !acting ? 0.6 : 1,
                        }}
                      >
                        {acting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <CheckCircle2 size={rs(14)} color="#FFFFFF" />
                        )}
                        <Text className="ml-2 text-white font-extrabold" style={{ fontSize: rf(12.5) }}>
                          Approve
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => respond(item, 'REJECTED')}
                      disabled={actionId != null}
                      className="flex-1 ml-2 rounded-2xl py-3 flex-row items-center justify-center"
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1.5,
                        borderColor: '#FCA5A5',
                        opacity: actionId != null && !acting ? 0.6 : 1,
                      }}
                    >
                      <XCircle size={rs(14)} color="#B91C1C" />
                      <Text className="ml-2 font-extrabold" style={{ fontSize: rf(12.5), color: '#B91C1C' }}>
                        Deny
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
