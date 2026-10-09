import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  XCircle,
  User,
  CalendarDays,
  ChevronLeft,
  Clock,
  ClipboardList,
  UserPlus,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette.
const GREEN = '#09AD2A';
const GREEN_DEEP = '#078F23';
const MINT = '#EAF8EC';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const PAGE_BG = '#F8F8F8';
const NEUTRAL = '#F3F3F3';
const BORDER = '#E6E6E6';
const RED = '#F84141';

const cardShadow = {
  shadowColor: INK,
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// accent = icon / dot, text = readable label colour, tint = pill background.
const STATUS_OPTIONS = [
  { value: 'PENDING',  label: 'Pending',  accent: '#F3BF23', text: '#8A6A00', tint: '#FFF8E1', Icon: Clock },
  { value: 'APPROVED', label: 'Approved', accent: GREEN,     text: GREEN_DEEP, tint: MINT,     Icon: CheckCircle2 },
  { value: 'REJECTED', label: 'Rejected', accent: RED,       text: '#D63232', tint: '#FEECEC', Icon: XCircle },
];

function formatDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
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
  const ActiveIcon = activeMeta?.Icon || Clock;

  // Tablet: cap the column and centre it, matching the employee report
  // screens. Phones keep contentW undefined.
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header + status filter — one white band */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <View style={[{ paddingTop: 6, paddingBottom: 12, paddingHorizontal: 14 }, capStyle]}>
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={6}
              style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG, borderWidth: 1, borderColor: BORDER }}
            >
              <ChevronLeft size={19} color={INK} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-extrabold" style={{ fontSize: 17, color: INK }} numberOfLines={1}>
                Leave Requests
              </Text>
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                Review and manage your team's leave
              </Text>
            </View>
            <View
              className="flex-row items-center"
              style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: activeMeta?.tint || MINT }}
            >
              <ActiveIcon size={12} color={activeMeta?.text || GREEN_DEEP} />
              <Text className="font-extrabold" style={{ marginLeft: 5, fontSize: 11, color: activeMeta?.text || GREEN_DEEP }}>
                {list.length} {activeMeta?.label || 'Total'}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Status filter — on the page, below the header */}
      <View style={[{ paddingHorizontal: 14, paddingTop: 12 }, capStyle]}>
        <View className="flex-row" style={{ padding: 3, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER }}>
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === status;
            const ChipIcon = opt.Icon;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setStatus(opt.value)}
                activeOpacity={0.8}
                className="flex-row items-center justify-center"
                style={{ flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: active ? opt.tint : 'transparent' }}
              >
                <ChipIcon size={13} color={active ? opt.accent : MUTED} />
                <Text
                  style={{ marginLeft: 5, fontSize: 12, fontWeight: active ? '800' : '600', color: active ? opt.text : MUTED }}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading && list.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: 14, paddingTop: 12, flexGrow: 1 }, capStyle]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} colors={[GREEN]} />}
        >
          <View style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD0D0' }}>
            <Text className="font-semibold" style={{ fontSize: 12, color: '#D63232' }}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => load()}
              activeOpacity={0.85}
              style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: RED }}
            >
              <Text className="font-extrabold" style={{ fontSize: 11, color: '#FFFFFF' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : list.length === 0 ? (
        // A ScrollView (not a plain View) so pull-to-refresh works on the
        // empty state too — that is exactly when a new request is awaited.
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} colors={[GREEN]} />}
        >
          <View
            className="items-center w-full"
            style={[{ maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 22, borderWidth: 1, borderColor: NEUTRAL }, cardShadow]}
          >
            {/* Clipboard in a mint well with the active filter's status badge */}
            <View style={{ width: 76, height: 76 }}>
              <View className="items-center justify-center" style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: MINT }}>
                <ClipboardList size={32} color={GREEN} strokeWidth={1.9} />
              </View>
              <View
                className="items-center justify-center"
                style={{ position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: activeMeta?.tint || MINT }}
              >
                <ActiveIcon size={15} color={activeMeta?.accent || GREEN} />
              </View>
            </View>

            <Text className="font-extrabold" style={{ marginTop: 12, fontSize: 15, color: INK }}>
              No {activeMeta?.label.toLowerCase() || 'matching'} leaves
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: MUTED, textAlign: 'center' }}>
              {status === 'PENDING'
                ? 'New leave requests from your team will appear here.'
                : `No ${activeMeta?.label.toLowerCase()} leaves to show.`}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('OwnerEmployeeAdd')}
              className="flex-row items-center justify-center"
              style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, backgroundColor: GREEN }}
            >
              <UserPlus size={15} color="#FFFFFF" />
              <Text className="font-extrabold" style={{ marginLeft: 7, fontSize: 13, color: '#FFFFFF' }}>
                Add Employee
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }, capStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={GREEN}
              colors={[GREEN]}
            />
          }
        >
          {list.map((item) => {
            const meta = STATUS_OPTIONS.find((o) => o.value === (item.status || 'PENDING')) || STATUS_OPTIONS[0];
            const acting = actionId === item.id;
            const ini = initials(item.technicianName);
            return (
              <View
                key={item.id}
                style={[{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: NEUTRAL }, cardShadow]}
              >
                <View className="flex-row items-center">
                  <View className="items-center justify-center" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: MINT, marginRight: 10 }}>
                    {ini ? (
                      <Text className="font-extrabold" style={{ fontSize: 13, color: GREEN_DEEP }}>{ini}</Text>
                    ) : (
                      <User size={17} color={GREEN_DEEP} strokeWidth={2.2} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <Text className="font-extrabold" style={{ fontSize: 13, color: INK }} numberOfLines={1}>
                      {item.technicianName ?? 'Employee'}
                    </Text>
                    <View className="flex-row items-center" style={{ marginTop: 3 }}>
                      <CalendarDays size={12} color={MUTED} />
                      <Text style={{ marginLeft: 5, fontSize: 11, color: MUTED }} numberOfLines={1}>
                        {formatDate(item.startDate)} – {formatDate(item.endDate)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center" style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: meta.tint }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.accent, marginRight: 5 }} />
                    <Text className="font-extrabold" style={{ fontSize: 10, color: meta.text }}>
                      {meta.label}
                    </Text>
                  </View>
                </View>

                {item.appliedDaysLabel || item.reason ? (
                  <View style={{ marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: NEUTRAL }}>
                    {item.appliedDaysLabel ? (
                      <View className="flex-row items-center" style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: PAGE_BG }}>
                        <Clock size={11} color={MUTED} />
                        <Text className="font-bold" style={{ marginLeft: 5, fontSize: 11, color: INK }}>
                          {item.appliedDaysLabel}
                        </Text>
                      </View>
                    ) : null}
                    {item.reason ? (
                      <View style={{ marginTop: item.appliedDaysLabel ? 8 : 0 }}>
                        <Text className="uppercase font-extrabold" style={{ fontSize: 10, letterSpacing: 0.6, color: MUTED }}>
                          Reason
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 17, color: INK }}>
                          {item.reason}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {status === 'PENDING' ? (
                  <View className="flex-row" style={{ marginTop: 10 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => respond(item, 'REJECTED')}
                      disabled={actionId != null}
                      className="flex-row items-center justify-center"
                      style={{
                        flex: 1, marginRight: 8, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FBD0D0',
                        opacity: actionId != null && !acting ? 0.6 : 1,
                      }}
                    >
                      <XCircle size={14} color={RED} />
                      <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 12, color: '#D63232' }}>
                        Deny
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => respond(item, 'APPROVED')}
                      disabled={actionId != null}
                      className="flex-row items-center justify-center"
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: GREEN,
                        opacity: actionId != null && !acting ? 0.6 : 1,
                      }}
                    >
                      {acting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <CheckCircle2 size={14} color="#FFFFFF" />
                      )}
                      <Text className="font-extrabold" style={{ marginLeft: 6, fontSize: 12, color: '#FFFFFF' }}>
                        Approve
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
