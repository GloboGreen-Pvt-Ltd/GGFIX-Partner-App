import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CalendarDays, User, MessageSquare, Info, ChevronRight } from 'lucide-react-native';
import {
  Card, Input, FormField, BottomActionBar, ScreenContainer,
  EmptyState, useBottomBarInset,
} from '../../components/rnr';
import { tokens } from '../../theme/colors';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function OwnerEmployeeApplyLeaveScreen({ route, navigation }) {
  const employee = route.params?.employee;
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const insetBottom = useBottomBarInset();

  const validate = () => {
    if (!startDate.trim() || !endDate.trim()) {
      notify('Required', 'Enter start and end date (YYYY-MM-DD)');
      return false;
    }
    if (!DATE_RE.test(startDate.trim()) || !DATE_RE.test(endDate.trim())) {
      notify('Invalid format', 'Dates must be in YYYY-MM-DD format');
      return false;
    }
    if (new Date(endDate) < new Date(startDate)) {
      notify('Invalid range', 'End date must be on or after start date');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !employee?.id) return;
    setSaving(true);
    try {
      await ticketApi.post(`/technicians/${employee.id}/leaves`, {
        body: { startDate: startDate.trim(), endDate: endDate.trim(), reason: reason.trim() || undefined },
      });
      notify('Submitted', 'Leave request submitted', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Error', e.message || 'Failed to submit leave', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!employee) {
    return (
      <ScreenContainer>
        <EmptyState title="Employee not found" description="Open this from the employee list." />
      </ScreenContainer>
    );
  }

  const canSubmit = !!startDate.trim() && !!endDate.trim() && !saving;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insetBottom + 110 }}>
        <Card>
          <View className="flex-row items-center">
            <View className="h-12 w-12 rounded-full bg-primary-soft items-center justify-center mr-3">
              <User size={22} color={tokens.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-[11px] uppercase tracking-widest font-bold" style={{ color: tokens.primary }}>
                Employee
              </Text>
              <Text className="text-[16px] font-extrabold text-text mt-0.5" numberOfLines={1}>
                {employee.name || employee.fullName || 'Employee'}
              </Text>
              {employee.role || employee.roleLabel ? (
                <Text className="text-[12px] text-text-muted mt-0.5">
                  {employee.role || employee.roleLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        <View className="h-4" />
        <FormField label="Start date">
          <Input
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-02-01"
            leftIcon={<CalendarDays size={18} color={tokens.primary} />}
            rightIcon={<CalendarDays size={18} color={tokens.primary} />}
            autoCapitalize="none"
          />
        </FormField>
        <FormField label="End date">
          <Input
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2026-02-03"
            leftIcon={<CalendarDays size={18} color={tokens.primary} />}
            rightIcon={<CalendarDays size={18} color={tokens.primary} />}
            autoCapitalize="none"
          />
        </FormField>
        <FormField label="Reason (optional)">
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Personal work"
            multiline
            numberOfLines={4}
            maxLength={250}
            leftIcon={<MessageSquare size={18} color={tokens.primary} />}
            style={{ minHeight: 110, textAlignVertical: 'top' }}
          />
          <Text className="text-[11px] text-text-muted text-right mt-1">{reason.length} / 250</Text>
        </FormField>

        {/* Note */}
        <View
          className="flex-row items-start mt-4 rounded-2xl p-3.5"
          style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#E6F7E3' }}
        >
          <Info size={18} color={tokens.primary} style={{ marginTop: 1 }} />
          <View className="flex-1 ml-2.5">
            <Text className="text-[13.5px] font-extrabold" style={{ color: '#087A0A' }}>Note</Text>
            <Text className="text-[12.5px] text-text-muted mt-0.5 leading-4">
              Leave request will be sent to your manager for approval.
            </Text>
          </View>
        </View>
      </ScrollView>

      <BottomActionBar insetBottom={insetBottom}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.9}
          className="flex-row items-center justify-center rounded-2xl py-4"
          style={{ backgroundColor: canSubmit ? '#087A0A' : '#8FA08F' }}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text className="text-white text-[15px] font-extrabold">Submit Leave Request</Text>
              <ChevronRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </>
          )}
        </TouchableOpacity>
      </BottomActionBar>
    </ScreenContainer>
  );
}
