import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar, Clock, ChevronRight, MapPin, Truck, User, FileText, IndianRupee, Phone } from 'lucide-react-native';
import { Badge, Chip, EmptyState, Loader, ScreenHeader } from '../../components/rnr';
import { listShopRepairBookings } from '../../api/orders';

const STATUS_FILTERS = [
  { key: 'ALL',          label: 'All' },
  { key: 'ACTIVE',       label: 'Active' },
  { key: 'NEW',          label: 'New' },
  { key: 'COMPLETED',    label: 'Completed' },
  { key: 'CANCELLED',    label: 'Cancelled' },
];

const STATUS_VARIANT = {
  ORDER_PLACED: { variant: 'softWarning', label: 'New Request' },
  PICKUP_REQUESTED: { variant: 'softWarning', label: 'Pickup Requested' },
  PICKUP_ACCEPTED: { variant: 'softPrimary', label: 'Pickup Accepted' },
  ORDER_SERVICE_CONFIRMED: { variant: 'softPrimary', label: 'Confirmed' },
  PICKUP_PERSON_ASSIGNED: { variant: 'softPrimary', label: 'Pickup Assigned' },
  PICKUP_ASSIGNED: { variant: 'softPrimary', label: 'Pickup Assigned' },
  PICKUP_ON_THE_WAY: { variant: 'softSecondary', label: 'On The Way' },
  REACHED_CUSTOMER_LOCATION: { variant: 'softSecondary', label: 'At Customer' },
  REPAIR_ESTIMATE_PROCESSING: { variant: 'softWarning', label: 'Estimate Submitted' },
  DEVICE_PICKED_UP: { variant: 'softSecondary', label: 'Device Picked Up' },
  PICKED_UP: { variant: 'softSecondary', label: 'Device Picked Up' },
  REACHED_SHOP: { variant: 'softSuccess', label: 'Reached Shop' },
  ACCEPTED:     { variant: 'softPrimary', label: 'Accepted' },
  IN_TRANSIT:   { variant: 'softSecondary', label: 'In Transit' },
  COMPLETED:    { variant: 'softSuccess', label: 'Completed' },
  CANCELLED:    { variant: 'softDanger',  label: 'Cancelled' },
};

function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 8 ? s.slice(0, 8).toUpperCase() : s.toUpperCase();
}

function formatDate(d) {
  if (!d) return '—';
  // d is "YYYY-MM-DD" from the backend (LocalDate).
  try {
    const [y, m, day] = String(d).split('-');
    return `${day}/${m}/${y}`;
  } catch (_) { return String(d); }
}

