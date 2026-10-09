import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Sharing from 'expo-sharing';
// SDK 54 moved the classic file API behind `/legacy`; the same names imported
// from the package root are deprecated shims that THROW at runtime.
import {
  EncodingType,
  cacheDirectory,
  copyAsync,
  documentDirectory,
  getContentUriAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import {
  isAvailable as mediaStoreAvailable,
  saveToDownloads as mediaStoreSave,
} from '../../modules/ggfix-downloads';

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

  if (!mediaStoreAvailable()) {
    throw new Error(
      'This build cannot save to Downloads. Rebuild the app so the Downloads module is included.',
    );
  }

  // MediaStore copies from a real file, so text content is staged in the cache
  // directory first. The staged copy is disposable — the download itself is the
  // row MediaStore creates.
  let from = sourceUri;
  if (text != null) {
    from = `${cacheDirectory}${name}`;
    await writeAsStringAsync(from, text, { encoding: EncodingType.UTF8 });
  }

  // MediaStore returns the name it settled on: an existing GGFix_Invoice_X.pdf
  // makes the next one "GGFix_Invoice_X (1).pdf" rather than being overwritten.
  const saved = await mediaStoreSave(from, name, mimeType);
  return { name: saved?.name || name, uri: saved?.uri || null, mimeType, location: 'Downloads' };
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
export async function notifyDownloaded({ name, uri, mimeType, location }) {
  if (!Notifications) return false;
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
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
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
