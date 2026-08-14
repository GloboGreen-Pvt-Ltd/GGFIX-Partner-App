import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { notify } from '../../components/confirm';
// Add-only by design: a saved slot is a commitment customers can already be
// booking against, so this screen never offers edit or delete.
import { getShopPickupSlots, addShopPickupSlot } from '../../api/shops';
import { fetchMe, updateOwnerShop } from '../../api/auth';
import { getSession } from '../../auth/session';
import { selectShopId } from '../../store/authSlice';

// ISO-8601 day codes — matches the backend ShopPickupSlotRequest convention.
// dayOfWeek=null on existing rows represents the legacy "any day" semantics.
const DAYS = [
  { code: 1, short: 'Mon', long: 'Monday' },
  { code: 2, short: 'Tue', long: 'Tuesday' },
  { code: 3, short: 'Wed', long: 'Wednesday' },
  { code: 4, short: 'Thu', long: 'Thursday' },
  { code: 5, short: 'Fri', long: 'Friday' },
  { code: 6, short: 'Sat', long: 'Saturday' },
  { code: 7, short: 'Sun', long: 'Sunday' },
];

// Display order for the circle picker — Sunday-first (calendar convention).
// Each circle shows a single letter; double 'S'/'T' matches the standard
// abbreviation scheme used in calendar UIs.
const DAY_CIRCLES = [
  { code: 7, letter: 'S' }, // Sun
  { code: 1, letter: 'M' }, // Mon
  { code: 2, letter: 'T' }, // Tue
  { code: 3, letter: 'W' }, // Wed
  { code: 4, letter: 'T' }, // Thu
  { code: 5, letter: 'F' }, // Fri
  { code: 6, letter: 'S' }, // Sat
];

function dayLabel(code) {
  // Older rows may still carry NULL from the previous "Any day" support.
  if (code == null) return 'Any day (legacy)';
  return DAYS.find((d) => d.code === code)?.long ?? `Day ${code}`;
}

// Render the user's current multi-day selection as "Mon to Sat", "All days",
// or "Mon, Wed, Fri". Empty when nothing picked.
function daysSummary(days) {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'All days';
  const consecutive = sorted.every((c, i) => i === 0 || c === sorted[i - 1] + 1);
  const dayShort = (c) => DAYS.find((d) => d.code === c)?.short ?? `?`;
  if (consecutive && sorted.length > 1) {
    return `${dayShort(sorted[0])} to ${dayShort(sorted[sorted.length - 1])}`;
  }
  return sorted.map(dayShort).join(', ');
}

