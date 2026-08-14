import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import {
  ArrowLeft,
  Lock,
  LockOpen,
  Hash,
  KeyRound,
  Grid3x3,
  X,
  Save,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react-native';
import { Dialog, DialogHeader } from '../../../components/rnr';

// Swiggy / Zomato palette — matches the rest of the booking flow.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

// 3x3 lock pattern pad — drag across dots to draw a pattern (Android style).
const CELL = 80;
const PAD_SIZE = CELL * 3;
const HIT_R = 32; // px radius for snapping the finger to a dot
const DOT_VISUAL = 16;

function dotCenter(idx) {
  const i = idx - 1;
  const row = Math.floor(i / 3);
  const col = i % 3;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
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
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      if (hit && !pathRef.current.includes(hit)) {
        const next = [...pathRef.current, hit];
        pathRef.current = next;
        setPath(next);
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
          return <Line key={`l${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ACCENT_GREEN} strokeWidth={3} />;
        })}
        {path.length > 0 && current ? (() => {
          const last = dotCenter(path[path.length - 1]);
          return <Line x1={last.x} y1={last.y} x2={current.x} y2={current.y} stroke={ACCENT_GREEN} strokeWidth={3} opacity={0.4} />;
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
              left: c.x - DOT_VISUAL,
              top: c.y - DOT_VISUAL,
              width: DOT_VISUAL * 2,
              height: DOT_VISUAL * 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{
              width: active ? 22 : DOT_VISUAL,
              height: active ? 22 : DOT_VISUAL,
              borderRadius: 11,
              backgroundColor: active ? ACCENT_GREEN : '#172117',
              opacity: active ? 1 : 0.5,
            }} />
          </View>
        );
      })}
    </View>
  );
}

const LOCK_OPTIONS = [
  {
    key: 'PIN',
    label: 'Numeric PIN',
    desc: '4–6 digit numeric lock',
    icon: Hash,
    palette: { bg: 'rgba(22, 187, 5, 0.10)', icon: BRAND_GREEN_DARK },
  },
  {
    key: 'PASSWORD',
    label: 'Alphanumeric Password',
    desc: '4–16 letters & digits',
    icon: KeyRound,
    palette: { bg: 'rgba(22, 187, 5, 0.10)', icon: BRAND_GREEN_DARK },
  },
  {
    key: 'PATTERN',
    label: 'Pattern Lock',
    desc: 'Connect at least 4 dots',
    icon: Grid3x3,
    palette: { bg: 'rgba(22, 187, 5, 0.10)', icon: BRAND_GREEN_DARK },
  },
  {
    key: 'NONE',
    label: 'No Lock',
    desc: 'Device has no screen lock',
    icon: LockOpen,
    palette: { bg: 'rgba(143, 160, 143, 0.18)', icon: '#667066' },
  },
];

export default function DeviceSecurityScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const initialLock = (params.prefillLock && params.prefillLock.type)
    ? { type: params.prefillLock.type, value: params.prefillLock.value || '' }
    : { type: 'NONE', value: '' };
  const [open, setOpen] = useState(null); // 'pattern' | 'pin' | 'password' | null
  const [pattern, setPattern] = useState(initialLock.type === 'PATTERN' ? initialLock.value : '');
  const [pin, setPin] = useState(initialLock.type === 'PIN' ? initialLock.value : '');
  const [password, setPassword] = useState(initialLock.type === 'PASSWORD' ? initialLock.value : '');
  const [lock, setLock] = useState(initialLock);

  const onSelect = (type) => {
    if (type === 'NONE') { setLock({ type: 'NONE', value: '' }); return; }
    setOpen(type.toLowerCase());
  };

  const saveLock = (type, value) => {
    setLock({ type, value });
    setOpen(null);
  };

  const lockSummary = () => {
    if (lock.type === 'NONE') return 'No lock set';
    if (lock.type === 'PIN') return lock.value ? `PIN · ${lock.value.length} digits` : 'PIN';
    if (lock.type === 'PASSWORD') return lock.value ? `Password · ${lock.value.length} chars` : 'Password';
    if (lock.type === 'PATTERN') {
      const dots = lock.value.split(',').filter(Boolean).length;
      return dots > 0 ? `Pattern · ${dots} dots` : 'Pattern';
    }
    return '—';
  };

  const isReady = lock.type === 'NONE' || (lock.value && lock.value.length > 0);

  const next = () => {
    if (!isReady) return;
    navigation.navigate('DeviceMissingParts', { ...params, lock });
  };

  return (
    <View className="flex-1 bg-background">
      {/* ── White header — matches app's other white headers ─────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 10, paddingBottom: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="h-10 w-10 rounded-full bg-surface-muted items-center justify-center mr-3 active:opacity-70"
          >
            <ArrowLeft size={20} color="#172117" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-text text-[16px] font-bold" numberOfLines={1}>
              Device Security Lock
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 0, paddingBottom: 150 }}>
        {/* ── Status card overlapping hero ───────────────────────── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-card rounded-2xl p-3.5"
            style={{
              shadowColor: '#172117',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View className="flex-row items-center">
              <View
                className="h-14 w-14 rounded-2xl items-center justify-center mr-3"
                style={{ backgroundColor: lock.type === 'NONE' ? 'rgba(143, 160, 143, 0.18)' : 'rgba(8, 122, 10, 0.15)' }}
              >
                {lock.type === 'NONE' ? (
                  <LockOpen size={24} color="#667066" />
                ) : (
                  <Lock size={24} color={ACCENT_GREEN} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-text-muted font-bold tracking-widest">CURRENT LOCK</Text>
                <Text className="text-[15px] font-extrabold text-text mt-0.5" numberOfLines={1}>
                  {lockSummary()}
                </Text>
                <Text className="text-[10.5px] text-text-muted mt-0.5">
                  Tap a tile below to change.
                </Text>
              </View>
              {isReady ? (
                <View className="bg-success/15 rounded-full px-2.5 py-1 flex-row items-center">
                  <ShieldCheck size={11} color={ACCENT_GREEN} />
                  <Text className="text-success text-[10px] font-extrabold ml-1">READY</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Section rail ───────────────────────────────────────── */}
        <View className="px-4 pt-5 pb-2 flex-row items-center">
          <Lock size={14} color={BRAND_GREEN_DARK} />
          <Text className="text-text font-extrabold text-[12.5px] tracking-widest ml-1.5">PICK A LOCK TYPE</Text>
          <View className="flex-1 h-px bg-border ml-2" />
        </View>

        {/* ── Lock-type tiles — Swiggy menu rhythm ──────────────── */}
        <View className="px-4">
          {LOCK_OPTIONS.map((opt) => {
            const active = lock.type === opt.key;
            const Icon = opt.icon;
            return (
              <Pressable
                key={opt.key}
                onPress={() => onSelect(opt.key)}
                className="rounded-2xl mb-2.5 flex-row items-center"
                style={{
                  // NOTE: keep this background OPAQUE. Android renders the
                  // `elevation` shadow *through* a translucent background, which
                  // showed up as an ugly gray box behind the selected tile. This
                  // is the opaque equivalent of the old rgba(8, 122, 10, 0.06) green
                  // so both platforms match the clean iOS look.
                  backgroundColor: active ? '#F0F8EF' : '#FFFFFF',
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? ACCENT_GREEN : '#E2E8E2',
                  padding: 12,
                  shadowColor: '#172117',
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: active ? 3 : 1,
                }}
              >
                <View
                  className="h-12 w-12 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: opt.palette.bg }}
                >
                  <Icon size={20} color={opt.palette.icon} />
                </View>
                <View className="flex-1 pr-2">
                  <Text className="text-text font-extrabold text-[14px]" numberOfLines={1}>
                    {opt.label}
                  </Text>
                  <Text
                    className={`text-[11px] mt-0.5 ${active ? 'text-success font-extrabold' : 'text-text-muted'}`}
                    numberOfLines={1}
                  >
                    {active ? 'In use · tap to change' : opt.desc}
                  </Text>
                </View>
                <View
                  className="h-6 w-6 rounded-full items-center justify-center"
                  style={{ borderWidth: 2, borderColor: active ? ACCENT_GREEN : '#CBD5CB' }}
                >
                  {active ? <View className="h-3 w-3 rounded-full" style={{ backgroundColor: ACCENT_GREEN }} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

      </ScrollView>

      {/* ── Sticky green CTA ─────────────────────────────────── */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={next}
          disabled={!isReady}
          className="active:opacity-90"
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            opacity: isReady ? 1 : 0.6,
            shadowColor: BRAND_GREEN_DARK,
            shadowOpacity: isReady ? 0.35 : 0,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: isReady ? 10 : 0,
          }}
        >
          <LinearGradient
            colors={isReady ? [BRAND_GREEN, BRAND_GREEN_DARK] : ['#8FA08F', '#667066']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text className="text-white text-[11px] font-bold opacity-90">{lock.type === 'NONE' ? 'NO LOCK SELECTED' : 'LOCK CONFIGURED'}</Text>
              <Text className="text-white text-[16px] font-extrabold" numberOfLines={1}>
                Next: Missing Parts
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-white text-[14px] font-extrabold">Continue</Text>
              <ChevronRight size={18} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>
        {!isReady ? (
          <Text className="text-text-muted text-[10.5px] text-center mt-2">
            Enter a {open || 'lock'} to continue.
          </Text>
        ) : null}
      </View>

      {/* ── Pattern dialog ─────────────────────────────────── */}
      <Dialog open={open === 'pattern'} onClose={() => setOpen(null)}>
        <View className="self-center w-full" style={{ maxWidth: 360 }}>
          <DialogHeader onClose={() => setOpen(null)} />
          <View className="items-center pt-1">
            <View
              className="rounded-2xl p-3 mb-3"
              style={{ backgroundColor: ACCENT_GREEN }}
            >
              <Grid3x3 size={22} color="#fff" />
            </View>
            <Text className="text-[17px] font-extrabold text-text">Draw Lock Screen Pattern</Text>
            <Text className="text-[11px] text-text-muted mt-1 mb-4">Connect at least 4 dots</Text>
            <View
              className="rounded-3xl p-3"
              style={{ backgroundColor: 'rgba(8, 122, 10, 0.05)', borderWidth: 1, borderColor: 'rgba(8, 122, 10, 0.20)' }}
            >
              <PatternPad value={pattern} onChange={setPattern} />
            </View>
            <View className="flex-row items-center mt-3 w-full">
              <Text className="text-xs text-text-muted flex-1" numberOfLines={1}>
                {pattern ? `${pattern.split(',').filter(Boolean).length} dots connected` : 'No dots yet'}
              </Text>
              {pattern ? (
                <Pressable onPress={() => setPattern('')} className="active:opacity-70 px-2 py-1">
                  <Text className="text-xs text-danger font-extrabold">Reset</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <DialogSaveButton
            disabled={pattern.split(',').filter(Boolean).length < 4}
            onPress={() => saveLock('PATTERN', pattern)}
          />
        </View>
      </Dialog>

      {/* ── PIN dialog ────────────────────────────────────── */}
      <Dialog open={open === 'pin'} onClose={() => setOpen(null)}>
        <View className="self-center w-full" style={{ maxWidth: 360 }}>
          <DialogHeader onClose={() => setOpen(null)} />
          <View className="items-center pt-1">
            <View className="rounded-2xl p-3 mb-3" style={{ backgroundColor: ACCENT_GREEN }}>
              <Hash size={22} color="#fff" />
            </View>
            <Text className="text-[17px] font-extrabold text-text mb-2">Enter Device PIN</Text>
            <View className="flex-row mb-5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  className="mx-1 rounded-full"
                  style={{
                    width: pin.length > i ? 10 : 8,
                    height: pin.length > i ? 10 : 8,
                    backgroundColor: pin.length > i ? ACCENT_GREEN : '#CBD5CB',
                  }}
                />
              ))}
            </View>
            <View className="flex-row flex-wrap justify-center" style={{ width: 240 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <Pressable
                  key={n}
                  className="w-1/3 items-center py-1.5 active:opacity-60"
                  onPress={() => setPin((p) => (p + String(n)).slice(0, 6))}
                >
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center"
                    style={{ backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#E2E8E2' }}
                  >
                    <Text className="font-extrabold text-text text-[18px]">{n}</Text>
                  </View>
                </Pressable>
              ))}
              <View className="w-1/3" />
              <Pressable
                className="w-1/3 items-center py-1.5 active:opacity-60"
                onPress={() => setPin((p) => (p + '0').slice(0, 6))}
              >
                <View
                  className="w-14 h-14 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#E2E8E2' }}
                >
                  <Text className="font-extrabold text-text text-[18px]">0</Text>
                </View>
              </Pressable>
              <Pressable
                className="w-1/3 items-center py-1.5 active:opacity-60"
                onPress={() => setPin((p) => p.slice(0, -1))}
              >
                <View className="w-14 h-14 items-center justify-center">
                  <X size={22} color="#172117" />
                </View>
              </Pressable>
            </View>
            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest mt-4 self-start">PIN NUMBER</Text>
            <TextInput
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="numeric"
              maxLength={6}
              placeholder="Enter PIN"
              placeholderTextColor="#8FA08F"
              className="rounded-xl px-4 py-3 mt-1 w-full text-text text-center text-[16px] font-bold"
              style={{ backgroundColor: '#F7FAF7', borderWidth: 1, borderColor: '#E2E8E2' }}
            />
          </View>
          <DialogSaveButton
            disabled={pin.length < 4}
            onPress={() => saveLock('PIN', pin)}
          />
        </View>
      </Dialog>

      {/* ── Password dialog ─────────────────────────────── */}
      <Dialog open={open === 'password'} onClose={() => setOpen(null)}>
        <View className="self-center w-full" style={{ maxWidth: 360 }}>
          <DialogHeader onClose={() => setOpen(null)} />
          <View className="items-center pt-1">
            <View className="rounded-2xl p-3 mb-3" style={{ backgroundColor: ACCENT_GREEN }}>
              <KeyRound size={22} color="#fff" />
            </View>
            <Text className="text-[17px] font-extrabold text-text">Enter Device Password</Text>
            <Text className="text-[11px] text-text-muted mt-1 mb-4">Enter 4–16 letters and digits</Text>
            <Text className="text-[10px] font-extrabold text-text-muted tracking-widest self-start">PASSWORD</Text>
            <TextInput
              className="rounded-xl px-4 py-3 mt-1 w-full text-text"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor="#8FA08F"
              maxLength={16}
              style={{ backgroundColor: '#F7FAF7', borderWidth: 1, borderColor: '#E2E8E2' }}
            />
          </View>
          <DialogSaveButton
            disabled={password.length < 4}
            onPress={() => saveLock('PASSWORD', password)}
          />
        </View>
      </Dialog>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function DialogSaveButton({ disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="mt-4 active:opacity-90"
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        opacity: disabled ? 0.55 : 1,
        shadowColor: BRAND_GREEN_DARK,
        shadowOpacity: disabled ? 0 : 0.30,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: disabled ? 0 : 6,
      }}
    >
      <LinearGradient
        colors={disabled ? ['#8FA08F', '#667066'] : [BRAND_GREEN, BRAND_GREEN_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
      >
        <Save size={16} color="#fff" />
        <Text className="text-white text-[14px] font-extrabold ml-2">Save</Text>
      </LinearGradient>
    </Pressable>
  );
}

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