function formatSlot(start, end) {
  if (!start && !end) return null;
  const fmt = (t) => {
    if (!t) return '';
    // LocalTime serialises as "HH:mm:ss" or "HH:mm".
    const [hh, mm] = String(t).split(':');
    const h = parseInt(hh, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mm} ${ampm}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function repairServiceText(item) {
  const services = Array.isArray(item?.services)
    ? item.services.map((s) => s?.serviceName).filter(Boolean)
    : [];
  return services.length ? services.join(', ') : item?.issueSummary;
}

function PickupRow({ item, onPress }) {
  const status = STATUS_VARIANT[item.status] || { variant: 'muted', label: item.status || 'Unknown' };
  const slot = formatSlot(item.pickupSlotStart, item.pickupSlotEnd);
  const serviceText = repairServiceText(item);
  return (
    <Pressable
      onPress={onPress}
      className="bg-card border border-border rounded-2xl p-3 mb-3 active:opacity-90"
      style={{ shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
    >
      <View className="flex-row items-center mb-2">
        <View className="h-10 w-10 rounded-xl bg-success/10 items-center justify-center mr-2.5">
          <Truck size={18} color="#087A0A" />
        </View>
        <View className="flex-1">
          <Text className="text-[13px] font-extrabold text-text" numberOfLines={1}>{item.bookingNumber || shortId(item.id)}</Text>
          <Text className="text-[10px] text-text-muted mt-0.5">Repair Pickup</Text>
        </View>
        <Badge variant={status.variant}>{status.label}</Badge>
      </View>

      <View className="flex-row flex-wrap -mx-1">
        <Detail icon={User}     label="Customer" value={item.customerName || '—'} />
        {item.customerMobile ? (
          <Detail icon={Phone}  label="Mobile"   value={item.customerMobile} />
        ) : null}
        <Detail icon={Calendar} label="Date"     value={formatDate(item.pickupDate)} />
        {slot ? <Detail icon={Clock} label="Slot" value={slot} /> : null}
        {item.estimateAmount != null ? (
          <Detail icon={IndianRupee} label="Estimate" value={`₹${item.estimateAmount}`} />
        ) : null}
        {item.ticketId ? (
          <Detail icon={FileText} label="Ticket" value={`#${shortId(item.ticketId)}`} />
        ) : null}
      </View>

      {item.pickupAddressText ? (
        <View className="flex-row items-start mt-1.5 px-1">
          <MapPin size={12} color="#667066" style={{ marginTop: 2 }} />
          <View className="flex-1 ml-1">
            <Text className="text-[10px] text-text-muted">Pickup Address{item.pickupAddressLabel ? ` · ${item.pickupAddressLabel}` : ''}</Text>
            <Text className="text-[12px] font-bold text-text" numberOfLines={2}>{item.pickupAddressText}</Text>
          </View>
        </View>
      ) : null}

      {serviceText ? (
        <View className="flex-row items-start mt-2 px-1">
          <FileText size={12} color="#667066" style={{ marginTop: 2 }} />
          <View className="flex-1 ml-1">
            <Text className="text-[10px] text-text-muted">Repair Service</Text>
            <Text className="text-[12px] font-bold text-text" numberOfLines={2}>{serviceText}</Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row items-center justify-end mt-1">
        <Text className="text-[10px] text-primary font-bold mr-1">View details</Text>
        <ChevronRight size={14} color="#087A0A" />
      </View>
    </Pressable>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <View className="px-1 mb-1" style={{ width: '50%' }}>
      <View className="flex-row items-center">
        <Icon size={12} color="#667066" />
        <Text className="text-[10px] text-text-muted ml-1">{label}</Text>
      </View>
      <Text className="text-[12px] font-bold text-text" numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function OwnerPickupServiceListScreen({ navigation }) {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await listShopRepairBookings();
      const pickups = (Array.isArray(data) ? data : []).filter((b) => b.serviceMode === 'PICKUP');
      // Store the full pickup list; the filtered view and the status-chip counts
      // both derive from it, so the chip badges reflect the whole queue instead
      // of only the currently-selected filter's subset.
      setAllItems(pickups);
    } catch (e) {
      setError(e?.body?.message || e?.message || 'Failed to load pickup requests');
      setAllItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = useMemo(() => {
    if (statusFilter === 'ALL') return allItems;
    if (statusFilter === 'ACTIVE') {
      return allItems.filter((b) => {
        const s = (b.status || '').toUpperCase();
        return s !== 'COMPLETED' && s !== 'CANCELLED' && s !== 'DELIVERED';
      });
    }
    if (statusFilter === 'NEW') {
      return allItems.filter((b) => ['ORDER_PLACED', 'PICKUP_REQUESTED'].includes((b.status || '').toUpperCase()));
    }
    return allItems.filter((b) => (b.status || '').toUpperCase() === statusFilter);
  }, [allItems, statusFilter]);

  const counts = useMemo(() => {
    const c = { ALL: allItems.length, ACTIVE: 0, NEW: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const it of allItems) {
      const s = (it.status || '').toUpperCase();
      if (s === 'COMPLETED') c.COMPLETED += 1;
      else if (s === 'CANCELLED') c.CANCELLED += 1;
      else { c.ACTIVE += 1; if (s === 'ORDER_PLACED' || s === 'PICKUP_REQUESTED') c.NEW += 1; }
    }
    return c;
  }, [allItems]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Pickup Service" subtitle="Shop pickup requests" onBack={() => navigation.goBack()} />

      <View className="px-3 pt-3 pb-1">
        <FlatList
          data={STATUS_FILTERS}
          keyExtractor={(it) => it.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => {
            const active = statusFilter === item.key;
            const count = counts[item.key];
            const suffix = typeof count === 'number' ? ` · ${count}` : '';
            return (
              <Chip
                active={active}
                onPress={() => setStatusFilter(item.key)}
                label={`${item.label}${suffix}`}
              />
            );
          }}
        />
      </View>

      {loading && items.length === 0 ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#087A0A']} tintColor="#087A0A" />}
          renderItem={({ item }) => (
            <PickupRow
              item={item}
              onPress={() => navigation.navigate('OwnerPickupServiceDetail', { id: item.id, booking: item })}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Truck size={28} color="#667066" />}
              title={error ? 'Could not load pickups' : 'No pickup requests yet'}
              description={error || 'Customer pickup requests for this shop will appear here.'}
            />
          }
        />
      )}
    </View>
  );
}
