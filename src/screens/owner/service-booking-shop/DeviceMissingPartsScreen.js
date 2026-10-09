import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, ChevronRight, Smartphone, Layers, CreditCard, CircleDot, Zap, Camera,
  Volume2, ClipboardList, X, CircleCheck, PackageX,
} from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { rs } from '../../../utils/responsive';

/**
 * Device Missing Parts — a screen, reached from the Device Security Lock popup
 * on Device Information.
 *
 * KeyboardAwareScrollView, not the manual `useKeyboardHeight` dance the sheets
 * use: that hook exists because a RN `Modal` is a separate window the root
 * <KeyboardProvider> doesn't instrument. On a SCREEN the provider IS in play, so
 * the library is the right tool — see `lib/hooks/useKeyboardHeight` for the full why.
 */
// GGFIX palette.
const ACCENT = '#09AD2A';       // GGFIX green
const PRIMARY = '#078F23';      // green text
const MINT = '#EAF8EC';
const WHITE = '#FFFFFF';
const PAGE_BG = '#F8F8F8';
const INK = '#1E1E1E';
const MUTED = '#8A8A8A';
const SUB = '#6B6B6B';
const LINE = '#E6E6E6';
const HAIR = '#F3F3F3';
const SOFT = '#F3F3F3';

// Semantic colours for the flag pills: Missing = yellow, Damaged = red.
// `*_TEXT` is the readable text shade on the tint.
const MISSING = '#F3BF23';
const MISSING_TEXT = '#8A6A00';
const MISSING_BG = '#FFF8E1';
const DAMAGE = '#F84141';
const DAMAGE_TEXT = '#D63232';
const DAMAGE_BG = '#FEECEC';

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

  // Part grid: 2 cards per row on phones, 3 on tablets.
  const gridGap = 8;
  const gridCols = r.isTablet ? 3 : 2;
  const gridInner = (colW || r.width) - rs(14) * 2;
  const cardW = Math.floor((gridInner - gridGap * (gridCols - 1)) / gridCols);

  const summaryTint = allClear ? ACCENT : (damageCount > 0 ? DAMAGE : MISSING);
  const summaryText = allClear ? PRIMARY : (damageCount > 0 ? DAMAGE_TEXT : MISSING_TEXT);
  const summaryBg = allClear ? MINT : (damageCount > 0 ? DAMAGE_BG : MISSING_BG);

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: WHITE,
          paddingTop: insets.top + rs(8),
          paddingBottom: rs(12),
          paddingHorizontal: rs(14),
          borderBottomWidth: 1,
          borderBottomColor: LINE,
        }}
      >
        <View className="flex-row items-center" style={col}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: LINE }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View className="flex-1" style={{ paddingHorizontal: 8 }}>
            <Text className="text-center" style={{ fontSize: 17, fontWeight: '800', color: INK }} numberOfLines={1}>
              Device Missing Parts
            </Text>
            <Text className="text-center" style={{ fontSize: 11, color: SUB, marginTop: 1 }} numberOfLines={1}>
              Inspect and flag the device condition
            </Text>
          </View>
          {/* Balances the back button so the title stays optically centred. */}
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={rs(110)}
        contentContainerStyle={{ paddingHorizontal: rs(14), paddingTop: rs(12), paddingBottom: insets.bottom + rs(96), ...(col || {}) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Compact progress summary — two status chips. ─────────── */}
        <View className="flex-row" style={{ gap: 8 }}>
          <View
            className="flex-row items-center"
            style={{ flex: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: summaryBg }}
          >
            {allClear
              ? <CircleCheck size={13} color={summaryTint} strokeWidth={2} />
              : <PackageX size={13} color={summaryTint} strokeWidth={2} />}
            <Text style={{ fontSize: 11, fontWeight: '800', color: summaryText, marginLeft: 5 }} numberOfLines={1}>
              {flaggedTotal} Part{flaggedTotal === 1 ? '' : 's'} Flagged
            </Text>
          </View>
          <View
            className="flex-row items-center justify-center"
            style={{ flex: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE }}
          >
            <ClipboardList size={12} color={SUB} strokeWidth={2} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: SUB, marginLeft: 5 }} numberOfLines={1}>
              Inspection in progress
            </Text>
          </View>
        </View>

        {/* ── Part checklist — grid of small cards: icon, name and
            description, then the Missing / Damaged toggles across the
            bottom. The details field appears only once a part is flagged. ── */}
        <View className="flex-row flex-wrap" style={{ marginTop: 10, gap: gridGap }}>
          {PARTS.map((p) => {
            const row = state[p.id] || {};
            const anyFlag = row.missing || row.damage;
            const flagColor = row.damage ? DAMAGE : (row.missing ? MISSING : null);
            const flagBg = row.damage ? DAMAGE_BG : (row.missing ? MISSING_BG : null);
            const Icon = p.icon;
            return (
              <View
                key={p.id}
                style={{
                  width: cardW,
                  borderRadius: 14,
                  padding: 10,
                  backgroundColor: anyFlag ? flagBg : WHITE,
                  borderWidth: anyFlag ? 1.5 : 1,
                  borderColor: anyFlag ? flagColor : HAIR,
                  shadowColor: INK,
                  shadowOpacity: anyFlag ? 0 : 0.04,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: anyFlag ? 0 : 1,
                }}
              >
                <View
                  className="items-center justify-center"
                  style={{ height: 32, width: 32, borderRadius: 10, backgroundColor: anyFlag ? WHITE : MINT }}
                >
                  <Icon size={16} color={anyFlag ? flagColor : ACCENT} strokeWidth={2} />
                </View>
                <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>
                  {p.name}
                </Text>
                {/* Fixed two-line slot so every card in a row lines up. */}
                <Text style={{ fontSize: 11, lineHeight: 15, minHeight: 30, color: SUB, marginTop: 1 }} numberOfLines={2}>
                  {p.desc}
                </Text>
                <View className="flex-row" style={{ marginTop: 8, gap: 6 }}>
                  <FlagPill
                    label="Missing"
                    active={!!row.missing}
                    tint={MISSING}
                    tintText={MISSING_TEXT}
                    tintBg={MISSING_BG}
                    onPress={() => setField(p.id, 'missing', !row.missing)}
                    style={{ flex: 1 }}
                  />
                  <FlagPill
                    label="Damaged"
                    active={!!row.damage}
                    tint={DAMAGE}
                    tintText={DAMAGE_TEXT}
                    tintBg={DAMAGE_BG}
                    onPress={() => setField(p.id, 'damage', !row.damage)}
                    style={{ flex: 1 }}
                  />
                </View>

                {anyFlag ? (
                  <TextInput
                    placeholder="Add details…"
                    placeholderTextColor={MUTED}
                    value={row.detail || ''}
                    onChangeText={(v) => setField(p.id, 'detail', v)}
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    style={{
                      marginTop: 8,
                      borderRadius: 10,
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      fontSize: 12,
                      color: INK,
                      backgroundColor: WHITE,
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

      {/* ── Sticky CTA ───────────────────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: 0, backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: rs(14), paddingTop: 10, paddingBottom: insets.bottom + 10 }}
      >
        <View style={col}>
          <Pressable
            onPress={onContinue}
            className="flex-row items-center active:opacity-90"
            style={{
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: ACCENT,
              shadowColor: ACCENT,
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
            }}
            accessibilityRole="button"
          >
            <View className="flex-1">
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>
                {flaggedTotal} PART{flaggedTotal === 1 ? '' : 'S'} FLAGGED
              </Text>
              <Text className="text-white" style={{ fontSize: 13, fontWeight: '800', marginTop: 1 }} numberOfLines={1}>
                Review &amp; Submit
              </Text>
            </View>
            <View
              className="items-center justify-center"
              style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <ChevronRight size={16} color={WHITE} strokeWidth={2.5} />
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
function FlagPill({ label, active, tint, tintText, tintBg, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className="flex-row items-center justify-center active:opacity-80"
      style={[
        {
          height: 30,
          paddingHorizontal: 4,
          borderRadius: 9,
          backgroundColor: active ? tintBg : WHITE,
          borderWidth: active ? 1.5 : 1,
          borderColor: active ? tint : LINE,
        },
        style,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!active }}
    >
      {active ? <X size={10} color={tintText} strokeWidth={2.75} style={{ marginRight: 2 }} /> : null}
      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? tintText : SUB }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
