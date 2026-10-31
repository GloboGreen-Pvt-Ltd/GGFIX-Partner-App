import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Pressable,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeft } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { authApi, ticketApi } from '../../api/client';
import { uploadMedia } from '../../api/masterData';
import { selectShopId } from '../../store/authSlice';
import { getSession } from '../../auth/session';
import { confirm, notify } from '../../components/confirm';
import SafeModal from '../../components/SafeModal';
import { FEATURE } from '../../subscription/entitlements';
import { showLimitPopup } from '../../subscription/limitPopup';
import { useResponsive } from '../../theme/responsive';
import { rlh, rs } from '../../utils/responsive';
import LedgerDateSheet from './LedgerDateSheet';
import { normalizeIndianMobile } from '../../utils/mobile';

const ROLES = ['Technician', 'Staff', 'Pickup Person'];

// A "shift" is the employee's default check-in / check-out pair — the only
// shift data the technician record stores. Picking a preset fills both times
// (still editable below); times that match no preset read as Custom Shift.
// Presets follow the shop's hours (Shop Info → Opening / Closing Time):
// General = open → close, Morning = open → midday, Evening = midday → close.
// No night shift. Unknown / unreadable hours fall back to 09:30 – 18:30.
const hhmm = (t) => String(t || '').trim().slice(0, 5);
const pad2t = (n) => String(n).padStart(2, '0');
// "08:00 AM" / "9:30 pm" / "18:30" → minutes since midnight, else null.
function shopTimeMins(v) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*$/.exec(String(v || ''));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
}
const minsToHhmm = (x) => `${pad2t(Math.floor(x / 60))}:${pad2t(x % 60)}`;
function buildShiftPresets(openingTime, closingTime) {
  let open = shopTimeMins(openingTime);
  let close = shopTimeMins(closingTime);
  if (open == null || close == null || close <= open) { open = 9 * 60 + 30; close = 18 * 60 + 30; }
  const mid = Math.round((open + close) / 2 / 30) * 30;
  return [
    { label: 'General Shift', checkIn: minsToHhmm(open), checkOut: minsToHhmm(close) },
    { label: 'Morning Shift', checkIn: minsToHhmm(open), checkOut: minsToHhmm(mid) },
    { label: 'Evening Shift', checkIn: minsToHhmm(mid), checkOut: minsToHhmm(close) },
  ];
}
const DEFAULT_SHIFT_PRESETS = buildShiftPresets();
function shiftLabelFor(checkIn, checkOut, presets = DEFAULT_SHIFT_PRESETS) {
  const hit = presets.find((p) => p.checkIn === hhmm(checkIn) && p.checkOut === hhmm(checkOut));
  return hit ? hit.label : 'Custom Shift';
}

const pad2 = (n) => String(n).padStart(2, '0');
// Local-calendar YYYY-MM-DD — toISOString() would shift the day across UTC midnight.
const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
// Display only — the form state and API payload stay YYYY-MM-DD.
const formatDisplayDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  if (m) return `${m[3]} - ${m[2]} - ${m[1]}`;
  return v ? String(v) : 'DD - MM - YYYY';
};
// Where the calendar opens when the field is still empty.
const defaultBirthDate = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 25); return d; };

const INVALID_MOBILE_MSG = 'Enter a 10-digit Indian mobile number, e.g. 9876543210.';

// Comparison key only — the name is still saved exactly as typed.
const normalizeEmployeeName = (name) =>
  String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * One name and one mobile per employee within the current shop. Reads the same
 * GET /technicians the Employees list shows (already shop-scoped by the owner's
 * token); rows that carry a different shopId are ignored anyway. `excludeId` is
 * the employee being edited, so keeping their own name/mobile is allowed.
 *
 * @returns {Promise<string|null>} the validation message, or null when clear.
 *          Throws when the list can't be fetched — saving unchecked is what
 *          produced the duplicates in the first place.
 */
async function findDuplicateEmployee({ name, phone, shopId, excludeId }) {
  let rows;
  try {
    rows = await ticketApi.get('/technicians');
  } catch (_) {
    throw new Error('Could not check existing employees. Please check your connection and try again.');
  }
  const others = (Array.isArray(rows) ? rows : []).filter((t) =>
    t
    && (excludeId == null || String(t.id) !== String(excludeId))
    && (t.shopId == null || !shopId || String(t.shopId) === String(shopId)));
  const key = normalizeEmployeeName(name);
  if (others.some((t) => normalizeEmployeeName(t.name) === key)) {
    return 'An employee with this name already exists.';
  }
  if (phone && others.some((t) => normalizeIndianMobile(t.phone) === phone)) {
    return 'An employee with this mobile number already exists.';
  }
  return null;
}

// Diagnostics for the two-step add-employee flow. Only the stage, HTTP status
// and (dev builds only) the auth userId — never passwords, OTPs or tokens.
function logEmployeeSetup(event, { stage, status, userId, ...rest } = {}) {
  console.warn(`[employee-setup] ${event}`, {
    stage,
    status: status ?? null,
    ...(__DEV__ && userId ? { userId } : {}),
    ...rest,
  });
}

