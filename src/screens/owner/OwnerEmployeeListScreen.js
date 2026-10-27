import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Users,
  Phone,
  Truck,
  Wrench,
  Info,
  ShieldCheck,
  Search,
  X,
  UserCog,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { ticketApi } from '../../api/client';
import { assignPickupPerson } from '../../api/orders';
import { notify } from '../../components/confirm';
import { FEATURE, asEntitlements, fetchEmployeeLimit } from '../../subscription/entitlements';
import { handleLimitError, showLimitPopup } from '../../subscription/limitPopup';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #035C6C (fills, rings, dots) with #035C6C for green
// text/icons; ink #111111; neutrals #F3F4F6 / #F3F4F6; yellow #F3BF23.
const BRAND_GREEN      = '#035C6C';
const BRAND_GREEN_DARK = '#035C6C';
const MINT             = '#E5F3F5';
const PAGE_BG          = '#F3F4F6';

const cardShadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const PICKUP_ROLE = 'Pickup Person';

// Role chips + filters (roles from Employee Detail: Technician, Staff, Pickup Person).
const ROLE_FILTERS = [
  { key: 'ALL', label: 'All', match: () => true },
  { key: 'TECH', label: 'Technician', match: (r) => /technician/i.test(r) },
  { key: 'STAFF', label: 'Staff', match: (r) => /^staff$/i.test(r.trim()) },
  { key: 'PICKUP', label: 'Pickup', match: (r) => r.toLowerCase() === PICKUP_ROLE.toLowerCase() },
];
const roleTone = (role) => {
  const r = String(role || '').toLowerCase();
  if (r === PICKUP_ROLE.toLowerCase()) return { fg: '#B45309', bg: '#FFF4DB', Icon: Truck };
  if (/technician/.test(r)) return { fg: '#035C6C', bg: '#E5F3F5', Icon: Wrench };
  return { fg: '#0571A8', bg: '#E1F1FA', Icon: UserCog };
};
const AVATAR_TONES = ['#035C6C', '#0788C9', '#609138', '#E08E00', '#1C3053', '#357D89'];
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Amber for "at the ceiling" — the shop is not broken, it is full.
const BRAND_AMBER      = '#F3BF23';
const BRAND_AMBER_DARK = '#8A6A00';

/**
 * "Used / allowance" ring.
 *
 * `total` is the SUBSCRIPTION LIMIT, not the number of employees on file. It
 * used to be the headcount, which made the ring read 4/4 — permanently full,
 * and silent about the fact that the plan only covers 3. A ring that divides a
 * number by itself cannot say anything.
 *
 * Unlimited plans get no ring: a fraction with no denominator is meaningless,
 * so BASIC shows the bare count instead.
 */
