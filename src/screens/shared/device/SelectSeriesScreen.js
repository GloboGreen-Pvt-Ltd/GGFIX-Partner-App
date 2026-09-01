import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Layers, Check, Pencil } from 'lucide-react-native';
import { EmptyState, Loader, ScreenHeader, SearchBar, SelectionCrumb } from '../../../components/rnr';
import { getSeriesForCategoryBrand } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';
import { PICKER_PAD, PICKER_GAP, pickerMetrics } from './pickerGrid';

// Canonical series picker used by all flows. Pixel-exact card width, 3-on-phone
// / 4-on-tablet, logo box scales with card.
// Grid from the shared `pickerGrid`, dense ladder. Series come from the API
// (getSeriesForCategoryBrand) — nothing static.
const HORIZONTAL_PAD = PICKER_PAD;
const GRID_GAP = PICKER_GAP;
const SCREEN_BG = '#FFFFFF';
const CARD_BG = '#F8F8F8';
// The green tints are gone: every FILL on this screen is now the neutral
// #F8F8F8. Foregrounds cannot take that value — #F8F8F8 measures 1.00:1 on the
// card and 1.06:1 on the page, i.e. invisible — so the icon, tick and "Current"
// label take #004C40, the accent the rest of the booking flow already uses
// (9.38:1 on the card).
const ACCENT = '#004C40';

export default function SelectSeriesScreen({ navigation, route }) {
  const flow = route?.params?.flow || 'PROFILE';
  const {
    categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName, brandId, brandName,
    editSellOrderId, editHints,
  } = route?.params || {};
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const bookingEditMode = !!route?.params?.editMode;
  const isEditing = !!editSellOrderId || bookingEditMode;
  const currentSeriesId = editHints?.seriesId || null;
  const { width: screenWidth } = useWindowDimensions();
  // Square image box, equal across every card — see pickerGrid.
  const { cardWidth, imageSize: logoBox } = pickerMetrics(screenWidth, { dense: true, cardPadding: 6 });

  // Spread route.params so booking-flow extras (editMode, editTicketId,
  // prefill*, customer, etc.) flow through to every downstream picker.
  const base = {
    ...(route?.params || {}),
    flow, categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
    brandId, brandName, editSellOrderId, editHints,
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Authoritative: only series under THIS (category, brand) pair. No
        // brand-wide fallback — that would leak another category's series
        // (e.g. Laptop+Samsung showing Samsung's Mobile Galaxy series).
        const list = await getSeriesForCategoryBrand(categoryId, brandId);
        if (cancelled) return;
        // No series under this (category, brand) -> skip straight to models.
        if (!list || list.length === 0) { navigation.replace('SelectModel', { ...base }); return; }
        setSeries(list);
      } catch (_) {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [categoryId, brandId]);

  const filtered = useMemo(() => {
    let list = series;
    if (isEditing && currentSeriesId) {
      const current = series.find((s) => s.id === currentSeriesId);
      const rest = series.filter((s) => s.id !== currentSeriesId);
      list = current ? [current, ...rest] : series;
    }
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((s) => (s.name || '').toLowerCase().includes(needle));
  }, [series, q, isEditing, currentSeriesId]);

  const onPick = (s) => navigation.navigate('SelectModel', {
    ...base, seriesId: s.id, seriesName: s.name,
  });

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      <ScreenHeader
        title="Select Series"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        sticky={false}
      />
      <View className="px-4 pt-2 pb-2 border-b border-border" style={{ backgroundColor: CARD_BG }}>
        <SelectionCrumb items={[{ label: 'Brand', value: brandName }]} className="mb-2" />
        {isEditing && editHints?.modelName ? (
          <View className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-1.5 mb-2 flex-row items-center">
            <Pencil size={13} color="#F59E0B" />
            <View className="flex-1 ml-2">
              <Text className="text-[10px] font-extrabold text-warning tracking-wider">
                {flow === 'BOOKING' ? 'EDITING BOOKING' : 'EDITING ORDER'}
              </Text>
              <Text className="text-[12px] text-text font-semibold" numberOfLines={1}>
                Currently: {editHints.brandName ? `${editHints.brandName} · ` : ''}{editHints.modelName}
              </Text>
            </View>
          </View>
        ) : null}
        <SearchBar value={q} onChangeText={setQ} placeholder="Search series" onClear={() => setQ('')} />
      </View>

      {loading ? (
        <Loader label="Loading series..." />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, paddingTop: 10, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState title="No series found" description="Try a different keyword." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              {filtered.map((s) => {
                const thumb = resolveDeviceImageSource({ url: s.imageUrl, base64: s.imageBase64 });
                const isCurrent = isEditing && s.id === currentSeriesId;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => onPick(s)}
                    className="rounded-xl active:opacity-80"
                    style={{
                      width: cardWidth,
                      backgroundColor: CARD_BG,
                      ...(isCurrent ? { borderWidth: 1, borderColor: ACCENT } : null),
                      padding: 6,
                      alignItems: 'center',
                    }}
                  >
                    <View
                      className="rounded-lg items-center justify-center overflow-hidden"
                      // no tint: the box only holds the image
                      
                      style={{ height: logoBox, width: logoBox, marginBottom: 6 }}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={{ width: logoBox, height: logoBox }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Layers size={Math.round(logoBox * 0.4)} color={ACCENT} />
                      )}
                    </View>
                    <Text
                      className="text-[11px] font-medium text-text"
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {s.name}
                    </Text>
                    {isCurrent ? (
                      <View className="flex-row items-center rounded-full px-1.5 mt-1" style={{ backgroundColor: CARD_BG }}>
                        <Check size={10} color={ACCENT} />
                        <Text className="text-[9.5px] font-extrabold ml-1" style={{ color: ACCENT }}>Current</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
