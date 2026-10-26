// Results for one scan: the top catalogue matches with their photo, a
// calibrated match % (or the legacy similarity), tier, why it matched and a
// "Verified" badge only when a printed model number / barcode matched
// exactly. Nothing is pre-selected: the user taps a match, then Repair / Sell /
// Buy — the same actions (utils/deviceActions.js) the old scanner offered.
import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import {
  BadgeCheck, ChevronRight, Info, Keyboard as KeyboardIcon, RotateCcw, SearchX, ShoppingBag, Smartphone, Tag, Truck, Wrench,
} from 'lucide-react-native';
import { rf } from '../../../utils/responsive';

const TEAL = '#035C6C';
const INK = '#111111';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';
const MINT = '#E5F3F5';

const SIGNAL_LABELS = {
  visual: 'Photo match',
  modelNumber: 'Model no. read',
  ai: 'AI hint',
  ocr: 'Text match',
  barcode: 'Barcode',
};
const TIER_STYLE = {
  high: { label: 'High', bg: '#DCFCE7', fg: '#166534' },
  medium: { label: 'Medium', bg: '#FEF3C7', fg: '#92400E' },
  low: { label: 'Low', bg: '#F3F4F6', fg: '#4B5563' },
};

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native.
function ActionButton({ icon: Icon, label, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="active:opacity-85"
      style={{
        flex: 1, minHeight: 40, paddingHorizontal: 6, borderRadius: 12, marginHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? TEAL : '#FFFFFF', borderWidth: primary ? 0 : 1.5, borderColor: TEAL,
      }}
    >
      <Icon size={15} color={primary ? '#FFFFFF' : TEAL} />
      <Text style={{ flexShrink: 1, marginLeft: 6, fontSize: rf(12.5), fontWeight: '800', color: primary ? '#FFFFFF' : TEAL }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Chip({ text, bg = '#F3F4F6', fg = '#374151' }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginTop: 4 }}>
      <Text style={{ fontSize: rf(9.5), fontWeight: '800', color: fg }}>{text}</Text>
    </View>
  );
}

