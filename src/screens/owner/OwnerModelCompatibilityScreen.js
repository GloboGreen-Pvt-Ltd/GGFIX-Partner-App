import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Barcode,
  Boxes,
  ChevronRight,
  Info,
  Puzzle,
  Search,
  Smartphone,
} from 'lucide-react-native';
import { ErrorState, Loader, ScreenHeader, SearchBar } from '../../components/rnr';
import DeviceImage from '../../components/DeviceImage';
import {
  getAllModels,
  getBrands,
  getCompatibilityBoxes,
  getCompatibilityTypes,
  getDeviceCategories,
} from '../../api/masterData';
import {
  buildCompatIndex,
  findByCode,
  findInterchangeable,
  modelsWithCrossFit,
  normalizeCode,
  searchModels,
} from '../../utils/modelCompatibility';

/**
 * Model Compatibility — "will this part fit?".
 *
 * The question a counter asks a dozen times a day: a customer's device is in
 * pieces, the only display in the drawer was bought for a different model, and
 * someone has to decide whether it fits before the job is promised. The answer
 * lives in the manufacturer model number, so this screen is built around it and
 * works in both directions:
 *
 *   DEVICE -> PARTS   pick a model, see every other model it shares a part
 *                     number with (and its own numbers, to read off the label).
 *   PART -> DEVICES   type the code stamped on the part; every model carrying
 *                     that number is listed.
 *
 * See `utils/modelCompatibility.js` for why an exact model-number match is
 * treated as authoritative and a same-series match explicitly is not. That
 * distinction is the whole point of the screen — a confident "these are the
 * same hardware" is useful, a vague "these look related" is how a shop orders
 * the wrong display, so the two are never mixed into one list.
 */

// GGFIX palette — explicit values; the shared theme tokens/classes still
// resolve to the old teal.
const C = {
  green: '#09AD2A',       // fills, icons, selected
  greenDeep: '#078F23',   // green TEXT on white / mint
  mint: '#EAF8EC',
  mintLine: '#CDEFD4',
  ink: '#1E1E1E',
  muted: '#6B6B6B',
  subtle: '#8A8A8A',
  line: '#E6E6E6',
  hair: '#F3F3F3',
  soft: '#F3F3F3',
  page: '#F8F8F8',
  white: '#FFFFFF',
  amberBg: '#FFF8E1',
  amberLine: '#F6DE8C',
  amberText: '#8A6A00',
};

const CARD_SHADOW = {
  shadowColor: C.ink,
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

// White card on the grey page.
const CARD = { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.hair, ...CARD_SHADOW };

// Same plain page surface the rest of the owner stack uses (not rnr's
// ScreenBackground, whose pink→lavender gradient belongs to the booking flow).
function Screen({ children }) {
  return <View className="flex-1" style={{ backgroundColor: C.page }}>{children}</View>;
}

// Codes are short and alphanumeric-with-dashes. Used only to decide whether the
// query READS like a part number, so the header can answer the part->devices
// question directly instead of making the shop open a model to see it.
const looksLikeCode = (q) => /^[A-Za-z0-9][A-Za-z0-9\-_.]{2,}$/.test(String(q).trim()) && /\d/.test(q);

/**
 * The one part type that is NOT a list of boxes.
 *
 * "Mobile Model Number" is this screen's original job — the manufacturer
 * part-number index built from the model catalogue — so its tab renders that
 * rather than querying model_compatibility, which holds no rows for it. Matching
 * on the slug keeps the tab's LABEL admin-controlled (rename it and the tab
 * renames) while the behaviour stays built in.
 */
const BUILT_IN_INDEX_SLUG = 'mobile-model-number';

/**
 * What a model chip reads as.
 *
 * The brand column used to carry the brand; with it gone the chip has to say it
 * — but most model names already start with their brand ("Vivo Y20"), so
 * prefixing unconditionally would produce "Vivo Vivo Y20". Only the names that
 * don't already carry it get the brand added.
 */
function modelLabel(m) {
  const name = String(m?.modelName || '').trim();
  const brand = String(m?.brandName || '').trim();
  if (!brand) return name;
  return name.toLowerCase().startsWith(brand.toLowerCase()) ? name : `${brand} ${name}`;
}

/**
 * Selected-chip colours: unpicked chips are neutral grey, so the GGFIX green
 * reads clearly as "this is the one you picked".
 */
const PICK_BG = C.mint;
const PICK_BORDER = C.green;
const PICK_TEXT = C.greenDeep;

/** Distinct brands on a box — still worth counting even though the column is gone. */
function brandCount(models) {
  return new Set((models || []).map((m) => m.brandId || m.brandName).filter(Boolean)).size;
}

/**
 * Group a box's models under their brand: brand and its count on the left, its
 * models on the right.
 *
 * Brands sort alphabetically and so do the models inside each one, so a box
 * reads the same way every time it is opened.
 */
function groupModelsByBrand(models) {
  const groups = [];
  for (const m of models || []) {
    const key = m.brandId || m.brandName || '—';
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, brandName: m.brandName || 'Unknown brand', models: [] };
      groups.push(g);
    }
    g.models.push(m);
  }
  groups.sort((a, b) => String(a.brandName).localeCompare(String(b.brandName)));
  return groups.map((g) => ({
    ...g,
    models: [...g.models].sort((a, b) => modelLabel(a).localeCompare(modelLabel(b))),
  }));
}

