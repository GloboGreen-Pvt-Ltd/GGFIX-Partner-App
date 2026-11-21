import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Sharing from 'expo-sharing';
// SDK 54 moved the classic file API behind `/legacy`; the same names imported
// from the package root are deprecated shims that THROW at runtime.
import {
  EncodingType,
  cacheDirectory,
  copyAsync,
  deleteAsync,
  documentDirectory,
  getContentUriAsync,
  getInfoAsync,
  readAsStringAsync,
  StorageAccessFramework,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import {
  isAvailable as mediaStoreAvailable,
  saveToDownloads as mediaStoreSave,
} from '../../modules/ggfix-downloads';
import { shareSingleModule } from './whatsappShare';

/* expo-notifications and expo-intent-launcher are NATIVE modules, and this app
   ships a committed android/ folder — so an APK built before they were added
   does not contain them. A static `import` of expo-notifications reaches for its
   native module while the module graph is still loading, which throws before any
   screen renders and takes the whole app down with a blank screen, not a toast.
   The same defence `components/confirm.js` uses for `burnt`: require it
   defensively, and let every feature that depends on it degrade to nothing.
   Saving the file does NOT depend on either — only the shade receipt does.

   EXPO GO gets skipped outright. Importing expo-notifications there runs its
   push-token auto-registration side effect, which since SDK 53 answers with a
   console.error about remote push having been removed from Expo Go — a red
   LogBox screen on every launch, for a feature this module never asked for.
   Local notifications would work in Expo Go, but not at that price: test the
   shade receipt in a dev build or the APK, where it works properly anyway. */
const inExpoGo = (() => {
  try { return isRunningInExpoGo(); } catch (_) { return false; }
})();

let Notifications = null;
if (!inExpoGo) {
  try { Notifications = require('expo-notifications'); } catch (_) { Notifications = null; }
}
let IntentLauncher = null;
try { IntentLauncher = require('expo-intent-launcher'); } catch (_) { IntentLauncher = null; }

/* ══════════════════════════════════════════════════════════════════════════
   Saving a generated file where the phone keeps its downloads.
   ──────────────────────────────────────────────────────────────────────────
   Sharing.shareAsync() hands a file to another app; it does not put a copy on
   the phone. "Download" has to mean the file is in Files → Download afterwards.

   ANDROID: through MediaStore.Downloads, the API built for this. It needs no
   runtime permission on Android 10+, writes into the real public Download
   folder, and de-duplicates names itself.

   It replaced the Storage Access Framework, which was the wrong tool twice
   over: Android 11+ refuses a SAF grant on the Download folder itself (the
   picker greys out USE THIS FOLDER), so the flow had to talk the owner into
   creating a subfolder — a folder prompt, on every fresh install, to reach the
   one directory the platform will hand over for free.

   There is deliberately NO picker fallback. If MediaStore refuses, that is a
   real failure and the caller reports it; sending the owner to a folder picker
   would just reintroduce the thing that was broken.

   iOS: there is no shared Downloads folder. The app's own Documents directory
   is the closest equivalent and is what the Files app lists under the app name.
   ══════════════════════════════════════════════════════════════════════════ */

/** Its own channel so a download receipt can be silenced without muting the app. */
const CHANNEL_ID = 'downloads';

/** Intent.FLAG_GRANT_READ_URI_PERMISSION — lets the viewer app read our URI. */
const FLAG_GRANT_READ = 1;

/**
 * Write a file into the phone's Downloads folder.
 *
 * Pass EITHER `text` (written as UTF-8) or `sourceUri` (a local file), plus the
 * name to give it.
 *
 * @returns `{ name, uri, mimeType, location }`. Throws on a real write failure —
 *          there is nothing for the caller to recover from and no picker to
 *          fall back to.
 */
export async function saveToDownloads({ stem, extension, mimeType, sourceUri, text }) {
  const name = `${stem}.${extension}`;

  if (Platform.OS !== 'android') {
    const uri = `${documentDirectory}${name}`;
    if (text != null) await writeAsStringAsync(uri, text, { encoding: EncodingType.UTF8 });
    else await copyAsync({ from: sourceUri, to: uri });
    return { name, uri, mimeType, location: 'Files' };
  }

  // MediaStore copies from a real file, so text content is staged in the cache
  // directory first. The staged copy is disposable — the download itself is the
  // row MediaStore creates.
  let from = sourceUri;
  if (text != null) {
    from = `${cacheDirectory}${name}`;
    await writeAsStringAsync(from, text, { encoding: EncodingType.UTF8 });
  }

  // Expo Go / a dev build made before modules/ggfix-downloads existed has no
  // MediaStore bridge: save through the Storage Access Framework (the user
  // picks a folder once per save). Cancelling the picker throws 'cancelled'.
  if (!mediaStoreAvailable()) {
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm?.granted) throw new Error('Save cancelled');
    const dest = await StorageAccessFramework.createFileAsync(perm.directoryUri, stem, mimeType);
    const data = await readAsStringAsync(from, { encoding: EncodingType.Base64 });
    await StorageAccessFramework.writeAsStringAsync(dest, data, { encoding: EncodingType.Base64 });
    return { name, uri: dest, mimeType, location: 'the selected folder' };
  }

  // MediaStore returns the name it settled on: an existing GGFix_Invoice_X.pdf
  // makes the next one "GGFix_Invoice_X (1).pdf" rather than being overwritten.
  const saved = await mediaStoreSave(from, name, mimeType);
  return { name: saved?.name || name, uri: saved?.uri || null, mimeType, location: 'Downloads' };
}

