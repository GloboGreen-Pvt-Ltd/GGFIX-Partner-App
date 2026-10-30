// Staff Task Management — data layer.
//
// STORAGE: the shared staff-task API on ticket-service (`/staff-tasks`:
// GET ?from&to, POST, GET/PATCH/DELETE /{id}, POST /{id}/status,
// POST /{id}/checklist/{itemId}/toggle). The Employee App reads the same
// records ("My Tasks" — the server gives an employee only their own). Every
// call is scoped to the logged-in shop (JWT shopId). The server keeps this
// app's task shape; only coords differ ({lat, lng} here, {latitude,
// longitude} there). Every screen goes through the functions below only.
//
// Tasks the earlier device-only version saved (AsyncStorage
// `staffTasks.v1:<shopId>`) are uploaded once — see migrateDeviceTasks.
//
// Kept separate from repair tickets / booking statuses on purpose: a staff
// task is shop work (deliveries, parcels, errands), not a repair job.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession } from '../../../auth/session';
import { ticketApi } from '../../../api/client';

/** 'server' — tasks live on the shared backend (StorageNote shows only for 'device'). */
export const STORAGE_MODE = 'server';

export const TASK_TYPES = ['SERVICE', 'DELIVERY', 'PARCEL', 'SUPPLIER', 'BANK_WORK', 'SHOP_WORK', 'OTHER'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
export const REMINDERS = [0, 5, 15, 30]; // minutes before start; 0 = none
export const REPEATS = ['NEVER', 'DAILY', 'WEEKLY', 'MONTHLY'];
// Stored statuses. OVERDUE is derived (see displayStatus), never stored.
export const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'CANCELLED'];

const KEY_PREFIX = 'staffTasks.v1:'; // device-only tasks still to upload
const UNSENT_PREFIX = 'staffTasks.v1.unsent:'; // device tasks the server refused (kept, never retried)
const RECENT_PREFIX = 'staffTasks.recentLocations.v1:';

async function shopKey(prefix) {
  const s = await getSession().catch(() => null);
  return `${prefix}${s?.shopId || s?.shop?.id || 'shop'}`;
}

/** Older tasks stored one `assignee`; everything now reads `assignees`. */
function normalize(t) {
  if (!t) return t;
  const assignees = Array.isArray(t.assignees) && t.assignees.length ? t.assignees : (t.assignee ? [t.assignee] : []);
  return {
    reminder: 0, repeat: 'NEVER', coords: null, ...t,
    assignees,
    assignee: assignees[0] || null,
    assigneeIds: assignees.map((a) => a.id),
  };
}

async function readDevice(prefix) {
  try {
    const raw = await AsyncStorage.getItem(await shopKey(prefix));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalize) : [];
  } catch (_) {
    return [];
  }
}

