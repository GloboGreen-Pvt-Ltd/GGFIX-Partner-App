import * as ImagePicker from 'expo-image-picker';
import { launchCamera } from '../../../../components/InAppCamera';
import { uploadMedia } from '../../../../api/masterData';
import { notify } from '../../../../components/confirm';
import { safeErrorText } from '../../../../lib/safeError';
import { bulkDraftStore, newKey } from './bulkDraft';

// Photo / video uploads for the bulk draft. Uploads run here, outside any
// screen, so leaving the Photos screen never strands one; every status change
// is written straight into the persisted draft.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
// The media upload endpoint caps every file at 10 MB, so keep clips short.
export const MAX_VIDEO_SECONDS = 30;
const PARALLEL = 3;

const inflight = new Set();
const queue = [];
let active = 0;

export const COMMON = 'common';
export const VIDEO = 'video';

function patchMedia(target, key, values) {
  bulkDraftStore.set((s) => {
    if (target === VIDEO) {
      if (!s.media.video || s.media.video.key !== key) return s;
      return { ...s, media: { ...s.media, video: { ...s.media.video, ...values } } };
    }
    if (target === COMMON) {
      return { ...s, media: { ...s.media, common: s.media.common.map((p) => (p.key === key ? { ...p, ...values } : p)) } };
    }
    return {
      ...s,
      rows: s.rows.map((r) => (r.key !== target ? r : { ...r, photos: (r.photos || []).map((p) => (p.key === key ? { ...p, ...values } : p)) })),
    };
  });
}

async function runUpload(target, item) {
  inflight.add(item.key);
  try {
    if (!item.asset?.uri) throw new Error('The original file is no longer available. Remove it and add it again.');
    const url = await uploadMedia(item.asset, 'sell');
    if (!url) throw new Error('Upload failed. Tap to retry.');
    // Once hosted, the local file (and any web data URI) is dropped from the draft.
    patchMedia(target, item.key, { status: 'done', url, uri: url, asset: null, error: null });
  } catch (e) {
    patchMedia(target, item.key, { status: 'error', error: safeErrorText(e, 'Upload failed. Tap to retry.') });
  } finally {
    inflight.delete(item.key);
  }
}

function pump() {
  while (active < PARALLEL && queue.length) {
    const [target, item] = queue.shift();
    active += 1;
    runUpload(target, item).finally(() => { active -= 1; pump(); });
  }
}

function enqueue(target, item) {
  if (inflight.has(item.key) || queue.some(([, q]) => q.key === item.key)) return;
  queue.push([target, item]);
  pump();
}

const isBusy = (key) => inflight.has(key) || queue.some(([, q]) => q.key === key);

function toPhoto(asset) {
  const tooBig = asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES;
  return {
    key: newKey('p'),
    uri: asset.uri,
    url: null,
    status: tooBig ? 'error' : 'uploading',
    error: tooBig ? 'Larger than 10 MB — choose a smaller photo' : null,
    asset: tooBig ? null : { uri: asset.uri, fileName: asset.fileName || null, mimeType: asset.mimeType || null },
  };
}

/** Add picked assets to the common gallery (target 'common') or a row (row key) and upload them. */
export function addPhotos(target, assets) {
  const photos = assets.map(toPhoto);
  bulkDraftStore.set((s) => {
    if (target === COMMON) return { ...s, media: { ...s.media, common: [...s.media.common, ...photos] } };
    return { ...s, rows: s.rows.map((r) => (r.key === target ? { ...r, photos: [...(r.photos || []), ...photos] } : r)) };
  });
  photos.filter((p) => p.status === 'uploading').forEach((p) => enqueue(target, p));
}

export function retryPhoto(target, photo) {
  if (isBusy(photo.key)) return;
  if (!photo.asset?.uri) {
    notify('Add this photo again', 'The original file is no longer available. Remove it and pick it again.');
    return;
  }
  patchMedia(target, photo.key, { status: 'uploading', error: null });
  enqueue(target, { ...photo, status: 'uploading' });
}

export function removePhoto(target, key) {
  bulkDraftStore.set((s) => {
    if (target === COMMON) {
      return {
        ...s,
        media: { ...s.media, common: s.media.common.filter((p) => p.key !== key), commonCoverKey: s.media.commonCoverKey === key ? null : s.media.commonCoverKey },
      };
    }
    return {
      ...s,
      rows: s.rows.map((r) => (r.key !== target ? r : { ...r, photos: (r.photos || []).filter((p) => p.key !== key), coverKey: r.coverKey === key ? null : r.coverKey })),
    };
  });
}

