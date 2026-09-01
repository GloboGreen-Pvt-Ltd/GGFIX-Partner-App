/**
 * Phone-book access for the "Add from Contacts" flow.
 *
 * `expo-contacts` is a NATIVE module: a static `import` of it throws
 * "Cannot find native module 'ExpoContacts'" at load time in Expo Go and in any
 * APK built before it was added to package.json — and that throw takes the whole
 * app down, not just this screen. Loaded defensively for the same reason
 * components/confirm.js loads `burnt` that way, so a build without the module
 * degrades to "add manually" instead of a white screen.
 */
let Contacts = null;
try {
  Contacts = require('expo-contacts');
} catch (_) {
  Contacts = null;
}

/** False on a build that predates the expo-contacts dependency. */
export const contactsAvailable = () => !!Contacts?.getContactsAsync;

export const PERMISSION_GRANTED = 'granted';
export const PERMISSION_DENIED = 'denied';
export const PERMISSION_UNDETERMINED = 'undetermined';

/**
 * Resolves to `fallback` if the wrapped promise has not settled in `ms`.
 *
 * These native calls CAN hang forever rather than reject. The way in is a
 * runtime permission that is missing from AndroidManifest.xml: Android shows no
 * dialog and never fires onRequestPermissionsResult, so the promise simply never
 * settles. A caller awaiting that shows a spinner with no end and no error —
 * the worst failure mode available. Whatever the manifest says, this guarantees
 * the screen reaches a state the owner can act on.
 */
function withWatchdog(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]);
}

// No dialog is involved in reading the current grant, so anything beyond a
// moment means the call is not coming back.
const CHECK_TIMEOUT_MS = 6000;
// The request DOES put a dialog in front of a person, who may be interrupted
// mid-tap. Long enough not to cut off a real decision, short enough that a
// silently-dropped request doesn't strand the screen.
const REQUEST_TIMEOUT_MS = 60000;

/**
 * Reads the current grant WITHOUT prompting, so the screen can decide between
 * showing the list, asking, or showing the "denied" recovery state.
 *
 * Returns `undetermined` when the call times out — "I don't know" rather than
 * "no", so the caller still goes on to ask properly.
 */
export async function getContactsPermission() {
  if (!contactsAvailable()) return PERMISSION_DENIED;
  try {
    const res = await withWatchdog(Contacts.getPermissionsAsync(), CHECK_TIMEOUT_MS, null);
    return res?.status ?? PERMISSION_UNDETERMINED;
  } catch (_) {
    return PERMISSION_DENIED;
  }
}

/**
 * Shows the OS "Allow … to access your contacts" dialog.
 *
 * Android only ever shows it once; after a "Don't allow" this resolves straight
 * back to `denied` with no dialog, which is why the screen offers Settings as
 * the second-chance path rather than just asking again.
 */
export async function requestContactsPermission() {
  if (!contactsAvailable()) return PERMISSION_DENIED;
  try {
    const res = await withWatchdog(Contacts.requestPermissionsAsync(), REQUEST_TIMEOUT_MS, null);
    return res?.status ?? PERMISSION_DENIED;
  } catch (_) {
    return PERMISSION_DENIED;
  }
}

// Read in pages instead of one call for the whole phone book. The cost here is
// not the reading, it is that NOTHING can render until the last contact has
// crossed the bridge — one call means the owner watches a spinner for the full
// duration, where paging puts the first screenful up almost immediately.
const PAGE_SIZE = 300;
// Runaway guard only (≈300k contacts). Not a cap anyone can reach; it exists so
// a platform that never lowers hasNextPage cannot spin forever.
const MAX_PAGES = 1000;

// The literal values of Contacts.Fields.Name / .PhoneNumbers. Spelled out
// because this is module scope, where `Contacts` may still be null — the enum
// is only safe to touch after the availability check inside loadContacts.
const CONTACT_FIELDS = ['name', 'phoneNumbers'];

/**
 * The phone book as `{ id, name, phone, search }`, name-sorted and de-duplicated.
 *
 * A real contact list is messy: entries with no number at all, the same person
 * saved twice, and one person with home/mobile/work numbers. Only the first
 * usable number per contact is kept — the picker is for "who is this account",
 * not for choosing between someone's three phones — and numbers already seen are
 * dropped so the same person can't appear twice under different spellings.
 *
 * @param onPage called with a growing snapshot after each page, so the list can
 *   fill in progressively rather than appearing all at once at the end.
 */
export async function loadContacts(onPage) {
  if (!contactsAvailable()) return [];

  const seen = new Set();
  const out = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await Contacts.getContactsAsync({
      // Only these two. Every extra field is another join against
      // ContactsContract.Data, and phoneNumbers is already the expensive one —
      // it is also the one field an account cannot be created without.
      fields: CONTACT_FIELDS,
      // Let SQLite sort. Doing it here instead cost an Intl collation per
      // comparison over the whole book, and it has to be native anyway for the
      // pages below to arrive in a consistent order.
      sort: Contacts.SortTypes?.FirstName,
      pageSize: PAGE_SIZE,
      pageOffset: offset,
    });

    const batch = res?.data || [];
    for (const c of batch) {
      const raw = c?.phoneNumbers?.[0]?.number;
      if (!raw) continue;

      // Match the server's 10-digit national form so the dedupe key is the same
      // string the account will actually be stored under.
      let digits = String(raw).replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
      else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
      if (digits.length !== 10 || seen.has(digits)) continue;

      seen.add(digits);
      const name = (c.name || '').trim() || digits;
      out.push({
        id: String(c.id ?? digits),
        name,
        phone: digits,
        // Folded once here rather than on every keystroke of the search box.
        search: name.toLowerCase(),
      });
    }

    // Hand the page up so the first few hundred rows can be on screen while the
    // rest is still being read. `slice()` because the caller holds this as
    // state and must not see it mutate underneath a render.
    if (onPage && out.length) onPage(out.slice());

    offset += batch.length;

    // `hasNextPage` is the authority where the platform reports it; a short page
    // is the fallback signal. Trusting `!hasNextPage` alone would silently stop
    // at the first page on any platform that omits the flag.
    const more = res?.hasNextPage !== undefined ? res.hasNextPage : batch.length === PAGE_SIZE;
    if (!more || batch.length === 0) break;
  }

  return out;
}
