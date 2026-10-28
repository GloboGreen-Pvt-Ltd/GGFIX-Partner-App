// Staff Task Management — data layer.
//
// STORAGE: there is no staff-task API on the server yet, so tasks are kept ON
// THIS DEVICE (AsyncStorage), one list per shop (`session.shopId`). They do
// not reach the Employee App or other devices. Every screen goes through the
// functions below only, so moving to a shared backend later means replacing
// `readAll` / `writeAll` (and nothing in the screens). See STORAGE_MODE.
//
// Kept separate from repair tickets / booking statuses on purpose: a staff
// task is shop work (deliveries, parcels, errands), not a repair job.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession } from '../../../auth/session';

/** 'device' until a backend exists; screens show this so nobody assumes sync. */
export const STORAGE_MODE = 'device';

export const TASK_TYPES = ['SERVICE', 'DELIVERY', 'PARCEL', 'SUPPLIER', 'BANK_WORK', 'SHOP_WORK', 'OTHER'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
export const REMINDERS = [0, 5, 15, 30]; // minutes before start; 0 = none
export const REPEATS = ['NEVER', 'DAILY', 'WEEKLY', 'MONTHLY'];
// Stored statuses. OVERDUE is derived (see displayStatus), never stored.
export const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'CANCELLED'];

const KEY_PREFIX = 'staffTasks.v1:';
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

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(await shopKey(KEY_PREFIX));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalize) : [];
  } catch (_) {
    return [];
  }
}

async function writeAll(list) {
  await AsyncStorage.setItem(await shopKey(KEY_PREFIX), JSON.stringify(list));
}

const newId = () => `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

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
export async function listTasks() {
  const list = await readAll();
  return list.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
export async function getTask(id) {
  return (await readAll()).find((t) => t.id === id) || null;
}

// ── Writes (every change appends to the task's history) ────────────────────
async function mutate(id, fn) {
  const list = await readAll();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) throw new Error('Task not found');
  const next = normalize(fn({ ...list[i] }));
  next.updatedAt = nowIso();
  list[i] = next;
  await writeAll(list);
  return next;
}
const withHistory = (t, action, note) => ({ ...t, history: [...(t.history || []), { at: nowIso(), action, note: note || null }] });

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
// task created in the last few seconds is returned instead of a copy.
const DUPLICATE_WINDOW_MS = 10000;
const sameTaskSig = (t) => JSON.stringify([t.title.trim(), t.date, t.startTime, t.endTime, (t.assignees || []).map((a) => a.id).sort()]);

export async function createTask(input) {
  validateDraft(input);
  const list = await readAll();
  const sig = sameTaskSig(input);
  const dup = list.find((t) => sameTaskSig(t) === sig && Date.now() - new Date(t.createdAt).getTime() < DUPLICATE_WINDOW_MS);
  if (dup) return dup;

  const assignees = input.assignees.map(({ id, name, roleLabel, phone, photoUrl }) => ({ id, name, roleLabel: roleLabel || null, phone: phone || null, photoUrl: photoUrl || null }));
  const t = normalize(withHistory({
    id: newId(),
    type: input.type || 'OTHER',
    title: input.title.trim(),
    description: (input.description || '').trim(),
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    assignees,
    priority: input.priority || 'MEDIUM',
    reminder: REMINDERS.includes(input.reminder) ? input.reminder : 0,
    repeat: REPEATS.includes(input.repeat) ? input.repeat : 'NEVER',
    location: (input.location || '').trim(),
    coords: input.coords || null,
    checklist: cleanChecklist(input.checklist).map((c) => ({ ...c, done: false })),
    status: 'PENDING',
    incompleteReason: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }, 'CREATED', `Assigned to ${assignees.map((a) => a.name).join(', ')}`));
  list.push(t);
  await writeAll(list);
  if (t.location) await rememberLocation({ address: t.location, coords: t.coords });
  return t;
}

/** Edit: title / details / type / priority / reminder / repeat / location / checklist. */
export function updateTask(id, patch) {
  const { assignees: _a, assignee: _b, ...rest } = patch;
  return mutate(id, (t) => withHistory({ ...t, ...rest, ...(rest.checklist ? { checklist: cleanChecklist(rest.checklist) } : null) }, 'EDITED'));
}

export function rescheduleTask(id, { date, startTime, endTime }) {
  return mutate(id, (t) => withHistory(
    { ...t, date, startTime, endTime, status: t.status === 'INCOMPLETE' ? 'PENDING' : t.status, incompleteReason: t.status === 'INCOMPLETE' ? null : t.incompleteReason },
    'RESCHEDULED',
    `${formatDay(date)} ${formatTime(startTime)} – ${formatTime(endTime)}`,
  ));
}

/** Replace the assigned employees (one or many). */
export function setAssignees(id, assignees) {
  return mutate(id, (t) => withHistory(
    { ...t, assignees },
    'REASSIGNED',
    `${assigneeNames(t)} → ${assignees.map((a) => a.name).join(', ')}`,
  ));
}
/** Kept for callers with a single employee. */
export const reassignTask = (id, assignee) => setAssignees(id, [assignee]);

export function setTaskStatus(id, status, note) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
  return mutate(id, (t) => withHistory(
    { ...t, status, incompleteReason: status === 'INCOMPLETE' ? (note || '').trim() || null : null },
    status,
    note,
  ));
}

export function toggleChecklistItem(id, itemId) {
  return mutate(id, (t) => ({
    ...t,
    checklist: (t.checklist || []).map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
  }));
}

export async function deleteTask(id) {
  const list = await readAll();
  await writeAll(list.filter((t) => t.id !== id));
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
