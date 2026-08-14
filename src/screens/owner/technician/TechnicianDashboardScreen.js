import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import {
  ClipboardList, Hammer, CheckCircle2, Clock, ChevronRight, Wrench, CalendarDays,
} from 'lucide-react-native';
import {
  AppHeader, Card, SectionTitle, StatusChip, BookingCard, EmptyState, Loader, ErrorState,
  ScreenContainer, Button, Skeleton,
} from '../../../components/rnr';
import { tokens } from '../../../theme/colors';
import { ticketApi } from '../../../api/client';

function StatTile({ icon: Icon, label, value, tone = 'primary' }) {
  const tones = {
    primary: { bg: 'bg-primary-soft', fg: tokens.primary },
    accent: { bg: 'bg-attention-soft', fg: tokens.attention },
    success: { bg: 'bg-primary-soft', fg: tokens.primary },
    warning: { bg: 'bg-warning/10', fg: tokens.warning },
  }[tone] || { bg: 'bg-surface-muted', fg: tokens.text };
  return (
    <View className="flex-1 mx-1">
      <Card className="items-start">
        <View className={`h-10 w-10 rounded-2xl items-center justify-center mb-2 ${tones.bg}`}>
          <Icon size={18} color={tones.fg} />
        </View>
        <Text className="text-[20px] font-extrabold text-text">{value}</Text>
        <Text className="text-[11px] text-text-muted mt-0.5">{label}</Text>
      </Card>
    </View>
  );
}

export default function TechnicianDashboardScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get('/technicians/me/tickets');
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load tickets');
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Classify by explicit status sets, not substring matching — the old
  // includes('COMPLETE') both missed active statuses like IN_REPAIR (counted as
  // neither Open nor Done) and miscounted REPAIR_NOT_COMPLETED as Done.
  const DONE_STATUSES = new Set([
    'REPAIR_COMPLETED', 'COMPLETED', 'READY', 'INVOICE_GENERATED',
    'DELIVERED_PROCESSING', 'DELIVERED',
  ]);
  const CLOSED_STATUSES = new Set(['CANCELLED', 'RETURNED']);
  const statusOf = (t) => String(t.status || '').toUpperCase();
  const completed = list.filter((t) => DONE_STATUSES.has(statusOf(t)));
  // Open = anything still needing the technician's attention. Fails safe toward
  // "visible": an unrecognised status shows as Open rather than disappearing.
  const open = list.filter((t) => {
    const s = statusOf(t);
    return !DONE_STATUSES.has(s) && !CLOSED_STATUSES.has(s);
  });
  const today = list.filter((t) => {
    if (!t.scheduledAt && !t.createdAt) return false;
    const d = new Date(t.scheduledAt || t.createdAt);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <ScreenContainer>
      <AppHeader title="My Work" subtitle="Today's tickets at a glance" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={tokens.primary} />}
      >
        <View className="flex-row px-3 pt-4 -mx-1">
          {loading ? (
            <>
              <View className="flex-1 mx-1"><Skeleton height={96} rounded={18} /></View>
              <View className="flex-1 mx-1"><Skeleton height={96} rounded={18} /></View>
              <View className="flex-1 mx-1"><Skeleton height={96} rounded={18} /></View>
            </>
          ) : (
            <>
              <StatTile icon={ClipboardList} label="Open" value={open.length} tone="primary" />
              <StatTile icon={Hammer} label="Today" value={today.length} tone="accent" />
              <StatTile icon={CheckCircle2} label="Done" value={completed.length} tone="success" />
            </>
          )}
        </View>

        <SectionTitle title="Assigned Tickets" action="See All" onAction={() => navigation.navigate('AssignedTickets')} />

        {loading ? (
          <View className="px-4">
            <Skeleton height={104} rounded={18} />
            <View className="h-3" />
            <Skeleton height={104} rounded={18} />
          </View>
        ) : error ? (
          <ErrorState description={error} onRetry={() => load()} />
        ) : open.length === 0 ? (
          <EmptyState
            icon={<Wrench size={36} color={tokens.primary} />}
            title="All caught up"
            description="No tickets currently assigned to you. Pull to refresh."
          />
        ) : (
          <View className="px-4 mt-1">
            {open.slice(0, 5).map((t) => (
              <View key={t.id} className="mb-3">
                <BookingCard
                  device={t.deviceLabel || t.modelName || 'Repair Ticket'}
                  brand={t.brandName}
                  bookingId={t.ticketNumber || t.id?.slice?.(0, 8)}
                  status={t.status}
                  scheduledAt={t.scheduledAt ? new Date(t.scheduledAt).toLocaleString() : null}
                  amount={t.estimatedPrice}
                  amountCaption="Estimate"
                  rightLabel="Start"
                  onPress={() => navigation.navigate('TechnicianTicketDetail', { ticketId: t.id })}
                  onRightPress={() => navigation.navigate('UpdateStatus', { ticketId: t.id })}
                />
              </View>
            ))}
          </View>
        )}

        <View className="px-4 mt-2 flex-row">
          <View className="flex-1 mr-2">
            <Button variant="soft" leftIcon={<CalendarDays size={16} color={tokens.primary} />} onPress={() => navigation.navigate('TechnicianApplyLeave')}>
              Apply Leave
            </Button>
          </View>
          <View className="flex-1 ml-2">
            <Button variant="outline" leftIcon={<Clock size={16} color={tokens.primary} />} onPress={() => navigation.navigate('AssignedTickets')}>
              View History
            </Button>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