// Backend returns "HH:MM:SS"; show the user "HH:MM". Submit also sends "HH:MM".
function normaliseTime(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// "HH:MM(:SS)" 24h → "hh:MM AM/PM" for the saved-slot display cards.
function to12h(value) {
  const t = normaliseTime(value);
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m[2]} ${ampm}`;
}

// Accept "9:5", "09:05", "9:05 am", "5pm" → normalize to 24h "HH:MM". Returns
// null when the input can't be parsed.
function parseTimeInput(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (Number.isNaN(h) || Number.isNaN(mi) || mi < 0 || mi > 59) return null;
  if (ampm === 'AM') { if (h === 12) h = 0; }
  else if (ampm === 'PM') { if (h !== 12) h += 12; }
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

// `days` is an array of ISO codes (1=Mon..7=Sun). Multi-select in both modes.
// `capacity` is the legacy DB column name; the UI surfaces it as pickup-radius
// kilometres so the underlying schema stays untouched.
const EMPTY_FORM = { days: [1], startTime: '', endTime: '', capacity: '20' };

export default function OwnerPickupSlotsScreen({ navigation }) {
  const shopId = useSelector(selectShopId);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('day'); // 'day' | 'time'
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Master pickup switch — mirrors shops.pickup_enabled. The customer app's
  // "pickup shops near me" feed (GET /auth/shops/pickup-nearby) only returns
  // shops with this flag true, so turning it off hides this shop from that
  // list without touching the saved slots or any in-progress pickup.
  // null = not loaded yet (renders a spinner instead of a wrong position).
  const [pickupEnabled, setPickupEnabled] = useState(null);
  const [ownerId, setOwnerId] = useState(null);
  const [savingToggle, setSavingToggle] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) { setLoading(false); return; }
    try {
      const list = await getShopPickupSlots(shopId);
      setSlots(Array.isArray(list) ? list : []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  /**
   * Read the master switch from the owner profile. /auth/me is the live source
   * (the persisted session can predate the flag), with the cached session as a
   * fallback so a flaky network shows the last known position rather than a
   * spinner that never resolves.
   */
  const loadPickupFlag = useCallback(async () => {
    const session = (await fetchMe().catch(() => null)) || (await getSession().catch(() => null));
    setOwnerId(session?.userId || null);
    // activeShop is recomputed against the persisted shopId; only trust it when
    // it really is the shop this screen is editing (multi-shop owners).
    const shop = session?.activeShop?.id === shopId ? session.activeShop : null;
    // Keep whatever we already knew when the shop can't be matched (offline, or
    // a focus that raced the active-shop recompute) — flipping a known-on switch
    // to off would misreport this shop as hidden from customers.
    if (shop) setPickupEnabled(shop.pickupEnabled === true);
    else setPickupEnabled((prev) => prev ?? false);
  }, [shopId]);

  useFocusEffect(useCallback(() => { load(); loadPickupFlag(); }, [load, loadPickupFlag]));

  const onTogglePickup = async (next) => {
    if (!ownerId || !shopId) {
      notify('Not ready', 'Could not resolve your shop. Reopen this screen and try again.', { preset: 'error' });
      return;
    }
    const previous = pickupEnabled;
    setPickupEnabled(next);        // optimistic — the switch must feel instant
    setSavingToggle(true);
    try {
      await updateOwnerShop(ownerId, shopId, { pickupEnabled: next });
      // Refresh the cached session so My Account / Dashboard don't keep the
      // stale flag until the next login.
      await fetchMe().catch(() => null);
      // Re-read the slots the switch just re-exposed. They were never deleted —
      // this only proves it, so turning pickup on shows the saved rows straight
      // away instead of an empty list until the next focus.
      await load();
    } catch (e) {
      setPickupEnabled(previous);  // roll back — the server is the truth
      notify(
        'Could not update',
        e?.payload?.message || e?.message || 'Please try again.',
        { preset: 'error', haptic: 'error' },
      );
    } finally {
      setSavingToggle(false);
    }
  };

  const resetForm = () => { setForm(EMPTY_FORM); setError(''); };

  const toggleDay = (code) => {
    // Multi-select: each picked day becomes its own row on submit.
    setForm((f) => {
      const has = f.days.includes(code);
      return { ...f, days: has ? f.days.filter((d) => d !== code) : [...f.days, code] };
    });
  };

  const onSubmit = async () => {
    setError('');
    const start = parseTimeInput(form.startTime);
    const end = parseTimeInput(form.endTime);
    const cap = parseInt(String(form.capacity).replace(/[^0-9]/g, ''), 10);
    if (!form.days || form.days.length === 0) { setError('Pick at least one day.'); return; }
    if (!start) { setError('Enter a valid start time (HH:MM).'); return; }
    if (!end) { setError('Enter a valid end time (HH:MM).'); return; }
    if (start >= end) { setError('Start time must be before end time.'); return; }
    if (!Number.isFinite(cap) || cap < 1) { setError('Distance must be at least 1 km.'); return; }
    if (!shopId) { setError('Session expired. Please log in again.'); return; }

    setSubmitting(true);
    try {
      if (form.days.length === 1) {
        await addShopPickupSlot(shopId, {
          dayOfWeek: form.days[0], startTime: start, endTime: end, capacity: cap,
        });
        resetForm();
        await load();
      } else {
        // Multi-day add: one POST per day. Backend rejects overlaps individually,
        // so collect successes and failures and report both.
        const failed = [];
        let created = 0;
        const sortedDays = [...form.days].sort((a, b) => a - b);
        for (const code of sortedDays) {
          try {
            await addShopPickupSlot(shopId, { dayOfWeek: code, startTime: start, endTime: end, capacity: cap });
            created += 1;
          } catch (e) {
            const short = DAYS.find((d) => d.code === code)?.short ?? `Day ${code}`;
            failed.push({ short, msg: e?.payload?.message || e?.message || 'failed' });
          }
        }
        if (failed.length === 0) {
          resetForm();
        } else {
          setError(`Added ${created} of ${sortedDays.length}. Skipped: ${failed.map((f) => f.short).join(', ')}.`);
        }
        await load();
      }
    } catch (e) {
      setError(e?.payload?.message || e?.message || 'Could not save pickup slot.');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedSlots = useMemo(() => {
    const arr = [...slots];
    if (sortBy === 'time') {
      arr.sort((a, b) => normaliseTime(a.startTime).localeCompare(normaliseTime(b.startTime)));
    } else {
      arr.sort((a, b) => (a.dayOfWeek ?? 99) - (b.dayOfWeek ?? 99));
    }
    return arr;
  }, [slots, sortBy]);

  if (!shopId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={styles.errorText}>Please log in again.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Master pickup switch. Sits above the slot editor because it gates
            everything below it: with pickup off the shop is not listed in the
            customer app's pickup shop list, whatever the slots say. */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={[styles.cardHeaderIcon, !pickupEnabled && styles.cardHeaderIconOff]}>
              <Ionicons
                name="car-outline"
                size={22}
                color={pickupEnabled ? '#087A0A' : '#8FA08F'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Pickup Service</Text>
              <Text style={styles.cardSub}>
                {pickupEnabled === null
                  ? 'Checking your current setting…'
                  : pickupEnabled
                    ? 'Customers can find your shop and book a doorstep pickup.'
                    : 'Your shop is hidden from the customer app’s pickup shop list.'}
              </Text>
            </View>
            {pickupEnabled === null || savingToggle ? (
              <ActivityIndicator color="#087A0A" style={styles.toggleSpinner} />
            ) : (
              <Switch
                value={pickupEnabled}
                onValueChange={onTogglePickup}
                disabled={!ownerId}
                trackColor={{ false: '#E2E8E2', true: '#C8EEBF' }}
                thumbColor={pickupEnabled ? '#087A0A' : '#F7FAF7'}
                ios_backgroundColor="#E2E8E2"
              />
            )}
          </View>

          {pickupEnabled === false ? (
            <View style={styles.warnBanner}>
              <Ionicons name="eye-off-outline" size={16} color="#B45309" />
              <Text style={styles.warnText}>
                Pickup is off. Customers won’t see this shop when they search for
                pickup shops. Your saved slots are kept — turn pickup back on to
                start receiving requests again.
              </Text>
            </View>
          ) : null}

          {pickupEnabled === true && !loading && slots.length === 0 ? (
            <View style={styles.warnBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
              <Text style={styles.warnText}>
                Pickup is on but you have no slots yet. Add at least one below so
                customers have a time window to book.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Everything below is gated on the switch. Pickup off means the shop
            offers no windows at all, so the editor and the list are not just
            disabled but absent — the rows stay in the database untouched and
            reappear unchanged the moment pickup goes back on. */}
        {pickupEnabled !== true ? null : (
        <>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <Ionicons name="calendar-outline" size={22} color="#087A0A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Add pickup slot</Text>
              <Text style={styles.cardSub}>
                Define the time window and how many pickups you can handle in it.
              </Text>
            </View>
          </View>

          <Text style={styles.daysLabel}>Days</Text>
          {daysSummary(form.days) ? (
            <Text style={styles.daysSummary}>{daysSummary(form.days)}</Text>
          ) : null}
          <View style={styles.circleRow}>
            {DAY_CIRCLES.map((d) => {
              const active = form.days.includes(d.code);
              return (
                <TouchableOpacity
                  key={d.code}
                  style={[styles.dayCircle, active && styles.dayCircleActive]}
                  onPress={() => toggleDay(d.code)}
                  activeOpacity={0.8}
                  accessibilityLabel={DAYS.find((x) => x.code === d.code)?.long}
                >
                  <Text style={[styles.dayCircleText, active && styles.dayCircleTextActive]}>{d.letter}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {form.days.length > 1 ? (
            <Text style={styles.hint}>
              One row will be created per selected day. Days that overlap an existing slot are skipped.
            </Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Start time (HH:MM)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="time-outline" size={16} color="#087A0A" />
                <TextInput
                  style={styles.inputFlex}
                  value={form.startTime}
                  onChangeText={(t) => setForm((f) => ({ ...f, startTime: t }))}
                  placeholder="09:00"
                  placeholderTextColor="#8FA08F"
                  autoCapitalize="characters"
                />
                <Ionicons name="chevron-down" size={16} color="#8FA08F" />
              </View>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>End time (HH:MM)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="time-outline" size={16} color="#087A0A" />
                <TextInput
                  style={styles.inputFlex}
                  value={form.endTime}
                  onChangeText={(t) => setForm((f) => ({ ...f, endTime: t }))}
                  placeholder="12:00"
                  placeholderTextColor="#8FA08F"
                  autoCapitalize="characters"
                />
                <Ionicons name="chevron-down" size={16} color="#8FA08F" />
              </View>
            </View>
          </View>

          <Text style={styles.label}>Distance (KM)</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="location-outline" size={16} color="#087A0A" />
            <TextInput
              style={styles.inputFlex}
              value={form.capacity}
              onChangeText={(t) => setForm((f) => ({ ...f, capacity: t }))}
              placeholder="20"
              placeholderTextColor="#8FA08F"
              keyboardType="number-pad"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={onSubmit}
              disabled={submitting}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#16BB05', '#087A0A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitGrad}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>
                      {form.days.length > 1 ? `Add slots (${form.days.length})` : 'Add slot'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.savedHeaderRow}>
          <Text style={styles.sectionLabel}>Saved pickup slots</Text>
          <View>
            <TouchableOpacity
              style={styles.sortBtn}
              onPress={() => setSortMenuOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-vertical" size={14} color="#172117" />
              <Text style={styles.sortText}>
                Sort by: <Text style={styles.sortValue}>{sortBy === 'time' ? 'Time' : 'Day'}</Text>
              </Text>
              <Ionicons name="chevron-down" size={14} color="#172117" />
            </TouchableOpacity>
            {sortMenuOpen ? (
              <View style={styles.sortMenu}>
                {[{ key: 'day', label: 'Day' }, { key: 'time', label: 'Start time' }].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.sortMenuItem}
                    onPress={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sortMenuText, sortBy === opt.key && styles.sortMenuTextActive]}>
                      {opt.label}
                    </Text>
                    {sortBy === opt.key ? <Ionicons name="checkmark" size={14} color="#087A0A" /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#087A0A" style={{ marginTop: 20 }} />
        ) : slots.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="time-outline" size={28} color="#8FA08F" />
            <Text style={styles.emptyText}>No pickup slots yet. Add one above to get started.</Text>
          </View>
        ) : (
          // Read-only cards: a saved slot is something customers can already be
          // booking against, so it carries no edit or delete affordance.
          sortedSlots.map((slot, index) => (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotIconWrap}>
                <Ionicons name="calendar-outline" size={20} color="#087A0A" />
                <View style={styles.slotBadge}>
                  <Text style={styles.slotBadgeText}>{index + 1}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.slotDayRow}>
                  <Text style={styles.slotDay}>{dayLabel(slot.dayOfWeek)}</Text>
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>Active</Text>
                  </View>
                </View>
                <View style={styles.slotMetaRow}>
                  <Ionicons name="time-outline" size={13} color="#667066" />
                  <Text style={styles.slotTime}>
                    {to12h(slot.startTime)} – {to12h(slot.endTime)}
                  </Text>
                </View>
                <View style={styles.slotMetaRow}>
                  <Ionicons name="location-outline" size={13} color="#667066" />
                  <Text style={styles.slotMeta}>Distance: {slot.capacity ?? 10} km</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#087A0A" />
          <Text style={styles.infoText}>
            Customers can book a pickup within the selected time window on the
            selected days only. A saved slot can’t be edited or removed — switch
            Pickup Service off to stop taking pickups without losing it.
          </Text>
        </View>
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#172117',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  cardHeaderIcon: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#E6F7E3',
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderIconOff: { backgroundColor: '#EFF5EE' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#172117' },
  cardSub: { fontSize: 12.5, color: '#667066', marginTop: 2, lineHeight: 17 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Reserve the switch's footprint so swapping in the spinner doesn't reflow
  // the row (the title would visibly jump on every save).
  toggleSpinner: { width: 51, alignItems: 'center' },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  warnText: { flex: 1, fontSize: 12, color: '#7C4A03', lineHeight: 17 },

  daysLabel: { fontSize: 14, fontWeight: '800', color: '#172117', marginTop: 12, marginBottom: 8 },
  label: { fontSize: 13, color: '#172117', fontWeight: '700', marginTop: 12, marginBottom: 6 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7FAF7',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8E2',
    paddingHorizontal: 12,
  },
  inputFlex: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#172117' },

  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },

  daysSummary: { fontSize: 13, color: '#087A0A', fontWeight: '700', marginTop: 2, marginBottom: 6 },
  circleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  dayCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#E2E8E2',
    alignItems: 'center', justifyContent: 'center',
  },
  dayCircleActive: { backgroundColor: '#087A0A' },
  dayCircleText: { fontSize: 15, color: '#667066', fontWeight: '800' },
  dayCircleTextActive: { color: '#FFFFFF' },

  errorText: { fontSize: 12, color: '#DC2626', marginTop: 8 },
  hint: { fontSize: 11, color: '#667066', marginTop: 6, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  submitBtn: { flex: 1, borderRadius: 999, overflow: 'hidden' },
  submitGrad: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },

  savedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
    zIndex: 20,
    elevation: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#172117',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortText: { fontSize: 12.5, color: '#172117', fontWeight: '600' },
  sortValue: { fontWeight: '800', color: '#172117' },
  sortMenu: {
    position: 'absolute',
    top: 26, right: 0,
    minWidth: 130,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8E2',
    paddingVertical: 4,
    elevation: 12,
    shadowColor: '#172117',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    zIndex: 30,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sortMenuText: { fontSize: 13, color: '#667066', fontWeight: '600' },
  sortMenuTextActive: { color: '#087A0A', fontWeight: '800' },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: { fontSize: 12, color: '#667066', textAlign: 'center', paddingHorizontal: 24 },

  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#172117',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  slotIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#E6F7E3',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  slotBadge: {
    position: 'absolute',
    right: -4, bottom: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#087A0A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
    paddingHorizontal: 3,
  },
  slotBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },

  slotDayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotDay: { fontSize: 15, fontWeight: '800', color: '#172117' },
  activePill: {
    backgroundColor: '#E6F7E3',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activePillText: { fontSize: 10, fontWeight: '800', color: '#087A0A' },
  slotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  slotTime: { fontSize: 12.5, color: '#172117', fontWeight: '600' },
  slotMeta: { fontSize: 12, color: '#667066' },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0F8EF',
    borderWidth: 1,
    borderColor: '#C8EEBF',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
  },
  infoText: { flex: 1, fontSize: 12.5, color: '#172117', lineHeight: 18 },
});
