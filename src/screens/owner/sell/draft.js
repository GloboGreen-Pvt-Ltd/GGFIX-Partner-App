import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MIN_DEVICE_PHOTOS, MAX_PHOTOS, newClientRef } from '../../../api/sellListings';

// Wizard form state that survives Back, re-opening the screen and an app
// restart. One store per flow (single listing, bulk listing); every screen of
// the flow reads and patches the same object.

export function createDraftStore(storageKey, makeEmpty) {
  let state = makeEmpty();
  let loaded = false;
  let loading = null;
  let touched = false; // changed before the saved copy finished loading
  const listeners = new Set();
  let saveTimer = null;

  const emit = () => listeners.forEach((fn) => fn(state));
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      AsyncStorage.setItem(storageKey, JSON.stringify(state)).catch(() => {});
    }, 250);
  };
  const load = () => {
    if (loaded) return Promise.resolve(state);
    if (!loading) {
      loading = AsyncStorage.getItem(storageKey)
        .then((raw) => {
          const saved = raw ? JSON.parse(raw) : null;
          // Keys added to the empty draft later still get their defaults.
          if (saved && typeof saved === 'object' && !touched) state = { ...makeEmpty(), ...saved };
        })
        .catch(() => {})
        .finally(() => { loaded = true; emit(); });
    }
    return loading.then(() => state);
  };

  const store = {
    get: () => state,
    load,
    /** Replace the whole draft. */
    set(next) {
      touched = true;
      state = typeof next === 'function' ? next(state) : next;
      emit();
      persist();
    },
    /** Shallow-merge into one section: patch('product', { brandId }). */
    patch(section, values) {
      touched = true;
      const cur = state[section];
      const next = typeof values === 'function' ? values(cur) : values;
      state = { ...state, [section]: cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur, ...next } : next };
      emit();
      persist();
    },
    reset(...args) {
      touched = true;
      state = makeEmpty(...args);
      emit();
      persist();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  store.useDraft = function useDraft() {
    const [snap, setSnap] = useState(state);
    const [ready, setReady] = useState(loaded);
    useEffect(() => {
      const off = store.subscribe(setSnap);
      load().then((s) => { setSnap(s); setReady(true); });
      return off;
    }, []);
    return { draft: snap, ready, patch: store.patch, set: store.set, reset: store.reset };
  };
  return store;
}

// ── Single listing draft ────────────────────────────────────────────────────

export const LISTING_TYPES = {
  DEVICE: 'DEVICE',
  SPARE_PART: 'SPARE_PART',
  ACCESSORY: 'ACCESSORY',
};

export function emptyListingDraft(listingType = LISTING_TYPES.DEVICE) {
  return {
    listingType,
    editingId: null,        // set when editing an existing listing
    editingStatus: null,
    clientRef: newClientRef(), // idempotency key for the create call
    createdId: null,        // set once the server accepted this draft
    product: {
      categoryId: null, categoryCode: null, categoryName: null,
      brandId: null, brandName: null,
      seriesId: null, seriesName: null,
      modelId: null, modelName: null, modelNumber: null, modelImageUrl: null,
      color: null,
      ramOptionId: null, ramLabel: null,
      storageOptionId: null, storageLabel: null,
      imei: '',
      itemCondition: null,  // NEW | USED | REFURBISHED
      // Spare part / accessory
      partName: '',
      partType: null,
      partQuality: null,    // ORIGINAL | OEM | COMPATIBLE
      compatibleModels: '',
      accessoryType: null,
      accessoryName: '',
    },
    condition: {
      working: null,        // WORKING | DEAD | UNVERIFIED
      descriptionMode: 'DETAILED',
      description: '',
      issues: [],           // functional defects
      missingParts: '',
      accessories: [],      // included items
      accessoriesOther: '',
      warrantyType: 'NONE', // NONE | MANUFACTURER | SHOP
      warrantyValidTill: '',
      screeningAnswers: [], // [{ questionId, answer, question }] (old Quick device check)
      conditions: [],       // [{ groupCode, groupName, optionId, optionLabel }] (old Physical condition)
    },
    media: {
      photos: [],           // [{ key, uri, url, status: uploading|done|error, error }]
      coverKey: null,
      video: null,          // { uri, url, status, error, duration }
    },
    pricing: {
      price: '',
      negotiable: false,
      quantity: 1,
      fulfilment: [],       // server PICKUP / SHIPPING, derived from fulfilmentKeys
      buyerType: null,      // CUSTOMER | SHOP — chosen first, nothing preselected
      fulfilmentKeys: [],   // HOME | VISIT (customer) · SHOP | COURIER (shop)
      deliveryRadiusKm: '', // required with HOME
      publishMode: 'PUBLISH', // PUBLISH | DRAFT
    },
  };
}

