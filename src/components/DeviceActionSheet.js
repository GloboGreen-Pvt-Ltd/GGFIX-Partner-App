import React from 'react';
import { Image, Text, View } from 'react-native';
import { Wrench, IndianRupee, ShoppingCart, X, Smartphone, ChevronRight } from 'lucide-react-native';
import { Touchable } from './ios';
import { ResponsiveModal, SPACING, TOUCH_MIN } from './responsive';
import { displayNameFor } from '../utils/deviceSearch';

/**
 * Action popup for a selected device: Book Service · Sell · Buy.
 *
 * Touching a search result opens this instead of navigating, so the shop picks
 * the device once and then picks what to do with it.
 *
 * The sheet does not know any routes — it hands the caller an action key and
 * the caller owns navigation. That keeps "which screen does Sell go to" in one
 * place (OwnerSearchScreen) rather than split across a presentational component.
 *
 * ── DO NOT give these rows `style={({ pressed }) => …}` ────────────────────
 * NativeWind's JSX interop silently drops a FUNCTION style on Pressable in its
 * entirety. The first version of this file did exactly that, and the rows lost
 * `flexDirection: 'row'`, their padding and their border — the icon rendered,
 * the label container collapsed to zero height in the resulting column layout,
 * and the sheet showed three bare icon tiles with no text at all.
 *
 * `Touchable` (components/ios) exists for this: it tracks pressed state and
 * hands Pressable a plain object, which the interop keeps.
 */
const ACTIONS = [
  { key: 'BOOK', label: 'Book Service', hint: 'Start a repair booking', icon: Wrench, tint: '#E5F3F5', accent: '#035C6C' },
  { key: 'SELL', label: 'Sell', hint: 'Sell this device', icon: IndianRupee, tint: '#FEF3C7', accent: '#B45309' },
  { key: 'BUY', label: 'Buy', hint: 'Browse the marketplace', icon: ShoppingCart, tint: '#E5F3F5', accent: '#035C6C' },
];

export default function DeviceActionSheet({ visible, device, onAction, onClose }) {
  if (!device) return null;

  const title = device.displayName || displayNameFor(device.brandName, device.modelName) || 'Device';
  const subtitle = [device.categoryName, device.modelNumber].filter(Boolean).join(' · ');

  return (
    <ResponsiveModal visible={visible} onClose={onClose} maxWidth={560}>
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: SPACING.lg }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <View
          style={{
            height: 52, width: 52, borderRadius: 12, backgroundColor: '#F3F4F6',
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12,
          }}
        >
          {device.modelImageUrl
            ? <Image source={{ uri: device.modelImageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
            : <Smartphone size={24} color="#9CA3AF" strokeWidth={2} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111111' }} numberOfLines={2}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <Touchable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}
          pressedStyle={{ opacity: 0.6 }}
        >
          <X size={16} color="#6B7280" strokeWidth={2} />
        </Touchable>
      </View>

      {ACTIONS.map((a) => {
        const Icon = a.icon;
        // Sell is hidden for a model the catalogue flags sell-inactive —
        // the Sell pickers filter those out, so offering it here would walk
        // the user into an empty list.
        if (a.key === 'SELL' && device.sellActive === false) return null;
        return (
          <Touchable
            key={a.key}
            onPress={() => onAction?.(a.key, device)}
            accessibilityRole="button"
            accessibilityLabel={`${a.label} — ${title}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 13,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#E5F3F5',
              marginBottom: 8,
              // 48pt minimum: the Android and iOS touch-target floors are
              // 48dp and 44pt, and this row is the only way into all three
              // flows.
              minHeight: TOUCH_MIN,
            }}
            pressedStyle={{ backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }}
          >
            <View
              style={{
                height: 38, width: 38, borderRadius: 10, backgroundColor: a.tint,
                alignItems: 'center', justifyContent: 'center', marginRight: 12,
              }}
            >
              <Icon size={19} color={a.accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#111111' }}>{a.label}</Text>
              <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{a.hint}</Text>
            </View>
            <ChevronRight size={16} color="#D1D5DB" strokeWidth={2} />
          </Touchable>
        );
      })}
    </ResponsiveModal>
  );
}
