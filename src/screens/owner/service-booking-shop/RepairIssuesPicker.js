import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, MessageSquarePlus, Sparkles, X, ChevronDown, Search } from 'lucide-react-native';
import { getRepairServices, getRepairCategories, getRepairServicesGrouped } from '../../../api/masterData';
import { ResponsiveModal } from '../../../components/responsive';
import { groupIconFor, iconFor, priceNum, SelectedIssueRow, warrantyMonths, warrantyText } from './DeviceServicesScreen';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const PLACEHOLDER = '#9CA3AF';
const LINE = '#E5E7EB';
// Price-line code for the booking's service charge (not a catalogue service).
export const SERVICE_CHARGE_CODE = 'SERVICE_CHARGE';
// chargePerService: each issue's charge is its own line, "Service Charge – <issue>".
const CHARGE_LABEL = /^Service Charge – (.+)$/;
const chargeLine = (name, amount) => ({
  serviceId: null,
  serviceCode: SERVICE_CHARGE_CODE,
  serviceName: `Service Charge – ${name}`,
  categoryName: 'Service',
  price: amount,
  priceSet: true,
  warranty: warrantyText(''),
  note: '',
});

// Issue groups shown before "View All" (the custom "Other Issue" tile is extra).
const FIRST_TILES = 8;
// These groups first, the rest after in API order (same order the old Issue
// Description screen used).
const TILE_ORDER = [/dead|no power/i, /display|screen/i, /battery/i, /motherboard|mainboard|sub-?board/i, /network/i, /security/i];
const tileRank = (name) => {
  const i = TILE_ORDER.findIndex((re) => re.test(String(name || '')));
  return i === -1 ? TILE_ORDER.length : i;
};

let nextOtherId = 1;

/**
 * Repair Issues for the Devices & Repair screen: a compact grid of the device
 * category's issue groups (from the issue master data — nothing hard-coded),
 * a sheet to pick that group's issues, and the selected services with an
 * editable price and warranty each.
 *
 * `onChange(services)` fires with the same shape the old Issue Description
 * screen handed on: { serviceId, serviceCode, serviceName, categoryName,
 * price, warranty } (custom issues: serviceId null, serviceCode 'OTHER').
 * An untyped price stays empty on screen ("Not Estimated"); the booking
 * payload treats it as 0, as before.
 */