/**
 * Write a PDF from expo-print into this app's own cache and verify it.
 *
 * Why: expo-print writes to the React context's cache (`.../cache/Print/`). In
 * Expo Go that folder belongs to Expo Go itself, outside the app's scoped
 * directories (ExperienceData/...), so expo-file-system can't copy it and
 * expo-sharing refuses it ("Not allowed to read file under given URL").
 * Writing the base64 bytes into `cacheDirectory` (always the app's scoped
 * cache) gives a file both modules may read, in Expo Go and in real builds.
 *
 * @param printed result of Print.printToFileAsync({ html, base64: true })
 * @returns file:// uri of the verified PDF
 */
export async function stagePrintedPdf(printed, name) {
  const dest = `${cacheDirectory}${encodeURIComponent(name)}`;
  await deleteAsync(dest, { idempotent: true });
  if (printed?.base64) await writeAsStringAsync(dest, printed.base64, { encoding: EncodingType.Base64 });
  else await copyAsync({ from: printed?.uri, to: dest });
  const info = await getInfoAsync(dest);
  if (__DEV__) console.log('[pdf] staged', { printed: printed?.uri, dest, exists: info?.exists, size: info?.size });
  if (!info?.exists || !info.size) throw new Error('The PDF file was not created.');
  return dest;
}

/**
 * Share a local file under a friendly name. The renamed copy goes into the
 * app's cache (`cacheDirectory`), which expo-sharing may always read. Pass a
 * file from stagePrintedPdf (already there) when the source came from expo-print.
 */
/** True when this binary can send a file AND a caption in one share
 *  (react-native-share: dev build / APK). Expo Go cannot: expo-sharing has no
 *  text option. */
export const canShareWithCaption = () => !!shareSingleModule()?.open;

export async function shareLocalFile(sourceUri, name, mimeType, message) {
  if (!sourceUri || !sourceUri.startsWith('file://')) throw new Error('Invalid local file URI.');
  let uri = sourceUri;
  const dest = `${cacheDirectory}${encodeURIComponent(name)}`;
  if (cacheDirectory && sourceUri !== dest) {
    await deleteAsync(dest, { idempotent: true });
    await copyAsync({ from: sourceUri, to: dest });
    uri = dest;
  }
  const info = await getInfoAsync(uri);
  const available = await Sharing.isAvailableAsync().catch(() => false);
  if (__DEV__) console.log('[share]', { uri, exists: info?.exists, size: info?.size, mimeType, available });
  if (!info?.exists || !info.size) throw new Error('The file to share was not found.');

  // File + caption in ONE share: ACTION_SEND with EXTRA_STREAM (the PDF, read
  // permission granted through react-native-share's FileProvider, which covers
  // the app cache) and EXTRA_TEXT (WhatsApp shows it as the file's caption).
  const RNShare = message ? shareSingleModule() : null;
  if (RNShare?.open) {
    const opened = RNShare.open({
      url: uri, type: mimeType, filename: name.replace(/\.[^.]+$/, ''), title: name,
      message, useInternalStorage: true, failOnCancel: false,
    });
    await Promise.race([opened, new Promise((r) => setTimeout(r, 3000))]);
    return { captioned: true };
  }

  const opts = { mimeType, dialogTitle: name, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined };
  try {
    // Settles only when Android reports the sheet's result, which Expo Go
    // sometimes never delivers: once the sheet has had time to open, stop
    // waiting so the button doesn't spin forever. Errors still arrive first.
    await Promise.race([Sharing.shareAsync(uri, opts), new Promise((r) => setTimeout(r, 3000))]);
  } catch (e) {
    if (__DEV__) console.log('[share] failed', uri, e?.cause?.message || e?.message);
    throw shareError(e);
  }
}

