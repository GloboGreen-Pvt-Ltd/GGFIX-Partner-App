import React from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { LucideIcon } from 'lucide-react-native';

/**
 * Filled (solid) glyphs for the Home tiles, to match the Home design
 * reference — lucide only ships outline icons. Wrapped to accept the same
 * `size` / `color` props the dashboard components already pass to a lucide
 * icon (strokeWidth is simply ignored), so they drop into the existing
 * `icon` slot unchanged.
 */
type GlyphProps = { size?: number; color?: string };

export function ion(name: React.ComponentProps<typeof Ionicons>['name']): LucideIcon {
  function IonGlyph({ size = 20, color }: GlyphProps) {
    return <Ionicons name={name} size={size} color={color} />;
  }
  return IonGlyph as unknown as LucideIcon;
}

export function mci(name: React.ComponentProps<typeof MaterialCommunityIcons>['name']): LucideIcon {
  function MciGlyph({ size = 20, color }: GlyphProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  }
  return MciGlyph as unknown as LucideIcon;
}
