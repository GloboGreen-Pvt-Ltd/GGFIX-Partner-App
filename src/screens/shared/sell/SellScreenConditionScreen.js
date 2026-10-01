import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Loader } from '../../../components/ui';
import { getConditionGroups, getConditionOptions } from '../../../api/masterData';
import { SELL, SellButton, SellCard, SellFooter, SellIntro, EditingBanner, CheckDot } from './sellTheme';

// Stable per-option key for the selected state. An option without an id would
// otherwise compare `undefined === undefined` and render as selected before
// anything was tapped. (The payload still carries the option's real id.)
const optKey = (g, o) => (o.id != null ? o.id : `${g.id}::${o.label}`);

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

  const done = groups.filter((g) => selected[g.id]).length;

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {isEditing ? <EditingBanner text="Your previous condition picks are pre-selected." /> : null}
        <SellIntro title="Physical condition" caption="Pick the option that best matches each part of the device." />
        {groups.map((g) => {
          const opts = (optsByGroup[g.id]?.length ? optsByGroup[g.id] : (g.options || []).map((o, i) => ({ id: `${g.id}-${i}`, label: o })));
          const sel = selected[g.id];
          return (
            <SellCard key={g.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: SELL.ink }}>{g.name}</Text>
                {sel ? <CheckDot size={18} /> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                {opts.map((o) => {
                  const key = optKey(g, o);
                  const active = !!sel && (sel.key ?? sel.id) === key;
                  return (
                    <View key={key} style={{ width: '33.333%', padding: 4 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setSelected({ ...selected, [g.id]: { id: o.id, key, label: o.label, groupCode: g.code, groupName: g.name } })}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        style={{
                          minHeight: 56, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5,
                          alignItems: 'center', justifyContent: 'center',
                          borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.greenLight : SELL.card,
                        }}
                      >
                        <Text style={{ fontSize: 12, lineHeight: 16, textAlign: 'center', fontWeight: active ? '700' : '600', color: active ? SELL.greenDark : SELL.ink }}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </SellCard>
          );
        })}
      </ScrollView>
      <SellFooter caption={groups.length ? `${done} of ${groups.length} sections done` : null}>
        <SellButton
          title="Continue"
          arrow
          disabled={groups.some((g) => !selected[g.id])}
          onPress={() => navigation.navigate('SellFunctional', { ...params, conditions: Object.values(selected).map((s) => ({ groupCode: s.groupCode, optionId: s.id, optionLabel: s.label, groupName: s.groupName })) })}
        />
      </SellFooter>
    </View>
  );
}
