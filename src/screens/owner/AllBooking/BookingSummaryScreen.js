import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ticketApi } from '../../../api/client';
import { paymentFromTicket } from './ReceiptCard';
import {
  CheckCircle2,
  User,
  Phone,
  MapPin,
  Smartphone,
  Wrench,
  Hash,
  Activity,
  IndianRupee,
  ChevronLeft,
  UserCog,
  Share2,
  QrCode,
  Store,
  Sparkles,
} from 'lucide-react-native';

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
        className="text-[11px] font-bold tracking-widest"
        style={{ color: BRAND_GREEN_DARK, letterSpacing: 1.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <View className="flex-row items-start py-2.5">
      <View
        className="w-8 h-8 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: '#F0F8EF' }}
      >
        <Icon size={14} color={ACCENT_GREEN} />
      </View>
      <View className="flex-1">
        <Text className="text-[10.5px] uppercase font-semibold text-gray-400 mb-0.5" style={{ letterSpacing: 0.6 }}>
          {label}
        </Text>
        <Text className="text-[13.5px] font-semibold text-gray-900 leading-5">
          {value}
        </Text>
      </View>
    </View>
  );
}

function QuickAction({ icon: Icon, label, sub, onPress, tint = '#F0F8EF', accent = ACCENT_GREEN }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className="flex-1 mx-1 rounded-2xl bg-white py-4 px-3 items-center"
      style={softShadow}
    >
      <View
        className="w-11 h-11 rounded-full items-center justify-center mb-2"
        style={{ backgroundColor: tint }}
      >
        <Icon size={20} color={accent} />
      </View>
      <Text className="text-[12px] font-bold text-gray-900 text-center">
        {label}
      </Text>
      {sub ? (
        <Text className="text-[10px] text-gray-500 text-center mt-0.5">
          {sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function BookingSummaryScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { ticketId, customer, devices, trackingId, estimatedPrice } = route.params || {};
  const [ticket, setTicket] = useState(null);

  // When the screen is opened with only a ticketId (e.g. from a booking link),
  // fetch the real ticket so we render actual data instead of blanks — and
  // never fabricated placeholder identities.
  const needsFetch = !!ticketId && !(customer && Array.isArray(devices) && devices.length);
  const load = useCallback(async () => {
    if (!needsFetch) return;
    const t = await ticketApi.get(`/tickets/${ticketId}`).catch(() => null);
    if (t) setTicket(t);
  }, [needsFetch, ticketId]);
  useEffect(() => { load(); }, [load]);

  const handleInvoice = () => {
    navigation.navigate('DeliveryInvoice', { ticketId, customer, devices, trackingId, estimatedPrice });
  };

  const handleBarcode = () => {
    navigation.navigate('BarcodePrint', { ticketId, customer });
  };

  const handleAssignTechnician = () => {
    // BookingSummary is registered on the outer OwnerNavigator, where the assign
    // route is named "LegacyAssignTechnician" (bare "AssignTechnician" only
    // exists inside the nested booking stack and won't resolve from here).
    navigation.navigate('LegacyAssignTechnician', {
      ticketId,
      customer,
      devices,
      trackingId,
      estimatedPrice,
    });
  };

  // Prefer values passed as params; fall back to the fetched ticket; otherwise
  // show a neutral placeholder. Never render fabricated demo identities.
  const src = ticket || {};
  const shopName = src.shopName || null;
  const customerName = customer?.name || src.customerName || '—';
  const mobileNumber = customer?.phone || src.customerPhone || '—';
  const addressFromParam = (customer?.doorStreet || customer?.area)
    ? [customer.doorStreet, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ')
    : null;
  const address = addressFromParam || src.customerAddress || null;
  const deviceList = (devices && devices.length > 0)
    ? devices.map((d) => d.deviceDisplayName || d.model?.name).filter(Boolean).join(', ')
    : (src.deviceDisplayName || src.deviceModelName || src.modelName || '—');
  const repairServices = (devices && devices.length > 0)
    ? devices.map((d) => d.repairServicesSummary).filter(Boolean).join('; ')
    : (src.repairServicesSummary || '—');
  const displayTrackingId = trackingId || src.trackingId || ticketId || '—';
  const priceVal = estimatedPrice != null ? estimatedPrice
    : (src.estimatedPrice != null ? src.estimatedPrice : null);
  const displayPrice = priceVal != null ? `₹${Number(priceVal).toLocaleString('en-IN')}` : '—';
  // Off the fetched ticket only — route params carry no payment, so a summary
  // opened straight from the booking flow shows it once the ticket loads.
  const payment = paymentFromTicket(ticket, priceVal);

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* White header + hero */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 8,
          paddingBottom: 80,
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
          <View
            className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-muted"
          >
            <Sparkles size={12} color="#172117" />
            <Text className="ml-1.5 text-text text-[11px] font-bold tracking-wide">
              BOOKING PLACED
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View className="items-center mt-5">
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{ backgroundColor: '#E6F7E3' }}
          >
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <CheckCircle2 size={36} color={BRAND_GREEN_DARK} fill="#E6F7E3" />
            </View>
          </View>
          <Text className="text-text text-2xl font-extrabold mt-3">
            Thank You!
          </Text>
          <Text className="text-text-muted text-[13px] mt-1">
            Your booking has been placed successfully.
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Tracking ID floating card */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center justify-between"
            style={cardShadow}
          >
            <View className="flex-1">
              <Text className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400" style={{ letterSpacing: 1 }}>
                Tracking ID
              </Text>
              <Text className="text-[16px] font-extrabold text-gray-900 mt-0.5">
                #{displayTrackingId}
              </Text>
            </View>
            <View
              className="px-3 py-1.5 rounded-full flex-row items-center"
              style={{ backgroundColor: '#E6F7E3' }}
            >
              <View
                className="w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: ACCENT_GREEN }}
              />
              <Text
                className="text-[11px] font-bold"
                style={{ color: BRAND_GREEN_DARK }}
              >
                Order Placed
              </Text>
            </View>
          </View>
        </View>

        {/* Customer Details */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={User} label="CUSTOMER DETAILS" />
            {shopName ? <DetailRow icon={Store} label="Shop" value={shopName} /> : null}
            <DetailRow icon={User} label="Customer Name" value={customerName} />
            <DetailRow icon={Phone} label="Mobile" value={mobileNumber} />
            {address ? <DetailRow icon={MapPin} label="Address" value={address} /> : null}
          </View>
        </View>

        {/* Device & Repair */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={Smartphone} label="DEVICE & REPAIR" />
            <DetailRow icon={Smartphone} label="Device" value={deviceList} />
            <DetailRow icon={Wrench} label="Repair Services" value={repairServices} />
          </View>
        </View>

        {/* Service Information */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={Activity} label="SERVICE INFORMATION" />
            <DetailRow icon={Hash} label="Tracking ID" value={displayTrackingId} />
            <DetailRow icon={Activity} label="Service Status" value="Order Placed" />

            <View
              className="mt-3 p-4 rounded-2xl flex-row items-center justify-between"
              style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
            >
              <View className="flex-row items-center">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: BRAND_GREEN }}
                >
                  <IndianRupee size={16} color="#FFFFFF" />
                </View>
                <View>
                  <Text className="text-[10.5px] uppercase font-semibold text-gray-500" style={{ letterSpacing: 0.6 }}>
                    Estimated Price
                  </Text>
                  <Text className="text-[11px] text-gray-500">
                    Final amount after diagnosis
                  </Text>
                </View>
              </View>
              <Text
                className="text-[18px] font-extrabold"
                style={{ color: BRAND_GREEN_DARK }}
              >
                {displayPrice}
              </Text>
            </View>

            {/* Payment, in the same order as Device Details → Price Summary. */}
            {payment ? (
              <>
                <View className="flex-row items-center mt-3">
                  <Text className="flex-1 text-[12.5px] text-gray-700">{payment.label}</Text>
                  <Text className="text-[13px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
                    − ₹{Number(payment.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View
                  className="flex-row items-center mt-2 pt-2"
                  style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
                >
                  <Text className="flex-1 text-[12.5px] font-extrabold text-gray-900">Balance Amount</Text>
                  <Text
                    className="text-[15px] font-extrabold"
                    style={{ color: payment.balance > 0 ? '#B45309' : BRAND_GREEN_DARK }}
                  >
                    ₹{Number(payment.balance).toLocaleString('en-IN')}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Quick Actions */}
        <View className="px-3 mt-5">
          <View className="flex-row">
            <QuickAction
              icon={UserCog}
              label="Assign"
              sub="Technician"
              onPress={handleAssignTechnician}
            />
            <QuickAction
              icon={Share2}
              label="Share"
              sub="Receipt"
              tint="#F0F8EF"
              accent="#16BB05"
              onPress={handleInvoice}
            />
            <QuickAction
              icon={QrCode}
              label="Barcode"
              sub="E-Print"
              tint="#F0F8EF"
              accent="#16BB05"
              onPress={handleBarcode}
            />
          </View>
        </View>

        {/* Primary CTA */}
        <View className="px-4 mt-5">
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleAssignTechnician}
            style={cardShadow}
          >
            <LinearGradient
              colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 18,
                paddingVertical: 16,
                paddingHorizontal: 18,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserCog size={18} color="#FFFFFF" />
              <Text className="ml-2 text-white text-[15px] font-extrabold">
                Assign To Technician
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
