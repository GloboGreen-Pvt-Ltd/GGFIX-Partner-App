import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
  X,
  Hash,
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
} from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRepairServices, getRepairCategories, getRepairServicesGrouped } from '../../../api/masterData';
import { rf, rs } from '../../../utils/responsive';
// `isTablet` / `screenWidth` from utils/responsive are read ONCE at module
// load, so a rotation or split-screen resize never reached this layout. The
// hook reads the live window during render.
import { useResponsive } from '../../../theme/responsive';

// GGFIX palette (kept as the same named constants used throughout this file,
// values aligned to the app's Primary/Dark/Bright green + mint system so the
// screen reads as one premium surface rather than a plain form).
const BRAND_GREEN = '#004C40'; // warranty / category-chip active fill — Dark Green

// Page background is the soft off-white token so white cards read as
// elevated surfaces against it, instead of white-on-white with only a
// shadow to separate them.
const SCREEN_BG = '#F8FAF9';
const CARD_BG = '#FFFFFF';
const BORDER_SOFT = '#DDE7E3';
// Service row surface — a real white card now (was a flat grey fill), so it
// sits above the page background instead of blending into it.
const ROW_BG = '#FFFFFF';
const ICON_DISC = '#E8F7F2'; // mint icon-tile background
const ICON_TINT = '#004C40';

// Add button uses the brighter accent so it reads as the primary action,
// distinct from the darker green used for icon tiles/labels. Disabled fill
// is the same hue at 35% rather than a separate grey.
const ADD_BG = '#00A86B';
const ADD_BG_OFF = 'rgba(0, 168, 107, 0.35)';

// Picked-state wash — a service card and its ADDED pill both use this once a
// service is added, replacing the old red "REMOVE" treatment (which read as
// a warning rather than a confirmation).
const MINT_BG = '#E8F7F2';
const ACCENT_20 = 'rgba(0, 76, 64, 0.20)';

