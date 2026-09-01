import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, StatusBar, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Smartphone,
  IndianRupee,
  Hash,
  FileText,
  CalendarClock,
  Wrench,
  ShieldCheck,
  Check,
  ChevronRight,
  ChevronLeft,
  Pencil,
  Clock,
  Truck,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

function SectionHeader({ icon: Icon, label, tint = '#E6F7E3', accent = BRAND_GREEN_DARK }) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: tint }}
      >
        <Icon size={14} color={accent} />
      </View>
      <Text
        className="text-[11px] font-bold tracking-widest"
        style={{ color: accent, letterSpacing: 1.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

function FieldLabel({ children }) {
  return (
    <Text className="text-[10.5px] uppercase font-bold text-gray-500 mb-1.5" style={{ letterSpacing: 0.6 }}>
      {children}
    </Text>
  );
}

function GreenInput(props) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="#8FA08F"
      style={[
        {
          borderWidth: 1.5,
          borderColor: '#E2E8E2',
          backgroundColor: '#F7FAF7',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 13.5,
          color: '#172117',
        },
        props.style,
      ]}
    />
  );
}

function SubLink({ icon: Icon, tint, accent, label, sub, onPress, divider }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${divider ? 'border-b border-gray-100' : ''}`}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: tint }}
      >
        <Icon size={16} color={accent} />
      </View>
      <View className="flex-1">
        <Text className="text-[13.5px] font-bold text-gray-900">{label}</Text>
        {sub ? <Text className="text-[11px] text-gray-500 mt-0.5">{sub}</Text> : null}
      </View>
      <ChevronRight size={16} color="#8FA08F" />
    </Pressable>
  );
}

export default function EditBookingScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [imei, setImei] = useState('');
  const [notes, setNotes] = useState('');
  const [approxDate, setApproxDate] = useState('');
  const [approxTime, setApproxTime] = useState('');
  const [approxDuration, setApproxDuration] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [approved, setApproved] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(data);
      if (data?.imei) setImei(String(data.imei));
      if (data?.issueDescription) setNotes(data.issueDescription);
      if (data?.estimatedApproxDate) setApproxDate(data.estimatedApproxDate);
      if (data?.estimatedApproxTime) setApproxTime(data.estimatedApproxTime);
      if (data?.estimatedApproxDuration) setApproxDuration(String(data.estimatedApproxDuration));
      if (data?.estimatedDeliveryAt) setDeliveryDate(data.estimatedDeliveryAt);
      setApproved(Boolean(data?.customerApproved));
    } catch (e) {
      setError(e.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !ticket) return <Loader label="Loading booking..." />;

  const lineItems = ticket?.priceItems
    || ticket?.services?.map?.((s) => ({ id: s.id, label: s.serviceName, amount: s.price }))
    || [];
  const estimatedTotal = ticket?.estimatedPrice != null
    ? ticket.estimatedPrice
    : lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const saveAndBack = async () => {
    setSaving(true);
    try {
      await ticketApi.patch(`/tickets/${ticketId}`, {
        body: {
          imei,
          issueDescription: notes,
          estimatedApproxDate: approxDate,
          estimatedApproxTime: approxTime,
          estimatedApproxDuration: approxDuration,
          estimatedDeliveryAt: deliveryDate,
          customerApproved: approved,
        },
      });
      navigation.goBack();
    } catch (e) {
      notify('Save failed', e?.message || 'Could not update booking.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* White header + hero */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 8,
          paddingBottom: 70,
          paddingHorizontal: 16,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center bg-surface-muted"
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="text-text text-[15px] font-extrabold">Edit Booking</Text>
          <View
            className="px-3 py-1.5 rounded-full bg-surface-muted"
          >
            <View className="flex-row items-center">
              <Pencil size={11} color="#172117" />
              <Text className="ml-1 text-text text-[10.5px] font-bold tracking-wide">EDIT</Text>
            </View>
          </View>
        </View>

        <View className="mt-4">
          <Text className="text-text-muted text-[11px] font-bold tracking-wider">
            EDITING BOOKING
          </Text>
          <Text className="text-text text-xl font-extrabold mt-1" numberOfLines={1}>
            {ticket?.deviceModelName || ticket?.modelName || 'Device'}
          </Text>
          <Text className="text-text-muted text-[11.5px] mt-0.5" numberOfLines={1}>
            #{ticket?.trackingId || ticketId}
          </Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {error ? (
          <View className="px-4" style={{ marginTop: 12 }}>
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

        {/* Floating device card */}
        {ticket ? (
          <View className="px-4" style={{ marginTop: 12 }}>
            <View
              className="bg-white rounded-2xl p-4 flex-row items-center"
              style={cardShadow}
            >
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mr-3"
                style={{ backgroundColor: '#E6F7E3' }}
              >
                <Smartphone size={26} color={BRAND_GREEN_DARK} />
              </View>
              <View className="flex-1">
                <Text className="text-[10.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.7 }}>
                  Now Editing
                </Text>
                <Text className="text-[15px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
                  {ticket.deviceModelName || ticket.modelName || 'Device'}
                </Text>
                <Text className="text-[11.5px] text-gray-500 mt-0.5" numberOfLines={1}>
                  #{ticket.trackingId || ticketId}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Price Summary */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={IndianRupee} label="PRICE SUMMARY" />
            {lineItems.length === 0 ? (
              <Text className="text-[12.5px] text-gray-500">No service items yet.</Text>
            ) : (
              <>
                {lineItems.map((item, idx) => (
                  <View key={item.id || idx} className="flex-row items-center py-1.5">
                    <View
                      className="w-6 h-6 rounded-full items-center justify-center mr-2.5"
                      style={{ backgroundColor: '#E6F7E3' }}
                    >
                      <Text
                        className="text-[10.5px] font-extrabold"
                        style={{ color: BRAND_GREEN_DARK }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <Text className="text-[12.5px] text-gray-700 flex-1" numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text className="text-[12.5px] font-bold text-gray-900">
                      ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}

                <View
                  className="my-3"
                  style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2', borderStyle: 'dashed' }}
                />

                <View
                  className="p-3 rounded-2xl flex-row items-center justify-between"
                  style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
                >
                  <Text className="text-[12.5px] font-bold text-gray-700">
                    Estimated Total
                  </Text>
                  <Text
                    className="text-[16px] font-extrabold"
                    style={{ color: BRAND_GREEN_DARK }}
                  >
                    ₹{Number(estimatedTotal).toLocaleString('en-IN')}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* IMEI + Notes */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={Hash} label="IMEI & NOTES" />
            <FieldLabel>IMEI Number</FieldLabel>
            <GreenInput
              placeholder="Enter IMEI or scan"
              value={imei}
              onChangeText={setImei}
              keyboardType="number-pad"
            />
            <View className="h-3" />
            <FieldLabel>Complaint Notes</FieldLabel>
            <GreenInput
              placeholder="Describe the issue..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              style={{ minHeight: 88, textAlignVertical: 'top' }}
            />
          </View>
        </View>

        {/* Estimated Times */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={CalendarClock} label="ESTIMATED TIMES" tint="#FEF3C7" accent="#B45309" />
            <FieldLabel>Approximate Date</FieldLabel>
            <GreenInput
              placeholder="e.g. Sat, Dec 27 2025"
              value={approxDate}
              onChangeText={setApproxDate}
            />
            <View className="h-3" />
            <View className="flex-row -mx-1">
              <View className="px-1 flex-1">
                <FieldLabel>Time</FieldLabel>
                <GreenInput
                  placeholder="6:30 PM"
                  value={approxTime}
                  onChangeText={setApproxTime}
                />
              </View>
              <View className="px-1 flex-1">
                <FieldLabel>Duration</FieldLabel>
                <GreenInput
                  placeholder="2 Hr"
                  value={approxDuration}
                  onChangeText={setApproxDuration}
                />
              </View>
            </View>
            <View className="h-3" />
            <FieldLabel>Delivery Date / Time</FieldLabel>
            <GreenInput
              placeholder="e.g. Sat, Dec 27 2025 8:30 PM"
              value={deliveryDate}
              onChangeText={setDeliveryDate}
            />
          </View>
        </View>

        {/* Approval */}
        <View className="px-4 mt-4">
          <Pressable
            onPress={() => setApproved((v) => !v)}
            className="rounded-2xl active:opacity-90 overflow-hidden"
            style={[
              cardShadow,
              {
                backgroundColor: approved ? '#F0F8EF' : '#FFFFFF',
                borderWidth: 1.5,
                borderColor: approved ? BRAND_GREEN : '#E2E8E2',
              },
            ]}
          >
            <View className="flex-row items-center p-4">
              <View
                className="w-7 h-7 rounded-md items-center justify-center mr-3"
                style={{
                  backgroundColor: approved ? BRAND_GREEN : '#FFFFFF',
                  borderWidth: 2,
                  borderColor: approved ? BRAND_GREEN : '#CBD5CB',
                }}
              >
                {approved ? <Check size={16} color="#FFFFFF" strokeWidth={3.5} /> : null}
              </View>
              <View className="flex-1">
                <Text
                  className="text-[14px] font-extrabold"
                  style={{ color: approved ? BRAND_GREEN_DARK : '#172117' }}
                >
                  Customer Repair Approval
                </Text>
                <Text className="text-[11.5px] text-gray-500 mt-0.5">
                  {approved ? 'Customer has approved the repair' : 'Tap to mark as approved'}
                </Text>
              </View>
              {approved ? (
                <View
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: BRAND_GREEN }}
                >
                  <Text className="text-white text-[10px] font-extrabold tracking-wide">
                    DONE
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>

        {/* Sub-flows */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl overflow-hidden"
            style={cardShadow}
          >
            <SubLink
              icon={Wrench}
              tint="#FEE2E2"
              accent="#B91C1C"
              label="Device Missing / Damage Parts"
              sub="Manage parts that are missing or damaged"
              onPress={() => navigation.navigate('DeviceMissingParts', { ticketId })}
              divider
            />
            <SubLink
              icon={ShieldCheck}
              tint="#E6F7E3"
              accent="#087A0A"
              label="Device Security"
              sub="PIN, password or pattern lock"
              onPress={() => navigation.navigate('DeviceSecurity', { ticketId })}
              divider
            />
            <SubLink
              icon={FileText}
              tint="#F0F8EF"
              accent="#087A0A"
              label="Device Information"
              sub="Photos, video & complaint details"
              onPress={() => navigation.navigate('DeviceInformation', { ticketId })}
            />
          </View>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View
        className="absolute left-0 right-0 bottom-0 px-4 pt-3"
        style={{
          paddingBottom: insets.bottom + 12,
          backgroundColor: 'rgba(240, 248, 239, 0.96)',
          borderTopWidth: 1,
          borderTopColor: '#E2E8E2',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={saveAndBack}
          disabled={saving}
          style={cardShadow}
        >
          <LinearGradient
            colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 18,
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Check size={18} color="#FFFFFF" strokeWidth={3} />
            )}
            <Text className="ml-2 text-white text-[15px] font-extrabold">
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
