import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  Lock, LockOpen, Hash, KeyRound, Grid3x3, X, Save, ChevronRight, ChevronLeft, ShieldCheck,
  Eye, EyeOff,
} from 'lucide-react-native';
import { ResponsiveModal } from '../../../components/responsive';
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
const A = '#004C40';
const A05 = 'rgba(0, 76, 64, 0.05)';
const A10 = 'rgba(0, 76, 64, 0.10)';
const A20 = 'rgba(0, 76, 64, 0.20)';
const INK = '#172117';
const MUTED = '#8FA08F';
const SUB = '#667066';
const LINE = '#E2E8E2';
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
          return <Line key={`l${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={A} strokeWidth={3} />;
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
              }}
            >
              <Text
                style={{
                  fontSize: rf(13),
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
  { key: 'PIN', label: 'Numeric PIN', desc: '4–6 digit numeric lock', icon: Hash },
  { key: 'PASSWORD', label: 'Alphanumeric Password', desc: '4–16 letters & digits', icon: KeyRound },
  { key: 'PATTERN', label: 'Pattern Lock', desc: 'Drag across at least 4 dots', icon: Grid3x3 },
  { key: 'NONE', label: 'No Lock', desc: 'Device has no screen lock', icon: LockOpen, grey: true },
];

export default function DeviceSecurityLockSheet({ visible, initialLock, onConfirm, onClose }) {
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

  const onSelect = (type) => {
    if (type === 'NONE') { setLock({ type: 'NONE', value: '' }); return; }
    setStep(type);
  };

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

  return (
    <ResponsiveModal visible={visible} onClose={onClose} maxWidth={440}>
      <View style={{ alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: LINE, marginBottom: rs(12) }} />

      {/* ── Header: title, or a back arrow while entering a lock ────── */}
      <View className="flex-row items-center" style={{ marginBottom: rs(4) }}>
        {step ? (
          <Pressable
            onPress={() => setStep(null)}
            className="active:opacity-70"
            style={{ height: rs(32), width: rs(32), borderRadius: rs(9), backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center', marginRight: rs(10) }}
            accessibilityRole="button"
            accessibilityLabel="Back to lock types"
          >
            <ChevronLeft size={rf(16)} color={INK} strokeWidth={2} />
          </Pressable>
        ) : null}
        <Text className="flex-1 text-text" style={{ fontSize: rf(16), fontWeight: '700' }}>
          {step === 'PIN' ? 'Enter Device PIN'
            : step === 'PASSWORD' ? 'Enter Device Password'
            : step === 'PATTERN' ? 'Draw Lock Screen Pattern'
            : 'Device Security Lock'}
        </Text>
        <Pressable
          onPress={onClose}
          className="active:opacity-70"
          hitSlop={10}
          style={{ height: rs(32), width: rs(32), borderRadius: rs(16), backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={rf(16)} color={SUB} strokeWidth={2} />
        </Pressable>
      </View>

      {/* `flexShrink` lets this give up height inside the panel's own maxHeight,
          so the confirm button stays reachable when the pattern pad or keypad
          makes the content tall. */}
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === null ? (
          <>
            {/* Current lock */}
            <View
              className="flex-row items-center"
              style={{ marginTop: rs(8), borderRadius: rs(12), padding: rs(10), backgroundColor: lock.type === 'NONE' ? SOFT : A10 }}
            >
              <View
                className="items-center justify-center"
                style={{ height: rs(42), width: rs(42), borderRadius: rs(12), marginRight: rs(10), backgroundColor: lock.type === 'NONE' ? GREY_TINT : '#FFFFFF' }}
              >
                {lock.type === 'NONE'
                  ? <LockOpen size={rf(20)} color={SUB} strokeWidth={2} />
                  : <Lock size={rf(20)} color={A} strokeWidth={2} />}
              </View>
              <View className="flex-1">
                <Text className="text-text-muted" style={{ fontSize: rf(10), fontWeight: '600', letterSpacing: 1.2 }}>
                  CURRENT LOCK
                </Text>
                <Text className="text-text" style={{ fontSize: rf(14), fontWeight: '700', marginTop: rs(1) }} numberOfLines={1}>
                  {summary()}
                </Text>
              </View>
              {isReady ? (
                <View
                  className="flex-row items-center"
                  style={{ borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(3), backgroundColor: '#FFFFFF' }}
                >
                  <ShieldCheck size={rf(11)} color={A} strokeWidth={2} />
                  <Text style={{ fontSize: rf(10), fontWeight: '600', color: A, marginLeft: rs(4) }}>READY</Text>
                </View>
              ) : null}
            </View>

            {/* Lock types */}
            <Text className="text-text-muted" style={{ fontSize: rf(10.5), fontWeight: '600', letterSpacing: 1.2, marginTop: rs(14), marginBottom: rs(8) }}>
              PICK A LOCK TYPE
            </Text>
            {LOCK_OPTIONS.map((opt) => {
              const active = lock.type === opt.key;
              const Icon = opt.icon;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => onSelect(opt.key)}
                  className="flex-row items-center active:opacity-80"
                  style={{
                    // Keep this background OPAQUE. Android renders the `elevation`
                    // shadow THROUGH a translucent background, which showed up as
                    // a grey box behind the selected tile on the old screen.
                    backgroundColor: active ? '#EBF1F0' : '#FFFFFF',
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? A : LINE,
                    borderRadius: rs(12),
                    padding: rs(10),
                    marginBottom: rs(8),
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(42), width: rs(42), borderRadius: rs(11), marginRight: rs(10), backgroundColor: opt.grey ? GREY_TINT : A10 }}
                  >
                    <Icon size={rf(19)} color={opt.grey ? SUB : A} strokeWidth={2} />
                  </View>
                  <View className="flex-1" style={{ paddingRight: rs(8) }}>
                    <Text className="text-text" style={{ fontSize: rf(13.5), fontWeight: '600' }} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    <Text
                      style={{ fontSize: rf(11), marginTop: rs(1), color: active ? A : SUB, fontWeight: active ? '600' : '400' }}
                      numberOfLines={1}
                    >
                      {active ? 'In use · tap to change' : opt.desc}
                    </Text>
                  </View>
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(22), width: rs(22), borderRadius: rs(11), borderWidth: 2, borderColor: active ? A : HAIR }}
                  >
                    {active ? <View style={{ height: rs(10), width: rs(10), borderRadius: rs(5), backgroundColor: A }} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : step === 'PATTERN' ? (
          <View className="items-center" style={{ paddingTop: rs(8) }}>
            <Text className="text-text-muted text-center" style={{ fontSize: rf(11.5), marginBottom: rs(12) }}>
              Draw the pattern by dragging across the dots · at least 4
            </Text>
            <View style={{ borderRadius: rs(20), padding: rs(10), backgroundColor: A05, borderWidth: 1, borderColor: A20 }}>
              <PatternPad value={pattern} onChange={setPattern} />
            </View>
            <View className="flex-row items-center w-full" style={{ marginTop: rs(10) }}>
              <Text
                className="flex-1"
                style={{ fontSize: rf(11.5), color: patternDots ? A : SUB, fontWeight: patternDots ? '600' : '400' }}
                numberOfLines={1}
              >
                {patternDots
                  ? pattern.split(',').filter(Boolean).join(' → ')
                  : 'No dots yet'}
              </Text>
              {pattern ? (
                <Pressable onPress={() => setPattern('')} className="active:opacity-70" style={{ paddingHorizontal: rs(8), paddingVertical: rs(4) }}>
                  <Text className="text-danger" style={{ fontSize: rf(11.5), fontWeight: '600' }}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : step === 'PIN' ? (
          <View className="items-center" style={{ paddingTop: rs(8) }}>
            <View className="flex-row" style={{ marginBottom: rs(14) }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={{
                    marginHorizontal: rs(4),
                    width: pin.length > i ? rs(10) : rs(8),
                    height: pin.length > i ? rs(10) : rs(8),
                    borderRadius: rs(5),
                    backgroundColor: pin.length > i ? A : HAIR,
                  }}
                />
              ))}
            </View>
            <View className="flex-row flex-wrap justify-center" style={{ width: rs(240) }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <Pressable
                  key={n}
                  className="w-1/3 items-center active:opacity-60"
                  style={{ paddingVertical: rs(5) }}
                  onPress={() => setPin((p) => (p + String(n)).slice(0, 6))}
                >
                  <View
                    className="items-center justify-center"
                    style={{ width: rs(54), height: rs(54), borderRadius: rs(27), backgroundColor: SOFT, borderWidth: 1, borderColor: LINE }}
                  >
                    <Text className="text-text" style={{ fontSize: rf(18), fontWeight: '700' }}>{n}</Text>
                  </View>
                </Pressable>
              ))}
              <View className="w-1/3" />
              <Pressable
                className="w-1/3 items-center active:opacity-60"
                style={{ paddingVertical: rs(5) }}
                onPress={() => setPin((p) => (p + '0').slice(0, 6))}
              >
                <View
                  className="items-center justify-center"
                  style={{ width: rs(54), height: rs(54), borderRadius: rs(27), backgroundColor: SOFT, borderWidth: 1, borderColor: LINE }}
                >
                  <Text className="text-text" style={{ fontSize: rf(18), fontWeight: '700' }}>0</Text>
                </View>
              </Pressable>
              <Pressable
                className="w-1/3 items-center active:opacity-60"
                style={{ paddingVertical: rs(5) }}
                onPress={() => setPin((p) => p.slice(0, -1))}
                accessibilityRole="button"
                accessibilityLabel="Delete last digit"
              >
                <View className="items-center justify-center" style={{ width: rs(54), height: rs(54) }}>
                  <X size={rf(20)} color={INK} strokeWidth={2} />
                </View>
              </Pressable>
            </View>
            <Text className="text-text-muted self-start" style={{ fontSize: rf(10), fontWeight: '600', letterSpacing: 1.2, marginTop: rs(12) }}>
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
              style={{ borderRadius: rs(12), paddingHorizontal: rs(14), paddingVertical: rs(11), marginTop: rs(4), fontSize: rf(16), fontWeight: '700', backgroundColor: SOFT, borderWidth: 1, borderColor: LINE }}
            />
          </View>
        ) : (
          <View style={{ paddingTop: rs(8) }}>
            <Text className="text-text-muted" style={{ fontSize: rf(11.5), marginBottom: rs(10) }}>
              Enter 4–16 letters and digits
            </Text>
            <Text className="text-text-muted" style={{ fontSize: rf(10), fontWeight: '600', letterSpacing: 1.2 }}>
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
              style={{ borderRadius: rs(12), marginTop: rs(4), backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, paddingRight: rs(4) }}
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
                className="flex-1 text-text"
                style={{ paddingHorizontal: rs(14), paddingVertical: rs(11), fontSize: rf(14) }}
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
          </View>
        )}
      </ScrollView>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      {step === null ? (
        <>
          <Pressable
            onPress={() => isReady && onConfirm?.(lock)}
            disabled={!isReady}
            className="flex-row items-center justify-center active:opacity-90"
            style={{ marginTop: rs(12), borderRadius: rs(14), paddingVertical: rs(13), backgroundColor: isReady ? A : '#B8C4BE' }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isReady }}
          >
            <Text className="text-white" style={{ fontSize: rf(14), fontWeight: '600' }}>Continue</Text>
            <ChevronRight size={rf(18)} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
          {!isReady ? (
            <Text className="text-text-muted text-center" style={{ fontSize: rf(11.5), marginTop: rs(6) }}>
              Enter the {lock.type.toLowerCase()} to continue.
            </Text>
          ) : null}
        </>
      ) : (
        <Pressable
          onPress={() => {
            if (step === 'PATTERN') save('PATTERN', pattern);
            else if (step === 'PIN') save('PIN', pin);
            else save('PASSWORD', password);
          }}
          disabled={
            step === 'PATTERN' ? patternDots < 4
              : step === 'PIN' ? pin.length < 4
              : password.length < 4
          }
          className="flex-row items-center justify-center active:opacity-90"
          style={{
            marginTop: rs(12),
            borderRadius: rs(14),
            paddingVertical: rs(13),
            backgroundColor: (step === 'PATTERN' ? patternDots >= 4 : step === 'PIN' ? pin.length >= 4 : password.length >= 4)
              ? A : '#B8C4BE',
          }}
          accessibilityRole="button"
        >
          <Save size={rf(16)} color="#FFFFFF" strokeWidth={2} />
          <Text className="text-white" style={{ fontSize: rf(14), fontWeight: '600', marginLeft: rs(8) }}>Save</Text>
        </Pressable>
      )}
    </ResponsiveModal>
  );
}