export const sellDraftStore = createDraftStore('ggfix.sell.draft.v1', emptyListingDraft);
export const useSellDraft = sellDraftStore.useDraft;

/** A new (not yet saved) listing with something entered — worth asking before discarding. */
export function hasUnsavedProgress(d) {
  const p = d.product;
  return !d.editingId && !!(p.categoryId || p.modelId || p.partName || p.accessoryName || p.accessoryType || d.media.photos.length || d.condition.description);
}

export function minPhotos(listingType) {
  return listingType === LISTING_TYPES.DEVICE ? MIN_DEVICE_PHOTOS : 1;
}
export { MAX_PHOTOS };

export function draftTitle(d) {
  const p = d.product;
  if (d.listingType === LISTING_TYPES.SPARE_PART) {
    return [p.partName || p.partType, p.modelName || p.compatibleModels].filter(Boolean).join(' – ') || 'Spare part';
  }
  if (d.listingType === LISTING_TYPES.ACCESSORY) {
    return p.accessoryName || [p.brandName, p.accessoryType].filter(Boolean).join(' ') || 'Accessory';
  }
  const spec = [p.ramLabel, p.storageLabel].filter(Boolean).join(' / ');
  return `${p.modelName || 'Device'}${spec ? ` (${spec})` : ''}`;
}

/** Ordered upload URLs, cover first. */
export function orderedPhotoUrls(media) {
  const done = (media.photos || []).filter((ph) => ph.status === 'done' && ph.url);
  const cover = done.find((ph) => ph.key === media.coverKey) || done[0];
  return cover ? [cover.url, ...done.filter((ph) => ph !== cover).map((ph) => ph.url)] : [];
}

const WORKING_LABEL = { WORKING: 'Working', DEAD: 'Dead / Not working', UNVERIFIED: 'Unverified' };
const ITEM_LABEL = { NEW: 'New', USED: 'Used', REFURBISHED: 'Refurbished' };

/** Fields for createListing / updateListing (api/sellListings). */
export function draftToFields(d) {
  const p = d.product;
  const c = d.condition;
  const pr = d.pricing;
  const conditionLabel = [ITEM_LABEL[p.itemCondition], WORKING_LABEL[c.working]].filter(Boolean).join(' · ') || null;
  const lines = [c.description.trim()];
  if (c.issues.length) lines.push(`Defects: ${c.issues.join(', ')}`);
  if (c.missingParts.trim()) lines.push(`Missing / damaged parts: ${c.missingParts.trim()}`);
  return {
    clientRef: d.clientRef,
    listingType: d.listingType,
    itemCondition: p.itemCondition,
    title: draftTitle(d),
    description: lines.filter(Boolean).join('\n'),
    price: Number(pr.price) || null,
    negotiable: pr.negotiable,
    quantity: Number(pr.quantity) || 1,
    fulfilmentOptions: pr.fulfilment,
    status: pr.publishMode === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
    brandId: p.brandId,
    modelId: p.modelId,
    ramOptionId: p.ramOptionId,
    storageOptionId: p.storageOptionId,
    color: p.color,
    ramLabel: p.ramLabel,
    storageLabel: p.storageLabel,
    imei: p.imei?.trim() || null,
    conditionLabel,
    workingCondition: c.working,
    descriptionType: d.listingType === LISTING_TYPES.SPARE_PART ? 'SPARE_PARTS' : c.descriptionMode,
    images: orderedPhotoUrls(d.media),
    videoUrl: d.media.video?.status === 'done' ? d.media.video.url : null,
    assessment: {
      listing: {
        category: { id: p.categoryId, code: p.categoryCode, name: p.categoryName },
        brandName: p.brandName,
        seriesId: p.seriesId,
        seriesName: p.seriesName,
        modelName: p.modelName,
        modelNumber: p.modelNumber,
        partName: p.partName || null,
        partType: p.partType,
        partQuality: p.partQuality,
        compatibleModels: p.compatibleModels || null,
        accessoryType: p.accessoryType,
        accessoryName: p.accessoryName || null,
      },
      issues: c.issues,
      screeningAnswers: c.screeningAnswers || [],
      conditions: c.conditions || [],
      missingParts: c.missingParts || null,
      accessories: [...c.accessories, ...(c.accessoriesOther.trim() ? [c.accessoriesOther.trim()] : [])],
      warranty: c.warrantyType,
      warrantyValidTill: c.warrantyValidTill || null,
      descriptionMode: c.descriptionMode,
      // Buyer type + exact options + radius: the server stores only PICKUP / SHIPPING.
      sellFulfilment: { buyerType: pr.buyerType || null, options: pr.fulfilmentKeys || [], deliveryRadiusKm: Number(pr.deliveryRadiusKm) || null },
    },
  };
}

