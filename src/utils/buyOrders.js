import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { listShopChats, getShopChatMessages, sendShopChatMessage } from '../api/chat';
import { notify } from '../components/confirm';

/**
 * Customer buy orders reach the seller as a chat message — the Customer app's
 * utils/buyOrderNotify.js writes it as:
 *   🛒 New order #ORD123
 *   • <product title> × 1 — ₹50,000
 *   Total: …
 *   Buyer: <name> · Phone: <mobile> · Address: <line>   (one per line)
 * There is no shop-side buy-order endpoint, so this is the one source for My
 * Orders' Order Placed / Buyer Details steps, the "new order" notification and
 * the sold / not-sold confirmation sent back to the buyer's chat.
 */
const ORDER_HEAD = /^🛒\s*New order\s*(#\S+)?/;
const MAX_THREADS = 30;
const SEEN_KEY = 'owner.buyOrders.notified';
const CHANNEL_ID = 'orders';

export function parseBuyOrderMessage(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const head = lines[0]?.match(ORDER_HEAD);
  if (!head) return null;
  const field = (k) => lines.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1).trim() || null;
  return {
    orderNo: head[1] || null,
    titles: lines.filter((l) => l.startsWith('•')).map((l) => l.replace(/^•\s*/, '').replace(/\s×\s.*$/, '').trim()),
    buyer: field('Buyer'),
    phone: field('Phone'),
    address: field('Address'),
  };
}

/**
 * Customer buy orders found in the shop's chats, oldest first:
 *   [{ key, threadId, orderNo, titles, buyer, phone, address, at }]
 * `unreadOnly` checks just threads with unread messages (cheap enough to poll).
 * Never throws.
 */
export async function loadChatBuyOrders({ unreadOnly = false } = {}) {
  try {
    const threads = (await listShopChats())
      .filter((t) => !unreadOnly || (t.unreadCount || 0) > 0)
      .slice(0, MAX_THREADS);
    const perThread = await Promise.all(threads.map(async (t) => {
      const msgs = await getShopChatMessages(t.id).catch(() => []);
      return msgs.filter((m) => m.sender !== 'SHOP').map((m) => {
        const o = parseBuyOrderMessage(m.body);
        if (!o) return null;
        return {
          ...o,
          key: m.id || `${t.id}:${m.createdAt}`,
          threadId: t.id,
          at: m.createdAt || null,
          buyer: o.buyer || t.counterpartName || null,
          phone: o.phone || t.counterpartPhone || null,
        };
      }).filter(Boolean);
    }));
    return perThread.flat().sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  } catch (_) {
    return [];
  }
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** Orders naming this listing (the chat message carries the product title). */
export function ordersForListing(orders, listing) {
  const t = norm(listing?.title);
  return t ? (orders || []).filter((o) => o.titles.some((x) => norm(x) === t)) : [];
}

/**
 * Sold / not sold → order confirmation in the buyer's Customer-app chat. On
 * Sold the first buyer is confirmed and any later buyers are told it's gone.
 * Resolves to the number of buyers messaged; never throws.
 */
export async function sendOrderOutcome(listing, sold) {
  const orders = ordersForListing(await loadChatBuyOrders(), listing);
  const seen = new Set();
  const buyers = orders.filter((o) => !seen.has(o.threadId) && seen.add(o.threadId));
  const title = listing?.title || 'your device';
  const results = await Promise.allSettled(buyers.map((o, i) => {
    const no = o.orderNo ? ` ${o.orderNo}` : '';
    const body = sold && i === 0
      ? `✅ Order confirmed${no}\n${title} is sold to you. We'll contact you for payment and delivery.`
      : `❌ Order not confirmed${no}\nSorry, ${title} is no longer available, so this order won't go ahead.`;
    return sendShopChatMessage(o.threadId, { body });
  }));
  return results.filter((r) => r.status === 'fulfilled').length;
}

/* Local "new order" notification. expo-notifications is required defensively
   and skipped in Expo Go — same reasoning as lib/downloads.js. */
let Notifications = null;
try {
  const inExpoGo = (() => { try { return isRunningInExpoGo(); } catch (_) { return false; } })();
  if (!inExpoGo) Notifications = require('expo-notifications');
} catch (_) { Notifications = null; }

async function postLocal(title, body) {
  if (!Notifications) { notify(title, body); return; }
  try {
    const allowed = (p) => p?.granted
      || p?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed(await Notifications.getPermissionsAsync())
      && !allowed(await Notifications.requestPermissionsAsync())) { notify(title, body); return; }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Orders',
        description: 'New customer orders on your listings.',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'BUY_ORDER' } },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch (_) {
    notify(title, body);
  }
}

/**
 * Notify once per new buy order. The first run on a device only records what
 * is already there, so old orders don't fire a burst of notifications.
 */
export async function notifyNewBuyOrders(orders) {
  if (!orders?.length) return;
  let seen = null;
  try { seen = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || 'null'); } catch (_) { seen = null; }
  const known = new Set(Array.isArray(seen) ? seen : []);
  const fresh = Array.isArray(seen) ? orders.filter((o) => !known.has(o.key)) : [];
  orders.forEach((o) => known.add(o.key));
  try { await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...known].slice(-300))); } catch (_) {}
  for (const o of fresh) {
    await postLocal(
      `Order placed${o.orderNo ? ` ${o.orderNo}` : ''}`,
      [o.titles.join(', '), o.buyer ? `by ${o.buyer}` : null].filter(Boolean).join(' '),
    );
  }
}
