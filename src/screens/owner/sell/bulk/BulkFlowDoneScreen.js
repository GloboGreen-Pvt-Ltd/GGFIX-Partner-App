import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { ArrowRight, Check, CircleCheck, CircleX, Download } from 'lucide-react-native';
import { notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import { C, PrimaryButton, SellScreen, money } from '../kit';
import { bulkDraftStore, resultCounts, rowTitle, useBulkDraft } from './bulkDraft';
import { FileError, shareTextFile, stamp } from './bulkFiles';
import { DraftLoading, NoBatch } from './BulkUi';
import { errorReportCsv } from './excelSheet';

// Bulk Listing Completed!: published vs failed (sheet rows with errors + items
// the server rejected), View My Listings, Download Error Report.

const DOTS = [
  { top: 8, left: '20%', c: '#F59E0B' }, { top: 40, left: '11%', c: C.green }, { top: 78, left: '17%', c: '#EF4444' },
  { top: 4, right: '22%', c: C.green }, { top: 42, right: '11%', c: '#F59E0B' }, { top: 80, right: '18%', c: '#14B8A6' },
];

function Tile({ ok, label, value }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, backgroundColor: ok ? C.greenBg : C.redBg }}>
      <Icon size={30} color="#FFFFFF" fill={ok ? C.green : C.red} />
      <View style={{ marginLeft: 10 }}>
        <Text style={{ fontSize: rf(13), fontWeight: '700', color: ok ? C.green : C.red }}>{label}</Text>
        <Text style={{ fontSize: rf(22), fontWeight: '900', color: C.text }}>{value}</Text>
      </View>
    </View>
  );
}

export default function BulkFlowDoneScreen({ navigation }) {
  const { draft, ready } = useBulkDraft();
  const [busy, setBusy] = useState(false);
  if (!ready) return <DraftLoading title="" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Bulk Listing" navigation={navigation} />;

  const c = resultCounts(draft);
  const done = draft.rows.filter((r) => r.result?.productId).length;
  const apiFailed = draft.rows.filter((r) => r.result && !r.result.productId);
  const sheetErrors = draft.sheet?.errors || [];
  const failed = apiFailed.length + sheetErrors.length;
  const report = [
    ...sheetErrors,
    ...apiFailed.map((r) => ({ line: r.csvLine ?? '', details: [rowTitle(r), r.storageLabel, r.color].filter(Boolean).join(' · '), qty: r.quantity, price: r.price ? money(r.price) : '', reason: r.result.errors?.[0] || 'Not created' })),
  ];

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await shareTextFile({ name: `NearGFix_Bulk_Errors_${stamp()}.csv`, text: errorReportCsv(report) });
      if (res?.downloaded) notify('Error report downloaded', '', { preset: 'done' });
    } catch (e) {
      notify('Could not save the report', e instanceof FileError ? e.message : 'Please try again.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const mine = () => {
    bulkDraftStore.reset(null);
    navigation.navigate('SellMyListings', { initialStatus: 'ALL' });
  };

  return (
    <SellScreen title="" onBack={mine}>
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <View style={{ height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          {done ? DOTS.map(({ c: col, ...pos }, i) => <View key={i} style={{ position: 'absolute', height: 8, width: 8, borderRadius: 2, transform: [{ rotate: `${i * 35}deg` }], backgroundColor: col, ...pos }} />) : null}
          <View style={{ height: 86, width: 86, borderRadius: 43, backgroundColor: done ? C.green : C.red, alignItems: 'center', justifyContent: 'center' }}>
            {done ? <Check size={46} color="#FFFFFF" strokeWidth={3.2} /> : <CircleX size={46} color="#FFFFFF" />}
          </View>
        </View>
        <Text style={{ fontSize: rf(23), fontWeight: '900', color: C.text, marginTop: 8, textAlign: 'center' }}>{done ? 'Bulk Listing Completed!' : 'Bulk Listing Failed'}</Text>
        <Text style={{ fontSize: rf(14), color: C.text, marginTop: 8, textAlign: 'center', lineHeight: rf(20) }}>
          {done ? `${done} product${done === 1 ? ' has' : 's have'} been\npublished successfully.` : 'No products could be published.'}
        </Text>
        {c.drafts ? <Text style={{ fontSize: rf(12), color: C.amber, marginTop: 8, textAlign: 'center' }}>{`${c.drafts} saved as draft (needs more photos) — finish in My Listings.`}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
        <Tile ok label="Published" value={done} />
        <Tile ok={false} label="Failed" value={failed} />
      </View>

      <View style={{ gap: 10, marginTop: 24 }}>
        <PrimaryButton title="View My Listings" iconRight={ArrowRight} variant="green" onPress={mine} />
        {report.length ? <PrimaryButton title="Download Error Report" icon={Download} variant="outline" loading={busy} onPress={download} /> : null}
        {!done ? <PrimaryButton title="Try Again" variant="outline" onPress={() => navigation.replace('BulkCreating')} /> : null}
      </View>
    </SellScreen>
  );
}
