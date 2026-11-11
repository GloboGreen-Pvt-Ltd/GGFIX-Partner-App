import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { ArrowUp, Circle, CircleCheck, ClipboardList } from 'lucide-react-native';
import { bulkCreateListings } from '../../../../api/sellListings';
import { selectShopId, selectUserId } from '../../../../store/authSlice';
import { safeErrorText } from '../../../../lib/safeError';
import { rf } from '../../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, SellScreen } from '../kit';
import { applyBulkResponse, bulkDraftStore, pendingRows, priceError, toBulkItem, uploadState, validateRows } from './bulkDraft';
import { reviveStaleUploads } from './bulkMedia';

// Creating Bulk Listings… — runs the publish once and shows its real stages:
// validate rows → wait for photo uploads → create listings (bulk API) →
// save results. Then Bulk Listing Completed.

const STAGES = ['Validating data...', 'Uploading photos...', 'Creating listings...', 'Finalizing...'];
const UPLOAD_WAIT_MS = 120000;
const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

export default function BulkCreatingScreen({ navigation }) {
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(0);
  const started = useRef(-1);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (started.current === run) return;
    started.current = run;
    (async () => {
      setError(null);
      try {
        setStage(0);
        let d = await bulkDraftStore.load();
        const rows = pendingRows(d);
        if (!rows.length) throw new Error('There are no valid items to publish.');
        if (Object.keys(validateRows(d)).length || rows.some((r) => priceError(r))) throw new Error('Some items have missing details or prices. Go back to Validate & Preview.');
        if (!(d.pricing.fulfilment || []).length) throw new Error('Choose the buyer category and fulfillment option.');

        setStage(1);
        reviveStaleUploads();
        const until = Date.now() + UPLOAD_WAIT_MS;
        while (uploadState(bulkDraftStore.get()).uploading && Date.now() < until) {
          // eslint-disable-next-line no-await-in-loop
          await pause(500);
        }
        if (uploadState(bulkDraftStore.get()).uploading) throw new Error('Photos are still uploading. Check your connection and retry.');

        setStage(2);
        d = bulkDraftStore.get();
        const sent = pendingRows(d);
        const items = sent.map((r) => toBulkItem(r, { ...d, pricing: { ...d.pricing, publishMode: 'PUBLISH' } }));
        const res = await bulkCreateListings({ batchId: d.batchId, publish: true, items }, { shopId, userId });

        setStage(3);
        bulkDraftStore.set((s) => ({ ...s, rows: applyBulkResponse(s.rows, sent, res), lastSubmit: { at: Date.now(), legacy: !!res?.legacy } }));
        if (mounted.current) navigation.replace('BulkFlowDone');
      } catch (e) {
        if (mounted.current) setError(safeErrorText(e, 'Could not reach the server. Your items are saved — retry when you are online.'));
      }
    })();
  }, [run, navigation, shopId, userId]);

  const pct = Math.round(((stage + (error ? 0 : 0.5)) / STAGES.length) * 100);

  return (
    <SellScreen title="" onBack={() => navigation.goBack()}>
      <View style={{ alignItems: 'center', marginTop: 20 }}>
        <View style={{ height: 150, width: 150, borderRadius: 75, borderWidth: 3, borderColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ height: 120, width: 120, borderRadius: 60, backgroundColor: '#F4FBF8', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={64} color={C.teal} strokeWidth={1.4} />
            <View style={{ position: 'absolute', right: 14, bottom: 14, height: 40, width: 40, borderRadius: 20, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUp size={22} color="#FFFFFF" />
            </View>
          </View>
        </View>
        <Text style={{ fontSize: rf(21), fontWeight: '900', color: C.text, marginTop: 18 }}>{error ? 'Publishing Stopped' : 'Creating Bulk Listings...'}</Text>
        <Text style={{ fontSize: rf(13.5), color: C.muted, marginTop: 6, textAlign: 'center' }}>{'Please wait while we publish\nyour products.'}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24 }}>
        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: C.field, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: error ? C.red : C.green }} />
        </View>
        <Text style={{ width: 48, fontSize: rf(14), fontWeight: '800', color: C.text, textAlign: 'right' }}>{`${pct}%`}</Text>
      </View>

      <View style={{ marginTop: 18, marginLeft: 8 }}>
        {STAGES.map((s, i) => {
          const done = i < stage;
          const cur = i === stage && !error;
          return (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              {done ? <CircleCheck size={20} color="#FFFFFF" fill={C.green} />
                : cur ? <ActivityIndicator size="small" color={C.green} style={{ width: 20 }} />
                  : <Circle size={20} color={C.border} />}
              <Text style={{ fontSize: rf(13.5), color: done || cur ? C.text : C.muted, marginLeft: 12 }}>{s}</Text>
            </View>
          );
        })}
      </View>

      {error ? (
        <>
          <ErrorBox message={error} style={{ marginTop: 6 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <PrimaryButton title="Back" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
            <PrimaryButton title="Retry" variant="green" style={{ flex: 1 }} onPress={() => setRun((n) => n + 1)} />
          </View>
        </>
      ) : null}
    </SellScreen>
  );
}