/**
 * Boxes match on their number, their name, and every brand and model they list,
 * so the counter can find the shelf by typing the customer's device rather than
 * having to know the box already.
 */
function boxMatches(box, needle) {
  if (!needle) return true;
  const hay = [
    box.boxNo,
    box.boxName,
    ...(box.models || []).flatMap((m) => [m.brandName, m.modelName]),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(needle.toLowerCase());
}

export default function OwnerModelCompatibilityScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');

  // Part types are the top tabs. Fetched, so the shop adds one in the admin and
  // it appears here without a release.
  const [types, setTypes] = useState([]);
  const [activeSlug, setActiveSlug] = useState(BUILT_IN_INDEX_SLUG);
  const [boxes, setBoxes] = useState([]);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const [boxesError, setBoxesError] = useState('');
  // The picked model. Kept as screen state rather than a second route so the
  // catalogue (and its index) is loaded once for the whole session on this
  // screen instead of per drill-down.
  const [selected, setSelected] = useState(null);

  const load = useCallback(async ({ force = false } = {}) => {
    setError('');
    try {
      const [models, brandRows, catRows] = await Promise.all([
        getAllModels({ force }),
        getBrands().catch(() => []),
        getDeviceCategories().catch(() => []),
      ]);
      setRows(models);
      setBrands(brandRows);
      setCategories(catRows.filter((c) => c?.isActive !== false));
    } catch (e) {
      setError(e?.body?.message || e?.message || 'Could not load the model catalogue.');
      // `rows` is deliberately left alone. A failed refresh is a reason to warn
      // (the banner in the list header), not a reason to throw away a working
      // catalogue and strand the shop on an error page mid-lookup. The full
      // error screen below only appears when there is nothing to fall back to.
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  useEffect(() => {
    getCompatibilityTypes().then(setTypes).catch(() => {});
  }, []);

  // Tabs come from the admin's types. If the model-number type is missing —
  // an older backend, or someone deleted the row — a built-in tab stands in, so
  // this screen never loses the lookup it exists for.
  const tabs = useMemo(() => {
    const rows = types || [];
    return rows.some((t) => t.slug === BUILT_IN_INDEX_SLUG)
      ? rows
      : [{ id: '__builtin', name: 'Mobile Model Number', slug: BUILT_IN_INDEX_SLUG }, ...rows];
  }, [types]);

  const isIndexMode = activeSlug === BUILT_IN_INDEX_SLUG;
  const activeTab = tabs.find((t) => t.slug === activeSlug) || null;

  const loadBoxes = useCallback(async (slug) => {
    setBoxesLoading(true);
    setBoxesError('');
    try {
      setBoxes(await getCompatibilityBoxes(slug));
    } catch (e) {
      setBoxes([]);
      setBoxesError(e?.body?.message || e?.message || 'Could not load boxes for this type.');
    } finally {
      setBoxesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isIndexMode) return;
    loadBoxes(activeSlug);
  }, [activeSlug, isIndexMode, loadBoxes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isIndexMode) await load({ force: true });
    else await loadBoxes(activeSlug);
    setRefreshing(false);
  }, [load, loadBoxes, activeSlug, isIndexMode]);

  // Android hardware back closes the detail first, then leaves the screen —
  // otherwise a drill-down is a dead end that exits to the dashboard.
  useEffect(() => {
    if (!selected) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      return true;
    });
    return () => sub.remove();
  }, [selected]);

  const index = useMemo(
    () => (rows ? buildCompatIndex(rows, { brands, categories }) : null),
    [rows, brands, categories],
  );

  const trimmed = query.trim();

  /**
   * Search deliberately spans EVERY category, even though the default list below
   * is Mobile-only. A typed model name is an explicit request for that device,
   * and hiding a match the shop named — a MacBook, a pair of buds — would read
   * as a broken catalogue rather than as a filter.
   */
  const results = useMemo(
    () => (index && trimmed ? searchModels(index, trimmed) : []),
    [index, trimmed],
  );

  // Matched by CODE first — the stable key — then by label, since older rows may
  // only carry the name.
  const mobileCategory = useMemo(() => {
    const rows = categories || [];
    return rows.find((c) => String(c.code || '').toUpperCase() === 'MOBILE')
      || rows.find((c) => String(c.name || '').trim().toLowerCase() === 'mobile')
      || null;
  }, [categories]);

  /**
   * Before anything is typed: the Mobile devices that actually HAVE a cross-fit.
   * These are exactly the ones where the answer isn't guessable from the name.
   *
   * Falls back to every category when the catalogue has no Mobile row, so a
   * renamed or missing category leaves a useful list rather than a blank screen.
   */
  const suggestions = useMemo(
    () => (index && !trimmed
      ? modelsWithCrossFit(index, mobileCategory ? { categoryId: mobileCategory.id } : {})
      : []),
    [index, trimmed, mobileCategory],
  );

  // Part -> devices, answered inline above the results when the query is an
  // exact code the catalogue knows.
  const codeHits = useMemo(() => {
    if (!index || !trimmed || !looksLikeCode(trimmed)) return null;
    const hits = findByCode(index, trimmed);
    return hits.length ? { code: normalizeCode(trimmed), hits } : null;
  }, [index, trimmed]);

  const openModel = useCallback((model) => setSelected(model), []);

  if (selected) {
    return (
      <CompatibilityDetail
        index={index}
        model={selected}
        onBack={() => setSelected(null)}
        onOpenModel={openModel}
        onLookupCode={(code) => { setSelected(null); setQuery(code); }}
      />
    );
  }

  const list = trimmed ? results : suggestions;
  const visibleBoxes = boxes.filter((b) => boxMatches(b, trimmed));

  return (
    <Screen>
      <ScreenHeader
        title="Model Compatibility"
        subtitle={
          isIndexMode
            ? (index ? `${index.entries.length} models · ${index.byCode.size} part numbers` : undefined)
            : `${visibleBoxes.length} box${visibleBoxes.length === 1 ? '' : 'es'}`
        }
        onBack={() => navigation.goBack()}
      />

      {/* Part types. Switching tab clears the query and the category filter —
          they were typed against a different list and would silently hide rows
          in the new one. */}
      {tabs.length > 1 ? (
        <View style={{ paddingTop: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 2 }}
          >
            {tabs.map((t) => (
              <FilterPill
                key={t.slug}
                label={t.name}
                active={activeSlug === t.slug}
                onPress={() => { setActiveSlug(t.slug); setQuery(''); }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder={
            isIndexMode
              ? 'Model name or part number (e.g. SM-A127F)'
              : 'Box number, brand or model'
          }
          // Part numbers are case- and punctuation-exact; autocorrect would
          // happily rewrite "SM-A127F" into a word.
          inputProps={{ autoCapitalize: 'none', autoCorrect: false, autoComplete: 'off' }}
        />
      </View>

      {!isIndexMode ? (
        <BoxList
          boxes={visibleBoxes}
          loading={boxesLoading}
          error={boxesError}
          query={trimmed}
          typeName={activeTab?.name || 'this type'}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onRetry={() => loadBoxes(activeSlug)}
        />
      ) : loading ? (
        <Loader label="Loading model catalogue…" />
      ) : error && !index ? (
        <ErrorState
          title="Catalogue unavailable"
          description={error}
          onRetry={async () => { setLoading(true); await load({ force: true }); setLoading(false); }}
        />
      ) : (
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} />
        }
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 28, flexGrow: 1 }}
        ListHeaderComponent={
          <View>
            {/* A refresh that fails still leaves the previously-loaded catalogue
                on screen, so say so rather than letting the shop believe it is
                looking at fresh data. */}
            {error ? (
              <View className="flex-row" style={{ borderRadius: 12, backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberLine, padding: 10, marginBottom: 10 }}>
                <Info size={14} color={C.amberText} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 16, color: C.ink }}>
                  Couldn’t refresh the catalogue — showing the last copy. {error}
                </Text>
              </View>
            ) : null}
            {codeHits ? <CodeBanner code={codeHits.code} hits={codeHits.hits} onOpenModel={openModel} /> : null}
            <SectionLabel
              icon={trimmed ? Search : Puzzle}
              text={
                trimmed
                  ? `${results.length} match${results.length === 1 ? '' : 'es'}`
                  : `${mobileCategory ? 'Mobile devices' : 'Devices'} with a known cross-fit · ${suggestions.length}`
              }
            />
            {!trimmed ? (
              <Text style={{ fontSize: 11, lineHeight: 16, color: C.muted, marginBottom: 10 }}>
                These share a manufacturer part number with at least one other device.
                Search above to look up any model — including laptops and other categories —
                or type the code printed on a part.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ModelRow model={item} onPress={() => openModel(item)} />
        )}
        ListEmptyComponent={
          <View className="items-center px-8 py-16">
            <View className="items-center justify-center" style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: C.mint, marginBottom: 12 }}>
              <Search size={28} color={C.green} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink, textAlign: 'center' }}>
              {trimmed ? 'No model matched' : 'Nothing to show'}
            </Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: C.muted, textAlign: 'center', marginTop: 6 }}>
              {trimmed
                ? `Nothing in the catalogue is named or numbered “${trimmed}”. Check the spelling.`
                : 'No mobile device in the catalogue shares a part number with another yet. Search above to look up any model.'}
            </Text>
          </View>
        }
      />
      )}
    </Screen>
  );
}

