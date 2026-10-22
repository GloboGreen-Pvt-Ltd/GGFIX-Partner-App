import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  Wrench,
  BatteryMedium,
  Cpu,
  Zap,
  Volume2,
  Aperture,
  LayoutGrid,
  Smartphone,
  Droplets,
  ChevronRight,
  Check,
  X,
  Sparkles,
  ArrowLeft,
  Headphones,
  Wifi,
  Layers,
  Cog,
  Database,
  Keyboard as KeyboardIcon,
  HardDrive,
  Fan,
  ShieldCheck,
  Mic,
  Ear,
  VolumeX,
  Bluetooth,
  CreditCard,
  Square,
  ImageOff,
  ScanFace,
  FingerprintPattern as Fingerprint,
  Stethoscope,
  Gauge,
  Volume1,
  Bug,
  SignalHigh,
  UserCog,
  Lock,
  ShieldAlert,
  Hand,
  RefreshCw,
  RotateCw,
  RotateCcw,
  Hourglass,
  TriangleAlert,
  MessageSquarePlus,
} from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRepairServices, getRepairCategories, getRepairServicesGrouped } from '../../../api/masterData';
import { rs } from '../../../utils/responsive';
// `isTablet` / `screenWidth` from utils/responsive are read ONCE at module
// load, so a rotation or split-screen resize never reached this layout. The
// hook reads the live window during render.
import { useResponsive } from '../../../theme/responsive';
import { ResponsiveModal } from '../../../components/responsive';

// GGFIX palette (kept as the same named constants used throughout this file,
// values aligned to the app's Primary/Dark/Bright green + mint system so the
// screen reads as one premium surface rather than a plain form).
const BRAND_GREEN = '#035C6C'; // warranty / category-chip active fill — GGFIX green

// Page background is the soft off-white token so white cards read as
// elevated surfaces against it, instead of white-on-white with only a
// shadow to separate them.
const SCREEN_BG = '#F3F4F6';
const CARD_BG = '#FFFFFF';
const BORDER_SOFT = '#E5E7EB'; // inner borders on white (inputs, chips, dividers)
const ICON_TINT = '#035C6C'; // icons / fills
const INK = '#111111';
const MUTED = '#6B7280';
const PLACEHOLDER = '#9CA3AF';

// Picked-state wash — a service card and its ADDED pill both use this once a
// service is added, replacing the old red "REMOVE" treatment (which read as
// a warning rather than a confirmation).
const MINT_BG = '#E5F3F5';
const ACCENT_20 = '#C7E6EA'; // mint border

// One icon per repair category, matched by keyword so it works for however
// the admin has actually named the category (mobile/laptop/tablet/smartwatch/
// audio groups all use different wording for similar concepts). Falls back to
// Wrench for anything unmatched, same as every group's icon used to be.
function groupIconFor(name) {
  // Same trim + whitespace-collapse as `iconFor` below, for the same reason:
  // a category label with stray spacing shouldn't fall through matches it'd
  // otherwise hit.
  const n = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (/screen|display/.test(n)) return Smartphone;
  if (/battery|power/.test(n)) return BatteryMedium;
  if (/(audio.*camera)|(camera.*audio)/.test(n)) return Headphones;
  if (/camera/.test(n)) return Aperture;
  if (/charg|port/.test(n)) return Zap;
  if (/speaker|microphone|audio/.test(n)) return Volume2;
  if (/bluetooth|wireless/.test(n)) return Bluetooth;
  // Signal/reception checked before the general network|wifi branch — a
  // category about signal strength reads better with a signal icon than
  // the generic wifi one.
  if (/signal|reception|network drop/.test(n)) return SignalHigh;
  if (/network|connectivity|wifi/.test(n)) return Wifi;
  // Checked before `button|sensor` — "fingerprint SENSOR" would otherwise
  // match that branch first and never reach this one. Also checked before
  // the generic `touch` branch below, so "Touch ID" resolves to the
  // fingerprint icon rather than a plain touch/hand one.
  if (/fingerprint|face id|face unlock|touch id/.test(n)) return Fingerprint;
  if (/touch/.test(n)) return Hand;
  if (/button|sensor/.test(n)) return LayoutGrid;
  if (/\bsim\b|sim card|sim tray/.test(n)) return CreditCard;
  if (/back panel|back glass|back cover|\bbody\b/.test(n)) return Layers;
  if (/\bframe\b|bezel/.test(n)) return Square;
  if (/diagnos/.test(n)) return Stethoscope;
  if (/performance|\blag\b|slow/.test(n)) return Gauge;
  if (/software|\bos\b|operating system/.test(n)) return Cog;
  if (/water|liquid/.test(n)) return Droplets;
  if (/motherboard|hardware/.test(n)) return Cpu;
  if (/data|backup/.test(n)) return Database;
  if (/keyboard|touchpad/.test(n)) return KeyboardIcon;
  if (/storage/.test(n)) return HardDrive;
  if (/overheat|cooling/.test(n)) return Fan;
  // Restriction is a more specific security concern than the general
  // "virus|security" match below, so it's checked first.
  if (/restrict/.test(n)) return ShieldAlert;
  if (/virus|security/.test(n)) return ShieldCheck;
  if (/account|sign.?in|login/.test(n)) return UserCog;
  return Wrench;
}

