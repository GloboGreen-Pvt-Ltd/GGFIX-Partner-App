import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Layers, Check, Pencil } from 'lucide-react-native';
import { EmptyState, Loader, ScreenHeader, SearchBar, SelectionCrumb } from '../../../components/rnr';
import { getSeriesForCategoryBrand } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';

// Canonical series picker used by all flows. Pixel-exact card width, 3-on-phone
// / 4-on-tablet, logo box scales with card.
const HORIZONTAL_PAD = 16;
const GRID_GAP = 12;
function gridMetrics(screenWidth) {
  const numColumns = screenWidth >= 600 ? 4 : 3;
  // Math.floor — see SelectBrandScreen for explanation; without it RN can
  // round subpixel widths up and wrap the 3rd card to a new row.
  const cardWidth = Math.floor((screenWidth - HORIZONTAL_PAD * 2 - GRID_GAP * (numColumns - 1)) / numColumns);
  return { numColumns, cardWidth };
}

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
  const { cardWidth } = gridMetrics(screenWidth);
  const logoBox = Math.round(cardWidth * 0.55);

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
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Select Series"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        sticky={false}
      />
      <View className="px-4 pt-3 pb-3 bg-card border-b border-border">
        <SelectionCrumb items={[{ label: 'Brand', value: brandName }]} className="mb-3" />
        {isEditing && editHints?.modelName ? (
          <View className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 mb-3 flex-row items-center">
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
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, paddingTop: 16, paddingBottom: 24 }}
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
                    className={`bg-card border rounded-2xl active:opacity-80 ${isCurrent ? 'border-primary' : 'border-border'}`}
                    style={{
                      width: cardWidth,
                      padding: 10,
                      alignItems: 'center',
                      shadowColor: '#172117',
                      shadowOpacity: 0.04,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 1,
                    }}
                  >
                    <View
                      className="rounded-xl items-center justify-center overflow-hidden bg-primary/10"
                      style={{ height: logoBox, width: logoBox, marginBottom: 8 }}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={{ width: logoBox, height: logoBox }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Layers size={Math.round(logoBox * 0.4)} color="#087A0A" />
                      )}
                    </View>
                    <Text
                      className="text-[12.5px] font-extrabold text-text"
                      numberOfLines={1}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {s.name}
                    </Text>
                    {isCurrent ? (
                      <View className="flex-row items-center bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5 mt-1.5">
                        <Check size={10} color="#087A0A" />
                        <Text className="text-[9.5px] font-extrabold text-primary ml-1">Current</Text>
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
