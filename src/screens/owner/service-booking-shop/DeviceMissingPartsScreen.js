import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  Smartphone,
  Layers,
  CreditCard,
  CircleDot,
  Zap,
  Camera,
  Volume2,
  ShieldCheck,
  ClipboardList,
  AlertTriangle,
  X,
  CircleCheck,
  PackageX,
} from 'lucide-react-native';

// Swiggy / Zomato green palette — same as the rest of the booking flow.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';
// Semantic colors for the flag pills — kept red/amber because they're industry-
// standard signals (missing = danger, damaged = warning) and stay legible
// against the green theme without competing with the brand colour.
const COLOR_MISSING = '#DC2626';
const COLOR_DAMAGE  = '#F59E0B';

const PARTS = [
  { id: 'DISPLAY',       name: 'Display',         icon: Smartphone },
  { id: 'BACK_PANEL',    name: 'Back Panel',      icon: Layers },
  { id: 'SIM_TRAY',      name: 'SIM Card Tray',   icon: CreditCard },
  { id: 'BUTTONS',       name: 'Buttons',         icon: CircleDot },
  { id: 'CHARGING_PORT', name: 'Charging Port',   icon: Zap },
  { id: 'CAMERA',        name: 'Camera',          icon: Camera },
  { id: 'SPEAKER',       name: 'Speaker',         icon: Volume2 },
];

