import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { CommonActions } from '@react-navigation/native';
import { Check, Pencil, TrendingUp } from 'lucide-react-native';
import { listProducts } from '../../../api/marketplace';
import { createListing, updateListing } from '../../../api/sellListings';
import { selectShopId, selectUserId } from '../../../store/authSlice';
import { notify } from '../../../components/confirm';
import { rf } from '../../../utils/responsive';
import {
  C, Card, ChoiceCard, ErrorBox, FieldLabel, InfoRow, PrimaryButton, QtyStepper, Section, SellScreen, TextField, Thumb, ToggleRow,
  cleanAmount, money, reportErrors,
} from './kit';
import { LISTING_TYPES, draftTitle, draftToFields, minPhotos, orderedPhotoUrls, useSellDraft, sellDraftStore } from './draft';

// Page 6 (step 4 of 4) — price, negotiable, stock, fulfilment, a final
// review of the listing, then publish now or save as draft.

const MAX_PRICE = 10000000;
const WORKING_LABEL = { WORKING: 'Working', DEAD: 'Dead / for parts', UNVERIFIED: 'Unverified' };
const ITEM_LABEL = { NEW: 'New', USED: 'Used', REFURBISHED: 'Refurbished' };

export default function SellStepPriceScreen({ navigation }) {
  const { draft, ready } = useSellDraft();
  const pr = draft.pricing;
  const p = draft.product;
  const set = (values) => sellDraftStore.patch('pricing', values);
  const shopId = useSelector(selectShopId);
  const userId = useSelector(selectUserId);

  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [similar, setSimilar] = useState(null); // { min, max, n }
  const lock = useRef(false);

  // A unit with its own IMEI is one physical device.
  const maxQty = p.imei ? 1 : 9999;

  // Similar live listings for the same model — real marketplace prices.
  useEffect(() => {
    if (!ready || !p.modelId || draft.listingType !== LISTING_TYPES.DEVICE) return undefined;
    let alive = true;
    listProducts({ modelId: p.modelId })
      .then((rows) => {
        const prices = (rows || [])
          .filter((r) => r.type === 'SELL' && r.id !== draft.editingId && Number(r.price) > 0)
          .filter((r) => !p.storageLabel || !r.storageLabel || r.storageLabel === p.storageLabel)
          .map((r) => Number(r.price));
        if (alive) setSimilar(prices.length >= 2 ? { min: Math.min(...prices), max: Math.max(...prices), n: prices.length } : null);
      })
      .catch(() => { if (alive) setSimilar(null); });
    return () => { alive = false; };
  }, [ready, p.modelId, p.storageLabel, draft.listingType, draft.editingId]);

  useEffect(() => {
    if (ready && Number(pr.quantity) > maxQty) set({ quantity: maxQty });
  }, [ready, maxQty]);

  const photos = useMemo(() => orderedPhotoUrls(draft.media), [draft.media]);

  const validate = (mode) => {
    const e = {};
    const price = Number(pr.price);
    if (mode === 'PUBLISH' || pr.price !== '') {
      if (!pr.price || !(price > 0)) e.price = 'Enter a selling price';
      else if (price > MAX_PRICE) e.price = 'That price looks too high';
    }
    if (!(Number(pr.quantity) >= 1)) e.quantity = 'Quantity must be at least 1';
    if (!pr.fulfilment.length) e.fulfilment = 'Choose at least one option';
    // Photos can change after the Photos step (Edit → Back), so check again here.
    const media = sellDraftStore.get().media;
    const need = minPhotos(draft.listingType);
    if (media.photos.some((ph) => ph.status === 'uploading') || media.video?.status === 'uploading') {
      e.photos = 'Wait for the photo and video uploads to finish.';
    } else if (mode === 'PUBLISH' && orderedPhotoUrls(media).length < need) {
      e.photos = `Add at least ${need} photo${need > 1 ? 's' : ''} to publish, or save as draft.`;
    }
    setErrors(e);
    return reportErrors(e);
  };

  const toggleFulfilment = (v) => {
    set({ fulfilment: pr.fulfilment.includes(v) ? pr.fulfilment.filter((x) => x !== v) : [...pr.fulfilment, v] });
    setErrors((x) => ({ ...x, fulfilment: null }));
  };

  const submit = async () => {
    if (lock.current) return;
    const mode = pr.publishMode;
    if (!validate(mode)) return;
    lock.current = true;
    setBusy(true);
    setSubmitError(null);
    const d = sellDraftStore.get();
    try {
      const fields = draftToFields(d);
      const res = d.editingId ? await updateListing(d.editingId, fields) : await createListing(fields, { shopId, userId });
      const outcome = d.editingId ? 'UPDATED' : res?._status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
      sellDraftStore.reset();
      // Replace the wizard with the success page; Back from it returns to the tabs.
      navigation.dispatch((state) => CommonActions.reset({
        ...state,
        index: 1,
        routes: [state.routes[0], { key: `SellListingSuccess-${Date.now()}`, name: 'SellListingSuccess', params: { listing: res, outcome } }],
      }));
    } catch (e) {
      const msg = e?.message || 'Could not save the listing.';
      setSubmitError(e?.status ? `${msg} (HTTP ${e.status})` : msg);
      notify(d.editingId ? 'Update failed' : 'Listing failed', msg);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const conditionLine = [ITEM_LABEL[p.itemCondition], WORKING_LABEL[draft.condition.working]].filter(Boolean).join(' · ');
  const specLine = draft.listingType === LISTING_TYPES.DEVICE
    ? [p.ramLabel, p.storageLabel, p.color].filter(Boolean).join(' · ')
    : draft.listingType === LISTING_TYPES.SPARE_PART ? [p.partType, p.partQuality].filter(Boolean).join(' · ') : [p.accessoryType, p.brandName].filter(Boolean).join(' · ');
  const publishTitle = draft.editingId
    ? (pr.publishMode === 'DRAFT' ? 'Save as Draft' : 'Save Changes')
    : (pr.publishMode === 'DRAFT' ? 'Save Draft' : 'Publish Listing');

  const editLink = (route) => (
    <Pressable onPress={() => navigation.navigate(route)} accessibilityRole="button" accessibilityLabel="Edit" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pencil size={13} color={C.teal} />
      <Text style={{ fontSize: rf(11.5), color: C.teal, fontWeight: '800', marginLeft: 4 }}>Edit</Text>
    </Pressable>
  );

  return (
    <SellScreen
      title={draft.editingId ? 'Price & Save' : 'Price & Publish'}
      subtitle="Step 4 of 4 • Set price & publish"
      step={4}
      onBack={() => navigation.goBack()}
      footer={<PrimaryButton title={publishTitle} icon={Check} onPress={submit} loading={busy} disabled={!ready || busy} />}
    >
      <TextField
        label="Selling Price"
        required
        prefix="₹"
        value={pr.price}
        onChangeText={(t) => { set({ price: cleanAmount(t) }); setErrors((x) => ({ ...x, price: null })); }}
        placeholder="0"
        keyboardType="decimal-pad"
        maxLength={11}
        error={errors.price}
        inputStyle={{ fontSize: rf(16), fontWeight: '800' }}
      />
      {similar ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 }}>
          <TrendingUp size={14} color={C.green} />
          <Text style={{ fontSize: rf(11.5), color: '#0B6B4B', marginLeft: 6 }}>
            Similar listings: {money(similar.min)} – {money(similar.max)} ({similar.n})
          </Text>
        </View>
      ) : null}

      <ToggleRow label="Negotiable" sub="Buyers can send you price offers" value={pr.negotiable} onChange={(v) => set({ negotiable: v })} />

      <View style={{ marginTop: 16 }}>
        <FieldLabel label="Quantity" required hint={p.imei ? '(1 for a device with IMEI)' : null} />
        <QtyStepper value={pr.quantity} onChange={(v) => { set({ quantity: v }); setErrors((x) => ({ ...x, quantity: null })); }} min={1} max={maxQty} />
        {errors.quantity ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{errors.quantity}</Text> : null}
      </View>

      <Section title="Fulfilment Options" sub="How buyers get the item" style={{ marginTop: 18 }}>
        <ChoiceCard title="Pickup (Free)" sub="Buyer can pick up from your shop" selected={pr.fulfilment.includes('PICKUP')} onPress={() => toggleFulfilment('PICKUP')} style={{ marginTop: 0 }} />
        <ChoiceCard title="Shipping" sub="Ship to buyer via partnered courier" selected={pr.fulfilment.includes('SHIPPING')} onPress={() => toggleFulfilment('SHIPPING')} />
        {errors.fulfilment ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{errors.fulfilment}</Text> : null}
      </Section>

      <Section title="Listing Preview" sub="Check everything before you publish">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Thumb uri={photos[0]} size={64} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text numberOfLines={2} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{draftTitle(draft)}</Text>
              {specLine ? <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{specLine}</Text> : null}
              <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.teal, marginTop: 3 }}>{pr.price ? money(pr.price) : 'No price yet'}</Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: C.border, marginVertical: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '800', color: C.text }}>Product</Text>
            {editLink('SellStepDetails')}
          </View>
          <InfoRow label="Item" value={draftTitle(draft)} />
          {p.modelNumber ? <InfoRow label="Model number" value={p.modelNumber} /> : null}
          {p.imei ? <InfoRow label="IMEI" value={p.imei} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '800', color: C.text }}>Condition</Text>
            {editLink('SellStepCondition')}
          </View>
          <InfoRow label="Condition" value={conditionLine} />
          <InfoRow label="Description" value={draft.condition.description.trim()} />
          {draft.condition.issues.length ? <InfoRow label="Defects" value={draft.condition.issues.join(', ')} /> : null}
          {draft.condition.accessories.length ? <InfoRow label="In the box" value={draft.condition.accessories.join(', ')} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '800', color: C.text }}>Media</Text>
            {editLink('SellStepPhotos')}
          </View>
          <InfoRow label="Photos" value={`${photos.length} photo${photos.length === 1 ? '' : 's'}${draft.media.video?.status === 'done' ? ' + video' : ''}`} />
          <InfoRow label="Stock" value={`${pr.quantity} unit${Number(pr.quantity) === 1 ? '' : 's'}${pr.negotiable ? ' · Negotiable' : ''}`} />
          <InfoRow label="Fulfilment" value={pr.fulfilment.map((f) => (f === 'PICKUP' ? 'Pickup' : 'Shipping')).join(', ')} />
        </Card>
      </Section>

      <Section title="Publish Options">
        <ChoiceCard radio title="Publish immediately" sub="Go live on the marketplace now" selected={pr.publishMode === 'PUBLISH'} onPress={() => set({ publishMode: 'PUBLISH' })} style={{ marginTop: 0 }} />
        <ChoiceCard radio title="Save as draft" sub="Review or publish later from My Listings" selected={pr.publishMode === 'DRAFT'} onPress={() => set({ publishMode: 'DRAFT' })} />
      </Section>

      {errors.photos ? <ErrorBox message={errors.photos} /> : null}
      {submitError ? <ErrorBox message={submitError} onRetry={submit} /> : null}
    </SellScreen>
  );
}
