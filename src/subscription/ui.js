// Shared building blocks for the subscription screens: header, cards, badges,
// buttons, skeleton/error states and the "pay on Shop Web" notice.
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, Check, ChevronLeft, ExternalLink, Globe, RefreshCw } from 'lucide-react-native';
import { brand } from '../theme/colors';
import { rs } from '../utils/responsive';
import { canLinkToShopWeb, openShopWebSubscription } from './razorpay';

export const C = {
  teal: brand.teal,
  tealSoft: '#E5F3F5',
  tealLine: '#C7E6EA',
  navy: brand.navy,
  blue: brand.blue,
  green: brand.green,
  greenSoft: '#EEF5E8',
  orange: brand.orange,
  orangeSoft: '#FFF4DB',
  orangeInk: '#B45309',
  red: '#B91C1C',
  redSoft: '#FEE2E2',
  ink: '#111111',
  muted: '#6B7280',
  subtle: '#9CA3AF',
  line: '#E5E7EB',
  soft: '#F3F4F6',
  white: '#FFFFFF',
};

export const shadow = {
  shadowColor: '#111111',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

/** Gated (EXPIRED/CANCELLED) stack hands its unlock/logout down through this. */
export const SubscriptionGateContext = createContext({ gated: false, onUnlock: null, onLogout: null });
export const useSubscriptionGate = () => useContext(SubscriptionGateContext);

const TONES = {
  teal: { fg: C.teal, bg: C.tealSoft },
  green: { fg: C.green, bg: C.greenSoft },
  orange: { fg: C.orangeInk, bg: C.orangeSoft },
  red: { fg: C.red, bg: C.redSoft },
  gray: { fg: C.muted, bg: C.soft },
  blue: { fg: C.blue, bg: '#E6F3FA' },
};

/** Tone for any subscription / coverage / order / payment status. */
export function statusTone(status) {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE': case 'ACTIVATED': case 'PAID': case 'CAPTURED': case 'SUCCESS': return 'green';
    case 'TRIAL': case 'FREE_TRIAL': case 'AWAITING_PAYMENT': case 'CREATED': case 'PENDING': case 'AUTHORIZED': return 'orange';
    case 'EXPIRED': case 'CANCELLED': case 'FAILED': case 'REFUNDED': return 'red';
    case 'COMING_SOON': return 'blue';
    default: return 'gray';
  }
}

export function Badge({ label, tone = 'gray', icon: Icon }) {
  const t = TONES[tone] || TONES.gray;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: t.bg }}>
      {Icon ? <Icon size={10} color={t.fg} strokeWidth={3} style={{ marginRight: 3 }} /> : null}
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: t.fg }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** White header bar with back button, centred title/subtitle, right slot. */
export function SubHeader({ title, subtitle, onBack, right, capStyle }) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: C.white }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <View style={{ paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(10), borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft, borderWidth: 1, borderColor: C.line }}
            >
              <ChevronLeft size={19} color={C.ink} />
            </Pressable>
          ) : <View style={{ width: 56 }} />}
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: rs(8) }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 2, textAlign: 'center' }} numberOfLines={2}>{subtitle}</Text>
            ) : null}
          </View>
          <View style={{ minWidth: onBack ? 40 : 56, alignItems: 'flex-end' }}>{right || null}</View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  return (
    <View style={[{ backgroundColor: C.white, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.line, marginTop: 10, ...shadow }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ icon: Icon, title, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      {Icon ? (
        <View style={{ height: 26, width: 26, borderRadius: 8, backgroundColor: C.tealSoft, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Icon size={13} color={C.teal} />
        </View>
      ) : null}
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: C.ink }} numberOfLines={1}>{title}</Text>
      {right || null}
    </View>
  );
}

/** Label left, value right; wraps instead of cutting text off. */
export function KV({ label, value, strong, tone, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.soft }}>
      <Text style={{ flex: 1, fontSize: 12.5, color: C.muted, marginRight: 10 }}>{label}</Text>
      <Text style={{ flexShrink: 1, maxWidth: '62%', textAlign: 'right', fontSize: strong ? 14 : 12.5, fontWeight: strong ? '800' : '700', color: tone || (strong ? C.teal : C.ink) }}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </Text>
    </View>
  );
}

