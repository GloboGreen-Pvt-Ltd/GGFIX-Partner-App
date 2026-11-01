import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshCcw } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { confirm, notify } from '../../../components/confirm';
import WhatsAppIcon from '../../../components/WhatsAppIcon';

// WhatsApp booking confirmation for this ticket's booking (GET /tickets/{id}/whatsapp).
// The server sends it after the booking saves; this card only reads the status and
// offers Resend after a failure (the server refuses a resend of a sent message).

const META = {
  PENDING: { label: 'Queued', fg: '#B45309', bg: '#FEF3C7' },
  SENDING: { label: 'Sending', fg: '#B45309', bg: '#FEF3C7' },
  SENT: { label: 'Sent', fg: '#035C6C', bg: '#E5F3F5' },
  DELIVERED: { label: 'Delivered', fg: '#3F6212', bg: '#ECFCCB' },
  READ: { label: 'Read', fg: '#3F6212', bg: '#ECFCCB' },
  FAILED: { label: 'Failed', fg: '#B91C1C', bg: '#FEE2E2' },
  SKIPPED: { label: 'Not sent', fg: '#4B5563', bg: '#F3F4F6' },
  NONE: { label: 'Not sent', fg: '#4B5563', bg: '#F3F4F6' },
};
const ACTIVE = new Set(['PENDING', 'SENDING']);

const stamp = (iso) => (iso
  ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
  : null);

export default function WhatsAppStatusCard({ ticketId, cardShadow }) {
  const [info, setInfo] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      setInfo(await ticketApi.get(`/tickets/${ticketId}/whatsapp`));
    } catch (e) {
      // Older server build without the route: hide the card instead of showing an error.
      if (e?.status === 404 || e?.status === 405) setHidden(true);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // While queued / sending, refresh every 10 s so "Sent" shows without leaving the screen.
  useEffect(() => {
    if (!info || !ACTIVE.has(info.status)) return undefined;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [info, load]);

  const resend = async () => {
    const ok = await confirm({
      title: 'Send on WhatsApp?',
      message: 'Send the booking confirmation to the customer on WhatsApp. Make sure the customer agreed to receive WhatsApp messages.',
      confirmText: 'Send',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setInfo(await ticketApi.post(`/tickets/${ticketId}/whatsapp/resend`));
      notify('WhatsApp', 'Confirmation queued. It will be sent in a moment.', { preset: 'done' });
    } catch (e) {
      notify('Could not send', e?.message || 'Please try again.', { preset: 'error' });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (hidden || !info) return null;
  const meta = META[info.status] || META.NONE;
  const when = info.status === 'READ' ? stamp(info.readAt)
    : info.status === 'DELIVERED' ? stamp(info.deliveredAt)
      : stamp(info.sentAt);
  const detail = info.statusReason
    || (info.status === 'NONE' ? (info.sendingEnabled ? 'No WhatsApp confirmation for this booking yet.' : 'WhatsApp sending is turned off.') : null);

  return (
    <View className="px-4">
      <View className="bg-card rounded-2xl px-4 py-3" style={cardShadow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <WhatsAppIcon size={18} color="#25D366" />
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
            Booking confirmation{info.recipient ? ` · ${info.recipient}` : ''}
          </Text>
          <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: meta.bg }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: meta.fg }}>{meta.label}</Text>
          </View>
        </View>
        {when ? <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>{`${meta.label} ${when}`}</Text> : null}
        {detail ? <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>{detail}</Text> : null}
        {info.canResend ? (
          <Pressable
            onPress={resend}
            disabled={busy}
            accessibilityRole="button"
            style={{ marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#035C6C', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <RefreshCcw size={14} color="#FFFFFF" strokeWidth={2.5} />}
            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
              {info.status === 'NONE' ? 'Send on WhatsApp' : 'Resend'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
