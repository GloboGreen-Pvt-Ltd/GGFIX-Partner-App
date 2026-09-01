import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pencil,
  PlusCircle,
  ArrowLeftRight,
  Receipt,
  IndianRupee,
  BarChart3,
  Users,
  PackageCheck,
  Truck,
  Clock,
  Bell,
  ChevronRight,
  BadgeCheck,
  BadgeX,
  ClipboardPlus,
  UsersRound,
  CalendarCheck,
  ClipboardList,
  Camera,
  PackageSearch,
  CalendarOff,
  Timer,
  Store,
  Check,
  Search,
  Mic,
  MessageCircle,
  FileText,
  Smartphone,
  User,
  QrCode,
  Puzzle,
  BookText,
  Package,
  Phone,
  CalendarClock,
  LogOut,
  ShoppingCart,
  PackageOpen,
  ClipboardCheck,
  CheckCircle2,
  UserCog,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { getDeviceCategories, getModelsByBrand } from '../../api/masterData';
import { resolveDeviceImageSource } from '../../utils/images';
import { listShopRepairBookings } from '../../api/orders';
import { READY_BAND, SCOPES, countScope, pickupsOnly } from './AllBooking/bookingScopes';
import { getOwnerKycDocuments } from '../../api/shops';
import { getUnreadCount as getNotifUnreadCount } from '../../api/notifications';
import { getSession } from '../../auth/session';
import { fetchMe, switchShop } from '../../api/auth';
import {
  FEATURE,
  canAddShop as canAddShopOnPlan,
  fetchEntitlements,
} from '../../subscription/entitlements';
import { showLimitPopup } from '../../subscription/limitPopup';

/* ══════════════════════════════════════════════════════════════════════════
   iOS design language
   ──────────────────────────────────────────────────────────────────────────
   This screen follows Apple's CURRENT design language — iOS 26 "Liquid Glass"
   — rather than the Material/Swiggy language the other owner tabs still use.
   What that means concretely, and how each trait is built here:

     · FLOATING GLASS CHROME. The nav bar no longer sits in a solid bar; it is
       a translucent layer the content scrolls underneath, with a bright
       specular top edge and a soft drop shadow so it reads as a lens floating
       above the page. Toolbar buttons are grouped into one glass capsule.
     · CONCENTRIC RADII. A container of radius R holds children of radius
       R − padding, so corners stay visually parallel instead of fighting.
       See `concentric()`.
     · LARGER, SOFTER SHAPES. Cards moved 10 → 26, controls are full capsules,
       icon tiles are squircle-ish (28% of their size).
     · SPECULAR EDGES. Every glass surface carries a 1px light inner border on
       top (`GLASS.edge`) — the single detail that sells "glass" over "grey box".
     · TINTED / PROMINENT GLASS. The revenue widget is "glass prominent": a
       green gradient with its own highlight and a light capsule button.
     · CONTENT FIRST. Chrome recedes, separators are lighter, vertical rhythm
       is more generous, and section headers are bold inline titles rather than
       tiny uppercase footnotes.

   NO REAL BLUR: `expo-blur` is not a dependency of this app and is not in the
   installed Android build, so BlurView would need a new native binary. The
   glass here is layered translucency instead (high-opacity whites + gradient
   + specular edge), which needs no native module and works in the current APK.
   If a real backdrop blur is wanted later, add `expo-blur`, rebuild, and swap
   the `<Glass>` body for a `<BlurView intensity={...} tint="light">`.

   The brand green stays as the tint so the app still reads as GGFix.
   ══════════════════════════════════════════════════════════════════════════ */

const HAIRLINE = StyleSheet.hairlineWidth;

/* ── GGFix palette, budgeted 60 / 30 / 10 ───────────────────────────────────
     60%  BACKGROUND + SURFACE — the page wash (#F7FAF7) and every card, sheet
          and capsule (#FFFFFF). Most of the screen is white by area.
     30%  GREEN — primary #16BB05 and deep #087A0A: icon circles, the revenue
          band, the app tint, links and selected states.
     10%  ACCENT — lime #7ED957 plus the two state colours (warning #F59E0B,
          error #DC2626). Badges, success chips and alerts only, never a
          surface.

   That budget is why the icon tiles no longer carry the iOS system rainbow
   (blue / indigo / pink / purple / teal / cyan): every tile now draws from the
   three greens, with amber reserved for genuinely pending states, so colour
   carries meaning instead of merely labelling a row.

   FILL GREEN vs TEXT GREEN. Primary #16BB05 is a light green — white on it is
   2.6:1, and it is 2.6:1 on white too, so it is used for FILLS (where the glyph
   contrast is engineered per-tone by `glyphOn`) and never for text or icons
   drawn straight onto a white card. Anything foreground-on-white uses deep
   #087A0A (5.6:1). `C.tint` is therefore the deep green.
   ────────────────────────────────────────────────────────────────────────── */
const GREEN = '#16BB05';        // Primary      — main fills, active tabs
const GREEN_DARK = '#087A0A';   // Secondary    — foreground green, dark fills
const GREEN_LIGHT = '#7ED957';  // Accent/Lime  — highlights, badges, success

// The brand's deep pine — ONE constant behind both the avatar's verification
// badge and every icon tile below the header, so the two cannot drift apart.
//
// #004C40 — luminance 0.055, i.e. DARK. It clears every use on this screen:
// ~10:1 as a foreground on the white page, 9.4:1 on the #F8F8F8 tiles, and
// 10:1 under a white glyph when used as a fill.
//
// The value has moved twice; if it moves again, the thing to check is whether
// it is dark or light. A LIGHT value (the brief stint on #64FF43, luminance
// 0.746) silently breaks every FOREGROUND use — shop name, header icons, the
// verification badge, every tile glyph all fell to 1.2-1.3:1 — while fills keep
// working, because glyphOn flips the glyph for them and nothing flips a
// foreground.
const PINE = '#004C40';

// Shop name in the identity header. Was the orange #FF5B04 — the one warm
// colour on the screen — now back on PINE, so the header reads as one colour.
const SHOP_NAME_COLOR = PINE;

// Switch-account and notification icons in the header. Same hairline weight as
// the verification badge, so the three marks in the header read as one set.
// ONE stroke weight for every icon on this screen. It had drifted to nine
// different values (1.0, 1.5, 1.6, 2, 2.2, 2.3, 2.5, 2.6, 2.8) picked
// per-call-site, which is why the header, the badge and the tiles never quite
// looked like one set. The named per-section constants below all point here so
// a future change stays a single edit.
const ICON_STROKE = 2;
const HEADER_ACTION_STROKE = ICON_STROKE;

const C = {
  groupedBg: '#FFFFFF',            // Background — plain white page
  card: '#FFFFFF',                 // Surface
  fill: 'rgba(23,33,23,0.06)',     // inset well behind a device photo
  highlight: 'rgba(23,33,23,0.08)', // row press highlight
  label: '#172117',                // Text Primary
  label2: '#667066',               // Text Secondary
  label3: 'rgba(102,112,102,0.45)', // tertiary — chevrons only
  separator: '#E2E8E2',            // Border
  placeholder: '#667066',
  tint: GREEN_DARK,                // interactive foreground (see note above)

  // The only fills an icon tile may take — every Overview chip and Shortcut
  // tile below the header draws from these three and nothing else, so this is
  // the single place the icon palette is set.
  //
  // Retoned off the app's #16BB05 / #087A0A / #7ED957 greens onto the single
  // brand pine, matching the avatar's verification badge. All three point at
  // the SAME value now — the three names are kept only because the tile tables
  // below reference them, so a future palette can re-split them without
  // touching a hundred call sites.
  //
  // Note this makes the tile grid monochrome: `tone`/`toneDeep`/`toneLime` used
  // to encode a light-to-dark hierarchy (light-touch tools vs money/records),
  // and that distinction is now gone by design.
  tone: PINE,                      // primary   — the default tile
  toneDeep: PINE,                  // secondary — headline / money / records
  toneLime: PINE,                  // accent    — light-touch tools
  warn: '#F59E0B',                 // Warning   — pending states
  error: '#DC2626',                // Error     — destructive / alert
  muted: '#667066',                // inert rows
};

/* Avatar verification badge — LINE ONLY. The badge silhouette and its glyph are
   drawn as strokes in a single colour with no fill, so the white disc behind
   shows through the shape rather than the shape being a coloured chip.

   #004C40 for verified; the unverified colour is the app's
   `attentionDark` rather than #F59E0B, which at 2.1:1 on white is far too weak
   to carry a hairline stroke.

   Both states use the same `Badge*` silhouette so the shape reads as one thing
   whose state changed, not two unrelated icons.

   Optical size 24 from the Material Symbols reference still holds: the glyph is
   drawn at 24 and the white disc built around it, rather than shrinking a
   larger design down (which is what visually thickens strokes).

   WEIGHT is deliberately off that reference. Mapping its weight-100 / grade -25
   axes gave strokeWidth 1.0, which is too thin for a colour this dark: at 0.055
   luminance a 1px line has too little pigment area for the hue to show and
   reads as a black hairline rather than green. The badge now takes the screen's
   shared ICON_STROKE, which is also what makes it match the header icons and
   the tiles instead of being the one thin mark among them. */
const VERIFIED_ICON = PINE;
const UNVERIFIED_ICON = '#004C40';
const BADGE_ICON_SIZE = 20;
const BADGE_STROKE = ICON_STROKE;

/**
 * Readable glyph for a given tile fill — decided from the fill's OWN luminance
 * rather than by matching it against known tokens.
 *
 * The previous version tested `tone === C.toneLime || tone === C.warn`. That
 * silently inverts the moment two tone tokens share a value, which they now all
 * do: every tile would compare equal to `C.toneLime`, take the "light fill"
 * branch, and paint a near-black glyph onto near-black pine. Reading the colour
 * itself cannot break that way, whatever the palette becomes.
 *
 * The 0.35 crossover reproduces the old hand-picked behaviour exactly: amber
 * #F59E0B (L≈0.44) keeps its dark glyph, danger #DC2626 (L≈0.17) keeps white.
 * It is also why the tile FILLS survived a round-trip through #64FF43 (L≈0.75)
 * and back without a single edit — they flipped to a dark glyph and back on
 * their own. Foreground uses of the colour have no such protection.
 */
const relLuminance = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};
const glyphOn = (tone) => (relLuminance(tone) > 0.35 ? C.label : '#FFFFFF');

// Booking status chip tones. A status is a *label*, not a fill, so each tone is
// a soft wash of its hue with the deep version of that hue as the text. The dot
// carries the hue at full strength, which is what keeps the three states
// distinguishable without three loud solid capsules fighting the card.
const STATUS_TONES = {
  done:    { dot: GREEN_LIGHT, text: GREEN_DARK, bg: 'rgba(126,217,87,0.18)' },
  pending: { dot: C.warn,      text: '#8A5A00',  bg: 'rgba(245,158,11,0.16)' },
  active:  { dot: GREEN,       text: GREEN_DARK, bg: 'rgba(22,187,5,0.12)' },
};