export default function DeviceMissingPartsScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  // { [id]: { missing, damage, detail } }
  const [state, setState] = useState(() => {
    const prefill = Array.isArray(params.prefillMissingParts) ? params.prefillMissingParts : [];
    const seed = {};
    for (const p of prefill) {
      const key = p.partId || p.id;
      if (!key) continue;
      seed[key] = { missing: !!p.missing, damage: !!p.damage, detail: p.detail || '' };
    }
    return seed;
  });

  const setField = (id, key, value) =>
    setState((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: value } }));

  const { missingCount, damageCount, flaggedItems } = useMemo(() => {
    let m = 0, d = 0;
    const items = [];
    for (const p of PARTS) {
      const row = state[p.id] || {};
      if (row.missing) m += 1;
      if (row.damage) d += 1;
      if (row.missing || row.damage) {
        items.push({
          partId: p.id,
          partName: p.name,
          missing: !!row.missing,
          damage: !!row.damage,
          detail: row.detail || null,
        });
      }
    }
    return { missingCount: m, damageCount: d, flaggedItems: items };
  }, [state]);

  const flaggedTotal = flaggedItems.length;
  const allClear = flaggedTotal === 0;

  const onContinue = () => {
    navigation.navigate('ServiceBookingDevicesList', {
      ...params,
      missingParts: flaggedItems,
    });
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── White header — matches app's other white headers ─────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 10, paddingBottom: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
      >
        <View className="relative flex-row items-center justify-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute left-0 h-10 w-10 rounded-full bg-surface-muted items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={20} color="#172117" />
          </Pressable>
          <View className="items-center px-12">
            <Text className="text-text text-[16px] font-bold text-center" numberOfLines={1}>
              Device Missing Parts
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 0, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        {/* ── Status card overlapping hero ────────────────────────────── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View className="bg-card rounded-2xl p-3" style={cardShadow}>
            <View className="flex-row items-center">
              <View
                className="h-10 w-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: allClear ? 'rgba(8, 122, 10, 0.15)' : 'rgba(220, 38, 38, 0.10)' }}
              >
                {allClear ? (
                  <CircleCheck size={20} color={ACCENT_GREEN} />
                ) : (
                  <AlertTriangle size={20} color={COLOR_MISSING} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[10px] text-text-muted font-bold tracking-widest">INSPECTION STATUS</Text>
                <Text className="text-[14px] font-extrabold text-text mt-0.5" numberOfLines={1}>
                  {allClear
                    ? 'All parts present & intact'
                    : `${flaggedTotal} part${flaggedTotal === 1 ? '' : 's'} flagged`}
                </Text>
                <Text className="text-[10.5px] text-text-muted mt-0.5">
                  Tap a part below to mark Missing or Damage.
                </Text>
              </View>
            </View>

            {/* Inline counter strip — only shown when at least one flag is set */}
            {!allClear ? (
              <View className="flex-row mt-3">
                {missingCount > 0 ? (
                  <View
                    className="flex-row items-center rounded-full px-2.5 py-1 mr-2"
                    style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
                  >
                    <PackageX size={11} color={COLOR_MISSING} />
                    <Text className="text-[10.5px] font-extrabold ml-1" style={{ color: COLOR_MISSING }}>
                      {missingCount} MISSING
                    </Text>
                  </View>
                ) : null}
                {damageCount > 0 ? (
                  <View
                    className="flex-row items-center rounded-full px-2.5 py-1"
                    style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.40)' }}
                  >
                    <AlertTriangle size={11} color={COLOR_DAMAGE} />
                    <Text className="text-[10.5px] font-extrabold ml-1" style={{ color: COLOR_DAMAGE }}>
                      {damageCount} DAMAGED
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Section rail ──────────────────────────────────────────── */}
        <View className="px-4 pt-5 pb-2 flex-row items-center">
          <ClipboardList size={14} color={BRAND_GREEN_DARK} />
          <Text className="text-text font-extrabold text-[12.5px] tracking-widest ml-1.5">PART CHECKLIST</Text>
          <View className="flex-1 h-px bg-border ml-2" />
        </View>

        {/* ── Part rows — Swiggy menu rhythm ──────────────────────── */}
        <View className="px-4">
          {PARTS.map((p) => {
            const row = state[p.id] || {};
            const anyFlag = row.missing || row.damage;
            const Icon = p.icon;
            return (
              <View
                key={p.id}
                className="rounded-2xl mb-2.5"
                style={{
                  backgroundColor: anyFlag ? 'rgba(8, 122, 10, 0.05)' : '#FFFFFF',
                  borderWidth: anyFlag ? 1.5 : 1,
                  borderColor: anyFlag ? 'rgba(8, 122, 10, 0.35)' : '#E2E8E2',
                  padding: 12,
                  shadowColor: '#172117',
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: anyFlag ? 2 : 1,
                }}
              >
                <View className="flex-row items-center">
                  <View
                    className="h-11 w-11 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: anyFlag ? ACCENT_GREEN : 'rgba(22, 187, 5, 0.10)' }}
                  >
                    <Icon size={20} color={anyFlag ? '#fff' : BRAND_GREEN_DARK} />
                  </View>
                  <Text className="flex-1 font-extrabold text-text text-[14px]" numberOfLines={1}>{p.name}</Text>
                </View>

                {/* Flag pills row */}
                <View className="flex-row mt-2.5">
                  <FlagPill
                    label="Missing"
                    active={!!row.missing}
                    activeBg={COLOR_MISSING}
                    onPress={() => setField(p.id, 'missing', !row.missing)}
                    className="flex-1 mr-2"
                  />
                  <FlagPill
                    label="Damage"
                    active={!!row.damage}
                    activeBg={COLOR_DAMAGE}
                    onPress={() => setField(p.id, 'damage', !row.damage)}
                    className="flex-1"
                  />
                </View>

                {/* Detail textbox — only when something is flagged */}
                {anyFlag ? (
                  <TextInput
                    placeholder="Add details (optional, e.g. cracked at corner)"
                    placeholderTextColor="#8FA08F"
                    value={row.detail || ''}
                    onChangeText={(v) => setField(p.id, 'detail', v)}
                    className="mt-2.5 rounded-xl px-3 py-2.5 text-text text-[13px]"
                    style={{ backgroundColor: '#F7FAF7', borderWidth: 1, borderColor: '#E2E8E2' }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        {/* ── Trust strip ─────────────────────────────────────────── */}
        <View className="px-4 mt-4">
          <View className="flex-row items-center justify-around py-3 rounded-2xl bg-card" style={cardShadow}>
            <TrustItem icon={ShieldCheck} label="Documented pre-repair" />
            <View className="h-8 w-px bg-border" />
            <TrustItem icon={ClipboardList} label="Owner-signed" />
            <View className="h-8 w-px bg-border" />
            <TrustItem icon={CircleCheck} label="No surprises" />
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky green CTA — same shape as siblings ────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={onContinue}
          className="active:opacity-90"
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            shadowColor: BRAND_GREEN_DARK,
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          }}
        >
          <LinearGradient
            colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text className="text-white text-[11px] font-bold opacity-90">
                {allClear
                  ? 'NO ISSUES FLAGGED'
                  : `${flaggedTotal} PART${flaggedTotal === 1 ? '' : 'S'} FLAGGED`}
              </Text>
              <Text className="text-white text-[16px] font-extrabold" numberOfLines={1}>
                Next: Review & Submit
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-white text-[14px] font-extrabold">Continue</Text>
              <ChevronRight size={18} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function FlagPill({ label, active, activeBg, onPress, className }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full active:opacity-80 ${className || ''}`}
      style={{
        backgroundColor: active ? activeBg : '#FFFFFF',
        borderWidth: 1,
        borderColor: active ? activeBg : '#E2E8E2',
        paddingVertical: 8,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        shadowColor: active ? activeBg : 'transparent',
        shadowOpacity: active ? 0.22 : 0,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: active ? 2 : 0,
      }}
    >
      {active ? (
        <X size={12} color="#fff" style={{ marginRight: 4 }} />
      ) : null}
      <Text
        className="text-[12px] font-extrabold"
        style={{ color: active ? '#FFFFFF' : '#667066' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TrustItem({ icon: Icon, label }) {
  return (
    <View className="items-center flex-1">
      <Icon size={16} color={ACCENT_GREEN} />
      <Text className="text-text-muted text-[10px] font-extrabold mt-1 text-center" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