export function setCover(target, key) {
  bulkDraftStore.set((s) => {
    if (target === COMMON) return { ...s, media: { ...s.media, commonCoverKey: key } };
    return { ...s, rows: s.rows.map((r) => (r.key === target ? { ...r, coverKey: key } : r)) };
  });
}

/**
 * Anything still marked uploading that no upload is running for (the app was
 * closed mid-upload) becomes a retryable error.
 */
export function reviveStaleUploads() {
  const s = bulkDraftStore.get();
  const stale = (p) => p && p.status === 'uploading' && !isBusy(p.key);
  const any = s.media.common.some(stale) || s.rows.some((r) => (r.photos || []).some(stale)) || stale(s.media.video);
  if (!any) return;
  const fix = (p) => (stale(p) ? { ...p, status: 'error', error: 'Upload interrupted. Tap to retry.' } : p);
  bulkDraftStore.set((d) => ({
    ...d,
    media: { ...d.media, common: d.media.common.map(fix), video: d.media.video ? fix(d.media.video) : null },
    rows: d.rows.map((r) => ({ ...r, photos: (r.photos || []).map(fix) })),
  }));
}

// ── Pickers ─────────────────────────────────────────────────────────────────

async function ensurePermission(source) {
  const res = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (res.status !== 'granted') {
    notify('Permission needed', source === 'camera' ? 'Allow camera access to take photos.' : 'Allow photo library access to add photos.');
    return false;
  }
  return true;
}

/** Pick up to `limit` photos from the camera or gallery. Resolves [] when cancelled. */
export async function pickPhotos(source, limit) {
  if (limit <= 0) {
    notify('Photo limit reached', 'Each item can have up to 10 photos, including the common gallery.');
    return [];
  }
  if (!(await ensurePermission(source))) return [];
  try {
    const result = source === 'camera'
      ? await launchCamera({ mediaTypes: 'images', quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', quality: 0.7, allowsMultipleSelection: limit > 1, selectionLimit: limit, orderedSelection: true,
      });
    if (result.canceled || !result.assets?.length) return [];
    if (result.assets.length > limit) {
      notify('Some photos were left out', `Only ${limit} more photo${limit > 1 ? 's' : ''} fit (max 10 per item).`);
    }
    return result.assets.slice(0, limit);
  } catch (e) {
    notify('Could not open the photos', safeErrorText(e, 'Please try again.'));
    return [];
  }
}

/** Pick (or record) the batch video and upload it. */
export async function pickVideo(source) {
  if (!(await ensurePermission(source))) return;
  let asset;
  try {
    const opts = { mediaTypes: 'videos', videoMaxDuration: MAX_VIDEO_SECONDS, quality: 0.5 };
    const result = source === 'camera' ? await launchCamera(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets?.[0]) return;
    asset = result.assets[0];
  } catch (e) {
    notify('Could not open the videos', safeErrorText(e, 'Please try again.'));
    return;
  }
  const seconds = asset.duration ? asset.duration / 1000 : null;
  if (seconds && seconds > MAX_VIDEO_SECONDS + 1) {
    notify('Video is too long', `Choose a video of ${MAX_VIDEO_SECONDS} seconds or less.`);
    return;
  }
  if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
    notify('Video is too large', 'Videos must be under 10 MB. Record a shorter clip.');
    return;
  }
  const video = {
    key: newKey('v'),
    uri: asset.uri,
    url: null,
    status: 'uploading',
    error: null,
    duration: seconds,
    asset: { uri: asset.uri, fileName: asset.fileName || null, mimeType: asset.mimeType || null },
  };
  bulkDraftStore.set((s) => ({ ...s, media: { ...s.media, video } }));
  enqueue(VIDEO, video);
}

export function retryVideo() {
  const v = bulkDraftStore.get().media.video;
  if (!v || isBusy(v.key)) return;
  if (!v.asset?.uri) {
    notify('Add the video again', 'The original file is no longer available. Remove it and pick it again.');
    return;
  }
  patchMedia(VIDEO, v.key, { status: 'uploading', error: null });
  enqueue(VIDEO, { ...v, status: 'uploading' });
}

export function removeVideo() {
  bulkDraftStore.set((s) => ({ ...s, media: { ...s.media, video: null } }));
}
