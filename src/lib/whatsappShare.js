// Share a booking receipt to WhatsApp — and ONLY WhatsApp.
//
// Used by the Booking Thank You screen and the Bookings / Ticket Detail
// "Share image" sheet, so both behave identically. It never opens the system
// share sheet or any other app.
//
// 1. Receipt image: react-native-share's shareSingle fires ACTION_SEND at
//    package com.whatsapp (then com.whatsapp.w4b), so WhatsApp opens with the
//    image attached. NO whatsAppNumber, deliberately: that retargets
//    com.whatsapp.Conversation with a `jid` extra, which opens the right chat
//    but ignores EXTRA_STREAM — the image is dropped and only text arrives.
// 2. Text fallback (a binary without react-native-share, or the capture
//    failed): `whatsapp://send` with the customer's number and the receipt
//    text — still WhatsApp only.
// If neither WhatsApp nor WhatsApp Business is installed, it says so.
//
// Android 11+ package visibility for both WhatsApp packages comes from
// plugins/withAndroidQueries.js.
import { Linking, NativeModules, TurboModuleRegistry } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { notify } from '../components/confirm';

function notInstalled() {
  notify('WhatsApp not found', 'Install WhatsApp or WhatsApp Business to share this receipt.');
}

/**
 * Load react-native-share only if this binary actually has the native module.
 *
 * Wrapping `require` in try/catch is NOT enough: the library's spec calls
 * TurboModuleRegistry.getEnforcing('RNShare') at module scope, and Metro hands
 * a module-init throw to ErrorUtils.reportFatalError — a dev red screen, a
 * production crash — instead of the caller's catch. So the module must never
 * be evaluated on a binary that can't support it. `get` is the non-throwing
 * sibling of `getEnforcing`; NativeModules covers the old architecture.
 */
function shareSingleModule() {
  let native = null;
  try { native = TurboModuleRegistry?.get?.('RNShare') || null; } catch (_) { native = null; }
  if (!native && !NativeModules?.RNShare) return null;
  try {
    // eslint-disable-next-line global-require
    const mod = require('react-native-share');
    return mod?.default || mod || null;
  } catch (_) {
    return null;
  }
}

// The receipt can still be laying out on the very first open of a sheet —
// retry briefly before giving up on the image.
async function captureBase64(viewRef) {
  for (const wait of [0, 150, 400]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await captureRef(viewRef, { format: 'png', quality: 1, result: 'base64' });
    } catch (_) { /* not laid out yet — retry */ }
  }
  return null;
}

/**
 * @param viewRef   ref to the <ViewShot> holding the receipt
 * @param message   receipt as text (sent with the image, and the fallback)
 * @param phone     customer mobile — used to open their chat in the fallback
 * @param filename  image file name, without extension
 */
export async function shareReceiptToWhatsApp({ viewRef, message, phone, filename = 'ggfix-receipt' }) {
  const base64 = await captureBase64(viewRef);

  const RNShare = shareSingleModule();
  if (base64 && RNShare?.shareSingle && RNShare?.Social?.WHATSAPP) {
    const payload = {
      message: message || '',
      url: `data:image/png;base64,${base64}`,
      filename,
      type: 'image/png',
      // Load-bearing. With this false (the default) the library decodes to
      // getExternalCacheDir(), but its own FileProvider only declares
      // <external-path> and <cache-path> — the external CACHE matches neither,
      // so getUriForFile throws "Failed to find configured root".
      useInternalStorage: true,
    };
    // Plenty of shops run only WhatsApp Business, so "not installed" on the
    // consumer app should try the other before giving up.
    const targets = [RNShare.Social.WHATSAPP, RNShare.Social.WHATSAPPBUSINESS].filter(Boolean);
    let missing = 0;
    for (const social of targets) {
      try {
        await RNShare.shareSingle({ ...payload, social });
        return;
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (msg.includes('cancel')) return;          // a decision, not a failure
        if (msg.includes('not installed') || msg.includes('no app')) { missing += 1; continue; }
        break;
      }
    }
    if (missing === targets.length) {
      notInstalled();
      return;
    }
  }

  // Text fallback — straight into the customer's WhatsApp chat.
  const digits = String(phone || '').replace(/\D/g, '');
  const waNumber = digits.length === 10 ? `91${digits}` : digits;
  const url = `whatsapp://send?${waNumber ? `phone=${waNumber}&` : ''}text=${encodeURIComponent(message || '')}`;
  try {
    await Linking.openURL(url);
  } catch (_) {
    notInstalled();
  }
}
