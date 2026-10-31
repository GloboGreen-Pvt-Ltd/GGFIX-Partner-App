import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Print from 'expo-print';
import { Download, Share2 } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { getReceipt } from '../../../api/subscription';
import { notify } from '../../../components/confirm';
import { notifyDownloaded, saveToDownloads, shareLocalFile } from '../../../lib/downloads';
import { formatDate, formatDateTime, formatPaise, methodLabel, titleCase } from '../../../subscription/format';
import { Badge, Btn, C, Card, ErrorState, KV, SkeletonCards, SubHeader, capFor, statusTone } from '../../../subscription/ui';

const DEFAULT_TITLE = 'NearGFix Subscription Receipt';
// "Tax Invoice" only when the server says so (GSTIN + tax > 0); otherwise "Receipt".
const kindLabel = (rc) => (rc?.isTaxInvoice ? 'Tax Invoice' : 'Receipt');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function buildHtml(rc) {
  const lines = (rc.lines || []).map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${esc(formatPaise(l.amountPaise))}</td></tr>`).join('');
  const by = rc.issuedBy || {};
  const ow = rc.owner || {};
  const taxPct = Number(rc.taxPercent) || 0;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#111;padding:28px;font-size:12px}
    h1{font-size:18px;margin:0;color:#035C6C} .k{color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:.6px}
    .row{display:flex;justify-content:space-between;gap:24px;margin-top:16px} .box{flex:1}
    table{width:100%;border-collapse:collapse;margin-top:16px} td{padding:7px 0;border-bottom:1px solid #E5E7EB}
    .r{text-align:right} .tot td{font-weight:800;font-size:14px;border-bottom:0;color:#035C6C}
    .tag{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;background:#E5F3F5;color:#035C6C;font-weight:700;font-size:11px}
  </style></head><body>
    <h1>${esc(rc.documentTitle || DEFAULT_TITLE)}</h1><span class="tag">${esc(kindLabel(rc))}</span>
    <div class="row">
      <div class="box"><div class="k">Receipt No.</div>${esc(rc.receiptNo)}<br/><div class="k" style="margin-top:6px">Order No.</div>${esc(rc.orderNo)}</div>
      <div class="box"><div class="k">Paid on</div>${esc(formatDateTime(rc.paidAt))}<br/><div class="k" style="margin-top:6px">Status</div>${esc(titleCase(rc.status))}</div>
    </div>
    <div class="row">
      <div class="box"><div class="k">Issued by</div><b>${esc(by.name)}</b><br/>${esc(by.address)}${by.gstin ? `<br/>GSTIN: ${esc(by.gstin)}` : ''}<br/>${esc(by.email)}<br/>${esc(by.phone)}</div>
      <div class="box"><div class="k">Billed to</div><b>${esc(ow.businessName || ow.name)}</b><br/>${esc(ow.name)}<br/>${esc(ow.phone)}<br/>${esc(ow.email)}</div>
    </div>
    <div class="row"><div class="box"><div class="k">Plan</div>${esc([rc.planName, rc.durationLabel].filter(Boolean).join(' · '))}<br/>${esc(formatDate(rc.startsAt))} – ${esc(formatDate(rc.endsAt))}<br/>Shops: ${esc((rc.shops || []).join(', '))}</div></div>
    <table>${lines}
      ${Number(rc.discountPaise) > 0 ? `<tr><td>Discount</td><td class="r">− ${esc(formatPaise(rc.discountPaise))}</td></tr>` : ''}
      ${taxPct > 0 ? `<tr><td>Tax (${esc(taxPct)}%, included)</td><td class="r">${esc(formatPaise(rc.taxPaise))}</td></tr>` : ''}
      <tr class="tot"><td>Total paid</td><td class="r">${esc(formatPaise(rc.totalPaise))}</td></tr>
    </table>
    <div class="row"><div class="box"><div class="k">Payment</div>${esc(methodLabel(rc.paymentMethod))} · ${esc(rc.razorpayPaymentId)}</div></div>
  </body></html>`;
}

