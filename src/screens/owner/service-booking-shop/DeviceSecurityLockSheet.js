import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  Lock, LockOpen, Hash, KeyRound, Grid3x3, X, Save, ChevronLeft, ShieldCheck,
  Eye, EyeOff, Info, CheckCircle2, ArrowRight, Smartphone,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ResponsiveModal } from '../../../components/responsive';
import { Touchable } from '../../../components/ios';
import { rf, rs } from '../../../utils/responsive';

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
const A = '#004C40';        // Dark Green
const PRIMARY = '#006B57';  // Primary Green
const MINT = '#E6F7F1';
const SOFT_MINT = '#F4FBF8';
const INFO_BG = '#EAF4FF';
const INK = '#0F172A';
const MUTED = '#8FA08F';
const SUB = '#667085';
const LINE = '#DCE7E2';
const SOFT = '#F8F8F8';
const HAIR = '#CBD5CB';
const GREY_TINT = 'rgba(143, 160, 143, 0.18)';

// 3x3 lock pattern pad — drag across dots to draw a pattern (Android style).
const CELL = 72;
const PAD_SIZE = CELL * 3;
const HIT_R = 30;    // px radius for snapping the finger to a dot
// The dot now holds its number, so it has to be big enough to read. 44pt boxes
// on 72pt centres leaves a 28pt gutter, and HIT_R 30 < 36 (half a cell) so a
// snap can still only ever match the nearest dot.
const DOT_BOX = 22;  // half the touch-free wrapper
const DOT = 36;      // the visible circle

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
  const specs = [device.ramLabel, device.storageLabel, device.color].filter(Boolean).join(' · ');
  return (
    <LinearGradient
      colors={['#E6F7F1', '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: rs(18), padding: rs(12), borderWidth: 1, borderColor: LINE, marginBottom: rs(14) }}
    >
      <View className="flex-row items-center">
        <View
          className="items-center justify-center overflow-hidden"
          style={{ height: rs(50), width: rs(50), borderRadius: rs(14), backgroundColor: '#FFFFFF', marginRight: rs(11) }}
        >
          {device.imageUrl ? (
            <Image source={{ uri: device.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Smartphone size={rf(21)} color={A} strokeWidth={2} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: INK }} numberOfLines={1}>
            {device.modelName || 'Device'}
          </Text>
          {specs ? (
            <Text style={{ fontSize: 10.5, color: SUB, marginTop: 1 }} numberOfLines={1}>{specs}</Text>
          ) : null}
          {device.modelNumber ? (
            <View
              className="self-start flex-row items-center"
              style={{ marginTop: rs(5), borderRadius: rs(7), paddingHorizontal: rs(7), paddingVertical: rs(2), backgroundColor: '#FFFFFF' }}
            >
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: A }}>{'#' + device.modelNumber}</Text>
            </View>
          ) : null}
        </View>
        <View className="items-center" style={{ marginLeft: rs(6) }}>
          <View
            className="items-center justify-center"
            style={{ height: rs(30), width: rs(30), borderRadius: rs(15), backgroundColor: A, marginBottom: rs(3) }}
          >
            <ShieldCheck size={rf(14)} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text style={{ fontSize: 8.5, fontWeight: '700', color: A, textAlign: 'center' }} numberOfLines={2}>
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
        width: rs(58), height: rs(58), borderRadius: rs(29), alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? A : SOFT_MINT, borderWidth: 1, borderColor: pressed ? A : LINE,
      }}
    >
      <Text style={{ fontSize: 17.5, fontWeight: '700', color: pressed ? '#FFFFFF' : INK }}>{label}</Text>
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
      style={{ marginTop: rs(14), borderRadius: rs(16), padding: rs(11), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}
    >
      <View
        className="items-center justify-center"
        style={{ height: rs(34), width: rs(34), borderRadius: rs(12), backgroundColor: MINT, marginRight: rs(10) }}
      >
        <Lock size={rf(16)} color={A} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: A }}>{PRIVACY_TITLE}</Text>
        <Text style={{ fontSize: 10.5, color: SUB, marginTop: 1, lineHeight: rf(15) }}>{PRIVACY_BODY}</Text>
      </View>
    </View>
  );
}

