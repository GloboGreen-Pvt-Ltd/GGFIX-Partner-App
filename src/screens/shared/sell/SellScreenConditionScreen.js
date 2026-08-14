import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../../theme/colors';
import { Card, PrimaryButton, Loader } from '../../../components/ui';
import { getConditionGroups, getConditionOptions } from '../../../api/masterData';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  optTile: { width: '31.33%', marginHorizontal: '1%', marginBottom: 6, paddingVertical: 7, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', minHeight: 44 },
  optTileActive: { borderColor: '#087A0A', borderWidth: 2 },
  optLabel: { fontSize: 10, lineHeight: 13, color: colors.text, textAlign: 'center', fontWeight: '600' },
  editBanner: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  editBannerTitle: { fontSize: 10, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
  editBannerText: { fontSize: 12, color: colors.text, fontWeight: '600', marginTop: 2 },
  bottom: { padding: 12, backgroundColor: '#fff', borderTopColor: colors.border, borderTopWidth: 1 },
});

const FALLBACK_GROUPS = [
  { id: 'SCREEN_VISIBLE', code: 'SCREEN_VISIBLE', name: 'Screen Condition on your Device', options: ['No Damage', 'Minor Spot or patches', 'Major Spot or patches', 'Major Spot or patches', 'Discoloration'] },
  { id: 'TOUCH_GLASS', code: 'TOUCH_GLASS', name: 'Touch Glass Condition on your device', options: ['No Damage', '1 or 2 Minor Scratches', 'Heavy Scratches', 'TouchGlass Broken'] },
  { id: 'BACK_PANEL', code: 'BACK_PANEL', name: 'Back Panel Condition on your Device', options: ['No Damage', '1 or 2 Minor Scratches', 'Heavy Scratches or deep scratches', 'Light Cover Marks on Body', 'Heavy Cover Marks on Body', 'Back Panel Broken'] },
  { id: 'SIDE_PANEL', code: 'SIDE_PANEL', name: 'side and Center Panel Condition on your device', options: ['No defects', 'Minor dent or scratches', 'Major dent or heavy scratches', 'Center panel broken or cracked or bend'] },
];

// Display order: Screen → Touch Glass → Back Panel → Side & Center → (others)
const orderRank = (g) => {
  const n = (g.name || g.code || '').toLowerCase();
  if (n.includes('screen')) return 1;
  if (n.includes('touch')) return 2;
  if (n.includes('back')) return 3;
  if (n.includes('side') || n.includes('center')) return 4;
  return 99;
};
const sortGroups = (arr) => [...arr].sort((a, b) => orderRank(a) - orderRank(b));

export default function SellScreenConditionScreen({ navigation, route }) {
  const params = route.params || {};
  const { editSellOrderId, editHints } = params;
  const isEditing = !!editSellOrderId;
  const [groups, setGroups] = useState([]);
  const [optsByGroup, setOptsByGroup] = useState({});
  const [selected, setSelected] = useState({}); // groupId -> {id, label}
  const [loading, setLoading] = useState(true);

  // Index previously-saved options by groupCode (canonical) and groupName
  // (best-effort) so we can resolve them against whichever groups come back.
  const priorByGroupCode = useMemo(() => {
    const m = {};
    (editHints?.conditions || []).forEach((c) => {
      if (c?.groupCode) m[c.groupCode.toUpperCase()] = c;
    });
    return m;
  }, [editHints]);
  const priorByGroupName = useMemo(() => {
    const m = {};
    (editHints?.conditions || []).forEach((c) => {
      if (c?.groupName) m[c.groupName.trim().toLowerCase()] = c;
    });
    return m;
  }, [editHints]);

  useEffect(() => {
    (async () => {
      try {
        const list = await getConditionGroups(params.device?.categoryId);
        const sortedGroups = list.length === 0
          ? sortGroups(FALLBACK_GROUPS)
          : sortGroups(list);
        setGroups(sortedGroups);

        const map = {};
        if (list.length !== 0) {
          for (const g of sortedGroups) {
            map[g.id] = await getConditionOptions(g.id).catch(() => []);
          }
          setOptsByGroup(map);
        }

        // Seed previously-saved selections.
        if (isEditing) {
          const seed = {};
          for (const g of sortedGroups) {
            const prior = priorByGroupCode[(g.code || '').toUpperCase()]
              || priorByGroupName[(g.name || '').trim().toLowerCase()];
            if (!prior) continue;
            // Match by optionId when both sides have UUIDs.
            const opts = (map[g.id]?.length ? map[g.id] : (g.options || []).map((o, i) => ({ id: `${g.id}-${i}`, label: o })));
            const byId = prior.optionId ? opts.find((o) => o.id === prior.optionId) : null;
            const byLabel = prior.optionLabel
              ? opts.find((o) => (o.label || '').trim().toLowerCase() === prior.optionLabel.trim().toLowerCase())
              : null;
            const opt = byId || byLabel;
            if (opt) {
              seed[g.id] = { id: opt.id, label: opt.label, groupCode: g.code, groupName: g.name };
            }
          }
          if (Object.keys(seed).length) setSelected(seed);
        }
      } catch (_) {
        setGroups(sortGroups(FALLBACK_GROUPS));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loader />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {isEditing ? (
          <View style={styles.editBanner}>
            <Ionicons name="create-outline" size={16} color="#92400E" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.editBannerTitle}>EDITING ORDER</Text>
              <Text style={styles.editBannerText}>Your previous condition picks are pre-selected.</Text>
            </View>
          </View>
        ) : null}
        {groups.map((g) => {
          const opts = (optsByGroup[g.id]?.length ? optsByGroup[g.id] : (g.options || []).map((o, i) => ({ id: `${g.id}-${i}`, label: o })));
          return (
            <Card key={g.id} style={{ padding: 10, marginVertical: 4 }}>
              <Text style={styles.groupTitle}>{g.name}</Text>
              <View style={styles.row}>
                {opts.map((o) => {
                  const active = selected[g.id]?.id === o.id;
                  return (
                    <TouchableOpacity key={o.id} style={[styles.optTile, active && styles.optTileActive]} onPress={() => setSelected({ ...selected, [g.id]: { id: o.id, label: o.label, groupCode: g.code, groupName: g.name } })}>
                      <Text style={styles.optLabel}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton title="Continue →" disabled={groups.some((g) => !selected[g.id])} onPress={() => navigation.navigate('SellFunctional', { ...params, conditions: Object.values(selected).map((s) => ({ groupCode: s.groupCode, optionId: s.id, optionLabel: s.label, groupName: s.groupName })) })} />
      </View>
    </View>
  );
}