export function Btn({ label, onPress, variant = 'primary', icon: Icon, disabled, loading, style, compact }) {
  const primary = variant === 'primary';
  const fg = primary ? C.white : variant === 'danger' ? C.red : C.teal;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [{
        minHeight: compact ? 40 : 46,
        borderRadius: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? C.teal : C.white,
        borderWidth: primary ? 0 : 1.5,
        borderColor: variant === 'danger' ? C.redSoft : primary ? C.teal : C.tealLine,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {Icon ? <Icon size={15} color={fg} style={{ marginRight: 6 }} /> : null}
          <Text style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: '800', color: fg }} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Checkbox({ checked, disabled, size = 22 }) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: checked ? C.teal : C.subtle, backgroundColor: checked ? C.teal : C.white,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {checked ? <Check size={size - 8} color={C.white} strokeWidth={3.2} /> : null}
    </View>
  );
}

const NOTICE = {
  warn: { bg: C.orangeSoft, border: '#FDE68A', ink: C.orangeInk },
  error: { bg: C.redSoft, border: '#FCA5A5', ink: C.red },
  info: { bg: C.tealSoft, border: C.tealLine, ink: C.teal },
};

export function Notice({ tone = 'info', icon: Icon = AlertCircle, title, children, style }) {
  const t = NOTICE[tone] || NOTICE.info;
  return (
    <View style={[{ borderRadius: 12, padding: 10, marginTop: 10, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Icon size={15} color={t.ink} style={{ marginTop: 1 }} />
        <Text style={{ marginLeft: 8, flex: 1, fontSize: 12.5, fontWeight: '800', color: t.ink }}>{title}</Text>
      </View>
      {children ? <View style={{ marginTop: 4, marginLeft: 23 }}>{typeof children === 'string' ? <Text style={{ fontSize: 11.5, color: C.muted, lineHeight: 16 }}>{children}</Text> : children}</View> : null}
    </View>
  );
}

/** Pulsing grey placeholder block. */
export function SkeletonBlock({ height = 14, width = '100%', radius = 8, style }) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.5, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: '#E9ECEF', opacity: v }, style]} />;
}

/** A few card-shaped skeletons. */
export function SkeletonCards({ count = 3 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <SkeletonBlock width="45%" height={14} />
          <SkeletonBlock width="80%" height={11} style={{ marginTop: 10 }} />
          <SkeletonBlock width="65%" height={11} style={{ marginTop: 8 }} />
        </Card>
      ))}
    </View>
  );
}

export function ErrorState({ title = 'Could not load', message, onRetry }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
      <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' }}>
        <AlertCircle size={20} color={C.red} />
      </View>
      <Text style={{ marginTop: 10, fontSize: 14, fontWeight: '800', color: C.ink, textAlign: 'center' }}>{title}</Text>
      {message ? <Text style={{ marginTop: 4, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 17 }}>{message}</Text> : null}
      {onRetry ? <Btn label="Try again" icon={RefreshCw} variant="outline" onPress={onRetry} style={{ marginTop: 14, minWidth: 140 }} compact /> : null}
    </View>
  );
}

export function EmptyState({ icon: Icon = AlertCircle, title, message }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 }}>
      <Icon size={22} color={C.subtle} />
      <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '800', color: C.ink, textAlign: 'center' }}>{title}</Text>
      {message ? <Text style={{ marginTop: 3, fontSize: 11.5, color: C.muted, textAlign: 'center', lineHeight: 16 }}>{message}</Text> : null}
    </View>
  );
}

/**
 * In-app checkout is off / not configured / not in this build. Android gets a
 * button to the Shop Web subscription page; iOS gets text only (no external
 * purchase link — App Store rule).
 */
export function CheckoutUnavailable({ style }) {
  const android = canLinkToShopWeb();
  return (
    <Notice tone="warn" icon={Globe} title="In-app payment is not available" style={style}>
      <Text style={{ fontSize: 11.5, color: C.muted, lineHeight: 16 }}>
        Complete your purchase on NearGFix Shop Web. Your plan appears here once it is active.
      </Text>
      {android ? (
        <Btn
          label="Open NearGFix Shop Web"
          icon={ExternalLink}
          variant="outline"
          compact
          onPress={openShopWebSubscription}
          style={{ marginTop: 8, alignSelf: 'flex-start' }}
        />
      ) : null}
    </Notice>
  );
}

/** Content width cap on tablets. */
export const capFor = (r) => (r?.isTablet ? { width: Math.min(r.width - 32, 760), alignSelf: 'center' } : null);
