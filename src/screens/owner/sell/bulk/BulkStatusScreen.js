import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import {
  Check, ChevronRight, CircleAlert, CircleCheck, CircleX, Download, ExternalLink, FilePen, Plus, RotateCcw, SquarePen,
} from 'lucide-react-native';
import { bulkCreateListings, newClientRef } from '../../../../api/sellListings';
import { selectShopId, selectUserId } from '../../../../store/authSlice';
import { confirm, notify } from '../../../../components/confirm';
import { safeErrorText } from '../../../../lib/safeError';
import { rf } from '../../../../utils/responsive';
import {
  C, Card, EmptyBox, ErrorBox, PrimaryButton, SellScreen,
} from '../kit';
import {
  applyBulkResponse, bulkDraftStore, finalPrice, meetsPhotoRule, resultCounts, rowTitle, toBulkItem, useBulkDraft,
} from './bulkDraft';
import { toCsv } from './csv';
import { shareTextFile, stamp } from './bulkFiles';
import {
  ActionRow, DraftLoading, NoBatch, goSellHome,
} from './BulkUi';

const isFailed = (r) => !!r.result && (r.result.outcome === 'FAILED' || !r.result.productId);
const CONFETTI = [
  { top: 6, left: '18%', c: '#F59E0B' }, { top: 30, left: '10%', c: C.green }, { top: 70, left: '16%', c: '#3B82F6' },
  { top: 4, right: '20%', c: C.green }, { top: 36, right: '11%', c: '#F59E0B' }, { top: 74, right: '17%', c: '#EF4444' },
];

function draftSummary(rows, draft) {
  const warnings = rows.flatMap((r) => r.result?.warnings || []);
  if (warnings.length) {
    const top = warnings[0];
    return warnings.length > 1 ? `${top} (+${warnings.length - 1} more)` : top;
  }
  const short = rows.filter((r) => !meetsPhotoRule(draft, r)).length;
  if (short) return `Missing photos on ${short} item${short > 1 ? 's' : ''}. Add photos and publish.`;
  return draft.pricing.publishMode === 'DRAFT' ? 'Saved as drafts. Publish them when ready.' : 'Saved as draft. Complete the details and publish.';
}