export default function RepairIssuesPicker({ categoryId, initialServices, onChange, isTablet = false, excludeIds = null, withNotes = false, withServiceCharge = false, showServiceCharge = false, chargePerService = false }) {
  // Re-Estimate: issues already in the estimate can't be added again.
  const excludeKey = Array.isArray(excludeIds) ? excludeIds.filter(Boolean).join('|') : '';
  const seed = useMemo(() => {
    const list = Array.isArray(initialServices) ? initialServices : [];
    const rowSeed = {};
    const idSeed = new Set();
    const nameSeed = {};
    const customSeed = [];
    const noteSeed = {};
    let chargeSeed = '';
    const chargeByName = {};
    for (const s of list) {
      const own = chargePerService && s?.serviceCode === SERVICE_CHARGE_CODE && String(s.serviceName || '').match(CHARGE_LABEL);
      if (own) { chargeByName[own[1]] = Number(s.price) ? String(s.price) : ''; continue; }
      if (s?.serviceId) {
        rowSeed[s.serviceId] = { price: Number(s.price) ? String(s.price) : '', warranty: warrantyMonths(s.warranty) };
        idSeed.add(s.serviceId);
        nameSeed[s.serviceId] = { name: s.serviceName, code: s.serviceCode, categoryName: s.categoryName };
        if (s.note) noteSeed[s.serviceId] = s.note;
      } else if (s?.serviceCode === SERVICE_CHARGE_CODE) {
        chargeSeed = Number(s.price) ? String(s.price) : '';
      } else if (s?.serviceName) {
        customSeed.push({
          id: `other-${nextOtherId++}`,
          name: s.serviceName,
          categoryId: s.categoryId || null,
          categoryName: s.categoryName || 'Others',
          price: priceNum(s.price),
          warranty: warrantyMonths(s.warranty),
          note: s.note || '',
        });
      }
    }
    // "Service Charge – <issue>" lines go back onto their issue's row.
    for (const [n, p] of Object.entries(chargeByName)) {
      const id = Object.keys(nameSeed).find((k) => nameSeed[k].name === n);
      const c = id ? null : customSeed.find((i) => i.name === n);
      if (id) rowSeed[id].charge = p;
      else if (c) c.charge = p;
    }
    return { rowSeed, idSeed, nameSeed, customSeed, noteSeed, chargeSeed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [catalog, setCatalog] = useState([]);
  const [mainCats, setMainCats] = useState([]);
  const [grouped, setGrouped] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState(seed.rowSeed);
  const [pickedIds, setPickedIds] = useState(() => new Set(seed.idSeed));
  const [customIssues, setCustomIssues] = useState(seed.customSeed);
  const [sheetId, setSheetId] = useState(null);
  // withNotes: every issue in the sheet shows its own notes box.
  const [notes, setNotes] = useState(seed.noteSeed);
  // Booking only: a shop service charge, sent as its own price line.
  const [serviceCharge, setServiceCharge] = useState(seed.chargeSeed);
  const [otherOpen, setOtherOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Search across every issue of this device category; matches list right away.
  const [query, setQuery] = useState('');
  const otherNameRef = useRef('');
  const [otherKey, setOtherKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, c, g] = await Promise.all([
        getRepairServices().catch(() => []),
        getRepairCategories().catch(() => []),
        getRepairServicesGrouped(categoryId).catch(() => []),
      ]);
      if (cancelled) return;
      setCatalog(Array.isArray(s) ? s : []);
      setMainCats(Array.isArray(c) ? c : []);
      setGrouped(Array.isArray(g) ? g : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [categoryId]);

  // Device-category groups from /master/repair-services/grouped, hydrated
  // against the full catalogue; falls back to grouping by repair category.
  const groupsAll = useMemo(() => {
    if (categoryId && grouped && grouped.length > 0) {
      const byId = new Map(catalog.map((x) => [x.id, x]));
      return grouped
        .map((g) => ({ id: g.id, name: g.name, services: (g.issues || []).map((i) => byId.get(i.id)).filter(Boolean) }))
        .filter((g) => g.services.length > 0);
    }
    const catById = {};
    mainCats.forEach((c) => { catById[c.id] = c; });
    const byCat = new Map();
    catalog.forEach((x) => {
      const key = x.categoryId || '__ungrouped__';
      if (!byCat.has(key)) byCat.set(key, { id: key, name: catById[key]?.name || 'Other', services: [] });
      byCat.get(key).services.push(x);
    });
    return Array.from(byCat.values());
  }, [catalog, mainCats, grouped, categoryId]);
  const groups = useMemo(() => {
    if (!excludeKey) return groupsAll;
    const ex = new Set(excludeKey.split('|'));
    return groupsAll
      .map((g) => ({ ...g, services: g.services.filter((x) => !ex.has(x.id)) }))
      .filter((g) => g.services.length > 0);
  }, [groupsAll, excludeKey]);

  const tileGroups = useMemo(() => groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => tileRank(a.g.name) - tileRank(b.g.name) || a.i - b.i)
    .map(({ g }) => g), [groups]);
  const visibleGroups = showAll ? tileGroups : tileGroups.slice(0, FIRST_TILES);

  const serviceById = useMemo(() => {
    const m = {};
    catalog.forEach((x) => { m[x.id] = x; });
    return m;
  }, [catalog]);
  const catByService = useMemo(() => {
    const m = {};
    groups.forEach((g) => g.services.forEach((x) => { m[x.id] = g.name; }));
    return m;
  }, [groups]);

  const row = (id) => rows[id] || { price: '', warranty: '' };
  const setField = (id, key, value) => setRows((p) => ({ ...p, [id]: { ...(p[id] || { price: '', warranty: '' }), [key]: value } }));
  const toggleService = (id) => setPickedIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Hand the selection up whenever it changes (only once the catalogue is in,
  // so a prefilled service never goes up without its name).
  useEffect(() => {
    if (loading) return;
    // An issue's own charge line follows right after it.
    const withCharge = (line, amount) => (chargePerService && amount > 0 ? [line, chargeLine(line.serviceName, amount)] : [line]);
    const selected = [...pickedIds].flatMap((id) => {
      const x = serviceById[id];
      const seeded = seed.nameSeed[id] || {};
      const rw = rows[id] || { price: '', warranty: '' };
      return withCharge({
        serviceId: id,
        serviceCode: x?.code ?? seeded.code,
        serviceName: x?.name ?? seeded.name,
        categoryName: catByService[id] || seeded.categoryName || null,
        price: priceNum(rw.price),
        priceSet: String(rw.price ?? '').trim() !== '',
        warranty: warrantyText(rw.warranty),
        note: (notes[id] || '').trim(),
      }, priceNum(rw.charge));
    });
    const custom = customIssues.flatMap((c) => withCharge({
      serviceId: null,
      serviceCode: 'OTHER',
      serviceName: c.name,
      categoryId: c.categoryId || null,
      categoryName: c.categoryName || 'Others',
      price: Number(c.price) || 0,
      priceSet: Number(c.price) > 0,
      warranty: warrantyText(c.warranty),
      note: (c.note || '').trim(),
    }, Number(c.charge) || 0));
    const charge = withServiceCharge && priceNum(serviceCharge) > 0 ? [{
      serviceId: null,
      serviceCode: SERVICE_CHARGE_CODE,
      serviceName: 'Service Charge',
      categoryName: 'Service',
      price: priceNum(serviceCharge),
      priceSet: true,
      warranty: warrantyText(''),
      note: '',
    }] : [];
    onChange?.([...selected, ...custom, ...charge]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pickedIds, rows, customIssues, serviceById, catByService, notes, serviceCharge]);

  const addCustom = () => {
    const name = (otherNameRef.current || '').trim();
    if (name) {
      setCustomIssues((list) => [...list, { id: `other-${nextOtherId++}`, name, categoryId: null, categoryName: 'Others', price: 0, warranty: '' }]);
    }
    otherNameRef.current = '';
    setOtherKey((k) => k + 1);
    setOtherOpen(false);
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const seen = new Set();
    const out = [];
    groups.forEach((g) => g.services.forEach((x) => {
      if (seen.has(x.id) || !String(x.name || '').toLowerCase().includes(q)) return;
      seen.add(x.id);
      out.push({ ...x, groupName: g.name });
    }));
    // Names that START with the text first, then the rest (A–Z).
    return out.sort((a, b) => {
      const sa = String(a.name).toLowerCase().startsWith(q) ? 0 : 1;
      const sb = String(b.name).toLowerCase().startsWith(q) ? 0 : 1;
      return sa - sb || String(a.name).localeCompare(String(b.name));
    }).slice(0, 12);
  }, [q, groups]);
  const addTypedAsOther = () => {
    const name = query.trim();
    if (!name) return;
    setCustomIssues((list) => [...list, { id: `other-${nextOtherId++}`, name, categoryId: null, categoryName: 'Others', price: 0, warranty: '' }]);
    setQuery('');
  };

  // Display Replacement leads its group's list; the rest keep API order.
  const sheetGroupRaw = groups.find((g) => g.id === sheetId) || null;
  const sheetGroup = sheetGroupRaw ? {
    ...sheetGroupRaw,
    services: [...sheetGroupRaw.services].sort((a, b) => (/display\s*replacement/i.test(b.name) ? 1 : 0) - (/display\s*replacement/i.test(a.name) ? 1 : 0)),
  } : null;
  const cols = isTablet ? 5 : 3;
  const totalSelected = pickedIds.size + customIssues.length;
  const priced = [...pickedIds].some((id) => priceNum(row(id).price) > 0) || customIssues.some((c) => Number(c.price) > 0);
  const chargeAmt = withServiceCharge ? priceNum(serviceCharge) : 0;
  const perCharge = (v) => (chargePerService ? priceNum(v) : 0);
  const total = [...pickedIds].reduce((sum, id) => sum + priceNum(row(id).price) + perCharge(row(id).charge), 0)
    + customIssues.reduce((sum, c) => sum + (Number(c.price) || 0) + perCharge(c.charge), 0)
    + chargeAmt;

  if (loading) {
    return (
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <View>
      {/* Search issues — e.g. "display", "battery", "face id". */}
      <View className="flex-row items-center" style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#F9FAFB', paddingHorizontal: 12, marginBottom: 8 }}>
        <Search size={17} color={MUTED} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search issue (e.g. display, battery)"
          placeholderTextColor={PLACEHOLDER}
          returnKeyType="search"
          autoCorrect={false}
          cursorColor={ACCENT}
          style={{ flex: 1, marginLeft: 8, paddingVertical: 0, fontSize: 13.5, color: INK, includeFontPadding: false }}
          accessibilityLabel="Search repair issue"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear issue search">
            <X size={16} color={MUTED} />
          </Pressable>
        ) : null}
      </View>

      {q ? (
        // Matching issues, shown as you type — tap to select / unselect.
        <View style={{ marginBottom: 4 }}>
          {matches.map((x) => {
            const on = pickedIds.has(x.id);
            const Icon = iconFor(x.code, x.name);
            return (
              <Pressable
                key={x.id}
                onPress={() => toggleService(x.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className="flex-row items-center active:opacity-80"
                style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 6, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : LINE, backgroundColor: on ? MINT : '#FFFFFF' }}
              >
                <Icon size={18} color={on ? ACCENT : INK} strokeWidth={1.75} />
                <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: INK }} numberOfLines={2}>{x.name}</Text>
                  <Text style={{ fontSize: 11, color: MUTED }} numberOfLines={1}>{x.groupName}</Text>
                </View>
                <View className="items-center justify-center" style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? ACCENT : '#C9CFC9', backgroundColor: on ? ACCENT : '#FFFFFF' }}>
                  {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
          {matches.length === 0 ? (
            <Pressable
              onPress={addTypedAsOther}
              accessibilityRole="button"
              className="flex-row items-center active:opacity-80"
              style={{ minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: ACCENT, backgroundColor: MINT }}
            >
              <MessageSquarePlus size={18} color={ACCENT} strokeWidth={1.75} />
              <Text style={{ flex: 1, marginLeft: 10, fontSize: 13, color: INK }} numberOfLines={2}>
                No matching issue — add <Text style={{ fontWeight: '800' }}>“{query.trim()}”</Text> as Other Issue
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Issue groups — 3 per row on phones, 5 on tablets (hidden while searching). */}
      {!q ? (
      <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
        {visibleGroups.map((g) => {
          const Icon = groupIconFor(g.name);
          const count = g.services.filter((x) => pickedIds.has(x.id)).length;
          return (
            <View key={g.id} style={{ width: `${100 / cols}%`, padding: 3 }}>
              <IssueTile name={g.name} Icon={Icon} picked={count} onPress={() => setSheetId(g.id)} />
            </View>
          );
        })}
        <View style={{ width: `${100 / cols}%`, padding: 3 }}>
          <IssueTile
            name="Other Issue"
            Icon={MessageSquarePlus}
            picked={customIssues.length}
            onPress={() => { otherNameRef.current = ''; setOtherKey((k) => k + 1); setOtherOpen(true); }}
          />
        </View>
      </View>
      {tileGroups.length > FIRST_TILES ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          className="flex-row items-center justify-center active:opacity-70"
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: ACCENT }}>
            {showAll ? 'Show less' : `View All (${tileGroups.length})`}
          </Text>
          <ChevronDown size={14} color={ACCENT} style={{ marginLeft: 2, transform: [{ rotate: showAll ? '180deg' : '0deg' }] }} />
        </Pressable>
      ) : null}
      </>
      ) : null}

      {/* Selected services — price + warranty each. */}
      {totalSelected > 0 ? (
        <View style={{ marginTop: 10 }}>
          <View className="flex-row items-center" style={{ marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: INK }}>Selected Services ({totalSelected})</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: priced ? ACCENT : MUTED }}>
              {priced ? `₹${total.toLocaleString('en-IN')}` : 'Not Estimated'}
            </Text>
          </View>
          {showServiceCharge || chargePerService ? null : (
            <Text style={{ fontSize: 11, color: MUTED, marginTop: -4, marginBottom: 8 }}>Price includes service charge & warranty</Text>
          )}
          {[...pickedIds].map((id) => {
            const x = serviceById[id];
            const name = x?.name || seed.nameSeed[id]?.name;
            if (!name) return null;
            return (
              <SelectedIssueRow
                key={id}
                name={name}
                sub={withNotes && notes[id]?.trim() ? `Note: ${notes[id].trim()}` : (catByService[id] || undefined)}
                Icon={iconFor(x?.code, name)}
                price={row(id).price}
                onPriceChange={(v) => setField(id, 'price', String(v).replace(/[^0-9.]/g, ''))}
                charge={row(id).charge || ''}
                onChargeChange={chargePerService ? (v) => setField(id, 'charge', String(v).replace(/[^0-9.]/g, '')) : undefined}
                warranty={row(id).warranty}
                onWarrantyChange={(v) => setField(id, 'warranty', String(v).replace(/[^0-9]/g, ''))}
                onRemove={() => toggleService(id)}
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
              onPriceChange={(v) => setCustomIssues((l) => l.map((i) => (i.id === c.id ? { ...i, price: priceNum(v) } : i)))}
              charge={c.charge || ''}
              onChargeChange={chargePerService ? (v) => setCustomIssues((l) => l.map((i) => (i.id === c.id ? { ...i, charge: String(v).replace(/[^0-9.]/g, '') } : i))) : undefined}
              warranty={c.warranty || ''}
              onWarrantyChange={(v) => setCustomIssues((l) => l.map((i) => (i.id === c.id ? { ...i, warranty: String(v).replace(/[^0-9]/g, '') } : i)))}
              onRemove={() => setCustomIssues((l) => l.filter((i) => i.id !== c.id))}
            />
          ))}
          {withServiceCharge && (showServiceCharge || !!seed.chargeSeed) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>Service Charge</Text>
                <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>Optional · added to the estimate</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', width: 112, height: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: LINE }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: MUTED, marginRight: 4 }}>₹</Text>
                <TextInput
                  value={serviceCharge}
                  onChangeText={(v) => setServiceCharge(String(v).replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="Amount"
                  placeholderTextColor={PLACEHOLDER}
                  cursorColor={ACCENT}
                  accessibilityLabel="Service charge"
                  style={{ flex: 1, paddingVertical: 0, fontSize: 14, fontWeight: '800', color: INK }}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* A group's issues — tap to select / unselect (several allowed). */}
      <ResponsiveModal visible={!!sheetGroup} onClose={() => setSheetId(null)} maxWidth={520}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: 10 }} />
        {sheetGroup ? (
          <>
            <View className="flex-row items-center" style={{ marginBottom: 10 }}>
              {(() => { const G = groupIconFor(sheetGroup.name); return <G size={20} color={INK} strokeWidth={1.75} />; })()}
              <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: INK }} numberOfLines={1}>{sheetGroup.name}</Text>
              <Pressable onPress={() => setSheetId(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={MUTED} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {sheetGroup.services.map((x) => {
                const on = pickedIds.has(x.id);
                const Icon = iconFor(x.code, x.name);
                return (
                  <React.Fragment key={x.id}>
                  <Pressable
                    // Select / unselect, then the sheet closes by itself.
                    onPress={() => { toggleService(x.id); setSheetId(null); }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center active:opacity-80"
                    style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : LINE, backgroundColor: on ? MINT : '#FFFFFF' }}
                  >
                    <Icon size={19} color={on ? ACCENT : INK} strokeWidth={1.75} />
                    <Text style={{ flex: 1, marginLeft: 12, fontSize: 13, fontWeight: on ? '700' : '500', color: INK }} numberOfLines={2}>{x.name}</Text>
                    <View className="items-center justify-center" style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? ACCENT : '#C9CFC9', backgroundColor: on ? ACCENT : '#FFFFFF' }}>
                      {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                  {withNotes ? (
                    <TextInput
                      value={notes[x.id] || ''}
                      onChangeText={(v) => setNotes((m) => ({ ...m, [x.id]: v }))}
                      placeholder="Additional notes (optional)"
                      placeholderTextColor="#9CA3AF"
                      maxLength={200}
                      cursorColor={ACCENT}
                      style={{ height: 42, marginTop: -2, marginBottom: 8, paddingHorizontal: 12, fontSize: 13, color: INK, includeFontPadding: false, borderWidth: 1, borderColor: LINE, borderRadius: 10, backgroundColor: '#FFFFFF' }}
                    />
                  ) : null}
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </ResponsiveModal>

      {/* Other Issue — one that isn't in the catalogue; Done / closing adds it. */}
      <ResponsiveModal visible={otherOpen} onClose={addCustom} maxWidth={520}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: LINE, marginBottom: 10 }} />
        <View className="flex-row items-center" style={{ marginBottom: 10 }}>
          <MessageSquarePlus size={20} color={INK} strokeWidth={1.75} />
          <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: INK }}>Other Issue</Text>
          <Pressable onPress={addCustom} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={MUTED} />
          </Pressable>
        </View>
        <View className="flex-row items-center px-3" style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' }}>
          <TextInput
            key={`other-${otherKey}`}
            defaultValue=""
            autoFocus
            onChangeText={(v) => { otherNameRef.current = v; }}
            onSubmitEditing={addCustom}
            returnKeyType="done"
            placeholder="Describe the issue (e.g. Face ID not working)"
            placeholderTextColor={PLACEHOLDER}
            cursorColor={ACCENT}
            style={{ flex: 1, paddingVertical: 0, fontSize: 13, color: INK }}
          />
        </View>
      </ResponsiveModal>
    </View>
  );
}

// Compact issue tile — icon over a two-line label; picked = teal edge, mint
// fill and a ✓ badge.
function IssueTile({ name, Icon, picked, onPress }) {
  const on = picked > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${on ? `, ${picked} selected` : ''}`}
      className="items-center justify-center active:opacity-80"
      style={{ minHeight: 74, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : LINE, backgroundColor: on ? MINT : '#FFFFFF' }}
    >
      {on ? (
        <View className="items-center justify-center" style={{ position: 'absolute', top: 5, right: 5, height: 16, minWidth: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: ACCENT }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{picked}</Text>
        </View>
      ) : null}
      <Icon size={22} color={on ? ACCENT : INK} strokeWidth={1.75} />
      <Text style={{ marginTop: 6, fontSize: 11.5, lineHeight: 14, fontWeight: on ? '700' : '500', color: INK, textAlign: 'center' }} numberOfLines={2}>
        {name}
      </Text>
    </Pressable>
  );
}
