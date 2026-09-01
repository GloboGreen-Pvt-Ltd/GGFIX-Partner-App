import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import {
  AppHeader, Card, BottomActionBar, Loader, ScreenContainer, useBottomBarInset,
} from '../../../components/rnr';
import { tokens } from '../../../theme/colors';
import { getConfigFields } from '../../../api/masterData';

export default function SellDeviceConfigScreen({ navigation, route }) {
  const params = route.params || {};
  const [fields, setFields] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [selected, setSelected] = useState({}); // { [fieldId]: { id, value } }
  const [loading, setLoading] = useState(true);
  const insetBottom = useBottomBarInset();

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

  return (
    <ScreenContainer>
      <AppHeader title="Device Configuration" subtitle="Tell us about the device" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insetBottom + 96 }}>
        {fields.map((f) => {
          const sel = selected[f.id];
          const opts = f.options || [];
          const open = openId === f.id;
          return (
            <View key={f.id} className="mb-3">
              <Card padded={false}>
                <View className="p-4">
                  <Text className="text-[13px] font-extrabold text-text mb-2">{f.name}</Text>
                  <Pressable
                    onPress={() => setOpenId(open ? null : f.id)}
                    className={`flex-row items-center bg-surface-muted px-3 py-3 ${open ? 'border border-primary' : 'border border-transparent'}`}
                    style={{ borderRadius: 12 }}
                  >
                    <Text className={`flex-1 text-[13px] ${sel ? 'text-text font-bold' : 'text-text-subtle'}`} numberOfLines={1}>
                      {sel ? sel.value : `Select ${f.name}`}
                    </Text>
                    {open ? <ChevronUp size={16} color={tokens.textMuted} /> : <ChevronDown size={16} color={tokens.textMuted} />}
                  </Pressable>
                </View>
                {open ? (
                  <View className="border-t border-border">
                    {opts.map((o, idx) => {
                      const active = sel?.id === o.id;
                      return (
                        <Pressable
                          key={o.id}
                          onPress={() => choose(f.id, o)}
                          className={`flex-row items-center px-4 py-3 ${idx < opts.length - 1 ? 'border-b border-border' : ''} active:opacity-70`}
                        >
                          <Text className={`flex-1 text-[13px] ${active ? 'text-primary font-extrabold' : 'text-text'}`}>{o.value}</Text>
                          {active ? <Check size={16} color={tokens.primary} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            </View>
          );
        })}
      </ScrollView>
      <BottomActionBar
        title="Continue"
        onPress={onContinue}
        disabled={!allChosen}
        insetBottom={insetBottom}
      />
    </ScreenContainer>
  );
}