/** Server Receipt JSON, shown in-app and exportable as a PDF. */
export default function SubscriptionReceiptScreen({ navigation, route }) {
  const paymentId = route?.params?.paymentId;
  const r = useResponsive();
  const cap = capFor(r);
  const [rc, setRc] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setRc(null);
    if (!paymentId) { setError('Receipt not found.'); return; }
    try {
      setRc(await getReceipt(paymentId));
    } catch (e) {
      setError(e?.message || 'Could not load the receipt.');
    }
  }, [paymentId]);

  useEffect(() => { load(); }, [load]);

  const stem = `NearGFix_Receipt_${String(rc?.receiptNo || paymentId || 'subscription').replace(/[^\w-]+/g, '_')}`;

  const exportPdf = async (mode) => {
    if (!rc) return;
    setBusy(mode);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml(rc) });
      if (mode === 'share') {
        await shareLocalFile(uri, `${stem}.pdf`, 'application/pdf');
        return;
      }
      const saved = await saveToDownloads({ stem, extension: 'pdf', mimeType: 'application/pdf', sourceUri: uri });
      if (!saved.shared) notify(`Saved to ${saved.location}`, saved.name, { preset: 'done' });
      await notifyDownloaded(saved);
    } catch (e) {
      notify(mode === 'share' ? 'Could not share the receipt' : 'Could not save the receipt', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const by = rc?.issuedBy || {};
  const ow = rc?.owner || {};
  const taxPct = Number(rc?.taxPercent) || 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader title={rc ? kindLabel(rc) : 'Receipt'} subtitle={rc?.receiptNo || undefined} onBack={() => navigation.goBack()} capStyle={cap} />
      {!rc && !error ? (
        <View style={[{ paddingHorizontal: 14 }, cap]}><SkeletonCards count={3} /></View>
      ) : error ? (
        <ErrorState title="Receipt unavailable" message={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 + r.insets.bottom }}>
          <View style={cap}>
            <Card>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.teal }}>{rc.documentTitle || DEFAULT_TITLE}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <Badge label={kindLabel(rc)} tone="teal" />
                <Badge label={titleCase(rc.status)} tone={statusTone(rc.status)} />
              </View>
              <View style={{ marginTop: 8 }}>
                <KV label="Receipt No." value={rc.receiptNo} />
                <KV label="Order No." value={rc.orderNo} />
                <KV label="Paid on" value={formatDateTime(rc.paidAt)} last />
              </View>
            </Card>

            <Card>
              <Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: C.muted }}>ISSUED BY</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginTop: 3 }}>{by.name || '—'}</Text>
              {[by.address, by.gstin ? `GSTIN: ${by.gstin}` : null, by.email, by.phone].filter(Boolean).map((t) => (
                <Text key={t} style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{t}</Text>
              ))}
              <Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: C.muted, marginTop: 12 }}>BILLED TO</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginTop: 3 }}>{ow.businessName || ow.name || '—'}</Text>
              {[ow.businessName ? ow.name : null, ow.phone, ow.email].filter(Boolean).map((t) => (
                <Text key={t} style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{t}</Text>
              ))}
            </Card>

            <Card>
              <KV label="Plan" value={[rc.planName, rc.durationLabel].filter(Boolean).join(' · ')} />
              <KV label="Period" value={`${formatDate(rc.startsAt)} – ${formatDate(rc.endsAt)}`} />
              <KV label="Shops" value={(rc.shops || []).join(', ') || '—'} last />
            </Card>

            <Card>
              {(rc.lines || []).map((l, i) => <KV key={`${i}-${l.label}`} label={l.label} value={formatPaise(l.amountPaise)} />)}
              {Number(rc.discountPaise) > 0 ? <KV label="Discount" value={`− ${formatPaise(rc.discountPaise)}`} tone={C.green} /> : null}
              {taxPct > 0 ? <KV label={`Tax (${taxPct}%, included)`} value={formatPaise(rc.taxPaise)} /> : null}
              <KV label="Total paid" value={formatPaise(rc.totalPaise)} strong last />
            </Card>

            <Card>
              <KV label="Payment method" value={methodLabel(rc.paymentMethod)} />
              <KV label="Payment ID" value={rc.razorpayPaymentId} last />
            </Card>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Btn label="Share PDF" icon={Share2} variant="outline" onPress={() => exportPdf('share')} loading={busy === 'share'} disabled={!!busy} style={{ flex: 1 }} />
              <Btn label="Save PDF" icon={Download} onPress={() => exportPdf('save')} loading={busy === 'save'} disabled={!!busy} style={{ flex: 1 }} />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