// "INVOICE_GENERATED" → "Invoice Generated". Title case is materially narrower
// than all-caps at the same size, and that width is the whole point: inside a
// half-width rail card the longest statuses used to ellipsise into
// "INVOICE GENERAT…", which reads as a bug rather than a status.
const statusLabel = (s) => String(s || '')
  .replace(/_/g, ' ')
  .trim()
  .toLowerCase()
  .replace(/\b\w/g, (ch) => ch.toUpperCase());

// Amber means "waiting on somebody" (a pickup in motion, an approval), lime
// means the job is off the bench, green means it is being worked on.
const statusTone = (raw) => {
  const s = String(raw || 'NEW').toUpperCase();
  if (/DELIVERED|COMPLETED|READY|CLOSED/.test(s)) return STATUS_TONES.done;
  if (/PICKUP|PENDING|WAITING|APPROVAL/.test(s)) return STATUS_TONES.pending;
  return STATUS_TONES.active;
};

// Liquid Glass surface recipe. `fill` is deliberately high-opacity: without a
// real backdrop blur, anything thinner smears the scrolling content behind it
// instead of frosting it.
const GLASS = {
  fill: 'rgba(255,255,255,0.86)',        // floating chrome
  card: 'rgba(255,255,255,0.92)',        // content cards
  edge: 'rgba(255,255,255,0.85)',        // specular top edge
  hairline: 'rgba(255,255,255,0.55)',    // inner light border
  shadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.10,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  chromeShadow: {
    shadowColor: '#0B1F14',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
};

// SF text styles. `theme/fontScaling.js` already scales every fontSize app-wide
// against the device width, so these are authored at iOS point sizes verbatim.
const T = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,
};

// iOS 26 corner scale.
const R = {
  card: 26,
  control: 999,   // capsule
  tile: 20,
  sheet: 32,
};

// Concentric inner radius: a child inset by `pad` inside a radius-`outer`
// container should curve on the same centre, never tighter than 6.
const concentric = (outer, pad) => Math.max(6, outer - pad);

// Gutter between horizontally-railed cards.
const STAT_GAP = 8;

/* ── Overview stats ────────────────────────────────────────────────────────
   Each metric is a soft grey card: a tinted disc holding the icon, the figure
   in the metric's colour, and its label. FOUR across, no underline.

   The card is a FLAT #F8F8F8 fill — no shadow, and no border either. On the
   white page the fill alone is what separates a card from the page and from its
   neighbour, which is the whole reason it can go borderless: adding a hairline
   on top of a visible fill just draws the same edge twice. It also means the
   gutter can come back down from the 14 the borderless build needed, since the
   fill now does the separating that whitespace was doing alone.

   Overview is the ONE place that stays polychrome, deliberately against the
   monochrome pine the Shortcut tiles use. Seven stats on a scrolling rail are
   otherwise identical shapes, and colour is the only thing that lets you find
   "Pickup Request" without reading all seven labels. The Shortcut grid has the
   opposite problem — twelve-plus tiles where per-tile colour is just noise —
   which is why the two disagree on purpose. */
// Gap above Overview, Service Access and Employee Management. Was 26 — three
// stacked sections turned that into 78pt of nothing before any content. The
// later sections (Recent Bookings, Marketplace, Sell) keep 26 deliberately:
// they are cards and rails that need more air than a tight run of icon grids.
const SECTION_GAP = 16;

// Gutter between category tiles (Marketplace, Sell a Device). Named because the
// tablet tile width is now solved against it — the two must agree or the row
// stops filling the screen.
const CAT_GAP = 12;

// The screen's one soft surface: Overview's stat cards and the Service Access
// discs both sit on it, so they read as the same material.
const SOFT_SURFACE = '#F8F8F8';
const OV_CARD_BG = SOFT_SURFACE;
// Service Access glyph. Fixed 20px rather than a fraction of the disc, so the
// icon stays the same size whatever width the rail resolves to. 18 is the
// other value that was on the table — one constant, one edit.
const QA_ICON_SIZE = 20;
const QA_ICON_STROKE = ICON_STROKE;
// Tile sized off the GLYPH, not off the column: 20px icon plus 13pt of grey
// each side. The old grid derived it from the column width and reached 60,
// which ringed a 20px icon in 40pt of empty grey — the space complaint.
//
// Radius 10 on a 46pt square — a rounded square, no longer a circle. `QA_DISC`
// keeps its name because it is still the tile's size on both axes; only the
// corner treatment changed.
const QA_DISC = 42;
const QA_DISC_RADIUS = 5;
// Five columns. With the current six tiles that lays out 5 + 1 — a full first
// row and a single tile alone on the second. Filling a true 5 x 2 needs ten
// tiles; four of the six removed earlier are sitting ready in the block under
// QUICK_ACTIONS.
//
// Five is the tightest column count the labels survive. The binding label is
// "Customers" — 9 characters, ~59pt at caption1, and the only one that cannot
// break across two lines. Five columns give it 62pt even on a 360px phone; six
// would give 50-58pt and ellipsise it.
const QA_COLS = 5;
const OV_CARD_RADIUS = 12;
const OV_ITEM_GAP = 10;
const OV_DISC = 32;
const OV_ICON_STROKE = ICON_STROKE;

const OV_TONE = {
  total: '#17A34A',      // green
  active: '#2E90FA',     // blue
  pickups: '#6D3BF5',    // violet
  request: '#F04E23',    // orange
  accepted: '#0E9384',   // teal
  // Darkened from the reference's #F5A524, which is 2.0:1 on white — the "7"
  // would be barely readable and the disc glyph worse. #D97706 is the same
  // amber a step down in value and clears the 3:1 large-text floor at 3.2:1.
  ready: '#D97706',      // amber
  delivered: '#9B4DEE',  // purple
};

// Same colour at low alpha for the icon disc behind each glyph. Kept as a
// function rather than seven more hex constants so a tone change can never
// leave its tint behind pointing at the old hue.
const withAlpha = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const NAV_H = 46;               // iOS 26 controls are a touch taller
const SHEET_RADIUS = R.sheet;

// On regaining focus we refresh the Recent Bookings list silently, but only if
// the cached data is older than this. Stops Home from visibly re-loading every
// single time you return to it (e.g. right after the booking → assign flow).
const HOME_REFRESH_STALE_MS = 15000;

function useBookingCounts() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ticketApi.get('/tickets/counts');
      setCounts(data || {});
    } catch (e) {
      setError(e.message || 'Failed to load counts');
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = counts
    ? {
        serviceAccepted: Number(counts.CREATED ?? 0),
        technicianAssigned: Number(counts.assignedCount ?? 0),
        inServiceProcess: Number(counts.IN_DIAGNOSIS ?? 0) + Number(counts.IN_REPAIR ?? 0),
        // The whole repaired-and-waiting band, not just READY — generating an
        // invoice advances the ticket to INVOICE_GENERATED while the device is
        // still on the shelf. Summed over the same key list the
        // READY_FOR_DELIVERY chip filters on (see bookingScopes.js), so this
        // card and the list it opens can't disagree.
        readyForDelivery: READY_BAND.reduce((n, k) => n + Number(counts[k] ?? 0), 0),
        delivered: Number(counts.DELIVERED ?? 0),
        cancelled: Number(counts.CANCELLED ?? 0),
        workPending: Number(counts.QUOTED ?? 0) + Number(counts.APPROVED ?? 0),
        total: Number(counts.total ?? 0),
        revenue: Number(counts.revenue ?? counts.totalRevenue ?? counts.monthlyRevenue ?? 0),
      }
    : null;

  return { summary, loading, error, refresh: load };
}

// Service Access grid — the iOS equivalent of a Shortcuts / Control Centre grid.
// The on-screen title has been "Shortcuts", then "Quick Access", now "Service
// Access"; the code name `QUICK_ACTIONS` has stayed put through all three, so
// don't read it as the current label.
//
// The tone split below is now VESTIGIAL: `C.tone`, `C.toneDeep` and `C.toneLime`
// all resolve to PINE, so every tile fills identically and these three groups
// are a distinction the screen no longer draws. Kept because re-splitting the
// tokens is how the grouping comes back, and the intent is worth not losing:
//   · PRIMARY  — the counter work you do all day (book, look up, reply).
//   · DEEP     — the books: money and history, i.e. things already recorded.
//   · LIME     — light-touch reference tools you dip into, not workflows.
// NOTE: the hosted New Booking artwork (media.ggfix.in/shop/…svg) is no longer
// rendered. Every tile is a lucide glyph on a grey disc now, so a full-colour
// raster in one slot would be the odd one out. The `image` field and its
// fallback machinery are gone with it.

const QUICK_ACTIONS = [
  // ClipboardPlus, not PlusCircle: the reference draws this as a checklist with
  // a plus, which says "open a new job sheet" where a bare plus says only "add".
  { key: 'RepairServiceBookingShop', label: 'Book Service', icon: ClipboardPlus, color: C.tone, via: 'parent' },
  // Requote sits next to Book Service because it is the same kind of thing — a
  // way into a booking. It opens the bookings list, from where a tapped row goes
  // on to Edit Booking. The `menu: 'RE_ESTIMATED'` param is the LIST's own scope
  // name and is unrelated to this tile's label — renaming the tile must not
  // touch it.
  { key: 'BookingList', label: 'Requote', icon: Pencil, color: C.tone, via: 'parent',
    params: { menu: 'RE_ESTIMATED', rowTarget: 'EDIT' } },
  // Pickups opens the same bookings list as everything else, narrowed to the
  // four doorstep stages (All Pickups / Request / Accepted / Out for Delivery)
  // instead of the standalone pickup screen, so there is one bookings surface.
  { key: 'BookingList', label: 'Pickups', icon: Truck, color: C.tone, via: 'parent',
    params: { menu: 'PICKUP', preset: 'PICKUP_ALL' } },
  // No History shortcut here. A whole tile that only re-opened the bookings list
  // in "tapping a card shows its timeline" mode was a second door onto a screen
  // this grid already has a door to — and it hid the one thing you actually
  // wanted (one booking's history) behind "open the list, then find the row".
  // History is now a per-card button on the Bookings list itself, sitting next
  // to Assign, so it is one tap from the booking it belongs to.
  // Same ClipboardList glyph the Bookings TAB uses in the bottom bar. This
  // tile and that tab open the same screen, so they carry the same mark — a
  // second, unrelated glyph for one destination made them read as two places.
  { key: 'Bookings', label: 'Bookings', icon: ClipboardList, color: C.tone },
  { key: 'OwnerSearch', label: 'Customers', icon: Users, color: C.tone, via: 'parent' },
  { key: 'ShopChatInbox', label: 'Enquiry', icon: MessageCircle, color: C.tone, via: 'parent' },
  // "Compatibility" is 13 characters and cannot break — it is the one label on
  // any grid that has to shrink to fit its column. See the `minimumFontScale`
  // note in TileGrid.
  { key: 'OwnerModelCompatibility', label: 'Model\nCompatibility', icon: Puzzle, color: C.toneLime, via: 'parent' },
];

