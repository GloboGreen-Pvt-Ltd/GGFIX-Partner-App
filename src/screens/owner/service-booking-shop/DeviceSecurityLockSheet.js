import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  Lock, LockOpen, Hash, KeyRound, Grid3x3, X, Save, ChevronLeft, ShieldCheck,
  Eye, EyeOff, CheckCircle2, ArrowRight, Smartphone,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ResponsiveModal } from '../../../components/responsive';
import { Touchable } from '../../../components/ios';
import { rs } from '../../../utils/responsive';
import { specDisplayParts } from '../../../utils/deviceSpecs';

/**
 * Device Security Lock — a popup, replacing the screen this used to be.
 *
 * Everything the screen did is here: the four lock types, the 3x3 pattern pad,
 * the PIN keypad and the password field. Two differences worth knowing:
 *
 * · The screen nested a `Dialog` inside itself for each entry method. Inside a
 *   popup that would be a modal within a modal, which Android positions
 *   unreliably — so entry is a SECOND STEP of this same sheet instead. `step`
 *   holds which one is showing; back returns to the type list.
 *
 * · The sheet cannot commit anything itself. It hands the finished lock to
 *   `onConfirm` and the caller owns navigation, so "which screen comes after the
 *   lock" stays in one place.
 */
// GGFIX palette.
const A = '#09AD2A';        // GGFIX green — fills, icons, selected
const PRIMARY = '#078F23';  // deeper green — gradient partner, green text
const MINT = '#EAF8EC';
const MINT_LINE = '#CDEFD4';
const SOFT_MINT = '#F8F8F8';
const INK = '#1E1E1E';
const MUTED = '#8A8A8A';
const SUB = '#6B6B6B';
const LINE = '#E6E6E6';
const SOFT = '#F3F3F3';
const HAIR = '#D6D6D6';
const RED = '#F84141';
const GREY_TINT = 'rgba(107, 107, 107, 0.12)';

// 3x3 lock pattern pad — drag across dots to draw a pattern (Android style).
const CELL = 64;
const PAD_SIZE = CELL * 3;
const HIT_R = 28;    // px radius for snapping the finger to a dot (< CELL / 2)
// The dot now holds its number, so it has to be big enough to read. 44pt boxes
// on 72pt centres leaves a 28pt gutter, and HIT_R 30 < 36 (half a cell) so a
// snap can still only ever match the nearest dot.
const DOT_BOX = 20;  // half the touch-free wrapper
const DOT = 34;      // the visible circle

function dotCenter(idx) {
  const i = idx - 1;
  return { x: (i % 3) * CELL + CELL / 2, y: Math.floor(i / 3) * CELL + CELL / 2 };
}

