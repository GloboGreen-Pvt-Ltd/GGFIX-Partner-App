import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import {
  Camera, ChevronDown, ChevronUp, CircleAlert, CirclePlay, Info, RefreshCw, Video, X,
} from 'lucide-react-native';
import { notify } from '../../../../components/confirm';
import { MAX_PHOTOS } from '../../../../api/sellListings';
import { rf } from '../../../../utils/responsive';
import {
  C, CONTENT_MAX, Card, ErrorBox, PrimaryButton, Section, SellScreen,
} from '../kit';
import {
  bulkDraftStore, commonCoverKey, commonPhotoRoom, itemPhotoRoom, minPhotosFor, rowCoverKey, rowPhotoUrls, rowTitle, uploadState, useBulkDraft,
} from './bulkDraft';
import {
  COMMON, MAX_VIDEO_SECONDS, addPhotos, pickPhotos, pickVideo, removePhoto, removeVideo, retryPhoto, retryVideo, reviveStaleUploads, setCover,
} from './bulkMedia';
import {
  AddTile, DraftLoading, IndexBadge, NoBatch, PhotoTile, STEP_LABELS, SourceSheet, TOTAL_STEPS,
} from './BulkUi';

// Page 5 — Upload Photos: 3–10 common photos for the batch (tap one for the
// cover), an optional short video, and optional photos for a single variant.

