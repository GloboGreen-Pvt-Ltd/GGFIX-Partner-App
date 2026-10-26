import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  Lock, LockOpen, Hash, KeyRound, Grid3x3, ChevronLeft, ShieldCheck, Eye, EyeOff, ArrowRight, Cloud,
} from 'lucide-react-native';
import { ResponsiveModal } from '../../../components/responsive';
import { rf, rs } from '../../../utils/responsive';

/**
 * Device Security Lock — a popup, replacing the screen this used to be.
 *
 * One view: the four lock types as radio cards; the PIN field, password field
 * or 3x3 pattern pad shows inside the selected card only, and a single
 * Continue commits (same minimums as before: PIN/password 4+, pattern 4+ dots).
 *
 * · The sheet cannot commit anything itself. It hands the finished lock to
 *   `onConfirm` and the caller owns navigation, so "which screen comes after the
 *   lock" stays in one place.
 */
// GGFIX palette.
const A = '#035C6C';        // GGFIX green — fills, icons, selected
const PRIMARY = '#035C6C';  // deeper green — gradient partner, green text
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const INK = '#111111';
const MUTED = '#9CA3AF';
const SUB = '#6B7280';
const LINE = '#E5E7EB';
const SOFT = '#F3F4F6';
const HAIR = '#D1D5DB';
const RED = '#F84141';

// 3x3 lock pattern pad — drag across dots to draw a pattern (Android style).
// Reference design: small plain grey dots on a soft grey card (no numbers —
// the caller shows the order as text). Every size scales off `cell` (one grid
// square), so the same pad runs full size here and compact on Device & Service
// Details.
const CELL = rs(64);
const ENTRY_CELL = rs(84); // pattern-only popup on Device & Service Details: 252 vs 192 pad

function dotCenter(idx, cell) {
  const i = idx - 1;
  return { x: (i % 3) * cell + cell / 2, y: Math.floor(i / 3) * cell + cell / 2 };
}

