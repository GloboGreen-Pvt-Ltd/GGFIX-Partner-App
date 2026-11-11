import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, ChevronDown, ChevronRight, CircleCheck, ImagePlus } from 'lucide-react-native';
import { notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import { C, CONTENT_MAX, PrimaryButton, SellScreen, Thumb } from '../kit';
import {
  bulkDraftStore, commonCoverKey, commonPhotoRoom, itemPhotoRoom, minPhotosFor, pendingRows, rowCoverKey, rowPhotoUrls, rowTitle, uploadState, useBulkDraft,
} from './bulkDraft';
import { COMMON, addPhotos, pickPhotos, removePhoto, retryPhoto, reviveStaleUploads, setCover } from './bulkMedia';
import { FlowSteps, FlowTabs, flowTitle, isSame, totals } from './BulkFlowKit';
import { AddTile, DraftLoading, NoBatch, PhotoTile, SourceSheet } from './BulkUi';

// Step 4 — Add Product Photos: shared photos (used for every listing in the
// batch) and optional photos per variant / item. Each listing needs 3–10.

export default function BulkFlowPhotosScreen({ navigation }) {
  const { draft, ready } = useBulkDraft();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState('SHARED');
  const [source, setSource] = useState(null); // COMMON | row key
  const [open, setOpen] = useState(null);
  const tile = Math.floor((Math.min(width, CONTENT_MAX) - 32 - 24) / 3);

  useEffect(() => { if (ready) reviveStaleUploads(); }, [ready]);

  if (!ready) return <DraftLoading title="Bulk Listing" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Bulk Listing" navigation={navigation} />;

  const same = isSame(draft);
  const rows = pendingRows(draft);
  const { uploading } = uploadState(draft);
  const t = totals(draft);
  const name = same ? draft.template.modelName || (rows[0] ? rowTitle(rows[0]) : 'this model') : null;

  const roomFor = (target) => {
    const d = bulkDraftStore.get();
    if (target === COMMON) return commonPhotoRoom(d);
    const row = d.rows.find((r) => r.key === target);
    return row ? itemPhotoRoom(d, row) : 0;
  };
  const onPick = async (src) => {
    const target = source;
    setSource(null);
    if (!target) return;
    const assets = await pickPhotos(src, roomFor(target));
    const fit = assets.slice(0, roomFor(target));
    if (fit.length) addPhotos(target, fit);
  };
  const grid = (target, photos, cover) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
      {photos.map((p) => (
        <PhotoTile key={p.key} photo={p} size={tile} cover={p.key === cover} onPress={() => setCover(target, p.key)} onRetry={() => retryPhoto(target, p)} onRemove={() => removePhoto(target, p.key)} />
      ))}
      {roomFor(target) > 0 ? <AddTile size={tile} label="Add" onPress={() => setSource(target)} /> : null}
    </View>
  );

  const next = () => {
    if (uploading) { notify('Photos still uploading', `Wait for ${uploading} upload${uploading > 1 ? 's' : ''} to finish.`); return; }
    const short = rows.find((r) => rowPhotoUrls(draft, r).length < minPhotosFor(r.listingType));
    if (short) {
      notify('Add more photos', same ? 'Add at least 3 photos.' : `${rowTitle(short)} needs at least 3 photos (shared + its own).`);
      return;
    }
    navigation.navigate('BulkFlowPricing');
  };

  return (
    <SellScreen title={flowTitle(draft)} onBack={() => navigation.goBack()}
      footer={<PrimaryButton title={uploading ? `Uploading ${uploading}…` : 'Next'} iconRight={ArrowRight} variant="green" onPress={next} />}>
      <FlowSteps step={4} />
      <Text style={{ fontSize: rf(19), fontWeight: '900', color: C.text, marginTop: 14 }}>Add Product Photos</Text>

      <FlowTabs
        tabs={[
          { value: 'SHARED', label: same ? 'Model Photos (Shared)' : 'Shared Photos (All Items)' },
          { value: 'VARIANT', label: same ? 'Variant Photos' : 'Item Photos', sub: '(Optional)' },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginTop: 12 }}
      />

      {tab === 'SHARED' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            <ImagePlus size={20} color={C.green} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{same ? `Add photos for ${name}` : 'Add photos for every item'}</Text>
              <Text style={{ fontSize: rf(12), color: C.muted }}>{same ? `(Used for all ${t.qty} unit${t.qty === 1 ? '' : 's'})` : `(Used for all ${t.items} item${t.items === 1 ? '' : 's'})`}</Text>
            </View>
          </View>
          {grid(COMMON, draft.media.common || [], commonCoverKey(draft))}
        </>
      ) : (
        <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF', paddingHorizontal: 12 }}>
          {rows.map((r, i) => {
            const n = rowPhotoUrls(draft, r).length;
            const expanded = open === r.key;
            const label = same ? [r.storageLabel, r.color].filter(Boolean).join(' · ') || rowTitle(r) : rowTitle(r);
            return (
              <View key={r.key} style={{ borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: '#F1F3F5', paddingVertical: 10 }}>
                <Pressable onPress={() => setOpen(expanded ? null : r.key)} accessibilityRole="button" accessibilityLabel={`${label} photos`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Thumb uri={rowPhotoUrls(draft, r)[0] || r.modelImageUrl} size={42} radius={8} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                    <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{`${label} (${r.quantity})`}</Text>
                    <Text style={{ fontSize: rf(11.5), color: n >= 3 ? C.muted : C.amber, marginTop: 2 }}>{`${n} Photo${n === 1 ? '' : 's'}`}</Text>
                  </View>
                  {expanded ? <ChevronDown size={18} color={C.muted} /> : <ChevronRight size={18} color={C.muted} />}
                </Pressable>
                {expanded ? grid(r.key, r.photos || [], rowCoverKey(draft, r)) : null}
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <CircleCheck size={16} color={C.green} />
        <Text style={{ flex: 1, fontSize: rf(12), color: C.text, marginLeft: 8 }}>Add 3 to 10 high-quality photos{'\n'}(JPG/PNG, Max 10 MB each)</Text>
      </View>

      <SourceSheet visible={!!source} onClose={() => setSource(null)} onPick={onPick} />
    </SellScreen>
  );
}
