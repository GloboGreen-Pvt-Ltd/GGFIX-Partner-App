import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { Avatar, Button, Card, ScreenHeader } from '../../../components/rnr';
import { authApi, ticketApi } from '../../../api/client';
import { selectShopId } from '../../../store/authSlice';
import { notify } from '../../../components/confirm';

export default function AssignTechnicianScreen({ navigation, route }) {
  const shopId = useSelector(selectShopId);
  const { tickets = [], customer, devices, returnToTicketId } = route?.params || {};
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await authApi.get(`/auth/shops/${shopId}/technicians`);
        setTechs(Array.isArray(data) ? data : []);
      } catch (_) { setTechs([]); }
      setLoading(false);
    })();
  }, [shopId]);

  const assign = async (tech) => {
    setBusy(tech.id);
    try {
      for (const t of tickets) {
        await ticketApi.patch(`/tickets/${t.id}`, { body: { assignedTechnicianId: tech.id } });
      }
      // Re-assign flow from TicketDetail: pop back so the detail screen's
      // focus listener refetches and shows the new technician.
      if (returnToTicketId) {
        notify('Technician assigned', `${tech.name || 'Technician'} has been assigned.`);
        navigation.goBack();
        return;
      }
      navigation.replace('BookingSuccessful', { tickets, customer, devices, assignedTech: tech });
    } catch (e) {
      notify('Error', e?.message || 'Failed to assign');
    } finally { setBusy(null); }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Technician Assign" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerClassName="px-4 pt-4 pb-12">
        <View className="flex-row items-center mb-4">
          <Ionicons name="person" size={22} color="#172117" />
          <Text className="ml-2 font-bold text-text">All Technician List</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#004C40" />
        ) : techs.length === 0 ? (
          <Text className="text-text-muted text-center py-12">No technicians registered for this shop</Text>
        ) : techs.map((t) => {
          const isAvailable = t.isAvailable !== false;
          const statusLabel = isAvailable ? 'Available' : 'Unavailable';
          const statusColor = isAvailable ? 'text-success' : 'text-error';
          return (
            <Card key={t.id} className="mb-3 flex-row items-center">
              <Avatar fallback={(t.name || '?').slice(0, 2)} size={40} />
              <View className="flex-1 ml-3">
                <Text className="font-bold text-text">{t.name} {t.code ? `- ${t.code}` : ''}</Text>
                <Text className="text-xs text-text-muted">
                  {t.roleLabel || 'Technician'} <Text className={`font-semibold ${statusColor}`}>● {statusLabel}</Text>
                </Text>
              </View>
              <Button
                variant="secondary"
                // Explicit hex, not `bg-primary`: NativeWind's cached stylesheet
                // still carries the old green for that token. `bg-purple-500`
                // was here before and was simply wrong — nothing else in this
                // app is purple. Button forwards `style` onto its Pressable.
                style={{ backgroundColor: '#004C40' }}
                size="sm"
                loading={busy === t.id}
                disabled={!isAvailable}
                onPress={() => assign(t)}
              >
                Assign
              </Button>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