export function PatternPad({ value, onChange, cell = CELL, onDrawStart, onDrawEnd }) {
  const PAD_SIZE = cell * 3;
  const HIT_R = cell * 0.44;    // snap radius (< cell / 2, so only the nearest dot matches)
  const DOT_BOX = cell * 0.31;  // half the touch-free wrapper
  const DOT = cell * 0.22;      // the visible dot
  const DOT_ON = cell * 0.28;   // a dot on the drawn path
  const initial = (value || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 9);
  const [path, setPath] = useState(initial);
  const [current, setCurrent] = useState(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  // Latest start/end callbacks (the responder below is created once).
  const drawCb = useRef({ onDrawStart, onDrawEnd });
  drawCb.current = { onDrawStart, onDrawEnd };
  // Finger position = where it first touched the pad + how far it has moved.
  // iOS reports locationX relative to whichever child is under the finger, so
  // reading it on every move made the line jump; the gesture's dx/dy don't.
  const start = useRef({ x: 0, y: 0 });

  const findHit = (x, y) => {
    for (let i = 1; i <= 9; i++) {
      const c = dotCenter(i, cell);
      const dx = x - c.x; const dy = y - c.y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
    }
    return null;
  };

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      // Tell the host to freeze its ScrollView while drawing (iOS otherwise
      // scrolls the page under the finger and steals the gesture).
      drawCb.current.onDrawStart?.();
      const { locationX, locationY } = e.nativeEvent;
      start.current = { x: locationX, y: locationY };
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      const next = hit ? [hit] : [];
      pathRef.current = next;
      setPath(next);
      onChange(next.join(','));
    },
    onPanResponderMove: (e, g) => {
      const locationX = start.current.x + g.dx;
      const locationY = start.current.y + g.dy;
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
      drawCb.current.onDrawEnd?.();
    },
    onPanResponderTerminate: () => {
      setCurrent(null);
      onChange(pathRef.current.join(','));
      drawCb.current.onDrawEnd?.();
    },
  })).current;

  return (
    <View {...responder.panHandlers} style={{ width: PAD_SIZE, height: PAD_SIZE }}>
      <Svg style={StyleSheet.absoluteFill} width={PAD_SIZE} height={PAD_SIZE}>
        {path.map((dot, idx) => {
          if (idx === 0) return null;
          const a = dotCenter(path[idx - 1], cell);
          const b = dotCenter(dot, cell);
          return <Line key={`l${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={A} strokeWidth={3.5} strokeLinecap="round" />;
        })}
        {path.length > 0 && current ? (() => {
          const last = dotCenter(path[path.length - 1], cell);
          return <Line x1={last.x} y1={last.y} x2={current.x} y2={current.y} stroke={A} strokeWidth={3} opacity={0.4} />;
        })() : null}
      </Svg>
      {Array.from({ length: 9 }, (_, i) => i + 1).map((dot) => {
        const c = dotCenter(dot, cell);
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
                width: active ? DOT_ON : DOT,
                height: active ? DOT_ON : DOT,
                borderRadius: (active ? DOT_ON : DOT) / 2,
                backgroundColor: active ? A : MUTED,
                // Subtle glow on selected dots — visual only, no change to hit
                // detection or the path state above.
                shadowColor: active ? A : 'transparent',
                shadowOpacity: active ? 0.55 : 0,
                shadowRadius: active ? 6 : 0,
                shadowOffset: { width: 0, height: 0 },
                elevation: active ? 3 : 0,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

const LOCK_OPTIONS = [
  { key: 'PIN', label: 'Numeric PIN', desc: '4–6 digit device PIN', icon: Hash, color: '#3B82F6' },
  { key: 'PASSWORD', label: 'Password', desc: '4–16 letters & numbers', icon: KeyRound, color: '#A855F7' },
  { key: 'PATTERN', label: 'Pattern Lock', desc: 'Draw across at least 4 dots', icon: Grid3x3, color: '#F97316' },
  { key: 'ACCOUNT', label: 'iCloud / Google Account', desc: 'Locked to an Apple / Google account', icon: Cloud, color: '#0EA5E9' },
  { key: 'NONE', label: 'No Lock', desc: 'Device is already unlocked', icon: LockOpen, color: '#609138' },
];

// Honest privacy copy: the value IS stored (a technician needs it later), so
// this only promises it stays with the people servicing the device.
const SECURE_NOTE = 'Encrypted & secure · used only by our technician during service';

// Compact font hierarchy, matching the rest of the booking screens.
const F = { header: rf(17), section: rf(14), title: rf(13), desc: rf(11.5) };

const SOFT_SHADOW = {
  shadowColor: INK, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

/**
 * @param types  lock keys to offer (utils/deviceSpecs lockTypesFor) — e.g. a
 *               Laptop gets only PIN + PASSWORD. Omitted → all four.
 */
/**
 * `inline` renders just the body on the host screen (no popup, header or
 * footer): it reports { type, value, ready } through `onChange`, shows the
 * validation under the input when `showErrors`, and `onInputFocus(y)` lets
 * the host scroll the focused field above the keyboard.
 */
export default function DeviceSecurityLockSheet({
  visible, initialLock, onConfirm, onClose, types, inline = false, onChange, showErrors = false, onInputFocus, showProgress = true, entryOnly = false,
}) {
  const options = Array.isArray(types) ? LOCK_OPTIONS.filter((o) => types.includes(o.key)) : LOCK_OPTIONS;
  const seed = (initialLock && initialLock.type)
    ? { type: initialLock.type, value: initialLock.value || '' }
    : { type: 'NONE', value: '' };

  const [type, setType] = useState(seed.type);
  const [pattern, setPattern] = useState(seed.type === 'PATTERN' ? seed.value : '');
  const [pin, setPin] = useState(seed.type === 'PIN' ? seed.value : '');
  const [password, setPassword] = useState(seed.type === 'PASSWORD' ? seed.value : '');
  // iCloud / Google account lock — the account name is optional.
  const [account, setAccount] = useState(seed.type === 'ACCOUNT' ? seed.value : '');
  // Visible by DEFAULT — see the password field below for why.
  const [pwMasked, setPwMasked] = useState(false);
  // Set by a Continue tap on an incomplete lock — shows the message under the input.
  const [tried, setTried] = useState(false);
  const innerScrollRef = useRef(null);
  // Remounts the pad on Reset so its drawn path clears too.
  const [padKey, setPadKey] = useState(0);
  // True while a finger is drawing on the pattern pad — the sheet's list stops
  // scrolling so the pad keeps the gesture.
  const [drawing, setDrawing] = useState(false);

  // Re-seed each time the sheet opens: the caller's prefill can change between
  // opens (a re-estimate carries the ticket's saved lock), and a sheet that
  // keeps stale state would silently submit the previous device's lock.
  useEffect(() => {
    if (!visible) return;
    setType(seed.type);
    setPattern(seed.type === 'PATTERN' ? seed.value : '');
    setPin(seed.type === 'PIN' ? seed.value : '');
    setPassword(seed.type === 'PASSWORD' ? seed.value : '');
    setAccount(seed.type === 'ACCOUNT' ? seed.value : '');
    setPwMasked(false);
    setTried(false);
    setPadKey((k) => k + 1);
    // seed is derived from initialLock; depending on the parts avoids a new
    // object identity re-running this on every parent render.
  }, [visible, initialLock?.type, initialLock?.value]);

  const patternDots = pattern.split(',').filter(Boolean).length;
  const value = type === 'PIN' ? pin : type === 'PASSWORD' ? password : type === 'PATTERN' ? pattern : type === 'ACCOUNT' ? account.trim() : '';
  // Same minimums the old per-type Save buttons enforced.
  const isReady = type === 'NONE' || type === 'ACCOUNT'
    || (type === 'PIN' && pin.length >= 4)
    || (type === 'PASSWORD' && password.length >= 4)
    || (type === 'PATTERN' && patternDots >= 4);

  const summary = () => {
    if (type === 'NONE') return 'No lock set';
    if (type === 'ACCOUNT') return account.trim() ? `Account · ${account.trim()}` : 'iCloud / Google Account';
    if (type === 'PIN') return pin ? `PIN · ${pin}` : 'PIN';
    if (type === 'PASSWORD') return password ? `Password · ${password}` : 'Password';
    if (type === 'PATTERN') return patternDots > 0 ? `Pattern · ${pattern.split(',').filter(Boolean).join('>')}` : 'Pattern';
    return '—';
  };

  useEffect(() => { onChange?.({ type, value, ready: isReady }); }, [type, value, isReady]);
  const cardY = useRef({});
  const showErr = showErrors || tried;
  // Inline: the host scrolls. Popup: scroll this sheet's own list.
  const focusCard = (key) => {
    const y = cardY.current[key] || 0;
    if (inline) { onInputFocus?.(y); return; }
    setTimeout(() => innerScrollRef.current?.scrollTo({ y: Math.max(0, y - rs(8)), animated: true }), 250);
  };

  const pendingHint = type === 'PATTERN'
    ? 'Draw the pattern (at least 4 dots) to continue.'
    : `Enter the ${type === 'PIN' ? 'PIN' : 'password'} (at least 4 characters) to continue.`;

  const renderEntry = (key) => {
    if (key === 'PIN') {
      return (
        <TextInput
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="Enter 4–6 digit PIN"
          placeholderTextColor={MUTED}
          autoComplete="off"
          textContentType="none"
          onFocus={() => focusCard('PIN')}
          style={[S.input, { textAlign: 'center', letterSpacing: pin ? 6 : 0, fontWeight: '700', fontSize: rf(15) }]}
        />
      );
    }
    if (key === 'PASSWORD') {
      // VISIBLE by default, with a toggle to mask. The shop is writing DOWN the
      // customer's password so a technician can unlock the device later; a
      // masked typo is undetectable. autoCapitalize/autoCorrect/autoComplete
      // off: each would silently change what gets saved.
      return (
        <View style={[S.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, paddingRight: 4 }]}>
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
            onFocus={() => focusCard('PASSWORD')}
            style={{ flex: 1, paddingHorizontal: 12, fontSize: rf(13), color: INK }}
          />
          <Pressable
            onPress={() => setPwMasked((m) => !m)}
            hitSlop={8}
            style={{ height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={pwMasked ? 'Show password' : 'Hide password'}
          >
            {pwMasked ? <Eye size={18} color={SUB} strokeWidth={2} /> : <EyeOff size={18} color={SUB} strokeWidth={2} />}
          </Pressable>
        </View>
      );
    }
    if (key === 'ACCOUNT') {
      return (
        <TextInput
          value={account}
          onChangeText={setAccount}
          placeholder="Account email / ID (optional)"
          placeholderTextColor={MUTED}
          maxLength={60}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          style={[S.input, { fontSize: rf(13) }]}
        />
      );
    }
    if (key === 'PATTERN') {
      return (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <View style={{ borderRadius: 16, padding: 8, backgroundColor: SOFT }}>
            {/* Device & Service Details (entryOnly) gets a taller pad — easier to draw on. */}
            <PatternPad key={padKey} value={pattern} onChange={setPattern} cell={entryOnly ? ENTRY_CELL : CELL} onDrawStart={() => setDrawing(true)} onDrawEnd={() => setDrawing(false)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 8 }}>
            <Text style={{ flex: 1, fontSize: F.desc, color: patternDots >= 4 ? PRIMARY : SUB, fontWeight: '600' }} numberOfLines={1}>
              {patternDots} dot{patternDots === 1 ? '' : 's'}{patternDots ? ` · ${pattern.split(',').filter(Boolean).join('>')}` : ''}
            </Text>
            {pattern ? (
              <Pressable onPress={() => { setPattern(''); setPadKey((k) => k + 1); }} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontSize: F.desc, fontWeight: '700', color: RED }}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }
    return null;
  };

  const body = (
    <View>
        {/* Security banner */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: MINT_LINE }}>
          <View style={{ height: rs(36), width: rs(36), borderRadius: rs(10), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={rf(18)} color={A} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: F.section, fontWeight: '800', color: INK }}>Secure device access</Text>
            <Text style={{ fontSize: F.desc, color: SUB, marginTop: 2, lineHeight: rf(16) }}>
              Save the device's screen lock so our technician can open it during service.
            </Text>
          </View>
        </View>

        {/* Current security — driven by the live selection + entered value. */}
        <View style={[S.card, { flexDirection: 'row', alignItems: 'center', marginTop: 10 }]}>
          <View style={[S.tile, { backgroundColor: (LOCK_OPTIONS.find((o) => o.key === type) || LOCK_OPTIONS[3]).color }]}>
            {type === 'NONE' ? <LockOpen size={rf(17)} color="#FFFFFF" strokeWidth={2} /> : <Lock size={rf(17)} color="#FFFFFF" strokeWidth={2} />}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', letterSpacing: 0.6, color: SUB }}>CURRENT SECURITY</Text>
            <Text style={{ fontSize: F.title, fontWeight: '700', color: INK, marginTop: 1 }} numberOfLines={1}>{summary()}</Text>
          </View>
          {isReady ? (
            <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: A, marginLeft: 8 }}>
              <Text style={{ fontSize: rf(10), fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>READY</Text>
            </View>
          ) : null}
        </View>

        {/* Lock options — entry shows inside the selected card only. */}
        <Text style={{ fontSize: F.section, fontWeight: '800', color: INK, marginTop: 14 }}>Choose Device Lock</Text>
        <Text style={{ fontSize: F.desc, color: SUB, marginTop: 1, marginBottom: 8 }}>Select the lock currently used on this device.</Text>
        {options.map((opt) => {
          const active = type === opt.key;
          const Icon = opt.icon;
          return (
            // Keep the background OPAQUE: Android draws the elevation shadow
            // through a translucent fill as a grey box.
            <View
              key={opt.key}
              style={[S.card, { marginBottom: 8, backgroundColor: active ? MINT : '#FFFFFF', borderColor: active ? A : LINE, borderWidth: active ? 1.5 : 1 }]}
              onLayout={(e) => { cardY.current[opt.key] = e.nativeEvent.layout.y; }}
            >
              <Pressable
                onPress={() => setType(opt.key)}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={opt.label}
              >
                <View style={[S.tile, { backgroundColor: opt.color }]}>
                  <Icon size={rf(17)} color="#FFFFFF" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                  <Text style={{ fontSize: F.title, fontWeight: '700', color: INK }} numberOfLines={1}>{opt.label}</Text>
                  <Text style={{ fontSize: F.desc, color: SUB, marginTop: 1 }} numberOfLines={1}>{opt.desc}</Text>
                </View>
                <View style={{ height: 22, width: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? A : HAIR, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
                  {active ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: A }} /> : null}
                </View>
              </Pressable>
              {active ? renderEntry(opt.key) : null}
              {active && !isReady && (showErr || value.length > 0) ? (
                <Text style={{ fontSize: rf(12), fontWeight: '600', color: RED, marginTop: rs(6) }}>{pendingHint}</Text>
              ) : null}
            </View>
          );
        })}
    </View>
  );
  if (inline) return body;

  // entryOnly: the caller already picked the type — show just its entry.
  const ENTRY_TITLE = { PIN: 'Enter Device PIN', PASSWORD: 'Enter Device Password', PATTERN: 'Draw Lock Pattern', ACCOUNT: 'iCloud / Google Account' };
  const entryBody = (
    <View style={{ paddingTop: rs(4) }}>
      {renderEntry(type)}
      {!isReady && (showErr || value.length > 0) ? (
        <Text style={{ fontSize: rf(12), fontWeight: '600', color: RED, marginTop: rs(6) }}>{pendingHint}</Text>
      ) : null}
    </View>
  );

  return (
    <ResponsiveModal
      visible={visible}
      onClose={onClose}
      maxWidth={760}
      contentStyle={{ borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), backgroundColor: '#FFFFFF' }}
    >
      <View style={{ alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: LINE, marginBottom: rs(10) }} />

      {/* ── Header: back · title · compact progress (Files → Lock → Parts) ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={S.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={19} color={INK} strokeWidth={2} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: F.header, fontWeight: '800', color: INK, marginLeft: 10 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {entryOnly ? (ENTRY_TITLE[type] || 'Device Security Lock') : 'Device Security Lock'}
        </Text>
        {showProgress ? (
          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
            <View style={{ flexDirection: 'row' }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 14, height: 4, borderRadius: 2, marginLeft: 3, backgroundColor: i <= 1 ? A : LINE }} />
              ))}
            </View>
            <Text style={{ fontSize: rf(11), fontWeight: '600', color: SUB, marginTop: 3 }}>Step 2 of 3</Text>
          </View>
        ) : null}
      </View>

      {/* `flexShrink` lets this give up height inside the panel's maxHeight, so
          Continue stays reachable when the pattern grid makes content tall. */}
      <ScrollView ref={innerScrollRef} style={{ flexShrink: 1 }} scrollEnabled={!drawing} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {entryOnly ? entryBody : body}
      </ScrollView>

      {/* ── Footer: one full-width Continue + secure note ── */}
      <Pressable
        onPress={() => (isReady ? onConfirm?.({ type, value }) : setTried(true))}
        style={{
          marginTop: rs(10), height: rs(50), borderRadius: rs(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isReady ? A : SOFT,
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !isReady }}
      >
        <Text style={{ fontSize: F.title, fontWeight: '700', color: isReady ? '#FFFFFF' : SUB }}>{entryOnly ? 'Save' : 'Continue'}</Text>
        <ArrowRight size={18} color={isReady ? '#FFFFFF' : SUB} strokeWidth={2.5} style={{ marginLeft: rs(6) }} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
        <ShieldCheck size={12} color={SUB} strokeWidth={2} />
        <Text style={{ flexShrink: 1, fontSize: rf(11), fontWeight: '600', color: SUB, marginLeft: 5 }} numberOfLines={1}>{SECURE_NOTE}</Text>
      </View>
    </ResponsiveModal>
  );
}

const S = {
  backBtn: {
    height: rs(36), width: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#C7E6EA',
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: LINE,
    paddingHorizontal: rs(10), paddingVertical: rs(8), ...SOFT_SHADOW,
  },
  tile: { height: rs(34), width: rs(34), borderRadius: rs(10), alignItems: 'center', justifyContent: 'center' },
  input: {
    marginTop: rs(8), minHeight: rs(42), borderRadius: rs(10), paddingHorizontal: rs(12),
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, color: INK,
  },
};