export default function BulkStatusScreen({ navigation }) {
  const { draft, ready, set, reset } = useBulkDraft();
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const [openFailed, setOpenFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const [reporting, setReporting] = useState(false);
  const leaving = useRef(false);
  const busy = useRef(false);

  // Back (header or hardware) leaves to the Sell tab instead of re-opening the
  // already-submitted Review / Pricing screens. The batch stays saved.
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (leaving.current) return;
    const type = e.data?.action?.type;
    if (type !== 'GO_BACK' && type !== 'POP') return;
    e.preventDefault();
    leaving.current = true;
    goSellHome(navigation);
  }), [navigation]);

  if (!ready) return <DraftLoading title="Bulk Upload Status" />;
  if (!draft.batchType) return <NoBatch title="Bulk Upload Status" navigation={navigation} />;

  const counts = resultCounts(draft);
  const processed = draft.rows.filter((r) => r.result);
  const failedRows = draft.rows.filter(isFailed);
  const draftRows = draft.rows.filter((r) => r.result && !isFailed(r) && r.result.status !== 'ACTIVE');

  const leave = (fn) => { leaving.current = true; fn(); };
  const openListings = (initialStatus) => navigation.navigate('SellMyListings', { initialStatus });

  const retryFailed = async () => {
    if (busy.current || !failedRows.length) return;
    busy.current = true;
    setRetrying(true);
    setRetryError(null);
    try {
      const d = bulkDraftStore.get();
      const sent = d.rows.filter(isFailed);
      // Same clientRefs as the first attempt, so nothing can be created twice.
      const items = sent.map((r) => toBulkItem(r, d));
      const res = await bulkCreateListings({ batchId: d.batchId, publish: d.pricing.publishMode === 'PUBLISH', items }, { shopId, userId });
      set((s) => ({ ...s, rows: applyBulkResponse(s.rows, sent, res), lastSubmit: { at: Date.now(), legacy: !!res?.legacy } }));
      const stillFailed = applyBulkResponse(sent, sent, res).filter(isFailed).length;
      if (stillFailed) notify(`${stillFailed} item${stillFailed > 1 ? 's' : ''} still failed`, 'Edit them to fix the problem, then retry.');
      else notify('All items saved', '', { preset: 'done' });
    } catch (e) {
      setRetryError(safeErrorText(e, 'Could not reach the server. Retry when you are online.'));
    } finally {
      busy.current = false;
      setRetrying(false);
    }
  };

  const downloadReport = async () => {
    setReporting(true);
    try {
      const header = ['row', 'title', 'listingType', 'quantity', 'price', 'outcome', 'status', 'productId', 'errors', 'warnings'];
      const lines = draft.rows.map((r, i) => [
        i + 1, rowTitle(r), r.listingType, r.quantity, finalPrice(r, draft.pricing) ?? '',
        r.result?.outcome || 'NOT_SENT', r.result?.status || '', r.result?.productId || '',
        (r.result?.errors || []).join('; '), (r.result?.warnings || []).join('; '),
      ]);
      await shareTextFile({ name: `neargfix-bulk-report_${stamp()}.csv`, text: toCsv([header, ...lines]) });
    } catch (e) {
      notify('Could not create the report', e?.message || 'Please try again.');
    } finally {
      setReporting(false);
    }
  };

  const addMore = () => {
    // Keep the template, settings, photos and any unsaved (failed) rows;
    // listed rows leave the batch. A new batchId groups the next upload.
    set((s) => ({ ...s, batchId: newClientRef(), rows: s.rows.filter((r) => !r.result?.productId) }));
    leave(() => {
      try { navigation.popTo('BulkItems'); } catch (_) { navigation.navigate('BulkItems'); }
    });
  };

  const done = async () => {
    if (failedRows.length) {
      const ok = await confirm({
        title: 'Leave failed items?',
        message: `${failedRows.length} item${failedRows.length > 1 ? 's were' : ' was'} not saved and will be discarded.`,
        confirmText: 'Discard & Finish',
        cancelText: 'Stay',
        destructive: true,
      });
      if (!ok) return;
    }
    reset();
    leave(() => goSellHome(navigation));
  };

  const allFailed = processed.length > 0 && counts.failed === processed.length;
  // Counted in units (a variant of 5 phones is 5 items), as the shop thinks of stock.
  const units = { published: 0, drafts: 0, failed: 0 };
  processed.forEach((r) => {
    const q = Number(r.quantity) || 1;
    if (isFailed(r)) units.failed += q;
    else if (r.result.status === 'ACTIVE') units.published += q;
    else units.drafts += q;
  });
  const headline = !processed.length ? 'Nothing submitted yet'
    : allFailed ? 'Bulk Listing Failed'
      : counts.failed ? 'Bulk Listing Partly Published'
        : counts.published ? 'Bulk Listing Published!' : 'Saved as Draft';
  const subline = allFailed ? 'Nothing was saved. Retry or edit the items below.'
    : counts.published ? `${units.published} item${units.published === 1 ? ' has' : 's have'} been listed successfully.`
      : `${units.drafts} item${units.drafts === 1 ? ' was' : 's were'} saved as drafts.`;
  const HeadIcon = allFailed ? CircleX : counts.failed ? CircleAlert : Check;
  const headColor = allFailed ? C.red : counts.failed ? C.amber : C.green;
  const firstError = failedRows.find((r) => r.result?.errors?.length)?.result.errors[0];

  const addAnother = async () => {
    if (failedRows.length) {
      const ok = await confirm({
        title: 'Leave failed items?',
        message: `${failedRows.length} item${failedRows.length > 1 ? 's were' : ' was'} not saved and will be discarded.`,
        confirmText: 'Discard & Continue',
        cancelText: 'Stay',
        destructive: true,
      });
      if (!ok) return;
    }
    reset();
    leave(() => { try { navigation.popTo('BulkListingType'); } catch (_) { navigation.navigate('BulkListingType'); } });
  };

  const tiles = [
    { key: 'p', label: 'Published', value: units.published, Icon: CircleCheck, fg: C.green, bg: C.greenBg, onPress: () => openListings('ACTIVE') },
    { key: 'd', label: 'Draft', value: units.drafts, Icon: FilePen, fg: C.amber, bg: C.amberBg, onPress: () => openListings('DRAFT') },
    { key: 'f', label: 'Failed', value: units.failed, Icon: CircleX, fg: C.red, bg: C.redBg, onPress: () => setOpenFailed((o) => !o) },
  ];

  return (
    <SellScreen
      title="Bulk Upload Result"
      onBack={() => navigation.goBack()}
      footer={processed.length ? null : <PrimaryButton title="Done" variant="green" onPress={done} />}
    >
      {!processed.length ? (
        <EmptyBox icon={CircleAlert} title="No results yet" sub="Review your batch and publish it to see the result here." action="Go to Review" onAction={() => leave(() => navigation.navigate('BulkReview'))} />
      ) : (
        <>
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <View style={{ height: 96, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {allFailed ? null : CONFETTI.map(({ c, ...pos }, i) => <View key={i} style={{ position: 'absolute', height: 7, width: 7, borderRadius: 2, transform: [{ rotate: `${i * 35}deg` }], backgroundColor: c, ...pos }} />)}
              <View style={{ height: 72, width: 72, borderRadius: 36, backgroundColor: allFailed || counts.failed ? '#FFFFFF' : C.green, borderWidth: allFailed || counts.failed ? 2 : 0, borderColor: headColor, alignItems: 'center', justifyContent: 'center' }}>
                <HeadIcon size={40} color={allFailed || counts.failed ? headColor : '#FFFFFF'} strokeWidth={3} />
              </View>
            </View>
            <Text style={{ fontSize: rf(20), fontWeight: '900', color: C.text, marginTop: 8, textAlign: 'center' }}>{headline}</Text>
            <Text style={{ fontSize: rf(12.5), color: C.muted, marginTop: 4, textAlign: 'center' }}>{subline}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            {tiles.map(({ key, label, value, Icon, fg, bg, onPress }) => (
              <Pressable key={key} onPress={value ? onPress : undefined} accessibilityRole="button" accessibilityLabel={`${label} ${value}`}
                style={{ flex: 1, alignItems: 'center', backgroundColor: bg, borderRadius: 14, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon size={15} color={fg} />
                  <Text style={{ fontSize: rf(11.5), color: C.text, marginLeft: 4 }}>{label}</Text>
                </View>
                <Text style={{ fontSize: rf(22), fontWeight: '900', color: C.text, marginTop: 4 }}>{value}</Text>
              </Pressable>
            ))}
          </View>
          {counts.drafts && !counts.failed ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 8 }}>{draftSummary(draftRows, draft)}</Text> : null}
          {counts.failed && !openFailed ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 8 }}>{firstError || 'Some items were not saved. Tap Failed to retry or edit them.'}</Text> : null}

          {counts.failed && openFailed ? (
            <Card style={{ marginTop: 8, borderColor: '#F3B8B3' }}>
              {failedRows.map((r, i) => (
                <View key={r.key} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#F1F2F4' }}>
                  <Text numberOfLines={1} style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>
                    {`${draft.rows.indexOf(r) + 1}. ${rowTitle(r)}`}
                  </Text>
                  {(r.result.errors.length ? r.result.errors : ['Not saved']).map((m) => (
                    <Text key={m} style={{ fontSize: rf(11), color: C.red, marginTop: 2 }}>{m}</Text>
                  ))}
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <PrimaryButton title="Edit Items" icon={SquarePen} variant="outline" small onPress={() => leave(() => { try { navigation.popTo('BulkItems'); } catch (_) { navigation.navigate('BulkItems'); } })} style={{ flex: 1 }} />
                <PrimaryButton title="Retry Failed" icon={RotateCcw} small loading={retrying} onPress={retryFailed} style={{ flex: 1 }} />
              </View>
              {retryError ? <ErrorBox message={retryError} onRetry={retryFailed} /> : null}
            </Card>
          ) : null}

          <PrimaryButton
            title="View Listings"
            iconRight={ExternalLink}
            disabled={!counts.published && !counts.drafts}
            onPress={() => openListings(counts.published ? 'ACTIVE' : 'DRAFT')}
            style={{ marginTop: 18 }}
          />
          <PrimaryButton title="Add Another Bulk Listing" variant="outline" onPress={addAnother} style={{ marginTop: 10 }} />
          <ActionRow icon={Plus} title="Add More Items" sub="Same category & settings" onPress={addMore} />
          <ActionRow icon={Download} title="Download Report" sub={reporting ? 'Preparing…' : 'CSV with each item’s result'} disabled={reporting} onPress={downloadReport} right={<ChevronRight size={18} color={C.text} />} />
          {draft.lastSubmit?.legacy ? (
            <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 10 }}>Saved one by one — the marketplace server update for faster bulk upload isn’t live yet.</Text>
          ) : null}
        </>
      )}
    </SellScreen>
  );
}
