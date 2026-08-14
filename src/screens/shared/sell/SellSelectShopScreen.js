import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { notify } from '../../../components/confirm';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../../theme/colors';
import { Loader, PrimaryButton, Empty } from '../../../components/ui';
import { getSellOrderQuotations, chooseSellQuotation } from '../../../api/orders';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  bottom: { padding: 12, backgroundColor: '#fff', borderTopColor: colors.border, borderTopWidth: 1 },
});

export default function SellSelectShopScreen({ navigation, route }) {
  const sellOrderId = route?.params?.sellOrderId;
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    (async () => {
      try { setItems(await getSellOrderQuotations(sellOrderId)); } catch (_) {}
      setLoading(false);
    })();
  }, [sellOrderId]);

  const submit = async () => {
    setSaving(true);
    try {
      await chooseSellQuotation(sellOrderId, selectedId);
      navigation.popToTop();
      navigation.navigate('MyOrders');
    } catch (e) { notify('Error', e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Loader />;
  return (
    <View style={styles.container}>
      <ScrollView>
        {items.length === 0 ? <Empty text="No quotations to choose from yet" /> : items.map((q, i) => (
          <TouchableOpacity key={q.id} style={styles.row} onPress={() => setSelectedId(q.id)}>
            <Ionicons name={selectedId === q.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={selectedId === q.id ? '#087A0A' : colors.textSecondary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>{i + 1}. {q.shopName} - {q.shopCity}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Quotation Price - ₹{Number(q.quotationPrice).toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton title="Submit" onPress={submit} loading={saving} disabled={!selectedId} />
      </View>
    </View>
  );
}
