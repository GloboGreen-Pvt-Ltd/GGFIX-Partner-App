import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderApi } from '../api/client';
import { getToken } from '../auth/session';

/* ══════════════════════════════════════════════════════════════════════════
   Remote push for the shop.
   ──────────────────────────────────────────────────────────────────────────
   After sign-in this device's push token (native FCM on Android, Expo on iOS) is registered with order-service
   (POST /shop/push-tokens, shop taken from the JWT); sign-out removes it again.
   Pushes arrive on the 'default' channel with a `data.kind`, and a tap opens
   the screen that kind names (routeFor below).

   expo-notifications is required defensively and skipped in Expo Go — same
   reasoning as lib/downloads.js (remote push was removed from Expo Go in SDK
   53, and an APK built before the module has no native side). Everything here
   is best-effort and never throws: push must not be able to break sign-in.

   The foreground handler (banner + sound for pushes, silent download receipts)
   is the app's single setNotificationHandler, in lib/downloads.js.
   ══════════════════════════════════════════════════════════════════════════ */
const inExpoGo = (() => {
  try { return isRunningInExpoGo(); } catch (_) { return false; }
})();

let Notifications = null;
if (!inExpoGo) {
  try { Notifications = require('expo-notifications'); } catch (_) { Notifications = null; }
}
let Device = null;
try { Device = require('expo-device'); } catch (_) { Device = null; }

/** Same id the server sends as `channelId` and app.config.js sets as `defaultChannel`. */
const CHANNEL_ID = 'default';
/** The token last registered for the signed-in shop — what sign-out removes. */
const TOKEN_KEY = 'push.expoToken';

async function ensureChannel() {
  if (Platform.OS !== 'android' || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Notifications',
      description: 'Bookings, pickups, sell requests, orders and chats.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#035C6C',
    });
  } catch (_) {}
}

let inflight = null;
let tokenSub = null;

async function register() {
  // Simulators/emulators get no push token; web has no Expo push at all.
  if (!Notifications || Platform.OS === 'web' || Device?.isDevice === false) return null;
  try {
    if (!(await getToken())) return null;
    await ensureChannel();
    const allowed = (p) => p?.granted
      || p?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    let perm = await Notifications.getPermissionsAsync();
    if (!allowed(perm) && perm?.canAskAgain !== false) perm = await Notifications.requestPermissionsAsync();
    if (!allowed(perm)) return null;

    // Android: the native FCM token — the server sends it with the Firebase
    // Admin SDK (google-services.json). iOS: an Expo push token, sent via Expo
    // (a raw APNs token is not something FCM can address).
    let token = null;
    if (Platform.OS === 'android') {
      token = (await Notifications.getDevicePushTokenAsync())?.data;
    } else {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return null;
      token = (await Notifications.getExpoPushTokenAsync({ projectId }))?.data;
    }
    if (!token || typeof token !== 'string') return null;

    await orderApi.post('/shop/push-tokens', { body: { token, platform: Platform.OS } });
    try { await AsyncStorage.setItem(TOKEN_KEY, token); } catch (_) {}
    // FCM/APNs can rotate the device token; register the fresh one. A rotation
    // after sign-out is a no-op (no session token above).
    if (!tokenSub) tokenSub = Notifications.addPushTokenListener(() => { registerForPush(); });
    return token;
  } catch (_) {
    return null;
  }
}

/**
 * Register this device for the signed-in shop's pushes. Asks for the
 * notification permission the first time. Resolves to the token or null;
 * never throws, so callers need not await it.
 */
export function registerForPush() {
  if (!inflight) inflight = register().finally(() => { inflight = null; });
  return inflight;
}

/**
 * Stop this device receiving the shop's pushes. Call BEFORE the session is
 * cleared — the request needs the auth header. Bounded and never throws, so
 * sign-out cannot hang on a slow order-service.
 */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await Promise.race([
      orderApi.post('/shop/push-tokens/remove', { body: { token } }),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (_) {}
}

/* ── tap → screen ──────────────────────────────────────────────────────── */

/** [screen, params] for a push's data. Every screen is on OwnerNavigator's root stack. */
function routeFor(data) {
  const ticketId = data?.ticketId || null;
  const threadId = data?.threadId || data?.conversationId || data?.chatId || null;
  switch (String(data?.kind || '').toUpperCase()) {
    case 'PICKUP':
      if (ticketId) return ['BookingTimeline', { ticketId }];
      return data?.bookingId ? ['OwnerPickupServiceDetail', { id: data.bookingId }] : ['OwnerPickupServiceList'];
    case 'ENQUIRY':
    case 'BOOKING':
    case 'TICKET_STATUS':
      return ticketId ? ['BookingTimeline', { ticketId }] : ['BookingList'];
    case 'SELL_REQUEST':
      return ['OwnerSellRequests'];
    case 'BUY_ORDER':
      // Customer orders on the shop's listings live on the Sell tab.
      return ['MarketplaceOrders', { initialTab: 'Sell' }];
    case 'CHAT':
      return threadId ? ['ShopChatThread', { threadId }] : ['ShopChatInbox'];
    case 'STAFF_TASK':
      // An employee started / completed / could not complete a staff task.
      return data?.taskId ? ['StaffTaskDetail', { taskId: data.taskId }] : ['StaffTasks'];
    default:
      return ['OwnerNotifications'];
  }
}

let navRef = null;
let pending = null;
/** Cold-start taps are replayed on every read (and may also reach the listener). */
const handled = new Set();

function flush() {
  if (!pending || !navRef?.isReady()) return;
  // Only the signed-in shell (OwnerNavigator's stack) has these screens. Until
  // it is mounted — Login, the subscription gate's loader — the tap waits.
  if (!navRef.getRootState()?.routeNames?.includes(pending[0])) return;
  const [name, params] = pending;
  pending = null;
  navRef.navigate(name, params);
}

function onResponse(res) {
  const req = res?.notification?.request;
  const data = req?.content?.data || {};
  // Download receipts are opened by lib/downloads.js; other local notifications
  // without a kind are not ours to route.
  if (data.uri || (!data.kind && req?.trigger?.type !== 'push')) return;
  const id = req?.identifier;
  if (id) {
    if (handled.has(id)) return;
    handled.add(id);
  }
  pending = routeFor(data);
  flush();
}

/** The tap that launched the app. SDK 58's sync read; the Async one on older native sides. */
function lastResponse() {
  try {
    if (typeof Notifications.getLastNotificationResponse === 'function') {
      return Promise.resolve(Notifications.getLastNotificationResponse());
    }
  } catch (_) { /* unavailable natively — fall through */ }
  return Notifications.getLastNotificationResponseAsync
    ? Notifications.getLastNotificationResponseAsync()
    : Promise.resolve(null);
}

/**
 * Open the right screen when a push is tapped — while running, or the tap that
 * cold-started the app. Waits until navigation is ready and signed in. Call
 * once, from the root, with the NavigationContainer's ref.
 *
 * @returns a cleanup function suitable for `useEffect`.
 */
export function attachPushNavigation(navigationRef) {
  if (!Notifications) return undefined;
  navRef = navigationRef;
  ensureChannel();
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    // Fires as the container mounts and whenever the tree changes — e.g. the
    // signed-in stack replacing Login — which is when a waiting tap can go.
    const offReady = navigationRef.addListener('ready', flush);
    const offState = navigationRef.addListener('state', flush);
    lastResponse().then(onResponse).catch(() => {});
    return () => { sub.remove(); offReady(); offState(); };
  } catch (_) {
    return undefined;
  }
}
