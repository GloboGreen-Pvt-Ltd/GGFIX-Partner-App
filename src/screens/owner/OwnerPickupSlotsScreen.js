import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// Screen palette (this screen only).
const C = {
  deep: '#004C40',
  primary: '#006B57',
  bright: '#00A86B',
  mint: '#E8F7F2',
  softMint: '#F4FBF8',
  bg: '#F8FCFA',
  card: '#FFFFFF',
  border: '#DCE7E2',
  text: '#111827',
  muted: '#667085',
  warn: '#F59E0B',
  softWarn: '#FFF7DF',
};

// Pure-JS picker, like the price-estimate screen's: a native time picker would
// need @react-native-community/datetimepicker and a full native rebuild.
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'));
const PICK_ROW_H = 44;

function PickColumn({ items, value, onChange, label }) {
  const ref = useRef(null);
  const index = Math.max(0, items.indexOf(value));
  return (
    <View style={styles.pickCol}>
      <Text style={styles.pickColLabel}>{label}</Text>
      <ScrollView
        ref={ref}
        style={styles.pickList}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        // Open with the current value in view, not scrolled back to 00.
        onLayout={() => ref.current?.scrollTo({ y: Math.max(0, (index - 2) * PICK_ROW_H), animated: false })}
      >
        {items.map((it) => {
          const on = it === value;
          return (
            <Pressable
              key={it}
              onPress={() => onChange(it)}
              style={[styles.pickRow, on && styles.pickRowOn]}
            >
              <Text style={[styles.pickRowText, on && styles.pickRowTextOn]}>{it}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Edits a local draft; only "Set time" hands the value back, so Cancel (or the
 * backdrop / back button) leaves the field exactly as it was.
 */
function TimePickerSheet({ visible, title, value, fallback, onCancel, onConfirm }) {
  const [hh, setHh] = useState('09');
  const [mm, setMm] = useState('00');
  useEffect(() => {
    if (!visible) return;
    const t = parseTimeInput(value) || fallback;
    setHh(t.slice(0, 2));
    setMm(t.slice(3, 5));
  }, [visible, value, fallback]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.pickBackdrop} onPress={onCancel}>
        {/* Swallows the backdrop press so tapping inside the card can't close it. */}
        <Pressable style={styles.pickCard} onPress={() => {}}>
          <Text style={styles.pickTitle}>{title}</Text>
          <Text style={styles.pickPreview}>{`${hh}:${mm}`}</Text>
          {visible ? (
            <View style={styles.pickCols}>
              <PickColumn label="Hour" items={HOURS} value={hh} onChange={setHh} />
              <Text style={styles.pickColon}>:</Text>
              <PickColumn label="Minute" items={MINUTES} value={mm} onChange={setMm} />
            </View>
          ) : null}
          <View style={styles.pickActions}>
            <TouchableOpacity style={[styles.pickBtn, styles.pickBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={[styles.pickBtnText, { color: C.muted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: C.deep }]}
              onPress={() => onConfirm(`${hh}:${mm}`)}
              activeOpacity={0.85}
            >
              <Text style={[styles.pickBtnText, { color: '#FFFFFF' }]}>Set time</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// One whole-field tap target: icon, value, blank space and chevron all open the picker.
// Plain style (not a `({ pressed }) =>` function — NativeWind drops those).
function TimeField({ label, value, placeholder, onPress }) {
  return (
    <View style={styles.col}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={styles.fieldBox}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || 'not set'}`}
      >
        <Ionicons name="time-outline" size={20} color={C.primary} />
        <Text
          style={[styles.fieldValue, !value && { color: '#9AA8A1' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {value ? normaliseTime(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </TouchableOpacity>
    </View>
  );
}

function ScreenHeader({ title, onBack, topInset }) {
  return (
    <LinearGradient
      colors={['#00875A', C.primary, C.deep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: topInset + 10 }]}
    >
      {/* Decorative curved shapes — pointerEvents none so they never eat taps. */}
      <View pointerEvents="none" style={[styles.heroBlob, styles.heroBlobA]} />
      <View pointerEvents="none" style={[styles.heroBlob, styles.heroBlobB]} />
      <View style={styles.heroRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={8} activeOpacity={0.7} style={styles.heroBack}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.heroTitle} numberOfLines={1}>{title}</Text>
      </View>
    </LinearGradient>
  );
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
  // Which time field the shared picker is editing: 'startTime' | 'endTime' | null.
  const [timeField, setTimeField] = useState(null);
  const insets = useSafeAreaInsets();

  // The design's gradient hero replaces the stack header on this screen only.
  useLayoutEffect(() => {
    navigation?.setOptions?.({ headerShown: false });
  }, [navigation]);
  const onBack = navigation?.canGoBack?.() ? () => navigation.goBack() : null;

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
      <View style={styles.safe}>
        <ScreenHeader title="Pickup Service" onBack={onBack} topInset={insets.top} />
        <View style={styles.center}><Text style={styles.errorText}>Please log in again.</Text></View>
      </View>
    );
  }

  // Display-only check so a reversed window is flagged before submit; the
  // rule itself is still enforced by onSubmit.
  const liveStart = parseTimeInput(form.startTime);
  const liveEnd = parseTimeInput(form.endTime);
  const windowInvalid = !!(liveStart && liveEnd && liveStart >= liveEnd);

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Pickup Service" onBack={onBack} topInset={insets.top} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Master pickup switch. Sits above the slot editor because it gates
            everything below it: with pickup off the shop is not listed in the
            customer app's pickup shop list, whatever the slots say. */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={[styles.iconTile, !pickupEnabled && styles.iconTileOff]}>
              <Ionicons
                name="car-outline"
                size={28}
                color={pickupEnabled ? C.deep : '#8FA08F'}
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
              <ActivityIndicator color={C.primary} style={styles.toggleSpinner} />
            ) : (
              <Switch
                value={pickupEnabled}
                onValueChange={onTogglePickup}
                disabled={!ownerId}
                trackColor={{ false: '#E2E8E2', true: C.bright }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E2E8E2"
              />
            )}
          </View>

          {pickupEnabled === false ? (
            <View style={styles.warnBanner}>
              <View style={styles.warnIcon}>
                <Ionicons name="eye-off-outline" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.warnTitle}>Pickup is off.</Text>
                <Text style={styles.warnText}>
                  Customers won’t see this shop when they search for pickup shops. Your saved
                  slots are kept — turn pickup back on to start receiving requests again.
                </Text>
              </View>
            </View>
          ) : null}

          {pickupEnabled === true && !loading && slots.length === 0 ? (
            <View style={styles.warnBanner}>
              <View style={styles.warnIcon}>
                <Text style={styles.warnIconText}>!</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.warnTitle}>Pickup is on but you have no slots yet.</Text>
                <Text style={styles.warnText}>
                  Add at least one below so customers have a time window to book.
                </Text>
              </View>
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
            <View style={styles.iconTile}>
              <Ionicons name="calendar-outline" size={28} color={C.deep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitleLg}>Add pickup slot</Text>
              <Text style={styles.cardSub}>
                Define the time window and how many pickups you can handle in it.
              </Text>
            </View>
          </View>

          <Text style={styles.daysLabel}>Days</Text>
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
            <TimeField
              label="Start time (HH:MM)"
              value={form.startTime}
              placeholder="09:00"
              onPress={() => setTimeField('startTime')}
            />
            <TimeField
              label="End time (HH:MM)"
              value={form.endTime}
              placeholder="12:00"
              onPress={() => setTimeField('endTime')}
            />
          </View>
          {windowInvalid ? (
            <Text style={styles.errorText}>End time must be after start time.</Text>
          ) : null}

          <Text style={styles.label}>Distance (KM)</Text>
          <View style={styles.fieldBox}>
            <Ionicons name="location-outline" size={20} color={C.primary} />
            <TextInput
              style={styles.fieldInput}
              value={form.capacity}
              onChangeText={(t) => setForm((f) => ({ ...f, capacity: t }))}
              placeholder="20"
              placeholderTextColor="#9AA8A1"
              keyboardType="number-pad"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={onSubmit}
            disabled={submitting}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#00C27A', C.bright, C.deep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGrad}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    {form.days.length > 1 ? `Add slots (${form.days.length})` : 'Add slot'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.savedHeaderRow}>
          <View style={styles.savedTitleRow}>
            <Ionicons name="list-outline" size={22} color={C.deep} />
            <Text style={styles.sectionLabel}>Saved Pickup Slots</Text>
          </View>
          <View>
            <TouchableOpacity
              style={styles.sortBtn}
              onPress={() => setSortMenuOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-vertical" size={16} color={C.deep} />
              <Text style={styles.sortText}>
                Sort by: <Text style={styles.sortValue}>{sortBy === 'time' ? 'Time' : 'Day'}</Text>
              </Text>
              <Ionicons name="chevron-down" size={14} color={C.text} />
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
                    {sortBy === opt.key ? <Ionicons name="checkmark" size={14} color={C.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
        ) : slots.length === 0 ? (
          <View style={styles.emptyCard}>
            {/* Lightweight decorative hills — plain shapes, no assets. */}
            <View pointerEvents="none" style={[styles.emptyHill, styles.emptyHillL]} />
            <View pointerEvents="none" style={[styles.emptyHill, styles.emptyHillR]} />
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={28} color={C.deep} />
            </View>
            <Text style={styles.emptyTitle}>No pickup slots yet.</Text>
            <Text style={styles.emptyText}>Add one above to get started.</Text>
          </View>
        ) : (
          // Read-only cards: a saved slot is something customers can already be
          // booking against, so it carries no edit or delete affordance.
          sortedSlots.map((slot, index) => (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotIconWrap}>
                <Ionicons name="calendar-outline" size={20} color={C.deep} />
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
                  <Ionicons name="time-outline" size={13} color={C.muted} />
                  <Text style={styles.slotTime}>
                    {to12h(slot.startTime)} – {to12h(slot.endTime)}
                  </Text>
                </View>
                <View style={styles.slotMetaRow}>
                  <Ionicons name="location-outline" size={13} color={C.muted} />
                  <Text style={styles.slotMeta}>Distance: {slot.capacity ?? 10} km</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={C.primary} />
          <Text style={styles.infoText}>
            Customers can book a pickup within the selected time window on the
            selected days only. A saved slot can’t be edited or removed — switch
            Pickup Service off to stop taking pickups without losing it.
          </Text>
        </View>
        </>
        )}
      </ScrollView>

      <TimePickerSheet
        visible={timeField !== null}
        title={timeField === 'endTime' ? 'End time' : 'Start time'}
        value={timeField ? form[timeField] : ''}
        fallback={timeField === 'endTime' ? '12:00' : '09:00'}
        onCancel={() => setTimeField(null)}
        onConfirm={(t) => {
          const field = timeField;
          setTimeField(null);
          // Updates only the field that opened the picker.
          if (field) setForm((f) => ({ ...f, [field]: t }));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ---- gradient hero
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
  },
  heroBlob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroBlobA: { width: 260, height: 260, top: -150, right: -60 },
  heroBlobB: { width: 180, height: 180, bottom: -120, left: 90, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroBack: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { flex: 1, fontSize: 21.5, fontWeight: '800', color: '#FFFFFF' },

  // ---- cards
  card: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEF4F1',
    shadowColor: '#0B3B2E',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  iconTile: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  iconTileOff: { backgroundColor: '#EFF5EE' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  cardTitleLg: { fontSize: 17, fontWeight: '800', color: C.text },
  cardSub: { fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 18 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Reserve the switch's footprint so swapping in the spinner doesn't reflow
  // the row (the title would visibly jump on every save).
  toggleSpinner: { width: 51, alignItems: 'center' },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.softWarn,
    borderWidth: 1,
    borderColor: '#FBE3A6',
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  warnIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.warn,
    borderWidth: 3, borderColor: '#FDE3B0',
    alignItems: 'center', justifyContent: 'center',
  },
  warnIconText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  warnTitle: { fontSize: 13, fontWeight: '800', color: '#6B3A00' },
  warnText: { fontSize: 12.5, color: '#7C4A03', lineHeight: 17, marginTop: 1 },

  daysLabel: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 12, marginBottom: 8 },
  label: { fontSize: 13, color: C.text, fontWeight: '700', marginTop: 12, marginBottom: 6 },

  // Shared by the two time fields and the distance field.
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    backgroundColor: C.softMint,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  fieldValue: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  fieldInput: { flex: 1, height: '100%', paddingVertical: 0, fontSize: 15, fontWeight: '600', color: C.text },

  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },

  circleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  dayCircle: {
    flex: 1,
    maxWidth: 48,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#EEF3F0',
    alignItems: 'center', justifyContent: 'center',
  },
  dayCircleActive: {
    backgroundColor: C.deep,
    shadowColor: C.deep,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dayCircleText: { fontSize: 15, color: '#4B5563', fontWeight: '800' },
  dayCircleTextActive: { color: '#FFFFFF' },

  errorText: { fontSize: 12, color: '#DC2626', marginTop: 6 },
  hint: { fontSize: 12, color: C.muted, marginTop: 8, fontStyle: 'italic', lineHeight: 16 },

  submitBtn: {
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: C.deep,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  submitGrad: {
    flexDirection: 'row',
    gap: 10,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ---- saved slots
  savedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
    zIndex: 20,
    elevation: 20,
  },
  savedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sectionLabel: { fontSize: 16, fontWeight: '800', color: C.text },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.softMint,
  },
  sortText: { fontSize: 12.5, color: C.text, fontWeight: '600' },
  sortValue: { fontWeight: '800', color: C.text },
  sortMenu: {
    position: 'absolute',
    top: 38, right: 0,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
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
    paddingVertical: 8,
  },
  sortMenuText: { fontSize: 13, color: C.muted, fontWeight: '600' },
  sortMenuTextActive: { color: C.primary, fontWeight: '800' },

  emptyCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    paddingTop: 18,
    paddingBottom: 26,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEF4F1',
  },
  emptyHill: { position: 'absolute', bottom: -40, width: 170, height: 80, borderRadius: 999, backgroundColor: C.mint },
  emptyHillL: { left: -40 },
  emptyHillR: { right: -40 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  emptyText: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 3, paddingHorizontal: 24 },

  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EEF4F1',
    shadowColor: '#0B3B2E',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  slotIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  slotBadge: {
    position: 'absolute',
    right: -4, bottom: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.deep,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
    paddingHorizontal: 3,
  },
  slotBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },

  slotDayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotDay: { fontSize: 14, fontWeight: '800', color: C.text },
  activePill: {
    backgroundColor: C.mint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activePillText: { fontSize: 10, fontWeight: '800', color: C.primary },
  slotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  slotTime: { fontSize: 12.5, color: C.text, fontWeight: '600' },
  slotMeta: { fontSize: 12, color: C.muted },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.softMint,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  infoText: { flex: 1, fontSize: 12.5, color: C.text, lineHeight: 18 },

  // ---- time picker sheet
  pickBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pickCard: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16 },
  pickTitle: { fontSize: 13, fontWeight: '800', color: C.muted, textAlign: 'center', letterSpacing: 0.6 },
  pickPreview: { fontSize: 28, fontWeight: '800', color: C.deep, textAlign: 'center', marginTop: 2 },
  pickCols: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  pickCol: { flex: 1 },
  pickColLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center', marginBottom: 4 },
  pickColon: { fontSize: 20, fontWeight: '800', color: C.muted, paddingHorizontal: 8, paddingBottom: 90 },
  pickList: { height: PICK_ROW_H * 5, borderRadius: 14, backgroundColor: C.softMint, borderWidth: 1, borderColor: C.border },
  pickRow: { height: PICK_ROW_H, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6, borderRadius: 10 },
  pickRowOn: { backgroundColor: C.deep },
  pickRowText: { fontSize: 16, fontWeight: '600', color: C.text },
  pickRowTextOn: { color: '#FFFFFF', fontWeight: '800' },
  pickActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pickBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickBtnGhost: { backgroundColor: '#F2F4F7' },
  pickBtnText: { fontSize: 14, fontWeight: '800' },
});
