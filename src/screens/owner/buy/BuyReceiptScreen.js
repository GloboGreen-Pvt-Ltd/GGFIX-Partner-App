import React from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CircleCheck, Download } from 'lucide-react-native';
import { listingConditionLabel } from '../../../api/nearbyListings';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, money } from '../sell/kit';
import { PurchasePage, deviceSpecs, dayLabel, timeLabel, usePurchase, useStep } from './purchaseKit';

// Page 8 — Purchase Receipt for a completed purchase, from the purchase record
// (receipt no. = the sell order number). Download → PDF (expo-print) → share.

const LOGO = require('../../../../assets/boot-logo-glyph.png');
const METHOD_LABEL = { UPI: 'UPI', BANK: 'Bank Transfer', CASH: 'Cash' };
const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function receiptOf(o) {
  const { storage, ram } = deviceSpecs(o);
  const pay = o.payment || {};
  const at = o.completedAt || pay.paidAt;
  return {
    no: o.orderNumber || String(o.id || '').slice(0, 8).toUpperCase(),
    date: at ? `${dayLabel(at)}, ${timeLabel(at)}` : '—',
    sections: [
      ['Seller Details', [['Name', o.customer?.name], ['Phone', o.customer?.phone]]],
      ['Device Details', [['Device', o.productName], ['Storage', [storage, ram && `RAM: ${ram}`].filter(Boolean).join('  |  ') || null], ['Condition', o.inspection?.condition || listingConditionLabel(o.condition) || null]]],
      ['Purchase Details', [['Final Price', money(pay.amount ?? o.amount)], ['Payment Method', METHOD_LABEL[pay.method] || pay.method], ['Transaction ID', pay.reference]]],
    ],
  };
}

function html(r) {
  const rows = r.sections.map(([title, items]) => `<h3>${esc(title)}</h3><table>${items.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>: <b>${esc(v)}</b></td></tr>`).join('')}</table>`).join('');
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#111;padding:28px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #E6EAEE;padding-bottom:12px}
    .brand{font-size:22px;font-weight:800}.sub{color:#01AC77;font-size:13px}.meta{text-align:right;font-size:13px}
    h3{font-size:15px;margin:18px 0 6px}td{font-size:13px;padding:3px 0}.k{color:#6B7280;width:140px}
    .done{margin-top:22px;background:#E6F7F0;color:#01AC77;font-weight:800;text-align:center;padding:10px;border-radius:10px}
  </style></head><body>
    <div class="top"><div><div class="brand">NearGFix</div><div class="sub">Purchase Receipt</div></div>
    <div class="meta">Receipt No: <b>${esc(r.no)}</b><br/>Date: ${esc(r.date)}</div></div>
    ${rows}<div class="done">✓ Purchase Completed</div></body></html>`;
}

export default function BuyReceiptScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const [busy, run] = useStep();
  const r = o ? receiptOf(o) : null;

  const download = () => run('pdf', async () => {
    if (Platform.OS === 'web') { await Print.printAsync({ html: html(r) }); return; }
    const { uri } = await Print.printToFileAsync({ html: html(r) });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Receipt ${r.no}` });
    else showToast({ type: 'success', title: 'Receipt saved', message: uri });
  });

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Purchase Receipt" statuses={['COMPLETED']}
      right={(
        <Pressable onPress={download} disabled={!r || !!busy} accessibilityRole="button" accessibilityLabel="Download receipt" hitSlop={8} className="active:opacity-60"
          style={{ height: 36, width: 36, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.4 : 1 }}>
          <Download size={22} color={C.text} />
        </Pressable>
      )}>
      {r ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={LOGO} style={{ height: 26, width: 26 }} resizeMode="contain" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>NearGFix</Text>
              <Text style={{ fontSize: rf(11), color: C.green }}>Purchase Receipt</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: rf(11), color: C.text }}>Receipt No: <Text style={{ fontWeight: '800', color: C.green }}>{r.no}</Text></Text>
              <Text style={{ fontSize: rf(11), color: C.text, marginTop: 2 }}>{`Date: ${r.date}`}</Text>
            </View>
          </View>
          {r.sections.map(([title, items]) => (
            <View key={title} style={{ marginTop: 14 }}>
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginBottom: 6 }}>{title}</Text>
              {items.map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                  <Text style={{ width: 120, fontSize: rf(12), color: C.muted }}>{k}</Text>
                  <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '700', color: C.text }}>{`:  ${v || '—'}`}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.greenBg, borderRadius: 10, paddingVertical: 10, marginTop: 18 }}>
            <CircleCheck size={16} color={C.green} />
            <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.green, marginLeft: 6 }}>Purchase Completed</Text>
          </View>
        </View>
      ) : null}
    </PurchasePage>
  );
}
