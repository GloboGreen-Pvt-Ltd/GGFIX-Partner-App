import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Minus, Plus, RefreshCw, Search, Smartphone, X,
} from 'lucide-react-native';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { showToast } from '../../../components/Toast';
import { normalizeDeviceImageUrl } from '../../../utils/images';
import { rf } from '../../../utils/responsive';

// Shared building blocks for the Partner Sell module (single listing wizard,
// My Listings, enquiries, bulk listing). White pages, teal #035C6C actions,
// green #01AC77 success, compact rounded cards.

export const C = {
  teal: '#035C6C',
  tealDark: '#024753',
  green: '#01AC77',
  greenBg: '#E6F7F0',
  mint: '#E5F3F5',
  mintLine: '#BFDDE2',
  bg: '#FFFFFF',
  field: '#F6F7F9',
  border: '#E6EAEE',
  text: '#111111',
  muted: '#6B7280',
  faint: '#9CA3AF',
  red: '#D92D20',
  redBg: '#FDECEC',
  amber: '#B54708',
  amberBg: '#FFF6E6',
  purple: '#6D4FD1',
  purpleBg: '#F3F0FC',
};

export const CONTENT_MAX = 640;

/**
 * After a failed Next / Publish: the inline errors can sit below the fold on a
 * long form, so also say the first one where it is always seen. Returns true
 * when there are no errors.
 */
export function reportErrors(errors) {
  const first = Object.values(errors || {}).find(Boolean);
  if (first) showToast({ type: 'error', title: 'Please check the form', message: first });
  return !first;
}

export const cardShadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
};

