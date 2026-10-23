// Pickup History — the doorstep-pickup counterpart of BookingTimelineScreen.
//
// It exists because a pickup is a repair-booking, not a ticket: its stages come
// from order-service's booking events (/repair-bookings/shop/{id} → events[])
// and its verbs are pickup verbs, so BookingTimelineScreen's ticket-phase
// timeline can't render it. Reached here from the pickup card's action row.
//
// The Pickup Details screen used to carry this list at the bottom; it was
// pulled out so Details stays about the device + customer and the history has
// room to breathe (and to poll) on its own.
import React, { useCallback, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Clock, History, Radio, UserCheck } from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { getShopRepairBooking } from '../../../api/orders';

const BRAND_GREEN_DARK = '#035C6C';
const TEAL_MID = '#357D89';   // Home tool-tile teal — icon discs
const RAIL = '#D1E7EA';       // timeline connector

const cardShadow = {
  borderWidth: 1,
  borderColor: '#E5E7EB',
  shadowColor: '#111111',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Booking-event status → human label. Mirrors the wording ticket-service's
// PickupBookingController uses for the customer-facing timeline, so the shop
// and the customer read the same stage names for the same event.
const EVENT_LABEL = {
  ORDER_PLACED: 'Order Placed',
  BOOKING_CREATED_BY_SHOP: 'Booking Created by Shop',
  PENDING: 'Pending',
  PICKUP_REQUESTED: 'Pickup Requested',
  PICKUP_ACCEPTED: 'Pickup Accepted',
  SERVICE_ACCEPTED: 'Service Accepted',
  ORDER_SERVICE_CONFIRMED: 'Order Confirmed',
  PICKUP_PERSON_ASSIGNED: 'Pickup Person Assigned',
  PICKUP_ASSIGNED: 'Pickup Person Assigned',
  PICKUP_REASSIGNED: 'Pickup Person Reassigned',
  PICKUP_ON_THE_WAY: 'Pickup Person On The Way',
  REACHED_CUSTOMER_LOCATION: 'Reached Customer Location',
  REPAIR_ESTIMATE_PROCESSING: 'Repair Estimate Processing',
  ESTIMATE_SENT_TO_CUSTOMER: 'Estimate Sent To Customer',
  CUSTOMER_APPROVED: 'Customer Approved',
  DEVICE_PICKED_UP: 'Device Picked Up',
  PICKED_UP: 'Device Picked Up',
  REACHED_SHOP: 'Reached Shop',
  RECEIVED_AT_SHOP: 'Received at Shop',
  REPAIR_IN_PROGRESS: 'Repair In Progress',
  REPAIR_COMPLETED: 'Repair Completed',
  READY_FOR_DELIVERY: 'Ready For Delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Pickup Cancelled',
};

const ACTOR_LABEL = {
  SHOP: 'Shop',
  CUSTOMER: 'Customer',
  USER: 'Customer',
  TECHNICIAN: 'Pickup Person',
  SYSTEM: 'System',
};

const labelFor = (status) => EVENT_LABEL[String(status || '').toUpperCase()]
  || String(status || 'Update').replace(/_/g, ' ');

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// "16 Oct" + "9:06 PM" — date and time on separate lines of a timeline row.
function fmtDay(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';
}
function fmtTime(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
}

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green — same treatment as the ticket
// history header.
function splitTrackingId(id) {
  const s = String(id ?? '').replace(/^#+/, '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <View className="flex-row items-center mb-2.5">
      <View className="w-7 h-7 rounded-full items-center justify-center mr-2" style={{ backgroundColor: '#E5F3F5' }}>
        <Icon size={14} color={BRAND_GREEN_DARK} />
      </View>
      <Text className="text-[14px] font-extrabold text-gray-900">{label}</Text>
    </View>
  );
}

// One event. The connector is drawn per-row rather than as one absolute rail
// behind the list: rows are variable height (a note wraps to two lines) and an
// absolute rail would need a measured container to know where to stop.
function EventRow({ event, first, last }) {
  const actor = event.actor ? (ACTOR_LABEL[String(event.actor).toUpperCase()] || event.actor) : null;
  return (
    <View className="flex-row">
      <View className="items-center mr-3" style={{ width: 22 }}>
        <View style={{ width: 2, height: 4, backgroundColor: first ? 'transparent' : RAIL }} />
        {last ? (
          // Current stage: solid teal disc in a soft ring.
          <View className="items-center justify-center" style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5F3F5' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND_GREEN_DARK }} />
          </View>
        ) : (
          // Done stage: small teal disc with a white check.
          <View className="items-center justify-center" style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: TEAL_MID }}>
            <Check size={11} color="#FFFFFF" strokeWidth={3} />
          </View>
        )}
        <View style={{ width: 2, flex: 1, backgroundColor: last ? 'transparent' : RAIL }} />
      </View>
      <View className="flex-1 flex-row" style={{ paddingBottom: last ? 2 : 14, paddingTop: 2 }}>
        <View className="flex-1 pr-2">
          <Text className="text-[13px] font-extrabold" style={{ color: last ? BRAND_GREEN_DARK : '#111111' }}>{labelFor(event.status)}</Text>
          {event.note ? <Text className="text-[11.5px] text-gray-600 mt-0.5">{event.note}</Text> : null}
          {actor ? (
            <View className="self-start rounded-full mt-1" style={{ paddingHorizontal: 7, paddingVertical: 1, backgroundColor: '#F3F4F6' }}>
              <Text className="text-[10px] font-semibold text-gray-500">{actor}</Text>
            </View>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-[11px] font-semibold text-gray-700">{fmtDay(event.createdAt)}</Text>
          <Text className="text-[10.5px] text-gray-400 mt-0.5">{fmtTime(event.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function PickupHistoryScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, 760);

  const id = route?.params?.id;
  const preloaded = route?.params?.booking || null;
  const [data, setData] = useState(preloaded);
  const [loading, setLoading] = useState(!preloaded);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await getShopRepairBooking(id));
      setError(null);
    } catch (e) {
      // Keep whatever the list handed us on screen rather than blanking it.
      setError(e?.body?.message || e?.message || 'Failed to load pickup history');
    }
  }, [id]);

  // Polled like the ticket history screen: the middle stages are driven by the
  // pickup person in the employee app, so this screen is how the shop watches
  // a live pickup move without pulling to refresh every minute.
  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => { await load(); if (active) setLoading(false); })();
    timer.current = setInterval(load, 10000);
    return () => { active = false; if (timer.current) clearInterval(timer.current); };
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <Loader label="Loading pickup history..." />;

  const events = Array.isArray(data?.events) ? data.events : [];
  const currentLabel = labelFor(events.length ? events[events.length - 1].status : data?.status);
  const tid = splitTrackingId(data?.bookingNumber || id);

  return (
    <View className="flex-1" style={{ backgroundColor: '#F3F4F6' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 12,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        {/* Back · centred title with the pickup number under it · spacer the
            width of the back button, so the title sits in the true centre. */}
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={6}
            className="w-9 h-9 rounded-full items-center justify-center bg-surface-muted"
          >
            <ChevronLeft size={20} color="#111111" />
          </TouchableOpacity>
          <View className="flex-1 items-center px-2">
            <Text className="text-text text-[17px] font-extrabold text-center" numberOfLines={1}>Pickup History</Text>
            <Text className="text-[12px] font-bold text-center mt-0.5" numberOfLines={1}>
              <Text style={{ color: '#6B7280' }}>#{tid.prefix}</Text>
              <Text style={{ color: BRAND_GREEN_DARK }}>{tid.digits}</Text>
            </Text>
          </View>
          <View className="w-9 h-9" />
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
          {/* Current stage */}
          <View className="px-4" style={{ marginTop: 12 }}>
            <View className="bg-white rounded-2xl p-3.5" style={cardShadow}>
              <View className="flex-row items-center">
                <View className="w-11 h-11 rounded-full items-center justify-center mr-3" style={{ backgroundColor: TEAL_MID }}>
                  <Radio size={20} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text className="text-[10.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.7 }}>Current Status</Text>
                  <Text className="text-[15px] font-extrabold mt-0.5" style={{ color: BRAND_GREEN_DARK }} numberOfLines={1}>
                    {currentLabel || 'Pickup Requested'}
                  </Text>
                </View>
              </View>

              {/* Pickup By (left) · Last update (right) */}
              <View className="flex-row mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center">
                    <UserCheck size={11} color="#9CA3AF" />
                    <Text className="ml-1 text-[10.5px] text-gray-500">Pickup By</Text>
                  </View>
                  <Text className="text-[12px] font-bold mt-0.5" style={{ color: data?.pickupPersonName ? '#111111' : '#9CA3AF' }} numberOfLines={1}>
                    {data?.pickupPersonName || 'Not assigned'}
                  </Text>
                </View>
                <View className="flex-1 pl-2 items-end">
                  <View className="flex-row items-center">
                    <Clock size={11} color="#9CA3AF" />
                    <Text className="ml-1 text-[10.5px] text-gray-500">Last update</Text>
                  </View>
                  <Text className="text-[12px] font-bold text-gray-900 mt-0.5" numberOfLines={1}>
                    {events.length ? fmtWhen(events[events.length - 1].createdAt) : '—'}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center mt-3">
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#609138' }} />
                <Text className="ml-1.5 text-[10.5px] text-gray-500">Updates live · Pull down to refresh</Text>
              </View>
            </View>
          </View>

          {error ? (
            <View className="px-4 mt-3">
              <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}>
                <Text className="text-[12px] font-semibold" style={{ color: '#B91C1C' }}>{error}</Text>
              </View>
            </View>
          ) : null}

          {/* Timeline */}
          <View className="px-4" style={{ marginTop: 12 }}>
            <View className="bg-white rounded-2xl p-3.5" style={cardShadow}>
              <SectionHeader icon={History} label="Pickup Timeline" />
              {events.length === 0 ? (
                <Text className="text-[12px] text-gray-500">
                  No events recorded for this pickup yet.
                </Text>
              ) : (
                events.map((ev, i) => (
                  <EventRow
                    key={ev.id || `${ev.status}-${i}`}
                    event={ev}
                    first={i === 0}
                    last={i === events.length - 1}
                  />
                ))
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
