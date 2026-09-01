import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { Camera, Video } from 'lucide-react-native';
import {
  AppHeader, Card, BottomActionBar, Loader, ErrorState, ScreenContainer, useBottomBarInset,
  PriceRow, PriceDivider,
} from '../../components/rnr';
import { tokens } from '../../theme/colors';
import { ticketApi } from '../../api/client';
import { notify } from '../../components/confirm';

function formatINR(amount) {
  if (amount == null) return '0';
  try { return Number(amount).toLocaleString('en-IN'); }
  catch (_) { return String(amount); }
}

function PhotoBox({ label, hint, icon: Icon = Camera, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 mx-1 bg-surface-muted border border-dashed border-border-strong items-center justify-center py-4 active:opacity-80"
      style={{ borderRadius: 14, minHeight: 110 }}
    >
      <View className="h-12 w-12 rounded-full bg-card items-center justify-center mb-2">
        <Icon size={20} color={tokens.primary} />
      </View>
      <Text className="text-[12px] font-extrabold text-text" numberOfLines={1}>{label}</Text>
      {hint ? (
        <Text className="text-[10px] text-text-muted text-center mt-1 px-2" numberOfLines={2}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

export default function DeviceInformationScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const insetBottom = useBottomBarInset();

  const load = useCallback(async () => {
    if (!ticketId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(data);
    } catch (e) {
      setError(e.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !ticket) return <Loader label="Loading ticket..." />;

  const lineItems = ticket?.priceItems || [
    { id: '1', label: 'Display Screen Combo', amount: 5000 },
    { id: '2', label: 'Motherboard', amount: 5000 },
    { id: '3', label: 'Battery', amount: 2500 },
  ];
  const estimatedTotal = ticket?.estimatedPrice != null
    ? ticket.estimatedPrice
    : lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);

  const complaint = ticket?.issueDescription
    || 'Phone Display is full Damage, Battery is full low Charging and fast down change';

  const handleSubmit = () => {
    navigation.navigate('BookingSummary', { ticketId });
  };

  const handlePhotoPress = () => {
    notify('Photo capture', 'Will be implemented in a follow-up.');
  };

  return (
    <ScreenContainer>
      <AppHeader title="Device Information" subtitle={ticket?.deviceLabel || undefined} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insetBottom + 96 }}>
        {error ? <ErrorState description={error} onRetry={load} className="py-6" /> : null}

        <Card>
          <Text className="text-[14px] font-extrabold text-text mb-2">Price Summary</Text>
          {lineItems.map((item, index) => (
            <PriceRow
              key={item.id || index}
              label={item.label}
              value={`₹${formatINR(item.amount)}`}
            />
          ))}
          <PriceDivider />
          <View className="flex-row items-center justify-between">
            <Text className="text-[13px] font-bold text-text">Estimated Repair Amount</Text>
            <Text className="text-[16px] font-extrabold text-primary">₹{formatINR(estimatedTotal)}</Text>
          </View>
        </Card>

        <View className="h-3" />
        <Card>
          <Text className="text-[14px] font-extrabold text-text mb-1.5">Complaint</Text>
          <Text className="text-[12.5px] text-text-muted leading-5">{complaint}</Text>

          <View className="h-3" />
          <Text className="text-[14px] font-extrabold text-text mb-1.5">Estimated Time</Text>
          <Text className="text-[12.5px] text-text-muted">{ticket?.estimatedTime || 'Sat, Dec 27 2025 · 6:30 PM · ~2 Hr'}</Text>

          <View className="h-3" />
          <Text className="text-[14px] font-extrabold text-text mb-1.5">Estimated Delivery</Text>
          <Text className="text-[12.5px] text-text-muted">{ticket?.estimatedDelivery || 'Sat, Dec 27 2025 · 8:30 PM'}</Text>
        </Card>

        <View className="h-3" />
        <Card>
          <Text className="text-[14px] font-extrabold text-text mb-2">Device Photos</Text>
          <View className="flex-row -mx-1">
            <PhotoBox label="Front Side" hint="Tap to capture" onPress={handlePhotoPress} />
            <PhotoBox label="Back Side" hint="Tap to capture" onPress={handlePhotoPress} />
            <PhotoBox label="Full Coverage" hint="Record a video" icon={Video} onPress={handlePhotoPress} />
          </View>
        </Card>
      </ScrollView>

      <BottomActionBar
        title="Submit"
        onPress={handleSubmit}
        priceCaption="Total Estimate"
        priceValue={`₹${formatINR(estimatedTotal)}`}
        insetBottom={insetBottom}
      />
    </ScreenContainer>
  );
}
