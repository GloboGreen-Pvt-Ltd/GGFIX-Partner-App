import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell } from 'lucide-react-native';
import { HeaderIconButton } from '../../../components/PageHeader';
import { C } from '../sell/kit';

// Small shared pieces for the Buy module screens (built on the Sell kit).

// The server keeps only the latest lead quote, so this shop's previous price
// is remembered on the device when it revises (Quotation page "Previous Quote").
const prevQuoteKey = (listingId) => `ggfix.buy.prevQuote.${listingId}`;
export const savePrevQuote = (listingId, v) => AsyncStorage.setItem(prevQuoteKey(listingId), JSON.stringify(v)).catch(() => {});
export async function readPrevQuote(listingId) {
  try { return JSON.parse(await AsyncStorage.getItem(prevQuoteKey(listingId))) || null; } catch (_) { return null; }
}

export function BellButton({ navigation }) {
  return <HeaderIconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('OwnerNotifications')} />;
}

// Customer-order statuses (GET /customer-orders) → Purchase Orders tab + pill.
const ORDER_BUCKET = {
  PENDING: 'NEW', PLACED: 'NEW', NEW: 'NEW', CREATED: 'NEW', SELL_CONFIRMED: 'NEW',
  CONFIRMED: 'IN_PROGRESS', ACCEPTED: 'IN_PROGRESS', PROCESSING: 'IN_PROGRESS', IN_PROGRESS: 'IN_PROGRESS',
  PACKED: 'IN_PROGRESS', SHIPPED: 'IN_PROGRESS', OUT_FOR_DELIVERY: 'IN_PROGRESS', PICKUP_SCHEDULED: 'IN_PROGRESS',
  DELIVERED: 'COMPLETED', COMPLETED: 'COMPLETED', CANCELLED: 'COMPLETED', CANCELED: 'COMPLETED', REJECTED: 'COMPLETED', REFUNDED: 'COMPLETED',
};
export const orderBucket = (status) => ORDER_BUCKET[String(status || '').toUpperCase()] || 'IN_PROGRESS';

export function orderPill(status) {
  const s = String(status || '').toUpperCase();
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'REFUNDED'].includes(s)) return { label: s === 'REFUNDED' ? 'Refunded' : 'Cancelled', fg: C.red, bg: C.redBg };
  const b = orderBucket(s);
  if (b === 'NEW') return { label: 'New', fg: C.amber, bg: C.amberBg };
  if (b === 'COMPLETED') return { label: 'Completed', fg: C.green, bg: C.greenBg };
  return { label: s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : 'In progress', fg: C.teal, bg: C.mint };
}

// Buyer-side view of an enquiry status (this shop sent the offer).
const OFFER_META = {
  OPEN: { label: 'Pending', fg: C.amber, bg: C.amberBg, bucket: 'PENDING' },
  COUNTERED: { label: 'Offer Sent', fg: C.amber, bg: C.amberBg, bucket: 'PENDING' },
  QUOTED: { label: 'Shop Replied', fg: C.teal, bg: C.mint, bucket: 'PENDING' },
  ACCEPTED: { label: 'Accepted', fg: C.green, bg: C.greenBg, bucket: 'ACCEPTED' },
  CONFIRMED: { label: 'Deal Confirmed', fg: C.green, bg: C.greenBg, bucket: 'ACCEPTED' },
  REJECTED: { label: 'Rejected', fg: C.red, bg: C.redBg, bucket: 'REJECTED' },
  CANCELLED: { label: 'Cancelled', fg: C.muted, bg: '#F1F2F4', bucket: 'REJECTED' },
};
export const offerMeta = (status) => OFFER_META[String(status || '').toUpperCase()] || { label: String(status || '—'), fg: C.muted, bg: '#F1F2F4', bucket: 'PENDING' };

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'HH:mm' (or 'HH:mm:ss') → '4:00 PM'. */
export function clock(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${h % 12 || 12}:${pad(m || 0)} ${h < 12 ? 'AM' : 'PM'}`;
}
/** Pickup date 'YYYY-MM-DD' + slot start → 'Tue, 21 Jan 2025, 4:00 PM'. */
export function scheduleLabel(date, start) {
  if (!date) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const day = new Date(y, mo - 1, d);
  return `${DAYS[day.getDay()]}, ${d} ${MONTHS[mo - 1]} ${y}${start ? `, ${clock(start)}` : ''}`;
}
export const shortDay = (d) => ({ day: DAYS[d.getDay()], date: `${d.getDate()} ${MONTHS[d.getMonth()]}` });

export function dateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return today ? `Today, ${t}` : `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${t}`;
}