/** Draft rebuilt from a stored listing (Edit). Photos come back as uploaded. */
export function draftFromProduct(prod) {
  const a = prod._assessment || {};
  const l = a.listing || {};
  const base = emptyListingDraft(prod.listingType || LISTING_TYPES.DEVICE);
  const photos = (prod.images || []).map((url, i) => ({ key: `srv-${i}`, uri: url, url, status: 'done' }));
  const known = new Set(['Original Box', 'Charging Cable', 'Adapter', 'Earphones', 'Bill / Invoice']);
  const acc = Array.isArray(a.accessories) ? a.accessories : [];
  return {
    ...base,
    editingId: prod.id,
    editingStatus: prod._status,
    clientRef: prod.clientRef || base.clientRef,
    createdId: prod.id,
    product: {
      ...base.product,
      categoryId: l.category?.id || null,
      categoryCode: l.category?.code || null,
      categoryName: l.category?.name || null,
      brandId: prod.brandId || null,
      brandName: l.brandName || null,
      seriesId: l.seriesId || null,
      seriesName: l.seriesName || null,
      modelId: prod.modelId || null,
      modelName: l.modelName || (prod.listingType === LISTING_TYPES.DEVICE ? prod.title : null),
      modelNumber: l.modelNumber || null,
      color: prod.color || null,
      ramOptionId: prod.ramOptionId || null,
      ramLabel: prod.ramLabel || null,
      storageOptionId: prod.storageOptionId || null,
      storageLabel: prod.storageLabel || null,
      imei: prod.imei || '',
      itemCondition: prod.itemCondition || null,
      partName: l.partName || '',
      partType: l.partType || null,
      partQuality: l.partQuality || null,
      compatibleModels: l.compatibleModels || '',
      accessoryType: l.accessoryType || null,
      accessoryName: l.accessoryName || '',
    },
    condition: {
      ...base.condition,
      working: prod.workingCondition || null,
      descriptionMode: a.descriptionMode || (prod.descriptionType === 'SHORT' ? 'SHORT' : 'DETAILED'),
      description: String(prod.description || '').split('\nDefects:')[0].split('\nMissing / damaged parts:')[0],
      issues: Array.isArray(a.issues) ? a.issues.filter((x) => typeof x === 'string') : [],
      missingParts: a.missingParts || '',
      accessories: acc.filter((x) => known.has(x)),
      accessoriesOther: acc.filter((x) => typeof x === 'string' && !known.has(x)).join(', '),
      warrantyType: a.warranty && ['NONE', 'MANUFACTURER', 'SHOP'].includes(a.warranty) ? a.warranty : 'NONE',
      warrantyValidTill: a.warrantyValidTill || '',
      screeningAnswers: Array.isArray(a.screeningAnswers) ? a.screeningAnswers : [],
      conditions: Array.isArray(a.conditions) ? a.conditions : [],
    },
    media: { photos, coverKey: photos[0]?.key || null, video: prod.videoUrl ? { uri: prod.videoUrl, url: prod.videoUrl, status: 'done' } : null },
    pricing: {
      price: prod.price != null ? String(prod.price) : '',
      negotiable: !!prod.negotiable,
      quantity: prod.quantity || 1,
      fulfilment: Array.isArray(prod.fulfilmentOptions) && prod.fulfilmentOptions.length ? prod.fulfilmentOptions : ['PICKUP'],
      buyerType: a.sellFulfilment?.buyerType || null,
      fulfilmentKeys: Array.isArray(a.sellFulfilment?.options) ? a.sellFulfilment.options : [],
      deliveryRadiusKm: a.sellFulfilment?.deliveryRadiusKm ? String(a.sellFulfilment.deliveryRadiusKm) : '',
      publishMode: prod._status === 'DRAFT' ? 'DRAFT' : 'PUBLISH',
    },
  };
}
