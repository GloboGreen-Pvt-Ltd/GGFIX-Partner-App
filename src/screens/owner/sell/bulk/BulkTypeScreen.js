import React, { useRef } from 'react';
import { Image, Text, View } from 'react-native';
import { FileText, Layers, RotateCcw, Smartphone } from 'lucide-react-native';
import { confirm } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import { C, OptionCard, SellScreen } from '../kit';
import {
  BATCH, BATCH_META, bulkDraftStore, hasProgress, pendingRows, resumeRoute, useBulkDraft,
} from './bulkDraft';

// Page 1 — Sell on NearGFix → Choose Listing Type. Bulk Listing picks its
// category (devices, spare parts, accessories) on the next page; CSV Upload
// opens the sheet import.

const PHONE_ART = 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Phone.png';

export default function BulkTypeScreen({ navigation }) {
  const { draft, ready } = useBulkDraft();
  const busy = useRef(false);

  const resume = (d) => {
    const route = resumeRoute(d);
    if (route === 'BulkItems') {
      // Keep Template under Items so Back walks the flow.
      navigation.navigate('BulkTemplate', { csv: d.batchType === BATCH.CSV });
      navigation.navigate('BulkItems');
    } else {
      navigation.navigate(route, route === 'BulkTemplate' ? { csv: d.batchType === BATCH.CSV } : undefined);
    }
  };

  const startNew = (type) => {
    bulkDraftStore.reset(type);
    navigation.navigate('BulkTemplate', { csv: type === BATCH.CSV });
  };

  const choose = async (type) => {
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

  const unfinished = ready && hasProgress(draft);
  const pending = unfinished ? pendingRows(draft).length : 0;

  const single = () => {
    try { navigation.popTo('SellListingType'); } catch (_) { navigation.navigate('SellListingType'); }
  };

  return (
    <SellScreen title="Sell on NearGFix" onBack={() => navigation.goBack()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.teal, borderRadius: 16, paddingLeft: 16, paddingVertical: 14, marginTop: 6, overflow: 'hidden' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: rf(20), fontWeight: '900', color: '#FFFFFF' }}>Bulk Listing</Text>
          <Text style={{ fontSize: rf(12.5), color: 'rgba(255,255,255,0.9)', marginTop: 4, lineHeight: rf(17) }}>{'Add multiple devices\nin one go'}</Text>
        </View>
        <Image source={{ uri: PHONE_ART }} style={{ width: 104, height: 88 }} resizeMode="contain" />
      </View>

      {unfinished ? (
        <OptionCard
          icon={RotateCcw}
          tint={C.amberBg}
          iconColor={C.amber}
          title="Resume unfinished batch"
          sub={`${BATCH_META[draft.batchType]?.title || 'Bulk batch'}${pending ? ` · ${pending} item${pending > 1 ? 's' : ''}` : ''}`}
          onPress={() => resume(draft)}
          style={{ marginTop: 14 }}
        />
      ) : null}

      <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 18, marginBottom: 2 }}>Choose Listing Type</Text>
      <OptionCard icon={Smartphone} title="Single Listing" sub="Add one product" onPress={single} style={{ marginTop: 10 }} />
      <OptionCard icon={Layers} title="Bulk Listing" sub="Add multiple products" selected onPress={() => choose(BATCH.SAME_MODEL)} style={{ marginTop: 10 }} />
      <OptionCard icon={FileText} title="CSV Upload" sub="Upload product list (CSV)" onPress={() => choose(BATCH.CSV)} style={{ marginTop: 10 }} />
    </SellScreen>
  );
}