/* ── Part boxes ──────────────────────────────────────────────────────────── */

/**
 * The shelf view for a part type: one card per box, showing the box it lives in
 * and every model that part fits.
 *
 * The counter is working the opposite way round to the part-number index — they
 * know the customer's device and want the box number — so the model list is the
 * body of the card and the box label is its heading.
 */
function BoxList({ boxes, loading, error, query, typeName, refreshing, onRefresh, onRetry }) {
  if (loading && !boxes.length) return <Loader label={`Loading ${typeName}…`} />;
  if (error && !boxes.length) {
    return <ErrorState title="Couldn’t load boxes" description={error} onRetry={onRetry} />;
  }

  return (
    <FlatList
      data={boxes}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} />
      }
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 28, flexGrow: 1 }}
      ListHeaderComponent={
        <View>
          {error ? (
            <View className="flex-row" style={{ borderRadius: 12, backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberLine, padding: 10, marginBottom: 10 }}>
              <Info size={14} color={C.amberText} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 16, color: C.ink }}>
                Couldn’t refresh — showing the last copy. {error}
              </Text>
            </View>
          ) : null}
          <SectionLabel
            icon={Boxes}
            text={query ? `${boxes.length} match${boxes.length === 1 ? '' : 'es'}` : `${typeName} · ${boxes.length}`}
          />
          {!query ? (
            <Text style={{ fontSize: 11, lineHeight: 16, color: C.muted, marginBottom: 10 }}>
              Each card is one box on the shelf and the models its part fits.
              Search a model to find which box to open.
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <BoxCard box={item} query={query} />}
      ListEmptyComponent={
        <View className="items-center px-8 py-16">
          <View className="items-center justify-center" style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: C.mint, marginBottom: 12 }}>
            <Boxes size={28} color={C.green} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink, textAlign: 'center' }}>
            {query ? 'No box matched' : 'No boxes yet'}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: C.muted, textAlign: 'center', marginTop: 6 }}>
            {query
              ? `Nothing under ${typeName} is numbered “${query}” or lists a matching model.`
              : `No ${typeName} boxes have been set up yet. Add them in the admin panel under Master Data → Model Compatibility.`}
          </Text>
        </View>
      }
    />
  );
}

