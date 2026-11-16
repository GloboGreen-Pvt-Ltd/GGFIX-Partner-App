import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput, RefreshControl, ScrollView, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check, CheckCheck, Clock, Inbox, LayoutList, Smartphone, UserPlus, X } from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { confirm, notify } from '../../components/confirm';
import { useFocusPolling } from '../../lib/hooks/useFocusPolling';
import { acceptOwnerJob, getOwnerTech, listOwnerJobs, ownerJobBucket } from '../../api/ownerTechnician';
import { ticketStatusLabel } from './AllBooking/TicketDetailScreen';
import { JobHeader, JobPictureCard } from '../../staffkit/components/JobCardKit';
import { railSizes } from '../../components/report/ReportRail';

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
  { key: 'assigned', label: 'Assigned', icon: UserPlus, tone: '#0788C9' },
  { key: 'all', label: 'All Jobs', icon: LayoutList, tone: TEAL },
  { key: 'pending', label: 'Pending', icon: Clock, tone: '#FAA700' },
  { key: 'completed', label: 'Completed', icon: CheckCheck, tone: '#609138' },
];
const BUCKET_COLOR = { assigned: '#2563EB', pending: '#D97706', completed: GREEN };

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

// Employee App My Jobs card (JobPictureCard): corner status tab, photo,
// ref · model · customer · issue · date | time, status line or Accept / Reject.
function JobCard({ job, busy, onPress, onAccept, onReject }) {
  const bucket = ownerJobBucket(job);
  const color = BUCKET_COLOR[bucket];
  const status = ticketStatusLabel(job.status) || job.status;
  const issue = String(job.issueDescription || '').replace(/^s*IMEI not provided:.*$/gim, '').trim();
  const when = job.updatedAt || job.createdAt;
  return (
    <JobPictureCard
      ticket={job}
      tab={status}
      tabColor={TEAL}
      refText={`#${job.trackingId || String(job.id).slice(0, 8).toUpperCase()}`}
      model={job.deviceDisplayName || job.deviceModelName || job.modelName || 'Device'}
      lines={[{ text: job.customerName }, { text: issue }]}
      date={when ? fmtDate(when) : null}
      time={when ? fmtTime(when) : null}
      statusLine={bucket === 'assigned' ? null : status}
      statusColor={TEAL}
      footer={bucket === 'assigned' ? (
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
      ) : null}
      onPress={onPress}
    />
  );
}

/**
 * Owner as Technician → the owner's OWN repair jobs (GET /tickets?assignedToMe).
 * Accept = POST /tickets/{id}/accept. Reject = hand the job back unassigned
 * (it is NOT cancelled) so it can go to another technician.
 */
export default function MyRepairJobsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  // Rail width + tile sizes: same as the Jobs screen.
  const { width: winW } = useWindowDimensions();
  const railW = winW >= 680 ? 104 : (winW < 360 ? 70 : 78);
  const rz = railSizes(winW);
  const [filter, setFilter] = useState(route?.params?.filter || 'assigned');
  // popTo('MyRepairJobs', { filter }) from Job Details updates params on the existing screen.
  useEffect(() => { if (route?.params?.filter) setFilter(route.params.filter); }, [route?.params?.filter, route?.params?.refreshAt]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actingOn, setActingOn] = useState(null);
  const [searchOn, setSearchOn] = useState(false);
  const [query, setQuery] = useState('');
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
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (filter === 'all' ? jobs : jobs.filter((j) => ownerJobBucket(j) === filter)).filter((j) => !q
      || [j.trackingId, j.deviceDisplayName, j.deviceModelName, j.modelName, j.customerName, j.customerPhone, j.issueDescription]
        .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [jobs, filter, query]);

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
      <View style={{ paddingTop: insets.top }}>
        <JobHeader navigation={navigation} title="My Repair Jobs" sub="Assigned & Working Jobs"
          searchOn={searchOn} onSearch={() => { setSearchOn((v) => !v); setQuery(''); }}
          onScan={() => navigation.navigate('ScanQrCode')} />
      </View>
      {searchOn ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: LINE }}>
          <TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Search ref, device, customer, issue"
            placeholderTextColor="#9CA3AF"
            style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12, fontSize: 13.5, color: INK, backgroundColor: '#F9FAFB' }} />
        </View>
      ) : null}

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Employee App My Jobs rail (same JobRail component). */}
        {/* Same rail tiles as the Jobs screen. */}
        <ScrollView
          style={{ width: railW, flexGrow: 0, borderRightWidth: 1, borderRightColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}
          contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 5, paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
        >
          {RAIL.map((it) => {
            const Icon = it.icon;
            const active = filter === it.key;
            const disc = rz.disc;
            return (
              <Pressable
                key={it.key}
                onPress={() => setFilter(it.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${it.label}, ${counts[it.key] ?? 0}`}
                className="active:opacity-80"
                style={{ marginVertical: 4, borderRadius: 14, backgroundColor: '#FFFFFF' }}
              >
                <View style={{
                  alignItems: 'center', paddingVertical: 9, paddingHorizontal: 3, borderRadius: 14,
                  borderWidth: active ? 1.5 : 1, borderColor: active ? '#035C6C' : '#E5E7EB',
                }}>
                  <View>
                    <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: it.tone, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={rz.icon} color="#FFFFFF" strokeWidth={2.2} />
                    </View>
                    <View style={{ position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: it.tone, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: rz.badge, fontWeight: '800', color: it.tone }} numberOfLines={1}>{counts[it.key] ?? 0}</Text>
                    </View>
                  </View>
                  <Text
                    style={{ marginTop: 5, fontSize: rz.font, lineHeight: rz.line, fontWeight: active ? '800' : '700', color: '#111111', textAlign: 'center' }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {it.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
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
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
