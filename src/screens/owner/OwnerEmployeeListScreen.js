import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
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
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { ticketApi } from '../../api/client';
import { assignPickupPerson } from '../../api/orders';
import { notify } from '../../components/confirm';
import { FEATURE, asEntitlements, fetchEmployeeLimit } from '../../subscription/entitlements';
import { handleLimitError, showLimitPopup } from '../../subscription/limitPopup';

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const PICKUP_ROLE = 'Pickup Person';

// Amber for "at the ceiling" — the shop is not broken, it is full.
const BRAND_AMBER      = '#F59E0B';
const BRAND_AMBER_DARK = '#B45309';

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
function ProgressRing({ active, total, size = 62, stroke = 6 }) {
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
        <Circle cx={half} cy={half} r={r} stroke="#E6F7E3" strokeWidth={stroke} fill="none" />
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
      <Text className="text-[13px] font-extrabold text-gray-900">
        {unlimited ? active : `${active}/${total}`}
      </Text>
    </View>
  );
}

export default function OwnerEmployeeListScreen({ navigation, route }) {
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

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 6,
            paddingBottom: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
            >
              <ChevronLeft size={22} color="#172117" />
            </TouchableOpacity>
            <Text className="flex-1 text-text text-[24px] font-extrabold" numberOfLines={1}>
              {isPickupPicker ? 'Select Pickup Person' : 'Employees'}
            </Text>
            {!isPickupPicker ? (
              // Kept visible but disabled when the plan is full, rather than
              // hidden: a button that vanishes reads as a broken screen, while
              // a greyed one that explains itself on tap tells the owner what
              // is actually going on and offers the way out.
              <Pressable
                onPress={onAddEmployee}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdd }}
                accessibilityLabel={canAdd
                  ? 'Add Employee'
                  : `Employee limit reached. Your ${planLabel} plan allows up to ${seats?.limit} per shop. Tap for upgrade options.`}
                className="flex-row items-center px-3 py-2 rounded-full"
                style={{ backgroundColor: canAdd ? '#E6F7E3' : '#FEF3C7' }}
              >
                <UserPlus size={15} color={canAdd ? BRAND_GREEN_DARK : BRAND_AMBER_DARK} />
                <Text
                  className="ml-1.5 text-[12.5px] font-extrabold"
                  style={{ color: canAdd ? BRAND_GREEN_DARK : BRAND_AMBER_DARK }}
                >
                  {canAdd ? 'Add Employee' : 'Limit reached'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {loading && list.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}
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
            {/* Summary card with active / total progress ring */}
            <View
              className="rounded-2xl p-4 mb-3 flex-row items-center"
              style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#E6F7E3' }}
            >
              <View style={{ position: 'relative' }}>
                <View
                  className="w-14 h-14 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Users size={26} color={BRAND_GREEN_DARK} />
                </View>
                <View
                  style={{
                    position: 'absolute', right: 1, bottom: 2,
                    width: 13, height: 13, borderRadius: 7,
                    backgroundColor: BRAND_GREEN, borderWidth: 2, borderColor: '#F0F8EF',
                  }}
                />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-[17px] font-extrabold text-gray-900">
                  {isPickupPicker ? 'Pickup-eligible staff' : 'All Employees'}
                </Text>
                {/* "3 active · 5 total" — the ring carries the allowance, so
                    this line stays a plain headcount. Total is every employee
                    on file including deactivated ones, which is what makes the
                    two numbers differ and shows that an inactive employee is
                    not holding a seat. */}
                <Text className="text-[12.5px] text-gray-500 mt-0.5">
                  {isPickupPicker
                    ? `${activeCount} active · ${visibleList.length} total`
                    : `${seatUsage} active · ${list.length} total`}
                </Text>
              </View>
              <View className="items-center">
                <ProgressRing active={ringActive} total={ringTotal} />
                <Text
                  className="text-[11px] font-extrabold mt-1"
                  style={{ color: showLimitNotice ? BRAND_AMBER_DARK : BRAND_GREEN_DARK }}
                >
                  Active
                </Text>
              </View>
            </View>

            {/*
              Shown only when the backend has actually refused — the same
              `allowed` flag the create API enforces, so this notice cannot
              appear on a shop that could still hire, or stay hidden on one
              that cannot.
            */}
            {showLimitNotice ? (
              <View
                className="rounded-2xl p-4 mb-3"
                style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}
              >
                <View className="flex-row items-center">
                  <ShieldCheck size={16} color={BRAND_AMBER_DARK} />
                  <Text className="ml-2 text-[13.5px] font-extrabold" style={{ color: BRAND_AMBER_DARK }}>
                    {seats?.expired ? 'Subscription expired' : 'Employee limit reached'}
                  </Text>
                </View>
                <Text className="text-[12.5px] text-gray-600 mt-1.5 leading-5">
                  {seats?.message
                    || `Your ${planLabel} plan allows up to ${seats?.limit} active employees per shop.`}
                </Text>
                <Pressable
                  onPress={goUpgrade}
                  accessibilityRole="button"
                  className="mt-3 rounded-full py-2.5 items-center"
                  style={{ backgroundColor: BRAND_AMBER }}
                >
                  <Text className="text-[13px] font-extrabold" style={{ color: '#3A2606' }}>
                    Upgrade Plan
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {visibleList.length === 0 ? (
              <View className="items-center pt-12 px-8">
                <View
                  className="w-20 h-20 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Users size={32} color={BRAND_GREEN_DARK} />
                </View>
                <Text className="text-[14.5px] font-extrabold text-gray-700 text-center">
                  {isPickupPicker ? 'No pickup persons yet' : 'No employees yet'}
                </Text>
                <Text className="text-[12px] text-gray-500 mt-2 text-center leading-5">
                  {isPickupPicker
                    ? 'Add staff with the "Pickup Person" role to assign pickups.'
                    : 'Tap "Add" to add your first staff member.'}
                </Text>
              </View>
            ) : visibleList.map((e) => {
              const isActive = e.isAvailable !== false;
              const initial = (e.name || '?').trim().charAt(0).toUpperCase();
              const role = e.roleLabel || 'Technician';
              const isPickup = role.toLowerCase() === PICKUP_ROLE.toLowerCase();
              const RoleIcon = isPickup ? Truck : Wrench;
              const roleTint = isPickup ? '#FEF3C7' : '#E6F7E3';
              const roleAccent = isPickup ? '#B45309' : '#16BB05';
              return (
                <TouchableOpacity
                  key={e.id}
                  onPress={() =>
                    isPickupPicker
                      ? handlePickPickupPerson(e)
                      : navigation.navigate('OwnerEmployeeDetail', { employee: e })
                  }
                  activeOpacity={0.85}
                  disabled={isPickupPicker && (assigning !== null || !isActive)}
                  className="bg-white rounded-2xl p-3.5 mb-3 flex-row items-center"
                  style={[cardShadow, { opacity: isActive ? 1 : 0.72 }]}
                >
                  {/* Avatar */}
                  <View style={{ position: 'relative' }}>
                    <View
                      style={{
                        width: 56, height: 56, borderRadius: 28,
                        backgroundColor: isActive ? '#E6F7E3' : '#EFF5EE',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text
                        className="text-[22px] font-extrabold"
                        style={{ color: isActive ? BRAND_GREEN_DARK : '#8FA08F' }}
                      >
                        {initial}
                      </Text>
                    </View>
                    <View
                      style={{
                        position: 'absolute',
                        right: 0, bottom: 2,
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: isActive ? BRAND_GREEN : '#8FA08F',
                        borderWidth: 2, borderColor: '#FFFFFF',
                      }}
                    />
                  </View>

                  <View className="flex-1 ml-3 pr-1">
                    <Text className="text-[16px] font-extrabold text-gray-900" numberOfLines={1}>
                      {e.name || '—'}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <Phone size={12} color={BRAND_GREEN} />
                      <Text className="text-[12.5px] text-gray-600 ml-1.5" numberOfLines={1}>
                        {e.phone || e.email || '—'}
                      </Text>
                    </View>
                    <View
                      className="flex-row items-center self-start px-2.5 py-1 rounded-full mt-2"
                      style={{ backgroundColor: roleTint }}
                    >
                      <RoleIcon size={12} color={roleAccent} />
                      <Text
                        className="ml-1.5 text-[12px] font-extrabold"
                        style={{ color: roleAccent, letterSpacing: 0.3 }}
                      >
                        {role}
                      </Text>
                    </View>
                  </View>

                  {/* Right side */}
                  {isPickupPicker ? (
                    <View>
                      {assigning === e.id ? (
                        <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
                      ) : (
                        <ChevronRight size={18} color={BRAND_GREEN_DARK} />
                      )}
                    </View>
                  ) : (
                    <View className="flex-row items-center">
                      <View className="items-center mr-1">
                        <Text
                          className="text-[11px] font-extrabold mb-0.5"
                          style={{ color: isActive ? BRAND_GREEN_DARK : '#8FA08F' }}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </Text>
                        {toggling === e.id ? (
                          <ActivityIndicator size="small" color={BRAND_GREEN} />
                        ) : (
                          <Switch
                            value={isActive}
                            onValueChange={(v) => onToggleActive(e, v)}
                            trackColor={{ false: '#CBD5CB', true: '#7ED957' }}
                            thumbColor={isActive ? BRAND_GREEN : '#8FA08F'}
                          />
                        )}
                      </View>
                      <Pressable
                        onPress={() => navigation.navigate('OwnerEmployeeDetail', { employee: e })}
                        hitSlop={8}
                        className="ml-0.5"
                      >
                        <ChevronRight size={20} color="#8FA08F" />
                      </Pressable>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {!isPickupPicker && visibleList.length > 0 ? (
              <View
                className="rounded-2xl p-3.5 mt-1 flex-row items-center"
                style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#E6F7E3' }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: BRAND_GREEN_DARK }}
                >
                  <Info size={18} color="#FFFFFF" />
                </View>
                <Text className="flex-1 text-[12px] text-gray-600 leading-5">
                  You can add, edit or deactivate employees. Only active employees can access the shop.
                </Text>
                <View
                  className="w-10 h-10 rounded-full items-center justify-center ml-2"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <ShieldCheck size={18} color={BRAND_GREEN_DARK} />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}
