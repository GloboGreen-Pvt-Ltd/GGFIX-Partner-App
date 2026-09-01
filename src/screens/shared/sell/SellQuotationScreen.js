import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import colors from '../../../theme/colors';
import { Loader, Empty } from '../../../components/ui';
import { getSellOrderQuotations } from '../../../api/orders';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 12 },
  table: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 8 },
  headerRow: { flexDirection: 'row', backgroundColor: '#EFF5EE', padding: 8 },
  row: { flexDirection: 'row', padding: 8, borderBottomColor: '#EFF5EE', borderBottomWidth: 1 },
  cell: { flex: 1, fontSize: 12, color: colors.text },
  link: { color: '#16BB05' },
});

export default function SellQuotationScreen({ route }) {
  const sellOrderId = route?.params?.sellOrderId;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setItems(await getSellOrderQuotations(sellOrderId)); } catch (_) {}
      setLoading(false);
    })();
  }, [sellOrderId]);
  if (loading) return <Loader />;
  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Total Quotation : {items.length}</Text>
      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.cell, { fontWeight: '700' }]}>S.No</Text>
          <Text style={[styles.cell, { fontWeight: '700', flex: 2 }]}>Shop Name</Text>
          <Text style={[styles.cell, { fontWeight: '700' }]}>Mobile</Text>
          <Text style={[styles.cell, { fontWeight: '700' }]}>City</Text>
          <Text style={[styles.cell, { fontWeight: '700' }]}>Price</Text>
        </View>
        {items.length === 0 ? <Empty text="No quotations yet" /> : items.map((q, i) => (
          <View key={q.id} style={styles.row}>
            <Text style={styles.cell}>{i + 1}.</Text>
            <Text style={[styles.cell, styles.link, { flex: 2 }]}>#{q.shopName}</Text>
            <Text style={styles.cell}>{q.shopPhone}</Text>
            <Text style={styles.cell}>{q.shopCity}</Text>
            <Text style={styles.cell}>₹{Number(q.quotationPrice).toLocaleString()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
