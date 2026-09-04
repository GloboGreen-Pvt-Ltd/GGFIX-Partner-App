import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, ChevronRight, Smartphone, Layers, CreditCard, CircleDot, Zap, Camera,
  Volume2, ClipboardList, X, CircleCheck, PackageX,
} from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { rf, rs } from '../../../utils/responsive';

/**
 * Device Missing Parts — a screen, reached from the Device Security Lock popup
 * on Device Information.
 *
 * KeyboardAwareScrollView, not the manual `useKeyboardHeight` dance the sheets
 * use: that hook exists because a RN `Modal` is a separate window the root
 * <KeyboardProvider> doesn't instrument. On a SCREEN the provider IS in play, so
 * the library is the right tool — see `lib/hooks/useKeyboardHeight` for the full why.
 */
const ACCENT = '#004C40';
const ACCENT_10 = 'rgba(0, 76, 64, 0.10)';
const ACCENT_35 = 'rgba(0, 76, 64, 0.35)';
const WHITE = '#FFFFFF';
const INK = '#172117';
const MUTED = '#8FA08F';
const SUB = '#667066';
const LINE = '#E2E8E2';
const SOFT = '#F8F8F8';

// Semantic colours for the flag pills — kept red/amber because missing = danger
// and damaged = warning are industry-standard signals, and they read against
// #004C40 without competing with it. #B45309 rather than amber-500 #F59E0B,
// which measures 2.15:1 on white and fails AA.
const COLOR_MISSING = '#DC2626';
const COLOR_DAMAGE = '#B45309';

const PARTS = [
  { id: 'DISPLAY', name: 'Display', icon: Smartphone },
  { id: 'BACK_PANEL', name: 'Back Panel', icon: Layers },
  { id: 'SIM_TRAY', name: 'SIM Card Tray', icon: CreditCard },
  { id: 'BUTTONS', name: 'Buttons', icon: CircleDot },
  { id: 'CHARGING_PORT', name: 'Charging Port', icon: Zap },
  { id: 'CAMERA', name: 'Camera', icon: Camera },
  { id: 'SPEAKER', name: 'Speaker', icon: Volume2 },
];

