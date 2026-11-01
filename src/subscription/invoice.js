// Server-issued subscription invoice: PDF download/share and WhatsApp delivery
// status. Everything here is optional UI — callers render it only when the
// server returned an InvoiceView.
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Download, MessageCircle, RefreshCw, Share2 } from 'lucide-react-native';
import { downloadInvoicePdf, invoiceFileStem, retryInvoiceWhatsapp } from '../api/subscription';
import { notify } from '../components/confirm';
import { notifyDownloaded, saveToDownloads, shareLocalFile } from '../lib/downloads';
import { formatDateTime } from './format';
import { Badge, Btn, C } from './ui';

const PDF = 'application/pdf';

/** Fetch the server PDF, then save it to Downloads ('save') or open the share sheet ('share'). */
export async function exportInvoicePdf(invoice, mode) {
  const stem = invoiceFileStem(invoice);
  const uri = await downloadInvoicePdf(invoice.id, stem);
  if (mode === 'share') {
    await shareLocalFile(uri, `${stem}.pdf`, PDF);
    return;
  }
  const saved = await saveToDownloads({ stem, extension: 'pdf', mimeType: PDF, sourceUri: uri });
  if (!saved.shared) notify(`Saved to ${saved.location}`, saved.name, { preset: 'done' });
  await notifyDownloaded(saved);
}

const WA = {
  SENT: { label: 'Sent on WhatsApp', tone: 'green' },
  PENDING: { label: 'WhatsApp sending', tone: 'orange' },
  FAILED: { label: 'WhatsApp failed', tone: 'red' },
  SKIPPED: { label: 'Not sent on WhatsApp', tone: 'gray' },
};

/** { label, tone } for PENDING | SENT | FAILED | SKIPPED; null for anything else. */
export const whatsappMeta = (status) => WA[String(status || '').toUpperCase()] || null;

/**
 * WhatsApp delivery badge with the sent time / server reason, and a Retry
 * button only when the server says `whatsapp.canRetry`. `onUpdated` receives
 * the InvoiceView the retry returns.
 */
export function WhatsAppStatus({ invoice, whatsapp, onUpdated, style }) {
  const [retrying, setRetrying] = useState(false);
  const wa = invoice?.whatsapp || whatsapp || null;
  const meta = whatsappMeta(wa?.status);
  if (!meta) return null;

  const retry = async () => {
    if (!invoice?.id || retrying) return;
    setRetrying(true);
    try {
      const next = await retryInvoiceWhatsapp(invoice.id);
      if (next) onUpdated?.(next);
      const after = whatsappMeta(next?.whatsapp?.status);
      notify('WhatsApp invoice', after ? after.label : 'Retry requested.', { preset: next?.whatsapp?.status === 'FAILED' ? 'error' : 'done' });
    } catch (e) {
      notify('Could not resend on WhatsApp', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setRetrying(false);
    }
  };

  const detail = String(wa.status).toUpperCase() === 'SENT' && wa.sentAt ? formatDateTime(wa.sentAt) : wa.reason;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      <MessageCircle size={13} color={C.muted} style={{ marginRight: 6 }} />
      <View style={{ flex: 1, marginRight: 8 }}>
        <Badge label={meta.label} tone={meta.tone} />
        {detail ? <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {wa.canRetry && invoice?.id ? (
        <Btn label="Retry" icon={RefreshCw} variant="outline" compact onPress={retry} loading={retrying} style={{ minHeight: 34, paddingHorizontal: 10 }} />
      ) : null}
    </View>
  );
}

/** Share Invoice / Download Invoice buttons for the server PDF (compact → "Share" / "Download"). */
export function InvoiceActions({ invoice, compact, style }) {
  const [busy, setBusy] = useState(null);
  if (!invoice?.id) return null;

  const run = async (mode) => {
    if (busy) return;
    setBusy(mode);
    try {
      await exportInvoicePdf(invoice, mode);
    } catch (e) {
      notify(mode === 'share' ? 'Could not share the invoice' : 'Could not save the invoice', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[{ flexDirection: 'row', gap: 8 }, style]}>
      <Btn label={compact ? 'Share' : 'Share Invoice'} icon={Share2} variant="outline" compact={compact} onPress={() => run('share')} loading={busy === 'share'} disabled={!!busy} style={{ flex: 1 }} />
      <Btn label={compact ? 'Download' : 'Download Invoice'} icon={Download} compact={compact} onPress={() => run('save')} loading={busy === 'save'} disabled={!!busy} style={{ flex: 1 }} />
    </View>
  );
}