// A failure the owner must read and act on — a toast would vanish too fast.
function showBlockingError(title, message) {
  if (Platform.OS === 'web') notify(title, message);
  else Alert.alert(title, message);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Month + year picker for the "This Month" card. Months after the current one
// are disabled: attendance for days that have not happened is always empty.
function MonthPickerModal({ visible, value, onClose, onPick }) {
  const [year, setYear] = useState(value.year);
  useEffect(() => { if (visible) setYear(value.year); }, [visible, value.year]);
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  return (
    <SafeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mpBackdrop} onPress={onClose}>
        {/* Swallows the backdrop press so tapping inside the card can't close it. */}
        <Pressable style={styles.mpCard} onPress={() => {}}>
          <View style={styles.mpHeader}>
            <TouchableOpacity style={styles.mpNav} onPress={() => setYear((y) => y - 1)} hitSlop={rs(8)}>
              <Ionicons name="chevron-back" size={rs(16)} color="#111111" />
            </TouchableOpacity>
            <Text style={styles.mpYear}>{year}</Text>
            <TouchableOpacity
              style={[styles.mpNav, year >= curYear && { opacity: 0.35 }]}
              onPress={() => setYear((y) => y + 1)}
              disabled={year >= curYear}
              hitSlop={rs(8)}
            >
              <Ionicons name="chevron-forward" size={rs(16)} color="#111111" />
            </TouchableOpacity>
          </View>
          <View style={styles.mpGrid}>
            {MONTHS.map((m, i) => {
              const month = i + 1;
              const future = year > curYear || (year === curYear && month > curMonth);
              const selected = year === value.year && month === value.month;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.mpCell, selected && styles.mpCellSelected, future && { opacity: 0.35 }]}
                  onPress={() => onPick({ month, year })}
                  disabled={future}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.mpCellText, selected && styles.mpCellTextSelected]}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.mpFooter}>
            <TouchableOpacity
              style={[styles.mpBtn, { backgroundColor: '#E5F3F5' }]}
              onPress={() => onPick({ month: curMonth, year: curYear })}
            >
              <Text style={[styles.mpBtnText, { color: '#035C6C' }]}>This Month</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mpBtn, { backgroundColor: '#F3F4F6' }]} onPress={onClose}>
              <Text style={[styles.mpBtnText, { color: '#6B7280' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </SafeModal>
  );
}

// Green-icon labelled cell used in the contact footer grid.
// Brand sheet: teal, bright blue, green, orange, navy, red (+ two teal/blue shades).
const QA_TONES = ['#035C6C', '#0788C9', '#609138', '#FAA700', '#1C3053', '#F32C26'];
const NAVY = '#1C3053';

function FooterItem({ icon, label, value, tone = '#035C6C' }) {
  return (
    <View style={styles.footerItem}>
      <View style={[styles.footerIconWrap, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={rs(16)} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.footerItemLabel}>{label}</Text>
        <Text style={styles.footerItemValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ===== Add / Edit form helpers =====
// Section-header disc colours, in brand rotation order (one per form section).
const FORM_TONES = ['#035C6C', '#0788C9', '#609138', '#FAA700', '#1C3053', '#F32C26'];

// Round back button for the navigator-drawn form header.
function FormHeaderBack({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.formBackBtn}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <ArrowLeft size={18} color="#111111" strokeWidth={2.25} />
    </TouchableOpacity>
  );
}

// Form header stays on the navigator (same mechanism as before) — only styled:
// white bar, 36pt round back button, 17/800 ink title.
const formHeaderOptions = (navigation) => ({
  headerStyle: { backgroundColor: '#FFFFFF' },
  headerShadowVisible: true,
  headerTintColor: '#111111',
  headerTitleAlign: 'center',
  headerTitleStyle: { color: '#111111', fontWeight: '800', fontSize: 17 },
  headerBackVisible: false,
  headerLeft: () => (navigation.canGoBack?.() ? <FormHeaderBack onPress={() => navigation.goBack()} /> : null),
});

// Small solid disc + white icon + navy title, used for every form section.
function FormSectionHeader({ icon, title, tone }) {
  return (
    <View style={styles.addSectionHeader}>
      <View style={[styles.secIconWrap, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={rs(16)} color="#FFFFFF" />
      </View>
      <Text style={styles.addSectionTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

export default function OwnerEmployeeDetailScreen({ route, navigation }) {
  const shopId = useSelector(selectShopId);
  // Shift presets from the active shop's opening / closing time.
  const [shiftPresets, setShiftPresets] = useState(DEFAULT_SHIFT_PRESETS);
  useEffect(() => {
    let alive = true;
    getSession().then((sess) => {
      const shop = sess?.activeShop;
      if (alive && shop) setShiftPresets(buildShiftPresets(shop.openingTime, shop.closingTime));
    }).catch(() => {});
    return () => { alive = false; };
  }, [shopId]);
  const employee = route.params?.employee;
  const mode = route.params?.mode || (employee ? 'view' : 'add');
  const isAdd = mode === 'add';
  const isEdit = mode === 'edit';

  // Tablet: cap the column and centre it. The edit form is the reason this
  // matters most — labelled inputs stretched to 1024pt put the label and its
  // value at opposite edges of the screen. Phones keep contentW undefined.
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

  useEffect(() => {
    if (isEdit) {
      navigation.setOptions?.({ title: 'Edit Profile', headerRight: undefined, ...formHeaderOptions(navigation) });
    } else if (isAdd) {
      navigation.setOptions?.({ title: 'Add Employee', ...formHeaderOptions(navigation) });
    } else if (mode === 'view' && employee) {
      navigation.setOptions?.({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.push('OwnerEmployeeDetail', { employee, mode: 'edit' })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingHorizontal: rs(6) }}
          >
            <Ionicons name="ellipsis-vertical" size={rs(20)} color="#035C6C" />
          </TouchableOpacity>
        ),
      });
    }
  }, [isEdit, isAdd, mode, navigation, employee]);

  // Staff App login = the technician row carries an auth userId. Seeded from the
  // list row, then refreshed from GET /technicians/{id} when that returns the field.
  const [linkedUserId, setLinkedUserId] = useState(employee?.userId || null);
  // The mobile the Staff App login was created with, for the edit-mode check.
  const originalPhoneRef = useRef(normalizeIndianMobile(employee?.phone));
  // A login created by a failed add attempt, reused on retry so a second
  // auth account isn't created for the same mobile.
  const pendingLoginRef = useRef(null);
  // Synchronous double-tap guard: `saving` only disables the button after the
  // next render, and the duplicate check awaits a network call before that.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (mode !== 'view' || !employee?.id) return;
    let cancelled = false;
    ticketApi.get(`/technicians/${employee.id}`)
      .then((fresh) => {
        if (!cancelled && fresh && 'userId' in fresh) setLinkedUserId(fresh.userId || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, employee?.id]);

  useEffect(() => {
    if (!isEdit || !employee?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await ticketApi.get(`/technicians/${employee.id}`);
        if (cancelled || !fresh) return;
        if ('userId' in fresh) setLinkedUserId(fresh.userId || null);
        if (fresh.phone != null) originalPhoneRef.current = normalizeIndianMobile(fresh.phone);
        setForm((p) => ({
          ...p,
          name: fresh.name ?? p.name,
          phone: fresh.phone ?? p.phone,
          email: fresh.email ?? p.email,
          roleLabel: fresh.roleLabel ?? p.roleLabel,
          salaryAmount: fresh.salaryAmount ?? p.salaryAmount,
          salaryPeriod: fresh.salaryPeriod ?? p.salaryPeriod,
          dateOfBirth: fresh.dateOfBirth ?? p.dateOfBirth,
          dateOfJoin: fresh.dateOfJoin ?? p.dateOfJoin,
          defaultCheckIn: fresh.defaultCheckIn ?? p.defaultCheckIn,
          defaultCheckOut: fresh.defaultCheckOut ?? p.defaultCheckOut,
          photoUrl: fresh.photoUrl ?? p.photoUrl,
          dailyWage: fresh.dailyWage ?? p.dailyWage,
          aadharNumber: fresh.aadharNumber ?? p.aadharNumber,
          aadharFrontUrl: fresh.aadharFrontUrl ?? p.aadharFrontUrl,
          aadharBackUrl: fresh.aadharBackUrl ?? p.aadharBackUrl,
          panNumber: fresh.panNumber ?? p.panNumber,
          panFrontUrl: fresh.panFrontUrl ?? p.panFrontUrl,
          panBackUrl: fresh.panBackUrl ?? p.panBackUrl,
        }));
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, employee?.id]);

  const [active, setActive] = useState(employee?.isAvailable !== false);
  const [saving, setSaving] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [dateField, setDateField] = useState(null); // 'dateOfJoin' | 'dateOfBirth' | null
  const [showPassword, setShowPassword] = useState(false);
  const [loginEnabled, setLoginEnabled] = useState(true);
  const [form, setForm] = useState({
    name: employee?.name ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    password: '',
    roleLabel: employee?.roleLabel ?? '',
    salaryAmount: employee?.salaryAmount ?? '',
    salaryPeriod: employee?.salaryPeriod ?? 'Monthly',
    dateOfBirth: employee?.dateOfBirth ?? '',
    dateOfJoin: employee?.dateOfJoin ?? '',
    defaultCheckIn: employee?.defaultCheckIn ?? '09:30',
    defaultCheckOut: employee?.defaultCheckOut ?? '18:30',
    photoUrl: employee?.photoUrl ?? '',
    dailyWage: employee?.dailyWage ?? '',
    aadharNumber: employee?.aadharNumber ?? '',
    aadharFrontUrl: employee?.aadharFrontUrl ?? '',
    aadharBackUrl: employee?.aadharBackUrl ?? '',
    panNumber: employee?.panNumber ?? '',
    panFrontUrl: employee?.panFrontUrl ?? '',
    panBackUrl: employee?.panBackUrl ?? '',
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const [uploading, setUploading] = useState({});

  const FOLDER_FOR = {
    photoUrl: 'employees',
    aadharFrontUrl: 'employee-ids',
    aadharBackUrl: 'employee-ids',
    panFrontUrl: 'employee-ids',
    panBackUrl: 'employee-ids',
  };

  const pickImage = async (field, fromCamera) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo library'} access to upload an image.`);
        return;
      }
      const opts = {
        quality: 0.7,
        mediaTypes: ['images'],
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      // Show preview immediately, then upload in background and swap in the hosted URL.
      set(field, asset.uri);
      setUploading((p) => ({ ...p, [field]: true }));
      try {
        const hostedUrl = await uploadMedia(asset, FOLDER_FOR[field] || 'employees');
        if (hostedUrl) set(field, hostedUrl);
        else throw new Error('Server returned no URL');
      } catch (uploadErr) {
        set(field, '');
        notify('Upload failed', uploadErr?.message || 'Could not upload image. Please try again.', { preset: 'error', haptic: 'error' });
      } finally {
        setUploading((p) => ({ ...p, [field]: false }));
      }
    } catch (e) {
      notify('Could not pick image', e?.message || 'Please try again.', { preset: 'error' });
    }
  };

  const promptImageSource = (field) => {
    // RN Web's Alert.alert collapses to window.alert and ignores multi-button menus,
    // so the Take Photo / Choose from Library sheet never fires the picker on web.
    // Go straight to the library picker on web; show the action sheet on native.
    if (Platform.OS === 'web') {
      pickImage(field, false);
      return;
    }
    Alert.alert('Add image', '', [
      { text: 'Take Photo', onPress: () => pickImage(field, true) },
      { text: 'Choose from Library', onPress: () => pickImage(field, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSaveNew = async () => {
    if (!form.name?.trim()) {
      notify('Required', 'Enter employee name');
      return;
    }
    // Checked before the login is created, so a pending upload can't leave a
    // login with no employee record behind it.
    if (Object.values(uploading).some(Boolean)) {
      notify('Please wait', 'An image is still uploading.');
      return;
    }
    const email = form.email?.trim() || null;
    const password = form.password?.trim() || null;
    // One normalized 10-digit mobile for the auth account AND the technician row —
    // the Staff App logs in with exactly this string.
    const phone = normalizeIndianMobile(form.phone);
    if (phone === null) {
      notify('Invalid mobile number', INVALID_MOBILE_MSG);
      return;
    }
    if (password && password.length < 4) {
      notify('Validation', 'Password must be at least 4 characters');
      return;
    }
    // Honor the "Employee login enabled" toggle — an owner who unchecks it wants
    // a records-only employee. When it is ticked the Staff App login is keyed on
    // the mobile (mobile + OTP), so a valid mobile is mandatory and the employee
    // is never saved without the login it was meant to have.
    const provisionLogin = loginEnabled;
    if (provisionLogin && !phone) {
      notify(
        'Mobile number required',
        'Staff App login needs a 10-digit mobile number. Enter one, or untick "Employee login enabled" to save without Staff App login.',
      );
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      const dupMsg = await findDuplicateEmployee({ name: form.name, phone, shopId });
      if (dupMsg) {
        notify('Duplicate employee', dupMsg, { preset: 'error', haptic: 'error' });
        return;
      }
      let userId = null;
      if (provisionLogin) {
        if (!shopId) {
          notify('Error', 'Session expired. Please log in again.', { preset: 'error', haptic: 'error' });
          setSaving(false);
          return;
        }
        const pending = pendingLoginRef.current;
        if (pending && pending.phone === phone) {
          // Retrying after "setup incomplete": the login already exists.
          userId = pending.userId;
        } else {
          try {
            const authRes = await authApi.post(`/auth/shops/${shopId}/technicians`, {
              body: {
                email,
                password,
                phone,
                name: form.name.trim(),
                roleLabel: (form.roleLabel && form.roleLabel.trim()) || null,
              },
            });
            userId = authRes?.userId || null;
          } catch (authErr) {
            logEmployeeSetup('login creation failed', { stage: 'auth:create-technician', status: authErr?.status });
            const msg = authErr?.message || authErr?.payload?.message || '';
            const isShopNotFound = msg.includes('Shop not found') || (authErr?.status === 400 && String(msg).toLowerCase().includes('shop'));
            if (isShopNotFound) {
              showBlockingError(
                'Staff App login not set up',
                'Your shop could not be found for this session, so nothing was saved. Log out and log back in, then try again — or untick "Employee login enabled" to save this employee without Staff App login.',
              );
              setSaving(false);
              return;
            }
            throw authErr;
          }
          if (!userId) {
            logEmployeeSetup('login creation returned no userId', { stage: 'auth:create-technician' });
            showBlockingError(
              'Staff App login not set up',
              'The login service did not return an account for this employee, so the employee was not saved. Please try again.',
            );
            setSaving(false);
            return;
          }
          if (pending) {
            // The mobile changed since the failed attempt; that earlier login is orphaned.
            logEmployeeSetup('earlier partial login superseded', { stage: 'auth:create-technician', userId: pending.userId });
          }
          pendingLoginRef.current = { phone, userId };
        }
      }
      await doCreateEmployee(userId, phone);
    } catch (e) {
      if (e?.status === 409) { await handleSeatLimit(e); return; }
      notify('Error', e.message || 'Failed to add employee', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  /**
   * The plan refused another employee. Both halves of the add-staff flow can
   * raise this — auth-service when the login is provisioned, ticket-service
   * when the employee row is created — and the login is provisioned first
   * precisely so the refusal lands before anything has been written.
   */
  const handleSeatLimit = async (e) => {
    setSaving(false);
    await showLimitPopup(navigation, FEATURE.EMPLOYEES, null, e?.payload);
  };

  const doCreateEmployee = async (userId, phone) => {
    try {
      // If any image upload is still in progress, block save and ask the user to wait.
      if (Object.values(uploading).some(Boolean)) {
        notify('Please wait', 'An image is still uploading.');
        setSaving(false);
        return;
      }
      const photoUrl = form.photoUrl;

      const withLogin = !!userId;
      const body = {
        name: form.name.trim(),
        phone: phone || null,
        email: (form.email && form.email.trim()) || null,
        roleLabel: (form.roleLabel && form.roleLabel.trim()) || null,
        salaryAmount: (form.salaryAmount && form.salaryAmount.trim()) || null,
        salaryPeriod: (form.salaryPeriod && form.salaryPeriod.trim()) || null,
        dateOfBirth: (form.dateOfBirth && form.dateOfBirth.trim()) || null,
        dateOfJoin: (form.dateOfJoin && form.dateOfJoin.trim()) || null,
        defaultCheckIn: (form.defaultCheckIn && form.defaultCheckIn.trim()) || null,
        defaultCheckOut: (form.defaultCheckOut && form.defaultCheckOut.trim()) || null,
        photoUrl: (photoUrl && photoUrl.trim()) || null,
        dailyWage: (form.dailyWage && String(form.dailyWage).trim()) || null,
        aadharNumber: (form.aadharNumber && form.aadharNumber.trim()) || null,
        aadharFrontUrl: (form.aadharFrontUrl && form.aadharFrontUrl.trim()) || null,
        aadharBackUrl: (form.aadharBackUrl && form.aadharBackUrl.trim()) || null,
        panNumber: (form.panNumber && form.panNumber.trim().toUpperCase()) || null,
        panFrontUrl: (form.panFrontUrl && form.panFrontUrl.trim()) || null,
        panBackUrl: (form.panBackUrl && form.panBackUrl.trim()) || null,
      };
      if (userId) body.userId = userId;
      const created = await ticketApi.post('/technicians', {
        body,
      });
      pendingLoginRef.current = null;
      setSaving(false);

      // Shop link: only checkable when the response carries shopId. Never
      // backfilled client-side — the server attaches the shop from the token.
      let shopWarning = '';
      if (created && created.shopId != null) {
        if (shopId && String(created.shopId) !== String(shopId)) {
          logEmployeeSetup('shop mismatch', {
            stage: 'ticket:create-technician', expectedShopId: shopId, returnedShopId: created.shopId,
          });
          shopWarning = '\n\nWarning: the server linked this employee to a different shop than the one you are signed in to. Please contact support.';
        }
      } else if (__DEV__) {
        console.log('[employee-setup] server-side shop attachment cannot be confirmed from response');
      }
      if (withLogin && created && 'userId' in created && created.userId !== userId) {
        logEmployeeSetup('userId not stored on technician', { stage: 'ticket:create-technician', userId });
        shopWarning += '\n\nWarning: the employee record was saved without its Staff App login link.';
      }

      const message = (withLogin
        ? `Employee added. They can log in to the NearGFix Staff App with mobile ${phone} and an OTP.`
        : 'Employee added.') + shopWarning;
      requestAnimationFrame(() => {
        navigation.navigate('OwnerEmployeeCreated', {
          employee: created || { name: form.name.trim(), roleLabel: form.roleLabel },
          message,
        });
      });
    } catch (e) {
      if (userId) {
        // The login exists but the employee record does not — the Staff App
        // cannot load a profile for it. No rollback endpoint exists, so say so
        // plainly; pendingLoginRef lets Save retry with the same login.
        logEmployeeSetup('PARTIAL EMPLOYEE CREATION DETECTED', {
          stage: 'ticket:create-technician', status: e?.status, userId,
        });
        const reason = e?.status === 409
          ? 'Your plan has no employee seat left.'
          : (e?.message || 'The server did not accept the employee record.');
        showBlockingError(
          'Employee setup incomplete',
          `A Staff App login was created for ${phone}, but the employee record could not be saved. ${reason}\n\nThe employee cannot use the Staff App yet. Tap Save again to finish setup — the same login will be reused.`,
        );
        return;
      }
      if (e?.status === 409) { await handleSeatLimit(e); return; }
      notify('Error', e.message || 'Failed to add employee', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!employee?.id) return;
    const ok = await confirm({
      title: 'Delete employee?',
      message: `This permanently removes ${form.name?.trim() || 'this employee'}, their app login, and all their attendance / leave data. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await ticketApi.del(`/technicians/${employee.id}`);
      notify('Deleted', 'Employee removed.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to delete employee', { preset: 'error', haptic: 'error' });
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!employee?.id) return;
    if (!form.name?.trim()) {
      notify('Required', 'Enter employee name');
      return;
    }
    if (Object.values(uploading).some(Boolean)) {
      notify('Please wait', 'An image is still uploading.');
      return;
    }
    const phone = normalizeIndianMobile(form.phone);
    if (phone === null) {
      notify('Invalid mobile number', INVALID_MOBILE_MSG);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      const dupMsg = await findDuplicateEmployee({ name: form.name, phone, shopId, excludeId: employee.id });
      if (dupMsg) {
        notify('Duplicate employee', dupMsg, { preset: 'error', haptic: 'error' });
        return;
      }
      // PATCH /technicians/{id} only updates technicians.phone; the project has no
      // endpoint that changes the auth login mobile. Don't let that drift happen
      // silently for an employee who has a Staff App login.
      if (linkedUserId && phone !== (originalPhoneRef.current || '')) {
        const loginPhone = originalPhoneRef.current;
        const ok = await confirm({
          title: 'Staff App login number',
          message:
            "Changing this mobile number will not update the employee's Staff App login number with the current API."
            + (loginPhone ? `\n\nThey will still sign in with ${loginPhone}.` : '')
            + '\n\nSave the new number on the employee record only?',
          confirmText: 'Save anyway',
          cancelText: 'Keep old number',
        });
        if (!ok) {
          set('phone', loginPhone || '');
          return;
        }
      }
      const body = {
        name: form.name.trim(),
        phone: phone || null,
        email: (form.email && form.email.trim()) || null,
        roleLabel: (form.roleLabel && form.roleLabel.trim()) || null,
        salaryAmount: (form.salaryAmount && String(form.salaryAmount).trim()) || null,
        salaryPeriod: (form.salaryPeriod && form.salaryPeriod.trim()) || null,
        dateOfBirth: (form.dateOfBirth && form.dateOfBirth.trim()) || null,
        dateOfJoin: (form.dateOfJoin && form.dateOfJoin.trim()) || null,
        defaultCheckIn: (form.defaultCheckIn && form.defaultCheckIn.trim()) || null,
        defaultCheckOut: (form.defaultCheckOut && form.defaultCheckOut.trim()) || null,
        photoUrl: (form.photoUrl && form.photoUrl.trim()) || null,
        dailyWage: (form.dailyWage && String(form.dailyWage).trim()) || null,
        aadharNumber: (form.aadharNumber && form.aadharNumber.trim()) || null,
        aadharFrontUrl: (form.aadharFrontUrl && form.aadharFrontUrl.trim()) || null,
        aadharBackUrl: (form.aadharBackUrl && form.aadharBackUrl.trim()) || null,
        panNumber: (form.panNumber && form.panNumber.trim().toUpperCase()) || null,
        panFrontUrl: (form.panFrontUrl && form.panFrontUrl.trim()) || null,
        panBackUrl: (form.panBackUrl && form.panBackUrl.trim()) || null,
      };
      await ticketApi.patch(`/technicians/${employee.id}`, { body });
      notify('Saved', 'Profile updated.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to update employee', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const handleToggleActive = async (value) => {
    if (!employee?.id) return;
    setActive(value);
    try {
      await ticketApi.patch(`/technicians/${employee.id}`, {
        body: { isAvailable: value },
      });
    } catch (e) {
      // The optimistic flip has to be undone before anything else — the switch
      // is showing a state the server rejected.
      setActive(!value);
      if (e?.status === 409) { await handleSeatLimit(e); return; }
      notify('Error', e.message || 'Failed to update', { preset: 'error', haptic: 'error' });
    }
  };

  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [advances, setAdvances] = useState([]);
  const [recentLeaves, setRecentLeaves] = useState([]);
  const loadProfileData = useCallback(async () => {
    if (!employee?.id) return;
    try {
      const now = new Date();
      // Attendance follows the month chosen in the "This Month" card; the
      // recent-leave card below stays on the current month.
      const [att, adv, leaves] = await Promise.all([
        ticketApi.get(`/technicians/${employee.id}/attendance`, { query: viewMonth }).catch(() => null),
        ticketApi.get(`/technicians/${employee.id}/advances`).catch(() => []),
        ticketApi.get(`/technicians/${employee.id}/leaves`, { query: { month: now.getMonth() + 1, year: now.getFullYear() } }).catch(() => []),
      ]);
      setAttendanceSummary(att || null);
      setAdvances(Array.isArray(adv) ? adv : []);
      setRecentLeaves(Array.isArray(leaves) ? leaves : []);
    } catch (_) {}
  }, [employee?.id, viewMonth]);
  useEffect(() => {
    if (employee?.id && !isAdd) loadProfileData();
  }, [employee?.id, isAdd, loadProfileData]);
  useFocusEffect(useCallback(() => {
    if (employee?.id && !isAdd) loadProfileData();
  }, [employee?.id, isAdd, loadProfileData]));

  const formatTime = (t) => (t ? (typeof t === 'string' ? t.slice(0, 5) : t) : '—');
  const empId = employee?.id ? `EM-${String(employee.id).slice(0, 8).toUpperCase()}` : '—';
  const recentAdvance = advances[0];
  const recentLeave = recentLeaves[0];
  const formatAdvanceDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const formatLeaveDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  if (isAdd || isEdit) {
    const currentShift = shiftLabelFor(form.defaultCheckIn, form.defaultCheckOut, shiftPresets);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          <ScrollView
            contentContainerStyle={[styles.addContent, capStyle, { paddingBottom: rs(96) + r.insets.bottom }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Profile hero */}
            <View style={styles.editHero}>
              <TouchableOpacity
                style={styles.editHeroAvatarWrap}
                onPress={() => promptImageSource('photoUrl')}
                disabled={!!uploading.photoUrl}
                activeOpacity={0.85}
              >
                {form.photoUrl ? (
                  <Image source={{ uri: form.photoUrl }} style={styles.editHeroAvatar} />
                ) : (
                  <View style={[styles.editHeroAvatar, styles.editHeroAvatarFallback]}>
                    <Ionicons name="person" size={rs(28)} color="#FFFFFF" />
                  </View>
                )}
                <View style={styles.editHeroCam}>
                  {uploading.photoUrl ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera" size={rs(14)} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.editHeroInfo}>
                <Text style={styles.editHeroName} numberOfLines={1}>{form.name || 'New Employee'}</Text>
                {isEdit ? (
                  <View style={[styles.editHeroPill, { backgroundColor: active ? '#EDF4E7' : '#F3F4F6' }]}>
                    <View style={[styles.editHeroDot, { backgroundColor: active ? '#609138' : '#9CA3AF' }]} />
                    <Text style={[styles.editHeroPillText, { color: active ? '#476B26' : '#6B7280' }]}>
                      {active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                ) : null}
                {isEdit ? <Text style={styles.editHeroId} numberOfLines={1}>ID: {empId}</Text> : null}
              </View>
            </View>

            {/* Basic Information */}
            <View style={styles.addCard}>
              <FormSectionHeader icon="person-outline" title="Basic Information" tone={FORM_TONES[0]} />

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Employee Name <Text style={styles.req}>*</Text></Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="Enter name"
                    placeholderTextColor="#9CA3AF"
                    value={form.name}
                    onChangeText={(v) => set('name', v)}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Email</Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="name@example.com"
                    placeholderTextColor="#9CA3AF"
                    value={form.email}
                    onChangeText={(v) => set('email', v)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Mobile Number <Text style={styles.req}>*</Text></Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#9CA3AF"
                    value={form.phone}
                    onChangeText={(v) => set('phone', v)}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Role <Text style={styles.req}>*</Text></Text>
                  <TouchableOpacity
                    style={[styles.addInputRow, roleOpen && styles.addInputRowOpen]}
                    onPress={() => { setShiftOpen(false); setRoleOpen((o) => !o); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addInputRowText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{form.roleLabel || 'Select role'}</Text>
                    <Ionicons name={roleOpen ? 'chevron-up' : 'chevron-down'} size={rs(14)} color="#6B7280" />
                  </TouchableOpacity>
                  {roleOpen && (
                    <View style={styles.roleDropdown}>
                      {ROLES.map((r, i) => {
                        const selected = form.roleLabel === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            style={[
                              styles.roleOption,
                              i < ROLES.length - 1 && styles.roleOptionDivider,
                              selected && styles.roleOptionSelected,
                            ]}
                            onPress={() => {
                              set('roleLabel', r);
                              setRoleOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.roleOptionText, selected && styles.roleOptionTextSelected]}>
                              {r}
                            </Text>
                            {selected && <Ionicons name="checkmark" size={rs(16)} color="#035C6C" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Work Information */}
            <View style={styles.addCard}>
              <FormSectionHeader icon="briefcase-outline" title="Work Information" tone={FORM_TONES[1]} />

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Date of Join</Text>
                  <TouchableOpacity
                    style={[styles.addInputRow, styles.dateRow]}
                    onPress={() => setDateField('dateOfJoin')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dateIcon}>
                      <Ionicons name="calendar-outline" size={rs(14)} color="#035C6C" />
                    </View>
                    <Text
                      style={[styles.dateText, !form.dateOfJoin && { color: '#9CA3AF' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatDisplayDate(form.dateOfJoin)}
                    </Text>
                    <View style={styles.dateChevron}>
                      <Ionicons name="chevron-down" size={rs(14)} color="#9CA3AF" />
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Date of Birth</Text>
                  <TouchableOpacity
                    style={[styles.addInputRow, styles.dateRow]}
                    onPress={() => setDateField('dateOfBirth')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dateIcon}>
                      <Ionicons name="calendar-outline" size={rs(14)} color="#035C6C" />
                    </View>
                    <Text
                      style={[styles.dateText, !form.dateOfBirth && { color: '#9CA3AF' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatDisplayDate(form.dateOfBirth)}
                    </Text>
                    <View style={styles.dateChevron}>
                      <Ionicons name="chevron-down" size={rs(14)} color="#9CA3AF" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.addLabel}>Shift</Text>
              <TouchableOpacity
                style={[styles.addInputRow, shiftOpen && styles.addInputRowOpen]}
                onPress={() => { setRoleOpen(false); setShiftOpen((o) => !o); }}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={rs(14)} color="#035C6C" />
                <Text style={styles.addInputRowText} numberOfLines={1}>{currentShift}</Text>
                <Text style={styles.shiftTimes}>
                  {hhmm(form.defaultCheckIn) || '--:--'} – {hhmm(form.defaultCheckOut) || '--:--'}
                </Text>
                <Ionicons name={shiftOpen ? 'chevron-up' : 'chevron-down'} size={rs(14)} color="#6B7280" />
              </TouchableOpacity>
              {shiftOpen && (
                <View style={styles.roleDropdown}>
                  {shiftPresets.map((sh, i) => {
                    const selected = currentShift === sh.label;
                    return (
                      <TouchableOpacity
                        key={sh.label}
                        style={[
                          styles.roleOption,
                          i < shiftPresets.length - 1 && styles.roleOptionDivider,
                          selected && styles.roleOptionSelected,
                        ]}
                        onPress={() => {
                          setForm((p) => ({ ...p, defaultCheckIn: sh.checkIn, defaultCheckOut: sh.checkOut }));
                          setShiftOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.roleOptionText, selected && styles.roleOptionTextSelected]}>{sh.label}</Text>
                          <Text style={styles.shiftOptionTimes}>{sh.checkIn} – {sh.checkOut}</Text>
                        </View>
                        {selected && <Ionicons name="checkmark" size={rs(16)} color="#035C6C" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={[styles.fieldRow, { marginTop: rs(10) }]}>
                <View style={[styles.checkCardEdit, { backgroundColor: '#EDF4E7', borderColor: '#D6E6C8' }]}>
                  <View style={[styles.checkCardDisc, { backgroundColor: '#609138' }]}>
                    <Ionicons name="time-outline" size={rs(16)} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.checkCardLabel}>Check In</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#1C3053' }]}
                      placeholder="09:30"
                      placeholderTextColor="#9CA3AF"
                      value={form.defaultCheckIn}
                      onChangeText={(v) => set('defaultCheckIn', v)}
                    />
                  </View>
                </View>
                <View style={[styles.checkCardEdit, { backgroundColor: '#FDEBEA', borderColor: '#FBD0D0' }]}>
                  <View style={[styles.checkCardDisc, { backgroundColor: '#F32C26' }]}>
                    <Ionicons name="time-outline" size={rs(16)} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.checkCardLabel}>Check Out</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#1C3053' }]}
                      placeholder="18:30"
                      placeholderTextColor="#9CA3AF"
                      value={form.defaultCheckOut}
                      onChangeText={(v) => set('defaultCheckOut', v)}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Identity Verification */}
            <View style={styles.addCard}>
              <FormSectionHeader icon="shield-checkmark-outline" title="Identity Verification" tone={FORM_TONES[2]} />

              {[
                {
                  label: 'Aadhaar Card',
                  numberField: 'aadharNumber',
                  frontField: 'aadharFrontUrl',
                  backField: 'aadharBackUrl',
                  placeholder: 'Aadhaar Number (optional)',
                  keyboardType: 'number-pad',
                  maxLength: 12,
                },
                {
                  label: 'PAN Card',
                  numberField: 'panNumber',
                  frontField: 'panFrontUrl',
                  backField: 'panBackUrl',
                  placeholder: 'PAN Number (optional)',
                  keyboardType: 'default',
                  maxLength: 10,
                },
              ].map((doc) => (
                <View key={doc.label} style={styles.idDocBlock}>
                  <Text style={styles.idDocLabel}>{doc.label}</Text>
                  <View style={styles.idUploadRow}>
                    <TouchableOpacity
                      style={styles.idUploadTile}
                      activeOpacity={0.85}
                      onPress={() => promptImageSource(doc.frontField)}
                      disabled={!!uploading[doc.frontField]}
                    >
                      {form[doc.frontField] ? (
                        <>
                          <Image
                            source={{ uri: form[doc.frontField] }}
                            style={styles.idUploadPreview}
                          />
                          <View style={styles.idUploadBadge}>
                            <Ionicons name="checkmark" size={rs(12)} color="#FFFFFF" />
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.idUploadDisc}>
                            <Ionicons name="cloud-upload-outline" size={rs(16)} color="#FFFFFF" />
                          </View>
                          <Text style={styles.idUploadText}>Upload Front</Text>
                          <Text style={styles.idUploadSub}>JPG, PNG (Max 2MB)</Text>
                        </>
                      )}
                      {uploading[doc.frontField] && (
                        <View style={styles.idUploadingOverlay}>
                          <ActivityIndicator size="small" color="#FFFFFF" />
                          <Text style={styles.idUploadingText}>Uploading…</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.idUploadTile}
                      activeOpacity={0.85}
                      onPress={() => promptImageSource(doc.backField)}
                      disabled={!!uploading[doc.backField]}
                    >
                      {form[doc.backField] ? (
                        <>
                          <Image
                            source={{ uri: form[doc.backField] }}
                            style={styles.idUploadPreview}
                          />
                          <View style={styles.idUploadBadge}>
                            <Ionicons name="checkmark" size={rs(12)} color="#FFFFFF" />
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.idUploadDisc}>
                            <Ionicons name="cloud-upload-outline" size={rs(16)} color="#FFFFFF" />
                          </View>
                          <Text style={styles.idUploadText}>Upload Back</Text>
                          <Text style={styles.idUploadSub}>JPG, PNG (Max 2MB)</Text>
                        </>
                      )}
                      {uploading[doc.backField] && (
                        <View style={styles.idUploadingOverlay}>
                          <ActivityIndicator size="small" color="#FFFFFF" />
                          <Text style={styles.idUploadingText}>Uploading…</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                  {/* `!!` — the fields hold '' when empty, and a bare '' here
                      would render as a stray text node inside the View. */}
                  {!!(form[doc.frontField] || form[doc.backField]) && (
                    <View style={styles.idUploadedRow}>
                      <Ionicons name="checkmark-circle" size={rs(14)} color="#609138" />
                      <Text style={styles.idUploadedText} numberOfLines={2}>
                        {doc.label} uploaded successfully
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          set(doc.frontField, '');
                          set(doc.backField, '');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={rs(14)} color="#F32C26" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    style={[styles.addInput, { marginTop: rs(8) }]}
                    placeholder={doc.placeholder}
                    placeholderTextColor="#9CA3AF"
                    value={form[doc.numberField]}
                    onChangeText={(v) => set(doc.numberField, v)}
                    keyboardType={doc.keyboardType}
                    maxLength={doc.maxLength}
                    autoCapitalize={doc.label === 'PAN Card' ? 'characters' : 'none'}
                  />
                </View>
              ))}
            </View>

            {/* Salary Package */}
            <View style={styles.addCard}>
              <FormSectionHeader icon="cash-outline" title="Salary Package" tone={FORM_TONES[3]} />

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Monthly Salary</Text>
                  <View style={styles.addInputRow}>
                    <Text style={styles.salaryCurrency}>₹</Text>
                    <TextInput
                      style={styles.addInputInline}
                      placeholder="Enter amount"
                      placeholderTextColor="#9CA3AF"
                      value={form.salaryAmount}
                      onChangeText={(v) => { set('salaryAmount', v); set('salaryPeriod', 'Monthly'); }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Daily Wage</Text>
                  <View style={styles.addInputRow}>
                    <Text style={styles.salaryCurrency}>₹</Text>
                    <TextInput
                      style={styles.addInputInline}
                      placeholder="Enter amount"
                      placeholderTextColor="#9CA3AF"
                      value={form.dailyWage}
                      onChangeText={(v) => set('dailyWage', v)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* App Login (optional) */}
            <View style={styles.addCard}>
              <FormSectionHeader icon="lock-closed-outline" title="App Login (optional)" tone={FORM_TONES[4]} />
              <Text style={styles.addLabel}>Password</Text>
              <View style={styles.addInputRow}>
                <TextInput
                  style={styles.addInputInline}
                  placeholder="Min 4 characters"
                  placeholderTextColor="#9CA3AF"
                  value={form.password}
                  onChangeText={(v) => set('password', v)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={rs(18)} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.loginCheckRow}
                onPress={() => setLoginEnabled((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.loginCheckbox, loginEnabled && styles.loginCheckboxOn]}>
                  {loginEnabled ? <Ionicons name="checkmark" size={rs(14)} color="#FFFFFF" /> : null}
                </View>
                <Text style={styles.loginCheckLabel}>Employee login enabled</Text>
              </TouchableOpacity>

              <View style={styles.otpHint}>
                <Ionicons name="information-circle-outline" size={rs(13)} color="#035C6C" />
                <Text style={styles.otpHintText}>
                  Employee signs in to the NearGFix Staff App with this mobile number + OTP.
                </Text>
              </View>
            </View>

            {isEdit ? (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={saving}
                activeOpacity={0.85}
                style={styles.deleteCard}
              >
                <View style={styles.deleteIconWrap}>
                  <Ionicons name="trash-outline" size={rs(18)} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.deleteTitle}>Delete Employee</Text>
                  <Text style={styles.deleteSub}>
                    This action cannot be undone. All employee data will be permanently deleted.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={rs(18)} color="#F32C26" />
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <LedgerDateSheet
            visible={dateField !== null}
            value={
              parseYmd(dateField && form[dateField])
              || (dateField === 'dateOfBirth' ? defaultBirthDate() : new Date())
            }
            tint="#035C6C"
            title={dateField === 'dateOfBirth' ? 'Date of Birth' : 'Date of Join'}
            // A joining date can be set ahead for a new hire; a birth date cannot.
            allowFuture={dateField === 'dateOfJoin'}
            yearStep
            onClose={() => setDateField(null)}
            onPick={(d) => {
              set(dateField, toYmd(d));
              setDateField(null);
            }}
          />

          {/* Sticky footer */}
          <View style={[styles.formFooterBar, { paddingBottom: Math.max(rs(10), r.insets.bottom) }]}>
            <View style={[styles.formFooterInner, capStyle]}>
            <TouchableOpacity
              style={styles.formBtnSecondary}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.formBtnSecondaryText} numberOfLines={1}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formBtnPrimary, saving && styles.saveBtnDisabled]}
              onPress={isEdit ? handleSaveEdit : handleSaveNew}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name={isEdit ? 'save-outline' : 'checkmark-circle'} size={rs(17)} color="#FFFFFF" />
                  <Text style={styles.formBtnPrimaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {isEdit ? 'Save Changes' : 'Create Employee'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.error}>Employee not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date();
  const viewDate = new Date(viewMonth.year, viewMonth.month - 1, 1);
  const isCurrentMonth = viewMonth.year === now.getFullYear() && viewMonth.month === now.getMonth() + 1;
  const monthLabel = viewDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  const daysInMonth = new Date(viewMonth.year, viewMonth.month, 0).getDate();
  const presentDays = attendanceSummary?.presentDays ?? 0;
  const presentPct = Math.max(0, Math.min(1, presentDays / daysInMonth));

  // Role-gated reports:
  //   Technician    → Task Report (repair-booking tasks)
  //   Pickup Person → Pickup Report (pickup assignments)
  //   Employee      → neither
  const role = (employee?.roleLabel || '').trim().toLowerCase();
  const showTaskReport = role === 'technician';
  const showPickupReport = role === 'pickup person';
  const CATEGORIES = [
    { key: 'shift',    icon: 'time-outline',      label: 'Daily Shift\nSchedule', route: 'OwnerEmployeeShiftDetails' },
    { key: 'monthly',  icon: 'calendar-outline',  label: 'Monthly\nSummary',      route: 'OwnerEmployeeAttendance' },
    { key: 'leave',    icon: 'briefcase-outline', label: 'Leave\nReport',         route: 'OwnerEmployeeLeave' },
    { key: 'permission', icon: 'hourglass-outline', label: 'Permission\nReport',  route: 'OwnerEmployeePermission' },
    ...(showTaskReport
      ? [{ key: 'task',   icon: 'laptop-outline', label: 'Job\nReport',        route: 'OwnerEmployeeWorkingRecord' }]
      : []),
    ...(showPickupReport
      ? [{ key: 'pickup', icon: 'car-outline',    label: 'Pickup\nReport',        route: 'OwnerEmployeePickupReport' }]
      : []),
    { key: 'salary',   icon: 'receipt-outline',   label: 'Salary\nReport',        route: 'OwnerEmployeeSalaryReport' },
    { key: 'edit',     icon: 'create-outline',    label: 'Edit\nProfile',         route: 'OwnerEmployeeDetail', params: { employee, mode: 'edit' } },
  ];
  // Always three across — the Pickup Person / Technician six-tile layout. A
  // role with fewer tiles (Staff has five) keeps the same card size and just
  // leaves the last row short, instead of squeezing every tile into one row of
  // narrow cards. Tablets fit all six in one row.
  const qaCols = r.isTablet ? 6 : 3;

  const confirmToggleActive = async () => {
    const ok = await confirm({
      title: active ? 'Mark as Inactive?' : 'Mark as Active?',
      message: active
        ? 'Employee will not be available for new assignments.'
        : 'Employee will be available for assignments.',
      confirmText: active ? 'Mark Inactive' : 'Mark Active',
      destructive: !!active,
    });
    if (ok) handleToggleActive(!active);
  };

  const advanceStatus = (recentAdvance?.status || '').toUpperCase();
  const isPaid = advanceStatus === 'PAID';
  const leaveStatus = (recentLeave?.status || '').toUpperCase();
  const isApproved = leaveStatus === 'APPROVED';
  const isRejected = leaveStatus === 'REJECTED';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.viewContent, capStyle, { paddingBottom: rs(24) + r.insets.bottom }]}>
        {/* Hero header */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatarWrap}>
            {employee.photoUrl ? (
              <Image source={{ uri: employee.photoUrl }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
                <Ionicons name="person" size={rs(30)} color="#035C6C" />
              </View>
            )}
            <View style={[styles.heroAvatarDot, active ? styles.dotOn : styles.dotOff]} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>{employee.name}</Text>
            <View style={styles.heroRolePill}>
              <Ionicons name="construct-outline" size={rs(13)} color="#FFFFFF" />
              <Text style={styles.heroRolePillText} numberOfLines={1}>{employee.roleLabel || 'Technician'}</Text>
            </View>
            <Text style={styles.heroId}>ID: {empId}</Text>
          </View>
          <TouchableOpacity
            style={[styles.heroStatus, { backgroundColor: '#FFFFFF' }]}
            onPress={confirmToggleActive}
            activeOpacity={0.7}
          >
            <View style={[styles.heroStatusDot, active ? styles.dotOn : styles.dotOff]} />
            <Text style={[styles.heroStatusValue, active ? styles.statusOk : styles.statusOff]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Check-in / Check-out */}
        <View style={styles.viewCheckRow}>
          <View style={styles.viewCheckCard}>
            <View style={[styles.viewCheckIcon, { backgroundColor: '#609138' }]}>
              <Ionicons name="log-in-outline" size={rs(19)} color="#FFFFFF" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK IN</Text>
              <Text style={[styles.viewCheckTime, { color: NAVY }]}>
                {formatTime(employee.defaultCheckIn) || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.viewCheckCard}>
            <View style={[styles.viewCheckIcon, { backgroundColor: '#F32C26' }]}>
              <Ionicons name="log-out-outline" size={rs(19)} color="#FFFFFF" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK OUT</Text>
              <Text style={[styles.viewCheckTime, { color: NAVY }]}>
                {formatTime(employee.defaultCheckOut) || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Access grid */}
        <Text style={styles.viewSectionHeader}>Quick Access</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c, i) => (
            <View key={c.key} style={[styles.catCell, { width: `${100 / qaCols}%` }]}>
              <TouchableOpacity
                style={styles.catItem}
                onPress={() => navigation.push(c.route, c.params || { employee })}
                activeOpacity={0.8}
              >
                <View style={[styles.catIconWrap, { backgroundColor: QA_TONES[i % QA_TONES.length] }]}>
                  <Ionicons name={c.icon} size={rs(19)} color="#FFFFFF" />
                </View>
                <Text style={styles.catLabel}>{c.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* This Month */}
        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>{isCurrentMonth ? 'This Month' : 'Monthly Summary'}</Text>
            <TouchableOpacity
              style={styles.monthPill}
              onPress={() => setMonthPickerOpen(true)}
              activeOpacity={0.8}
              hitSlop={rs(6)}
            >
              <Ionicons name="calendar-outline" size={rs(13)} color="#035C6C" />
              <Text style={styles.monthPillText}>{monthLabel}</Text>
              <Ionicons name="chevron-down" size={rs(12)} color="#035C6C" />
            </TouchableOpacity>
          </View>
          <MonthPickerModal
            visible={monthPickerOpen}
            value={viewMonth}
            onClose={() => setMonthPickerOpen(false)}
            onPick={(m) => {
              setMonthPickerOpen(false);
              if (m.month !== viewMonth.month || m.year !== viewMonth.year) {
                setAttendanceSummary(null);
                setViewMonth(m);
              }
            }}
          />

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${presentPct * 100}%` }]} />
          </View>
          <View style={styles.progressLegend}>
            <Text style={styles.progressLegendOn}>{presentDays} Present</Text>
            <Text style={styles.progressLegendOff}>{presentDays}/{daysInMonth}</Text>
          </View>

          <View style={styles.statTilesRow}>
            <View style={[styles.statTile, { backgroundColor: '#EDF4E7' }]}>
              <View style={[styles.statTileDisc, { backgroundColor: '#609138' }]}>
                <Ionicons name="checkmark-circle-outline" size={rs(14)} color="#FFFFFF" />
              </View>
              <Text style={styles.statTileValue}>{presentDays}</Text>
              <Text style={styles.statTileLabel}>Present</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#FFF4DB' }]}>
              <View style={[styles.statTileDisc, { backgroundColor: '#FAA700' }]}>
                <Ionicons name="briefcase-outline" size={rs(14)} color="#FFFFFF" />
              </View>
              <Text style={styles.statTileValue}>{String(attendanceSummary?.leaveDays ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Leave</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#E1F1FA' }]}>
              <View style={[styles.statTileDisc, { backgroundColor: '#0788C9' }]}>
                <Ionicons name="hourglass-outline" size={rs(14)} color="#FFFFFF" />
              </View>
              <Text style={styles.statTileValue}>{String(attendanceSummary?.permissionCount ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Permission</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#FDEBEA' }]}>
              <View style={[styles.statTileDisc, { backgroundColor: '#F32C26' }]}>
                <Ionicons name="time-outline" size={rs(14)} color="#FFFFFF" />
              </View>
              <Text style={styles.statTileValue}>{attendanceSummary?.lateHours ?? '0'}</Text>
              <Text style={styles.statTileLabel}>Late Hrs</Text>
            </View>
          </View>
        </View>

        {/* Recent Salary Advance */}
        <View style={styles.recentHeaderRow}>
          <Text style={styles.viewSectionHeader}>Recent Salary Advance</Text>
          <TouchableOpacity onPress={() => navigation.navigate('OwnerEmployeeAddAdvance', { employee })}>
            <Text style={styles.recentAddLink}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {recentAdvance ? (
          <View style={styles.recentItemCard}>
            <View style={[styles.recentAccent, { backgroundColor: isPaid ? '#609138' : '#F32C26' }]} />
            <View style={styles.recentInner}>
              <View style={styles.recentTopRow}>
                <Text style={styles.recentDate}>{formatAdvanceDate(recentAdvance.advanceDate)}</Text>
                <View style={[styles.statusPill, { backgroundColor: isPaid ? '#EDF4E7' : '#FDEBEA' }]}>
                  <Text style={[styles.statusPillText, { color: isPaid ? '#476B26' : '#C81E1A' }]}>
                    {isPaid ? 'Paid' : 'Not Paid'}
                  </Text>
                </View>
              </View>
              <View style={styles.recentBottomRow}>
                <View style={styles.recentBottomCol}>
                  <Text style={styles.recentBigValue}>₹ {recentAdvance.amount ?? 0}</Text>
                  <Text style={styles.recentSubLabel}>Advance Amount</Text>
                </View>
                <View style={styles.recentBottomCol}>
                  <Text style={styles.recentBigValue}>
                    {recentAdvance.requestedAt
                      ? new Date(recentAdvance.requestedAt).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
                        })
                      : '—'}
                  </Text>
                  <Text style={styles.recentSubLabel}>Request Date &amp; Time</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIconWrap, { backgroundColor: '#FAA700' }]}>
              <Ionicons name="wallet-outline" size={rs(19)} color="#FFFFFF" />
            </View>
            <View style={styles.emptyTextWrap}>
              <Text style={styles.emptyTitle}>No advances</Text>
              <Text style={styles.emptySub}>No salary advance recorded yet.</Text>
            </View>
          </View>
        )}

        {/* Recent Leave Request */}
        <Text style={styles.viewSectionHeader}>Recent Leave Request</Text>
        {recentLeave ? (
          <View style={styles.recentItemCard}>
            <View style={[styles.recentAccent, { backgroundColor: isApproved ? '#609138' : isRejected ? '#F32C26' : '#FAA700' }]} />
            <View style={styles.recentInner}>
              <View style={styles.recentTopRow}>
                <Text style={styles.recentDate}>{formatLeaveDate(recentLeave.startDate)}</Text>
                <View style={[styles.statusPill, { backgroundColor: isApproved ? '#EDF4E7' : isRejected ? '#FDEBEA' : '#FFF4DB' }]}>
                  <Text style={[styles.statusPillText, { color: isApproved ? '#476B26' : isRejected ? '#C81E1A' : '#B45309' }]}>
                    {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}
                  </Text>
                </View>
              </View>
              <View style={styles.recentBottomRow}>
                <View style={styles.recentBottomCol}>
                  <Text style={styles.recentBigValue}>{recentLeave.reason || 'Leave'}</Text>
                  <Text style={styles.recentSubLabel}>Leave Reason</Text>
                </View>
                <View style={styles.recentBottomCol}>
                  <Text style={styles.recentBigValue}>{recentLeave.appliedDaysLabel || '—'}</Text>
                  <Text style={styles.recentSubLabel}>Applied Days</Text>
                </View>
                <View style={styles.recentBottomCol}>
                  <Text style={styles.recentBigValue}>
                    {recentLeave.requestedAt
                      ? new Date(recentLeave.requestedAt).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
                        })
                      : '—'}
                  </Text>
                  <Text style={styles.recentSubLabel}>Request Date &amp; Time</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIconWrap, { backgroundColor: '#0788C9' }]}>
              <Ionicons name="file-tray-outline" size={rs(19)} color="#FFFFFF" />
            </View>
            <View style={styles.emptyTextWrap}>
              <Text style={styles.emptyTitle}>No leave requests</Text>
              <Text style={styles.emptySub}>No leave requests yet.</Text>
            </View>
          </View>
        )}

        {/* Contact footer — 2-column grid */}
        <View style={styles.viewFooterCard}>
          <View style={styles.footerGridRow}>
            <FooterItem icon="id-card-outline" label="Role" value={employee.roleLabel || 'Technician'} tone="#035C6C" />
            <FooterItem icon="mail-outline" label="Email" value={employee.email || '—'} tone="#0788C9" />
          </View>
          <View style={styles.footerGridRow}>
            <FooterItem icon="call-outline" label="Phone" value={employee.phone || '—'} tone="#609138" />
            <FooterItem icon="location-outline" label="Department" value={employee.department || 'Service'} tone="#E08E00" />
          </View>
          <View style={styles.footerGridRow}>
            <FooterItem
              icon="phone-portrait-outline"
              label="Staff App Login"
              value={linkedUserId ? 'Enabled' : 'Not configured'}
              tone="#1C3053"
            />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // White page wash. Cards are flat — no shadows — so a 1px #E5E7EB hairline is
  // the only thing separating a white card from the white page. Every card needs
  // one; a bare `backgroundColor: '#FFFFFF'` card would be invisible here.
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(16), paddingBottom: rs(32) },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111111', marginBottom: rs(12) },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rs(8) },
  addLinkText: { fontSize: 13, color: '#035C6C', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(16),
  },
  label: { fontSize: 12, fontWeight: '600', color: '#111111', marginBottom: rs(6), marginTop: rs(10) },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontSize: 13,
    color: '#111111',
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: rs(8), gap: rs(8) },
  roleChip: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  roleChipActive: { backgroundColor: '#035C6C', borderColor: '#035C6C' },
  roleChipText: { fontSize: 12, color: '#6B7280' },
  roleChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  saveBtn: {
    marginTop: rs(20),
    backgroundColor: '#035C6C',
    borderRadius: 999,
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: '#111111' },
  meta: { fontSize: 13, color: '#6B7280', marginTop: rs(4) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(12) },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: rs(12) },
  linkText: { fontSize: 13, color: '#111111', flex: 1 },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: rs(16), padding: rs(16), alignItems: 'center' },
  avatarLarge: { width: rs(80), height: rs(80), borderRadius: rs(40), backgroundColor: '#E5E7EB', marginBottom: rs(8) },
  profileName: { fontSize: 17, fontWeight: '700', color: '#111111' },
  profileId: { fontSize: 12, color: '#6B7280', marginTop: rs(2) },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(8) },
  statusDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#9CA3AF' },
  statusDotActive: { backgroundColor: '#035C6C' },
  statusBadgeText: { fontSize: 13, color: '#6B7280' },
  statusBadgeTextActive: { color: '#035C6C', fontWeight: '600' },
  checkInOutRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  checkCard: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: rs(12), padding: rs(12), alignItems: 'center' },
  checkLabel: { fontSize: 11, color: '#6B7280', marginTop: rs(4) },
  checkTime: { fontSize: 15, fontWeight: '700', color: '#035C6C' },
  statsRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  miniStat: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: rs(10), padding: rs(10), alignItems: 'center' },
  miniStatValue: { fontSize: 15, fontWeight: '700', color: '#111111' },
  miniStatLabel: { fontSize: 11, color: '#6B7280', marginTop: rs(2) },
  recentCard: { marginTop: rs(8) },
  recentMeta: { fontSize: 13, color: '#111111', marginTop: rs(4) },
  tagRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(8) },
  tag: { paddingHorizontal: rs(8), paddingVertical: rs(4), borderRadius: rs(6), backgroundColor: '#FDEBEA' },
  tagPaid: { backgroundColor: '#E5F3F5' },
  tagRejected: { backgroundColor: '#FDEBEA' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#111111' },
  photoPlaceholder: { alignItems: 'center', paddingVertical: rs(12), backgroundColor: '#F3F4F6', borderRadius: rs(12), marginBottom: rs(8) },
  takePhotoBtn: { marginTop: rs(8), backgroundColor: '#035C6C', paddingHorizontal: rs(16), paddingVertical: rs(8), borderRadius: rs(8) },
  takePhotoText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13, color: '#F32C26' },

  // Compact add-mode styles
  addContent: { padding: rs(14), paddingBottom: rs(96) },
  addCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(12),
    marginBottom: rs(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  addSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    marginBottom: rs(4),
  },
  secIconWrap: { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' },
  addSectionTitle: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: '#1C3053' },
  fieldRow: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
  fieldCol: { flex: 1, minWidth: 0 },
  addLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: rs(10), marginBottom: rs(5) },
  req: { color: '#F32C26' },
  addInput: {
    height: rs(46),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: 0,
    fontSize: 14,
    color: '#111111',
    backgroundColor: '#FFFFFF',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    minHeight: rs(46),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: 0,
    backgroundColor: '#FFFFFF',
  },
  addInputRowText: { flex: 1, fontSize: 14, color: '#111111' },
  addInputInline: { flex: 1, minWidth: 0, height: rs(44), fontSize: 14, color: '#111111', paddingVertical: 0, paddingHorizontal: 0 },
  // Date of Join / Date of Birth: icon | DD - MM - YYYY | chevron, all centred.
  dateRow: { paddingHorizontal: rs(10), gap: rs(6) },
  dateIcon: { width: rs(16), alignItems: 'center', justifyContent: 'center' },
  dateText: {
    flex: 1,
    textAlign: 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontSize: 14,
    color: '#111111',
    padding: 0,
  },
  dateChevron: { width: rs(16), alignItems: 'center', justifyContent: 'center' },
  addInputRowOpen: {
    borderColor: '#035C6C',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  roleDropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#035C6C',
    borderBottomLeftRadius: rs(12),
    borderBottomRightRadius: rs(12),
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(12),
    paddingVertical: rs(11),
    backgroundColor: '#FFFFFF',
  },
  roleOptionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  roleOptionSelected: { backgroundColor: '#E5F3F5' },
  roleOptionText: { fontSize: 14, color: '#111111' },
  shiftTimes: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  shiftOptionTimes: { fontSize: 11.5, color: '#6B7280', marginTop: rs(1) },
  roleOptionTextSelected: { color: '#035C6C', fontWeight: '700' },

  addTwoCol: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
  addColMain: { flex: 1 },
  addColPhoto: { width: rs(108) },
  photoBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: rs(10),
    padding: rs(8),
    alignItems: 'center',
    gap: rs(6),
  },
  photoAvatar: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: '#E5E7EB' },
  photoUploadingOverlay: {
    position: 'absolute',
    top: rs(8),
    left: 0,
    right: 0,
    height: rs(60),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: rs(30),
    marginHorizontal: rs(24),
  },
  takePhotoBtnSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(3),
    backgroundColor: '#035C6C',
    paddingHorizontal: rs(8),
    paddingVertical: rs(4),
    borderRadius: 999,
  },
  takePhotoTextSm: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  addRow: { flexDirection: 'row', gap: rs(10) },
  addRowItem: { flex: 1 },

  idDocBlock: {
    marginTop: rs(10),
    paddingTop: rs(10),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  idDocLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C3053',
    marginBottom: rs(4),
  },
  idUploadRow: { flexDirection: 'row', gap: rs(10), marginTop: rs(6) },
  idUploadTile: {
    flex: 1,
    minWidth: 0,
    height: rs(92),
    borderRadius: rs(12),
    borderWidth: 1.2,
    borderColor: '#035C6C',
    borderStyle: 'dashed',
    backgroundColor: '#E5F3F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(3),
    paddingHorizontal: rs(6),
    overflow: 'hidden',
  },
  idUploadDisc: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    backgroundColor: '#035C6C',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: rs(2),
  },
  idUploadText: { fontSize: 12, color: '#035C6C', fontWeight: '800', textAlign: 'center' },
  idUploadSub: { fontSize: 10, color: '#6B7280', fontWeight: '500', textAlign: 'center' },
  idUploadPreview: { ...StyleSheet.absoluteFill, borderRadius: rs(12) },
  idUploadBadge: {
    position: 'absolute',
    top: rs(6),
    right: rs(6),
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    backgroundColor: '#609138',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(4),
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: rs(12),
  },
  idUploadingText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
  idUploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    backgroundColor: '#EDF4E7',
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    marginTop: rs(8),
  },
  idUploadedText: { flex: 1, fontSize: 11.5, color: '#476B26', fontWeight: '700' },

  otpHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(6),
    backgroundColor: '#E5F3F5',
    borderRadius: rs(10),
    padding: rs(10),
    marginTop: rs(12),
  },
  otpHintText: { flex: 1, fontSize: 11.5, color: '#035C6C', lineHeight: rlh(16) },

  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(6),
    gap: rs(8),
  },
  salaryLabel: { fontSize: 12, color: '#111111', fontWeight: '500', flexShrink: 0 },
  salaryInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rs(7),
    minWidth: 0,
  },
  salaryCurrency: { fontSize: 14, color: '#6B7280', fontWeight: '700', marginRight: rs(2) },
  salaryInput: { flex: 1, fontSize: 13, color: '#111111', padding: 0, minWidth: 0 },

  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerInner: { flexDirection: 'row', gap: rs(10) },
  footerCancel: {
    flex: 1,
    paddingVertical: rs(11),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#035C6C',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerCancelText: { fontSize: 13, fontWeight: '800', color: '#035C6C' },
  footerCreate: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    paddingVertical: rs(11),
    borderRadius: 999,
    backgroundColor: '#035C6C',
  },
  footerCreateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // ===== Add / Edit form: header back button + sticky footer =====
  formBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },
  formFooterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: rs(14),
    paddingTop: rs(10),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  formFooterInner: { flexDirection: 'row', gap: rs(10) },
  formBtnSecondary: {
    flex: 1,
    height: rs(50),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: '#035C6C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(10),
    backgroundColor: '#FFFFFF',
  },
  formBtnSecondaryText: { fontSize: 15, fontWeight: '800', color: '#035C6C' },
  formBtnPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    height: rs(50),
    borderRadius: rs(12),
    paddingHorizontal: rs(10),
    backgroundColor: '#035C6C',
  },
  formBtnPrimaryText: { flexShrink: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // ===== Edit-mode design additions =====
  editHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(12),
    marginBottom: rs(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  editHeroAvatarWrap: { position: 'relative', marginRight: rs(12) },
  editHeroAvatar: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: '#E5E7EB' },
  editHeroAvatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#035C6C' },
  editHeroCam: {
    position: 'absolute', right: rs(-2), bottom: rs(-2),
    width: rs(26), height: rs(26), borderRadius: rs(13),
    backgroundColor: '#0788C9',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  editHeroInfo: { flex: 1, minWidth: 0 },
  editHeroName: { fontSize: 16, fontWeight: '800', color: '#1C3053' },
  editHeroPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), backgroundColor: '#EDF4E7', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, marginTop: rs(6) },
  editHeroDot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
  editHeroPillText: { fontSize: 10.5, fontWeight: '800' },
  editHeroId: { fontSize: 11.5, color: '#6B7280', fontWeight: '600', marginTop: rs(6) },

  checkCardEdit: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    borderRadius: rs(12),
    borderWidth: 1,
    paddingHorizontal: rs(10),
    paddingVertical: rs(9),
  },
  checkCardDisc: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center' },
  checkCardLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700' },
  checkCardInput: { fontSize: 16, fontWeight: '800', padding: 0, marginTop: rs(1) },

  loginCheckRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10), marginTop: rs(14) },
  loginCheckbox: {
    width: rs(22), height: rs(22), borderRadius: rs(6),
    borderWidth: 1.5, borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  loginCheckboxOn: { backgroundColor: '#035C6C', borderColor: '#035C6C' },
  loginCheckLabel: { flexShrink: 1, fontSize: 14, color: '#111111', fontWeight: '600' },

  deleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    backgroundColor: '#FDEBEA',
    borderWidth: 1,
    borderColor: '#FBD0D0',
    borderRadius: rs(16),
    padding: rs(12),
    marginTop: rs(2),
    marginBottom: rs(4),
  },
  deleteIconWrap: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: '#F32C26', alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontSize: 14, fontWeight: '800', color: '#C81E1A' },
  deleteSub: { fontSize: 11.5, color: '#6B7280', marginTop: rs(2), lineHeight: rlh(16) },

  // ===== View-mode (mockup-matching) =====
  viewContent: { padding: rs(12), paddingBottom: rs(24) },

  heroCard: {
    backgroundColor: '#035C6C',
    borderRadius: rs(18),
    padding: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#035C6C',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroStatus: {
    position: 'absolute',
    top: rs(12),
    right: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    paddingHorizontal: rs(9),
    paddingVertical: rs(4),
    borderRadius: 999,
  },
  heroStatusDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  heroStatusValue: { fontSize: 11, fontWeight: '800' },
  statusOk: { color: '#476B26' },
  statusOff: { color: '#9CA3AF' },
  dotOn: { backgroundColor: '#609138' },
  dotOff: { backgroundColor: '#9CA3AF' },
  heroAvatarWrap: { position: 'relative', marginRight: rs(12) },
  heroAvatar: { width: rs(62), height: rs(62), borderRadius: rs(31), backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FFFFFF' },
  heroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  heroAvatarDot: { position: 'absolute', right: rs(2), bottom: rs(2), width: rs(13), height: rs(13), borderRadius: rs(7), borderWidth: 2, borderColor: '#FFFFFF' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginRight: rs(72) }, // clears the absolute status pill
  heroRolePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: rs(9), paddingVertical: rs(3), borderRadius: 999, marginTop: rs(5) },
  heroRolePillText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  heroId: { fontSize: 11, color: '#C7E6EA', marginTop: rs(5), letterSpacing: 0.4 },

  viewCheckRow: { flexDirection: 'row', gap: rs(10), marginTop: rs(10) },
  viewCheckCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(10),
    paddingHorizontal: rs(11),
    gap: rs(10),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  viewCheckIcon: { width: rs(36), height: rs(36), borderRadius: rs(11), alignItems: 'center', justifyContent: 'center' },
  viewCheckTextWrap: { flex: 1 },
  viewCheckLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5 },
  viewCheckTime: { fontSize: 16, fontWeight: '800', marginTop: rs(2) },

  viewSectionHeader: { fontSize: 14, fontWeight: '800', color: '#1C3053', marginTop: rs(16), marginBottom: rs(8) },

  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -rs(4),
    rowGap: rs(8),
  },
  catCell: { paddingHorizontal: rs(4) },
  catItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(10),
    paddingHorizontal: rs(2),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  catIconWrap: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: '#E5F3F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(6),
  },
  catLabel: { fontSize: 10.5, fontWeight: '700', color: '#1C3053', textAlign: 'center', lineHeight: rlh(13.5) },

  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(12),
    marginTop: rs(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(10),
  },
  monthTitle: { fontSize: 14, fontWeight: '800', color: '#1C3053' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: '#E5F3F5',
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: 999,
  },
  monthPillText: { fontSize: 12, fontWeight: '800', color: '#035C6C' },

  mpBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.45)',
    paddingHorizontal: rs(24),
  },
  mpCard: { width: '100%', maxWidth: rs(360), backgroundColor: '#FFFFFF', borderRadius: rs(16), padding: rs(16) },
  mpHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: rs(12) },
  mpNav: {
    height: rs(34),
    width: rs(34),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  mpYear: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '800', color: '#111111' },
  mpGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: rs(8) },
  mpCell: { width: '33.33%', alignItems: 'center', justifyContent: 'center', paddingVertical: rs(10), borderRadius: rs(10) },
  mpCellSelected: { backgroundColor: '#035C6C' },
  mpCellText: { fontSize: 13, fontWeight: '700', color: '#111111' },
  mpCellTextSelected: { color: '#FFFFFF' },
  mpFooter: { flexDirection: 'row', gap: rs(8), marginTop: rs(14) },
  mpBtn: { flex: 1, alignItems: 'center', paddingVertical: rs(10), borderRadius: rs(10) },
  mpBtnText: { fontSize: 13, fontWeight: '800' },

  progressTrack: {
    height: rs(6),
    borderRadius: rs(3),
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#609138', borderRadius: rs(3) },
  progressLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: rs(6),
  },
  progressLegendOn: { fontSize: 12, color: '#476B26', fontWeight: '700' },
  progressLegendOff: { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  statTilesRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  statTile: {
    flex: 1,
    borderRadius: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(6),
    alignItems: 'flex-start',
  },
  statTileDisc: { width: rs(24), height: rs(24), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center' },
  statTileValue: { fontSize: 16, fontWeight: '800', color: '#1C3053', marginTop: rs(4) },
  statTileLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600', marginTop: rs(1) },

  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentAddLink: { fontSize: 13, color: '#035C6C', fontWeight: '800', marginTop: rs(16) },

  recentItemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    overflow: 'hidden',
    // Same hairline as the emptyCard it alternates with — without it, this card
    // is white on a white page and loses its edge entirely.
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recentAccent: { width: rs(3), backgroundColor: '#035C6C' },
  recentInner: { flex: 1, padding: rs(10) },
  recentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentDate: { fontSize: 12, fontWeight: '700', color: '#111111' },
  statusPillRow: { flexDirection: 'row', gap: rs(6) },
  statusPill: {
    paddingHorizontal: rs(9),
    paddingVertical: rs(3),
    borderRadius: 999,
  },
  statusPillOn: { backgroundColor: '#035C6C' },
  statusPillOnRed: { backgroundColor: '#F32C26' },
  statusPillDimGreen: { backgroundColor: '#E5F3F5' },
  statusPillDimRed: { backgroundColor: '#FDEBEA' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusPillTextOn: { color: '#FFFFFF' },
  statusPillTextDim: { color: '#9CA3AF' },

  recentBottomRow: { flexDirection: 'row', marginTop: rs(10), gap: rs(10) },
  recentBottomCol: { flex: 1 },
  recentBigValue: { fontSize: 12, fontWeight: '700', color: '#111111' },
  recentSubLabel: { fontSize: 10, color: '#9CA3AF', marginTop: rs(2) },

  emptyText: { fontSize: 12, color: '#6B7280', textAlign: 'center', paddingVertical: rs(16) },

  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    paddingHorizontal: rs(12),
    marginTop: rs(2),
    gap: rs(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyIconWrap: { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  emptyTextWrap: { flex: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#111111' },
  emptySub: { fontSize: 11, color: '#9CA3AF', marginTop: rs(2), textAlign: 'center' },

  viewFooterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(12),
    marginTop: rs(16),
    gap: rs(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  footerGridRow: { flexDirection: 'row', gap: rs(12) },
  footerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  footerIconWrap: { width: rs(32), height: rs(32), borderRadius: rs(10), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  footerItemLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  footerItemValue: { fontSize: 13, color: '#1C3053', fontWeight: '700', marginTop: rs(1) },
});
