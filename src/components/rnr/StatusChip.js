import React from 'react';
import { View, Text } from 'react-native';
import {
  Clock, CheckCircle2, Truck, PackageCheck, AlertCircle, Wrench, XCircle, Hourglass, PauseCircle,
} from 'lucide-react-native';
import { cn } from './cn';
import { tokens } from '../../theme/colors';

const PALETTES = {
  pending:    { bg: 'bg-warning/10',     dot: tokens.warning, label: 'text-warning',     icon: Clock },
  scheduled:  { bg: 'bg-info/10',        dot: tokens.info,    label: 'text-info',        icon: Hourglass },
  confirmed:  { bg: 'bg-primary-soft',   dot: tokens.primary, label: 'text-primary-dark',icon: CheckCircle2 },
  inProgress: { bg: 'bg-attention-soft',    dot: tokens.attention,  label: 'text-attention-dark', icon: Wrench },
  pickup:     { bg: 'bg-attention-soft',    dot: tokens.attention,  label: 'text-attention-dark', icon: Truck },
  reached:    { bg: 'bg-info/10',        dot: tokens.info,    label: 'text-info',        icon: Truck },
  received:   { bg: 'bg-primary-soft',   dot: tokens.primary, label: 'text-primary-dark',icon: PackageCheck },
  completed:  { bg: 'bg-primary-soft',   dot: tokens.primary, label: 'text-primary-dark',icon: CheckCircle2 },
  delivered:  { bg: 'bg-primary-soft',   dot: tokens.primary, label: 'text-primary-dark',icon: PackageCheck },
  paused:     { bg: 'bg-surface-muted',  dot: tokens.textMuted, label: 'text-text-muted',icon: PauseCircle },
  cancelled:  { bg: 'bg-danger/10',      dot: tokens.danger,  label: 'text-danger',      icon: XCircle },
  failed:     { bg: 'bg-danger/10',      dot: tokens.danger,  label: 'text-danger',      icon: AlertCircle },
  neutral:    { bg: 'bg-surface-muted',  dot: tokens.textMuted, label: 'text-text-muted',icon: Clock },
};

// Map common backend status strings to a palette key.
function inferTone(status) {
  if (!status) return 'neutral';
  const s = String(status).toLowerCase();
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled';
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('paus') || s.includes('hold')) return 'paused';
  if (s.includes('complete') || s.includes('done') || s.includes('deliver')) return 'completed';
  if (s.includes('received') || s.includes('handover')) return 'received';
  if (s.includes('reached')) return 'reached';
  if (s.includes('pickup') || s.includes('pick_up') || s.includes('out_for')) return 'pickup';
  if (s.includes('progress') || s.includes('repair') || s.includes('work')) return 'inProgress';
  if (s.includes('confirm') || s.includes('accepted')) return 'confirmed';
  if (s.includes('schedul') || s.includes('booked')) return 'scheduled';
  if (s.includes('pend')) return 'pending';
  return 'neutral';
}

function humanize(s) {
  if (!s) return '';
  return String(s).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * StatusChip — soft pill with an icon dot, designed for booking/order states.
 * Pass `tone` explicitly, or pass `status` and let it infer the tone.
 */
export function StatusChip({ status, tone, label, size = 'md', className }) {
  const key = tone || inferTone(status);
  const palette = PALETTES[key] || PALETTES.neutral;
  const Icon = palette.icon;
  const padding = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'text-[10.5px]' : 'text-[12px]';
  return (
    <View className={cn('flex-row items-center self-start rounded-full', padding, palette.bg, className)}>
      <Icon size={iconSize} color={palette.dot} />
      <Text className={cn('ml-1.5 font-bold tracking-wide', textSize, palette.label)} numberOfLines={1}>
        {label || humanize(status) || 'Unknown'}
      </Text>
    </View>
  );
}
