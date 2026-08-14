import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ScreenHeader, Loader, EmptyState, Badge } from '../../components/rnr';
import { listShopRepairBookings, postShopBookingStatus } from '../../api/orders';
import { notify } from '../../components/confirm';

// Statuses the shop can set; keys match the customer status-flow steps so each
// post lights up the corresponding step on the customer's side. Pickup and
// Service are distinct flows.
const SERVICE_OPTIONS = [
  { key: 'ASSIGN_TECHNICIAN',   label: 'Assign to Technician' },
  { key: 'ASSIGN_NOT_ACCEPTED', label: 'Technician Not Accepted' },
  { key: 'REASSIGN_TECHNICIAN', label: 'Re-Assign Technician' },
  { key: 'TECHNICIAN_ACCEPTED', label: 'Technician Accepted' },
  { key: 'TECH_WORK_STARTED',   label: 'Technician Work Started' },
  { key: 'TECH_UPLOADED_IMAGES',label: 'Uploaded Device Images' },
  { key: 'TECH_COMPLIANCE',     label: 'Compliance Verified' },
  { key: 'ISSUE_IDENTIFIED',    label: 'Issue Identified' },
  { key: 'WAITING_APPROVAL',    label: 'Waiting Customer Approval' },
  { key: 'REBOOKING_PLACED',    label: 'Re-Booking Placed' },
  { key: 'TECH_WORK_RESTARTED', label: 'Work Restarted' },
  { key: 'WAITING_SPARE',       label: 'Waiting for Spare Part' },
  { key: 'SPARE_ORDERED',       label: 'Spare Part Ordered' },
  { key: 'TECH_WORK_STARTED_2', label: 'Work Started (Resume)' },
  { key: 'TECH_WORK_COMPLETED',  label: 'Work Completed' },
  // Billing + handover sub-flow — must be advanced in order; keys match the
  // canonical SHOP_BOOKING_STATUS_OPTIONS rail in common/serviceHistoryPhases.js
  // so each post lights up the matching customer-history row.
  { key: 'READY',                label: 'Ready for Delivery' },
  { key: 'INVOICE_GENERATED',    label: 'Invoice Generated' },
  { key: 'INVOICE_READY',        label: 'Invoice Ready' },
  { key: 'DELIVERED_PROCESSING', label: 'Delivered to Customer Processing' },
  { key: 'DELIVERED',            label: 'Delivered to Customer' },
];
const PICKUP_OPTIONS = [
  { key: 'ORDER_PLACED',            label: 'Order Placed' },
  { key: 'ORDER_SERVICE_CONFIRMED', label: 'Order Service Confirmed' },
  { key: 'PICKUP_ASSIGNED',         label: 'Pick Up Present Assigned' },
  { key: 'ESTIMATE_PROCESSING',     label: 'Estimated Value Processing' },
  { key: 'ESTIMATE_ACCEPTED',       label: 'Customer Estimate Accepted' },
  { key: 'DEVICE_RECEIVED',         label: 'Device Received to Pickup' },
  { key: 'DEVICE_DELIVERY_TO_SHOP', label: 'Device Delivered to Shop' },
  { key: 'DEVICE_RETURNED',         label: 'Device Returned to Customer' },
];
const LABEL_BY_KEY = Object.fromEntries(
  [...SERVICE_OPTIONS, ...PICKUP_OPTIONS].map((o) => [o.key, o.label]),
);
const isPickupBooking = (bk) => (bk.serviceMode === 'PICKUP') || !!bk.pickupDate || !!bk.pickupSlotStart;

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '');
const hashed = (n) => (n ? (String(n).startsWith('#') ? n : `#${n}`) : '');

export default function ShopServiceStatusScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    try { setList(await listShopRepairBookings()); } catch (_) { setList([]); }
  }, []);

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const apply = async (booking, opt) => {
    setSavingKey(booking.id + opt.key);
    try {
      await postShopBookingStatus(booking.id, { status: opt.key, note: opt.label });
      notify('Status updated', `${hashed(booking.bookingNumber)} → ${opt.label}`);
      await load();
      setOpenId(null);
    } catch (e) {
      notify('Error', e?.message || 'Could not update status');
    } finally { setSavingKey(null); }
  };

  if (loading) return <Loader label="Loading bookings..." />;

  const serviceBookings = list.filter((bk) => !isPickupBooking(bk));

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Update Service Status" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#087A0A" />}
      >
        {serviceBookings.length === 0 ? (
          <EmptyState title="No service bookings" description="Customer repair bookings for your shop will appear here." />
        ) : serviceBookings.map((bk) => {
          const services = (bk.services || []).map((s) => s.serviceName).filter(Boolean).join(', ');
          const isOpen = openId === bk.id;
          const statusUpper = (bk.status || '').toUpperCase();
          const pickup = isPickupBooking(bk);
          const opts = pickup ? PICKUP_OPTIONS : SERVICE_OPTIONS;
          return (
            <View key={bk.id} className="bg-card border border-border rounded-2xl p-3 mb-2.5">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center">
                    <Text className="text-[13px] font-extrabold text-text">{hashed(bk.bookingNumber)}</Text>
                    <View className={`ml-2 rounded-full px-2 py-0.5 ${pickup ? 'bg-primary/10' : 'bg-warning/10'}`}>
                      <Text className={`text-[9px] font-bold ${pickup ? 'text-primary' : 'text-warning'}`}>{pickup ? 'PICKUP' : 'SERVICE'}</Text>
                    </View>
                  </View>
                  {services ? <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={2}>{services}</Text> : null}
                  <Text className="text-[10px] text-text-muted mt-0.5">{fmtDate(bk.updatedAt || bk.createdAt)}</Text>
                </View>
                <Badge variant="softPrimary">{LABEL_BY_KEY[statusUpper] || statusUpper.replace(/_/g, ' ')}</Badge>
              </View>

              <Pressable
                onPress={() => setOpenId(isOpen ? null : bk.id)}
                className="mt-2 pt-2 border-t border-border flex-row items-center justify-center active:opacity-70"
              >
                <Text className="text-[12px] font-bold text-primary">{isOpen ? 'Close' : 'Change Status'}</Text>
              </Pressable>

              {isOpen ? (
                <View className="mt-2 flex-row flex-wrap -mx-1">
                  {opts.map((opt) => {
                    const active = statusUpper === opt.key;
                    const saving = savingKey === bk.id + opt.key;
                    return (
                      <View key={opt.key} className="w-1/2 p-1">
                        <Pressable
                          disabled={!!savingKey}
                          onPress={() => apply(bk, opt)}
                          className={`rounded-xl border px-2 py-2 ${active ? 'bg-primary border-primary' : 'bg-background border-border'} ${savingKey && !saving ? 'opacity-50' : ''}`}
                        >
                          <Text className={`text-[11px] font-bold text-center ${active ? 'text-white' : 'text-text'}`}>
                            {saving ? 'Saving...' : opt.label}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
