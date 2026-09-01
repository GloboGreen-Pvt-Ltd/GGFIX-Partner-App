import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity,
  View, StatusBar, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BadgeCheck,
  ChevronLeft,
  History,
  Radio,
  ReceiptIndianRupee,
  RotateCw,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { ticketApi } from '../../../api/client';
import {
  ServiceHistoryTimeline,
  getCurrentPhaseLabel,
} from '../../common/serviceHistoryPhases';

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

const cardShadow = {
  borderWidth: 1,
  borderColor: '#E2E8E2',
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7626488).
function splitTrackingId(id) {
  const s = String(id ?? '').replace(/^#/, '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// Quality Check Completed is the one service step the shop can record itself —
// on a walk-in, or when the owner does the final check on the bench rather than
// the assigned technician. It is the same repair_booking_events row the
// technician's checklist writes (POST /tickets/{id}/progress-events), so
// whoever gets there first records it and the other side sees it as done. The
// row carries actor=OWNER, which is what distinguishes a deliberate shop tap
// from the actor=SHOP rows the backend auto-emits.
const QC_STATUS_KEY = 'QUALITY_CHECK_COMPLETED';

function fmtEventTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${date} · ${time}`;
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: '#E6F7E3' }}
      >
        <Icon size={14} color={BRAND_GREEN_DARK} />
      </View>
      <Text
        className="text-[11px] font-extrabold tracking-widest text-gray-900"
        style={{ letterSpacing: 1.2 }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function BookingTimelineScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, 760);
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [qcSaving, setQcSaving] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      // The invoice is fetched alongside rather than inferred from the
      // INVOICE_GENERATED event: the event says the step happened, the invoice
      // row is the document itself, and the card below needs its number and the
      // moment it was raised. 404 = none yet.
      const [t, ev, inv] = await Promise.all([
        ticketApi.get(`/tickets/${ticketId}`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/events`).catch(() => []),
        ticketApi.get(`/tickets/${ticketId}/invoice`).catch(() => null),
      ]);
      setTicket(t);
      setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
      setInvoice(inv || null);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load history');
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => { await load(); if (active) setLoading(false); })();
    timer.current = setInterval(load, 10000);
    return () => { active = false; if (timer.current) clearInterval(timer.current); };
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Mark the quality check done from the shop side. Idempotent on the backend
  // (emit-or-update keyed by status), so a double tap refreshes the row instead
  // of adding a second one — but confirm first, because this also advances the
  // ticket to Ready for Delivery via the master work-status mapping.
  const markQualityCheckCompleted = () => {
    Alert.alert(
      'Mark quality check completed?',
      'This records Quality Check Completed on the customer\'s Service History and moves the booking to Ready for Delivery.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark completed',
          onPress: async () => {
            setQcSaving(true);
            try {
              await ticketApi.post(`/tickets/${ticketId}/progress-events`, {
                body: { statusKey: QC_STATUS_KEY, actor: 'OWNER' },
              });
              await load();
            } catch (e) {
              Alert.alert('Could not save', e?.message || 'Please try again.');
            } finally {
              setQcSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <Loader label="Loading history..." />;

  const currentLabel = getCurrentPhaseLabel(events, ticket?.status);
  const tid = splitTrackingId(ticket?.trackingId || ticketId);
  const qcEvent = events.find((e) => (e.status || '').toUpperCase() === QC_STATUS_KEY) || null;
  const qcByOwner = (qcEvent?.actor || '').toUpperCase() === 'OWNER';

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* White header (slim — replaces native white header) */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
            Service History
          </Text>
          <View
            className="px-2.5 py-1 rounded-full"
            style={{ maxWidth: 180, backgroundColor: '#E6F7E3' }}
          >
            <Text className="text-[11px] font-extrabold" numberOfLines={1}>
              <Text style={{ color: '#172117' }}>#{tid.prefix}</Text>
              <Text style={{ color: BRAND_GREEN_DARK }}>{tid.digits}</Text>
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BRAND_GREEN_DARK}
            colors={[BRAND_GREEN_DARK]}
          />
        }
      >
        <View style={{ width: contentW, alignSelf: 'center' }}>
        {/* Current status card */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            <View className="flex-row items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: '#E6F7E3' }}
              >
                <Radio size={20} color={BRAND_GREEN_DARK} />
              </View>
              <View className="flex-1">
                <Text
                  className="text-[10.5px] uppercase font-bold text-gray-400"
                  style={{ letterSpacing: 0.7 }}
                >
                  Current Status
                </Text>
                <Text className="text-[15px] font-extrabold text-gray-900 mt-0.5">
                  {currentLabel || 'Booking Placed'}
                </Text>
              </View>
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: '#E6F7E3' }}
              >
                <Text
                  className="text-[13px] font-extrabold"
                  style={{ color: BRAND_GREEN_DARK }}
                >
                  {events.length}
                </Text>
              </View>
            </View>
            <View
              className="mt-3 pt-3 flex-row items-center"
              style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
            >
              <RotateCw size={11} color="#8FA08F" />
              <Text className="ml-1.5 text-[10.5px] text-gray-500">
                {events.length} event{events.length === 1 ? '' : 's'} • Updated live • Pull to refresh
              </Text>
            </View>
          </View>
        </View>

        {/* Quality check — the shop's own way to close this step. Either side
            can record it; the card reflects whichever happened, including a
            technician's tap, so the two apps never disagree. */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View className="bg-white rounded-2xl p-4" style={cardShadow}>
            <SectionHeader icon={BadgeCheck} label="QUALITY CHECK" />
            {qcEvent ? (
              <View className="flex-row items-center">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <BadgeCheck size={17} color={BRAND_GREEN_DARK} />
                </View>
                <View className="flex-1">
                  <Text className="text-[13.5px] font-extrabold text-gray-900">
                    Quality Check Completed
                  </Text>
                  <Text className="text-[11px] text-gray-500 mt-0.5">
                    {fmtEventTime(qcEvent.createdAt)}
                    {qcByOwner ? '  ·  Marked by shop' : '  ·  Marked by technician'}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Text className="text-[11.5px] text-gray-500 mb-3">
                  Not recorded yet. The assigned technician can mark this from their app —
                  or record it here if the shop did the check.
                </Text>
                <TouchableOpacity
                  onPress={markQualityCheckCompleted}
                  disabled={qcSaving}
                  activeOpacity={0.85}
                  className="rounded-2xl items-center justify-center py-3 flex-row"
                  style={{ backgroundColor: BRAND_GREEN_DARK, opacity: qcSaving ? 0.6 : 1 }}
                >
                  {qcSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <BadgeCheck size={16} color="#FFFFFF" />
                      <Text className="text-white text-[13px] font-extrabold ml-2">
                        Mark Quality Check Completed
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Invoice — the document behind the "Invoice Generated" step. Shown
            only once one exists, and it opens the saved invoice rather than the
            generator, so reading the history can't raise a second bill. */}
        {invoice ? (
          <View className="px-4" style={{ marginTop: 12 }}>
            <View className="bg-white rounded-2xl p-4" style={cardShadow}>
              <SectionHeader icon={ReceiptIndianRupee} label="INVOICE" />
              <View className="flex-row items-center">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#FEF3C7' }}
                >
                  <ReceiptIndianRupee size={17} color="#B45309" />
                </View>
                <View className="flex-1">
                  <Text className="text-[13.5px] font-extrabold text-gray-900" numberOfLines={1}>
                    Invoice #{String(invoice.invoiceNo || '').replace(/^#+/, '') || '—'}
                  </Text>
                  <Text className="text-[11px] text-gray-500 mt-0.5">
                    {fmtEventTime(invoice.generatedAt) || 'Generated'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('DeliveryInvoiceReport', { ticketId })}
                  activeOpacity={0.85}
                  className="rounded-xl px-3.5 py-2.5 ml-2"
                  style={{ backgroundColor: BRAND_GREEN_DARK }}
                >
                  <Text className="text-white text-[12px] font-extrabold">View</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {error ? (
          <View className="px-4 mt-4">
            <View
              className="rounded-2xl px-4 py-3"
              style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
            >
              <Text className="text-[12.5px] font-semibold" style={{ color: '#B91C1C' }}>
                {error}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Timeline */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={History} label="SERVICE TIMELINE" />
            <ServiceHistoryTimeline events={events} status={ticket?.status} phaseFilter="SERVICE" />
          </View>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}
