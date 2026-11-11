import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ArrowRight, ArrowUp, Boxes, FileSpreadsheet, Laptop, Layers, Package } from 'lucide-react-native';
import { confirm } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import { C, PrimaryButton, SellScreen } from '../kit';
import { BATCH, BATCH_META, bulkDraftStore, hasProgress, pendingRows, resumeRoute } from './bulkDraft';
import { MethodCard, flowResumeRoute, isFlowBatch } from './BulkFlowKit';

// Bulk Listing (Excel) — Bulk Sell Listing: list many products from one Excel
// file. Same Model Bulk (units of one model) or Multiple Models Bulk. An
// unfinished batch can be continued or discarded first.

export default function BulkListingScreen({ navigation }) {
  const [type, setType] = useState(BATCH.SAME_MODEL);
  const busy = useRef(false);

  const startNew = (t) => {
    bulkDraftStore.reset(t);
    navigation.navigate('BulkExcelTemplate');
  };
  const resume = (d) => {
    if (isFlowBatch(d)) {
      const route = flowResumeRoute(d);
      if (route !== 'BulkExcelTemplate') navigation.navigate('BulkExcelTemplate');
      if (route === 'BulkFlowDone') navigation.navigate('BulkExcelReview');
      navigation.navigate(route);
      return;
    }
    // Older batch types (spare parts, accessories, CSV) keep their own pages.
    const route = resumeRoute(d);
    if (route === 'BulkItems') navigation.navigate('BulkTemplate', { csv: d.batchType === BATCH.CSV });
    navigation.navigate(route, route === 'BulkTemplate' ? { csv: d.batchType === BATCH.CSV } : undefined);
  };

  const next = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const d = await bulkDraftStore.load();
      if (!hasProgress(d)) { startNew(type); return; }
      const n = pendingRows(d).length;
      const ok = await confirm({
        title: 'Continue previous batch?',
        message: `You have an unfinished ${BATCH_META[d.batchType]?.title || 'bulk'} batch${n ? ` with ${n} item${n > 1 ? 's' : ''}` : ''}.`,
        confirmText: 'Continue',
        cancelText: 'Start New',
      });
      if (ok) { resume(d); return; }
      const discard = await confirm({
        title: 'Discard previous batch?',
        message: 'Its items, photos and prices will be removed. Listings already created stay in My Listings.',
        confirmText: 'Discard',
        cancelText: 'Keep',
        destructive: true,
      });
      if (discard) startNew(type);
    } finally {
      busy.current = false;
    }
  };

  return (
    <SellScreen title="Bulk Listing (Excel)" onBack={() => navigation.goBack()} footer={<PrimaryButton title="Continue" iconRight={ArrowRight} variant="green" onPress={next} />}>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120 }}>
          <Package size={46} color="#E0A33A" strokeWidth={1.5} />
          <View style={{ marginLeft: -4, marginRight: -10, zIndex: 2, height: 64, width: 60, borderRadius: 10, backgroundColor: '#1D7A45', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }], marginBottom: 30 }}>
            <FileSpreadsheet size={36} color="#FFFFFF" />
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ position: 'absolute', top: 30, zIndex: 1, height: 30, width: 30, borderRadius: 15, borderWidth: 2, borderColor: C.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
              <ArrowUp size={16} color={C.teal} />
            </View>
            <Laptop size={104} color={C.teal} strokeWidth={1.2} />
          </View>
          <Boxes size={50} color="#E0A33A" strokeWidth={1.5} style={{ marginLeft: -6 }} />
        </View>
        <Text style={{ fontSize: rf(21), fontWeight: '900', color: C.text, marginTop: 6 }}>Bulk Sell Listing</Text>
        <Text style={{ fontSize: rf(13), color: C.muted, marginTop: 4, textAlign: 'center' }}>{'Upload an Excel file to list multiple\nproducts at once.'}</Text>
      </View>

      <MethodCard
        Icon={Layers}
        title="Same Model Bulk"
        sub="List multiple units of one model"
        example="(e.g., iPhone 11 – 10 units)"
        selected={type === BATCH.SAME_MODEL}
        onPress={() => setType(BATCH.SAME_MODEL)}
        style={{ marginTop: 18 }}
      />
      <MethodCard
        Icon={Boxes}
        title="Multiple Models Bulk"
        sub="List different models in one file"
        example="(e.g., iPhone, Samsung, Laptop)"
        selected={type === BATCH.MULTI_MODEL}
        onPress={() => setType(BATCH.MULTI_MODEL)}
        style={{ marginTop: 12 }}
      />
    </SellScreen>
  );
}
