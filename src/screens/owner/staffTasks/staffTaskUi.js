// Shared look for the Staff Tasks screens. Shades follow the Home Dashboard
// exactly: the same palette (OV_TONE) and the same tint recipe — white →
// withAlpha(colour, 0.12) fill, withAlpha(colour, 0.16) border, solid colour
// circle with a white icon (see components/dashboard/DashboardOverviewCard).
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Smartphone } from 'lucide-react-native';
import { mci } from '../../../components/dashboard/solidIcons';
import { withAlpha } from '../../../components/dashboard/theme';
import { STORAGE_MODE } from './staffTaskStore';

// GGShopIndia palette: Teal · Navy · Bright Blue · Green · Orange · Red ·
// White · Light Gray · Black.
export const C = {
  primary: '#035C6C',
  green: '#609138',
  blue: '#0788C9',
  navy: '#1C3053',
  orange: '#FAA700',
  red: '#F32C26',
  mint: '#E5F3F5',
  page: '#F3F4F6',
  card: '#FFFFFF',
  ink: '#111111',
  muted: '#6B7280',
  subtle: '#9CA3AF',
  line: '#F3F4F6',
};

/** One colour → the Dashboard shade set: fg (the colour), bg (12%), border (16%). */
export const tone = (color, label, extra) => ({
  label, color, fg: color, bg: withAlpha(color, 0.12), border: withAlpha(color, 0.16), dot: color, ...extra,
});

// Task types — palette colours only (GGShopIndia sheet); the light card
// background is the same colour at 12% (withAlpha), never another hue.
const typeTone = (label, icon, color) => ({ label, icon, color, fg: color, bg: withAlpha(color, 0.12) });
export const TYPE_META = {
  // Solid Material glyphs — the same icon style as the Home tool tiles.
  SERVICE: typeTone('Service', mci('tools'), '#609138'),                    // Green
  DELIVERY: typeTone('Delivery', mci('truck-delivery'), '#F32C26'),         // Red
  PARCEL: typeTone('Parcel', mci('package-variant-closed'), '#FAA700'),     // Orange
  SUPPLIER: typeTone('Supplier', mci('cart'), '#1C3053'),                   // Navy
  BANK_WORK: typeTone('Bank Work', mci('bank'), '#035C6C'),                 // Primary Teal
  SHOP_WORK: typeTone('Shop Work', mci('storefront'), '#0788C9'),           // Bright Blue
  OTHER: typeTone('Other', mci('dots-horizontal-circle'), '#111111'),       // Black
};

export const PRIORITY_META = {
  LOW: { label: 'Low', color: '#9CA3AF', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  MEDIUM: { label: 'Medium', color: '#FAA700', fg: '#FAA700', bg: '#FFF4DB', dot: '#FAA700' },
  HIGH: { label: 'High', color: '#F32C26', fg: '#F32C26', bg: '#FDEAE9', dot: '#F32C26' },
};

export const STATUS_META = {
  PENDING: { label: 'Pending', color: '#FAA700', fg: '#FAA700', bg: '#FFF4DB' },
  IN_PROGRESS: { label: 'In Progress', color: '#0788C9', fg: '#0788C9', bg: '#E6F3FA' },
  COMPLETED: { label: 'Completed', color: '#609138', fg: '#609138', bg: '#EEF5E8' },
  OVERDUE: { label: 'Overdue', color: '#F32C26', fg: '#FFFFFF', bg: '#F32C26' },
  INCOMPLETE: { label: 'Incomplete', color: '#F32C26', fg: '#F32C26', bg: '#FDEAE9' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280', fg: '#6B7280', bg: '#F3F4F6' },
};

/** Dashboard Overview card shell: white → 12% tint, 16% border, tinted shadow. */
export function TintCard({ color, onPress, style, children, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{
        backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: withAlpha(color, 0.16), overflow: 'hidden',
        shadowColor: color, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
        opacity: pressed ? 0.75 : 1,
      }, style]}
    >
      <LinearGradient pointerEvents="none" colors={['#FFFFFF', withAlpha(color, 0.12)]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      {children}
    </Pressable>
  );
}

export const cardShadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

/** White header with back arrow, centred title, optional right action. */
export function TaskHeader({ title, onBack, right }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.card, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back"
          style={{ height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page }}>
          <ArrowLeft size={18} color={C.ink} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink }} numberOfLines={1}>{title}</Text>
        <View style={{ minWidth: 36, alignItems: 'flex-end' }}>{right}</View>
      </View>
    </View>
  );
}

export function Avatar({ person, size = 36 }) {
  const initials = String(person?.name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (person?.photoUrl) {
    return <Image source={{ uri: person.photoUrl }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.page }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: C.primary }}>{initials}</Text>
    </View>
  );
}

export function Pill({ meta, small }) {
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: small ? 7 : 9, paddingVertical: small ? 2 : 3, backgroundColor: meta.bg }}>
      <Text style={{ fontSize: small ? 10 : 11, fontWeight: '800', color: meta.fg }} numberOfLines={1}>{meta.label}</Text>
    </View>
  );
}

/** Honest note while tasks are device-only: no Employee App sync yet. */
export function StorageNote() {
  if (STORAGE_MODE !== 'device') return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: withAlpha(C.orange, 0.12), borderWidth: 1, borderColor: withAlpha(C.orange, 0.16) }}>
      <Smartphone size={14} color="#FAA700" />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 11.5, color: '#FAA700', lineHeight: 16 }}>
        Tasks are saved on this device for now. They will reach the Employee App once the shared task server is set up.
      </Text>
    </View>
  );
}
