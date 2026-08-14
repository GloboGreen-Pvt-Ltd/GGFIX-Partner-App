import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  X,
  Hash,
  Sparkles,
  ArrowLeft,
} from 'lucide-react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRepairServices, getRepairCategories } from '../../../api/masterData';
import { rf, rs, isTablet, screenWidth } from '../../../utils/responsive';

// Swiggy / Zomato-inspired palette — green theme. Vibrant green hero gradient,
// deeper green for the floating cart bar shadow + bill total emphasis. ADD
// button uses a slightly different green shade so it stays distinct.
const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

const WARRANTY_OPTIONS = [
  { code: 'W_3M', label: '3 Months' },
  { code: 'W_6M', label: '6 Months' },
  { code: 'W_12M', label: '12 Months' },
];

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
  const scrollRef = useRef(null);

  // ── "Others" custom issues (not in the service catalog) ──────────────
  const [customIssues, setCustomIssues] = useState(seed.customSeed); // committed rows
  const otherNameRef = useRef('');   // draft issue text — uncontrolled to avoid re-render jank
  const otherPriceRef = useRef('');  // draft issue price — uncontrolled like the name
  const [otherHasName, setOtherHasName] = useState(false); // toggles ADD enabled (boundary-only re-render)
  const [otherCatId, setOtherCatId] = useState(null);
  const [otherFormKey, setOtherFormKey] = useState(0); // bump to remount + clear the draft input

  // Lift the focused field above the keyboard. Two mechanisms, because neither
  // is sufficient alone on SDK 54:
  //
  //  - KeyboardAvoidingView (below) shrinks the scroll area. Under Android
  //    edge-to-edge the window is no longer resized for us, so without it the
  //    keyboard simply covers the lower half of the list.
  //  - This helper then scrolls the focused input INTO that shrunken area.
  //    Avoidance alone only guarantees the field isn't behind the keyboard if
  //    it already happened to be in view; a price field ten rows down still
  //    needs scrolling to.
  //
  // The 110px gap clears the field's own warranty pills and the ADD button
  // beneath it, so the whole row stays workable while typing.
  const scrollFocusedInputIntoView = (node) => {
    if (!node) return;
    const responder = scrollRef.current?.getScrollResponder?.();
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(node, 110, true);
  };

  // Same treatment for the "Others" draft form. Its inputs sit at the very
  // bottom of the longest possible scroll, so they were the ones most reliably
  // hidden — and unlike the catalog rows they had no focus handling at all.
  const onDraftFocus = (e) => scrollFocusedInputIntoView(e?.nativeEvent?.target ?? e?.target);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([
          getRepairServices().catch(() => []),
          getRepairCategories().catch(() => []),
        ]);
        setServices(s);
        setMainCats(c);
      } catch (_) { }
      setLoading(false);
    })();
  }, []);

  // Group services by main category (categoryId on the service points to repair-category).
  const groups = useMemo(() => {
    const catById = {};
    (mainCats || []).forEach((c) => { catById[c.id] = c; });
    const byCat = new Map();
    (services || []).forEach((s) => {
      const key = s.categoryId || '__ungrouped__';
      if (!byCat.has(key)) byCat.set(key, { id: key, name: catById[key]?.name || 'Other', services: [] });
      byCat.get(key).services.push(s);
    });
    return Array.from(byCat.values());
  }, [services, mainCats]);

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
      <View className="flex-1 bg-background">
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
    <View className="flex-1 bg-background">
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
              className="text-text font-extrabold text-center"
              style={{ fontSize: rf(14) }}
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
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: 0,
          paddingBottom: rs(160),
          // Tablets: cap the column and centre it. Full-bleed rows on a 10"
          // screen put the price field and its ADD button a hand's width
          // apart, which is a worse form than a narrow one.
          ...(isTablet ? { width: Math.min(screenWidth, 620), alignSelf: 'center' } : null),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ── Device "restaurant card" — overlaps the gradient, Zomato-style ── */}
        <View className="px-4" style={{ marginTop: 14 }}>
          <View
            className="bg-card rounded-2xl p-3"
            style={{
              shadowColor: '#172117',
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View className="flex-row items-center">
              <View className="h-14 w-14 rounded-2xl bg-primary/10 items-center justify-center overflow-hidden mr-3">
                {params.imageUrl ? (
                  <Image source={{ uri: params.imageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <Smartphone size={24} color="#087A0A" />
                )}
              </View>
              <View className="flex-1">
                <Text className="font-extrabold text-text" style={{ fontSize: rf(14) }} numberOfLines={1}>
                  {params.modelName || 'Device'}
                </Text>
                <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(12) }} numberOfLines={1}>
                  {[params.ramLabel, params.storageLabel, params.color].filter(Boolean).join(' · ')}
                </Text>
                {params.modelNumber ? (
                  <View className="flex-row items-center mt-1.5">
                    <View className="flex-row items-center bg-primary/10 rounded-md px-1.5 py-0.5">
                      <Hash size={10} color="#087A0A" />
                      <Text className="text-primary font-extrabold ml-0.5" style={{ fontSize: rf(12) }}>{params.modelNumber}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* ── Section header — like Swiggy's "Recommended" rail ──────────── */}
        <View className="px-4 pt-4 pb-1.5 flex-row items-center">
          <Sparkles size={14} color={BRAND_GREEN} />
          <Text className="text-text font-extrabold tracking-widest ml-1.5" style={{ fontSize: rf(12) }}>RECOMMENDED REPAIRS</Text>
          <View className="flex-1 h-px bg-border ml-2" />
        </View>

        {/* ── Categories: accordion list (Swiggy menu-section style) ─────── */}
        <View className="px-4">
          {groups.map((g) => {
            const open = !!expanded[g.id];
            const pickedInGroup = g.services.filter((s) => pickedIds.has(s.id)).length;
            const Chevron = open ? ChevronUp : ChevronDown;
            return (
              <View
                key={g.id}
                className="mb-2.5 bg-card rounded-2xl overflow-hidden"
                style={{
                  shadowColor: '#172117',
                  shadowOpacity: 0.05,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <Pressable
                  onPress={() => toggleGroup(g.id)}
                  className="flex-row items-center px-3.5 py-3 active:opacity-80"
                >
                  <View className="h-9 w-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: 'rgba(22, 187, 5, 0.12)' }}>
                    <Wrench size={16} color={BRAND_GREEN} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-extrabold text-text" style={{ fontSize: rf(14) }} numberOfLines={1}>{g.name}</Text>
                    <View className="flex-row items-center mt-0.5">
                      <Text className="text-text-muted" style={{ fontSize: rf(12) }}>
                        {g.services.length} {g.services.length === 1 ? 'option' : 'options'}
                      </Text>
                      {pickedInGroup ? (
                        <>
                          <View className="h-1 w-1 rounded-full bg-text-muted mx-1.5" />
                          <Text className="text-success font-extrabold" style={{ fontSize: rf(12) }}>
                            {pickedInGroup} added
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <Chevron size={18} color="#667066" />
                </Pressable>

                {open ? (
                  <View className="px-3.5 pb-2.5 pt-1">
                    {g.services.map((s) => {
                      const r = ensureRow(s.id);
                      const isPicked = pickedIds.has(s.id);
                      const Icon = iconFor(s.code);
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
                          onPriceFocus={scrollFocusedInputIntoView}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* ── Others: a custom issue not in the service catalog ───────── */}
          <View
            className="mb-2.5 bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <Pressable
              onPress={() => toggleGroup('__other__')}
              className="flex-row items-center px-3.5 py-3 active:opacity-80"
            >
              <View className="h-9 w-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)' }}>
                <Sparkles size={16} color="#B45309" />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold text-text" style={{ fontSize: rf(14) }} numberOfLines={1}>Others</Text>
                <View className="flex-row items-center mt-0.5">
                  <Text className="text-text-muted" style={{ fontSize: rf(12) }}>Add a custom issue</Text>
                  {customIssues.length ? (
                    <>
                      <View className="h-1 w-1 rounded-full bg-text-muted mx-1.5" />
                      <Text className="text-success font-extrabold" style={{ fontSize: rf(12) }}>{customIssues.length} added</Text>
                    </>
                  ) : null}
                </View>
              </View>
              {expanded['__other__'] ? <ChevronUp size={18} color="#667066" /> : <ChevronDown size={18} color="#667066" />}
            </Pressable>

            {expanded['__other__'] ? (
              <View className="px-3.5 pb-2.5 pt-1">
                {/* Already-added custom issues */}
                {customIssues.map((c) => (
                  <View
                    key={c.id}
                    className="rounded-2xl mb-2 bg-success/5 border-success/40"
                    style={{ borderWidth: 1.5, padding: 10 }}
                  >
                    <View className="flex-row items-start">
                      <View className="h-10 w-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: ACCENT_GREEN }}>
                        <Wrench size={18} color="#fff" />
                      </View>
                      <View className="flex-1 pr-1.5">
                        <Text className="font-extrabold text-text " style={{ fontSize: rf(14) }} numberOfLines={2}>{c.name}</Text>
                        <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(12) }} numberOfLines={1}>
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
                        <Text className="text-danger font-extrabold ml-1" style={{ fontSize: rf(12) }}>REMOVE</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {/* Draft: enter issue → pick condition category → price + warranty → ADD */}
                <View className="rounded-2xl bg-background border-border" style={{ borderWidth: 1, padding: 10 }}>
                  <Text className="font-extrabold text-text-muted tracking-widest mb-1" style={{ fontSize: rf(12) }}>ISSUE</Text>
                  <View className="rounded-lg border border-border bg-card px-2.5 mb-2.5">
                    <TextInput
                      key={`other-name-${otherFormKey}`}
                      defaultValue=""
                      onChangeText={(v) => { otherNameRef.current = v; setOtherHasName(v.trim().length > 0); }}
                      onFocus={onDraftFocus}
                      placeholder="Describe the issue (e.g. Face ID not working)"
                      placeholderTextColor="#8FA08F"
                      className="text-text"
                      style={{ paddingVertical: rs(8), fontSize: rf(14) }}
                    />
                  </View>

                  {groups.length ? (
                    <>
                      <Text className="font-extrabold text-text-muted tracking-widest mb-1" style={{ fontSize: rf(12) }}>CONDITION CATEGORY</Text>
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
                              <Text className={`font-extrabold ${active ? 'text-white' : 'text-text'}`} style={{ fontSize: rf(12) }}>{g.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  ) : null}

                  <Text className="font-extrabold text-text-muted tracking-widest mb-1" style={{ fontSize: rf(12) }}>PRICE (₹)</Text>
                  <View className="rounded-lg border border-border bg-card px-2.5 mb-2.5 flex-row items-center">
                    <Text className="text-text-muted font-bold mr-1" style={{ fontSize: rf(15) }}>₹</Text>
                    <TextInput
                      key={`other-price-${otherFormKey}`}
                      defaultValue=""
                      onChangeText={(v) => { otherPriceRef.current = v; }}
                      onFocus={onDraftFocus}
                      placeholder="0 (leave blank if price is not decided yet)"
                      placeholderTextColor="#8FA08F"
                      keyboardType="numeric"
                      className="flex-1 text-text"
                      style={{ paddingVertical: rs(8), fontSize: rf(14) }}
                    />
                  </View>

                  <Pressable
                    onPress={addCustomIssue}
                    disabled={!otherHasName}
                    className="flex-row items-center justify-center rounded-full py-2.5 active:opacity-80"
                    style={{ backgroundColor: otherHasName ? ACCENT_GREEN : 'rgba(8, 122, 10, 0.35)' }}
                  >
                    <Plus size={14} color="#fff" />
                    <Text className="text-white font-extrabold ml-1" style={{ fontSize: rf(13) }}>ADD ISSUE</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* ── Floating "View Cart" style sticky CTA ─────────────────────── */}
      {totalSelected > 0 ? (
        <View
          className="absolute left-0 right-0"
          style={{ bottom: insets.bottom + 4, paddingHorizontal: 16 }}
        >
          <Pressable
            onPress={onContinue}
            className="active:opacity-90"
            style={{
              borderRadius: 18,
              overflow: 'hidden',
              shadowColor: BRAND_GREEN_DARK,
              shadowOpacity: 0.35,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
          >
            <LinearGradient
              colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
            >
              <View className="bg-white/20 rounded-full h-9 px-2.5 items-center justify-center flex-row mr-3">
                <Text className="text-white font-extrabold" style={{ fontSize: rf(12) }}>{totalSelected}</Text>
                <Text className="text-white font-bold ml-1" style={{ fontSize: rf(12) }}>item{totalSelected > 1 ? 's' : ''}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold opacity-90" style={{ fontSize: rf(12) }}>Total estimated</Text>
                <Text className="text-white font-extrabold" style={{ fontSize: rf(14) }}>₹{formatINR(cartTotal)}</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-white font-extrabold" style={{ fontSize: rf(14) }}>Continue</Text>
                <ChevronRight size={18} color="#fff" />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <View
          className="absolute left-0 right-0 items-center"
          style={{ bottom: insets.bottom + 6, paddingHorizontal: 16 }}
        >
          <View className="bg-card border border-border rounded-full px-4 py-2 flex-row items-center" style={{ elevation: 2 }}>
            <Plus size={14} color={BRAND_GREEN} />
            <Text className="text-text-muted font-semibold ml-1.5" style={{ fontSize: rf(12) }}>
              Add a service to continue
            </Text>
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Service "menu item" card — Swiggy/Zomato food-item rhythm:
//   [thumbnail]  Name + spec      [Add] / [Remove]
//                price input + warranty pills
// ════════════════════════════════════════════════════════════════════════════
function ServiceItem({
  name, Icon, isPicked, canAdd, price, onPriceChange, warranty, onWarrantyChange, onAdd, onRemove, onPriceFocus,
}) {
  return (
    <View
      className={`rounded-2xl mb-2 ${isPicked ? 'bg-success/5 border-success/40' : 'bg-background border-border'}`}
      style={{ borderWidth: isPicked ? 1.5 : 1, padding: 10 }}
    >
      <View className="flex-row items-start">
        <View
          className={`h-10 w-10 rounded-xl items-center justify-center mr-3 ${isPicked ? '' : 'bg-card'}`}
          style={isPicked ? { backgroundColor: ACCENT_GREEN } : null}
        >
          <Icon size={18} color={isPicked ? '#fff' : '#172117'} />
        </View>

        <View className="flex-1 pr-1.5">
          <Text className="font-extrabold text-text" style={{ fontSize: rf(14) }} numberOfLines={2}>{name}</Text>

          {/* Price input — chip-style. The row wraps rather than squeezing:
              at a large system font "Last 5 prices" and an 80px field no
              longer fit beside each other on a 360px phone, and shrinking
              either one is worse than letting the link drop to its own line. */}
          <View className="flex-row items-center mt-1.5 flex-wrap">
            <View className={`flex-row items-center rounded-lg border px-2 ${isPicked ? 'border-success/40 bg-card' : 'border-border bg-card'}`}>
              <Text className="text-text-muted mr-1" style={{ fontSize: rf(12) }}>₹</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#8FA08F"
                keyboardType="numeric"
                value={String(price ?? '')}
                onChangeText={onPriceChange}
                onFocus={(e) => onPriceFocus?.(e?.nativeEvent?.target ?? e?.target)}
                autoComplete="off"
                importantForAutofill="no"
                textContentType="none"
                className="text-text font-bold"
                style={{ paddingVertical: rs(5), fontSize: rf(14), minWidth: rs(80) }}
              />
            </View>
            <Pressable className="ml-2 active:opacity-60">
              <Text className="text-primary underline" style={{ fontSize: rf(12) }}>Last 5 prices</Text>
            </Pressable>
          </View>
        </View>

        {/* Add / Remove button — Swiggy stepper-shape */}
        <View className="items-end">
          {isPicked ? (
            <Pressable
              onPress={onRemove}
              className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-80"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.10)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' }}
            >
              <X size={12} color="#DC2626" />
              <Text className="text-danger font-extrabold ml-1" style={{ fontSize: rf(12) }}>REMOVE</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={!canAdd}
              onPress={onAdd}
              className={`flex-row items-center rounded-full px-3.5 py-1.5 ${canAdd ? 'active:opacity-80' : ''}`}
              style={{
                backgroundColor: canAdd ? ACCENT_GREEN : 'rgba(8, 122, 10, 0.35)',
                shadowColor: canAdd ? ACCENT_GREEN : 'transparent',
                shadowOpacity: canAdd ? 0.25 : 0,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: canAdd ? 3 : 0,
              }}
            >
              <Plus size={12} color="#fff" />
              <Text className="text-white font-extrabold ml-0.5" style={{ fontSize: rf(12) }}>ADD</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Warranty pills — like Swiggy's "Size" / Zomato's "Variant" chips */}
      <View className="mt-2">
        <Text className="font-extrabold text-text-muted tracking-widest mb-1" style={{ fontSize: rf(12) }}>WARRANTY</Text>
        <View className="flex-row -mx-1">
          {WARRANTY_OPTIONS.map((w) => {
            const active = warranty === w.code;
            return (
              <Pressable
                key={w.code}
                onPress={() => onWarrantyChange(active ? '' : w.code)}
                className="flex-1 mx-1 py-1.5 rounded-full items-center"
                style={{
                  backgroundColor: active ? BRAND_GREEN : '#fff',
                  borderWidth: 1,
                  borderColor: active ? BRAND_GREEN : '#E2E8E2',
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
                  style={{ fontSize: rf(12) }}
                  className={`font-extrabold ${active ? 'text-white' : 'text-text'}`}
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

function iconFor(code) {
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
    default: return Wrench;
  }
}
