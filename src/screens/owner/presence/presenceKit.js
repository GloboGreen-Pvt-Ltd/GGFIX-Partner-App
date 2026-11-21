import React from 'react';
import { Text, View } from 'react-native';
import { rf } from '../../../utils/responsive';
import { C } from '../sell/kit';

// Shared labels / colours for Shop Presence (server states, never guessed).
export const PRESENCE = {
  INSIDE_SHOP: { label: 'Inside', fg: '#1E8E4E', bg: '#E3F5EA' },
  OUTSIDE_SHOP: { label: 'Outside', fg: '#C2410C', bg: '#FDECE2' },
  ON_AUTHORIZED_DUTY: { label: 'On Duty', fg: '#0788C9', bg: '#E1F0FA' },
  LOCATION_UNVERIFIED: { label: 'Unverified', fg: '#B7791F', bg: '#FEF3C7' },
  CHECKED_OUT: { label: 'Checked Out', fg: '#6B7280', bg: '#F1F2F4' },
  NOT_CHECKED_IN: { label: 'Not Checked In', fg: '#6B7280', bg: '#F1F2F4' },
};

export const EVENT_LABEL = {
  CHECKED_IN: 'Checked In',
  CHECKED_OUT: 'Checked Out',
  EXITED: 'Left Shop',
  RETURNED: 'Returned to Shop',
  OUTSIDE_ENDED: 'Outside time ended (authorized duty started)',
  DUTY_STARTED: 'Authorized Duty Started',
  DUTY_ENDED: 'Authorized Duty Ended',
  LOCATION_UNVERIFIED: 'Location Unverified',
};

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return s ? '< 1 min' : '0 min';
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours() % 12 || 12)}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** "HH:mm[:ss]" attendance time → "09:05 AM". */
export function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = String(t).split(':').map(Number);
  return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function PresencePill({ state, stale }) {
  const m = PRESENCE[state] || PRESENCE.LOCATION_UNVERIFIED;
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ fontSize: rf(11), fontWeight: '800', color: m.fg }}>{m.label}{stale ? ' · not live' : ''}</Text>
    </View>
  );
}

export function StatBox({ value, label, tone = 'muted' }) {
  const t = { muted: ['#F4F6F7', C.text], green: ['#E8F3EA', '#1E8E4E'], amber: ['#FFF2DA', '#B7791F'], blue: ['#E1F0FA', '#0788C9'], red: ['#FDECE2', '#C2410C'] }[tone];
  return (
    <View style={{ flex: 1, minWidth: 90, backgroundColor: t[0], borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: rf(17), fontWeight: '800', color: t[1] }}>{String(value ?? 0).padStart(2, '0')}</Text>
      <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}
