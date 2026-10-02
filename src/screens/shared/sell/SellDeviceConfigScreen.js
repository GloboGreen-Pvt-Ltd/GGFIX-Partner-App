import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { getConfigFields } from '../../../api/masterData';
import { SELL, SellButton, SellCard, SellFooter, SellIntro } from './sellTheme';

export default function SellDeviceConfigScreen({ navigation, route }) {
  const params = route.params || {};
  const [fields, setFields] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [selected, setSelected] = useState({}); // { [fieldId]: { id, value } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getConfigFields(params.device?.categoryId);
        if (cancelled) return;
        const active = (list || []).filter((f) => f.isActive !== false);
        if (active.length === 0) {
          navigation.replace('SellAccessoriesWarranty', params);
          return;
        }
        setFields(active);
      } catch (_) {
        navigation.replace('SellAccessoriesWarranty', params);
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const choose = (fieldId, opt) => {
    setSelected((p) => ({ ...p, [fieldId]: { id: opt.id, value: opt.value } }));
    setOpenId(null);
  };

  const onContinue = () => {
    const deviceConfig = fields.map((f) => ({
      fieldId: f.id,
      fieldCode: f.code,
      fieldName: f.name,
      optionId: selected[f.id]?.id || null,
      value: selected[f.id]?.value || null,
    }));
    navigation.navigate('SellAccessoriesWarranty', { ...params, deviceConfig });
  };

  if (loading) return <Loader label="Loading configuration..." />;

  const allChosen = fields.every((f) => selected[f.id]);

  // The stack header (OwnerNavigator: "Device Configuration") is this
  // screen's only header — it used to draw a second one of its own below it.
  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <SellIntro title="Device configuration" caption="Tell us about the device's configuration." />
        {fields.map((f) => {
          const sel = selected[f.id];
          const opts = f.options || [];
          const open = openId === f.id;
          return (
            <SellCard key={f.id} style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink, marginBottom: 8 }}>{f.name}</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setOpenId(open ? null : f.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 12, borderRadius: 12,
                    borderWidth: 1.5, borderColor: open || sel ? SELL.green : SELL.line, backgroundColor: sel ? SELL.greenLight : SELL.card,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: sel ? '700' : '500', color: sel ? SELL.greenDark : SELL.subtle }} numberOfLines={1}>
                    {sel ? sel.value : `Select ${f.name}`}
                  </Text>
                  {open ? <ChevronUp size={18} color={SELL.muted} /> : <ChevronDown size={18} color={SELL.muted} />}
                </TouchableOpacity>
              </View>
              {open ? (
                <View style={{ borderTopWidth: 1, borderTopColor: SELL.soft }}>
                  {opts.map((o, idx) => {
                    const active = sel?.id === o.id;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        activeOpacity={0.7}
                        onPress={() => choose(f.id, o)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
                          borderBottomWidth: idx < opts.length - 1 ? 1 : 0, borderBottomColor: SELL.soft,
                          backgroundColor: active ? SELL.greenLight : SELL.card,
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: active ? '700' : '500', color: active ? SELL.greenDark : SELL.ink }}>{o.value}</Text>
                        {active ? <Check size={18} color={SELL.green} strokeWidth={2.6} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </SellCard>
          );
        })}
      </ScrollView>
      <SellFooter caption={fields.length ? `${fields.filter((f) => selected[f.id]).length} of ${fields.length} selected` : null}>
        <SellButton title="Continue" arrow onPress={onContinue} disabled={!allChosen} />
      </SellFooter>
    </View>
  );
}
