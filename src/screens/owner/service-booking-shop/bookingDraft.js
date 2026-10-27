// The repair booking in progress, kept as a persistent draft.
//
// What is stored (AsyncStorage, one draft at a time):
//   - the booking stack itself — every route's name, key and params, with the
//     screen's live entries (text, picks, photo URLs…) laid over its params;
//   - BACK_DRAFTS — screens the owner went Back past, so Next restores them;
//   - the devices already added (Devices List) for Customer Details re-entry;
//   - tickets already created by a submit, so a retry never re-posts them.
//
// Every screen feeds it through the same two hooks: useRestoredParams (first
// line — params with any saved draft laid over) and useKeepOnBack (after the
// state — the params that rebuild the screen). The navigator reports each
// navigation state (trackBookingState); entries are saved debounced, and
// flushed when the app goes to the background. Cleared only after a
// successful submit or a confirmed discard.

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'ggfix.bookingDraft.v1';
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // an abandoned draft is offered for a week
const SAVE_DELAY_MS = 400;

// Screens after the booking is placed — never part of a draft.
const DONE_SCREENS = new Set(['BookingThankYou', 'BookingSuccessful', 'AssignTechnician', 'BookingStatus', 'BarcodePrint']);

let BACK_DRAFTS = {};            // `${name}@${prevKey}` → params
const LIVE = new Map();          // route.key → () => live params of a mounted screen
let lastState = null;            // latest booking-stack navigation state
let devicesDraft = null;         // { customerId, devices, at }
let created = {};                // device index → created ticket
let saveTimer = null;
const listeners = new Set();     // Preview re-renders on every change

const notify = () => listeners.forEach((fn) => { try { fn(); } catch (_) {} });

/* ── Back-and-forward ───────────────────────────────────────────────────── */

// The route this screen goes back to (by its own position, so it also holds
// for a screen removed from the middle by a pop-to).
const prevRouteKey = (navigation, route) => {
  const st = navigation.getState();
  const i = st?.routes?.findIndex((r) => r.key === route?.key) ?? -1;
  return i > 0 ? st.routes[i - 1].key : st?.routes?.[st.index - 1]?.key;
};

// Call first in the screen: the route params, with a saved draft laid over.
export function useRestoredParams(navigation, route) {
  const [restored] = useState(() => {
    const key = `${route?.name}@${prevRouteKey(navigation, route)}`;
    const d = BACK_DRAFTS[key] || null;
    delete BACK_DRAFTS[key];
    return d;
  });
  const params = route?.params || {};
  return restored ? { ...params, ...restored } : params;
}

// Call after the screen's state: `draft` = the params that rebuild it (null
// = nothing to keep, e.g. edit mode).
export function useKeepOnBack(navigation, route, draft) {
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const name = route?.name;
  const key = route?.key;

  useEffect(() => {
    LIVE.set(key, () => draftRef.current);
    return () => { LIVE.delete(key); };
  }, [key]);

  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (!['GO_BACK', 'POP', 'POP_TO'].includes(e.data?.action?.type)) return;
    const prev = prevRouteKey(navigation, route);
    if (prev && draftRef.current) BACK_DRAFTS[`${name}@${prev}`] = draftRef.current;
    scheduleSave();
  }), [navigation, name, route]);

  // Every edit lands in the persistent draft (debounced).
  let json = '';
  try { json = JSON.stringify(draft); } catch (_) {}
  useEffect(() => { scheduleSave(); }, [json]);
}

/* ── Devices already added (Customer Details re-entry) ─────────────────── */

export function saveDraftDevices(customerId, devices) {
  if (!customerId || !Array.isArray(devices)) return;
  devicesDraft = { customerId, devices, at: Date.now() };
  scheduleSave();
}

export function draftDevicesFor(customerId) {
  if (!devicesDraft || !customerId || devicesDraft.customerId !== customerId) return [];
  return devicesDraft.devices;
}

/* ── Duplicate-submit guard ─────────────────────────────────────────────── */

export const createdTickets = () => ({ ...created });

// Recorded and written to storage before the next device is posted, so an
// app kill mid-submit still knows which tickets exist.
export async function markTicketCreated(index, ticket) {
  created = { ...created, [index]: ticket };
  await saveNow();
}

/* ── Live snapshot (Preview) ────────────────────────────────────────────── */

const isEditFlow = (routes) => routes.some((r) => r.params?.editMode);

// Booking-stack routes with each mounted screen's live entries laid over.
export function bookingSnapshot() {
  const routes = (lastState?.routes || [])
    .filter((r) => !DONE_SCREENS.has(r.name))
    .map((r) => {
      const live = LIVE.get(r.key)?.();
      return { key: r.key, name: r.name, params: { ...(r.params || {}), ...(live || {}) } };
    });
  return { routes, index: Math.min(lastState?.index ?? 0, Math.max(routes.length - 1, 0)) };
}

export function subscribeBooking(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ── Persistence ────────────────────────────────────────────────────────── */

// The booking stack navigator reports every state change here.
export function trackBookingState(state) {
  lastState = state;
  if ((state?.routes || []).some((r) => DONE_SCREENS.has(r.name))) return;
  scheduleSave();
}

// Strip what JSON can't carry (callbacks such as onScan, Sets, …).
const plain = (v) => { try { return JSON.parse(JSON.stringify(v ?? null)); } catch (_) { return null; } };

function hasEntries(snapshot) {
  if (snapshot.routes.length > 1) return true;
  const init = snapshot.routes[0]?.params?.initial || {};
  return Object.values(init).some((v) => v && String(v).trim() && v !== 'Tamil Nadu');
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const snap = bookingSnapshot();
  notify();
  // Booked (Thank You reached) — the draft was cleared; never write it back.
  if ((lastState?.routes || []).some((r) => DONE_SCREENS.has(r.name))) return;
  if (!snap.routes.length || isEditFlow(snap.routes)) return;
  if (!hasEntries(snap) && !Object.keys(created).length) return;
  const payload = {
    savedAt: Date.now(),
    routes: plain(snap.routes),
    index: snap.index,
    backDrafts: plain(BACK_DRAFTS),
    devicesDraft: plain(devicesDraft),
    created: plain(created),
  };
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch (_) { /* best effort */ }
}

function scheduleSave() {
  notify();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

// Backgrounding must not lose the last keystrokes.
AppState.addEventListener?.('change', (s) => { if (s !== 'active' && saveTimer) saveNow(); });

// The saved incomplete booking, or null.
export async function loadSavedBooking() {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d?.routes?.length || Date.now() - (d.savedAt || 0) > DRAFT_TTL_MS) {
      await AsyncStorage.removeItem(STORE_KEY);
      return null;
    }
    return d;
  } catch (_) {
    return null;
  }
}

// Puts a saved booking's side state back; the caller resets the stack to
// `saved.routes`.
export function adoptSavedBooking(saved) {
  BACK_DRAFTS = saved.backDrafts || {};
  devicesDraft = saved.devicesDraft || null;
  created = saved.created || {};
}

// After a successful submit or a confirmed discard.
export async function clearBookingDraft() {
  clearTimeout(saveTimer);
  saveTimer = null;
  BACK_DRAFTS = {};
  devicesDraft = null;
  created = {};
  try { await AsyncStorage.removeItem(STORE_KEY); } catch (_) {}
  notify();
}

// Kept for callers of the earlier in-memory API.
export const clearDraftDevices = clearBookingDraft;
