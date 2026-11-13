import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check, CheckCheck, Clock, Inbox, LayoutList, Smartphone, UserPlus, X } from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { confirm, notify } from '../../components/confirm';
import { useFocusPolling } from '../../lib/hooks/useFocusPolling';
import { acceptOwnerJob, getOwnerTech, listOwnerJobs, ownerJobBucket } from '../../api/ownerTechnician';
import { ticketStatusLabel } from './AllBooking/TicketDetailScreen';

// Same look as the Employee App "My Jobs": left filter rail + picture cards
// (corner status tab · photo | ref · model · customer · issue · date/time),
// Reject / Accept on assigned cards.
const TEAL = '#035C6C';
const GREEN = '#16A34A';
const RED = '#DC2626';
const INK = '#111111';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';

const RAIL = [
  { key: 'assigned', label: 'Assigned', Icon: UserPlus, color: '#2563EB' },
  { key: 'all', label: 'All Jobs', Icon: LayoutList, color: TEAL },
  { key: 'pending', label: 'Pending', Icon: Clock, color: '#D97706' },
  { key: 'completed', label: 'Completed', Icon: CheckCheck, color: GREEN },
];
const BUCKET_COLOR = { assigned: '#2563EB', pending: '#D97706', completed: GREEN };

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

function RailTile({ item, count, active, onPress }) {
  const { Icon, color } = item;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        alignItems: 'center', borderRadius: 14, paddingTop: 11, paddingBottom: 9, paddingHorizontal: 3,
        backgroundColor: active ? color : '#FFFFFF', borderWidth: 1, borderColor: active ? color : LINE,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2,
      }}
    >
      <View style={{ width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? 'rgba(255,255,255,0.22)' : `${color}1A` }}>
        <Icon size={17} color={active ? '#FFFFFF' : color} strokeWidth={2.2} />
        <View style={{ position: 'absolute', top: -5, right: -11, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: color, backgroundColor: '#FFFFFF' }}>
          <Text style={{ fontSize: 9.5, fontWeight: '800', color }}>{count > 99 ? '99+' : count}</Text>
        </View>
      </View>
      <Text style={{ marginTop: 5, fontSize: 10.5, fontWeight: '700', color: active ? '#FFFFFF' : INK }} numberOfLines={1}>{item.label}</Text>
    </Pressable>
  );
}

function JobCard({ job, busy, onPress, onAccept, onReject, onContinue, onHistory }) {
  const bucket = ownerJobBucket(job);
  const color = BUCKET_COLOR[bucket];
  const device = job.deviceDisplayName || job.deviceModelName || job.modelName || 'Device';
  const issue = String(job.issueDescription || '').replace(/^\s*IMEI not provided:.*$/gim, '').trim();
  const when = job.updatedAt || job.createdAt;
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      style={{
        flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: LINE, marginBottom: 12,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
      }}
    >
      {/* Photo column with the status tab hugging the top-left corner. */}
      <View style={{ width: '36%', maxWidth: 124, paddingBottom: 8 }}>
        <View style={{ alignSelf: 'flex-start', maxWidth: '96%', paddingVertical: 3, paddingHorizontal: 8, borderTopLeftRadius: 15, borderBottomRightRadius: 11, backgroundColor: color }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>{ticketStatusLabel(job.status) || job.status}</Text>
        </View>
        <View style={{ flex: 1, minHeight: 76, marginTop: 5, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
          {job.deviceImageUrl
            ? <Image source={{ uri: job.deviceImageUrl }} style={{ alignSelf: 'stretch', flex: 1 }} resizeMode="contain" />
            : <Smartphone size={32} color={TEAL} />}
        </View>
      </View>
      <View style={{ width: 1, backgroundColor: LINE }} />
      <View style={{ flex: 1, minWidth: 0, paddingTop: 10, paddingBottom: 9, paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: TEAL }} numberOfLines={1}>#{job.trackingId || String(job.id).slice(0, 8).toUpperCase()}</Text>
        <Text style={{ marginTop: 2, fontSize: 13.5, fontWeight: '800', color: INK }} numberOfLines={2}>{device}</Text>
        {job.customerName ? <Text style={{ marginTop: 2, fontSize: 12, color: MUTED }} numberOfLines={1}>{job.customerName}</Text> : null}
        {issue ? <Text style={{ marginTop: 2, fontSize: 12, color: MUTED }} numberOfLines={1}>{issue}</Text> : null}
        {when ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ fontSize: 11, color: MUTED }}>{fmtDate(when)}</Text>
            <Text style={{ fontSize: 11, color: MUTED }}>{fmtTime(when)}</Text>
          </View>
        ) : null}

        {bucket === 'assigned' ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <Pressable onPress={onReject} disabled={busy} accessibilityRole="button" accessibilityLabel="Reject job"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F9C9C7', borderRadius: 10, paddingVertical: 5 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' }}><X size={10} color="#FFFFFF" strokeWidth={3} /></View>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: RED }}>Reject</Text>
            </Pressable>
            <Pressable onPress={onAccept} disabled={busy} accessibilityRole="button" accessibilityLabel="Accept job"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 5 }}>
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                <>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><Check size={10} color={GREEN} strokeWidth={3} /></View>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' }}>Accept</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={bucket === 'pending' ? onContinue : onHistory} accessibilityRole="button"
            style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 4, borderWidth: 1.5, borderColor: TEAL, borderRadius: 999, backgroundColor: bucket === 'pending' ? TEAL : '#FFFFFF' }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: bucket === 'pending' ? '#FFFFFF' : TEAL }}>{bucket === 'pending' ? 'Continue Repair' : 'View History'}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Owner as Technician → the owner's OWN repair jobs (GET /tickets?assignedToMe).
 * Accept = POST /tickets/{id}/accept. Reject = hand the job back unassigned
 * (it is NOT cancelled) so it can go to another technician.
 */
