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
              <Ionicons name="chevron-back" size={rs(16)} color="#172117" />
            </TouchableOpacity>
            <Text style={styles.mpYear}>{year}</Text>
            <TouchableOpacity
              style={[styles.mpNav, year >= curYear && { opacity: 0.35 }]}
              onPress={() => setYear((y) => y + 1)}
              disabled={year >= curYear}
              hitSlop={rs(8)}
            >
              <Ionicons name="chevron-forward" size={rs(16)} color="#172117" />
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
              style={[styles.mpBtn, { backgroundColor: '#E6F7E3' }]}
              onPress={() => onPick({ month: curMonth, year: curYear })}
            >
              <Text style={[styles.mpBtnText, { color: '#004C40' }]}>This Month</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mpBtn, { backgroundColor: '#F1F5F1' }]} onPress={onClose}>
              <Text style={[styles.mpBtnText, { color: '#667066' }]}>Cancel</Text>
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
        <Ionicons name={icon} size={rs(16)} color="#004C40" />
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
            <Ionicons name="ellipsis-vertical" size={rs(20)} color="#004C40" />
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
                    <Ionicons name="person" size={rs(44)} color="#8FA08F" />
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
                    <View style={[styles.editHeroDot, { backgroundColor: active ? '#004C40' : '#8FA08F' }]} />
                    <Text style={[styles.editHeroPillText, { color: active ? '#004C40' : '#667066' }]}>
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
                  <Ionicons name="person-outline" size={rs(16)} color="#004C40" />
                </View>
                <Text style={styles.addSectionTitle}>Basic Information</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Employee Name <Text style={styles.req}>*</Text></Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="Enter name"
                    placeholderTextColor="#8FA08F"
                    value={form.name}
                    onChangeText={(v) => set('name', v)}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Email</Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="name@example.com"
                    placeholderTextColor="#8FA08F"
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
                    placeholderTextColor="#8FA08F"
                    value={form.phone}
                    onChangeText={(v) => set('phone', v)}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Role <Text style={styles.req}>*</Text></Text>
                  <TouchableOpacity
                    style={[styles.addInputRow, roleOpen && styles.addInputRowOpen]}
                    onPress={() => setRoleOpen((o) => !o)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addInputRowText}>{form.roleLabel || 'Select role'}</Text>
                    <Ionicons name={roleOpen ? 'chevron-up' : 'chevron-down'} size={rs(14)} color="#667066" />
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
                            {selected && <Ionicons name="checkmark" size={rs(16)} color="#004C40" />}
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
                  <Ionicons name="briefcase-outline" size={rs(16)} color="#004C40" />
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
                      <Ionicons name="calendar-outline" size={rs(14)} color="#004C40" />
                    </View>
                    <Text
                      style={[styles.dateText, !form.dateOfJoin && { color: '#8FA08F' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatDisplayDate(form.dateOfJoin)}
                    </Text>
                    <View style={styles.dateChevron}>
                      <Ionicons name="chevron-down" size={rs(14)} color="#8FA08F" />
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
                      <Ionicons name="calendar-outline" size={rs(14)} color="#004C40" />
                    </View>
                    <Text
                      style={[styles.dateText, !form.dateOfBirth && { color: '#8FA08F' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatDisplayDate(form.dateOfBirth)}
                    </Text>
                    <View style={styles.dateChevron}>
                      <Ionicons name="chevron-down" size={rs(14)} color="#8FA08F" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.addLabel}>Shift</Text>
              <View style={styles.addInputRow}>
                <Text style={styles.addInputRowText}>General Shift</Text>
                <Ionicons name="chevron-down" size={rs(14)} color="#667066" />
              </View>

              <View style={[styles.fieldRow, { marginTop: rs(12) }]}>
                <View style={[styles.checkCardEdit, { backgroundColor: '#F0F8EF', borderColor: '#C8EEBF' }]}>
                  <Ionicons name="time-outline" size={rs(18)} color="#004C40" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkCardLabel}>Check In</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#004C40' }]}
                      placeholder="09:30"
                      placeholderTextColor="#8FA08F"
                      value={form.defaultCheckIn}
                      onChangeText={(v) => set('defaultCheckIn', v)}
                    />
                  </View>
                </View>
                <View style={[styles.checkCardEdit, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Ionicons name="time-outline" size={rs(18)} color="#DC2626" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkCardLabel}>Check Out</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#DC2626' }]}
                      placeholder="18:30"
                      placeholderTextColor="#8FA08F"
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
                  <Ionicons name="shield-checkmark-outline" size={rs(16)} color="#004C40" />
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
                            <Ionicons name="checkmark-circle" size={rs(14)} color="#004C40" />
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={rs(22)} color="#004C40" />
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
                            <Ionicons name="checkmark-circle" size={rs(14)} color="#004C40" />
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={rs(22)} color="#004C40" />
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
                  {(form[doc.frontField] || form[doc.backField]) && (
                    <View style={styles.idUploadedRow}>
                      <Ionicons name="checkmark-circle" size={rs(14)} color="#004C40" />
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
                        <Ionicons name="trash-outline" size={rs(14)} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    style={[styles.addInput, { marginTop: rs(4) }]}
                    placeholder={doc.placeholder}
                    placeholderTextColor="#8FA08F"
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
                  <Ionicons name="cash-outline" size={rs(16)} color="#004C40" />
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
                      placeholderTextColor="#8FA08F"
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
                      placeholderTextColor="#8FA08F"
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
                  <Ionicons name="lock-closed-outline" size={rs(16)} color="#004C40" />
                </View>
                <Text style={styles.addSectionTitle}>App Login (optional)</Text>
              </View>
              <Text style={styles.addLabel}>Password</Text>
              <View style={styles.addInputRow}>
                <TextInput
                  style={styles.addInputInline}
                  placeholder="Min 4 characters"
                  placeholderTextColor="#8FA08F"
                  value={form.password}
                  onChangeText={(v) => set('password', v)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={rs(18)} color="#667066" />
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
                <Ionicons name="information-circle-outline" size={rs(13)} color="#004C40" />
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
                  <Ionicons name="trash-outline" size={rs(18)} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deleteTitle}>Delete Employee</Text>
                  <Text style={styles.deleteSub}>
                    This action cannot be undone. All employee data will be permanently deleted.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={rs(18)} color="#DC2626" />
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <LedgerDateSheet
            visible={dateField !== null}
            value={
              parseYmd(dateField && form[dateField])
              || (dateField === 'dateOfBirth' ? defaultBirthDate() : new Date())
            }
            tint="#004C40"
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
                <Ionicons name="person" size={rs(40)} color="#004C40" />
              </View>
            )}
            <View style={[styles.heroAvatarDot, active ? styles.dotOn : styles.dotOff]} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>{employee.name}</Text>
            <View style={styles.heroRolePill}>
              <Ionicons name="construct-outline" size={rs(13)} color="#004C40" />
              <Text style={styles.heroRolePillText}>{employee.roleLabel || 'Technician'}</Text>
            </View>
            <Text style={styles.heroId}>ID: {empId}</Text>
          </View>
          <TouchableOpacity style={styles.heroStatus} onPress={confirmToggleActive} activeOpacity={0.7}>
            <View style={[styles.heroStatusDot, active ? styles.dotOn : styles.dotOff]} />
            <Text style={[styles.heroStatusValue, active ? styles.statusOk : styles.statusOff]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Check-in / Check-out */}
        <View style={styles.viewCheckRow}>
          <View style={styles.viewCheckCard}>
            <View style={[styles.viewCheckIcon, { backgroundColor: '#E6F7E3' }]}>
              <Ionicons name="partly-sunny" size={rs(22)} color="#004C40" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK IN</Text>
              <Text style={[styles.viewCheckTime, { color: '#004C40' }]}>
                {formatTime(employee.defaultCheckIn) || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.viewCheckCard}>
            <View style={[styles.viewCheckIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="partly-sunny" size={rs(22)} color="#F59E0B" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK OUT</Text>
              <Text style={[styles.viewCheckTime, { color: '#DC2626' }]}>
                {formatTime(employee.defaultCheckOut) || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Access grid */}
        <Text style={styles.viewSectionHeader}>Quick Access</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.catItem}
              onPress={() => navigation.push(c.route, c.params || { employee })}
              activeOpacity={0.8}
            >
              <View style={styles.catIconWrap}>
                <Ionicons name={c.icon} size={rs(22)} color="#FFFFFF" />
              </View>
              <Text style={styles.catLabel}>{c.label}</Text>
            </TouchableOpacity>
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
              <Ionicons name="calendar-outline" size={rs(13)} color="#004C40" />
              <Text style={styles.monthPillText}>{monthLabel}</Text>
              <Ionicons name="chevron-down" size={rs(12)} color="#004C40" />
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
            <View style={[styles.statTile, { backgroundColor: '#F0F8EF' }]}>
              <Ionicons name="calendar-outline" size={rs(16)} color="#004C40" />
              <Text style={styles.statTileValue}>{presentDays}</Text>
              <Text style={styles.statTileLabel}>Present</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="briefcase-outline" size={rs(16)} color="#F59E0B" />
              <Text style={styles.statTileValue}>{String(attendanceSummary?.leaveDays ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Leave</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#F0F8EF' }]}>
              <Ionicons name="calendar-outline" size={rs(16)} color="#004C40" />
              <Text style={styles.statTileValue}>{String(attendanceSummary?.permissionCount ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Permission</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#F0F8EF' }]}>
              <Ionicons name="time-outline" size={rs(16)} color="#004C40" />
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
              <Ionicons name="wallet-outline" size={rs(20)} color="#004C40" />
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
              <Ionicons name="file-tray-outline" size={rs(20)} color="#004C40" />
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
  // White page wash. Cards are flat — no shadows — so a 1px #E2E8E2 hairline is
  // the only thing separating a white card from the white page. Every card needs
  // one; a bare `backgroundColor: '#FFFFFF'` card would be invisible here.
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: rs(16), paddingBottom: rs(32) },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#172117', marginBottom: rs(12) },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rs(8) },
  addLinkText: { fontSize: 13, color: '#004C40', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(16),
  },
  label: { fontSize: 12, fontWeight: '600', color: '#172117', marginBottom: rs(6), marginTop: rs(10) },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8E2',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontSize: 13,
    color: '#172117',
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: rs(8), gap: rs(8) },
  roleChip: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5CB',
  },
  roleChipActive: { backgroundColor: '#004C40', borderColor: '#004C40' },
  roleChipText: { fontSize: 12, color: '#667066' },
  roleChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  saveBtn: {
    marginTop: rs(20),
    backgroundColor: '#004C40',
    borderRadius: 999,
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: '#172117' },
  meta: { fontSize: 13, color: '#667066', marginTop: rs(4) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(12) },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: '#EFF5EE', gap: rs(12) },
  linkText: { fontSize: 14, color: '#172117', flex: 1 },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: rs(16), padding: rs(16), alignItems: 'center' },
  avatarLarge: { width: rs(80), height: rs(80), borderRadius: rs(40), backgroundColor: '#E2E8E2', marginBottom: rs(8) },
  profileName: { fontSize: 17, fontWeight: '700', color: '#172117' },
  profileId: { fontSize: 12, color: '#667066', marginTop: rs(2) },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(8) },
  statusDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#8FA08F' },
  statusDotActive: { backgroundColor: '#004C40' },
  statusBadgeText: { fontSize: 13, color: '#667066' },
  statusBadgeTextActive: { color: '#004C40', fontWeight: '600' },
  checkInOutRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  checkCard: { flex: 1, backgroundColor: '#F7FAF7', borderRadius: rs(12), padding: rs(12), alignItems: 'center' },
  checkLabel: { fontSize: 11, color: '#667066', marginTop: rs(4) },
  checkTime: { fontSize: 15, fontWeight: '700', color: '#004C40' },
  statsRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  miniStat: { flex: 1, backgroundColor: '#EFF5EE', borderRadius: rs(10), padding: rs(10), alignItems: 'center' },
  miniStatValue: { fontSize: 15, fontWeight: '700', color: '#172117' },
  miniStatLabel: { fontSize: 11, color: '#667066', marginTop: rs(2) },
  recentCard: { marginTop: rs(8) },
  recentMeta: { fontSize: 13, color: '#172117', marginTop: rs(4) },
  tagRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(8) },
  tag: { paddingHorizontal: rs(8), paddingVertical: rs(4), borderRadius: rs(6), backgroundColor: '#FEE2E2' },
  tagPaid: { backgroundColor: '#E6F7E3' },
  tagRejected: { backgroundColor: '#FEE2E2' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#172117' },
  photoPlaceholder: { alignItems: 'center', paddingVertical: rs(12), backgroundColor: '#F7FAF7', borderRadius: rs(12), marginBottom: rs(8) },
  takePhotoBtn: { marginTop: rs(8), backgroundColor: '#004C40', paddingHorizontal: rs(16), paddingVertical: rs(8), borderRadius: rs(8) },
  takePhotoText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13, color: '#DC2626' },

  // Compact add-mode styles
  addContent: { padding: rs(12), paddingBottom: rs(110) },
  addCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(16),
    marginBottom: rs(12),
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  addSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    marginBottom: rs(12),
  },
  secIconWrap: { width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: '#E6F7E3', alignItems: 'center', justifyContent: 'center' },
  addSectionTitle: { fontSize: 14, fontWeight: '800', color: '#172117' },
  fieldRow: { flexDirection: 'row', gap: rs(12), alignItems: 'flex-start' },
  fieldCol: { flex: 1 },
  addLabel: { fontSize: 12, fontWeight: '600', color: '#172117', marginTop: rs(10), marginBottom: rs(5) },
  req: { color: '#DC2626' },
  addInput: {
    borderWidth: 1.5,
    borderColor: '#E2E8E2',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    fontSize: 13,
    color: '#172117',
    backgroundColor: '#FFFFFF',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    borderWidth: 1.5,
    borderColor: '#E2E8E2',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(11),
    backgroundColor: '#FFFFFF',
  },
  addInputRowText: { flex: 1, fontSize: 13, color: '#172117' },
  addInputInline: { flex: 1, fontSize: 13, color: '#172117', padding: 0 },
  // Date of Join / Date of Birth: icon | DD - MM - YYYY | chevron, all centred.
  dateRow: { paddingHorizontal: rs(10), gap: rs(6) },
  dateIcon: { width: rs(16), alignItems: 'center', justifyContent: 'center' },
  dateText: {
    flex: 1,
    textAlign: 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontSize: 13,
    color: '#172117',
    padding: 0,
  },
  dateChevron: { width: rs(16), alignItems: 'center', justifyContent: 'center' },
  addInputRowOpen: {
    borderColor: '#172117',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  roleDropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#172117',
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
    borderBottomColor: '#EFF5EE',
  },
  roleOptionSelected: { backgroundColor: '#F0F8EF' },
  roleOptionText: { fontSize: 13, color: '#172117' },
  roleOptionTextSelected: { color: '#004C40', fontWeight: '700' },

  addTwoCol: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
  addColMain: { flex: 1 },
  addColPhoto: { width: rs(108) },
  photoBox: {
    backgroundColor: '#EFF5EE',
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
  photoPreview: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: '#E2E8E2' },
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
    backgroundColor: '#004C40',
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
    borderTopColor: '#EFF5EE',
  },
  idDocLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#172117',
    marginBottom: rs(4),
  },
  idUploadRow: { flexDirection: 'row', gap: rs(10), marginTop: rs(8) },
  idUploadTile: {
    flex: 1,
    height: rs(84),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: '#004C40',
    borderStyle: 'dashed',
    backgroundColor: '#F0F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(3),
  },
  idUploadText: { fontSize: 12, color: '#004C40', fontWeight: '700' },
  idUploadSub: { fontSize: 10, color: '#8FA08F', fontWeight: '500' },
  idUploadPreview: { ...StyleSheet.absoluteFillObject, borderRadius: rs(8) },
  idUploadBadge: {
    position: 'absolute',
    top: rs(4),
    right: rs(4),
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
  },
  idUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: '#F0F8EF',
    borderRadius: rs(8),
    paddingHorizontal: rs(10),
    paddingVertical: rs(7),
    marginTop: rs(8),
  },
  idUploadedText: { flex: 1, fontSize: 11, color: '#004C40', fontWeight: '600' },

  otpHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(6),
    backgroundColor: '#F0F8EF',
    borderRadius: rs(8),
    padding: rs(8),
    marginTop: rs(12),
  },
  otpHintText: { flex: 1, fontSize: 11, color: '#004C40', lineHeight: rlh(15) },

  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(6),
    gap: rs(8),
  },
  salaryLabel: { fontSize: 12, color: '#172117', fontWeight: '500', flexShrink: 0 },
  salaryInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8E2',
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rs(7),
    minWidth: 0,
  },
  salaryCurrency: { fontSize: 13, color: '#667066', marginRight: rs(4) },
  salaryInput: { flex: 1, fontSize: 13, color: '#172117', padding: 0, minWidth: 0 },

  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8E2',
  },
  footerInner: { flexDirection: 'row', gap: rs(10) },
  footerCancel: {
    flex: 1,
    paddingVertical: rs(13),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#004C40',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerCancelText: { fontSize: 13, fontWeight: '800', color: '#004C40' },
  footerCreate: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    paddingVertical: rs(13),
    borderRadius: 999,
    backgroundColor: '#004C40',
  },
  footerCreateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // ===== Edit-mode design additions =====
  editHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(13),
    marginBottom: rs(10),
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  editHeroAvatarWrap: { position: 'relative', marginRight: rs(12) },
  editHeroAvatar: { width: rs(68), height: rs(68), borderRadius: rs(34), backgroundColor: '#E2E8E2' },
  editHeroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  editHeroCam: {
    position: 'absolute', right: rs(2), bottom: rs(2),
    width: rs(30), height: rs(30), borderRadius: rs(15),
    backgroundColor: '#004C40',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  editHeroInfo: { flex: 1 },
  editHeroName: { fontSize: 16, fontWeight: '800', color: '#172117' },
  editHeroPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), backgroundColor: '#E6F7E3', paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: 999, marginTop: rs(6) },
  editHeroDot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
  editHeroPillText: { fontSize: 12, fontWeight: '700' },
  editHeroId: { fontSize: 11.5, color: '#8FA08F', marginTop: rs(6) },

  checkCardEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    borderRadius: rs(12),
    borderWidth: 1,
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
  },
  checkCardLabel: { fontSize: 11, color: '#667066', fontWeight: '600' },
  checkCardInput: { fontSize: 15, fontWeight: '800', padding: 0, marginTop: rs(1) },

  loginCheckRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10), marginTop: rs(14) },
  loginCheckbox: {
    width: rs(22), height: rs(22), borderRadius: rs(6),
    borderWidth: 1.5, borderColor: '#CBD5CB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  loginCheckboxOn: { backgroundColor: '#004C40', borderColor: '#004C40' },
  loginCheckLabel: { fontSize: 13, color: '#172117', fontWeight: '600' },

  deleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: rs(14),
    padding: rs(14),
    marginTop: rs(4),
    marginBottom: rs(4),
  },
  deleteIconWrap: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  deleteSub: { fontSize: 11.5, color: '#8FA08F', marginTop: rs(2), lineHeight: rlh(15) },

  // ===== View-mode (mockup-matching) =====
  viewContent: { padding: rs(12), paddingBottom: rs(24) },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(16),
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  heroStatus: {
    position: 'absolute',
    top: rs(14),
    right: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
  },
  heroStatusDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  heroStatusValue: { fontSize: 12.5, fontWeight: '800' },
  statusOk: { color: '#004C40' },
  statusOff: { color: '#8FA08F' },
  dotOn: { backgroundColor: '#004C40' },
  dotOff: { backgroundColor: '#8FA08F' },
  heroAvatarWrap: { position: 'relative', marginRight: rs(14) },
  heroAvatar: { width: rs(76), height: rs(76), borderRadius: rs(38), backgroundColor: '#E6F7E3' },
  heroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  heroAvatarDot: { position: 'absolute', right: rs(3), bottom: rs(3), width: rs(16), height: rs(16), borderRadius: rs(8), borderWidth: 2, borderColor: '#FFFFFF' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 20, fontWeight: '800', color: '#172117' },
  heroRolePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), backgroundColor: '#E6F7E3', paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: 999, marginTop: rs(6) },
  heroRolePillText: { fontSize: 12.5, fontWeight: '700', color: '#004C40' },
  heroId: { fontSize: 12, color: '#8FA08F', marginTop: rs(8), letterSpacing: 0.4 },

  viewCheckRow: { flexDirection: 'row', gap: rs(10), marginTop: rs(10) },
  viewCheckCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    paddingHorizontal: rs(12),
    gap: rs(10),
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  viewCheckIcon: { width: rs(44), height: rs(44), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center' },
  viewCheckTextWrap: { flex: 1 },
  viewCheckLabel: { fontSize: 10.5, color: '#8FA08F', fontWeight: '700', letterSpacing: 0.5 },
  viewCheckTime: { fontSize: 17, fontWeight: '800', marginTop: rs(2) },

  viewSectionHeader: { fontSize: 13, fontWeight: '800', color: '#172117', marginTop: rs(16), marginBottom: rs(10) },

  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(10),
    rowGap: rs(12),
  },
  catItem: {
    width: '22%',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(12),
    paddingHorizontal: rs(2),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  catIconWrap: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    backgroundColor: '#004C40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(8),
  },
  catLabel: { fontSize: 11, fontWeight: '700', color: '#172117', textAlign: 'center', lineHeight: rlh(14) },

  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(16),
    padding: rs(14),
    marginTop: rs(12),
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(10),
  },
  monthTitle: { fontSize: 13, fontWeight: '700', color: '#172117' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(5),
    backgroundColor: '#E6F7E3',
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: 999,
  },
  monthPillText: { fontSize: 12, fontWeight: '800', color: '#004C40' },

  mpBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 33, 23, 0.45)',
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
    backgroundColor: '#F1F5F1',
  },
  mpYear: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', color: '#172117' },
  mpGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: rs(8) },
  mpCell: { width: '33.33%', alignItems: 'center', justifyContent: 'center', paddingVertical: rs(10), borderRadius: rs(10) },
  mpCellSelected: { backgroundColor: '#004C40' },
  mpCellText: { fontSize: 13, fontWeight: '700', color: '#172117' },
  mpCellTextSelected: { color: '#FFFFFF' },
  mpFooter: { flexDirection: 'row', gap: rs(8), marginTop: rs(14) },
  mpBtn: { flex: 1, alignItems: 'center', paddingVertical: rs(10), borderRadius: rs(10) },
  mpBtnText: { fontSize: 13, fontWeight: '800' },

  progressTrack: {
    height: rs(6),
    borderRadius: rs(3),
    backgroundColor: '#E2E8E2',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#004C40' },
  progressLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: rs(6),
  },
  progressLegendOn: { fontSize: 12, color: '#004C40', fontWeight: '700' },
  progressLegendOff: { fontSize: 12, color: '#667066', fontWeight: '600' },

  statTilesRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  statTile: {
    flex: 1,
    borderRadius: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(6),
    alignItems: 'flex-start',
  },
  statTileValue: { fontSize: 15, fontWeight: '800', color: '#172117', marginTop: rs(4) },
  statTileLabel: { fontSize: 10, color: '#667066', fontWeight: '600', marginTop: rs(1) },

  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentAddLink: { fontSize: 13, color: '#004C40', fontWeight: '800', marginTop: rs(16) },

  recentItemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    overflow: 'hidden',
    // Same hairline as the emptyCard it alternates with — without it, this card
    // is white on a white page and loses its edge entirely.
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  recentAccent: { width: rs(3), backgroundColor: '#004C40' },
  recentInner: { flex: 1, padding: rs(10) },
  recentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentDate: { fontSize: 12, fontWeight: '700', color: '#172117' },
  statusPillRow: { flexDirection: 'row', gap: rs(6) },
  statusPill: {
    paddingHorizontal: rs(9),
    paddingVertical: rs(3),
    borderRadius: 999,
  },
  statusPillOn: { backgroundColor: '#004C40' },
  statusPillOnRed: { backgroundColor: '#DC2626' },
  statusPillDimGreen: { backgroundColor: '#E6F7E3' },
  statusPillDimRed: { backgroundColor: '#FEE2E2' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusPillTextOn: { color: '#FFFFFF' },
  statusPillTextDim: { color: '#8FA08F' },

  recentBottomRow: { flexDirection: 'row', marginTop: rs(10), gap: rs(10) },
  recentBottomCol: { flex: 1 },
  recentBigValue: { fontSize: 12, fontWeight: '700', color: '#172117' },
  recentSubLabel: { fontSize: 10, color: '#8FA08F', marginTop: rs(2) },

  emptyText: { fontSize: 12, color: '#667066', textAlign: 'center', paddingVertical: rs(16) },

  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    paddingVertical: rs(16),
    paddingHorizontal: rs(14),
    marginTop: rs(4),
    gap: rs(12),
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  emptyIconWrap: { width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: '#F0F8EF', alignItems: 'center', justifyContent: 'center' },
  emptyTextWrap: { flex: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#172117' },
  emptySub: { fontSize: 12, color: '#8FA08F', marginTop: rs(2), textAlign: 'center' },

  viewFooterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(14),
    marginTop: rs(14),
    gap: rs(14),
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  footerGridRow: { flexDirection: 'row', gap: rs(12) },
  footerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  footerIconWrap: { width: rs(36), height: rs(36), borderRadius: rs(10), backgroundColor: '#F0F8EF', alignItems: 'center', justifyContent: 'center' },
  footerItemLabel: { fontSize: 11, color: '#8FA08F', fontWeight: '600' },
  footerItemValue: { fontSize: 13, color: '#172117', fontWeight: '700', marginTop: rs(1) },
});