export default function DeviceSecurityLockSheet({ visible, initialLock, device, onConfirm, onClose }) {
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
      contentStyle={{ borderTopLeftRadius: rs(30), borderTopRightRadius: rs(30) }}
    >
      <View style={{ alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: LINE, marginBottom: rs(14) }} />

      {/* ── Header: big shield + title + subtitle, or a back arrow while
          entering a lock. The "subtle mint highlight" is the icon tile's
          mint fill — a real blur/gradient overlay would need expo-blur,
          which isn't a dependency here. ──────────────────────────────── */}
      <View className="flex-row items-start" style={{ marginBottom: rs(6) }}>
        {step ? (
          <Pressable
            onPress={() => setStep(null)}
            className="active:opacity-70"
            style={{ height: rs(36), width: rs(36), borderRadius: rs(12), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center', marginRight: rs(10) }}
            accessibilityRole="button"
            accessibilityLabel="Back to lock types"
          >
            <ChevronLeft size={rf(17)} color={INK} strokeWidth={2} />
          </Pressable>
        ) : (
          <View
            className="items-center justify-center"
            style={{ height: rs(44), width: rs(44), borderRadius: rs(15), backgroundColor: MINT, marginRight: rs(12) }}
          >
            <ShieldCheck size={rf(21)} color={A} strokeWidth={2} />
          </View>
        )}
        <View className="flex-1" style={{ paddingTop: step ? rs(6) : rs(2) }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: INK }}>
            {step === 'PIN' ? 'Enter Device PIN'
              : step === 'PASSWORD' ? 'Enter Device Password'
              : step === 'PATTERN' ? 'Draw Lock Screen Pattern'
              : step === 'NONE' ? 'No Device Lock'
              : 'Device Security Lock'}
          </Text>
          <Text style={{ fontSize: 11.5, color: SUB, marginTop: rs(2) }} numberOfLines={2}>
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
          style={{ height: rs(34), width: rs(34), borderRadius: rs(17), backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center', marginTop: step ? rs(1) : 0 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={rf(16)} color={SUB} strokeWidth={2} />
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
              colors={lock.type === 'NONE' ? ['#F4FBF8', '#FFFFFF'] : ['#E6F7F1', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ marginTop: rs(6), borderRadius: rs(20), padding: rs(14), borderWidth: 1, borderColor: LINE }}
            >
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center"
                  style={{ height: rs(48), width: rs(48), borderRadius: rs(16), marginRight: rs(12), backgroundColor: '#FFFFFF' }}
                >
                  {lock.type === 'NONE'
                    ? <LockOpen size={rf(21)} color={SUB} strokeWidth={2} />
                    : <Lock size={rf(21)} color={A} strokeWidth={2} />}
                </View>
                <View className="flex-1">
                  <Text style={{ fontSize: 9.5, fontWeight: '800', letterSpacing: 1, color: SUB }}>
                    CURRENT SECURITY
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: INK, marginTop: rs(2) }} numberOfLines={1}>
                    {summary()}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: SUB, marginTop: rs(2) }} numberOfLines={2}>
                    {lock.type === 'NONE'
                      ? 'Device is currently unlocked and ready for service.'
                      : 'This lock will be used to unlock the device during service.'}
                  </Text>
                </View>
                {isReady ? (
                  <View
                    className="items-center"
                    style={{ borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(5), backgroundColor: A, marginLeft: rs(6) }}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>READY</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>

            {/* B. Select lock type */}
            <Text style={{ fontSize: 13, fontWeight: '800', color: INK, marginTop: rs(16) }}>
              Choose Device Lock
            </Text>
            <Text style={{ fontSize: 11, color: SUB, marginTop: rs(1), marginBottom: rs(10) }}>
              Select the lock currently used on this device.
            </Text>
            {LOCK_OPTIONS.map((opt) => {
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
                    borderRadius: rs(16),
                    padding: rs(12),
                    marginBottom: rs(9),
                    shadowColor: active ? A : '#0B1F14',
                    shadowOpacity: active ? 0.14 : 0.04,
                    shadowRadius: active ? 10 : 5,
                    shadowOffset: { width: 0, height: active ? 4 : 2 },
                    elevation: active ? 3 : 1,
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      height: rs(46), width: rs(46), borderRadius: rs(15), marginRight: rs(12),
                      backgroundColor: active ? A : (opt.grey ? GREY_TINT : MINT),
                    }}
                  >
                    <Icon size={rf(20)} color={active ? '#FFFFFF' : (opt.grey ? SUB : A)} strokeWidth={2} />
                  </View>
                  <View className="flex-1" style={{ paddingRight: rs(8) }}>
                    <View className="flex-row items-center">
                      <Text style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {active ? (
                        <View style={{ marginLeft: rs(6), borderRadius: 999, paddingHorizontal: rs(6), paddingVertical: rs(2), backgroundColor: A }}>
                          <Text style={{ fontSize: 8, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 }}>
                            {opt.key === 'NONE' ? 'READY FOR SERVICE' : 'SELECTED'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, marginTop: rs(2), color: SUB }} numberOfLines={1}>
                      {opt.desc}
                    </Text>
                    {opt.helper ? (
                      <View
                        className="self-start"
                        style={{ marginTop: rs(5), borderRadius: rs(7), paddingHorizontal: rs(7), paddingVertical: rs(2), backgroundColor: active ? '#FFFFFF' : SOFT }}
                      >
                        <Text style={{ fontSize: 9.5, fontWeight: '600', color: SUB }}>{opt.helper}</Text>
                      </View>
                    ) : null}
                    {opt.key === 'PATTERN' ? (
                      <View className="flex-row flex-wrap" style={{ width: rs(28), marginTop: rs(5) }}>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <View
                            key={i}
                            style={{ width: rs(6), height: rs(6), borderRadius: rs(3), margin: rs(1.5), backgroundColor: active ? A : HAIR }}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View
                    className="items-center justify-center"
                    style={{
                      height: rs(25), width: rs(25), borderRadius: rs(13), borderWidth: 2,
                      borderColor: active ? A : HAIR, backgroundColor: active ? A : '#FFFFFF',
                    }}
                  >
                    {active ? <CheckCircle2 size={rf(15)} color="#FFFFFF" strokeWidth={2.5} /> : null}
                  </View>
                </Pressable>
              );
            })}

            {/* C. Why we need this */}
            <View
              style={{ marginTop: rs(6), borderRadius: rs(16), padding: rs(12), backgroundColor: INFO_BG, borderWidth: 1, borderColor: 'rgba(37,99,235,0.14)' }}
            >
              <View className="flex-row items-center" style={{ marginBottom: rs(6) }}>
                <View
                  className="items-center justify-center"
                  style={{ height: rs(30), width: rs(30), borderRadius: rs(10), backgroundColor: '#FFFFFF', marginRight: rs(9) }}
                >
                  <Info size={rf(15)} color="#2563EB" strokeWidth={2} />
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: INK }}>Why we need this</Text>
              </View>
              <Text style={{ fontSize: 11, color: SUB, lineHeight: rf(16) }}>
                Helps technicians verify device functionality, test repairs after service, and avoid accidental data access.
              </Text>
            </View>

            {/* D. Privacy */}
            <View
              className="flex-row"
              style={{ marginTop: rs(10), borderRadius: rs(16), padding: rs(12), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE, overflow: 'hidden' }}
            >
              <View style={{ width: rs(3), borderRadius: rs(2), backgroundColor: A, marginRight: rs(10) }} />
              <View style={{ flex: 1 }}>
                <View className="flex-row items-center" style={{ marginBottom: rs(6) }}>
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(30), width: rs(30), borderRadius: rs(10), backgroundColor: MINT, marginRight: rs(9) }}
                  >
                    <ShieldCheck size={rf(15)} color={A} strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: INK }}>{PRIVACY_TITLE}</Text>
                </View>
                <Text style={{ fontSize: 11, color: SUB, lineHeight: rf(16) }}>
                  {PRIVACY_BODY}
                </Text>
              </View>
            </View>
          </>
        ) : step === 'PATTERN' ? (
          <View className="items-center" style={{ paddingTop: rs(2) }}>
            <View style={{ borderRadius: rs(22), padding: rs(12), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}>
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
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: patternDots >= 4 ? A : SUB }}>
                      {patternDots} dot{patternDots === 1 ? '' : 's'} selected
                    </Text>
                  </View>
                </View>
                {patternDots ? (
                  <Text style={{ fontSize: 10.5, color: SUB, marginTop: rs(5) }} numberOfLines={1}>
                    {pattern.split(',').filter(Boolean).join(' → ')}
                  </Text>
                ) : null}
              </View>
              {pattern ? (
                <Pressable onPress={() => setPattern('')} className="active:opacity-70" style={{ paddingHorizontal: rs(8), paddingVertical: rs(4) }}>
                  <Text className="text-danger" style={{ fontSize: 11.5, fontWeight: '700' }}>Reset</Text>
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
            <Text style={{ fontSize: 11, color: SUB, marginBottom: rs(16) }}>Enter your device PIN</Text>
            <View className="flex-row flex-wrap justify-center" style={{ width: rs(258) }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <View key={n} className="w-1/3 items-center" style={{ paddingVertical: rs(6) }}>
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
              <View className="w-1/3 items-center" style={{ paddingVertical: rs(6) }}>
                <Touchable
                  onPress={() => setPin((p) => p.slice(0, -1))}
                  accessibilityRole="button"
                  accessibilityLabel="Delete last digit"
                  style={{ width: rs(58), height: rs(58), borderRadius: rs(29), alignItems: 'center', justifyContent: 'center' }}
                  pressedStyle={{ backgroundColor: SOFT }}
                >
                  <X size={rf(21)} color={INK} strokeWidth={2} />
                </Touchable>
              </View>
              <View className="w-1/3 items-center" style={{ paddingVertical: rs(6) }}>
                <PinKey label="0" onPress={() => setPin((p) => (p + '0').slice(0, 6))} />
              </View>
              <View className="w-1/3" />
            </View>
            <Text className="text-text-muted self-start" style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, marginTop: rs(14) }}>
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
              className="w-full text-text text-center"
              style={{ borderRadius: rs(12), paddingHorizontal: rs(14), paddingVertical: rs(11), marginTop: rs(4), fontSize: 15, fontWeight: '700', backgroundColor: SOFT, borderWidth: 1, borderColor: LINE }}
            />
            <View style={{ width: '100%' }}><PrivacyNote /></View>
          </View>
        ) : step === 'NONE' ? (
          <View style={{ paddingTop: rs(2) }}>
            <LinearGradient
              colors={['#E6F7F1', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: rs(20), padding: rs(16), borderWidth: 1, borderColor: LINE, alignItems: 'center' }}
            >
              <View
                className="items-center justify-center"
                style={{ height: rs(58), width: rs(58), borderRadius: rs(20), backgroundColor: '#FFFFFF', marginBottom: rs(10) }}
              >
                <LockOpen size={rf(26)} color={A} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>Device is Unlocked</Text>
              <Text style={{ fontSize: 11.5, color: SUB, marginTop: rs(4), textAlign: 'center' }}>
                No PIN, password, or pattern is required.
              </Text>
              <View
                className="items-center"
                style={{ marginTop: rs(10), borderRadius: 999, paddingHorizontal: rs(11), paddingVertical: rs(5), backgroundColor: A }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>READY FOR SERVICE</Text>
              </View>
            </LinearGradient>
            <Text style={{ fontSize: 11, color: SUB, marginTop: rs(12), textAlign: 'center', lineHeight: rf(16) }}>
              Technicians will be able to access the device only as needed for service checks.
            </Text>
            <PrivacyNote />
          </View>
        ) : (
          <View style={{ paddingTop: rs(8) }}>
            <View
              style={{ borderRadius: rs(16), padding: rs(12), backgroundColor: SOFT_MINT, borderWidth: 1, borderColor: LINE }}
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
                style={{ borderRadius: rs(12), marginTop: rs(6), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, paddingRight: rs(4) }}
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
                  style={{ paddingHorizontal: rs(14), paddingVertical: rs(12), fontSize: 13, color: INK }}
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
                    ? <Eye size={rf(17)} color={SUB} strokeWidth={2} />
                    : <EyeOff size={rf(17)} color={SUB} strokeWidth={2} />}
                </Pressable>
              </View>
              <Text style={{ fontSize: 10.5, color: SUB, marginTop: rs(7) }}>
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
              marginTop: rs(14), borderRadius: rs(18), overflow: 'hidden',
              shadowColor: A, shadowOpacity: isReady ? 0.3 : 0, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: isReady ? 4 : 0,
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isReady }}
          >
            {isReady ? (
              <LinearGradient
                colors={[PRIMARY, A]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingVertical: rs(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-white" style={{ fontSize: 14, fontWeight: '700' }}>Continue</Text>
                <ArrowRight size={rf(18)} color="#FFFFFF" strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
              </LinearGradient>
            ) : (
              <View style={{ paddingVertical: rs(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECF2F0' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: SUB }}>Continue</Text>
                <ArrowRight size={rf(18)} color={SUB} strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
              </View>
            )}
          </Pressable>
          {!isReady ? (
            <Text className="text-text-muted text-center" style={{ fontSize: 11.5, marginTop: rs(7) }}>
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
            marginTop: rs(14), borderRadius: rs(18), overflow: 'hidden',
            shadowColor: A, shadowOpacity: stepReady ? 0.3 : 0, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: stepReady ? 4 : 0,
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: !stepReady }}
        >
          {stepReady ? (
            <LinearGradient
              colors={[PRIMARY, A]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingVertical: rs(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
            >
              {step === 'NONE' ? <CheckCircle2 size={rf(17)} color="#FFFFFF" strokeWidth={2.5} /> : <Save size={rf(16)} color="#FFFFFF" strokeWidth={2} />}
              <Text className="text-white" style={{ fontSize: 14, fontWeight: '700', marginLeft: rs(8) }}>{stepLabel}</Text>
              <ArrowRight size={rf(16)} color="#FFFFFF" strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
            </LinearGradient>
          ) : (
            <View style={{ paddingVertical: rs(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECF2F0' }}>
              <Save size={rf(16)} color={SUB} strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '700', marginLeft: rs(8), color: SUB }}>{stepLabel}</Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Small trust footer — spec's common-structure item §A.11, shown on
          every screen this sheet renders. */}
      <View className="flex-row items-center justify-center" style={{ marginTop: rs(10) }}>
        <ShieldCheck size={rf(11)} color={SUB} strokeWidth={2} />
        <Text style={{ fontSize: 10.5, fontWeight: '600', color: SUB, marginLeft: rs(5) }}>Encrypted &amp; Secure</Text>
      </View>
    </ResponsiveModal>
  );
}