// Warranty is typed as months and saved as readable text ("6 Months") —
// invoices and reports print the stored value as-is. Older bookings saved
// codes like W_6M; both read back as the number of months.
const warrantyMonths = (w) => String(w ?? '').match(/(\d+)/)?.[1] || '';
const warrantyText = (m) => { const n = parseInt(m, 10); return n > 0 ? `${n} Month${n === 1 ? '' : 's'}` : null; };

const priceNum = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;

const formatINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Custom "Others" issues have no catalog serviceId — give each a local id.
let nextOtherId = 1;

export default function DeviceServicesScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState([]);
  const [mainCats, setMainCats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Per-service input state, regardless of picked status — so the price the user
  // typed is what +Add commits, and persists if they Remove and re-Add.
  // When entering from "Edit Booking", prefillServices seeds the rows + picks so
  // existing line items show as already added with their saved price/warranty.
  const seedFromPrefill = () => {
    const prefill = Array.isArray(params.prefillServices) ? params.prefillServices : [];
    const rowSeed = {};
    const idSeed = new Set();
    const customSeed = [];
    for (const s of prefill) {
      if (s?.serviceId) {
        rowSeed[s.serviceId] = { price: String(s.price ?? ''), warranty: warrantyMonths(s.warranty) };
        idSeed.add(s.serviceId);
      } else if (s?.serviceName) {
        // A previously-saved custom "Others" issue — re-seed it so edits keep it.
        customSeed.push({
          id: `other-${nextOtherId++}`,
          name: s.serviceName,
          categoryId: s.categoryId || null,
          categoryName: s.categoryName || 'Others',
          price: priceNum(s.price),
          warranty: warrantyMonths(s.warranty),
        });
      }
    }
    return { rowSeed, idSeed, customSeed };
  };
  const seed = useMemo(seedFromPrefill, []);
  const [rows, setRows] = useState(seed.rowSeed); // { [serviceId]: { price, warranty } }
  const [pickedIds, setPickedIds] = useState(() => new Set(seed.idSeed));
  const [expanded, setExpanded] = useState({}); // { [groupId]: bool }

  // ── "Others" custom issues (not in the service catalog) ──────────────
  const [customIssues, setCustomIssues] = useState(seed.customSeed); // committed rows
  const otherNameRef = useRef('');   // draft issue text — uncontrolled to avoid re-render jank
  const otherPriceRef = useRef('');  // draft issue price — uncontrolled like the name
  const r = useResponsive();
  // ONE column on every device — a list, not a grid.
  //
  // A two-column version was tried and reverted: "Others" is rendered OUTSIDE
  // `groups.map`, so it fell into the same wrapping container and floated free
  // as a bare icon with no label. Beyond that bug, an accordion in columns
  // reflows its neighbour every time a group opens, which is worse than the
  // empty space it saves.
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;

  const [otherHasName, setOtherHasName] = useState(false); // toggles ADD enabled (boundary-only re-render)
  const [otherCatId, setOtherCatId] = useState(null);
  const [otherFormKey, setOtherFormKey] = useState(0); // bump to remount + clear the draft input

// `categoryId` is the DEVICE category (Mobile/Laptop/Tablet/…) picked back
  // on the Select Category step, forwarded unchanged through every screen in
  // between (SelectBrand → … → DeviceColorStorage → here). It was already
  // available on `params` — this screen just wasn't using it to filter yet.
  const [groupedForCategory, setGroupedForCategory] = useState(null); // [{id,name,issues:[{id,...}]}] | null

  useEffect(() => {
    (async () => {
      try {
        const [s, c, grouped] = await Promise.all([
          getRepairServices().catch(() => []),
          getRepairCategories().catch(() => []),
          getRepairServicesGrouped(params.categoryId).catch(() => []),
        ]);
        setServices(s);
        setMainCats(c);
        setGroupedForCategory(Array.isArray(grouped) ? grouped : []);
      } catch (_) { }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device-category-filtered groups, via the existing `/master/repair-services
  // /grouped?deviceCategoryId=` endpoint (already used by the customer app's
  // repair-service picker) — server decides which repair categories apply to
  // THIS device category, so a laptop booking never shows "Keyboard &
  // Touchpad" for a phone or vice versa. Each group's own `issues` only carry
  // ids, so they're hydrated against the full `services` list fetched above
  // to get the complete record (code, defaults, …) the rest of this screen
  // already knows how to render.
  //
  // Falls back to the OLD ungrouped-by-categoryId behaviour when there's no
  // categoryId param, the endpoint returns nothing (e.g. this device category
  // has no repair-category mapping configured yet), or the request failed —
  // so an unmapped category still shows its services instead of an empty
  // screen; it just isn't narrowed to a device-category subset in that case.
  const groups = useMemo(() => {
    if (params.categoryId && groupedForCategory && groupedForCategory.length > 0) {
      const byId = new Map((services || []).map((s) => [s.id, s]));
      return groupedForCategory
        .map((g) => ({
          id: g.id,
          name: g.name,
          services: (g.issues || []).map((i) => byId.get(i.id)).filter(Boolean),
        }))
        .filter((g) => g.services.length > 0);
    }
    // Fallback: group services by main category (categoryId on the service
    // points to repair-category) — the screen's original, unfiltered grouping.
    const catById = {};
    (mainCats || []).forEach((c) => { catById[c.id] = c; });
    const byCat = new Map();
    (services || []).forEach((s) => {
      const key = s.categoryId || '__ungrouped__';
      if (!byCat.has(key)) byCat.set(key, { id: key, name: catById[key]?.name || 'Other', services: [] });
      byCat.get(key).services.push(s);
    });
    return Array.from(byCat.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, mainCats, groupedForCategory, params.categoryId]);

  // When entering from Edit Booking, auto-expand the groups that already have
  // prefilled picks so the user can see/modify them without hunting for them.
  useEffect(() => {
    if (pickedIds.size === 0 || groups.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      let touched = false;
      for (const g of groups) {
        if (next[g.id]) continue;
        if (g.services.some((s) => pickedIds.has(s.id))) { next[g.id] = true; touched = true; }
      }
      return touched ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // Repair groups start collapsed — the shop taps a section open when they want
  // it (edit mode still auto-expands groups that already have picks, above).

  const ensureRow = (id) => rows[id] || { price: '', warranty: '' };
  const setField = (id, key, value) => {
    setRows((p) => {
      const existing = p[id] || { price: '', warranty: '' };
      return { ...p, [id]: { ...existing, [key]: value } };
    });
  };

  const addService = (s) => {
    // ₹0 is allowed (free / price-to-be-decided) — no minimum-price gate.
    setPickedIds((p) => { const n = new Set(p); n.add(s.id); return n; });
  };
  const removeService = (s) => {
    setPickedIds((p) => { const n = new Set(p); n.delete(s.id); return n; });
  };

  const toggleGroup = (gid) => setExpanded((e) => ({ ...e, [gid]: !e[gid] }));

  const addCustomIssue = () => {
    const name = (otherNameRef.current || '').trim();
    if (!name) return;
    const cat = groups.find((g) => g.id === otherCatId);
    setCustomIssues((list) => [...list, {
      id: `other-${nextOtherId++}`,
      name,
      categoryId: cat?.id || null,
      categoryName: cat?.name || 'Others',
      price: priceNum(otherPriceRef.current),
      warranty: null,
    }]);
    otherNameRef.current = '';
    otherPriceRef.current = '';
    setOtherHasName(false);
    setOtherCatId(null);
    setOtherFormKey((k) => k + 1); // remount inputs so their text clears
  };
  const removeCustomIssue = (id) =>
    setCustomIssues((list) => list.filter((c) => c.id !== id));
  // Other Issue popup closing adds whatever was typed (blank → nothing).
  const closeOther = () => {
    if ((otherNameRef.current || '').trim()) addCustomIssue();
    setOtherOpen(false);
  };
  const setCustomWarranty = (id, v) =>
    setCustomIssues((list) => list.map((c) => (c.id === id ? { ...c, warranty: String(v).replace(/[^0-9]/g, '') } : c)));
  const setCustomPrice = (id, v) =>
    setCustomIssues((list) => list.map((c) => (c.id === id ? { ...c, price: priceNum(v) } : c)));

  // Select Issue grid: the group whose issues sheet is open, tiles per row,
  // and a lookup for the Selected Issues list.
  const [issueSheet, setIssueSheet] = useState(null);
  const [otherOpen, setOtherOpen] = useState(false); // Other Issue popup
  const sheetGroup = groups.find((g) => g.id === issueSheet) || null;
  const tileCols = r.isTablet ? 5 : 3;
  const serviceById = useMemo(() => {
    const m = {};
    (services || []).forEach((s) => { m[s.id] = s; });
    return m;
  }, [services]);

  // Running total — drives the floating cart bar at the bottom.
  const cartTotal = useMemo(() => {
    let sum = 0;
    for (const id of pickedIds) {
      const r = ensureRow(id);
      sum += priceNum(r.price);
    }
    for (const c of customIssues) sum += Number(c.price) || 0;
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIds, rows, customIssues]);

  const onContinue = () => {
    const byId = {}; (services || []).forEach((s) => { byId[s.id] = s; });
    // The group a service is listed under, shown above it in Bill Details.
    const catByService = {};
    groups.forEach((g) => g.services.forEach((s) => { catByService[s.id] = g.name; }));
    const selected = [...pickedIds].map((id) => {
      const s = byId[id]; const r = ensureRow(id);
      return {
        serviceId: id,
        serviceCode: s?.code,
        serviceName: s?.name,
        categoryName: catByService[id] || null,
        price: priceNum(r.price),
        warranty: warrantyText(r.warranty),
      };
    });
    // Custom "Others" issues carry no catalog id — the booking pipeline already
    // tolerates serviceId:null (persisted as a line item by its label).
    const customSelected = customIssues.map((c) => ({
      serviceId: null,
      serviceCode: 'OTHER',
      serviceName: c.name,
      categoryId: c.categoryId || null,
      categoryName: c.categoryName || 'Others',
      price: Number(c.price) || 0,
      warranty: warrantyText(c.warranty),
    }));
    const all = [...selected, ...customSelected];
    if (all.length === 0) return;
    navigation.navigate('ServicePriceEstimate', { ...params, services: all });
  };

  if (loading) {
    return (
      <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
        <View
          style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER_SOFT }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            className="items-center justify-center"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: '#F3F4F6' }}
          >
            <ArrowLeft size={18} color={INK} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={BRAND_GREEN} size="large" />
        </View>
      </View>
    );
  }

  const totalSelected = pickedIds.size + customIssues.length;

  // Select Issue tile order: these groups first, the rest after in API order.
  // "Mainboard IC / Sub-Board IC" sits right after Battery & Charging.
  const TILE_ORDER = [/dead|no power/i, /display|screen/i, /battery/i, /motherboard|mainboard|sub-?board/i, /network/i, /security/i];
  const tileRank = (name) => {
    const i = TILE_ORDER.findIndex((re) => re.test(String(name || '')));
    return i === -1 ? TILE_ORDER.length : i;
  };
  const tileGroups = groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => tileRank(a.g.name) - tileRank(b.g.name) || a.i - b.i)
    .map(({ g }) => g);

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      {/* ── Header — same as Customer Details / Device Details: round back
          button, centred title + subtitle, equal spacer on the right. ── */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: BORDER_SOFT }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="items-center justify-center active:opacity-70"
            style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: SCREEN_BG, borderWidth: 1, borderColor: BORDER_SOFT }}
          >
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: INK, textAlign: 'center' }} numberOfLines={1}>
              Issue Description
            </Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1, textAlign: 'center' }} numberOfLines={2}>
              {params.modelName ? `Select the issues for ${params.modelName}` : 'Select the issues, then enter price and warranty'}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {/* Wraps the list AND the sticky CTA: the bar is positioned against this
          view, so it rides above the keyboard instead of disappearing behind
          it — the running total is what tells the owner when to stop adding. */}
      {/* KeyboardAwareScrollView, not KeyboardAvoidingView + a manual scroll.
          `newArchEnabled=true` in gradle.properties, so this app runs on
          Fabric — where ScrollView has no `getScrollResponder()` and therefore
          no `scrollResponderScrollNativeHandleToKeyboard`. The old helper was
          a SILENT no-op: the keyboard opened and the focused price field was
          never lifted. This component tracks the focused input natively on
          both architectures.

          bottomOffset clears the field's own warranty pills and ADD button, so
          the whole row stays workable while typing. */}
      <KeyboardAwareScrollView
        bottomOffset={rs(140)}
        contentContainerStyle={{
          paddingTop: 0,
          paddingBottom: rs(120),
          // Tablets: cap the column and centre it. Full-bleed rows on a 10"
          // screen put the price field and its ADD button a hand's width
          // apart, which is a worse form than a narrow one.
          ...(contentW ? { width: contentW, alignSelf: 'center' } : null),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ── Select Issue — one tile per repair group (the device category's
            groups from /repair-services/grouped). A tile opens that group's
            issues in a sheet; ✓ marks a group with picks. ─────────────── */}
        <View className="px-4" style={{ paddingTop: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 10 }}>
            Select Issue<Text style={{ color: '#DC2626' }}> *</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {tileGroups.map((g) => (
              <View key={g.id} style={{ width: `${100 / tileCols}%`, padding: 4 }}>
                <IssueTile
                  name={g.name}
                  Icon={groupIconFor(g.name)}
                  picked={g.services.filter((s) => pickedIds.has(s.id)).length}
                  onPress={() => setIssueSheet(g.id)}
                />
              </View>
            ))}
            {/* Other Issue — same tile, last; opens the custom-issue popup. */}
            <View style={{ width: `${100 / tileCols}%`, padding: 4 }}>
              <IssueTile
                name="Other Issue"
                Icon={MessageSquarePlus}
                picked={customIssues.length}
                // Fresh draft each time — the popup's input remounts empty.
                onPress={() => { otherNameRef.current = ''; setOtherHasName(false); setOtherOpen(true); }}
              />
            </View>
          </View>

          {/* Picked issues with their price — warranty and "Last 5 prices"
              are no longer asked here. */}
          {totalSelected > 0 ? (
            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 10 }}>Selected Issues</Text>
              {[...pickedIds].map((id) => {
                const s = serviceById[id];
                if (!s) return null;
                return (
                  <SelectedIssueRow
                    key={id}
                    name={s.name}
                    Icon={iconFor(s.code, s.name)}
                    price={ensureRow(id).price}
                    onPriceChange={(v) => setField(id, 'price', v)}
                    warranty={ensureRow(id).warranty}
                    onWarrantyChange={(v) => setField(id, 'warranty', String(v).replace(/[^0-9]/g, ''))}
                    onRemove={() => removeService(s)}
                  />
                );
              })}
              {customIssues.map((c) => (
                <SelectedIssueRow
                  key={c.id}
                  name={c.name}
                  sub={c.categoryName}
                  Icon={Sparkles}
                  price={Number(c.price) ? String(c.price) : ''}
                  onPriceChange={(v) => setCustomPrice(c.id, v)}
                  warranty={c.warranty || ''}
                  onWarrantyChange={(v) => setCustomWarranty(c.id, v)}
                  onRemove={() => removeCustomIssue(c.id)}
                />
              ))}
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

      {/* ── Sticky bottom summary — ONE bar, always mounted ───────────────
          Previously this was two different components: a real summary bar
          once something was picked, and a separate small floating "Add a
          service to continue" pill otherwise — a toast-like element sitting
          over the content with no summary information in it. Now it's a
          single bar in both states (same shape/position), just disabled and
          muted with a prompt in place of the total when nothing is picked
          yet, matching the rest of this app's sticky-CTA pattern (Missing
          Parts, Service Price & Issue Estimate). */}
      <View
        className="absolute left-0 right-0"
        style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
      >
        <Pressable
          onPress={onContinue}
          disabled={totalSelected === 0}
          className="active:opacity-90"
          style={{
            borderRadius: rs(18),
            overflow: 'hidden',
            backgroundColor: totalSelected > 0 ? ICON_TINT : CARD_BG,
            borderWidth: totalSelected > 0 ? 0 : 1,
            borderColor: BORDER_SOFT,
            shadowColor: '#111111',
            shadowOpacity: totalSelected > 0 ? 0.22 : 0.06,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: totalSelected > 0 ? 6 : 2,
          }}
        >
          <View
            style={{ paddingHorizontal: rs(16), paddingVertical: rs(14), flexDirection: 'row', alignItems: 'center' }}
          >
            <View className="flex-1">
              <Text
                className="font-bold"
                style={{ fontSize: 11, color: totalSelected > 0 ? '#FFFFFF' : '#6B7280', opacity: totalSelected > 0 ? 0.9 : 1 }}
              >
                {totalSelected} Service{totalSelected === 1 ? '' : 's'} Selected
              </Text>
              <Text
                className="font-medium"
                style={{ fontSize: 13, color: totalSelected > 0 ? '#FFFFFF' : ICON_TINT }}
              >
                {totalSelected > 0 ? `Estimated ₹${formatINR(cartTotal)}` : 'Add a service to continue'}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text
                className="font-medium"
                style={{ fontSize: 13, color: totalSelected > 0 ? '#FFFFFF' : '#9CA3AF', marginRight: 2 }}
              >
                Continue
              </Text>
              <ChevronRight size={18} color={totalSelected > 0 ? '#fff' : '#9CA3AF'} />
            </View>
          </View>
        </Pressable>
      </View>

      {/* ── Other Issue popup — a custom issue that isn't in the catalogue ── */}
      <ResponsiveModal visible={otherOpen} onClose={closeOther} maxWidth={520}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
        <View className="flex-row items-center" style={{ marginBottom: 10 }}>
          <MessageSquarePlus size={20} color={INK} strokeWidth={1.75} />
          <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: INK }}>Other Issue</Text>
          <Pressable onPress={closeOther} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={MUTED} />
          </Pressable>
        </View>
        {/* Just the issue — no Add button: the keyboard's Done (or closing the
            popup) adds what was typed. Its price is typed in Selected Issues. */}
        <View className="flex-row items-center px-3" style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: BORDER_SOFT, backgroundColor: CARD_BG }}>
          <TextInput
            key={`other-name-${otherFormKey}`}
            defaultValue=""
            autoFocus
            onChangeText={(v) => { otherNameRef.current = v; setOtherHasName(v.trim().length > 0); }}
            onSubmitEditing={closeOther}
            returnKeyType="done"
            placeholder="Describe the issue (e.g. Face ID not working)"
            placeholderTextColor={PLACEHOLDER}
            cursorColor={ICON_TINT}
            style={{ flex: 1, paddingVertical: 0, fontSize: 13, color: INK }}
          />
        </View>
      </ResponsiveModal>

      {/* ── Issues of the tapped group — tap to select / unselect ──────── */}
      <ResponsiveModal visible={!!sheetGroup} onClose={() => setIssueSheet(null)} maxWidth={520}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
        {sheetGroup ? (
          <>
            <View className="flex-row items-center" style={{ marginBottom: 10 }}>
              {(() => { const GIcon = groupIconFor(sheetGroup.name); return <GIcon size={20} color={INK} strokeWidth={1.75} />; })()}
              <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: INK }} numberOfLines={1}>{sheetGroup.name}</Text>
              <Pressable onPress={() => setIssueSheet(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={MUTED} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {sheetGroup.services.map((s) => {
                const on = pickedIds.has(s.id);
                const Icon = iconFor(s.code, s.name);
                return (
                  <Pressable
                    key={s.id}
                    // Select / unselect, then the sheet closes by itself.
                    onPress={() => { if (on) removeService(s); else addService(s); setIssueSheet(null); }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center active:opacity-80"
                    style={{ minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? ICON_TINT : BORDER_SOFT, backgroundColor: on ? MINT_BG : CARD_BG }}
                  >
                    <Icon size={19} color={on ? ICON_TINT : INK} strokeWidth={1.75} />
                    <Text style={{ flex: 1, marginLeft: 12, fontSize: 13, fontWeight: on ? '700' : '500', color: INK }} numberOfLines={2}>{s.name}</Text>
                    <View
                      className="items-center justify-center"
                      style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? ICON_TINT : '#C9CFC9', backgroundColor: on ? ICON_TINT : '#FFFFFF' }}
                    >
                      {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </ResponsiveModal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Select Issue tile — icon over a two-line label; picked = green line, mint
// fill and a ✓ badge in the corner.
// ════════════════════════════════════════════════════════════════════════════
function IssueTile({ name, Icon, picked, onPress, open = false }) {
  const on = picked > 0 || open;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${picked > 0 ? `, ${picked} selected` : ''}`}
      className="items-center justify-center active:opacity-80"
      style={{
        minHeight: 92, paddingHorizontal: 6, paddingVertical: 12, borderRadius: 14,
        borderWidth: on ? 1.5 : 1, borderColor: on ? ICON_TINT : BORDER_SOFT, backgroundColor: on ? MINT_BG : CARD_BG,
      }}
    >
      {picked > 0 ? (
        <View
          className="items-center justify-center"
          style={{ position: 'absolute', top: 6, right: 6, height: 18, width: 18, borderRadius: 9, backgroundColor: ICON_TINT }}
        >
          <Check size={11} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
      <Icon size={26} color={INK} strokeWidth={1.75} />
      <Text
        style={{ marginTop: 8, fontSize: 12, lineHeight: 15, fontWeight: on ? '700' : '500', color: INK, textAlign: 'center' }}
        numberOfLines={2}
      >
        {name}
      </Text>
    </Pressable>
  );
}

// One picked issue: icon, name and remove on top; then one row with
// "Price [₹ box]" on the left and "Warranty [box Months]" on the right.
function SelectedIssueRow({ name, sub, Icon, price, onPriceChange, warranty, onWarrantyChange, onRemove }) {
  const box = {
    flexShrink: 1, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER_SOFT, backgroundColor: '#FFFFFF',
  };
  const label = { fontSize: 12, fontWeight: '600', color: MUTED, marginRight: 6 };
  return (
    <View style={{ marginBottom: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: ACCENT_20, backgroundColor: CARD_BG }}>
      <View className="flex-row items-center">
        <View className="items-center justify-center" style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: MINT_BG }}>
          <Icon size={18} color={ICON_TINT} />
        </View>
        <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={2}>{name}</Text>
          {sub ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          className="items-center justify-center active:opacity-70"
          style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: 'rgba(220, 38, 38, 0.10)' }}
        >
          <X size={14} color="#DC2626" />
        </Pressable>
      </View>

      {/* Compact fixed-width boxes (they shrink on very narrow phones):
          Price on the left, Warranty on the right. */}
      <View className="flex-row" style={{ marginTop: 10, gap: 10, justifyContent: 'space-between' }}>
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={label}>Price</Text>
          <View style={[box, { width: 96 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: MUTED, marginRight: 4 }}>₹</Text>
            <TextInput
              placeholder="0"
              placeholderTextColor={PLACEHOLDER}
              keyboardType="numeric"
              value={String(price ?? '')}
              onChangeText={onPriceChange}
              autoComplete="off"
              importantForAutofill="no"
              textContentType="none"
              cursorColor={ICON_TINT}
              style={{ flex: 1, paddingVertical: 0, fontSize: 14, fontWeight: '700', color: INK }}
            />
          </View>
        </View>
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={label}>Warranty</Text>
          <View style={[box, { width: 96 }]}>
            <TextInput
              placeholder="0"
              placeholderTextColor={PLACEHOLDER}
              keyboardType="number-pad"
              maxLength={3}
              value={String(warranty ?? '')}
              onChangeText={onWarrantyChange}
              autoComplete="off"
              importantForAutofill="no"
              textContentType="none"
              cursorColor={ICON_TINT}
              style={{ flex: 1, paddingVertical: 0, fontSize: 14, fontWeight: '700', color: INK }}
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, marginLeft: 4 }}>
              {String(warranty) === '1' ? 'Month' : 'Months'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// `code` is the catalog's own enum value when the backend has one — checked
// first since it's exact. Most issues (including every "Audio & Microphone"
// entry: Earpiece/Microphone/Speaker/No Sound) don't carry a distinct code of
// their own today, so `name` is matched as a fallback, same keyword-matching
// approach as `groupIconFor` above. Wrench only when neither resolves anything.
function iconFor(code, name) {
  switch (code) {
    case 'DISPLAY': return Smartphone;
    case 'BATTERY': return BatteryMedium;
    case 'MOTHERBOARD': return Cpu;
    case 'CHARGING_PORT': return Zap;
    case 'SPEAKER': return Volume2;
    case 'CAMERA': return Aperture;
    case 'BUTTON': return LayoutGrid;
    case 'WATER_DAMAGE': return Droplets;
    case 'DEAD_PHONE': return Smartphone;
    default: break;
  }
  // Trim + collapse repeated whitespace before matching, so a label with
  // stray/leading/trailing spaces (extra space, accidental double space)
  // still matches the same keywords as the clean version would. None of the
  // patterns below depend on exact spacing, only substring presence, so
  // this is a pure robustness addition with no risk to existing matches.
  const n = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (/microphone|\bmic\b/.test(n)) return Mic;
  if (/earpiece|ear speaker|hearing/.test(n)) return Ear;
  if (/no sound|no audio|mute|silent/.test(n)) return VolumeX;
  // "Low Sound" specifically — checked before the general speaker/volume/
  // audio branch below, so a low-volume issue gets a low-volume icon
  // instead of the plain speaker one.
  if (/low sound|low volume|\bsound\b/.test(n)) return Volume1;
  if (/speaker|volume|audio/.test(n)) return Volume2;
  if (/bluetooth|wireless/.test(n)) return Bluetooth;
  // Signal/reception checked before the general network|wifi branch — "no
  // exact substring match" was why "Signal Problem" fell through to Wrench.
  if (/signal|reception|network drop|no network|poor network/.test(n)) return SignalHigh;
  if (/network|connectivity|\bwifi\b|wi-fi/.test(n)) return Wifi;
  // Checked before `button|sensor` — "fingerprint SENSOR" or "face unlock"
  // would otherwise never reach a dedicated icon. Fingerprint and face
  // unlock get their own distinct icons rather than sharing one.
  if (/fingerprint|touch id/.test(n)) return Fingerprint;
  if (/face id|face unlock/.test(n)) return ScanFace;
  // "Touch Not Working" / "Ghost Touch" — checked after touch id/fingerprint
  // above (so those keep their own icon) and before screen|display, since
  // neither of those regexes contains "touch" and would otherwise never
  // match this wording at all.
  if (/touch/.test(n)) return Hand;
  if (/screen|display|flicker|\blcd\b|\bled\b/.test(n)) return Smartphone;
  if (/\bsim\b|sim card|sim tray/.test(n)) return CreditCard;
  // Charging/port concepts checked BEFORE plain battery/power — "Charging
  // Port Repair" contains "charg", which used to match the battery branch
  // first and show a battery icon instead of a charging-port one.
  if (/charging port|charger port|\bport\b|usb|plug|charg/.test(n)) return Zap;
  if (/battery|power/.test(n)) return BatteryMedium;
  if (/camera|lens/.test(n)) return Aperture;
  if (/button|sensor/.test(n)) return LayoutGrid;
  // "Back Glass Replacement" / "Frame Replacement" and similar physical-
  // damage service names had no match anywhere below and fell all the way
  // through to Wrench — this is the actual gap the "wrong/no icon" report
  // was about.
  if (/back glass|back panel|back cover|\bbody\b/.test(n)) return Layers;
  if (/\bframe\b|bezel/.test(n)) return Square;
  if (/water|liquid/.test(n)) return Droplets;
  if (/motherboard|hardware|chip|logic board/.test(n)) return Cpu;
  if (/software|\bos\b|operating system|firmware|update/.test(n)) return Cog;
  // App crash / bug reports — checked before the generic Wrench fallback so
  // "Other Diagnosis"/"Software & OS" items phrased this way get a
  // dedicated icon.
  if (/crash|\bbug\b/.test(n)) return Bug;
  if (/data|backup/.test(n)) return Database;
  if (/keyboard|touchpad|\bkey\b/.test(n)) return KeyboardIcon;
  if (/storage/.test(n)) return HardDrive;
  if (/overheat|cooling|\bfan\b|thermal/.test(n)) return Fan;
  if (/performance|\blag\b|slow/.test(n)) return Gauge;
  // Random Restart / Boot Loop / Hanging-Freezing / Stuck-on-Logo — these
  // "device won't behave" issues under Performance/Software-OS had no
  // keyword coverage at all and fell straight through to the generic
  // Wrench, which is the actual gap this pass fixes.
  if (/random restart|\brestart\b/.test(n)) return RotateCw;
  if (/boot loop|\bloop\b/.test(n)) return RefreshCw;
  if (/hang(ing)?|freez\w*|\bstuck\b/.test(n)) return Hourglass;
  if (/intermittent/.test(n)) return TriangleAlert;
  if (/factory reset|\breset\b/.test(n)) return RotateCcw;
  if (/diagnos/.test(n)) return Stethoscope;
  // Password / PIN / device-lock issues — a credentials concern distinct
  // from the general "security" match below.
  if (/password|\bpin\b|\block\b|unlock/.test(n)) return Lock;
  // Restriction is a more specific security concern than plain
  // "virus|security" below, so it's checked first.
  if (/restrict/.test(n)) return ShieldAlert;
  if (/virus|security|malware/.test(n)) return ShieldCheck;
  if (/account|sign.?in|login/.test(n)) return UserCog;
  // Last resort before the generic Wrench: any remaining "broken / cracked /
  // damaged" wording that didn't name a specific part gets a broken-image
  // icon rather than a plain wrench — still closer to "visually meaningful"
  // for a damage-type issue with no more specific keyword match.
  if (/broken|crack|shatter|damage/.test(n)) return ImageOff;
  // "Other Repair" and anything else genuinely unmatched lands here — the
  // same generic repair icon the user's own suggested fallback names
  // (build/wrench/handyman), so no issue row ever renders with no icon.
  return Wrench;
}