const newId = () => `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ── Server ⇄ app ───────────────────────────────────────────────────────────
const toCoords = (c) => (c && c.lat != null && c.lng != null ? { latitude: c.lat, longitude: c.lng } : null);
const fromServer = (r) => normalize({
  ...r,
  description: r.description || '',
  location: r.location || '',
  coords: r.coords && r.coords.latitude != null ? { lat: r.coords.latitude, lng: r.coords.longitude } : null,
  checklist: r.checklist || [],
  history: r.history || [],
});
const assigneeBody = ({ id, name, roleLabel, phone, photoUrl }) => ({ id, name, roleLabel: roleLabel || null, phone: phone || null, photoUrl: photoUrl || null });
const isServerId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
const rawText = (e) => String(e?.devMessage || e?.serverMessage || '');

// Turns a failed call into a message an owner can act on.
function friendly(e) {
  if (e?.status === 404 && /task not found/i.test(rawText(e))) {
    const err = new Error('This task no longer exists.');
    err.status = 404;
    throw err;
  }
  // Route missing (an older server build): nothing can be saved or shared.
  if (e?.status === 404 || e?.status === 405 || e?.status === 501) {
    const err = new Error('Staff Tasks is not available on the server yet. Please try again later.');
    err.status = e.status;
    throw err;
  }
  throw e;
}
const one = async (p) => fromServer(await p.catch(friendly));

// ── Dates: tasks use local 'YYYY-MM-DD' + 24-hour 'HH:mm' (shop time). ────
export const pad2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseDay = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
};
export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
export const fromMinutes = (mins) => `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`;
/** Valid 24-hour "HH:mm". */
export const isTime24 = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
/** 24-hour display, "HH:mm". */
export function formatTime(hhmm) {
  const mins = toMinutes(hhmm);
  return mins == null ? '—' : fromMinutes(mins);
}
export function formatDay(key) {
  return parseDay(key).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
const endDate = (t) => {
  const d = parseDay(t.date);
  const mins = toMinutes(t.endTime) ?? toMinutes(t.startTime) ?? 0;
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
};

export const reminderLabel = (m) => (m ? `${m} min before` : 'None');
export const repeatLabel = (r) => ({ NEVER: 'Never', DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' }[r] || 'Never');
export const assigneeNames = (t) => (t.assignees || []).map((a) => a.name).join(', ') || 'Unassigned';

/** What the UI shows: stored status, or OVERDUE when an open task is past its end. */
export function displayStatus(t, now = new Date()) {
  if ((t.status === 'PENDING' || t.status === 'IN_PROGRESS') && endDate(t) < now) return 'OVERDUE';
  return t.status;
}

/** Home counts: all / today / in progress / completed / pending / overdue. */
export function countTasks(list, now = new Date()) {
  const today = dayKey(now);
  const c = { all: 0, today: 0, inProgress: 0, completed: 0, pending: 0, overdue: 0, incomplete: 0 };
  list.forEach((t) => {
    if (t.status === 'CANCELLED') return;
    c.all += 1;
    if (t.date === today) c.today += 1;
    const s = displayStatus(t, now);
    if (s === 'IN_PROGRESS') c.inProgress += 1;
    else if (s === 'COMPLETED') c.completed += 1;
    else if (s === 'PENDING') c.pending += 1;
    else if (s === 'OVERDUE') c.overdue += 1;
    else if (s === 'INCOMPLETE') c.incomplete += 1;
  });
  return c;
}

/** Another open task for this employee overlapping [start, end) on that day. */
export function findClash(list, { id, assigneeId, date, startTime, endTime }) {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (!assigneeId || s == null || e == null) return null;
  return list.find((t) => t.id !== id && (t.assigneeIds || [t.assigneeId]).includes(assigneeId) && t.date === date
    && (t.status === 'PENDING' || t.status === 'IN_PROGRESS')
    && toMinutes(t.startTime) < e && s < toMinutes(t.endTime)) || null;
}

/** Task slot outside the employee's saved shift (defaultCheckIn/Out "HH:mm[:ss]"). */
export function outsideShift(emp, startTime, endTime) {
  const a = toMinutes(String(emp?.shiftStart || '').slice(0, 5));
  const b = toMinutes(String(emp?.shiftEnd || '').slice(0, 5));
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (a == null || b == null || s == null || e == null) return false;
  return s < a || e > b;
}

// ── Reads ──────────────────────────────────────────────────────────────────
// The server answers a date window (max 400 days); this covers the calendar's reach.
const LIST_PAST_DAYS = 180;
const LIST_FUTURE_DAYS = 200;

export async function listTasks() {
  await migrateDeviceTasks();
  const now = Date.now();
  const query = { from: dayKey(new Date(now - LIST_PAST_DAYS * 86400000)), to: dayKey(new Date(now + LIST_FUTURE_DAYS * 86400000)) };
  const res = await ticketApi.get('/staff-tasks', { query }).catch(friendly);
  const list = (Array.isArray(res) ? res : res?.content || []).map(fromServer);
  return list.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
/** null when the task is gone (or is an id from the old device-only list). */
export async function getTask(id) {
  if (!isServerId(id)) return null;
  try {
    return fromServer(await ticketApi.get(`/staff-tasks/${id}`));
  } catch (e) {
    if (e?.status === 404 && /task not found/i.test(rawText(e))) return null;
    return friendly(e);
  }
}

// ── Writes (the server appends every change to the task's history) ─────────
const cleanChecklist = (items) => (items || [])
  .filter((c) => String(c.text || '').trim())
  .map((c) => ({ id: c.id && !String(c.id).startsWith('new_') ? c.id : newId(), text: c.text.trim(), done: !!c.done }));

/** Fields shared by create / edit, validated. Throws with a user-facing message. */
export function validateDraft(d) {
  if (!String(d.title || '').trim()) throw new Error('Enter a task title.');
  if (!d.date) throw new Error('Choose a date.');
  if (!isTime24(d.startTime) || !isTime24(d.endTime)) throw new Error('Enter start and end time as HH:mm (24-hour).');
  if (toMinutes(d.endTime) <= toMinutes(d.startTime)) throw new Error('End time must be after the start time.');
  if (!(d.assignees || []).length) throw new Error('Assign at least one employee.');
}

// A double tap (or a retry) must not create the same task twice: an identical
// task sent in the last few seconds reuses its clientRef, and the server then
// returns the first task instead of a copy.
const DUPLICATE_WINDOW_MS = 10000;
const sameTaskSig = (t) => JSON.stringify([t.title.trim(), t.date, t.startTime, t.endTime, (t.assignees || []).map((a) => a.id).sort()]);
const recentCreates = new Map(); // sig → { ref, at }

/** Create body for the server (draft or an old device task). */
const createBody = (input, clientRef) => ({
  type: input.type || 'OTHER',
  title: input.title.trim(),
  description: (input.description || '').trim(),
  date: input.date,
  startTime: input.startTime,
  endTime: input.endTime,
  assignees: (input.assignees || []).map(assigneeBody),
  priority: input.priority || 'MEDIUM',
  reminder: REMINDERS.includes(input.reminder) ? input.reminder : 0,
  repeat: REPEATS.includes(input.repeat) ? input.repeat : 'NEVER',
  location: (input.location || '').trim(),
  coords: toCoords(input.coords),
  checklist: cleanChecklist(input.checklist).map((c) => ({ ...c, done: false })),
  clientRef,
});

export async function createTask(input) {
  validateDraft(input);
  const sig = sameTaskSig(input);
  const hit = recentCreates.get(sig);
  const ref = hit && Date.now() - hit.at < DUPLICATE_WINDOW_MS ? hit.ref : `pa-${newId()}`;
  recentCreates.set(sig, { ref, at: Date.now() });
  const t = await one(ticketApi.post('/staff-tasks', { body: createBody(input, ref) }));
  if (t.location) await rememberLocation({ address: t.location, coords: t.coords });
  return t;
}

/** Edit: title / details / type / priority / reminder / repeat / location / checklist (only the fields sent change). */
export function updateTask(id, patch) {
  const { assignees: _a, assignee: _b, ...rest } = patch;
  const body = {};
  ['type', 'title', 'description', 'priority', 'reminder', 'repeat', 'date', 'startTime', 'endTime'].forEach((k) => {
    if (rest[k] !== undefined) body[k] = rest[k];
  });
  if (rest.location !== undefined) { body.location = rest.location; body.coords = toCoords(rest.coords); }
  // Items keep their id (and done state); new ones ("new_…") get one.
  if (rest.checklist) body.checklist = cleanChecklist(rest.checklist);
  return one(ticketApi.patch(`/staff-tasks/${id}`, { body }));
}

/** The server puts an INCOMPLETE task back to PENDING when it is rescheduled. */
export function rescheduleTask(id, { date, startTime, endTime }) {
  return one(ticketApi.patch(`/staff-tasks/${id}`, { body: { date, startTime, endTime } }));
}

/** Replace the assigned employees (one or many). */
export function setAssignees(id, assignees) {
  return one(ticketApi.patch(`/staff-tasks/${id}`, { body: { assignees: assignees.map(assigneeBody) } }));
}
/** Kept for callers with a single employee. */
export const reassignTask = (id, assignee) => setAssignees(id, [assignee]);

/** Any status (the owner); `note` is the reason, required for INCOMPLETE. */
export function setTaskStatus(id, status, note) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
  return one(ticketApi.post(`/staff-tasks/${id}/status`, { body: { status, note: (note || '').trim() || undefined } }));
}

export function toggleChecklistItem(id, itemId) {
  return one(ticketApi.post(`/staff-tasks/${id}/checklist/${encodeURIComponent(itemId)}/toggle`));
}

export async function deleteTask(id) {
  await ticketApi.del(`/staff-tasks/${id}`).catch(friendly);
}

// ── One-time upload of the old device-only tasks ───────────────────────────
// Each goes up with clientRef "device:<local id>", so a retry (app closed
// mid-way, network drop) never makes a copy; ticks and status follow. Uploaded
// tasks leave the device. One the server refuses as invalid (e.g. end before
// start) is parked under UNSENT_PREFIX instead of retrying forever.
let migrated = false;
let migrating = null;
export function migrateDeviceTasks() {
  if (migrated) return Promise.resolve();
  if (!migrating) {
    migrating = uploadDeviceTasks()
      .then((left) => { migrated = left === 0; })
      .catch(() => {})
      .finally(() => { migrating = null; });
  }
  return migrating;
}

async function uploadDeviceTasks() {
  const list = await readDevice(KEY_PREFIX);
  if (!list.length) return 0;
  const left = [];
  const refused = [];
  for (const local of list) {
    try {
      const t = fromServer(await ticketApi.post('/staff-tasks', { body: createBody(local, `device:${local.id}`.slice(0, 64)) }));
      for (const c of local.checklist || []) {
        const now = t.checklist.find((x) => x.id === c.id);
        if (c.done && now && !now.done) await ticketApi.post(`/staff-tasks/${t.id}/checklist/${encodeURIComponent(c.id)}/toggle`);
      }
      if (local.status !== 'PENDING' && t.status === 'PENDING') {
        const note = local.status === 'INCOMPLETE' ? (local.incompleteReason || 'Not completed') : undefined;
        await ticketApi.post(`/staff-tasks/${t.id}/status`, { body: { status: local.status, note } });
      }
    } catch (e) {
      (e?.status === 400 || e?.status === 422 ? refused : left).push(local);
    }
  }
  if (refused.length) {
    const kept = await readDevice(UNSENT_PREFIX);
    await AsyncStorage.setItem(await shopKey(UNSENT_PREFIX), JSON.stringify([...kept, ...refused]));
  }
  const key = await shopKey(KEY_PREFIX);
  if (left.length) await AsyncStorage.setItem(key, JSON.stringify(left));
  else await AsyncStorage.removeItem(key);
  return left.length;
}

// ── Recently used locations (per shop, newest first, max 8) ───────────────
export async function recentLocations() {
  try {
    const raw = await AsyncStorage.getItem(await shopKey(RECENT_PREFIX));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}
export async function rememberLocation(loc) {
  if (!loc?.address) return;
  const list = (await recentLocations()).filter((l) => l.address !== loc.address);
  list.unshift({ address: loc.address, coords: loc.coords || null });
  await AsyncStorage.setItem(await shopKey(RECENT_PREFIX), JSON.stringify(list.slice(0, 8)));
}
