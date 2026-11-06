import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { PenLine } from 'lucide-react-native';
import { bulkCreateListings } from '../../../../api/sellListings';
import { selectShopId, selectUserId } from '../../../../store/authSlice';
import { safeErrorText } from '../../../../lib/safeError';
import { rf } from '../../../../utils/responsive';
import {
  C, ErrorBox, PrimaryButton, SellScreen, Thumb, money,
} from '../kit';
import {
  BATCH, BATCH_META, CONDITION_CHOICES, applyBulkResponse, bulkDraftStore, discountError, finalPrice, meetsPhotoRule, pendingRows, priceError,
  rowPhotoUrls, sharedConditionKey, toBulkItem, uploadState, useBulkDraft, validateRows, warrantyLabel,
} from './bulkDraft';
import { reviveStaleUploads } from './bulkMedia';
import {
  DraftLoading, NoBatch, STEP_LABELS, TOTAL_STEPS,
} from './BulkUi';

// Page 7 — Review & Publish: the batch summary with Edit links, then Save as
// Draft or Publish Listing (POST /shop/marketplace/products/bulk). Items
// without enough photos are saved as drafts either way.

const FULFIL_LABEL = { PICKUP: 'Shop Visit', SHIPPING: 'Shipping' };

function Row({ label, value, onEdit, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}>
      <Text style={{ width: 118, fontSize: rf(12), color: C.text }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: rf(12), fontWeight: '700', color: C.text }}>{value}</Text>
      {onEdit ? (
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
          <PenLine size={13} color={C.green} />
          <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: C.green, marginLeft: 3 }}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function BulkReviewScreen({ navigation }) {
  const { draft, ready, set, patch } = useBulkDraft();
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);
  const [submitting, setSubmitting] = useState(null); // 'PUBLISH' | 'DRAFT'
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => { if (ready) reviveStaleUploads(); }, [ready]);

  if (!ready) return <DraftLoading title="Review & Publish" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Review & Publish" navigation={navigation} />;

  const t = draft.template;
  const pr = draft.pricing;
  const det = draft.details || {};
  const rows = pendingRows(draft);
  const doneBefore = draft.rows.length - rows.length;
  const itemErrors = validateRows(draft);
  const errorRows = Object.keys(itemErrors).length;
  const unpriced = rows.filter((r) => priceError(r)).length;
  const ruleError = discountError(pr);
  const { uploading, failed } = uploadState(draft);
  const pcs = rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
  const value = rows.reduce((n, r) => n + (Number(r.quantity) || 0) * (finalPrice(r, pr) || 0), 0);
  const short = rows.filter((r) => !meetsPhotoRule(draft, r)).length;
  const critical = errorRows + unpriced + (ruleError ? 1 : 0) + (pr.fulfilment.length ? 0 : 1) + (String(det.description || '').trim() ? 0 : 1);
  const canSubmit = rows.length > 0 && !critical && !uploading && !submitting;
  const cond = CONDITION_CHOICES.find((c) => c.value === sharedConditionKey(draft))?.label || 'Mixed (per variant)';
  const sameModel = draft.batchType === BATCH.SAME_MODEL;
  const name = sameModel && t.modelName ? t.modelName : BATCH_META[draft.batchType]?.title || 'Bulk listing';
  const sub = [t.brandName, t.categoryName].filter(Boolean).join(' • ');
  const cover = rows.map((r) => rowPhotoUrls(draft, r)[0]).find(Boolean) || t.modelImageUrl;
  const criticalMsg = errorRows ? `${errorRows} variant${errorRows > 1 ? 's need' : ' needs'} fixing (Items).`
    : unpriced ? `${unpriced} variant${unpriced > 1 ? 's need' : ' needs'} a price.`
      : ruleError || (!pr.fulfilment.length ? 'Choose how buyers get the item (Fulfillment).' : 'Add a description.');

  const submit = async (mode) => {
    if (inFlight.current || !canSubmit) return;
    inFlight.current = true;
    setSubmitting(mode);
    setError(null);
    try {
      patch('pricing', { publishMode: mode });
      const cur = bulkDraftStore.get();
      const d = { ...cur, pricing: { ...cur.pricing, publishMode: mode } };
      const sent = pendingRows(d);
      const items = sent.map((r) => toBulkItem(r, d));
      const res = await bulkCreateListings({ batchId: d.batchId, publish: mode === 'PUBLISH', items }, { shopId, userId });
      set((s) => ({ ...s, pricing: { ...s.pricing, publishMode: mode }, rows: applyBulkResponse(s.rows, sent, res), lastSubmit: { at: Date.now(), legacy: !!res?.legacy } }));
      navigation.replace('BulkStatus');
    } catch (e) {
      setError(safeErrorText(e, 'Could not reach the server. Your items are saved — retry when you are online.'));
    } finally {
      inFlight.current = false;
      setSubmitting(null);
    }
  };

  const n = rows.length;
  const footer = n ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <PrimaryButton title="Save as Draft" variant="outline" style={{ flex: 1 }} loading={submitting === 'DRAFT'} disabled={!canSubmit} onPress={() => submit('DRAFT')} />
      <PrimaryButton title={uploading ? `Uploading ${uploading}…` : 'Publish Listing'} style={{ flex: 1 }} loading={submitting === 'PUBLISH'} disabled={!canSubmit} onPress={() => submit('PUBLISH')} />
    </View>
  ) : (
    <PrimaryButton title="View Upload Result" onPress={() => navigation.replace('BulkStatus')} />
  );

  return (
    <SellScreen title="Review & Publish" onBack={() => navigation.goBack()} step={5} totalSteps={TOTAL_STEPS} stepLabels={STEP_LABELS} footer={footer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 14, padding: 12, marginTop: 8 }}>
        <Thumb uri={cover} size={52} radius={10} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ fontSize: rf(14.5), fontWeight: '800', color: C.text }}>{name}</Text>
          {sub ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
        </View>
      </View>

      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginTop: 12 }}>
        <Row label="Total Variants" value={String(n)} onEdit={() => navigation.navigate('BulkItems')} />
        <Row label="Total Quantity" value={String(pcs)} onEdit={() => navigation.navigate('BulkItems')} />
        <Row label="Total Value" value={money(value)} onEdit={() => navigation.navigate('BulkPricing')} />
        <Row label="Condition" value={cond} onEdit={() => navigation.navigate('BulkDetails')} />
        <Row label="Warranty" value={warrantyLabel(det.warrantyMonths)} onEdit={() => navigation.navigate('BulkDetails')} />
        <Row label="Fulfillment" value={pr.fulfilment.map((f) => FULFIL_LABEL[f] || f).join(', ') || '—'} onEdit={() => navigation.navigate('BulkPricing')} />
        <Row label="Photos" value={uploading ? `${uploading} uploading` : short ? `${short} variant${short > 1 ? 's' : ''} need more` : 'Ready'} onEdit={() => navigation.navigate('BulkPhotos')} />
        <Row label="Description" value={String(det.description || '').trim() || '—'} onEdit={() => navigation.navigate('BulkDetails')} last />
      </View>

      {critical ? <ErrorBox message={criticalMsg} /> : null}
      {short ? <ErrorBox tone="warning" message={`${short} variant${short > 1 ? 's' : ''} will be saved as draft${short > 1 ? 's' : ''} until ${short > 1 ? 'they have' : 'it has'} enough photos (devices need 3).`} /> : null}
      {failed ? <ErrorBox tone="warning" message={`${failed} photo upload${failed > 1 ? 's' : ''} failed. Retry or remove ${failed > 1 ? 'them' : 'it'} on Photos.`} /> : null}
      {doneBefore ? (
        <ErrorBox tone="warning" message={`${doneBefore} item${doneBefore > 1 ? 's were' : ' was'} already listed in an earlier attempt and won’t be sent again.`} />
      ) : null}
      {error ? <ErrorBox message={error} onRetry={() => submit(pr.publishMode || 'PUBLISH')} /> : null}
    </SellScreen>
  );
}
