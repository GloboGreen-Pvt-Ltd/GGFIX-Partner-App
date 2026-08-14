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
  { key: 'BOOK', label: 'Book Service', hint: 'Start a repair booking', icon: Wrench, tint: '#E6F7E3', accent: '#087A0A' },
  { key: 'SELL', label: 'Sell', hint: 'Sell this device', icon: IndianRupee, tint: '#FEF3C7', accent: '#B45309' },
  { key: 'BUY', label: 'Buy', hint: 'Browse the marketplace', icon: ShoppingCart, tint: '#EFF5EE', accent: '#004C40' },
];

export default function DeviceActionSheet({ visible, device, onAction, onClose }) {
  if (!device) return null;

  const title = device.displayName || displayNameFor(device.brandName, device.modelName) || 'Device';
  const subtitle = [device.categoryName, device.modelNumber].filter(Boolean).join(' · ');

  return (
    <ResponsiveModal visible={visible} onClose={onClose} maxWidth={560}>
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8E2', marginBottom: SPACING.lg }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <View
          style={{
            height: 52, width: 52, borderRadius: 12, backgroundColor: '#F8F8F8',
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12,
          }}
        >
          {device.modelImageUrl
            ? <Image source={{ uri: device.modelImageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
            : <Smartphone size={24} color="#8FA08F" strokeWidth={2} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#172117' }} numberOfLines={2}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: '#667066', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <Touchable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: '#EFF5EE', alignItems: 'center', justifyContent: 'center' }}
          pressedStyle={{ opacity: 0.6 }}
        >
          <X size={16} color="#667066" strokeWidth={2} />
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
              borderColor: '#EFF5EE',
              marginBottom: 8,
              // 48pt minimum: the Android and iOS touch-target floors are
              // 48dp and 44pt, and this row is the only way into all three
              // flows.
              minHeight: TOUCH_MIN,
            }}
            pressedStyle={{ backgroundColor: '#F8F8F8', borderColor: '#E2E8E2' }}
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
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#172117' }}>{a.label}</Text>
              <Text style={{ fontSize: 11.5, color: '#667066', marginTop: 1 }}>{a.hint}</Text>
            </View>
            <ChevronRight size={16} color="#CBD5CB" strokeWidth={2} />
          </Touchable>
        );
      })}
    </ResponsiveModal>
  );
}