/**
 * One box on the shelf.
 *
 * The models are a single flat run of chips rather than brand-grouped rows: the
 * brand column forced every chip into a narrow right-hand gutter, which is what
 * made the card look ragged, and the model names carry their brand anyway.
 *
 * A chip can be tapped to mark it — the counter is usually checking one specific
 * device against the box, and highlighting it keeps the eye on it while they
 * read the number off the shelf. It is a visual aid only; nothing is saved.
 */
function BoxCard({ box, query }) {
  const [pickedId, setPickedId] = useState(null);

  const models = box.models || [];
  const total = models.length;
  const brands = brandCount(models);

  /**
   * A search HIGHLIGHTS the models it matches instead of hiding the rest.
   *
   * The box is the answer — "this shelf fits your device" — and the rest of its
   * contents are what makes that answer checkable: the counter can see the whole
   * family the glass covers, with the searched device picked out of it. Filtering
   * the chips down to the match would throw that away and leave a card that just
   * repeats what was typed.
   */
  const needle = String(query || '').trim().toLowerCase();
  const matches = (m) => !!needle && modelLabel(m).toLowerCase().includes(needle);
  const matchCount = needle ? models.filter(matches).length : 0;

  // The brand LABEL is hidden, not the grouping: each brand keeps its own run of
  // chips with a rule beneath it, so the Pocos, the Realmes and the Vivos read as
  // three blocks rather than one undifferentiated wrap.
  const groups = groupModelsByBrand(models);

  return (
    <View style={[CARD, { padding: 11, marginBottom: 8 }]}>
      {/* Box on the left, its totals on the right. */}
      <View className="flex-row items-center">
        {box.referenceImageUrl ? (
          <View className="items-center justify-center overflow-hidden" style={{ height: 44, width: 44, borderRadius: 12, marginRight: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.hair }}>
            <DeviceImage url={box.referenceImageUrl} style={{ width: 38, height: 38 }} />
          </View>
        ) : null}
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.ink }} numberOfLines={2}>
          {box.boxName}
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>{`  -  ${box.boxNo}`}</Text>
        </Text>
        <View className="ml-2 items-end">
          {matchCount ? (
            // Says how much of the box the search actually hit, so a highlight
            // that scrolled out of view is still accounted for.
            <Text style={{ fontSize: 11, fontWeight: '800', color: PICK_TEXT }}>
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: C.muted, textAlign: 'right' }} numberOfLines={2}>
            {total} model{total === 1 ? '' : 's'}
            {brands ? `\n${brands} brand${brands === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
      </View>

      {total ? (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.hair }}>
          {groups.map((g, i) => (
            <View
              key={g.key}
              // A rule under every brand except the last — a trailing line above
              // the note (or the card edge) would read as a broken row.
              className="flex-row flex-wrap"
              style={{
                paddingTop: i === 0 ? 0 : 8,
                paddingBottom: i < groups.length - 1 ? 4 : 0,
                borderBottomWidth: i < groups.length - 1 ? 1 : 0,
                borderBottomColor: C.hair,
              }}
            >
              {g.models.map((m) => {
                // Blue when the search found it, or when it was tapped — the two
                // mean the same thing to the eye: "this is the one".
                const picked = matches(m) || pickedId === m.modelId;
                return (
                  <Pressable
                    key={m.modelId}
                    onPress={() => setPickedId(picked ? null : m.modelId)}
                    className="active:opacity-70"
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      marginRight: 6,
                      marginBottom: 6,
                      borderWidth: 1,
                      backgroundColor: picked ? PICK_BG : C.soft,
                      borderColor: picked ? PICK_BORDER : 'transparent',
                    }}
                  >
                    {/* With the brand column gone the chip has to carry the brand —
                        modelLabel adds it only when the name doesn't already. */}
                    <Text
                      style={{
                        fontSize: 11,
                        color: picked ? PICK_TEXT : C.ink,
                        fontWeight: picked ? '800' : '600',
                      }}
                    >
                      {modelLabel(m)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          No models mapped to this box yet.
        </Text>
      )}

      {box.notes ? (
        <View className="flex-row" style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.hair }}>
          <Info size={12} color={C.muted} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, marginLeft: 6, fontSize: 11, lineHeight: 16, color: C.muted }}>{box.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── Detail ──────────────────────────────────────────────────────────────── */

function CompatibilityDetail({ index, model, onBack, onOpenModel, onLookupCode }) {
  const entry = index?.byId.get(model.id) || model;

  const interchangeable = useMemo(() => findInterchangeable(index, entry), [index, entry]);

  const codes = entry.codes || [];
  const specs = Array.isArray(entry.ramStorage) ? entry.ramStorage : [];
  const colors = Array.isArray(entry.colors) ? entry.colors : [];

  return (
    <Screen>
      <ScreenHeader title={entry.name} subtitle={entry.brandName || undefined} onBack={onBack} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View className="flex-row items-center" style={[CARD, { borderRadius: 14, padding: 10, borderColor: C.mintLine, backgroundColor: C.mint }]}>
          <Thumb model={entry} size={52} />
          <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }} numberOfLines={2}>{entry.name}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }} numberOfLines={1}>
              {[entry.brandName, entry.categoryName].filter(Boolean).join(' · ') || 'Device'}
            </Text>
          </View>
        </View>

        {/* The device's own part numbers — the thing to read off the label and
            match against the part in hand. Tapping one runs the reverse lookup. */}
        <SectionLabel icon={Barcode} text="Part numbers on this device" top={14} />
        {codes.length ? (
          <View className="flex-row flex-wrap" style={[CARD, { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }]}>
            {codes.map((code) => (
              <Pressable
                key={code}
                onPress={() => onLookupCode(code)}
                className="flex-row items-center active:opacity-70"
                style={{ borderRadius: 999, borderWidth: 1, borderColor: C.mintLine, backgroundColor: C.mint, paddingHorizontal: 9, paddingVertical: 4, marginRight: 6, marginBottom: 6 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.3, color: C.greenDeep }}>
                  {code}
                </Text>
                <Search size={10} color={C.greenDeep} style={{ marginLeft: 4 }} />
              </Pressable>
            ))}
          </View>
        ) : (
          <NoticeCard
            tone="warn"
            text="No part number recorded for this model, so compatibility can't be confirmed from the catalogue. Add it in the admin Models screen."
          />
        )}

        {/* Exact matches — the authoritative answer. */}
        <SectionLabel
          icon={Puzzle}
          text={`Interchangeable · ${interchangeable.length}`}
          top={14}
        />
        {interchangeable.length ? (
          <>
            <Text style={{ fontSize: 11, lineHeight: 16, color: C.muted, marginBottom: 8 }}>
              Same manufacturer part number — parts for these are the same hardware.
            </Text>
            {interchangeable.map(({ model: m, sharedCodes }) => (
              <ModelRow
                key={m.id}
                model={m}
                badge={sharedCodes.join(' · ')}
                onPress={() => onOpenModel(m)}
              />
            ))}
          </>
        ) : (
          <NoticeCard
            tone="info"
            text={
              codes.length
                ? 'No other model in the catalogue shares a part number with this device. Treat its parts as model-specific.'
                : 'Nothing to compare against until this model has a part number.'
            }
          />
        )}

        {/* "Same series" used to sit here — same family, DIFFERENT part number,
            so related but never confirmed compatible. It was removed on request:
            a list the shop still has to verify against the part sits too close to
            the confirmed one above and invites ordering off the wrong list. */}

        {/* Handy when ordering a housing / display: the variants this model shipped in. */}
        {specs.length || colors.length ? (
          <>
            <SectionLabel icon={Boxes} text="Variants on record" top={14} />
            <View style={[CARD, { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 5 }]}>
              {specs.length ? (
                <View className="mb-1">
                  <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: C.subtle, marginBottom: 6 }}>
                    RAM / Storage
                  </Text>
                  <View className="flex-row flex-wrap">
                    {specs.map((s) => (
                      <View key={s} style={{ borderRadius: 999, backgroundColor: C.soft, paddingHorizontal: 9, paddingVertical: 4, marginRight: 5, marginBottom: 5 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.ink }}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {colors.length ? (
                <View style={specs.length ? { marginTop: 6 } : null}>
                  <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: C.subtle, marginBottom: 6 }}>
                    Colours
                  </Text>
                  <View className="flex-row flex-wrap">
                    {colors.map((c) => (
                      <View key={c} style={{ borderRadius: 999, backgroundColor: C.soft, paddingHorizontal: 9, paddingVertical: 4, marginRight: 5, marginBottom: 5 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.ink }}>{c}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

// Answers "I have this part — what does it fit?" without a drill-down, because
// that is the direction a shop is usually working in when it types a code.
function CodeBanner({ code, hits, onOpenModel }) {
  return (
    <View style={{ borderRadius: 14, backgroundColor: C.mint, borderWidth: 1, borderColor: C.mintLine, padding: 11, marginBottom: 10 }}>
      <View className="flex-row items-center" style={{ marginBottom: 4 }}>
        <Barcode size={14} color={C.greenDeep} />
        <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '800', letterSpacing: 0.3, color: C.greenDeep }}>
          {code}
        </Text>
      </View>
      <Text style={{ fontSize: 12, lineHeight: 17, color: C.ink }}>
        {hits.length === 1
          ? 'This part number belongs to one model:'
          : `This part number is shared by ${hits.length} models — a part for any one of them fits the rest:`}
      </Text>
      <View style={{ marginTop: 6 }}>
        {hits.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onOpenModel(m)}
            className="flex-row items-center active:opacity-60"
            style={{ paddingVertical: 5 }}
          >
            <ChevronRight size={13} color={C.greenDeep} />
            <Text style={{ marginLeft: 4, flex: 1, fontSize: 13, fontWeight: '700', color: C.greenDeep }} numberOfLines={1}>
              {m.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// `muted` went with the Same-series list — it was the only caller that dimmed a
// row, so the remaining rows are all confirmed matches and styled one way.
function ModelRow({ model, badge, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center active:opacity-70"
      style={[CARD, { paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 }]}
    >
      <Thumb model={model} size={44} />
      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }} numberOfLines={1}>{model.name}</Text>
        <View className="flex-row items-center" style={{ marginTop: 3 }}>
          {model.brandName ? (
            <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{model.brandName}</Text>
          ) : null}
          {model.codes?.[0] ? (
            <View style={{ marginLeft: model.brandName ? 6 : 0, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: C.soft }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.ink, letterSpacing: 0.2 }} numberOfLines={1}>{model.codes[0]}</Text>
            </View>
          ) : null}
          {!model.brandName && !model.codes?.[0] ? <Text style={{ fontSize: 11, color: C.muted }}>—</Text> : null}
        </View>
      </View>
      {badge ? (
        <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6, backgroundColor: C.mint, maxWidth: '40%' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.3, color: C.greenDeep }} numberOfLines={1}>
            {badge}
          </Text>
        </View>
      ) : null}
      <View className="items-center justify-center" style={{ height: 24, width: 24, borderRadius: 12, marginLeft: 6, backgroundColor: C.mint }}>
        <ChevronRight size={14} color={C.green} />
      </View>
    </Pressable>
  );
}

function Thumb({ model, size }) {
  const inner = Math.round(size * 0.86);
  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.hair }}
    >
      {model?.imageUrl ? (
        <DeviceImage url={model.imageUrl} style={{ width: inner, height: inner }} />
      ) : (
        <Smartphone size={Math.round(size * 0.42)} color={C.subtle} />
      )}
    </View>
  );
}

// `top` replaces the old `className="mt-6"` spacing hook.
function SectionLabel({ icon: Icon, text, top = 0 }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: top, marginBottom: 6 }}>
      <View className="items-center justify-center" style={{ height: 24, width: 24, borderRadius: 8, backgroundColor: C.mint, marginRight: 8 }}>
        <Icon size={13} color={C.green} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.ink }}>{text}</Text>
    </View>
  );
}

function NoticeCard({ text, tone = 'info' }) {
  const warn = tone === 'warn';
  return (
    <View
      className="flex-row"
      style={warn
        ? { borderRadius: 12, padding: 10, backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberLine }
        : [CARD, { padding: 10 }]}
    >
      <Info size={14} color={warn ? C.amberText : C.muted} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 17, color: C.muted }}>{text}</Text>
    </View>
  );
}

function FilterPill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-70"
      style={{
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 13,
        paddingVertical: 7,
        marginRight: 6,
        backgroundColor: active ? C.green : C.white,
        borderColor: active ? C.green : C.line,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: active ? '800' : '600', color: active ? C.white : C.muted }}>{label}</Text>
    </Pressable>
  );
}
