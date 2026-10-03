import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { authApi, ticketApi } from '../../api/client';
import { uploadMedia } from '../../api/masterData';
import { selectShopId } from '../../store/authSlice';
import { confirm, notify } from '../../components/confirm';
import { FEATURE } from '../../subscription/entitlements';
import { showLimitPopup } from '../../subscription/limitPopup';
import { useResponsive } from '../../theme/responsive';
import { rf, rlh, rs } from '../../utils/responsive';
import LedgerDateSheet from './LedgerDateSheet';
import { normalizeIndianMobile } from '../../utils/mobile';

const ROLES = ['Technician', 'Staff', 'Pickup Person'];

// A "shift" is the employee's default check-in / check-out pair — the only
// shift data the technician record stores. Picking a preset fills both times
// (still editable below); times that match no preset read as Custom Shift.
const SHIFT_PRESETS = [
  { label: 'General Shift', checkIn: '09:30', checkOut: '18:30' },
  { label: 'Morning Shift', checkIn: '06:00', checkOut: '14:00' },
  { label: 'Evening Shift', checkIn: '14:00', checkOut: '22:00' },
  { label: 'Night Shift', checkIn: '22:00', checkOut: '06:00' },
];
const hhmm = (t) => String(t || '').trim().slice(0, 5);
function shiftLabelFor(checkIn, checkOut) {
  const hit = SHIFT_PRESETS.find((p) => p.checkIn === hhmm(checkIn) && p.checkOut === hhmm(checkOut));
  return hit ? hit.label : 'Custom Shift';
}
const SALARY_PERIODS = ['Monthly', 'Weekly'];

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mpBackdrop} onPress={onClose}>
        {/* Swallows the backdrop press so tapping inside the card can't close it. */}
        <Pressable style={styles.mpCard} onPress={() => {}}>
          <View style={styles.mpHeader}>
            <TouchableOpacity style={styles.mpNav} onPress={() => setYear((y) => y - 1)} hitSlop={rs(8)}>
              <Ionicons name="chevron-back" size={rs(16)} color="#1E1E1E" />
            </TouchableOpacity>
            <Text style={styles.mpYear}>{year}</Text>
            <TouchableOpacity
              style={[styles.mpNav, year >= curYear && { opacity: 0.35 }]}
              onPress={() => setYear((y) => y + 1)}
              disabled={year >= curYear}
              hitSlop={rs(8)}
            >
              <Ionicons name="chevron-forward" size={rs(16)} color="#1E1E1E" />
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
              style={[styles.mpBtn, { backgroundColor: '#EAF8EC' }]}
              onPress={() => onPick({ month: curMonth, year: curYear })}
            >
              <Text style={[styles.mpBtnText, { color: '#09AD2A' }]}>This Month</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mpBtn, { backgroundColor: '#F3F3F3' }]} onPress={onClose}>
              <Text style={[styles.mpBtnText, { color: '#6B6B6B' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Green-icon labelled cell used in the contact footer grid.
function FooterItem({ icon, label, value }) {
  return (
    <View style={styles.footerItem}>
      <View style={styles.footerIconWrap}>
        <Ionicons name={icon} size={rs(16)} color="#09AD2A" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.footerItemLabel}>{label}</Text>
        <Text style={styles.footerItemValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

export default function OwnerEmployeeDetailScreen({ route, navigation }) {
  const shopId = useSelector(selectShopId);
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
      navigation.setOptions?.({ title: 'Edit Profile', headerRight: undefined });
    } else if (mode === 'view' && employee) {
      navigation.setOptions?.({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.push('OwnerEmployeeDetail', { employee, mode: 'edit' })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingHorizontal: rs(6) }}
          >
            <Ionicons name="ellipsis-vertical" size={rs(20)} color="#09AD2A" />
          </TouchableOpacity>
        ),
      });
    }
  }, [isEdit, mode, navigation, employee]);

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
        ? `Employee added. They can log in to the GGFIX Staff App with mobile ${phone} and an OTP.`
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
    const currentShift = shiftLabelFor(form.defaultCheckIn, form.defaultCheckOut);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.addContent, capStyle]}
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
                    <Ionicons name="person" size={rs(34)} color="#8A8A8A" />
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
                  <View style={styles.editHeroPill}>
                    <View style={[styles.editHeroDot, { backgroundColor: active ? '#09AD2A' : '#8A8A8A' }]} />
                    <Text style={[styles.editHeroPillText, { color: active ? '#09AD2A' : '#6B6B6B' }]}>
                      {active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                ) : null}
                {isEdit ? <Text style={styles.editHeroId}>ID: {empId}</Text> : null}
              </View>
            </View>

            {/* Basic Information */}
            <View style={styles.addCard}>
              <View style={styles.addSectionHeader}>
                <View style={styles.secIconWrap}>
                  <Ionicons name="person-outline" size={rs(16)} color="#09AD2A" />
                </View>
                <Text style={styles.addSectionTitle}>Basic Information</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Employee Name <Text style={styles.req}>*</Text></Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="Enter name"
                    placeholderTextColor="#8A8A8A"
                    value={form.name}
                    onChangeText={(v) => set('name', v)}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Email</Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="name@example.com"
                    placeholderTextColor="#8A8A8A"
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
                    placeholderTextColor="#8A8A8A"
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
                    <Text style={styles.addInputRowText}>{form.roleLabel || 'Select role'}</Text>
                    <Ionicons name={roleOpen ? 'chevron-up' : 'chevron-down'} size={rs(14)} color="#6B6B6B" />
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
                            {selected && <Ionicons name="checkmark" size={rs(16)} color="#09AD2A" />}
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
              <View style={styles.addSectionHeader}>
                <View style={styles.secIconWrap}>
                  <Ionicons name="briefcase-outline" size={rs(16)} color="#09AD2A" />
                </View>
                <Text style={styles.addSectionTitle}>Work Information</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Date of Join</Text>
                  <TouchableOpacity
                    style={[styles.addInputRow, styles.dateRow]}
                    onPress={() => setDateField('dateOfJoin')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dateIcon}>
                      <Ionicons name="calendar-outline" size={rs(14)} color="#09AD2A" />
                    </View>
                    <Text
                      style={[styles.dateText, !form.dateOfJoin && { color: '#8A8A8A' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatDisplayDate(form.dateOfJoin)}
                    </Text>
                    <View style={styles.dateChevron}>
                      <Ionicons name="chevron-down" size={rs(14)} color="#8A8A8A" />
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
                      <Ionicons name="calendar-outline" size={rs(14)} color="#09AD2A" />
                    </View>
                    <Text
                      style={[styles.dateText, !form.dateOfBirth && { color: '#8A8A8A' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatDisplayDate(form.dateOfBirth)}
                    </Text>
                    <View style={styles.dateChevron}>
                      <Ionicons name="chevron-down" size={rs(14)} color="#8A8A8A" />
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
                <Ionicons name="time-outline" size={rs(14)} color="#09AD2A" />
                <Text style={styles.addInputRowText}>{currentShift}</Text>
                <Text style={styles.shiftTimes}>
                  {hhmm(form.defaultCheckIn) || '--:--'} – {hhmm(form.defaultCheckOut) || '--:--'}
                </Text>
                <Ionicons name={shiftOpen ? 'chevron-up' : 'chevron-down'} size={rs(14)} color="#6B6B6B" />
              </TouchableOpacity>
              {shiftOpen && (
                <View style={styles.roleDropdown}>
                  {SHIFT_PRESETS.map((sh, i) => {
                    const selected = currentShift === sh.label;
                    return (
                      <TouchableOpacity
                        key={sh.label}
                        style={[
                          styles.roleOption,
                          i < SHIFT_PRESETS.length - 1 && styles.roleOptionDivider,
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
                        {selected && <Ionicons name="checkmark" size={rs(16)} color="#09AD2A" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={[styles.fieldRow, { marginTop: rs(10) }]}>
                <View style={[styles.checkCardEdit, { backgroundColor: '#EAF8EC', borderColor: '#CDEFD4' }]}>
                  <Ionicons name="time-outline" size={rs(18)} color="#09AD2A" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkCardLabel}>Check In</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#078F23' }]}
                      placeholder="09:30"
                      placeholderTextColor="#8A8A8A"
                      value={form.defaultCheckIn}
                      onChangeText={(v) => set('defaultCheckIn', v)}
                    />
                  </View>
                </View>
                <View style={[styles.checkCardEdit, { backgroundColor: '#FEECEC', borderColor: '#FBD0D0' }]}>
                  <Ionicons name="time-outline" size={rs(18)} color="#F84141" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkCardLabel}>Check Out</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#F84141' }]}
                      placeholder="18:30"
                      placeholderTextColor="#8A8A8A"
                      value={form.defaultCheckOut}
                      onChangeText={(v) => set('defaultCheckOut', v)}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Identity Verification */}
            <View style={styles.addCard}>
              <View style={styles.addSectionHeader}>
                <View style={styles.secIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={rs(16)} color="#09AD2A" />
                </View>
                <Text style={styles.addSectionTitle}>Identity Verification</Text>
              </View>

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
                            <Ionicons name="checkmark-circle" size={rs(14)} color="#09AD2A" />
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={rs(22)} color="#09AD2A" />
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
                            <Ionicons name="checkmark-circle" size={rs(14)} color="#09AD2A" />
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={rs(22)} color="#09AD2A" />
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
                      <Ionicons name="checkmark-circle" size={rs(14)} color="#09AD2A" />
                      <Text style={styles.idUploadedText}>
                        {doc.label} uploaded successfully
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          set(doc.frontField, '');
                          set(doc.backField, '');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={rs(14)} color="#F84141" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    style={[styles.addInput, { marginTop: rs(4) }]}
                    placeholder={doc.placeholder}
                    placeholderTextColor="#8A8A8A"
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
              <View style={styles.addSectionHeader}>
                <View style={styles.secIconWrap}>
                  <Ionicons name="cash-outline" size={rs(16)} color="#09AD2A" />
                </View>
                <Text style={styles.addSectionTitle}>Salary Package</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Monthly Salary</Text>
                  <View style={styles.addInputRow}>
                    <Text style={styles.salaryCurrency}>₹</Text>
                    <TextInput
                      style={styles.addInputInline}
                      placeholder="Enter amount"
                      placeholderTextColor="#8A8A8A"
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
                      placeholderTextColor="#8A8A8A"
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
              <View style={styles.addSectionHeader}>
                <View style={styles.secIconWrap}>
                  <Ionicons name="lock-closed-outline" size={rs(16)} color="#09AD2A" />
                </View>
                <Text style={styles.addSectionTitle}>App Login (optional)</Text>
              </View>
              <Text style={styles.addLabel}>Password</Text>
              <View style={styles.addInputRow}>
                <TextInput
                  style={styles.addInputInline}
                  placeholder="Min 4 characters"
                  placeholderTextColor="#8A8A8A"
                  value={form.password}
                  onChangeText={(v) => set('password', v)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={rs(18)} color="#6B6B6B" />
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
                <Ionicons name="information-circle-outline" size={rs(13)} color="#09AD2A" />
                <Text style={styles.otpHintText}>
                  Employee signs in to the GGFIX Staff App with this mobile number + OTP.
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
                  <Ionicons name="trash-outline" size={rs(18)} color="#F84141" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deleteTitle}>Delete Employee</Text>
                  <Text style={styles.deleteSub}>
                    This action cannot be undone. All employee data will be permanently deleted.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={rs(18)} color="#F84141" />
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <LedgerDateSheet
            visible={dateField !== null}
            value={
              parseYmd(dateField && form[dateField])
              || (dateField === 'dateOfBirth' ? defaultBirthDate() : new Date())
            }
            tint="#09AD2A"
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
          <View style={styles.footerBar}>
            <View style={[styles.footerInner, capStyle]}>
            <TouchableOpacity
              style={styles.footerCancel}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.footerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerCreate, saving && styles.saveBtnDisabled]}
              onPress={isEdit ? handleSaveEdit : handleSaveNew}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name={isEdit ? 'save-outline' : 'checkmark-circle'} size={rs(16)} color="#FFFFFF" />
                  <Text style={styles.footerCreateText}>
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
    ...(showTaskReport
      ? [{ key: 'task',   icon: 'laptop-outline', label: 'Task\nReport',          route: 'OwnerEmployeeWorkingRecord' }]
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
  // narrow cards.
  const qaCols = 3;

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
      <ScrollView contentContainerStyle={[styles.viewContent, capStyle]}>
        {/* Hero header */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatarWrap}>
            {employee.photoUrl ? (
              <Image source={{ uri: employee.photoUrl }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
                <Ionicons name="person" size={rs(30)} color="#09AD2A" />
              </View>
            )}
            <View style={[styles.heroAvatarDot, active ? styles.dotOn : styles.dotOff]} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>{employee.name}</Text>
            <View style={styles.heroRolePill}>
              <Ionicons name="construct-outline" size={rs(13)} color="#09AD2A" />
              <Text style={styles.heroRolePillText}>{employee.roleLabel || 'Technician'}</Text>
            </View>
            <Text style={styles.heroId}>ID: {empId}</Text>
          </View>
          <TouchableOpacity
            style={[styles.heroStatus, { backgroundColor: active ? '#EAF8EC' : '#F3F3F3' }]}
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
            <View style={[styles.viewCheckIcon, { backgroundColor: '#EAF8EC' }]}>
              <Ionicons name="partly-sunny" size={rs(18)} color="#09AD2A" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK IN</Text>
              <Text style={[styles.viewCheckTime, { color: '#078F23' }]}>
                {formatTime(employee.defaultCheckIn) || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.viewCheckCard}>
            <View style={[styles.viewCheckIcon, { backgroundColor: '#FFF8E1' }]}>
              <Ionicons name="partly-sunny" size={rs(18)} color="#F3BF23" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK OUT</Text>
              <Text style={[styles.viewCheckTime, { color: '#F84141' }]}>
                {formatTime(employee.defaultCheckOut) || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Access grid */}
        <Text style={styles.viewSectionHeader}>Quick Access</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => (
            <View key={c.key} style={[styles.catCell, { width: `${100 / qaCols}%` }]}>
              <TouchableOpacity
                style={styles.catItem}
                onPress={() => navigation.push(c.route, c.params || { employee })}
                activeOpacity={0.8}
              >
                <View style={styles.catIconWrap}>
                  <Ionicons name={c.icon} size={rs(18)} color="#09AD2A" />
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
              <Ionicons name="calendar-outline" size={rs(13)} color="#09AD2A" />
              <Text style={styles.monthPillText}>{monthLabel}</Text>
              <Ionicons name="chevron-down" size={rs(12)} color="#09AD2A" />
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
            <View style={[styles.statTile, { backgroundColor: '#EAF8EC' }]}>
              <Ionicons name="calendar-outline" size={rs(16)} color="#09AD2A" />
              <Text style={styles.statTileValue}>{presentDays}</Text>
              <Text style={styles.statTileLabel}>Present</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#FFF8E1' }]}>
              <Ionicons name="briefcase-outline" size={rs(16)} color="#F3BF23" />
              <Text style={styles.statTileValue}>{String(attendanceSummary?.leaveDays ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Leave</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#EAF8EC' }]}>
              <Ionicons name="calendar-outline" size={rs(16)} color="#09AD2A" />
              <Text style={styles.statTileValue}>{String(attendanceSummary?.permissionCount ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Permission</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#EAF8EC' }]}>
              <Ionicons name="time-outline" size={rs(16)} color="#09AD2A" />
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
            <View style={styles.recentAccent} />
            <View style={styles.recentInner}>
              <View style={styles.recentTopRow}>
                <Text style={styles.recentDate}>{formatAdvanceDate(recentAdvance.advanceDate)}</Text>
                <View style={styles.statusPillRow}>
                  <View style={[styles.statusPill, isPaid ? styles.statusPillOn : styles.statusPillDimGreen]}>
                    <Text style={[styles.statusPillText, isPaid ? styles.statusPillTextOn : styles.statusPillTextDim]}>
                      Paid
                    </Text>
                  </View>
                  <View style={[styles.statusPill, !isPaid ? styles.statusPillOnRed : styles.statusPillDimRed]}>
                    <Text style={[styles.statusPillText, !isPaid ? styles.statusPillTextOn : styles.statusPillTextDim]}>
                      Not Paid
                    </Text>
                  </View>
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
            <View style={styles.emptyIconWrap}>
              <Ionicons name="wallet-outline" size={rs(20)} color="#09AD2A" />
            </View>
            <View style={styles.emptyTextWrap}>
              <Text style={styles.emptyTitle}>No advances</Text>
              <Text style={styles.emptySub}>You haven't requested any advance yet.</Text>
            </View>
          </View>
        )}

        {/* Recent Leave Request */}
        <Text style={styles.viewSectionHeader}>Recent Leave Request</Text>
        {recentLeave ? (
          <View style={styles.recentItemCard}>
            <View style={styles.recentAccent} />
            <View style={styles.recentInner}>
              <View style={styles.recentTopRow}>
                <Text style={styles.recentDate}>{formatLeaveDate(recentLeave.startDate)}</Text>
                <View style={styles.statusPillRow}>
                  <View style={[styles.statusPill, isApproved ? styles.statusPillOn : styles.statusPillDimGreen]}>
                    <Text style={[styles.statusPillText, isApproved ? styles.statusPillTextOn : styles.statusPillTextDim]}>
                      Approved
                    </Text>
                  </View>
                  <View style={[styles.statusPill, isRejected ? styles.statusPillOnRed : styles.statusPillDimRed]}>
                    <Text style={[styles.statusPillText, isRejected ? styles.statusPillTextOn : styles.statusPillTextDim]}>
                      Rejected
                    </Text>
                  </View>
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
            <View style={styles.emptyIconWrap}>
              <Ionicons name="file-tray-outline" size={rs(20)} color="#09AD2A" />
            </View>
            <View style={styles.emptyTextWrap}>
              <Text style={styles.emptyTitle}>No leave requests</Text>
              <Text style={styles.emptySub}>You have no leave requests.</Text>
            </View>
          </View>
        )}

        {/* Contact footer — 2-column grid */}
        <View style={styles.viewFooterCard}>
          <View style={styles.footerGridRow}>
            <FooterItem icon="id-card-outline" label="Role" value={employee.roleLabel || 'Technician'} />
            <FooterItem icon="mail-outline" label="Email" value={employee.email || '—'} />
          </View>
          <View style={styles.footerGridRow}>
            <FooterItem icon="call-outline" label="Phone" value={employee.phone || '—'} />
            <FooterItem icon="location-outline" label="Department" value={employee.department || 'Service'} />
          </View>
          <View style={styles.footerGridRow}>
            <FooterItem
              icon="phone-portrait-outline"
              label="Staff App Login"
              value={linkedUserId ? 'Enabled' : 'Not configured'}
            />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // White page wash. Cards are flat — no shadows — so a 1px #E6E6E6 hairline is
  // the only thing separating a white card from the white page. Every card needs
  // one; a bare `backgroundColor: '#FFFFFF'` card would be invisible here.
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: rs(16), paddingBottom: rs(32) },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E1E1E', marginBottom: rs(12) },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rs(8) },
  addLinkText: { fontSize: 13, color: '#078F23', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(16),
  },
  label: { fontSize: 12, fontWeight: '600', color: '#1E1E1E', marginBottom: rs(6), marginTop: rs(10) },
  input: {
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontSize: 13,
    color: '#1E1E1E',
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: rs(8), gap: rs(8) },
  roleChip: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6D6D6',
  },
  roleChipActive: { backgroundColor: '#09AD2A', borderColor: '#09AD2A' },
  roleChipText: { fontSize: 12, color: '#6B6B6B' },
  roleChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  saveBtn: {
    marginTop: rs(20),
    backgroundColor: '#09AD2A',
    borderRadius: 999,
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: '#1E1E1E' },
  meta: { fontSize: 13, color: '#6B6B6B', marginTop: rs(4) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(12) },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: '#F3F3F3', gap: rs(12) },
  linkText: { fontSize: 13, color: '#1E1E1E', flex: 1 },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: rs(16), padding: rs(16), alignItems: 'center' },
  avatarLarge: { width: rs(80), height: rs(80), borderRadius: rs(40), backgroundColor: '#E6E6E6', marginBottom: rs(8) },
  profileName: { fontSize: 17, fontWeight: '700', color: '#1E1E1E' },
  profileId: { fontSize: 12, color: '#6B6B6B', marginTop: rs(2) },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(8) },
  statusDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#8A8A8A' },
  statusDotActive: { backgroundColor: '#09AD2A' },
  statusBadgeText: { fontSize: 13, color: '#6B6B6B' },
  statusBadgeTextActive: { color: '#09AD2A', fontWeight: '600' },
  checkInOutRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  checkCard: { flex: 1, backgroundColor: '#F8F8F8', borderRadius: rs(12), padding: rs(12), alignItems: 'center' },
  checkLabel: { fontSize: 11, color: '#6B6B6B', marginTop: rs(4) },
  checkTime: { fontSize: 15, fontWeight: '700', color: '#09AD2A' },
  statsRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  miniStat: { flex: 1, backgroundColor: '#F3F3F3', borderRadius: rs(10), padding: rs(10), alignItems: 'center' },
  miniStatValue: { fontSize: 15, fontWeight: '700', color: '#1E1E1E' },
  miniStatLabel: { fontSize: 11, color: '#6B6B6B', marginTop: rs(2) },
  recentCard: { marginTop: rs(8) },
  recentMeta: { fontSize: 13, color: '#1E1E1E', marginTop: rs(4) },
  tagRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(8) },
  tag: { paddingHorizontal: rs(8), paddingVertical: rs(4), borderRadius: rs(6), backgroundColor: '#FEECEC' },
  tagPaid: { backgroundColor: '#EAF8EC' },
  tagRejected: { backgroundColor: '#FEECEC' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#1E1E1E' },
  photoPlaceholder: { alignItems: 'center', paddingVertical: rs(12), backgroundColor: '#F8F8F8', borderRadius: rs(12), marginBottom: rs(8) },
  takePhotoBtn: { marginTop: rs(8), backgroundColor: '#09AD2A', paddingHorizontal: rs(16), paddingVertical: rs(8), borderRadius: rs(8) },
  takePhotoText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13, color: '#F84141' },

  // Compact add-mode styles
  addContent: { padding: rs(12), paddingBottom: rs(96) },
  addCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    padding: rs(10),
    marginBottom: rs(8),
    borderWidth: 1,
    borderColor: '#F3F3F3',
  },
  addSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    marginBottom: rs(4),
  },
  secIconWrap: { width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: '#EAF8EC', alignItems: 'center', justifyContent: 'center' },
  addSectionTitle: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  fieldRow: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
  fieldCol: { flex: 1 },
  addLabel: { fontSize: 11, fontWeight: '600', color: '#6B6B6B', marginTop: rs(7), marginBottom: rs(3) },
  req: { color: '#F84141' },
  addInput: {
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: rs(9),
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    fontSize: 13,
    color: '#1E1E1E',
    backgroundColor: '#FFFFFF',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: rs(9),
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    backgroundColor: '#FFFFFF',
  },
  addInputRowText: { flex: 1, fontSize: 13, color: '#1E1E1E' },
  addInputInline: { flex: 1, fontSize: 13, color: '#1E1E1E', padding: 0 },
  // Date of Join / Date of Birth: icon | DD - MM - YYYY | chevron, all centred.
  dateRow: { paddingHorizontal: rs(10), gap: rs(6) },
  dateIcon: { width: rs(16), alignItems: 'center', justifyContent: 'center' },
  dateText: {
    flex: 1,
    textAlign: 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontSize: 13,
    color: '#1E1E1E',
    padding: 0,
  },
  dateChevron: { width: rs(16), alignItems: 'center', justifyContent: 'center' },
  addInputRowOpen: {
    borderColor: '#09AD2A',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  roleDropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#09AD2A',
    borderBottomLeftRadius: rs(8),
    borderBottomRightRadius: rs(8),
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(10),
    paddingVertical: rs(10),
    backgroundColor: '#FFFFFF',
  },
  roleOptionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F3F3',
  },
  roleOptionSelected: { backgroundColor: '#EAF8EC' },
  roleOptionText: { fontSize: 13, color: '#1E1E1E' },
  shiftTimes: { fontSize: 11, color: '#6B6B6B', fontWeight: '600' },
  shiftOptionTimes: { fontSize: 11, color: '#6B6B6B', marginTop: rs(1) },
  roleOptionTextSelected: { color: '#078F23', fontWeight: '700' },

  addTwoCol: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
  addColMain: { flex: 1 },
  addColPhoto: { width: rs(108) },
  photoBox: {
    backgroundColor: '#F3F3F3',
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
  photoPreview: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: '#E6E6E6' },
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
    backgroundColor: '#09AD2A',
    paddingHorizontal: rs(8),
    paddingVertical: rs(4),
    borderRadius: 999,
  },
  takePhotoTextSm: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  addRow: { flexDirection: 'row', gap: rs(10) },
  addRowItem: { flex: 1 },

  idDocBlock: {
    marginTop: rs(8),
    paddingTop: rs(8),
    borderTopWidth: 1,
    borderTopColor: '#F3F3F3',
  },
  idDocLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E1E1E',
    marginBottom: rs(4),
  },
  idUploadRow: { flexDirection: 'row', gap: rs(10), marginTop: rs(6) },
  idUploadTile: {
    flex: 1,
    height: rs(64),
    borderRadius: rs(12),
    borderWidth: 1.2,
    borderColor: '#09AD2A',
    borderStyle: 'dashed',
    backgroundColor: '#EAF8EC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(3),
  },
  idUploadText: { fontSize: 11, color: '#078F23', fontWeight: '700' },
  idUploadSub: { fontSize: 10, color: '#8A8A8A', fontWeight: '500' },
  idUploadPreview: { ...StyleSheet.absoluteFill, borderRadius: rs(8) },
  idUploadBadge: {
    position: 'absolute',
    top: rs(4),
    right: rs(4),
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
  },
  idUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(4),
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: rs(8),
  },
  idUploadingText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  idUploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    backgroundColor: '#EAF8EC',
    borderRadius: rs(8),
    paddingHorizontal: rs(10),
    paddingVertical: rs(7),
    marginTop: rs(8),
  },
  idUploadedText: { flex: 1, fontSize: 11, color: '#078F23', fontWeight: '600' },

  otpHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(6),
    backgroundColor: '#EAF8EC',
    borderRadius: rs(8),
    padding: rs(8),
    marginTop: rs(10),
  },
  otpHintText: { flex: 1, fontSize: 11, color: '#078F23', lineHeight: rlh(15) },

  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(6),
    gap: rs(8),
  },
  salaryLabel: { fontSize: 12, color: '#1E1E1E', fontWeight: '500', flexShrink: 0 },
  salaryInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rs(7),
    minWidth: 0,
  },
  salaryCurrency: { fontSize: 13, color: '#6B6B6B', marginRight: rs(4) },
  salaryInput: { flex: 1, fontSize: 13, color: '#1E1E1E', padding: 0, minWidth: 0 },

  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6E6E6',
  },
  footerInner: { flexDirection: 'row', gap: rs(10) },
  footerCancel: {
    flex: 1,
    paddingVertical: rs(11),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#09AD2A',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerCancelText: { fontSize: 13, fontWeight: '800', color: '#078F23' },
  footerCreate: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    paddingVertical: rs(11),
    borderRadius: 999,
    backgroundColor: '#09AD2A',
  },
  footerCreateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // ===== Edit-mode design additions =====
  editHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(11),
    marginBottom: rs(10),
    borderWidth: 1,
    borderColor: '#E6E6E6',
  },
  editHeroAvatarWrap: { position: 'relative', marginRight: rs(12) },
  editHeroAvatar: { width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: '#E6E6E6' },
  editHeroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  editHeroCam: {
    position: 'absolute', right: rs(2), bottom: rs(2),
    width: rs(24), height: rs(24), borderRadius: rs(12),
    backgroundColor: '#09AD2A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  editHeroInfo: { flex: 1 },
  editHeroName: { fontSize: 15, fontWeight: '800', color: '#1E1E1E' },
  editHeroPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), backgroundColor: '#EAF8EC', paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: 999, marginTop: rs(6) },
  editHeroDot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
  editHeroPillText: { fontSize: 12, fontWeight: '700' },
  editHeroId: { fontSize: 11, color: '#8A8A8A', marginTop: rs(6) },

  checkCardEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    borderRadius: rs(12),
    borderWidth: 1,
    paddingHorizontal: rs(11),
    paddingVertical: rs(9),
  },
  checkCardLabel: { fontSize: 11, color: '#6B6B6B', fontWeight: '600' },
  checkCardInput: { fontSize: 15, fontWeight: '800', padding: 0, marginTop: rs(1) },

  loginCheckRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10), marginTop: rs(12) },
  loginCheckbox: {
    width: rs(22), height: rs(22), borderRadius: rs(6),
    borderWidth: 1.5, borderColor: '#D6D6D6',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  loginCheckboxOn: { backgroundColor: '#09AD2A', borderColor: '#09AD2A' },
  loginCheckLabel: { fontSize: 13, color: '#1E1E1E', fontWeight: '600' },

  deleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    backgroundColor: '#FEECEC',
    borderWidth: 1,
    borderColor: '#FBD0D0',
    borderRadius: rs(14),
    padding: rs(12),
    marginTop: rs(4),
    marginBottom: rs(4),
  },
  deleteIconWrap: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: '#FEECEC', alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontSize: 13, fontWeight: '800', color: '#F84141' },
  deleteSub: { fontSize: 11, color: '#8A8A8A', marginTop: rs(2), lineHeight: rlh(15) },

  // ===== View-mode (mockup-matching) =====
  viewContent: { padding: rs(12), paddingBottom: rs(24) },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#F3F3F3',
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
  statusOk: { color: '#078F23' },
  statusOff: { color: '#8A8A8A' },
  dotOn: { backgroundColor: '#09AD2A' },
  dotOff: { backgroundColor: '#8A8A8A' },
  heroAvatarWrap: { position: 'relative', marginRight: rs(12) },
  heroAvatar: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: '#EAF8EC' },
  heroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  heroAvatarDot: { position: 'absolute', right: rs(2), bottom: rs(2), width: rs(13), height: rs(13), borderRadius: rs(7), borderWidth: 2, borderColor: '#FFFFFF' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '800', color: '#1E1E1E' },
  heroRolePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), backgroundColor: '#EAF8EC', paddingHorizontal: rs(9), paddingVertical: rs(3), borderRadius: 999, marginTop: rs(5) },
  heroRolePillText: { fontSize: 11, fontWeight: '700', color: '#078F23' },
  heroId: { fontSize: 11, color: '#8A8A8A', marginTop: rs(5), letterSpacing: 0.4 },

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
    borderColor: '#F3F3F3',
  },
  viewCheckIcon: { width: rs(36), height: rs(36), borderRadius: rs(11), alignItems: 'center', justifyContent: 'center' },
  viewCheckTextWrap: { flex: 1 },
  viewCheckLabel: { fontSize: 10, color: '#8A8A8A', fontWeight: '700', letterSpacing: 0.5 },
  viewCheckTime: { fontSize: 15, fontWeight: '800', marginTop: rs(2) },

  viewSectionHeader: { fontSize: 13, fontWeight: '800', color: '#1E1E1E', marginTop: rs(14), marginBottom: rs(8) },

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
    borderColor: '#F3F3F3',
  },
  catIconWrap: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: '#EAF8EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(6),
  },
  catLabel: { fontSize: 10, fontWeight: '700', color: '#1E1E1E', textAlign: 'center', lineHeight: rlh(13) },

  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(12),
    marginTop: rs(12),
    borderWidth: 1,
    borderColor: '#F3F3F3',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(10),
  },
  monthTitle: { fontSize: 13, fontWeight: '700', color: '#1E1E1E' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: '#EAF8EC',
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: 999,
  },
  monthPillText: { fontSize: 12, fontWeight: '800', color: '#078F23' },

  mpBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.45)',
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
    backgroundColor: '#F3F3F3',
  },
  mpYear: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  mpGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: rs(8) },
  mpCell: { width: '33.33%', alignItems: 'center', justifyContent: 'center', paddingVertical: rs(10), borderRadius: rs(10) },
  mpCellSelected: { backgroundColor: '#09AD2A' },
  mpCellText: { fontSize: 13, fontWeight: '700', color: '#1E1E1E' },
  mpCellTextSelected: { color: '#FFFFFF' },
  mpFooter: { flexDirection: 'row', gap: rs(8), marginTop: rs(14) },
  mpBtn: { flex: 1, alignItems: 'center', paddingVertical: rs(10), borderRadius: rs(10) },
  mpBtnText: { fontSize: 13, fontWeight: '800' },

  progressTrack: {
    height: rs(6),
    borderRadius: rs(3),
    backgroundColor: '#E6E6E6',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#09AD2A' },
  progressLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: rs(6),
  },
  progressLegendOn: { fontSize: 12, color: '#078F23', fontWeight: '700' },
  progressLegendOff: { fontSize: 12, color: '#6B6B6B', fontWeight: '600' },

  statTilesRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  statTile: {
    flex: 1,
    borderRadius: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(6),
    alignItems: 'flex-start',
  },
  statTileValue: { fontSize: 15, fontWeight: '800', color: '#1E1E1E', marginTop: rs(4) },
  statTileLabel: { fontSize: 10, color: '#6B6B6B', fontWeight: '600', marginTop: rs(1) },

  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentAddLink: { fontSize: 13, color: '#078F23', fontWeight: '800', marginTop: rs(16) },

  recentItemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    overflow: 'hidden',
    // Same hairline as the emptyCard it alternates with — without it, this card
    // is white on a white page and loses its edge entirely.
    borderWidth: 1,
    borderColor: '#E6E6E6',
  },
  recentAccent: { width: rs(3), backgroundColor: '#09AD2A' },
  recentInner: { flex: 1, padding: rs(10) },
  recentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentDate: { fontSize: 12, fontWeight: '700', color: '#1E1E1E' },
  statusPillRow: { flexDirection: 'row', gap: rs(6) },
  statusPill: {
    paddingHorizontal: rs(9),
    paddingVertical: rs(3),
    borderRadius: 999,
  },
  statusPillOn: { backgroundColor: '#09AD2A' },
  statusPillOnRed: { backgroundColor: '#F84141' },
  statusPillDimGreen: { backgroundColor: '#EAF8EC' },
  statusPillDimRed: { backgroundColor: '#FEECEC' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusPillTextOn: { color: '#FFFFFF' },
  statusPillTextDim: { color: '#8A8A8A' },

  recentBottomRow: { flexDirection: 'row', marginTop: rs(10), gap: rs(10) },
  recentBottomCol: { flex: 1 },
  recentBigValue: { fontSize: 12, fontWeight: '700', color: '#1E1E1E' },
  recentSubLabel: { fontSize: 10, color: '#8A8A8A', marginTop: rs(2) },

  emptyText: { fontSize: 12, color: '#6B6B6B', textAlign: 'center', paddingVertical: rs(16) },

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
    borderColor: '#F3F3F3',
  },
  emptyIconWrap: { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: '#EAF8EC', alignItems: 'center', justifyContent: 'center' },
  emptyTextWrap: { flex: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#1E1E1E' },
  emptySub: { fontSize: 11, color: '#8A8A8A', marginTop: rs(2), textAlign: 'center' },

  viewFooterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(12),
    marginTop: rs(14),
    gap: rs(12),
    borderWidth: 1,
    borderColor: '#F3F3F3',
  },
  footerGridRow: { flexDirection: 'row', gap: rs(12) },
  footerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  footerIconWrap: { width: rs(32), height: rs(32), borderRadius: rs(10), backgroundColor: '#EAF8EC', alignItems: 'center', justifyContent: 'center' },
  footerItemLabel: { fontSize: 11, color: '#8A8A8A', fontWeight: '600' },
  footerItemValue: { fontSize: 13, color: '#1E1E1E', fontWeight: '700', marginTop: rs(1) },
});