export default function BulkPhotosScreen({ navigation }) {
  const { draft, ready } = useBulkDraft();
  const { width } = useWindowDimensions();
  const [source, setSource] = useState(null); // { target, kind: 'photo' | 'video' }
  const [collapsed, setCollapsed] = useState({});
  const [variantOpen, setVariantOpen] = useState(false);
  const tile = Math.floor((Math.min(width, CONTENT_MAX) - 32 - 24) / 3); // 3 per row (PhotoTile adds 8px right margin)

  useEffect(() => { if (ready) reviveStaleUploads(); }, [ready]);

  if (!ready) return <DraftLoading title="Upload Photos & Media" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Upload Photos & Media" navigation={navigation} />;

  const rows = draft.rows.filter((r) => !r.result?.productId);
  const common = draft.media.common;
  const video = draft.media.video;
  const { uploading, failed } = uploadState(draft);
  const commonRoom = commonPhotoRoom(draft);
  const commonCover = commonCoverKey(draft);

  // Room is always read from the live draft (uploads may have changed it).
  const roomFor = (target) => {
    const d = bulkDraftStore.get();
    if (target === COMMON) return commonPhotoRoom(d);
    const row = d.rows.find((r) => r.key === target);
    return row ? itemPhotoRoom(d, row) : 0;
  };

  const onPick = async (src) => {
    const req = source;
    setSource(null);
    if (!req) return;
    if (req.kind === 'video') { await pickVideo(src); return; }
    const assets = await pickPhotos(src, roomFor(req.target));
    const fit = assets.slice(0, roomFor(req.target));
    if (fit.length) addPhotos(req.target, fit);
  };

  const next = () => {
    if (uploading) { notify('Photos still uploading', `Wait for ${uploading} upload${uploading > 1 ? 's' : ''} to finish.`); return; }
    navigation.navigate('BulkPricing');
  };

  const short = rows.filter((r) => rowPhotoUrls(draft, r).length < minPhotosFor(r.listingType)).length;

  return (
    <SellScreen
      title="Upload Photos"
      onBack={() => navigation.goBack()}
      step={4}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      footer={<PrimaryButton title={uploading ? `Uploading ${uploading}…` : 'Continue'} loading={!!uploading} onPress={next} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
        <Text style={{ flex: 1, fontSize: rf(14), fontWeight: '800', color: C.text }}>{`Add Photos (3 – ${MAX_PHOTOS})`}</Text>
        <Text style={{ fontSize: rf(11), color: C.muted }}>{`${common.length}/${MAX_PHOTOS}`}</Text>
      </View>
      <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2, marginBottom: 10 }}>(Common photos for this batch — tap a photo to make it the cover)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {common.map((p) => (
          <PhotoTile
            key={p.key}
            size={tile}
            photo={p}
            cover={p.key === commonCover}
            onPress={() => setCover(COMMON, p.key)}
            onRetry={() => retryPhoto(COMMON, p)}
            onRemove={() => removePhoto(COMMON, p.key)}
          />
        ))}
        <AddTile size={tile} label="Add Photo" disabled={commonRoom <= 0} onPress={() => setSource({ target: COMMON, kind: 'photo' })} />
      </View>
      {commonRoom <= 0 && common.length < MAX_PHOTOS ? (
        <Text style={{ fontSize: rf(10.5), color: C.amber }}>A variant already has its own photos — together they can’t pass 10.</Text>
      ) : null}

      <View style={{ backgroundColor: C.greenBg, borderRadius: 14, padding: 12, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Camera size={18} color={C.text} />
          <Text style={{ flex: 1, fontSize: rf(12), color: C.text, marginLeft: 8, lineHeight: rf(17) }}>Add clear, real photos. You can also add a short video (optional).</Text>
        </View>
        {!video ? (
          <PrimaryButton title="Add Video (Optional)" icon={CirclePlay} variant="outline" small onPress={() => setSource({ target: null, kind: 'video' })} style={{ marginTop: 10 }} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: video.status === 'error' ? C.red : C.border, padding: 8, marginTop: 10 }}>
            <View style={{ height: 36, width: 36, borderRadius: 8, backgroundColor: video.status === 'error' ? C.redBg : C.mint, alignItems: 'center', justifyContent: 'center' }}>
              {video.status === 'uploading' ? <ActivityIndicator size="small" color={C.teal} /> : video.status === 'error' ? <CircleAlert size={18} color={C.red} /> : <Video size={18} color={C.green} />}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>
                {video.status === 'uploading' ? 'Uploading video…' : video.status === 'error' ? 'Video upload failed' : 'Video added'}
              </Text>
              <Text numberOfLines={2} style={{ fontSize: rf(10.5), color: video.status === 'error' ? C.red : C.muted, marginTop: 1 }}>
                {video.status === 'error' ? video.error : video.duration ? `${Math.round(video.duration)} sec · shown on every item` : `Shown on every item (max ${MAX_VIDEO_SECONDS} sec)`}
              </Text>
            </View>
            {video.status === 'error' ? (
              <Pressable onPress={retryVideo} accessibilityRole="button" accessibilityLabel="Retry video upload" hitSlop={8} style={{ padding: 6 }}>
                <RefreshCw size={18} color={C.red} />
              </Pressable>
            ) : null}
            <Pressable onPress={removeVideo} accessibilityRole="button" accessibilityLabel="Remove video" hitSlop={8} style={{ padding: 6 }}>
              <X size={18} color={C.text} />
            </Pressable>
          </View>
        )}
      </View>

      {rows.length ? (
        <Pressable onPress={() => setVariantOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="Photos for a single variant"
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
          <Text style={{ flex: 1, fontSize: rf(13), fontWeight: '800', color: C.text }}>
            Photos for a single variant <Text style={{ fontSize: rf(11), fontWeight: '500', color: C.muted }}>(Optional)</Text>
          </Text>
          {variantOpen ? <ChevronUp size={18} color={C.muted} /> : <ChevronDown size={18} color={C.muted} />}
        </Pressable>
      ) : null}
      {variantOpen ? (
      <Section title={null} style={{ marginTop: 4 }}>
        {rows.map((row) => {
          const index = draft.rows.findIndex((r) => r.key === row.key) + 1;
          const own = row.photos || [];
          const total = rowPhotoUrls(draft, row).length;
          const need = minPhotosFor(row.listingType);
          const room = itemPhotoRoom(draft, row);
          const cover = rowCoverKey(draft, row);
          const open = !collapsed[row.key];
          return (
            <Card key={row.key} style={{ marginTop: 8, paddingVertical: 10 }}>
              <Pressable
                onPress={() => setCollapsed((c) => ({ ...c, [row.key]: open }))}
                accessibilityRole="button"
                accessibilityLabel={`${rowTitle(row)} photos`}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <IndexBadge n={index} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: rf(12.5), fontWeight: '800', color: C.text }}>{rowTitle(row)}</Text>
                <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: total >= need ? C.green : C.amber, marginRight: 6 }}>
                  {total >= need ? `${total} photo${total === 1 ? '' : 's'}` : `${total}/${need} for live`}
                </Text>
                {open ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
              </Pressable>
              {open ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                  {own.map((p) => (
                    <PhotoTile
                      key={p.key}
                      size={58}
                      photo={p}
                      cover={p.key === cover}
                      onPress={() => setCover(row.key, p.key)}
                      onRetry={() => retryPhoto(row.key, p)}
                      onRemove={() => removePhoto(row.key, p.key)}
                    />
                  ))}
                  <AddTile size={58} disabled={room <= 0} onPress={() => setSource({ target: row.key, kind: 'photo' })} />
                  {common.length ? (
                    <View style={{ height: 58, justifyContent: 'center', marginLeft: 8 }}>
                      <Text style={{ fontSize: rf(10.5), color: C.muted }}>{`+ ${common.length} common`}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </Section>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 }}>
        <Info size={14} color={C.muted} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, marginLeft: 6, fontSize: rf(11), color: C.muted, lineHeight: rf(16) }}>
          {`Devices need at least 3 photos to go live; spare parts and accessories need 1. Up to ${MAX_PHOTOS} photos per item, common photos included. Items without enough photos are saved as drafts.`}
        </Text>
      </View>
      {short ? <ErrorBox tone="warning" message={`${short} item${short > 1 ? 's' : ''} will be saved as draft${short > 1 ? 's' : ''} unless you add more photos.`} /> : null}
      {failed ? <ErrorBox message={`${failed} upload${failed > 1 ? 's' : ''} failed. Tap the photo to retry, or remove it.`} /> : null}

      <SourceSheet
        visible={!!source && !source.closing}
        title={source?.kind === 'video' ? 'Add short video' : 'Add photos'}
        cameraLabel={source?.kind === 'video' ? 'Record Video' : 'Take Photo'}
        onClose={() => setSource((s) => (s ? { ...s, closing: true } : s))}
        onPick={onPick}
      />
    </SellScreen>
  );
}
