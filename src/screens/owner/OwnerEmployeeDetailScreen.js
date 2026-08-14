import React, { useState, useCallback, useEffect } from 'react';
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

const ROLES = ['Technician', 'Staff', 'Pickup Person'];
const SALARY_PERIODS = ['Monthly', 'Weekly'];

// Green-icon labelled cell used in the contact footer grid.
function FooterItem({ icon, label, value }) {
  return (
    <View style={styles.footerItem}>
      <View style={styles.footerIconWrap}>
        <Ionicons name={icon} size={16} color="#087A0A" />
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

  useEffect(() => {
    if (isEdit) {
      navigation.setOptions?.({ title: 'Edit Profile', headerRight: undefined });
    } else if (mode === 'view' && employee) {
      navigation.setOptions?.({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.push('OwnerEmployeeDetail', { employee, mode: 'edit' })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingHorizontal: 6 }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#087A0A" />
          </TouchableOpacity>
        ),
      });
    }
  }, [isEdit, mode, navigation, employee]);

  useEffect(() => {
    if (!isEdit || !employee?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await ticketApi.get(`/technicians/${employee.id}`);
        if (cancelled || !fresh) return;
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
    const email = form.email?.trim() || null;
    const password = form.password?.trim() || null;
    const phone = form.phone?.trim() || null;
    if (password && password.length < 4) {
      notify('Validation', 'Password must be at least 4 characters');
      return;
    }
    // Provision an employee login whenever there's an identifier to key it on.
    // A mobile number alone is enough — login is mobile + default OTP 123456.
    // Only a name-only employee is created without a login.
    // Honor the "Employee login enabled" toggle — an owner who unchecks it wants
    // a records-only employee, so don't provision a mobile+OTP login even when a
    // phone/email was entered.
    const provisionLogin = !!(email || phone) && loginEnabled;
    setSaving(true);
    try {
      let userId = null;
      if (provisionLogin) {
        if (!shopId) {
          notify('Error', 'Session expired. Please log in again.', { preset: 'error', haptic: 'error' });
          setSaving(false);
          return;
        }
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
          userId = authRes?.userId;
        } catch (authErr) {
          const msg = authErr?.message || authErr?.payload?.message || '';
          const isShopNotFound = msg.includes('Shop not found') || (authErr?.status === 400 && String(msg).toLowerCase().includes('shop'));
          if (isShopNotFound) {
            const ok = await confirm({
              title: 'Shop not found',
              message: 'Your session may be from another server or the shop was reset. You can add this employee without app login now, or log out and log in again to fix the session.',
              confirmText: 'Add without login',
              cancelText: 'Cancel',
            });
            if (!ok) {
              setSaving(false);
            } else {
              setSaving(true);
              await doCreateEmployee(null);
            }
            return;
          }
          throw authErr;
        }
      }
      await doCreateEmployee(userId);
    } catch (e) {
      if (e?.status === 409) { await handleSeatLimit(e); return; }
      notify('Error', e.message || 'Failed to add employee', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
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

  const doCreateEmployee = async (userId) => {
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
        phone: (form.phone && form.phone.trim()) || null,
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
      setSaving(false);
      const message = withLogin
        ? 'Employee added. They can log in to the employee app with their mobile number and OTP 123456.'
        : 'Employee added.';
      requestAnimationFrame(() => {
        navigation.navigate('OwnerEmployeeCreated', {
          employee: created || { name: form.name.trim(), roleLabel: form.roleLabel },
          message,
        });
      });
    } catch (e) {
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
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: (form.phone && form.phone.trim()) || null,
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
  const [advances, setAdvances] = useState([]);
  const [recentLeaves, setRecentLeaves] = useState([]);
  const loadProfileData = useCallback(async () => {
    if (!employee?.id) return;
    try {
      const now = new Date();
      const [att, adv, leaves] = await Promise.all([
        ticketApi.get(`/technicians/${employee.id}/attendance`, { query: { month: now.getMonth() + 1, year: now.getFullYear() } }).catch(() => null),
        ticketApi.get(`/technicians/${employee.id}/advances`).catch(() => []),
        ticketApi.get(`/technicians/${employee.id}/leaves`, { query: { month: now.getMonth() + 1, year: now.getFullYear() } }).catch(() => []),
      ]);
      setAttendanceSummary(att || null);
      setAdvances(Array.isArray(adv) ? adv : []);
      setRecentLeaves(Array.isArray(leaves) ? leaves : []);
    } catch (_) {}
  }, [employee?.id]);
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
            contentContainerStyle={styles.addContent}
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
                    <Ionicons name="person" size={44} color="#8FA08F" />
                  </View>
                )}
                <View style={styles.editHeroCam}>
                  {uploading.photoUrl ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera" size={14} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.editHeroInfo}>
                <Text style={styles.editHeroName} numberOfLines={1}>{form.name || 'New Employee'}</Text>
                {isEdit ? (
                  <View style={styles.editHeroPill}>
                    <View style={[styles.editHeroDot, { backgroundColor: active ? '#16BB05' : '#8FA08F' }]} />
                    <Text style={[styles.editHeroPillText, { color: active ? '#087A0A' : '#667066' }]}>
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
                  <Ionicons name="person-outline" size={16} color="#087A0A" />
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
                    <Ionicons name={roleOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#667066" />
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
                            {selected && <Ionicons name="checkmark" size={16} color="#087A0A" />}
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
                  <Ionicons name="briefcase-outline" size={16} color="#087A0A" />
                </View>
                <Text style={styles.addSectionTitle}>Work Information</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Date of Join</Text>
                  <View style={styles.addInputRow}>
                    <Ionicons name="calendar-outline" size={14} color="#087A0A" />
                    <TextInput
                      style={styles.addInputInline}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#8FA08F"
                      value={form.dateOfJoin}
                      onChangeText={(v) => set('dateOfJoin', v)}
                    />
                    <Ionicons name="chevron-down" size={14} color="#8FA08F" />
                  </View>
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.addLabel}>Date of Birth</Text>
                  <View style={styles.addInputRow}>
                    <Ionicons name="calendar-outline" size={14} color="#087A0A" />
                    <TextInput
                      style={styles.addInputInline}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#8FA08F"
                      value={form.dateOfBirth}
                      onChangeText={(v) => set('dateOfBirth', v)}
                    />
                    <Ionicons name="chevron-down" size={14} color="#8FA08F" />
                  </View>
                </View>
              </View>

              <Text style={styles.addLabel}>Shift</Text>
              <View style={styles.addInputRow}>
                <Text style={styles.addInputRowText}>General Shift</Text>
                <Ionicons name="chevron-down" size={14} color="#667066" />
              </View>

              <View style={[styles.fieldRow, { marginTop: 12 }]}>
                <View style={[styles.checkCardEdit, { backgroundColor: '#F0F8EF', borderColor: '#C8EEBF' }]}>
                  <Ionicons name="time-outline" size={18} color="#087A0A" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkCardLabel}>Check In</Text>
                    <TextInput
                      style={[styles.checkCardInput, { color: '#087A0A' }]}
                      placeholder="09:30"
                      placeholderTextColor="#8FA08F"
                      value={form.defaultCheckIn}
                      onChangeText={(v) => set('defaultCheckIn', v)}
                    />
                  </View>
                </View>
                <View style={[styles.checkCardEdit, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Ionicons name="time-outline" size={18} color="#DC2626" />
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
                  <Ionicons name="shield-checkmark-outline" size={16} color="#087A0A" />
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
                            <Ionicons name="checkmark-circle" size={14} color="#16BB05" />
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={22} color="#087A0A" />
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
                            <Ionicons name="checkmark-circle" size={14} color="#16BB05" />
                          </View>
                        </>
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={22} color="#087A0A" />
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
                      <Ionicons name="checkmark-circle" size={14} color="#16BB05" />
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
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    style={[styles.addInput, { marginTop: 4 }]}
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
                  <Ionicons name="cash-outline" size={16} color="#087A0A" />
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
                  <Ionicons name="lock-closed-outline" size={16} color="#087A0A" />
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
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#667066" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.loginCheckRow}
                onPress={() => setLoginEnabled((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.loginCheckbox, loginEnabled && styles.loginCheckboxOn]}>
                  {loginEnabled ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                </View>
                <Text style={styles.loginCheckLabel}>Employee login enabled</Text>
              </TouchableOpacity>

              <View style={styles.otpHint}>
                <Ionicons name="information-circle-outline" size={13} color="#087A0A" />
                <Text style={styles.otpHintText}>
                  Employee can sign in with email or mobile + password, or with mobile + OTP (default
                  OTP: 123456).
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
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deleteTitle}>Delete Employee</Text>
                  <Text style={styles.deleteSub}>
                    This action cannot be undone. All employee data will be permanently deleted.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#DC2626" />
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          {/* Sticky footer */}
          <View style={styles.footerBar}>
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
                  <Ionicons name={isEdit ? 'save-outline' : 'checkmark-circle'} size={16} color="#FFFFFF" />
                  <Text style={styles.footerCreateText}>
                    {isEdit ? 'Save Changes' : 'Create Employee'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
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
  const monthLabel = now.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
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
      <ScrollView contentContainerStyle={styles.viewContent}>
        {/* Hero header */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatarWrap}>
            {employee.photoUrl ? (
              <Image source={{ uri: employee.photoUrl }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
                <Ionicons name="person" size={40} color="#7ED957" />
              </View>
            )}
            <View style={[styles.heroAvatarDot, active ? styles.dotOn : styles.dotOff]} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>{employee.name}</Text>
            <View style={styles.heroRolePill}>
              <Ionicons name="construct-outline" size={13} color="#087A0A" />
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
              <Ionicons name="partly-sunny" size={22} color="#087A0A" />
            </View>
            <View style={styles.viewCheckTextWrap}>
              <Text style={styles.viewCheckLabel}>CHECK IN</Text>
              <Text style={[styles.viewCheckTime, { color: '#087A0A' }]}>
                {formatTime(employee.defaultCheckIn) || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.viewCheckCard}>
            <View style={[styles.viewCheckIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="partly-sunny" size={22} color="#F59E0B" />
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
                <Ionicons name={c.icon} size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.catLabel}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* This Month */}
        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Ionicons name="calendar-outline" size={13} color="#087A0A" />
              <Text style={styles.monthPillText}>{monthLabel}</Text>
              <Ionicons name="chevron-down" size={12} color="#087A0A" />
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${presentPct * 100}%` }]} />
          </View>
          <View style={styles.progressLegend}>
            <Text style={styles.progressLegendOn}>{presentDays} Present</Text>
            <Text style={styles.progressLegendOff}>{presentDays}/{daysInMonth}</Text>
          </View>

          <View style={styles.statTilesRow}>
            <View style={[styles.statTile, { backgroundColor: '#F0F8EF' }]}>
              <Ionicons name="calendar-outline" size={16} color="#087A0A" />
              <Text style={styles.statTileValue}>{presentDays}</Text>
              <Text style={styles.statTileLabel}>Present</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="briefcase-outline" size={16} color="#F59E0B" />
              <Text style={styles.statTileValue}>{String(attendanceSummary?.leaveDays ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Leave</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#F0F8EF' }]}>
              <Ionicons name="calendar-outline" size={16} color="#16BB05" />
              <Text style={styles.statTileValue}>{String(attendanceSummary?.permissionCount ?? 0).padStart(2, '0')}</Text>
              <Text style={styles.statTileLabel}>Permission</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#F0F8EF' }]}>
              <Ionicons name="time-outline" size={16} color="#16BB05" />
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
              <Ionicons name="wallet-outline" size={20} color="#087A0A" />
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
              <Ionicons name="file-tray-outline" size={20} color="#087A0A" />
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#172117', marginBottom: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addLinkText: { fontSize: 14, color: '#16BB05', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  label: { fontSize: 12, fontWeight: '600', color: '#172117', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#172117',
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5CB',
  },
  roleChipActive: { backgroundColor: '#087A0A', borderColor: '#087A0A' },
  roleChipText: { fontSize: 12, color: '#667066' },
  roleChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  saveBtn: {
    marginTop: 20,
    backgroundColor: '#087A0A',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '700', color: '#172117' },
  meta: { fontSize: 13, color: '#667066', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EFF5EE', gap: 12 },
  linkText: { fontSize: 15, color: '#172117', flex: 1 },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center' },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E2E8E2', marginBottom: 8 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#172117' },
  profileId: { fontSize: 12, color: '#667066', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8FA08F' },
  statusDotActive: { backgroundColor: '#087A0A' },
  statusBadgeText: { fontSize: 13, color: '#667066' },
  statusBadgeTextActive: { color: '#16BB05', fontWeight: '600' },
  checkInOutRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  checkCard: { flex: 1, backgroundColor: '#F7FAF7', borderRadius: 12, padding: 12, alignItems: 'center' },
  checkLabel: { fontSize: 11, color: '#667066', marginTop: 4 },
  checkTime: { fontSize: 16, fontWeight: '700', color: '#16BB05' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  miniStat: { flex: 1, backgroundColor: '#EFF5EE', borderRadius: 10, padding: 10, alignItems: 'center' },
  miniStatValue: { fontSize: 16, fontWeight: '700', color: '#172117' },
  miniStatLabel: { fontSize: 11, color: '#667066', marginTop: 2 },
  recentCard: { marginTop: 8 },
  recentMeta: { fontSize: 13, color: '#172117', marginTop: 4 },
  tagRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#FEE2E2' },
  tagPaid: { backgroundColor: '#E6F7E3' },
  tagRejected: { backgroundColor: '#FEE2E2' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#172117' },
  photoPlaceholder: { alignItems: 'center', paddingVertical: 12, backgroundColor: '#F7FAF7', borderRadius: 12, marginBottom: 8 },
  takePhotoBtn: { marginTop: 8, backgroundColor: '#087A0A', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  takePhotoText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  error: { fontSize: 14, color: '#DC2626' },

  // Compact add-mode styles
  addContent: { padding: 12, paddingBottom: 110 },
  addCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  addSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  secIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E6F7E3', alignItems: 'center', justifyContent: 'center' },
  addSectionTitle: { fontSize: 15, fontWeight: '800', color: '#172117' },
  fieldRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  fieldCol: { flex: 1 },
  addLabel: { fontSize: 12, fontWeight: '600', color: '#172117', marginTop: 10, marginBottom: 5 },
  req: { color: '#DC2626' },
  addInput: {
    borderWidth: 1.5,
    borderColor: '#E2E8E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#172117',
    backgroundColor: '#FFFFFF',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  addInputRowText: { flex: 1, fontSize: 14, color: '#172117' },
  addInputInline: { flex: 1, fontSize: 14, color: '#172117', padding: 0 },
  addInputRowOpen: {
    borderColor: '#172117',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  roleDropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#172117',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  roleOptionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#EFF5EE',
  },
  roleOptionSelected: { backgroundColor: '#F0F8EF' },
  roleOptionText: { fontSize: 14, color: '#172117' },
  roleOptionTextSelected: { color: '#087A0A', fontWeight: '700' },

  addTwoCol: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  addColMain: { flex: 1 },
  addColPhoto: { width: 108 },
  photoBox: {
    backgroundColor: '#EFF5EE',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    gap: 6,
  },
  photoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E2E8E2' },
  photoUploadingOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 30,
    marginHorizontal: 24,
  },
  takePhotoBtnSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#087A0A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  takePhotoTextSm: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  addRow: { flexDirection: 'row', gap: 10 },
  addRowItem: { flex: 1 },

  idDocBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EFF5EE',
  },
  idDocLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#172117',
    marginBottom: 4,
  },
  idUploadRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  idUploadTile: {
    flex: 1,
    height: 84,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#7ED957',
    borderStyle: 'dashed',
    backgroundColor: '#F0F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  idUploadText: { fontSize: 12, color: '#087A0A', fontWeight: '700' },
  idUploadSub: { fontSize: 10, color: '#8FA08F', fontWeight: '500' },
  idUploadPreview: { ...StyleSheet.absoluteFillObject, borderRadius: 8 },
  idUploadBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
  },
  idUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
  },
  idUploadingText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  idUploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F8EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
  },
  idUploadedText: { flex: 1, fontSize: 11, color: '#087A0A', fontWeight: '600' },

  otpHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F0F8EF',
    borderRadius: 8,
    padding: 8,
    marginTop: 12,
  },
  otpHintText: { flex: 1, fontSize: 11, color: '#087A0A', lineHeight: 15 },

  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  salaryLabel: { fontSize: 12, color: '#172117', fontWeight: '500', flexShrink: 0 },
  salaryInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8E2',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    minWidth: 0,
  },
  salaryCurrency: { fontSize: 13, color: '#667066', marginRight: 4 },
  salaryInput: { flex: 1, fontSize: 13, color: '#172117', padding: 0, minWidth: 0 },

  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8E2',
  },
  footerCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#087A0A',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerCancelText: { fontSize: 14, fontWeight: '800', color: '#087A0A' },
  footerCreate: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#087A0A',
  },
  footerCreateText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // ===== Edit-mode design additions =====
  editHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  editHeroAvatarWrap: { position: 'relative', marginRight: 16 },
  editHeroAvatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E2E8E2' },
  editHeroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  editHeroCam: {
    position: 'absolute', right: 2, bottom: 2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#087A0A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  editHeroInfo: { flex: 1 },
  editHeroName: { fontSize: 20, fontWeight: '800', color: '#172117' },
  editHeroPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: '#E6F7E3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  editHeroDot: { width: 7, height: 7, borderRadius: 4 },
  editHeroPillText: { fontSize: 12, fontWeight: '700' },
  editHeroId: { fontSize: 12, color: '#8FA08F', marginTop: 8 },

  checkCardEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  checkCardLabel: { fontSize: 11, color: '#667066', fontWeight: '600' },
  checkCardInput: { fontSize: 16, fontWeight: '800', padding: 0, marginTop: 1 },

  loginCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  loginCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#CBD5CB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  loginCheckboxOn: { backgroundColor: '#087A0A', borderColor: '#087A0A' },
  loginCheckLabel: { fontSize: 13.5, color: '#172117', fontWeight: '600' },

  deleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  deleteIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontSize: 14, fontWeight: '800', color: '#DC2626' },
  deleteSub: { fontSize: 11.5, color: '#8FA08F', marginTop: 2, lineHeight: 15 },

  // ===== View-mode (mockup-matching) =====
  viewContent: { padding: 12, paddingBottom: 24 },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  heroStatus: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroStatusDot: { width: 8, height: 8, borderRadius: 4 },
  heroStatusValue: { fontSize: 12.5, fontWeight: '800' },
  statusOk: { color: '#087A0A' },
  statusOff: { color: '#8FA08F' },
  dotOn: { backgroundColor: '#16BB05' },
  dotOff: { backgroundColor: '#8FA08F' },
  heroAvatarWrap: { position: 'relative', marginRight: 14 },
  heroAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#E6F7E3' },
  heroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  heroAvatarDot: { position: 'absolute', right: 3, bottom: 3, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#172117' },
  heroRolePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: '#E6F7E3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  heroRolePillText: { fontSize: 12.5, fontWeight: '700', color: '#087A0A' },
  heroId: { fontSize: 12, color: '#8FA08F', marginTop: 8, letterSpacing: 0.4 },

  viewCheckRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  viewCheckCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  viewCheckIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  viewCheckTextWrap: { flex: 1 },
  viewCheckLabel: { fontSize: 10.5, color: '#8FA08F', fontWeight: '700', letterSpacing: 0.5 },
  viewCheckTime: { fontSize: 18, fontWeight: '800', marginTop: 2 },

  viewSectionHeader: { fontSize: 14, fontWeight: '800', color: '#172117', marginTop: 16, marginBottom: 10 },

  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    rowGap: 12,
  },
  catItem: {
    width: '22%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 2,
    alignItems: 'center',
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  catIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#087A0A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  catLabel: { fontSize: 11, fontWeight: '700', color: '#172117', textAlign: 'center', lineHeight: 14 },

  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthTitle: { fontSize: 14, fontWeight: '700', color: '#172117' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F7E3',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  monthPillText: { fontSize: 12, fontWeight: '800', color: '#087A0A' },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8E2',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#087A0A' },
  progressLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressLegendOn: { fontSize: 12, color: '#087A0A', fontWeight: '700' },
  progressLegendOff: { fontSize: 12, color: '#667066', fontWeight: '600' },

  statTilesRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statTile: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'flex-start',
  },
  statTileValue: { fontSize: 16, fontWeight: '800', color: '#172117', marginTop: 4 },
  statTileLabel: { fontSize: 10, color: '#667066', fontWeight: '600', marginTop: 1 },

  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentAddLink: { fontSize: 13, color: '#087A0A', fontWeight: '800', marginTop: 16 },

  recentItemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  recentAccent: { width: 3, backgroundColor: '#16BB05' },
  recentInner: { flex: 1, padding: 10 },
  recentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentDate: { fontSize: 12, fontWeight: '700', color: '#172117' },
  statusPillRow: { flexDirection: 'row', gap: 6 },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillOn: { backgroundColor: '#087A0A' },
  statusPillOnRed: { backgroundColor: '#DC2626' },
  statusPillDimGreen: { backgroundColor: '#E6F7E3' },
  statusPillDimRed: { backgroundColor: '#FEE2E2' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusPillTextOn: { color: '#FFFFFF' },
  statusPillTextDim: { color: '#8FA08F' },

  recentBottomRow: { flexDirection: 'row', marginTop: 10, gap: 10 },
  recentBottomCol: { flex: 1 },
  recentBigValue: { fontSize: 12, fontWeight: '700', color: '#172117' },
  recentSubLabel: { fontSize: 10, color: '#8FA08F', marginTop: 2 },

  emptyText: { fontSize: 12, color: '#667066', textAlign: 'center', paddingVertical: 16 },

  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginTop: 4,
    gap: 12,
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  emptyIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F8EF', alignItems: 'center', justifyContent: 'center' },
  emptyTextWrap: { flex: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#172117' },
  emptySub: { fontSize: 12, color: '#8FA08F', marginTop: 2, textAlign: 'center' },

  viewFooterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    gap: 14,
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  footerGridRow: { flexDirection: 'row', gap: 12 },
  footerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0F8EF', alignItems: 'center', justifyContent: 'center' },
  footerItemLabel: { fontSize: 11, color: '#8FA08F', fontWeight: '600' },
  footerItemValue: { fontSize: 13.5, color: '#172117', fontWeight: '700', marginTop: 1 },
});
