import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { Loader } from '../../../components/ui';
import { getFunctionalIssues } from '../../../api/masterData';
import { SELL, SellButton, SellCard, SellFooter, SellIntro, EditingBanner, CheckDot } from './sellTheme';

const FALLBACK = ['Battery issue','Battery Replaced Local Market','Flash Light Not Working','Front Camera not working','Back Camera not working','Camera Glass Broken','Sim Slot Broken','Network issues','Speaker not working','Mic not working','Touch Id or Face Id not working','Volume Button not working','WiFi or Bluetooth not working','Charging Port not working','Proximity Sensor not working','Power button not working','Ear Speaker not working or low','Vibrator not working'];

export default function SellFunctionalScreen({ navigation, route }) {
  const params = route.params || {};
  const { editSellOrderId, editHints } = params;
  const isEditing = !!editSellOrderId;
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);

  // Indices for quick lookup of previously-saved issues.
  const priorById = useMemo(() => {
    const set = new Set();
    (editHints?.issues || []).forEach((i) => { if (i?.issueId) set.add(i.issueId); });
    return set;
  }, [editHints]);
  const priorByCode = useMemo(() => {
    const set = new Set();
    (editHints?.issues || []).forEach((i) => {
      if (i?.issueCode) set.add(String(i.issueCode).toLowerCase());
    });
    return set;
  }, [editHints]);

  useEffect(() => {
    (async () => {
      try {
        const list = await getFunctionalIssues(params.device?.categoryId);
        const finalList = list.length ? list : FALLBACK.map((n, i) => ({ id: `f${i}`, name: n }));
        setIssues(finalList);

        if (isEditing) {
          const seed = finalList
            .filter((it) =>
              priorById.has(it.id)
              || (it.code && priorByCode.has(String(it.code).toLowerCase()))
              || (it.name && priorByCode.has(String(it.name).toLowerCase())),
            )
            .map((it) => it.id);
          if (seed.length) setSelected(seed);
        }
      } catch (_) {
        setIssues(FALLBACK.map((n, i) => ({ id: `f${i}`, name: n })));
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (id) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  if (loading) return <Loader />;
  const count = selected.length;
  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {isEditing ? <EditingBanner text="Previously reported issues are pre-selected." /> : null}
        <SellIntro title="Functionality issues" caption="Tap every issue the device has. Leave all unselected if it works fine." />
        <SellCard>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {issues.map((it) => {
              const active = selected.includes(it.id);
              return (
                <View key={it.id} style={{ width: '33.333%', padding: 4 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => toggle(it.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    style={{
                      minHeight: 84, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1.5,
                      alignItems: 'center', justifyContent: 'center',
                      borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.greenLight : SELL.card,
                    }}
                  >
                    {active ? (
                      <CheckDot size={22} />
                    ) : (
                      <View style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: SELL.amberLight, alignItems: 'center', justifyContent: 'center' }}>
                        <TriangleAlert size={15} color={SELL.amber} strokeWidth={2.2} />
                      </View>
                    )}
                    <Text style={{ fontSize: 11.5, lineHeight: 15, marginTop: 6, textAlign: 'center', fontWeight: active ? '700' : '600', color: active ? SELL.greenDark : SELL.ink }} numberOfLines={3}>
                      {it.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </SellCard>
      </ScrollView>
      <SellFooter caption={count ? `${count} issue${count === 1 ? '' : 's'} selected` : 'No issues selected'}>
        <SellButton title="Continue" arrow onPress={() => navigation.navigate('SellDeviceConfig', { ...params, issues: selected.map((id) => ({ issueId: id })) })} />
      </SellFooter>
    </View>
  );
}