export default function DeviceMissingPartsScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const r = useResponsive();

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

  // Tablets: cap the column. Full-bleed rows on a 10" screen put a part name and
  // its flag pills a hand's width apart.
  const colW = r.isTablet ? Math.min(r.width - rs(32), rs(700)) : undefined;
  const col = colW ? { width: colW, alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: WHITE }}>
      {/* ── White header — matches the app's other white headers ─────── */}
      <View
        style={{
          backgroundColor: WHITE,
          paddingTop: insets.top + rs(10),
          paddingBottom: rs(14),
          paddingHorizontal: rs(16),
          borderBottomWidth: 1,
          borderBottomColor: LINE,
        }}
      >
        <View className="flex-row items-center" style={col}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center justify-center active:opacity-70"
            style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: SOFT }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={rf(20)} color={INK} strokeWidth={2} />
          </Pressable>
          <Text
            className="flex-1 text-text text-center"
            style={{ fontSize: rf(16), fontWeight: '700', paddingHorizontal: rs(8) }}
            numberOfLines={1}
          >
            Device Missing Parts
          </Text>
          {/* Balances the back button so the title stays optically centred. */}
          <View style={{ width: rs(40) }} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={rs(140)}
        contentContainerStyle={{ paddingBottom: rs(150), ...(col || {}) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Status strip ──────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: rs(16), marginTop: rs(12) }}>
          <View
            className="flex-row items-center"
            style={{
              borderRadius: rs(12),
              padding: rs(10),
              backgroundColor: allClear ? ACCENT_10 : 'rgba(220, 38, 38, 0.08)',
            }}
          >
            <View
              className="items-center justify-center"
              style={{ height: rs(38), width: rs(38), borderRadius: rs(11), marginRight: rs(10), backgroundColor: WHITE }}
            >
              {allClear
                ? <CircleCheck size={rf(19)} color={ACCENT} strokeWidth={2} />
                : <PackageX size={rf(19)} color={COLOR_MISSING} strokeWidth={2} />}
            </View>
            <View className="flex-1">
              <Text className="text-text" style={{ fontSize: rf(13.5), fontWeight: '700' }} numberOfLines={1}>
                {allClear ? 'All parts present' : `${flaggedTotal} part${flaggedTotal === 1 ? '' : 's'} flagged`}
              </Text>
              <Text style={{ fontSize: rf(11.5), color: SUB, marginTop: rs(1) }} numberOfLines={1}>
                {allClear
                  ? 'Flag anything missing or damaged below.'
                  : [missingCount ? `${missingCount} missing` : null, damageCount ? `${damageCount} damaged` : null]
                      .filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Part checklist ───────────────────────────────────────── */}
        <View className="flex-row items-center" style={{ paddingHorizontal: rs(16), paddingTop: rs(16), paddingBottom: rs(8) }}>
          <ClipboardList size={rf(14)} color={MUTED} strokeWidth={2} />
          <Text className="text-text-muted" style={{ fontSize: rf(11.5), fontWeight: '600', letterSpacing: 1.2, marginLeft: rs(6) }}>
            PART CHECKLIST
          </Text>
        </View>

        <View style={{ paddingHorizontal: rs(16) }}>
          {PARTS.map((p) => {
            const row = state[p.id] || {};
            const anyFlag = row.missing || row.damage;
            const Icon = p.icon;
            return (
              <View
                key={p.id}
                style={{
                  borderRadius: rs(12),
                  marginBottom: rs(8),
                  padding: rs(10),
                  // OPAQUE on purpose: Android renders an `elevation` shadow
                  // through a translucent fill, which shows as a grey box behind
                  // the flagged row.
                  backgroundColor: anyFlag ? '#F2F6F5' : WHITE,
                  borderWidth: anyFlag ? 1.5 : 1,
                  borderColor: anyFlag ? ACCENT_35 : LINE,
                }}
              >
                <View className="flex-row items-center">
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(38), width: rs(38), borderRadius: rs(11), marginRight: rs(10), backgroundColor: anyFlag ? ACCENT : ACCENT_10 }}
                  >
                    <Icon size={rf(18)} color={anyFlag ? WHITE : ACCENT} strokeWidth={2} />
                  </View>
                  <Text className="flex-1 text-text" style={{ fontSize: rf(13.5), fontWeight: '600' }} numberOfLines={1}>
                    {p.name}
                  </Text>
                </View>

                <View className="flex-row" style={{ marginTop: rs(8) }}>
                  <FlagPill
                    label="Missing"
                    active={!!row.missing}
                    tint={COLOR_MISSING}
                    onPress={() => setField(p.id, 'missing', !row.missing)}
                    style={{ flex: 1, marginRight: rs(8) }}
                  />
                  <FlagPill
                    label="Damage"
                    active={!!row.damage}
                    tint={COLOR_DAMAGE}
                    onPress={() => setField(p.id, 'damage', !row.damage)}
                    style={{ flex: 1 }}
                  />
                </View>

                {anyFlag ? (
                  <TextInput
                    placeholder="Add details (optional, e.g. cracked at corner)"
                    placeholderTextColor={MUTED}
                    value={row.detail || ''}
                    onChangeText={(v) => setField(p.id, 'detail', v)}
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    className="text-text"
                    style={{
                      marginTop: rs(8),
                      borderRadius: rs(10),
                      paddingHorizontal: rs(12),
                      paddingVertical: rs(9),
                      fontSize: rf(12.5),
                      backgroundColor: SOFT,
                      borderWidth: 1,
                      borderColor: LINE,
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </KeyboardAwareScrollView>

      {/* ── Sticky CTA ───────────────────────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: 0, backgroundColor: WHITE, paddingHorizontal: rs(16), paddingTop: rs(10), paddingBottom: insets.bottom + rs(8) }}
      >
        <View style={col}>
          <Pressable
            onPress={onContinue}
            className="flex-row items-center active:opacity-90"
            style={{ borderRadius: rs(16), paddingHorizontal: rs(14), paddingVertical: rs(12), backgroundColor: ACCENT }}
            accessibilityRole="button"
          >
            <View className="flex-1">
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: rf(10.5), fontWeight: '600', letterSpacing: 1 }}>
                {allClear ? 'NO ISSUES FLAGGED' : `${flaggedTotal} PART${flaggedTotal === 1 ? '' : 'S'} FLAGGED`}
              </Text>
              <Text className="text-white" style={{ fontSize: rf(14.5), fontWeight: '700', marginTop: rs(1) }} numberOfLines={1}>
                Next: Review &amp; Submit
              </Text>
            </View>
            <ChevronRight size={rf(18)} color={WHITE} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function FlagPill({ label, active, tint, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-center active:opacity-80"
      style={[
        {
          borderRadius: 999,
          paddingVertical: rs(8),
          backgroundColor: active ? tint : WHITE,
          borderWidth: 1,
          borderColor: active ? tint : LINE,
        },
        style,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!active }}
    >
      {active ? <X size={rf(11)} color={WHITE} strokeWidth={2.5} style={{ marginRight: rs(4) }} /> : null}
      <Text style={{ fontSize: rf(12), fontWeight: '600', color: active ? WHITE : SUB }}>
        {label}
      </Text>
    </Pressable>
  );
}