const WARRANTY_OPTIONS = [
  { code: 'W_3M', label: '3 Months' },
  { code: 'W_6M', label: '6 Months' },
  { code: 'W_12M', label: '12 Months' },
];

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
        rowSeed[s.serviceId] = { price: String(s.price ?? ''), warranty: s.warranty || '' };
        idSeed.add(s.serviceId);
      } else if (s?.serviceName) {
        // A previously-saved custom "Others" issue — re-seed it so edits keep it.
        customSeed.push({
          id: `other-${nextOtherId++}`,
          name: s.serviceName,
          categoryId: s.categoryId || null,
          categoryName: s.categoryName || 'Others',
          price: priceNum(s.price),
          warranty: s.warranty || null,
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
    const selected = [...pickedIds].map((id) => {
      const s = byId[id]; const r = ensureRow(id);
      return {
        serviceId: id,
        serviceCode: s?.code,
        serviceName: s?.name,
        price: priceNum(r.price),
        warranty: r.warranty || null,
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
      warranty: c.warranty || null,
    }));
    const all = [...selected, ...customSelected];
    if (all.length === 0) return;
    navigation.navigate('ServicePriceEstimate', { ...params, services: all });
  };

  if (loading) {
    return (
      <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
        <View
          style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 12, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
        >
          <Pressable onPress={() => navigation.goBack()} className="h-10 w-10 rounded-full bg-surface-muted items-center justify-center">
            <ArrowLeft size={20} color="#172117" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={BRAND_GREEN} size="large" />
        </View>
      </View>
    );
  }

  const totalSelected = pickedIds.size + customIssues.length;

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      {/* ── White header — matches app's other white headers ─────── */}
      <View
        style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 10, paddingBottom: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
      >
        <View className="relative flex-row items-center justify-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute left-0 h-10 w-10 rounded-full bg-surface-muted items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={20} color="#172117" />
          </Pressable>

          <View className="items-center px-12">
            <Text
              className="text-text font-medium text-center"
              style={{ fontSize: rf(13) }}
              numberOfLines={1}
            >
              Add Issue Services
            </Text>
          </View>
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
          paddingBottom: rs(160),
          // Tablets: cap the column and centre it. Full-bleed rows on a 10"
          // screen put the price field and its ADD button a hand's width
          // apart, which is a worse form than a narrow one.
          ...(contentW ? { width: contentW, alignSelf: 'center' } : null),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ── Device summary card — mint accent header, soft shadow ──────── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            style={{
              backgroundColor: CARD_BG,
              borderRadius: rs(18),
              borderWidth: 1,
              borderColor: BORDER_SOFT,
              overflow: 'hidden',
              shadowColor: '#0B1F14',
              shadowOpacity: 0.08,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 5,
            }}
          >
            <View style={{ backgroundColor: MINT_BG, paddingHorizontal: rs(14), paddingVertical: rs(12) }}>
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center overflow-hidden mr-3"
                  style={{ height: rs(56), width: rs(56), borderRadius: rs(16), backgroundColor: '#FFFFFF' }}
                >
                  {params.imageUrl ? (
                    <Image source={{ uri: params.imageUrl }} style={{ width: rs(56), height: rs(56) }} resizeMode="cover" />
                  ) : (
                    <Smartphone size={24} color={ICON_TINT} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-text" style={{ fontSize: rf(14) }} numberOfLines={1}>
                    {params.modelName || 'Device'}
                  </Text>
                  <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(11.5) }} numberOfLines={1}>
                    {[params.ramLabel, params.storageLabel, params.color].filter(Boolean).join(' · ')}
                  </Text>
                  {params.modelNumber ? (
                    <View className="flex-row items-center mt-1.5">
                      <View className="flex-row items-center bg-card rounded-md px-1.5 py-0.5">
                        <Hash size={10} color={ICON_TINT} />
                        <Text className="font-medium ml-0.5" style={{ fontSize: rf(11.5), color: ICON_TINT }}>{params.modelNumber}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Selected-service count strip — real data (totalSelected/cartTotal,
                computed below), not a placeholder. Only rendered once at least
                one service is picked. */}
            {totalSelected > 0 ? (
              <View
                className="flex-row items-center justify-between"
                style={{ paddingHorizontal: rs(14), paddingVertical: rs(9), borderTopWidth: 1, borderTopColor: BORDER_SOFT }}
              >
                <View className="flex-row items-center">
                  <Check size={12} color={ICON_TINT} strokeWidth={3} />
                  <Text className="font-medium ml-1.5" style={{ fontSize: rf(11.5), color: ICON_TINT }}>
                    {totalSelected} service{totalSelected === 1 ? '' : 's'} selected
                  </Text>
                </View>
                <Text className="font-bold" style={{ fontSize: rf(12), color: ICON_TINT }}>₹{formatINR(cartTotal)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Section header ─────────────────────────────────────────────
            Title Case, no letter-spacing: `tracking-widest` only exists to
            make all-caps legible. */}
        <View className="px-4 pt-5 pb-2 flex-row items-center">
          <View
            className="items-center justify-center mr-2"
            style={{ height: rs(24), width: rs(24), borderRadius: rs(7), backgroundColor: MINT_BG }}
          >
            <Sparkles size={13} color={ICON_TINT} />
          </View>
          <View className="flex-1">
            <Text className="text-text font-semibold" style={{ fontSize: rf(13.5) }}>Recommended Repairs</Text>
            <Text className="text-text-muted" style={{ fontSize: rf(11) }}>Tap a category to see issues & pricing</Text>
          </View>
        </View>

        {/* ── Categories: premium accordion cards ─────────────────────────
            Each category is its own elevated white card (was a hairline-
            separated row list) so the section reads as a set of distinct,
            tappable groups rather than a flat form list. */}
        <View className="px-4">
          {groups.map((g, gi) => {
            const open = !!expanded[g.id];
            const pickedInGroup = g.services.filter((s) => pickedIds.has(s.id)).length;
            const Chevron = open ? ChevronUp : ChevronDown;
            const GroupIcon = groupIconFor(g.name);
            return (
              <View
                key={g.id}
                style={{
                  backgroundColor: CARD_BG,
                  borderRadius: rs(16),
                  borderWidth: 1,
                  borderColor: open ? ICON_TINT + '33' : BORDER_SOFT,
                  overflow: 'hidden',
                  marginTop: gi === 0 ? 0 : rs(10),
                  shadowColor: '#0B1F14',
                  shadowOpacity: open ? 0.08 : 0.04,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: open ? 3 : 1,
                }}
              >
                <Pressable
                  onPress={() => toggleGroup(g.id)}
                  className="flex-row items-center active:opacity-80"
                  style={{ paddingHorizontal: rs(14), paddingVertical: rs(12) }}
                >
                  <View
                    className="items-center justify-center mr-3"
                    style={{ height: rs(40), width: rs(40), borderRadius: rs(12), backgroundColor: ICON_DISC }}
                  >
                    <GroupIcon size={18} color={ICON_TINT} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-text" style={{ fontSize: rf(13.5) }} numberOfLines={1}>{g.name}</Text>
                    <View className="flex-row items-center mt-0.5">
                      <Text className="text-text-muted" style={{ fontSize: rf(11.5) }}>
                        {g.services.length} {g.services.length === 1 ? 'option' : 'options'}
                      </Text>
                      {pickedInGroup ? (
                        <>
                          <View className="h-1 w-1 rounded-full bg-text-muted mx-1.5" />
                          <Text className="font-semibold" style={{ fontSize: rf(11.5), color: ICON_TINT }}>
                            {pickedInGroup} added
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View
                    className="items-center justify-center"
                    style={{ height: rs(28), width: rs(28), borderRadius: rs(9), backgroundColor: open ? MINT_BG : '#F4F7F5' }}
                  >
                    <Chevron size={16} color={ICON_TINT} />
                  </View>
                </Pressable>

                {open ? (
                  <View style={{ paddingHorizontal: rs(14), paddingBottom: rs(12), paddingTop: rs(10), borderTopWidth: 1, borderTopColor: BORDER_SOFT }}>
                    {g.services.map((s) => {
                      const r = ensureRow(s.id);
                      const isPicked = pickedIds.has(s.id);
                      const Icon = iconFor(s.code, s.name);
                      // ₹0 is a valid price now, so ADD is always enabled.
                      const canAdd = true;
                      return (
                        <ServiceItem
                          key={s.id}
                          name={s.name}
                          Icon={Icon}
                          isPicked={isPicked}
                          canAdd={canAdd}
                          price={r.price}
                          onPriceChange={(v) => setField(s.id, 'price', v)}
                          warranty={r.warranty}
                          onWarrantyChange={(c) => setField(s.id, 'warranty', c)}
                          onAdd={() => addService(s)}
                          onRemove={() => removeService(s)}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* ── Others: a custom issue not in the service catalog ─────────
              Same premium card treatment as the category accordions above,
              for visual consistency across the section. */}
          <View
            style={{
              backgroundColor: CARD_BG,
              borderRadius: rs(16),
              borderWidth: 1,
              borderColor: expanded['__other__'] ? ICON_TINT + '33' : BORDER_SOFT,
              overflow: 'hidden',
              marginTop: rs(10),
              shadowColor: '#0B1F14',
              shadowOpacity: expanded['__other__'] ? 0.08 : 0.04,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: expanded['__other__'] ? 3 : 1,
            }}
          >
            <Pressable
              onPress={() => toggleGroup('__other__')}
              className="flex-row items-center active:opacity-80"
              style={{ paddingHorizontal: rs(14), paddingVertical: rs(12) }}
            >
              <View
                className="items-center justify-center mr-3"
                style={{ height: rs(40), width: rs(40), borderRadius: rs(12), backgroundColor: ICON_DISC }}
              >
                <Sparkles size={18} color={ICON_TINT} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-text" style={{ fontSize: rf(13.5) }} numberOfLines={1}>Others</Text>
                <View className="flex-row items-center mt-0.5">
                  <Text className="text-text-muted" style={{ fontSize: rf(11.5) }}>Add a custom issue</Text>
                  {customIssues.length ? (
                    <>
                      <View className="h-1 w-1 rounded-full bg-text-muted mx-1.5" />
                      <Text className="font-semibold" style={{ fontSize: rf(11.5), color: ICON_TINT }}>{customIssues.length} added</Text>
                    </>
                  ) : null}
                </View>
              </View>
              <View
                className="items-center justify-center"
                style={{ height: rs(28), width: rs(28), borderRadius: rs(9), backgroundColor: expanded['__other__'] ? MINT_BG : '#F4F7F5' }}
              >
                {expanded['__other__'] ? <ChevronUp size={16} color={ICON_TINT} /> : <ChevronDown size={16} color={ICON_TINT} />}
              </View>
            </Pressable>

            {expanded['__other__'] ? (
              <View style={{ paddingHorizontal: rs(14), paddingBottom: rs(12), paddingTop: rs(10), borderTopWidth: 1, borderTopColor: BORDER_SOFT }}>
                {/* Already-added custom issues */}
                {customIssues.map((c) => (
                  <View
                    key={c.id}
                    className="rounded-2xl mb-2 bg-success/5 border-success/40"
                    style={{ borderWidth: 1.5, padding: 10 }}
                  >
                    <View className="flex-row items-start">
                      {/* Sparkles, not Wrench: this card is a CUSTOM issue,
                          added through the "Others" row — which is marked with
                          Sparkles. Wrench marks catalogue repairs, so using it
                          here made the two kinds indistinguishable. */}
                      <View className="h-10 w-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: ICON_DISC }}>
                        <Sparkles size={18} color={ICON_TINT} />
                      </View>
                      <View className="flex-1 pr-1.5">
                        <Text className="font-medium text-text " style={{ fontSize: rf(13) }} numberOfLines={2}>{c.name}</Text>
                        <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(11.5) }} numberOfLines={1}>
                          {c.categoryName}
                          {Number(c.price) > 0
                            ? ` · ₹${Number(c.price).toLocaleString('en-IN')}`
                            : ' · Price TBD'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeCustomIssue(c.id)}
                        className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-80"
                        style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
                      >
                        <X size={12} color="#DC2626" />
                        <Text className="text-danger font-medium ml-1" style={{ fontSize: rf(11.5) }}>REMOVE</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {/* Draft: enter issue → pick condition category → price + warranty → ADD */}
                <View className="rounded-2xl bg-background border-border" style={{ borderWidth: 1, padding: 10 }}>
                  <Text className="font-medium text-text-muted tracking-widest mb-1" style={{ fontSize: rf(11.5) }}>ISSUE</Text>
                  <View className="rounded-lg border border-border bg-card px-2.5 mb-2.5">
                    <TextInput
                      key={`other-name-${otherFormKey}`}
                      defaultValue=""
                      onChangeText={(v) => { otherNameRef.current = v; setOtherHasName(v.trim().length > 0); }}
                      placeholder="Describe the issue (e.g. Face ID not working)"
                      placeholderTextColor="#8FA08F"
                      className="text-text"
                      style={{ paddingVertical: rs(8), fontSize: rf(13) }}
                    />
                  </View>

                  {groups.length ? (
                    <>
                      <Text className="font-medium text-text-muted tracking-widest mb-1" style={{ fontSize: rf(11.5) }}>CONDITION CATEGORY</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="mb-2.5"
                        contentContainerStyle={{ paddingRight: 8 }}
                        keyboardShouldPersistTaps="handled"
                      >
                        {groups.map((g) => {
                          const active = otherCatId === g.id;
                          return (
                            <Pressable
                              key={g.id}
                              onPress={() => setOtherCatId(active ? null : g.id)}
                              className="mr-2 px-3 py-1.5 rounded-full"
                              style={{ backgroundColor: active ? BRAND_GREEN : '#fff', borderWidth: 1, borderColor: active ? BRAND_GREEN : '#E2E8E2' }}
                            >
                              <Text className={`font-medium ${active ? 'text-white' : 'text-text'}`} style={{ fontSize: rf(11.5) }}>{g.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  ) : null}

                  <Text className="font-medium text-text-muted tracking-widest mb-1" style={{ fontSize: rf(11.5) }}>PRICE (₹)</Text>
                  <View className="rounded-lg border border-border bg-card px-2.5 mb-2.5 flex-row items-center">
                    <Text className="text-text-muted font-bold mr-1" style={{ fontSize: rf(15) }}>₹</Text>
                    <TextInput
                      key={`other-price-${otherFormKey}`}
                      defaultValue=""
                      onChangeText={(v) => { otherPriceRef.current = v; }}
                      placeholder="0 (leave blank if price is not decided yet)"
                      placeholderTextColor="#8FA08F"
                      keyboardType="numeric"
                      className="flex-1 text-text"
                      style={{ paddingVertical: rs(8), fontSize: rf(13) }}
                    />
                  </View>

                  <Pressable
                    onPress={addCustomIssue}
                    disabled={!otherHasName}
                    className="flex-row items-center justify-center rounded-full py-2.5 active:opacity-80"
                    style={{ backgroundColor: otherHasName ? ADD_BG : ADD_BG_OFF }}
                  >
                    <Plus size={14} color="#fff" />
                    <Text className="text-white font-medium ml-1" style={{ fontSize: rf(13) }}>ADD ISSUE</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
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
            shadowColor: '#0B1F14',
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
                style={{ fontSize: rf(11.5), color: totalSelected > 0 ? '#FFFFFF' : '#667085', opacity: totalSelected > 0 ? 0.9 : 1 }}
              >
                {totalSelected} Service{totalSelected === 1 ? '' : 's'} Selected
              </Text>
              <Text
                className="font-medium"
                style={{ fontSize: rf(13), color: totalSelected > 0 ? '#FFFFFF' : ICON_TINT }}
              >
                {totalSelected > 0 ? `Estimated ₹${formatINR(cartTotal)}` : 'Add a service to continue'}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text
                className="font-medium"
                style={{ fontSize: rf(13), color: totalSelected > 0 ? '#FFFFFF' : '#9AA6A0', marginRight: 2 }}
              >
                Continue
              </Text>
              <ChevronRight size={18} color={totalSelected > 0 ? '#fff' : '#9AA6A0'} />
            </View>
          </View>
        </Pressable>
      </View>

    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Service "menu item" card — Swiggy/Zomato food-item rhythm:
//   [thumbnail]  Name + spec      [Add] / [Remove]
//                price input + warranty pills
// ════════════════════════════════════════════════════════════════════════════
function ServiceItem({
  name, Icon, isPicked, canAdd, price, onPriceChange, warranty, onWarrantyChange, onAdd, onRemove,
}) {
  return (
    <View
      className="rounded-2xl mb-2.5"
      style={{
        backgroundColor: isPicked ? MINT_BG : ROW_BG,
        borderWidth: isPicked ? 1.5 : 1,
        borderColor: isPicked ? ICON_TINT : BORDER_SOFT,
        padding: rs(12),
        shadowColor: '#0B1F14',
        shadowOpacity: isPicked ? 0 : 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: isPicked ? 0 : 1,
      }}
    >
      {/* Row 1 — icon tile + service name */}
      <View className="flex-row items-center">
        <View
          className="items-center justify-center mr-3"
          style={{ height: rs(38), width: rs(38), borderRadius: rs(11), backgroundColor: isPicked ? '#FFFFFF' : MINT_BG }}
        >
          <Icon size={19} color={ICON_TINT} />
        </View>
        <Text className="flex-1 font-semibold text-text" style={{ fontSize: rf(13.5) }} numberOfLines={2}>{name}</Text>
      </View>

      {/* Row 2 — price action row: [₹ input] [Last 5 prices] [+ Add / ✓ Added],
          all three in one horizontal row so "Last 5 prices" reads as tied to
          the price field instead of a disconnected line below it. */}
      <View className="flex-row items-center mt-2.5" style={{ gap: rs(8) }}>
        <View
          className="flex-row items-center rounded-full px-3"
          style={{ height: rs(34), borderWidth: 1, borderColor: isPicked ? ICON_TINT : BORDER_SOFT, backgroundColor: '#FFFFFF' }}
        >
          <Text className="text-text-muted mr-1 font-semibold" style={{ fontSize: rf(11.5) }}>₹</Text>
          <TextInput
            placeholder="0"
            placeholderTextColor="#8FA08F"
            keyboardType="numeric"
            value={String(price ?? '')}
            onChangeText={onPriceChange}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            className="text-text font-bold"
            style={{ paddingVertical: 0, fontSize: rf(13), minWidth: rs(42) }}
          />
        </View>

        <Pressable
          className="active:opacity-70 flex-row items-center rounded-full"
          style={{ height: rs(34), paddingHorizontal: rs(10), borderWidth: 1, borderColor: ACCENT_20, backgroundColor: '#fff' }}
        >
          {/* Explicit hex, not `text-primary`. The token already points at
              #004C40, but NativeWind compiles classes at BUILD time, so a
              token change only lands after `expo start --clear` — and this
              link kept rendering the old green from a warm cache. */}
          <Text numberOfLines={1} style={{ fontSize: rf(10.5), fontWeight: '600', color: ICON_TINT }}>Last 5 prices</Text>
        </Pressable>

        <View style={{ marginLeft: 'auto' }}>
          {isPicked ? (
            // Same remove action as before (onRemove, unchanged) — only the
            // label/colour changed, from a red "REMOVE" warning to a green
            // "ADDED" confirmation. Still tappable to remove it.
            <Pressable
              onPress={onRemove}
              accessibilityLabel="Remove this service"
              className="flex-row items-center rounded-full active:opacity-80"
              style={{ height: rs(34), paddingHorizontal: rs(11), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ICON_TINT }}
            >
              <Check size={12} color={ICON_TINT} strokeWidth={3} />
              <Text className="font-semibold ml-1" style={{ fontSize: rf(11.5), color: ICON_TINT }}>Added</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={!canAdd}
              onPress={onAdd}
              className={`flex-row items-center rounded-full ${canAdd ? 'active:opacity-80' : ''}`}
              style={{
                height: rs(34),
                paddingHorizontal: rs(13),
                backgroundColor: canAdd ? ADD_BG : ADD_BG_OFF,
                shadowColor: canAdd ? ADD_BG : 'transparent',
                shadowOpacity: canAdd ? 0.28 : 0,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: canAdd ? 3 : 0,
              }}
            >
              <Plus size={13} color="#fff" strokeWidth={2.5} />
              <Text className="text-white font-semibold ml-1" style={{ fontSize: rf(11.5) }}>Add</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Row 3 — warranty chips */}
      <View className="mt-3">
        <Text className="font-semibold text-text-muted mb-1.5" style={{ fontSize: rf(11.5) }}>Warranty</Text>
        <View className="flex-row -mx-1">
          {WARRANTY_OPTIONS.map((w) => {
            const active = warranty === w.code;
            return (
              <Pressable
                key={w.code}
                onPress={() => onWarrantyChange(active ? '' : w.code)}
                className="flex-1 mx-1 rounded-full items-center justify-center"
                style={{
                  height: rs(38),
                  backgroundColor: active ? BRAND_GREEN : '#fff',
                  borderWidth: 1,
                  borderColor: active ? BRAND_GREEN : BORDER_SOFT,
                  shadowColor: active ? BRAND_GREEN : 'transparent',
                  shadowOpacity: active ? 0.25 : 0,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: active ? 2 : 0,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{ fontSize: rf(11.5) }}
                  className={`font-medium ${active ? 'text-white' : 'text-text'}`}
                >
                  {w.label}
                </Text>
              </Pressable>
            );
          })}
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
