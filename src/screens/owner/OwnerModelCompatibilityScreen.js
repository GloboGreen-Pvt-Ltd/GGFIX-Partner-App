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
import { tokens } from '../../theme/colors';
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

const CARD_SHADOW = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

// Same plain page surface the rest of the owner stack uses (not rnr's
// ScreenBackground, whose pink→lavender gradient belongs to the booking flow).
function Screen({ children }) {
  return <View className="flex-1 bg-background">{children}</View>;
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
 * Selected-chip colours. Blue on purpose and hard-coded on purpose: the app's
 * palette is green primary / orange accent with no blue family, so a selection
 * drawn from the palette would read as just another branded pill rather than as
 * "this is the one you picked".
 */
const PICK_BG = '#F0F8EF';      // blue-50
const PICK_BORDER = '#16BB05';  // blue-600
const PICK_TEXT = '#16BB05';    // blue-700

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
        onLookupCode={(code) => { setSelected(null); setCategoryId(null); setQuery(code); }}
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
        <View className="pt-1.5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6 }}
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

      <View className="px-4 pt-2 pb-1">
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} colors={[tokens.primary]} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
        ListHeaderComponent={
          <View>
            {/* A refresh that fails still leaves the previously-loaded catalogue
                on screen, so say so rather than letting the shop believe it is
                looking at fresh data. */}
            {error ? (
              <View className="rounded-2xl bg-attention-50 border border-attention-200 p-3.5 mb-4 flex-row">
                <Info size={15} color={tokens.attentionDark} style={{ marginTop: 1 }} />
                <Text className="flex-1 ml-2.5 text-[12px] text-text leading-4">
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
              <Text className="text-[11.5px] text-text-muted mb-3 leading-4">
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
            <View className="h-20 w-20 rounded-full bg-primary-soft items-center justify-center mb-4">
              <Search size={34} color={tokens.primary} />
            </View>
            <Text className="text-[16px] font-extrabold text-text text-center">
              {trimmed ? 'No model matched' : 'Nothing to show'}
            </Text>
            <Text className="text-[12.5px] text-text-muted text-center mt-1.5 leading-5">
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} colors={[tokens.primary]} />
      }
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
      ListHeaderComponent={
        <View>
          {error ? (
            <View className="rounded-2xl bg-attention-50 border border-attention-200 p-3.5 mb-4 flex-row">
              <Info size={15} color={tokens.attentionDark} style={{ marginTop: 1 }} />
              <Text className="flex-1 ml-2.5 text-[12px] text-text leading-4">
                Couldn’t refresh — showing the last copy. {error}
              </Text>
            </View>
          ) : null}
          <SectionLabel
            icon={Boxes}
            text={query ? `${boxes.length} match${boxes.length === 1 ? '' : 'es'}` : `${typeName} · ${boxes.length}`}
          />
          {!query ? (
            <Text className="text-[11.5px] text-text-muted mb-3 leading-4">
              Each card is one box on the shelf and the models its part fits.
              Search a model to find which box to open.
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <BoxCard box={item} query={query} />}
      ListEmptyComponent={
        <View className="items-center px-8 py-16">
          <View className="h-20 w-20 rounded-full bg-primary-soft items-center justify-center mb-4">
            <Boxes size={34} color={tokens.primary} />
          </View>
          <Text className="text-[16px] font-extrabold text-text text-center">
            {query ? 'No box matched' : 'No boxes yet'}
          </Text>
          <Text className="text-[12.5px] text-text-muted text-center mt-1.5 leading-5">
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
    <View className="bg-card rounded-2xl p-4 mb-2.5" style={CARD_SHADOW}>
      {/* Box on the left, its totals on the right. */}
      <View className="flex-row items-center">
        {box.referenceImageUrl ? (
          <View className="h-11 w-11 rounded-xl bg-surface-muted overflow-hidden mr-3">
            <DeviceImage url={box.referenceImageUrl} style={{ width: 44, height: 44 }} />
          </View>
        ) : null}
        <Text className="flex-1 text-[15px] font-extrabold text-text" numberOfLines={2}>
          {box.boxName}
          <Text className="text-[14px] font-bold text-text-muted">{`  -  ${box.boxNo}`}</Text>
        </Text>
        <View className="ml-2 items-end">
          {matchCount ? (
            // Says how much of the box the search actually hit, so a highlight
            // that scrolled out of view is still accounted for.
            <Text className="text-[11px] font-extrabold" style={{ color: PICK_TEXT }}>
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </Text>
          ) : null}
          <Text className="text-[11px] text-text-muted text-right" numberOfLines={2}>
            {total} model{total === 1 ? '' : 's'}
            {brands ? `\n${brands} brand${brands === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
      </View>

      {total ? (
        <View className="mt-3 pt-3 border-t border-border">
          {groups.map((g, i) => (
            <View
              key={g.key}
              // A rule under every brand except the last — a trailing line above
              // the note (or the card edge) would read as a broken row.
              className={`flex-row flex-wrap ${i === 0 ? '' : 'pt-2.5'} ${
                i < groups.length - 1 ? 'pb-1 border-b border-border' : ''
              }`}
            >
              {g.models.map((m) => {
                // Blue when the search found it, or when it was tapped — the two
                // mean the same thing to the eye: "this is the one".
                const picked = matches(m) || pickedId === m.modelId;
                return (
                  <Pressable
                    key={m.modelId}
                    onPress={() => setPickedId(picked ? null : m.modelId)}
                    className="rounded-full px-2.5 py-1 mr-1.5 mb-1.5 active:opacity-70"
                    // Colours as a plain style object rather than classes: the app
                    // palette has no blue family (primary is the green in the tabs),
                    // so a selection has to come from outside it.
                    style={{
                      borderWidth: 1,
                      backgroundColor: picked ? PICK_BG : tokens.surfaceMuted,
                      borderColor: picked ? PICK_BORDER : 'transparent',
                    }}
                  >
                    {/* With the brand column gone the chip has to carry the brand —
                        modelLabel adds it only when the name doesn't already. */}
                    <Text
                      className="text-[11px]"
                      style={{
                        color: picked ? PICK_TEXT : tokens.text,
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
        <Text className="text-[11.5px] text-text-muted mt-3">
          No models mapped to this box yet.
        </Text>
      )}

      {box.notes ? (
        <View className="flex-row mt-3 pt-2.5 border-t border-border">
          <Info size={13} color={tokens.textMuted} style={{ marginTop: 2 }} />
          <Text className="flex-1 ml-2 text-[11.5px] text-text-muted leading-4">{box.notes}</Text>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View className="bg-card rounded-3xl p-4 flex-row items-center" style={CARD_SHADOW}>
          <Thumb model={entry} size={64} />
          <View className="flex-1 ml-3.5">
            <Text className="text-[16px] font-extrabold text-text" numberOfLines={2}>{entry.name}</Text>
            <Text className="text-[12px] text-text-muted mt-0.5" numberOfLines={1}>
              {[entry.brandName, entry.categoryName].filter(Boolean).join(' · ') || 'Device'}
            </Text>
          </View>
        </View>

        {/* The device's own part numbers — the thing to read off the label and
            match against the part in hand. Tapping one runs the reverse lookup. */}
        <SectionLabel icon={Barcode} text="Part numbers on this device" className="mt-6" />
        {codes.length ? (
          <View className="flex-row flex-wrap">
            {codes.map((code) => (
              <Pressable
                key={code}
                onPress={() => onLookupCode(code)}
                className="flex-row items-center rounded-full border border-primary-200 bg-primary-50 px-3.5 py-2 mr-2 mb-2 active:opacity-70"
              >
                <Text className="text-[12.5px] font-extrabold text-primary-dark" style={{ letterSpacing: 0.3 }}>
                  {code}
                </Text>
                <Search size={12} color={tokens.primaryDark} style={{ marginLeft: 6 }} />
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
          className="mt-6"
        />
        {interchangeable.length ? (
          <>
            <Text className="text-[11.5px] text-text-muted mb-3 leading-4">
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
            <SectionLabel icon={Boxes} text="Variants on record" className="mt-6" />
            <View className="bg-card rounded-2xl p-4" style={CARD_SHADOW}>
              {specs.length ? (
                <View className="mb-1">
                  <Text className="text-[10px] font-extrabold uppercase text-text-subtle mb-2" style={{ letterSpacing: 0.8 }}>
                    RAM / Storage
                  </Text>
                  <View className="flex-row flex-wrap">
                    {specs.map((s) => (
                      <View key={s} className="rounded-full bg-surface-muted px-3 py-1.5 mr-2 mb-2">
                        <Text className="text-[11.5px] font-semibold text-text">{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {colors.length ? (
                <View className={specs.length ? 'mt-2' : ''}>
                  <Text className="text-[10px] font-extrabold uppercase text-text-subtle mb-2" style={{ letterSpacing: 0.8 }}>
                    Colours
                  </Text>
                  <View className="flex-row flex-wrap">
                    {colors.map((c) => (
                      <View key={c} className="rounded-full bg-surface-muted px-3 py-1.5 mr-2 mb-2">
                        <Text className="text-[11.5px] font-semibold text-text">{c}</Text>
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
    <View className="rounded-2xl bg-primary-50 border border-primary-200 p-4 mb-4">
      <View className="flex-row items-center mb-1.5">
        <Barcode size={15} color={tokens.primaryDark} />
        <Text className="ml-2 text-[12.5px] font-extrabold text-primary-dark" style={{ letterSpacing: 0.3 }}>
          {code}
        </Text>
      </View>
      <Text className="text-[12.5px] text-text leading-5">
        {hits.length === 1
          ? 'This part number belongs to one model:'
          : `This part number is shared by ${hits.length} models — a part for any one of them fits the rest:`}
      </Text>
      <View className="mt-2">
        {hits.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onOpenModel(m)}
            className="flex-row items-center py-1.5 active:opacity-60"
          >
            <ChevronRight size={14} color={tokens.primaryDark} />
            <Text className="ml-1 flex-1 text-[13px] font-bold text-primary-dark" numberOfLines={1}>
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
      className="flex-row items-center bg-card rounded-2xl p-3 mb-2.5 active:opacity-70"
      style={CARD_SHADOW}
    >
      <Thumb model={model} size={44} />
      <View className="flex-1 ml-3">
        <Text className="text-[13.5px] font-bold text-text" numberOfLines={1}>{model.name}</Text>
        <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={1}>
          {[model.brandName, model.codes?.[0]].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      {badge ? (
        <View className="rounded-full px-2.5 py-1 ml-2 bg-primary-soft">
          <Text
            className="text-[10px] font-extrabold text-primary-dark"
            style={{ letterSpacing: 0.3 }}
            numberOfLines={1}
          >
            {badge}
          </Text>
        </View>
      ) : null}
      <ChevronRight size={16} color={tokens.textSubtle} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

function Thumb({ model, size }) {
  return (
    <View
      className="items-center justify-center rounded-xl bg-surface-muted overflow-hidden"
      style={{ width: size, height: size }}
    >
      {model?.imageUrl ? (
        <DeviceImage url={model.imageUrl} style={{ width: size, height: size }} />
      ) : (
        <Smartphone size={Math.round(size * 0.45)} color={tokens.textSubtle} />
      )}
    </View>
  );
}

function SectionLabel({ icon: Icon, text, className }) {
  return (
    <View className={`flex-row items-center mb-2 ${className || ''}`}>
      <Icon size={15} color={tokens.text} />
      <Text className="ml-2 text-[13.5px] font-extrabold text-text">{text}</Text>
    </View>
  );
}

function NoticeCard({ text, tone = 'info' }) {
  const warn = tone === 'warn';
  return (
    <View
      className={`flex-row rounded-2xl p-3.5 ${warn ? 'bg-attention-50 border border-attention-200' : 'bg-card'}`}
      style={warn ? undefined : CARD_SHADOW}
    >
      <Info size={15} color={warn ? tokens.attentionDark : tokens.textMuted} style={{ marginTop: 1 }} />
      <Text className="flex-1 ml-2.5 text-[12.5px] text-text-muted leading-5">{text}</Text>
    </View>
  );
}

function FilterPill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-4 py-2 mr-2 active:opacity-70 ${
        active ? 'bg-primary border-primary' : 'bg-card border-border'
      }`}
    >
      <Text className={`text-[12px] font-bold ${active ? 'text-white' : 'text-text-muted'}`}>{label}</Text>
    </Pressable>
  );
}