/* ── Employee Management ───────────────────────────────────────────────────
   Five tiles, so they fill one row exactly at QA_COLS = 5.

   Every route here is a sibling of OwnerTabs on the owner stack, hence
   `via: 'parent'` on all five.

   Two of these needed a judgement call, both noted on the line:

   · "Permissions" is NOT access control — no such screen exists in this app.
     In this codebase `PERMISSION` is an ATTENDANCE status: the short-leave
     counter that sits beside Present / Late / Leave in the staff report. That
     is the meaning the tile is wired to, and it is the only one that exists.

   · Service Report and Pickup Report pass NO `employee` param, and that
     absence is the mode switch. Both screens already fetched every shop
     booking and then filtered to one person; passing nothing now means "keep
     them all", so Service Report lists every technician's assigned tickets and
     Pickup Report every pickup person's. The same routes still open in
     single-employee mode from an employee's detail page.

   `OwnerStaffReport` was registered but UNREACHABLE before this section — no
   navigate() call anywhere in the app pointed at it. Attendance and Permissions
   are its first doors. Its modes are attendance | late | permission | leave. */
const EMPLOYEE_ACTIONS = [
  { key: 'OwnerEmployeeList', label: 'Team', icon: UsersRound, via: 'parent' },
  { key: 'OwnerStaffReport', label: 'Attendance', icon: CalendarCheck, via: 'parent',
    params: { mode: 'attendance' } },
  { key: 'OwnerEmployeeWorkingRecord', label: 'Service Report', icon: ClipboardList, via: 'parent' },
  { key: 'OwnerEmployeePickupReport', label: 'Pickup Report', icon: PackageSearch, via: 'parent' },
  // OwnerLeaveRequests, not OwnerStaffReport's 'leave' mode: an owner opening
  // "Leave" wants the approve/reject queue, not a read-only day count.
  { key: 'OwnerLeaveRequests', label: 'Leave', icon: CalendarOff, via: 'parent' },
  { key: 'OwnerStaffReport', label: 'Permissions', icon: Timer, via: 'parent',
    params: { mode: 'permission' } },
];

/* ── Report Management ─────────────────────────────────────────────────────
   Three tiles, so at QA_COLS = 5 they occupy a single row with two empty slots
   at the right rather than wrapping.

   All three are siblings of OwnerTabs on the owner stack, hence `via: 'parent'`
   on each — including Service Status. Its old entry in the Service Access grid
   omitted `via`, which meant it relied on React Navigation bubbling an
   unhandled navigate up from the tab navigator rather than being addressed
   directly. Explicit here, matching every other stack route in this file.

   Revenue and Cash Book had no entry point anywhere in the app after they were
   dropped from Service Access; this section is their way back. */
const REPORT_ACTIONS = [
  { key: 'OwnerRevenue', label: 'Revenue', icon: IndianRupee, via: 'parent' },
  { key: 'BookingStatus', label: 'Service Status', icon: BarChart3, via: 'parent' },
  // Different books from Invoices: Invoices is what was BILLED, Cash Book is
  // what actually moved through the drawer — rent, salary and a spare bought
  // for cash never touch a ticket.
  { key: 'OwnerCashBook', label: 'Cash Book', icon: BookText, via: 'parent' },
];

/* ── Tiles with no home ────────────────────────────────────────────────────
   Of the six dropped from Service Access earlier, five are back:

     Revenue, Cash Book, Service Status  -> Report Management above
     Model Compatibility                 -> Service Access
     Employees                           -> "Team" in Employee Management

   ONE is still orphaned:

     Billing (Invoices) — registered as a tab but listed in `HIDDEN_TABS` in
                          OwnerNavigator, which keeps it off the bar precisely
                          because it was "navigable from the Dashboard". With
                          no tile, nothing in the app opens it. Either restore
                          the tile or drop 'Billing' from HIDDEN_TABS:

     { key: 'Billing', label: 'Invoices', icon: Receipt, color: C.toneDeep },

   `Receipt` and `UserCog` are now imported for nothing but that line and the
   old Employees entry — kept so restoring stays a one-line change. ────────── */

// Emoji fallbacks for the category rails — mirrors the customer app's category
// styling so both stores read the same. Used when a category has no image_url.
const BUY_CAT_META = {
  MOBILE:        { emoji: '📱' },
  SMARTPHONE:    { emoji: '📱' },
  LAPTOP:        { emoji: '💻' },
  SMARTWATCH:    { emoji: '⌚' },
  SMARTWATCHES:  { emoji: '⌚' },
  TABLET:        { emoji: '📲' },
  AUDIO:         { emoji: '🎧' },
  AUDIO_DEVICES: { emoji: '🎧' },
};
const BUY_CAT_DEFAULT = { emoji: '📦' };

function buyCatImage(item) {
  if (!item) return null;
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}

// Account sheet menu (opened from the nav-bar avatar) — mirrors the My Account
// screen's profile list. KYC routes to View/Intro based on submission.
const ACCOUNT_MENU = [
  { route: 'OwnerPersonalInfo',  label: 'Personal Information',   sub: 'Name, mobile, email',      icon: User,          color: C.tone },
  { route: 'OwnerQrCode',        label: 'My QR Code',             sub: 'Share your shop',          icon: QrCode,        color: C.toneLime },
  { route: 'OwnerShopInfo',      label: 'Shop Information',       sub: 'Address, hours, GST',      icon: Store,         color: C.tone },
  { route: 'KYC',                label: 'KYC Documents',          sub: 'Aadhar, PAN, GST / Udyam', icon: FileText,      color: C.toneDeep },
  { route: 'OwnerPickupSlots',   label: 'Pickup Service',         sub: 'On/off, slots & zones',    icon: Truck,         color: C.tone },
  { route: 'MarketplaceOrders',  label: 'My Orders',              sub: 'Marketplace purchases',    icon: Package,       color: C.toneDeep },
  { route: 'OwnerCart',          label: 'My Cart',                sub: 'Items in your cart',       icon: ShoppingCart,  color: C.toneLime },
  { route: 'OwnerEmployeeList',  label: 'Employee Management',    sub: 'Add, edit & track team',   icon: Users,         color: C.tone },
  { route: 'OwnerLeaveRequests', label: 'Leave Requests',         sub: 'Approve or reject leave',  icon: CalendarClock, color: C.warn },
];

function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function shopInitial(name) {
  if (!name) return 'G';
  const letters = String(name).trim().split(/\s+/).map((w) => w[0]).join('');
  return letters.slice(0, 2).toUpperCase() || 'G';
}

/* ── iOS primitives ─────────────────────────────────────────────────────── */

// Pressable with press feedback, WITHOUT using React Native's `style={({pressed})
// => …}` callback form.
//
// This app compiles with `jsxImportSource: 'nativewind'`, so NativeWind's jsx
// wrapper swaps every <Pressable> for its cssInterop wrapper. That wrapper does
// not survive the callback form of `style` — the entire returned object is
// dropped, not just the pressed branch. Symptom: rows lose flexDirection,
// padding and background all at once and collapse into a vertical stack, while
// the plain <View>s beside them lay out fine.
//
// Plain style OBJECTS always survive the swap (they are what the rest of this
// app uses), so press state is tracked here and merged into a single object.
function Touchable({ style, pressedStyle, onPressIn, onPressOut, children, ...rest }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      style={pressed && pressedStyle ? { ...style, ...pressedStyle } : style}
      onPressIn={(e) => { setPressed(true); if (onPressIn) onPressIn(e); }}
      onPressOut={(e) => { setPressed(false); if (onPressOut) onPressOut(e); }}
    >
      {children}
    </Pressable>
  );
}

// A Liquid Glass surface: translucent body, a bright specular line along the
// top edge, a light inner border and a soft float shadow. This is the single
// component every card / capsule / bar on this screen is built from.
//
// The specular edge is an absolutely-positioned 1px child rather than a
// borderTopWidth, because a real border would also darken the sides and kill
// the "lens" read.
function Glass({ radius = R.card, style, fill = GLASS.card, shadow = GLASS.shadow, children, tinted }) {
  // Inset the specular line so it stops before the corner arcs start. Capsules
  // pass radius 999, so this must be clamped or the line would have negative
  // width and vanish.
  const edgeInset = Math.min(radius * 0.5, 26);
  return (
    <View style={[{ borderRadius: radius, backgroundColor: fill }, shadow, style]}>
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: radius,
          borderWidth: HAIRLINE,
          borderColor: tinted ? 'rgba(255,255,255,0.35)' : GLASS.hairline,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: edgeInset, right: edgeInset,
          height: 1, backgroundColor: tinted ? 'rgba(255,255,255,0.45)' : GLASS.edge,
          borderRadius: 1,
        }}
      />
      {children}
    </View>
  );
}