function ProgressRing({ active, total, size = 52, stroke = 5 }) {
  const unlimited = total == null;
  const over = !unlimited && active > total;
  const pct = unlimited ? 1 : (total > 0 ? Math.min(1, active / total) : 0);
  const full = !unlimited && active >= total;
  const tint = over || full ? BRAND_AMBER : BRAND_GREEN;

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * pct;
  const half = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={half} cy={half} r={r} stroke={MINT} strokeWidth={stroke} fill="none" />
        <Circle
          cx={half}
          cy={half}
          r={r}
          stroke={tint}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${half} ${half})`}
        />
      </Svg>
      <Text className="text-[11px] font-extrabold text-gray-900">
        {unlimited ? active : `${active}/${total}`}
      </Text>
    </View>
  );
}

export default function OwnerEmployeeListScreen({ navigation, route }) {
  // Live breakpoints from the app's responsive system: tablets (600+) get two
  // columns and a capped, centred column; phones stay single-column.
  const r = useResponsive();
  const cols = r.isTablet ? 2 : 1;
  const capStyle = r.isTablet ? { width: Math.min(r.width - 32, r.maxWidth('wide')), alignSelf: 'center' } : null;
  const assignFor = route?.params?.assignFor || null;
  const bookingId = route?.params?.bookingId || null;
  const isPickupPicker = assignFor === 'pickup' && !!bookingId;
  const [list, setList] = useState([]);
  // The shop's seat allowance, from the shared subscription module:
  // {limit, used, remaining, unlimited, allowed, expired, planName, message}.
  // Null until the first load resolves, and left null if the call fails — the
  // UI then shows the plain headcount rather than inventing a limit of its own.
  const [seats, setSeats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // Fetched together so the counter and its denominator always come from
      // the same moment. Settled, not all: the roster still renders if the
      // allowance lookup fails, it just renders without a ceiling.
      const [listRes, seatRes] = await Promise.allSettled([
        ticketApi.get('/technicians'),
        fetchEmployeeLimit(),
      ]);
      setList(listRes.status === 'fulfilled' && Array.isArray(listRes.value) ? listRes.value : []);
      setSeats(seatRes.status === 'fulfilled' ? seatRes.value : null);
    } catch {
      setList([]);
      setSeats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetched on every focus, never cached across screens: a trial that lapsed
  // overnight or a plan upgraded on another device has to take effect on the
  // next visit, not whenever a cache happens to expire.
  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const onToggleActive = async (tech, value) => {
    setToggling(tech.id);
    try {
      await ticketApi.patch(`/technicians/${tech.id}`, {
        body: { isAvailable: value },
      });
      setList((prev) =>
        prev.map((t) => (t.id === tech.id ? { ...t, isAvailable: value } : t))
      );
      // Activating consumes a seat and deactivating frees one, so the reading is
      // stale either way — refetch rather than adjusting it locally, since the
      // server is the one that decides.
      fetchEmployeeLimit().then(setSeats).catch(() => {});
    } catch (e) {
      // 409 = the plan refused the activation. Same dialog as a pre-emptive
      // block, so a refusal reads identically wherever it originated.
      if (await handleLimitError(navigation, FEATURE.EMPLOYEES, e, asEntitlements(FEATURE.EMPLOYEES, seats))) {
        fetchEmployeeLimit().then(setSeats).catch(() => {});
      } else {
        notify('Error', e.message || 'Failed to update', { preset: 'error', haptic: 'error' });
      }
    } finally {
      setToggling(null);
    }
  };

  /**
   * Spec rule: tapping Add Employee at the limit must NOT open the form. The
   * check happens here, before navigation, and re-reads the allowance rather
   * than trusting the value rendered on screen — which may be seconds old if a
   * coworker just hired someone.
   */
  const onAddEmployee = async () => {
    const fresh = (await fetchEmployeeLimit()) || seats;
    setSeats(fresh);
    if (fresh && fresh.allowed === false) {
      await showLimitPopup(navigation, FEATURE.EMPLOYEES, asEntitlements(FEATURE.EMPLOYEES, fresh));
      return;
    }
    navigation.navigate('OwnerEmployeeAdd');
  };

  const handlePickPickupPerson = async (tech) => {
    if (!isPickupPicker || assigning) return;
    setAssigning(tech.id);
    try {
      await assignPickupPerson(bookingId, {
        pickupPersonId: tech.id,
        pickupPersonName: tech.name || null,
        pickupPersonPhone: tech.phone || null,
      });
      navigation.goBack();
    } catch (e) {
      notify(
        'Could not assign',
        e?.body?.message || e?.message || 'Please try again.',
        { preset: 'error', haptic: 'error' },
      );
    } finally {
      setAssigning(null);
    }
  };

  const visibleList = isPickupPicker
    ? list.filter((e) => (e.roleLabel || '').toLowerCase() === PICKUP_ROLE.toLowerCase())
    : list;
  const activeCount = visibleList.filter((e) => e.isAvailable !== false).length;

  // ── Seat accounting ────────────────────────────────────────────────────────
  // Counted over the WHOLE shop, never the pickup-filtered view: the allowance
  // is on employees, not on the subset this screen happens to be showing.
  // Prefer the server's own count so the number here is the number POST
  // /technicians will compare against.
  const shopActiveCount = list.filter((e) => e.isAvailable !== false).length;
  const seatUsage = seats?.used ?? shopActiveCount;
  const seatLimit = seats && !seats.unlimited ? seats.limit : null;
  // `allowed` already folds in both refusal reasons — seats full and plan
  // lapsed. Trust that single flag rather than re-deriving the rule here; a
  // second copy of the rule in the client is how the two drift apart.
  const canAdd = seats ? seats.allowed !== false : true;
  const showLimitNotice = !isPickupPicker && !!seats && !canAdd;
  const planLabel = seats?.planName || 'current';

  const goUpgrade = () => navigation.navigate('OwnerSubscription');

  // The pickup picker asks a different question ("how many of these are on
  // duty?"), so it keeps the old headcount ring. So does the case where the
  // allowance could not be fetched — falling through to `seatLimit == null`
  // there would render the unlimited treatment and quietly claim the shop has
  // no ceiling, which is the opposite of not knowing.
  const ringActive = isPickupPicker ? activeCount : seatUsage;
  const ringTotal = (isPickupPicker || !seats) ? visibleList.length : seatLimit;

  // Search + role filter (All / Technician / Staff / Pickup Person).
  const roleOf = (e) => e.roleLabel || 'Technician';
  const roleCounts = ROLE_FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'ALL' ? visibleList.length : visibleList.filter((e) => f.match(roleOf(e))).length;
    return acc;
  }, {});
  const q = query.trim().toLowerCase();
  const shownList = visibleList
    .filter((e) => roleFilter === 'ALL' || ROLE_FILTERS.find((f) => f.key === roleFilter)?.match(roleOf(e)))
    .filter((e) => !q || `${e.name || ''} ${e.phone || ''} ${e.email || ''} ${roleOf(e)}`.toLowerCase().includes(q));
  const inactiveCount = visibleList.length - activeCount;

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={{ backgroundColor: '#FFFFFF', paddingTop: 6, paddingBottom: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
          <View className="flex-row items-center" style={capStyle}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="items-center justify-center"
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: '#E5E7EB' }}
            >
              <ChevronLeft size={20} color="#111111" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
                {isPickupPicker ? 'Select Pickup Person' : 'Employees'}
              </Text>
              <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }} numberOfLines={1}>
                {activeCount} active · {visibleList.length} total
              </Text>
            </View>
            {!isPickupPicker ? (
              // Kept visible but disabled when the plan is full, rather than
              // hidden: a greyed button that explains itself on tap tells the
              // owner what is going on and offers the way out.
              <Pressable
                onPress={onAddEmployee}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdd }}
                accessibilityLabel={canAdd
                  ? 'Add Employee'
                  : `Employee limit reached. Your ${planLabel} plan allows up to ${seats?.limit} per shop. Tap for upgrade options.`}
                className="flex-row items-center active:opacity-85"
                style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: canAdd ? BRAND_GREEN : '#FFF8E1' }}
              >
                <UserPlus size={15} color={canAdd ? '#FFFFFF' : BRAND_AMBER_DARK} />
                <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '800', color: canAdd ? '#FFFFFF' : BRAND_AMBER_DARK }}>
                  {canAdd ? 'Add' : 'Limit'}
                </Text>
              </Pressable>
            ) : <View style={{ width: 36 }} />}
          </View>
        </View>
      </SafeAreaView>

      {loading && list.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 28 }, capStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BRAND_GREEN_DARK} colors={[BRAND_GREEN_DARK]} />
          }
        >
          {/* Summary — seats ring (allowance) + active / inactive counts. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, ...cardShadow }}>
            <ProgressRing active={ringActive} total={ringTotal} size={56} />
            <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
                {isPickupPicker ? 'Pickup-eligible staff' : 'Your Team'}
              </Text>
              <Text style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
                {isPickupPicker || !seats
                  ? `${visibleList.length} on file`
                  : seatLimit != null ? `${seatUsage} of ${seatLimit} seats used · ${planLabel} plan` : `${seatUsage} active · unlimited seats`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <StatPill value={activeCount} label="Active" color="#476B26" bg="#EDF4E7" />
              <StatPill value={inactiveCount} label="Inactive" color="#6B7280" bg="#F3F4F6" />
            </View>
          </View>

          {/*
            Shown only when the backend has actually refused — the same
            `allowed` flag the create API enforces.
          */}
          {showLimitNotice ? (
            <View style={{ marginTop: 10, borderRadius: 16, padding: 12, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F8E3A0' }}>
              <View className="flex-row items-center">
                <ShieldCheck size={15} color={BRAND_AMBER_DARK} />
                <Text style={{ marginLeft: 8, fontSize: 12.5, fontWeight: '800', color: BRAND_AMBER_DARK }}>
                  {seats?.expired ? 'Subscription expired' : 'Employee limit reached'}
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: '#4B5563', marginTop: 6, lineHeight: 17 }}>
                {seats?.message || `Your ${planLabel} plan allows up to ${seats?.limit} active employees per shop.`}
              </Text>
              <Pressable onPress={goUpgrade} accessibilityRole="button" className="items-center active:opacity-85" style={{ marginTop: 10, borderRadius: 999, paddingVertical: 8, backgroundColor: BRAND_AMBER }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#3A2606' }}>Upgrade Plan</Text>
              </Pressable>
            </View>
          ) : null}

          {visibleList.length > 0 ? (
            <>
              {/* Search */}
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, marginTop: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                <Search size={17} color="#9CA3AF" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by name or mobile"
                  placeholderTextColor="#9CA3AF"
                  cursorColor={BRAND_GREEN}
                  style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#111111', paddingVertical: 0, includeFontPadding: false }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                    <X size={16} color="#6B7280" />
                  </Pressable>
                ) : null}
              </View>

              {/* Role filter */}
              {!isPickupPicker ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }}>
                  {ROLE_FILTERS.map((f) => {
                    const on = roleFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => setRoleFilter(f.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        className="flex-row items-center active:opacity-80"
                        style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: on ? 0 : 1, borderColor: '#E5E7EB', backgroundColor: on ? BRAND_GREEN : '#FFFFFF' }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: on ? '800' : '600', color: on ? '#FFFFFF' : '#111111' }}>{f.label}</Text>
                        <Text style={{ marginLeft: 5, fontSize: 11.5, fontWeight: '700', color: on ? '#C7E6EA' : '#9CA3AF' }}>{roleCounts[f.key]}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          ) : null}

          {visibleList.length === 0 ? (
            <View className="items-center" style={{ paddingTop: 36, paddingHorizontal: 32 }}>
              <View className="items-center justify-center" style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: MINT, marginBottom: 12 }}>
                <Users size={26} color={BRAND_GREEN_DARK} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', textAlign: 'center' }}>
                {isPickupPicker ? 'No pickup persons yet' : 'No employees yet'}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 6, textAlign: 'center', lineHeight: 17 }}>
                {isPickupPicker
                  ? 'Add staff with the "Pickup Person" role to assign pickups.'
                  : 'Tap "Add" to add your first staff member.'}
              </Text>
            </View>
          ) : shownList.length === 0 ? (
            <Text style={{ fontSize: 12.5, color: '#6B7280', textAlign: 'center', paddingVertical: 28 }}>No employee matches this search.</Text>
          ) : (
            <View className="flex-row flex-wrap" style={{ marginTop: 12, marginHorizontal: cols === 2 ? -5 : 0 }}>
              {shownList.map((e, i) => {
                const isActive = e.isAvailable !== false;
                const role = roleOf(e);
                const tone = roleTone(role);
                const RoleIcon = tone.Icon;
                const avatarBg = isActive ? AVATAR_TONES[i % AVATAR_TONES.length] : '#D1D5DB';
                const phone = e.phone || '';
                return (
                  <View key={e.id} style={{ width: cols === 2 ? '50%' : '100%', paddingHorizontal: cols === 2 ? 5 : 0 }}>
                    <TouchableOpacity
                      onPress={() => (isPickupPicker ? handlePickPickupPerson(e) : navigation.navigate('OwnerEmployeeDetail', { employee: e }))}
                      activeOpacity={0.85}
                      disabled={isPickupPicker && (assigning !== null || !isActive)}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 8, opacity: isActive ? 1 : 0.7, ...cardShadow }}
                    >
                      {/* Avatar: photo when there is one, else coloured initials; dot = active. */}
                      <View>
                        {e.photoUrl ? (
                          <Image source={{ uri: e.photoUrl }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#F3F4F6' }} />
                        ) : (
                          <View className="items-center justify-center" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: avatarBg }}>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{initialsOf(e.name)}</Text>
                          </View>
                        )}
                        <View style={{ position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: isActive ? '#609138' : '#9CA3AF', borderWidth: 2, borderColor: '#FFFFFF' }} />
                      </View>

                      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                        <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#111111' }} numberOfLines={1}>{e.name || '—'}</Text>
                        <View className="flex-row items-center" style={{ marginTop: 5, gap: 6 }}>
                          <View className="flex-row items-center" style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: tone.bg, flexShrink: 1 }}>
                            <RoleIcon size={11} color={tone.fg} strokeWidth={2.4} />
                            <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: '800', color: tone.fg, flexShrink: 1 }} numberOfLines={1}>{role}</Text>
                          </View>
                          <Text style={{ fontSize: 11.5, color: '#6B7280', flexShrink: 1 }} numberOfLines={1}>{phone || e.email || ''}</Text>
                        </View>
                      </View>

                      {isPickupPicker ? (
                        assigning === e.id ? <ActivityIndicator size="small" color={BRAND_GREEN_DARK} /> : <ChevronRight size={18} color={BRAND_GREEN_DARK} />
                      ) : (
                        <View className="flex-row items-center" style={{ marginLeft: 6 }}>
                          {phone ? (
                            <Pressable
                              onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityLabel={`Call ${e.name || 'employee'}`}
                              className="items-center justify-center active:opacity-70"
                              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: MINT, marginRight: 4 }}
                            >
                              <Phone size={15} color={BRAND_GREEN} />
                            </Pressable>
                          ) : null}
                          <View className="items-center" style={{ width: 52 }}>
                            {toggling === e.id ? (
                              <ActivityIndicator size="small" color={BRAND_GREEN} style={{ height: 30 }} />
                            ) : (
                              <Switch
                                style={{ transform: [{ scale: 0.85 }] }}
                                value={isActive}
                                onValueChange={(v) => onToggleActive(e, v)}
                                trackColor={{ false: '#D1D5DB', true: '#C7E6EA' }}
                                thumbColor={isActive ? BRAND_GREEN : '#9CA3AF'}
                              />
                            )}
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: isActive ? '#476B26' : '#9CA3AF', marginTop: -2 }}>
                              {isActive ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {!isPickupPicker && visibleList.length > 0 ? (
            <View className="flex-row items-center" style={{ marginTop: 4, paddingHorizontal: 4 }}>
              <Info size={13} color="#9CA3AF" />
              <Text style={{ flex: 1, marginLeft: 6, fontSize: 11, color: '#6B7280', lineHeight: 16 }}>
                Tap an employee to edit. Only active employees can access the shop.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function StatPill({ value, label, color, bg }) {
  return (
    <View className="items-center justify-center" style={{ minWidth: 52, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: bg }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 9.5, fontWeight: '700', color, marginTop: 1 }}>{label}</Text>
    </View>
  );
}
