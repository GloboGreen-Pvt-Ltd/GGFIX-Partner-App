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
const ACCENT = '#004C40';       // Dark Green
const MINT = '#E7F7F1';
const WHITE = '#FFFFFF';
const INK = '#111827';
const MUTED = '#8FA08F';
const SUB = '#667085';
const LINE = '#DCE7E2';
const SOFT = '#F8F8F8';

// Semantic colours for the flag pills, matched to the app-wide condition
// palette: Missing = amber/warning, Damaged = red/danger.
const MISSING = '#F59E0B';
const MISSING_BG = '#FFF7E6';
const DAMAGE = '#DC2626';
const DAMAGE_BG = '#FFF1F2';

const PARTS = [
  { id: 'DISPLAY', name: 'Display', desc: 'Screen and front panel', icon: Smartphone },
  { id: 'BACK_PANEL', name: 'Back Panel', desc: 'Rear cover and housing', icon: Layers },
  { id: 'SIM_TRAY', name: 'SIM Card Tray', desc: 'SIM card holder', icon: CreditCard },
  { id: 'BUTTONS', name: 'Buttons', desc: 'Power, volume and other buttons', icon: CircleDot },
  { id: 'CHARGING_PORT', name: 'Charging Port', desc: 'USB port and connectors', icon: Zap },
  { id: 'CAMERA', name: 'Camera', desc: 'Front and rear camera modules', icon: Camera },
  { id: 'SPEAKER', name: 'Speaker', desc: 'Speaker and audio output', icon: Volume2 },
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
  const colW = r.isTablet ? Math.min(r.width - rs(32), rs(860)) : undefined;
  const col = colW ? { width: colW, alignSelf: 'center' } : null;

  return (
    <View className="flex-1" style={{ backgroundColor: WHITE }}>
      {/* ── White header, now with a subtitle ─────────────────────────── */}
      <View
        style={{
          backgroundColor: WHITE,
          paddingTop: insets.top + rs(10),
          paddingBottom: rs(12),
          paddingHorizontal: rs(16),
          borderBottomWidth: 1,
          borderBottomColor: LINE,
        }}
      >
        <View className="flex-row items-center" style={col}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center justify-center active:opacity-70"
            style={{ height: rs(36), width: rs(36), borderRadius: rs(18), backgroundColor: SOFT }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={rf(18)} color={INK} strokeWidth={2} />
          </Pressable>
          <View className="flex-1" style={{ paddingHorizontal: rs(8) }}>
            <Text className="text-text text-center" style={{ fontSize: rf(16), fontWeight: '700' }} numberOfLines={1}>
              Device Missing Parts
            </Text>
            <Text className="text-center" style={{ fontSize: rf(11), color: SUB, marginTop: rs(1) }} numberOfLines={1}>
              Inspect and flag the device condition
            </Text>
          </View>
          {/* Balances the back button so the title stays optically centred. */}
          <View style={{ width: rs(36) }} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={rs(140)}
        contentContainerStyle={{ paddingBottom: rs(140), ...(col || {}) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Compact progress summary — two side-by-side status chips. ─── */}
        <View className="flex-row" style={{ paddingHorizontal: rs(16), marginTop: rs(12), gap: rs(8) }}>
          <View
            className="flex-row items-center"
            style={{
              flex: 1,
              borderRadius: 999,
              paddingVertical: rs(8),
              paddingHorizontal: rs(12),
              backgroundColor: allClear ? MINT : (damageCount > 0 ? DAMAGE_BG : MISSING_BG),
            }}
          >
            {allClear
              ? <CircleCheck size={rf(14)} color={ACCENT} strokeWidth={2} />
              : <PackageX size={rf(14)} color={damageCount > 0 ? DAMAGE : MISSING} strokeWidth={2} />}
            <Text
              style={{ fontSize: rf(11.5), fontWeight: '700', color: allClear ? ACCENT : (damageCount > 0 ? DAMAGE : MISSING), marginLeft: rs(6) }}
              numberOfLines={1}
            >
              {flaggedTotal} Part{flaggedTotal === 1 ? '' : 's'} Flagged
            </Text>
          </View>
          <View
            className="flex-row items-center justify-center"
            style={{ flex: 1, borderRadius: 999, paddingVertical: rs(8), paddingHorizontal: rs(12), backgroundColor: SOFT }}
          >
            <ClipboardList size={rf(13)} color={SUB} strokeWidth={2} />
            <Text style={{ fontSize: rf(11.5), fontWeight: '600', color: SUB, marginLeft: rs(6) }} numberOfLines={1}>
              Inspection in progress
            </Text>
          </View>
        </View>

        {/* ── Part checklist — individual premium cards, each with its own
            shadow/radius, replacing the single divider-separated list. ─── */}
        <View style={{ paddingHorizontal: rs(16), marginTop: rs(14) }}>
          {PARTS.map((p) => {
            const row = state[p.id] || {};
            const anyFlag = row.missing || row.damage;
            const flagColor = row.damage ? DAMAGE : (row.missing ? MISSING : null);
            const Icon = p.icon;
            return (
              <View
                key={p.id}
                style={{
                  marginBottom: rs(11),
                  borderRadius: rs(17),
                  padding: rs(13),
                  backgroundColor: row.damage ? DAMAGE_BG : row.missing ? MISSING_BG : WHITE,
                  borderWidth: anyFlag ? 1.5 : 1,
                  borderColor: anyFlag ? flagColor : LINE,
                  shadowColor: '#0B1F14',
                  shadowOpacity: anyFlag ? 0 : 0.05,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: anyFlag ? 0 : 1,
                }}
              >
                <View className="flex-row items-center">
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(44), width: rs(44), borderRadius: rs(14), marginRight: rs(11), backgroundColor: anyFlag ? '#FFFFFF' : MINT }}
                  >
                    <Icon size={rf(20)} color={anyFlag ? flagColor : ACCENT} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-text" style={{ fontSize: rf(14.5), fontWeight: '700' }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={{ fontSize: rf(11.5), color: SUB, marginTop: rs(1) }} numberOfLines={1}>
                      {p.desc}
                    </Text>
                  </View>
                  {/* Status dot — amber/red when flagged, soft mint-green
                      when clear ("no issue" indicator, spec §7). */}
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(22), width: rs(22), borderRadius: rs(11), backgroundColor: anyFlag ? flagColor : MINT }}
                  >
                    {anyFlag ? <X size={rf(12)} color={WHITE} strokeWidth={2.5} /> : <View style={{ height: rs(7), width: rs(7), borderRadius: rs(4), backgroundColor: ACCENT }} />}
                  </View>
                </View>

                <View className="flex-row" style={{ marginTop: rs(10) }}>
                  <FlagPill
                    label="Missing"
                    active={!!row.missing}
                    tint={MISSING}
                    tintBg={MISSING_BG}
                    onPress={() => setField(p.id, 'missing', !row.missing)}
                    style={{ flex: 1, marginRight: rs(8) }}
                  />
                  <FlagPill
                    label="Damaged"
                    active={!!row.damage}
                    tint={DAMAGE}
                    tintBg={DAMAGE_BG}
                    onPress={() => setField(p.id, 'damage', !row.damage)}
                    style={{ flex: 1 }}
                  />
                </View>

                {anyFlag ? (
                  <TextInput
                    placeholder="Add condition details…"
                    placeholderTextColor={MUTED}
                    value={row.detail || ''}
                    onChangeText={(v) => setField(p.id, 'detail', v)}
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    className="text-text"
                    style={{
                      marginTop: rs(9),
                      borderRadius: rs(11),
                      paddingHorizontal: rs(12),
                      paddingVertical: rs(9),
                      fontSize: rf(12.5),
                      backgroundColor: '#FFFFFF',
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
            style={{
              borderRadius: rs(16),
              paddingHorizontal: rs(14),
              paddingVertical: rs(12),
              backgroundColor: ACCENT,
              shadowColor: ACCENT,
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
            accessibilityRole="button"
          >
            <View className="flex-1">
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: rf(10.5), fontWeight: '600', letterSpacing: 1 }}>
                {flaggedTotal} PART{flaggedTotal === 1 ? '' : 'S'} FLAGGED
              </Text>
              <Text className="text-white" style={{ fontSize: rf(14.5), fontWeight: '700', marginTop: rs(1) }} numberOfLines={1}>
                Review &amp; Submit
              </Text>
            </View>
            <View
              className="items-center justify-center"
              style={{ height: rs(34), width: rs(34), borderRadius: rs(17), backgroundColor: 'rgba(255,255,255,0.18)' }}
            >
              <ChevronRight size={rf(17)} color={WHITE} strokeWidth={2.5} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function FlagPill({ label, active, tint, tintBg, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-center active:opacity-80"
      style={[
        {
          height: rs(42),
          borderRadius: rs(12),
          backgroundColor: active ? tintBg : WHITE,
          borderWidth: active ? 1.5 : 1,
          borderColor: active ? tint : LINE,
        },
        style,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!active }}
    >
      {active ? <X size={rf(13)} color={tint} strokeWidth={2.75} style={{ marginRight: rs(5) }} /> : null}
      <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: active ? tint : SUB }}>
        {label}
      </Text>
    </Pressable>
  );
}