// Icon tile. iOS 26 icons are squircle-ish (radius ≈ 28% of the side) and carry
// a top-down gradient plus a specular edge, the same treatment as a Home Screen
// app icon under Liquid Glass.
function IconSquare({ icon: Icon, color, size = 30, glyph = 17 }) {
  const radius = Math.round(size * 0.28);
  return (
    <LinearGradient
      colors={[lighten(color), color]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{
        width: size, height: size, borderRadius: radius,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: color, shadowOpacity: 0.3, shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 }, elevation: 2,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: radius * 0.5, right: radius * 0.5,
          height: 1, backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      />
      <Icon size={glyph} color={glyphOn(color)} strokeWidth={ICON_STROKE} />
    </LinearGradient>
  );
}

// Cheap top-stop for the icon gradient: lift the colour toward white ~22%.
// Accepts #RRGGBB (every colour in `C` is that form).
function lighten(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.22);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// Section header. iOS 26 favours a bold inline title over the old tiny
// uppercase grouped-table caption, with a tinted trailing action.
function GroupHeader({ title, action, onAction, pad, style }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: pad + 4, marginBottom: 7 },
        style,
      ]}
    >
      <Text
        style={{ fontSize: T.title3, color: C.label, letterSpacing: -0.45, fontWeight: '500', flex: 1 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {action ? (
        <Touchable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={8}
          pressedStyle={{ opacity: 0.4 }}
        >
          <Text style={{ fontSize: T.subhead, color: C.tint, fontWeight: '400', letterSpacing: -0.2 }}>
            {action}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

// Inset wrapper every section list sits inside.
//
// Was a glass card — an rgba-white fill plus a float shadow. Both are gone by
// request, so each section now sits directly on the white page and this is
// purely the shared horizontal inset plus corner clipping.
//
// The clipping stays on an INNER view. That split originally existed because
// iOS drops a view's own shadow when the same node sets `overflow: 'hidden'`;
// with no shadow left that reason is gone, but the inner view still does real
// work — it is what keeps the Overview rail's chips from spilling past the
// rounded corners as they scroll.
function Group({ children, pad, style }) {
  return (
    <View style={[{ marginHorizontal: pad }, style]}>
      <View style={{ borderRadius: R.card, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

// Standard iOS table row: leading accessory, title (+ optional subtitle),
// right-aligned secondary value, then a trailing accessory (checkmark or
// disclosure chevron). Press paints the row with systemFill rather than fading
// it, which is the native behaviour.
function Row({
  leading, leadingWidth = 30, title, subtitle, value, onPress,
  accessory = 'chevron', titleColor, disabled, last,
}) {
  const insetLeft = leading ? 18 + leadingWidth + 12 : 18;
  return (
    <>
      <Touchable
        onPress={onPress}
        disabled={disabled || !onPress}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          minHeight: 54,
          paddingVertical: subtitle ? 10 : 9,
          backgroundColor: 'transparent',
        }}
        pressedStyle={{ backgroundColor: C.highlight }}
      >
        {leading ? <View style={{ width: leadingWidth, marginRight: 12 }}>{leading}</View> : null}
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text
            style={{ fontSize: T.body, color: titleColor || C.label, letterSpacing: -0.4 }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: T.subhead, color: C.label2, marginTop: 1, letterSpacing: -0.2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value !== undefined && value !== null && value !== '' ? (
          <Text style={{ fontSize: T.body, color: C.label2, letterSpacing: -0.4 }} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {accessory === 'chevron' ? (
          <ChevronRight size={18} color={C.label3} strokeWidth={ICON_STROKE} style={{ marginLeft: 6, marginRight: -4 }} />
        ) : accessory === 'check' ? (
          <Check size={19} color={C.tint} strokeWidth={ICON_STROKE} style={{ marginLeft: 6, marginRight: -2 }} />
        ) : null}
      </Touchable>
      {last ? null : <View style={{ height: HAIRLINE, backgroundColor: C.separator, marginLeft: insetLeft }} />}
    </>
  );
}

// Row list that drops the trailing separator — iOS never draws one on the last
// row of a group. Children must be <Row> elements (they take a `last` prop).
function RowGroup({ children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((child, i) =>
        React.cloneElement(child, { key: child.key ?? i, last: i === items.length - 1 }),
      )}
    </>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export default function DashboardScreen({ navigation, onLogout }) {
  const { summary, loading, error, refresh } = useBookingCounts();
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState(null);
  const [showShopList, setShowShopList] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [buyCats, setBuyCats] = useState([]);
  const [latest, setLatest] = useState([]);
  const [pickupCounts, setPickupCounts] = useState({ all: 0, request: 0, accepted: 0 });
  const [showSheet, setShowSheet] = useState(false);
  // 'account' = full profile menu (avatar / name tap).
  // 'shops'   = shop switcher ONLY (the ⇄ button) — no settings, no log out.
  const [sheetMode, setSheetMode] = useState('account');
  const [sheetRendered, setSheetRendered] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [hasKycDocs, setHasKycDocs] = useState(false);
  // PENDING_REVIEW | APPROVED | REJECTED, or null when never submitted.
  const [kycStatus, setKycStatus] = useState(null);
  // Timestamp of the last Recent-Bookings load + an in-flight guard, used to
  // throttle/dedupe the on-focus refresh so returning to Home doesn't
  // refetch/flicker on every focus (or double-load with the mount effect).
  const latestLoadedAtRef = useRef(0);
  const latestLoadingRef = useRef(false);

  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isTablet = winW >= 680;
  // iOS inset-grouped side margin: 16 at compact width, 20 on regular width.
  const PAD = isTablet ? 20 : 16;
  // The header is a three-line identity block, and `theme/fontScaling.js`
  // rescales every font at runtime, so its height is MEASURED rather than
  // derived from constants — otherwise the scroll view's top inset drifts out
  // of step with the bar on large-font devices. NAV_H is the initial estimate
  // used for the very first frame only.
  const [headerBodyH, setHeaderBodyH] = useState(NAV_H + 38);
  const headerH = insets.top + headerBodyH;

  // Collapsing large title — the inline title and the nav-bar hairline fade in
  // as the large title scrolls up under the bar (native-driver safe: opacity
  // and transform only).
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );
  const collapse = scrollY.interpolate({ inputRange: [12, 48], outputRange: [0, 1], extrapolate: 'clamp' });

  // Slide the account sheet up from the bottom; keep it mounted through the
  // slide-out so the close animation plays before unmount.
  useEffect(() => {
    if (showSheet) {
      setSheetRendered(true);
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 22, tension: 140 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setSheetRendered(false);
      });
    }
  }, [showSheet, slideAnim]);

  // Poll the shop-side notification feed for the Bell badge. Same cadence as
  // the chat poll so a new booking lights up the bell without a manual refresh.
  const refreshNotifs = useCallback(async () => {
    try {
      const count = await getNotifUnreadCount().catch(() => 0);
      setNotifUnread(Number(count) || 0);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => { if (!cancelled) await refreshNotifs(); };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshNotifs]);

  // Recent Bookings — newest tickets, enriched with the model's catalog image
  // (same trick as BookingHistoryScreen), newest first.
  const loadLatest = useCallback(async () => {
    if (latestLoadingRef.current) return; // dedupe overlapping loads (mount + first focus)
    latestLoadingRef.current = true;
    try {
      const data = await ticketApi.get('/tickets', { query: { page: 0, size: 20 } });
      const content = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      const brandIds = Array.from(new Set(content.map((t) => t.brandId).filter(Boolean)));
      const modelById = {};
      if (brandIds.length) {
        await Promise.all(brandIds.map(async (bId) => {
          try { (await getModelsByBrand(bId) || []).forEach((m) => { modelById[m.id] = m; }); } catch {}
        }));
      }
      const enriched = content.map((t) => {
        const m = t.modelId ? modelById[t.modelId] : null;
        const modelUrl = resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
        return {
          ...t,
          _modelImage: t.deviceImageUrl || modelUrl || null,
          _modelName: m?.name || t.deviceDisplayName || t.modelName || null,
        };
      });
      enriched.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      // The Recent Bookings rail scrolls horizontally, so it can hold more
      // than a static grid would; "See All" still jumps to the full Bookings
      // screen for anything older.
      setLatest(enriched.slice(0, 12));
    } catch {
      // Keep the cached list on a background refresh failure — don't blank the
      // screen (that reads as a jarring reload).
    } finally {
      latestLoadedAtRef.current = Date.now();
      latestLoadingRef.current = false;
    }
  }, []);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  // Pickup snapshot counts — repair pickups live in order-service
  // repair_bookings (serviceMode === 'PICKUP'), not in /tickets/counts, so
  // fetch them here. Split into "awaiting the shop's first action" vs
  // "accepted and still in flight" using the same scope predicates the
  // bookings list filters by, so card and chip always agree.
  const loadPickups = useCallback(async () => {
    try {
      const rows = pickupsOnly(await listShopRepairBookings());
      setPickupCounts({
        all: countScope(SCOPES.PICKUP_ALL, { pickups: rows }),
        request: countScope(SCOPES.PICKUP_REQUEST, { pickups: rows }),
        accepted: countScope(SCOPES.PICKUP_ACCEPTED, { pickups: rows }),
      });
    } catch {}
  }, []);

  useEffect(() => { loadPickups(); }, [loadPickups]);

  // Revenue — /tickets/counts carries no money at all (the old
  // `counts.revenue ?? counts.totalRevenue ?? counts.monthlyRevenue` chain
  // always resolved to 0), so the figure is summed client-side from delivered
  // bookings, exactly as the Revenue report screen does.
  //
  // All-time, not this month: a shop whose last delivery was in a previous
  // month saw a bare ₹0, which reads as "no earnings" rather than "none this
  // month". The Revenue screen still breaks it down by day/week/month.

  // Refresh the bell badge whenever Home regains focus. The heavier bookings
  // refetch is throttled + silent (no loader, no blanking) so returning to Home
  // — e.g. right after the booking/assign flow — doesn't visibly reload. The
  // mount load stamps the timestamp, so the first focus (fired right after
  // mount) is skipped instead of double-loading.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      refreshNotifs();
      loadPickups();
      if (Date.now() - latestLoadedAtRef.current > HOME_REFRESH_STALE_MS) loadLatest();
    });
    return unsub;
  }, [navigation, refreshNotifs, loadLatest, loadPickups]);

  const reloadSession = useCallback(async () => {
    try { setSession(await fetchMe()); }
    catch { try { setSession(await getSession()); } catch { setSession(null); } }
  }, []);

  useEffect(() => { reloadSession(); }, [reloadSession]);

  // …and again on every focus. The switcher's shop list comes from this session,
  // so after adding a shop (a stack screen over this tab) a mount-only load left
  // the new shop missing from Switch Account until the app was restarted.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { reloadSession(); });
    return unsub;
  }, [navigation, reloadSession]);

  // Category rail — same source as the customer app's Buy home so the owner
  // browses the marketplace by the same category set. Silent on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getDeviceCategories();
        // Fixed display order: Mobile → Laptop → Tablet → Smartwatches → Audio Device.
        // Unknown categories fall to the end (keeping their API order among them).
        const ORDER = ['mobile', 'laptop', 'tablet', 'smartwatches', 'audio device'];
        const rank = (c) => {
          const i = ORDER.indexOf((c.name || '').trim().toLowerCase());
          return i === -1 ? ORDER.length : i;
        };
        if (!cancelled) {
          setBuyCats(
            (list || [])
              .filter((c) => c.isActive !== false)
              .sort((a, b) => rank(a) - rank(b)),
          );
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve KYC status: `hasKycDocs` routes the sheet row to View (already
  // uploaded) vs Intro (first time) as My Account does, and `kycStatus` drives
  // the avatar's verification badge.
  //
  // Unlike before, this no longer waits for the sheet to open — the badge is
  // visible the moment the dashboard paints, so the status has to be fetched on
  // mount. It still re-runs on every `showSheet` change so that submitting or
  // re-submitting documents inside the sheet refreshes the badge on close.
  useEffect(() => {
    const sid = session?.shopId;
    if (!sid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const kyc = await getOwnerKycDocuments();
        if (cancelled) return;
        setHasKycDocs(!!(kyc && (kyc.aadharFrontUrl || kyc.aadharBackUrl || kyc.panUrl)));
        setKycStatus(kyc?.status || null);
      } catch {
        if (cancelled) return;
        setHasKycDocs(false);
        setKycStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [showSheet, session?.shopId]);

  const shopName = session?.shopName || (session?.shops?.find?.((s) => s.isActive)?.name) || 'Shop · Owner';
  const shops = session?.shops || [];
  // Shop front photo for the nav-bar avatar — same source OwnerQrCode uses.
  // Falls back to the shop initials when no image is set.
  const activeShop = session?.activeShop || shops.find?.((s) => s.isActive) || null;
  // Shop-mobile logins show the SHOP front image; owner logins show the owner's
  // profile avatar (falling back to the shop image when they haven't set one).
  const isShopLogin = session?.loginScope === 'SHOP' || session?.loginType === 'SHOP_LOGIN';
  const shopImage = isShopLogin
    ? (activeShop?.frontImageUrl || null)
    : (session?.avatarUrl || activeShop?.frontImageUrl || null);
  // Only a true shop OWNER (owner-wide session) may add another business
  // location. Shop-mobile logins (loginScope === 'SHOP') and any non-owner role
  // that falls through to the owner navigator must not see "Add Shop".
  const canAddShop = session?.loginScope !== 'SHOP'
    && (session?.roles || []).includes('SHOP_OWNER');
  const greeting = useMemo(() => greetingFor(), []);
  // There is no per-shop `verified` column in the backend — the only reviewed,
  // admin-approved signal that exists today is the OWNER's KYC status
  // (users.kyc_document.status). It is owner-wide, so every shop an owner holds
  // shows the same badge. See the note above the badge markup.
  const isVerified = kycStatus === 'APPROVED';

  /**
   * Same rule as Add Employee: at the plan's shop ceiling, tapping Add Shop
   * must not open the form. Checked against a freshly fetched allowance rather
   * than anything held in state, and the server enforces it again on
   * POST /auth/shop-owners/{id}/locations regardless of what happens here.
   */
  const handleAddShop = async () => {
    const ent = await fetchEntitlements();
    if (ent && !canAddShopOnPlan(ent)) {
      setShowSheet(false);
      await showLimitPopup(navigation, FEATURE.SHOPS, ent);
      return;
    }
    setShowSheet(false);
    // mode:'create' is what separates this from the account menu's "Shop
    // Information" row. Without it the screen hydrates the ACTIVE shop, so
    // "Add Shop" quietly became "edit the shop you are already in".
    gotoParent('OwnerShopInfo', { mode: 'create' });
  };

  const handleSwitch = async (shopId) => {
    if (!shopId || shopId === session?.shopId) { setShowShopList(false); return; }
    setSwitching(true);
    try {
      await switchShop(shopId);
      await reloadSession();
      await refresh();
      await Promise.all([loadLatest(), loadPickups()]);
    } catch (e) {
      // keep the sheet open on failure so the user can retry
    } finally {
      setSwitching(false);
      setShowShopList(false);
      setShowSheet(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadLatest(), loadPickups()]);
    setRefreshing(false);
  };

  const gotoParent = (route, params) => {
    const parent = navigation.getParent && navigation.getParent();
    if (parent) parent.navigate(route, params);
    else navigation.navigate(route, params);
  };

  // One handler for every TileGrid. `via: 'parent'` routes are siblings of
  // OwnerTabs on the owner stack, which the tab navigator cannot reach on its
  // own — every Employee Management destination is one of those.
  const openTile = (t) => {
    if (t.via === 'parent') gotoParent(t.key, t.params);
    else navigation.navigate(t.key, t.params);
  };


  if (loading && !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.placeholder} />
      </View>
    );
  }

  const total = summary?.total ?? 0;
  // "Active" = everything still in the pipeline, i.e. every booking that hasn't
  // reached a terminal status. Derived by subtraction rather than by adding the
  // individual status counts: /tickets/counts exposes assignedCount as
  // "has a technician" (countByAssignedTechnicianIdNotNull), which is
  // orthogonal to status, so the old CREATED + assignedCount + IN_DIAGNOSIS +
  // IN_REPAIR sum counted every assigned in-repair ticket twice. Subtraction
  // also picks up the intermediate statuses (READY / INVOICE_* / QUOTED …)
  // that the sum silently dropped, and matches the ACTIVE preset the card
  // drills into (BookingHistoryScreen excludes the same two statuses).
  const activeCount = Math.max(0, total - (summary?.delivered || 0) - (summary?.cancelled || 0));
  const deliveredCount = summary?.delivered || 0;
  const readyForDelivery = summary?.readyForDelivery || 0;

  // Overview rail. Every chip opens the bookings list scoped to the matching
  // preset (BookingList is the stack copy, pushed so the preset gets its own
  // screen with a back button instead of sticking to the Bookings tab), and the
  // numbers come from the same scope predicates the list filters by — so the
  // figure on the chip is always the length of the list it opens.
  //
  // That invariant is why there is no "Cancelled" chip to round the count up:
  // `bookingScopes` has no preset for it, so such a chip would open a list that
  // disagrees with its own badge.
  //
  // One colour per metric, straight off the reference. Unlike the Shortcut
  // tiles these are identity, not decoration — the colour is how you pick a
  // given card out of seven identical shapes on a scrolling rail.
  // `label` is the spoken/accessible name; `short` is the same thing pre-broken
  // with a "\n" for the two-line card. The PRESET strings below are the bookings
  // list's own scope names — they are wire values, not display text, so renaming
  // a card must never touch them.
  const overview = [
    { label: 'Service Orders',   short: 'Service\nOrders',   value: total,                 icon: PackageCheck,   color: OV_TONE.total,     onPress: () => navigation.navigate('Bookings') },
    { label: 'Active Jobs',      short: 'Active\nJobs',      value: activeCount,           icon: Clock,          color: OV_TONE.active,    onPress: () => gotoParent('BookingList', { preset: 'ACTIVE' }) },
    // Every pickup card lands on the PICKUP tile set, not the ticket book —
    // those scopes were removed from the default list, so without `menu` the
    // preset would have no tile to select and the screen would fall back to All.
    { label: 'Pickup Queue',     short: 'Pickup\nQueue',     value: pickupCounts.all,      icon: Truck,          color: OV_TONE.pickups,   onPress: () => gotoParent('BookingList', { menu: 'PICKUP', preset: 'PICKUP_ALL' }) },
    { label: 'Pickup Requests',  short: 'Pickup\nRequests',  value: pickupCounts.request,  icon: Package,        color: OV_TONE.request,   onPress: () => gotoParent('BookingList', { menu: 'PICKUP', preset: 'PICKUP_REQUEST' }) },
    { label: 'Pickup Confirmed', short: 'Pickup\nConfirmed', value: pickupCounts.accepted, icon: ClipboardCheck, color: OV_TONE.accepted,  onPress: () => gotoParent('BookingList', { menu: 'PICKUP', preset: 'PICKUP_ACCEPTED' }) },
    { label: 'Delivery Ready',   short: 'Delivery\nReady',   value: readyForDelivery,      icon: CheckCircle2,   color: OV_TONE.ready,     onPress: () => gotoParent('BookingList', { preset: 'READY_FOR_DELIVERY' }) },
    { label: 'Delivered',        short: 'Delivered',         value: deliveredCount,        icon: PackageOpen,    color: OV_TONE.delivered, onPress: () => gotoParent('BookingList', { preset: 'DELIVERED' }) },
  ];

  // Overview rail geometry — solved for FOUR visible, not a divisor. Four
  // columns and the three gutters between them have to fill the inner width
  // exactly, so the gutters come out of the width first; dividing by 4 alone
  // would overflow by 3 gaps and push the fourth column off screen.
  //
  // Seven metrics live on the rail. A phone shows four and scrolls; a TABLET
  // shows all seven, because at 8 columns the eighth slot was always empty —
  // the rail was solving for a card count that does not exist, leaving ~90pt
  // of dead width and squeezing every card to 82pt on a 768pt screen.
  const OV_VISIBLE = isTablet ? 7 : 4;
  const ovInner = winW - PAD * 2;
  const ovItemW = Math.round((ovInner - OV_ITEM_GAP * (OV_VISIBLE - 1)) / OV_VISIBLE);
  // Wider cards deserve bigger contents; the phone's compact 32pt disc and
  // 22pt figure read as undersized on a tablet.
  const ovDisc = isTablet ? 44 : OV_DISC;
  const ovNumSize = isTablet ? T.title1 : T.title2;

  // Category rail tiles (Marketplace, Sell a Device). On a phone this is a
  // scrolling rail of small tiles. On a tablet the five categories were using
  // 440pt of a 728pt row and bunching against the left edge, so the tile is
  // solved to fill the width instead — capped so a large tablet does not turn
  // a category chip into a billboard.
  const catTile = isTablet
    ? Math.min(140, Math.round((winW - PAD * 2 - CAT_GAP * 4) / 5))
    : 72;

  // Recent-booking cards live in a horizontal rail. Four fit across a tablet;
  // on a phone the card is sized so 2 sit fully on screen with a sliver of the
  // third showing — that peek is what tells you the rail scrolls.
  const bookingCardW = isTablet
    ? Math.round((winW - PAD * 2 - STAT_GAP * 3) / 4)
    : Math.round((winW - PAD * 2 - STAT_GAP) / 2.2);

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      {/* The page is plain white by request. The green-to-grey ambient wash that
          used to sit here (a 320px LinearGradient from #E6F7E3) is gone — it was
          what gave the floating glass chrome something to pick colour up from,
          so the header plate now reads by its hairline and shadow alone. */}

      <Animated.ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: headerH + 6, paddingBottom: 32 }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={headerH}
            tintColor={C.placeholder}
            colors={[GREEN_DARK]}
          />
        }
      >
        {/* ── Search — a glass capsule, the iOS 26 control shape ───────── */}
        <Glass
          radius={R.control}
          style={{ marginHorizontal: PAD }}
          shadow={{
            shadowColor: '#0B1F14', shadowOpacity: 0.07, shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 }, elevation: 2,
          }}
        >
          {/* Three separate targets, not one. The mic used to be a bare icon
              inside the single Touchable that wraps this whole row, so it had
              no handler of its own — tapping it just opened plain search, which
              is why voice "did nothing". Each control is now its own Pressable
              and carries a `launch` param the search screen acts on. */}
          <View
            style={{
              height: 44,
              borderRadius: R.control,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 16,
              paddingRight: 8,
            }}
          >
            <Touchable
              onPress={() => gotoParent('OwnerSearch')}
              accessibilityRole="search"
              accessibilityLabel="Search"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%' }}
              pressedStyle={{ opacity: 0.6 }}
            >
              <Search size={18} color={C.placeholder} strokeWidth={ICON_STROKE} />
              <Text
                style={{ flex: 1, marginLeft: 8, fontSize: T.callout, color: C.placeholder, letterSpacing: -0.3 }}
                numberOfLines={1}
              >
                Device, ticket ID, customer
              </Text>
            </Touchable>
            <Touchable
              onPress={() => gotoParent('OwnerSearch', { launch: 'voice' })}
              accessibilityRole="button"
              accessibilityLabel="Voice search"
              hitSlop={8}
              style={{ height: 34, width: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
              pressedStyle={{ opacity: 0.45 }}
            >
              <Mic size={18} color={C.placeholder} strokeWidth={ICON_STROKE} />
            </Touchable>
            <Touchable
              onPress={() => gotoParent('OwnerSearch', { launch: 'image' })}
              accessibilityRole="button"
              accessibilityLabel="Image search"
              hitSlop={8}
              style={{ height: 34, width: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
              pressedStyle={{ opacity: 0.45 }}
            >
              <Camera size={18} color={C.placeholder} strokeWidth={ICON_STROKE} />
            </Touchable>
          </View>
        </Glass>

        {/* ── Overview — horizontal rail of circular actions ───────────────
             Was a 4-column wrapping grid two rows tall. A rail costs one row
             instead of two, and — the reason it changed — it no longer has to
             be re-balanced every time a status is added: a seventh or eighth
             chip just extends the scroll rather than leaving a ragged half-row
             that needed a double-width tile to plug it. ─────────────────── */}
        <View style={{ marginTop: SECTION_GAP }}>
          <OverviewHeader pad={PAD} />
          {/* No `Group` wrapper. Group clips its children to a 26pt radius,
              which would shave the end columns at both ends of the rail, and it
              exists to draw a card surface these stats no longer have. The rail
              runs straight on the page with the gutter as content padding,
              which also lets a column bleed off the screen edge as it scrolls. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={ovItemW + OV_ITEM_GAP}
            snapToAlignment="start"
            contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: 4 }}
          >
            {overview.map((s, i) => (
              <OverviewStat
                key={s.label}
                icon={s.icon}
                tone={s.color}
                value={s.value}
                label={s.short}
                width={ovItemW}
                disc={ovDisc}
                numSize={ovNumSize}
                last={i === overview.length - 1}
                accessibilityLabel={`${s.label}, ${s.value}`}
                onPress={s.onPress}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Service Access ──────────────────────────────────────────── */}
        <View style={{ marginTop: SECTION_GAP }}>
          <GroupHeader title="Service Access" pad={PAD} />
          <TileGrid items={QUICK_ACTIONS} pad={PAD} onPress={openTile} />
        </View>

        {/* ── Employee Management ─────────────────────────────────────── */}
        <View style={{ marginTop: SECTION_GAP }}>
          <GroupHeader title="Employee Management" pad={PAD} />
          <TileGrid items={EMPLOYEE_ACTIONS} pad={PAD} onPress={openTile} />
        </View>

        {/* ── Report Management ───────────────────────────────────────── */}
        <View style={{ marginTop: SECTION_GAP }}>
          <GroupHeader title="Report Management" pad={PAD} />
          <TileGrid items={REPORT_ACTIONS} pad={PAD} onPress={openTile} />
        </View>

        {/* ── Recent bookings ─────────────────────────────────────────── */}
        {latest.length > 0 ? (
          <View style={{ marginTop: 26 }}>
            <GroupHeader
              title="Recent Bookings"
              action="See All"
              onAction={() => navigation.navigate('Bookings')}
              pad={PAD}
            />
            {/* Horizontally scrolling card rail. Snaps card-by-card so a swipe
                always lands a card flush against the left gutter. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={bookingCardW + STAT_GAP}
              snapToAlignment="start"
              contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: 2 }}
            >
              {latest.map((t, idx) => {
                const num = t.trackingId || (t.id ? t.id.slice(0, 8).toUpperCase() : '—');
                const device = t._modelName || t.deviceDisplayName || t.modelName || 'Device';
                const customer = t.customerName || t.customerFullName || t.customer?.name || 'Customer';
                const phone = t.customerPhone || t.customer?.phone || t.customerMobile || '';
                // Status chips run on the accent tenth of the palette: lime for
                // done, amber for anything waiting on a person, a soft primary
                // tint for everything mid-repair — see STATUS_TONES.
                const status = statusLabel(t.status || 'NEW');
                const tone = statusTone(t.status);
                return (
                  <View
                    key={t.id || `${num}-${idx}`}
                    style={{
                      width: bookingCardW,
                      marginRight: idx === latest.length - 1 ? 0 : STAT_GAP,
                    }}
                  >
                    <BookingCard
                      image={t._modelImage}
                      device={device}
                      ticketNo={num}
                      customer={customer}
                      phone={phone}
                      status={status}
                      tone={tone}
                      // The "View" link means Device Details — the read-only
                      // view of the booking — matching the Details action on
                      // the Bookings list this rail's "See All" opens. It used
                      // to open TicketDetail, the edit/working screen, so the
                      // same button led somewhere different depending on which
                      // screen you tapped it from. Booking Details is still one
                      // tap away from Device Details.
                      onPress={() => navigation.navigate('DeviceDetail', { ticketId: t.id })}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Marketplace (mirrors the customer Buy home) ──────────────── */}
        {buyCats.length > 0 ? (
          <View style={{ marginTop: 26 }}>
            <GroupHeader
              title="Marketplace"
              action="See All"
              onAction={() => navigation.navigate('Buy', { categoryId: null })}
              pad={PAD}
            />
            <CategoryRail
              pad={PAD}
              tile={catTile}
              categories={buyCats}
              keyPrefix="buy"
              onPick={(c, code) => navigation.navigate('Buy', { categoryId: c.id, categoryCode: code, categoryName: c.name })}
            />
          </View>
        ) : null}

        {/* ── Sell by category (owner sell flow entry) ─────────────────── */}
        {buyCats.length > 0 ? (
          <View style={{ marginTop: 26 }}>
            <GroupHeader
              title="Sell a Device"
              action="Sell"
              onAction={() => navigation.navigate('Sell')}
              pad={PAD}
            />
            <CategoryRail
              pad={PAD}
              tile={catTile}
              categories={buyCats}
              keyPrefix="sell"
              onPick={(c, code) => gotoParent('SelectBrand', { flow: 'OWNER_LIST', categoryId: c.id, categoryCode: code, categoryName: c.name })}
            />
          </View>
        ) : null}

        {/* Grouped-table footnote — the iOS way to close a settings-style feed. */}
        <Text
          style={{
            fontSize: T.footnote,
            color: C.label2,
            textAlign: 'center',
            marginTop: 28,
            marginHorizontal: PAD + 12,
            lineHeight: T.footnote + 5,
          }}
        >
          {error ? 'Some figures could not be refreshed. Pull down to try again.' : 'Pull down to refresh · GGFix for Shops'}
        </Text>
      </Animated.ScrollView>

      {/* ── Floating glass identity header ───────────────────────────────
          Avatar + greeting + shop name + verified badge on the LEFT; switch-
          account and notifications on the RIGHT. It overlays the scroll view
          so content passes underneath — the point of Liquid Glass chrome —
          and its plate is transparent at rest, materialising as you scroll
          (`collapse`) so the page reads as pure content at the top. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top }}
      >
        {/* The glass plate itself — fades in on scroll. */}
        <Animated.View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: GLASS.fill,
            opacity: collapse,
            ...GLASS.chromeShadow,
          }}
        >
          <View
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: HAIRLINE, backgroundColor: C.separator,
            }}
          />
        </Animated.View>

        <View
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== headerBodyH) setHeaderBodyH(h);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: PAD,
            paddingTop: 6,
            paddingBottom: 12,
          }}
        >
          {/* Avatar → My Account (the Settings tab). The name block beside it
              still opens the account sheet; the avatar is the direct route.
              Its own glass ring keeps it legible over
              both the plain page and the fading plate.
              The verification badge is a SIBLING of the Touchable, not a child:
              the avatar clips to a circle with `overflow: 'hidden'`, which would
              shear a badge overhanging its bottom-right corner. */}
          <View>
            <Touchable
              onPress={() => navigation.navigate('MyAccount')}
              accessibilityRole="button"
              accessibilityLabel={isVerified ? 'Account, verified shop' : 'Account, shop not verified'}
              style={{
                height: 46, width: 46, borderRadius: 23, overflow: 'hidden',
                backgroundColor: GREEN_DARK, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)',
                shadowColor: '#0B1F14', shadowOpacity: 0.18, shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 }, elevation: 4,
              }}
              pressedStyle={{ opacity: 0.6 }}
            >
              {shopImage ? (
                <Image source={{ uri: shopImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: T.callout }}>{shopInitial(shopName)}</Text>
              )}
            </Touchable>

            {/* Verification badge — replaces the old "Verified shop" caption
                under the shop name. That caption was hard-coded true for
                everyone, which made it decoration rather than information; this
                reflects the real status and shows the unverified state too. */}
            {/* Decorative to the a11y tree — `pointerEvents: none` keeps the
                badge from stealing the avatar's tap target, so the status is
                announced by the avatar button's own label instead. */}
            <View
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{
                // Disc = the 24px glyph plus a 2px white ring, so the icon is
                // never scaled down off its design grid.
                position: 'absolute', right: -6, bottom: -6,
                height: BADGE_ICON_SIZE + 4, width: BADGE_ICON_SIZE + 4,
                borderRadius: (BADGE_ICON_SIZE + 4) / 2,
                backgroundColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: HAIRLINE, borderColor: C.separator,
                shadowColor: '#0B1F14', shadowOpacity: 0.16, shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 }, elevation: 3,
              }}
            >
              {isVerified ? (
                <BadgeCheck size={BADGE_ICON_SIZE} color={VERIFIED_ICON} strokeWidth={BADGE_STROKE} />
              ) : (
                <BadgeX size={BADGE_ICON_SIZE} color={UNVERIFIED_ICON} strokeWidth={BADGE_STROKE} />
              )}
            </View>
          </View>

          {/* Greeting · shop name — the identity block. Verification now lives
              on the avatar badge, so it is announced there, not here. */}
          <Touchable
            onPress={() => { setSheetMode('account'); setShowSheet(true); }}
            accessibilityRole="button"
            accessibilityLabel={`${greeting}, ${shopName}`}
            style={{ flex: 1, marginLeft: 11, marginRight: 8 }}
            pressedStyle={{ opacity: 0.6 }}
          >
            <Text style={{ fontSize: T.footnote, color: C.label2, letterSpacing: -0.1 }} numberOfLines={1}>
              {greeting}
            </Text>
            <Text
              style={{
                fontSize: T.title3,
                lineHeight: T.title3 + 5,
                fontWeight: '600',
                color: SHOP_NAME_COLOR,
                letterSpacing:0,
                marginTop: 1,
              }}
              numberOfLines={1}
            >
              {shopName}
            </Text>
          </Touchable>

          {/* Trailing actions. These used to sit in one glass capsule with a
              hairline divider — the iOS 26 toolbar grouping. The capsule fill
              and shadow are gone by request, and the divider went with it: it
              existed to split buttons WITHIN a capsule, so on the bare page it
              is just a stray mark implying a group that no longer exists.
              A plain row now, drawn straight on the white page. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 38 }}>
            {/* Switch account — opens a shop-switcher-only sheet. */}
            <Touchable
              onPress={() => { setSheetMode('shops'); setShowShopList(true); setShowSheet(true); }}
              accessibilityRole="button"
              accessibilityLabel="Switch account"
              style={{ paddingHorizontal: 9, paddingVertical: 7 }}
              pressedStyle={{ opacity: 0.4 }}
            >
              <ArrowLeftRight size={20} color={PINE} strokeWidth={HEADER_ACTION_STROKE} />
            </Touchable>
            <Touchable
              onPress={() => navigation.navigate('OwnerNotifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={{ paddingHorizontal: 9, paddingVertical: 7 }}
              pressedStyle={{ opacity: 0.4 }}
            >
              <Bell size={20} color={PINE} strokeWidth={HEADER_ACTION_STROKE} />
              {notifUnread > 0 ? (
                <View
                  style={{
                    position: 'absolute', top: 4, right: 5,
                    minWidth: 9, height: 9, borderRadius: 5,
                    backgroundColor: C.error, borderWidth: 1.5, borderColor: '#FFFFFF',
                  }}
                />
              ) : null}
            </Touchable>
          </View>
        </View>
      </View>

      {/* ── Account sheet ─────────────────────────────────────────────── */}
      <AccountSheet
        rendered={sheetRendered}
        anim={slideAnim}
        insets={insets}
        session={session}
        shopName={shopName}
        shopImage={shopImage}
        shops={shops}
        canAddShop={canAddShop}
        showShopList={showShopList}
        switching={switching}
        hasKycDocs={hasKycDocs}
        mode={sheetMode}
        onToggleShopList={() => setShowShopList((v) => !v)}
        onSwitch={handleSwitch}
        onClose={() => setShowSheet(false)}
        onNavigate={(route) => { setShowSheet(false); gotoParent(route); }}
        onLogout={() => { setShowSheet(false); if (onLogout) onLogout(); }}
        onAddShop={handleAddShop}
      />
    </View>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

/**
 * One Overview stat — tinted icon disc, the figure, its label, on a flat
 * #F8F8F8 card. No shadow, no border, no underline beneath the label.
 *
 * THE COUNT is the headline rather than a 21px badge notched into the icon
 * circle. Overview's whole job is the figure — "how many pickups are waiting"
 * is the question the rail exists to answer — so the number gets the largest,
 * strongest mark and the icon drops back to a quiet cue.
 *
 * The label arrives pre-broken with a "\n" (`short` in the overview array)
 * rather than relying on word wrap, so "Ready for / Delivery" always breaks in
 * the same place. Two lines' worth of height is still reserved even for
 * one-word labels: it used to keep the colour rules aligned, and with those
 * gone it is what stops one-line and two-line columns ending at different
 * heights and ragging the bottom of the rail.
 */
function OverviewStat({ icon: Icon, tone, value, label, onPress, width, last, disc, numSize, accessibilityLabel }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width,
        marginRight: last ? 0 : OV_ITEM_GAP,
        borderRadius: OV_CARD_RADIUS,
        backgroundColor: OV_CARD_BG,
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 8,
      }}
      pressedStyle={{ opacity: 0.6 }}
    >
      <View
        style={{
          width: disc, height: disc, borderRadius: disc / 2,
          backgroundColor: withAlpha(tone, 0.12),
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* 0.5 of the disc, not 0.46: at a thin stroke the glyph loses the
            visual weight a heavier one gave it, so it needs the extra size to
            still hold the middle of the disc. */}
        <Icon size={Math.round(disc * 0.5)} color={tone} strokeWidth={OV_ICON_STROKE} />
      </View>

      <Text
        style={{
          fontSize: numSize, lineHeight: numSize + 2, fontWeight: '600',
          color: tone, marginTop: 4, letterSpacing: -0.5,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>

      {/* Back to caption1 from the caption2 the five-across build needed. Four
          columns give ~80pt each, and the longest words on the rail are
          "Bookings" / "Accepted" / "Delivery" — all 8 characters, ~53pt at this
          size, so they clear the column now. */}
      <Text
        style={{
          fontSize: T.caption1,
          lineHeight: T.caption1 + 3,
          minHeight: (T.caption1 + 3) * 2,
          color: C.label2,
          textAlign: 'center',
          marginTop: 1,
          paddingHorizontal: 2,
          letterSpacing: -0.1,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Touchable>
  );
}

/**
 * The tile grid shared by Service Access and Employee Management.
 *
 * Extracted when the second section arrived: the two are the same object — a
 * soft-grey rounded square holding a pine outline glyph, with a two-line label
 * under it — and keeping one copy is what stops the sections drifting apart the
 * next time a radius or a stroke changes.
 *
 * Static grid, no scroll: every tile is on screen at once, nothing hidden
 * behind a gesture. No `Group` wrapper either — it added 32pt of its own
 * padding and clipped to a 26pt radius.
 *
 * The tile is a fixed 46 rather than a fraction of the column. Derived from the
 * column it used to reach 60, ringing a 20px glyph in 40pt of empty grey.
 *
 * The label reserves two lines' height even when it uses one, so tiles in the
 * same row end level instead of ragging with the label length.
 */
function TileGrid({ items, pad, onPress }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: pad - 2 }}>
      {items.map((t) => {
        const Icon = t.icon;
        return (
          <Touchable
            key={t.label}
            onPress={() => onPress(t)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={{
              width: `${100 / QA_COLS}%`,
              paddingVertical: 5,
              paddingHorizontal: 2,
              alignItems: 'center',
            }}
            pressedStyle={{ opacity: 0.45 }}
          >
            <View
              style={{
                width: QA_DISC,
                height: QA_DISC,
                borderRadius: QA_DISC_RADIUS,
                backgroundColor: SOFT_SURFACE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={QA_ICON_SIZE} color={PINE} strokeWidth={QA_ICON_STROKE} />
            </View>
            {/* `adjustsFontSizeToFit` is doing real work, not belt-and-braces.
                A two-word label wraps to fit, but a long SINGLE word cannot —
                "Permissions" is 73pt at caption1 against 62-72pt of column, and
                "Compatibility" is 72pt, against 62pt of column on a 360px
                phone — both would ellipsise. Shrinking is the only fix that
                does not change the wording or drop the grid to four columns.
                The 0.8 floor puts the two worst words at 57-58pt, inside the
                narrowest column, and it protects every other label when the OS
                font size is turned up. */}
            <Text
              style={{
                fontSize: T.caption1,
                lineHeight: T.caption1 + 3,
                minHeight: (T.caption1 + 3) * 2,
                color: C.label,
                marginTop: 5,
                letterSpacing: -0.1,
                textAlign: 'center',
              }}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/**
 * Overview's own header: title and subtitle. The green accent rule that used to
 * sit under the subtitle is gone, and so is the trailing "See All" link — the
 * Service Orders card already opens the same Bookings screen it did, and the
 * Bookings tab is a second way in, so nothing became unreachable.
 *
 * Deliberately NOT the shared `GroupHeader`. The reference gives this section a
 * heavier title plus a subtitle no other section has, and pushing that through
 * the shared component would drag every other section's header along with it.
 */
function OverviewHeader({ pad }) {
  return (
    <View style={{ paddingHorizontal: pad + 4, marginBottom: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Matched to `GroupHeader`'s title exactly — same size, weight and
            tracking — so "Overview" and "Service Access" read as peers rather
            than as a heading and a sub-heading. Change one and change both. */}
        <Text
          style={{
            fontSize: T.title3, lineHeight: T.title3 + 4, fontWeight: '500',
            color: C.label, letterSpacing: -0.45, flex: 1,
          }}
          numberOfLines={1}
        >
          Overview
        </Text>
      </View>
      <Text
        style={{ fontSize: T.subhead, color: C.label2, marginTop: 2, letterSpacing: -0.2 }}
        numberOfLines={1}
      >
        Track your booking and pickup activity
      </Text>
    </View>
  );
}

// Recent-booking card — device photo, then a status chip, the device and its
// ticket no, and below a hairline the customer it belongs to.
//
// Two rules shape it. (1) The status owns a full-width row instead of being a
// capsule floated over the photo: overlaid, it was clipped to the card's inner
// width and long statuses read "Invoice Generat…". (2) The card is one tap
// target, so the footer is a link, not a filled button — a third filled green
// element next to the chip and the tint just diluted both.
//
// `flex: 1` on the Touchable and Glass makes every card in a row match the
// tallest, and the spacer above the footer pins the "View" link to the bottom
// edge so the links line up across the rail instead of floating mid-card.
function BookingCard({ image, device, ticketNo, customer, phone, status, tone, onPress }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${device}, ticket ${ticketNo}, ${customer}, ${status}`}
      style={{ borderRadius: R.tile, flex: 1 }}
      pressedStyle={{ opacity: 0.6 }}
    >
      <Glass
        radius={R.tile}
        style={{ flex: 1, padding: 10 }}
        shadow={{
          shadowColor: '#0B1F14', shadowOpacity: 0.07, shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 }, elevation: 2,
        }}
      >
        {/* Device photo on a WHITE well, the product-shot convention: device
            renders are shot on white, so a grey wash behind them tinted the
            cut-out edges. The well is 79 rather than 74 — the extra 5pt is
            what keeps a 16:9-ish render from losing height once the padding
            around it stops being disguised by the grey. */}
        <View
          style={{
            height: 79,
            borderRadius: concentric(R.tile, 10),
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            // The card behind this is also near-white, so the old
            // GLASS.hairline (a white inner light) left the well invisible.
            // A real separator line is what gives the photo an edge now.
            borderWidth: HAIRLINE,
            borderColor: C.separator,
          }}
        >
          {image
            ? <Image source={{ uri: image }} style={{ width: '88%', height: '88%' }} resizeMode="contain" />
            : <Smartphone size={28} color={C.placeholder} strokeWidth={ICON_STROKE} />}
        </View>

        {/* Status — dot + label, sized to its text and free to use the card's
            whole width, which is what stops the long statuses ellipsising. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            marginTop: 9,
            backgroundColor: tone.bg,
            borderRadius: R.control,
            paddingLeft: 6,
            paddingRight: 9,
            paddingVertical: 3,
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.dot, marginRight: 5 }} />
          <Text
            style={{ fontSize: T.caption2, fontWeight: '700', color: tone.text, letterSpacing: -0.05, flexShrink: 1 }}
            numberOfLines={1}
          >
            {status}
          </Text>
        </View>

        {/* Device + its ticket no. The ticket is metadata, not a link, so it
            sits in secondary grey — as tint green it was a third green element
            competing with the chip and the footer. */}
        {/* 12px. Same size as the customer line below it, so weight is the
            only thing left carrying the hierarchy — hence '700' stays. */}
        <Text
          style={{ fontSize: T.caption1, fontWeight: '700', color: C.label, letterSpacing: -0.2, marginTop: 8 }}
          numberOfLines={1}
        >
          {device}
        </Text>
        <Text
          style={{ fontSize: T.caption2, color: C.label2, fontWeight: '600', marginTop: 2, letterSpacing: 0.1 }}
          numberOfLines={1}
        >
          #{ticketNo}
        </Text>

        {/* Customer, fenced off by a hairline so the card reads as two halves:
            what is being repaired, and whose it is. The icons let the eye tell
            a name from a number without reading either. */}
        <View style={{ height: HAIRLINE, backgroundColor: C.separator, marginTop: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <User size={12} color={C.label2} strokeWidth={ICON_STROKE} />
          <Text
            style={{ fontSize: T.caption1, color: C.label, marginLeft: 5, letterSpacing: -0.1, flex: 1 }}
            numberOfLines={1}
          >
            {customer}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          <Phone size={12} color={C.label2} strokeWidth={ICON_STROKE} />
          <Text style={{ fontSize: T.caption2, color: C.label2, marginLeft: 5, flex: 1 }} numberOfLines={1}>
            {phone || '—'}
          </Text>
        </View>

        {/* Bottom-pinned footer link (see the header note on the spacer). */}
        <View style={{ flex: 1, minHeight: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: T.caption1, fontWeight: '700', color: C.tint, letterSpacing: -0.1 }}>
            View
          </Text>
          <ChevronRight size={13} color={C.tint} strokeWidth={ICON_STROKE} style={{ marginLeft: 1 }} />
        </View>
      </Glass>
    </Touchable>
  );
}

// Horizontal category rail — App Store-style rounded tiles on the grouped
// background (no card behind them, so the rail can bleed to the screen edge).
function CategoryRail({ categories, pad, tile, keyPrefix, onPick }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: 2 }}
    >
      {categories.map((c, idx) => {
        const code = (c.code || '').toUpperCase();
        const meta = BUY_CAT_META[code] || BUY_CAT_DEFAULT;
        const uri = buyCatImage(c);
        return (
          <Touchable
            key={`${keyPrefix}-${c.id}`}
            onPress={() => onPick(c, code)}
            accessibilityRole="button"
            accessibilityLabel={c.name}
            style={{
              width: tile,
              marginRight: idx === categories.length - 1 ? 0 : CAT_GAP,
              alignItems: 'center',
            }}
            pressedStyle={{ opacity: 0.5 }}
          >
            <Glass
              radius={R.tile}
              style={{ width: tile, height: tile, alignItems: 'center', justifyContent: 'center' }}
              shadow={{
                shadowColor: '#0B1F14', shadowOpacity: 0.08, shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 }, elevation: 2,
              }}
            >
              {uri
                ? <Image source={{ uri }} style={{ width: tile * 0.58, height: tile * 0.58 }} resizeMode="contain" />
                : <Text style={{ fontSize: 28 }}>{meta.emoji}</Text>}
            </Glass>
            <Text
              style={{ fontSize: T.caption1, color: C.label, marginTop: 8, textAlign: 'center', letterSpacing: -0.1 }}
              numberOfLines={1}
            >
              {c.name}
            </Text>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

// Account sheet — the iOS replacement for the old left drawer. Slides up from
// the bottom with a grabber, an inset-grouped menu, a shop switcher and a
// destructive Log Out group.
function AccountSheet({
  rendered, anim, insets, session, shopName, shopImage, shops, canAddShop,
  showShopList, switching, hasKycDocs, mode = 'account',
  onToggleShopList, onSwitch, onClose, onNavigate, onLogout, onAddShop,
}) {
  const { height: winH } = useWindowDimensions();
  // Shop-switcher-only sheet is much shorter content, so it gets a shorter
  // sheet rather than a mostly-empty tall one.
  const shopsOnly = mode === 'shops';
  const sheetH = Math.min(winH * (shopsOnly ? 0.58 : 0.9), winH - Math.max(insets.top, 24) - 10);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] });
  // SHOP-scoped sessions (shop-mobile login) are locked to one shop.
  const canSwitch = session?.loginScope !== 'SHOP';

  // Shop group rows, flattened so RowGroup can tag the real last row (it clones
  // its children to drop that row's separator).
  //
  // In 'shops' mode the list is always open, so the "Manage Account" expander
  // row is skipped entirely — the ⇄ button should land straight on the shops,
  // not on a row you have to tap first.
  const listOpen = shopsOnly || showShopList;
  const shopRows = shopsOnly ? [] : [
    <Row
      key="manage"
      leading={<IconSquare icon={Store} color={C.tone} />}
      title="Manage Account"
      subtitle={shops.length > 1 ? `Switch between ${shops.length} shops` : (shopName || 'Your shop')}
      onPress={onToggleShopList}
    />,
  ];
  if (listOpen) {
    if (shops.length === 0) {
      shopRows.push(
        <Row key="none" title="No other shops linked" titleColor={C.label2} accessory="none" />,
      );
    } else {
      shops.forEach((s) => {
        const active = s.id === session?.shopId;
        shopRows.push(
          <Row
            key={s.id}
            leading={<IconSquare icon={Store} color={active ? C.tone : C.muted} />}
            title={s.name}
            subtitle={s.slug || undefined}
            titleColor={active ? C.tint : C.label}
            accessory={active ? 'check' : 'none'}
            disabled={switching || active}
            onPress={active ? undefined : () => onSwitch(s.id)}
          />,
        );
      });
    }
    if (canAddShop) {
      shopRows.push(
        <Row
          key="add"
          leading={<IconSquare icon={PlusCircle} color={C.tone} />}
          title="Add Shop"
          titleColor={C.tint}
          onPress={onAddShop}
        />,
      );
    }
  }

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, opacity: anim }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={{
            height: sheetH,
            backgroundColor: C.groupedBg,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            transform: [{ translateY }],
            overflow: 'hidden',
            shadowColor: '#0B1F14', shadowOpacity: 0.24, shadowRadius: 28,
            shadowOffset: { width: 0, height: -8 }, elevation: 16,
          }}
        >
          {/* Ambient wash so the sheet's own glass has colour behind it */}
          <LinearGradient
            colors={['#F0F8EF', C.groupedBg]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
            pointerEvents="none"
          />
          {/* Specular top edge, matching every other glass surface */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, left: SHEET_RADIUS, right: SHEET_RADIUS,
              height: 1, backgroundColor: GLASS.edge,
            }}
          />

          {/* Grabber */}
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(23, 33, 23, 0.3)' }} />
          </View>

          {/* Sheet nav bar — title + Done */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, height: 46,
            }}
          >
            <View style={{ width: 52 }} />
            <Text
              style={{ flex: 1, textAlign: 'center', fontSize: T.headline, fontWeight: '600', color: C.label, letterSpacing: -0.4 }}
              numberOfLines={1}
            >
              {shopsOnly ? 'Switch Account' : 'Account'}
            </Text>
            <Touchable
              onPress={onClose}
              accessibilityRole="button"
              hitSlop={8}
              style={{ width: 52, alignItems: 'flex-end' }}
              pressedStyle={{ opacity: 0.4 }}
            >
              <Text style={{ fontSize: T.body, color: C.tint, fontWeight: '600' }}>Done</Text>
            </Touchable>
          </View>
          <View style={{ height: HAIRLINE, backgroundColor: C.separator }} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 18, paddingBottom: (insets.bottom || 12) + 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Identity card */}
            <Group pad={16}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                <View
                  style={{
                    height: 56, width: 56, borderRadius: 28, overflow: 'hidden',
                    backgroundColor: GREEN_DARK, alignItems: 'center', justifyContent: 'center', marginRight: 14,
                  }}
                >
                  {shopImage ? (
                    <Image source={{ uri: shopImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: T.title3 }}>{shopInitial(shopName)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: T.title3, fontWeight: '600', color: C.label, letterSpacing: -0.4 }} numberOfLines={1}>
                    {session?.name || 'Shop Owner'}
                  </Text>
                  <Text style={{ fontSize: T.subhead, color: C.label2, marginTop: 2 }} numberOfLines={1}>
                    {shopName}
                  </Text>
                </View>
              </View>
            </Group>

            {/* Shop switcher */}
            {canSwitch ? (
              <View style={{ marginTop: 24 }}>
                <GroupHeader title={shopsOnly ? 'Your Shops' : 'Shop'} pad={16} />
                <Group pad={16}>
                  <RowGroup>{shopRows}</RowGroup>
                </Group>
                {switching ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>
                    <ActivityIndicator size="small" color={C.placeholder} />
                    <Text style={{ marginLeft: 8, fontSize: T.footnote, color: C.label2 }}>Switching shop…</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              /* A SHOP-scoped login is locked to one shop — say so rather than
                 opening an empty switcher. */
              shopsOnly ? (
                <View style={{ marginTop: 24 }}>
                  <Group pad={16}>
                    <Row
                      leading={<IconSquare icon={Store} color={C.muted} />}
                      title="Single-shop login"
                      subtitle="This login is tied to one shop"
                      accessory="none"
                      last
                    />
                  </Group>
                </View>
              ) : null
            )}

            {/* Menu — full account mode only. The ⇄ button is a switcher, not
                a settings menu, so 'shops' mode stops here. */}
            {shopsOnly ? null : (
            <View style={{ marginTop: 24 }}>
              <GroupHeader title="Settings" pad={16} />
              <Group pad={16}>
                <RowGroup>
                  {ACCOUNT_MENU.map((m) => (
                    <Row
                      key={m.route}
                      leading={<IconSquare icon={m.icon} color={m.color} />}
                      title={m.label}
                      subtitle={m.sub}
                      onPress={() => onNavigate(m.route === 'KYC' ? (hasKycDocs ? 'OwnerKycView' : 'OwnerKycIntro') : m.route)}
                    />
                  ))}
                </RowGroup>
              </Group>
            </View>
            )}

            {/* Destructive action in its own group, iOS style */}
            {shopsOnly ? null : (
            <View style={{ marginTop: 24 }}>
              <Group pad={16}>
                <Touchable
                  onPress={onLogout}
                  accessibilityRole="button"
                  style={{
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                  }}
                  pressedStyle={{ backgroundColor: C.highlight }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <LogOut size={17} color={C.error} strokeWidth={ICON_STROKE} />
                    <Text style={{ fontSize: T.body, color: C.error, marginLeft: 8, letterSpacing: -0.4 }}>Log Out</Text>
                  </View>
                </Touchable>
              </Group>
            </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