function PatternPad({ value, onChange }) {
  const initial = (value || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 9);
  const [path, setPath] = useState(initial);
  const [current, setCurrent] = useState(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const findHit = (x, y) => {
    for (let i = 1; i <= 9; i++) {
      const c = dotCenter(i);
      const dx = x - c.x; const dy = y - c.y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
    }
    return null;
  };

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      const next = hit ? [hit] : [];
      pathRef.current = next;
      setPath(next);
      onChange(next.join(','));
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      if (hit && !pathRef.current.includes(hit)) {
        const next = [...pathRef.current, hit];
        pathRef.current = next;
        setPath(next);
        // Report mid-drag too, so the 2 → 3 → 5 readout builds as you draw
        // rather than appearing only after you lift your finger.
        onChange(next.join(','));
      }
    },
    onPanResponderRelease: () => {
      setCurrent(null);
      onChange(pathRef.current.join(','));
    },
    onPanResponderTerminate: () => {
      setCurrent(null);
      onChange(pathRef.current.join(','));
    },
  })).current;

  return (
    <View {...responder.panHandlers} style={{ width: PAD_SIZE, height: PAD_SIZE }}>
      <Svg style={StyleSheet.absoluteFill} width={PAD_SIZE} height={PAD_SIZE}>
        {path.map((dot, idx) => {
          if (idx === 0) return null;
          const a = dotCenter(path[idx - 1]);
          const b = dotCenter(dot);
          return <Line key={`l${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={A} strokeWidth={3.5} strokeLinecap="round" />;
        })}
        {path.length > 0 && current ? (() => {
          const last = dotCenter(path[path.length - 1]);
          return <Line x1={last.x} y1={last.y} x2={current.x} y2={current.y} stroke={A} strokeWidth={3} opacity={0.4} />;
        })() : null}
      </Svg>
      {Array.from({ length: 9 }, (_, i) => i + 1).map((dot) => {
        const c = dotCenter(dot);
        const active = path.includes(dot);
        return (
          <View
            key={dot}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: c.x - DOT_BOX,
              top: c.y - DOT_BOX,
              width: DOT_BOX * 2,
              height: DOT_BOX * 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? A : '#FFFFFF',
                borderWidth: active ? 0 : 1.5,
                borderColor: HAIR,
                // Subtle glow on selected dots — visual only, no change to hit
                // detection or the path state above.
                shadowColor: active ? A : 'transparent',
                shadowOpacity: active ? 0.55 : 0,
                shadowRadius: active ? 7 : 0,
                shadowOffset: { width: 0, height: 0 },
                elevation: active ? 4 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? '700' : '500',
                  color: active ? '#FFFFFF' : SUB,
                }}
              >
                {dot}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const LOCK_OPTIONS = [
  { key: 'PIN', label: 'Numeric PIN', desc: '4–6 digit device PIN', icon: Hash, helper: 'e.g. 1234 · 987654' },
  { key: 'PASSWORD', label: 'Password', desc: '4–16 letters & numbers', icon: KeyRound, helper: 'e.g. Ggfix2026' },
  { key: 'PATTERN', label: 'Pattern Lock', desc: 'Draw across at least 4 dots', icon: Grid3x3 },
  { key: 'NONE', label: 'No Lock', desc: 'Device is already unlocked', icon: LockOpen, grey: true },
];

// Shared privacy copy, reused identically everywhere a privacy note appears
// (spec's "one common card, same wording" §6). Deliberately does NOT claim
// the lock value "is not stored" — the whole point of this feature is that
// a technician can retrieve it later, so that claim would be false. This
// wording only promises what this screen can actually stand behind: the
// value isn't shared outside the people servicing this device.
const PRIVACY_TITLE = 'Your device data is safe';
const PRIVACY_BODY = 'Used only to help our technician access the device during service — not shared with third parties.';

// Dialer letters purely for the keypad's visual style (matches the
// reference screenshot) — cosmetic only, `onPress` still sends the digit.
const DIAL_LETTERS = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' };

// Compact device summary card, shown at the top of every credential-entry
// step (PIN / Password / Pattern / No Lock) — not the type-picker list,
// which already has its own "CURRENT SECURITY" status card. All fields are
// optional and simply hide when absent, same pattern the rest of this
// booking flow uses for these exact params.
function DeviceSummaryCard({ device }) {
  if (!device) return null;
  const specs = specDisplayParts(device, { withColor: true }).join(' · ');
  return (
    <LinearGradient
      colors={[MINT, '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 14, padding: 10, borderWidth: 1, borderColor: MINT_LINE, marginBottom: 10 }}
    >
      <View className="flex-row items-center">
        <View
          className="items-center justify-center overflow-hidden"
          style={{ height: 44, width: 44, borderRadius: 12, backgroundColor: '#FFFFFF', marginRight: 10 }}
        >
          {device.imageUrl ? (
            <Image source={{ uri: device.imageUrl }} style={{ width: 38, height: 40 }} resizeMode="contain" />
          ) : (
            <Smartphone size={21} color={A} strokeWidth={2} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>
            {device.modelName || 'Device'}
          </Text>
          {specs ? (
            <Text style={{ fontSize: 11, color: SUB, marginTop: 1 }} numberOfLines={1}>{specs}</Text>
          ) : null}
          {device.modelNumber ? (
            <View
              className="self-start flex-row items-center"
              style={{ marginTop: 4, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#FFFFFF' }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: PRIMARY }}>{'#' + device.modelNumber}</Text>
            </View>
          ) : null}
        </View>
        <View className="items-center" style={{ marginLeft: rs(6) }}>
          <View
            className="items-center justify-center"
            style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: A, marginBottom: 2 }}
          >
            <ShieldCheck size={14} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text style={{ fontSize: 9, fontWeight: '700', color: PRIMARY, textAlign: 'center' }} numberOfLines={2}>
            Secure{'\n'}Service
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// A keypad digit needs its TEXT colour to flip too when pressed (dark digit
// on a dark-green pressed fill is unreadable) — `Touchable` only swaps the
// wrapper `style`, so this tracks its own press state the same way that
// component does, just with the digit/letters as a render prop instead.
function PinKey({ label, sub, onPress, accessibilityLabel }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: rs(52), height: rs(52), borderRadius: rs(26), alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? A : SOFT_MINT, borderWidth: 1, borderColor: pressed ? A : LINE,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '700', color: pressed ? '#FFFFFF' : INK }}>{label}</Text>
      {sub ? (
        <Text style={{ fontSize: 7.5, fontWeight: '600', color: pressed ? 'rgba(255,255,255,0.85)' : SUB, letterSpacing: 1, marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Same card everywhere it's used, so PIN/Password/Pattern/No Lock share one
// visual and one message rather than four slightly-different ones.
function PrivacyNote() {
  return (
    <View
      className="flex-row items-center"
      style={{ marginTop: 10, borderRadius: 12, padding: 9, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}
    >
      <View
        className="items-center justify-center"
        style={{ height: 28, width: 28, borderRadius: 9, backgroundColor: MINT, marginRight: 9 }}
      >
        <Lock size={16} color={A} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: PRIMARY }}>{PRIVACY_TITLE}</Text>
        <Text style={{ fontSize: 11, color: SUB, marginTop: 1, lineHeight: 15 }}>{PRIVACY_BODY}</Text>
      </View>
    </View>
  );
}

/**
 * @param types  lock keys to offer (utils/deviceSpecs lockTypesFor) — e.g. a
 *               Laptop gets only PIN + PASSWORD. Omitted → all four.
 */
export default function DeviceSecurityLockSheet({ visible, initialLock, device, onConfirm, onClose, types }) {
  const options = Array.isArray(types) ? LOCK_OPTIONS.filter((o) => types.includes(o.key)) : LOCK_OPTIONS;
  const seed = (initialLock && initialLock.type)
    ? { type: initialLock.type, value: initialLock.value || '' }
    : { type: 'NONE', value: '' };

  const [lock, setLock] = useState(seed);
  const [step, setStep] = useState(null); // 'PIN' | 'PASSWORD' | 'PATTERN' | null
  const [pattern, setPattern] = useState(seed.type === 'PATTERN' ? seed.value : '');
  const [pin, setPin] = useState(seed.type === 'PIN' ? seed.value : '');
  const [password, setPassword] = useState(seed.type === 'PASSWORD' ? seed.value : '');
  // Visible by DEFAULT — see the field below for why.
  const [pwMasked, setPwMasked] = useState(false);

  // Re-seed each time the sheet opens: the caller's prefill can change between
  // opens (a re-estimate carries the ticket's saved lock), and a sheet that
  // keeps stale state would silently submit the previous device's lock.
  useEffect(() => {
    if (!visible) return;
    setLock(seed);
    setStep(null);
    setPattern(seed.type === 'PATTERN' ? seed.value : '');
    setPin(seed.type === 'PIN' ? seed.value : '');
    setPassword(seed.type === 'PASSWORD' ? seed.value : '');
    setPwMasked(false);
    // seed is derived from initialLock; depending on the parts avoids a new
    // object identity re-running this on every parent render.
  }, [visible, initialLock?.type, initialLock?.value]);

  // 'NONE' now opens its own confirmation step (spec §5) instead of
  // committing on the first tap — the same `save('NONE', '')` call the
  // confirmation screen's button makes is what actually sets the lock, so
  // the persisted value and shape are unchanged either way.
  const onSelect = (type) => setStep(type);

  const save = (type, value) => {
    setLock({ type, value });
    setStep(null);
  };

  const summary = () => {
    if (lock.type === 'NONE') return 'No lock set';
    if (lock.type === 'PIN') return lock.value ? `PIN · ${lock.value.length} digits` : 'PIN';
    if (lock.type === 'PASSWORD') return lock.value ? `Password · ${lock.value.length} chars` : 'Password';
    if (lock.type === 'PATTERN') {
      const dots = lock.value.split(',').filter(Boolean).length;
      return dots > 0 ? `Pattern · ${dots} dots` : 'Pattern';
    }
    return '—';
  };

  const isReady = lock.type === 'NONE' || !!(lock.value && lock.value.length > 0);
  const patternDots = pattern.split(',').filter(Boolean).length;

  // Per-step Save CTA — same `save()`/gating values as before, just read
  // once here instead of repeated inline in the footer JSX.
  const stepReady = step === 'PATTERN' ? patternDots >= 4
    : step === 'PIN' ? pin.length >= 4
    : step === 'PASSWORD' ? password.length >= 4
    : step === 'NONE' ? true
    : false;
  const stepLabel = step === 'PATTERN' ? 'Save Pattern'
    : step === 'PIN' ? 'Save PIN'
    : step === 'PASSWORD' ? 'Save Password'
    : 'Confirm No Lock';
  const stepOnPress = () => {
    if (step === 'PATTERN') save('PATTERN', pattern);
    else if (step === 'PIN') save('PIN', pin);
    else if (step === 'NONE') save('NONE', '');
    else save('PASSWORD', password);
  };

  return (
    <ResponsiveModal
      visible={visible}
      onClose={onClose}
      maxWidth={760}
      contentStyle={{ borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24) }}
    >
      <View style={{ alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: LINE, marginBottom: rs(10) }} />

      {/* ── Header: big shield + title + subtitle, or a back arrow while
          entering a lock. The "subtle mint highlight" is the icon tile's
          mint fill — a real blur/gradient overlay would need expo-blur,
          which isn't a dependency here. ──────────────────────────────── */}
      <View className="flex-row items-start" style={{ marginBottom: rs(6) }}>
        {step ? (
          <Pressable
            onPress={() => setStep(null)}
            className="active:opacity-70"
            style={{ height: 34, width: 34, borderRadius: 11, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back to lock types"
          >
            <ChevronLeft size={17} color={INK} strokeWidth={2} />
          </Pressable>
        ) : (
          <View
            className="items-center justify-center"
            style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: MINT, marginRight: 10 }}
          >
            <ShieldCheck size={21} color={A} strokeWidth={2} />
          </View>
        )}
        <View className="flex-1" style={{ paddingTop: step ? 4 : 0 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>
            {step === 'PIN' ? 'Enter Device PIN'
              : step === 'PASSWORD' ? 'Enter Device Password'
              : step === 'PATTERN' ? 'Draw Lock Screen Pattern'
              : step === 'NONE' ? 'No Device Lock'
              : 'Device Security Lock'}
          </Text>
          <Text style={{ fontSize: 11, color: SUB, marginTop: rs(2) }} numberOfLines={2}>
            {step === 'PIN' ? 'Enter the lock screen PIN to proceed with service'
              : step === 'PASSWORD' ? 'Enter the lock screen password to proceed with service'
              : step === 'PATTERN' ? 'Draw the device pattern by connecting at least 4 dots'
              : step === 'NONE' ? 'Confirm that this device is already unlocked.'
              : 'Protect the device while it is being serviced.'}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          className="active:opacity-70"
          hitSlop={10}
          style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center', marginTop: step ? 1 : 0 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={16} color={SUB} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Device summary card — shown on the 4 credential/confirmation steps
          only (spec §1's "every security INPUT screen"). The type-picker
          list below already has its own "CURRENT SECURITY" status card, so
          repeating the device card there would just be clutter. */}
      {step ? <DeviceSummaryCard device={device} /> : null}

      {/* `flexShrink` lets this give up height inside the panel's own maxHeight,
          so the confirm button stays reachable when the pattern pad or keypad
          makes the content tall. */}
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === null ? (
          <>
            {/* A. Current security status — title/subtitle/READY badge are all
                driven by `summary()`/`lock.type`/`isReady`, exactly as before.
                Nothing here is hardcoded to "No lock set". */}
            <LinearGradient
              colors={lock.type === 'NONE' ? ['#F8F8F8', '#FFFFFF'] : [MINT, '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ marginTop: 4, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: lock.type === 'NONE' ? LINE : MINT_LINE }}
            >
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center"
                  style={{ height: 38, width: 38, borderRadius: 12, marginRight: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: SOFT }}
                >
                  {lock.type === 'NONE'
                    ? <LockOpen size={21} color={SUB} strokeWidth={2} />
                    : <Lock size={21} color={A} strokeWidth={2} />}
                </View>
                <View className="flex-1">
                  <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: SUB }}>
                    CURRENT SECURITY
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: INK, marginTop: 1 }} numberOfLines={1}>
                    {summary()}
                  </Text>
                  <Text style={{ fontSize: 11, color: SUB, marginTop: 1 }} numberOfLines={2}>
                    {lock.type === 'NONE'
                      ? 'Device is currently unlocked and ready for service.'
                      : 'This lock will be used to unlock the device during service.'}
                  </Text>
                </View>
                {isReady ? (
                  <View
                    className="items-center"
                    style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: A, marginLeft: 6 }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>READY</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>

            {/* B. Select lock type */}
            <Text style={{ fontSize: 13, fontWeight: '800', color: INK, marginTop: 12 }}>
              Choose Device Lock
            </Text>
            <Text style={{ fontSize: 11, color: SUB, marginTop: 1, marginBottom: 8 }}>
              Select the lock currently used on this device.
            </Text>
            {options.map((opt) => {
              const active = lock.type === opt.key;
              const Icon = opt.icon;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => onSelect(opt.key)}
                  className="flex-row items-center active:opacity-90"
                  style={{
                    // Keep this background OPAQUE. Android renders the `elevation`
                    // shadow THROUGH a translucent background, which showed up as
                    // a grey box behind the selected tile on the old screen.
                    backgroundColor: active ? MINT : '#FFFFFF',
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? A : LINE,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    marginBottom: 8,
                    shadowColor: '#1E1E1E',
                    shadowOpacity: active ? 0.06 : 0.03,
                    shadowRadius: active ? 8 : 4,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: active ? 2 : 1,
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      height: 36, width: 36, borderRadius: 12, marginRight: 10,
                      backgroundColor: active ? A : (opt.grey ? GREY_TINT : MINT),
                    }}
                  >
                    <Icon size={20} color={active ? '#FFFFFF' : (opt.grey ? SUB : A)} strokeWidth={2} />
                  </View>
                  <View className="flex-1" style={{ paddingRight: 8 }}>
                    <View className="flex-row items-center">
                      <Text style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {active ? (
                        <View style={{ marginLeft: 6, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: A }}>
                          <Text style={{ fontSize: 8, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 }}>
                            {opt.key === 'NONE' ? 'READY FOR SERVICE' : 'SELECTED'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, marginTop: 1, color: SUB }} numberOfLines={1}>
                      {opt.desc}
                    </Text>
                    {opt.helper ? (
                      <View
                        className="self-start"
                        style={{ marginTop: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: active ? '#FFFFFF' : SOFT_MINT }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: SUB }}>{opt.helper}</Text>
                      </View>
                    ) : null}
                    {opt.key === 'PATTERN' ? (
                      <View className="flex-row flex-wrap" style={{ width: 24, marginTop: 4 }}>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <View
                            key={i}
                            style={{ width: 5, height: 5, borderRadius: 3, margin: 1.5, backgroundColor: active ? A : HAIR }}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View
                    className="items-center justify-center"
                    style={{
                      height: 22, width: 22, borderRadius: 11, borderWidth: 2,
                      borderColor: active ? A : HAIR, backgroundColor: active ? A : '#FFFFFF',
                    }}
                  >
                    {active ? <CheckCircle2 size={15} color="#FFFFFF" strokeWidth={2.5} /> : null}
                  </View>
                </Pressable>
              );
            })}

          </>
        ) : step === 'PATTERN' ? (
          <View className="items-center" style={{ paddingTop: rs(2) }}>
            <View style={{ borderRadius: 18, padding: 10, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}>
              <PatternPad value={pattern} onChange={setPattern} />
            </View>
            <View className="flex-row items-center w-full" style={{ marginTop: rs(12) }}>
              <View style={{ flex: 1 }}>
                <View className="flex-row items-center">
                  <View
                    style={{
                      borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(3),
                      backgroundColor: patternDots >= 4 ? MINT : SOFT, marginRight: rs(8),
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: patternDots >= 4 ? PRIMARY : SUB }}>
                      {patternDots} dot{patternDots === 1 ? '' : 's'} selected
                    </Text>
                  </View>
                </View>
                {patternDots ? (
                  <Text style={{ fontSize: 11, color: SUB, marginTop: 4 }} numberOfLines={1}>
                    {pattern.split(',').filter(Boolean).join(' → ')}
                  </Text>
                ) : null}
              </View>
              {pattern ? (
                <Pressable onPress={() => setPattern('')} className="active:opacity-70" style={{ paddingHorizontal: rs(8), paddingVertical: rs(4) }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: RED }}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ width: '100%' }}><PrivacyNote /></View>
          </View>
        ) : step === 'PIN' ? (
          <View className="items-center" style={{ paddingTop: rs(2) }}>
            <View className="flex-row" style={{ marginBottom: rs(10) }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={{
                    marginHorizontal: rs(5),
                    width: pin.length > i ? rs(12) : rs(9),
                    height: pin.length > i ? rs(12) : rs(9),
                    borderRadius: rs(6),
                    backgroundColor: pin.length > i ? A : HAIR,
                    shadowColor: pin.length > i ? A : 'transparent',
                    shadowOpacity: pin.length > i ? 0.45 : 0,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
              ))}
            </View>
            <Text style={{ fontSize: 11, color: SUB, marginBottom: rs(12) }}>Enter your device PIN</Text>
            <View className="flex-row flex-wrap justify-center" style={{ width: rs(234) }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <View key={n} className="w-1/3 items-center" style={{ paddingVertical: rs(5) }}>
                  <PinKey
                    label={String(n)}
                    sub={DIAL_LETTERS[n]}
                    onPress={() => setPin((p) => (p + String(n)).slice(0, 6))}
                  />
                </View>
              ))}
              {/* Bottom row order matches the reference: backspace, 0, then a
                  blank cell. No fingerprint/biometric icon here — this app
                  has no biometric unlock capability to back one. */}
              <View className="w-1/3 items-center" style={{ paddingVertical: rs(5) }}>
                <Touchable
                  onPress={() => setPin((p) => p.slice(0, -1))}
                  accessibilityRole="button"
                  accessibilityLabel="Delete last digit"
                  style={{ width: rs(52), height: rs(52), borderRadius: rs(26), alignItems: 'center', justifyContent: 'center' }}
                  pressedStyle={{ backgroundColor: SOFT }}
                >
                  <X size={21} color={INK} strokeWidth={2} />
                </Touchable>
              </View>
              <View className="w-1/3 items-center" style={{ paddingVertical: rs(5) }}>
                <PinKey label="0" onPress={() => setPin((p) => (p + '0').slice(0, 6))} />
              </View>
              <View className="w-1/3" />
            </View>
            <Text className="self-start" style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, marginTop: rs(12), color: SUB }}>
              PIN NUMBER
            </Text>
            <TextInput
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Enter PIN"
              placeholderTextColor={MUTED}
              autoComplete="off"
              textContentType="none"
              className="w-full text-center"
              style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 4, fontSize: 15, fontWeight: '700', color: INK, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}
            />
            <View style={{ width: '100%' }}><PrivacyNote /></View>
          </View>
        ) : step === 'NONE' ? (
          <View style={{ paddingTop: rs(2) }}>
            <LinearGradient
              colors={[MINT, '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, padding: 12, borderWidth: 1, borderColor: MINT_LINE, alignItems: 'center' }}
            >
              <View
                className="items-center justify-center"
                style={{ height: 46, width: 46, borderRadius: 16, backgroundColor: '#FFFFFF', marginBottom: 8 }}
              >
                <LockOpen size={26} color={A} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: INK }}>Device is Unlocked</Text>
              <Text style={{ fontSize: 11, color: SUB, marginTop: rs(4), textAlign: 'center' }}>
                No PIN, password, or pattern is required.
              </Text>
              <View
                className="items-center"
                style={{ marginTop: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: A }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>READY FOR SERVICE</Text>
              </View>
            </LinearGradient>
            <Text style={{ fontSize: 11, color: SUB, marginTop: 10, textAlign: 'center', lineHeight: 15 }}>
              Technicians will be able to access the device only as needed for service checks.
            </Text>
            <PrivacyNote />
          </View>
        ) : (
          <View style={{ paddingTop: rs(8) }}>
            <View
              style={{ borderRadius: 14, padding: 10, backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: SUB }}>
                PASSWORD
              </Text>

              {/* VISIBLE by default, with a toggle to mask.
                  This field is not an authentication box — the shop is writing DOWN
                  the customer's password so a technician can unlock the device
                  later. Masked, a typo is undetectable, and getting it wrong means
                  the device can't be opened at all. The eye lets them hide it while
                  the customer is watching, which is the only moment masking helps.

                  autoCapitalize/autoCorrect/autoComplete off is not optional here:
                  Android capitalises the first letter and autocorrects words, and
                  iOS offers password autofill over the field — all three silently
                  change what gets saved. */}
              <View
                className="flex-row items-center w-full"
                style={{ borderRadius: 10, marginTop: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, paddingRight: 4 }}
              >
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={pwMasked}
                  placeholder="Enter password"
                  placeholderTextColor={MUTED}
                  maxLength={16}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  className="flex-1"
                  style={{ paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: INK }}
                />
                <Pressable
                  onPress={() => setPwMasked((m) => !m)}
                  hitSlop={8}
                  className="items-center justify-center active:opacity-70"
                  style={{ height: rs(36), width: rs(36), borderRadius: rs(18) }}
                  accessibilityRole="button"
                  accessibilityLabel={pwMasked ? 'Show password' : 'Hide password'}
                >
                  {pwMasked
                    ? <Eye size={17} color={SUB} strokeWidth={2} />
                    : <EyeOff size={17} color={SUB} strokeWidth={2} />}
                </Pressable>
              </View>
              <Text style={{ fontSize: 11, color: SUB, marginTop: 6 }}>
                Use 4–16 letters and numbers.
              </Text>
            </View>
            <PrivacyNote />
          </View>
        )}
      </ScrollView>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      {step === null ? (
        <>
          <Pressable
            onPress={() => isReady && onConfirm?.(lock)}
            disabled={!isReady}
            className="active:opacity-90"
            style={{
              marginTop: 10, borderRadius: 14, overflow: 'hidden',
              shadowColor: A, shadowOpacity: isReady ? 0.2 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: isReady ? 2 : 0,
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isReady }}
          >
            {isReady ? (
              <LinearGradient
                colors={[A, PRIMARY]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-white" style={{ fontSize: 13, fontWeight: '700' }}>Continue</Text>
                <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
              </LinearGradient>
            ) : (
              <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: SOFT }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: SUB }}>Continue</Text>
                <ArrowRight size={18} color={SUB} strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
              </View>
            )}
          </Pressable>
          {!isReady ? (
            <Text className="text-center" style={{ fontSize: 11, marginTop: 6, color: SUB }}>
              Enter the {lock.type.toLowerCase()} to continue.
            </Text>
          ) : null}
        </>
      ) : (
        <Pressable
          onPress={stepOnPress}
          disabled={!stepReady}
          className="active:opacity-90"
          style={{
            marginTop: 10, borderRadius: 14, overflow: 'hidden',
            shadowColor: A, shadowOpacity: stepReady ? 0.2 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: stepReady ? 2 : 0,
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: !stepReady }}
        >
          {stepReady ? (
            <LinearGradient
              colors={[A, PRIMARY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
            >
              {step === 'NONE' ? <CheckCircle2 size={17} color="#FFFFFF" strokeWidth={2.5} /> : <Save size={16} color="#FFFFFF" strokeWidth={2} />}
              <Text className="text-white" style={{ fontSize: 13, fontWeight: '700', marginLeft: rs(8) }}>{stepLabel}</Text>
              <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
            </LinearGradient>
          ) : (
            <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: SOFT }}>
              <Save size={16} color={SUB} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: rs(8), color: SUB }}>{stepLabel}</Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Small trust footer — spec's common-structure item §A.11, shown on
          every screen this sheet renders. */}
      <View className="flex-row items-center justify-center" style={{ marginTop: 8 }}>
        <ShieldCheck size={11} color={SUB} strokeWidth={2} />
        <Text style={{ fontSize: 10, fontWeight: '600', color: SUB, marginLeft: 5 }}>Encrypted &amp; Secure</Text>
      </View>
    </ResponsiveModal>
  );
}