export default function MyRepairJobsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState(route?.params?.filter || 'assigned');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actingOn, setActingOn] = useState(null);
  const actingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setJobs(await listOwnerJobs());
      setError(null);
      getOwnerTech().catch(() => {}); // keeps the Home counts in step
    } catch (e) {
      setError(e?.message || 'Could not load your jobs.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusPolling(load, 20000);
  const onRefresh = async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } };

  const counts = useMemo(() => {
    const c = { all: jobs.length, assigned: 0, pending: 0, completed: 0 };
    jobs.forEach((j) => { c[ownerJobBucket(j)] += 1; });
    return c;
  }, [jobs]);
  const rows = useMemo(() => (filter === 'all' ? jobs : jobs.filter((j) => ownerJobBucket(j) === filter)), [jobs, filter]);

  const run = async (job, fn, okTitle) => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActingOn(job.id);
    try {
      await fn();
      notify(okTitle, `#${job.trackingId || ''}`, { preset: 'done' });
    } catch (e) {
      notify('Something went wrong', e?.message || 'Try again.', { preset: 'error' });
    } finally {
      actingRef.current = false;
      setActingOn(null);
      load();
    }
  };

  const accept = async (job) => {
    const ok = await confirm({ title: 'Accept job?', message: 'You will start working on this repair.', confirmText: 'Accept' });
    if (ok) run(job, () => acceptOwnerJob(job.id), 'Job accepted');
  };
  const reject = async (job) => {
    const ok = await confirm({
      title: 'Reject job?',
      message: 'The job goes back to Unassigned so you can give it to another technician. It is not cancelled.',
      confirmText: 'Reject',
      destructive: true,
    });
    if (ok) {
      run(job, () => ticketApi.patch(`/tickets/${job.id}`, {
        body: { assignedTechnicianId: null, expectedTechnicianId: job.assignedTechnicianId || null },
      }), 'Job rejected');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={{ paddingTop: insets.top + 7, paddingBottom: 10, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back"
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={18} color={INK} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>My Repair Jobs</Text>
          <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Assigned & Working Jobs</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <ScrollView style={{ width: 78, flexGrow: 0, borderRightWidth: 1, borderRightColor: LINE }} contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 12, paddingBottom: 20, gap: 10 }} showsVerticalScrollIndicator={false}>
          {RAIL.map((it) => (
            <RailTile key={it.key} item={it} count={counts[it.key]} active={filter === it.key} onPress={() => setFilter(it.key)} />
          ))}
        </ScrollView>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 10, paddingLeft: 11, paddingRight: 9, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TEAL]} tintColor={TEAL} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={{ alignItems: 'center', paddingTop: 32 }}>
              <ActivityIndicator color={TEAL} />
              <Text style={{ marginTop: 6, fontSize: 12, color: MUTED }}>Loading your jobs…</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 6 }}>
              <Inbox size={20} color="#9CA3AF" />
              <Text style={{ fontSize: 12, color: error ? RED : MUTED, textAlign: 'center' }}>
                {error || (filter === 'all' ? 'No jobs yet. Use "Assign to Myself" in Booking Details.' : `No ${RAIL.find((r) => r.key === filter).label.toLowerCase()} jobs.`)}
              </Text>
            </View>
          ) : rows.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              busy={actingOn === j.id}
              onPress={() => navigation.navigate(ownerJobBucket(j) === 'completed' ? 'TicketDetail' : 'OwnerJobDetails', { ticketId: j.id })}
              onAccept={() => accept(j)}
              onReject={() => reject(j)}
              onContinue={() => navigation.navigate('OwnerJobDetails', { ticketId: j.id })}
              onHistory={() => navigation.navigate('BookingTimeline', { ticketId: j.id })}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