/** Surface the native reason ("Not allowed to read…", "Another share request…")
 *  instead of the generic "Call to function … has been rejected". */
function shareError(e) {
  const reason = e?.cause?.message || e?.message || 'Share failed';
  if (/another share request/i.test(reason)) {
    return Object.assign(new Error('The previous share is still open. Close it, or reload the app, then try again.'), { cause: e });
  }
  return Object.assign(new Error(reason.replace(/^Call to function '[^']+' has been rejected\.?\s*(→\s*Caused by:\s*)?/i, '') || reason), { cause: e });
}

/* ── the shade ─────────────────────────────────────────────────────────── */

async function ensureChannel() {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Downloads',
    description: 'Statements and reports saved to this phone.',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 80],
    showBadge: false,
  });
}

/**
 * Post the "download complete" notification.
 *
 * Best-effort by design: the file is already on disk by the time this runs, so
 * a denied notification permission — or a build that predates the native module
 * — must not read as a failed download. The permission is asked for HERE, at the
 * first download, rather than at launch: a prompt on the splash screen has no
 * context to justify itself.
 */
export async function notifyDownloaded({ name, uri, mimeType, location, shared }) {
  if (!Notifications || shared) return false;
  try {
    // iOS provisional authorisation reports granted:false but still delivers
    // quietly to the list — which is all a download receipt needs.
    const allowed = (p) => p?.granted
      || p?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed(await Notifications.getPermissionsAsync())
      && !allowed(await Notifications.requestPermissionsAsync())) return false;
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Download complete',
        body: `${name} saved to ${location}`,
        data: { uri, mimeType },
      },
      // `{ channelId }` alone means "deliver now, on this channel". A bare null
      // trigger also delivers now but lands on the app's default channel.
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Open a local file in a viewer app (Android). Throws when none can open it. */
export async function viewLocalFile(uri, mimeType) {
  if (Platform.OS !== 'android' || !IntentLauncher) throw new Error('No in-app viewer on this platform.');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri.startsWith('content://') ? uri : await getContentUriAsync(uri),
    flags: FLAG_GRANT_READ,
    type: mimeType,
  });
}

/** Open a saved file in whatever app handles its type. */
async function openDownload(data) {
  const uri = data?.uri;
  if (!uri) return;
  try {
    if (Platform.OS === 'android' && IntentLauncher) {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        // A SAF file is already a content:// URI; a Documents-directory file is
        // file:// and has to be exposed through the FileProvider first.
        data: uri.startsWith('content://') ? uri : await getContentUriAsync(uri),
        flags: FLAG_GRANT_READ,
        type: data.mimeType || '*/*',
      });
    } else if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: data.mimeType });
    }
  } catch (_) {
    // No app installed that can open a PDF/CSV. The file is still saved, and
    // the shade entry already said where — nothing useful to report here.
  }
}

/** Cold-start taps are replayed on every read; open each one at most once. */
const opened = new Set();

/**
 * Wire up download notifications for the whole app. Call once, from the root.
 *
 * Without a notification handler Android suppresses the banner while the app is
 * in the foreground — which is precisely when a download finishes, so the one
 * notification this app posts would be the one never seen.
 *
 * Runs at app start, so nothing in here may throw: on a build without the native
 * module this quietly does nothing and downloads still save.
 *
 * @returns a cleanup function suitable for `useEffect`.
 */
export function attachDownloadNotifications() {
  if (!Notifications) return undefined;
  try {
    // The app's ONLY handler, so it covers the shop's pushes too
    // (lib/pushNotifications): those play their sound; a download receipt —
    // recognised by the saved file's uri — stays silent.
    Notifications.setNotificationHandler({
      handleNotification: async (n) => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: !n?.request?.content?.data?.uri,
        shouldSetBadge: false,
      }),
    });

    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      openDownload(res?.notification?.request?.content?.data);
    });

    // A tap that launched the app from cold is never delivered to the listener —
    // the process did not exist when it happened.
    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        const id = res?.notification?.request?.identifier;
        if (!id || opened.has(id)) return;
        opened.add(id);
        openDownload(res.notification.request.content.data);
      })
      .catch(() => {});

    return () => sub.remove();
  } catch (_) {
    return undefined;
  }
}