export function money(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Digits (and one dot) only — for price inputs. */
export function cleanAmount(text) {
  const s = String(text || '').replace(/[^0-9.]/g, '');
  const [a, ...b] = s.split('.');
  return b.length ? `${a}.${b.join('').slice(0, 2)}` : a;
}

// ── Listing helpers ─────────────────────────────────────────────────────────

const STATUS_META = {
  ACTIVE: { label: 'Active', fg: C.green, bg: C.greenBg },
  DRAFT: { label: 'Draft', fg: C.amber, bg: C.amberBg },
  SOLD: { label: 'Sold', fg: C.teal, bg: C.mint },
  // Stock held by an open buy order — sold only once handed over / delivered.
  RESERVED: { label: 'Order in progress', fg: C.amber, bg: C.amberBg },
  INACTIVE: { label: 'Inactive', fg: C.muted, bg: '#F1F2F4' },
  OPEN: { label: 'New', fg: C.purple, bg: C.purpleBg },
  QUOTED: { label: 'Quote Sent', fg: C.teal, bg: C.mint },
  COUNTERED: { label: 'Counter Offer', fg: C.amber, bg: C.amberBg },
  ACCEPTED: { label: 'Accepted', fg: C.green, bg: C.greenBg },
  CONFIRMED: { label: 'Deal Confirmed', fg: C.green, bg: C.greenBg },
  REJECTED: { label: 'Rejected', fg: C.red, bg: C.redBg },
  CANCELLED: { label: 'Cancelled', fg: C.muted, bg: '#F1F2F4' },
};

export function statusMeta(status) {
  const s = String(status || '').toUpperCase();
  return STATUS_META[s] || { label: s ? s.charAt(0) + s.slice(1).toLowerCase() : '—', fg: C.muted, bg: '#F1F2F4' };
}

export function listingImage(p) {
  const url = p?.imageUrl || (Array.isArray(p?.extraImageUrls) ? p.extraImageUrls.find(Boolean) : null);
  return url ? normalizeDeviceImageUrl(url) : null;
}

export function listingSub(p) {
  if (p?.listingType === 'SPARE_PART' || p?.descriptionType === 'SPARE_PARTS') return [p?.conditionLabel || 'Spare part'].join('');
  if (p?.listingType === 'ACCESSORY') return [p?.conditionLabel, 'Accessory'].filter(Boolean).join(' · ');
  return [p?.storageLabel, p?.ramLabel, p?.conditionLabel].filter(Boolean).join(' · ') || 'Device';
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function Stepper({ step, total = 4, labels }) {
  if (labels?.length) {
    // Numbered circles with a caption under each (bulk listing).
    return (
      <View style={{ flexDirection: 'row', marginTop: 12, paddingHorizontal: 4 }}>
        {labels.map((label, i) => {
          const n = i + 1;
          const on = n <= step;
          return (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ height: 24, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
                {i > 0 ? <View style={{ position: 'absolute', left: 0, right: '50%', height: 2, backgroundColor: on ? C.green : C.border }} /> : null}
                {i < labels.length - 1 ? <View style={{ position: 'absolute', left: '50%', right: 0, height: 2, backgroundColor: n < step ? C.green : C.border }} /> : null}
                <View style={{ height: 24, width: 24, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.green : '#C9CED6', backgroundColor: on ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: rf(11), fontWeight: '800', color: on ? '#FFFFFF' : C.muted }}>{n}</Text>
                </View>
              </View>
              <Text style={{ fontSize: rf(10), color: on ? C.text : C.muted, marginTop: 4 }}>{label}</Text>
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 40 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const on = n <= step;
        return (
          <React.Fragment key={n}>
            {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: n <= step ? C.teal : C.border }} /> : null}
            <View
              style={{
                height: n === step ? 12 : 10, width: n === step ? 12 : 10, borderRadius: 6,
                backgroundColor: on ? C.teal : '#FFFFFF', borderWidth: 2, borderColor: on ? C.teal : C.border,
              }}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}

export function SellHeader({ title, subtitle, onBack, right, step, totalSteps = 4, rightWidth = 44, stepLabels, divider }) {
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, backgroundColor: C.bg, ...(divider ? { borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 8 } : null) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}>
        <View style={{ width: 44 }}>
          {onBack ? (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} className="active:opacity-60" style={{ height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={24} color={C.text} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ fontSize: rf(16.5), fontWeight: '800', color: C.text }}>{title}</Text>
          {subtitle ? <Text numberOfLines={2} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2, textAlign: 'center' }}>{subtitle}</Text> : null}
        </View>
        <View style={{ width: rightWidth, alignItems: 'flex-end' }}>{right}</View>
      </View>
      {step ? <Stepper step={step} total={totalSteps} labels={stepLabels} /> : null}
    </View>
  );
}

/**
 * Page shell: header (+ stepper), scrolling body capped at CONTENT_MAX,
 * keyboard-aware, and an optional sticky footer above the bottom safe area.
 */
export function SellScreen({
  title, subtitle, onBack, right, step, totalSteps, children, footer, scroll = true, refreshControl, contentStyle, rightWidth, stepLabels, divider,
}) {
  const insets = useSafeAreaInsets();
  const body = { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingHorizontal: 16, ...contentStyle };
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <SellHeader title={title} subtitle={subtitle} onBack={onBack} right={right} step={step} totalSteps={totalSteps} rightWidth={rightWidth} stepLabels={stepLabels} divider={divider} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
            contentContainerStyle={{ paddingTop: 6, paddingBottom: footer ? 16 : insets.bottom + 24 }}
          >
            <View style={body}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, body]}>{children}</View>
        )}
        {footer ? (
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) }}>
            <View style={{ width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingHorizontal: 16 }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Section({ title, sub, right, children, style }) {
  return (
    <View style={[{ marginTop: 16 }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{title}</Text>
            {sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, selected, accessibilityLabel }) {
  const base = {
    backgroundColor: selected ? C.mint : '#FFFFFF', borderRadius: 14, borderWidth: selected ? 1.5 : 1,
    borderColor: selected ? C.teal : C.border, padding: 12, ...cardShadow,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!selected }} className="active:opacity-90" style={[base, style]}>
      {children}
    </Pressable>
  );
}

// ── Form controls ───────────────────────────────────────────────────────────

export function FieldLabel({ label, required, hint, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text }}>
        {label}
        {required ? <Text style={{ color: C.red }}> *</Text> : null}
        {hint ? <Text style={{ color: C.faint, fontWeight: '500' }}>{`  ${hint}`}</Text> : null}
      </Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

export function FieldError({ error }) {
  if (!error) return null;
  return <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{error}</Text>;
}

export function SelectField({ label, required, hint, value, placeholder = 'Select', icon: Icon, onPress, error, disabled, style }) {
  return (
    <View style={[{ marginTop: 12 }, style]}>
      {label ? <FieldLabel label={label} required={required} hint={hint} /> : null}
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label || 'Select'}: ${value || placeholder}`}
        accessibilityState={{ disabled: !!disabled }}
        className="active:opacity-80"
        style={{
          flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, borderWidth: 1,
          borderColor: error ? C.red : C.border, backgroundColor: disabled ? C.field : '#FFFFFF', paddingHorizontal: 12, opacity: disabled ? 0.6 : 1,
        }}
      >
        {Icon ? <Icon size={17} color={C.teal} style={{ marginRight: 8 }} /> : null}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(13), color: value ? C.text : C.faint, fontWeight: value ? '600' : '400' }}>{value || placeholder}</Text>
        <ChevronDown size={18} color={C.muted} />
      </Pressable>
      <FieldError error={error} />
    </View>
  );
}

export function TextField({
  label, required, hint, value, onChangeText, placeholder, error, prefix, multiline, maxLength, style, inputStyle, counter, ...rest
}) {
  return (
    <View style={[{ marginTop: 12 }, style]}>
      {label ? <FieldLabel label={label} required={required} hint={hint} /> : null}
      <View
        style={{
          flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', minHeight: multiline ? 96 : 46, borderRadius: 12,
          borderWidth: 1, borderColor: error ? C.red : C.border, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0,
        }}
      >
        {prefix ? <Text style={{ fontSize: rf(14), color: C.text, fontWeight: '700', marginRight: 6 }}>{prefix}</Text> : null}
        <TextInput
          value={value == null ? '' : String(value)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={label || placeholder}
          style={[{ flex: 1, minWidth: 0, fontSize: rf(13.5), color: C.text, paddingVertical: multiline ? 0 : 10 }, inputStyle]}
          {...rest}
        />
      </View>
      {counter && maxLength ? (
        <Text style={{ alignSelf: 'flex-end', fontSize: rf(10.5), color: C.faint, marginTop: 4 }}>{`${String(value || '').length} / ${maxLength}`}</Text>
      ) : null}
      <FieldError error={error} />
    </View>
  );
}

/** Pill options in a row (wraps). options: [{ value, label, sub, icon }] */
export function Segmented({ options, value, onChange, columns, style, multi, lines = 1 }) {
  const isOn = (v) => (multi ? (value || []).includes(v) : value === v);
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>
      {options.map((o) => {
        const on = isOn(o.value);
        const Icon = o.icon;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            className="active:opacity-80"
            style={{
              flexGrow: columns ? 0 : 1, flexBasis: columns ? `${Math.floor(100 / columns) - 3}%` : 'auto', minHeight: o.sub ? 64 : 40,
              borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? C.teal : C.border, backgroundColor: on ? C.mint : '#FFFFFF',
              alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8,
            }}
          >
            {Icon ? (
              <View style={{ height: 22, width: 22, borderRadius: 11, backgroundColor: on ? C.green : C.field, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Icon size={13} color={on ? '#FFFFFF' : C.muted} />
              </View>
            ) : null}
            <Text numberOfLines={lines} style={{ fontSize: rf(12.5), fontWeight: on ? '800' : '600', color: on ? C.teal : C.text, textAlign: 'center' }}>{o.label}</Text>
            {o.sub ? <Text numberOfLines={2} style={{ fontSize: rf(10), color: C.muted, marginTop: 2, textAlign: 'center' }}>{o.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tappable option row: tinted icon · title / sub · chevron (or `right`). */
export function OptionCard({ icon: Icon, image, title, sub, onPress, tint = C.mint, iconColor = C.teal, right, selected, style }) {
  return (
    <Card onPress={onPress} selected={selected} accessibilityLabel={title} style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }, style]}>
      <View style={{ height: 56, width: 56, borderRadius: 14, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {image ? <Image source={{ uri: image }} style={{ width: 48, height: 48 }} resizeMode="contain" /> : Icon ? <Icon size={26} color={iconColor} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        <Text numberOfLines={1} style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 3, lineHeight: rf(15) }}>{sub}</Text> : null}
      </View>
      {right !== undefined ? right : <ChevronRight size={18} color={C.text} />}
    </Card>
  );
}

export function ToggleRow({ label, sub, value, onChange, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }, style]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: rf(13), fontWeight: '700', color: C.text }}>{label}</Text>
        {sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: '#D0D5DD', true: C.green }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#D0D5DD"
        accessibilityLabel={label}
      />
    </View>
  );
}

export function CheckRow({ label, sub, checked, onToggle, style, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked, disabled: !!disabled }}
      accessibilityLabel={label}
      className="active:opacity-80"
      style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <View style={{ height: 20, width: 20, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? C.green : '#C4CAD2', backgroundColor: checked ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: rf(12.5), color: C.text, fontWeight: '600' }}>{label}</Text>
        {sub ? <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 1 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Card-style radio/checkbox (fulfilment, publish options). */
export function ChoiceCard({ title, sub, selected, onPress, radio, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={title}
      className="active:opacity-85"
      style={[{
        flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: selected ? 1.5 : 1, borderColor: selected ? C.teal : C.border,
        backgroundColor: selected ? C.mint : '#FFFFFF', padding: 12, marginTop: 8,
      }, style]}
    >
      <View
        style={{
          height: 20, width: 20, borderRadius: radio ? 10 : 5, borderWidth: 1.5, borderColor: selected ? C.green : '#C4CAD2',
          backgroundColor: selected && !radio ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {selected ? (radio ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: C.green }} /> : <Check size={13} color="#FFFFFF" strokeWidth={3} />) : null}
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: rf(13), fontWeight: '700', color: C.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 9999, style }) {
  const n = Number(value) || 0;
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  const btn = (Icon, onPress, disabled, label) => (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} className="active:opacity-70" style={{ height: 44, width: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      <Icon size={18} color={C.text} />
    </Pressable>
  );
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: '#FFFFFF' }, style]}>
      {btn(Minus, () => set(n - 1), n <= min, 'Decrease quantity')}
      <TextInput
        value={String(n)}
        onChangeText={(t) => set(parseInt(t.replace(/\D/g, '') || String(min), 10))}
        keyboardType="number-pad"
        accessibilityLabel="Quantity"
        style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: rf(15), fontWeight: '800', color: C.text, paddingVertical: 8 }}
      />
      {btn(Plus, () => set(n + 1), n >= max, 'Increase quantity')}
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, loading, icon: Icon, iconRight: IconRight, variant = 'primary', style, small }) {
  const palette = {
    primary: { bg: C.teal, fg: '#FFFFFF', border: C.teal },
    green: { bg: C.green, fg: '#FFFFFF', border: C.green },
    outline: { bg: '#FFFFFF', fg: C.teal, border: C.teal },
    soft: { bg: C.mint, fg: C.teal, border: C.mint },
    danger: { bg: '#FFFFFF', fg: C.red, border: '#F3B8B3' },
    dangerSolid: { bg: C.red, fg: '#FFFFFF', border: C.red },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      className="active:opacity-85"
      style={[{
        height: small ? 38 : 48, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, opacity: off ? 0.55 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} style={{ marginRight: 8 }} /> : Icon ? <Icon size={small ? 15 : 17} color={palette.fg} style={{ marginRight: 6 }} /> : null}
      <Text numberOfLines={1} style={{ fontSize: rf(small ? 12.5 : 14), fontWeight: '800', color: palette.fg }}>{title}</Text>
      {IconRight && !loading ? <IconRight size={small ? 15 : 17} color={palette.fg} style={{ marginLeft: 6 }} /> : null}
    </Pressable>
  );
}

export function StatusPill({ status, label, style }) {
  const m = statusMeta(status);
  return (
    <View style={[{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: m.bg }, style]}>
      <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: m.fg }}>{label || m.label}</Text>
    </View>
  );
}

export function Thumb({ uri, size = 52, radius = 12, style }) {
  const [broken, setBroken] = useState(false);
  const src = uri ? normalizeDeviceImageUrl(uri) : null;
  useEffect(() => { setBroken(false); }, [src]);
  return (
    <View style={[{ height: size, width: size, borderRadius: radius, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {src && !broken ? (
        <Image resizeMethod="resize" source={{ uri: src }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setBroken(true)} />
      ) : (
        <Smartphone size={Math.round(size * 0.4)} color={C.faint} />
      )}
    </View>
  );
}

export function EmptyBox({ icon: Icon, title, sub, action, onAction, style }) {
  return (
    <View style={[{ alignItems: 'center', backgroundColor: C.field, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 16, marginTop: 12 }, style]}>
      {Icon ? (
        <View style={{ height: 46, width: 46, borderRadius: 23, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={C.teal} />
        </View>
      ) : null}
      <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text, marginTop: 10, textAlign: 'center' }}>{title}</Text>
      {sub ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4, textAlign: 'center', lineHeight: rf(16) }}>{sub}</Text> : null}
      {action ? <PrimaryButton title={action} onPress={onAction} small style={{ marginTop: 12, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function ErrorBox({ message, onRetry, style, tone = 'error' }) {
  const fg = tone === 'warning' ? C.amber : C.red;
  const bg = tone === 'warning' ? C.amberBg : C.redBg;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, borderRadius: 12, padding: 10, marginTop: 10 }, style]}>
      <CircleAlert size={16} color={fg} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: rf(11.5), color: fg, lineHeight: rf(16) }}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry" className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <RefreshCw size={14} color={fg} />
          <Text style={{ marginLeft: 4, fontSize: rf(11.5), fontWeight: '800', color: fg }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SearchInput({ value, onChangeText, placeholder, style, right }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 44 }, style]}>
      <Search size={17} color={C.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{ flex: 1, minWidth: 0, marginLeft: 8, fontSize: rf(13), color: C.text, paddingVertical: 0 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
          <X size={17} color={C.muted} />
        </Pressable>
      ) : null}
      {right}
    </View>
  );
}

/** Tabs with counts, e.g. Active (28) · Sold (37) · Draft (3). */
export function TabPills({ tabs, value, onChange, style }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: 8 }}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            className="active:opacity-80"
            style={{ borderRadius: 999, paddingHorizontal: 14, height: 34, justifyContent: 'center', backgroundColor: on ? C.teal : '#FFFFFF', borderWidth: 1, borderColor: on ? C.teal : C.border }}
          >
            <Text style={{ fontSize: rf(12), fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Bottom-sheet picker with search.
 * options: [{ id, label, sub, image }]; onSelect(option).
 */
export function PickerModal({ visible, title, options, onSelect, onClose, loading, error, onRetry, emptyText = 'Nothing to choose from yet.', searchable = true, selectedId }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options || [];
    return (options || []).filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(needle));
  }, [options, q]);
  const close = () => { setQ(''); onClose(); };
  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={close}>
      {/* Insets read inside the modal window: it is edge-to-edge, so the
          system navigation bar (and the keyboard, when searching) are only
          known here. Read from the screen they put the sheet's end under them. */}
      <ModalInsets>
      {({ bottom }) => (
      <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
        <View style={{ maxHeight: '80%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: bottom + 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 }}>
            <Text style={{ flex: 1, fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <X size={20} color={C.text} />
            </Pressable>
          </View>
          {searchable ? <SearchInput value={q} onChangeText={setQ} placeholder={`Search ${String(title || '').toLowerCase()}`} style={{ marginHorizontal: 16, marginBottom: 8 }} /> : null}
          {loading ? (
            <ActivityIndicator color={C.teal} style={{ marginVertical: 30 }} />
          ) : error ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}><ErrorBox message={error} onRetry={onRetry} /></View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(o) => String(o.id)}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.muted, fontSize: rf(12.5), paddingVertical: 24 }}>{q ? 'No matches.' : emptyText}</Text>}
              renderItem={({ item }) => {
                const on = selectedId != null && String(item.id) === String(selectedId);
                return (
                  <Pressable
                    onPress={() => { setQ(''); onSelect(item); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className="active:opacity-70"
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: on ? C.mint : '#FFFFFF' }}
                  >
                    {item.image ? <Thumb uri={item.image} size={36} radius={8} style={{ marginRight: 10 }} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: rf(13.5), color: C.text, fontWeight: on ? '800' : '600' }}>{item.label}</Text>
                      {item.sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{item.sub}</Text> : null}
                    </View>
                    {on ? <Check size={18} color={C.teal} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
      )}
      </ModalInsets>
    </SafeModal>
  );
}

/** Small key/value row for review screens. */
export function InfoRow({ label, value, bold }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 }}>
      <Text style={{ width: 120, fontSize: rf(12), color: C.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: rf(12.5), color: C.text, fontWeight: bold ? '800' : '600' }}>{value || '—'}</Text>
    </View>
  );
}