function MatchRow({ item, selected, onPress, onAction }) {
  const tier = item.tier ? TIER_STYLE[item.tier] : null;
  return (
    <View style={{ borderWidth: selected ? 1.5 : 1, borderColor: selected ? TEAL : LINE, borderRadius: 14, marginBottom: 8, backgroundColor: selected ? MINT : '#FFFFFF' }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Choose ${item.displayName}`}
        accessibilityState={{ selected }}
        className="active:opacity-80"
        style={{ flexDirection: 'row', alignItems: 'center', padding: 10 }}
      >
        <View style={{ height: 52, width: 52, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 10 }}>
          {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={{ width: 46, height: 46 }} resizeMode="contain" /> : <Smartphone size={22} color={TEAL} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flexShrink: 1, fontSize: rf(13), fontWeight: '800', color: INK }} numberOfLines={2}>{item.displayName}</Text>
            {item.verified ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
                <BadgeCheck size={14} color="#15803D" />
                <Text style={{ marginLeft: 2, fontSize: rf(10), fontWeight: '800', color: '#15803D' }}>Verified</Text>
              </View>
            ) : null}
          </View>
          {item.subtitle ? <Text style={{ fontSize: rf(10.5), color: MUTED, marginTop: 1 }} numberOfLines={1}>{item.subtitle}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            {item.percent != null ? <Chip text={`${item.percent}% match`} bg={MINT} fg={TEAL} /> : null}
            {tier ? <Chip text={tier.label} bg={tier.bg} fg={tier.fg} /> : null}
            {(item.signals || []).map((s) => (SIGNAL_LABELS[s] ? <Chip key={s} text={SIGNAL_LABELS[s]} /> : null))}
          </View>
        </View>
        <ChevronRight size={17} color={selected ? TEAL : '#9CA3AF'} style={{ transform: [{ rotate: selected ? '90deg' : '0deg' }] }} />
      </Pressable>
      {selected ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 10 }}>
          <ActionButton primary icon={Wrench} label="Repair" onPress={() => onAction('BOOK', item)} />
          {item.row?.sellActive !== false ? <ActionButton icon={Tag} label="Sell" onPress={() => onAction('SELL', item)} /> : null}
          <ActionButton icon={ShoppingBag} label="Buy" onPress={() => onAction('BUY', item)} />
        </View>
      ) : null}
    </View>
  );
}

function FooterLinks({ label, onSearch, onRetake }) {
  return (
    <>
      <Pressable onPress={() => onSearch(label || '')} accessibilityRole="button" className="active:opacity-70" style={{ marginTop: 6, alignItems: 'center', paddingVertical: 6 }}>
        <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: MUTED }}>
          Not in the list? <Text style={{ color: TEAL }}>{label ? `Search “${label}”` : 'Search by name'}</Text>
        </Text>
      </Pressable>
      <Pressable onPress={onRetake} accessibilityRole="button" accessibilityLabel="Take another photo" className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingVertical: 6 }}>
        <RotateCcw size={14} color={TEAL} />
        <Text style={{ marginLeft: 6, fontSize: rf(12.5), fontWeight: '800', color: TEAL }}>Take another photo</Text>
      </Pressable>
    </>
  );
}

export default function ScanResultsSheet({ state, result, selected, onSelect, onAction, onSearch, onRetake, onOpenTicket, maxHeight }) {
  if (state === 'identifying') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}>
        <ActivityIndicator color={TEAL} />
        <Text style={{ marginLeft: 9, fontSize: rf(13), fontWeight: '700', color: INK }}>Identifying product…</Text>
      </View>
    );
  }
  if (!result) return null;

  const ticketCard = result.ticket ? (
    <Pressable
      onPress={() => onOpenTicket(result.ticket)}
      accessibilityRole="button"
      className="active:opacity-80"
      style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 10, marginBottom: 10, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' }}
    >
      <Truck size={18} color="#047857" />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: INK }} numberOfLines={1}>Booking found · #{result.ticket.trackingId || result.ticket.id}</Text>
        <Text style={{ fontSize: rf(10.5), color: MUTED }} numberOfLines={1}>{result.ticket.deviceDisplayName || result.ticket.deviceModelName || 'Tap to open the booking'}</Text>
      </View>
      <ChevronRight size={17} color="#047857" />
    </Pressable>
  ) : null;

  if (result.kind === 'error' || !result.items?.length) {
    const message = result.kind === 'error'
      ? result.message
      : result.serverError === 'RATE_LIMITED'
        ? 'Too many scans right now — wait a moment and try again, or search for the model.'
        : result.label
          ? `Looks like ${result.label}, but the exact model couldn't be confirmed. Search for it, or retake showing the back cameras or the box / model sticker.`
          : 'Fill the frame with the device (the back with the cameras, or its box label / model sticker) in good light and try again, or search for the model.';
    return (
      <View>
        {ticketCard}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ height: 44, width: 44, borderRadius: 12, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <SearchX size={20} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK }}>
              {result.kind === 'error' ? 'No match found' : 'Exact model not identified'}
            </Text>
            <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: 1 }}>{message}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          <ActionButton primary icon={KeyboardIcon} label={result.label ? `Search “${result.label}”` : 'Search manually'} onPress={() => onSearch(result.label || '')} />
        </View>
        <Pressable onPress={onRetake} accessibilityRole="button" className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 6 }}>
          <RotateCcw size={14} color={TEAL} />
          <Text style={{ marginLeft: 6, fontSize: rf(12.5), fontWeight: '800', color: TEAL }}>Take another photo</Text>
        </Pressable>
      </View>
    );
  }

  const note = result.calibrated
    ? 'Check the model before you continue.'
    : 'Match % is an estimate — check the model before you continue.';
  return (
    <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {ticketCard}
      {/* Exact = verified (model number / barcode, or look + AI agreeing at a
          calibrated ≥ 85 %): that model leads with its catalogue image.
          Otherwise the list is only genuine possible matches. Either way the
          user taps to continue — nothing is selected for them. */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {result.exact ? <BadgeCheck size={16} color="#15803D" style={{ marginRight: 5 }} /> : null}
        <Text style={{ flexShrink: 1, fontSize: rf(14), fontWeight: '800', color: INK }}>
          {result.exact ? 'Exact model identified' : 'Exact model not identified'}
        </Text>
      </View>
      <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: 1 }} numberOfLines={2}>
        {result.exact
          ? 'Tap it to continue.'
          : `${result.label ? `Looks like “${result.label}”. ` : ''}Possible matches — tap yours, or search manually.`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 10 }}>
        <Info size={12} color={MUTED} />
        <Text style={{ marginLeft: 4, flex: 1, fontSize: rf(10.5), color: MUTED }}>{note}</Text>
      </View>
      {result.items.map((item, i) => (
        <MatchRow key={item.key} item={item} selected={selected === i} onPress={() => onSelect(selected === i ? null : i)} onAction={onAction} />
      ))}
      <FooterLinks label={result.label} onSearch={onSearch} onRetake={onRetake} />
    </ScrollView>
  );
}
